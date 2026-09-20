"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import type { PriceEvidence } from "@/lib/schemas";
import { formatMoney } from "@/lib/currency";
import { Button } from "@/components/ui/button";

export function PriceEvidenceButton({ evidence }: { evidence: PriceEvidence }) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "Hide evidence" : "Price evidence"}
      </Button>
      {open && (
        <div className="mt-2 space-y-1 rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm">
          <p>
            <span className="text-stone-500">Retrieved from:</span>{" "}
            {evidence.source}
          </p>
          <p>
            <span className="text-stone-500">Product:</span>{" "}
            {evidence.product ?? "—"}
          </p>
          <p>
            <span className="text-stone-500">Price:</span>{" "}
            {formatMoney(evidence.price, evidence.currency)}
          </p>
          <p>
            <span className="text-stone-500">Retrieved:</span>{" "}
            {new Date(evidence.retrievedAt).toLocaleString()}
          </p>
          <p className="text-xs text-stone-500">{evidence.disclaimer}</p>
          {evidence.url && (
            <a
              href={evidence.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-teal-800 underline-offset-2 hover:underline"
            >
              View source <ExternalLink className="size-3" />
            </a>
          )}
        </div>
      )}
    </div>
  );
}
