/**
 * Flexible retailer catalog + location-aware resolution.
 * AI selects per request — not one universal path.
 */

import type { RetailerSource, ShoppingLocation } from "@/lib/schemas";

function encodeQuery(q: string): string {
  return encodeURIComponent(q);
}

export function buildSearchUrl(
  source: Pick<RetailerSource, "searchUrlTemplate">,
  query: string,
): string {
  return source.searchUrlTemplate.replace("{query}", encodeQuery(query));
}

export const RETAILER_SOURCES: RetailerSource[] = [
  // Global / major
  {
    id: "amazon",
    name: "Amazon",
    domain: "amazon.com",
    category: "marketplace",
    searchUrlTemplate: "https://www.amazon.com/s?k={query}",
    enabled: true,
    markets: ["US"],
  },
  {
    id: "amazon_uk",
    name: "Amazon UK",
    domain: "amazon.co.uk",
    category: "marketplace",
    searchUrlTemplate: "https://www.amazon.co.uk/s?k={query}",
    enabled: true,
    markets: ["GB"],
  },
  {
    id: "amazon_sg",
    name: "Amazon SG",
    domain: "amazon.sg",
    category: "marketplace",
    searchUrlTemplate: "https://www.amazon.sg/s?k={query}",
    enabled: true,
    markets: ["SG"],
  },
  {
    id: "amazon_jp",
    name: "Amazon JP",
    domain: "amazon.co.jp",
    category: "marketplace",
    searchUrlTemplate: "https://www.amazon.co.jp/s?k={query}",
    enabled: true,
    markets: ["JP"],
  },
  {
    id: "rakuten_jp",
    name: "Rakuten",
    domain: "rakuten.co.jp",
    category: "marketplace",
    searchUrlTemplate: "https://search.rakuten.co.jp/search/mall/{query}/",
    enabled: true,
    markets: ["JP"],
  },
  {
    id: "yahoo_shopping_jp",
    name: "Yahoo Shopping JP",
    domain: "shopping.yahoo.co.jp",
    category: "marketplace",
    searchUrlTemplate:
      "https://shopping.yahoo.co.jp/search?p={query}",
    enabled: true,
    markets: ["JP"],
  },
  {
    id: "biccamera",
    name: "Bic Camera",
    domain: "biccamera.com",
    category: "local_regional",
    searchUrlTemplate: "https://www.biccamera.com/bc/i/products/?q={query}",
    enabled: true,
    markets: ["JP"],
  },
  {
    id: "yodobashi",
    name: "Yodobashi",
    domain: "yodobashi.com",
    category: "local_regional",
    searchUrlTemplate:
      "https://www.yodobashi.com/category/999999999999999999/?word={query}",
    enabled: true,
    markets: ["JP"],
  },
  {
    id: "kakaku",
    name: "Kakaku.com",
    domain: "kakaku.com",
    category: "specialized",
    searchUrlTemplate: "https://kakaku.com/search_results/{query}/",
    enabled: true,
    markets: ["JP"],
  },
  {
    id: "ebay",
    name: "eBay",
    domain: "ebay.com",
    category: "marketplace",
    searchUrlTemplate: "https://www.ebay.com/sch/i.html?_nkw={query}&LH_BIN=1",
    enabled: true,
    markets: ["US", "GB", "AU", "CA"],
  },
  {
    id: "walmart",
    name: "Walmart",
    domain: "walmart.com",
    category: "major_retailer",
    searchUrlTemplate: "https://www.walmart.com/search?q={query}",
    enabled: true,
    markets: ["US"],
  },
  {
    id: "target",
    name: "Target",
    domain: "target.com",
    category: "major_retailer",
    searchUrlTemplate: "https://www.target.com/s?searchTerm={query}",
    enabled: true,
    markets: ["US"],
  },
  {
    id: "bestbuy",
    name: "Best Buy",
    domain: "bestbuy.com",
    category: "major_retailer",
    searchUrlTemplate: "https://www.bestbuy.com/site/searchpage.jsp?st={query}",
    enabled: true,
    markets: ["US", "CA"],
  },
  {
    id: "costco",
    name: "Costco",
    domain: "costco.com",
    category: "major_retailer",
    searchUrlTemplate: "https://www.costco.com/CatalogSearch?keyword={query}",
    enabled: true,
    markets: ["US"],
  },
  // Indonesia
  {
    id: "tokopedia",
    name: "Tokopedia",
    domain: "tokopedia.com",
    category: "marketplace",
    searchUrlTemplate:
      "https://www.google.com/search?q=site:tokopedia.com+{query}&hl=id&gl=id",
    enabled: true,
    markets: ["ID"],
  },
  {
    id: "shopee_id",
    name: "Shopee Indonesia",
    domain: "shopee.co.id",
    category: "marketplace",
    searchUrlTemplate:
      "https://www.google.com/search?q=site:shopee.co.id+{query}&hl=id&gl=id",
    enabled: true,
    markets: ["ID"],
  },
  {
    id: "lazada_id",
    name: "Lazada Indonesia",
    domain: "www.lazada.co.id",
    category: "marketplace",
    searchUrlTemplate: "https://www.lazada.co.id/catalog/?q={query}",
    enabled: true,
    markets: ["ID"],
  },
  {
    id: "zalora_id",
    name: "Zalora Indonesia",
    domain: "www.zalora.co.id",
    category: "specialized",
    searchUrlTemplate: "https://www.zalora.co.id/search?q={query}",
    enabled: true,
    markets: ["ID"],
  },
  {
    id: "blibli",
    name: "Blibli",
    domain: "www.blibli.com",
    category: "marketplace",
    searchUrlTemplate: "https://www.blibli.com/cari/{query}",
    enabled: true,
    markets: ["ID"],
  },
  // PH / SEA
  {
    id: "lazada_ph",
    name: "Lazada PH",
    domain: "lazada.com.ph",
    category: "marketplace",
    searchUrlTemplate: "https://www.lazada.com.ph/catalog/?q={query}",
    enabled: true,
    markets: ["PH"],
  },
  {
    id: "shopee_ph",
    name: "Shopee PH",
    domain: "shopee.ph",
    category: "marketplace",
    // Decodo blocks direct shopee.ph scrapes — use Google site search instead.
    searchUrlTemplate:
      "https://www.google.com/search?q=site:shopee.ph+{query}&hl=en&gl=ph",
    enabled: true,
    markets: ["PH"],
  },
  {
    id: "kimstore",
    name: "Kimstore",
    domain: "kimstore.com",
    category: "local_regional",
    searchUrlTemplate: "https://www.kimstore.com/search?q={query}",
    enabled: true,
    markets: ["PH"],
  },
  {
    id: "gameone_ph",
    name: "Game One PH",
    domain: "gameone.ph",
    category: "local_regional",
    searchUrlTemplate: "https://gameone.ph/catalogsearch/result/?q={query}",
    enabled: true,
    markets: ["PH"],
  },
  {
    id: "datablitz",
    name: "Datablitz",
    domain: "datablitz.com.ph",
    category: "local_regional",
    searchUrlTemplate: "https://www.datablitz.com.ph/search?q={query}",
    enabled: true,
    markets: ["PH"],
  },
  {
    id: "ubuy_ph",
    name: "Ubuy PH",
    domain: "ubuy.com.ph",
    category: "marketplace",
    searchUrlTemplate: "https://www.ubuy.com.ph/search/?q={query}",
    enabled: true,
    markets: ["PH"],
  },
  {
    id: "gilmore",
    name: "Gilmore IT",
    domain: "gilmore.com.ph",
    category: "local_regional",
    searchUrlTemplate: "https://www.google.com/search?q=site:gilmore.com.ph+{query}",
    enabled: true,
    markets: ["PH"],
  },
  // UK
  {
    id: "currys",
    name: "Currys",
    domain: "currys.co.uk",
    category: "major_retailer",
    searchUrlTemplate: "https://www.currys.co.uk/search?q={query}",
    enabled: true,
    markets: ["GB"],
  },
  {
    id: "johnlewis",
    name: "John Lewis",
    domain: "johnlewis.com",
    category: "major_retailer",
    searchUrlTemplate: "https://www.johnlewis.com/search?search-term={query}",
    enabled: true,
    markets: ["GB"],
  },
  // Specialty / category
  {
    id: "bhphoto",
    name: "B&H Photo",
    domain: "bhphotovideo.com",
    category: "specialized",
    searchUrlTemplate: "https://www.bhphotovideo.com/c/search?Ntt={query}",
    enabled: true,
    markets: ["US"],
  },
  {
    id: "newegg",
    name: "Newegg",
    domain: "newegg.com",
    category: "specialized",
    searchUrlTemplate: "https://www.newegg.com/p/pl?d={query}",
    enabled: true,
    markets: ["US"],
  },
  {
    id: "zappos",
    name: "Zappos",
    domain: "zappos.com",
    category: "specialized",
    searchUrlTemplate: "https://www.zappos.com/search?term={query}",
    enabled: true,
    markets: ["US"],
  },
  {
    id: "nordstrom",
    name: "Nordstrom",
    domain: "nordstrom.com",
    category: "major_retailer",
    searchUrlTemplate: "https://www.nordstrom.com/sr?keyword={query}",
    enabled: true,
    markets: ["US"],
  },
  {
    id: "etsy",
    name: "Etsy",
    domain: "etsy.com",
    category: "marketplace",
    searchUrlTemplate: "https://www.etsy.com/search?q={query}",
    enabled: true,
    markets: [],
  },
  {
    id: "rei",
    name: "REI",
    domain: "rei.com",
    category: "specialized",
    searchUrlTemplate: "https://www.rei.com/search?q={query}",
    enabled: true,
    markets: ["US"],
  },
  {
    id: "sephora",
    name: "Sephora",
    domain: "sephora.com",
    category: "specialized",
    searchUrlTemplate: "https://www.sephora.com/search?keyword={query}",
    enabled: true,
    markets: ["US"],
  },
  {
    id: "homedepot",
    name: "Home Depot",
    domain: "homedepot.com",
    category: "major_retailer",
    searchUrlTemplate: "https://www.homedepot.com/s/{query}",
    enabled: true,
    markets: ["US"],
  },
  {
    id: "ikea",
    name: "IKEA",
    domain: "ikea.com",
    category: "major_retailer",
    searchUrlTemplate: "https://www.ikea.com/us/en/search/?q={query}",
    enabled: true,
    markets: [],
  },
  {
    id: "apple",
    name: "Apple",
    domain: "apple.com",
    category: "manufacturer",
    searchUrlTemplate: "https://www.apple.com/us/search/{query}",
    enabled: true,
    markets: [],
  },
  {
    id: "sony",
    name: "Sony Store",
    domain: "electronics.sony.com",
    category: "manufacturer",
    searchUrlTemplate: "https://electronics.sony.com/search?query={query}",
    enabled: true,
    markets: ["US"],
  },
  {
    id: "nike",
    name: "Nike",
    domain: "nike.com",
    category: "manufacturer",
    searchUrlTemplate: "https://www.nike.com/w?q={query}",
    enabled: true,
    markets: [],
  },
  {
    id: "samsung",
    name: "Samsung",
    domain: "samsung.com",
    category: "manufacturer",
    searchUrlTemplate: "https://www.samsung.com/us/search/searchMain/?searchvalue={query}",
    enabled: true,
    markets: [],
  },
  {
    id: "stockx",
    name: "StockX",
    domain: "stockx.com",
    category: "marketplace",
    searchUrlTemplate: "https://stockx.com/search?s={query}",
    enabled: true,
    markets: [],
  },
];

