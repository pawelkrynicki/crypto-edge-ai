import { getSourcePolicyDecision } from "./sourcePolicy.js";
import {
  SCANNER_GENERATOR_VERSION,
  SCANNER_SCHEMA_VERSION,
  type PersistableScannerOutput,
} from "./persistableScannerModel.js";
import { REAL_DATA_CONTRACT_VERSION } from "./provenanceManifest.js";

const CANDIDATE_FIELDS = new Set([
  "run_id", "candidate_id", "symbol", "name", "chain", "contract_address", "pair_address", "dex",
  "source", "source_url", "price_usd", "market_cap_usd", "fdv_usd", "liquidity_usd",
  "volume_24h_usd", "volume_market_cap_ratio", "pair_created_at", "pair_age_days",
  "basic_filter_status", "filter_reasons", "final_label", "final_reasons", "created_at",
  "discovery_basket", "discovery_method", "observation_only", "established_eligible",
  "universe_version", "universe_entry_index", "address_identity_verified",
]);
const SECURITY_FIELDS = new Set([
  "run_id", "candidate_id", "sources", "honeypot_status", "buy_tax", "sell_tax", "contract_verified",
  "ownership_status", "liquidity_locked", "liquidity_lock_days", "mint_risk", "blacklist_risk",
  "whitelist_risk", "sell_restriction_risk", "proxy_risk", "top_wallet_pct", "top_10_wallets_pct",
  "risk_flags", "missing_data", "security_label", "critical_reasons", "warning_reasons", "checked_at",
]);
const OUTPUT_FIELDS = new Set(["provenance", "scan_run", "candidates", "security_checks", "scorecards"]);
const MANIFEST_FIELDS = new Set([
  "schema_version", "contract_version", "generator_version", "environment", "mode", "fixture_used",
  "run_id", "generated_at", "finished_at", "source_ids", "policy_decisions", "metadata",
]);
const POLICY_FIELDS = new Set(["live_fetch", "normalized_storage", "user_display", "raw_storage"]);
const SCAN_RUN_FIELDS = new Set([
  "run_id", "source", "mode", "query", "filters", "limits", "started_at", "finished_at", "total_raw",
  "passed_basic_filter", "rejected_basic_filter", "security_checked", "security_passed",
  "needs_manual_verification", "critical_risk", "watchlist_candidates", "errors",
]);
const METADATA_FIELDS = new Set([
  "discovery_architecture", "new_emerging", "established", "readiness",
  "security_candidate_limit", "security_candidates_requested", "request_counts", "source_health", "attribution",
]);
const NEW_EMERGING_FIELDS = new Set([
  "discovery_method", "seed_count", "pair_requests_succeeded", "pair_requests_failed", "pairs_loaded",
  "candidates_before_filters", "candidates_after_filters", "discovery_status", "failure_reason_counts",
]);
const DISCOVERY_FAILURE_REASONS = new Set([
  "NETWORK_ERROR", "TIMEOUT", "HTTP_429", "HTTP_4XX", "HTTP_5XX", "INVALID_RESPONSE",
  "REQUEST_BUDGET_EXHAUSTED",
]);
const ESTABLISHED_FIELDS = new Set([
  "discovery_method", "universe_version", "universe_status", "entries_total", "entries_enabled",
  "pairs_loaded", "candidates_before_filters", "candidates_after_filters", "base_token_candidates",
  "quote_token_candidates",
]);
const READINESS_FIELDS = new Set(["process", "new_emerging", "established", "context"]);
const REQUEST_COUNT_FIELDS = new Set([
  "dexscreener", "goplus_security", "alternative_me_fng", "defillama_api",
]);
const SOURCE_HEALTH_FIELDS = new Set([
  "dexscreener", "goplus_security", "alternative_me_fng", "defillama_api",
]);
const ATTRIBUTION_FIELDS = new Set(["provider"]);
const FORBIDDEN_MARKER = /fixture|sample|mock|demo/i;

export class DisplaySnapshotValidationError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "DisplaySnapshotValidationError";
    this.code = code;
  }
}

