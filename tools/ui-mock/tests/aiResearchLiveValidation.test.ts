import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { after, describe, it } from "node:test";
import { buildAIResearchContext, sha256, stableJson, type AIResearchContext } from "../server/aiResearchContext.js";
import {
  createAIResearchProvider,
  OPENAI_RESEARCH_CLIENT_MAX_RETRIES,
  resolveAIResearchProviderConfig,
  type AIResearchProvider,
  type AIResearchProviderConfig,
} from "../server/aiResearchProvider.js";
import { buildDeterministicPreview, createAIResearchService } from "../server/aiResearchService.js";
import { createAIResearchStore } from "../server/aiResearchStore.js";
import { PERSISTABLE_SCANNER_SAMPLE } from "../src/fixtures/persistableScannerSample.js";

const root = await mkdtemp(resolve(tmpdir(), "crypto-edge-ai-openai-review-tests-"));
const fixturePath = resolve(root, "scanner.json");
const outputDirPath = resolve(root, "missing-output");
const followUpPath = resolve(root, "missing-follow-up.json");
const reportsPath = resolve(root, "missing-reports");
const ADDRESS = "0x1111111111111111111111111111111111111111";
const NOW = new Date("2026-07-27T09:00:00.000Z");
const TEST_KEY = "test-only-openai-key-never-log";

await writeFixture();
after(async () => { await rm(root, { recursive: true, force: true }); });

