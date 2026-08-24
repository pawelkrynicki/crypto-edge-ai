import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import { validateOwnerLiveSmokeEnvironment } from "../server/runOwnerAIResearchLiveSmoke.js";

const uiRoot = resolve(process.cwd());

describe("owner-only live AI smoke preflight", () => {
  it("fails closed before the worker when the owner marker, API key, or one-call budget is absent", () => {
    assert.deepEqual(validateOwnerLiveSmokeEnvironment({}), { allowed: false, code: "OWNER_LIVE_SMOKE_NOT_CONFIRMED" });
    assert.deepEqual(validateOwnerLiveSmokeEnvironment(ownerEnvironment({ OPENAI_API_KEY: "" })), { allowed: false, code: "OWNER_LIVE_SMOKE_API_KEY_MISSING" });
    assert.deepEqual(validateOwnerLiveSmokeEnvironment(ownerEnvironment({ CRYPTO_EDGE_AI_RESEARCH_LIVE_CALL_BUDGET: "2" })), { allowed: false, code: "OWNER_LIVE_SMOKE_BUDGET_INVALID" });
  });

  it("accepts only the frozen central-worker configuration without executing a provider call", () => {
    assert.deepEqual(validateOwnerLiveSmokeEnvironment(ownerEnvironment()), { allowed: true });
  });

  it("uses one central worker cycle and does not expose the API key in its owner launcher", async () => {
    const [runner, launcher] = await Promise.all([
      readFile(resolve(uiRoot, "server", "runOwnerAIResearchLiveSmoke.ts"), "utf8"),
      readFile(resolve(uiRoot, "..", "..", "scripts", "win", "run-owner-ai-live-smoke.cmd"), "utf8"),
    ]);
    assert.match(runner, /maxConcurrency: 1, maxAnalysesPerCycle: 1, maxAttempts: 1/);
    assert.match(runner, /cycle\.provider_calls > 1/);
    assert.match(launcher, /CRYPTO_EDGE_OWNER_LIVE_AI_SMOKE=1/);
    assert.match(launcher, /CRYPTO_EDGE_AI_RESEARCH_LIVE_CALL_BUDGET=1/);
    assert.match(launcher, /CRYPTO_EDGE_AI_RESEARCH_MODEL=gpt-5-mini/);
    assert.doesNotMatch(launcher, /echo .*OPENAI_API_KEY/i);
  });
});

function ownerEnvironment(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    CRYPTO_EDGE_OWNER_LIVE_AI_SMOKE: "1",
    CRYPTO_EDGE_RUNTIME_MODE: "INTERNAL_BETA",
    CRYPTO_EDGE_PC1_REVIEW_DEFAULT_ACTOR: "OWNER",
    CRYPTO_EDGE_AI_WORKER_ENABLED: "1",
    ALLOW_LIVE_PROVIDER_CALLS: "1",
    CRYPTO_EDGE_AI_RESEARCH_PROVIDER: "OPENAI",
    CRYPTO_EDGE_AI_RESEARCH_MODEL: "gpt-5-mini",
    CRYPTO_EDGE_AI_RESEARCH_LIVE_CALL_BUDGET: "1",
    OPENAI_API_KEY: "test-key-not-used",
    ...overrides,
  };
}
