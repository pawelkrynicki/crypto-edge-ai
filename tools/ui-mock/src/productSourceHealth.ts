import {
  PRODUCT_TRANSLATIONS,
  type ProductLocale,
} from "./productI18n";
import type {
  ProductReadinessOutput,
  ScannerDiscoveryMetadata,
} from "./types/scannerTypes";

const VALID_SOURCE_STATES = new Set(["READY", "DEGRADED", "UNAVAILABLE", "NOT_INVOKED"]);
const PARTIAL_SOURCE_STATES = new Set(["DEGRADED", "UNAVAILABLE"]);

export type ProductSourceHealthStatus = "available" | "partial" | "unavailable";

export type ProductSourceHealthResolution = {
  status: ProductSourceHealthStatus;
  detailSourceIds: string[];
  basis: "metadata" | "readiness" | "unavailable";
};

export type ProductSourceHealthPresentation = {
  status: ProductSourceHealthStatus;
  value: string;
  detail: string;
  tone: "ready" | "warning";
};

export function resolveProductSourceHealth({
  metadata,
  readiness,
  sourceIds,
}: {
  metadata?: ScannerDiscoveryMetadata | null;
  readiness?: ProductReadinessOutput | null;
  sourceIds?: string[];
}): ProductSourceHealthResolution {
  const acceptedSourceIds = unique(sourceIds ?? []);
  const detailedHealth = Object.entries(metadata?.source_health ?? {});

  if (detailedHealth.length > 0) {
    const invalidSourceIds = detailedHealth
      .filter(([, state]) => !VALID_SOURCE_STATES.has(state))
      .map(([sourceId]) => sourceId);
    if (invalidSourceIds.length > 0) {
      return { status: "unavailable", detailSourceIds: invalidSourceIds, basis: "unavailable" };
    }

    const affectedSourceIds = detailedHealth
      .filter(([, state]) => PARTIAL_SOURCE_STATES.has(state))
      .map(([sourceId]) => sourceId);
    const usableSourceIds = detailedHealth
      .filter(([, state]) => state === "READY" || state === "DEGRADED")
      .map(([sourceId]) => sourceId);
    if (usableSourceIds.length === 0) {
      return { status: "unavailable", detailSourceIds: affectedSourceIds, basis: "metadata" };
    }
    if (affectedSourceIds.length > 0) {
      return { status: "partial", detailSourceIds: affectedSourceIds, basis: "metadata" };
    }

    const readySourceIds = detailedHealth
      .filter(([, state]) => state === "READY")
      .map(([sourceId]) => sourceId);
    const confirmedSourceIds = unique([...acceptedSourceIds, ...readySourceIds]);
    return confirmedSourceIds.length > 0
      ? { status: "available", detailSourceIds: confirmedSourceIds, basis: "metadata" }
      : { status: "unavailable", detailSourceIds: [], basis: "unavailable" };
  }

  if (!readiness?.scanner.ready || acceptedSourceIds.length === 0) {
    return { status: "unavailable", detailSourceIds: [], basis: "unavailable" };
  }

  const discoveryStatus = readiness.discovery.new_emerging.status;
  const discoveryAffected = discoveryStatus === "degraded" || discoveryStatus === "unavailable";
  const contextAffected = readiness.context.ready === false
    || readiness.discovery.context?.ready === false;
  const sourceReasonReported = readiness.reason_codes.some(isNonBlockingSourceReason);
  if (discoveryAffected || contextAffected || sourceReasonReported) {
    const affectedSourceIds = discoveryAffected && acceptedSourceIds.includes("dexscreener")
      ? ["dexscreener"]
      : [];
    return { status: "partial", detailSourceIds: affectedSourceIds, basis: "readiness" };
  }

  return { status: "available", detailSourceIds: acceptedSourceIds, basis: "readiness" };
}

export function presentProductSourceHealth(
  resolution: ProductSourceHealthResolution,
  locale: ProductLocale,
  surface: "header" | "summary",
): ProductSourceHealthPresentation {
  const copy = PRODUCT_TRANSLATIONS[locale];
  const value = resolution.status === "partial"
    ? copy[surface === "header" ? "status.partiallyAvailable" : "status.partial"]
    : resolution.status === "available"
      ? copy["status.available"]
      : copy["status.unavailable"];
  return {
    status: resolution.status,
    value,
    detail: resolution.detailSourceIds.join(", ") || copy["status.sourceDetailsUnavailable"],
    tone: resolution.status === "available" ? "ready" : "warning",
  };
}

function isNonBlockingSourceReason(reasonCode: string): boolean {
  return reasonCode.startsWith("CONTEXT_")
    || reasonCode.startsWith("DEXSCREENER_")
    || reasonCode === "NEW_EMERGING_DEGRADED";
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
