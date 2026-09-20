import { ExternalLink, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { PriceEvidenceButton } from "@/components/price-evidence";
import { ProductMatchBadge } from "@/components/product-match";
import { formatMoney } from "@/lib/currency";
import type { RankedDeal } from "@/lib/schemas";
import { cn } from "@/lib/utils";

type DealCardProps = {
  deal: RankedDeal;
  featured?: boolean;
  warning?: string | null;
};

function RatingsBlock({
  rating,
  reviewCount,
}: {
  rating: string | null;
  reviewCount: number | null;
}) {
  const n =
    rating != null && rating !== ""
      ? Number(String(rating).replace(/[^0-9.]/g, ""))
      : NaN;
  const hasRating = Number.isFinite(n) && n > 0;
  const stars = hasRating ? (n > 5 ? n / 20 : n) : null;

  if (!hasRating && (reviewCount == null || reviewCount <= 0)) {
    return (
      <div>
        <dt className="text-xs text-stone-500">Rating</dt>
        <dd className="text-stone-400">No ratings yet</dd>
      </div>
    );
  }

  return (
    <div>
      <dt className="text-xs text-stone-500">Rating</dt>
      <dd className="flex flex-wrap items-center gap-1.5">
        {stars != null && (
          <>
            <Star className="size-3.5 fill-amber-400 text-amber-400" />
            <span className="font-medium tabular-nums">
              {stars.toFixed(1)}
            </span>
          </>
        )}
        {reviewCount != null && reviewCount > 0 && (
          <span className="text-stone-500">
            ({reviewCount.toLocaleString()} review
            {reviewCount === 1 ? "" : "s"})
          </span>
        )}
      </dd>
    </div>
  );
}

export function DealCard({ deal, featured = false, warning }: DealCardProps) {
  const { listing, match, pricing } = deal;

  return (
    <article
      className={cn(
        "relative overflow-hidden rounded-2xl border bg-white/85 p-5 shadow-sm backdrop-blur",
        featured
          ? "border-teal-600/40 ring-2 ring-teal-600/20"
          : "border-stone-200/90",
      )}
    >
      <div className="flex flex-wrap items-start gap-4">
        {listing.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={listing.imageUrl}
            alt={listing.productName ?? "Product"}
            className="size-20 rounded-lg object-cover ring-1 ring-stone-200"
          />
        ) : (
          <div className="flex size-20 items-center justify-center rounded-lg bg-stone-100 text-xs text-stone-400">
            No image
          </div>
        )}

        <div className="min-w-0 flex-1 space-y-1">
          <h3 className="text-lg font-semibold leading-snug text-stone-900">
            {listing.productName ?? "Untitled listing"}
          </h3>
          <p className="text-sm text-stone-500">
            {listing.retailer ?? "Unknown retailer"}
            {listing.isMarketplace &&
            listing.sellerName &&
            listing.sellerName !== listing.retailer
              ? ` · ${listing.sellerName}`
              : ""}
          </p>
        </div>

        <div className="text-right">
          <p className="text-2xl font-semibold tabular-nums text-stone-900">
            {formatMoney(
              pricing.effectivePrice ?? pricing.productPrice,
              listing.currency,
            )}
          </p>
          <p className="text-xs text-stone-500">Price</p>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
        <RatingsBlock
          rating={listing.sellerRating}
          reviewCount={listing.sellerReviewCount}
        />
        <div>
          <dt className="text-xs text-stone-500">Condition</dt>
          <dd>{listing.condition ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-stone-500">Availability</dt>
          <dd>
            {/out.?of.?stock|sold.?out/i.test(listing.availability ?? "")
              ? "Sold out"
              : /in.?stock|available/i.test(listing.availability ?? "")
                ? "In stock"
                : (listing.availability ?? "—")}
          </dd>
        </div>
      </dl>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {match.matchStatus === "exact" && (
          <Badge className="bg-teal-700 text-white">Exact Match</Badge>
        )}
        {match.matchStatus === "strong" && (
          <Badge variant="secondary">Strong Match</Badge>
        )}
        {/in stock|available/i.test(listing.availability ?? "") && (
          <Badge variant="secondary">In Stock</Badge>
        )}
      </div>

      {warning && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950">
          {warning}
        </p>
      )}

      <div className="mt-4">
        <ProductMatchBadge match={match} />
      </div>

      <p className="mt-4 text-sm leading-relaxed text-stone-600">
        {deal.rankReason}
      </p>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <PriceEvidenceButton evidence={deal.priceEvidence} />
        {listing.url ? (
          <a
            href={listing.url}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "inline-flex gap-1.5",
            )}
          >
            View Deal
            <ExternalLink className="size-3.5" />
          </a>
        ) : (
          <Button disabled size="sm" variant="outline">
            No link available
          </Button>
        )}
      </div>
    </article>
  );
}