export function validateDisplayEligibleScannerSnapshot(output: PersistableScannerOutput): void {
  assertExactFields(output, OUTPUT_FIELDS);
  const manifest = output.provenance;
  if (!manifest) fail("SCANNER_MANIFEST_MISSING");
  assertExactFields(manifest, MANIFEST_FIELDS);
  if (
    manifest.schema_version !== SCANNER_SCHEMA_VERSION
    || manifest.contract_version !== REAL_DATA_CONTRACT_VERSION
    || manifest.generator_version !== SCANNER_GENERATOR_VERSION
  ) fail("SCANNER_MANIFEST_VERSION_UNSUPPORTED");
  if (manifest.environment !== "INTERNAL_BETA") fail("SCANNER_ENVIRONMENT_INVALID");
  if (manifest.mode !== "live" || output.scan_run.mode !== "live") fail("SCANNER_MODE_INVALID");
  if (manifest.fixture_used !== false) fail("SCANNER_FIXTURE_FORBIDDEN");
  if (
    output.scan_run.run_id !== manifest.run_id
    || output.scan_run.finished_at !== manifest.finished_at
  ) fail("SCANNER_LINEAGE_MISMATCH");

  const sourceIds = manifest.source_ids;
  if (!sourceIds.includes("dexscreener")) fail("SCANNER_SOURCE_REQUIRED");
  if (new Set(sourceIds).size !== sourceIds.length) fail("SCANNER_MANIFEST_INVALID");
  if (sourceIds.some((sourceId) => !["dexscreener", "goplus_security"].includes(sourceId))) {
    fail("SCANNER_SOURCE_UNKNOWN");
  }

  for (const sourceId of sourceIds) {
    const decisions = manifest.policy_decisions[sourceId];
    if (!decisions) fail("SCANNER_POLICY_DECISIONS_MISSING");
    assertExactFields(decisions, POLICY_FIELDS);
    for (const action of ["live_fetch", "normalized_storage", "user_display"] as const) {
      const expected = getSourcePolicyDecision({ sourceId, environment: "INTERNAL_BETA", action }).allowed
        ? "allowed"
        : "denied";
      if (decisions[action] !== expected || expected !== "allowed") fail("SCANNER_POLICY_MISMATCH");
    }
    if (decisions.raw_storage !== "denied") fail("SCANNER_RAW_STORAGE_ALLOWED");
  }

  if (!isRecord(manifest.metadata)) fail("SCANNER_METADATA_INVALID");
  const metadata = manifest.metadata;
  const requestCounts = validateScannerMetadata(metadata);
  const goplusInvoked = isNonNegativeInteger(requestCounts.goplus_security) && requestCounts.goplus_security > 0;
  if (goplusInvoked !== sourceIds.includes("goplus_security")) fail("SCANNER_LINEAGE_MISMATCH");

  assertExactFields(output.scan_run, SCAN_RUN_FIELDS);
  if (
    output.scan_run.source !== "combined-scanner-poc"
    || output.scan_run.query !== "two_basket_discovery"
    || !isRecord(output.scan_run.filters)
    || Object.keys(output.scan_run.filters).length !== 1
    || output.scan_run.filters.basic_filters !== "dexscreener_basic_filters_v1"
    || !isRecord(output.scan_run.limits)
    || Object.keys(output.scan_run.limits).length !== 1
    || !isNonNegativeInteger(output.scan_run.limits.max_candidates)
  ) fail("SCANNER_SCHEMA_INVALID");

  if (!Array.isArray(output.candidates) || !Array.isArray(output.security_checks) || !Array.isArray(output.scorecards)) {
    fail("SCANNER_SCHEMA_INVALID");
  }
  if (output.scorecards.length !== 0) fail("SCANNER_SCORECARDS_FORBIDDEN");

  for (const candidate of output.candidates) {
    assertExactFields(candidate, CANDIDATE_FIELDS);
    if (
      candidate.run_id !== manifest.run_id
      || candidate.source !== "dexscreener"
      || typeof candidate.symbol !== "string"
      || typeof candidate.chain !== "string"
      || (candidate.contract_address !== null && typeof candidate.contract_address !== "string")
    ) fail("SCANNER_SCHEMA_INVALID");
    validateCandidateDiscoveryMetadata(candidate, metadata);
    if (candidate.source_url !== null) assertDexScreenerUrl(candidate.source_url);
  }
  validateCandidateBasketCounts(output.candidates, metadata);

  const candidateIds = new Set(output.candidates.map((candidate) => candidate.candidate_id));
  const candidateById = new Map(output.candidates.map((candidate) => [candidate.candidate_id, candidate]));
  for (const security of output.security_checks) {
    assertExactFields(security, SECURITY_FIELDS);
    if (
      security.run_id !== manifest.run_id
      || !candidateIds.has(security.candidate_id)
      || security.sources.some((source) => source !== "goplus")
    ) fail("SCANNER_SCHEMA_INVALID");
    const securedCandidate = candidateById.get(security.candidate_id);
    if (
      securedCandidate?.discovery_basket !== "established"
      || securedCandidate.basic_filter_status !== "passed_basic_filter"
    ) fail("SCANNER_SCHEMA_INVALID");
    if (security.sources.includes("goplus") && !sourceIds.includes("goplus_security")) {
      fail("SCANNER_LINEAGE_MISMATCH");
    }
  }

  if (containsForbiddenMarker([
    manifest.run_id,
    output.scan_run.query,
    metadata,
    output.candidates.map((candidate) => [candidate.symbol, candidate.name, candidate.contract_address, candidate.pair_address]),
  ])) fail("SCANNER_FIXTURE_MARKER_DETECTED");

  const serialized = JSON.stringify(output);
  if (/([A-Za-z]:\\|\/Users\/|\/home\/)/.test(serialized)) fail("SCANNER_ABSOLUTE_PATH_FORBIDDEN");
}

