/**
 * Heuristic product listing extractor — zero LLM calls.
 *
 * Parses scraped page markdown for price patterns and associates them with the
 * nearest plausible product title (markdown link text or heading). Designed to
 * be conservative: it is better to return fewer, correct listings than many
 * junk ones. The LLM extractor supplements it.
 */

import type { ProductListing } from "@/lib/schemas";

// ─── Currency detection ───────────────────────────────────────────────────────

const CURRENCY_PATTERNS: Array<{ re: RegExp; code: string }> = [
  { re: /(?:Rp\.?|IDR)\s*([\d.,]+)/i, code: "IDR" },
  { re: /(?:₱|PHP|Php)\s*([\d,]+(?:\.\d{1,2})?)/, code: "PHP" },
  { re: /(?:฿|THB)\s*([\d,]+(?:\.\d{1,2})?)/, code: "THB" },
  { re: /(?:₫|VND)\s*([\d.,]+)/i, code: "VND" },
  { re: /(?:₩|KRW)\s*([\d,]+)/i, code: "KRW" },
  { re: /(?:£|GBP)\s*([\d,]+(?:\.\d{1,2})?)/, code: "GBP" },
  { re: /(?:€|EUR)\s*([\d,]+(?:\.\d{1,2})?)/, code: "EUR" },
  { re: /(?:¥|JPY)\s*([\d,]+)/, code: "JPY" },
  { re: /(?:S\$|SGD)\s*([\d,]+(?:\.\d{1,2})?)/, code: "SGD" },
  { re: /(?:RM|MYR)\s*([\d,]+(?:\.\d{1,2})?)/, code: "MYR" },
  { re: /(?:A\$|AUD)\s*([\d,]+(?:\.\d{1,2})?)/, code: "AUD" },
  { re: /(?:C\$|CAD)\s*([\d,]+(?:\.\d{1,2})?)/, code: "CAD" },
  { re: /(?:US\$|USD|\$)\s*([\d,]+(?:\.\d{1,2})?)/, code: "USD" },
];

/** Lines that are never product titles */
const JUNK_LINE =
  /\b(promo|voucher|coupon|use code|discount code|save up to|% off|cashback|points|install(ment)?|per month|\/mo\b|warranty|free shipping|shipping fee|delivery fee|add to cart|buy now|checkout|sign in|log in|register|subscribe|newsletter|sort by|filter|showing \d+|results? for|compare|wishlist|trade[- ]in|pre-?owned)\b/i;

/** Titles that are accessories / bundles, not the product itself */
const ACCESSORY_TITLE =
  /\b(case|cover|sleeve|skin|screen ?protector|protector|adapter|charger|charging cable|cable|dock|hub|stand|mount|strap|band|keyboard cover|bag|pouch|setup|bundle|kit|tempered glass|stylus|pen|tips|ear ?tips|replacement|spare|keycaps?|key ?caps?|plate|shaft|stem|module|foam|lube|stabilizers?|deskmat|voucher|promo|coupon|daughterboard|wrist\s*rest|wristrest|elbow)\b/i;

// ─── Markdown helpers ─────────────────────────────────────────────────────────

/**
 * Remove images entirely, keep link text, drop other markdown syntax.
 * Handles nested brackets like "[Apple Macbook Air M5 [Pre-Order ]](/products/x?pos=1)".
 */
