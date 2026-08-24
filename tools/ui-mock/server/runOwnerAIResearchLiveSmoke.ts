import { AI_RESEARCH_TARGET_MODEL } from "../src/types/aiResearchTypes.js";
import { fileURLToPath } from "node:url";
import { buildAIResearchContext } from "./aiResearchContext.js";
import { buildAIAnalysisCacheIdentity, createAIAnalysisQueueStore } from "./aiResearchQueueStore.js";
import { resolveAIResearchProviderConfig } from "./aiResearchProvider.js";
import { createAIResearchWorker, resolveAIResearchWorkerContextOptions } from "./aiResearchWorker.js";
import { AI_RESEARCH_NARRATIVE_VERSION } from "./aiResearchNarrativeContract.js";
import { AI_RESEARCH_COMPOSITION_POLICY_VERSION } from "./aiResearchCompositionPolicy.js";
import { AI_RESEARCH_SEMANTIC_POLICY_VERSION } from "./aiResearchSemanticPolicy.js";
import { AI_RESEARCH_PROVIDER_WIRE_SCHEMA_VERSION } from "./aiResearchProviderWireSchema.js";
import { AI_RESEARCH_PROMPT_VERSION, AI_RESEARCH_SCHEMA_VERSION } from "../src/types/aiResearchTypes.js";

type OwnerLiveSmokePreflight = { allowed: true } | { allowed: false; code: string };

const OWNER_LIVE_SMOKE_IDENTITY = {
  chain: "bsc",
  contract_address: "0xe9bc5c6a86caa44fd7b469bf3cc7c563e4f77777",
} as const;

export function validateOwnerLiveSmokeEnvironment(env: NodeJS.ProcessEnv = process.env): OwnerLiveSmokePreflight {
  const provider = resolveAIResearchProviderConfig(env);
  if (env.CRYPTO_EDGE_OWNER_LIVE_AI_SMOKE !== "1") return { allowed: false, code: "OWNER_LIVE_SMOKE_NOT_CONFIRMED" };
  if (env.CRYPTO_EDGE_RUNTIME_MODE !== "INTERNAL_BETA") return { allowed: false, code: "OWNER_LIVE_SMOKE_RUNTIME_INVALID" };
  if (env.CRYPTO_EDGE_PC1_REVIEW_DEFAULT_ACTOR !== "OWNER") return { allowed: false, code: "OWNER_LIVE_SMOKE_ACTOR_INVALID" };
  if (env.CRYPTO_EDGE_AI_WORKER_ENABLED !== "1" || env.ALLOW_LIVE_PROVIDER_CALLS !== "1") return { allowed: false, code: "OWNER_LIVE_SMOKE_WORKER_DISABLED" };
  if (provider.mode !== "OPENAI" || provider.model !== AI_RESEARCH_TARGET_MODEL) return { allowed: false, code: "OWNER_LIVE_SMOKE_PROVIDER_INVALID" };
  if (!provider.apiKey) return { allowed: false, code: "OWNER_LIVE_SMOKE_API_KEY_MISSING" };
  if (provider.liveCallBudget !== 1 || provider.liveCallBudgetInvalid) return { allowed: false, code: "OWNER_LIVE_SMOKE_BUDGET_INVALID" };
  return { allowed: true };
}

async function recoverOwnerAuthorizedNetworkAttempt(): Promise<{
  analysis_id: string;
  recovery_attempt_id: string;
  previous_analysis_id: string;
}> {
  const contextOptions = resolveAIResearchWorkerContextOptions({}, process.env);
  const context = await buildAIResearchContext(
    OWNER_LIVE_SMOKE_IDENTITY.chain,
    OWNER_LIVE_SMOKE_IDENTITY.contract_address,
    "en",
    contextOptions,
  );
  const identity = buildAIAnalysisCacheIdentity({
    ...context.identity,
    locale: "en",
    snapshot_fingerprint: context.snapshot_fingerprint,
    prompt_version: AI_RESEARCH_PROMPT_VERSION,
    narrative_contract_version: AI_RESEARCH_NARRATIVE_VERSION,
    semantic_policy_version: AI_RESEARCH_SEMANTIC_POLICY_VERSION,
    composition_policy_version: AI_RESEARCH_COMPOSITION_POLICY_VERSION,
    provider_wire_schema_version: AI_RESEARCH_PROVIDER_WIRE_SCHEMA_VERSION,
    model_id: AI_RESEARCH_TARGET_MODEL,
    analysis_schema_version: AI_RESEARCH_SCHEMA_VERSION,
  });
  const store = await createAIAnalysisQueueStore();
  try {
    const recovery = store.recoverSuspendedProviderNetwork({
      identity,
      owner_scope_hash: "owner_live_smoke",
      now: new Date(),
    });
    if (recovery.outcome !== "QUEUED" || !recovery.record || !recovery.recovery_attempt_id || !recovery.previous_analysis_id) {
      throw new Error("OWNER_LIVE_SMOKE_RECOVERY_NOT_QUEUED");
    }
    // This is an explicit owner recovery, never an automatic worker retry.
    store.resumeWorker(new Date());
    return {
      analysis_id: recovery.record.analysis_id,
      recovery_attempt_id: recovery.recovery_attempt_id,
      previous_analysis_id: recovery.previous_analysis_id,
    };
  } finally {
    store.close();
  }
}

async function main(): Promise<void> {
  if (process.argv.length !== 2) {
    console.error("OWNER_LIVE_SMOKE_ARGUMENT_INVALID");
    process.exitCode = 1;
    return;
  }
  const preflight = validateOwnerLiveSmokeEnvironment();
  if (!preflight.allowed) {
    console.error(preflight.code);
    process.exitCode = 1;
    return;
  }
  let recovery: Awaited<ReturnType<typeof recoverOwnerAuthorizedNetworkAttempt>>;
  try {
    recovery = await recoverOwnerAuthorizedNetworkAttempt();
  } catch (error) {
    console.error(error instanceof Error && error.message === "OWNER_LIVE_SMOKE_RECOVERY_NOT_QUEUED"
      ? error.message : "OWNER_LIVE_SMOKE_RECOVERY_FAILED");
    process.exitCode = 1;
    return;
  }
  const worker = createAIResearchWorker({
    limits: { maxConcurrency: 1, maxAnalysesPerCycle: 1, maxAttempts: 1 },
  });
  const cycle = await worker.runCycle();
  if (cycle.provider_calls > 1) {
    console.error("OWNER_LIVE_SMOKE_BUDGET_EXCEEDED");
    process.exitCode = 1;
    return;
  }
  console.log(JSON.stringify({
    schema_version: "owner_ai_live_smoke_v1",
    status: cycle.status,
    claimed: cycle.claimed,
    completed: cycle.completed,
    suspended: cycle.suspended,
    provider_calls: cycle.provider_calls,
    safe_error_code: cycle.safe_error_code,
    recovery,
  }));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
