import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { after, describe, it } from "node:test";
import { createAIAnalysisQueueStore } from "../server/aiResearchQueueStore.js";
import { createAIResearchService } from "../server/aiResearchService.js";
import { createScannerApiHandler } from "../server/scannerApiHandler.js";
import { PERSISTABLE_SCANNER_SAMPLE } from "../src/fixtures/persistableScannerSample.js";

const root = await mkdtemp(resolve(tmpdir(), "crypto-edge-ai3-api-tests-"));
const fixturePath = resolve(root, "scanner.json");
const outputDirPath = resolve(root, "missing-output");
const followUpPath = resolve(root, "missing-follow-up.json");
const reportsPath = resolve(root, "missing-reports");
const ADDRESS = "0x1111111111111111111111111111111111111111";
const NOW = new Date("2026-07-29T12:00:00.000Z");

await writeFixture();
after(async () => { await rm(root, { recursive: true, force: true }); });

describe("AI.3 versioned public queue API", () => {
  it("POST only enqueues, is idempotent and never executes a provider call", async () => {
    const store = await createAIAnalysisQueueStore({ databaseFilePath: resolve(root, "api.sqlite") });
    const service = createAIResearchService({
      ...contextOptions(), queueStore: store, providerEnabled: true, modelId: "gpt-5-mini", now: () => NOW,
    });
    const server = createServer(createScannerApiHandler({
      runtimeMode: "INTERNAL_BETA",
      aiResearch: { service, sessionSecret: "ai3-api-test-secret" },
    }));
    await listen(server);
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      const first = await post(base, "queue_request_0001");
      assert.equal(first.status, 202);
      const firstBody = await first.json() as Record<string, unknown>;
      assert.equal(firstBody.schema_version, "ai_production_analysis_lookup_v1");
      assert.equal(firstBody.status, "QUEUED");
      assert.equal(firstBody.analysis, null);
      for (const forbidden of ["provider_mode", "model", "analysis_id", "cache_key", "queue_status", "error_code"]) {
        assert.equal(Object.hasOwn(firstBody, forbidden), false, forbidden);
      }
      const second = await post(base, "queue_request_0002");
      assert.equal(second.status, 202);
      const secondBody = await second.json() as Record<string, unknown>;
      assert.equal(secondBody.status, "QUEUED");
      assert.equal(secondBody.is_last_known_good, false);
      assert.equal(store.stats().records, 1);
      assert.equal(store.stats().queued, 1);

      const status = await fetch(`${base}/api/v1/ai-analyses/status?chain=BASE&contract_address=${ADDRESS}&locale=pl`);
      assert.equal(status.status, 200);
      assert.equal((await status.json() as { status?: string }).status, "QUEUED");
      const result = await fetch(`${base}/api/v1/ai-analyses/result?chain=base&contract_address=${ADDRESS}&locale=pl`);
      assert.equal(result.status, 200);
      assert.equal((await result.json() as { status?: string }).status, "QUEUED");
    } finally {
      await close(server);
      store.close();
    }
  });

  it("rejects client fingerprint, model, prompt and lifecycle fields", async () => {
    const store = await createAIAnalysisQueueStore({ databaseFilePath: resolve(root, "api-invalid.sqlite") });
    const service = createAIResearchService({ ...contextOptions(), queueStore: store, providerEnabled: true, now: () => NOW });
    const server = createServer(createScannerApiHandler({ runtimeMode: "INTERNAL_BETA", aiResearch: { service, sessionSecret: "invalid-body-test" } }));
    await listen(server);
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      for (const field of ["snapshot_fingerprint", "model_id", "prompt_version", "lifecycle", "risk_severity", "sources", "owner_decision"]) {
        const response = await fetch(`${base}/api/v1/ai-analyses/requests`, {
          method: "POST",
          headers: { origin: base, "content-type": "application/json" },
          body: JSON.stringify({
            chain: "base",
            contract_address: ADDRESS,
            locale: "pl",
            idempotency_key: `invalid_${field}_0001`,
            [field]: "forbidden",
          }),
        });
        assert.equal(response.status, 400, field);
      }
      assert.equal(store.stats().records, 0);
    } finally {
      await close(server);
      store.close();
    }
  });

  it("keeps the browser and public request path disconnected from OpenAI", async () => {
    const [client, component, service, handler, worker] = await Promise.all([
      source("src/services/aiResearchDataSource.ts"),
      source("src/components/AIResearchSection.tsx"),
      source("server/aiResearchService.ts"),
      source("server/scannerApiHandler.ts"),
      source("server/aiResearchWorker.ts"),
    ]);
    assert.match(client, /\/api\/v1\/ai-analyses\/requests/);
    assert.match(client, /\/api\/v1\/ai-analyses\/result/);
    assert.doesNotMatch(client, /OPENAI_API_KEY|api\.openai\.com|createAIResearchProvider|from ["']openai["']/i);
    assert.doesNotMatch(service, /createAIResearchProvider|from "\.\/aiResearchProvider/);
    assert.doesNotMatch(handler, /createAIResearchProvider|OPENAI_API_KEY|api\.openai\.com/);
    assert.match(worker, /createAIResearchProvider/);
    assert.match(component, /Zleć analizę AI/);
    assert.match(component, /wspólnej kolejki/);
    assert.doesNotMatch(component, /Wygeneruj analizę AI|Generate AI analysis/);
  });

  it("ships an isolated owner review for every queue state with zero-call defaults", async () => {
    const launcher = await readFile(resolve(import.meta.dirname, "..", "..", "..", "scripts", "win", "start-ai3-shared-queue-review.cmd"), "utf8");
    assert.match(launcher, /CRYPTO_EDGE_AI_QUEUE_SQLITE_PATH=%TEMP%/);
    assert.match(launcher, /CRYPTO_EDGE_AI_REVIEW_PROVIDER=DETERMINISTIC_MOCK/);
    assert.match(launcher, /CRYPTO_EDGE_AI_RESEARCH_PROVIDER=DISABLED/);
    assert.match(launcher, /OpenAI calls: 0/);
    assert.match(launcher, /Data provider calls: 0/);
    for (const state of ["ABSENT", "QUEUED", "PROCESSING", "READY", "STALE", "FAILED", "SUSPENDED", "COOLDOWN"]) {
      assert.match(launcher, new RegExp(state));
    }
    assert.doesNotMatch(launcher, /collect:internal-beta|scanner:persist:live|--live-one|ALLOW_LIVE_PROVIDER_CALLS=1|Task Scheduler.*(?:install|enable)/i);
  });

  it("keeps lifecycle, Follow-up, feedback, Established and data scheduler write paths outside AI.3", async () => {
    const sources = (await Promise.all([
      source("server/aiResearchQueueStore.ts"),
      source("server/aiResearchService.ts"),
      source("server/aiResearchWorker.ts"),
      source("server/runAIResearchWorker.ts"),
    ])).join("\n");
    assert.doesNotMatch(sources, /writeFollowUp|createFeedbackStore|submitFeedback|createEstablishedPromotion|runCentralSchedulerOnce|runInternalBetaCollector|Task Scheduler/i);
    assert.doesNotMatch(sources, /current_stage\s*=|risk\.severity\s*=|established_membership\s*=/i);
  });
});

function post(base: string, idempotencyKey: string) {
  return fetch(`${base}/api/v1/ai-analyses/requests`, {
    method: "POST",
    headers: { origin: base, "content-type": "application/json" },
    body: JSON.stringify({ chain: "base", contract_address: ADDRESS, locale: "pl", idempotency_key: idempotencyKey }),
  });
}

function contextOptions() {
  return {
    scanner: { runtimeMode: "DEVELOPMENT_DEMO" as const, fixturePath, outputDirPath },
    followUp: { storePath: followUpPath, now: () => NOW },
    reports: { reportsRootPath: reportsPath, now: NOW },
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

function source(path: string) {
  return readFile(resolve(import.meta.dirname, "..", path), "utf8");
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
