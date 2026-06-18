import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writePersistableScannerOutput } from "./fileStorage.js";
import { buildPersistableScannerOutput } from "./persistableScannerModel.js";
import { runCombinedScannerPoc } from "./runCombinedScannerPoc.js";
import { validatePersistableScannerOutput, validateStorageOutputDir } from "./storageValidator.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const mode = args.mode ?? "dir";

  if (mode === "fixture") {
    const combined = await runCombinedScannerPoc({ mode: "fixture", query: "fixture", maxCandidates: 3 });
    const persistable = buildPersistableScannerOutput({ combined });
    const result = validatePersistableScannerOutput(persistable);
    console.log(
      JSON.stringify(
        {
          source: "storage-validation-poc",
          output_dir: "memory:fixture",
          ...result
        },
        null,
        2
      )
    );
    return;
  }

  if (mode === "fixture-dir") {
    const dir = await mkdtemp(join(tmpdir(), "crypto-edge-ai-validation-"));
    try {
      const combined = await runCombinedScannerPoc({ mode: "fixture", query: "fixture", maxCandidates: 3 });
      const persistable = buildPersistableScannerOutput({ combined });
      const stored = await writePersistableScannerOutput(persistable, dir);
      const result = await validateStorageOutputDir(stored.output_dir);
      console.log(JSON.stringify({ source: "storage-validation-poc", output_dir: stored.output_dir, ...result }, null, 2));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
    return;
  }

  const outputDir = args["output-dir"];
  if (!outputDir) {
    throw new Error("Missing --output-dir for directory validation");
  }
  const normalizedOutputDir = normalizeOutputDir(outputDir);
  const result = await validateStorageOutputDir(normalizedOutputDir);
  console.log(JSON.stringify({ source: "storage-validation-poc", output_dir: outputDir, ...result }, null, 2));
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
  console.error(JSON.stringify({ source: "storage-validation-poc", error: message }, null, 2));
  process.exit(1);
});
