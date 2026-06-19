// ─────────────────────────────────────────────────────────────────────────────
// scannerDataSource.ts
// Local JSON / API Bridge for Crypto Edge AI Camp BETA UI.
//
// Three data sources:
//   "fixture"     — returns the built-in TypeScript fixture (always available)
//   "static-json" — fetches /fixtures/persistableScannerSample.json at runtime
//   "api"         — fetches /api/scanner/latest (future placeholder)
//                   if the fetch fails, falls back to fixture and sets usedFallback=true
//
// No real backend, no database, no live API calls to external services.
// ─────────────────────────────────────────────────────────────────────────────

import type { PersistableScannerOutput } from "../types/scannerTypes";
import { PERSISTABLE_SCANNER_SAMPLE } from "../fixtures/persistableScannerSample";

// ── Types ─────────────────────────────────────────────────────────────────────

export type DataSourceKey = "fixture" | "static-json" | "api";

export interface ScannerDataSourceResult {
  /** Which source was actually used to produce the output. */
  source: DataSourceKey;
  /** True when the requested source failed and the fixture was used instead. */
  usedFallback: boolean;
  /** Human-readable reason for the fallback, if any. */
  fallbackReason?: string;
  /** The raw persistable scanner output, ready for the adapter. */
  output: PersistableScannerOutput;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fixtureResult(): ScannerDataSourceResult {
  return {
    source: "fixture",
    usedFallback: false,
    output: PERSISTABLE_SCANNER_SAMPLE,
  };
}

function fallbackResult(reason: string): ScannerDataSourceResult {
  return {
    source: "fixture",
    usedFallback: true,
    fallbackReason: reason,
    output: PERSISTABLE_SCANNER_SAMPLE,
  };
}

async function fetchJson(url: string): Promise<PersistableScannerOutput> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} — ${url}`);
  }
  return res.json() as Promise<PersistableScannerOutput>;
}

// ── Main function ─────────────────────────────────────────────────────────────

/**
 * Load scanner data from the requested source.
 *
 * @param source - "fixture" | "static-json" | "api"
 * @returns ScannerDataSourceResult — always resolves, never rejects.
 *          If the requested source fails, falls back to the built-in fixture.
 */
export async function loadScannerDataSourceResult(
  source: DataSourceKey,
): Promise<ScannerDataSourceResult> {
  switch (source) {

    case "fixture":
      return fixtureResult();

    case "static-json": {
      // Fetches the static JSON file served from the public/ directory at runtime.
      // In dev: Vite serves /public as root. In prod: the file must be in dist/.
      // The file is copied from src/fixtures/ to public/ during the build step
      // (or manually placed there). If not found, falls back to fixture.
      try {
        const output = await fetchJson("/fixtures/persistableScannerSample.json");
        return { source: "static-json", usedFallback: false, output };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return fallbackResult(`Static JSON not available: ${msg}`);
      }
    }

    case "api": {
      // Future placeholder: /api/scanner/latest will be provided by a backend.
      // Until then, this always falls back to the fixture with a clear message.
      try {
        const output = await fetchJson("/api/scanner/latest");
        return { source: "api", usedFallback: false, output };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return fallbackResult(`API not available: ${msg}`);
      }
    }
  }
}
