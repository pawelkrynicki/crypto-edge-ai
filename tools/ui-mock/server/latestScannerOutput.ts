import { access, readFile, readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
import {
  FUTURE_TIMESTAMP_TOLERANCE_MS,
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

export const SCANNER_OUTPUT_UNAVAILABLE = "SCANNER_OUTPUT_UNAVAILABLE";
export const INVALID_SCANNER_OUTPUT = "SCANNER_SCHEMA_INVALID";
export const SCANNER_SCHEMA_VERSION = "scanner_snapshot_v1";
export const SCANNER_GENERATOR_VERSION = "data_poc_persistable_scanner_v1";
export const SCANNER_MAX_AGE_MS = 30 * 60 * 1000;
export const SECURITY_MAX_AGE_MS = 30 * 60 * 1000;

const SCANNER_SOURCE_IDS = ["dexscreener", "goplus_security"] as const;
const SECURITY_SOURCE_IDS = ["goplus_security"] as const;
const FINAL_LABELS = ["WATCHLIST", "CRITICAL_RISK", "NEEDS_MANUAL_VERIFICATION", "REJECT"] as const;
const BASIC_FILTER_STATUSES = ["passed_basic_filter", "rejected_basic_filter"] as const;

export type ScannerOutputSource = "real-output" | "fixture-fallback";

export type ScannerSourceMeta = {
  source: ScannerOutputSource;
  reason: string;
  selected_run_id: string | null;
  loaded_at: string;
  runtime_mode: ResolvedProductRuntimeMode;
  age_seconds: number | null;
  source_ids: string[];
};

export type ScannerOutputWithMeta = Record<string, unknown> & {
  _source_meta: ScannerSourceMeta;
};

type CandidateRun = {
  run_id: string;
  full_output_path: string;
  finished_at: string | null;
  started_at: string | null;
  mtime: string;
  sort_time: number;
  output: unknown | null;
  read_error: boolean;
};

export type ScannerSourcesDiagnostics = {
  runtime_mode: ResolvedProductRuntimeMode;
  output_dir_exists: boolean;
  output_dir: "tools/data-poc/output";
  runs_found: number;
  full_output_files_found: number;
  selected_run_id: string | null;
  fixture_fallback_available?: boolean;
  fixture?: "tools/ui-mock/public/fixtures/persistableScannerSample.json";
  runs: Array<{
    run_id: string | null;
    finished_at: string | null;
    started_at: string | null;
    mtime: string;
    valid: boolean;
    reason_code: string | null;
  }>;
};

export type LatestScannerOutputOptions = {
  outputDirPath?: string;
  fixturePath?: string;
  runtimeMode?: ProductRuntimeMode | string;
  now?: Date;
};

export class ScannerOutputError extends RealDataBoundaryError {}

const defaultFixturePath = resolve("public", "fixtures", "persistableScannerSample.json");
const defaultOutputDirPath = resolve("..", "data-poc", "output");

export function buildDataPocOutputPath(runId: string, baseOutputDir = defaultOutputDirPath): string {
  return resolve(baseOutputDir, runId, "full_output.json");
}

export async function readLatestScannerOutput(
  options: LatestScannerOutputOptions = {},
): Promise<ScannerOutputWithMeta> {
  const runtimeMode = resolveProductRuntimeMode(options.runtimeMode);
  const outputDirPath = options.outputDirPath ?? defaultOutputDirPath;
  const fixturePath = options.fixturePath ?? defaultFixturePath;
  const now = options.now ?? new Date();

  if (runtimeMode === "UNCONFIGURED") {
    throw new ScannerOutputError("RUNTIME_MODE_UNCONFIGURED");
  }

  const candidates = await findCandidateRuns(outputDirPath);

  if (runtimeMode === "DEVELOPMENT_DEMO") {
    const latestValid = candidates.find((candidate) => isPersistableScannerOutputShape(candidate.output));
    if (latestValid?.output) {
      return withSourceMeta(latestValid.output, {
        source: "real-output",
        reason: "development demo selected the latest local output",
        selected_run_id: latestValid.run_id,
        loaded_at: now.toISOString(),
        runtime_mode: runtimeMode,
        age_seconds: calculateOptionalAgeSeconds(latestValid.finished_at, now),
        source_ids: extractDemoSourceIds(latestValid.output),
      });
    }

    return readFixtureOutput(
      fixturePath,
      candidates.length === 0 ? "no local scanner output found" : "no valid local scanner output found",
      now,
    );
  }

  if (!(await pathExists(outputDirPath))) {
    throw new ScannerOutputError("SCANNER_OUTPUT_DIRECTORY_MISSING");
  }

  const latest = candidates[0];
  if (!latest?.output) {
    throw new ScannerOutputError(latest?.read_error ? "SCANNER_OUTPUT_INVALID_JSON" : SCANNER_OUTPUT_UNAVAILABLE);
  }

  try {
    return sanitizeInternalBetaScannerOutput(latest.output, now);
  } catch (error) {
    if (error instanceof RealDataBoundaryError) {
      throw new ScannerOutputError(error.code);
    }
    throw new ScannerOutputError(INVALID_SCANNER_OUTPUT);
  }
}

export async function getScannerSourcesDiagnostics(
  options: LatestScannerOutputOptions = {},
): Promise<ScannerSourcesDiagnostics> {
  const runtimeMode = resolveProductRuntimeMode(options.runtimeMode);
  const outputDirPath = options.outputDirPath ?? defaultOutputDirPath;
  const fixturePath = options.fixturePath ?? defaultFixturePath;
  const now = options.now ?? new Date();

  if (runtimeMode === "UNCONFIGURED") {
    throw new ScannerOutputError("RUNTIME_MODE_UNCONFIGURED");
  }
  const outputDirExists = await pathExists(outputDirPath);
  const candidates = await findCandidateRuns(outputDirPath);

  const runs = candidates.slice(0, 10).map((candidate) => {
    let reasonCode: string | null = null;
    let valid = false;

    if (candidate.output) {
      try {
        valid = runtimeMode === "INTERNAL_BETA"
          ? Boolean(sanitizeInternalBetaScannerOutput(candidate.output, now))
          : isPersistableScannerOutputShape(candidate.output);
      } catch (error) {
        reasonCode = error instanceof RealDataBoundaryError ? error.code : INVALID_SCANNER_OUTPUT;
      }
    } else {
      reasonCode = candidate.read_error ? "SCANNER_OUTPUT_INVALID_JSON" : SCANNER_OUTPUT_UNAVAILABLE;
    }

    return {
      run_id: runtimeMode === "DEVELOPMENT_DEMO" || valid ? candidate.run_id : null,
      finished_at: candidate.finished_at,
      started_at: candidate.started_at,
      mtime: candidate.mtime,
      valid,
      reason_code: reasonCode,
    };
  });

  return {
    runtime_mode: runtimeMode,
    output_dir_exists: outputDirExists,
    output_dir: "tools/data-poc/output",
    runs_found: outputDirExists ? await countRunDirectories(outputDirPath) : 0,
    full_output_files_found: candidates.length,
    selected_run_id: runtimeMode === "DEVELOPMENT_DEMO"
      ? candidates[0]?.run_id ?? null
      : runs.find((run) => run.valid)?.run_id ?? null,
    ...(runtimeMode === "DEVELOPMENT_DEMO" ? {
      fixture_fallback_available: await pathExists(fixturePath),
      fixture: "tools/ui-mock/public/fixtures/persistableScannerSample.json" as const,
    } : {}),
    runs,
  };
}

export function isPersistableScannerOutputShape(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value.scan_run)) return false;

  return typeof value.scan_run.run_id === "string"
    && Array.isArray(value.candidates)
    && value.candidates.every(hasCandidateId)
    && Array.isArray(value.security_checks)
    && value.security_checks.every(hasCandidateId)
    && Array.isArray(value.scorecards)
    && value.scorecards.every(hasCandidateId);
}

