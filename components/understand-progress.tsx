"use client";

import { Check, Loader2, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

export const UNDERSTAND_STEPS = [
  { id: "parse", label: "Reading your request" },
  { id: "category", label: "Detecting product type" },
  { id: "specs", label: "Building the spec checklist" },
] as const;

export type UnderstandStepId = (typeof UNDERSTAND_STEPS)[number]["id"];

type UnderstandProgressProps = {
  activeStep: UnderstandStepId | "done" | null;
  visible: boolean;
};

export function UnderstandProgress({
  activeStep,
  visible,
}: UnderstandProgressProps) {
  if (!visible || !activeStep) return null;

  const activeIndex =
    activeStep === "done"
      ? UNDERSTAND_STEPS.length
      : UNDERSTAND_STEPS.findIndex((s) => s.id === activeStep);

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-stone-600">Understanding product</p>
      <ol className="flex w-full flex-col gap-0 sm:flex-row sm:items-start sm:justify-between sm:gap-2">
        {UNDERSTAND_STEPS.map((step, index) => {
          const done = activeStep === "done" || index < activeIndex;
          const current = index === activeIndex && activeStep !== "done";

          return (
            <li
              key={step.id}
              className="flex flex-1 items-center gap-2 sm:flex-col sm:items-start"
            >
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs",
                  done && "border-teal-700 bg-teal-700 text-white",
                  current && "border-teal-600 bg-teal-50 text-teal-800",
                  !done && !current && "border-stone-300 text-stone-400",
                )}
              >
                {done ? (
                  <Check className="size-3.5" />
                ) : current ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Circle className="size-3" />
                )}
              </span>
              <p
                className={cn(
                  "text-sm",
                  current && "font-semibold text-stone-900",
                  done && "text-stone-600",
                  !done && !current && "text-stone-400",
                )}
              >
                {step.label}
              </p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
