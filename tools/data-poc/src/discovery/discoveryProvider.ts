import type { CanonicalCandidateObservation } from "./canonicalCandidate.js";

export const CRYPTO_EDGE_PROVIDER_DISCOVERY_BATCH_SCHEMA_VERSION = "crypto_edge_provider_discovery_batch_v1" as const;
export const DISCOVERY_PROVIDER_OBSERVED_AT_INVALID = "DISCOVERY_PROVIDER_OBSERVED_AT_INVALID" as const;

const ISO_TIMESTAMP_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

export type DiscoveryRequest = {
  environment: string;
  observed_at: string;
};

export type ProviderDiscoveryDiagnostics = {
  status: "READY" | "DEGRADED";
  records_received: number;
  records_emitted: number;
  reason_codes: string[];
};

export type ProviderDiscoveryBatch = {
  schema_version: typeof CRYPTO_EDGE_PROVIDER_DISCOVERY_BATCH_SCHEMA_VERSION;
  provider_id: string;
  observed_at: string;
  candidates: CanonicalCandidateObservation[];
  diagnostics: ProviderDiscoveryDiagnostics;
};

export type DiscoveryProvider = {
  readonly id: string;
  discover(input: DiscoveryRequest): Promise<ProviderDiscoveryBatch>;
};

export class DiscoveryProviderObservedAtError extends Error {
  readonly code = DISCOVERY_PROVIDER_OBSERVED_AT_INVALID;

  constructor() {
    super(DISCOVERY_PROVIDER_OBSERVED_AT_INVALID);
    this.name = "DiscoveryProviderObservedAtError";
  }
}

/**
 * Parses an explicit ISO timestamp for providers without substituting any
 * implicit current time. The original string remains the batch timestamp.
 */
export function parseDiscoveryObservedAt(observedAt: string): Date {
  if (typeof observedAt !== "string" || !isIsoTimestamp(observedAt)) {
    throw new DiscoveryProviderObservedAtError();
  }

  const date = new Date(observedAt);
  if (Number.isNaN(date.getTime())) throw new DiscoveryProviderObservedAtError();
  return date;
}

function isIsoTimestamp(value: string): boolean {
  const match = ISO_TIMESTAMP_PATTERN.exec(value);
  if (!match) return false;

  const [, yearText, monthText, dayText, hourText, minuteText, secondText, timezone] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return false;
  if (hour > 23 || minute > 59 || second > 59) return false;

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
