import { z } from "zod";

/** User shopping location — never silently assume US */
export const ShoppingLocationSchema = z.object({
  country: z.string().min(2),
  countryCode: z.string().min(2).max(3),
  region: z.string().nullable(),
  postalCode: z.string().nullable(),
});

export type ShoppingLocation = z.infer<typeof ShoppingLocationSchema>;

export const SpecImportanceSchema = z.enum(["high", "medium", "low"]);

/** Accept object or bare string (models often return ["ram","storage"]) */
export const ImportantSpecificationSchema = z.preprocess(
  (val) => {
    if (typeof val === "string") {
      return {
        name: val,
        importance: "medium",
        description: null,
      };
    }
    if (val && typeof val === "object" && !Array.isArray(val)) {
      const o = val as Record<string, unknown>;
      return {
        name: String(o.name ?? o.key ?? o.spec ?? o.attribute ?? "spec"),
        importance: ["high", "medium", "low"].includes(String(o.importance))
          ? o.importance
          : "medium",
        description:
          o.description == null
            ? null
            : String(o.description),
      };
    }
    return val;
  },
  z.object({
    name: z.string(),
    importance: SpecImportanceSchema,
    description: z.string().nullable(),
  }),
);

function coerceGoal(val: unknown): string {
  const s = String(val ?? "best_value")
    .toLowerCase()
    .replace(/\s+/g, "_");
  if (["lowest_price", "best_value", "best_deal", "fastest_shipping"].includes(s)) {
    return s;
  }
  if (s.includes("cheap") || s.includes("lowest") || s.includes("price")) {
    return "lowest_price";
  }
  if (s.includes("fast") || s.includes("ship")) return "fastest_shipping";
  if (s.includes("deal")) return "best_deal";
  return "best_value";
}

function coerceCondition(val: unknown): string {
  const s = String(val ?? "any").toLowerCase();
  if (["new", "used", "refurbished", "any"].includes(s)) return s;
  if (s.includes("refurb")) return "refurbished";
  if (s.includes("used") || s.includes("pre")) return "used";
  if (s.includes("new")) return "new";
  return "any";
}

function coerceConstraints(val: unknown): Record<string, string | null> {
  if (!val || typeof val !== "object") return {};
  if (Array.isArray(val)) {
    const out: Record<string, string | null> = {};
    for (const item of val) {
      if (typeof item === "string") out[item] = null;
      else if (item && typeof item === "object") {
        const o = item as Record<string, unknown>;
        const key = String(o.name ?? o.key ?? "");
        if (key) out[key] = o.value == null ? null : String(o.value);
      }
    }
    return out;
  }
  const out: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
    out[k] = v == null ? null : String(v);
  }
  return out;
}

/** Dynamic product requirements — tolerant of messy LLM JSON */
export const ProductRequirementsSchema = z.preprocess((raw) => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const o = raw as Record<string, unknown>;

  let specs = o.importantSpecifications ?? o.important_specs ?? o.specs;
  if (typeof specs === "string") specs = [specs];
  if (!Array.isArray(specs) || specs.length === 0) {
    specs = [{ name: "productMatch", importance: "high", description: null }];
  }

  let questions = o.clarifyingQuestions ?? o.clarifying_questions ?? [];
  if (typeof questions === "string") questions = [questions];
  if (!Array.isArray(questions)) questions = [];

  return {
    ...o,
    product: String(o.product ?? o.productName ?? "product"),
    category: String(o.category ?? "general"),
    goal: coerceGoal(o.goal),
    condition: coerceCondition(o.condition),
    importantSpecifications: specs,
    constraints: coerceConstraints(o.constraints),
    budgetMax:
      o.budgetMax == null || o.budgetMax === ""
        ? null
        : Number(o.budgetMax),
    budgetCurrency:
      o.budgetCurrency == null ? null : String(o.budgetCurrency),
    specificationExplanation: String(
      o.specificationExplanation ??
        o.explanation ??
        "Prioritizing the most relevant product attributes for this search.",
    ),
    isTooBroad: Boolean(o.isTooBroad),
    isNamedProduct: Boolean(
      o.isNamedProduct ?? o.is_named_product ?? o.namedProduct,
    ),
    clarifyingQuestions: (questions as unknown[])
      .map((q) => String(q))
      .slice(0, 4),
  };
}, z.object({
  product: z.string(),
  category: z.string(),
  goal: z.enum(["lowest_price", "best_value", "best_deal", "fastest_shipping"]),
  condition: z.enum(["new", "used", "refurbished", "any"]),
  importantSpecifications: z.array(ImportantSpecificationSchema).min(1),
  constraints: z.record(z.string(), z.string().nullable()),
  budgetMax: z.number().nullable(),
  budgetCurrency: z.string().nullable(),
  specificationExplanation: z.string(),
  isTooBroad: z.boolean(),
  /** Named SKU/model query → skip specs form, run marketplace price race */
  isNamedProduct: z.boolean().default(false),
  clarifyingQuestions: z.array(z.string()).max(4),
}));

