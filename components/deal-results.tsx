import { DealCard } from "@/components/deal-card";
import { LowestPriceCard } from "@/components/lowest-price-card";
import { ProductRequirementsPanel } from "@/components/product-requirements";
import { RecommendedDeal } from "@/components/recommended-deal";
import { SourceList } from "@/components/source-list";
import type { SearchResult } from "@/lib/schemas";

export function DealResults({ result }: { result: SearchResult }) {
  const recommended = result.recommendedDeal ?? result.bestDeal ?? null;
  const lowest = result.lowestPriceDeal ?? null;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <p className="rounded-lg border border-amber-200/80 bg-amber-50/80 px-4 py-3 text-sm text-amber-950">
        {result.disclaimer}
      </p>

      {result.error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          {result.error}
        </p>
      )}

      <ProductRequirementsPanel
        requirements={result.productRequirements}
        explanation={result.specificationExplanation}
      />

      {result.debug?.retailers && (
        <SourceList sources={result.debug.retailers} />
      )}

      {recommended && <RecommendedDeal deal={recommended} />}

      {lowest && (
        <LowestPriceCard
          deal={lowest}
          differsFromRecommended={lowest.id !== recommended?.id}
        />
      )}

      {result.otherOptions.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-[family-name:var(--font-display)] text-2xl text-stone-900">
            Other Good Options
          </h2>
          <div className="grid gap-4 lg:grid-cols-2">
            {result.otherOptions.map((deal) => (
              <DealCard key={deal.id} deal={deal} />
            ))}
          </div>
        </section>
      )}

      {result.coverage && (
        <section className="rounded-2xl border border-stone-200 bg-white/70 p-4 text-sm text-stone-700">
          <h2 className="mb-2 font-[family-name:var(--font-display)] text-xl text-stone-900">
            Search Coverage
          </h2>
          <ul className="grid gap-1 sm:grid-cols-2">
            <li>{result.coverage.sourcesChecked} sources checked</li>
            <li>{result.coverage.listingsAnalyzed} listings analyzed</li>
            <li>{result.coverage.matchingListings} matching listings</li>
            <li>
              {result.coverage.excludedAsDifferent} excluded as different
              products
            </li>
            {result.coverage.excludedNoShip > 0 && (
              <li>
                {result.coverage.excludedNoShip} excluded (no shipping to your
                location)
              </li>
            )}
            {result.coverage.failedSources > 0 && (
              <li>{result.coverage.failedSources} sources failed</li>
            )}
          </ul>
        </section>
      )}
    </div>
  );
}
