/**
 * Country State City API — server-side only.
 * Docs: https://docs.countrystatecity.in/api/introduction
 *
 * Aggressive disk cache: free Community plan = 100 calls/day.
 * Strategy:
 *  1. GET /countries once → write .cache/csc/countries.json
 *  2. Try GET /states once (Supporter+) → write .cache/csc/states-by-country.json
 *  3. Else cache per-country /countries/{iso2}/states on first use
 * After warm, UI hits serve from disk — zero API calls.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";

const CSC_BASE = "https://api.countrystatecity.in/v1";

/** Keep geo cache for 30 days — data almost never changes */
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 30;

const CACHE_DIR = path.join(process.cwd(), ".cache", "csc");
const COUNTRIES_FILE = path.join(CACHE_DIR, "countries.json");
const STATES_BULK_FILE = path.join(CACHE_DIR, "states-by-country.json");
const STATES_DIR = path.join(CACHE_DIR, "states");

export type CscCountry = {
  id: number;
  name: string;
  iso2: string;
  iso3?: string;
  currency?: string;
  emoji?: string;
  region?: string;
};

export type CscState = {
  id: number;
  name: string;
  iso2: string;
  country_code?: string;
};

type CacheEnvelope<T> = {
  fetchedAt: string;
  source: string;
  data: T;
};

export class CscError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = "CscError";
  }
}

let memoryCountries: CscCountry[] | null = null;
let memoryStatesByCountry: Record<string, CscState[]> | null = null;
let countriesInflight: Promise<{
  countries: CscCountry[];
  fromCache: boolean;
}> | null = null;
const statesInflight = new Map<
  string,
  Promise<{ states: CscState[]; fromCache: boolean }>
>();
let warmStatesInflight: Promise<boolean> | null = null;

function getApiKey(): string {
  const key =
    process.env.CSC_API_KEY?.trim() ||
    process.env.COUNTRYSTATECITY_API_KEY?.trim();
  if (!key) {
    throw new CscError(
      "Missing CSC_API_KEY. Get a key at https://app.countrystatecity.in",
    );
  }
  return key;
}

export function isCscConfigured(): boolean {
  return Boolean(
    process.env.CSC_API_KEY?.trim() ||
      process.env.COUNTRYSTATECITY_API_KEY?.trim(),
  );
}

function ensureCacheDirs() {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
  if (!existsSync(STATES_DIR)) mkdirSync(STATES_DIR, { recursive: true });
}

function isFresh(fetchedAt: string): boolean {
  const t = Date.parse(fetchedAt);
  if (!Number.isFinite(t)) return false;
  return Date.now() - t < CACHE_TTL_MS;
}