export type ProductRequirements = z.infer<typeof ProductRequirementsSchema>;

export const SearchPlanSchema = z.object({
  queries: z.array(z.string()).min(3).max(6),
  rationale: z.string(),
});

export type SearchPlan = z.infer<typeof SearchPlanSchema>;

export const SourcePlanSchema = z.object({
  productCategory: z.string(),
  selectedRetailerIds: z.array(z.string()).min(2).max(12),
  extraSources: z
    .array(
      z.object({
        name: z.string(),
        domain: z.string(),
        searchUrlTemplate: z.string(),
        reason: z.string(),
        shipsToUserCountry: z.boolean().nullable(),
      }),
    )
    .max(8),
  rationale: z.string(),
  locationNotes: z.string(),
});

export type SourcePlan = z.infer<typeof SourcePlanSchema>;

export const RetailerCategorySchema = z.enum([
  "major_retailer",
  "manufacturer",
  "specialized",
  "marketplace",
  "smaller_retailer",
  "search_aggregator",
  "local_regional",
]);

export type RetailerCategory = z.infer<typeof RetailerCategorySchema>;

export const RetailerSourceSchema = z.object({
  id: z.string(),
  name: z.string(),
  domain: z.string(),
  category: RetailerCategorySchema,
  searchUrlTemplate: z.string(),
  enabled: z.boolean(),
  markets: z
    .array(z.string())
    .optional()
    .describe("ISO country codes this source primarily serves, empty = global"),
});

export type RetailerSource = z.infer<typeof RetailerSourceSchema>;

export const DataAvailabilitySchema = z.enum(["known", "estimated", "unknown"]);

export const ProductListingSchema = z.object({
  productName: z.string().nullable(),
  brand: z.string().nullable(),
  model: z.string().nullable(),
  modelNumber: z.string().nullable(),
  price: z.number().nullable(),
  currency: z.string().nullable(),
  condition: z.string().nullable(),
  availability: z.string().nullable(),
  retailer: z.string().nullable(),
  url: z.string().nullable(),
  description: z.string().nullable(),
  imageUrl: z.string().nullable(),
  /** Dynamic category-specific specs — not a fixed schema */
  specifications: z.record(z.string(), z.string().nullable()),
  shippingPrice: z.number().nullable(),
  shippingInformation: z.string().nullable(),
  shipsToUserLocation: z.boolean().nullable(),
  shippingAvailability: DataAvailabilitySchema,
  knownMandatoryFees: z.number().nullable(),
  /** Marketplace fields */
  isMarketplace: z.boolean(),
  marketplaceName: z.string().nullable(),
  sellerName: z.string().nullable(),
  sellerRating: z.string().nullable(),
  sellerReviewCount: z.number().nullable(),
  fulfillment: z.string().nullable(),
  returnInformation: z.string().nullable(),
  sourceRetrievedAt: z.string().nullable(),
});

export type ProductListing = z.infer<typeof ProductListingSchema>;

export const ExtractedProductsSchema = z.object({
  listings: z.array(ProductListingSchema),
  sourceNotes: z.string().nullable(),
});

export type ExtractedProducts = z.infer<typeof ExtractedProductsSchema>;

export const MatchStatusSchema = z.enum([
  "exact",
  "strong",
  "possible",
  "different",
  "unknown",
]);

export const AttributeMatchSchema = z.object({
  name: z.string(),
  status: z.enum(["match", "mismatch", "unknown"]),
});

export const ProductMatchSchema = z.object({
  matchStatus: MatchStatusSchema,
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  attributeMatches: z.array(AttributeMatchSchema),
  mismatchedAttributes: z.array(z.string()),
});

export type ProductMatch = z.infer<typeof ProductMatchSchema>;

export const RetailerConfidenceLevelSchema = z.enum([
  "high",
  "medium",
  "limited",
  "insufficient_information",
]);

export const ConfidenceSignalSchema = z.object({
  label: z.string(),
  polarity: z.enum(["positive", "warning", "negative"]),
  evidence: z.string(),
});

