import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { after, describe, it } from "node:test";
import { buildAIResearchContext, type AIResearchContext } from "../server/aiResearchContext.js";
import { AIResearchProviderError, type AIResearchProvider } from "../server/aiResearchProvider.js";
import {
  buildAIAnalysisCacheIdentity,
  createAIAnalysisQueueStore,
  hashAIAnalysisRateScope,
  type AIAnalysisCacheIdentity,
  type AIAnalysisQueueStore,
} from "../server/aiResearchQueueStore.js";
import { createAIResearchService } from "../server/aiResearchService.js";
import { createAIResearchWorker } from "../server/aiResearchWorker.js";
import { PERSISTABLE_SCANNER_SAMPLE } from "../src/fixtures/persistableScannerSample.js";

const root = await mkdtemp(resolve(tmpdir(), "crypto-edge-ai3-queue-tests-"));
const fixturePath = resolve(root, "scanner.json");
const outputDirPath = resolve(root, "missing-output");
const followUpPath = resolve(root, "missing-follow-up.json");
const reportsPath = resolve(root, "missing-reports");
const ADDRESS = "0x1111111111111111111111111111111111111111";
const OTHER_ADDRESS = "0x2222222222222222222222222222222222222222";
const NOW = new Date("2026-07-29T12:00:00.000Z");
const RATE_LIMITS = { windowMs: 600_000, session: 3, identity: 10, global: 100, cooldownMs: 60_000 };

await writeFixture(100_000, true);
after(async () => { await rm(root, { recursive: true, force: true }); });

describe("AI.3 canonical cache identity and persistent queue", () => {
  it("builds one cache key for the same normalized token and fingerprint", () => {
    const first = cacheIdentity("BASE", ADDRESS.toUpperCase().replace("0X", "0x"), "a".repeat(64));
    const second = cacheIdentity("base", ADDRESS, "a".repeat(64));
    assert.equal(first.cache_key, second.cache_key);
    assert.equal(first.chain, "base");
    assert.equal(first.contract_address, ADDRESS);
  });

  it("separates contract address, fingerprint and prompt version", () => {
    const base = cacheIdentity("base", ADDRESS, "a".repeat(64));
    assert.notEqual(cacheIdentity("base", OTHER_ADDRESS, "a".repeat(64)).cache_key, base.cache_key);
    assert.notEqual(cacheIdentity("base", ADDRESS, "b".repeat(64)).cache_key, base.cache_key);
    assert.notEqual(cacheIdentity("base", ADDRESS, "a".repeat(64), "ai_research_prompt_v3").cache_key, base.cache_key);
  });

  it("deduplicates concurrent submissions in SQLite and preserves one analysis_id", async () => {
    const databaseFilePath = resolve(root, "dedupe.sqlite");
    const [firstStore, secondStore] = await Promise.all([
      createAIAnalysisQueueStore({ databaseFilePath }),
      createAIAnalysisQueueStore({ databaseFilePath }),
    ]);
    const identity = cacheIdentity("base", ADDRESS, "a".repeat(64));
    const [first, second] = await Promise.all([
      Promise.resolve().then(() => enqueue(firstStore, identity, "session-a")),
      Promise.resolve().then(() => enqueue(secondStore, identity, "session-b")),
    ]);
    assert.equal(first.record?.analysis_id, second.record?.analysis_id);
    assert.deepEqual(new Set([first.outcome, second.outcome]), new Set(["QUEUED", "ALREADY_EXISTS"]));
    assert.equal(firstStore.stats().records, 1);
    firstStore.close();
    secondStore.close();
  });

  it("recovers an orphaned PROCESSING lease after restart without creating another job", async () => {
    const databaseFilePath = resolve(root, "recovery.sqlite");
    const firstStore = await createAIAnalysisQueueStore({ databaseFilePath });
    const identity = cacheIdentity("base", ADDRESS, "c".repeat(64));
    const queued = enqueue(firstStore, identity, "restart-a");
    const firstClaim = firstStore.claimNext({ worker_id: "worker-a", now: NOW, lease_ms: 1_000 });
    assert.equal(firstClaim?.analysis_id, queued.record?.analysis_id);
    firstStore.close();

    const restarted = await createAIAnalysisQueueStore({ databaseFilePath });
    assert.equal(restarted.claimNext({ worker_id: "worker-b", now: new Date(NOW.getTime() + 500), lease_ms: 1_000 }), null);
    const recovered = restarted.claimNext({ worker_id: "worker-b", now: new Date(NOW.getTime() + 1_001), lease_ms: 1_000 });
    assert.equal(recovered?.analysis_id, queued.record?.analysis_id);
    assert.equal(restarted.stats().records, 1);
    restarted.close();
  });

  it("enforces persisted cooldown and rate limiting without duplicate rows", async () => {
    const store = await createAIAnalysisQueueStore({ databaseFilePath: resolve(root, "rate-limit.sqlite") });
    const failedIdentity = cacheIdentity("base", ADDRESS, "d".repeat(64));
    enqueue(store, failedIdentity, "cooldown-session");
    const claim = store.claimNext({ worker_id: "cooldown-worker", now: NOW, lease_ms: 5_000 });
    assert.ok(claim);
    store.fail({ analysis_id: claim.analysis_id, worker_id: "cooldown-worker", safe_error_code: "PROVIDER_TIMEOUT", transient: true, max_attempts: 3, retry_base_ms: 60_000, now: NOW });
    const cooldown = store.enqueue({
      identity: failedIdentity,
      session_scope_hash: hashAIAnalysisRateScope("cooldown-session"),
      now: new Date(NOW.getTime() + 1_000),
      rate_limits: RATE_LIMITS,
    });
    assert.equal(cooldown.outcome, "COOLDOWN");
    assert.ok((cooldown.retry_after_seconds ?? 0) > 0);

    const strict = { ...RATE_LIMITS, session: 1 };
    enqueue(store, cacheIdentity("base", ADDRESS, "e".repeat(64)), "limited-session", NOW, strict);
    assert.throws(
      () => enqueue(store, cacheIdentity("base", ADDRESS, "f".repeat(64)), "limited-session", NOW, strict),
      /RATE_LIMITED/,
    );
    store.close();
  });
});

