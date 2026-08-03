import type { ProductLocale } from "./productI18n";
import type { ManualVerificationVerdict } from "./services/manualOwnerActionsDataSource";

const VERDICT_LABELS: Record<ProductLocale, Record<ManualVerificationVerdict, string>> = {
  pl: {
    VERIFIED: "Zweryfikowany",
    NEEDS_MORE_DATA: "Potrzebne dodatkowe dane",
    CRITICAL_RISK: "Krytyczne ryzyko",
    REJECT: "Odrzuć",
  },
  en: {
    VERIFIED: "Verified",
    NEEDS_MORE_DATA: "Needs more data",
    CRITICAL_RISK: "Critical risk",
    REJECT: "Reject",
  },
};

/** Presentation-only copy. Backend payloads and audit records retain the enum. */
export function manualVerificationVerdictLabel(verdict: ManualVerificationVerdict, locale: ProductLocale): string {
  return VERDICT_LABELS[locale][verdict];
}
