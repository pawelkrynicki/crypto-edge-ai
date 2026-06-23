import { PERSISTABLE_SCANNER_SAMPLE } from "../fixtures/persistableScannerSample";
import type { PersistableScannerOutput, ScannerApiOutput } from "../types/scannerTypes";

export type DataSourceKey = "fixture" | "static-json" | "api";
export type ResolvedScannerSource =
  | "built-in-fixture"
  | "static-json"
  | "real-output"
  | "fixture-fallback";

export interface ScannerDataSourceResult {
  source: DataSourceKey;
  resolvedSource: ResolvedScannerSource;
  usedFallback: boolean;
  fallbackReason?: string;
  output: PersistableScannerOutput;
}

function fixtureResult(): ScannerDataSourceResult {
  return {
    source: "fixture",
    resolvedSource: "built-in-fixture",
    usedFallback: false,
    output: PERSISTABLE_SCANNER_SAMPLE,
  };
}

function fallbackResult(reason: string): ScannerDataSourceResult {
  return {
    source: "fixture",
    resolvedSource: "built-in-fixture",
    usedFallback: true,
    fallbackReason: reason,
    output: PERSISTABLE_SCANNER_SAMPLE,
  };
}

async function fetchJson(url: string): Promise<ScannerApiOutput> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} - ${url}`);
  }

  return res.json() as Promise<ScannerApiOutput>;
}

export function interpretScannerApiOutput(output: ScannerApiOutput): ScannerDataSourceResult {
  const meta = output._source_meta;

  if (meta?.source === "real-output") {
    return {
      source: "api",
      resolvedSource: "real-output",
      usedFallback: false,
      output,
    };
  }

  return {
    source: "api",
    resolvedSource: "fixture-fallback",
    usedFallback: true,
    fallbackReason: meta?.reason ?? "API response did not include scanner source metadata.",
    output,
  };
}

export async function loadScannerDataSourceResult(
  source: DataSourceKey,
): Promise<ScannerDataSourceResult> {
  switch (source) {
    case "fixture":
      return fixtureResult();

    case "static-json": {
      try {
        const output = await fetchJson("/fixtures/persistableScannerSample.json");
        return {
          source: "static-json",
          resolvedSource: "static-json",
          usedFallback: false,
          output,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return fallbackResult(`Static JSON not available: ${msg}`);
      }
    }

    case "api": {
      try {
        const apiBaseUrl = import.meta.env.VITE_SCANNER_API_URL?.replace(/\/$/, "") ?? "";
        const output = await fetchJson(`${apiBaseUrl}/api/scanner/latest`);
        return interpretScannerApiOutput(output);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return fallbackResult(`API not available: ${msg}`);
      }
    }
  }
}
