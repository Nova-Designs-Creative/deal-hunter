/**
 * Central deal-ranking weights — Recommended Deal scoring.
 * Video checkpoint: v7-final-ranking
 */

/** Default (category / flexible) search */
export const RANKING_WEIGHTS = {
  productMatch: 0.25,
  effectivePrice: 0.28,
  localAffinity: 0.2,
  retailerConfidence: 0.1,
  reviews: 0.1,
  availability: 0.05,
  dataCompleteness: 0.02,
} as const;

/**
 * Named SKU price race — price + local fit + reviews.
 * Prefer buyable local merchants over cheaper cross-border noise.
 */
export const NAMED_PRODUCT_RANKING_WEIGHTS = {
  productMatch: 0.12,
  effectivePrice: 0.35,
  localAffinity: 0.25,
  retailerConfidence: 0.05,
  reviews: 0.15,
  availability: 0.05,
  dataCompleteness: 0.03,
} as const;

export type RankingWeightKey = keyof typeof RANKING_WEIGHTS;

export const PRICE_SCORE_FLOOR = 0.15;

/** Match statuses eligible for "lowest price found" — must be a confirmed match */
export const LOWEST_PRICE_ELIGIBLE = ["exact", "strong"] as const;

/** How many listings to keep per retailer before global compare */
export const TOP_PER_RETAILER = 10;
