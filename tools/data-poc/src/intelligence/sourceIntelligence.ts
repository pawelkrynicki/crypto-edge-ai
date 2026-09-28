import type { CanonicalAssetIdentity } from "../discovery/canonicalCandidate.js";

export const CRYPTO_EDGE_SOURCE_INTELLIGENCE_OBSERVATION_SCHEMA_VERSION = "crypto_edge_source_intelligence_observation_v1" as const;
export const SOURCE_INTELLIGENCE_OBSERVED_AT_INVALID = "SOURCE_INTELLIGENCE_OBSERVED_AT_INVALID" as const;
export const SOURCE_INTELLIGENCE_IDENTITY_INVALID = "SOURCE_INTELLIGENCE_IDENTITY_INVALID" as const;
export const SOURCE_INTELLIGENCE_SOURCE_INVALID = "SOURCE_INTELLIGENCE_SOURCE_INVALID" as const;
export const SOURCE_INTELLIGENCE_EVIDENCE_INVALID = "SOURCE_INTELLIGENCE_EVIDENCE_INVALID" as const;
export const SOURCE_INTELLIGENCE_OBSERVATION_INVALID = "SOURCE_INTELLIGENCE_OBSERVATION_INVALID" as const;

const ISO_TIMESTAMP_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

export const SOURCE_INTELLIGENCE_DOMAINS = [
  "security",
  "contract",
  "ownership",
  "liquidity",
  "holders",
  "market",
  "social",
  "onchain",
  "team",
  "other",
] as const;

const OBSERVATION_STATUSES = ["READY", "DEGRADED", "UNAVAILABLE"] as const;
const EVIDENCE_STATUSES = ["OBSERVED", "UNKNOWN", "UNAVAILABLE"] as const;

export type SourceIntelligenceDomain = (typeof SOURCE_INTELLIGENCE_DOMAINS)[number];
export type SourceIntelligenceObservationStatus = (typeof OBSERVATION_STATUSES)[number];
export type SourceIntelligenceEvidenceStatus = (typeof EVIDENCE_STATUSES)[number];
export type SourceIntelligenceEvidenceValue = string | number | boolean | null;

export type SourceIntelligenceSource = {
  source_id: string;
  source_name: string | null;
  source_url: string | null;
  provider_record_id: string | null;
};

export type SourceIntelligenceEvidenceItem = {
  key: string;
  domain: SourceIntelligenceDomain;
  value: SourceIntelligenceEvidenceValue;
  unit: string | null;
  status: SourceIntelligenceEvidenceStatus;
  reason_code: string | null;
  source_reference: string | null;
};

export type SourceIntelligenceObservationInput = {
  identity: CanonicalAssetIdentity;
  source: SourceIntelligenceSource;
  observed_at: string;
  status: SourceIntelligenceObservationStatus;
  reason_codes: string[];
  evidence: SourceIntelligenceEvidenceItem[];
};

/** Source evidence only; it intentionally carries no decision, score, or confidence field. */
export type SourceIntelligenceObservation = {
  schema_version: typeof CRYPTO_EDGE_SOURCE_INTELLIGENCE_OBSERVATION_SCHEMA_VERSION;
  identity: CanonicalAssetIdentity;
  source: SourceIntelligenceSource;
  observed_at: string;
  status: SourceIntelligenceObservationStatus;
  reason_codes: string[];
  evidence: SourceIntelligenceEvidenceItem[];
};

/**
 * Validates and creates one source-specific asset observation. The builder is
 * pure: it neither enriches evidence nor makes policy, risk, or trading decisions.
 */
export function createSourceIntelligenceObservation(
  input: SourceIntelligenceObservationInput,
): SourceIntelligenceObservation {
  if (!isRecord(input)) throw new Error(SOURCE_INTELLIGENCE_OBSERVATION_INVALID);

  return {
    schema_version: CRYPTO_EDGE_SOURCE_INTELLIGENCE_OBSERVATION_SCHEMA_VERSION,
    identity: validateIdentity(input.identity),
    source: validateSource(input.source),
    observed_at: validateObservedAt(input.observed_at),
    status: validateObservationStatus(input.status),
    reason_codes: validateReasonCodes(input.reason_codes),
    evidence: validateEvidence(input.evidence),
  };
}

function validateIdentity(value: unknown): CanonicalAssetIdentity {
  if (!isRecord(value) || !isNonBlankString(value.chain)) throw new Error(SOURCE_INTELLIGENCE_IDENTITY_INVALID);
  if (value.contract_or_mint !== null && !isNonBlankString(value.contract_or_mint)) {
    throw new Error(SOURCE_INTELLIGENCE_IDENTITY_INVALID);
  }
  return {
    chain: value.chain,
    contract_or_mint: value.contract_or_mint,
  };
}

