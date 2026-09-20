import { NextResponse } from "next/server";
import { runDealSearch } from "@/lib/pipeline";
import { ShoppingLocationSchema } from "@/lib/schemas";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const query =
      typeof body?.query === "string"
        ? body.query
        : typeof body?.q === "string"
          ? body.q
          : "";

    const locationParse = ShoppingLocationSchema.safeParse(body?.location);
    if (!locationParse.success) {
      return NextResponse.json(
        {
          disclaimer:
            "Best deal found across the sources we checked. Prices and availability can change.",
          recommendedDeal: null,
          lowestPriceDeal: null,
          otherOptions: [],
          error: "Please select a shopping country.",
        },
        { status: 400 },
      );
    }

    const includeDebug =
      body?.debug === true ||
      process.env.DEALHUNTER_DEBUG === "1" ||
      process.env.NODE_ENV !== "production";

    const result = await runDealSearch(query, locationParse.data, {
      includeDebug,
      forceSearch: body?.forceSearch === true,
      understandOnly: body?.understandOnly === true,
      userConstraints:
        body?.constraints && typeof body.constraints === "object"
          ? (body.constraints as Record<string, string | null>)
          : undefined,
      cachedRequirements: body?.productRequirements ?? undefined,
      maxRetailers: typeof body?.maxRetailers === "number" ? body.maxRetailers : 6,
      maxPages: typeof body?.maxPages === "number" ? body.maxPages : 8,
      concurrency: typeof body?.concurrency === "number" ? body.concurrency : 3,
    });

    const status =
      result.error && !result.recommendedDeal && !result.needsClarification
        ? 400
        : 200;
    return NextResponse.json(result, { status });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unexpected search failure";
    return NextResponse.json(
      {
        disclaimer:
          "Best deal found across the sources we checked. Prices and availability can change.",
        recommendedDeal: null,
        lowestPriceDeal: null,
        otherOptions: [],
        error: message,
      },
      { status: 500 },
    );
  }
}
