/**
 * Decodo Web Scraping API client
 *
 * Official endpoint: POST https://scraper-api.decodo.com/v2/scrape
 * Docs: https://help.decodo.com/docs/web-scraping-api-quick-start
 *
 * Video checkpoint: v2-decodo
 *
 * Auth: Authorization: Basic <token>
 *
 * IMPORTANT API constraints (verified against live API):
 * - `proxy_pool` is ONLY valid on universal URL scrapes (no target template).
 * - Target templates (google_search, amazon_search, …) reject custom proxy_pool.
 * - Sending `device_type` together with proxy_pool + headless + markdown can 400.
 * - Keep request bodies minimal; only send supported params.
 */

import { bingShoppingUrl } from "@/lib/geo";
import {
  cleanProductTitle,
  sanitizeListingPrice,
} from "@/lib/heuristic-extract";

const DECODO_ENDPOINT = "https://scraper-api.decodo.com/v2/scrape";

export type DecodoScrapeOptions = {
  url?: string;
  query?: string;
  /** Omit for universal URL scrape; set for templates like google_search */
  target?: string;
  headless?: "html" | "png";
  parse?: boolean;
  markdown?: boolean;
  geo?: string;
  /** Only for universal (no-target) scrapes */
  proxy_pool?: "standard" | "premium";
  device_type?: string;
  page_count?: number;
  page_from?: string;
  google_results_language?: string;
  sort_by?: string;
  domain?: string;
};

export type DecodoResult = {
  content: string;
  statusCode: number | null;
  taskId: string | null;
  raw: unknown;
};

export class DecodoError extends Error {
  constructor(
    message: string,
    public status?: number,
    public body?: string,
  ) {
    super(message);
    this.name = "DecodoError";
  }
}

function getAuthHeader(): string {
  const token = process.env.DECODO_API_KEY?.trim();
  if (token) {
    if (token.toLowerCase().startsWith("basic ")) {
      return token;
    }
    return `Basic ${token}`;
  }

  const user = process.env.DECODO_USERNAME?.trim();
  const pass = process.env.DECODO_PASSWORD?.trim();
  if (user && pass) {
    const encoded = Buffer.from(`${user}:${pass}`).toString("base64");
    return `Basic ${encoded}`;
  }

  throw new DecodoError(
    "Missing Decodo credentials. Set DECODO_API_KEY (or DECODO_USERNAME + DECODO_PASSWORD).",
  );
}

function defaultGeo(): string | undefined {
  const geo = process.env.DECODO_GEO?.trim();
  return geo || undefined;
}

function defaultProxyPool(): "standard" | "premium" {
  const pool = process.env.DECODO_PROXY_POOL?.trim().toLowerCase();
  return pool === "premium" ? "premium" : "standard";
}

function timeoutMs(): number {
  // 30s: one slow store (eBay's 1.8MB pages) must not stall the whole search.
  const raw = process.env.DECODO_TIMEOUT_MS;
  const n = raw ? Number(raw) : 30_000;
  return Number.isFinite(n) && n > 0 ? n : 30_000;
}

function extractContent(payload: unknown): DecodoResult {
  if (!payload || typeof payload !== "object") {
    return { content: "", statusCode: null, taskId: null, raw: payload };
  }

  const data = payload as {
    results?: Array<{
      content?: unknown;
      status_code?: number;
      task_id?: string;
    }>;
    content?: unknown;
    status?: string;
    message?: string;
  };

  // Decodo sometimes returns HTTP 200 with status: failed
  if (data.status === "failed") {
    throw new DecodoError(
      data.message || "Decodo scrape failed",
      undefined,
      JSON.stringify(data).slice(0, 500),
    );
  }

  const first = data.results?.[0];
  let content = "";

  const candidate = first?.content ?? data.content;
  if (typeof candidate === "string") {
    content = candidate;
  } else if (candidate != null) {
    content = JSON.stringify(candidate);
  }

  return {
    content,
    statusCode: first?.status_code ?? null,
    taskId: first?.task_id ?? null,
    raw: payload,
  };
}

