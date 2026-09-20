import type { ProductRequirements, ShoppingLocation } from "@/lib/schemas";

type SpecDef = {
  name: string;
  description: string;
  importance: "high" | "medium" | "low";
};

type CategoryProfile = {
  match: RegExp;
  category: string;
  productLabel: string;
  specs: SpecDef[];
};

const PROFILES: CategoryProfile[] = [
  {
    match:
      /\b(laptop|notebook|macbook|chromebook|thinkpad|zenbook|xps|vivobook|ideapad|matebook)\b/i,
    category: "computers",
    productLabel: "laptop",
    specs: [
      { name: "RAM", description: "e.g. 16GB", importance: "high" },
      { name: "Storage", description: "e.g. 512GB SSD", importance: "high" },
      { name: "Processor", description: "e.g. Ryzen 7, M3, Ultra 7", importance: "medium" },
      { name: "Screen size", description: "e.g. 14 inch", importance: "low" },
    ],
  },
  {
    match: /\b(gpu|graphics card|rtx|gtx|radeon|rx\s*\d{4})\b/i,
    category: "computers",
    productLabel: "graphics card",
    specs: [
      { name: "GPU model", description: "e.g. RTX 4070", importance: "high" },
      { name: "VRAM", description: "e.g. 12GB", importance: "medium" },
    ],
  },
  {
    match:
      /\b(phone|iphone|pixel|galaxy|smartphone|oneplus|xiaomi|motorola|nothing phone)\b/i,
    category: "electronics",
    productLabel: "smartphone",
    specs: [
      { name: "Storage", description: "e.g. 256GB", importance: "high" },
      { name: "Carrier", description: "Unlocked or carrier", importance: "medium" },
      { name: "Color", description: "Optional", importance: "low" },
    ],
  },
  {
    // Sony WH/WF/MDR series + general headphone words
    match:
      /\b(headphone|headset|earbuds?|airpods|iem|wh-|wf-|linkbuds|mdr-|sony.*xm\d|xm\d.*headphone|over.?ear|in.?ear|true.?wireless)\b/i,
    category: "audio",
    productLabel: "headphones",
    specs: [
      { name: "Type", description: "Over-ear / in-ear / wireless", importance: "medium" },
      { name: "Noise cancelling", description: "Required / preferred / not needed", importance: "low" },
    ],
  },
  {
    match: /\b(speaker|soundbar|subwoofer|boombox)\b/i,
    category: "audio",
    productLabel: "speaker",
    specs: [
      { name: "Type", description: "Portable / soundbar / bookshelf", importance: "medium" },
      { name: "Connectivity", description: "Bluetooth / WiFi / wired", importance: "low" },
    ],
  },
  {
    match: /\b(shoe|sneaker|trainer|boot|jordan|yeezy|dunk|air\s*force|new balance)\b/i,
    category: "footwear",
    productLabel: "shoes",
    specs: [
      { name: "Size", description: "Your size", importance: "high" },
      { name: "Colorway", description: "Optional", importance: "low" },
    ],
  },
  {
    match: /\b(bag|backpack|tote|duffel|luggage|suitcase|briefcase)\b/i,
    category: "bags",
    productLabel: "bag",
    specs: [
      { name: "Capacity", description: "e.g. 20L, carry-on", importance: "medium" },
      { name: "Color", description: "Optional", importance: "low" },
      { name: "Material", description: "e.g. nylon, leather", importance: "low" },
    ],
  },
  {
    match: /\b(monitor|display|ultrawide|curved screen)\b/i,
    category: "computers",
    productLabel: "monitor",
    specs: [
      { name: "Screen size", description: "e.g. 27 inch", importance: "high" },
      { name: "Resolution", description: "1080p / 1440p / 4K", importance: "medium" },
      { name: "Refresh rate", description: "e.g. 144Hz", importance: "low" },
    ],
  },
  {
    match: /\b(tv|television|oled|qled|4k tv)\b/i,
    category: "electronics",
    productLabel: "television",
    specs: [
      { name: "Screen size", description: "e.g. 55 inch", importance: "high" },
      { name: "Panel type", description: "OLED / QLED / LED", importance: "medium" },
    ],
  },
  {
    match: /\b(camera|mirrorless|dslr|gopro|action cam)\b/i,
    category: "electronics",
    productLabel: "camera",
    specs: [
      { name: "Camera type", description: "Mirrorless / DSLR / action", importance: "medium" },
      { name: "Resolution", description: "e.g. 24MP", importance: "low" },
    ],
  },
  {
    match: /\b(watch|smartwatch|apple watch|garmin|fitbit)\b/i,
    category: "wearables",
    productLabel: "watch",
    specs: [
      { name: "Case size", description: "e.g. 42mm", importance: "medium" },
      { name: "Connectivity", description: "GPS or cellular", importance: "low" },
    ],
  },
  {
    match: /\b(keyboard|mechanical keyboard|gaming keyboard)\b/i,
    category: "computers",
    productLabel: "keyboard",
    specs: [
      { name: "Switch type", description: "e.g. Cherry MX Red, Brown", importance: "medium" },
      { name: "Layout", description: "TKL / Full / 60%", importance: "low" },
    ],
  },
  {
    match: /\b(mouse|gaming mouse)\b/i,
    category: "computers",
    productLabel: "mouse",
    specs: [
      { name: "DPI", description: "e.g. 16000 DPI", importance: "medium" },
      { name: "Wireless", description: "Wired or wireless", importance: "low" },
    ],
  },
  {
    match: /\b(controller|gamepad|joystick|dualsense|dualshock|xbox controller)\b/i,
    category: "gaming",
    productLabel: "controller",
    specs: [
      { name: "Platform", description: "PS5 / Xbox / PC", importance: "high" },
      { name: "Color", description: "Optional", importance: "low" },
    ],
  },
  {
    match: /\b(console|ps5|playstation|xbox|nintendo|switch)\b/i,
    category: "gaming",
    productLabel: "gaming console",
    specs: [
      { name: "Model", description: "e.g. PS5 Slim, Xbox Series X", importance: "high" },
      { name: "Bundle", description: "Console only or with games", importance: "low" },
    ],
  },
];

