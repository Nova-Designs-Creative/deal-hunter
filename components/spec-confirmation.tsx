"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ProductRequirements } from "@/lib/schemas";

type SpecConfirmationProps = {
  requirements: ProductRequirements;
  loading?: boolean;
  onConfirm: (constraints: Record<string, string | null>) => void;
  onSkipFlexible: () => void;
};

export function SpecConfirmation({
  requirements,
  loading,
  onConfirm,
  onSkipFlexible,
}: SpecConfirmationProps) {
  const specs = useMemo(
    () =>
      [...requirements.importantSpecifications].sort((a, b) => {
        const rank = { high: 0, medium: 1, low: 2 } as const;
        return rank[a.importance] - rank[b.importance];
      }),
    [requirements.importantSpecifications],
  );

  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const [k, v] of Object.entries(requirements.constraints ?? {})) {
      if (v) init[k] = v;
    }
    return init;
  });

  const [budget, setBudget] = useState(
    requirements.budgetMax != null ? String(requirements.budgetMax) : "",
  );
  const [condition, setCondition] = useState(requirements.condition);

  function submit() {
    const constraints: Record<string, string | null> = {
      ...Object.fromEntries(
        Object.entries(values).map(([k, v]) => [k, v.trim() || null]),
      ),
      condition,
    };
    if (budget.trim()) constraints.budgetMax = budget.trim();
    onConfirm(constraints);
  }

  return (
    <section className="mb-8 space-y-4 rounded-2xl border border-teal-700/20 bg-white/90 p-5 shadow-sm animate-in fade-in duration-300">
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-xl text-stone-900">
          Confirm what matters
        </h2>
        <p className="mt-1 text-sm text-stone-600">
          {requirements.specificationExplanation}
        </p>
        <p className="mt-1 text-xs text-stone-500">
          Category: {requirements.category} · Goal:{" "}
          {requirements.goal.replaceAll("_", " ")}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {specs.map((spec) => (
          <div key={spec.name} className="space-y-1.5">
            <Label htmlFor={`spec-${spec.name}`}>
              {spec.name}
              <span className="ml-1 font-normal text-stone-400">
                ({spec.importance})
              </span>
            </Label>
            <Input
              id={`spec-${spec.name}`}
              disabled={loading}
              placeholder={
                spec.description ||
                (spec.importance === "high"
                  ? "Recommended to fill"
                  : "Optional — leave blank if flexible")
              }
              value={values[spec.name] ?? ""}
              onChange={(e) =>
                setValues((prev) => ({ ...prev, [spec.name]: e.target.value }))
              }
            />
          </div>
        ))}

        <div className="space-y-1.5">
          <Label htmlFor="spec-condition">Condition</Label>
          <select
            id="spec-condition"
            disabled={loading}
            className="h-10 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm"
            value={condition}
            onChange={(e) =>
              setCondition(
                e.target.value as ProductRequirements["condition"],
              )
            }
          >
            <option value="any">Any</option>
            <option value="new">New</option>
            <option value="refurbished">Refurbished</option>
            <option value="used">Used</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="spec-budget">Max budget (optional)</Label>
          <Input
            id="spec-budget"
            disabled={loading}
            inputMode="decimal"
            placeholder="e.g. 1500"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
          />
        </div>
      </div>

      {requirements.clarifyingQuestions?.length > 0 && (
        <div className="rounded-lg bg-stone-50 px-3 py-2 text-sm text-stone-600">
          <p className="font-medium text-stone-800">Also consider:</p>
          <ul className="mt-1 list-disc pl-5">
            {requirements.clarifyingQuestions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          className="bg-teal-700 text-white hover:bg-teal-800"
          disabled={loading}
          onClick={submit}
        >
          {loading ? "Starting research…" : "Find deals with these specs"}
        </Button>
        <Button
          variant="outline"
          disabled={loading}
          onClick={onSkipFlexible}
        >
          Skip — keep specs flexible
        </Button>
      </div>
    </section>
  );
}
