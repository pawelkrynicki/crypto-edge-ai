import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { after, describe, it } from "node:test";
import { buildAIResearchContext, type AIResearchContext } from "../server/aiResearchContext.js";
import { AIResearchProviderError, type AIResearchProvider } from "../server/aiResearchProvider.js";
import {
  AIAnalysisQueueStoreError,
  buildAIAnalysisCacheIdentity,
  createAIAnalysisQueueStore,
  hashAIAnalysisRateScope,
  type AIAnalysisQueueRecord,
  type AIAnalysisQueueStore,
} from "../server/aiResearchQueueStore.js";
import { createAIResearchService } from "../server/aiResearchService.js";
import { createScannerApiHandler } from "../server/scannerApiHandler.js";
import { createAIResearchWorker } from "../server/aiResearchWorker.js";
import { PERSISTABLE_SCANNER_SAMPLE } from "../src/fixtures/persistableScannerSample.js";

const root = await mkdtemp(resolve(tmpdir(), "crypto-edge-pc2-failure-audit-"));
const fixturePath = resolve(root, "scanner.json");
const missingPath = resolve(root, "missing.json");
const outputDirPath = resolve(root, "missing-output");
const followUpPath = resolve(root, "missing-follow-up.json");
const reportsPath = resolve(root, "missing-reports");
const ADDRESS = "0x1111111111111111111111111111111111111111";
const NOW = new Date("2026-08-11T12:00:00.000Z");

after(async () => { await rm(root, { recursive: true, force: true }); });

describe("PC.2 provider attempt and failure-stage audit", () => {
  it("A: records a context failure before a provider attempt", async () => {
    const store = await storeFor("context.sqlite");
    const queued = store.enqueue({ identity: identity("a"), session_scope_hash: hashAIAnalysisRateScope("context"), now: NOW, rate_limits: rateLimits() }).record!;
    let calls = 0;
    const worker = createAIResearchWorker({
      ...missingContextOptions(),
      store,
      provider: provider(async () => { calls += 1; return "{}"; }),
      now: () => NOW,
      limits: { maxAttempts: 1 },
    });

    await worker.runCycle();
    const record = required(store, queued);
    assert.equal(calls, 0);
    assert.equal(record.provider_attempt_count, 0);
    assert.equal(record.failure_stage, "CONTEXT_BUILD");
    assert.equal(record.safe_error_code, "AI_CONTEXT_FAILURE");
    store.close();
  });

  it("B: records a circuit-store failure before a provider attempt", async () => {
    const store = await storeFor("circuit.sqlite");
    const queued = await enqueueReal(store, "circuit");
    let calls = 0;
    const circuitStore: AIAnalysisQueueStore = {
      ...store,
      acquireCircuitPermit() { throw new AIAnalysisQueueStoreError("STORE_UNAVAILABLE"); },
    };
    const worker = createAIResearchWorker({
      ...contextOptions(),
      store: circuitStore,
      provider: provider(async () => { calls += 1; return "{}"; }),
      now: () => NOW,
      limits: { maxAttempts: 1 },
    });

    await worker.runCycle();
    const record = required(store, queued);
    assert.equal(calls, 0);
    assert.equal(record.provider_attempt_count, 0);
    assert.equal(record.failure_stage, "CIRCUIT");
    assert.equal(record.safe_error_code, "AI_CIRCUIT_FAILURE");
    store.close();
  });

  it("C: records a thrown provider timeout as an entered provider attempt", async () => {
    const store = await storeFor("timeout.sqlite");
    const queued = await enqueueReal(store, "timeout");
    let calls = 0;
    const worker = createAIResearchWorker({
      ...contextOptions(),
      store,
      provider: provider(async () => {
        calls += 1;
        throw new AIResearchProviderError("PROVIDER_TIMEOUT");
      }),
      now: () => NOW,
      limits: { maxAttempts: 1, retryJitterRatio: 0 },
    });

    await worker.runCycle();
    const record = required(store, queued);
    assert.equal(calls, 1);
    assert.equal(record.provider_attempt_count, 1);
    assert.equal(record.provider_attempt_status, "FAILED");
    assert.equal(record.provider_attempt_safe_error_code, "PROVIDER_TIMEOUT");
    assert.equal(record.failure_stage, "PROVIDER_CALL");
    assert.equal(record.safe_error_code, "PROVIDER_TIMEOUT");
    store.close();
  });

  it("D: classifies a malformed provider response as a provider contract failure", async () => {
    const store = await storeFor("contract.sqlite");
    const queued = await enqueueReal(store, "contract");
    const worker = createAIResearchWorker({
      ...contextOptions(), store, provider: provider(async () => "{}"), now: () => NOW, limits: { maxAttempts: 1 },
    });

    await worker.runCycle();
    const record = required(store, queued);
    assert.equal(record.provider_attempt_count, 1);
    assert.equal(record.provider_attempt_status, "RESPONSE_RECEIVED");
    assert.equal(record.failure_stage, "PROVIDER_PARSE");
    assert.equal(record.safe_error_code, "PROVIDER_CONTRACT_INVALID");
    store.close();
  });

  it("E: retains a successful fake-provider audit and reaches READY", async () => {
    const store = await storeFor("ready.sqlite");
    const queued = await enqueueReal(store, "ready");
    const worker = createAIResearchWorker({
      ...contextOptions(), store, provider: provider(async (context) => JSON.stringify(narrative(context))), now: () => NOW,
    });

    await worker.runCycle();
    const record = required(store, queued);
    assert.equal(record.status, "READY");
    assert.equal(record.provider_attempt_count, 1);
    assert.equal(record.provider_attempt_status, "RESPONSE_RECEIVED");
    assert.equal(record.failure_stage, null);
    store.close();
  });

  it("F: records a store-complete failure after an entered provider attempt", async () => {
    const store = await storeFor("store-complete.sqlite");
    const queued = await enqueueReal(store, "store-complete");
    const completionStore: AIAnalysisQueueStore = {
      ...store,
      complete() { throw new AIAnalysisQueueStoreError("STORE_UNAVAILABLE"); },
    };
    const worker = createAIResearchWorker({
      ...contextOptions(),
      store: completionStore,
      provider: provider(async (context) => JSON.stringify(narrative(context))),
      now: () => NOW,
      limits: { maxAttempts: 1 },
    });

    await worker.runCycle();
    const record = required(store, queued);
    assert.equal(record.provider_attempt_count, 1);
    assert.equal(record.failure_stage, "STORE_COMPLETE");
    assert.equal(record.safe_error_code, "AI_STORE_FAILURE");
    store.close();
  });

  it("G: keeps provider audit fields out of the CAMP API", async () => {
    const store = await storeFor("camp-api.sqlite");
    const service = createAIResearchService({ ...contextOptions(), queueStore: store, providerEnabled: true, modelId: "gpt-5-mini", now: () => NOW });
    const server = createServer(createScannerApiHandler({
      runtimeMode: "INTERNAL_BETA",
      aiResearch: { service, sessionSecret: "pc2-failure-audit-public-contract" },
    }));
    await listen(server);
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      const response = await fetch(`${base}/api/v1/ai-analyses/requests`, {
        method: "POST",
        headers: { origin: base, "content-type": "application/json" },
        body: JSON.stringify({ chain: "base", contract_address: ADDRESS, locale: "pl", idempotency_key: "pc2_audit_public_0001" }),
      });
      const body = await response.json() as Record<string, unknown>;
      assert.equal(response.status, 202);
      for (const forbidden of [
        "provider_attempt_count",
        "provider_attempt_started_at",
        "provider_attempt_completed_at",
        "provider_attempt_status",
        "provider_attempt_safe_error_code",
        "failure_stage",
      ]) assert.equal(JSON.stringify(body).includes(forbidden), false, forbidden);
    } finally {
      await close(server);
      store.close();
    }
  });
});

