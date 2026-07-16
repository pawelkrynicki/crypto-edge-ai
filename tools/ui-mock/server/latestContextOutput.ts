import { access, readFile, readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
import {
  RealDataBoundaryError,
  containsFixtureMarker,
  isRecord,
  isStringArray,
  requireFreshTimestamp,
  validateProvenanceManifest,
  type RealDataProvenanceManifest,
} from "./realDataBoundary.js";
import {
  resolveProductRuntimeMode,
  type ProductRuntimeMode,
  type ResolvedProductRuntimeMode,
} from "../src/runtimeMode.js";

const APPROVED_CONTEXT_FILENAME = "approved_sources_output.json";
const APPROVED_CONTEXT_PREFIX = "approved_sources_";
const APPROVED_SOURCE_IDS = ["alternative_me_fng", "defillama_api"] as const;

export const CONTEXT_OUTPUT_UNAVAILABLE = "CONTEXT_OUTPUT_UNAVAILABLE";
export const CONTEXT_SCHEMA_VERSION = "context_snapshot_v1";
export const CONTEXT_GENERATOR_VERSION = "approved_sources_poc_v1";
export const ALTERNATIVE_ME_MAX_AGE_MS = 30 * 60 * 60 * 1000;
export const DEFILLAMA_MAX_AGE_MS = 6 * 60 * 60 * 1000;

type ContextSourceKind = "approved-sources-output" | "fixture-fallback";

type ContextSourceMeta = {
  source_kind: ContextSourceKind;
  output_file: string | null;
  loaded_at: string;
  runtime_mode: ResolvedProductRuntimeMode;
  age_seconds: number | null;
  source_ids: string[];
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
  age_seconds?: number;
  status?: "READY" | "DEGRADED";
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
  degraded_sources_total?: number;
  data_status?: "READY" | "DEGRADED";
};

export type ContextLatestOutput = {
  provenance?: RealDataProvenanceManifest;
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
  runtimeMode?: ProductRuntimeMode | string;
  now?: Date;
};

type ContextCandidate = {
  run_id: string;
  mtime: string;
  sort_time: number;
  output: unknown | null;
  read_error: boolean;
};

export class ContextOutputError extends RealDataBoundaryError {}

const defaultFixturePath = resolve("public", "fixtures", "contextLatestFixture.json");
const defaultOutputDirPath = resolve("..", "data-poc", "output");

export function buildApprovedContextOutputPath(runId: string, baseOutputDir = defaultOutputDirPath): string {
  return resolve(baseOutputDir, runId, APPROVED_CONTEXT_FILENAME);
}

export async function readLatestContextOutput(
  options: LatestContextOutputOptions = {},
): Promise<ContextLatestOutput> {
  const runtimeMode = resolveProductRuntimeMode(options.runtimeMode);
  const outputDirPath = options.outputDirPath ?? defaultOutputDirPath;
  const fixturePath = options.fixturePath ?? defaultFixturePath;
  const now = options.now ?? new Date();

  if (runtimeMode === "UNCONFIGURED") {
    throw new ContextOutputError("RUNTIME_MODE_UNCONFIGURED");
  }

  const candidates = await findContextCandidates(outputDirPath);

  if (runtimeMode === "DEVELOPMENT_DEMO") {
    for (const candidate of candidates) {
      const output = sanitizeDemoContextOutput(candidate.output);
      if (output) {
        return withSourceMeta(output, {
          source_kind: "approved-sources-output",
          output_file: `${candidate.run_id}/${APPROVED_CONTEXT_FILENAME}`,
          loaded_at: now.toISOString(),
          runtime_mode: runtimeMode,
          age_seconds: calculateOptionalAgeSeconds(output.generated_at, now),
          source_ids: output.sources.map((source) => source.source_id),
        });
      }
    }

    return readFixtureContext(fixturePath, now);
  }

  if (!(await pathExists(outputDirPath))) {
    throw new ContextOutputError("CONTEXT_OUTPUT_DIRECTORY_MISSING");
  }

  const latest = candidates[0];
  if (!latest?.output) {
    throw new ContextOutputError(latest?.read_error ? "CONTEXT_OUTPUT_INVALID_JSON" : CONTEXT_OUTPUT_UNAVAILABLE);
  }

  try {
    return sanitizeInternalBetaContextOutput(latest.output, now, latest.run_id);
  } catch (error) {
    if (error instanceof RealDataBoundaryError) {
      throw new ContextOutputError(error.code);
    }
    throw new ContextOutputError("CONTEXT_SCHEMA_INVALID");
  }
}

export function isContextLatestOutputShape(value: unknown): boolean {
  return sanitizeDemoContextOutput(value) !== null;
}

function sanitizeInternalBetaContextOutput(value: unknown, now: Date, directoryRunId: string): ContextLatestOutput {
  if (!isRecord(value)) {
    throw new RealDataBoundaryError("CONTEXT_SCHEMA_INVALID");
  }

  const manifest = validateProvenanceManifest(value.provenance, {
    prefix: "CONTEXT",
    schemaVersion: CONTEXT_SCHEMA_VERSION,
    generatorVersions: [CONTEXT_GENERATOR_VERSION],
    allowedSourceIds: APPROVED_SOURCE_IDS,
    requiredSourceIds: APPROVED_SOURCE_IDS,
  });

  if (
    value.run_id !== manifest.run_id
    || directoryRunId !== manifest.run_id
    || value.generated_at !== manifest.generated_at
    || value.environment !== "INTERNAL_BETA"
  ) {
    throw new RealDataBoundaryError("CONTEXT_LINEAGE_MISMATCH");
  }

  if (containsFixtureMarker([value.run_id, value.metadata, manifest.metadata])) {
    throw new RealDataBoundaryError("CONTEXT_FIXTURE_MARKER_DETECTED");
  }

  const generatedFreshness = requireFreshTimestamp(value.generated_at, now, ALTERNATIVE_ME_MAX_AGE_MS, {
    missing: "CONTEXT_TIMESTAMP_MISSING",
    invalid: "CONTEXT_TIMESTAMP_INVALID",
    future: "CONTEXT_TIMESTAMP_FUTURE",
    stale: "CONTEXT_SNAPSHOT_STALE",
  });
  requireFreshTimestamp(manifest.finished_at, now, ALTERNATIVE_ME_MAX_AGE_MS, {
    missing: "CONTEXT_TIMESTAMP_MISSING",
    invalid: "CONTEXT_TIMESTAMP_INVALID",
    future: "CONTEXT_TIMESTAMP_FUTURE",
    stale: "CONTEXT_SNAPSHOT_STALE",
  });

  if (!Array.isArray(value.sources) || value.sources.length !== APPROVED_SOURCE_IDS.length) {
    throw new RealDataBoundaryError("CONTEXT_SOURCE_REQUIRED");
  }

  const sources = value.sources.map((source) => sanitizeInternalSource(source, now));
  if (sources.some((source) => source === null)) {
    throw new RealDataBoundaryError("CONTEXT_SCHEMA_INVALID");
  }

  const normalizedSources = sources as NormalizedContextSource[];
  const sourceIds = normalizedSources.map((source) => source.source_id);
  if (new Set(sourceIds).size !== APPROVED_SOURCE_IDS.length) {
    throw new RealDataBoundaryError("CONTEXT_SOURCE_REQUIRED");
  }
  for (const sourceId of APPROVED_SOURCE_IDS) {
    if (!sourceIds.includes(sourceId)) {
      throw new RealDataBoundaryError("CONTEXT_SOURCE_REQUIRED");
    }
  }

  const degradedSources = normalizedSources.filter((source) => source.status === "DEGRADED").length;
  const summary: ContextSummary = {
    sources_requested: APPROVED_SOURCE_IDS.length,
    sources_allowed: normalizedSources.filter((source) => source.policy.allowed).length,
    sources_denied: normalizedSources.filter((source) => !source.policy.allowed).length,
    records_total: normalizedSources.reduce((total, source) => total + source.records.length, 0),
    warnings_total: normalizedSources.reduce((total, source) => total + source.warnings.length, 0),
    errors_total: normalizedSources.reduce((total, source) => total + source.errors.length, 0),
    degraded_sources_total: degradedSources,
    data_status: degradedSources > 0 ? "DEGRADED" : "READY",
  };

  return withSourceMeta({
    provenance: manifest,
    run_id: manifest.run_id,
    generated_at: manifest.generated_at,
    environment: "INTERNAL_BETA",
    sources: normalizedSources,
    summary,
  }, {
    source_kind: "approved-sources-output",
    output_file: `${manifest.run_id}/${APPROVED_CONTEXT_FILENAME}`,
    loaded_at: now.toISOString(),
    runtime_mode: "INTERNAL_BETA",
    age_seconds: generatedFreshness.ageSeconds,
    source_ids: manifest.source_ids,
  });
}

function sanitizeInternalSource(value: unknown, now: Date): NormalizedContextSource | null {
  if (!isRecord(value) || !isApprovedSourceId(value.source_id)) return null;
  if (
    value.mode !== "live"
    || typeof value.source_name !== "string"
    || !isDataCategory(value.data_category)
  ) {
    return null;
  }

  const policy = sanitizePolicy(value.policy);
  const records = Array.isArray(value.records) ? value.records.map(sanitizeRecord) : null;
  const warnings = toStringArray(value.warnings);
  const errors = toStringArray(value.errors);
  if (
    !policy
    || policy.environment !== "INTERNAL_BETA"
    || policy.action !== "live_fetch"
    || policy.allowed !== true
    || !records
    || records.some((record) => record === null)
    || records.length === 0
    || !warnings
    || !errors
  ) {
    throw new RealDataBoundaryError(
      policy && !policy.allowed ? "CONTEXT_POLICY_DENIED" : "CONTEXT_SOURCE_DATA_UNAVAILABLE",
    );
  }

  const maxAgeMs = value.source_id === "alternative_me_fng"
    ? ALTERNATIVE_ME_MAX_AGE_MS
    : DEFILLAMA_MAX_AGE_MS;
  const sourceCode = value.source_id === "alternative_me_fng" ? "ALTERNATIVE_ME" : "DEFILLAMA";
  const freshness = requireFreshTimestamp(value.fetched_at, now, maxAgeMs, {
    missing: "CONTEXT_TIMESTAMP_MISSING",
    invalid: "CONTEXT_TIMESTAMP_INVALID",
    future: "CONTEXT_TIMESTAMP_FUTURE",
    stale: `CONTEXT_${sourceCode}_STALE`,
  });
  const degraded = value.health_status === "degraded_external_source" || warnings.length > 0 || errors.length > 0;

  return {
    source_id: value.source_id,
    source_name: value.source_name,
    mode: "live",
    fetched_at: freshness.timestamp,
    age_seconds: freshness.ageSeconds,
    status: degraded ? "DEGRADED" : "READY",
    policy,
    data_category: value.data_category,
    records: records as NormalizedContextRecord[],
    warnings,
    errors,
  };
}

async function readFixtureContext(path: string, now: Date): Promise<ContextLatestOutput> {
  try {
    const output = sanitizeDemoContextOutput(JSON.parse(await readFile(path, "utf8")));
    if (!output) throw new Error(CONTEXT_OUTPUT_UNAVAILABLE);
    return withSourceMeta(output, {
      source_kind: "fixture-fallback",
      output_file: null,
      loaded_at: now.toISOString(),
      runtime_mode: "DEVELOPMENT_DEMO",
      age_seconds: calculateOptionalAgeSeconds(output.generated_at, now),
      source_ids: output.sources.map((source) => source.source_id),
    });
  } catch {
    throw new ContextOutputError(CONTEXT_OUTPUT_UNAVAILABLE);
  }
}

async function findContextCandidates(outputDirPath: string): Promise<ContextCandidate[]> {
  try {
    const entries = await readdir(outputDirPath, { withFileTypes: true });
    const candidates = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory() && entry.name.startsWith(APPROVED_CONTEXT_PREFIX))
        .map((entry) => inspectContextRun(entry.name, outputDirPath)),
    );
    return candidates.filter((candidate): candidate is ContextCandidate => Boolean(candidate)).sort((a, b) => b.sort_time - a.sort_time);
  } catch {
    return [];
  }
}

