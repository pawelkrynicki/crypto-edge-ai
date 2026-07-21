import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInternalBetaCollector } from "./internalBetaCollector.js";
import type { DexScreenerDiscoveryFailureDiagnostics } from "./dexscreenerDiscovery.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../../..");

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.mode !== undefined) {
    throw new Error("COLLECTOR_MODE_ARGUMENT_FORBIDDEN");
  }
  const result = await runInternalBetaCollector({
    seedLimit: toOptionalNumber(args["seed-limit"]),
    securityCandidateLimit: toOptionalNumber(args["security-limit"]),
    goplusApiToken: process.env.GOPLUS_API_TOKEN,
  });

  console.log(JSON.stringify({
    run_id: result.run_id,
    source_health: result.source_health,
    request_counts: result.request_counts,
    candidate_counts: {
      new_emerging: result.discovery.new_emerging,
      established: result.discovery.established,
      security_candidates_requested: result.security.candidates_requested,
      security_candidates_available: result.security.candidates_available,
    },
    output_paths: {
      scanner: toRepoRelative(result.scanner_publish.output_file),
      context: toRepoRelative(result.context_publish.output_file),
    },
    manifest_summary: {
      contract_version: result.scanner.provenance?.contract_version,
      schema_version: result.scanner.provenance?.schema_version,
      environment: result.scanner.provenance?.environment,
      mode: result.scanner.provenance?.mode,
      fixture_used: result.scanner.provenance?.fixture_used,
      source_ids: result.scanner.provenance?.source_ids,
      security_coverage: result.security.coverage,
      security_reason_codes: result.security.reason_codes,
      raw_storage: Object.fromEntries(Object.entries(result.scanner.provenance?.policy_decisions ?? {})
        .map(([sourceId, decision]) => [sourceId, decision.raw_storage])),
    },
  }, null, 2));
}

function parseArgs(args: string[]): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) continue;
    const value = args[index + 1];
    if (value && !value.startsWith("--")) {
      parsed[arg.slice(2)] = value;
      index += 1;
    }
  }
  return parsed;
}

function toOptionalNumber(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toRepoRelative(path: string): string {
  return relative(REPO_ROOT, path).replace(/\\/g, "/");
}

main().catch((error: unknown) => {
  const code = error && typeof error === "object" && "code" in error
    ? "sourceId" in error && typeof error.sourceId === "string"
      ? `${error.sourceId.toUpperCase()}_${String(error.code)}`
      : String(error.code)
    : error instanceof Error
      ? error.message
      : "COLLECTOR_FAILED";
  const diagnostics = readDiscoveryDiagnostics(error);
  console.error(JSON.stringify({ error: code, ...(diagnostics ? { discovery: diagnostics } : {}) }));
  process.exit(1);
});

function readDiscoveryDiagnostics(error: unknown): DexScreenerDiscoveryFailureDiagnostics | null {
  if (!error || typeof error !== "object" || !("diagnostics" in error)) return null;
  const diagnostics = error.diagnostics;
  if (!diagnostics || typeof diagnostics !== "object" || Array.isArray(diagnostics)) return null;
  return diagnostics as DexScreenerDiscoveryFailureDiagnostics;
}