function sanitizeInternalBetaScannerOutput(value: unknown, now: Date): ScannerOutputWithMeta {
  if (!isRecord(value) || !isRecord(value.scan_run)) {
    throw new RealDataBoundaryError(INVALID_SCANNER_OUTPUT);
  }

  const manifest = validateProvenanceManifest(value.provenance, {
    prefix: "SCANNER",
    schemaVersion: SCANNER_SCHEMA_VERSION,
    generatorVersions: [SCANNER_GENERATOR_VERSION],
    allowedSourceIds: SCANNER_SOURCE_IDS,
    requiredSourceIds: ["dexscreener"],
  });
  const scannerMetadata = sanitizeScannerMetadata(manifest.metadata, manifest.source_ids);
  const sanitizedManifest = { ...manifest, metadata: scannerMetadata };
  const scanRun = value.scan_run;

  if (
    scanRun.run_id !== manifest.run_id
    || scanRun.mode !== "live"
    || scanRun.finished_at !== manifest.finished_at
  ) {
    throw new RealDataBoundaryError("SCANNER_LINEAGE_MISMATCH");
  }

  if (containsFixtureMarker([
    scanRun.run_id,
    scanRun.query,
    value.metadata,
    manifest.metadata,
    extractFixtureSensitiveCandidateFields(value.candidates),
  ])) {
    throw new RealDataBoundaryError("SCANNER_FIXTURE_MARKER_DETECTED");
  }
  if (
    scanRun.query !== "two_basket_discovery"
    || !isRecord(scanRun.filters)
    || !hasExactKeys(scanRun.filters, ["basic_filters"])
    || scanRun.filters.basic_filters !== "dexscreener_basic_filters_v1"
  ) throw new RealDataBoundaryError(INVALID_SCANNER_OUTPUT);

  const freshness = requireFreshTimestamp(manifest.generated_at, now, SCANNER_MAX_AGE_MS, {
    missing: "SCANNER_TIMESTAMP_MISSING",
    invalid: "SCANNER_TIMESTAMP_INVALID",
    future: "SCANNER_TIMESTAMP_FUTURE",
    stale: "SCANNER_SNAPSHOT_STALE",
  });
  requireFreshTimestamp(manifest.finished_at, now, SCANNER_MAX_AGE_MS, {
    missing: "SCANNER_TIMESTAMP_MISSING",
    invalid: "SCANNER_TIMESTAMP_INVALID",
    future: "SCANNER_TIMESTAMP_FUTURE",
    stale: "SCANNER_SNAPSHOT_STALE",
  });

  const sanitizedScanRun = sanitizeScanRun(scanRun);
  if (!sanitizedScanRun) {
    throw new RealDataBoundaryError(INVALID_SCANNER_OUTPUT);
  }

  if (!Array.isArray(value.candidates)) {
    throw new RealDataBoundaryError(INVALID_SCANNER_OUTPUT);
  }

  const candidates = value.candidates.map((candidate) => sanitizeCandidate(candidate, manifest));
  if (candidates.some((candidate) => candidate === null)) {
    throw new RealDataBoundaryError(INVALID_SCANNER_OUTPUT);
  }
  validateSanitizedBasketCounts(candidates as Record<string, unknown>[], scannerMetadata);

  const securityChecks = sanitizeSecurityChecks(
    value.security_checks,
    candidates as Record<string, unknown>[],
    manifest,
    now,
  );

  return withSourceMeta({
    provenance: sanitizedManifest,
    scan_run: sanitizedScanRun,
    candidates,
    security_checks: securityChecks,
    scorecards: [],
  }, {
    source: "real-output",
    reason: "display-eligible INTERNAL_BETA snapshot",
    selected_run_id: manifest.run_id,
    loaded_at: now.toISOString(),
    runtime_mode: "INTERNAL_BETA",
    age_seconds: freshness.ageSeconds,
    source_ids: manifest.source_ids,
  });
}

