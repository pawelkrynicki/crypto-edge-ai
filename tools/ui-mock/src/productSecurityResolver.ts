import type { UiTokenCandidate } from "./types/scannerTypes";

export type ProductSecurityState =
  | "not_invoked"
  | "unavailable"
  | "partial"
  | "checked_needs_manual_review"
  | "checked_critical"
  | "checked";

export type ProductSecurityResolution = {
  state: ProductSecurityState;
  checkedAt: string | null;
  sources: string[];
  rawSecurityLabel: string;
  rawCoverageStatus: string | null;
};

type ProductSecurityCandidate = Pick<
  UiTokenCandidate,
  "observationOnly" | "basicFilterStatus" | "securityLabel" | "finalLabel" | "security"
>;

export function resolveProductSecurityState(
  candidate: ProductSecurityCandidate,
): ProductSecurityResolution {
  const rawSecurityLabel = candidate.securityLabel || "NOT_CHECKED";
  const rawCoverageStatus = candidate.security?.coverageStatus ?? null;
  const checkedAt = validTimestamp(candidate.security?.checkedAt) ? candidate.security!.checkedAt : null;
  const sources = candidate.security?.sources ?? [];
  const label = normalizeSecurityCode(rawSecurityLabel);
  const coverage = normalizeSecurityCode(rawCoverageStatus);

  const result = (state: ProductSecurityState): ProductSecurityResolution => ({
    state,
    checkedAt,
    sources,
    rawSecurityLabel,
    rawCoverageStatus,
  });

  if (candidate.observationOnly || candidate.basicFilterStatus === "rejected_basic_filter") {
    return result("not_invoked");
  }
  if (label === "NOT_CHECKED") return result("not_invoked");
  if (!candidate.security) return result("not_invoked");

  if (coverage === "SECURITY_DATA_UNAVAILABLE" || label === "SECURITY_DATA_UNAVAILABLE") {
    return result("unavailable");
  }
  if (coverage === "PARTIAL_SECURITY_COVERAGE" || label === "PARTIAL_SECURITY_COVERAGE") {
    return result("partial");
  }
  if (!checkedAt) return result("unavailable");
  if (label === "CRITICAL_RISK" || candidate.finalLabel === "CRITICAL_RISK") {
    return result("checked_critical");
  }
  if (label === "NEEDS_MANUAL_VERIFICATION" || candidate.finalLabel === "NEEDS_MANUAL_VERIFICATION") {
    return result("checked_needs_manual_review");
  }
  if (label === "SECURITY_PASSED") return result("checked");
  return result("unavailable");
}

export function isCompletedProductSecurityState(state: ProductSecurityState): boolean {
  return state === "checked" || state === "checked_critical" || state === "checked_needs_manual_review";
}

function normalizeSecurityCode(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase().replaceAll(" ", "_");
}

function validTimestamp(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0 && !Number.isNaN(Date.parse(value));
}
