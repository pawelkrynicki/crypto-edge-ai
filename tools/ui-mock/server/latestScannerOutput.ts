import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export const SCANNER_OUTPUT_UNAVAILABLE = "SCANNER_OUTPUT_UNAVAILABLE";
export const INVALID_SCANNER_OUTPUT = "INVALID_SCANNER_OUTPUT";

export type ScannerOutputErrorCode = typeof SCANNER_OUTPUT_UNAVAILABLE | typeof INVALID_SCANNER_OUTPUT;

export class ScannerOutputError extends Error {
  readonly code: ScannerOutputErrorCode;

  constructor(code: ScannerOutputErrorCode) {
    super(code);
    this.code = code;
  }
}

const fixturePath = resolve("public", "fixtures", "persistableScannerSample.json");

export function buildDataPocOutputPath(runId: string): string {
  return resolve("..", "data-poc", "output", runId, "full_output.json");
}

export async function readLatestScannerOutput(): Promise<unknown> {
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

    return output;
  } catch (error) {
    if (error instanceof ScannerOutputError) {
      throw error;
    }

    throw new ScannerOutputError(INVALID_SCANNER_OUTPUT);
  }
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
