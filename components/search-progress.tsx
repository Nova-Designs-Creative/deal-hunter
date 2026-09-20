"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, Circle, Sparkles } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

/** Consumer-facing stages — mapped to approximate progress % */
export const PIPELINE_STEPS = [
  {
    id: "searching",
    label: "Scanning Online Stores",
    detail: "Pulling live offers for your country",
    tip: "We use a local IP so prices match where you shop.",
  },
  {
    id: "collecting",
    label: "Checking local marketplaces",
    detail: "Specialized stores for your region",
    tip: "Specialty stores in your country get priority.",
  },
  {
    id: "comparing",
    label: "Matching the right product",
    detail: "Filtering accessories, wrong models, and sold-out listings",
    tip: "M4 vs M5 and 60HE vs 80HE are treated as different products.",
  },
  {
    id: "ranking",
    label: "Ranking by price & reviews",
    detail: "Scoring local sellers, ratings, and sticker price",
    tip: "Best overall isn’t always the absolute cheapest sticker.",
  },
] as const;

export type StepId = (typeof PIPELINE_STEPS)[number]["id"];

const ROTATING_MESSAGES = [
  "Comparing merchants from shopping search…",
  "Preferring stores that sell in your country…",
  "Skipping keycaps, cases, and other accessories…",
  "Weighing ratings alongside price…",
  "Almost there — ranking the final shortlist…",
];

type SearchProgressProps = {
  activeStep: StepId | "done" | "error" | null;
  visible: boolean;
};

export function SearchProgress({ activeStep, visible }: SearchProgressProps) {
  const [elapsed, setElapsed] = useState(0);
  const [msgIndex, setMsgIndex] = useState(0);

  useEffect(() => {
    if (!visible || !activeStep || activeStep === "done" || activeStep === "error") {
      setElapsed(0);
      return;
    }
    setElapsed(0);
    const tick = window.setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => window.clearInterval(tick);
  }, [visible, activeStep]);

  useEffect(() => {
    if (!visible || !activeStep || activeStep === "done" || activeStep === "error") {
      return;
    }
    const rot = window.setInterval(
      () => setMsgIndex((i) => (i + 1) % ROTATING_MESSAGES.length),
      4500,
    );
    return () => window.clearInterval(rot);
  }, [visible, activeStep]);

  if (!visible || !activeStep) return null;

  const activeIndex =
    activeStep === "done" || activeStep === "error"
      ? PIPELINE_STEPS.length
      : PIPELINE_STEPS.findIndex((s) => s.id === activeStep);

  const progressPct =
    activeStep === "done"
      ? 100
      : activeStep === "error"
        ? Math.min(95, ((activeIndex + 0.5) / PIPELINE_STEPS.length) * 100)
        : Math.min(
            92,
            ((Math.max(activeIndex, 0) + 0.35) / PIPELINE_STEPS.length) * 100,
          );

  const current =
    activeStep !== "done" && activeStep !== "error"
      ? PIPELINE_STEPS[Math.max(0, activeIndex)]
      : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="flex items-center gap-2 text-sm font-medium text-teal-800">
            <Sparkles className="size-4 animate-pulse" />
            Finding your best deal
          </p>
          <p className="mt-1 text-lg font-semibold text-stone-900 sm:text-xl">
            {activeStep === "done"
              ? "Done"
              : activeStep === "error"
                ? "Something went wrong"
                : (current?.label ?? "Working…")}
          </p>
          {current && activeStep !== "done" && activeStep !== "error" && (
            <p className="mt-0.5 text-sm text-stone-500">{current.detail}</p>
          )}
        </div>
        {activeStep !== "done" && activeStep !== "error" && (
          <p className="tabular-nums text-sm text-stone-400">
            {elapsed < 60
              ? `${elapsed}s`
              : `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`}
          </p>
        )}
      </div>

      <Progress value={progressPct} className="h-2" />

      <ol className="grid gap-3 sm:grid-cols-2">
        {PIPELINE_STEPS.map((step, index) => {
          const done =
            activeStep === "done" ||
            activeStep === "error" ||
            index < activeIndex;
          const isCurrent = index === activeIndex && activeStep !== "done" && activeStep !== "error";

          return (
            <li
              key={step.id}
              className={cn(
                "flex gap-3 rounded-xl border px-3 py-2.5 transition-colors duration-300",
                isCurrent && "border-teal-600/40 bg-teal-50/80",
                done && !isCurrent && "border-stone-200/80 bg-white/60",
                !done && !isCurrent && "border-stone-100 bg-white/40 opacity-60",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border text-xs",
                  done && "border-teal-700 bg-teal-700 text-white",
                  isCurrent && "border-teal-600 bg-white text-teal-800",
                  !done && !isCurrent && "border-stone-300 text-stone-400",
                )}
              >
                {done && !isCurrent ? (
                  <Check className="size-3.5" />
                ) : isCurrent ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Circle className="size-3" />
                )}
              </span>
              <div className="min-w-0">
                <p
                  className={cn(
                    "text-sm",
                    isCurrent && "font-semibold text-stone-900",
                    done && !isCurrent && "text-stone-600",
                    !done && !isCurrent && "text-stone-400",
                  )}
                >
                  {step.label}
                </p>
                <p className="text-xs text-stone-500">{step.detail}</p>
              </div>
            </li>
          );
        })}
      </ol>

      {activeStep !== "done" && activeStep !== "error" && (
        <p
          key={msgIndex}
          className="rounded-lg bg-stone-900/5 px-3 py-2 text-sm text-stone-600 animate-in fade-in duration-500"
        >
          {ROTATING_MESSAGES[msgIndex]}
          {current?.tip ? (
            <span className="mt-1 block text-xs text-stone-400">{current.tip}</span>
          ) : null}
        </p>
      )}
    </div>
  );
}