export const RetailerEvaluationSchema = z.object({
  retailerConfidence: RetailerConfidenceLevelSchema,
  reasoning: z.string(),
  signals: z.array(ConfidenceSignalSchema),
  /** Marketplace seller evaluation (null if not a marketplace listing) */
  sellerConfidence: RetailerConfidenceLevelSchema.nullable(),
  sellerReasoning: z.string().nullable(),
  sellerSignals: z.array(ConfidenceSignalSchema),
});

export type RetailerEvaluation = z.infer<typeof RetailerEvaluationSchema>;

export const EffectivePriceSchema = z.object({
  productPrice: z.number().nullable(),
  shippingPrice: z.number().nullable(),
  knownMandatoryFees: z.number().nullable(),
  effectivePrice: z.number().nullable(),
  calculationComplete: z.boolean(),
  shippingAvailability: DataAvailabilitySchema,
  shipsToUserLocation: z.boolean().nullable(),
  currency: z.string().nullable(),
  notes: z.string(),
});

export type EffectivePrice = z.infer<typeof EffectivePriceSchema>;

export const PriceEvidenceSchema = z.object({
  source: z.string(),
  retailer: z.string().nullable(),
  product: z.string().nullable(),
  price: z.number().nullable(),
  currency: z.string().nullable(),
  retrievedAt: z.string(),
  url: z.string().nullable(),
  disclaimer: z.string(),
});

export type PriceEvidence = z.infer<typeof PriceEvidenceSchema>;

export const RankedDealSchema = z.object({
  id: z.string(),
  listing: ProductListingSchema,
  match: ProductMatchSchema,
  retailerEvaluation: RetailerEvaluationSchema,
  pricing: EffectivePriceSchema,
  dealScore: z.number(),
  scoreBreakdown: z.object({
    productMatch: z.number(),
    effectivePrice: z.number(),
    retailerConfidence: z.number(),
    reviews: z.number().default(0),
    localAffinity: z.number().default(0.5),
    availability: z.number(),
    dataCompleteness: z.number(),
  }),
  rankReason: z.string(),
  priceEvidence: PriceEvidenceSchema,
  excludedReason: z.string().nullable(),
});

export type RankedDeal = z.infer<typeof RankedDealSchema>;

export const SearchCoverageSchema = z.object({
  sourcesChecked: z.number(),
  listingsAnalyzed: z.number(),
  matchingListings: z.number(),
  excludedAsDifferent: z.number(),
  excludedNoShip: z.number(),
  failedSources: z.number(),
});

export type SearchCoverage = z.infer<typeof SearchCoverageSchema>;

export const SearchDebugSchema = z.object({
  userRequest: z.string(),
  location: ShoppingLocationSchema.nullable(),
  productRequirements: ProductRequirementsSchema.nullable(),
  searchPlan: SearchPlanSchema.nullable(),
  sourcePlan: SourcePlanSchema.nullable(),
  retailers: z.array(RetailerSourceSchema),
  rawRetrievals: z.array(
    z.object({
      source: z.string(),
      url: z.string().nullable(),
      query: z.string().nullable(),
      success: z.boolean(),
      error: z.string().nullable(),
      contentPreview: z.string().nullable(),
      contentLength: z.number(),
    }),
  ),
  extractedProducts: z.array(ProductListingSchema),
  matches: z.array(z.object({ listingId: z.string(), match: ProductMatchSchema })),
  retailerEvaluations: z.array(
    z.object({ listingId: z.string(), evaluation: RetailerEvaluationSchema }),
  ),
  pricing: z.array(z.object({ listingId: z.string(), pricing: EffectivePriceSchema })),
  ranking: z.array(RankedDealSchema),
  errors: z.array(z.string()),
  stageTimingsMs: z.record(z.string(), z.number()),
});

export type SearchDebug = z.infer<typeof SearchDebugSchema>;

export const SearchResultSchema = z.object({
  disclaimer: z.string(),
  needsClarification: z.boolean().optional(),
  clarifyingQuestions: z.array(z.string()).optional(),
  productRequirements: ProductRequirementsSchema.nullable().optional(),
  specificationExplanation: z.string().nullable().optional(),
  recommendedDeal: RankedDealSchema.nullable(),
  lowestPriceDeal: RankedDealSchema.nullable(),
  otherOptions: z.array(RankedDealSchema),
  coverage: SearchCoverageSchema.nullable().optional(),
  location: ShoppingLocationSchema.nullable().optional(),
  /** @deprecated use recommendedDeal */
  bestDeal: RankedDealSchema.nullable().optional(),
  error: z.string().nullable(),
  debug: SearchDebugSchema.optional(),
});

export type SearchResult = z.infer<typeof SearchResultSchema>;

/** Legacy alias used during migration */
export type ParsedRequest = ProductRequirements;
