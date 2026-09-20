import { DealCard } from "@/components/deal-card";
import type { RankedDeal } from "@/lib/schemas";

export function LowestPriceCard({
  deal,
  differsFromRecommended,
}: {
  deal: RankedDeal;
  differsFromRecommended: boolean;
}) {
  return (
    <section className="space-y-3">
      <h2 className="font-[family-name:var(--font-display)] text-2xl text-stone-900">
        Lowest Price Found
      </h2>
      <p className="text-sm text-stone-500">
        Cheapest comparable listing among sources checked — may not be the best
        overall deal.
      </p>
      <DealCard
        deal={deal}
        warning={
          differsFromRecommended
            ? "Lower price, but not our top recommendation — check ratings and whether the seller ships to you."
            : null
        }
      />
    </section>
  );
}
