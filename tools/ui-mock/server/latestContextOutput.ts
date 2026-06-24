import { readFile, readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";

const APPROVED_CONTEXT_FILENAME = "approved_sources_output.json";
const APPROVED_CONTEXT_PREFIX = "approved_sources_";
const APPROVED_SOURCE_IDS = ["alternative_me_fng", "defillama_api"] as const;
const CONTEXT_OUTPUT_UNAVAILABLE = "CONTEXT_OUTPUT_UNAVAILABLE";

type ContextSourceKind = "approved-sources-output" | "fixture-fallback";

type ContextSourceMeta = {
  source_kind: ContextSourceKind;
  output_file: string | null;
  loaded_at: string;
};

type ContextPolicy = {
  environment: string;
  action: string;
  allowed: boolean;
  reason: string;
};

type FearGreedIndexRecord = {
  record_type: "fear_greed_index";
  value: number;
  value_classification: string;
  timestamp: string | null;
  time_until_update: string | null;
};

type DefiContextRecord = {
  record_type: "defi_protocol_snapshot" | "chain_tvl_snapshot";
  name: string;
  chain: string | null;
  tvl_usd: number | null;
  change_1d: number | null;
  change_7d: number | null;
  url: string | null;
};

type NormalizedContextRecord = FearGreedIndexRecord | DefiContextRecord;

type NormalizedContextSource = {
  source_id: (typeof APPROVED_SOURCE_IDS)[number];
  source_name: string;
  mode: "fixture" | "live";
  fetched_at: string;
  policy: ContextPolicy;
  data_category: "sentiment" | "defi_context" | "market_context";
  records: NormalizedContextRecord[];
  warnings: string[];
  errors: string[];
};

type ContextSummary = {
  sources_requested: number;
  sources_allowed: number;
  sources_denied: number;
  records_total: number;
  warnings_total: number;
  errors_total: number;
};

export type ContextLatestOutput = {
  run_id: string;
  generated_at: string;
  environment: string;
  sources: NormalizedContextSource[];
  summary: ContextSummary;
  _source_meta: ContextSourceMeta;
};

export type LatestContextOutputOptions = {
  outputDirPath?: string;
  fixturePath?: string;
};

type ContextCandidate = {
  run_id: string;
  output_file: string;
  mtime: string;
  valid: boolean;
  validation_error: string | null;
  sort_time: number;
  output: Omit<ContextLatestOutput, "_source_meta"> | null;
};

const fixturePath = resolve("public", "fixtures", "contextLatestFixture.json");
const outputDirPath = resolve("..", "data-poc", "output");

export function buildApprovedContextOutputPath(runId: string, baseOutputDir = outputDirPath): string {
  return resolve(baseOutputDir, runId, APPROVED_CONTEXT_FILENAME);
}

export async function readLatestContextOutput(options: LatestContextOutputOptions = {}): Promise<ContextLatestOutput> {
  const contextOutputDir = options.outputDirPath ?? outputDirPath;
  const candidates = await findContextCandidates(contextOutputDir);
  const latestValid = candidates.find((candidate) => candidate.valid && candidate.output);

  if (latestValid?.output) {
    return withSourceMeta(latestValid.output, {
      source_kind: "approved-sources-output",
      output_file: latestValid.output_file,
      loaded_at: new Date().toISOString(),
    });
  }

  return readFixtureContext(options.fixturePath ?? fixturePath);
}

export function isContextLatestOutputShape(value: unknown): boolean {
  return sanitizeContextOutput(value) !== null;
}

async function readFixtureContext(path: string): Promise<ContextLatestOutput> {
  try {
    const raw = await readFile(path, "utf8");
    const output = sanitizeContextOutput(JSON.parse(raw));

    if (!output) {
      throw new Error(CONTEXT_OUTPUT_UNAVAILABLE);
    }

    return withSourceMeta(output, {
      source_kind: "fixture-fallback",
      output_file: null,
      loaded_at: new Date().toISOString(),
    });
  } catch {
    throw new Error(CONTEXT_OUTPUT_UNAVAILABLE);
  }
}

async function findContextCandidates(contextOutputDir: string): Promise<ContextCandidate[]> {
  try {
    const entries = await readdir(contextOutputDir, { withFileTypes: true });
    const candidates = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory() && entry.name.startsWith(APPROVED_CONTEXT_PREFIX))
        .map((entry) => inspectContextRun(entry.name, contextOutputDir)),
    );

    return candidates
      .filter((candidate): candidate is ContextCandidate => Boolean(candidate))
      .sort((a, b) => b.sort_time - a.sort_time);
  } catch {
    return [];
  }
}

async function inspectContextRun(runId: string, contextOutputDir: string): Promise<ContextCandidate | null> {
  const outputFile = buildApprovedContextOutputPath(runId, contextOutputDir);

  try {
    const fileStat = await stat(outputFile);
    const raw = await readFile(outputFile, "utf8");
    const output = sanitizeContextOutput(JSON.parse(raw));
    const validationError = output ? null : "Approved source output does not match expected normalized context shape";

    return {
      run_id: runId,
      output_file: outputFile,
      mtime: fileStat.mtime.toISOString(),
      valid: validationError === null,
      validation_error: validationError,
      sort_time: runIdToSortTime(runId, fileStat.mtime),
      output,
    };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return null;
    }

    const fallbackStat = await statSafe(outputFile);

    return {
      run_id: runId,
      output_file: outputFile,
      mtime: fallbackStat?.mtime.toISOString() ?? new Date(0).toISOString(),
      valid: false,
      validation_error: "Approved source output file could not be read or parsed",
      sort_time: runIdToSortTime(runId, fallbackStat?.mtime ?? new Date(0)),
      output: null,
    };
  }
}