function validateScannerMetadata(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) fail("SCANNER_METADATA_INVALID");
  assertExactFields(value, METADATA_FIELDS);
  if (value.discovery_architecture !== "two_basket_discovery_v1") fail("SCANNER_METADATA_INVALID");
  const newEmerging = validateNewEmergingMetadata(value.new_emerging);
  const established = validateEstablishedMetadata(value.established);
  validateReadinessMetadata(
    value.readiness,
    established.universe_status as string,
    newEmerging.discovery_status as string,
  );
  if (!isNonNegativeInteger(value.security_candidate_limit) || !isNonNegativeInteger(value.security_candidates_requested)) {
    fail("SCANNER_METADATA_INVALID");
  }

  const seedCount = newEmerging.seed_count as number;
  const securityLimit = value.security_candidate_limit as number;
  const securityRequested = value.security_candidates_requested as number;
  if (
    securityLimit < 1 || securityLimit > 20
    || securityRequested > securityLimit
    || securityRequested > (established.candidates_after_filters as number)
  ) fail("SCANNER_METADATA_INVALID");

  if (!isRecord(value.request_counts)) fail("SCANNER_METADATA_INVALID");
  assertExactFields(value.request_counts, REQUEST_COUNT_FIELDS);
  if (Object.values(value.request_counts).some((count) => !isNonNegativeInteger(count))) {
    fail("SCANNER_METADATA_INVALID");
  }
  const establishedEnabled = established.entries_enabled as number;
  const dexBudget = 1 + seedCount + Math.min(seedCount, 5)
    + establishedEnabled + Math.min(establishedEnabled, 5);
  const goPlusBudget = securityLimit + Math.min(securityLimit, 3);
  if (
    (value.request_counts.dexscreener as number) < 1 + seedCount
    || (value.request_counts.dexscreener as number) > dexBudget
    || (value.request_counts.goplus_security as number) > goPlusBudget
    || (value.request_counts.alternative_me_fng as number) < 1
    || (value.request_counts.alternative_me_fng as number) > 2
    || (value.request_counts.defillama_api as number) < 1
    || (value.request_counts.defillama_api as number) > 2
  ) fail("SCANNER_METADATA_INVALID");

  if (!isRecord(value.source_health)) fail("SCANNER_METADATA_INVALID");
  assertExactFields(value.source_health, SOURCE_HEALTH_FIELDS);
  const healthValues = new Set(["READY", "DEGRADED", "UNAVAILABLE", "NOT_INVOKED"]);
  if (Object.values(value.source_health).some((health) => !healthValues.has(String(health)))) {
    fail("SCANNER_METADATA_INVALID");
  }
  if (value.source_health.dexscreener !== newEmerging.discovery_status) fail("SCANNER_METADATA_INVALID");

  const goplusInvoked = (value.request_counts.goplus_security as number) > 0;
  if (goplusInvoked) {
    if (!isRecord(value.attribution)) fail("SCANNER_METADATA_INVALID");
    assertExactFields(value.attribution, ATTRIBUTION_FIELDS);
    if (value.attribution.provider !== "GoPlus Security") fail("SCANNER_METADATA_INVALID");
  } else if (value.attribution !== undefined) {
    fail("SCANNER_METADATA_INVALID");
  }
  return value.request_counts;
}

