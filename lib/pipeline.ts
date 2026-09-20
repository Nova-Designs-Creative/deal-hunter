/**
 * DealHunter research pipeline.
 */

import { fastUnderstandProduct } from "@/lib/fast-understand";
import { heuristicExtractListings, stripMarkdown, cleanProductTitle, sanitizeListingPrice } from "@/lib/heuristic-extract";
import {
  extractProductsFromPages,
  isGeminiConfigured,
  planResearch,
} from "@/lib/gemini";
import {
  isDecodoConfigured,
  parseBingShoppingListings,
  parseGoogleShoppingListings,
  parseSerpResults,
  parseStructuredListings,
  retrieveProductData,
  searchAmazon,
  searchBingShopping,
  searchGoogleShopping,
  searchTarget,
  searchWalmart,
  searchWeb,
} from "@/lib/decodo";
import { localeForLocation } from "@/lib/geo";
import { coerceMarketCurrency } from "@/lib/currency";
import { normalizeRetailerKey } from "@/lib/local-affinity";
import { calculateEffectivePrice } from "@/lib/pricing";
import { normalizeAndMatchBatch } from "@/lib/product-matching";
import {
  buildWinnerExplanation,
  pickLowestPriceDeal,
  rankDeals,
} from "@/lib/ranking";
import { TOP_PER_RETAILER } from "@/lib/ranking-config";
import { selectTopPerRetailer } from "@/lib/marketplace-race";
import { evaluateListingRetailer } from "@/lib/retailer-evaluation";
import {
  buildSearchUrl,
  DECODO_SEARCH_TEMPLATES,
  getEnabledRetailers,
  resolveSourcesFromPlan,
  selectRetailersFallback,
} from "@/lib/retailers";
import type {
  ProductListing,
  ProductRequirements,
  RankedDeal,
  SearchDebug,
  SearchResult,
  ShoppingLocation,
  SourcePlan,
} from "@/lib/schemas";
import { ProductRequirementsSchema } from "@/lib/schemas";

export type RunSearchOptions = {
  includeDebug?: boolean;
  maxRetailers?: number;
  maxPages?: number;
  concurrency?: number;
  /** Skip the pre-search spec confirmation step */
  forceSearch?: boolean;
  /** Only understand the product — do not scrape yet */
  understandOnly?: boolean;
  /** User-confirmed constraints from the spec form */
  userConstraints?: Record<string, string | null>;
  /** Reuse requirements from understand step — saves 1 Gemini call */
  cachedRequirements?: ProductRequirements;
};

type RetrievalRecord = SearchDebug["rawRetrievals"][number];

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, Math.max(items.length, 1)) }, () =>
      worker(),
    ),
  );
  return results;
}

function preview(content: string, max = 1200): string {
  return content.length > max ? `${content.slice(0, max)}…` : content;
}

/** Strip markdown / link syntax / HTML entities / glued-on prices from a title. */
function cleanTitle(s: string | null): string | null {
  if (!s) return s;
  return cleanProductTitle(s) || stripMarkdown(s) || null;
}

function withDefaults(
  listing: ProductListing,
  retailerName: string,
  url: string | null,
): ProductListing {
  const finalUrl = listing.url ?? url;
  const productName = cleanTitle(listing.productName);
  const blob = `${productName ?? ""} ${listing.description ?? ""}`;
  const price = sanitizeListingPrice(listing.price, blob) ?? listing.price;
  return {
    ...listing,
    productName,
    price,
    retailer: listing.retailer ?? retailerName,
    url: finalUrl && /^https?:\/\//i.test(finalUrl) ? finalUrl : null,
    specifications: listing.specifications ?? {},
    isMarketplace: listing.isMarketplace ?? false,
    shippingAvailability: listing.shippingAvailability ?? "unknown",
    imageUrl: listing.imageUrl ?? null,
    marketplaceName: listing.marketplaceName ?? null,
    sellerName: listing.sellerName ?? null,
    sellerRating: listing.sellerRating ?? null,
    sellerReviewCount: listing.sellerReviewCount ?? null,
    fulfillment: listing.fulfillment ?? null,
    returnInformation: listing.returnInformation ?? null,
    knownMandatoryFees: listing.knownMandatoryFees ?? null,
    shipsToUserLocation: listing.shipsToUserLocation ?? null,
    sourceRetrievedAt: listing.sourceRetrievedAt ?? new Date().toISOString(),
  };
}

