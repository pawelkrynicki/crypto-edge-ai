import type { ApprovedSourcesRunOutput } from "./sources/sourceAdapterTypes.js";
import { getSourcePolicyDecision } from "./sourcePolicy.js";
import { REAL_DATA_CONTRACT_VERSION } from "./provenanceManifest.js";
import { CONTEXT_GENERATOR_VERSION, CONTEXT_SCHEMA_VERSION } from "./sources/runApprovedSourcesPoc.js";

const REQUIRED_SOURCE_IDS = ["alternative_me_fng", "defillama_api"] as const;
const OUTPUT_FIELDS = new Set(["provenance", "run_id", "generated_at", "environment", "sources", "summary"]);
const MANIFEST_FIELDS = new Set([
  "schema_version", "contract_version", "generator_version", "environment", "mode", "fixture_used",
  "run_id", "generated_at", "finished_at", "source_ids", "policy_decisions", "metadata",
]);
const SOURCE_FIELDS = new Set([
  "source_id", "source_name", "mode", "fetched_at", "health_status", "attribution", "policy",
  "data_category", "records", "warnings", "errors",
]);
const POLICY_FIELDS = new Set(["environment", "action", "allowed", "reason"]);
const ATTRIBUTION_FIELDS = new Set(["provider", "requirement", "url"]);
const SUMMARY_FIELDS = new Set([
  "sources_requested", "sources_allowed", "sources_denied", "records_total", "warnings_total", "errors_total",
  "degraded_external_sources_total", "hard_failures_total",
]);
const FEAR_GREED_FIELDS = new Set([
  "record_type", "value", "value_classification", "timestamp", "time_until_update",
]);
const DEFI_FIELDS = new Set([
  "record_type", "name", "chain", "tvl_usd", "change_1d", "change_7d", "url",
]);

export class ContextSnapshotValidationError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "ContextSnapshotValidationError";
    this.code = code;
  }
}

export function validateDisplayEligibleContextSnapshot(output: ApprovedSourcesRunOutput): void {
  assertExactFields(output, OUTPUT_FIELDS);
  const manifest = output.provenance;
  assertExactFields(manifest, MANIFEST_FIELDS);
  if (
    manifest.schema_version !== CONTEXT_SCHEMA_VERSION
    || manifest.contract_version !== REAL_DATA_CONTRACT_VERSION
    || manifest.generator_version !== CONTEXT_GENERATOR_VERSION
  ) fail("CONTEXT_MANIFEST_VERSION_UNSUPPORTED");
  if (manifest.environment !== "INTERNAL_BETA" || output.environment !== "INTERNAL_BETA") {
    fail("CONTEXT_ENVIRONMENT_INVALID");
  }
  if (manifest.mode !== "live" || manifest.fixture_used !== false) fail("CONTEXT_MODE_INVALID");
  if (
    output.run_id !== manifest.run_id
    || output.generated_at !== manifest.generated_at
    || manifest.finished_at !== output.generated_at
  ) fail("CONTEXT_LINEAGE_MISMATCH");

  const sourceIds = [...manifest.source_ids].sort();
  if (JSON.stringify(sourceIds) !== JSON.stringify([...REQUIRED_SOURCE_IDS].sort())) {
    fail("CONTEXT_SOURCE_REQUIRED");
  }

  for (const sourceId of REQUIRED_SOURCE_IDS) {
    const decisions = manifest.policy_decisions[sourceId];
    if (!decisions) fail("CONTEXT_POLICY_DECISIONS_MISSING");
    assertExactFields(decisions, new Set(["live_fetch", "normalized_storage", "user_display", "raw_storage"]));
    for (const action of ["live_fetch", "normalized_storage", "user_display"] as const) {
      const expected = getSourcePolicyDecision({ sourceId, environment: "INTERNAL_BETA", action }).allowed;
      if (!expected || decisions[action] !== "allowed") fail("CONTEXT_POLICY_MISMATCH");
    }
    if (decisions.raw_storage !== "denied") fail("CONTEXT_RAW_STORAGE_ALLOWED");
  }

  if (output.sources.length !== REQUIRED_SOURCE_IDS.length) fail("CONTEXT_SOURCE_REQUIRED");
  for (const sourceId of REQUIRED_SOURCE_IDS) {
    const source = output.sources.find((candidate) => candidate.source_id === sourceId);
    if (
      !source
      || source.mode !== "live"
      || source.policy.environment !== "INTERNAL_BETA"
      || source.policy.action !== "live_fetch"
      || !source.policy.allowed
      || source.records.length === 0
      || source.errors.length > 0
      || !source.attribution.provider
      || !source.attribution.requirement
      || !source.attribution.url
    ) fail("CONTEXT_SOURCE_DATA_UNAVAILABLE");
    assertExactFields(source, SOURCE_FIELDS);
    assertExactFields(source.policy, POLICY_FIELDS);
    validateAttribution(sourceId, source.attribution);
    for (const record of source.records) validateRecord(record);
  }

  validateSummary(output);
  validateMetadata(manifest.metadata, output);

  if (/fixture|sample|mock|demo/i.test(JSON.stringify(manifest.metadata ?? {}))) {
    fail("CONTEXT_FIXTURE_MARKER_DETECTED");
  }
  if (/([A-Za-z]:\\|\/Users\/|\/home\/)/.test(JSON.stringify(output))) {
    fail("CONTEXT_ABSOLUTE_PATH_FORBIDDEN");
  }
}