function validateNewEmergingMetadata(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) fail("SCANNER_METADATA_INVALID");
  assertExactFields(value, NEW_EMERGING_FIELDS);
  if (value.discovery_method !== "dexscreener_latest_token_profiles") fail("SCANNER_METADATA_INVALID");
  const numericFields = [
    "seed_count", "pair_requests_succeeded", "pair_requests_failed", "pairs_loaded",
    "candidates_before_filters", "candidates_after_filters",
  ];
  if (numericFields.some((field) => !isNonNegativeInteger(value[field]))) fail("SCANNER_METADATA_INVALID");
  const seedCount = value.seed_count as number;
  const succeeded = value.pair_requests_succeeded as number;
  const failed = value.pair_requests_failed as number;
  const minimumRequired = Math.max(3, Math.ceil(seedCount * 0.5));
  if (
    seedCount < 1 || seedCount > 30
    || succeeded + failed !== seedCount
    || succeeded < minimumRequired
    || (value.candidates_before_filters as number) < 1
    || (value.candidates_before_filters as number) > (value.pairs_loaded as number)
    || (value.candidates_after_filters as number) > (value.candidates_before_filters as number)
  ) fail("SCANNER_METADATA_INVALID");
  if (!isRecord(value.failure_reason_counts)) fail("SCANNER_METADATA_INVALID");
  const failureEntries = Object.entries(value.failure_reason_counts);
  if (
    failureEntries.some(([reason, count]) => !DISCOVERY_FAILURE_REASONS.has(reason) || !isPositiveInteger(count))
    || failureEntries.reduce((total, [, count]) => total + Number(count), 0) !== failed
    || !["READY", "DEGRADED"].includes(String(value.discovery_status))
    || (failed === 0) !== (value.discovery_status === "READY")
  ) fail("SCANNER_METADATA_INVALID");
  return value;
}

function validateEstablishedMetadata(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) fail("SCANNER_METADATA_INVALID");
  assertExactFields(value, ESTABLISHED_FIELDS);
  if (
    value.discovery_method !== "address_seeded_universe"
    || value.universe_version !== "established_address_universe_v1"
    || !["ESTABLISHED_UNIVERSE_EMPTY", "ESTABLISHED_UNIVERSE_READY"].includes(String(value.universe_status))
  ) fail("SCANNER_METADATA_INVALID");
  const numericFields = [
    "entries_total", "entries_enabled", "pairs_loaded", "candidates_before_filters", "candidates_after_filters",
    "base_token_candidates", "quote_token_candidates",
  ];
  if (numericFields.some((field) => !isNonNegativeInteger(value[field]))) fail("SCANNER_METADATA_INVALID");
  const total = value.entries_total as number;
  const enabled = value.entries_enabled as number;
  const pairs = value.pairs_loaded as number;
  const candidates = value.candidates_before_filters as number;
  const passed = value.candidates_after_filters as number;
  if (
    total > 100 || enabled > total || candidates > pairs || passed > candidates
    || (value.base_token_candidates as number) + (value.quote_token_candidates as number) !== candidates
  ) fail("SCANNER_METADATA_INVALID");
  if (value.universe_status === "ESTABLISHED_UNIVERSE_EMPTY") {
    if (enabled !== 0 || pairs !== 0 || candidates !== 0 || passed !== 0) fail("SCANNER_METADATA_INVALID");
  } else if (enabled < 1 || candidates < 1) {
    fail("SCANNER_METADATA_INVALID");
  }
  return value;
}

