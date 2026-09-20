/**
 * Prefer merchants that sell/ship in the shopper's country.
 * Google Shopping mixes local + cross-border — local affinity keeps
 * PH results from recommending Saudi/SG storefronts first.
 */

import type { ProductListing, ShoppingLocation } from "@/lib/schemas";

const LOCAL_HINTS: Record<string, RegExp[]> = {
  PH: [
    /\.ph\b/i,
    /\bshopee\.ph\b/i,
    /\blazada\.com\.ph\b/i,
    /\blazada philippines\b/i,
    /\bshopee\b/i,
    /\bgame\s*one\b/i,
    /\bkimstore\b/i,
    /\bdatablitz\b/i,
    /\brotobox\b/i,
    /\bubuy\.com\.ph\b/i,
    /\bgilmore\b/i,
    /\bhobbydynamics\b/i,
    /\bphilippines\b/i,
  ],
  US: [
    /\.com\b/i,
    /\bamazon\b/i,
    /\bwalmart\b/i,
    /\btarget\b/i,
    /\bbest\s*buy\b/i,
    /\bnewegg\b/i,
    /\bebay\b/i,
  ],
  JP: [
    /\.co\.jp\b/i,
    /\bamazon\.co\.jp\b/i,
    /\brakuten\b/i,
    /\byahoo.*shopping\b/i,
    /\bbic\s*camera\b/i,
    /\byodobashi\b/i,
    /\bkakaku\b/i,
    /\bjapan\b/i,
  ],
  SG: [/\.sg\b/i, /\blazada\.sg\b/i, /\bshopee\.sg\b/i, /\bktechs\b/i],
  GB: [/\.co\.uk\b/i, /\bamazon\.co\.uk\b/i, /\bcurrys\b/i, /\bjohn\s*lewis\b/i],
  AU: [/\.com\.au\b/i, /\bamazon\.com\.au\b/i],
  ID: [
    /\.co\.id\b/i,
    /\btokopedia\b/i,
    /\bshopee\.co\.id\b/i,
    /\blazada\.co\.id\b/i,
    /\bzalora\b/i,
    /\bblibli\b/i,
    /\batmos\b/i,
    /\bindonesia\b/i,
  ],
};

const FOREIGN_HINTS: RegExp[] = [
  /\.sa\b/i,
  /\bdesertcart\b/i,
  /\b\(SGD\b/i,
  /\b\(SAR\b/i,
  /\b\(USD\b/i,
  /\b\(EUR\b/i,
  /\b\(GBP\b/i,
  /\b\(JPY\b/i,
  /\b\(MYR\b/i,
  /\bktechs\b/i,
  /\bebay\s*-\s*\w+/i,
  /\bgame\s*one\b/i,
  /\bkimstore\b/i,
  /\blazada\.com\.ph\b/i,
  /\bshopee\.ph\b/i,
  /\brotobox\b/i,
];

function blob(listing: ProductListing): string {
  return [
    listing.retailer,
    listing.sellerName,
    listing.url,
    listing.marketplaceName,
    listing.description,
    listing.productName,
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * 0–1 score: 1 = clearly local to shopper country, 0 = clearly foreign.
 */
export function localAffinityScore(
  listing: ProductListing,
  location: ShoppingLocation,
): number {
  const cc = (location.countryCode || "US").toUpperCase();
  const text = blob(listing);
  const local = LOCAL_HINTS[cc] ?? [];

  let score = 0.45; // unknown / ambiguous

  if (local.some((re) => re.test(text))) score = 0.95;

  // Currency match is a soft local signal (PH listings priced in PHP)
  const cur = (listing.currency ?? "").toUpperCase();
  const expect: Record<string, string> = {
    PH: "PHP",
    US: "USD",
    GB: "GBP",
    UK: "GBP",
    AU: "AUD",
    CA: "CAD",
    SG: "SGD",
    JP: "JPY",
    DE: "EUR",
    FR: "EUR",
    ID: "IDR",
    TH: "THB",
    VN: "VND",
    KR: "KRW",
    MY: "MYR",
    IN: "INR",
  };
  if (expect[cc] && cur === expect[cc] && score < 0.7) score = Math.max(score, 0.6);

  // Cross-border signals — strong penalty unless we're in that market
  if (cc !== "SG" && /\bktechs\b/i.test(text)) score = Math.min(score, 0.2);
  if (cc !== "SA" && /\bdesertcart|\.sa\b/i.test(text)) score = Math.min(score, 0.15);
  if (cc !== "PH" && /\bgame\s*one|kimstore|rotobox|lazada\.com\.ph|shopee\.ph|\.ph\b/i.test(text)) {
    score = Math.min(score, 0.15);
  }
  if (cc !== "JP" && /\brakuten|yodobashi|bic\s*camera|kakaku|\.co\.jp\b/i.test(text)) {
    score = Math.min(score, 0.2);
  }
  if (
    cc !== "ID" &&
    /\btokopedia|blibli|zalora\.co\.id|lazada\.co\.id|shopee\.co\.id|\.co\.id\b/i.test(
      text,
    )
  ) {
    score = Math.min(score, 0.15);
  }
  if (FOREIGN_HINTS.some((re) => re.test(text))) {
    // Don't crush a local Shopee hit that happens to mention USD in shipping notes
    if (!local.some((re) => re.test(text))) score = Math.min(score, 0.25);
  }

  // price_str like "₱15,068.39 (SGD 305)" = foreign merchant shown in local currency
  if (/\((SGD|SAR|USD|EUR|GBP|JPY|MYR|AUD)\s/i.test(listing.description ?? "")) {
    if (cc === "PH" && /SGD|SAR/i.test(listing.description ?? "")) {
      score = Math.min(score, 0.2);
    }
  }

  return Math.max(0, Math.min(1, score));
}

/** Normalize store names so "rotoboxph.com" and "Rotoboxph" collapse. */
export function normalizeRetailerKey(name: string | null | undefined): string {
  return (name ?? "unknown")
    .toLowerCase()
    .replace(/^www\./, "")
    .replace(/\.(com|ph|sg|co\.uk|com\.au|net|store).*$/i, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim() || "unknown";
}
