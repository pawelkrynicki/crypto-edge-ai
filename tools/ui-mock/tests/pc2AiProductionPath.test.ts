import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { after, describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildAIResearchContext, type AIResearchContext } from "../server/aiResearchContext.js";
import { presentAIProductionLookup } from "../server/aiProductionPublic.js";
import { AIResearchProviderError, type AIResearchProvider } from "../server/aiResearchProvider.js";
import { buildAIAnalysisCacheIdentity, createAIAnalysisQueueStore, hashAIAnalysisRateScope } from "../server/aiResearchQueueStore.js";
import { createAIResearchService } from "../server/aiResearchService.js";
import { createAIResearchWorker } from "../server/aiResearchWorker.js";
import { AIResearchSection } from "../src/components/AIResearchSection";
import { CANDIDATE_DETAIL_TAB_IDS } from "../src/candidateDetailTabs";
import { PERSISTABLE_SCANNER_SAMPLE } from "../src/fixtures/persistableScannerSample.js";
import { ProductLocaleProvider } from "../src/productI18n";

void React;

const root = await mkdtemp(resolve(tmpdir(), "crypto-edge-pc2-ai-tests-"));
const fixturePath = resolve(root, "scanner.json");
const outputDirPath = resolve(root, "missing-output");
const followUpPath = resolve(root, "missing-follow-up.json");
const reportsPath = resolve(root, "missing-reports");
const ADDRESS = "0x1111111111111111111111111111111111111111";
const OTHER_ADDRESS = "0x2222222222222222222222222222222222222222";
const THIRD_ADDRESS = "0x3333333333333333333333333333333333333333";
const NOW = new Date("2026-08-11T12:00:00.000Z");

after(async () => { await rm(root, { recursive: true, force: true }); });