function sanitizeScannerMetadata(value: unknown, sourceIds: string[]): Record<string, unknown> {
  if (!isRecord(value)) throw new RealDataBoundaryError("SCANNER_METADATA_INVALID");
  const allowedFields = [
    "discovery_architecture", "new_emerging", "established", "readiness",
    "security_candidate_limit", "security_candidates_requested", "request_counts", "source_health", "attribution",
  ];
  if (Object.keys(value).some((key) => !allowedFields.includes(key))) {
    throw new RealDataBoundaryError("SCANNER_METADATA_INVALID");
  }

  if (
    value.discovery_architecture !== "two_basket_discovery_v1"
    || !isNonNegativeInteger(value.security_candidate_limit)
    || !isNonNegativeInteger(value.security_candidates_requested)
    || !isRecord(value.request_counts)
    || !isRecord(value.source_health)
  ) throw new RealDataBoundaryError("SCANNER_METADATA_INVALID");
  const newEmerging = sanitizeNewEmergingMetadata(value.new_emerging);
  const established = sanitizeEstablishedMetadata(value.established);
  const readiness = sanitizeDiscoveryReadiness(
    value.readiness,
    established.universe_status as string,
    newEmerging.discovery_status as string,
  );
  const requestCounts = value.request_counts;
  const sourceHealth = value.source_health;

  const requestFields = ["dexscreener", "goplus_security", "alternative_me_fng", "defillama_api"];
  const healthFields = ["dexscreener", "goplus_security", "alternative_me_fng", "defillama_api"];
  if (
    !hasExactKeys(requestCounts, requestFields)
    || Object.values(requestCounts).some((count) => !isNonNegativeInteger(count))
    || !hasExactKeys(sourceHealth, healthFields)
    || Object.values(sourceHealth).some((health) => !["READY", "DEGRADED", "UNAVAILABLE", "NOT_INVOKED"].includes(String(health)))
  ) throw new RealDataBoundaryError("SCANNER_METADATA_INVALID");

  const seedCount = newEmerging.seed_count as number;
  const securityLimit = value.security_candidate_limit as number;
  const securityRequested = value.security_candidates_requested as number;
  const dexCount = requestCounts.dexscreener as number;
  const goPlusCount = requestCounts.goplus_security as number;
  const establishedEnabled = established.entries_enabled as number;
  if (
    securityLimit < 1 || securityLimit > 20
    || securityRequested > securityLimit || securityRequested > (established.candidates_after_filters as number)
    || dexCount < 1 + seedCount || dexCount > 1 + seedCount + Math.min(seedCount, 5)
      + establishedEnabled + Math.min(establishedEnabled, 5)
    || goPlusCount > securityLimit + Math.min(securityLimit, 3)
    || (requestCounts.alternative_me_fng as number) < 1
    || (requestCounts.alternative_me_fng as number) > 2
    || (requestCounts.defillama_api as number) < 1
    || (requestCounts.defillama_api as number) > 2
    || sourceHealth.dexscreener !== newEmerging.discovery_status
  ) throw new RealDataBoundaryError("SCANNER_METADATA_INVALID");

  const goplusInvoked = goPlusCount > 0;
  if (goplusInvoked !== sourceIds.includes("goplus_security")) {
    throw new RealDataBoundaryError("SCANNER_LINEAGE_MISMATCH");
  }
  let attribution: { provider: "GoPlus Security" } | undefined;
  if (goplusInvoked) {
    if (!isRecord(value.attribution) || !hasExactKeys(value.attribution, ["provider"]) || value.attribution.provider !== "GoPlus Security") {
      throw new RealDataBoundaryError("SCANNER_METADATA_INVALID");
    }
    attribution = { provider: "GoPlus Security" };
  } else if (value.attribution !== undefined) {
    throw new RealDataBoundaryError("SCANNER_METADATA_INVALID");
  }

  return {
    discovery_architecture: "two_basket_discovery_v1",
    new_emerging: newEmerging,
    established,
    readiness,
    security_candidate_limit: securityLimit,
    security_candidates_requested: securityRequested,
    request_counts: Object.fromEntries(requestFields.map((field) => [field, requestCounts[field]])),
    source_health: Object.fromEntries(healthFields.map((field) => [field, sourceHealth[field]])),
    ...(attribution ? { attribution } : {}),
  };
}

