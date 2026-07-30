import { mapPersistableScannerOutputToUiCandidates } from "./adapters/scannerOutputAdapter";
import type {
  ResolvedScannerSource,
  ScannerDataSourceLoadResult,
} from "./services/scannerDataSource";
import type {
  ScannerApiOutput,
  ScannerDiscoveryMetadata,
  UiTokenCandidate,
} from "./types/scannerTypes";

export type ProductScannerViewState = {
  hasAcceptedSnapshot: boolean;
  candidates: UiTokenCandidate[];
  resolvedSource: ResolvedScannerSource;
  runId: string | null;
  generatedAt: string | null;
  viewRefreshedAt: string | null;
  ageSeconds: number | null;
  freshnessStatus: "FRESH" | "STALE" | null;
  sourceIds: string[];
  metadata: ScannerDiscoveryMetadata | null;
  reasonCode: string | null;
  unavailableMessage: string | null;
  lastKnownGoodRefreshError: boolean;
};

export function createEmptyProductScannerViewState(): ProductScannerViewState {
  return {
    hasAcceptedSnapshot: false,
    candidates: [],
    resolvedSource: "unavailable",
    runId: null,
    generatedAt: null,
    viewRefreshedAt: null,
    ageSeconds: null,
    freshnessStatus: null,
    sourceIds: [],
    metadata: null,
    reasonCode: null,
    unavailableMessage: null,
    lastKnownGoodRefreshError: false,
  };
}

export function resolveProductScannerRefreshState(
  current: ProductScannerViewState,
  result: ScannerDataSourceLoadResult,
  refreshedAt: string,
): ProductScannerViewState {
  if (result.status === "error") {
    if (current.hasAcceptedSnapshot) {
      return {
        ...current,
        lastKnownGoodRefreshError: true,
      };
    }
    return {
      ...createEmptyProductScannerViewState(),
      reasonCode: result.reasonCode,
      unavailableMessage: result.error,
    };
  }

  const output = result.output;
  const timestamps = getAcceptedProductRefreshTimestamps(output, refreshedAt);
  return {
    hasAcceptedSnapshot: true,
    candidates: mapPersistableScannerOutputToUiCandidates(output),
    resolvedSource: result.resolvedSource,
    runId: output.scan_run.run_id ?? null,
    generatedAt: timestamps.generatedAt,
    viewRefreshedAt: timestamps.viewRefreshedAt,
    ageSeconds: output._source_meta?.age_seconds ?? null,
    freshnessStatus: output._source_meta?.freshness_status ?? null,
    sourceIds: output._source_meta?.source_ids ?? output.provenance?.source_ids ?? [],
    metadata: output.provenance?.metadata ?? null,
    reasonCode: null,
    unavailableMessage: null,
    lastKnownGoodRefreshError: false,
  };
}

export function resolveScannerSnapshotTimestamp(output: ScannerApiOutput): string | null {
  return output.provenance?.generated_at ?? output.scan_run.finished_at ?? null;
}

export function getAcceptedProductRefreshTimestamps(
  output: ScannerApiOutput,
  viewRefreshedAt: string,
): { generatedAt: string | null; viewRefreshedAt: string } {
  return {
    generatedAt: resolveScannerSnapshotTimestamp(output),
    viewRefreshedAt,
  };
}
