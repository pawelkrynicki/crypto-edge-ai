import { CONTEXT_SOURCE_IDS, type ContextSourceId } from "./internalBetaContextCollection.js";

export const SCANNER_CONTEXT_PROVENANCE_CONTRACT_VERSION = "scanner_context_provenance_v1";

export type ScannerContextSourceMode = "REFRESHED" | "REUSED_VALIDATED";

export type ScannerContextSourceProvenance = {
  mode: ScannerContextSourceMode;
  refreshed_in_cycle: boolean;
  validated_context_run_id: string;
};

export type ScannerContextProvenance = {
  contract_version: typeof SCANNER_CONTEXT_PROVENANCE_CONTRACT_VERSION;
  linked_context_run_id: string;
  linked_context_validation_status: "VALIDATED";
  sources: Record<ContextSourceId, ScannerContextSourceProvenance>;
};

export function buildScannerContextProvenance(input: {
  linkedContextRunId: string;
  previousValidatedContextRunId: string | null;
  requestCounts: Record<ContextSourceId, number>;
  refreshedSourceIds: ContextSourceId[];
}): ScannerContextProvenance {
  assertRunId(input.linkedContextRunId);
  const refreshed = new Set(input.refreshedSourceIds);
  const sources = Object.fromEntries(CONTEXT_SOURCE_IDS.map((sourceId) => {
    const requestCount = input.requestCounts[sourceId];
    if (refreshed.has(sourceId)) {
      if (requestCount < 1 || requestCount > 2) throw new Error("SCANNER_CONTEXT_PROVENANCE_INVALID");
      return [sourceId, {
        mode: "REFRESHED",
        refreshed_in_cycle: true,
        validated_context_run_id: input.linkedContextRunId,
      } satisfies ScannerContextSourceProvenance];
    }
    if (requestCount !== 0 || input.previousValidatedContextRunId === null) {
      throw new Error("SCANNER_CONTEXT_PROVENANCE_INVALID");
    }
    assertRunId(input.previousValidatedContextRunId);
    return [sourceId, {
      mode: "REUSED_VALIDATED",
      refreshed_in_cycle: false,
      validated_context_run_id: input.previousValidatedContextRunId,
    } satisfies ScannerContextSourceProvenance];
  })) as Record<ContextSourceId, ScannerContextSourceProvenance>;

  return {
    contract_version: SCANNER_CONTEXT_PROVENANCE_CONTRACT_VERSION,
    linked_context_run_id: input.linkedContextRunId,
    linked_context_validation_status: "VALIDATED",
    sources,
  };
}

function assertRunId(value: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)) {
    throw new Error("SCANNER_CONTEXT_PROVENANCE_INVALID");
  }
}
