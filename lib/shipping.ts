/**
 * Location-aware shipping / delivered-cost helpers.
 * Video checkpoint: v6-effective-price
 */

import type {
  DataAvailabilitySchema,
  EffectivePrice,
  ProductListing,
  ShoppingLocation,
} from "@/lib/schemas";
import type { z } from "zod";

type DataAvailability = z.infer<typeof DataAvailabilitySchema>;

function looksLikeFreeShipping(info: string | null | undefined): boolean {
  if (!info) return false;
  return /\bfree\s+shipping\b|\bships?\s+free\b/i.test(info);
}

function mentionsNoShip(
  listing: ProductListing,
  location: ShoppingLocation,
): boolean {
  const hay = [
    listing.shippingInformation,
    listing.description,
    listing.availability,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (!hay) return false;
  const country = location.country.toLowerCase();
  const code = location.countryCode.toLowerCase();
  return (
    new RegExp(`does not ship to\\s+(${country}|${code})`, "i").test(hay) ||
    /not available in your (country|region)/i.test(hay) ||
    /cannot ship to/i.test(hay)
  );
}

export function calculateEffectivePrice(
  listing: ProductListing,
  location: ShoppingLocation,
): EffectivePrice {
  const productPrice =
    typeof listing.price === "number" && Number.isFinite(listing.price)
      ? listing.price
      : null;

  let shippingPrice: number | null =
    typeof listing.shippingPrice === "number" &&
    Number.isFinite(listing.shippingPrice)
      ? listing.shippingPrice
      : null;

  let shippingAvailability: DataAvailability =
    listing.shippingAvailability ?? "unknown";

  if (shippingPrice == null && looksLikeFreeShipping(listing.shippingInformation)) {
    shippingPrice = 0;
    shippingAvailability = "known";
  } else if (shippingPrice != null) {
    shippingAvailability = "known";
  }

  let shipsToUserLocation = listing.shipsToUserLocation;
  if (shipsToUserLocation == null && mentionsNoShip(listing, location)) {
    shipsToUserLocation = false;
  }

  const knownMandatoryFees =
    typeof listing.knownMandatoryFees === "number" &&
    Number.isFinite(listing.knownMandatoryFees)
      ? listing.knownMandatoryFees
      : null;

  if (shipsToUserLocation === false) {
    return {
      productPrice,
      shippingPrice,
      knownMandatoryFees,
      effectivePrice: null,
      calculationComplete: false,
      shippingAvailability,
      shipsToUserLocation: false,
      currency: listing.currency,
      notes: `Does not ship to ${location.country}.`,
    };
  }

  if (productPrice == null) {
    return {
      productPrice: null,
      shippingPrice,
      knownMandatoryFees,
      effectivePrice: null,
      calculationComplete: false,
      shippingAvailability,
      shipsToUserLocation,
      currency: listing.currency,
      notes: "Product price missing — cannot compute effective price.",
    };
  }

  if (shippingPrice == null) {
    return {
      productPrice,
      shippingPrice: null,
      knownMandatoryFees,
      effectivePrice: null,
      calculationComplete: false,
      shippingAvailability: "unknown",
      shipsToUserLocation,
      currency: listing.currency,
      notes: `Shipping to ${location.country}: Unknown — effective price incomplete (not assumed free).`,
    };
  }

  const fees = knownMandatoryFees ?? 0;
  const effectivePrice = productPrice + shippingPrice + fees;

  return {
    productPrice,
    shippingPrice,
    knownMandatoryFees,
    effectivePrice,
    calculationComplete: true,
    shippingAvailability: "known",
    shipsToUserLocation: shipsToUserLocation ?? null,
    currency: listing.currency,
    notes:
      shippingPrice === 0
        ? `Effective price = product + free shipping to ${location.country} (as stated).`
        : `Effective price = product + stated shipping to ${location.country}. Taxes not included unless retrieved.`,
  };
}
