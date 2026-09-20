/**
 * Product matching — heuristic-first, LLM-second.
 *
 * Strategy:
 *  1. Run fast heuristic match on every listing (< 1ms each, no API call).
 *  2. Only send listings with "unknown" heuristic status to the LLM batch.
 *  3. Merge results.
 */

import { matchProductsBatch } from "@/lib/gemini";
import type {
  ProductListing,
  ProductMatch,
  ProductRequirements,
} from "@/lib/schemas";

// ─── Heuristic matcher ────────────────────────────────────────────────────────

function normalise(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s\-]/g, " ").replace(/[\s\-]+/g, " ").trim();
}

/** Tokens including short model identifiers ("m5", "xm6", "2"). */
function tokens(s: string): string[] {
  return normalise(s).split(" ").filter(Boolean);
}

/** Tokens containing digits — model / generation / capacity identifiers. */
function modelTokens(ts: string[]): string[] {
  // Keep "m5", "xm6", "1000xm6", "k580", "15", "2"; drop capacity/unit specs like "16gb"
  return ts.filter((t) => /\d/.test(t) && !/^\d+(gb|tb|mm|hz|inch|in|w|mah|mp)$/.test(t));
}

/** Normalize model ids so k580 ≈ k-580 and conflicts with k380s / 80he vs 60he are visible. */
function modelKey(t: string): { family: string; num: string; raw: string } {
  const raw = t.toLowerCase().replace(/[^a-z0-9]/g, "");
  const m = raw.match(/^([a-z]*)(\d+)([a-z]*)$/);
  if (!m) return { family: raw, num: "", raw };
  // Prefer leading letters (k580, m5); else trailing (80he → he)
  const family = m[1] || m[3] || "";
  return { family, num: m[2]!, raw };
}

function modelsConflict(queryModels: string[], listingModels: string[]): string | null {
  if (!queryModels.length) return null;
  const lKeys = listingModels.map(modelKey);
  for (const qm of queryModels) {
    const qk = modelKey(qm);
    // Exact raw or same family+number present → OK for this token
    const exact = lKeys.some(
      (lk) =>
        lk.raw === qk.raw ||
        (qk.family && qk.num && lk.family === qk.family && lk.num === qk.num),
    );
    if (exact) continue;
    // Same letter family, different number → different product (k580 vs k380)
    const rival = lKeys.find(
      (lk) =>
        qk.family.length > 0 &&
        lk.family === qk.family &&
        qk.num &&
        lk.num &&
        lk.num !== qk.num,
    );
    if (rival) return `${qk.raw} vs ${rival.raw}`;

    // Bare numeric SKUs (5070 vs 5060, 60 vs 80) — empty family, different digits
    if (!qk.family && qk.num && qk.num.length >= 2) {
      const rivalBare = lKeys.find(
        (lk) =>
          !lk.family &&
          lk.num &&
          lk.num.length >= 2 &&
          lk.num !== qk.num,
      );
      if (rivalBare) return `${qk.raw} vs ${rivalBare.raw}`;
    }
  }
  return null;
}

/** Fraction of query tokens found in the listing text. */
function coverage(queryToks: string[], text: string): number {
  if (!queryToks.length) return 0;
  const set = new Set(tokens(text));
  const joined = text.toLowerCase().replace(/[^a-z0-9]/g, "");
  let hits = 0;
  for (const q of queryToks) {
    if (set.has(q) || (q.length >= 3 && joined.includes(q))) hits++;
  }
  return hits / queryToks.length;
}

const ACCESSORY =
  /\b(case|cover|sleeve|skin|screen ?protector|protector|adapter|charger|cable|dock|hub|stand|mount|strap|band|bag|pouch|setup|bundle|kit|tempered glass|stylus|ear ?tips|replacement|spare|voucher|promo|coupon|keycaps?|key ?caps?|plate|shaft|stem|module|switch(?:es)? only|foam|lube|stabilizers?|deskmat|desk mat|daughterboard|daughter board|wrist\s*rest|wristrest|elbow|pcb(?!\s*keyboard)|silicone|skin|skin\s*cover|skin\s*case)\b/i;

