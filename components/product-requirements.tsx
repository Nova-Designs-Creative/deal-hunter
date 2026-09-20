import type { ProductRequirements } from "@/lib/schemas";

export function ProductRequirementsPanel({
  requirements,
  explanation,
}: {
  requirements?: ProductRequirements | null;
  explanation?: string | null;
}) {
  if (!requirements && !explanation) return null;

  return (
    <section className="rounded-2xl border border-teal-700/15 bg-teal-50/50 p-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-teal-900">
        What I&apos;m prioritizing
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-stone-700">
        {explanation ?? requirements?.specificationExplanation}
      </p>
      {requirements?.importantSpecifications?.length ? (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {requirements.importantSpecifications.map((s) => (
            <li
              key={s.name}
              className="rounded-md bg-white/80 px-2 py-1 text-xs text-stone-700 ring-1 ring-stone-200"
            >
              {s.name}
              <span className="ml-1 text-stone-400">({s.importance})</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
