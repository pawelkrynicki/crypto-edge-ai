import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { after, describe, it } from "node:test";
import { buildAIResearchContext } from "../server/aiResearchContext.js";
import {
  AIResearchProviderError,
  createAIResearchProvider,
  OPENAI_RESEARCH_CLIENT_MAX_RETRIES,
  OPENAI_RESEARCH_DEFAULT_TIMEOUT_MS,
  OPENAI_RESEARCH_MAX_OUTPUT_TOKENS,
  OPENAI_RESEARCH_MAX_TIMEOUT_MS,
  resolveAIResearchProviderConfig,
} from "../server/aiResearchProvider.js";
import { resolveAIResearchWorkerLimits } from "../server/aiResearchWorker.js";
import { PERSISTABLE_SCANNER_SAMPLE } from "../src/fixtures/persistableScannerSample.js";

const root = await mkdtemp(resolve(tmpdir(), "crypto-edge-ai2c-compat-tests-"));
const fixturePath = resolve(root, "scanner.json");
const outputDirPath = resolve(root, "missing-output");
const followUpPath = resolve(root, "missing-follow-up.json");
const reportsPath = resolve(root, "missing-reports");
const ADDRESS = "0x1111111111111111111111111111111111111111";
const NOW = new Date("2026-07-29T12:00:00.000Z");

await writeFixture();
after(async () => { await rm(root, { recursive: true, force: true }); });