function buildBody(options: DecodoScrapeOptions): Record<string, unknown> {
  const isTemplate = Boolean(options.target);
  const body: Record<string, unknown> = {};

  if (options.target) body.target = options.target;
  if (options.url) body.url = options.url;
  if (options.query) body.query = options.query;
  if (options.headless) body.headless = options.headless;
  if (options.parse != null) body.parse = options.parse;
  if (options.markdown != null) body.markdown = options.markdown;
  if (options.page_count != null) body.page_count = options.page_count;
  if (options.page_from) body.page_from = options.page_from;
  if (options.google_results_language) {
    body.google_results_language = options.google_results_language;
  }
  if (options.sort_by) body.sort_by = options.sort_by;
  if (options.domain) body.domain = options.domain;

  const geo = options.geo ?? defaultGeo();
  if (geo) body.geo = geo;

  // proxy_pool ONLY on universal scrapes (no target template), and ONLY when
  // explicitly requested. Verified live: sending it makes Decodo reject
  // Lazada / eBay URLs with "Validation failed" while other sites accept it.
  const explicitPool =
    options.proxy_pool ?? (process.env.DECODO_PROXY_POOL?.trim() ? defaultProxyPool() : undefined);
  if (!isTemplate && explicitPool) {
    body.proxy_pool = explicitPool;
  }

  // device_type is optional and known to 400 with some universal combos —
  // only send when explicitly requested.
  if (options.device_type) body.device_type = options.device_type;

  return body;
}

/**
 * Low-level scrape against Decodo Web Scraping API.
 * Do not call Decodo elsewhere — use this module's helpers.
 */
export async function scrapeWithDecodo(
  options: DecodoScrapeOptions,
): Promise<DecodoResult> {
  const auth = getAuthHeader();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs());
  const body = buildBody(options);

  try {
    const response = await fetch(DECODO_ENDPOINT, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: auth,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await response.text();
    if (!response.ok) {
      let detail = text.slice(0, 400);
      try {
        const parsed = JSON.parse(text) as {
          message?: string;
          errors?: Array<{ parameter?: string; message?: string }>;
        };
        const parts = [
          parsed.message,
          ...(parsed.errors ?? []).map(
            (e) => `${e.parameter ?? "param"}: ${e.message ?? ""}`,
          ),
        ].filter(Boolean);
        if (parts.length) detail = parts.join(" | ");
      } catch {
        // keep raw slice
      }
      throw new DecodoError(
        `Decodo request failed (${response.status}): ${detail}`,
        response.status,
        text.slice(0, 500),
      );
    }

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return {
        content: text,
        statusCode: response.status,
        taskId: null,
        raw: text,
      };
    }

    return extractContent(json);
  } catch (err) {
    if (err instanceof DecodoError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new DecodoError("Decodo request timed out");
    }
    throw new DecodoError(
      err instanceof Error ? err.message : "Unknown Decodo error",
    );
  } finally {
    clearTimeout(timer);
  }
}

/** Universal page scrape — markdown preferred for LLM token efficiency. */
export async function scrapePage(
  url: string,
  opts?: { proxyPool?: "standard" | "premium"; markdown?: boolean; geo?: string },
): Promise<DecodoResult> {
  const base: DecodoScrapeOptions = {
    url,
    headless: "html",
    markdown: opts?.markdown ?? true,
    ...(opts?.proxyPool ? { proxy_pool: opts.proxyPool } : {}),
    ...(opts?.geo ? { geo: opts.geo } : {}),
  };
  try {
    return await scrapeWithDecodo(base);
  } catch (err) {
    // Validation failures are param-related — retry with the minimal body.
    if (err instanceof DecodoError && err.status === 400 && /validation/i.test(err.message)) {
      return scrapeWithDecodo({ url, headless: "html", markdown: true, ...(opts?.geo ? { geo: opts.geo } : {}) });
    }
    // 613 "not able to scrape" — retry once without JS rendering.
    if (err instanceof DecodoError && /not able to scrape|613/i.test(err.message)) {
      return scrapeWithDecodo({ url, markdown: true, ...(opts?.geo ? { geo: opts.geo } : {}) });
    }
    throw err;
  }
}

/** Official amazon_search template — structured product results. */
export async function searchAmazon(
  query: string,
  opts?: { sortBy?: string; geo?: string },
): Promise<DecodoResult> {
  return scrapeWithDecodo({
    target: "amazon_search",
    query,
    parse: true,
    page_from: "1",
    sort_by: opts?.sortBy ?? "price_low_to_high",
    ...(opts?.geo ? { geo: opts.geo } : {}),
  });
}

/** Official walmart_search template. */
export async function searchWalmart(
  query: string,
  opts?: { geo?: string },
): Promise<DecodoResult> {
  return scrapeWithDecodo({
    target: "walmart_search",
    query,
    parse: true,
    ...(opts?.geo ? { geo: opts.geo } : {}),
  });
}

/** Official target_search template (Target.com). */
export async function searchTarget(
  query: string,
  opts?: { geo?: string },
): Promise<DecodoResult> {
  return scrapeWithDecodo({
    target: "target_search",
    query,
    parse: true,
    ...(opts?.geo ? { geo: opts.geo } : {}),
  });
}

/** Google Shopping — scrape localized shopping results (parse:true).
 *  Verified: target "google_shopping" is invalid; use the Shopping URL instead.
 *  Always pass `geo` matching the shopper's country for consistent IP/results.
 */
