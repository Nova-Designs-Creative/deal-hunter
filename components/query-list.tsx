import type { SearchPlan } from "@/lib/schemas";

export function QueryList({ plan }: { plan: SearchPlan | null | undefined }) {
  if (!plan?.queries?.length) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-stone-500">
        Search queries
      </h3>
      <ul className="space-y-1.5">
        {plan.queries.map((q) => (
          <li
            key={q}
            className="rounded-md bg-white/60 px-3 py-2 text-sm text-stone-800 ring-1 ring-stone-200/80"
          >
            {q}
          </li>
        ))}
      </ul>
      {plan.rationale && (
        <p className="text-xs text-stone-500">{plan.rationale}</p>
      )}
    </div>
  );
}