function readCache<T>(file: string): CacheEnvelope<T> | null {
  try {
    if (!existsSync(file)) return null;
    const parsed = JSON.parse(readFileSync(file, "utf8")) as CacheEnvelope<T>;
    if (!parsed?.fetchedAt || !isFresh(parsed.fetchedAt)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache<T>(file: string, data: T, source: string) {
  ensureCacheDirs();
  const envelope: CacheEnvelope<T> = {
    fetchedAt: new Date().toISOString(),
    source,
    data,
  };
  writeFileSync(file, JSON.stringify(envelope), "utf8");
}

async function cscFetchRaw(pathSuffix: string): Promise<{
  ok: boolean;
  status: number;
  json: unknown;
  text: string;
}> {
  const key = getApiKey();
  const response = await fetch(`${CSC_BASE}${pathSuffix}`, {
    headers: {
      "X-CSCAPI-KEY": key,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  const text = await response.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { ok: response.ok, status: response.status, json, text };
}

function asList<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === "object" && Array.isArray((data as { data?: unknown }).data)) {
    return (data as { data: T[] }).data;
  }
  return [];
}

/**
 * Load all countries — disk cache first, then ONE API call.
 */
export async function getAllCountries(): Promise<{
  countries: CscCountry[];
  fromCache: boolean;
}> {
  if (memoryCountries) {
    return { countries: memoryCountries, fromCache: true };
  }

  const cached = readCache<CscCountry[]>(COUNTRIES_FILE);
  if (cached?.data?.length) {
    memoryCountries = [...cached.data].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    return { countries: memoryCountries, fromCache: true };
  }

  if (countriesInflight) return countriesInflight;

  countriesInflight = (async () => {
    const res = await cscFetchRaw("/countries");
    if (!res.ok) {
      throw new CscError(
        `Country State City API failed (${res.status}): ${res.text.slice(0, 200)}`,
        res.status,
      );
    }

    const list = asList<CscCountry>(res.json).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    writeCache(COUNTRIES_FILE, list, "GET /countries");
    memoryCountries = list;

    if (!warmStatesInflight) {
      warmStatesInflight = warmAllStatesCache().catch(() => false);
    }

    return { countries: list, fromCache: false };
  })();

  try {
    return await countriesInflight;
  } finally {
    countriesInflight = null;
  }
}

/**
 * Try bulk GET /states once (Supporter+). Community plans skip this.
 * https://docs.countrystatecity.in/api/endpoints/get-all-states
 */
async function warmAllStatesCache(): Promise<boolean> {
  if (memoryStatesByCountry) return true;
  const cached = readCache<Record<string, CscState[]>>(STATES_BULK_FILE);
  if (cached?.data) {
    memoryStatesByCountry = cached.data;
    return true;
  }

  const res = await cscFetchRaw("/states");
  if (!res.ok) return false;

  const all = asList<CscState>(res.json);
  if (!all.length) return false;

  const byCountry: Record<string, CscState[]> = {};
  for (const s of all) {
    const code = (s.country_code || "").toUpperCase();
    if (!code) continue;
    if (!byCountry[code]) byCountry[code] = [];
    byCountry[code].push(s);
  }
  for (const code of Object.keys(byCountry)) {
    byCountry[code].sort((a, b) => a.name.localeCompare(b.name));
  }

  writeCache(STATES_BULK_FILE, byCountry, "GET /states");
  memoryStatesByCountry = byCountry;
  return true;
}

function stateFileFor(countryIso2: string): string {
  return path.join(STATES_DIR, `${countryIso2.toUpperCase()}.json`);
}

/**
 * States for one country — prefer bulk cache, else per-country disk, else ONE API call.
 */
export async function getStatesByCountry(countryIso2: string): Promise<{
  states: CscState[];
  fromCache: boolean;
}> {
  const code = countryIso2.toUpperCase();

  if (!memoryStatesByCountry) {
    const bulk = readCache<Record<string, CscState[]>>(STATES_BULK_FILE);
    if (bulk?.data) memoryStatesByCountry = bulk.data;
  }
  if (memoryStatesByCountry?.[code]) {
    return { states: memoryStatesByCountry[code], fromCache: true };
  }

  const perCountry = readCache<CscState[]>(stateFileFor(code));
  if (perCountry?.data) {
    return {
      states: [...perCountry.data].sort((a, b) => a.name.localeCompare(b.name)),
      fromCache: true,
    };
  }

  const existing = statesInflight.get(code);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const res = await cscFetchRaw(
        `/countries/${encodeURIComponent(code)}/states`,
      );
      if (!res.ok) {
        if (res.status === 404) {
          writeCache(
            stateFileFor(code),
            [],
            `GET /countries/${code}/states (empty)`,
          );
          return { states: [], fromCache: false };
        }
        throw new CscError(
          `CSC states failed (${res.status}): ${res.text.slice(0, 200)}`,
          res.status,
        );
      }

      if (
        res.json &&
        typeof res.json === "object" &&
        !Array.isArray(res.json) &&
        "error" in (res.json as object)
      ) {
        writeCache(
          stateFileFor(code),
          [],
          `GET /countries/${code}/states (none)`,
        );
        return { states: [], fromCache: false };
      }

      const list = asList<CscState>(res.json).sort((a, b) =>
        a.name.localeCompare(b.name),
      );
      writeCache(stateFileFor(code), list, `GET /countries/${code}/states`);
      return { states: list, fromCache: false };
    } catch (err) {
      if (err instanceof CscError && err.status === 404) {
        return { states: [], fromCache: false };
      }
      throw err;
    } finally {
      statesInflight.delete(code);
    }
  })();

  statesInflight.set(code, promise);
  return promise;
}

export const FALLBACK_COUNTRIES: CscCountry[] = [
  { id: 233, name: "United States", iso2: "US", emoji: "🇺🇸" },
  { id: 174, name: "Philippines", iso2: "PH", emoji: "🇵🇭" },
  { id: 232, name: "United Kingdom", iso2: "GB", emoji: "🇬🇧" },
  { id: 39, name: "Canada", iso2: "CA", emoji: "🇨🇦" },
  { id: 14, name: "Australia", iso2: "AU", emoji: "🇦🇺" },
  { id: 199, name: "Singapore", iso2: "SG", emoji: "🇸🇬" },
  { id: 110, name: "Japan", iso2: "JP", emoji: "🇯🇵" },
];