export async function searchGoogleShopping(
  query: string,
  opts: { geo: string; googleGl: string; googleHl?: string },
): Promise<DecodoResult> {
  const hl = opts.googleHl ?? "en";
  const url = `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(query)}&hl=${hl}&gl=${opts.googleGl}&udm=28`;
  try {
    return await scrapeWithDecodo({
      url,
      parse: true,
      geo: opts.geo,
    });
  } catch (err) {
    // Retry without geo if Decodo rejects the location name
    if (err instanceof DecodoError) {
      return scrapeWithDecodo({ url, parse: true });
    }
    throw err;
  }
}

/** Bing Shopping — localized offers (parse:true when Decodo supports it). */
export async function searchBingShopping(
  query: string,
  opts: { geo: string; countryCode: string },
): Promise<DecodoResult> {
  const url = bingShoppingUrl(query, {
    countryCode: opts.countryCode,
    decodoGeo: opts.geo,
    googleGl: opts.countryCode.toLowerCase(),
    googleHl: "en",
    currency: "USD",
  });
  try {
    return await scrapeWithDecodo({
      url,
      parse: true,
      geo: opts.geo,
    });
  } catch (err) {
    // Fall back to markdown scrape for heuristic extraction
    try {
      return await scrapeWithDecodo({
        url,
        headless: "html",
        markdown: true,
        geo: opts.geo,
      });
    } catch {
      if (err instanceof DecodoError) {
        return scrapeWithDecodo({ url, headless: "html", markdown: true });
      }
      throw err;
    }
  }
}

/**
 * Parse Bing Shopping results (structured JSON or empty → caller may heuristic).
 */
