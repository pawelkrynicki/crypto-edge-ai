import { getSourcePolicyDecision, type SourceAction } from "../../data-poc/src/sourcePolicy.js";

export const REAL_DATA_CONTRACT_VERSION = "real_data_boundary_v1";
export const INTERNAL_BETA_ENVIRONMENT = "INTERNAL_BETA";
export const FUTURE_TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000;

export type PolicyDecisionState = "allowed" | "denied";

export type ProvenancePolicyDecisions = {
  live_fetch: PolicyDecisionState;
  normalized_storage: PolicyDecisionState;
  user_display: PolicyDecisionState;
  raw_storage: PolicyDecisionState;
};

export type RealDataProvenanceManifest = {
  schema_version: string;
  contract_version: typeof REAL_DATA_CONTRACT_VERSION;
  generator_version: string;
  environment: typeof INTERNAL_BETA_ENVIRONMENT;
  mode: "live";
  fixture_used: false;
  run_id: string;
  generated_at: string;
  finished_at: string;
  source_ids: string[];
  policy_decisions: Record<string, ProvenancePolicyDecisions>;
  metadata?: unknown;
};

export type ManifestValidationOptions = {
  prefix: "SCANNER" | "CONTEXT";
  schemaVersion: string;
  generatorVersions: readonly string[];
  allowedSourceIds: readonly string[];
  requiredSourceIds: readonly string[];
};

export class RealDataBoundaryError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "RealDataBoundaryError";
    this.code = code;
  }
}

export function validateProvenanceManifest(
  value: unknown,
  options: ManifestValidationOptions,
): RealDataProvenanceManifest {
  if (!isRecord(value)) {
    throw new RealDataBoundaryError(`${options.prefix}_MANIFEST_MISSING`);
  }

  if (
    value.schema_version !== options.schemaVersion
    || value.contract_version !== REAL_DATA_CONTRACT_VERSION
    || typeof value.generator_version !== "string"
    || !options.generatorVersions.includes(value.generator_version)
  ) {
    throw new RealDataBoundaryError(`${options.prefix}_MANIFEST_VERSION_UNSUPPORTED`);
  }

  if (value.environment !== INTERNAL_BETA_ENVIRONMENT) {
    throw new RealDataBoundaryError(`${options.prefix}_ENVIRONMENT_INVALID`);
  }

  if (value.mode !== "live") {
    throw new RealDataBoundaryError(`${options.prefix}_MODE_INVALID`);
  }

  if (value.fixture_used !== false) {
    throw new RealDataBoundaryError(`${options.prefix}_FIXTURE_FORBIDDEN`);
  }

  if (
    typeof value.run_id !== "string"
    || value.run_id.length === 0
    || typeof value.generated_at !== "string"
    || typeof value.finished_at !== "string"
    || !isStringArray(value.source_ids)
    || value.source_ids.length === 0
    || !isRecord(value.policy_decisions)
  ) {
    throw new RealDataBoundaryError(`${options.prefix}_MANIFEST_INVALID`);
  }

  const sourceIds = unique(value.source_ids);
  if (sourceIds.length !== value.source_ids.length) {
    throw new RealDataBoundaryError(`${options.prefix}_MANIFEST_INVALID`);
  }

  for (const requiredSourceId of options.requiredSourceIds) {
    if (!sourceIds.includes(requiredSourceId)) {
      throw new RealDataBoundaryError(`${options.prefix}_SOURCE_REQUIRED`);
    }
  }

  const policyDecisions: Record<string, ProvenancePolicyDecisions> = {};
  const policyDecisionSourceIds = Object.keys(value.policy_decisions);

  if (policyDecisionSourceIds.some((sourceId) => !sourceIds.includes(sourceId))) {
    throw new RealDataBoundaryError(`${options.prefix}_SOURCE_UNKNOWN`);
  }

  for (const sourceId of sourceIds) {
    if (!options.allowedSourceIds.includes(sourceId)) {
      throw new RealDataBoundaryError(`${options.prefix}_SOURCE_UNKNOWN`);
    }

    const decisions = sanitizePolicyDecisions(value.policy_decisions[sourceId]);
    if (!decisions) {
      throw new RealDataBoundaryError(`${options.prefix}_POLICY_DECISIONS_MISSING`);
    }

    if (decisions.raw_storage !== "denied") {
      throw new RealDataBoundaryError(`${options.prefix}_RAW_STORAGE_ALLOWED`);
    }

    for (const action of ["live_fetch", "normalized_storage", "user_display"] as const) {
      if (decisions[action] !== "allowed") {
        throw new RealDataBoundaryError(`${options.prefix}_POLICY_DENIED`);
      }
    }

    assertDecisionMatchesRuntimePolicy(sourceId, decisions, options.prefix);
    policyDecisions[sourceId] = decisions;
  }

  return {
    schema_version: value.schema_version,
    contract_version: REAL_DATA_CONTRACT_VERSION,
    generator_version: value.generator_version,
    environment: INTERNAL_BETA_ENVIRONMENT,
    mode: "live",
    fixture_used: false,
    run_id: value.run_id,
    generated_at: value.generated_at,
    finished_at: value.finished_at,
    source_ids: sourceIds,
    policy_decisions: policyDecisions,
    ...(value.metadata === undefined ? {} : { metadata: value.metadata }),
  };
}