describe("AI.2 OpenAI client contract", () => {
  it("fails closed without a key or model and accepts only the one-call review budget", async () => {
    const missingKey = resolveAIResearchProviderConfig({
      CRYPTO_EDGE_AI_RESEARCH_PROVIDER: "OPENAI",
      CRYPTO_EDGE_AI_RESEARCH_MODEL: "configured-test-model",
    });
    const missingModel = resolveAIResearchProviderConfig({
      CRYPTO_EDGE_AI_RESEARCH_PROVIDER: "OPENAI",
      OPENAI_API_KEY: TEST_KEY,
    });
    const invalidBudget = resolveAIResearchProviderConfig({
      CRYPTO_EDGE_AI_RESEARCH_PROVIDER: "OPENAI",
      OPENAI_API_KEY: TEST_KEY,
      CRYPTO_EDGE_AI_RESEARCH_MODEL: "configured-test-model",
      CRYPTO_EDGE_AI_RESEARCH_LIVE_CALL_BUDGET: "2",
    });
    assert.equal(missingKey.apiKey, null);
    assert.equal(missingModel.model, null);
    assert.equal(invalidBudget.liveCallBudget, null);
    assert.equal(invalidBudget.liveCallBudgetInvalid, true);
    assert.equal(resolveAIResearchProviderConfig({ CRYPTO_EDGE_AI_RESEARCH_LIVE_CALL_BUDGET: "1" }).liveCallBudget, 1);
    const defaults = resolveAIResearchProviderConfig({});
    const outOfBounds = resolveAIResearchProviderConfig({
      CRYPTO_EDGE_AI_RESEARCH_TIMEOUT_MS: "120001",
      CRYPTO_EDGE_AI_RESEARCH_MAX_CONCURRENCY: "9",
    });
    assert.equal(defaults.timeoutMs, 30_000);
    assert.equal(defaults.maxConcurrency, 2);
    assert.equal(outOfBounds.timeoutMs, 30_000);
    assert.equal(outOfBounds.maxConcurrency, 2);

    let calls = 0;
    const fetchStub: typeof fetch = async () => { calls += 1; throw new Error("must not call"); };
    const context = await researchContext("pl");
    await assert.rejects(() => createAIResearchProvider({ config: missingKey, fetch: fetchStub }).generate(context), /MISSING_API_KEY/);
    await assert.rejects(() => createAIResearchProvider({ config: missingModel, fetch: fetchStub }).generate(context), /MODEL_NOT_CONFIGURED/);
    assert.equal(calls, 0);
  });

  it("uses Responses Structured Outputs with storage/background disabled, no tools and no SDK retry", async () => {
    const context = await researchContext("pl");
    const bodies: Record<string, unknown>[] = [];
    const fetchStub: typeof fetch = async (_input, init) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return new Response(JSON.stringify(responsePayload(context)), {
        status: 200,
        headers: { "content-type": "application/json", "x-request-id": "req_ai2_test" },
      });
    };
    const result = await createAIResearchProvider({ config: config(), fetch: fetchStub }).generate(context);
    assert.equal(OPENAI_RESEARCH_CLIENT_MAX_RETRIES, 0);
    assert.equal(bodies.length, 1);
    const body = bodies[0]!;
    assert.equal(body.store, false);
    assert.equal(body.background, false);
    assert.equal("tools" in body, false);
    assert.equal("previous_response_id" in body, false);
    assert.equal("conversation" in body, false);
    assert.equal((body.text as { format: { type: string; name: string; strict: boolean } }).format.type, "json_schema");
    assert.equal((body.text as { format: { type: string; name: string; strict: boolean } }).format.name, "ai_research_brief_v1");
    assert.equal((body.text as { format: { type: string; name: string; strict: boolean } }).format.strict, true);
    assert.equal(result.request_id, "req_ai2_test");
    assert.deepEqual(result.token_usage, { prompt_tokens: 17, completion_tokens: 8, total_tokens: 25 });

    let failures = 0;
    const noRetryFetch: typeof fetch = async () => {
      failures += 1;
      return new Response(JSON.stringify({ error: { message: "test failure" } }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    };
    await assert.rejects(() => createAIResearchProvider({ config: config(), fetch: noRetryFetch }).generate(context), /PROVIDER_ERROR/);
    assert.equal(failures, 1);
  });

  it("does not expose the configured key through errors or console output", async () => {
    const captured: string[] = [];
    const originalError = console.error;
    const originalWarn = console.warn;
    console.error = (...values: unknown[]) => { captured.push(values.join(" ")); };
    console.warn = (...values: unknown[]) => { captured.push(values.join(" ")); };
    try {
      const provider = createAIResearchProvider({
        config: config(),
        fetch: async () => new Response(JSON.stringify({ error: { message: "rejected" } }), {
          status: 401,
          headers: { "content-type": "application/json" },
        }),
      });
      const error = await provider.generate(await researchContext("pl")).catch((value: unknown) => value);
      assert.doesNotMatch(String(error), new RegExp(TEST_KEY));
      assert.doesNotMatch(captured.join("\n"), new RegExp(TEST_KEY));
    } finally {
      console.error = originalError;
      console.warn = originalWarn;
    }
  });
});

describe("AI.2 live-one budget, cache and isolated store", () => {
  it("allows at most one injected provider call across 100 concurrent clicks and locales", async () => {
    const store = await reviewStore("parallel");
    let calls = 0;
    const provider: AIResearchProvider = {
      mode: "OPENAI",
      model: "configured-test-model",
      async generate(context) {
        calls += 1;
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 15));
        return providerResult(context);
      },
    };
    const service = createAIResearchService({
      ...contextOptions(),
      provider,
      providerConfig: liveConfig(),
      store,
      rateLimits: { session: 200, identity: 200, global: 500 },
      now: () => NOW,
    });
    const results = await Promise.allSettled(Array.from({ length: 100 }, (_, index) => service.generate({
      chain: "base",
      contract_address: ADDRESS,
      locale: index % 2 === 0 ? "pl" : "en",
      idempotency_key: `ai2_parallel_${String(index).padStart(16, "0")}`,
    }, `ai2-session-${index}`)));
    assert.equal(calls, 1);
    assert.ok(results.some(({ status }) => status === "fulfilled"));
    assert.ok(results.some((result) => result.status === "rejected" && isErrorCode(result.reason, "LIVE_CALL_BUDGET_EXHAUSTED")));
    assert.equal(store.liveCallBudgetUsage(), 1);
    store.close();
  });

  it("keeps the budget consumed after an API error and a review runtime restart", async () => {
    const storePath = reviewStorePath("error-restart");
    const firstStore = await createAIResearchStore({ databaseFilePath: storePath });
    let calls = 0;
    const failingProvider: AIResearchProvider = {
      mode: "OPENAI",
      model: "configured-test-model",
      async generate() { calls += 1; throw Object.assign(new Error("test failure"), { code: "PROVIDER_ERROR" }); },
    };
    const first = createAIResearchService({ ...contextOptions(), provider: failingProvider, providerConfig: liveConfig(), store: firstStore, now: () => NOW });
    await assert.rejects(() => first.generate(request("pl", "ai2_failure_first_0001"), "failure-session"), /PROVIDER_ERROR/);
    firstStore.close();

    const secondStore = await createAIResearchStore({ databaseFilePath: storePath });
    const succeedingProvider: AIResearchProvider = {
      mode: "OPENAI",
      model: "configured-test-model",
      async generate(context) { calls += 1; return providerResult(context); },
    };
    const second = createAIResearchService({ ...contextOptions(), provider: succeedingProvider, providerConfig: liveConfig(), store: secondStore, now: () => NOW });
    const lookup = await second.getBrief("base", ADDRESS, "pl");
    assert.equal(lookup.generation_blocked_reason, "LIVE_CALL_BUDGET_EXHAUSTED");
    await assert.rejects(() => second.generate(request("pl", "ai2_failure_second_001"), "failure-session-2"), (error) => isErrorCode(error, "LIVE_CALL_BUDGET_EXHAUSTED"));
    assert.equal(calls, 1);
    secondStore.close();
  });

  it("does not issue a repair call after live-one validation fails", async () => {
    const store = await reviewStore("validation-no-repair");
    let calls = 0;
    const invalidProvider: AIResearchProvider = {
      mode: "OPENAI",
      model: "configured-test-model",
      async generate() {
        calls += 1;
        return {
          raw_json: JSON.stringify({ invalid: true }),
          model: "configured-test-model",
          token_usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        };
      },
    };
    const service = createAIResearchService({ ...contextOptions(), provider: invalidProvider, providerConfig: liveConfig(), store, now: () => NOW });
    await assert.rejects(() => service.generate(request("pl", "ai2_validation_first_001"), "validation-session"), (error) => isErrorCode(error, "VALIDATION_FAILURE"));
    await assert.rejects(() => service.generate(request("pl", "ai2_validation_second_01"), "validation-session-2"), (error) => isErrorCode(error, "LIVE_CALL_BUDGET_EXHAUSTED"));
    assert.equal(calls, 1);
    assert.equal(store.liveCallBudgetUsage(), 1);
    store.close();
  });

  it("does not spend the budget for cache hits or render preview", async () => {
    const store = await reviewStore("cache");
    const context = await researchContext("pl");
    const cached = store.save(persistedBrief(context, "configured-test-model")).brief;
    let calls = 0;
    const provider: AIResearchProvider = {
      mode: "OPENAI",
      model: "configured-test-model",
      async generate(value) { calls += 1; return providerResult(value); },
    };
    const service = createAIResearchService({ ...contextOptions(), provider, providerConfig: liveConfig(), store, now: () => NOW });
    const result = await service.generate(request("pl", "ai2_cache_request_0001"), "cache-session");
    assert.equal(result.brief?.analysis_id, cached.analysis_id);
    assert.equal(calls, 0);
    assert.equal(store.liveCallBudgetUsage(), 0);
    store.close();

    const preview = createAIResearchService({ ...contextOptions(), provider, providerConfig: liveConfig(), renderPreview: true, now: () => NOW });
    const previewResult = await preview.generate(request("pl", "ai2_preview_request_01"), "preview-session");
    assert.equal(previewResult.brief?.render_preview, true);
    assert.equal(calls, 0);
  });

  it("rejects live-one on a non-review store before calling the provider", async () => {
    const canonicalPath = resolve(root, "canonical", "ai-research-brief.sqlite");
    await mkdir(dirname(canonicalPath), { recursive: true });
    const store = await createAIResearchStore({ databaseFilePath: canonicalPath });
    let calls = 0;
    const provider: AIResearchProvider = {
      mode: "OPENAI",
      model: "configured-test-model",
      async generate(context) { calls += 1; return providerResult(context); },
    };
    const service = createAIResearchService({ ...contextOptions(), provider, providerConfig: liveConfig(), store, now: () => NOW });
    const before = await readFile(canonicalPath);
    assert.equal(before.includes(Buffer.from("crypto_ai_research_live_call_budget")), false);
    assert.equal(before.includes(Buffer.from("crypto_ai_research_review_metrics")), false);
    await assert.rejects(() => service.generate(request("pl", "ai2_canonical_guard_001"), "canonical-session"), (error) => isErrorCode(error, "REVIEW_STORE_REQUIRED"));
    const afterValue = await readFile(canonicalPath);
    assert.equal(calls, 0);
    assert.deepEqual(afterValue, before);
    store.close();
  });

  it("stores owner-only latency, usage and request ID without adding them to the public brief", async () => {
    const store = await reviewStore("metrics");
    let calls = 0;
    const provider: AIResearchProvider = {
      mode: "OPENAI",
      model: "configured-test-model",
      async generate(context) {
        calls += 1;
        return { ...providerResult(context), latency_ms: 432, request_id: "req_owner_review_123" };
      },
    };
    const service = createAIResearchService({ ...contextOptions(), provider, providerConfig: liveConfig(), store, now: () => NOW });
    const result = await service.generate(request("pl", "ai2_metrics_request_001"), "metrics-session");
    const publicBrief = result.brief!;
    assert.equal(result.generation_blocked_reason, "LIVE_CALL_BUDGET_EXHAUSTED");
    const cachedLookup = await service.getBrief("base", ADDRESS, "pl");
    assert.equal(cachedLookup.brief?.analysis_id, publicBrief.analysis_id);
    assert.equal(cachedLookup.generation_blocked_reason, "LIVE_CALL_BUDGET_EXHAUSTED");
    const cachedGenerate = await service.generate(request("pl", "ai2_metrics_request_002"), "metrics-session-2");
    assert.equal(cachedGenerate.brief?.analysis_id, publicBrief.analysis_id);
    assert.equal(cachedGenerate.generation_blocked_reason, "LIVE_CALL_BUDGET_EXHAUSTED");
    assert.equal(calls, 1);
    const metrics = (await service.getReviewMetrics(publicBrief.analysis_id)).metrics!;
    assert.equal(metrics.latency_ms, 432);
    assert.equal(metrics.prompt_tokens, 17);
    assert.equal(metrics.output_tokens, 8);
    assert.equal(metrics.total_tokens, 25);
    assert.equal(metrics.cache_hit, false);
    assert.equal(metrics.validation_status, "VALID");
    assert.equal(metrics.request_id, "req_owner_review_123");
    assert.equal(JSON.stringify(publicBrief).includes("req_owner_review_123"), false);
    assert.equal("request_id" in publicBrief, false);
    const source = await readFile(resolve(import.meta.dirname, "..", "server", "aiResearchStore.ts"), "utf8");
    assert.doesNotMatch(source, /raw_prompt|raw_completion|cost_usd|usd_cost/i);
    store.close();
  });
});

