/**
 * AI reasoning layer via OpenRouter (primary) or Gemini (optional fallback).
 * Default model: nvidia/nemotron-3.5-lightning:free
 * Docs: https://openrouter.ai/nvidia/nemotron-3.5-lightning:free
 */

import { z } from "zod";
import {
  ExtractedProductsSchema,
  ProductListingSchema,
  ProductMatchSchema,
  ProductRequirementsSchema,
  SearchPlanSchema,
  SourcePlanSchema,
  type ExtractedProducts,
  type ProductListing,
  type ProductMatch,
  type ProductRequirements,
  type RetailerSource,
  type SearchPlan,
  type ShoppingLocation,
  type SourcePlan,
} from "@/lib/schemas";

// ─── Provider configuration ───────────────────────────────────────────────────
// Priority:  Groq (fastest) → OpenRouter → Gemini direct
//
// Groq: hardware-accelerated inference (LPUs), free tier, OpenAI-compatible
//   Get a key: https://console.groq.com/keys
// OpenRouter: broad model selection, free tier available
//   Get a key: https://openrouter.ai/settings/keys
// Gemini: fallback direct API

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
// Verified live against /v1/models (Sep 2026). gpt-oss-120b is a reasoning model:
// we set reasoning_effort=low and a generous max_tokens so JSON isn't truncated.
// Override the first choice via GROQ_MODEL; the rest are in-provider fallbacks.
const GROQ_MODELS = [
  process.env.GROQ_MODEL?.trim() || "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "qwen/qwen3.8-27b",
].filter((m, i, arr) => arr.indexOf(m) === i);

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
// Verified live free model. Override via OPENROUTER_MODEL env var.
const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL?.trim() ||
  "nvidia/nemotron-3-super-120b-a12b:free";

// Hard per-call timeout (ms). LLM calls must never hang the whole pipeline.
const LLM_TIMEOUT_MS = 28_000;

export class GeminiError extends Error {
  constructor(
    message: string,
    public code?: string,
    public retryAfterMs?: number,
  ) {
    super(message);
    this.name = "GeminiError";
  }
}

export function isGeminiConfigured(): boolean {
  return Boolean(
    process.env.GROQ_API_KEY?.trim() ||
      process.env.OPENROUTER_API_KEY?.trim() ||
      process.env.GEMINI_API_KEY?.trim(),
  );
}

