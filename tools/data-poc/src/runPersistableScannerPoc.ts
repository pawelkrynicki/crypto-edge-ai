import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writePersistableScannerOutput } from "./fileStorage.js";
import { buildPersistableScannerOutput } from "./persistableScannerModel.js";
import { runCombinedScannerPoc } from "./runCombinedScannerPoc.js";
import { getActiveSourceEnvironment, isSourcePolicyError } from "./sourcePolicy.js";
import type { DexScreenerPocMode } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = resolve(__dirname, "../../output");
const DEFAULT_MAX_CANDIDATES = 3;

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const mode = (args.mode ?? "fixture") as DexScreenerPocMode;
  const query = args.query ?? (mode === "live" ? "SOL" : "fixture");
  const maxCandidates = Math.max(1, Math.min(Number(args["max-candidates"] ?? DEFAULT_MAX_CANDIDATES), DEFAULT_MAX_CANDIDATES));
  const startedAt = new Date().toISOString();
  const combined = await runCombinedScannerPoc({ mode, query, maxCandidates });
  const persistable = buildPersistableScannerOutput({
    combined,
    startedAt,
    environment: getActiveSourceEnvironment(),
  });
  const stored = await writePersistableScannerOutput(persistable, OUTPUT_DIR);

  console.log(
    JSON.stringify(
      {
        source: "persistable-scanner-poc",
        mode,
        run_id: persistable.scan_run.run_id,
        output_dir: `tools/data-poc/output/${persistable.scan_run.run_id}`,
        files: stored.files,
        summary: {
          candidates: persistable.candidates.length,
          security_checks: persistable.security_checks.length,
          scorecards: persistable.scorecards.length
        }
      },
      null,
      2
    )
  );
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

main().catch((error: unknown) => {
  const body = isSourcePolicyError(error)
    ? { source: "persistable-scanner-poc", error: "source_policy_denied", decision: error.decision }
    : { source: "persistable-scanner-poc", error: error instanceof Error ? error.message : String(error) };
  console.error(JSON.stringify(body, null, 2));
  process.exit(1);
});