describe("AI.2 launcher and cleanup contract", () => {
  it("keeps default mode disabled and live-one explicit, isolated and side-effect free on startup", async () => {
    const launcher = await source("scripts/win/start-ai-research-openai-review.cmd");
    assert.match(launcher, /CRYPTO_EDGE_AI_RESEARCH_PROVIDER=DISABLED/);
    assert.match(launcher, /if not defined OPENAI_API_KEY/);
    assert.match(launcher, /if not defined CRYPTO_EDGE_AI_RESEARCH_MODEL/);
    assert.match(launcher, /CRYPTO_EDGE_AI_RESEARCH_PROVIDER=OPENAI/);
    assert.match(launcher, /CRYPTO_EDGE_AI_RESEARCH_LIVE_CALL_BUDGET=1/);
    assert.match(launcher, /CRYPTO_EDGE_AI_RESEARCH_MAX_CONCURRENCY=1/);
    assert.match(launcher, /parsed -ge 1000 -and \$parsed -le 120000/);
    assert.match(launcher, /ai-research-openai-review\.sqlite/);
    assert.match(launcher, /CRYPTO_EDGE_OWNER_OPERATIONS_MODE=DISABLED/);
    assert.match(launcher, /start-product-radar-review\.cmd" --candidate-detail/);
    assert.doesNotMatch(launcher, /responses\.create|api\.openai\.com|collect:internal-beta|scanner:persist:live|--apply/i);
  });

  it("cleanup targets only the review SQLite, WAL and SHM and never kills a process", async () => {
    const cleanup = await source("scripts/win/clear-ai-research-openai-review.cmd");
    assert.match(cleanup, /ai-research-openai-review\.sqlite/);
    assert.match(cleanup, /"%REVIEW_STORE%" "%REVIEW_STORE%-wal" "%REVIEW_STORE%-shm"/);
    assert.doesNotMatch(cleanup, /ai-research-brief\.sqlite|feedback|follow-up|established|taskkill|Stop-Process|kill-local-ports/i);
  });

  it("keeps screen entry, refresh and locale changes read-only until explicit generation", async () => {
    const section = await source("tools/ui-mock/src/components/AIResearchSection.tsx");
    const effectBodies = [...section.matchAll(/useEffect\(\(\) => \{([\s\S]*?)\}, \[[^\]]*\]\);/g)].map((match) => match[1]).join("\n");
    assert.doesNotMatch(effectBodies, /generateAIResearchBrief/);
    assert.match(section, /onClick=\{\(\) => void generate\(\)\}/);
  });
});

