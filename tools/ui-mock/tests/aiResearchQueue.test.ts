import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { after, describe, it } from "node:test";
import {
  buildAIResearchContext,
  readAIResearchScannerSingleFlight,
  type AIResearchContext,
} from "../server/aiResearchContext.js";
import type { ScannerOutputWithMeta } from "../server/latestScannerOutput.js";
import { AIResearchProviderError, type AIResearchProvider } from "../server/aiResearchProvider.js";
import {
  buildAIAnalysisCacheIdentity,
  createAIAnalysisQueueStore,
  hashAIAnalysisRateScope,
  type AIAnalysisCacheIdentity,
  type AIAnalysisQueueStore,
} from "../server/aiResearchQueueStore.js";
import { createAIResearchService, hydrateAIResearchBrief } from "../server/aiResearchService.js";
import { createAIResearchWorker, resolveAIResearchWorkerContextOptions } from "../server/aiResearchWorker.js";
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
  it("shares one canonical scanner read across concurrent public-context requests", async () => {
    let calls = 0;
    const scanner: ScannerOutputWithMeta = {
      _source_meta: {
        source: "real-output",
        reason: "test",
        selected_run_id: "scan_test",
        loaded_at: NOW.toISOString(),
        runtime_mode: "INTERNAL_BETA",
        age_seconds: 0,
        source_ids: [],
        freshness_status: "FRESH",
      },
    };
    const reader = async (): Promise<ScannerOutputWithMeta> => {
      calls += 1;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 10));
      return scanner;
    };

    const results = await Promise.all(Array.from(
      { length: 100 },
      () => readAIResearchScannerSingleFlight({ runtimeMode: "INTERNAL_BETA" }, reader),
    ));

    assert.equal(calls, 1);
    assert.equal(new Set(results).size, 1);
  });

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

  it("creates one immutable owner recovery attempt for a suspended network row and lets 100 users join it", async () => {
    const store = await createAIAnalysisQueueStore({ databaseFilePath: resolve(root, "owner-recovery.sqlite") });
    const identity = fromContext(await context(ADDRESS));
    const original = enqueue(store, identity, "owner-before-recovery").record;
    assert.ok(original);
    const claim = store.claimNext({ worker_id: "network-worker", now: NOW, lease_ms: 5_000 });
    assert.ok(claim);
    const suspended = store.fail({
      analysis_id: claim.analysis_id,
      worker_id: "network-worker",
      safe_error_code: "PROVIDER_NETWORK",
      transient: true,
      max_attempts: 1,
      retry_base_ms: 1_000,
      now: NOW,
    });
    assert.equal(suspended.status, "SUSPENDED");
    const preserved = { analysis_id: suspended.analysis_id, status: suspended.status, safe_error_code: suspended.safe_error_code, failed_at: suspended.failed_at };

    const recovery = store.recoverSuspendedProviderNetwork({
      identity,
      owner_scope_hash: "owner-only-recovery",
      now: new Date(NOW.getTime() + 1_000),
    });
    assert.equal(recovery.outcome, "QUEUED");
    assert.ok(recovery.record);
    assert.notEqual(recovery.record.analysis_id, original.analysis_id);
    assert.equal(recovery.record.shared_cache_key, identity.cache_key);
    assert.equal(recovery.previous_analysis_id, original.analysis_id);
    assert.match(recovery.recovery_attempt_id ?? "", /^airr_[0-9a-f-]{36}$/);
    assert.deepEqual(store.findByAnalysisId(original.analysis_id) && {
      analysis_id: store.findByAnalysisId(original.analysis_id)?.analysis_id,
      status: store.findByAnalysisId(original.analysis_id)?.status,
      safe_error_code: store.findByAnalysisId(original.analysis_id)?.safe_error_code,
      failed_at: store.findByAnalysisId(original.analysis_id)?.failed_at,
    }, preserved);

    const joined = Array.from({ length: 100 }, (_, index) => store.enqueue({
      identity,
      session_scope_hash: hashAIAnalysisRateScope(`joined-user-${index}`),
      now: new Date(NOW.getTime() + 1_001),
      rate_limits: RATE_LIMITS,
    }));
    assert.equal(new Set(joined.map((value) => value.record?.analysis_id)).size, 1);
    assert.equal(new Set(joined.map((value) => value.outcome)).size, 1);
    assert.equal(joined[0]?.outcome, "ALREADY_EXISTS");
    assert.equal(store.stats().queued, 1);
    let providerCalls = 0;
    const worker = createAIResearchWorker({
      ...contextOptions(),
      store,
      provider: mockProvider(async (value) => { providerCalls += 1; return JSON.stringify(narrative(value)); }),
      now: () => new Date(NOW.getTime() + 1_002),
      workerId: "recovery-worker",
      limits: { maxAttempts: 1 },
    });
    const cycle = await worker.runCycle();
    assert.equal(providerCalls, 1);
    assert.equal(cycle.claimed, 1);
    assert.equal(cycle.completed, 1);
    assert.equal(store.findByAnalysisId(recovery.record.analysis_id)?.status, "READY");
    const service = createAIResearchService({ ...contextOptions(), queueStore: store, providerEnabled: true, modelId: "gpt-5-mini", now: () => NOW });
    const reads = await Promise.all(Array.from({ length: 100 }, (_, index) => service.getBrief("base", ADDRESS, index < 50 ? "pl" : "en")));
    assert.equal(reads.filter((value) => value.availability === "READY" && value.analysis_id === recovery.record?.analysis_id).length, 100);
    assert.equal(providerCalls, 1);
    store.close();
  });
});

