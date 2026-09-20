import type { RetailerSource } from "@/lib/schemas";

export function SourceList({
  sources,
}: {
  sources: RetailerSource[] | undefined;
}) {
  if (!sources?.length) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-stone-500">
        Sources checked
      </h3>
      <ul className="flex flex-wrap gap-2">
        {sources.map((s) => (
          <li
            key={s.id}
            className="rounded-md bg-stone-900/5 px-2.5 py-1 text-xs font-medium text-stone-700 ring-1 ring-stone-200"
          >
            {s.name}
            <span className="ml-1 text-stone-400">({s.category})</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