export function getEnabledRetailers(): RetailerSource[] {
  return RETAILER_SOURCES.filter((r) => r.enabled);
}

export function catalogForLocation(location: ShoppingLocation): RetailerSource[] {
  const code = location.countryCode.toUpperCase();
  return getEnabledRetailers().filter((r) => {
    // Empty markets = global / specialty (usable anywhere)
    if (!r.markets || r.markets.length === 0) return true;
    // Strict: only stores that list this country — never bleed US/PH into JP
    return r.markets.includes(code);
  });
}

export function resolveSourcesFromPlan(input: {
  selectedRetailerIds: string[];
  extraSources?: Array<{
    name: string;
    domain: string;
    searchUrlTemplate: string;
  }>;
  location: ShoppingLocation;
  max?: number;
}): RetailerSource[] {
  const max = input.max ?? 10;
  const catalog = getEnabledRetailers();
  const byId = new Map(catalog.map((r) => [r.id, r] as const));
  const out: RetailerSource[] = [];
  const seen = new Set<string>();
  const code = input.location.countryCode.toUpperCase();

  const servesHere = (r: RetailerSource) =>
    !r.markets || r.markets.length === 0 || r.markets.includes(code);

  const push = (r: RetailerSource) => {
    if (!servesHere(r)) return;
    const d = r.domain.replace(/^www\./, "").toLowerCase();
    if (seen.has(d)) return;
    seen.add(d);
    out.push(r);
  };

  // 1) Country-local stores first (local_regional + market-tagged)
  const localFirst = catalog.filter(
    (r) =>
      r.markets?.includes(code) &&
      (r.category === "local_regional" ||
        r.category === "marketplace" ||
        r.category === "major_retailer"),
  );
  for (const r of localFirst) push(r);

  // 2) Country-specific Amazon sibling if any
  const amazonLocal: Record<string, string> = {
    US: "amazon",
    GB: "amazon_uk",
    SG: "amazon_sg",
    JP: "amazon_jp",
  };
  const amzId = amazonLocal[code];
  if (amzId) {
    const r = byId.get(amzId);
    if (r) push(r);
  }

  // 3) Global marketplaces only when they serve this country
  for (const id of ["ebay"]) {
    const r = byId.get(id);
    if (r) push(r);
  }

  // 4) AI / plan selections (still filtered by servesHere)
  for (const id of input.selectedRetailerIds) {
    if (out.length >= max) break;
    const r = byId.get(id);
    if (r) push(r);
  }

  for (const extra of input.extraSources ?? []) {
    if (out.length >= max) break;
    if (!extra.searchUrlTemplate.includes("{query}")) continue;
    const domain = extra.domain.replace(/^www\./, "").toLowerCase();
    // Reject extras that are clearly other-country locals
    if (
      /\.ph\b|lazada\.com\.ph|shopee\.ph|gameone\.ph|kimstore|datablitz/i.test(
        domain,
      ) &&
      code !== "PH"
    ) {
      continue;
    }
    if (/\.co\.jp|rakuten\.co\.jp|yodobashi|biccamera/i.test(domain) && code !== "JP") {
      continue;
    }
    if (
      /\.co\.id\b|tokopedia|blibli|zalora\.co\.id|shopee\.co\.id/i.test(domain) &&
      code !== "ID"
    ) {
      continue;
    }
    push({
      id: `extra-${domain.replace(/[^a-z0-9]+/g, "-")}`,
      name: extra.name,
      domain,
      category: "specialized",
      searchUrlTemplate: extra.searchUrlTemplate,
      enabled: true,
      markets: [code],
    });
  }

  return out.slice(0, max);
}

export function selectRetailersFallback(
  location: ShoppingLocation,
  max = 8,
): RetailerSource[] {
  return resolveSourcesFromPlan({
    selectedRetailerIds: catalogForLocation(location)
      .slice(0, max)
      .map((r) => r.id),
    location,
    max,
  });
}

export const DECODO_SEARCH_TEMPLATES: Record<
  string,
  "amazon_search" | "walmart_search" | "target_search"
> = {
  amazon: "amazon_search",
  walmart: "walmart_search",
  target: "target_search",
};
