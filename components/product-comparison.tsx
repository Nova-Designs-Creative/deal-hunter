"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Manual Google comparison — does NOT scrape Google.
 * Video checkpoint: v8-google-comparison
 */
export function ProductComparison({
  defaultProduct = "",
  defaultOurPrice,
  comparable = true,
}: {
  defaultProduct?: string;
  defaultOurPrice?: number | null;
  comparable?: boolean;
}) {
  const [product, setProduct] = useState(defaultProduct);
  const [googlePrice, setGooglePrice] = useState("");
  const [ourPrice, setOurPrice] = useState(
    defaultOurPrice != null ? String(defaultOurPrice) : "",
  );
  const [googleUrl, setGoogleUrl] = useState("");

  const savings = useMemo(() => {
    const g = Number(googlePrice);
    const o = Number(ourPrice);
    if (!Number.isFinite(g) || !Number.isFinite(o)) return null;
    return g - o;
  }, [googlePrice, ourPrice]);

  const pct = useMemo(() => {
    const g = Number(googlePrice);
    if (!savings || !Number.isFinite(g) || g === 0) return null;
    return (savings / g) * 100;
  }, [googlePrice, savings]);

  return (
    <section className="rounded-2xl border border-stone-200 bg-gradient-to-br from-white/90 to-teal-50/40 p-5 shadow-sm">
      <h2 className="font-[family-name:var(--font-display)] text-xl text-stone-900">
        DealHunter vs Google
      </h2>
      <p className="mt-1 text-sm text-stone-500">
        Manual demo mode — enter the Google price you observed. We do not scrape
        Google&apos;s interface.
      </p>

      {!comparable ? (
        <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950">
          Comparison unavailable — products differ.
        </p>
      ) : (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="cmp-product">Product</Label>
              <Input
                id="cmp-product"
                value={product}
                onChange={(e) => setProduct(e.target.value)}
                placeholder="Sony WH-1000XM6"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cmp-google">Google price ($)</Label>
              <Input
                id="cmp-google"
                inputMode="decimal"
                value={googlePrice}
                onChange={(e) => setGooglePrice(e.target.value)}
                placeholder="429"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cmp-ours">DealHunter ($)</Label>
              <Input
                id="cmp-ours"
                inputMode="decimal"
                value={ourPrice}
                onChange={(e) => setOurPrice(e.target.value)}
                placeholder="379"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="cmp-url">Google URL (optional)</Label>
              <Input
                id="cmp-url"
                value={googleUrl}
                onChange={(e) => setGoogleUrl(e.target.value)}
                placeholder="https://..."
              />
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
            <div className="rounded-xl bg-white/80 p-3 ring-1 ring-stone-200">
              <p className="text-xs uppercase tracking-wide text-stone-500">
                Google
              </p>
              <p className="mt-1 text-xl font-semibold tabular-nums">
                {googlePrice ? `$${Number(googlePrice).toFixed(0)}` : "—"}
              </p>
            </div>
            <div className="rounded-xl bg-white/80 p-3 ring-1 ring-stone-200">
              <p className="text-xs uppercase tracking-wide text-stone-500">
                DealHunter
              </p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-teal-800">
                {ourPrice ? `$${Number(ourPrice).toFixed(0)}` : "—"}
              </p>
            </div>
            <div className="rounded-xl bg-teal-800 p-3 text-white">
              <p className="text-xs uppercase tracking-wide text-teal-100">
                Difference
              </p>
              <p className="mt-1 text-xl font-semibold tabular-nums">
                {savings == null
                  ? "—"
                  : savings >= 0
                    ? `$${savings.toFixed(0)}`
                    : `-$${Math.abs(savings).toFixed(0)}`}
              </p>
            </div>
            <div className="rounded-xl bg-white/80 p-3 ring-1 ring-stone-200">
              <p className="text-xs uppercase tracking-wide text-stone-500">
                % Diff
              </p>
              <p className="mt-1 text-xl font-semibold tabular-nums">
                {pct == null ? "—" : `${pct.toFixed(1)}%`}
              </p>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
