import { AI_RESEARCH_TARGET_MODEL } from "../src/types/aiResearchTypes.js";
import { fileURLToPath } from "node:url";
import { resolveAIResearchProviderConfig } from "./aiResearchProvider.js";
import { createAIResearchWorker } from "./aiResearchWorker.js";

type OwnerLiveSmokePreflight = { allowed: true } | { allowed: false; code: string };

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
  }));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