function config(overrides: Partial<AIResearchProviderConfig> = {}): AIResearchProviderConfig {
  return {
    mode: "OPENAI",
    model: "configured-test-model",
    apiKey: TEST_KEY,
    timeoutMs: 5_000,
    maxConcurrency: 4,
    liveCallBudget: null,
    liveCallBudgetInvalid: false,
    ...overrides,
  };
}

function liveConfig(): AIResearchProviderConfig {
  return config({ maxConcurrency: 1, liveCallBudget: 1 });
}

function contextOptions() {
  return {
    scanner: { runtimeMode: "DEVELOPMENT_DEMO" as const, fixturePath, outputDirPath },
    followUp: { storePath: followUpPath, now: () => NOW },
    reports: { reportsRootPath: reportsPath, now: NOW },
  };
}

function researchContext(locale: "pl" | "en") {
  return buildAIResearchContext("base", ADDRESS, locale, { ...contextOptions(), now: () => NOW });
}

function request(locale: "pl" | "en", idempotencyKey: string) {
  return { chain: "base", contract_address: ADDRESS, locale, idempotency_key: idempotencyKey };
}

function draft(context: AIResearchContext) {
  const pl = context.locale === "pl";
  return {
    schema_version: "ai_research_brief_v1" as const,
    research_state: context.research_state,
    summary: pl
      ? "Dane określają aktualny etap badawczy. Następny krok dotyczy wyłącznie dalszej weryfikacji."
      : "The data identifies the current research stage. The next step concerns further verification only.",
    known_facts: context.fact_candidates.map((fact) => ({
      ...fact,
      interpretation: pl ? "Wartość pochodzi z kontekstu produktu." : "The value comes from product context.",
    })),
    risk_factors: context.risk_candidates,
    missing_information: context.missing_information,
    next_actions: context.action_catalog.slice(0, 3).map(({ action_type, reason }) => ({ action_type, reason })),
    status_change_conditions: context.status_change_conditions,
  };
}