describe("AI.3 central worker, single-flight and last-known-good", () => {
  it("lets two workers execute exactly one provider call for one cache key", async () => {
    await writeFixture(100_000, true);
    const databaseFilePath = resolve(root, "two-workers.sqlite");
    const [firstStore, secondStore] = await Promise.all([
      createAIAnalysisQueueStore({ databaseFilePath }),
      createAIAnalysisQueueStore({ databaseFilePath }),
    ]);
    const ctx = await context(ADDRESS);
    enqueue(firstStore, fromContext(ctx), "worker-session");
    let calls = 0;
    const provider = mockProvider(async (value) => {
      calls += 1;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 20));
      return JSON.stringify(narrative(value));
    });
    const first = createAIResearchWorker({ ...contextOptions(), store: firstStore, provider, now: () => NOW, workerId: "worker-one" });
    const second = createAIResearchWorker({ ...contextOptions(), store: secondStore, provider, now: () => NOW, workerId: "worker-two" });
    const cycles = await Promise.all([first.runCycle(), second.runCycle()]);
    assert.equal(calls, 1);
    assert.equal(cycles.reduce((sum, value) => sum + value.provider_calls, 0), 1);
    assert.equal(firstStore.stats().ready, 1);
    firstStore.close();
    secondStore.close();
  });

  it("shares READY between sessions and exposes last-known-good while a new fingerprint is queued", async () => {
    await writeFixture(100_000, true);
    const store = await createAIAnalysisQueueStore({ databaseFilePath: resolve(root, "shared-ready.sqlite") });
    const service = createAIResearchService({ ...contextOptions(), queueStore: store, providerEnabled: true, modelId: "gpt-5-mini", now: () => NOW });
    const firstRequest = await service.generate(request("shared-request-0001"), "session-one");
    assert.equal(firstRequest.availability, "QUEUED");
    const worker = createAIResearchWorker({ ...contextOptions(), store, provider: mockProvider(async (value) => JSON.stringify(narrative(value))), now: () => NOW });
    assert.equal((await worker.runCycle()).completed, 1);
    const [firstUser, secondUser] = await Promise.all([
      service.getBrief("base", ADDRESS, "pl"),
      service.getBrief("BASE", ADDRESS.toUpperCase().replace("0X", "0x"), "pl"),
    ]);
    assert.equal(firstUser.availability, "READY");
    assert.equal(firstUser.brief?.analysis_id, secondUser.brief?.analysis_id);

    await writeFixture(200_000, true);
    const update = await service.generate(request("shared-request-0002"), "session-two");
    assert.equal(update.availability, "QUEUED");
    assert.equal(update.is_last_known_good, true);
    assert.equal(update.brief?.analysis_id, firstUser.brief?.analysis_id);
    store.close();
  });

  it("blocks provider calls at daily budget", async () => {
    await writeFixture(100_000, true);
    const store = await createAIAnalysisQueueStore({ databaseFilePath: resolve(root, "budget.sqlite") });
    enqueue(store, fromContext(await context(ADDRESS)), "budget-session");
    let calls = 0;
    const worker = createAIResearchWorker({
      ...contextOptions(),
      store,
      provider: mockProvider(async (value) => { calls += 1; return JSON.stringify(narrative(value)); }),
      now: () => NOW,
      limits: { maxAnalysesPerDay: 0 },
    });
    const result = await worker.runCycle();
    assert.equal(result.status, "BUDGET_BLOCKED");
    assert.equal(result.provider_calls, 0);
    assert.equal(calls, 0);
    assert.equal(store.stats().queued, 1);
    store.close();
  });

  it("suspends immediately on a response contract failure", async () => {
    await writeFixture(100_000, true);
    const store = await createAIAnalysisQueueStore({ databaseFilePath: resolve(root, "contract-breaker.sqlite") });
    enqueue(store, fromContext(await context(ADDRESS)), "contract-session");
    const worker = createAIResearchWorker({ ...contextOptions(), store, provider: mockProvider(async () => "{}"), now: () => NOW });
    const result = await worker.runCycle();
    assert.equal(result.provider_calls, 1);
    assert.equal(store.workerState().suspended, true);
    assert.equal(store.stats().suspended, 1);
    store.close();
  });

  it("retries transient failures with bounded backoff and leaves the worker available after the limit", async () => {
    await writeFixture(100_000, true);
    const store = await createAIAnalysisQueueStore({ databaseFilePath: resolve(root, "retry.sqlite") });
    enqueue(store, fromContext(await context(ADDRESS)), "retry-session");
    let clock = NOW;
    let calls = 0;
    const provider: AIResearchProvider = {
      mode: "OPENAI",
      model: "gpt-5-mini",
      async generate() { calls += 1; throw new AIResearchProviderError("PROVIDER_TIMEOUT"); },
    };
    const worker = createAIResearchWorker({
      ...contextOptions(), store, provider, now: () => clock, limits: { maxAttempts: 2, retryBaseMs: 100, retryJitterRatio: 0 },
    });
    const first = await worker.runCycle();
    assert.equal(first.retried, 1);
    assert.equal(store.stats().failed, 1);
    assert.equal(store.workerState().suspended, false);
    clock = new Date(NOW.getTime() + 101);
    const second = await worker.runCycle();
    assert.equal(second.suspended, 1);
    assert.equal(calls, 2);
    assert.equal(store.workerState().suspended, false);
    store.close();
  });
});

