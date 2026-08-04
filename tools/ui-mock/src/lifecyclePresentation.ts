import type { ProductLocale } from "./productI18n";
import type { LifecycleConditions, SystemLifecycleStatus } from "./types/lifecycleTypes";

type Copy = { radar: string; system: string; yours: string; readonly: string; met: string; unmet: string; missing: string; risks: string; reason: string; confirm: string; saveFailed: string; nextFollowUp: string; nextMain: string; confirmAction: string; needsReason: string };
const COPY: Record<ProductLocale, Copy> = {
  pl: { radar: "Twój Radar", system: "Status systemowy", yours: "Twój status", readonly: "Ten tryb jest tylko do odczytu.", met: "Spełnione warunki", unmet: "Niespełnione warunki", missing: "Brakujące dane", risks: "Ryzyka", reason: "Powód ręcznej decyzji", confirm: "Potwierdzam prywatną decyzję.", saveFailed: "Nie udało się zapisać prywatnej decyzji. Spróbuj ponownie.", nextFollowUp: "Dodaj do dalszej obserwacji", nextMain: "Przenieś do mojego Głównego Radaru", confirmAction: "Potwierdź decyzję", needsReason: "Warunki nie są jeszcze spełnione; podaj krótki powód." },
  en: { radar: "Your Radar", system: "System status", yours: "Your status", readonly: "This mode is read-only.", met: "Conditions met", unmet: "Unmet conditions", missing: "Missing data", risks: "Risks", reason: "Reason for manual decision", confirm: "I confirm this private decision.", saveFailed: "The private decision could not be saved. Please try again.", nextFollowUp: "Add to Follow-up", nextMain: "Move to my Main Radar", confirmAction: "Confirm decision", needsReason: "The conditions are not yet met; provide a short reason." },
};
const STATUS: Record<ProductLocale, Record<SystemLifecycleStatus, string>> = {
  pl: { NEW: "Nowe", FOLLOW_UP: "Dalsza obserwacja", MAIN_RADAR: "Główny Radar" },
  en: { NEW: "New", FOLLOW_UP: "Follow-up", MAIN_RADAR: "Main Radar" },
};
const CONDITION: Record<string, { pl: string; en: string }> = {
  IDENTITY_VALID: { pl: "Poprawna tożsamość", en: "Valid identity" },
  VALIDATED_SNAPSHOT: { pl: "Zweryfikowany snapshot", en: "Validated snapshot" },
  BASIC_DATA_AVAILABLE: { pl: "Dane podstawowe dostępne", en: "Basic data available" },
  FOLLOW_UP_BASIC_FILTERS_PASSED: { pl: "Filtry Follow-up spełnione", en: "Follow-up filters passed" },
  NO_CRITICAL_IDENTITY_OR_CONTRACT_RISK: { pl: "Brak krytycznego ryzyka identity/contract", en: "No critical identity/contract risk" },
  FRESH_FOLLOW_UP_DATA_CURRENT_CYCLE: { pl: "Aktualny recheck cyklu", en: "Current-cycle recheck" },
  PROMOTION_RESOLVER_READY: { pl: "Gotowość do awansu", en: "Promotion readiness" },
  BASIC_FILTERS_PASSED: { pl: "Filtry podstawowe spełnione", en: "Basic filters passed" },
  SECURITY_CHECKED: { pl: "Security sprawdzone", en: "Security checked" },
  MANUAL_VERIFICATION_ALLOWS_PROMOTION: { pl: "Ręczna weryfikacja pozwala", en: "Manual verification allows promotion" },
  MANUAL_VERIFICATION_NOT_REQUIRED: { pl: "Ręczna weryfikacja niewymagana", en: "Manual verification not required" },
  CURRENT_CYCLE_FOLLOW_UP_RECHECK: { pl: "Recheck bieżącego cyklu", en: "Current-cycle recheck" },
  MANUAL_VERIFICATION_RECORD: { pl: "Rekord ręcznej weryfikacji", en: "Manual verification record" },
};

export function lifecycleCopy(locale: ProductLocale): Copy { return COPY[locale]; }
export function lifecycleStatusLabel(status: SystemLifecycleStatus, locale: ProductLocale): string { return STATUS[locale][status]; }
export function lifecycleConditionLabel(code: string, locale: ProductLocale): string { return CONDITION[code]?.[locale] ?? (locale === "pl" ? "Wymaga oceny" : "Requires review"); }
export function presentLifecycleConditions(conditions: LifecycleConditions, locale: ProductLocale): Array<{ label: string; values: string[] }> {
  const copy = lifecycleCopy(locale);
  return [
    { label: copy.met, values: conditions.conditions_met.map((value) => lifecycleConditionLabel(value, locale)) },
    { label: copy.unmet, values: conditions.conditions_unmet.map((value) => lifecycleConditionLabel(value, locale)) },
    { label: copy.missing, values: conditions.missing_data.map((value) => lifecycleConditionLabel(value, locale)) },
    { label: copy.risks, values: conditions.risks.map((value) => lifecycleConditionLabel(value, locale)) },
  ].filter((entry) => entry.values.length > 0);
}
