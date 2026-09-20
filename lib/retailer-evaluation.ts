/**
 * Retailer + marketplace seller confidence — heuristic only (saves Gemini quota).
 */

import { RETAILER_SOURCES } from "@/lib/retailers";
import type {
  ProductListing,
  RetailerEvaluation,
  ShoppingLocation,
} from "@/lib/schemas";

const WELL_KNOWN = new Set(
  RETAILER_SOURCES.map((r) => r.domain.replace(/^www\./, "")),
);

function domainFromUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

const DOMAIN_BY_NAME = new Map(
  RETAILER_SOURCES.map((r) => [r.name.toLowerCase(), r.domain.replace(/^www\./, "")] as const),
);

function heuristicBaseline(listing: ProductListing): RetailerEvaluation {
  // Fall back to the catalog domain when the listing came from a known store
  // but the scraped page didn't give us an absolute product URL.
  const domain =
    domainFromUrl(listing.url) ??
    DOMAIN_BY_NAME.get((listing.retailer ?? "").toLowerCase()) ??
    null;
  const signals: RetailerEvaluation["signals"] = [];

  if (domain && WELL_KNOWN.has(domain)) {
    signals.push({
      label: "Established catalog retailer",
      polarity: "positive",
      evidence: `Domain ${domain} is in DealHunter's known source catalog.`,
    });
    if (listing.returnInformation) {
      signals.push({
        label: "Return information present",
        polarity: "positive",
        evidence: listing.returnInformation.slice(0, 120),
      });
    }
    return {
      retailerConfidence: "high",
      reasoning:
        "Established retailer domain in the source catalog. Risk assessment only — not a guarantee.",
      signals,
      sellerConfidence: listing.isMarketplace ? "medium" : null,
      sellerReasoning: listing.isMarketplace
        ? listing.sellerName
          ? `Marketplace seller: ${listing.sellerName}`
          : "Marketplace listing — seller details limited."
        : null,
      sellerSignals: listing.isMarketplace
        ? [
            {
              label: listing.sellerRating
                ? `Seller rating: ${listing.sellerRating}`
                : "Marketplace listing",
              polarity: listing.sellerRating ? "positive" : "warning",
              evidence: listing.sellerName ?? "Seller not fully identified",
            },
          ]
        : [],
    };
  }

  if (!domain) {
    return {
      retailerConfidence: "insufficient_information",
      reasoning: "No reliable domain available.",
      signals: [
        {
          label: "Missing URL",
          polarity: "negative",
          evidence: "Listing has no domain to assess.",
        },
      ],
      sellerConfidence: null,
      sellerReasoning: null,
      sellerSignals: [],
    };
  }

  signals.push({
    label: "Observed domain",
    polarity: "positive",
    evidence: domain,
  });

  return {
    retailerConfidence: "medium",
    reasoning:
      "Domain not in built-in catalog — treat with extra caution until more signals reviewed.",
    signals,
    sellerConfidence: listing.isMarketplace ? "limited" : null,
    sellerReasoning: listing.isMarketplace
      ? "Limited seller information from heuristics."
      : null,
    sellerSignals: [],
  };
}

export async function evaluateListingRetailer(input: {
  listing: ProductListing;
  pageContentPreview?: string;
  location: ShoppingLocation;
}): Promise<RetailerEvaluation> {
  void input.pageContentPreview;
  void input.location;
  return heuristicBaseline(input.listing);
}