async function inspectContextRun(runId: string, outputDirPath: string): Promise<ContextCandidate | null> {
  const outputFile = buildApprovedContextOutputPath(runId, outputDirPath);
  try {
    const fileStat = await stat(outputFile);
    const output: unknown = JSON.parse(await readFile(outputFile, "utf8"));
    return {
      run_id: runId,
      mtime: fileStat.mtime.toISOString(),
      sort_time: contextSortTime(output, runId, fileStat.mtime),
      output,
      read_error: false,
    };
  } catch (error) {
    if (isErrno(error, "ENOENT")) return null;
    const fallbackStat = await statSafe(outputFile);
    return {
      run_id: runId,
      mtime: fallbackStat?.mtime.toISOString() ?? new Date(0).toISOString(),
      sort_time: runIdToSortTime(runId, fallbackStat?.mtime ?? new Date(0)),
      output: null,
      read_error: true,
    };
  }
}

function sanitizeDemoContextOutput(value: unknown): Omit<ContextLatestOutput, "_source_meta"> | null {
  if (!isRecord(value)) return null;
  const sources = Array.isArray(value.sources) ? value.sources.map(sanitizeDemoSource) : null;
  const summary = sanitizeSummary(value.summary);
  if (
    typeof value.run_id !== "string"
    || typeof value.generated_at !== "string"
    || typeof value.environment !== "string"
    || !sources
    || sources.some((source) => source === null)
    || !summary
  ) return null;

  return {
    run_id: value.run_id,
    generated_at: value.generated_at,
    environment: value.environment,
    sources: sources as NormalizedContextSource[],
    summary,
  };
}