function validateSource(value: unknown): SourceIntelligenceSource {
  if (!isRecord(value) || !isNonBlankString(value.source_id)) throw new Error(SOURCE_INTELLIGENCE_SOURCE_INVALID);
  if (!isNullableString(value.source_name) || !isNullableString(value.source_url) || !isNullableString(value.provider_record_id)) {
    throw new Error(SOURCE_INTELLIGENCE_SOURCE_INVALID);
  }
  return {
    source_id: value.source_id,
    source_name: value.source_name,
    source_url: value.source_url,
    provider_record_id: value.provider_record_id,
  };
}

function validateObservedAt(value: unknown): string {
  if (typeof value !== "string") throw new Error(SOURCE_INTELLIGENCE_OBSERVED_AT_INVALID);
  const match = ISO_TIMESTAMP_PATTERN.exec(value);
  if (!match) throw new Error(SOURCE_INTELLIGENCE_OBSERVED_AT_INVALID);

  const [, yearText, monthText, dayText, hourText, minuteText, secondText, timezone] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new Error(SOURCE_INTELLIGENCE_OBSERVED_AT_INVALID);
  }
  if (hour > 23 || minute > 59 || second > 59 || !hasValidOffset(timezone)) {
    throw new Error(SOURCE_INTELLIGENCE_OBSERVED_AT_INVALID);
  }
  if (Number.isNaN(new Date(value).getTime())) throw new Error(SOURCE_INTELLIGENCE_OBSERVED_AT_INVALID);
  return value;
}

function validateObservationStatus(value: unknown): SourceIntelligenceObservationStatus {
  if (!isObservationStatus(value)) throw new Error(SOURCE_INTELLIGENCE_OBSERVATION_INVALID);
  return value;
}

function validateReasonCodes(value: unknown): string[] {
  if (!Array.isArray(value) || hasSparseArrayHoles(value) || value.some((reasonCode) => typeof reasonCode !== "string")) {
    throw new Error(SOURCE_INTELLIGENCE_OBSERVATION_INVALID);
  }
  return [...new Set(value)].sort();
}

function validateEvidence(value: unknown): SourceIntelligenceEvidenceItem[] {
  if (!Array.isArray(value) || hasSparseArrayHoles(value)) throw new Error(SOURCE_INTELLIGENCE_EVIDENCE_INVALID);
  return value.map((item) => validateEvidenceItem(item));
}

function validateEvidenceItem(value: unknown): SourceIntelligenceEvidenceItem {
  if (!isRecord(value) || !isEvidenceKey(value.key) || !isSourceIntelligenceDomain(value.domain)) {
    throw new Error(SOURCE_INTELLIGENCE_EVIDENCE_INVALID);
  }
  if (!isEvidenceValue(value.value) || !isNullableString(value.unit) || !isEvidenceStatus(value.status)
    || !isNullableString(value.reason_code) || !isNullableString(value.source_reference)) {
    throw new Error(SOURCE_INTELLIGENCE_EVIDENCE_INVALID);
  }
  if ((value.status === "OBSERVED" && value.value === null)
    || (value.status !== "OBSERVED" && value.value !== null)) {
    throw new Error(SOURCE_INTELLIGENCE_EVIDENCE_INVALID);
  }
  return {
    key: value.key,
    domain: value.domain,
    value: value.value,
    unit: value.unit,
    status: value.status,
    reason_code: value.reason_code,
    source_reference: value.source_reference,
  };
}

function hasValidOffset(timezone: string): boolean {
  if (timezone === "Z") return true;
  const [offsetHourText, offsetMinuteText] = timezone.slice(1).split(":");
  const offsetHour = Number(offsetHourText);
  const offsetMinute = Number(offsetMinuteText);
  return offsetMinute <= 59 && (offsetHour < 14 || (offsetHour === 14 && offsetMinute === 0));
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [31, 0, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 0;
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasSparseArrayHoles(value: unknown[]): boolean {
  for (let index = 0; index < value.length; index += 1) {
    if (!(index in value)) return true;
  }
  return false;
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isEvidenceKey(value: unknown): value is string {
  return isNonBlankString(value) && value === value.trim();
}

function isSourceIntelligenceDomain(value: unknown): value is SourceIntelligenceDomain {
  return typeof value === "string" && (SOURCE_INTELLIGENCE_DOMAINS as readonly string[]).includes(value);
}

function isEvidenceStatus(value: unknown): value is SourceIntelligenceEvidenceStatus {
  return typeof value === "string" && (EVIDENCE_STATUSES as readonly string[]).includes(value);
}

function isObservationStatus(value: unknown): value is SourceIntelligenceObservationStatus {
  return typeof value === "string" && (OBSERVATION_STATUSES as readonly string[]).includes(value);
}

function isEvidenceValue(value: unknown): value is SourceIntelligenceEvidenceValue {
  return value === null || typeof value === "string" || typeof value === "boolean"
    || (typeof value === "number" && Number.isFinite(value));
}