describe("PC.2 shared production AI path", () => {
  it("deduplicates 100 simultaneous mixed-locale requests and serves 500 mixed READY reads without another AI call", async () => {
    await writeFixture(100_000);
    const store = await createAIAnalysisQueueStore({ databaseFilePath: resolve(root, "concurrency.sqlite") });
    let calls = 0;
    const service = createService(store);
    const requests = await Promise.all(Array.from({ length: 100 }, (_, index) => (
      service.generate(request(index % 2 === 0 ? "pl" : "en", `pc2_mixed_request_${index.toString().padStart(4, "0")}`), `camp-user-${index}`)
    )));
    assert.equal(store.stats().records, 1);
    assert.equal(requests.filter((item) => item.request_outcome === "QUEUED").length, 1);
    assert.equal(requests.every((item) => item.request_outcome === "QUEUED" || item.request_outcome === "ALREADY_EXISTS"), true);

    const worker = createAIResearchWorker({
      ...contextOptions(),
      store,
      provider: provider(async (context) => { calls += 1; return JSON.stringify(narrative(context)); }),
      now: () => NOW,
    });
    assert.equal((await worker.runCycle()).completed, 1);
    assert.equal(calls, 1);

    const reads = await Promise.all(Array.from({ length: 500 }, (_, index) => service.getBrief("base", ADDRESS, index % 2 === 0 ? "pl" : "en")));
    assert.equal(reads.every((item) => item.availability === "READY"), true);
    assert.equal(new Set(reads.map((item) => item.brief?.analysis_id)).size, 1);
    assert.equal(calls, 1, "cache reads must not invoke a provider");
    assert.equal((await service.getBrief("base", ADDRESS, "en")).availability, "READY", "locale is not a second analysis key");
    assert.equal(store.stats().records, 1);
    store.close();
  });

  it("keeps PL and EN output independent of which locale enqueues the shared job first", async () => {
    await assertLocaleOrder("pl", "en", "locale-order-pl-en.sqlite");
    await assertLocaleOrder("en", "pl", "locale-order-en-pl.sqlite");
  });

  it("surfaces a unique evidence-bound provider narrative in the CAMP public result", async () => {
    await writeFixture(100_000);
    const store = await createAIAnalysisQueueStore({ databaseFilePath: resolve(root, "provider-narrative.sqlite") });
    const service = createService(store);
    await service.generate(request(), "camp-user");
    const worker = createAIResearchWorker({
      ...contextOptions(), store, now: () => NOW,
      provider: provider(async (context) => {
        const result = narrative(context);
        result.summary = {
          en: "Unique provider interpretation explains why the recorded liquidity context still needs security verification.",
          pl: "Unikalna interpretacja dostawcy wyjaśnia, dlaczego zapisany kontekst płynności nadal wymaga weryfikacji bezpieczeństwa.",
        };
        result.status_change_narratives[0] = {
          ...result.status_change_narratives[0]!,
          en: "Unique provider reassessment signal identifies the recorded condition that should trigger another review.",
          pl: "Unikalny sygnał dostawcy wskazuje zapisany warunek, po którym warto wrócić do analizy.",
        };
        return JSON.stringify(result);
      }),
    });
    await worker.runCycle();
    const pl = presentAIProductionLookup(await service.getBrief("base", ADDRESS, "pl"), "pl");
    const en = presentAIProductionLookup(await service.getBrief("base", ADDRESS, "en"), "en");
    assert.match(en.analysis?.analysis_summary ?? "", /Unique provider interpretation/);
    assert.match(pl.analysis?.analysis_summary ?? "", /Unikalna interpretacja dostawcy/);
    assert.match(en.analysis?.reassessment_signals[0]?.detail ?? "", /Unique provider reassessment signal/);
    assert.match(pl.analysis?.reassessment_signals[0]?.detail ?? "", /Unikalny sygnał dostawcy/);
    store.close();
  });

  it("keeps last-known-good visible through stale refresh success and failure", async () => {
    await writeFixture(100_000);
    const store = await createAIAnalysisQueueStore({ databaseFilePath: resolve(root, "lkg.sqlite") });
    const service = createService(store);
    await service.generate(request(), "camp-a");
    let shouldFail = false;
    const worker = createAIResearchWorker({
      ...contextOptions(), store, now: () => NOW,
      provider: provider(async (context) => {
        if (shouldFail) throw new AIResearchProviderError("PROVIDER_TIMEOUT");
        return JSON.stringify(narrative(context));
      }),
      limits: { maxAttempts: 1, retryJitterRatio: 0 },
    });
    await worker.runCycle();
    const first = await service.getBrief("base", ADDRESS, "pl");
    assert.equal(first.availability, "READY");

    await writeFixture(200_000);
    const refresh = await service.generate(request(), "camp-b");
    assert.equal(refresh.availability, "QUEUED");
    assert.equal(refresh.is_last_known_good, true);
    assert.equal(refresh.brief?.analysis_id, first.brief?.analysis_id);
    await worker.runCycle();
    assert.notEqual((await service.getBrief("base", ADDRESS, "pl")).brief?.analysis_id, first.brief?.analysis_id);

    await writeFixture(300_000);
    await service.generate(request(), "camp-c");
    shouldFail = true;
    await worker.runCycle();
    const failedRefresh = presentAIProductionLookup(await service.getBrief("base", ADDRESS, "pl"));
    assert.equal(failedRefresh.status, "STALE");
    assert.ok(failedRefresh.analysis);
    assert.equal(failedRefresh.is_last_known_good, true);
    store.close();
  });

  it("uses bounded retry with deterministic jitter and opens then recovers the central circuit breaker", async () => {
    await writeFixture(100_000);
    const store = await createAIAnalysisQueueStore({ databaseFilePath: resolve(root, "breaker.sqlite") });
    let clock = NOW;
    for (const address of [ADDRESS, OTHER_ADDRESS, THIRD_ADDRESS]) {
      const context = await buildAIResearchContext("base", address, "pl", { ...contextOptions(), now: () => clock });
      store.enqueue({ identity: cacheIdentity(context), session_scope_hash: hashAIAnalysisRateScope(`breaker-${address}`), now: clock, rate_limits: limits() });
    }
    assert.equal(store.stats().records, 3, "each distinct snapshot must retain its own queued analysis");
    let calls = 0;
    const failingWorker = createAIResearchWorker({
      ...contextOptions(), store, now: () => clock,
      provider: provider(async () => { calls += 1; throw new AIResearchProviderError("PROVIDER_TIMEOUT"); }),
      limits: { maxAttempts: 1, maxAnalysesPerCycle: 3, retryBaseMs: 100, retryJitterRatio: 0.2, circuitFailureThreshold: 3, circuitOpenMs: 500, circuitDeferralMs: 1_000 },
    });
    const failingRun = await failingWorker.runCycle();
    assert.equal(failingRun.claimed, 3, JSON.stringify(failingRun));
    assert.equal(calls, 3);
    assert.equal(store.circuitBreaker(clock).state, "OPEN");

    await writeFixture(104_000);
    const context = await buildAIResearchContext("base", ADDRESS, "pl", { ...contextOptions(), now: () => clock });
    store.enqueue({ identity: cacheIdentity(context), session_scope_hash: hashAIAnalysisRateScope("breaker-recovery"), now: clock, rate_limits: limits() });
    const blocked = await failingWorker.runCycle();
    assert.equal(blocked.status, "CIRCUIT_OPEN");
    assert.equal(calls, 3, "an open breaker must block provider calls");

    clock = new Date(NOW.getTime() + 60 * 60_000);
    const recoveredWorker = createAIResearchWorker({
      ...contextOptions(), store, now: () => clock,
      provider: provider(async (value) => { calls += 1; return JSON.stringify(narrative(value)); }),
      limits: { maxAttempts: 1, maxAnalysesPerCycle: 3, circuitFailureThreshold: 3, circuitOpenMs: 500 },
    });
    const recovered = await recoveredWorker.runCycle();
    assert.equal(recovered.claimed, 1, JSON.stringify(recovered));
    assert.equal(calls, 4, JSON.stringify(recovered));
    assert.equal(store.circuitBreaker(clock).state, "CLOSED");
    store.close();
  });

  it("limits only new analysis initiation, while queued and cached shared reads stay cheap", async () => {
    await writeFixture(100_000);
    const store = await createAIAnalysisQueueStore({ databaseFilePath: resolve(root, "limits.sqlite") });
    const service = createAIResearchService({
      ...contextOptions(), queueStore: store, providerEnabled: true, modelId: "gpt-5-mini", now: () => NOW,
      rateLimits: { actorHourly: 1, globalHourly: 2, globalDaily: 2, queueDepth: 1 },
    });
    assert.equal((await service.generate(request(), "camp-user-a")).availability, "QUEUED");
    assert.equal((await service.generate(request(), "camp-user-a")).availability, "QUEUED", "dedup does not spend actor quota");
    const worker = createAIResearchWorker({ ...contextOptions(), store, now: () => NOW, provider: provider(async (context) => JSON.stringify(narrative(context))) });
    await worker.runCycle();
    await writeFixture(200_000);
    assert.equal(presentAIProductionLookup(await service.generate(request(), "camp-user-a")).status, "STALE", "a rate-limited refresh retains last-known-good");
    store.close();

    const depthStore = await createAIAnalysisQueueStore({ databaseFilePath: resolve(root, "queue-depth.sqlite") });
    await writeFixture(100_000);
    const depthService = createAIResearchService({
      ...contextOptions(), queueStore: depthStore, providerEnabled: true, modelId: "gpt-5-mini", now: () => NOW,
      rateLimits: { actorHourly: 10, globalHourly: 10, globalDaily: 10, queueDepth: 1 },
    });
    await depthService.generate(request(), "camp-user-b");
    await writeFixture(200_000);
    const limited = await depthService.generate(request(), "camp-user-c");
    assert.equal(presentAIProductionLookup(limited).status, "LIMIT");
    depthStore.close();
  });

  it("uses the versioned public output, seven detail tabs and bilingual nontechnical states", async () => {
    await writeFixture(100_000);
    const store = await createAIAnalysisQueueStore({ databaseFilePath: resolve(root, "public-contract.sqlite") });
    const service = createService(store);
    await service.generate(request(), "camp-user");
    const worker = createAIResearchWorker({ ...contextOptions(), store, now: () => NOW, provider: provider(async (context) => JSON.stringify(narrative(context))) });
    await worker.runCycle();
    const publicValue = presentAIProductionLookup(await service.getBrief("base", ADDRESS, "pl"));
    assert.equal(publicValue.status, "READY");
    assert.ok(publicValue.analysis);
    assert.deepEqual(Object.keys(publicValue.analysis!).sort(), [
      "analysis_summary", "analysis_version", "confirmed_findings", "data_snapshot_at", "evidence", "freshness", "generated_at", "holder_context",
      "liquidity_context", "market_context", "missing_data", "next_research_steps", "reassessment_signals", "risks", "schema_version", "security_context",
    ]);
    assert.doesNotMatch(JSON.stringify(publicValue), /openai|gpt-|analysis_id|cache_key|queue_status|token_usage|sqlite/i);
    assert.equal(CANDIDATE_DETAIL_TAB_IDS.length, 7);
    assert.equal(CANDIDATE_DETAIL_TAB_IDS.includes("ai"), true);

    const queued: typeof publicValue = { ...publicValue, status: "QUEUED", analysis: null, is_last_known_good: false };
    const pl = renderToStaticMarkup(React.createElement(ProductLocaleProvider, { initialLocale: "pl" }, React.createElement(AIResearchSection, { chain: "base", contractAddress: ADDRESS, symbol: "T", name: "Token", initialLookup: queued })));
    const en = renderToStaticMarkup(React.createElement(ProductLocaleProvider, { initialLocale: "en" }, React.createElement(AIResearchSection, { chain: "base", contractAddress: ADDRESS, symbol: "T", name: "Token", initialLookup: queued })));
    assert.match(pl, /Przygotowanie analizy rozpocznie się, gdy będzie dostępna/);
    assert.match(en, /The analysis will be prepared when it becomes available/);
    store.close();
  });

  it("keeps AI unable to mutate lifecycle or a private workspace", async () => {
    const [worker, service, ui] = await Promise.all([
      readFile(resolve(import.meta.dirname, "..", "server", "aiResearchWorker.ts"), "utf8"),
      readFile(resolve(import.meta.dirname, "..", "server", "aiResearchService.ts"), "utf8"),
      readFile(resolve(import.meta.dirname, "..", "src", "components", "AIResearchSection.tsx"), "utf8"),
    ]);
    for (const source of [worker, service, ui]) {
      assert.doesNotMatch(source, /moveToFollowUp|moveToMainRadar|mutateLifecycle|privateWorkspace|workspace\.mutate/);
    }
    assert.doesNotMatch(ui, /OPENAI_API_KEY|api\.openai\.com|createAIResearchProvider/);
  });
});