export async function runDealSearch(
  userRequest: string,
  location: ShoppingLocation,
  options: RunSearchOptions = {},
): Promise<SearchResult> {
  const includeDebug =
    options.includeDebug ?? process.env.NODE_ENV !== "production";
  const namedEarly = (() => {
    try {
      // Cheap peek so we can widen retailer fan-out for SKU races
      return fastUnderstandProduct(userRequest, location).isNamedProduct;
    } catch {
      return false;
    }
  })();
  const maxRetailers = options.maxRetailers ?? (namedEarly ? 8 : 6);
  const maxPages = options.maxPages ?? 8;
  const concurrency = options.concurrency ?? 3;
  const errors: string[] = [];
  const stageTimingsMs: Record<string, number> = {};
  const rawRetrievals: RetrievalRecord[] = [];
  const mark = (stage: string, start: number) => {
    stageTimingsMs[stage] = Date.now() - start;
  };

  const baseDisclaimer =
    "Best deal found across the sources we checked. Prices and availability can change. This is not a guarantee of the lowest price on the internet.";

  if (!userRequest.trim()) {
    return emptyResult("Please enter a product to search for.", location, includeDebug);
  }
  if (!location?.countryCode) {
    return emptyResult("Please select where you are shopping from.", location, includeDebug);
  }

  const understandOnly =
    Boolean(options.understandOnly) || !options.forceSearch;

  // Specs step is local — don't block on OpenRouter/Decodo keys yet
  if (!understandOnly) {
    if (!isGeminiConfigured()) {
      return emptyResult(
        "Server misconfigured: set OPENROUTER_API_KEY (preferred) or GEMINI_API_KEY.",
        location,
        includeDebug,
      );
    }
    if (!isDecodoConfigured()) {
      return emptyResult(
        "Server misconfigured: Decodo credentials missing.",
        location,
        includeDebug,
      );
    }
  }

  // —— Product understanding (local/fast — no LLM wait) ——
  let t = Date.now();
  let requirements: ProductRequirements;
  try {
    if (options.cachedRequirements) {
      const parsed = ProductRequirementsSchema.safeParse(
        options.cachedRequirements,
      );
      requirements = parsed.success
        ? parsed.data
        : fastUnderstandProduct(userRequest, location);
    } else {
      requirements = fastUnderstandProduct(userRequest, location);
    }
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Failed to understand request";
    return emptyResult(msg, location, includeDebug);
  }

  // Merge user-confirmed constraints from the spec form
  if (options.userConstraints) {
    const merged = { ...requirements.constraints };
    for (const [key, val] of Object.entries(options.userConstraints)) {
      if (key === "condition" && val) {
        const c = val as ProductRequirements["condition"];
        if (["new", "used", "refurbished", "any"].includes(c)) {
          requirements = { ...requirements, condition: c };
        }
      } else if (key === "budgetMax" && val) {
        const n = Number(val);
        if (Number.isFinite(n)) {
          requirements = { ...requirements, budgetMax: n };
        }
      } else if (val) {
        merged[key] = val;
      }
    }
    requirements = { ...requirements, constraints: merged };
  }

  mark("understanding", t);

  // Named SKU → skip specs form (marketplace price race).
  // Category searches still pause for clarification unless forceSearch.
  const skipClarification = requirements.isNamedProduct === true;
  if (
    !skipClarification &&
    (understandOnly || options.understandOnly || !options.forceSearch)
  ) {
    return {
      disclaimer: baseDisclaimer,
      needsClarification: true,
      clarifyingQuestions: requirements.clarifyingQuestions,
      productRequirements: requirements,
      specificationExplanation: requirements.specificationExplanation,
      recommendedDeal: null,
      lowestPriceDeal: null,
      bestDeal: null,
      otherOptions: [],
      coverage: null,
      location,
      error: null,
      debug: includeDebug
        ? buildDebug({
            userRequest,
            location,
            productRequirements: requirements,
            searchPlan: null,
            sourcePlan: null,
            retailers: [],
            rawRetrievals: [],
            extractedProducts: [],
            matches: [],
            retailerEvaluations: [],
            pricing: [],
            ranking: [],
            errors,
            stageTimingsMs,
          })
        : undefined,
    };
  }

  // understandOnly + named product: hand requirements back so the UI can
  // immediately kick off forceSearch (avoids a wasted Decodo round-trip here).
  if (understandOnly && skipClarification) {
    return {
      disclaimer: baseDisclaimer,
      needsClarification: false,
      clarifyingQuestions: [],
      productRequirements: requirements,
      specificationExplanation: requirements.specificationExplanation,
      recommendedDeal: null,
      lowestPriceDeal: null,
      bestDeal: null,
      otherOptions: [],
      coverage: null,
      location,
      error: null,
      debug: includeDebug
        ? buildDebug({
            userRequest,
            location,
            productRequirements: requirements,
            searchPlan: null,
            sourcePlan: null,
            retailers: [],
            rawRetrievals: [],
            extractedProducts: [],
            matches: [],
            retailerEvaluations: [],
            pricing: [],
            ranking: [],
            errors,
            stageTimingsMs,
          })
        : undefined,
    };
  }

  // Build the search query early — needed for fallback plans below.
  function cleanUserRequest(req: string): string {
    return req
      .trim()
      .replace(
        /^(find\s+me|find|get\s+me|get|show\s+me|look\s+for|search\s+for|i\s+want|i\s+need|help\s+me\s+find|buy|purchase)\s+/i,
        "",
      )
      .replace(
        /^(the\s+)?(best|cheapest|lowest|good|top)\s+(deal\s+on|deals?\s+on|price\s+for|price\s+on|price\s+of|priced?\s+)?\s*/i,
        "",
      )
      .replace(
        /^(what is|what'?s)\s+(the\s+)?(best|cheapest)?\s+(deal|price)\s+(on|for)\s+/i,
        "",
      )
      .trim();
  }
  const cleanedRequest = cleanUserRequest(userRequest);
  const retailerQueryForPlan =
    cleanedRequest.length > 2 ? cleanedRequest : requirements.product;

  // —— Search plan + sources (1 Gemini call) ——
  t = Date.now();
  let searchPlan;
  let sourcePlan: SourcePlan | null = null;
  let retailers;
  try {
    const planned = await planResearch({
      requirements,
      location,
      catalog: getEnabledRetailers().map((r) => ({
        id: r.id,
        name: r.name,
        domain: r.domain,
        category: r.category,
        markets: r.markets,
      })),
    });
    searchPlan = planned.searchPlan;
    sourcePlan = planned.sourcePlan;
    retailers = resolveSourcesFromPlan({
      selectedRetailerIds: sourcePlan.selectedRetailerIds,
      extraSources: sourcePlan.extraSources,
      location,
      max: maxRetailers,
    });
  } catch (err) {
    errors.push(
      err instanceof Error ? err.message : "Research planning failed",
    );
    const fq = retailerQueryForPlan;
    searchPlan = {
      queries: [
        `${fq} best price ${location.country}`,
        `buy ${fq} cheapest online`,
        `${fq} review where to buy`,
      ],
      rationale: "Fallback queries (AI plan unavailable)",
    };
    retailers = selectRetailersFallback(location, maxRetailers);
  }
  mark("planning", t);
  mark("retailers", t);

  // —— Decodo retrieval (structured-first, LLM-second) ——
  t = Date.now();

  // reuse the cleaned query computed above
  const retailerQuery = retailerQueryForPlan;

  const cc = location.countryCode.toUpperCase();
  const locale = localeForLocation(location);
  const currency = requirements.budgetCurrency ?? locale.currency;
  const geo = locale.decodoGeo;

  // ── Phase 1: Shopping aggregators + US structured templates ────────────────
  // Strategy: scrape Google + Bing Shopping with country geo/IP, then supplement
  // with major/specialized marketplaces for the shopper's country.
  type StructuredJob = {
    name: string;
    fn: () => Promise<import("@/lib/decodo").DecodoResult>;
    currency: string;
    kind: "google_shopping" | "bing_shopping" | "structured";
  };

  const amazonSort = requirements.isNamedProduct
    ? "featured"
    : "price_low_to_high";

  const structuredJobs: StructuredJob[] = [
    {
      name: "Google Shopping",
      kind: "google_shopping",
      currency,
      fn: () =>
        searchGoogleShopping(retailerQuery, {
          geo,
          googleGl: locale.googleGl,
          googleHl: locale.googleHl,
        }),
    },
    {
      name: "Bing Shopping",
      kind: "bing_shopping",
      currency,
      fn: () =>
        searchBingShopping(retailerQuery, {
          geo,
          countryCode: locale.countryCode,
        }),
    },
    ...(cc === "US"
      ? ([
          {
            name: "Amazon",
            kind: "structured" as const,
            currency: "USD",
            fn: () => searchAmazon(retailerQuery, { sortBy: amazonSort, geo }),
          },
          {
            name: "Walmart",
            kind: "structured" as const,
            currency: "USD",
            fn: () => searchWalmart(retailerQuery, { geo }),
          },
          {
            name: "Target",
            kind: "structured" as const,
            currency: "USD",
            fn: () => searchTarget(retailerQuery, { geo }),
          },
        ] satisfies StructuredJob[])
      : []),
  ];

  const extractedProducts: ProductListing[] = [];
  const pageSignalByListingIndex: string[] = [];

  const structuredSettled = await Promise.allSettled(
    structuredJobs.map((j) => j.fn()),
  );

  for (const [i, settled] of structuredSettled.entries()) {
    const job = structuredJobs[i]!;
    if (settled.status === "rejected") {
      const msg = settled.reason instanceof Error ? settled.reason.message : String(settled.reason);
      errors.push(`${job.name}: ${msg}`);
      rawRetrievals.push({ source: job.name, url: null, query: retailerQuery, success: false, error: msg, contentPreview: null, contentLength: 0 });
      continue;
    }
    const result = settled.value;
    rawRetrievals.push({
      source: job.name,
      url: null,
      query: retailerQuery,
      success: true,
      error: null,
      contentPreview: preview(result.content, 300),
      contentLength: result.content.length,
    });
    let parsed: ProductListing[];
    if (job.kind === "google_shopping") {
      parsed = parseGoogleShoppingListings(result, job.currency);
    } else if (job.kind === "bing_shopping") {
      parsed = parseBingShoppingListings(result, job.currency);
      // If structured parse empty, try heuristic markdown extract
      if (!parsed.length && result.content) {
        parsed = heuristicExtractListings(
          stripMarkdown(result.content),
          "Bing Shopping",
          retailerQuery,
          job.currency,
          null,
        );
      }
    } else {
      parsed = parseStructuredListings(result, job.name, job.currency);
    }
    for (const listing of parsed) {
      const enriched = withDefaults(listing, listing.retailer ?? job.name, listing.url ?? null);
      enriched.currency = coerceMarketCurrency(
        enriched.price,
        enriched.currency,
        currency,
      );
      extractedProducts.push(enriched);
      pageSignalByListingIndex.push(
        preview(enriched.description ?? enriched.productName ?? "", 400),
      );
    }
  }

  // ── Phase 2: Google SERP + local marketplace pages (country geo) ───────────
  const googleQuery = `${retailerQuery} buy ${location.country}`;

  const templateIds = new Set(Object.keys(DECODO_SEARCH_TEMPLATES));
  const pageRetailers = retailers
    .filter((r) => !(cc === "US" && templateIds.has(r.id)))
    .filter((r) => !/google\.com\/search/.test(r.searchUrlTemplate))
    .sort((a, b) => {
      const la = a.markets?.includes(cc) || a.category === "local_regional" ? 0 : 1;
      const lb = b.markets?.includes(cc) || b.category === "local_regional" ? 0 : 1;
      return la - lb;
    })
    .slice(0, cc === "US" ? 2 : 4);
  const localPageJobs = pageRetailers.map((r) => ({
    name: r.name,
    domain: r.domain,
    url: buildSearchUrl(r, retailerQuery),
  }));

  const [serpSettled, ...localSettled] = await Promise.allSettled([
    searchWeb(googleQuery, { geo }),
    ...localPageJobs.map((j) =>
      retrieveProductData({ url: j.url, mode: "page", geo }),
    ),
  ]);

  let serpHits: import("@/lib/decodo").SerpHit[] = [];
  if (serpSettled.status === "fulfilled") {
    const c = serpSettled.value.content;
    serpHits = parseSerpResults(serpSettled.value);
    rawRetrievals.push({ source: "Google Search", url: null, query: googleQuery, success: true, error: null, contentPreview: preview(c, 300), contentLength: c.length });
  } else {
    const msg = serpSettled.reason instanceof Error ? serpSettled.reason.message : "SERP failed";
    errors.push(`Google Search: ${msg}`);
    rawRetrievals.push({ source: "Google Search", url: null, query: googleQuery, success: false, error: msg, contentPreview: null, contentLength: 0 });
  }

  // Organic SERP hits that already include a price become listings
  for (const hit of serpHits) {
    if (hit.price == null) continue;
    extractedProducts.push(
      withDefaults(
        {
          productName: hit.title, brand: null, model: null, modelNumber: null,
          price: hit.price,
          currency: coerceMarketCurrency(
            hit.price,
            hit.currency ?? currency,
            currency,
          ),
          condition: null,
          availability: hit.availability,
          url: hit.url, retailer: hit.source ?? "Web", description: hit.description,
          imageUrl: hit.imageUrl, specifications: {}, shippingPrice: null, shippingInformation: null,
          shipsToUserLocation: hit.availability === "out_of_stock" ? false : null,
          shippingAvailability: "unknown", knownMandatoryFees: null,
          isMarketplace: true, marketplaceName: null, sellerName: hit.source,
          sellerRating: hit.rating != null ? String(hit.rating) : null,
          sellerReviewCount: hit.reviewCount, fulfillment: null, returnInformation: null,
          sourceRetrievedAt: new Date().toISOString(),
        },
        hit.source ?? "Web",
        hit.url,
      ),
    );
    pageSignalByListingIndex.push(preview(hit.description ?? hit.title, 300));
  }

  const scrapedPages: Array<{ label: string; url: string; content: string }> = [];
  for (const [idx, settled] of localSettled.entries()) {
    const job = localPageJobs[idx]!;
    if (settled.status === "fulfilled") {
      const c = settled.value.content;
      rawRetrievals.push({ source: job.name, url: job.url, query: retailerQuery, success: true, error: null, contentPreview: preview(c, 200), contentLength: c.length });
      if (c.length > 200) scrapedPages.push({ label: job.name, url: job.url, content: c });
    } else {
      const msg = settled.reason instanceof Error ? settled.reason.message : "Scrape failed";
      errors.push(`${job.name}: ${msg}`);
      rawRetrievals.push({ source: job.name, url: job.url, query: retailerQuery, success: false, error: msg, contentPreview: null, contentLength: 0 });
    }
  }

  // Deep-scrape a few organic merchant pages (real product URLs, not Google shop cards)
  const knownDomains = new Set(getEnabledRetailers().map((r) => r.domain.replace(/^www\./, "")));
  const anchorTok = retailerQuery.toLowerCase().split(/\s+/).sort((a, b) => b.length - a.length)[0] ?? "";
  const deepUrls = serpHits
    .filter((h) => h.title.toLowerCase().includes(anchorTok))
    .filter((h) => {
      try {
        const host = new URL(h.url).hostname.replace(/^www\./, "");
        if (/google\./i.test(host)) return false;
        if (/amazon\.|walmart\.|target\./.test(host) && cc === "US") return false;
        return knownDomains.has(host) || /shop|store|buy|product|\/p\/|\/dp\/|\/ip\//i.test(h.url);
      } catch {
        return false;
      }
    })
    .slice(0, 3);

  const deepSettled = await Promise.allSettled(
    deepUrls.map((h) => retrieveProductData({ url: h.url, mode: "page", geo })),
  );
  for (const [i, s] of deepSettled.entries()) {
    const h = deepUrls[i]!;
    const host = (() => { try { return new URL(h.url).hostname.replace(/^www\./, ""); } catch { return "Web"; } })();
    const label = getEnabledRetailers().find((r) => r.domain.replace(/^www\./, "") === host)?.name ?? host;
    if (s.status === "fulfilled") {
      rawRetrievals.push({ source: label, url: h.url, query: null, success: true, error: null, contentPreview: preview(s.value.content, 200), contentLength: s.value.content.length });
      if (s.value.content.length > 200) scrapedPages.push({ label, url: h.url, content: s.value.content });
    } else {
      const msg = s.reason instanceof Error ? s.reason.message : "Page scrape failed";
      rawRetrievals.push({ source: label, url: h.url, query: null, success: false, error: msg, contentPreview: null, contentLength: 0 });
    }
  }

  // Heuristic extraction from marketplace search pages
  for (const p of scrapedPages) {
    const found = heuristicExtractListings(p.content, p.label, retailerQuery, currency, p.url);
    for (const listing of found) {
      extractedProducts.push(withDefaults(listing, p.label, listing.url ?? null));
      pageSignalByListingIndex.push(preview(listing.productName ?? "", 300));
    }
  }

  // LLM extraction only if we still have thin coverage
  if (
    isGeminiConfigured() &&
    scrapedPages.length > 0 &&
    extractedProducts.filter((l) => l.price != null).length < 5
  ) {
    try {
      const extracted = await extractProductsFromPages({
        pages: scrapedPages.slice(0, 4).map((p) => ({ label: p.label, url: p.url, content: p.content.slice(0, 4500) })),
        requirements,
        location,
      });
      for (const listing of extracted.listings) {
        if (!listing.productName || listing.price == null) continue;
        const page = scrapedPages.find((p) => p.label === listing.retailer) ?? scrapedPages[0]!;
        let url = listing.url;
        if (url && !/^https?:\/\//i.test(url)) {
          try { url = new URL(url, page.url).toString(); } catch { url = null; }
        }
        extractedProducts.push(withDefaults({ ...listing, url }, listing.retailer ?? page.label, url));
        pageSignalByListingIndex.push(preview(listing.description ?? listing.productName ?? "", 400));
      }
    } catch (err) {
      errors.push(err instanceof Error ? `LLM extract: ${err.message}` : "LLM extract failed");
    }
  }

  // Dedup: same store (normalized) + same price + similar title
  {
    const seenKeys = new Set<string>();
    const deduped: ProductListing[] = [];
    const dedupedSignals: string[] = [];
    extractedProducts.forEach((l, i) => {
      const store = normalizeRetailerKey(l.retailer);
      const title = (l.productName ?? "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .slice(0, 50);
      const key = `${store}|${title}|${l.price ?? "x"}`;
      if (seenKeys.has(key)) return;
      seenKeys.add(key);
      deduped.push(l);
      dedupedSignals.push(pageSignalByListingIndex[i] ?? "");
    });
    extractedProducts.length = 0;
    extractedProducts.push(...deduped);
    pageSignalByListingIndex.length = 0;
    pageSignalByListingIndex.push(...dedupedSignals);
  }

  // Coerce mis-tagged currencies to the shopper's market (IDR ≠ USD)
  for (const listing of extractedProducts) {
    listing.currency = coerceMarketCurrency(
      listing.price,
      listing.currency,
      currency,
    );
  }

  mark("collecting", t);
  mark("extracting", t);

  if (extractedProducts.length === 0) {
    return {
      disclaimer: baseDisclaimer,
      productRequirements: requirements,
      specificationExplanation: requirements.specificationExplanation,
      recommendedDeal: null,
      lowestPriceDeal: null,
      bestDeal: null,
      otherOptions: [],
      coverage: {
        sourcesChecked: rawRetrievals.length,
        listingsAnalyzed: 0,
        matchingListings: 0,
        excludedAsDifferent: 0,
        excludedNoShip: 0,
        failedSources: rawRetrievals.filter((r) => !r.success).length,
      },
      location,
      error:
        "No matching products found from the sources we checked. Try a more specific product or different location.",
      debug: includeDebug
        ? buildDebug({
            userRequest,
            location,
            productRequirements: requirements,
            searchPlan,
            sourcePlan,
            retailers,
            rawRetrievals,
            extractedProducts,
            matches: [],
            retailerEvaluations: [],
            pricing: [],
            ranking: [],
            errors,
            stageTimingsMs,
          })
        : undefined,
    };
  }

  // —— Match (1 Gemini call) ——
  t = Date.now();
  const matches: SearchDebug["matches"] = [];
  const batchMatches = await normalizeAndMatchBatch(
    extractedProducts,
    requirements,
  );
  const matchResults = extractedProducts.map((listing, index) => {
    const id = `listing-${index}`;
    const match = batchMatches[index]!;
    return { id, listing, match };
  });

  // Price sanity: among confirmed matches, anything far below the median is an
  // accessory / promo / installment / broken scrape that slipped through.
  {
    const confirmed = matchResults.filter(
      (m) =>
        ["exact", "strong", "possible"].includes(m.match.matchStatus) &&
        m.listing.price != null,
    );
    if (confirmed.length >= 3) {
      const prices = confirmed.map((m) => m.listing.price!).sort((a, b) => a - b);
      const median = prices[Math.floor(prices.length / 2)]!;
      const floor = Math.min(median * 0.25, median - 1);
      const absoluteFloor = median >= 5_000 ? Math.max(500, median * 0.08) : 0;
      for (const m of matchResults) {
        if (
          m.listing.price != null &&
          m.match.matchStatus !== "different" &&
          (m.listing.price < floor || m.listing.price < absoluteFloor)
        ) {
          m.match = {
            ...m.match,
            matchStatus: "different",
            confidence: 0.75,
            reasoning: `Price ${m.listing.currency ?? ""} ${m.listing.price} is far below the median (${median}) for this product — likely a broken scrape, accessory, promo, or installment amount.`,
          };
        }
      }
    }
  }
  for (const m of matchResults) matches.push({ listingId: m.id, match: m.match });
  mark("matching", t);

  // Marketplace race: top N matching listings per retailer (price, then reviews).
  // Named SKUs: only exact/strong with a real price — "possible" siblings (K380 vs K580) stay out.
  const named = requirements.isNamedProduct === true;
  const isBuyable = (m: { listing: ProductListing; match: { matchStatus: string } }) => {
    const avail = `${m.listing.availability ?? ""} ${m.listing.productName ?? ""}`.toLowerCase();
    if (/sold\s*out|out_of_stock|out of stock|unavailable/.test(avail)) return false;
    if (m.listing.shipsToUserLocation === false) return false;
    return m.listing.price != null && m.listing.price > 0;
  };

  const racePool = named
    ? matchResults.filter(
        (m) =>
          ["exact", "strong"].includes(m.match.matchStatus) && isBuyable(m),
      )
    : matchResults.filter(
        (m) =>
          ["exact", "strong", "possible"].includes(m.match.matchStatus) &&
          isBuyable(m),
      );

  // Named SKUs: never fall back to weak "possible" matches (wrong model + junk price).
  let candidates = selectTopPerRetailer(
    racePool.length
      ? racePool
      : named
        ? []
        : matchResults.filter(
            (m) =>
              ["exact", "strong", "possible"].includes(m.match.matchStatus) &&
              m.listing.price != null &&
              m.listing.price > 0,
          ),
    TOP_PER_RETAILER,
  );
  // Last resort for category searches only
  if (!candidates.length && !named) {
    candidates = matchResults.filter(
      (m) =>
        m.match.matchStatus !== "different" &&
        m.listing.price != null &&
        m.listing.price > 0,
    );
  }
  if (!candidates.length && !named) {
    candidates = matchResults.filter((m) => m.match.matchStatus !== "different");
  }
  if (!candidates.length && !named) candidates = matchResults;

  // —— Retailer eval ——
  t = Date.now();
  const retailerEvaluations: SearchDebug["retailerEvaluations"] = [];
  const evaluated = await mapPool(candidates, concurrency, async (c) => {
    const idx = Number(c.id.replace("listing-", ""));
    const evaluation = await evaluateListingRetailer({
      listing: c.listing,
      pageContentPreview: pageSignalByListingIndex[idx],
      location,
    });
    retailerEvaluations.push({ listingId: c.id, evaluation });
    return { ...c, evaluation };
  });
  mark("quality", t);

  // —— Pricing ——
  t = Date.now();
  const pricingDebug: SearchDebug["pricing"] = [];
  const priced = evaluated.map((c) => {
    const pricing = calculateEffectivePrice(c.listing, location);
    pricingDebug.push({ listingId: c.id, pricing });
    return { ...c, pricing };
  });
  mark("pricing", t);

  // —— Rank ——
  t = Date.now();
  const retrievedAt = new Date().toISOString();
  let ranking = rankDeals(
    priced.map((c) => ({
      id: c.id,
      listing: c.listing,
      match: c.match,
      retailerEvaluation: c.evaluation,
      pricing: c.pricing,
      retrievedAt: c.listing.sourceRetrievedAt ?? retrievedAt,
    })),
    { namedProduct: requirements.isNamedProduct === true, location },
  );

  const recommendedDeal: RankedDeal | null =
    ranking.find((d) => !d.excludedReason) ?? ranking[0] ?? null;
  const lowestPriceDeal = pickLowestPriceDeal(ranking, location);

  if (recommendedDeal) {
    const reason = buildWinnerExplanation(recommendedDeal, lowestPriceDeal);
    ranking = ranking.map((d) =>
      d.id === recommendedDeal.id ? { ...d, rankReason: reason } : d,
    );
  }
  mark("ranking", t);

  const finalRecommended =
    ranking.find((d) => d.id === recommendedDeal?.id) ?? recommendedDeal;
  const otherOptions = ranking
    .filter(
      (d) =>
        d.id !== finalRecommended?.id &&
        d.id !== lowestPriceDeal?.id &&
        !d.excludedReason,
    )
    .slice(0, 5);

  const coverage = {
    sourcesChecked: rawRetrievals.length,
    listingsAnalyzed: extractedProducts.length,
    matchingListings: ranking.filter(
      (d) =>
        !d.excludedReason &&
        ["exact", "strong", "possible"].includes(d.match.matchStatus),
    ).length,
    excludedAsDifferent: ranking.filter((d) => d.match.matchStatus === "different")
      .length,
    excludedNoShip: ranking.filter((d) => d.pricing.shipsToUserLocation === false)
      .length,
    failedSources: rawRetrievals.filter((r) => !r.success).length,
  };

  return {
    disclaimer: baseDisclaimer,
    productRequirements: requirements,
    specificationExplanation: requirements.specificationExplanation,
    recommendedDeal: finalRecommended,
    lowestPriceDeal:
      lowestPriceDeal && lowestPriceDeal.id !== finalRecommended?.id
        ? lowestPriceDeal
        : lowestPriceDeal,
    bestDeal: finalRecommended,
    otherOptions,
    coverage,
    location,
    error: null,
    debug: includeDebug
      ? buildDebug({
          userRequest,
          location,
          productRequirements: requirements,
          searchPlan,
          sourcePlan,
          retailers,
          rawRetrievals,
          extractedProducts,
          matches,
          retailerEvaluations,
          pricing: pricingDebug,
          ranking,
          errors,
          stageTimingsMs,
        })
      : undefined,
  };
}

function emptyResult(
  error: string,
  location: ShoppingLocation | null,
  includeDebug: boolean,
): SearchResult {
  return {
    disclaimer:
      "Best deal found across the sources we checked. Prices and availability can change.",
    recommendedDeal: null,
    lowestPriceDeal: null,
    bestDeal: null,
    otherOptions: [],
    location,
    error,
    debug: includeDebug
      ? buildDebug({
          userRequest: "",
          location,
          productRequirements: null,
          searchPlan: null,
          sourcePlan: null,
          retailers: [],
          rawRetrievals: [],
          extractedProducts: [],
          matches: [],
          retailerEvaluations: [],
          pricing: [],
          ranking: [],
          errors: [error],
          stageTimingsMs: {},
        })
      : undefined,
  };
}

function buildDebug(partial: SearchDebug): SearchDebug {
  return partial;
}
