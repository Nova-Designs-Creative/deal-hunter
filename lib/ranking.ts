/**
 * Ranking — Recommended Deal vs Lowest Price.
 * Video checkpoint: v7-final-ranking
 */

import { formatMoney, toUsdEstimate } from "@/lib/currency";
import { localAffinityScore } from "@/lib/local-affinity";
import { reviewScore } from "@/lib/marketplace-race";
import {
  LOWEST_PRICE_ELIGIBLE,
  NAMED_PRODUCT_RANKING_WEIGHTS,
  PRICE_SCORE_FLOOR,
  RANKING_WEIGHTS,
} from "@/lib/ranking-config";
import type {
  EffectivePrice,
  ProductListing,
  ProductMatch,
  RankedDeal,
  RetailerEvaluation,
  ShoppingLocation,
} from "@/lib/schemas";

function matchScore(match: ProductMatch): number {
  switch (match.matchStatus) {
    case "exact":
      return 0.7 + 0.3 * match.confidence;
    case "strong":
      return 0.5 + 0.35 * match.confidence;
    case "possible":
      return 0.3 + 0.25 * match.confidence;
    case "different":
      return 0.05;
    case "unknown":
      return 0.15 * match.confidence;
    default:
      return 0;
  }
}

function retailerScore(evaluation: RetailerEvaluation): number {
  const map = {
    high: 1,
    medium: 0.65,
    limited: 0.35,
    insufficient_information: 0.4,
  } as const;
  let score = map[evaluation.retailerConfidence];
  if (evaluation.sellerConfidence) {
    score = (score + map[evaluation.sellerConfidence]) / 2;
  }
  return score;
}

function availabilityScore(listing: ProductListing, pricing: EffectivePrice): number {
  let score = 0.4;
  const avail = `${listing.availability ?? ""} ${listing.productName ?? ""}`.toLowerCase();
  if (/sold\s*out|out of stock|unavailable|oos/.test(avail)) return 0.02;
  if (/in stock|available|ships|ready to ship|pre-?order/.test(avail)) score += 0.35;
  if (pricing.shipsToUserLocation === false) score = 0.05;
  else if (pricing.shipsToUserLocation === true) score += 0.2;
  return Math.max(0, Math.min(1, score));
}

function dataCompletenessScore(
  listing: ProductListing,
  pricing: EffectivePrice,
): number {
  let n = 0;
  let total = 6;
  if (listing.productName) n++;
  if (listing.price != null) n++;
  if (listing.url) n++;
  if (listing.condition) n++;
  if (pricing.calculationComplete) n++;
  if (Object.keys(listing.specifications ?? {}).length > 0) n++;
  return n / total;
}

function priceScore(
  pricing: EffectivePrice,
  bestCompleteUsd: number | null,
): number {
  if (pricing.shipsToUserLocation === false) return 0.02;
  if (!pricing.calculationComplete || pricing.effectivePrice == null) {
    if (pricing.productPrice == null) return 0.05;
    // Sticker-only: still usable for named-product races
    if (bestCompleteUsd == null || bestCompleteUsd <= 0) return 0.55;
    const usd = toUsdEstimate(pricing.productPrice, pricing.currency).usd;
    return Math.max(PRICE_SCORE_FLOOR, Math.min(1, bestCompleteUsd / usd));
  }
  if (bestCompleteUsd == null || bestCompleteUsd <= 0) return 0.7;
  const usd = toUsdEstimate(pricing.effectivePrice, pricing.currency).usd;
  return Math.max(PRICE_SCORE_FLOOR, Math.min(1, bestCompleteUsd / usd));
}

export type RankableInput = {
  id: string;
  listing: ProductListing;
  match: ProductMatch;
  retailerEvaluation: RetailerEvaluation;
  pricing: EffectivePrice;
  retrievedAt: string;
};

function buildEvidence(item: RankableInput) {
  return {
    source: item.listing.retailer ?? "Unknown source",
    retailer: item.listing.retailer,
    product: item.listing.productName,
    price: item.listing.price,
    currency: item.listing.currency,
    retrievedAt: item.retrievedAt,
    url: item.listing.url,
    disclaimer: "Prices may change.",
  };
}