function createService(store: Awaited<ReturnType<typeof createAIAnalysisQueueStore>>) {
  return createAIResearchService({ ...contextOptions(), queueStore: store, providerEnabled: true, modelId: "gpt-5-mini", now: () => NOW });
}

function contextOptions() {
  return {
    scanner: { runtimeMode: "DEVELOPMENT_DEMO" as const, fixturePath, outputDirPath },
    followUp: { storePath: followUpPath, now: () => NOW },
    reports: { reportsRootPath: reportsPath, now: NOW },
  };
}

function limits() {
  return { windowMs: 600_000, session: 30, identity: 30, global: 100, cooldownMs: 1_000 };
}

function request(locale: "pl" | "en" = "pl", idempotencyKey = "pc2_shared_request_0001") {
  return { chain: "base", contract_address: ADDRESS, locale, idempotency_key: idempotencyKey };
}

async function assertLocaleOrder(firstLocale: "pl" | "en", secondLocale: "pl" | "en", fileName: string) {
  await writeFixture(100_000);
  const store = await createAIAnalysisQueueStore({ databaseFilePath: resolve(root, fileName) });
  const service = createService(store);
  assert.equal((await service.generate(request(firstLocale, `pc2_${firstLocale}_first`), "camp-first")).availability, "QUEUED");
  assert.equal((await service.generate(request(secondLocale, `pc2_${secondLocale}_second`), "camp-second")).request_outcome, "ALREADY_EXISTS");
  let calls = 0;
  let providerLocale: string | null = null;
  const worker = createAIResearchWorker({
    ...contextOptions(), store, now: () => NOW,
    provider: provider(async (context) => {
      calls += 1;
      providerLocale = context.locale;
      return JSON.stringify(narrative(context));
    }),
  });
  await worker.runCycle();
  assert.equal(store.stats().records, 1);
  assert.equal(calls, 1);
  assert.equal(providerLocale, "en", "the heavy provider context is canonical, not first-request locale");

  const pl = presentAIProductionLookup(await service.getBrief("base", ADDRESS, "pl"), "pl");
  const en = presentAIProductionLookup(await service.getBrief("base", ADDRESS, "en"), "en");
  assert.equal(pl.status, "READY");
  assert.equal(en.status, "READY");
  assert.ok(pl.analysis);
  assert.ok(en.analysis);
  assert.match(pl.analysis.analysis_summary, /^Zapisana migawka/);
  assert.match(en.analysis.analysis_summary, /^The recorded snapshot/);
  assert.deepEqual(pl.analysis.risks.map((item) => item.severity), en.analysis.risks.map((item) => item.severity));
  assert.deepEqual(pl.analysis.evidence.map((item) => item.completeness), en.analysis.evidence.map((item) => item.completeness));
  assert.equal(pl.analysis.missing_data.length, en.analysis.missing_data.length);
  assert.doesNotMatch(JSON.stringify({ pl, en }), /openai|gpt-|analysis_id|cache_key|queue_status|token_usage|sqlite/i);
  store.close();
}

