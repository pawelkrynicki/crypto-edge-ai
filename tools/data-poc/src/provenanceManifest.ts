import { getSourcePolicyDecision, type SourceAction } from "./sourcePolicy.js";

export const REAL_DATA_CONTRACT_VERSION = "real_data_boundary_v1";

export type ProvenanceDecisionState = "allowed" | "denied";

export type SnapshotProvenanceManifest = {
  schema_version: string;
  contract_version: typeof REAL_DATA_CONTRACT_VERSION;
  generator_version: string;
  environment: string;
  mode: "fixture" | "live";
  fixture_used: boolean;
  run_id: string;
  generated_at: string;
  finished_at: string;
  source_ids: string[];
  policy_decisions: Record<string, {
    live_fetch: ProvenanceDecisionState;
    normalized_storage: ProvenanceDecisionState;
    user_display: ProvenanceDecisionState;
    raw_storage: ProvenanceDecisionState;
  }>;
  metadata?: Record<string, unknown>;
};

export type BuildSnapshotProvenanceInput = {
  schemaVersion: string;
  generatorVersion: string;
  environment: string;
  mode: "fixture" | "live";
  runId: string;
  generatedAt: string;
  finishedAt: string;
  sourceIds: string[];
  metadata?: Record<string, unknown>;
};

export function buildSnapshotProvenanceManifest(
  input: BuildSnapshotProvenanceInput,
): SnapshotProvenanceManifest {
  const policyEnvironment = input.mode === "fixture" ? "FIXTURE_ONLY" : input.environment;
  const sourceIds = [...new Set(input.sourceIds)];

  return {
    schema_version: input.schemaVersion,
    contract_version: REAL_DATA_CONTRACT_VERSION,
    generator_version: input.generatorVersion,
    environment: input.mode === "fixture" ? "DEVELOPMENT_DEMO" : input.environment,
    mode: input.mode,
    fixture_used: input.mode === "fixture",
    run_id: input.runId,
    generated_at: input.generatedAt,
    finished_at: input.finishedAt,
    source_ids: sourceIds,
    policy_decisions: Object.fromEntries(sourceIds.map((sourceId) => [
      sourceId,
      {
        live_fetch: decisionState(sourceId, policyEnvironment, "live_fetch"),
        normalized_storage: decisionState(sourceId, policyEnvironment, "normalized_storage"),
        user_display: decisionState(sourceId, policyEnvironment, "user_display"),
        raw_storage: decisionState(sourceId, policyEnvironment, "raw_storage"),
      },
    ])),
    ...(input.metadata ? { metadata: input.metadata } : {}),
  };
}

function decisionState(sourceId: string, environment: string, action: SourceAction): ProvenanceDecisionState {
  return getSourcePolicyDecision({ sourceId, environment, action }).allowed ? "allowed" : "denied";
}