const GENERIC: SpecDef[] = [
  { name: "Brand", description: "Preferred brand if any", importance: "low" },
  { name: "Model", description: "Model or variant if you know it", importance: "medium" },
  { name: "Size", description: "If applicable", importance: "medium" },
  { name: "Color", description: "Optional", importance: "low" },
];

/** Strip common search preambles so we get the actual product name */
function cleanQuery(raw: string): string {
  return raw
    .trim()
    .replace(
      /^(find\s+me|find|get\s+me|get|show\s+me|look\s+for|search\s+for|i\s+want|i\s+need|help\s+me\s+find|buy|purchase)\s+/i,
      "",
    )
    .replace(
      /^(the\s+)?(best|cheapest|cheapest|lowest|good|great|top)\s+(deal\s+on|deals?\s+on|price\s+for|price\s+on|price\s+of|priced?\s+)?\s*/i,
      "",
    )
    .replace(/^(what is|what'?s)\s+(the\s+)?(best|cheapest)?\s+(deal|price)\s+(on|for)\s+/i, "")
    .trim();
}

function extractBudget(q: string): number | null {
  const m =
    q.match(/(?:under|below|max|budget|less than)\s*\$?\s*([\d,]+)/i) ||
    q.match(/\$\s*([\d,]+)/);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function extractBrand(q: string): string | null {
  return (
    q.match(
      /\b(apple|sony|samsung|bose|jbl|jabra|sennheiser|audio.technica|anker|soundcore|nike|adidas|lenovo|asus|acer|dell|hp|msi|logitech|razer|corsair|steelseries|canon|nikon|fujifilm|lg|microsoft|google|dyson|philips|cuisinart)\b/i,
    )?.[1] ?? null
  );
}

function currencyFor(location: ShoppingLocation): string {
  const code = location.countryCode.toUpperCase();
  if (code === "PH") return "PHP";
  if (code === "GB") return "GBP";
  if (code === "AU") return "AUD";
  if (code === "CA") return "CAD";
  if (code === "JP") return "JPY";
  if (["DE", "FR", "ES", "IT", "NL"].includes(code)) return "EUR";
  return "USD";
}

function goalFromQuery(q: string): ProductRequirements["goal"] {
  if (/\b(cheap|cheapest|lowest|budget|under\s*\$)\b/i.test(q)) return "lowest_price";
  if (/\b(fast|quick|ship|asap|delivery)\b/i.test(q)) return "fastest_shipping";
  if (/\b(deal|value|worth)\b/i.test(q)) return "best_deal";
  return "best_value";
}

const BROAD_ONLY =
  /^(laptops?|notebooks?|phones?|smartphones?|headphones?|earbuds?|speakers?|monitors?|tvs?|televisions?|cameras?|shoes?|sneakers?|bags?|keyboards?|mice|mouses?|controllers?|consoles?|watches?|products?)$/i;

/**
 * Named SKU / model query → marketplace price race (skip specs form).
 * Examples: "Logitech K580 Slim", "Sony WH-1000XM6", "MacBook Air M5"
 */
export function isNamedProductQuery(raw: string): boolean {
  const q = cleanQuery(raw.trim()) || raw.trim();
  if (!q || q.length < 4) return false;
  const words = q.split(/\s+/).filter(Boolean);
  if (words.length === 1 && BROAD_ONLY.test(words[0]!)) return false;
  if (words.length <= 2 && BROAD_ONLY.test(q)) return false;

  const brand = extractBrand(q);
  const hasModelId = words.some(
    (w) =>
      /\d/.test(w) &&
      !/^\d+(gb|tb|mm|hz|inch|in|w|mah|mp)?$/i.test(w) &&
      w.replace(/[^a-z0-9]/gi, "").length >= 2,
  );
  // Brand + model id (Logitech K580), or 3+ words with brand, or model id + 2+ words
  if (brand && hasModelId) return true;
  if (brand && words.length >= 3) return true;
  if (hasModelId && words.length >= 2) return true;
  // Well-known product lines without digits in the cleaned form
  if (
    /\b(airpods|macbook|iphone|ipad|pixel|galaxy\s*s\d|wh-?\d|wf-?\d|dualsense|xbox\s*series)\b/i.test(
      q,
    )
  ) {
    return true;
  }
  return false;
}

/**
 * Instant product understanding — no LLM, < 1ms.
 * Returns requirements to show the spec-confirm form immediately
 * (or skip it for named products).
 */
export function fastUnderstandProduct(
  userRequest: string,
  location: ShoppingLocation,
): ProductRequirements {
  const raw = userRequest.trim() || "product";
  const cleaned = cleanQuery(raw); // e.g. "Sony WH-1000XM6"
  const q = cleaned || raw;
  const named = isNamedProductQuery(raw);

  const profile =
    PROFILES.find((p) => p.match.test(q)) ??
    ({
      match: /.*/,
      category: "general",
      productLabel: "product",
      specs: GENERIC,
    } satisfies CategoryProfile);

  const constraints: Record<string, string | null> = {};
  const brand = extractBrand(q);
  if (brand) constraints.Brand = brand;

  const condition: ProductRequirements["condition"] =
    /\b(used|second[\s-]?hand|pre[\s-]?owned)\b/i.test(q)
      ? "used"
      : /\b(refurb)/i.test(q)
        ? "refurbished"
        : /\b(new)\b/i.test(q)
          ? "new"
          : "any";

  // Use the cleaned query (e.g. "Sony WH-1000XM6") as product name
  // Fall back to "brand productLabel" only if the cleaned query is too long or empty
  const product =
    q.length > 0 && q.length <= 80
      ? q
      : brand
        ? `${brand} ${profile.productLabel}`
        : profile.productLabel;

  // Named products: identity is enough — no empty RAM/storage checklist
  const specs: SpecDef[] = named
    ? [
        {
          name: "Product match",
          description: "Exact model / SKU across retailers",
          importance: "high",
        },
        {
          name: "Condition",
          description: "New / used / refurbished",
          importance: "low",
        },
      ]
    : profile.specs;

  const clarifyingQuestions = named
    ? []
    : specs
        .filter((s) => s.importance === "high" && !constraints[s.name])
        .slice(0, 4)
        .map((s) => `What ${s.name.toLowerCase()} do you need?`);

  const isTooBroad =
    !named &&
    q.split(/\s+/).length <= 2 &&
    !brand &&
    profile.category === "general";

  return {
    product,
    category: profile.category,
    goal: named ? "lowest_price" : goalFromQuery(q),
    condition,
    importantSpecifications: specs,
    constraints,
    budgetMax: extractBudget(q),
    budgetCurrency: currencyFor(location),
    specificationExplanation: named
      ? `Searching marketplaces for ${product} in ${location.country} — comparing prices across retailers.`
      : `Looking for ${product} in ${location.country}. Confirm the specs below so we search the right listings.`,
    isTooBroad,
    isNamedProduct: named,
    clarifyingQuestions,
  };
}
