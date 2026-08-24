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
import {
  buildAIResearchProviderWireSchema,
  validateAIResearchProviderWireSchema,
} from "../server/aiResearchProviderWireSchema.js";
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
    await assert.rejects(provider.generate(context), (error: unknown) => error instanceof AIResearchProviderError
      && error.code === "PROVIDER_TIMEOUT"
      && error.response_metadata.http_status === null
      && error.response_metadata.response_received === false
      && error.response_metadata.failure_phase === "NETWORK");
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
    assert.deepEqual(result.response_metadata, {
      response_status: "completed", incomplete_reason: null, output_tokens: 50, reasoning_tokens: 12, max_output_tokens: 8_000,
      http_status: 200, provider_error_type: null, provider_error_code: null, provider_error_param: null,
      response_received: true, failure_phase: "STRUCTURED_OUTPUT", request_id: "mock_request_id",
      transport_stage: null, request_body_status: "SENT", ip_family: null, proxy_active: false,
    });
    assert.equal(result.request_id, "mock_request_id");
  });

  it("rejects an incomplete response before its partial output can be treated as completed JSON", async () => {
    const context = await buildAIResearchContext("base", ADDRESS, "pl", contextOptions());
    const provider = createAIResearchProvider({
      config: openAiConfig(),
      fetch: async () => new Response(JSON.stringify({
        status: "incomplete",
        incomplete_details: { reason: "max_output_tokens" },
        output: [{ type: "message", content: [{ type: "output_text", text: "{\"narrative_version\": \"ai_research_narrative_v4\"" }] }],
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

  it("captures bounded diagnostics for HTTP request failures without retrying", async () => {
    const context = await buildAIResearchContext("base", ADDRESS, "pl", contextOptions());
    const cases = [
      { status: 400, code: "invalid_json_schema", param: "text.format.schema", expected: "PROVIDER_REQUEST_REJECTED" },
      { status: 401, code: "invalid_api_key", param: null, expected: "PROVIDER_AUTHENTICATION" },
      { status: 429, code: "rate_limit_exceeded", param: null, expected: "PROVIDER_RATE_LIMITED" },
      { status: 500, code: "server_error", param: null, expected: "PROVIDER_UNAVAILABLE" },
    ] as const;
    for (const testCase of cases) {
      let calls = 0;
      const provider = createAIResearchProvider({
        config: openAiConfig(),
        fetch: async () => {
          calls += 1;
          return new Response(JSON.stringify({ error: {
            message: "bounded local fixture",
            type: "invalid_request_error",
            code: testCase.code,
            param: testCase.param,
          } }), {
            status: testCase.status,
            headers: { "content-type": "application/json", "x-request-id": `request_${testCase.status}` },
          });
        },
      });
      await assert.rejects(provider.generate(context), (error: unknown) => {
        assert.ok(error instanceof AIResearchProviderError);
        assert.equal(error.code, testCase.expected);
        assert.equal(error.response_metadata.http_status, testCase.status);
        assert.equal(error.response_metadata.provider_error_code, testCase.code);
        assert.equal(error.response_metadata.provider_error_param, testCase.param);
        assert.equal(error.response_metadata.response_received, true);
        assert.equal(error.response_metadata.failure_phase, "REQUEST_REJECTED");
        assert.equal(error.response_metadata.request_id, `request_${testCase.status}`);
        assert.doesNotMatch(JSON.stringify(error.response_metadata), /bounded local fixture/i);
        return true;
      });
      assert.equal(calls, 1);
    }
  });

  it("classifies a network failure without a response and never re-enters the SDK", async () => {
    const context = await buildAIResearchContext("base", ADDRESS, "pl", contextOptions());
    let calls = 0;
    const provider = createAIResearchProvider({
      config: openAiConfig(),
      fetch: async () => { calls += 1; throw new TypeError("offline test transport"); },
    });
    await assert.rejects(provider.generate(context), (error: unknown) => error instanceof AIResearchProviderError
      && error.code === "PROVIDER_NETWORK"
      && error.response_metadata.http_status === null
      && error.response_metadata.response_received === false
      && error.response_metadata.failure_phase === "NETWORK");
    assert.equal(calls, 1);
  });

  it("retains bounded transport stages without a retry or secret-bearing diagnostics", async () => {
    const context = await buildAIResearchContext("base", ADDRESS, "pl", contextOptions());
    const cases = [
      ["ENOTFOUND", "DNS", "NOT_SENT"],
      ["ECONNREFUSED", "TCP", "NOT_SENT"],
      ["ECONNRESET", "CONNECTION_RESET", "UNKNOWN"],
      ["CERT_HAS_EXPIRED", "TLS", "NOT_SENT"],
      ["ERR_PROXY_CONNECTION_FAILED", "PROXY", "NOT_SENT"],
      ["ETIMEDOUT", "CONNECT_TIMEOUT", "NOT_SENT"],
    ] as const;
    for (const [code, stage, bodyStatus] of cases) {
      let calls = 0;
      const provider = createAIResearchProvider({
        config: openAiConfig(),
        fetch: async () => {
          calls += 1;
          const error = Object.assign(new TypeError("secret-test-value must not persist"), { code, family: 4 });
          throw error;
        },
      });
      await assert.rejects(provider.generate(context), (error: unknown) => {
        assert.ok(error instanceof AIResearchProviderError);
        assert.equal(error.code, "PROVIDER_NETWORK");
        assert.equal(error.response_metadata.transport_stage, stage);
        assert.equal(error.response_metadata.request_body_status, bodyStatus);
        assert.equal(error.response_metadata.ip_family, "IPV4");
        assert.doesNotMatch(JSON.stringify(error.response_metadata), /secret-test-value/i);
        return true;
      });
      assert.equal(calls, 1);
    }
  });

  it("distinguishes a response timeout and an HTTP response without a readable body", async () => {
    const context = await buildAIResearchContext("base", ADDRESS, "pl", contextOptions());
    const timeoutProvider = createAIResearchProvider({
      config: openAiConfig(),
      fetch: async () => {
        const error = new Error("deadline");
        error.name = "APIConnectionTimeoutError";
        throw error;
      },
    });
    await assert.rejects(timeoutProvider.generate(context), (error: unknown) => error instanceof AIResearchProviderError
      && error.code === "PROVIDER_TIMEOUT"
      && error.response_metadata.transport_stage === "RESPONSE_TIMEOUT"
      && error.response_metadata.request_body_status === "UNKNOWN");
    const emptyBodyProvider = createAIResearchProvider({
      config: openAiConfig(),
      fetch: async () => new Response(null, { status: 502, headers: { "x-request-id": "headers_only" } }),
    });
    await assert.rejects(emptyBodyProvider.generate(context), (error: unknown) => error instanceof AIResearchProviderError
      && error.code === "PROVIDER_UNAVAILABLE"
      && error.response_metadata.response_received === true
      && error.response_metadata.request_body_status === "SENT"
      && error.response_metadata.request_id === "headers_only");
  });

  it("records a refusal as a bounded structured-output failure", async () => {
    const context = await buildAIResearchContext("base", ADDRESS, "pl", contextOptions());
    const provider = createAIResearchProvider({
      config: openAiConfig(),
      fetch: async () => new Response(JSON.stringify({
        status: "completed",
        output: [{ type: "message", content: [{ type: "refusal", refusal: "fixture refusal text" }] }],
      }), { status: 200, headers: { "content-type": "application/json", "x-request-id": "refusal_fixture" } }),
    });
    await assert.rejects(provider.generate(context), (error: unknown) => error instanceof AIResearchProviderError
      && error.code === "INVALID_PROVIDER_RESPONSE"
      && error.response_metadata.http_status === 200
      && error.response_metadata.response_received === true
      && error.response_metadata.failure_phase === "STRUCTURED_OUTPUT"
      && error.response_metadata.request_id === "refusal_fixture");
  });

  it("captures the exact serialized SDK wire schema and fails closed on incompatible fixtures", async () => {
    const context = await buildAIResearchContext("base", ADDRESS, "pl", contextOptions());
    const current = buildAIResearchProviderWireSchema(context);
    assert.equal(current.audit.root_type, "object");
    assert.equal(current.audit.required_fields_valid, true);
    assert.equal(current.audit.additional_properties_valid, true);
    assert.ok(current.audit.required_field_checks.length > 0);
    assert.ok(current.audit.additional_properties_checks.length > 0);
    assert.doesNotMatch(JSON.stringify(current.schema), /uniqueItems/);
    assert.deepEqual(validateAIResearchProviderWireSchema(current.schema), current.audit);

    const incompatible = (mutate: (schema: Record<string, unknown>) => void, code: string) => {
      const fixture = structuredClone(current.schema);
      mutate(fixture);
      assert.throws(() => validateAIResearchProviderWireSchema(fixture), (error: unknown) => error instanceof Error && error.message === code);
    };
    incompatible((schema) => { schema.x_custom = true; }, "WIRE_SCHEMA_UNSUPPORTED_KEYWORD");
    incompatible((schema) => {
      const summary = (schema.properties as Record<string, Record<string, unknown>>).summary!;
      const supportIds = (summary.properties as Record<string, Record<string, unknown>>).support_ids!;
      supportIds.uniqueItems = true;
    }, "WIRE_SCHEMA_UNSUPPORTED_KEYWORD");
    incompatible((schema) => { (schema.required as string[]).pop(); }, "WIRE_SCHEMA_MISSING_REQUIRED");
    incompatible((schema) => { delete schema.additionalProperties; }, "WIRE_SCHEMA_ADDITIONAL_PROPERTIES");
    incompatible((schema) => { schema.anyOf = [{ type: "object" }, { type: "object" }]; }, "WIRE_SCHEMA_ROOT_ANY_OF");
    incompatible((schema) => { (schema.properties as Record<string, unknown>).summary = { $ref: "#/$defs/missing" }; }, "WIRE_SCHEMA_BROKEN_REF");

    let serializedSchema: unknown = null;
    const provider = createAIResearchProvider({
      config: openAiConfig(),
      fetch: async (_input, init) => {
        serializedSchema = JSON.parse(String(init?.body)).text.format.schema;
        return new Response(JSON.stringify({
          status: "completed",
          output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(narrative(context)) }] }],
          usage: { input_tokens: 1, output_tokens: 1 },
        }), { status: 200, headers: { "content-type": "application/json" } });
      },
    });
    await provider.generate(context);
    assert.deepEqual(serializedSchema, current.schema);
    assert.equal(validateAIResearchProviderWireSchema(serializedSchema).required_fields_valid, true);
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
    assert.doesNotMatch(service, /createAIResearchProvider|from "\.\/aiResearchProvider\.js"/);
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
  const slot = (entry: { id: string; allowed_support_ids: string[] }, en: string, pl: string) => ({ id: entry.id, support_ids: [entry.allowed_support_ids[0]!], en, pl });
  return {
    narrative_version: "ai_research_narrative_v6",
    summary: slot(ctx.narrative_contract.slots.summary, "The recorded snapshot gives market context while evidence gaps remain in the current evidence set.", "Zapisana migawka daje kontekst rynkowy, a luki pozostają w obecnym zestawie danych."),
    fact_narratives: ctx.narrative_contract.slots.facts.map((entry) => slot(entry, "This recorded fact adds context to the research view.", "Ten zapisany fakt uzupełnia obecną analizę.")),
    risk_narratives: ctx.narrative_contract.slots.risks.map((entry) => slot(entry, "This recorded risk remains part of the listed evidence context.", "To zapisane ryzyko pozostaje częścią wskazanego kontekstu danych.")),
    missing_narratives: ctx.narrative_contract.slots.missing_information.map((entry) => slot(entry, "This evidence gap limits the current research view.", "Ta luka w danych ogranicza obecną analizę.")),
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