function sanitizeNewEmergingMetadata(value: unknown): Record<string, unknown> {
  const fields = [
    "discovery_method", "seed_count", "pair_requests_succeeded", "pair_requests_failed", "pairs_loaded",
    "candidates_before_filters", "candidates_after_filters", "discovery_status", "failure_reason_counts",
  ];
  if (!isRecord(value) || !hasExactKeys(value, fields) || value.discovery_method !== "dexscreener_latest_token_profiles") {
    throw new RealDataBoundaryError("SCANNER_METADATA_INVALID");
  }
  const numericFields = [
    "seed_count", "pair_requests_succeeded", "pair_requests_failed", "pairs_loaded",
    "candidates_before_filters", "candidates_after_filters",
  ];
  if (numericFields.some((field) => !isNonNegativeInteger(value[field]))) {
    throw new RealDataBoundaryError("SCANNER_METADATA_INVALID");
  }
  if (
    (value.seed_count as number) < 1 || (value.seed_count as number) > 30
    || (value.pair_requests_succeeded as number) + (value.pair_requests_failed as number) !== (value.seed_count as number)
    || (value.pair_requests_succeeded as number) < Math.max(3, Math.ceil((value.seed_count as number) * 0.5))
    || (value.candidates_before_filters as number) < 1
    || (value.candidates_before_filters as number) > (value.pairs_loaded as number)
    || (value.candidates_after_filters as number) > (value.candidates_before_filters as number)
  ) throw new RealDataBoundaryError("SCANNER_METADATA_INVALID");
  if (!isRecord(value.failure_reason_counts)) throw new RealDataBoundaryError("SCANNER_METADATA_INVALID");
  const allowedReasons = new Set([
    "NETWORK_ERROR", "TIMEOUT", "HTTP_429", "HTTP_4XX", "HTTP_5XX", "INVALID_RESPONSE",
    "REQUEST_BUDGET_EXHAUSTED",
  ]);
  const failureEntries = Object.entries(value.failure_reason_counts);
  const failed = value.pair_requests_failed as number;
  if (
    failureEntries.some(([reason, count]) => !allowedReasons.has(reason) || !isPositiveInteger(count))
    || failureEntries.reduce((total, [, count]) => total + Number(count), 0) !== failed
    || !["READY", "DEGRADED"].includes(String(value.discovery_status))
    || (failed === 0) !== (value.discovery_status === "READY")
  ) throw new RealDataBoundaryError("SCANNER_METADATA_INVALID");
  return {
    ...Object.fromEntries(fields.filter((field) => field !== "failure_reason_counts").map((field) => [field, value[field]])),
    failure_reason_counts: Object.fromEntries(failureEntries.sort(([left], [right]) => left.localeCompare(right))),
  };
}

function sanitizeEstablishedMetadata(value: unknown): Record<string, unknown> {
  const fields = [
    "discovery_method", "universe_version", "universe_status", "entries_total", "entries_enabled",
    "pairs_loaded", "candidates_before_filters", "candidates_after_filters", "base_token_candidates",
    "quote_token_candidates",
  ];
  if (
    !isRecord(value)
    || !hasExactKeys(value, fields)
    || value.discovery_method !== "address_seeded_universe"
    || value.universe_version !== "established_address_universe_v1"
    || !["ESTABLISHED_UNIVERSE_EMPTY", "ESTABLISHED_UNIVERSE_READY"].includes(String(value.universe_status))
  ) throw new RealDataBoundaryError("SCANNER_METADATA_INVALID");
  const numericFields = fields.slice(3);
  if (numericFields.some((field) => !isNonNegativeInteger(value[field]))) {
    throw new RealDataBoundaryError("SCANNER_METADATA_INVALID");
  }
  const total = value.entries_total as number;
  const enabled = value.entries_enabled as number;
  const pairs = value.pairs_loaded as number;
  const candidates = value.candidates_before_filters as number;
  const passed = value.candidates_after_filters as number;
  if (
    total > 100 || enabled > total || candidates > pairs || passed > candidates
    || (value.base_token_candidates as number) + (value.quote_token_candidates as number) !== candidates
  ) throw new RealDataBoundaryError("SCANNER_METADATA_INVALID");
  if (value.universe_status === "ESTABLISHED_UNIVERSE_EMPTY") {
    if (enabled !== 0 || pairs !== 0 || candidates !== 0 || passed !== 0) {
      throw new RealDataBoundaryError("SCANNER_METADATA_INVALID");
    }
  } else if (enabled < 1 || candidates < 1) {
    throw new RealDataBoundaryError("SCANNER_METADATA_INVALID");
  }
  return Object.fromEntries(fields.map((field) => [field, value[field]]));
}