/** Phrases that mean "accessory for X", not X itself */
const ACCESSORY_FOR =
  /\b(compatible with|for\s+(?:the\s+)?(?:wooting|sony|logitech|apple|samsung|razer|corsair)|fits\s+(?:the\s+)?|replacement\s+for|parts?\s+for)\b/i;

/**
 * Heuristic product match — zero API calls.
 * Returns `null` when there isn't enough confidence for a reliable answer
 * (caller should fall back to the LLM).
 */
export function heuristicMatch(
  listing: ProductListing,
  requirements: ProductRequirements,
): ProductMatch | null {
  const name = `${listing.productName ?? ""} ${listing.description ?? ""}`.trim();
  const titleOnly = listing.productName ?? "";
  const qToks = tokens(requirements.product).filter(
    (t) => !["the", "and", "for", "with", "buy", "best", "cheap", "price", "deal", "new"].includes(t),
  );

  if (!titleOnly || titleOnly.length < 4) {
    return {
      matchStatus: "different",
      confidence: 0.8,
      reasoning: "Listing has no usable title.",
      attributeMatches: [],
      mismatchedAttributes: [],
    };
  }

  // Soft reject category / listing-hub pages
  if (
    /\b(shop .+ online|best discounts|results for|search results|browse products)\b/i.test(
      titleOnly,
    )
  ) {
    return {
      matchStatus: "different",
      confidence: 0.8,
      reasoning: "Category or search hub page — not a buyable product listing.",
      attributeMatches: [],
      mismatchedAttributes: [],
    };
  }

  // Accessories / bundles / promos are not the product (unless the user asked for one)
  if (
    (ACCESSORY.test(titleOnly) || ACCESSORY_FOR.test(titleOnly)) &&
    !ACCESSORY.test(requirements.product) &&
    !ACCESSORY_FOR.test(requirements.product)
  ) {
    return {
      matchStatus: "different",
      confidence: 0.85,
      reasoning: "Accessory, part, or 'compatible with' listing — not the requested product.",
      attributeMatches: [],
      mismatchedAttributes: [],
    };
  }

  // For electronics categories, a real unit usually says keyboard/headphones/…
  // Part listings often omit that and only mention the model in "for MODEL".
  const PRODUCT_CLASS =
    /\b(keyboards?|headphones?|earbuds?|laptops?|notebooks?|macbooks?|iphones?|phones?|mice|mouses?|monitors?|speakers?|consoles?|controllers?|cameras?|watches?|tablets?|ipads?|graphics?\s*cards?|gpus?|videocards?)\b/i;
  const cat = (requirements.category ?? "").toLowerCase();
  if (
    ["computers", "gaming", "electronics", "audio"].includes(cat) &&
    !PRODUCT_CLASS.test(requirements.product) &&
    !PRODUCT_CLASS.test(titleOnly) &&
    /\bfor\b/i.test(titleOnly)
  ) {
    return {
      matchStatus: "different",
      confidence: 0.8,
      reasoning: "Looks like a part/accessory 'for' the product, not the product itself.",
      attributeMatches: [],
      mismatchedAttributes: [],
    };
  }

  // Sold-out / unavailable — keep as different so they never win the race
  if (
    /\b(sold\s*out|out\s*of\s*stock|unavailable|currently unavailable|oos)\b/i.test(
      `${titleOnly} ${listing.availability ?? ""} ${listing.description ?? ""}`,
    )
  ) {
    return {
      matchStatus: "different",
      confidence: 0.9,
      reasoning: "Listing appears sold out / out of stock.",
      attributeMatches: [],
      mismatchedAttributes: [],
    };
  }

  const overlap = coverage(qToks, name);

  // Product-line words are mutually exclusive: "macbook air" ≠ "macbook pro",
  // "iphone 15" ≠ "iphone 15 pro max", "galaxy s24" ≠ "galaxy s24 ultra".
  const LINE_WORDS = ["air", "pro", "max", "mini", "plus", "ultra", "lite", "se", "fe", "neo", "studio"];
  const titleToks = new Set(tokens(titleOnly));
  const qLine = qToks.filter((t) => LINE_WORDS.includes(t));
  const lLine = LINE_WORDS.filter((w) => titleToks.has(w));
  if (qLine.length || lLine.length) {
    const missingLine = qLine.filter((w) => !titleToks.has(w));
    const extraLine = lLine.filter((w) => !qLine.includes(w));
    if (missingLine.length || extraLine.length) {
      return {
        matchStatus: "different",
        confidence: 0.85,
        reasoning: `Different product line: requested "${qLine.join(" ") || "base model"}", listing is "${lLine.join(" ") || "base model"}".`,
        attributeMatches: [],
        mismatchedAttributes: [...missingLine, ...extraLine],
      };
    }
  }

  // Model / generation identifiers must agree. "macbook air m5" vs "MacBook Air M4" → different.
  // Also "K580" vs "K380s".
  const qModel = modelTokens(qToks);
  const lModel = modelTokens(tokens(titleOnly));
  if (qModel.length) {
    const conflict = modelsConflict(qModel, lModel);
    if (conflict) {
      return {
        matchStatus: "different",
        confidence: 0.9,
        reasoning: `Different model/SKU: ${conflict}.`,
        attributeMatches: [],
        mismatchedAttributes: qModel,
      };
    }
    const missing = qModel.filter((m) => {
      const qk = modelKey(m);
      const inTokens = lModel.some((l) => {
        const lk = modelKey(l);
        return (
          lk.raw === qk.raw ||
          (qk.family && qk.num && lk.family === qk.family && lk.num === qk.num)
        );
      });
      const joined = titleOnly.toLowerCase().replace(/[^a-z0-9]/g, "");
      return !inTokens && !joined.includes(qk.raw);
    });
    if (missing.length) {
      // Listing advertises a different model id → hard reject (not "possible")
      if (lModel.length > 0) {
        return {
          matchStatus: "different",
          confidence: 0.9,
          reasoning: `Requested model "${missing.join(", ")}" not in title (found ${lModel.join(", ")} instead).`,
          attributeMatches: [],
          mismatchedAttributes: missing,
        };
      }
      if (overlap >= 0.5) {
        return {
          matchStatus: "possible",
          confidence: 0.45,
          reasoning: `Model identifier "${missing.join(", ")}" not stated in listing title.`,
          attributeMatches: [],
          mismatchedAttributes: missing,
        };
      }
      return null;
    }
  }
  // Skip meta-values that come from preference dropdowns ("required", "preferred", etc.)
  // — they describe preference intensity, not actual product attributes to match against.
  const META_VALUES = new Set([
    "required", "preferred", "not needed", "yes", "no", "any", "either",
    "optional", "flexible", "don't care",
  ]);
  const constraintEntries = Object.entries(requirements.constraints ?? {}).filter(
    ([, v]) => v && !META_VALUES.has(v.toLowerCase().trim()),
  );

  // Check required constraints
  const mismatched: string[] = [];
  const matched: string[] = [];
  const normName = normalise(name);
  for (const [key, val] of constraintEntries) {
    if (!val) continue;
    const nv = normalise(val).replace(/\s+/g, "");
    const inText = normName.replace(/\s+/g, "").includes(nv);
    const inSpecs = Object.values(listing.specifications ?? {}).some((sv) =>
      normalise(String(sv ?? "")).replace(/\s+/g, "").includes(nv),
    );
    if (inText || inSpecs) matched.push(key);
    else mismatched.push(key);
  }

  const attrs = [
    ...matched.map((k) => ({ name: k, status: "match" as const })),
    ...mismatched.map((k) => ({ name: k, status: "unknown" as const })),
  ];

  // Exact / strong are driven by title identity. Unverified soft constraints
  // (VRAM, color, …) stay as attribute hints — they must not demote a perfect
  // title match to "possible" (that let wrong SKUs win on junk prices).
  if (overlap >= 0.99) {
    return {
      matchStatus: "exact",
      confidence: mismatched.length ? 0.82 : 0.9,
      reasoning: mismatched.length
        ? `Title contains every requested term; unverified: ${mismatched.join(", ")}.`
        : "Title contains every requested term, including model identifiers.",
      attributeMatches: attrs,
      mismatchedAttributes: mismatched,
    };
  }

  if (overlap >= 0.75) {
    return {
      matchStatus: "strong",
      confidence: 0.7 + (overlap - 0.75) * 0.6,
      reasoning: `Title matches ${Math.round(overlap * 100)}% of requested terms${mismatched.length ? `; unverified: ${mismatched.join(", ")}` : ""}.`,
      attributeMatches: attrs,
      mismatchedAttributes: mismatched,
    };
  }

  // Possible: half or more of the terms
  if (overlap >= 0.5) {
    return {
      matchStatus: "possible",
      confidence: 0.4 + overlap * 0.2,
      reasoning: `Title matches ${Math.round(overlap * 100)}% of requested terms — needs verification.`,
      attributeMatches: attrs,
      mismatchedAttributes: mismatched,
    };
  }

  // Very low overlap → clearly a different product
  if (overlap < 0.25) {
    return {
      matchStatus: "different",
      confidence: 0.75,
      reasoning: `Title matches only ${Math.round(overlap * 100)}% of requested terms.`,
      attributeMatches: [],
      mismatchedAttributes: [],
    };
  }

  // Ambiguous — defer to LLM
  return null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function normalizeAndMatch(
  listing: ProductListing,
  requirements: ProductRequirements,
): Promise<ProductMatch> {
  const h = heuristicMatch(listing, requirements);
  if (h) return h;
  const [match] = await matchProductsBatch([listing], requirements);
  return match;
}

export async function normalizeAndMatchBatch(
  listings: ProductListing[],
  requirements: ProductRequirements,
): Promise<ProductMatch[]> {
  // Split into heuristic-solvable and LLM-needed
  const results: (ProductMatch | null)[] = listings.map((l) =>
    heuristicMatch(l, requirements),
  );

  const llmIndices = results
    .map((r, i) => (r === null ? i : -1))
    .filter((i) => i >= 0);

  if (llmIndices.length === 0) return results as ProductMatch[];

  // Batch the unknowns in one LLM call
  const llmListings = llmIndices.map((i) => listings[i]!);
  let llmMatches: ProductMatch[];
  try {
    llmMatches = await matchProductsBatch(llmListings, requirements);
  } catch {
    // Fallback: treat all unknowns as "possible"
    llmMatches = llmListings.map(() => ({
      matchStatus: "possible" as const,
      confidence: 0.4,
      reasoning: "Heuristic + LLM both unavailable; treating as possible match.",
      attributeMatches: [],
      mismatchedAttributes: [],
    }));
  }

  for (const [llmIdx, originalIdx] of llmIndices.entries()) {
    results[originalIdx] = llmMatches[llmIdx] ?? {
      matchStatus: "possible" as const,
      confidence: 0.4,
      reasoning: "No match returned for this listing.",
      attributeMatches: [],
      mismatchedAttributes: [],
    };
  }

  return results as ProductMatch[];
}

export function matchLabel(status: ProductMatch["matchStatus"]): string {
  switch (status) {
    case "exact":
      return "Exact Match";
    case "strong":
      return "Strong Match";
    case "possible":
      return "Possible Match";
    case "different":
      return "Different Product";
    default:
      return "Unknown";
  }
}
