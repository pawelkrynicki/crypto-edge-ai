import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getActiveSourceEnvironment, getSourcePolicyDecision, isSourcePolicyError } from "../sourcePolicy.js";
import { getApprovedSourceAdapters } from "./sourceAdapterRegistry.js";
import type {
  ApprovedSourcesRunOutput,
  NormalizedSourceOutput,
  SourceAdapter,
  SourceAdapterMode,
  SourceDataCategory
} from "./sourceAdapterTypes.js";

export const APPROVED_SOURCES_OUTPUT_FILENAME = "approved_sources_output.json";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUTPUT_DIR = resolve(__dirname, "../../../output");

export type RunApprovedSourcesPocOptions = {
  mode?: SourceAdapterMode;
  environment?: string;
  now?: Date;
  baseOutputDir?: string;
  adapters?: SourceAdapter[];
};

export type RunApprovedSourcesPocResult = {
  output: ApprovedSourcesRunOutput;
  output_dir: string;
  output_file: string;
};

export async function runApprovedSourcesPoc(options: RunApprovedSourcesPocOptions = {}): Promise<RunApprovedSourcesPocResult> {
  const mode = options.mode ?? "fixture";
  const now = options.now ?? new Date();
  const generatedAt = now.toISOString();
  const environment = getActiveSourceEnvironment(options.environment);
  const adapters = options.adapters ?? getApprovedSourceAdapters();
  const sources: NormalizedSourceOutput[] = [];

  for (const adapter of adapters) {
    try {
      sources.push(mode === "live" ? await adapter.fetchLive({ environment }) : await adapter.fetchFixture());
    } catch (error: unknown) {
      sources.push(buildErrorOutput(adapter, mode, environment, error, now));
    }
  }

  const output: ApprovedSourcesRunOutput = {
    run_id: `approved_sources_${formatRunIdDate(now)}`,
    generated_at: generatedAt,
    environment,
    sources,
    summary: summarizeSources(adapters.length, sources)
  };

  const outputDir = resolve(options.baseOutputDir ?? DEFAULT_OUTPUT_DIR, output.run_id);
  const outputFile = resolve(outputDir, APPROVED_SOURCES_OUTPUT_FILENAME);
  await mkdir(outputDir, { recursive: true });
  await writeFile(outputFile, `${JSON.stringify(output, null, 2)}\n`, "utf8");

  return {
    output,
    output_dir: outputDir,
    output_file: outputFile
  };
}

function buildErrorOutput(
  adapter: SourceAdapter,
  mode: SourceAdapterMode,
  environment: string,
  error: unknown,
  now: Date
): NormalizedSourceOutput {
  const decision = isSourcePolicyError(error)
    ? error.decision
    : getSourcePolicyDecision({
        sourceId: adapter.sourceId,
        environment,
        action: mode === "live" ? "live_fetch" : "fixture_load"
      });
  const message = error instanceof Error ? error.message : String(error);

  return {
    source_id: adapter.sourceId,
    source_name: adapter.displayName,
    mode,
    fetched_at: now.toISOString(),
    policy: {
      environment: decision.environment,
      action: decision.action,
      allowed: decision.allowed,
      reason: decision.reason
    },
    data_category: dataCategoryForSource(adapter.sourceId),
    records: [],
    warnings: [],
    errors: [message]
  };
}

function summarizeSources(sourcesRequested: number, sources: NormalizedSourceOutput[]): ApprovedSourcesRunOutput["summary"] {
  return {
    sources_requested: sourcesRequested,
    sources_allowed: sources.filter((source) => source.policy.allowed).length,
    sources_denied: sources.filter((source) => !source.policy.allowed).length,
    records_total: sources.reduce((total, source) => total + source.records.length, 0),
    warnings_total: sources.reduce((total, source) => total + source.warnings.length, 0),
    errors_total: sources.reduce((total, source) => total + source.errors.length, 0)
  };
}

function dataCategoryForSource(sourceId: string): SourceDataCategory {
  if (sourceId === "alternative_me_fng") return "sentiment";
  if (sourceId === "defillama_api") return "defi_context";
  return "market_context";
}

function formatRunIdDate(date: Date): string {
  const parts = [
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds()
  ];

  return `${parts[0]}${parts
    .slice(1)
    .map((part) => String(part).padStart(2, "0"))
    .join("")}`;
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

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const mode = args.mode === "live" ? "live" : "fixture";
  const result = await runApprovedSourcesPoc({
    mode,
    environment: args.environment
  });

  console.log(JSON.stringify(result.output, null, 2));
  if (result.output.summary.errors_total > 0) {
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ source: "approved-sources-poc", error: message }, null, 2));
    process.exit(1);
  });
}
