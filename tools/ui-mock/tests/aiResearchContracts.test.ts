import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import type { IncomingMessage } from "node:http";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { Readable } from "node:stream";
import { after, describe, it } from "node:test";
import { buildAIResearchContext, type AIResearchContext } from "../server/aiResearchContext.js";
import { parseAIResearchQuery, readAIResearchGenerateRequest } from "../server/aiResearchApi.js";
import { buildAIAnalysisCacheIdentity } from "../server/aiResearchQueueStore.js";
import { AIResearchValidationError, parseAIResearchProviderNarrative } from "../server/aiResearchSchema.js";
import { buildDeterministicPreview } from "../server/aiResearchService.js";
import { PERSISTABLE_SCANNER_SAMPLE } from "../src/fixtures/persistableScannerSample.js";

const root = await mkdtemp(resolve(tmpdir(), "crypto-edge-ai-research-contracts-"));
const fixturePath = resolve(root, "scanner.json");
const outputDirPath = resolve(root, "missing-output");
const followUpPath = resolve(root, "missing-follow-up.json");
const reportsPath = resolve(root, "missing-reports");
const ADDRESS = "0x1111111111111111111111111111111111111111";
const OTHER_ADDRESS = "0x2222222222222222222222222222222222222222";
const NOW = new Date("2026-07-29T12:00:00.000Z");

await writeFixture(100_000);
after(async () => { await rm(root, { recursive: true, force: true }); });

describe("AI Research canonical identity, fingerprint and input boundary", () => {
  it("normalizes chain and address without accepting symbol or client-controlled analysis fields", async () => {
    const value = await context("BASE", ADDRESS.toUpperCase().replace("0X", "0x"), "pl");
    assert.deepEqual(value.identity, { chain: "base", contract_address: ADDRESS });
    assert.throws(
      () => parseAIResearchQuery(`/api/v1/ai-analyses/result?chain=base&contract_address=${ADDRESS}&locale=pl&symbol=FAKE`),
      /QUERY_INVALID/,
    );
    const accepted = await readAIResearchGenerateRequest(request({
      chain: "BASE",
      contract_address: ADDRESS.toUpperCase().replace("0X", "0x"),
      locale: "pl",
      idempotency_key: "research_request_0001",
    }));
    assert.deepEqual(accepted, { chain: "base", contract_address: ADDRESS, locale: "pl", idempotency_key: "research_request_0001" });
    for (const forbidden of ["prompt", "model", "snapshot_fingerprint", "lifecycle", "risk_severity", "sources", "owner_decision"]) {
      await assert.rejects(() => readAIResearchGenerateRequest(request({
        chain: "base",
        contract_address: ADDRESS,
        locale: "pl",
        idempotency_key: "research_request_0002",
        [forbidden]: "forbidden",
      })), /BODY_INVALID/);
    }
  });

  it("keeps view time and JSON key order out of the fingerprint while tracking analysis-affecting data", async () => {
    const first = await context("base", ADDRESS, "pl", new Date("2026-07-29T12:00:00.000Z"));
    const laterView = await context("base", ADDRESS, "pl", new Date("2026-07-29T16:00:00.000Z"));
    const english = await context("base", ADDRESS, "en", NOW);
    assert.equal(first.snapshot_fingerprint, laterView.snapshot_fingerprint);
    assert.equal(first.snapshot_fingerprint, english.snapshot_fingerprint);
    await writeFixture(200_000);
    const changed = await context("base", ADDRESS, "pl", NOW);
    assert.notEqual(changed.snapshot_fingerprint, first.snapshot_fingerprint);
    await writeFixture(100_000);
  });

  it("separates contract, fingerprint, prompt, model and schema in the cache key", () => {
    const base = cacheIdentity(ADDRESS, "a".repeat(64));
    assert.notEqual(cacheIdentity(OTHER_ADDRESS, "a".repeat(64)).cache_key, base.cache_key);
    assert.notEqual(cacheIdentity(ADDRESS, "b".repeat(64)).cache_key, base.cache_key);
    assert.notEqual(cacheIdentity(ADDRESS, "a".repeat(64), { prompt_version: "ai_research_prompt_v3" }).cache_key, base.cache_key);
    assert.notEqual(cacheIdentity(ADDRESS, "a".repeat(64), { model_id: "different-model" }).cache_key, base.cache_key);
    assert.notEqual(cacheIdentity(ADDRESS, "a".repeat(64), { analysis_schema_version: "ai_research_brief_v1" }).cache_key, base.cache_key);
  });
});

