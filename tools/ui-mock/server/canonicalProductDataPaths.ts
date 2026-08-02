import { basename, dirname, resolve } from "node:path";
import {
  resolveCanonicalDataPaths,
  type DataCycleCanonicalPaths,
} from "../../data-poc/src/automation/dataCycleOperations.js";

export type CanonicalProductDataPaths = {
  automationStatePath: string;
  outputDirPath: string;
  scannerRunId: string | null;
  contextRunId: string | null;
};

export async function resolveCanonicalProductDataPaths(
  resolver: () => Promise<DataCycleCanonicalPaths> = resolveCanonicalDataPaths,
): Promise<CanonicalProductDataPaths> {
  const canonical = await resolver();
  const dataPocRoot = resolve(dirname(canonical.automation_state), "..", "..");
  const outputDirPath = resolve(dataPocRoot, "output");

  return {
    automationStatePath: canonical.automation_state,
    outputDirPath,
    scannerRunId: runIdFromCanonicalSnapshot(canonical.scanner_snapshot, outputDirPath, "full_output.json"),
    contextRunId: runIdFromCanonicalSnapshot(
      canonical.context_snapshot,
      outputDirPath,
      "approved_sources_output.json",
    ),
  };
}

function runIdFromCanonicalSnapshot(
  snapshotPath: string | null,
  outputDirPath: string,
  expectedFilename: string,
): string | null {
  if (snapshotPath === null) return null;
  const resolvedSnapshot = resolve(snapshotPath);
  const runDirectory = dirname(resolvedSnapshot);
  if (
    !samePath(dirname(runDirectory), outputDirPath)
    || basename(resolvedSnapshot) !== expectedFilename
  ) {
    throw new Error("CANONICAL_SNAPSHOT_PATH_INVALID");
  }
  const runId = basename(runDirectory);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(runId)) {
    throw new Error("CANONICAL_SNAPSHOT_RUN_ID_INVALID");
  }
  return runId;
}

function samePath(left: string, right: string): boolean {
  const resolvedLeft = resolve(left);
  const resolvedRight = resolve(right);
  return process.platform === "win32"
    ? resolvedLeft.toLowerCase() === resolvedRight.toLowerCase()
    : resolvedLeft === resolvedRight;
}
