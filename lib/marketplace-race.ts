/**
 * Marketplace price race — top-N per retailer, then global compare.
 *
 * For named products we keep up to TOP_PER_RETAILER matching listings
 * from each store (cheapest first, reviews as tie-breaker), then the
 * global ranker picks the best / lowest across stores.
 */

import { toUsdEstimate } from "@/lib/currency";
import { normalizeRetailerKey } from "@/lib/local-affinity";
import { TOP_PER_RETAILER } from "@/lib/ranking-config";
import type { ProductListing, ProductMatch } from "@/lib/schemas";

export { TOP_PER_RETAILER };

export type MatchedListing = {
  id: string;
  listing: ProductListing;
  match: ProductMatch;
};

/** 0–1 score from rating + review volume (missing data → neutral mid). */
export function reviewScore(listing: ProductListing): number {
  const ratingRaw = listing.sellerRating;
  const rating =
    ratingRaw != null && ratingRaw !== ""
      ? Number(String(ratingRaw).replace(/[^0-9.]/g, ""))
      : NaN;
  const reviews = listing.sellerReviewCount ?? 0;

  let score = 0.45; // unknown
  if (Number.isFinite(rating) && rating > 0) {
    // Assume 5-star scale (Amazon/Walmart); clamp if 0–100 sneaks in
    const stars = rating > 5 ? rating / 20 : rating;
    score = Math.max(0, Math.min(1, stars / 5));
  }
  if (reviews > 0) {
    // log boost: 10 → +0.05, 100 → +0.1, 1000 → +0.15
    const volumeBoost = Math.min(0.2, Math.log10(reviews + 1) * 0.05);
    score = Math.min(1, score + volumeBoost);
  } else if (Number.isFinite(rating) && rating > 0) {
    score *= 0.9; // rated but no volume → slight discount
  }
  return score;
}

function listingUsd(listing: ProductListing): number {
  if (listing.price == null) return Number.POSITIVE_INFINITY;
  return toUsdEstimate(listing.price, listing.currency ?? "USD").usd;
}

/** Cheaper first; better reviews break ties. */
export function compareByPriceThenReviews(
  a: ProductListing,
  b: ProductListing,
): number {
  const pa = listingUsd(a);
  const pb = listingUsd(b);
  if (pa !== pb) return pa - pb;
  return reviewScore(b) - reviewScore(a);
}

/**
 * Keep up to `limit` matching listings per retailer.
 * Non-matching / different products are dropped before the race.
 */
export function selectTopPerRetailer(
  items: MatchedListing[],
  limit = TOP_PER_RETAILER,
): MatchedListing[] {
  const eligible = items.filter((m) =>
    ["exact", "strong", "possible"].includes(m.match.matchStatus),
  );
  if (!eligible.length) return items;

  const byStore = new Map<string, MatchedListing[]>();
  for (const m of eligible) {
    const key = normalizeRetailerKey(m.listing.retailer);
    const arr = byStore.get(key) ?? [];
    arr.push(m);
    byStore.set(key, arr);
  }

  const out: MatchedListing[] = [];
  for (const group of byStore.values()) {
    group.sort((a, b) => compareByPriceThenReviews(a.listing, b.listing));
    out.push(...group.slice(0, limit));
  }
  // Stable-ish global order: cheapest overall first (ranker will re-score)
  out.sort((a, b) => compareByPriceThenReviews(a.listing, b.listing));
  return out;
}