export function parseBingShoppingListings(
  result: DecodoResult,
  fallbackCurrency: string,
): import("@/lib/schemas").ProductListing[] {
  let data: RawItem | null = null;
  try {
    const c = result.content?.trim();
    if (c && c.startsWith("{")) data = JSON.parse(c) as RawItem;
  } catch {
    return [];
  }
  if (!data) return [];

  const r1 = (data.results ?? data) as RawItem;
  const inner = (r1?.results ?? r1) as RawItem;
  const candidates: RawItem[] = [];
  for (const key of ["organic", "shopping", "products", "offers", "items"]) {
    const arr = (inner as RawItem)?.[key];
    if (Array.isArray(arr)) candidates.push(...(arr as RawItem[]));
  }
  if (!candidates.length && Array.isArray(inner)) {
    candidates.push(...(inner as unknown as RawItem[]));
  }
  if (!candidates.length) return [];

  const now = new Date().toISOString();
  const out: import("@/lib/schemas").ProductListing[] = [];
  const seen = new Set<string>();

  for (const item of candidates.slice(0, 40)) {
    const title = String(item.title ?? item.name ?? item.product_name ?? "").trim();
    if (!title) continue;
    const price =
      num(item.price) ??
      num((item.price as RawItem | undefined)?.value) ??
      num(item.offer_price) ??
      num(item.current_price);
    if (price == null) continue;

    const merchant =
      (typeof (item.merchant as RawItem | undefined)?.name === "string"
        ? String((item.merchant as RawItem).name)
        : null) ??
      (typeof item.seller === "string" ? item.seller : null) ??
      (typeof item.source === "string" ? item.source : null) ??
      (typeof item.store === "string" ? item.store : null) ??
      "Bing Shopping";

    const key = `${merchant.toLowerCase()}|${title.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 50)}|${price}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const currencyGuess = resolveListingCurrency({
      priceStr: String(item.price_str ?? item.price_text ?? ""),
      rawCurrency: item.currency,
      fallbackCurrency,
      price,
    });

    let url =
      typeof item.url === "string"
        ? item.url
        : typeof item.link === "string"
          ? item.link
          : null;
    if (url && !/^https?:\/\//i.test(url)) {
      try {
        url = new URL(url, "https://www.bing.com").toString();
      } catch {
        url = null;
      }
    }

    out.push({
      productName: title,
      brand: null,
      model: null,
      modelNumber: null,
      price,
      currency: currencyGuess,
      condition: null,
      availability: "in_stock",
      url,
      retailer: merchant,
      imageUrl:
        typeof item.thumbnail === "string"
          ? item.thumbnail
          : typeof item.image === "string"
            ? item.image
            : null,
      description: typeof item.price_str === "string" ? item.price_str : null,
      specifications: {},
      shippingPrice: null,
      shippingInformation: null,
      isMarketplace: true,
      marketplaceName: "Bing Shopping",
      sellerName: merchant,
      sellerRating:
        typeof item.rating === "number" ? String(item.rating) : null,
      sellerReviewCount:
        typeof item.reviews_count === "number"
          ? item.reviews_count
          : num(item.reviews_count),
      fulfillment: null,
      returnInformation: null,
      knownMandatoryFees: null,
      shipsToUserLocation: true,
      shippingAvailability: "unknown",
      sourceRetrievedAt: now,
    });
  }

  return out;
}

/** Google Search via official google_search target template (no proxy_pool). */
export async function searchWeb(
  query: string,
  opts?: { parse?: boolean; pageCount?: number; geo?: string },
): Promise<DecodoResult> {
  const base = {
    target: "google_search" as const,
    query,
    parse: opts?.parse ?? true,
    page_count: opts?.pageCount ?? 1,
    google_results_language: "en",
    ...(opts?.geo ? { geo: opts.geo } : {}),
  };

  try {
    return await scrapeWithDecodo({
      ...base,
      headless: "html",
    });
  } catch (err) {
    try {
      return await scrapeWithDecodo(base);
    } catch {
      throw err;
    }
  }
}

// ─── Direct structured JSON parsing ─────────────────────────────────────────
// Decodo template results (amazon_search, walmart_search, target_search)
// with parse:true return structured JSON instead of HTML.
// extractContent() stringifies it into result.content — we parse it back
// here without touching the LLM.
//
// Debug-verified structure (from live API calls):
//   Amazon:  data.results.results.organic  → array of {asin, title, price:{current_price}}
//   Walmart: data.results.results          → array of {general:{name,url,image}, pricing:{current_price}, fulfillment:{free_shipping}}
//   Target:  data.results.results.organic  → same shape as Amazon

type RawItem = Record<string, unknown>;

function num(v: unknown): number | null {
  if (typeof v === "number" && v > 0) return v;
  if (typeof v === "string") {
    // Prefer the first amount in a range string ("24950 - 32495")
    const range = v.match(
      /([\d.,]+)\s*(?:-|–|—|to|through)\s*([\d.,]+)/i,
    );
    if (range) {
      const a = parseFloat(range[1]!.replace(/,/g, ""));
      const b = parseFloat(range[2]!.replace(/,/g, ""));
      if (Number.isFinite(a) && a > 0) return a;
      if (Number.isFinite(b) && b > 0) return b;
    }
    const n = parseFloat(v.replace(/[^0-9.]/g, ""));
    if (n > 0) return n;
  }
  return null;
}

function extractItemPrice(item: RawItem): number | null {
  // Amazon: { price: { current_price: 349.99 } }
  if (item.price && typeof item.price === "object") {
    const p = item.price as RawItem;
    const v = num(p.current_price ?? p.price ?? p.value ?? p.amount);
    if (v) return v;
  }
  // Walmart pricing sub-object (before or after normalize)
  if (item.pricing && typeof item.pricing === "object") {
    const p = item.pricing as RawItem;
    const v = num(p.current_price ?? p.price ?? p.was_price ?? p.currentPrice);
    if (v) return v;
    // Nested: pricing.price.current / pricing.currentPrice
    if (p.price && typeof p.price === "object") {
      const nested = num(
        (p.price as RawItem).current_price ??
          (p.price as RawItem).current ??
          (p.price as RawItem).value,
      );
      if (nested) return nested;
    }
  }
  // Flat fields
  for (const key of [
    "current_price",
    "sale_price",
    "price",
    "list_price",
    "currentPrice",
    "offer_price",
  ]) {
    const v = num(item[key]);
    if (v) return v;
  }
  return null;
}

/**
 * Normalize a Walmart result item (which nests data in general/price|pricing/fulfillment)
 * into the same flat shape used by Amazon organic items.
 *
 * Live Decodo shape (2026):
 *   general: { title, url, image, product_id, out_of_stock }
 *   price:   { currency, price }          ← NOT pricing.current_price
 *   rating:  { count, rating }            ← NOT general.rating
 *   seller:  { id, name }
 *   fulfillment: { free_shipping, ... }
 */
function normalizeWalmartItem(item: RawItem): RawItem | null {
  const g = item.general as RawItem | undefined;
  const pricing = item.pricing as RawItem | undefined;
  const priceObj = item.price as RawItem | number | string | undefined;
  const f = item.fulfillment as RawItem | undefined;
  const ratingObj =
    item.rating && typeof item.rating === "object"
      ? (item.rating as RawItem)
      : null;
  const seller = item.seller as RawItem | undefined;

  const name = String(
    g?.title ?? g?.name ?? item.title ?? item.name ?? "",
  ).trim();
  if (!name) return null;

  const rawUrl =
    typeof g?.url === "string"
      ? g.url
      : typeof item.url === "string"
        ? item.url
        : null;
  const url =
    rawUrl &&
    (rawUrl.startsWith("http") ? rawUrl : `https://www.walmart.com${rawUrl}`);

  let priceVal: unknown = null;
  if (typeof priceObj === "number" || typeof priceObj === "string") {
    priceVal = priceObj;
  } else if (priceObj && typeof priceObj === "object") {
    priceVal =
      priceObj.price ??
      priceObj.current_price ??
      priceObj.value ??
      priceObj.amount;
  }
  if (priceVal == null && pricing && typeof pricing === "object") {
    priceVal =
      pricing.current_price ?? pricing.price ?? pricing.currentPrice;
    if (priceVal && typeof priceVal === "object") {
      const po = priceVal as RawItem;
      priceVal = po.current_price ?? po.price ?? po.value;
    }
  }

  return {
    title: name,
    price: priceVal,
    url: url || null,
    thumbnail:
      typeof g?.image === "string"
        ? g.image
        : typeof g?.thumbnail === "string"
          ? g.thumbnail
          : null,
    free_shipping: f?.free_shipping ?? f?.delivery ?? f?.freeShipping,
    rating: ratingObj?.rating ?? g?.rating ?? item.rating,
    reviews_count:
      ratingObj?.count ??
      g?.review_count ??
      g?.reviews_count ??
      g?.number_of_reviews,
    seller_name: typeof seller?.name === "string" ? seller.name : null,
    out_of_stock: Boolean(g?.out_of_stock),
    description: null,
  };
}

/**
 * Navigate the nested Decodo response to find the array of raw product items.
 *
 * Confirmed structures:
 *   Amazon/Target: data.results.results.organic  (object → object → array)
 *   Walmart:       data.results.results           (object → array of nested items)
 *                  OR data.results.results.organic (some responses)
 */
function getOrganic(data: RawItem, retailerName: string): RawItem[] {
  const r = data.results;
  if (!r || typeof r !== "object" || Array.isArray(r)) return [];
  const results = r as RawItem;

  const inner = results.results;
  if (inner !== undefined) {
    if (Array.isArray(inner)) {
      // Walmart (2026): array of {general, price, rating, seller, fulfillment}
      return inner
        .map((i) => normalizeWalmartItem(i as RawItem))
        .filter(Boolean) as RawItem[];
    }
    if (inner && typeof inner === "object" && !Array.isArray(inner)) {
      const organic = (inner as RawItem).organic;
      if (Array.isArray(organic)) {
        // Could be Amazon flat organic OR Walmart nested organic — detect
        const looksWalmart = organic.some(
          (it) =>
            it &&
            typeof it === "object" &&
            ((it as RawItem).general != null || (it as RawItem).pricing != null),
        );
        if (looksWalmart || /walmart/i.test(retailerName)) {
          return organic
            .map((i) => normalizeWalmartItem(i as RawItem))
            .filter(Boolean) as RawItem[];
        }
        return organic as RawItem[];
      }
    }
  }

  if (Array.isArray(results.organic)) return results.organic as RawItem[];
  if (Array.isArray(data.organic)) return data.organic as RawItem[];
  if (Array.isArray(data.items)) return data.items as RawItem[];

  console.warn(
    `[DealHunter] parseStructuredListings: could not find organic array for ${retailerName}. Keys at data.results: ${Object.keys(results).join(", ")}`,
  );
  return [];
}

export type SerpHit = {
  title: string;
  url: string;
  description: string | null;
  /** Present when Google shows a price snippet (shopping/product cards) */
  price: number | null;
  source: string | null;
  imageUrl: string | null;
  rating: number | null;
  reviewCount: number | null;
  currency: string | null;
  availability: string | null;
};

/**
 * Parse Google Shopping (tbm=shop / udm=28, parse:true) into ProductListings.
 * Structure: data.results.results.organic[] with
 *   { title, price, price_str, currency, merchant:{name}, rating, reviews_count, thumbnail, url }
 */
export function parseGoogleShoppingListings(
  result: DecodoResult,
  fallbackCurrency: string,
): import("@/lib/schemas").ProductListing[] {
  let data: RawItem | null = null;
  try {
    const c = result.content?.trim();
    if (c && c.startsWith("{")) data = JSON.parse(c) as RawItem;
  } catch {
    return [];
  }
  if (!data) return [];

  const r1 = (data.results ?? data) as RawItem;
  const inner = (r1?.results ?? r1) as RawItem;
  if (!inner || typeof inner !== "object") return [];

  const organic = Array.isArray(inner.organic)
    ? (inner.organic as RawItem[])
    : Array.isArray(inner.shopping)
      ? (inner.shopping as RawItem[])
      : [];
  if (!organic.length) return [];

  const now = new Date().toISOString();
  const out: import("@/lib/schemas").ProductListing[] = [];
  const seen = new Set<string>();

  for (const item of organic.slice(0, 40)) {
    const title = String(item.title ?? item.name ?? "").trim();
    if (!title) continue;

    const price =
      num(item.price) ?? num((item.price as RawItem | undefined)?.value);
    if (price == null) continue;

    const merchantObj = item.merchant as RawItem | undefined;
    const merchant =
      (typeof merchantObj?.name === "string" ? merchantObj.name : null) ??
      (typeof item.source === "string" ? item.source : null) ??
      (typeof item.seller === "string" ? item.seller : null) ??
      "Google Shopping";

    const key = `${merchant.toLowerCase()}|${title.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 50)}|${price}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const soldOut = /\b(sold\s*out|out\s*of\s*stock|unavailable)\b/i.test(
      `${title} ${item.price_str ?? ""} ${item.desc ?? ""}`,
    );

    let imageUrl: string | null =
      typeof item.thumbnail === "string"
        ? item.thumbnail
        : typeof item.image === "string"
          ? item.image
          : null;
    // Keep http(s) and data: URLs (Google often returns data:webp thumbs)
    if (imageUrl && !/^(https?:|data:image\/)/i.test(imageUrl)) imageUrl = null;
    // Cap huge data URLs in memory (keep under ~40KB)
    if (imageUrl?.startsWith("data:") && imageUrl.length > 60_000) imageUrl = null;

    const priceStr = String(item.price_str ?? "");
    const currencyGuess = resolveListingCurrency({
      priceStr,
      rawCurrency: item.currency,
      fallbackCurrency,
      price,
    });

    const sanitized =
      sanitizeListingPrice(price, `${title} ${priceStr}`) ?? price;

    const url =
      typeof item.url === "string" && /^https?:\/\//i.test(item.url)
        ? item.url
        : null;

    out.push({
      productName: cleanProductTitle(title) ?? title,
      brand: null,
      model: null,
      modelNumber:
        typeof item.product_id === "string" || typeof item.product_id === "number"
          ? String(item.product_id)
          : null,
      price: sanitized,
      currency: currencyGuess,
      condition: null,
      availability: soldOut ? "out_of_stock" : "in_stock",
      url,
      retailer: merchant,
      imageUrl,
      description:
        typeof item.price_str === "string"
          ? item.price_str
          : typeof item.desc === "string"
            ? item.desc
            : null,
      specifications: {},
      shippingPrice: null,
      shippingInformation: null,
      isMarketplace: true,
      marketplaceName: "Google Shopping",
      sellerName: merchant,
      sellerRating:
        typeof item.rating === "number"
          ? String(item.rating)
          : num(item.rating) != null
            ? String(num(item.rating))
            : null,
      sellerReviewCount:
        typeof item.reviews_count === "number"
          ? item.reviews_count
          : num(item.reviews_count),
      fulfillment: null,
      returnInformation: null,
      knownMandatoryFees: null,
      shipsToUserLocation: soldOut ? false : true,
      shippingAvailability: "unknown",
      sourceRetrievedAt: now,
    });
  }

  return out;
}

/**
 * Resolve currency for a shopping hit.
 * Prefer explicit symbols (Rp, ₱, …); otherwise trust the shopper's market
 * locale — never label Indonesian Rupiah amounts as USD/SGD.
 */
export function resolveListingCurrency(input: {
  priceStr: string;
  rawCurrency: unknown;
  fallbackCurrency: string;
  price: number;
}): string {
  const fromStr = inferCurrencyFromPriceStr(input.priceStr);
  if (fromStr) return fromStr;

  const raw = String(input.rawCurrency ?? "").trim();
  if (/^[A-Za-z]{3}$/.test(raw)) {
    const code = raw.toUpperCase();
    // High-value local currencies: if amount looks like IDR/VND/KRW and
    // Google tagged USD/SGD by mistake, keep the locale currency.
    const highUnit = new Set(["IDR", "VND", "KRW", "LAK", "IRR"]);
    if (
      highUnit.has(input.fallbackCurrency.toUpperCase()) &&
      input.price >= 10_000 &&
      (code === "USD" || code === "SGD" || code === "EUR" || code === "GBP")
    ) {
      return input.fallbackCurrency.toUpperCase();
    }
    return code;
  }

  return input.fallbackCurrency.toUpperCase();
}

function inferCurrencyFromPriceStr(s: string): string | null {
  if (!s) return null;
  if (/Rp\.?|IDR|rupiah/i.test(s)) return "IDR";
  if (/₱|PHP|Php/i.test(s)) return "PHP";
  if (/£|GBP/i.test(s)) return "GBP";
  if (/€|EUR/i.test(s)) return "EUR";
  if (/¥|JPY|円/i.test(s)) return "JPY";
  if (/₩|KRW|원/i.test(s)) return "KRW";
  if (/₫|VND|dong/i.test(s)) return "VND";
  if (/฿|THB/i.test(s)) return "THB";
  if (/RM|MYR/i.test(s)) return "MYR";
  if (/₹|INR|Rs\.?/i.test(s)) return "INR";
  if (/NT\$|TWD/i.test(s)) return "TWD";
  if (/HK\$|HKD/i.test(s)) return "HKD";
  if (/A\$|AUD/i.test(s)) return "AUD";
  if (/C\$|CAD/i.test(s)) return "CAD";
  if (/S\$|SGD/i.test(s)) return "SGD";
  if (/US\$|USD/i.test(s)) return "USD";
  // Bare "$" is ambiguous — leave to locale fallback
  return null;
}

/**
 * Parse Google SERP (google_search, parse:true) into clean organic hits.
 * Structure: data.results.results.{organic,paid,shopping?,popular_products?}
 */
export function parseSerpResults(result: DecodoResult): SerpHit[] {
  let data: RawItem | null = null;
  try {
    const c = result.content?.trim();
    if (c && c.startsWith("{")) data = JSON.parse(c) as RawItem;
  } catch {
    return [];
  }
  if (!data) return [];

  const r1 = (data.results ?? data) as RawItem;
  const inner = (r1?.results ?? r1) as RawItem;
  if (!inner || typeof inner !== "object") return [];

  const hits: SerpHit[] = [];
  const push = (item: RawItem, fallbackSource: string | null) => {
    const url = typeof item.url === "string" ? item.url : typeof item.link === "string" ? item.link : null;
    const title = String(item.title ?? item.name ?? "").trim();
    if (!url || !title || !/^https?:\/\//i.test(url)) return;
    if (/google\.|youtube\.|facebook\.|reddit\.|wikipedia\./i.test(url)) return;

    const desc =
      typeof item.desc === "string"
        ? item.desc
        : typeof item.description === "string"
          ? item.description
          : typeof item.snippet === "string"
            ? item.snippet
            : null;

    // Pull price + stock from organic snippet text (common on localized SERPs)
    let price =
      num(item.price) ??
      num((item.price as RawItem | undefined)?.value) ??
      null;
    if (price == null && desc) {
      const m =
        desc.match(/(?:Rp\.?|IDR)\s*([\d.]+)/i) ||
        desc.match(/(?:₱|PHP|Php)\s*([\d,]+(?:\.\d{1,2})?)/) ||
        desc.match(/(?:US\$|USD|\$)\s*([\d,]+(?:\.\d{1,2})?)/) ||
        desc.match(/(?:£|€|S\$|RM)\s*([\d,]+(?:\.\d{1,2})?)/);
      if (m) {
        const rawAmt = m[1]!;
        price =
          rawAmt.includes(".") && rawAmt.split(".").length > 2
            ? parseFloat(rawAmt.replace(/\./g, ""))
            : parseFloat(rawAmt.replace(/,/g, ""));
      }
    }
    const soldOut = /\b(sold\s*out|out\s*of\s*stock|unavailable)\b/i.test(
      `${title} ${desc ?? ""}`,
    );

    hits.push({
      title,
      url,
      description: desc,
      price,
      source:
        typeof item.source === "string"
          ? item.source
          : typeof item.merchant === "string"
            ? item.merchant
            : typeof item.favicon_text === "string"
              ? item.favicon_text
              : fallbackSource,
      imageUrl:
        typeof item.thumbnail === "string"
          ? item.thumbnail
          : typeof item.image === "string"
            ? item.image
            : null,
      rating: num(item.rating),
      reviewCount:
        typeof item.reviews_count === "number" ? item.reviews_count : num(item.reviews_count),
      currency: null,
      availability: soldOut ? "out_of_stock" : null,
    });
  };

  for (const key of ["shopping", "popular_products", "products", "product_cards"]) {
    const arr = inner[key];
    if (Array.isArray(arr)) for (const it of arr) push(it as RawItem, "Google Shopping");
  }
  for (const key of ["organic", "paid"]) {
    const arr = inner[key];
    if (Array.isArray(arr)) for (const it of arr) push(it as RawItem, null);
  }
  return hits;
}

/**
 * Parse structured listings out of a Decodo template result.
 * Returns an empty array (never throws) so callers can always proceed.
 */
export function parseStructuredListings(
  result: DecodoResult,
  retailerName: string,
  currency = "USD",
): import("@/lib/schemas").ProductListing[] {
  let data: RawItem | null = null;
  try {
    const c = result.content?.trim();
    if (c && c.startsWith("{")) {
      data = JSON.parse(c) as RawItem;
    }
  } catch {
    return [];
  }
  if (!data) return [];

  const organic = getOrganic(data, retailerName);
  if (!organic.length) return [];

  const now = new Date().toISOString();
  const seen = new Set<string>();
  const listings: import("@/lib/schemas").ProductListing[] = [];

  for (const item of organic.slice(0, 30)) {
    const name = String(
      item.title ?? item.name ?? item.header ?? item.product_name ?? "",
    ).trim();
    if (!name) continue;

    const price = extractItemPrice(item);
    const dedupeKey = `${name.slice(0, 60)}|${price}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const isPrime = Boolean(item.is_prime);
    const freeShip = Boolean(item.free_shipping || item.free_delivery || item.delivery);
    const outOfStock = Boolean(item.out_of_stock);
    const source = typeof item.source === "string" ? item.source : retailerName;

    let url = typeof item.url === "string" ? item.url : null;
    if (url && !/^https?:\/\//i.test(url)) {
      if (/amazon/i.test(retailerName) || /amazon\./i.test(url)) {
        url = `https://www.amazon.com${url.startsWith("/") ? "" : "/"}${url}`;
      } else if (/walmart/i.test(retailerName)) {
        url = `https://www.walmart.com${url.startsWith("/") ? "" : "/"}${url}`;
      } else if (/target/i.test(retailerName)) {
        url = `https://www.target.com${url.startsWith("/") ? "" : "/"}${url}`;
      }
    }

    const ratingVal =
      typeof item.rating === "number"
        ? item.rating
        : item.rating && typeof item.rating === "object"
          ? num((item.rating as RawItem).rating)
          : num(item.rating);

    listings.push({
      productName: name,
      brand: typeof item.brand === "string" ? item.brand : null,
      model: null,
      modelNumber: typeof item.asin === "string" ? item.asin : null,
      price,
      currency,
      condition: null,
      availability: outOfStock ? "out_of_stock" : null,
      url,
      retailer: source,
      imageUrl:
        typeof item.thumbnail === "string"
          ? item.thumbnail
          : typeof item.image === "string"
            ? item.image
            : null,
      description: typeof item.description === "string" ? item.description : null,
      specifications: {},
      shippingPrice: null,
      shippingInformation:
        typeof item.shipping_information === "string"
          ? item.shipping_information.slice(0, 200)
          : null,
      isMarketplace: ["Amazon", "eBay"].includes(retailerName),
      marketplaceName: null,
      sellerName:
        typeof item.seller_name === "string"
          ? item.seller_name
          : typeof item.seller === "string"
            ? item.seller
            : null,
      sellerRating: ratingVal != null ? String(ratingVal) : null,
      sellerReviewCount:
        typeof item.reviews_count === "number"
          ? item.reviews_count
          : item.rating && typeof item.rating === "object"
            ? num((item.rating as RawItem).count)
            : null,
      fulfillment: isPrime ? "prime" : null,
      returnInformation: null,
      knownMandatoryFees: null,
      shipsToUserLocation: outOfStock ? false : isPrime || freeShip ? true : null,
      shippingAvailability: (isPrime || freeShip ? "known" : "unknown") as
        | "known"
        | "estimated"
        | "unknown",
      sourceRetrievedAt: now,
    });
  }

  return listings;
}

/**
 * Retrieve product-oriented web data for a retailer search URL or SERP query.
 */
export async function retrieveProductData(input: {
  url?: string;
  query?: string;
  mode?: "page" | "google_search" | "amazon_search" | "walmart_search" | "target_search";
  geo?: string;
}): Promise<DecodoResult> {
  const mode = input.mode ?? (input.url ? "page" : "google_search");

  if (mode === "google_search") {
    if (!input.query) {
      throw new DecodoError("retrieveProductData requires query for search mode");
    }
    return searchWeb(input.query, { geo: input.geo });
  }

  if (mode === "amazon_search") {
    if (!input.query) throw new DecodoError("amazon_search requires query");
    return searchAmazon(input.query, { geo: input.geo });
  }

  if (mode === "walmart_search") {
    if (!input.query) throw new DecodoError("walmart_search requires query");
    return searchWalmart(input.query, { geo: input.geo });
  }

  if (mode === "target_search") {
    if (!input.query) throw new DecodoError("target_search requires query");
    return searchTarget(input.query, { geo: input.geo });
  }

  if (!input.url) {
    throw new DecodoError("retrieveProductData requires url for page mode");
  }

  return scrapePage(input.url, { geo: input.geo });
}

export function isDecodoConfigured(): boolean {
  return Boolean(
    process.env.DECODO_API_KEY?.trim() ||
      (process.env.DECODO_USERNAME?.trim() &&
        process.env.DECODO_PASSWORD?.trim()),
  );
}