function sanitizeContextOutput(value: unknown): Omit<ContextLatestOutput, "_source_meta"> | null {
  if (!isRecord(value)) return null;

  const sources = Array.isArray(value.sources) ? value.sources.map(sanitizeSource) : null;
  const summary = sanitizeSummary(value.summary);

  if (
    typeof value.run_id !== "string"
    || typeof value.generated_at !== "string"
    || typeof value.environment !== "string"
    || !sources
    || sources.some((source) => source === null)
    || !summary
  ) {
    return null;
  }

  return {
    run_id: value.run_id,
    generated_at: value.generated_at,
    environment: value.environment,
    sources: sources as NormalizedContextSource[],
    summary,
  };
}

function sanitizeSource(value: unknown): NormalizedContextSource | null {
  if (!isRecord(value)) return null;
  if (!isApprovedSourceId(value.source_id)) return null;
  if (value.mode !== "fixture" && value.mode !== "live") return null;
  if (!isDataCategory(value.data_category)) return null;
  if (typeof value.source_name !== "string" || typeof value.fetched_at !== "string") return null;

  const policy = sanitizePolicy(value.policy);
  const records = Array.isArray(value.records) ? value.records.map(sanitizeRecord) : null;
  const warnings = toStringArray(value.warnings);
  const errors = toStringArray(value.errors);

  if (!policy || !records || records.some((record) => record === null) || !warnings || !errors) {
    return null;
  }

  return {
    source_id: value.source_id,
    source_name: value.source_name,
    mode: value.mode,
    fetched_at: value.fetched_at,
    policy,
    data_category: value.data_category,
    records: records as NormalizedContextRecord[],
    warnings,
    errors,
  };
}

function sanitizePolicy(value: unknown): ContextPolicy | null {
  if (!isRecord(value)) return null;

  if (
    typeof value.environment !== "string"
    || typeof value.action !== "string"
    || typeof value.allowed !== "boolean"
    || typeof value.reason !== "string"
  ) {
    return null;
  }

  return {
    environment: value.environment,
    action: value.action,
    allowed: value.allowed,
    reason: value.reason,
  };
}

function sanitizeRecord(value: unknown): NormalizedContextRecord | null {
  if (!isRecord(value) || typeof value.record_type !== "string") return null;

  if (value.record_type === "fear_greed_index") {
    if (typeof value.value !== "number" || typeof value.value_classification !== "string") return null;

    return {
      record_type: "fear_greed_index",
      value: value.value,
      value_classification: value.value_classification,
      timestamp: toNullableString(value.timestamp),
      time_until_update: toNullableString(value.time_until_update),
    };
  }

  if (value.record_type === "defi_protocol_snapshot" || value.record_type === "chain_tvl_snapshot") {
    if (typeof value.name !== "string") return null;

    return {
      record_type: value.record_type,
      name: value.name,
      chain: toNullableString(value.chain),
      tvl_usd: toNullableNumber(value.tvl_usd),
      change_1d: toNullableNumber(value.change_1d),
      change_7d: toNullableNumber(value.change_7d),
      url: toNullableString(value.url),
    };
  }

  return null;
}

function sanitizeSummary(value: unknown): ContextSummary | null {
  if (!isRecord(value)) return null;

  const summary = {
    sources_requested: value.sources_requested,
    sources_allowed: value.sources_allowed,
    sources_denied: value.sources_denied,
    records_total: value.records_total,
    warnings_total: value.warnings_total,
    errors_total: value.errors_total,
  };

  return Object.values(summary).every((field) => typeof field === "number")
    ? summary as ContextSummary
    : null;
}

function withSourceMeta(output: Omit<ContextLatestOutput, "_source_meta">, meta: ContextSourceMeta): ContextLatestOutput {
  return {
    ...output,
    _source_meta: meta,
  };
}

function isApprovedSourceId(value: unknown): value is (typeof APPROVED_SOURCE_IDS)[number] {
  return typeof value === "string" && APPROVED_SOURCE_IDS.includes(value as (typeof APPROVED_SOURCE_IDS)[number]);
}

function isDataCategory(value: unknown): value is NormalizedContextSource["data_category"] {
  return value === "sentiment" || value === "defi_context" || value === "market_context";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function toNullableNumber(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function toStringArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : null;
}

function runIdToSortTime(runId: string, mtime: Date): number {
  const timestamp = runId.slice(APPROVED_CONTEXT_PREFIX.length);
  if (/^\d{14}$/.test(timestamp)) {
    const year = Number(timestamp.slice(0, 4));
    const month = Number(timestamp.slice(4, 6)) - 1;
    const day = Number(timestamp.slice(6, 8));
    const hour = Number(timestamp.slice(8, 10));
    const minute = Number(timestamp.slice(10, 12));
    const second = Number(timestamp.slice(12, 14));
    const parsed = Date.UTC(year, month, day, hour, minute, second);

    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return mtime.getTime();
}

async function statSafe(path: string) {
  try {
    return await stat(path);
  } catch {
    return null;
  }
}