describe("AI.2C provider contract compatibility under AI.3", () => {
  it("remains fail-closed by default with worker concurrency one", () => {
    const config = resolveAIResearchProviderConfig({});
    assert.equal(config.mode, "DISABLED");
    assert.equal(config.apiKey, null);
    assert.equal(config.model, null);
    assert.equal(config.maxConcurrency, 1);
  });

  it("defaults the bounded provider timeout to 90 seconds and preserves its configured bounds", () => {
    assert.equal(resolveAIResearchProviderConfig({}).timeoutMs, OPENAI_RESEARCH_DEFAULT_TIMEOUT_MS);
    assert.equal(resolveAIResearchProviderConfig({ CRYPTO_EDGE_AI_RESEARCH_TIMEOUT_MS: "1000" }).timeoutMs, 1_000);
    assert.equal(resolveAIResearchProviderConfig({ CRYPTO_EDGE_AI_RESEARCH_TIMEOUT_MS: "120000" }).timeoutMs, OPENAI_RESEARCH_MAX_TIMEOUT_MS);
    assert.equal(resolveAIResearchProviderConfig({ CRYPTO_EDGE_AI_RESEARCH_TIMEOUT_MS: "120001" }).timeoutMs, OPENAI_RESEARCH_DEFAULT_TIMEOUT_MS);
    assert.equal(OPENAI_RESEARCH_CLIENT_MAX_RETRIES, 0);
    assert.ok(resolveAIResearchWorkerLimits({}).leaseMs - OPENAI_RESEARCH_DEFAULT_TIMEOUT_MS >= 30_000);
  });

  it("maps a client timeout to PROVIDER_TIMEOUT without an SDK retry", async () => {
    const context = await buildAIResearchContext("base", ADDRESS, "pl", contextOptions());
    let mockCalls = 0;
    const provider = createAIResearchProvider({
      config: {
        mode: "OPENAI",
        model: "gpt-5-mini",
        apiKey: "test-only-not-a-real-key",
        timeoutMs: OPENAI_RESEARCH_DEFAULT_TIMEOUT_MS,
        maxConcurrency: 1,
        liveCallBudget: 1,
        liveCallBudgetInvalid: false,
      },
      fetch: async () => {
        mockCalls += 1;
        const error = new Error("local client request deadline reached");
        error.name = "APIConnectionTimeoutError";
        throw error;
      },
    });
    await assert.rejects(provider.generate(context), (error: unknown) => error instanceof AIResearchProviderError && error.code === "PROVIDER_TIMEOUT");
    assert.equal(mockCalls, 1);
  });

  it("keeps Responses API structured-output parsing behind an injected mock fetch", async () => {
    const context = await buildAIResearchContext("base", ADDRESS, "pl", contextOptions());
    let mockCalls = 0;
    const provider = createAIResearchProvider({
      config: {
        mode: "OPENAI",
        model: "gpt-5-mini",
        apiKey: "test-only-not-a-real-key",
        timeoutMs: 5_000,
        maxConcurrency: 1,
        liveCallBudget: null,
        liveCallBudgetInvalid: false,
      },
      fetch: async () => {
        mockCalls += 1;
        return new Response(JSON.stringify({
          status: "completed",
          output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(narrative(context)) }] }],
          usage: { input_tokens: 100, output_tokens: 50, output_tokens_details: { reasoning_tokens: 12 } },
        }), {
          status: 200,
          headers: { "content-type": "application/json", "x-request-id": "mock_request_id" },
        });
      },
    });
    const result = await provider.generate(context);
    assert.equal(mockCalls, 1);
    assert.equal(result.model, "gpt-5-mini");
    assert.deepEqual(result.token_usage, { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 });
    assert.deepEqual(result.response_metadata, { response_status: "completed", incomplete_reason: null, output_tokens: 50, reasoning_tokens: 12, max_output_tokens: 8_000 });
    assert.equal(result.request_id, "mock_request_id");
  });

  it("rejects an incomplete response before its partial output can be treated as completed JSON", async () => {
    const context = await buildAIResearchContext("base", ADDRESS, "pl", contextOptions());
    const provider = createAIResearchProvider({
      config: openAiConfig(),
      fetch: async () => new Response(JSON.stringify({
        status: "incomplete",
        incomplete_details: { reason: "max_output_tokens" },
        output: [{ type: "message", content: [{ type: "output_text", text: "{\"narrative_version\": \"ai_research_narrative_v3\"" }] }],
        usage: { input_tokens: 100, output_tokens: 4_000, output_tokens_details: { reasoning_tokens: 2_000 } },
      }), { status: 200, headers: { "content-type": "application/json" } }),
    });
    await assert.rejects(provider.generate(context), (error: unknown) => error instanceof AIResearchProviderError
      && error.code === "PROVIDER_OUTPUT_INCOMPLETE"
      && error.response_metadata.response_status === "incomplete"
      && error.response_metadata.incomplete_reason === "max_output_tokens"
      && error.response_metadata.output_tokens === 4_000
      && error.response_metadata.reasoning_tokens === 2_000);
  });

  it("rejects an incomplete response even when its partial output happens to be syntactically valid", async () => {
    const context = await buildAIResearchContext("base", ADDRESS, "pl", contextOptions());
    const provider = createAIResearchProvider({
      config: openAiConfig(),
      fetch: async () => new Response(JSON.stringify({
        status: "incomplete",
        incomplete_details: { reason: "max_output_tokens" },
        output: [{ type: "message", content: [{ type: "output_text", text: "{}" }] }],
        usage: { input_tokens: 100, output_tokens: 4_000, output_tokens_details: { reasoning_tokens: 2_000 } },
      }), { status: 200, headers: { "content-type": "application/json" } }),
    });
    await assert.rejects(provider.generate(context), (error: unknown) => error instanceof AIResearchProviderError && error.code === "PROVIDER_OUTPUT_INCOMPLETE");
  });

  it("keeps the SDK call non-persistent, bounded and without SDK retries", async () => {
    const providerSource = await source("server/aiResearchProvider.ts");
    assert.match(providerSource, /store: false/);
    assert.match(providerSource, /background: false/);
    assert.equal(OPENAI_RESEARCH_MAX_OUTPUT_TOKENS, 8_000);
    assert.match(providerSource, /max_output_tokens: OPENAI_RESEARCH_MAX_OUTPUT_TOKENS/);
    assert.match(providerSource, /OPENAI_RESEARCH_CLIENT_MAX_RETRIES = 0/);
    assert.match(providerSource, /strict: true/);
    assert.doesNotMatch(providerSource, /web_search|file_search|computer_use/);
  });

  it("retires browser live-one and keeps provider execution in the central worker", async () => {
    const [launcher, service, worker] = await Promise.all([
      readFile(resolve(import.meta.dirname, "..", "..", "..", "scripts", "win", "start-ai-research-openai-review.cmd"), "utf8"),
      source("server/aiResearchService.ts"),
      source("server/aiResearchWorker.ts"),
    ]);
    assert.match(launcher, /--live-one zostal wycofany/);
    assert.match(launcher, /OpenAI calls: 0/);
    assert.doesNotMatch(launcher, /ALLOW_LIVE_PROVIDER_CALLS=1|CRYPTO_EDGE_AI_WORKER_ENABLED=1/);
    assert.doesNotMatch(service, /createAIResearchProvider|from "\.\/aiResearchProvider/);
    assert.match(worker, /createAIResearchProvider/);
    assert.match(worker, /parseAIResearchProviderNarrative/);
  });
});

function openAiConfig() {
  return {
    mode: "OPENAI" as const,
    model: "gpt-5-mini",
    apiKey: "test-only-not-a-real-key",
    timeoutMs: 5_000,
    maxConcurrency: 1,
    liveCallBudget: 1 as const,
    liveCallBudgetInvalid: false,
  };
}

function contextOptions() {
  return {
    scanner: { runtimeMode: "DEVELOPMENT_DEMO" as const, fixturePath, outputDirPath },
    followUp: { storePath: followUpPath, now: () => NOW },
    reports: { reportsRootPath: reportsPath, now: NOW },
    now: () => NOW,
  };
}

function narrative(ctx: Awaited<ReturnType<typeof buildAIResearchContext>>) {
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