function cacheIdentity(context: AIResearchContext) {
  return buildAIAnalysisCacheIdentity({
    ...context.identity, snapshot_fingerprint: context.snapshot_fingerprint, prompt_version: context.prompt_version,
    model_id: "gpt-5-mini", analysis_schema_version: "ai_research_brief_v2", locale: context.locale,
  });
}

function provider(generate: (context: AIResearchContext) => Promise<string>): AIResearchProvider {
  return {
    mode: "OPENAI", model: "gpt-5-mini",
    async generate(context) {
      return { raw_json: await generate(context), model: "gpt-5-mini", token_usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 }, latency_ms: 1, request_id: "pc2_fake" };
    },
  };
}

function narrative(context: AIResearchContext) {
  return {
    narrative_version: "ai_research_narrative_v3",
    summary: { en: "The recorded snapshot gives market context while evidence gaps still need verification.", pl: "Zapisana migawka daje kontekst rynkowy, ale luki w danych nadal wymagają sprawdzenia." },
    fact_narratives: context.fact_candidates.map((item) => ({ id: `fact:${item.key}`, en: "This recorded fact adds context to the research view.", pl: "Ten zapisany fakt uzupełnia obecną analizę." })),
    risk_narratives: context.risk_candidates.map((_item, index) => ({ id: `risk:${index}`, en: "This recorded risk needs verification against the listed evidence.", pl: "To zapisane ryzyko wymaga sprawdzenia względem wskazanych danych." })),
    missing_narratives: context.missing_information.map((item) => ({ id: `missing:${item.key}`, en: "This evidence gap limits the current research view.", pl: "Ta luka w danych ogranicza obecną analizę." })),
    action_narratives: context.action_catalog.map((_item, index) => ({ id: `action:${index}`, en: "Use this permitted research step to verify the evidence.", pl: "Wykorzystaj ten dozwolony krok analizy, aby sprawdzić dane." })),
    status_change_narratives: context.status_change_conditions.map((item) => ({ id: `condition:${item.key}`, en: "This condition would justify reviewing the research view.", pl: "Ten warunek uzasadnia ponowne sprawdzenie analizy." })),
  };
}

async function writeFixture(liquidity: number) {
  const value = structuredClone(PERSISTABLE_SCANNER_SAMPLE);
  const candidate = value.candidates[0]!;
  candidate.chain = "base";
  candidate.contract_address = ADDRESS;
  candidate.source_url = `https://dexscreener.com/base/${ADDRESS}`;
  candidate.liquidity_usd = liquidity;
  candidate.address_identity_verified = true;
  value.candidates.push({
    ...candidate,
    contract_address: OTHER_ADDRESS,
    source_url: `https://dexscreener.com/base/${OTHER_ADDRESS}`,
  });
  value.candidates.push({
    ...candidate,
    contract_address: THIRD_ADDRESS,
    source_url: `https://dexscreener.com/base/${THIRD_ADDRESS}`,
  });
  await writeFile(fixturePath, JSON.stringify(value), "utf8");
}
