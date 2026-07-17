import { readFile, readdir, stat } from "node:fs/promises";
import { basename, dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateDisplayEligibleContextSnapshot } from "./contextSnapshotValidator.js";
import { validateDisplayEligibleScannerSnapshot } from "./displaySnapshotValidator.js";
import type { PersistableScannerOutput } from "./persistableScannerModel.js";
import { APPROVED_SOURCES_OUTPUT_FILENAME } from "./sources/runApprovedSourcesPoc.js";
import type { ApprovedSourcesRunOutput } from "./sources/sourceAdapterTypes.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_POC_ROOT = resolve(__dirname, "../..");
const REPO_ROOT = resolve(DATA_POC_ROOT, "../..");
const OUTPUT_DIR = resolve(DATA_POC_ROOT, "output");

async function main(): Promise<void> {
  const scannerFile = await newestFile("full_output.json");
  const contextFile = await newestFile(APPROVED_SOURCES_OUTPUT_FILENAME, "approved_sources_");
  const scanner = JSON.parse(await readFile(scannerFile, "utf8")) as PersistableScannerOutput;
  const context = JSON.parse(await readFile(contextFile, "utf8")) as ApprovedSourcesRunOutput;

  if (basename(dirname(scannerFile)) !== scanner.scan_run.run_id) throw new Error("SCANNER_LINEAGE_MISMATCH");
  if (basename(dirname(contextFile)) !== context.run_id) throw new Error("CONTEXT_LINEAGE_MISMATCH");

  validateDisplayEligibleScannerSnapshot(scanner);
  validateDisplayEligibleContextSnapshot(context);
  assertFresh(scanner.provenance?.generated_at, 30 * 60 * 1000, "SCANNER_SNAPSHOT_STALE");
  for (const source of context.sources) {
    assertFresh(
      source.fetched_at,
      source.source_id === "alternative_me_fng" ? 30 * 60 * 60 * 1000 : 6 * 60 * 60 * 1000,
      source.source_id === "alternative_me_fng" ? "CONTEXT_ALTERNATIVE_ME_STALE" : "CONTEXT_DEFILLAMA_STALE",
    );
  }

  console.log(JSON.stringify({
    valid: true,
    run_id: scanner.scan_run.run_id,
    scanner_output: toRepoRelative(scannerFile),
    context_output: toRepoRelative(contextFile),
    source_ids: scanner.provenance?.source_ids,
  }, null, 2));
}

async function newestFile(fileName: string, directoryPrefix = ""): Promise<string> {
  const entries = await readdir(OUTPUT_DIR, { withFileTypes: true });
  const candidates = await Promise.all(entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(directoryPrefix))
    .map(async (entry) => {
      const path = resolve(OUTPUT_DIR, entry.name, fileName);
      try {
        return { path, mtime: (await stat(path)).mtimeMs };
      } catch {
        return null;
      }
    }));
  const latest = candidates.filter((candidate): candidate is { path: string; mtime: number } => candidate !== null)
    .sort((a, b) => b.mtime - a.mtime)[0];
  if (!latest) throw new Error(fileName === "full_output.json" ? "SCANNER_OUTPUT_UNAVAILABLE" : "CONTEXT_OUTPUT_UNAVAILABLE");
  return latest.path;
}

function assertFresh(value: string | undefined, maxAgeMs: number, code: string): void {
  const timestamp = value ? Date.parse(value) : NaN;
  if (Number.isNaN(timestamp) || Date.now() - timestamp > maxAgeMs || timestamp - Date.now() > 5 * 60 * 1000) {
    throw new Error(code);
  }
}

function toRepoRelative(path: string): string {
  return relative(REPO_ROOT, path).replace(/\\/g, "/");
}

main().catch((error: unknown) => {
  console.error(JSON.stringify({ error: error instanceof Error ? error.message : "SNAPSHOT_VALIDATION_FAILED" }));
  process.exit(1);
});
