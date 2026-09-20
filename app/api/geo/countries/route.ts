import { NextResponse } from "next/server";
import {
  FALLBACK_COUNTRIES,
  getAllCountries,
  isCscConfigured,
} from "@/lib/countrystatecity";

export const runtime = "nodejs";

export async function GET() {
  try {
    if (!isCscConfigured()) {
      return NextResponse.json({
        countries: FALLBACK_COUNTRIES.map((c) => ({
          code: c.iso2,
          name: c.name,
          emoji: c.emoji ?? null,
          currency: c.currency ?? null,
        })),
        source: "fallback",
        fromCache: true,
        warning:
          "CSC_API_KEY not set — short fallback list. Add key from https://app.countrystatecity.in",
      });
    }

    const { countries, fromCache } = await getAllCountries();
    return NextResponse.json({
      countries: countries.map((c) => ({
        code: c.iso2,
        name: c.name,
        emoji: c.emoji ?? null,
        currency: c.currency ?? null,
      })),
      source: "countrystatecity",
      fromCache,
      cacheNote: fromCache
        ? "Served from disk/memory cache (no API call)."
        : "Fetched once from CSC and saved under .cache/csc/ for 30 days.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load countries";
    return NextResponse.json(
      {
        countries: FALLBACK_COUNTRIES.map((c) => ({
          code: c.iso2,
          name: c.name,
          emoji: c.emoji ?? null,
          currency: c.currency ?? null,
        })),
        source: "fallback",
        fromCache: true,
        error: message,
      },
      { status: 200 },
    );
  }
}
