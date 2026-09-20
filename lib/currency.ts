/**
 * Lightweight currency helpers.
 * Conversions are estimates — always keep original price.
 */

const FALLBACK_RATES_TO_USD: Record<string, number> = {
  USD: 1,
  PHP: 0.0175,
  GBP: 1.27,
  CAD: 0.72,
  AUD: 0.65,
  SGD: 0.74,
  JPY: 0.0067,
  EUR: 1.08,
  MYR: 0.21,
  INR: 0.012,
  NZD: 0.58,
  IDR: 0.000063,
  THB: 0.029,
  VND: 0.00004,
  KRW: 0.00074,
  TWD: 0.031,
  HKD: 0.128,
  AED: 0.272,
  SAR: 0.267,
  BRL: 0.18,
  MXN: 0.055,
};

export function normalizeCurrencyCode(code: string | null | undefined): string {
  return (code || "USD").toUpperCase().slice(0, 3);
}

/** Convert amount to USD estimate for ranking comparisons across currencies. */
export function toUsdEstimate(
  amount: number,
  currency: string | null | undefined,
): { usd: number; estimated: boolean } {
  const code = normalizeCurrencyCode(currency);
  const rate = FALLBACK_RATES_TO_USD[code];
  if (!rate) {
    return { usd: amount, estimated: true };
  }
  return { usd: amount * rate, estimated: code !== "USD" };
}

/** Currencies typically shown without fractional units. */
const ZERO_DECIMAL = new Set(["IDR", "VND", "KRW", "JPY", "CLP", "PYG"]);

export function formatMoney(
  amount: number | null | undefined,
  currency: string | null | undefined,
): string {
  if (amount == null) return "—";
  const code = normalizeCurrencyCode(currency);
  const fractionDigits = ZERO_DECIMAL.has(code) ? 0 : 2;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(amount);
  } catch {
    return `${code} ${amount.toFixed(fractionDigits)}`;
  }
}

/**
 * When scrapers mis-tag local high-unit prices as USD/SGD/EUR, rewrite to the
 * shopper's market currency (e.g. Indonesia AF1 ~Rp1.2M labeled as USD).
 */
export function coerceMarketCurrency(
  price: number | null | undefined,
  listedCurrency: string | null | undefined,
  marketCurrency: string,
): string {
  const market = normalizeCurrencyCode(marketCurrency);
  const listed = normalizeCurrencyCode(listedCurrency);
  if (!price || price <= 0) return listed || market;

  const highUnit = new Set(["IDR", "VND", "KRW", "LAK", "IRR"]);
  const wrongWestern = new Set(["USD", "SGD", "EUR", "GBP", "AUD", "CAD"]);

  if (
    highUnit.has(market) &&
    wrongWestern.has(listed) &&
    price >= 10_000
  ) {
    return market;
  }

  // Low-unit markets: huge "USD" amounts are almost never real
  if (
    !highUnit.has(market) &&
    listed === "USD" &&
    market !== "USD" &&
    price >= 50_000
  ) {
    return market;
  }

  return listed || market;
}

export function formatConvertedEstimate(
  amount: number,
  fromCurrency: string | null | undefined,
  toCurrency: string,
): string | null {
  const from = normalizeCurrencyCode(fromCurrency);
  const to = normalizeCurrencyCode(toCurrency);
  if (from === to) return null;
  const asUsd = toUsdEstimate(amount, from).usd;
  const toRate = FALLBACK_RATES_TO_USD[to];
  if (!toRate) return null;
  const converted = asUsd / toRate;
  return `≈ ${formatMoney(converted, to)} (estimate)`;
}