async function groqJson(
  systemInstruction: string,
  userPrompt: string,
  jsonSchema: unknown,
): Promise<string> {
  let lastErr: unknown;
  for (const model of GROQ_MODELS) {
    try {
      return await groqJsonWithModel(model, systemInstruction, userPrompt, jsonSchema);
    } catch (err) {
      lastErr = err;
      // Try the next Groq model on model-specific failures; rethrow on auth.
      if (err instanceof GeminiError && /401|invalid api key/i.test(err.message)) throw err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new GeminiError("All Groq models failed.");
}

async function groqJsonWithModel(
  model: string,
  systemInstruction: string,
  userPrompt: string,
  jsonSchema: unknown,
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) throw new GeminiError("Missing GROQ_API_KEY.");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
  const isReasoning = /gpt-oss/i.test(model);

  let response: Response;
  try {
    response = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        max_tokens: 4096,
        ...(isReasoning ? { reasoning_effort: "low" } : {}),
        messages: [
          {
            role: "system",
            content: `${systemInstruction}

You MUST reply with a single valid JSON object only.
No markdown fences. No commentary.

importantSpecifications MUST be an array of OBJECTS, never bare strings.
Example:
"importantSpecifications": [
  { "name": "ram", "importance": "high", "description": "Memory size" },
  { "name": "storage", "importance": "high", "description": null }
]

Match this JSON Schema as closely as possible:
${JSON.stringify(jsonSchema)}`,
          },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === "AbortError") {
      throw new GeminiError(`Groq ${model} call timed out (28s).`);
    }
    throw err;
  }
  clearTimeout(timer);

  const text = await response.text();
  if (!response.ok) {
    throw new GeminiError(
      `Groq ${model} error (${response.status}): ${text.slice(0, 400)}`,
      response.status === 429 ? "RESOURCE_EXHAUSTED" : undefined,
      response.status === 429 ? 2000 : undefined,
    );
  }

  let payload: {
    choices?: Array<{ message?: { content?: string | null } }>;
    error?: { message?: string };
  };
  try {
    payload = JSON.parse(text);
  } catch {
    throw new GeminiError("Groq returned non-JSON HTTP body.");
  }

  if (payload.error?.message) throw new GeminiError(payload.error.message);
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new GeminiError("Groq returned an empty message.");
  return content;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function stripJsonFence(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  if (fenced) return fenced[1].trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}

function friendlyLlmError(err: unknown): GeminiError {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : JSON.stringify(err);

  if (/429|rate.?limit|RESOURCE_EXHAUSTED/i.test(raw)) {
    return new GeminiError(
      "LLM rate limit hit. Wait a moment and retry, or check your OpenRouter / Gemini quota.",
      "RESOURCE_EXHAUSTED",
      3000,
    );
  }

  try {
    const parsed = JSON.parse(raw) as {
      error?: { message?: string; code?: number };
    };
    if (parsed?.error?.message) {
      return new GeminiError(parsed.error.message.slice(0, 400));
    }
  } catch {
    /* not json */
  }

  return new GeminiError(raw.slice(0, 400));
}

async function openRouterJson(
  systemInstruction: string,
  userPrompt: string,
  jsonSchema: unknown,
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    throw new GeminiError(
      "Missing OPENROUTER_API_KEY. Get a key at https://openrouter.ai/settings/keys",
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer":
          process.env.OPENROUTER_HTTP_REFERER?.trim() ||
          "https://dealhunter.local",
        "X-Title": process.env.OPENROUTER_APP_TITLE?.trim() || "DealHunter",
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        temperature: 0.2,
        max_tokens: 2048,
        messages: [
          {
            role: "system",
            content: `${systemInstruction}

You MUST reply with a single valid JSON object only.
No markdown fences. No commentary.

importantSpecifications MUST be an array of OBJECTS, never bare strings.
Example:
"importantSpecifications": [
  { "name": "ram", "importance": "high", "description": "Memory size" },
  { "name": "storage", "importance": "high", "description": null }
]

Match this JSON Schema as closely as possible:
${JSON.stringify(jsonSchema)}`,
          },
          { role: "user", content: userPrompt },
        ],
        // Prefer JSON when the provider supports it
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === "AbortError") {
      throw new GeminiError("OpenRouter call timed out (28s). Model may be slow or rate-limited.");
    }
    throw err;
  }
  clearTimeout(timer);

  const text = await response.text();
  if (!response.ok) {
    throw new GeminiError(
      `OpenRouter error (${response.status}): ${text.slice(0, 400)}`,
      response.status === 429 ? "RESOURCE_EXHAUSTED" : undefined,
      response.status === 429 ? 3000 : undefined,
    );
  }

  let payload: {
    choices?: Array<{ message?: { content?: string | null } }>;
    error?: { message?: string };
  };
  try {
    payload = JSON.parse(text);
  } catch {
    throw new GeminiError("OpenRouter returned non-JSON HTTP body.");
  }

  if (payload.error?.message) {
    throw new GeminiError(payload.error.message);
  }

  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new GeminiError("OpenRouter returned an empty message.");
  }
  return content;
}

async function geminiJson(
  systemInstruction: string,
  userPrompt: string,
  jsonSchema: unknown,
): Promise<string> {
  const { GoogleGenAI } = await import("@google/genai");
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new GeminiError("Missing GEMINI_API_KEY.");
  const model = process.env.GEMINI_MODEL?.trim() || "gemini-2.0-flash";
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model,
    contents: userPrompt,
    config: {
      systemInstruction,
      temperature: 0.2,
      responseMimeType: "application/json",
      responseJsonSchema: jsonSchema,
    },
  });
  if (!response.text) throw new GeminiError("Gemini returned an empty response.");
  return response.text;
}

/** Try a raw provider call. Returns text or throws. */
async function tryProvider(
  name: "groq" | "openrouter" | "gemini",
  systemInstruction: string,
  userPrompt: string,
  jsonSchema: unknown,
): Promise<string> {
  switch (name) {
    case "groq":
      return groqJson(systemInstruction, userPrompt, jsonSchema);
    case "openrouter":
      return openRouterJson(systemInstruction, userPrompt, jsonSchema);
    case "gemini":
      return geminiJson(systemInstruction, userPrompt, jsonSchema);
  }
}

