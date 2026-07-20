import type { ProductLocale } from "./productI18n";
import { PRODUCT_TRANSLATIONS } from "./productI18n";

type FilterTranslationKey = Extract<keyof typeof PRODUCT_TRANSLATIONS.en, `filter.${string}`>;

const FILTER_REASON_KEYS = {
  market_cap_missing_using_fdv: "filter.marketCapMissingUsingFdv",
  market_cap_missing: "filter.marketCapMissing",
  market_cap_below_300000: "filter.marketCapBelow",
  market_cap_above_10000000: "filter.marketCapAbove",
  volume_24h_missing: "filter.volumeMissing",
  volume_24h_below_30000: "filter.volumeBelow",
  liquidity_missing: "filter.liquidityMissing",
  liquidity_below_30000: "filter.liquidityBelow",
  volume_market_cap_ratio_missing: "filter.ratioMissing",
  volume_market_cap_ratio_below_1_percent: "filter.ratioBelow",
  volume_market_cap_ratio_above_100_percent: "filter.ratioAbove",
  volume_market_cap_ratio_outside_sweet_spot_5_30_percent: "filter.ratioSweetSpot",
  pair_age_missing: "filter.pairAgeMissing",
  pair_age_not_above_7_days: "filter.pairAgeBelow",
  pair_age_outside_preferred_14_90_days: "filter.pairAgePreferred",
  // Compatibility with snapshots produced before the canonical numeric reason codes.
  market_cap_below_min: "filter.marketCapBelow",
  market_cap_above_max: "filter.marketCapAbove",
  volume_24h_below_min: "filter.volumeBelow",
  liquidity_below_min: "filter.liquidityBelow",
  volume_market_cap_ratio_below_min: "filter.ratioBelow",
  volume_market_cap_ratio_above_max: "filter.ratioAbove",
  pair_age_below_min: "filter.pairAgeBelow",
} as const satisfies Record<string, FilterTranslationKey>;

export type FilterReasonPresentation = {
  summary: string;
  rawReason: string;
  known: boolean;
};

export function formatFilterReason(reason: string, locale: ProductLocale): FilterReasonPresentation {
  const key = FILTER_REASON_KEYS[reason as keyof typeof FILTER_REASON_KEYS];
  return {
    summary: key
      ? PRODUCT_TRANSLATIONS[locale][key]
      : PRODUCT_TRANSLATIONS[locale]["filter.unknown"],
    rawReason: reason,
    known: Boolean(key),
  };
}

export const SUPPORTED_FILTER_REASONS = Object.freeze(Object.keys(FILTER_REASON_KEYS));

const STATUS_REASON_KEYS: Record<string, { en: string; pl: string }> = {
  SCANNER_SNAPSHOT_STALE: {
    en: "The snapshot is delayed but remains usable.",
    pl: "Migawka jest opóźniona, ale nadal można z niej korzystać.",
  },
  SCANNER_OUTPUT_UNAVAILABLE: {
    en: "No published scanner snapshot is available.",
    pl: "Brak opublikowanej migawki skanera.",
  },
  SCANNER_OUTPUT_DIRECTORY_MISSING: {
    en: "The scanner has not published an output directory yet.",
    pl: "Skaner nie opublikował jeszcze katalogu wynikowego.",
  },
  SCANNER_OUTPUT_INVALID_JSON: {
    en: "The published scanner file cannot be read.",
    pl: "Nie można odczytać opublikowanego pliku skanera.",
  },
  SCANNER_SCHEMA_INVALID: {
    en: "The published snapshot did not pass contract validation.",
    pl: "Opublikowana migawka nie przeszła walidacji kontraktu.",
  },
  SCANNER_FIXTURE_FORBIDDEN: {
    en: "Sample data is blocked in INTERNAL_BETA.",
    pl: "Dane przykładowe są zablokowane w INTERNAL_BETA.",
  },
  SCANNER_FIXTURE_MARKER_DETECTED: {
    en: "The snapshot contains a sample-data marker and was blocked.",
    pl: "Migawka zawiera znacznik danych przykładowych i została zablokowana.",
  },
  SCANNER_ENVIRONMENT_INVALID: {
    en: "The snapshot belongs to a different environment.",
    pl: "Migawka należy do innego środowiska.",
  },
  CONTEXT_OUTPUT_UNAVAILABLE: {
    en: "Non-critical market context is temporarily unavailable.",
    pl: "Dodatkowy kontekst rynkowy jest chwilowo niedostępny.",
  },
  CONTEXT_ENVIRONMENT_INVALID: {
    en: "Market context belongs to a different environment.",
    pl: "Kontekst rynkowy należy do innego środowiska.",
  },
  DEXSCREENER_PARTIAL_COVERAGE: {
    en: "DexScreener returned only part of the requested data.",
    pl: "DexScreener zwrócił tylko część wymaganych danych.",
  },
  ESTABLISHED_UNIVERSE_EMPTY: {
    en: "The Established address list is configured but empty.",
    pl: "Lista adresów Established jest skonfigurowana, ale pusta.",
  },
};

export function formatStatusReason(reasonCode: string | null | undefined, locale: ProductLocale): string {
  if (!reasonCode) {
    return locale === "pl" ? "Stan wymaga sprawdzenia." : "The status needs review.";
  }
  return STATUS_REASON_KEYS[reasonCode]?.[locale]
    ?? (locale === "pl" ? "Stan wymaga sprawdzenia." : "The status needs review.");
}
