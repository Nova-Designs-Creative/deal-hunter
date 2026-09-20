import { DealCard } from "@/components/deal-card";
import type { RankedDeal } from "@/lib/schemas";

export function RecommendedDeal({ deal }: { deal: RankedDeal }) {
  return (
    <section className="space-y-3">
      <h2 className="font-[family-name:var(--font-display)] text-2xl text-stone-900">
        Best Overall Deal
      </h2>
      <p className="text-sm text-stone-500">
        Ranked by local availability, price, and reviews for your country —
        not cross-border sticker price alone.
      </p>
      <DealCard deal={deal} featured />
    </section>
  );
}