export function stripMarkdown(s: string): string {
  let out = s.replace(/!\[[^\]]*\]\([^)]*\)/g, " "); // images
  out = out.replace(/\]\([^)]*\)/g, "]"); // drop every link target "(…)" that follows "]"
  out = out.replace(/\]\(\S*$/g, "]"); // unterminated link target at end of line
  out = out.replace(/\/[\w\-\/]+\?\S*/g, " "); // stray relative URLs with query strings
  out = out.replace(/\S*[?&]\w+=\S*/g, " "); // stray "pos=1&sid=..." fragments
  out = out.replace(/[\[\]()*_`#>|\\]/g, " ");
  out = out.replace(/&nbsp;|&amp;|&quot;|&#\d+;/g, " ");
  out = out.replace(/[\u2010-\u2015\u2212]/g, "-"); // unicode hyphens → "-"
  out = out.replace(/\uFFFD\??\??/g, "-"); // mojibake replacement chars
  out = out.replace(/^["'\s]+|["'\s]+$/g, ""); // stray quotes
  out = out.replace(/\s+/g, " ").trim();
  // Collapse repeated segments: "A : B : B" → "A : B"
  const segs = out.split(/\s+:\s+/);
  const uniq: string[] = [];
  for (const s of segs) if (!uniq.includes(s)) uniq.push(s);
  return uniq.join(" : ");
}

/**
 * Strip price noise that scrapers glue onto titles
 * ("… Card ₱24,950.00 - ₱32,495.00 Price range: …").
 */
export function cleanProductTitle(s: string | null | undefined): string | null {
  if (!s) return null;
  let out = stripMarkdown(s);
  out = out
    // Glued scraper tails: "495.00Price range:" → split then drop
    .replace(/(\d)(price\s*range)/i, "$1 $2")
    .replace(/price\s*range\s*:?\s*.*$/i, "")
    .replace(
      /(?:Rp\.?|IDR|₱|PHP|US\$|USD|SGD|S\$|£|€|¥|₩|฿|RM|\$)\s*[\d.,]+(?:\s*(?:[-–—]|to|through|thru)\s*(?:Rp\.?|IDR|₱|PHP|US\$|USD|SGD|S\$|£|€|¥|₩|฿|RM|\$)?\s*[\d.,]+)*/gi,
      "",
    )
    .replace(/\b(?:from|through|thru)\s*(?:Rp\.?|₱|\$)?\s*[\d.,]+/gi, "")
    .replace(/^[\s\-–—:|/]+|[\s\-–—:|/]+$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return out || null;
}

/** Pull every currency-looking amount out of free text. */
export function extractPriceAmounts(text: string): number[] {
  if (!text) return [];
  const amounts: number[] = [];
  const re =
    /(?:Rp\.?|IDR|₱|PHP|Php|US\$|USD|SGD|S\$|£|€|¥|₩|฿|RM|\$)\s*([\d.,]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const rawAmt = m[1]!;
    const v = /,\d{1,2}$/.test(rawAmt)
      ? parseFloat(rawAmt.replace(/\./g, "").replace(",", "."))
      : rawAmt.includes(".") && rawAmt.split(".").length > 2
        ? parseFloat(rawAmt.replace(/\./g, ""))
        : parseFloat(rawAmt.replace(/,/g, ""));
    if (Number.isFinite(v) && v >= 1) amounts.push(v);
  }
  return amounts;
}

/**
 * Fix junk prices: scrapers often emit ₱217 from a range card whose real
 * floor is ₱24,950. Prefer the range floor when the sticker is absurdly low.
 */
export function sanitizeListingPrice(
  price: number | null | undefined,
  text: string,
): number | null {
  if (price == null || !(price > 0)) return null;
  const amounts = extractPriceAmounts(text).filter((a) => a >= 50);
  if (amounts.length === 0) return price;

  const lo = Math.min(...amounts);
  const hi = Math.max(...amounts);

  // Clear range in the title/description
  if (amounts.length >= 2 && hi >= lo * 1.05) {
    if (price < lo * 0.5) return lo;
    // Prefer staying inside the published range
    if (price < lo) return lo;
  }

  // Single (or many similar) amount(s) far above the parsed sticker
  if (price < lo * 0.4 && lo >= 1_000) return lo;

  return price;
}

/** First absolute or relative link href on a line. */
function firstHref(line: string): string | null {
  const m = line.match(/\]\(\s*(<?)([^)\s>]+)>?\s*(?:"[^"]*")?\)/);
  return m ? m[2] : null;
}

function resolveUrl(href: string | null, base: string | null): string | null {
  if (!href) return null;
  if (/^https?:\/\//i.test(href)) return href.split("#")[0];
  if (!base) return null;
  try {
    return new URL(href, base).toString().split("#")[0];
  } catch {
    return null;
  }
}

// ─── Query relevance ─────────────────────────────────────────────────────────

const STOP = new Set([
  "the", "and", "for", "with", "buy", "best", "cheap", "cheapest", "price",
  "find", "deal", "deals", "new", "sale", "online", "shop", "store", "from",
]);

/** Tokens: letters and alphanumerics. Keeps short model tokens (m5, xm6, 2). */
export function queryTokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s\-]/g, " ")
    .split(/[\s\-]+/)
    .filter((t) => t.length > 0 && !STOP.has(t));
}

function tokenSet(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s\-]/g, " ")
      .split(/[\s\-]+/)
      .filter(Boolean),
  );
}

/** Fraction of query tokens present in the candidate (0–1). */
export function queryCoverage(candidate: string, qTokens: string[]): number {
  if (!qTokens.length) return 0;
  const ct = tokenSet(candidate);
  const joined = candidate.toLowerCase().replace(/[^a-z0-9]/g, "");
  let hits = 0;
  for (const q of qTokens) {
    if (ct.has(q) || (q.length >= 3 && joined.includes(q))) hits++;
  }
  return hits / qTokens.length;
}

// ─── Main extractor ───────────────────────────────────────────────────────────

export function heuristicExtractListings(
  content: string,
  retailerName: string,
  productQuery: string,
  fallbackCurrency = "USD",
  baseUrl: string | null = null,
): ProductListing[] {
  const lines = content.split("\n");
  const qTokens = queryTokens(productQuery);
  // The "anchor" is the longest alphabetic token (e.g. "macbook", "airpods").
  const anchor =
    [...qTokens].filter((t) => /[a-z]/.test(t)).sort((a, b) => b.length - a.length)[0] ??
    qTokens[0] ??
    "";

  const now = new Date().toISOString();
  const seen = new Set<string>();
  const results: ProductListing[] = [];

  for (let i = 0; i < lines.length && results.length < 25; i++) {
    const line = lines[i]!;
    if (JUNK_LINE.test(line) && !/\]\(/.test(line)) continue;

    let price: number | null = null;
    let code = fallbackCurrency;
    for (const p of CURRENCY_PATTERNS) {
      const m = p.re.exec(line);
      if (!m) continue;
      const rawAmt = m[1]!;
      // ID/EU style thousands: 1.270.620 or 1.270.620,50
      const v = /,\d{1,2}$/.test(rawAmt)
        ? parseFloat(rawAmt.replace(/\./g, "").replace(",", "."))
        : rawAmt.includes(".") && rawAmt.split(".").length > 2
          ? parseFloat(rawAmt.replace(/\./g, ""))
          : parseFloat(rawAmt.replace(/,/g, ""));
      if (Number.isFinite(v) && v >= 1) {
        price = v;
        code = p.code;
        break;
      }
    }
    if (price == null) continue;

    // Find best title in a window around the price line.
    let bestName: string | null = null;
    let bestScore = 0;
    let bestHref: string | null = null;

    const lo = Math.max(0, i - 8);
    const hi = Math.min(lines.length - 1, i + 2);
    for (let j = lo; j <= hi; j++) {
      const raw = lines[j]!;
      const clean = stripMarkdown(raw);
      if (clean.length < 8 || clean.length > 220) continue;
      if (JUNK_LINE.test(clean)) continue;
      if (/^(₱|\$|£|€|¥|php|usd|gbp|eur)/i.test(clean)) continue;
      if (!/[a-z]/i.test(clean)) continue;

      const coverage = queryCoverage(clean, qTokens);
      const hasAnchor = anchor ? clean.toLowerCase().includes(anchor) : true;
      if (!hasAnchor) continue;

      // Prefer link text (real product titles are usually links) & closer lines
      const linkBonus = /\]\(/.test(raw) ? 0.1 : 0;
      const distancePenalty = Math.abs(i - j) * 0.01;
      const score = coverage + linkBonus - distancePenalty;
      if (score > bestScore) {
        bestScore = score;
        bestName = clean;
        bestHref = firstHref(raw) ?? bestHref;
      }
    }

    // Also allow the href to come from the price line itself
    bestHref = bestHref ?? firstHref(line);

    if (!bestName || bestScore < 0.45) continue;
    if (ACCESSORY_TITLE.test(bestName) && !ACCESSORY_TITLE.test(productQuery)) continue;

    const key = `${bestName.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 60)}|${price}`;
    if (seen.has(key)) continue;
    seen.add(key);

    results.push({
      productName: bestName.slice(0, 160),
      brand: null,
      model: null,
      modelNumber: null,
      price,
      currency: code,
      condition: /pre-?order/i.test(bestName) ? "pre-order" : null,
      availability: /pre-?order/i.test(bestName) ? "pre-order" : null,
      url: resolveUrl(bestHref, baseUrl),
      retailer: retailerName,
      imageUrl: null,
      description: null,
      specifications: {},
      shippingPrice: null,
      shippingInformation: null,
      isMarketplace: /lazada|shopee|ebay|amazon|etsy/i.test(retailerName),
      marketplaceName: null,
      sellerName: null,
      sellerRating: null,
      sellerReviewCount: null,
      fulfillment: null,
      returnInformation: null,
      knownMandatoryFees: null,
      shipsToUserLocation: null,
      shippingAvailability: "unknown",
      sourceRetrievedAt: now,
    });
  }

  return results;
}

/**
 * Drop listings whose price is implausibly low relative to the group —
 * these are almost always accessories, promo lines, or installment amounts.
 * Only applied when we have enough data to estimate a median.
 */
export function dropPriceOutliers<T extends { price: number | null }>(
  items: T[],
  minRatioOfMedian = 0.3,
): { kept: T[]; dropped: T[] } {
  const priced = items.filter((i) => i.price != null && i.price > 0);
  if (priced.length < 3) return { kept: items, dropped: [] };
  const sorted = priced.map((i) => i.price!).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)]!;
  const threshold = median * minRatioOfMedian;
  const kept: T[] = [];
  const dropped: T[] = [];
  for (const it of items) {
    if (it.price != null && it.price < threshold) dropped.push(it);
    else kept.push(it);
  }
  return { kept, dropped };
}