function sanitizeDemoSource(value: unknown): NormalizedContextSource | null {
  if (!isRecord(value) || !isApprovedSourceId(value.source_id)) return null;
  if (value.mode !== "fixture" && value.mode !== "live") return null;
  if (!isDataCategory(value.data_category) || typeof value.source_name !== "string" || typeof value.fetched_at !== "string") return null;
  const policy = sanitizePolicy(value.policy);
  const records = Array.isArray(value.records) ? value.records.map(sanitizeRecord) : null;
  const warnings = toStringArray(value.warnings);
  const errors = toStringArray(value.errors);
  if (!policy || !records || records.some((record) => record === null) || !warnings || !errors) return null;
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
  ) return null;
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
  return { ...output, _source_meta: meta };
}

function isApprovedSourceId(value: unknown): value is (typeof APPROVED_SOURCE_IDS)[number] {
  return typeof value === "string" && APPROVED_SOURCE_IDS.includes(value as (typeof APPROVED_SOURCE_IDS)[number]);
}

function isDataCategory(value: unknown): value is NormalizedContextSource["data_category"] {
  return value === "sentiment" || value === "defi_context" || value === "market_context";
}

function toNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function toNullableNumber(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function toStringArray(value: unknown): string[] | null {
  return isStringArray(value) ? value : null;
}

function contextSortTime(output: unknown, runId: string, mtime: Date): number {
  const runIdTime = runIdToSortTime(runId, mtime);
  if (isRecord(output) && typeof output.generated_at === "string") {
    const parsed = Date.parse(output.generated_at);
    if (!Number.isNaN(parsed)) return Math.max(parsed, runIdTime);
  }
  return runIdTime;
}

function runIdToSortTime(runId: string, mtime: Date): number {
  const timestamp = runId.slice(APPROVED_CONTEXT_PREFIX.length);
  if (/^\d{14}$/.test(timestamp)) {
    const parsed = Date.UTC(
      Number(timestamp.slice(0, 4)),
      Number(timestamp.slice(4, 6)) - 1,
      Number(timestamp.slice(6, 8)),
      Number(timestamp.slice(8, 10)),
      Number(timestamp.slice(10, 12)),
      Number(timestamp.slice(12, 14)),
    );
    if (!Number.isNaN(parsed)) return parsed;
  }
  return mtime.getTime();
}

function calculateOptionalAgeSeconds(value: string, now: Date): number | null {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : Math.max(0, Math.floor((now.getTime() - parsed) / 1000));
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function statSafe(path: string) {
  try {
    return await stat(path);
  } catch {
    return null;
  }
}

function isErrno(error: unknown, code: string): boolean {
  return error !== null && typeof error === "object" && "code" in error && error.code === code;
}
