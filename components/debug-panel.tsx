"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import type { SearchDebug } from "@/lib/schemas";

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="max-h-80 overflow-auto rounded-md bg-stone-950 p-3 text-xs leading-relaxed text-stone-100">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export function DebugPanel({ debug }: { debug: SearchDebug | undefined }) {
  if (!debug) return null;

  const sections: Array<{ title: string; value: unknown }> = [
    { title: "1. User request", value: debug.userRequest },
    { title: "2. Location", value: debug.location },
    { title: "3. Product specifications / requirements", value: debug.productRequirements },
    { title: "4. Search queries", value: debug.searchPlan },
    { title: "5. Retailer discovery plan", value: debug.sourcePlan },
    { title: "6. Sources selected", value: debug.retailers },
    {
      title: "7. Raw retrieved data (previews — no API keys)",
      value: debug.rawRetrievals,
    },
    { title: "8. Extracted products", value: debug.extractedProducts },
    { title: "9. Product matching", value: debug.matches },
    {
      title: "10. Retailer / marketplace seller evaluation",
      value: debug.retailerEvaluations,
    },
    { title: "11. Shipping / effective prices", value: debug.pricing },
    { title: "12. Ranking", value: debug.ranking },
    {
      title: "13. Final recommendation",
      value: debug.ranking.find((d) => !d.excludedReason) ?? debug.ranking[0],
    },
    { title: "14. Errors", value: debug.errors },
    { title: "15. Stage timings (ms)", value: debug.stageTimingsMs },
  ];

  return (
    <section className="rounded-2xl border border-dashed border-stone-300 bg-white/50 p-4">
      <h2 className="mb-1 font-[family-name:var(--font-display)] text-xl text-stone-900">
        Demo / Debug Panel
      </h2>
      <p className="mb-3 text-sm text-stone-500">
        Full engineering pipeline for the YouTube walkthrough. Secrets never
        included.
      </p>
      <Accordion multiple>
        {sections.map((section, i) => (
          <AccordionItem key={section.title} value={`item-${i}`}>
            <AccordionTrigger className="text-sm">
              {section.title}
            </AccordionTrigger>
            <AccordionContent>
              <JsonBlock value={section.value} />
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}
