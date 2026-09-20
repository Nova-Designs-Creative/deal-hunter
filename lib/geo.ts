/**
 * Country → Decodo geo IP + Google Shopping locale + currency.
 * Keeps scrape results consistent with where the shopper is.
 */

import type { ShoppingLocation } from "@/lib/schemas";

export type LocaleProfile = {
  countryCode: string;
  /** Decodo `geo` parameter (city/country name Decodo accepts) */
  decodoGeo: string;
  /** Google `gl` country code */
  googleGl: string;
  /** Google `hl` interface language */
  googleHl: string;
  /** Default listing currency for this market */
  currency: string;
};

const PROFILES: Record<string, LocaleProfile> = {
  US: { countryCode: "US", decodoGeo: "United States", googleGl: "us", googleHl: "en", currency: "USD" },
  PH: { countryCode: "PH", decodoGeo: "Philippines", googleGl: "ph", googleHl: "en", currency: "PHP" },
  GB: { countryCode: "GB", decodoGeo: "United Kingdom", googleGl: "uk", googleHl: "en", currency: "GBP" },
  UK: { countryCode: "GB", decodoGeo: "United Kingdom", googleGl: "uk", googleHl: "en", currency: "GBP" },
  AU: { countryCode: "AU", decodoGeo: "Australia", googleGl: "au", googleHl: "en", currency: "AUD" },
  CA: { countryCode: "CA", decodoGeo: "Canada", googleGl: "ca", googleHl: "en", currency: "CAD" },
  SG: { countryCode: "SG", decodoGeo: "Singapore", googleGl: "sg", googleHl: "en", currency: "SGD" },
  JP: { countryCode: "JP", decodoGeo: "Japan", googleGl: "jp", googleHl: "ja", currency: "JPY" },
  DE: { countryCode: "DE", decodoGeo: "Germany", googleGl: "de", googleHl: "de", currency: "EUR" },
  FR: { countryCode: "FR", decodoGeo: "France", googleGl: "fr", googleHl: "fr", currency: "EUR" },
  ES: { countryCode: "ES", decodoGeo: "Spain", googleGl: "es", googleHl: "es", currency: "EUR" },
  IT: { countryCode: "IT", decodoGeo: "Italy", googleGl: "it", googleHl: "it", currency: "EUR" },
  NL: { countryCode: "NL", decodoGeo: "Netherlands", googleGl: "nl", googleHl: "nl", currency: "EUR" },
  MY: { countryCode: "MY", decodoGeo: "Malaysia", googleGl: "my", googleHl: "en", currency: "MYR" },
  IN: { countryCode: "IN", decodoGeo: "India", googleGl: "in", googleHl: "en", currency: "INR" },
  NZ: { countryCode: "NZ", decodoGeo: "New Zealand", googleGl: "nz", googleHl: "en", currency: "NZD" },
  ID: { countryCode: "ID", decodoGeo: "Indonesia", googleGl: "id", googleHl: "id", currency: "IDR" },
  TH: { countryCode: "TH", decodoGeo: "Thailand", googleGl: "th", googleHl: "th", currency: "THB" },
  VN: { countryCode: "VN", decodoGeo: "Vietnam", googleGl: "vn", googleHl: "vi", currency: "VND" },
  KR: { countryCode: "KR", decodoGeo: "South Korea", googleGl: "kr", googleHl: "ko", currency: "KRW" },
  TW: { countryCode: "TW", decodoGeo: "Taiwan", googleGl: "tw", googleHl: "zh-TW", currency: "TWD" },
  HK: { countryCode: "HK", decodoGeo: "Hong Kong", googleGl: "hk", googleHl: "en", currency: "HKD" },
  AE: { countryCode: "AE", decodoGeo: "United Arab Emirates", googleGl: "ae", googleHl: "en", currency: "AED" },
  SA: { countryCode: "SA", decodoGeo: "Saudi Arabia", googleGl: "sa", googleHl: "en", currency: "SAR" },
  BR: { countryCode: "BR", decodoGeo: "Brazil", googleGl: "br", googleHl: "pt", currency: "BRL" },
  MX: { countryCode: "MX", decodoGeo: "Mexico", googleGl: "mx", googleHl: "es", currency: "MXN" },
};

export function localeForLocation(location: ShoppingLocation): LocaleProfile {
  const code = (location.countryCode || "US").toUpperCase();
  if (PROFILES[code]) return PROFILES[code]!;
  // Fall back to country name as Decodo geo; keep currency unknown→USD only as last resort
  return {
    countryCode: code,
    decodoGeo: location.country || code,
    googleGl: code.toLowerCase().slice(0, 2),
    googleHl: "en",
    currency: "USD",
  };
}

/** Build a Google Shopping URL localized to the shopper's country. */
export function googleShoppingUrl(query: string, locale: LocaleProfile): string {
  const q = encodeURIComponent(query);
  // udm=28 is the current Google Shopping surface; tbm=shop also works.
  return `https://www.google.com/search?tbm=shop&q=${q}&hl=${locale.googleHl}&gl=${locale.googleGl}&udm=28`;
}

/** Bing Shopping URL localized via market / country code. */
export function bingShoppingUrl(query: string, locale: LocaleProfile): string {
  const q = encodeURIComponent(query);
  const cc = locale.googleGl.toLowerCase();
  return `https://www.bing.com/shop?q=${q}&setlang=en&cc=${cc}&setmkt=${cc}-${cc.toUpperCase()}`;
}