describe("AI.3 central worker, single-flight and last-known-good", () => {
  it("uses the INTERNAL_BETA context sources by default for a standalone worker", () => {
    const internalBeta = resolveAIResearchWorkerContextOptions({}, { CRYPTO_EDGE_RUNTIME_MODE: "INTERNAL_BETA" });
    const defaultMode = resolveAIResearchWorkerContextOptions({}, {});
    const explicit = resolveAIResearchWorkerContextOptions({ scanner: { runtimeMode: "DEVELOPMENT_DEMO", fixturePath } }, { CRYPTO_EDGE_RUNTIME_MODE: "INTERNAL_BETA" });

    assert.equal(internalBeta.scanner?.runtimeMode, "INTERNAL_BETA");
    assert.equal(defaultMode.scanner?.runtimeMode, "UNCONFIGURED");
    assert.equal(explicit.scanner?.runtimeMode, "DEVELOPMENT_DEMO");
  });

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

  it("persists bounded owner-only composition diagnostics while storing only safe fallback prose", async () => {
    await writeFixture(100_000, true);
    const store = await createAIAnalysisQueueStore({ databaseFilePath: resolve(root, "slot-fallback.sqlite") });
    const contextValue = await context(ADDRESS);
    const queued = enqueue(store, fromContext(contextValue), "slot-fallback-session");
    const provider = mockProvider(async (value) => {
      const response = narrative(value);
      response.summary.en = "The recorded amount is 999999.";
      return JSON.stringify(response);
    });
    const worker = createAIResearchWorker({ ...contextOptions(), store, provider, now: () => NOW });
    assert.equal((await worker.runCycle()).completed, 1);
    const record = store.findByAnalysisId(queued.record!.analysis_id)!;
    assert.equal(record.status, "READY");
    assert.deepEqual(record.internal_composition_diagnostics, {
      accepted_provider_slot_count: issuedSlotCount(contextValue) - 1,
      fallback_slot_ids: ["summary:overall"],
      fallback_reasons: ["INVENTED_NUMBER", "UNKNOWN_FACT"],
      full_deterministic_fallback: false,
    });
    assert.doesNotMatch(JSON.stringify(record.result), /999999/u);
    store.close();
  });

  it("persists READY through a full deterministic fallback without another provider attempt", async () => {
    await writeFixture(100_000, true);
    const store = await createAIAnalysisQueueStore({ databaseFilePath: resolve(root, "full-slot-fallback.sqlite") });
    const contextValue = await context(ADDRESS);
    const queued = enqueue(store, fromContext(contextValue), "full-slot-fallback-session");
    let providerCalls = 0;
    const provider = mockProvider(async (value) => {
      providerCalls += 1;
      const response = narrative(value);
      for (const binding of [response.summary, ...response.fact_narratives, ...response.risk_narratives, ...response.missing_narratives]) {
        binding.en = "Review the evidence now.";
        binding.pl = "Sprawdź dane teraz.";
      }
      return JSON.stringify(response);
    });
    const worker = createAIResearchWorker({ ...contextOptions(), store, provider, now: () => NOW });
    assert.equal((await worker.runCycle()).completed, 1);
    const record = store.findByAnalysisId(queued.record!.analysis_id)!;
    assert.equal(providerCalls, 1);
    assert.equal(record.status, "READY");
    assert.equal(record.provider_attempt_count, 1);
    assert.deepEqual(record.internal_composition_diagnostics, {
      accepted_provider_slot_count: 0,
      fallback_slot_ids: ["summary:overall", ...contextValue.narrative_contract.slots.facts.map(({ id }) => id), ...contextValue.narrative_contract.slots.risks.map(({ id }) => id), ...contextValue.narrative_contract.slots.missing_information.map(({ id }) => id)],
      fallback_reasons: ["INSTRUCTIONAL_NARRATIVE"],
      full_deterministic_fallback: true,
    });
    const renderedNarratives = JSON.stringify({
      summary: record.result?.summary,
      facts: record.result?.known_facts.map(({ interpretation }) => interpretation),
      risks: record.result?.risk_factors.map(({ explanation }) => explanation),
      missing: record.result?.missing_information.map(({ explanation }) => explanation),
    });
    assert.doesNotMatch(renderedNarratives, /Review|Sprawdź/u);
    store.close();
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

  it("reuses a validated historical result when only cache metadata changed, but stales it for a Max evidence change", async () => {
    await writeFixture(100_000, true);
    const store = await createAIAnalysisQueueStore({ databaseFilePath: resolve(root, "evidence-compatible.sqlite") });
    const service = createAIResearchService({ ...contextOptions(), queueStore: store, providerEnabled: false, modelId: "gpt-5-mini", now: () => NOW });
    const current = await buildAIResearchContext("base", ADDRESS, "en", { ...contextOptions(), now: () => NOW });
    const legacyContext = { ...current, snapshot_fingerprint: "c".repeat(64) };
    const queued = enqueue(store, fromContext(legacyContext), "metadata-only-session");
    const claimed = store.claimNext({ worker_id: "metadata-only-worker", now: NOW, lease_ms: 1_000 });
    assert.equal(claimed?.analysis_id, queued.record?.analysis_id);
    store.complete({
      analysis_id: claimed!.analysis_id,
      worker_id: "metadata-only-worker",
      brief: hydrateAIResearchBrief(
        legacyContext,
        narrative(legacyContext),
        "gpt-5-mini",
        { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        NOW,
        false,
      ),
      validation_status: "VALID",
      latency_ms: 0,
      provider_response_id: null,
      now: NOW,
    });

    const unchanged = await service.getBrief("base", ADDRESS, "pl");
    assert.equal(unchanged.availability, "READY");
    assert.equal(unchanged.brief?.snapshot_fingerprint, legacyContext.snapshot_fingerprint);
    assert.equal(store.stats().records, 1, "read-time compatibility must not write a replacement cache row");

    await writeFixture(100_000, true, 250_000);
    const unrelatedCandidateChange = await service.getBrief("base", ADDRESS, "en");
    assert.equal(unrelatedCandidateChange.availability, "READY");
    assert.equal(unrelatedCandidateChange.brief?.analysis_id, unchanged.brief?.analysis_id);
    assert.equal(store.stats().records, 1, "an unrelated candidate cannot create an analysis mutation");

    await writeFixture(200_000, true);
    const changed = await service.getBrief("base", ADDRESS, "en");
    assert.equal(changed.availability, "STALE");
    assert.equal(changed.brief?.analysis_id, unchanged.brief?.analysis_id);
    assert.equal(store.stats().records, 1, "a stale read must not enqueue a new analysis");
    store.close();
  });

  it("keeps the worker available when a queued snapshot is superseded before claim", async () => {
    await writeFixture(100_000, true);
    const store = await createAIAnalysisQueueStore({ databaseFilePath: resolve(root, "superseded-snapshot.sqlite") });
    enqueue(store, fromContext(await context(ADDRESS)), "superseded-session");
    await writeFixture(200_000, true);
    let calls = 0;
    const provider = mockProvider(async (value) => { calls += 1; return JSON.stringify(narrative(value)); });
    const worker = createAIResearchWorker({
      ...contextOptions(), store, provider, now: () => NOW, limits: { maxAttempts: 1 },
    });

    const staleCycle = await worker.runCycle();
    assert.equal(staleCycle.provider_calls, 0);
    assert.equal(calls, 0);
    assert.equal(store.stats().suspended, 1);
    assert.equal(store.workerState().suspended, false);

    const service = createAIResearchService({ ...contextOptions(), queueStore: store, providerEnabled: true, modelId: "gpt-5-mini", now: () => NOW });
    const replacement = await service.generate(request("superseded-request-0001"), "replacement-session");
    assert.equal(replacement.availability, "QUEUED");
    const currentCycle = await worker.runCycle();
    assert.equal(currentCycle.provider_calls, 1);
    assert.equal(calls, 1);
    assert.equal(store.stats().ready, 1);
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

function cacheIdentity(chain: string, address: string, fingerprint: string, promptVersion = "ai_research_prompt_v7") {
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
    narrative_contract_version: "ai_research_narrative_v6",
    semantic_policy_version: "ai_research_semantic_policy_v3",
    composition_policy_version: "ai_research_composition_policy_v1",
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
  const slot = (entry: { id: string; allowed_support_ids: string[] }, en: string, pl: string) => ({ id: entry.id, support_ids: [entry.allowed_support_ids[0]!], en, pl });
  return {
    narrative_version: "ai_research_narrative_v6",
    summary: slot(ctx.narrative_contract.slots.summary, "The recorded snapshot gives market context while evidence gaps remain in the current evidence set.", "Zapisana migawka daje kontekst rynkowy, a luki pozostają w obecnym zestawie danych."),
    fact_narratives: ctx.narrative_contract.slots.facts.map((entry) => slot(entry, "This recorded fact adds context to the research view.", "Ten zapisany fakt uzupełnia obecną analizę.")),
    risk_narratives: ctx.narrative_contract.slots.risks.map((entry) => slot(entry, "This recorded risk remains part of the listed evidence context.", "To zapisane ryzyko pozostaje częścią wskazanego kontekstu danych.")),
    missing_narratives: ctx.narrative_contract.slots.missing_information.map((entry) => slot(entry, "This evidence gap limits the current research view.", "Ta luka w danych ogranicza obecną analizę.")),
  };
}

function issuedSlotCount(context: AIResearchContext): number {
  return 1 + context.narrative_contract.slots.facts.length + context.narrative_contract.slots.risks.length + context.narrative_contract.slots.missing_information.length;
}

async function writeFixture(liquidity: number, includeOther = false, otherLiquidity = liquidity) {
  const value = structuredClone(PERSISTABLE_SCANNER_SAMPLE);
  const candidate = value.candidates[0]!;
  candidate.chain = "base";
  candidate.contract_address = ADDRESS;
  candidate.source_url = `https://dexscreener.com/base/${ADDRESS}`;
  candidate.liquidity_usd = liquidity;
  candidate.address_identity_verified = true;
  if (includeOther) value.candidates.push({ ...candidate, contract_address: OTHER_ADDRESS, source_url: `https://dexscreener.com/base/${OTHER_ADDRESS}`, liquidity_usd: otherLiquidity });
  await writeFile(fixturePath, JSON.stringify(value), "utf8");
}