function cacheIdentity(chain: string, address: string, fingerprint: string, promptVersion = "ai_research_prompt_v4") {
  return buildAIAnalysisCacheIdentity({
    chain,
    contract_address: address,
    snapshot_fingerprint: fingerprint,
    prompt_version: promptVersion,
    model_id: "gpt-5-mini",
    analysis_schema_version: "ai_research_brief_v2",
    locale: "en",
  });
}

function fromContext(value: AIResearchContext): AIAnalysisCacheIdentity {
  return buildAIAnalysisCacheIdentity({
    ...value.identity,
    snapshot_fingerprint: value.snapshot_fingerprint,
    prompt_version: value.prompt_version,
    model_id: "gpt-5-mini",
    analysis_schema_version: "ai_research_brief_v2",
    locale: "en",
  });
}

function enqueue(
  store: AIAnalysisQueueStore,
  identity: AIAnalysisCacheIdentity,
  session: string,
  at = NOW,
  rateLimits = RATE_LIMITS,
) {
  return store.enqueue({ identity, session_scope_hash: hashAIAnalysisRateScope(session), now: at, rate_limits: rateLimits });
}

function context(address: string) {
  return buildAIResearchContext("base", address, "pl", { ...contextOptions(), now: () => NOW });
}

function contextOptions() {
  return {
    scanner: { runtimeMode: "DEVELOPMENT_DEMO" as const, fixturePath, outputDirPath },
    followUp: { storePath: followUpPath, now: () => NOW },
    reports: { reportsRootPath: reportsPath, now: NOW },
  };
}