function validateReadinessMetadata(value: unknown, universeStatus: string, discoveryStatus: string): void {
  if (!isRecord(value)) fail("SCANNER_METADATA_INVALID");
  assertExactFields(value, READINESS_FIELDS);
  if (
    value.process !== "READY"
    || !["READY", "DEGRADED"].includes(String(value.new_emerging))
    || !["READY", "EMPTY_CONFIGURED"].includes(String(value.established))
    || !["READY", "UNAVAILABLE"].includes(String(value.context))
  ) fail("SCANNER_METADATA_INVALID");
  const expectedEstablished = universeStatus === "ESTABLISHED_UNIVERSE_EMPTY" ? "EMPTY_CONFIGURED" : "READY";
  if (value.established !== expectedEstablished) fail("SCANNER_METADATA_INVALID");
  if (value.new_emerging !== discoveryStatus) fail("SCANNER_METADATA_INVALID");
}

function validateCandidateDiscoveryMetadata(candidate: Record<string, unknown>, metadata: Record<string, unknown>): void {
  if (!isRecord(metadata.established)) fail("SCANNER_METADATA_INVALID");
  if (candidate.discovery_basket === "new_emerging") {
    if (
      candidate.discovery_method !== "dexscreener_latest_token_profiles"
      || candidate.observation_only !== true
      || candidate.established_eligible !== false
      || candidate.universe_version !== null
      || candidate.universe_entry_index !== null
      || candidate.address_identity_verified !== false
    ) fail("SCANNER_SCHEMA_INVALID");
    return;
  }
  if (
    candidate.discovery_basket !== "established"
    || candidate.discovery_method !== "address_seeded_universe"
    || candidate.observation_only !== false
    || candidate.established_eligible !== (candidate.basic_filter_status === "passed_basic_filter")
    || candidate.universe_version !== metadata.established.universe_version
    || !isNonNegativeInteger(candidate.universe_entry_index)
    || (candidate.universe_entry_index as number) >= (metadata.established.entries_total as number)
    || candidate.address_identity_verified !== true
  ) fail("SCANNER_SCHEMA_INVALID");
}

function validateCandidateBasketCounts(candidates: Array<Record<string, unknown>>, metadata: Record<string, unknown>): void {
  if (!isRecord(metadata.new_emerging) || !isRecord(metadata.established)) fail("SCANNER_METADATA_INVALID");
  const newEmerging = candidates.filter((candidate) => candidate.discovery_basket === "new_emerging");
  const established = candidates.filter((candidate) => candidate.discovery_basket === "established");
  if (
    newEmerging.length !== metadata.new_emerging.candidates_before_filters
    || established.length !== metadata.established.candidates_before_filters
    || newEmerging.filter((candidate) => candidate.basic_filter_status === "passed_basic_filter").length
      !== metadata.new_emerging.candidates_after_filters
    || established.filter((candidate) => candidate.basic_filter_status === "passed_basic_filter").length
      !== metadata.established.candidates_after_filters
  ) fail("SCANNER_METADATA_INVALID");
}

function assertExactFields(value: object, allowlist: Set<string>): void {
  if (Object.keys(value).some((key) => !allowlist.has(key))) fail("SCANNER_UNKNOWN_FIELD");
}

function assertDexScreenerUrl(value: string): void {
  try {
    const url = new URL(value);
    const approvedHost = url.hostname === "dexscreener.com" || url.hostname.endsWith(".dexscreener.com");
    if (url.protocol !== "https:" || !approvedHost || url.search || url.hash || url.username || url.password) {
      fail("SCANNER_SCHEMA_INVALID");
    }
  } catch {
    fail("SCANNER_SCHEMA_INVALID");
  }
}

function containsForbiddenMarker(value: unknown): boolean {
  if (typeof value === "string") return FORBIDDEN_MARKER.test(value);
  if (Array.isArray(value)) return value.some(containsForbiddenMarker);
  if (isRecord(value)) return Object.entries(value).some(([key, field]) => FORBIDDEN_MARKER.test(key) || containsForbiddenMarker(field));
  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function fail(code: string): never {
  throw new DisplaySnapshotValidationError(code);
}
