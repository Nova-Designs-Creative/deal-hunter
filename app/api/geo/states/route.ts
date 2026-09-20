import { NextResponse } from "next/server";
import { getStatesByCountry, isCscConfigured } from "@/lib/countrystatecity";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const country = searchParams.get("country")?.trim().toUpperCase();

  if (!country || country.length !== 2) {
    return NextResponse.json(
      { error: "Query param country=XX (ISO2) is required", states: [] },
      { status: 400 },
    );
  }

  if (!isCscConfigured()) {
    return NextResponse.json({
      states: [],
      source: "fallback",
      fromCache: true,
      warning: "CSC_API_KEY not set",
    });
  }

  try {
    const { states, fromCache } = await getStatesByCountry(country);
    return NextResponse.json({
      states: states.map((s) => ({
        code: s.iso2,
        name: s.name,
      })),
      source: "countrystatecity",
      fromCache,
      cacheNote: fromCache
        ? "Served from disk/memory cache (no API call)."
        : "Fetched once and cached under .cache/csc/states/ for 30 days.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load states";
    return NextResponse.json(
      { states: [], error: message, source: "error", fromCache: false },
      { status: 200 },
    );
  }
}