function request(idempotencyKey: string) {
  return { chain: "base", contract_address: ADDRESS, locale: "pl" as const, idempotency_key: idempotencyKey };
}

function mockProvider(generateJson: (context: AIResearchContext) => Promise<string>): AIResearchProvider {
  return {
    mode: "OPENAI",
    model: "gpt-5-mini",
    async generate(value) {
      return {
        raw_json: await generateJson(value),
        model: "gpt-5-mini",
        token_usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
        latency_ms: 10,
        request_id: "mock_response_id",
      };
    },
  };
}

function narrative(ctx: AIResearchContext) {
  return {
    narrative_version: "ai_research_narrative_v3",
    summary: { en: "The recorded snapshot gives market context while evidence gaps still need verification.", pl: "Zapisana migawka daje kontekst rynkowy, ale luki w danych nadal wymagają sprawdzenia." },
    fact_narratives: ctx.fact_candidates.map((item) => ({ id: `fact:${item.key}`, en: "This recorded fact adds context to the research view.", pl: "Ten zapisany fakt uzupełnia obecną analizę." })),
    risk_narratives: ctx.risk_candidates.map((_item, index) => ({ id: `risk:${index}`, en: "This recorded risk needs verification against the listed evidence.", pl: "To zapisane ryzyko wymaga sprawdzenia względem wskazanych danych." })),
    missing_narratives: ctx.missing_information.map((item) => ({ id: `missing:${item.key}`, en: "This evidence gap limits the current research view.", pl: "Ta luka w danych ogranicza obecną analizę." })),
    action_narratives: ctx.action_catalog.map((_item, index) => ({ id: `action:${index}`, en: "Use this permitted research step to verify the evidence.", pl: "Wykorzystaj ten dozwolony krok analizy, aby sprawdzić dane." })),
    status_change_narratives: ctx.status_change_conditions.map((item) => ({ id: `condition:${item.key}`, en: "This condition would justify reviewing the research view.", pl: "Ten warunek uzasadnia ponowne sprawdzenie analizy." })),
  };
}

async function writeFixture(liquidity: number, includeOther = false) {
  const value = structuredClone(PERSISTABLE_SCANNER_SAMPLE);
  const candidate = value.candidates[0]!;
  candidate.chain = "base";
  candidate.contract_address = ADDRESS;
  candidate.source_url = `https://dexscreener.com/base/${ADDRESS}`;
  candidate.liquidity_usd = liquidity;
  candidate.address_identity_verified = true;
  if (includeOther) value.candidates.push({ ...candidate, contract_address: OTHER_ADDRESS, source_url: `https://dexscreener.com/base/${OTHER_ADDRESS}` });
  await writeFile(fixturePath, JSON.stringify(value), "utf8");
}