describe("AI Research v2 brief and v4 bilingual prompt contract", () => {
  it("accepts bounded narrative only and rejects skeleton changes, invented facts and unsafe advice", async () => {
    const value = await context("base", ADDRESS, "pl");
    const valid = narrative(value);
    assert.equal(parseAIResearchProviderNarrative(JSON.stringify(valid), value).narrative_version, "ai_research_narrative_v3");
    assert.throws(() => parseAIResearchProviderNarrative("not-json", value), (error) => error instanceof AIResearchValidationError && error.code === "INVALID_JSON");
    const advice = structuredClone(valid);
    advice.summary.pl = "Kup token teraz.";
    assert.throws(() => parseAIResearchProviderNarrative(JSON.stringify(advice), value), /FORBIDDEN_CONTENT/);
    const invented = structuredClone(valid);
    invented.summary.pl = "Wartość 999999 wymaga weryfikacji.";
    assert.throws(() => parseAIResearchProviderNarrative(JSON.stringify(invented), value), /UNKNOWN_FACT/);
    const reordered = structuredClone(valid);
    reordered.action_narratives.reverse();
    assert.throws(() => parseAIResearchProviderNarrative(JSON.stringify(reordered), value), /SKELETON_MISMATCH/);
  });

  it("keeps lifecycle, risk severity and owner decisions deterministic", async () => {
    const value = await context("base", ADDRESS, "pl");
    const brief = buildDeterministicPreview(value, NOW);
    assert.equal(brief.schema_version, "ai_research_brief_v2");
    assert.equal(brief.prompt_version, "ai_research_prompt_v4");
    assert.equal(brief.research_state, value.research_state);
    assert.deepEqual(brief.risk_factors.map(({ severity }) => severity), value.risk_candidates.map(({ severity }) => severity));
    assert.equal(brief.next_actions.some(({ action_type }) => action_type === "OWNER_REVIEW"), value.action_catalog.some(({ action_type }) => action_type === "OWNER_REVIEW"));
  });

  it("keeps provider credentials and calls outside browser and public request service", async () => {
    const [provider, worker, service, client] = await Promise.all([
      source("server/aiResearchProvider.ts"),
      source("server/aiResearchWorker.ts"),
      source("server/aiResearchService.ts"),
      source("src/services/aiResearchDataSource.ts"),
    ]);
    assert.match(provider, /OPENAI_API_KEY/);
    assert.match(worker, /createAIResearchProvider/);
    assert.doesNotMatch(service, /createAIResearchProvider|from "\.\/aiResearchProvider/);
    assert.doesNotMatch(client, /OPENAI_API_KEY|api\.openai\.com|createAIResearchProvider/);
    assert.match(client, /\/api\/v1\/ai-analyses\/result/);
    assert.match(client, /\/api\/v1\/ai-analyses\/requests/);
  });
});

function cacheIdentity(
  address: string,
  fingerprint: string,
  overrides: Partial<{ prompt_version: string; model_id: string; analysis_schema_version: string }> = {},
) {
  return buildAIAnalysisCacheIdentity({
    chain: "base",
    contract_address: address,
    snapshot_fingerprint: fingerprint,
    prompt_version: overrides.prompt_version ?? "ai_research_prompt_v4",
    model_id: overrides.model_id ?? "gpt-5-mini",
    analysis_schema_version: overrides.analysis_schema_version ?? "ai_research_brief_v2",
    locale: "pl",
  });
}

function context(chain: string, address: string, locale: "pl" | "en", now = NOW) {
  return buildAIResearchContext(chain, address, locale, { ...contextOptions(), now: () => now });
}

function contextOptions() {
  return {
    scanner: { runtimeMode: "DEVELOPMENT_DEMO" as const, fixturePath, outputDirPath },
    followUp: { storePath: followUpPath, now: () => NOW },
    reports: { reportsRootPath: reportsPath, now: NOW },
  };
}

function narrative(ctx: AIResearchContext) {
  return {
    narrative_version: "ai_research_narrative_v3" as const,
    summary: { en: "Recorded evidence identifies the current research focus and the next verification step.", pl: "Zapisane dane wskazują obecny cel analizy i kolejny krok weryfikacji." },
    fact_narratives: ctx.fact_candidates.map((fact) => ({ id: `fact:${fact.key}`, en: "This recorded fact adds context to the research view.", pl: "Ten zapisany fakt uzupełnia obecną analizę." })),
    risk_narratives: ctx.risk_candidates.map((_risk, index) => ({ id: `risk:${index}`, en: "This recorded risk needs verification against the listed evidence.", pl: "To zapisane ryzyko wymaga sprawdzenia względem wskazanych danych." })),
    missing_narratives: ctx.missing_information.map((item) => ({ id: `missing:${item.key}`, en: "This evidence gap limits the current research view.", pl: "Ta luka w danych ogranicza obecną analizę." })),
    action_narratives: ctx.action_catalog.map((_action, index) => ({ id: `action:${index}`, en: "Use this permitted research step to verify the evidence.", pl: "Wykorzystaj ten dozwolony krok analizy, aby sprawdzić dane." })),
    status_change_narratives: ctx.status_change_conditions.map((condition) => ({ id: `condition:${condition.key}`, en: "This condition would justify reviewing the research view.", pl: "Ten warunek uzasadnia ponowne sprawdzenie analizy." })),
  };
}

function request(value: unknown): IncomingMessage {
  const body = JSON.stringify(value);
  const stream = Readable.from([body]) as IncomingMessage;
  Object.assign(stream, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-length": String(Buffer.byteLength(body)),
      host: "127.0.0.1:5173",
      origin: "http://127.0.0.1:5173",
    },
  });
  return stream;
}

function source(path: string) {
  return readFile(resolve(import.meta.dirname, "..", path), "utf8");
}

async function writeFixture(liquidity: number) {
  const value = structuredClone(PERSISTABLE_SCANNER_SAMPLE);
  const candidate = value.candidates[0]!;
  candidate.chain = "base";
  candidate.contract_address = ADDRESS;
  candidate.source_url = `https://dexscreener.com/base/${ADDRESS}`;
  candidate.liquidity_usd = liquidity;
  candidate.address_identity_verified = true;
  await writeFile(fixturePath, JSON.stringify(value), "utf8");
}
