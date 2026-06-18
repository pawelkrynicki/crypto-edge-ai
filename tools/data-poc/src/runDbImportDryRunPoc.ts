import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDbImportDryRunFromDir, buildDbImportDryRunFromOutput } from "./dbImportDryRun.js";
import { buildPersistableScannerOutput } from "./persistableScannerModel.js";
import { runCombinedScannerPoc } from "./runCombinedScannerPoc.js";
import type { DexScreenerPocMode } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_MAX_CANDIDATES = 3;

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const mode = args.mode ?? "dir";

  if (mode === "fixture" || mode === "live") {
    const scannerMode = mode as DexScreenerPocMode;
    const combined = await runCombinedScannerPoc({
      mode: scannerMode,
      query: args.query ?? (scannerMode === "live" ? "SOL" : "fixture"),
      maxCandidates: sanitizeMaxCandidates(Number(args["max-candidates"] ?? DEFAULT_MAX_CANDIDATES))
    });
    const persistable = buildPersistableScannerOutput({ combined });
    const result = buildDbImportDryRunFromOutput({
      output: persistable,
      mode: scannerMode,
      outputDir: `memory:${scannerMode}`
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const outputDir = args["output-dir"];
  if (!outputDir) {
    throw new Error("Missing --output-dir for dry-run directory mode");
  }

  const normalizedOutputDir = normalizeOutputDir(outputDir);
  const result = await buildDbImportDryRunFromDir(normalizedOutputDir);
  console.log(JSON.stringify({ ...result, output_dir: outputDir }, null, 2));
}

function parseArgs(args: string[]): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = args[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = "true";
      continue;
    }
    parsed[key] = next;
    index += 1;
  }
  return parsed;
}

function sanitizeMaxCandidates(value: number): number {
  return Math.max(1, Math.min(value, DEFAULT_MAX_CANDIDATES));
}

function normalizeOutputDir(outputDir: string): string {
  const normalized = outputDir.replaceAll("\\", "/");
  const repoRelativePrefix = "tools/data-poc/";
  if (normalized.startsWith(repoRelativePrefix)) {
    return resolve(__dirname, "../../", normalized.slice(repoRelativePrefix.length));
  }
  return outputDir;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify({ source: "db-import-dry-run-poc", error: message }, null, 2));
  process.exit(1);
});