async function generateJson<T>(
  schema: z.ZodType<T>,
  systemInstruction: string,
  userPrompt: string,
): Promise<T> {
  const jsonSchema = z.toJSONSchema(schema);

  // Build provider priority: Groq (fastest) → OpenRouter → Gemini direct
  const providers: Array<"groq" | "openrouter" | "gemini"> = [];
  if (process.env.GROQ_API_KEY?.trim()) providers.push("groq");
  if (process.env.OPENROUTER_API_KEY?.trim()) providers.push("openrouter");
  if (process.env.GEMINI_API_KEY?.trim()) providers.push("gemini");

  if (providers.length === 0) {
    throw new GeminiError(
      "No LLM configured. Set GROQ_API_KEY, OPENROUTER_API_KEY, or GEMINI_API_KEY.",
    );
  }

  let lastError: unknown;

  for (const provider of providers) {
    try {
      const rawText = await tryProvider(
        provider,
        systemInstruction,
        userPrompt,
        jsonSchema,
      );

      let parsed: unknown;
      try {
        parsed = JSON.parse(stripJsonFence(rawText));
      } catch {
        throw new GeminiError(`${provider}: returned invalid JSON.`);
      }

      const result = schema.safeParse(parsed);
      if (!result.success) {
        throw new GeminiError(
          `${provider}: JSON failed validation: ${result.error.message.slice(0, 200)}`,
        );
      }
      return result.data;
    } catch (err) {
      lastError = err;
      const friendly = friendlyLlmError(err);
      // Rate-limited? Brief pause then try next provider
      if (friendly.code === "RESOURCE_EXHAUSTED") {
        await sleep(Math.min(friendly.retryAfterMs ?? 1500, 1500));
      }
      // Always try next provider on any error
      continue;
    }
  }

  throw friendlyLlmError(lastError);
}

/** STAGE 1 — dynamic product understanding (1 call) */
export async function understandProductRequirements(
  userRequest: string,
  location: ShoppingLocation,
): Promise<ProductRequirements> {
  return generateJson(
    ProductRequirementsSchema,
    `You are a shopping research agent. Convert the user's request into product requirements.

CRITICAL:
- Determine importantSpecifications DYNAMICALLY for THIS product category.
- Set isTooBroad=true when the request is very vague.
- ALWAYS fill importantSpecifications as OBJECTS: { "name": string, "importance": "high"|"medium"|"low", "description": string|null }
  NEVER return importantSpecifications as plain strings like ["ram","storage"].
- Add clarifyingQuestions for high-importance attributes left unspecified (0–4).
- specificationExplanation: one short paragraph.
- Never invent constraints the user did not state.`,
    `User request:\n${userRequest}\n\nShopping location:\n${JSON.stringify(location)}`,
  );
}

const ResearchPlanSchema = z.object({
  searchPlan: SearchPlanSchema,
  sourcePlan: SourcePlanSchema,
});

/** Combined STAGE 2+3 — one LLM call */
export async function planResearch(input: {
  requirements: ProductRequirements;
  location: ShoppingLocation;
  catalog: Array<
    Pick<RetailerSource, "id" | "name" | "domain" | "category" | "markets">
  >;
}): Promise<{ searchPlan: SearchPlan; sourcePlan: SourcePlan }> {
  return generateJson(
    ResearchPlanSchema,
    `Create a shopping research plan in ONE JSON response:
1) searchPlan: 3–5 location-aware price/deal queries
2) sourcePlan: pick retailer IDs from catalog + optional extraSources ({query} required in templates)
Adapt to category + country. Prefer local marketplaces when relevant.`,
    JSON.stringify({
      requirements: input.requirements,
      location: input.location,
      catalog: input.catalog,
    }),
  );
}

export async function planSearches(
  requirements: ProductRequirements,
  location: ShoppingLocation,
): Promise<SearchPlan> {
  const { searchPlan } = await planResearch({
    requirements,
    location,
    catalog: [],
  });
  return searchPlan;
}

export async function planSources(input: {
  requirements: ProductRequirements;
  location: ShoppingLocation;
  catalog: Array<
    Pick<RetailerSource, "id" | "name" | "domain" | "category" | "markets">
  >;
}): Promise<SourcePlan> {
  const { sourcePlan } = await planResearch(input);
  return sourcePlan;
}

/** Batch extract from multiple pages — 1 call */
export async function extractProductsFromPages(input: {
  pages: Array<{ label: string; url: string | null; content: string }>;
  requirements: ProductRequirements;
  location: ShoppingLocation;
}): Promise<ExtractedProducts> {
  const packed = input.pages
    .slice(0, 6)
    .map(
      (p, i) =>
        `\n===== SOURCE ${i + 1}: ${p.label} | ${p.url ?? "no-url"} =====\n${p.content.slice(0, 12_000)}`,
    )
    .join("\n");

  return generateJson(
    ExtractedProductsSchema,
    `Extract buyable product listings from ALL sources below.

RULES
- Only include listings for the requested product itself (or its direct variants).
  SKIP accessories (cases, cables, chargers, stands), bundles/"setups", promo/voucher
  lines, installment amounts ("per month"), and unrelated products.
- productName: the clean product title only — no markdown, brackets, or URLs.
- price: the main selling price as a number (not "was" price, not installment).
- url: the product page link exactly as it appears (relative links are OK).
- retailer: use the SOURCE label given for that section.
- Never invent prices/specs/shipping. Use null when unknown.
- Put category-specific attrs (RAM, storage, chip, color, size…) in specifications{}.
- Mark isMarketplace for Lazada/Shopee/Amazon/eBay/Etsy. sourceRetrievedAt = now ISO.`,
    `Requirements:\n${JSON.stringify(input.requirements)}
Location:\n${JSON.stringify(input.location)}
${packed}`,
  );
}

