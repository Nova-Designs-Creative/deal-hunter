import type { RetailerEvaluation } from "@/lib/schemas";

export function RetailerConfidencePanel({
  evaluation,
}: {
  evaluation: RetailerEvaluation;
}) {
  return (
    <div className="space-y-2 text-sm">
      <p>
        <span className="text-stone-500">Retailer confidence:</span>{" "}
        <span className="font-medium capitalize">
          {evaluation.retailerConfidence.replaceAll("_", " ")}
        </span>
      </p>
      <ul className="space-y-1">
        {evaluation.signals.map((s, i) => (
          <li key={`${s.label}-${i}`} className="text-stone-600">
            {s.polarity === "positive" ? "✓" : "⚠"} {s.label}
          </li>
        ))}
      </ul>
      {evaluation.sellerConfidence && (
        <div className="border-t border-stone-100 pt-2">
          <p>
            <span className="text-stone-500">Seller confidence:</span>{" "}
            <span className="font-medium capitalize">
              {evaluation.sellerConfidence.replaceAll("_", " ")}
            </span>
          </p>
          <ul className="mt-1 space-y-1">
            {evaluation.sellerSignals.map((s, i) => (
              <li key={`seller-${i}`} className="text-stone-600">
                {s.polarity === "positive" ? "✓" : "⚠"} {s.label}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