function validateAttribution(sourceId: string, value: unknown): void {
  if (!isRecord(value)) fail("CONTEXT_ATTRIBUTION_INVALID");
  assertExactFields(value, ATTRIBUTION_FIELDS);
  const expectedProvider = sourceId === "alternative_me_fng" ? "Alternative.me" : "DefiLlama";
  if (value.provider !== expectedProvider || typeof value.requirement !== "string" || !value.requirement) {
    fail("CONTEXT_ATTRIBUTION_INVALID");
  }
  assertHttpsUrl(value.url);
}

function validateRecord(value: unknown): void {
  if (!isRecord(value)) fail("CONTEXT_SCHEMA_INVALID");
  if (value.record_type === "fear_greed_index") {
    assertExactFields(value, FEAR_GREED_FIELDS);
    if (
      typeof value.value !== "number" || !Number.isFinite(value.value)
      || typeof value.value_classification !== "string"
      || (value.timestamp !== null && typeof value.timestamp !== "string")
      || (value.time_until_update !== null && typeof value.time_until_update !== "string")
    ) fail("CONTEXT_SCHEMA_INVALID");
    return;
  }
  if (value.record_type === "defi_protocol_snapshot" || value.record_type === "chain_tvl_snapshot") {
    assertExactFields(value, DEFI_FIELDS);
    if (
      typeof value.name !== "string"
      || (value.chain !== null && typeof value.chain !== "string")
      || !isNullableFiniteNumber(value.tvl_usd)
      || !isNullableFiniteNumber(value.change_1d)
      || !isNullableFiniteNumber(value.change_7d)
      || (value.url !== null && typeof value.url !== "string")
    ) fail("CONTEXT_SCHEMA_INVALID");
    if (typeof value.url === "string") assertHttpsUrl(value.url);
    return;
  }
  fail("CONTEXT_SCHEMA_INVALID");
}

function validateSummary(output: ApprovedSourcesRunOutput): void {
  assertExactFields(output.summary, SUMMARY_FIELDS);
  const expected = {
    sources_requested: REQUIRED_SOURCE_IDS.length,
    sources_allowed: output.sources.filter((source) => source.policy.allowed).length,
    sources_denied: output.sources.filter((source) => !source.policy.allowed).length,
    records_total: output.sources.reduce((total, source) => total + source.records.length, 0),
    warnings_total: output.sources.reduce((total, source) => total + source.warnings.length, 0),
    errors_total: output.sources.reduce((total, source) => total + source.errors.length, 0),
    degraded_external_sources_total: output.sources.filter((source) => source.health_status === "degraded_external_source").length,
    hard_failures_total: output.sources.filter((source) => source.health_status === "error" && source.errors.length > 0).length,
  };
  if (Object.entries(expected).some(([key, value]) => output.summary[key as keyof typeof output.summary] !== value)) {
    fail("CONTEXT_SUMMARY_INVALID");
  }
}

function validateMetadata(value: unknown, output: ApprovedSourcesRunOutput): void {
  if (!isRecord(value)) fail("CONTEXT_METADATA_INVALID");
  assertExactFields(value, new Set(["request_counts", "attributions"]));
  if (!isRecord(value.request_counts) || !isRecord(value.attributions)) fail("CONTEXT_METADATA_INVALID");
  const expectedKeys = new Set(REQUIRED_SOURCE_IDS);
  assertExactFields(value.request_counts, expectedKeys);
  assertExactFields(value.attributions, expectedKeys);
  for (const source of output.sources) {
    const count = value.request_counts[source.source_id];
    if (!Number.isInteger(count) || Number(count) < 0 || Number(count) > 2) fail("CONTEXT_METADATA_INVALID");
    if (JSON.stringify(value.attributions[source.source_id]) !== JSON.stringify(source.attribution)) {
      fail("CONTEXT_METADATA_INVALID");
    }
  }
}

function assertExactFields(value: object, allowlist: Set<string>): void {
  if (Object.keys(value).some((key) => !allowlist.has(key))) fail("CONTEXT_UNKNOWN_FIELD");
}

function assertHttpsUrl(value: unknown): void {
  if (typeof value !== "string") fail("CONTEXT_ATTRIBUTION_INVALID");
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) fail("CONTEXT_ATTRIBUTION_INVALID");
  } catch {
    fail("CONTEXT_ATTRIBUTION_INVALID");
  }
}

function isNullableFiniteNumber(value: unknown): boolean {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function fail(code: string): never {
  throw new ContextSnapshotValidationError(code);
}
