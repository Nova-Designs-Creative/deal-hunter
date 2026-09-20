import { Badge } from "@/components/ui/badge";
import type { ProductMatch } from "@/lib/schemas";
import { matchLabel } from "@/lib/product-matching";

export function ProductMatchBadge({ match }: { match: ProductMatch }) {
  const pct = Math.round(match.confidence * 100);
  return (
    <div className="space-y-2">
      <Badge variant="secondary">
        {matchLabel(match.matchStatus)} · {pct}%
      </Badge>
      {match.attributeMatches?.length > 0 && (
        <ul className="grid grid-cols-2 gap-1 text-xs text-stone-600">
          {match.attributeMatches.slice(0, 8).map((a) => (
            <li key={a.name}>
              {a.name}{" "}
              {a.status === "match"
                ? "✓"
                : a.status === "mismatch"
                  ? "✗"
                  : "—"}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
