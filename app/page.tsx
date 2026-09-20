"use client";

import { useEffect, useRef, useState } from "react";
import { DebugPanel } from "@/components/debug-panel";
import { DealResults } from "@/components/deal-results";
import { LocationSelector } from "@/components/location-selector";
import { SearchForm } from "@/components/search-form";
import { SpecConfirmation } from "@/components/spec-confirmation";
import {
  PIPELINE_STEPS,
  SearchProgress,
  type StepId,
} from "@/components/search-progress";
import {
  UNDERSTAND_STEPS,
  UnderstandProgress,
  type UnderstandStepId,
} from "@/components/understand-progress";
import type { SearchResult, ShoppingLocation } from "@/lib/schemas";

const DEFAULT_LOCATION: ShoppingLocation = {
  country: "United States",
  countryCode: "US",
  region: null,
  postalCode: null,
};

export default function HomePage() {
  const [loading, setLoading] = useState(false);
  const [understanding, setUnderstanding] = useState(false);
  const [activeStep, setActiveStep] = useState<StepId | "done" | "error" | null>(
    null,
  );
  const [understandStep, setUnderstandStep] = useState<
    UnderstandStepId | "done" | null
  >(null);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [location, setLocation] = useState<ShoppingLocation>(DEFAULT_LOCATION);
  const [pendingQuery, setPendingQuery] = useState<string | null>(null);
  const timers = useRef<number[]>([]);
  const understandTimers = useRef<number[]>([]);

  useEffect(() => {
    return () => {
      timers.current.forEach((id) => window.clearTimeout(id));
      understandTimers.current.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  function clearTimers() {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
  }

  function clearUnderstandTimers() {
    understandTimers.current.forEach((id) => window.clearTimeout(id));
    understandTimers.current = [];
  }

  function runUnderstandProgress() {
    clearUnderstandTimers();
    const delays = [0, 180, 360];
    UNDERSTAND_STEPS.forEach((step, i) => {
      const id = window.setTimeout(
        () => setUnderstandStep(step.id),
        delays[i] ?? i * 200,
      );
      understandTimers.current.push(id);
    });
  }

  function runProgressIllusion() {
    clearTimers();
    // Longer, staggered stages so the UI stays alive during ~30–60s scrapes
    const delays = [0, 8000, 22000, 40000];
    PIPELINE_STEPS.forEach((step, i) => {
      const id = window.setTimeout(
        () => setActiveStep(step.id),
        delays[i] ?? i * 10000,
      );
      timers.current.push(id);
    });
  }

  /** Step 1: understand product. Named SKUs skip the specs form and race marketplaces. */
  async function startUnderstand(query: string) {
    setUnderstanding(true);
    setLoading(false);
    setResult(null);
    setPendingQuery(query);
    setActiveStep(null);
    setUnderstandStep("parse");
    clearTimers();
    runUnderstandProgress();

    const started = Date.now();

    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          location,
          debug: true,
          understandOnly: true,
          forceSearch: false,
        }),
      });
      const data = (await res.json()) as SearchResult;

      const elapsed = Date.now() - started;
      const minShowMs = 650;
      if (elapsed < minShowMs) {
        await new Promise((r) => window.setTimeout(r, minShowMs - elapsed));
      }

      clearUnderstandTimers();
      setUnderstandStep("done");
      setResult(data);
      setUnderstanding(false);

      // Named product → skip specs, go straight to marketplace price race
      if (
        data.productRequirements?.isNamedProduct ||
        data.needsClarification === false
      ) {
        await runFullSearch(
          undefined,
          data.productRequirements ?? undefined,
          query,
        );
        return;
      }
    } catch (err) {
      clearUnderstandTimers();
      setUnderstandStep(null);
      setResult({
        disclaimer:
          "Best deal found across the sources we checked. Prices and availability can change.",
        recommendedDeal: null,
        lowestPriceDeal: null,
        otherOptions: [],
        error:
          err instanceof Error
            ? err.message
            : "Network error talking to DealHunter.",
      });
      setUnderstanding(false);
    }
  }

  /** Step 2: full research after user confirms specs (or named-product auto-start) */
  async function runFullSearch(
    constraints?: Record<string, string | null>,
    cachedRequirements?: SearchResult["productRequirements"],
    queryOverride?: string,
  ) {
    const query = queryOverride ?? pendingQuery;
    if (!query) return;
    setLoading(true);
    setActiveStep("searching");
    runProgressIllusion();

    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          location,
          debug: true,
          forceSearch: true,
          constraints,
          productRequirements:
            cachedRequirements ?? result?.productRequirements,
        }),
      });
      const data = (await res.json()) as SearchResult;
      clearTimers();
      setResult(data);
      setActiveStep(
        data.error && !data.recommendedDeal ? "error" : "done",
      );
    } catch (err) {
      clearTimers();
      setResult({
        disclaimer:
          "Best deal found across the sources we checked. Prices and availability can change.",
        recommendedDeal: null,
        lowestPriceDeal: null,
        otherOptions: [],
        error:
          err instanceof Error
            ? err.message
            : "Network error talking to DealHunter.",
      });
      setActiveStep("error");
    } finally {
      setLoading(false);
    }
  }

  const showSpecForm =
    Boolean(result?.needsClarification && result.productRequirements) &&
    !loading;

  const showResults =
    result && !result.needsClarification && !understanding;

  return (
    <main className="relative min-h-screen overflow-x-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(1200px 600px at 10% -10%, rgba(13,148,136,0.18), transparent 55%), radial-gradient(900px 500px at 90% 0%, rgba(245,158,11,0.12), transparent 50%), linear-gradient(180deg, #f7f4ef 0%, #eef6f4 45%, #f3efe8 100%)",
        }}
      />

      <div className="mx-auto flex w-full max-w-5xl flex-col px-4 pb-20 pt-10 sm:px-6 sm:pt-14">
        <header className="mb-8 space-y-5 animate-in fade-in duration-700">
          <p className="text-sm font-medium uppercase tracking-[0.22em] text-teal-800/80">
            AI shopping research agent
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-5xl leading-[0.95] tracking-tight text-stone-900 sm:text-7xl">
            DealHunter
          </h1>
          <p className="max-w-xl text-lg text-stone-600 sm:text-xl">
            Find Me a Better Deal
          </p>
          <p className="max-w-xl text-sm text-stone-500">
            We scrape major and specialized marketplaces for your country,
            compare prices and reviews, and surface the best deal — using a
            local IP so results match where you shop.
          </p>

          <LocationSelector
            value={location}
            onChange={setLocation}
            disabled={loading || understanding}
          />
          <SearchForm
            onSubmit={startUnderstand}
            loading={loading || understanding}
          />
        </header>

        {understanding && (
          <section className="mb-8 rounded-2xl border border-stone-200/80 bg-white/55 p-5 backdrop-blur animate-in fade-in duration-300">
            <UnderstandProgress
              activeStep={understandStep}
              visible
            />
          </section>
        )}

        {showSpecForm && result?.productRequirements && (
          <SpecConfirmation
            requirements={result.productRequirements}
            loading={loading}
            onConfirm={(constraints) => {
              setUnderstandStep(null);
              runFullSearch(constraints);
            }}
            onSkipFlexible={() => {
              setUnderstandStep(null);
              runFullSearch();
            }}
          />
        )}

        {(loading || activeStep) && (
          <section className="mb-10 rounded-2xl border border-stone-200/80 bg-white/55 p-5 backdrop-blur">
            <SearchProgress activeStep={activeStep} visible />
          </section>
        )}

        {showResults && (
          <div className="space-y-10">
            <DealResults result={result} />
            <DebugPanel debug={result.debug} />
          </div>
        )}

        {result?.error && !showResults && !showSpecForm && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            {result.error}
          </p>
        )}
      </div>
    </main>
  );
}