export function requireFreshTimestamp(
  value: unknown,
  now: Date,
  maxAgeMs: number,
  codes: { missing: string; invalid: string; future: string; stale: string },
): { timestamp: string; ageSeconds: number } {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new RealDataBoundaryError(codes.missing);
  }

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    throw new RealDataBoundaryError(codes.invalid);
  }

  const ageMs = now.getTime() - parsed;
  if (ageMs < -FUTURE_TIMESTAMP_TOLERANCE_MS) {
    throw new RealDataBoundaryError(codes.future);
  }

  if (ageMs > maxAgeMs) {
    throw new RealDataBoundaryError(codes.stale);
  }

  return {
    timestamp: value,
    ageSeconds: Math.max(0, Math.floor(ageMs / 1000)),
  };
}

export function containsFixtureMarker(value: unknown): boolean {
  if (typeof value === "string") {
    return /fixture|sample|mock|demo/i.test(value);
  }

  if (Array.isArray(value)) {
    return value.some(containsFixtureMarker);
  }

  if (isRecord(value)) {
    return Object.entries(value).some(([key, field]) => containsFixtureMarker(key) || containsFixtureMarker(field));
  }

  return false;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function sanitizePolicyDecisions(value: unknown): ProvenancePolicyDecisions | null {
  if (!isRecord(value)) return null;

  const decisions = {
    live_fetch: value.live_fetch,
    normalized_storage: value.normalized_storage,
    user_display: value.user_display,
    raw_storage: value.raw_storage,
  };

  return Object.values(decisions).every(isPolicyDecisionState)
    ? decisions as ProvenancePolicyDecisions
    : null;
}

function assertDecisionMatchesRuntimePolicy(
  sourceId: string,
  decisions: ProvenancePolicyDecisions,
  prefix: ManifestValidationOptions["prefix"],
): void {
  const actions = ["live_fetch", "normalized_storage", "user_display", "raw_storage"] as const satisfies readonly SourceAction[];
  for (const action of actions) {
    const runtimeDecision = getSourcePolicyDecision({
      sourceId,
      environment: INTERNAL_BETA_ENVIRONMENT,
      action,
    });
    const manifestAllowed = decisions[action] === "allowed";

    if (runtimeDecision.allowed !== manifestAllowed) {
      throw new RealDataBoundaryError(`${prefix}_POLICY_MISMATCH`);
    }
  }
}

function isPolicyDecisionState(value: unknown): value is PolicyDecisionState {
  return value === "allowed" || value === "denied";
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
