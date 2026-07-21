import type { ProductSourceHealthStatus } from "./productSourceHealth";
import type { ResolvedProductRuntimeMode } from "./runtimeMode";

export const CONTROL_CENTER_STATUSES = [
  "READY",
  "PARTIAL",
  "NOT_READY",
  "MANUAL_CHECK_REQUIRED",
] as const;

export type ControlCenterReadinessStatus = (typeof CONTROL_CENTER_STATUSES)[number];
export type ControlCenterFreshness = "FRESH" | "STALE" | "UNAVAILABLE";

export type ControlCenterReadinessInput = {
  runtime: {
    runtimeMode: ResolvedProductRuntimeMode;
    apiConnected: boolean;
    readiness: "ready" | "degraded" | "not_ready";
    buildSha: string | null;
  };
  scanner: {
    available: boolean;
    generatedAt: string | null;
    freshness: ControlCenterFreshness;
    lastKnownGood: boolean;
    newObservationCount: number;
    establishedAfterFilters: number;
  };
  context: {
    available: boolean;
    generatedAt: string | null;
    freshness: ControlCenterFreshness;
    lastKnownGood: boolean;
  };
  sources: {
    availability: ProductSourceHealthStatus;
    sourceIds: string[];
    affectedSourceIds: string[];
  };
  automation: {
    enabled: boolean;
    active: boolean;
    stateAvailable: boolean;
    lastRunAt: string | null;
    lastResult: "SUCCESS" | "FAILED" | null;
    nextRunAt: string | null;
    nextDueAfterActivation: string | null;
  };
  establishedUniverse: {
    validationStatus: "valid" | "invalid" | "unavailable";
    universeVersion: string | null;
    entriesEnabled: number;
    lastChangeAt: string | null;
  };
  reviewStorage: {
    available: boolean;
    entriesCount: number;
    lastSavedAt: string | null;
  };
  gates: {
    reportsLibraryReady: boolean;
    feedbackCaptureReady: boolean;
    trustedTesterPreviewModeReady: boolean;
    vpsDeploymentConfirmed: boolean;
    cloudflareAccessVerified: boolean;
    rollbackTested: boolean;
    ownerApproved: boolean;
  };
};

export type ControlCenterStatus = {
  schemaVersion: "control_center_status_v1";
  overallStatus: ControlCenterReadinessStatus;
  runtimeApi: ControlCenterReadinessInput["runtime"] & {
    status: ControlCenterReadinessStatus;
    dataStatus: ControlCenterReadinessStatus;
  };
  dataSnapshots: {
    status: ControlCenterReadinessStatus;
    scanner: ControlCenterReadinessInput["scanner"];
    context: ControlCenterReadinessInput["context"];
  };
  sources: ControlCenterReadinessInput["sources"] & {
    status: ControlCenterReadinessStatus;
  };
  automation: ControlCenterReadinessInput["automation"] & {
    status: ControlCenterReadinessStatus;
  };
  establishedUniverse: ControlCenterReadinessInput["establishedUniverse"] & {
    status: ControlCenterReadinessStatus;
  };
  reviewStorage: ControlCenterReadinessInput["reviewStorage"] & {
    status: ControlCenterReadinessStatus;
  };
  reports: {
    status: ControlCenterReadinessStatus;
    libraryReady: boolean;
  };
  accessDeployment: {
    status: ControlCenterReadinessStatus;
    localRuntimeAvailable: boolean;
    vpsDeployment: "CONFIRMED" | "UNCONFIRMED";
    cloudflareAccess: "VERIFIED" | "FINAL_SMOKE_REQUIRED";
    externalTesterAccess: "GO" | "NO_GO";
  };
  feedback: {
    status: ControlCenterReadinessStatus;
    persistentCaptureReady: boolean;
  };
};

/**
 * Canonical readiness resolver. It consumes machine states only; locale and
 * translated presentation copy never participate in readiness decisions.
 */
