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

  it("B1: retains only bounded diagnostics for provider failures and never creates a READY result", async () => {
    const cases = [
      { name: "http-400", code: "PROVIDER_REQUEST_REJECTED" as const, http: 400, response: true, phase: "REQUEST_REJECTED" as const },
      { name: "http-401", code: "PROVIDER_AUTHENTICATION" as const, http: 401, response: true, phase: "REQUEST_REJECTED" as const },
      { name: "http-429", code: "PROVIDER_RATE_LIMITED" as const, http: 429, response: true, phase: "REQUEST_REJECTED" as const },
      { name: "http-500", code: "PROVIDER_UNAVAILABLE" as const, http: 500, response: true, phase: "REQUEST_REJECTED" as const },
      { name: "network", code: "PROVIDER_NETWORK" as const, http: null, response: false, phase: "NETWORK" as const },
      { name: "timeout", code: "PROVIDER_TIMEOUT" as const, http: null, response: false, phase: "NETWORK" as const },
    ];
    for (const testCase of cases) {
      const store = await storeFor(`diagnostic-${testCase.name}.sqlite`);
      const queued = await enqueueReal(store, testCase.name);
      let calls = 0;
      const worker = createAIResearchWorker({
        ...contextOptions(),
        store,
        provider: {
          mode: "OPENAI",
          model: "gpt-5-mini",
          async generate() {
            calls += 1;
            throw new AIResearchProviderError(testCase.code, {
              http_status: testCase.http,
              provider_error_type: "fixture_error",
              provider_error_code: "fixture_code",
              provider_error_param: "text.format.schema",
              response_received: testCase.response,
              failure_phase: testCase.phase,
              request_id: `fixture_${testCase.name}`,
            });
          },
        },
        now: () => NOW,
        limits: { maxAttempts: 1, retryJitterRatio: 0 },
      });

      await worker.runCycle();
      const record = required(store, queued);
      assert.equal(calls, 1, testCase.name);
      assert.equal(record.provider_attempt_count, 1, testCase.name);
      assert.equal(record.attempt_count, 1, testCase.name);
      assert.equal(record.status, "SUSPENDED", testCase.name);
      assert.equal(record.result, null, testCase.name);
      assert.equal(record.safe_error_code, testCase.code, testCase.name);
      assert.deepEqual(record.internal_provider_failure, {
        http_status: testCase.http,
        error_type: "fixture_error",
        error_code: "fixture_code",
        error_param: "text.format.schema",
        response_received: testCase.response,
        failure_phase: testCase.phase,
        request_id: `fixture_${testCase.name}`,
        transport_stage: null,
        request_body_status: null,
        ip_family: null,
        proxy_active: null,
      }, testCase.name);
      assert.doesNotMatch(JSON.stringify(record.internal_provider_failure), /authorization|api[_-]?key|raw provider|prompt/i, testCase.name);
      store.close();
    }
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

  it("C1: records an incomplete provider response with bounded internal metadata", async () => {
    const store = await storeFor("incomplete.sqlite");
    const queued = await enqueueReal(store, "incomplete");
    const worker = createAIResearchWorker({
      ...contextOptions(),
      store,
      provider: {
        mode: "OPENAI",
        model: "gpt-5-mini",
        async generate() {
          throw new AIResearchProviderError("PROVIDER_OUTPUT_INCOMPLETE", {
            response_status: "incomplete",
            incomplete_reason: "max_output_tokens",
            output_tokens: 4_000,
            reasoning_tokens: 2_000,
          });
        },
      },
      now: () => NOW,
      limits: { maxAttempts: 1, retryJitterRatio: 0 },
    });

    await worker.runCycle();
    const record = required(store, queued);
    assert.equal(record.status, "SUSPENDED");
    assert.equal(record.provider_attempt_count, 1);
    assert.equal(record.provider_attempt_status, "FAILED");
    assert.equal(record.provider_attempt_safe_error_code, "PROVIDER_OUTPUT_INCOMPLETE");
    assert.equal(record.safe_error_code, "PROVIDER_OUTPUT_INCOMPLETE");
    assert.equal(record.internal_validation_code, "PROVIDER_OUTPUT_INCOMPLETE");
    assert.deepEqual(record.internal_validation_violations, ["INCOMPLETE_REASON_MAX_OUTPUT_TOKENS"]);
    assert.deepEqual(record.internal_provider_response, {
      status: "incomplete", incomplete_reason: "max_output_tokens", output_tokens: 4_000, reasoning_tokens: 2_000,
    });
    assert.equal(record.result, null);
    store.close();
  });

  it("C2: persists validation code and violations internally without exposing a raw provider response", async () => {
    const store = await storeFor("validation-diagnostics.sqlite");
    const queued = await enqueueReal(store, "validation-diagnostics");
    const worker = createAIResearchWorker({
      ...contextOptions(),
      store,
      provider: provider(async (context) => {
        const value = narrative(context);
        value.summary.en = "Buy this token.";
        return JSON.stringify(value);
      }),
      now: () => NOW,
      limits: { maxAttempts: 1 },
    });

    await worker.runCycle();
    const record = required(store, queued);
    assert.equal(record.status, "SUSPENDED");
    assert.equal(record.safe_error_code, "PROVIDER_CONTRACT_INVALID");
    assert.equal(record.internal_validation_code, "FORBIDDEN_CONTENT");
    assert.deepEqual(record.internal_validation_violations, ["FORBIDDEN_CONTENT"]);
    assert.equal(record.result, null);
    store.close();
  });

  it("C3: replaces presentation-invalid provider prose before canonical READY persistence", async () => {
    const store = await storeFor("presentation-fallback.sqlite");
    const queued = await enqueueReal(store, "presentation-fallback");
    const worker = createAIResearchWorker({
      ...contextOptions(),
      store,
      provider: provider(async (context) => {
        const value = narrative(context);
        value.fact_narratives[0]!.pl = "Dane security wymagają dalszej weryfikacji.";
        return JSON.stringify(value);
      }),
      now: () => NOW,
      limits: { maxAttempts: 1 },
    });

    await worker.runCycle();
    const record = required(store, queued);
    assert.equal(record.status, "READY");
    assert.equal(record.safe_error_code, null);
    assert.equal(record.internal_validation_code, "SLOT_FALLBACK_APPLIED");
    assert.deepEqual(record.internal_validation_violations, ["MACHINE_VALUE_IN_NARRATIVE", "LANGUAGE_MISMATCH"]);
    assert.equal(record.provider_attempt_count, 1);
    assert.equal(record.attempt_count, 1);
    assert.equal(record.result?.known_facts[0]?.interpretation.pl, "Ten zapisany fakt uzupełnia obecny zestaw danych.");
    assert.deepEqual(record.internal_composition_diagnostics?.fallback_slot_ids, ["fact:lifecycle"]);
    store.close();
  });

  it("D: classifies a malformed provider response as a provider contract failure", async () => {
    const store = await storeFor("contract.sqlite");
    const queued = await enqueueReal(store, "contract");
    const worker = createAIResearchWorker({
      ...contextOptions(), store, provider: provider(async () => "{\"narrative_version\":"), now: () => NOW, limits: { maxAttempts: 1 },
    });

    await worker.runCycle();
    const record = required(store, queued);
    assert.equal(record.provider_attempt_count, 1);
    assert.equal(record.provider_attempt_status, "RESPONSE_RECEIVED");
    assert.equal(record.failure_stage, "PROVIDER_PARSE");
    assert.equal(record.safe_error_code, "PROVIDER_CONTRACT_INVALID");
    assert.equal(record.internal_validation_code, "INVALID_JSON");
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
        "internal_validation_code",
        "internal_validation_violations",
        "internal_validation_violations_json",
        "internal_provider_response",
        "internal_provider_response_status",
        "internal_provider_incomplete_reason",
        "internal_provider_output_tokens",
        "internal_provider_reasoning_tokens",
        "internal_provider_http_status",
        "internal_provider_error_type",
        "internal_provider_error_code",
        "internal_provider_error_param",
        "internal_provider_response_received",
        "internal_provider_failure_phase",
        "internal_provider_request_id",
        "internal_provider_failure",
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
      analysis_schema_version: "ai_research_brief_v2",
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
  const slot = (entry: { id: string; allowed_support_ids: string[] }, en: string, pl: string) => ({ id: entry.id, support_ids: [entry.allowed_support_ids[0]!], en, pl });
  return {
    narrative_version: "ai_research_narrative_v6",
    summary: slot(context.narrative_contract.slots.summary, "The recorded snapshot gives market context while evidence gaps remain in the current evidence set.", "Zapisana migawka daje kontekst rynkowy, a luki pozostają w obecnym zestawie danych."),
    fact_narratives: context.narrative_contract.slots.facts.map((entry) => slot(entry, "This recorded fact adds context to the research view.", "Ten zapisany fakt uzupełnia obecną analizę.")),
    risk_narratives: context.narrative_contract.slots.risks.map((entry) => slot(entry, "This recorded risk remains part of the listed evidence context.", "To zapisane ryzyko pozostaje częścią wskazanego kontekstu danych.")),
    missing_narratives: context.narrative_contract.slots.missing_information.map((entry) => slot(entry, "This evidence gap limits the current research view.", "Ta luka w danych ogranicza obecną analizę.")),
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