export function rankDeals(
  inputs: RankableInput[],
  opts?: { namedProduct?: boolean; location?: ShoppingLocation | null },
): RankedDeal[] {
  const weights = opts?.namedProduct
    ? NAMED_PRODUCT_RANKING_WEIGHTS
    : RANKING_WEIGHTS;
  const location = opts?.location ?? {
    country: "United States",
    countryCode: "US",
    region: null,
    postalCode: null,
  };

  const comparable = inputs.filter(
    (i) =>
      i.pricing.shipsToUserLocation !== false &&
      (i.match.matchStatus === "exact" ||
        i.match.matchStatus === "strong" ||
        i.match.matchStatus === "possible"),
  );

  // Prefer local merchants when picking the "best price" baseline for scoring
  const localComparable = comparable.filter(
    (i) => localAffinityScore(i.listing, location) >= 0.55,
  );
  const pricePool = localComparable.length >= 2 ? localComparable : comparable;

  const priceUsd = pricePool
    .map((i) => {
      const amt = i.pricing.effectivePrice ?? i.pricing.productPrice;
      if (amt == null) return null;
      return toUsdEstimate(amt, i.pricing.currency).usd;
    })
    .filter((n): n is number => n != null && n > 0);

  const bestCompleteUsd = priceUsd.length > 0 ? Math.min(...priceUsd) : null;

  return inputs
    .map((item) => {
      const affinity = localAffinityScore(item.listing, location);
      const excludedReason =
        item.pricing.shipsToUserLocation === false
          ? item.pricing.notes
          : item.match.matchStatus === "different"
            ? "Excluded as different product"
            : null;

      const breakdown = {
        productMatch: matchScore(item.match),
        effectivePrice: priceScore(item.pricing, bestCompleteUsd),
        localAffinity: affinity,
        retailerConfidence: retailerScore(item.retailerEvaluation),
        reviews: reviewScore(item.listing),
        availability: availabilityScore(item.listing, item.pricing),
        dataCompleteness: dataCompletenessScore(item.listing, item.pricing),
      };

      const dealScore =
        breakdown.productMatch * weights.productMatch +
        breakdown.effectivePrice * weights.effectivePrice +
        breakdown.localAffinity * weights.localAffinity +
        breakdown.retailerConfidence * weights.retailerConfidence +
        breakdown.reviews * weights.reviews +
        breakdown.availability * weights.availability +
        breakdown.dataCompleteness * weights.dataCompleteness;

      const finalScore = excludedReason ? dealScore * 0.1 : dealScore;

      return {
        id: item.id,
        listing: item.listing,
        match: item.match,
        retailerEvaluation: item.retailerEvaluation,
        pricing: item.pricing,
        dealScore: finalScore,
        scoreBreakdown: breakdown,
        rankReason: item.match.reasoning,
        priceEvidence: buildEvidence(item),
        excludedReason,
      };
    })
    .sort((a, b) => b.dealScore - a.dealScore);
}

/** Lowest sticker among local (preferred) exact/strong matches; fall back to all. */
export function pickLowestPriceDeal(
  ranked: RankedDeal[],
  location?: ShoppingLocation | null,
): RankedDeal | null {
  const loc = location ?? {
    country: "United States",
    countryCode: "US",
    region: null,
    postalCode: null,
  };

  const baseEligible = ranked.filter(
    (d) =>
      !d.excludedReason &&
      LOWEST_PRICE_ELIGIBLE.includes(
        d.match.matchStatus as (typeof LOWEST_PRICE_ELIGIBLE)[number],
      ) &&
      (d.pricing.effectivePrice != null || d.pricing.productPrice != null),
  );
  if (!baseEligible.length) return null;

  const local = baseEligible.filter(
    (d) => localAffinityScore(d.listing, loc) >= 0.55,
  );
  const eligible = local.length ? local : baseEligible;

  return eligible.reduce((best, cur) => {
    const bestAmt =
      best.pricing.effectivePrice ?? best.pricing.productPrice ?? Infinity;
    const curAmt =
      cur.pricing.effectivePrice ?? cur.pricing.productPrice ?? Infinity;
    const bestUsd = toUsdEstimate(bestAmt, best.pricing.currency).usd;
    const curUsd = toUsdEstimate(curAmt, cur.pricing.currency).usd;
    if (curUsd !== bestUsd) return curUsd < bestUsd ? cur : best;
    return reviewScore(cur.listing) > reviewScore(best.listing) ? cur : best;
  });
}

export function buildWinnerExplanation(
  recommended: RankedDeal,
  lowest: RankedDeal | null,
): string {
  const parts: string[] = [];
  const retailer = recommended.listing.retailer ?? "this retailer";
  const price =
    recommended.pricing.effectivePrice ?? recommended.pricing.productPrice;
  const currency = recommended.pricing.currency ?? "";

  parts.push(
    `Best deal from the marketplaces we checked: ${recommended.listing.productName ?? "this product"} at ${retailer}${price != null ? ` (${formatMoney(price, currency)})` : ""}.`,
  );

  if (
    lowest &&
    lowest.id !== recommended.id &&
    lowest.pricing.productPrice != null &&
    recommended.pricing.productPrice != null
  ) {
    const low = lowest.pricing.effectivePrice ?? lowest.pricing.productPrice;
    const rec =
      recommended.pricing.effectivePrice ?? recommended.pricing.productPrice;
    if (low != null && rec != null && low < rec) {
      parts.push(
        `A lower sticker price was found at ${lowest.listing.retailer ?? "another source"}, but ranked lower due to reviews, match quality, shipping, or seller confidence.`,
      );
    }
  }

  parts.push(
    "Compared across the retailers we scraped — not a claim of the cheapest price on the entire internet.",
  );

  return parts.join(" ");
}
