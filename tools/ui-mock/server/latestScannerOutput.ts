import { access, readFile, readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";

export const SCANNER_OUTPUT_UNAVAILABLE = "SCANNER_OUTPUT_UNAVAILABLE";
export const INVALID_SCANNER_OUTPUT = "INVALID_SCANNER_OUTPUT";

export type ScannerOutputErrorCode = typeof SCANNER_OUTPUT_UNAVAILABLE | typeof INVALID_SCANNER_OUTPUT;

export type ScannerOutputSource = "real-output" | "fixture-fallback";

type SourceMeta = {
  source: ScannerOutputSource;
  path: string;
  reason: string;
  selected_run_id: string | null;
  loaded_at: string;
};

type ScannerOutputWithMeta = Record<string, unknown> & {
  _source_meta: SourceMeta;
};

type CandidateRun = {
  run_id: string;
  full_output_path: string;
  finished_at: string | null;
  started_at: string | null;
  mtime: string;
  valid: boolean;
  validation_error: string | null;
  sort_time: number;
  output: unknown | null;
};

export type ScannerSourcesDiagnostics = {
  output_dir_exists: boolean;
  output_dir_path: string;
  runs_found: number;
  full_output_files_found: number;
  latest_full_output_path: string | null;
  fixture_fallback_available: boolean;
  fixture_path: string;
  runs: Array<Omit<CandidateRun, "sort_time" | "output">>;
};

export class ScannerOutputError extends Error {
  readonly code: ScannerOutputErrorCode;

  constructor(code: ScannerOutputErrorCode) {
    super(code);
    this.code = code;
  }
}

const fixturePath = resolve("public", "fixtures", "persistableScannerSample.json");
const outputDirPath = resolve("..", "data-poc", "output");

export function buildDataPocOutputPath(runId: string): string {
  return resolve(outputDirPath, runId, "full_output.json");
}

export async function readLatestScannerOutput(): Promise<ScannerOutputWithMeta> {
  const candidates = await findCandidateRuns();
  const latestValid = candidates.find((candidate) => candidate.valid && candidate.output);

  if (latestValid?.output) {
    return withSourceMeta(latestValid.output, {
      source: "real-output",
      path: latestValid.full_output_path,
      reason: "latest valid tools/data-poc output selected",
      selected_run_id: latestValid.run_id,
      loaded_at: new Date().toISOString(),
    });
  }

  const reason = candidates.length === 0
    ? "no real scanner output found"
    : "no valid real scanner output found";

  return readFixtureOutput(reason);
}

export async function getScannerSourcesDiagnostics(): Promise<ScannerSourcesDiagnostics> {
  const outputDirExists = await pathExists(outputDirPath);
  const candidates = await findCandidateRuns();

  return {
    output_dir_exists: outputDirExists,
    output_dir_path: outputDirPath,
    runs_found: outputDirExists ? await countRunDirectories() : 0,
    full_output_files_found: candidates.length,
    latest_full_output_path: candidates[0]?.full_output_path ?? null,
    fixture_fallback_available: await pathExists(fixturePath),
    fixture_path: fixturePath,
    runs: candidates.slice(0, 10).map(({ sort_time, output, ...candidate }) => candidate),
  };
}

export function isPersistableScannerOutputShape(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }

  const output = value as Record<string, unknown>;

  return Boolean(output.scan_run)
    && Array.isArray(output.candidates)
    && Array.isArray(output.security_checks)
    && Array.isArray(output.scorecards);
}

async function readFixtureOutput(reason: string): Promise<ScannerOutputWithMeta> {
  let raw: string;

  try {
    raw = await readFile(fixturePath, "utf8");
  } catch {
    throw new ScannerOutputError(SCANNER_OUTPUT_UNAVAILABLE);
  }

  try {
    const output: unknown = JSON.parse(raw);

    if (!isPersistableScannerOutputShape(output)) {
      throw new ScannerOutputError(INVALID_SCANNER_OUTPUT);
    }

    return withSourceMeta(output, {
      source: "fixture-fallback",
      path: fixturePath,
      reason,
      selected_run_id: null,
      loaded_at: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof ScannerOutputError) {
      throw error;
    }

    throw new ScannerOutputError(INVALID_SCANNER_OUTPUT);
  }
}

async function findCandidateRuns(): Promise<CandidateRun[]> {
  try {
    const entries = await readdir(outputDirPath, { withFileTypes: true });
    const runs = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => inspectRunDirectory(entry.name)),
    );

    return runs
      .filter((run): run is CandidateRun => Boolean(run))
      .sort((a, b) => b.sort_time - a.sort_time);
  } catch {
    return [];
  }
}

async function inspectRunDirectory(runId: string): Promise<CandidateRun | null> {
  const fullOutputPath = buildDataPocOutputPath(runId);

  try {
    const fileStat = await stat(fullOutputPath);
    const raw = await readFile(fullOutputPath, "utf8");
    const output: unknown = JSON.parse(raw);
    const timestamps = extractScanRunTimestamps(output);
    const validationError = isPersistableScannerOutputShape(output)
      ? null
      : "Scanner output does not match expected PersistableScannerOutput shape";

    return {
      run_id: runId,
      full_output_path: fullOutputPath,
      finished_at: timestamps.finished_at,
      started_at: timestamps.started_at,
      mtime: fileStat.mtime.toISOString(),
      valid: validationError === null,
      validation_error: validationError,
      sort_time: timestampToSortTime(timestamps.finished_at, timestamps.started_at, fileStat.mtime),
      output: validationError === null ? output : null,
    };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return null;
    }

    const fallbackStat = await statSafe(fullOutputPath);

    return {
      run_id: runId,
      full_output_path: fullOutputPath,
      finished_at: null,
      started_at: null,
      mtime: fallbackStat?.mtime.toISOString() ?? new Date(0).toISOString(),
      valid: false,
      validation_error: "Scanner output file could not be read or parsed",
      sort_time: fallbackStat?.mtime.getTime() ?? 0,
      output: null,
    };
  }
}

function extractScanRunTimestamps(output: unknown): { finished_at: string | null; started_at: string | null } {
  if (!output || typeof output !== "object") {
    return { finished_at: null, started_at: null };
  }

  const scanRun = (output as Record<string, unknown>).scan_run;

  if (!scanRun || typeof scanRun !== "object") {
    return { finished_at: null, started_at: null };
  }

  const scanRunRecord = scanRun as Record<string, unknown>;

  return {
    finished_at: typeof scanRunRecord.finished_at === "string" ? scanRunRecord.finished_at : null,
    started_at: typeof scanRunRecord.started_at === "string" ? scanRunRecord.started_at : null,
  };
}

function timestampToSortTime(finishedAt: string | null, startedAt: string | null, mtime: Date): number {
  for (const value of [finishedAt, startedAt]) {
    if (!value) continue;

    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return mtime.getTime();
}

function withSourceMeta(output: unknown, meta: SourceMeta): ScannerOutputWithMeta {
  if (!output || typeof output !== "object") {
    throw new ScannerOutputError(INVALID_SCANNER_OUTPUT);
  }

  return {
    ...(output as Record<string, unknown>),
    _source_meta: meta,
  };
}

async function countRunDirectories(): Promise<number> {
  try {
    const entries = await readdir(outputDirPath, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).length;
  } catch {
    return 0;
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function statSafe(path: string) {
  try {
    return await stat(path);
  } catch {
    return null;
  }
}