async function storeFor(fileName: string) {
  await writeFixture();
  return createAIAnalysisQueueStore({ databaseFilePath: resolve(root, fileName) });
}

async function enqueueReal(store: AIAnalysisQueueStore, scope: string): Promise<AIAnalysisQueueRecord> {
  const context = await buildAIResearchContext("base", ADDRESS, "en", contextOptions());
  const outcome = store.enqueue({
    identity: buildAIAnalysisCacheIdentity({
      ...context.identity,
      snapshot_fingerprint: context.snapshot_fingerprint,
      prompt_version: context.prompt_version,
      model_id: "gpt-5-mini",
      analysis_schema_version: "ai_research_brief_v1",
      locale: "en",
    }),
    session_scope_hash: hashAIAnalysisRateScope(scope),
    now: NOW,
    rate_limits: rateLimits(),
  });
  assert.ok(outcome.record);
  return outcome.record;
}

function required(store: AIAnalysisQueueStore, queued: AIAnalysisQueueRecord): AIAnalysisQueueRecord {
  const record = store.findByAnalysisId(queued.analysis_id);
  assert.ok(record);
  return record;
}

function identity(fingerprint: string) {
  return buildAIAnalysisCacheIdentity({
    chain: "base",
    contract_address: ADDRESS,
    snapshot_fingerprint: fingerprint.repeat(64),
    model_id: "gpt-5-mini",
    locale: "en",
  });
}

function contextOptions() {
  return {
    scanner: { runtimeMode: "DEVELOPMENT_DEMO" as const, fixturePath, outputDirPath },
    followUp: { storePath: followUpPath, now: () => NOW },
    reports: { reportsRootPath: reportsPath, now: NOW },
  };
}

function missingContextOptions() {
  return {
    scanner: { runtimeMode: "DEVELOPMENT_DEMO" as const, fixturePath: missingPath, outputDirPath, allowFixtureFallback: false },
    followUp: { storePath: followUpPath, now: () => NOW },
    reports: { reportsRootPath: reportsPath, now: NOW },
  };
}

function rateLimits() {
  return { windowMs: 600_000, session: 10, identity: 10, global: 100, cooldownMs: 1_000 };
}

function provider(generateJson: (context: AIResearchContext) => Promise<string>): AIResearchProvider {
  return {
    mode: "OPENAI",
    model: "gpt-5-mini",
    async generate(context) {
      return {
        raw_json: await generateJson(context),
        model: "gpt-5-mini",
        token_usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
        latency_ms: 1,
        request_id: "pc2_failure_audit_fake",
      };
    },
  };
}

function narrative(context: AIResearchContext) {
  return {
    narrative_version: "ai_research_narrative_v2",
    summary: "The analysis organizes supplied data and identifies further review areas.",
    fact_narratives: context.fact_candidates.map((item) => ({ id: `fact:${item.key}`, interpretation: "This item reflects the supplied context." })),
    risk_narratives: context.risk_candidates.map((_item, index) => ({ id: `risk:${index}`, explanation: "This item requires further review." })),
    missing_narratives: context.missing_information.map((item) => ({ id: `missing:${item.key}`, explanation: "The supplied context does not establish this item." })),
    action_narratives: context.action_catalog.map((_item, index) => ({ id: `action:${index}`, reason: "Use the listed evidence to review this item." })),
    status_change_narratives: context.status_change_conditions.map((item) => ({ id: `condition:${item.key}`, explanation: "Review this item when supported data changes." })),
  };
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

function listen(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => { server.off("error", reject); resolveListen(); });
  });
}

function close(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
}