function responsePayload(context: AIResearchContext) {
  return {
    id: "resp_test",
    object: "response",
    output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(draft(context)) }] }],
    usage: { input_tokens: 17, output_tokens: 8, total_tokens: 25 },
  };
}

function providerResult(context: AIResearchContext) {
  return {
    raw_json: JSON.stringify(draft(context)),
    model: "configured-test-model",
    token_usage: { prompt_tokens: 17, completion_tokens: 8, total_tokens: 25 },
    latency_ms: 12,
    request_id: null,
  };
}

function persistedBrief(context: AIResearchContext, model: string) {
  const preview = buildDeterministicPreview(context, NOW);
  const inputHash = sha256(stableJson({
    identity: context.identity,
    snapshot_fingerprint: context.snapshot_fingerprint,
    prompt_version: context.prompt_version,
    locale: context.locale,
    model,
  }));
  const base = { ...preview, model, render_preview: false, input_hash: inputHash, output_hash: "0".repeat(64) };
  return { ...base, output_hash: sha256(stableJson(base)) };
}

function reviewStorePath(name: string): string {
  return resolve(root, name, "ai-research-openai-review.sqlite");
}

async function reviewStore(name: string) {
  const databaseFilePath = reviewStorePath(name);
  await mkdir(dirname(databaseFilePath), { recursive: true });
  return createAIResearchStore({ databaseFilePath, maxRecords: 100 });
}

async function writeFixture() {
  const value = structuredClone(PERSISTABLE_SCANNER_SAMPLE);
  const candidate = value.candidates[0]!;
  candidate.chain = "base";
  candidate.contract_address = ADDRESS;
  candidate.source_url = `https://dexscreener.com/base/${ADDRESS}`;
  candidate.address_identity_verified = true;
  await writeFile(fixturePath, JSON.stringify(value), "utf8");
}

async function source(relativePath: string): Promise<string> {
  return readFile(resolve(import.meta.dirname, "..", "..", "..", relativePath), "utf8");
}

function isErrorCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}