export async function extractProductsFromPage(input: {
  pageContent: string;
  sourceLabel: string;
  sourceUrl: string | null;
  requirements: ProductRequirements;
  location: ShoppingLocation;
}): Promise<ExtractedProducts> {
  return extractProductsFromPages({
    pages: [
      {
        label: input.sourceLabel,
        url: input.sourceUrl,
        content: input.pageContent,
      },
    ],
    requirements: input.requirements,
    location: input.location,
  });
}

const BatchMatchSchema = z.object({
  matches: z.array(
    z.object({
      index: z.number(),
      match: ProductMatchSchema,
    }),
  ),
});

/** Batch match listings — 1 call */
export async function matchProductsBatch(
  listings: ProductListing[],
  requirements: ProductRequirements,
): Promise<ProductMatch[]> {
  if (!listings.length) return [];

  const capped = listings.slice(0, 20);
  try {
    const result = await generateJson(
      BatchMatchSchema,
      `Match each listing to the shopper request.
Statuses: exact | strong | possible | different | unknown
- A different model, generation, or chip (e.g. M4 vs M5, XM5 vs XM6, Gen 2 vs Gen 3) is "different".
- Accessories, bundles, promo/voucher lines, and installment amounts are "different".
- "exact" only when title confirms the same product and model; "strong" when very likely the same;
  "possible" when plausible but unverified.
confidence 0–1, never claim 1.0 lightly.
Return one match object per listing index.`,
      JSON.stringify({
        requirements,
        listings: capped.map((l, index) => ({ index, listing: l })),
      }),
    );

    return capped.map((_, i) => {
      const found = result.matches.find((m) => m.index === i);
      return (
        found?.match ?? {
          matchStatus: "unknown" as const,
          confidence: 0.2,
          reasoning: "No match result returned for this listing.",
          attributeMatches: [],
          mismatchedAttributes: [],
        }
      );
    });
  } catch {
    return capped.map(() => ({
      matchStatus: "possible" as const,
      confidence: 0.45,
      reasoning: "Heuristic fallback after match batch failure.",
      attributeMatches: requirements.importantSpecifications.map((s) => ({
        name: s.name,
        status: "unknown" as const,
      })),
      mismatchedAttributes: [],
    }));
  }
}

export async function matchProduct(
  listing: ProductListing,
  requirements: ProductRequirements,
): Promise<ProductMatch> {
  const [m] = await matchProductsBatch([listing], requirements);
  return m;
}

/** Heuristic SERP URL pick — zero LLM calls */
export function selectProductUrlsFromSerpHeuristic(input: {
  serpContent: string;
  preferredDomains: string[];
  maxUrls?: number;
}): { urls: string[]; notes: string } {
  const max = input.maxUrls ?? 6;
  const urls = new Set<string>();
  const preferred = input.preferredDomains.map((d) =>
    d.replace(/^www\./, "").toLowerCase(),
  );

  const urlRegex = /https?:\/\/[^\s"'<>\\]+/gi;
  const found = input.serpContent.match(urlRegex) ?? [];

  const cleaned = found
    .map((u) => u.replace(/[),.;]+$/, ""))
    .filter((u) => {
      try {
        const host = new URL(u).hostname.replace(/^www\./, "").toLowerCase();
        if (/google\.|youtube\.|facebook\.|instagram\.|twitter\.|x\.com/.test(host)) {
          return false;
        }
        return true;
      } catch {
        return false;
      }
    });

  for (const u of cleaned) {
    try {
      const host = new URL(u).hostname.replace(/^www\./, "").toLowerCase();
      if (preferred.some((d) => host === d || host.endsWith(`.${d}`))) {
        urls.add(u.split("#")[0]);
      }
    } catch {
      /* skip */
    }
    if (urls.size >= max) break;
  }

  if (urls.size < max) {
    for (const u of cleaned) {
      urls.add(u.split("#")[0]);
      if (urls.size >= max) break;
    }
  }

  return {
    urls: [...urls].slice(0, max),
    notes: "Heuristic URL extraction (no LLM call).",
  };
}

export async function selectProductUrlsFromSerp(input: {
  serpContent: string;
  requirements: ProductRequirements;
  location: ShoppingLocation;
  preferredDomains: string[];
  maxUrls?: number;
}): Promise<{ urls: string[]; notes: string }> {
  return selectProductUrlsFromSerpHeuristic(input);
}

export { ProductListingSchema };