function sanitizeDiscoveryReadiness(value: unknown, universeStatus: string, discoveryStatus: string): Record<string, unknown> {
  const fields = ["process", "new_emerging", "established", "context"];
  if (
    !isRecord(value) || !hasExactKeys(value, fields)
    || value.process !== "READY"
    || !["READY", "DEGRADED"].includes(String(value.new_emerging))
    || !["READY", "EMPTY_CONFIGURED"].includes(String(value.established))
    || !["READY", "UNAVAILABLE"].includes(String(value.context))
  ) throw new RealDataBoundaryError("SCANNER_METADATA_INVALID");
  const expected = universeStatus === "ESTABLISHED_UNIVERSE_EMPTY" ? "EMPTY_CONFIGURED" : "READY";
  if (value.established !== expected) throw new RealDataBoundaryError("SCANNER_METADATA_INVALID");
  if (value.new_emerging !== discoveryStatus) throw new RealDataBoundaryError("SCANNER_METADATA_INVALID");
  return Object.fromEntries(fields.map((field) => [field, value[field]]));
}

function hasExactKeys(value: Record<string, unknown>, fields: string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === fields.length && fields.every((field) => keys.includes(field));
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function sanitizeScanRun(value: Record<string, unknown>): Record<string, unknown> | null {
  const numericFields = [
    "total_raw",
    "passed_basic_filter",
    "rejected_basic_filter",
    "security_checked",
    "security_passed",
    "needs_manual_verification",
    "critical_risk",
    "watchlist_candidates",
  ] as const;

  if (
    typeof value.run_id !== "string"
    || typeof value.source !== "string"
    || value.mode !== "live"
    || (value.started_at !== null && typeof value.started_at !== "string")
    || typeof value.finished_at !== "string"
    || !isStringArray(value.errors)
    || numericFields.some((field) => typeof value[field] !== "number")
  ) {
    return null;
  }

  return {
    run_id: value.run_id,
    source: value.source,
    mode: "live",
    started_at: value.started_at,
    finished_at: value.finished_at,
    ...Object.fromEntries(numericFields.map((field) => [field, value[field]])),
    errors: value.errors,
  };
}

function sanitizeCandidate(
  value: unknown,
  manifest: RealDataProvenanceManifest,
): Record<string, unknown> | null {
  if (!isRecord(value)) return null;

  if (
    value.run_id !== manifest.run_id
    || typeof value.candidate_id !== "string"
    || typeof value.symbol !== "string"
    || !isNullableString(value.name)
    || typeof value.chain !== "string"
    || !isNullableString(value.contract_address)
    || !isNullableString(value.pair_address)
    || !isNullableString(value.dex)
    || typeof value.source !== "string"
    || !isNullableString(value.source_url)
    || !isNullableNumber(value.price_usd)
    || !isNullableNumber(value.market_cap_usd)
    || !isNullableNumber(value.fdv_usd)
    || !isNullableNumber(value.liquidity_usd)
    || !isNullableNumber(value.volume_24h_usd)
    || !isNullableNumber(value.volume_market_cap_ratio)
    || !isNullableString(value.pair_created_at)
    || !isNullableNumber(value.pair_age_days)
    || !BASIC_FILTER_STATUSES.includes(value.basic_filter_status as (typeof BASIC_FILTER_STATUSES)[number])
    || !isStringArray(value.filter_reasons)
    || !FINAL_LABELS.includes(value.final_label as (typeof FINAL_LABELS)[number])
    || !isStringArray(value.final_reasons)
    || typeof value.created_at !== "string"
    || !["new_emerging", "established"].includes(String(value.discovery_basket))
    || !["dexscreener_latest_token_profiles", "address_seeded_universe"].includes(String(value.discovery_method))
    || typeof value.observation_only !== "boolean"
    || typeof value.established_eligible !== "boolean"
    || !isNullableString(value.universe_version)
    || !(value.universe_entry_index === null || isNonNegativeInteger(value.universe_entry_index))
    || typeof value.address_identity_verified !== "boolean"
  ) {
    return null;
  }

  if (value.source !== "dexscreener" || !manifest.source_ids.includes("dexscreener")) {
    throw new RealDataBoundaryError("SCANNER_SOURCE_UNKNOWN");
  }

  const sourceUrl = sanitizeDexScreenerUrl(value.source_url);
  if (value.source_url !== null && sourceUrl === null) {
    throw new RealDataBoundaryError(INVALID_SCANNER_OUTPUT);
  }
  if (value.discovery_basket === "new_emerging") {
    if (
      value.discovery_method !== "dexscreener_latest_token_profiles"
      || value.observation_only !== true
      || value.established_eligible !== false
      || value.universe_version !== null
      || value.universe_entry_index !== null
      || value.address_identity_verified !== false
    ) throw new RealDataBoundaryError(INVALID_SCANNER_OUTPUT);
  } else if (
    value.discovery_method !== "address_seeded_universe"
    || value.observation_only !== false
    || value.established_eligible !== (value.basic_filter_status === "passed_basic_filter")
    || value.universe_version !== "established_address_universe_v1"
    || !isNonNegativeInteger(value.universe_entry_index)
    || value.address_identity_verified !== true
  ) {
    throw new RealDataBoundaryError(INVALID_SCANNER_OUTPUT);
  }

  return {
    run_id: manifest.run_id,
    candidate_id: value.candidate_id,
    symbol: value.symbol,
    name: value.name,
    chain: value.chain,
    contract_address: value.contract_address,
    pair_address: value.pair_address,
    dex: value.dex,
    source: "dexscreener",
    source_url: sourceUrl,
    price_usd: value.price_usd,
    market_cap_usd: value.market_cap_usd,
    fdv_usd: value.fdv_usd,
    liquidity_usd: value.liquidity_usd,
    volume_24h_usd: value.volume_24h_usd,
    volume_market_cap_ratio: value.volume_market_cap_ratio,
    pair_created_at: value.pair_created_at,
    pair_age_days: value.pair_age_days,
    basic_filter_status: value.basic_filter_status,
    filter_reasons: value.filter_reasons,
    final_label: value.final_label,
    final_reasons: value.final_reasons,
    created_at: value.created_at,
    discovery_basket: value.discovery_basket,
    discovery_method: value.discovery_method,
    observation_only: value.observation_only,
    established_eligible: value.established_eligible,
    universe_version: value.universe_version,
    universe_entry_index: value.universe_entry_index,
    address_identity_verified: value.address_identity_verified,
  };
}

function sanitizeSecurityChecks(
  rawValue: unknown,
  candidates: Record<string, unknown>[],
  manifest: RealDataProvenanceManifest,
  now: Date,
): Record<string, unknown>[] {
  if (!Array.isArray(rawValue)) {
    throw new RealDataBoundaryError(INVALID_SCANNER_OUTPUT);
  }

  const byCandidate = new Map<string, Record<string, unknown>>();
  for (const value of rawValue) {
    if (!isRecord(value) || typeof value.candidate_id !== "string" || byCandidate.has(value.candidate_id)) {
      throw new RealDataBoundaryError(INVALID_SCANNER_OUTPUT);
    }
    byCandidate.set(value.candidate_id, value);
  }

  return candidates.map((candidate) => {
    const candidateId = candidate.candidate_id as string;
    const security = byCandidate.get(candidateId);
    if (security && (
      candidate.discovery_basket !== "established"
      || candidate.basic_filter_status !== "passed_basic_filter"
    )) throw new RealDataBoundaryError(INVALID_SCANNER_OUTPUT);
    return security
      ? sanitizeSecurityCheck(security, candidateId, manifest, now)
      : unavailableSecurityCheck(manifest.run_id, candidateId, null);
  });
}

function validateSanitizedBasketCounts(
  candidates: Record<string, unknown>[],
  metadata: Record<string, unknown>,
): void {
  if (!isRecord(metadata.new_emerging) || !isRecord(metadata.established)) {
    throw new RealDataBoundaryError("SCANNER_METADATA_INVALID");
  }
  const newEmerging = candidates.filter((candidate) => candidate.discovery_basket === "new_emerging");
  const established = candidates.filter((candidate) => candidate.discovery_basket === "established");
  const entriesTotal = metadata.established.entries_total;
  if (!isNonNegativeInteger(entriesTotal)) throw new RealDataBoundaryError("SCANNER_METADATA_INVALID");
  if (
    newEmerging.length !== metadata.new_emerging.candidates_before_filters
    || established.length !== metadata.established.candidates_before_filters
    || newEmerging.filter((candidate) => candidate.basic_filter_status === "passed_basic_filter").length
      !== metadata.new_emerging.candidates_after_filters
    || established.filter((candidate) => candidate.basic_filter_status === "passed_basic_filter").length
      !== metadata.established.candidates_after_filters
    || established.some((candidate) => (
      !isNonNegativeInteger(candidate.universe_entry_index)
      || (candidate.universe_entry_index as number) >= entriesTotal
    ))
  ) throw new RealDataBoundaryError("SCANNER_METADATA_INVALID");
}

function sanitizeSecurityCheck(
  value: Record<string, unknown>,
  candidateId: string,
  manifest: RealDataProvenanceManifest,
  now: Date,
): Record<string, unknown> {
  if (
    value.run_id !== manifest.run_id
    || value.candidate_id !== candidateId
    || !isStringArray(value.sources)
    || typeof value.honeypot_status !== "string"
    || !isNullableNumber(value.buy_tax)
    || !isNullableNumber(value.sell_tax)
    || !isNullableBoolean(value.contract_verified)
    || typeof value.ownership_status !== "string"
    || !isNullableBoolean(value.liquidity_locked)
    || !isNullableNumber(value.liquidity_lock_days)
    || !isNullableBoolean(value.mint_risk)
    || !isNullableBoolean(value.blacklist_risk)
    || !isNullableBoolean(value.whitelist_risk)
    || !isNullableBoolean(value.sell_restriction_risk)
    || !isNullableBoolean(value.proxy_risk)
    || !isNullableNumber(value.top_wallet_pct)
    || !isNullableNumber(value.top_10_wallets_pct)
    || !isStringArray(value.risk_flags)
    || !isStringArray(value.missing_data)
    || typeof value.security_label !== "string"
    || !isStringArray(value.critical_reasons)
    || !isStringArray(value.warning_reasons)
  ) {
    throw new RealDataBoundaryError(INVALID_SCANNER_OUTPUT);
  }

  const sourceIds = unique(value.sources.map(normalizeSecuritySourceId));
  if (sourceIds.some((sourceId) => !SECURITY_SOURCE_IDS.includes(sourceId as (typeof SECURITY_SOURCE_IDS)[number]))) {
    throw new RealDataBoundaryError("SCANNER_SOURCE_UNKNOWN");
  }
  if (sourceIds.some((sourceId) => !manifest.source_ids.includes(sourceId))) {
    throw new RealDataBoundaryError("SCANNER_LINEAGE_MISMATCH");
  }

  if (isSecurityTimestampExpired(value.checked_at, now)) {
    return unavailableSecurityCheck(
      manifest.run_id,
      candidateId,
      typeof value.checked_at === "string" ? value.checked_at : null,
    );
  }

  const coverageStatus = sourceIds.length === 0
    ? "SECURITY DATA UNAVAILABLE"
    : null;
  const securityLabel = sourceIds.length === 0
    ? "SECURITY DATA UNAVAILABLE"
    : value.security_label === "CRITICAL_RISK"
      ? "CRITICAL RISK"
      : "NEEDS MANUAL VERIFICATION";

  return {
    run_id: manifest.run_id,
    candidate_id: candidateId,
    sources: sourceIds,
    coverage_status: coverageStatus,
    honeypot_status: value.honeypot_status,
    buy_tax: value.buy_tax,
    sell_tax: value.sell_tax,
    contract_verified: value.contract_verified,
    ownership_status: value.ownership_status,
    liquidity_locked: value.liquidity_locked,
    liquidity_lock_days: value.liquidity_lock_days,
    mint_risk: value.mint_risk,
    blacklist_risk: value.blacklist_risk,
    whitelist_risk: value.whitelist_risk,
    sell_restriction_risk: value.sell_restriction_risk,
    proxy_risk: value.proxy_risk,
    top_wallet_pct: value.top_wallet_pct,
    top_10_wallets_pct: value.top_10_wallets_pct,
    risk_flags: value.risk_flags,
    missing_data: value.missing_data,
    security_label: securityLabel,
    critical_reasons: value.critical_reasons,
    warning_reasons: value.warning_reasons,
    checked_at: value.checked_at,
  };
}

function unavailableSecurityCheck(runId: string, candidateId: string, checkedAt: string | null): Record<string, unknown> {
  return {
    run_id: runId,
    candidate_id: candidateId,
    sources: [],
    coverage_status: "SECURITY DATA UNAVAILABLE",
    honeypot_status: "unknown",
    buy_tax: null,
    sell_tax: null,
    contract_verified: null,
    ownership_status: "unknown",
    liquidity_locked: null,
    liquidity_lock_days: null,
    mint_risk: null,
    blacklist_risk: null,
    whitelist_risk: null,
    sell_restriction_risk: null,
    proxy_risk: null,
    top_wallet_pct: null,
    top_10_wallets_pct: null,
    risk_flags: [],
    missing_data: ["security_data_unavailable"],
    security_label: "SECURITY DATA UNAVAILABLE",
    critical_reasons: [],
    warning_reasons: ["security_data_unavailable"],
    checked_at: checkedAt,
  };
}

function sanitizeDexScreenerUrl(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string") return null;

  try {
    const url = new URL(value);
    const approvedHost = url.hostname === "dexscreener.com" || url.hostname.endsWith(".dexscreener.com");
    if (
      url.protocol !== "https:"
      || !approvedHost
      || url.username.length > 0
      || url.password.length > 0
      || url.search.length > 0
      || url.hash.length > 0
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

async function readFixtureOutput(path: string, reason: string, now: Date): Promise<ScannerOutputWithMeta> {
  try {
    const output: unknown = JSON.parse(await readFile(path, "utf8"));
    if (!isPersistableScannerOutputShape(output)) {
      throw new ScannerOutputError(INVALID_SCANNER_OUTPUT);
    }

    return withSourceMeta(output, {
      source: "fixture-fallback",
      reason,
      selected_run_id: null,
      loaded_at: now.toISOString(),
      runtime_mode: "DEVELOPMENT_DEMO",
      age_seconds: null,
      source_ids: extractDemoSourceIds(output),
    });
  } catch (error) {
    if (error instanceof ScannerOutputError) throw error;
    throw new ScannerOutputError(SCANNER_OUTPUT_UNAVAILABLE);
  }
}

async function findCandidateRuns(outputDirPath: string): Promise<CandidateRun[]> {
  try {
    const entries = await readdir(outputDirPath, { withFileTypes: true });
    const runs = await Promise.all(
      entries.filter((entry) => entry.isDirectory()).map((entry) => inspectRunDirectory(entry.name, outputDirPath)),
    );
    return runs.filter((run): run is CandidateRun => Boolean(run)).sort((a, b) => b.sort_time - a.sort_time);
  } catch {
    return [];
  }
}

async function inspectRunDirectory(runId: string, outputDirPath: string): Promise<CandidateRun | null> {
  const fullOutputPath = buildDataPocOutputPath(runId, outputDirPath);

  try {
    const fileStat = await stat(fullOutputPath);
    const output: unknown = JSON.parse(await readFile(fullOutputPath, "utf8"));
    const timestamps = extractScanRunTimestamps(output);
    return {
      run_id: runId,
      full_output_path: fullOutputPath,
      finished_at: timestamps.finished_at,
      started_at: timestamps.started_at,
      mtime: fileStat.mtime.toISOString(),
      sort_time: timestampToSortTime(timestamps.finished_at, timestamps.started_at, fileStat.mtime),
      output,
      read_error: false,
    };
  } catch (error) {
    if (isErrno(error, "ENOENT")) return null;
    const fallbackStat = await statSafe(fullOutputPath);
    return {
      run_id: runId,
      full_output_path: fullOutputPath,
      finished_at: null,
      started_at: null,
      mtime: fallbackStat?.mtime.toISOString() ?? new Date(0).toISOString(),
      sort_time: fallbackStat?.mtime.getTime() ?? 0,
      output: null,
      read_error: true,
    };
  }
}

function extractScanRunTimestamps(output: unknown): { finished_at: string | null; started_at: string | null } {
  if (!isRecord(output) || !isRecord(output.scan_run)) return { finished_at: null, started_at: null };
  return {
    finished_at: typeof output.scan_run.finished_at === "string" ? output.scan_run.finished_at : null,
    started_at: typeof output.scan_run.started_at === "string" ? output.scan_run.started_at : null,
  };
}

function extractFixtureSensitiveCandidateFields(value: unknown): unknown[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).flatMap((candidate) => [
    candidate.symbol,
    candidate.contract_address,
    candidate.pair_address,
    candidate.metadata,
  ]);
}

function extractDemoSourceIds(output: unknown): string[] {
  if (!isRecord(output) || !Array.isArray(output.candidates)) return [];
  return unique(output.candidates.filter(isRecord).map((candidate) => candidate.source).filter(isString));
}

function isSecurityTimestampExpired(value: unknown, now: Date): boolean {
  if (typeof value !== "string") return true;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return true;
  const age = now.getTime() - parsed;
  return age > SECURITY_MAX_AGE_MS || age < -FUTURE_TIMESTAMP_TOLERANCE_MS;
}

function normalizeSecuritySourceId(sourceId: string): string {
  if (sourceId === "goplus") return "goplus_security";
  if (sourceId === "honeypot") return "honeypot_is";
  return sourceId;
}

function withSourceMeta(output: unknown, meta: ScannerSourceMeta): ScannerOutputWithMeta {
  if (!isRecord(output)) throw new ScannerOutputError(INVALID_SCANNER_OUTPUT);
  return { ...output, _source_meta: meta };
}

function timestampToSortTime(finishedAt: string | null, startedAt: string | null, mtime: Date): number {
  for (const value of [finishedAt, startedAt]) {
    if (!value) continue;
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return mtime.getTime();
}

function calculateOptionalAgeSeconds(value: string | null, now: Date): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : Math.max(0, Math.floor((now.getTime() - parsed) / 1000));
}

function hasCandidateId(value: unknown): boolean {
  return isRecord(value) && typeof value.candidate_id === "string" && value.candidate_id.length > 0;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || typeof value === "number";
}

function isNullableBoolean(value: unknown): value is boolean | null {
  return value === null || typeof value === "boolean";
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

async function countRunDirectories(outputDirPath: string): Promise<number> {
  try {
    const entries = await readdir(outputDirPath, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).length;
  } catch {
    return 0;
  }
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