export function resolveControlCenterStatus(input: ControlCenterReadinessInput): ControlCenterStatus {
  const dataStatus = resolveDataStatus(input.scanner, input.context);
  const runtimeStatus = !input.runtime.apiConnected || input.runtime.readiness === "not_ready"
    ? "NOT_READY"
    : input.runtime.readiness === "degraded"
      ? "PARTIAL"
      : "READY";
  const sourceStatus = input.sources.availability === "available"
    ? "READY"
    : input.sources.availability === "partial"
      ? "PARTIAL"
      : "NOT_READY";
  const automationStatus = !input.automation.enabled
    ? "MANUAL_CHECK_REQUIRED"
    : !input.automation.stateAvailable || input.automation.lastResult === "FAILED"
      ? "PARTIAL"
      : "READY";
  const universeStatus = input.establishedUniverse.validationStatus === "valid"
    ? "READY"
    : "NOT_READY";
  const reviewStorageStatus = input.reviewStorage.available ? "READY" : "NOT_READY";
  const reportsStatus = input.gates.reportsLibraryReady ? "READY" : "NOT_READY";
  const feedbackStatus = input.gates.feedbackCaptureReady ? "READY" : "NOT_READY";
  const externalTesterReady = input.gates.trustedTesterPreviewModeReady
    && input.gates.vpsDeploymentConfirmed
    && input.gates.cloudflareAccessVerified
    && input.gates.rollbackTested
    && input.gates.ownerApproved;
  const accessStatus = input.runtime.apiConnected && externalTesterReady ? "READY" : "NOT_READY";
  const sectionStatuses: ControlCenterReadinessStatus[] = [
    runtimeStatus,
    dataStatus,
    sourceStatus,
    automationStatus,
    universeStatus,
    reviewStorageStatus,
    reportsStatus,
    accessStatus,
    feedbackStatus,
  ];

  return {
    schemaVersion: "control_center_status_v1",
    overallStatus: highestSeverity(sectionStatuses),
    runtimeApi: {
      ...input.runtime,
      status: runtimeStatus,
      dataStatus,
    },
    dataSnapshots: {
      status: dataStatus,
      scanner: input.scanner,
      context: input.context,
    },
    sources: { ...input.sources, status: sourceStatus },
    automation: { ...input.automation, status: automationStatus },
    establishedUniverse: { ...input.establishedUniverse, status: universeStatus },
    reviewStorage: { ...input.reviewStorage, status: reviewStorageStatus },
    reports: {
      status: reportsStatus,
      libraryReady: input.gates.reportsLibraryReady,
    },
    accessDeployment: {
      status: accessStatus,
      localRuntimeAvailable: input.runtime.apiConnected,
      vpsDeployment: input.gates.vpsDeploymentConfirmed ? "CONFIRMED" : "UNCONFIRMED",
      cloudflareAccess: input.gates.cloudflareAccessVerified ? "VERIFIED" : "FINAL_SMOKE_REQUIRED",
      externalTesterAccess: externalTesterReady ? "GO" : "NO_GO",
    },
    feedback: {
      status: feedbackStatus,
      persistentCaptureReady: input.gates.feedbackCaptureReady,
    },
  };
}

function resolveDataStatus(
  scanner: ControlCenterReadinessInput["scanner"],
  context: ControlCenterReadinessInput["context"],
): ControlCenterReadinessStatus {
  if (!scanner.available) return "NOT_READY";
  if (
    scanner.freshness === "STALE"
    || !context.available
    || context.freshness === "STALE"
  ) return "PARTIAL";
  return "READY";
}

function highestSeverity(statuses: ControlCenterReadinessStatus[]): ControlCenterReadinessStatus {
  if (statuses.includes("NOT_READY")) return "NOT_READY";
  if (statuses.includes("PARTIAL")) return "PARTIAL";
  if (statuses.includes("MANUAL_CHECK_REQUIRED")) return "MANUAL_CHECK_REQUIRED";
  return "READY";
}
