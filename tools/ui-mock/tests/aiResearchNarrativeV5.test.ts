import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { after, describe, it } from "node:test";
import { buildAIResearchContext, sha256, stableJson, type AIResearchContext } from "../server/aiResearchContext.js";
import { buildAIAnalysisCacheIdentity, createAIAnalysisQueueStore, hashAIAnalysisRateScope } from "../server/aiResearchQueueStore.js";
import { hydrateAIResearchBrief } from "../server/aiResearchService.js";
import {
  AIResearchValidationError,
  auditAIResearchSemanticQuality,
  buildAIResearchProviderJsonSchema,
  parseAIResearchProviderNarrative,
} from "../server/aiResearchSchema.js";
import { PERSISTABLE_SCANNER_SAMPLE } from "../src/fixtures/persistableScannerSample.js";

const root = await mkdtemp(resolve(tmpdir(), "crypto-edge-ai-narrative-v5-"));
const fixturePath = resolve(root, "scanner.json");
const ADDRESS = "0x3333333333333333333333333333333333333333";
const NOW = new Date("2026-08-24T10:00:00.000Z");
const bad = JSON.parse(await readFile(resolve(import.meta.dirname, "fixtures", "aiResearchV5BadContent.invalid.json"), "utf8")) as BadFixture;
const correctedPl = JSON.parse(await readFile(resolve(import.meta.dirname, "fixtures", "aiResearchV5CorrectedPL.valid.json"), "utf8")) as CorrectedFixture;
const correctedEn = JSON.parse(await readFile(resolve(import.meta.dirname, "fixtures", "aiResearchV5CorrectedEN.valid.json"), "utf8")) as CorrectedFixture;

const scanner = structuredClone(PERSISTABLE_SCANNER_SAMPLE);
scanner.candidates[0]!.chain = "base";
scanner.candidates[0]!.contract_address = ADDRESS;
scanner.candidates[0]!.source_url = `https://dexscreener.com/base/${ADDRESS}`;
await writeFile(fixturePath, JSON.stringify(scanner), "utf8");
after(async () => { await rm(root, { recursive: true, force: true }); });

describe("AI v5 closed evidence-bound narrative contract", () => {
  it("keeps the provider schema within the supported strict Structured Outputs subset", async () => {
    const context = await stepThreeContext();
    const schema = buildAIResearchProviderJsonSchema(context);
    assert.equal(containsSchemaKeyword(schema, "uniqueItems"), false);
  });

  it("rejects the sanitized current bad result with bounded evidence-fidelity codes", async () => {
    const context = await stepThreeContext();
    const candidate = validNarrative(context);
    candidate.summary.en = bad.summary.en;
    candidate.summary.pl = bad.summary.pl;
    assert.throws(
      () => parseAIResearchProviderNarrative(JSON.stringify(candidate), context),
      (error) => error instanceof AIResearchValidationError
        && error.code === "SEMANTIC_MISMATCH"
        && error.violations.includes("CURRENT_STEP_BOUNDARY_VIOLATION")
        && error.violations.includes("UNSUPPORTED_ENTITY_OR_CAPABILITY")
        && error.violations.includes("FOREIGN_SCRIPT_CONTAMINATION")
        && error.violations.includes("INCOMPLETE_NARRATIVE"),
    );
  });

  it("accepts corrected PL and EN fixtures with the same closed evidence and action structure", async () => {
    const context = await stepThreeContext();
    const narrative = validNarrative(context);
    assert.doesNotThrow(() => parseAIResearchProviderNarrative(JSON.stringify(narrative), context));
    const pl = parseAIResearchProviderNarrative(JSON.stringify(narrative), context);
    const en = parseAIResearchProviderNarrative(JSON.stringify(narrative), context);
    assert.deepEqual(pl.action_narratives.map(({ id, support_ids }) => ({ id, support_ids })), en.action_narratives.map(({ id, support_ids }) => ({ id, support_ids })));
    assert.deepEqual(pl.fact_narratives.map(({ id, support_ids }) => ({ id, support_ids })), en.fact_narratives.map(({ id, support_ids }) => ({ id, support_ids })));
  });

  it("rejects a support reference, entity, number, instruction, later-stage action, foreign script, and truncation", async () => {
    const context = await stepThreeContext();
    const support = validNarrative(context);
    support.fact_narratives[0]!.support_ids = ["source:not-issued"];
    assertRejected(support, context, "UNSUPPORTED_SUPPORT_REFERENCE");

    const duplicateSupport = validNarrative(context);
    const supportId = duplicateSupport.fact_narratives[0]!.support_ids[0]!;
    duplicateSupport.fact_narratives[0]!.support_ids = [supportId, supportId];
    assertRejected(duplicateSupport, context, "UNSUPPORTED_SUPPORT_REFERENCE");

    const entity = validNarrative(context);
    entity.summary.en = "A new exchange partner changes the current research view.";
    assertRejected(entity, context, "UNSUPPORTED_ENTITY_OR_CAPABILITY");

    const number = validNarrative(context);
    number.summary.en = "The recorded evidence has 987654 unresolved checks.";
    assertRejected(number, context, "INVENTED_NUMBER");

    const instruction = validNarrative(context);
    instruction.summary.en = "Review the current security evidence now.";
    assertRejected(instruction, context, "INSTRUCTIONAL_NARRATIVE");

    const laterStage = validNarrative(context);
    laterStage.summary.en = "Inspect bytecode now before completing the current security review.";
    assertRejected(laterStage, context, "CURRENT_STEP_BOUNDARY_VIOLATION");

    const blockedFuture = validNarrative(context);
    blockedFuture.summary.en = "The on-chain stage remains blocked until the security review is complete.";
    assert.doesNotThrow(() => parseAIResearchProviderNarrative(JSON.stringify(blockedFuture), context));

    const foreign = validNarrative(context);
    foreign.summary.pl = "Ta luka wymaga sprawdzenia 新增.";
    assertRejected(foreign, context, "FOREIGN_SCRIPT_CONTAMINATION");

    const truncated = validNarrative(context);
    truncated.summary.en = "The recorded evidence requires";
    assertRejected(truncated, context, "INCOMPLETE_NARRATIVE");
  });

  it("keeps actions, targets, priorities, lifecycle, scorecard boundaries, sources and red flags server-owned", async () => {
    const context = await stepThreeContext();
    const narrative = parseAIResearchProviderNarrative(JSON.stringify(validNarrative(context)), context);
    const brief = hydrateAIResearchBrief(context, narrative, "gpt-5-mini", { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }, NOW, false);

    const reordered = structuredClone(brief);
    reordered.next_actions.reverse();
    assert.ok(auditAIResearchSemanticQuality(reordered, context).includes("ACTION_SKELETON_MISMATCH"));

    const targetChanged = structuredClone(brief);
    targetChanged.next_actions[0]!.target_reference = "#invented-target";
    assert.ok(auditAIResearchSemanticQuality(targetChanged, context).includes("ACTION_SKELETON_MISMATCH"));

    const priorityChanged = structuredClone(brief);
    priorityChanged.next_actions[0]!.priority = "tertiary";
    assert.ok(auditAIResearchSemanticQuality(priorityChanged, context).includes("ACTION_SKELETON_MISMATCH"));

    const lifecycleChanged = structuredClone(brief);
    lifecycleChanged.research_state = "ESTABLISHED_RESEARCH";
    assert.ok(auditAIResearchSemanticQuality(lifecycleChanged, context).includes("RESEARCH_STATE_MISMATCH"));

    const sourceAdded = structuredClone(brief);
    sourceAdded.source_references.push({ id: "new-source", source_type: "report", label: "New source", observed_at: null, completeness: "complete", url: null });
    assert.ok(auditAIResearchSemanticQuality(sourceAdded, context).includes("SOURCE_SKELETON_MISMATCH"));

    const redFlagRemoved = structuredClone(brief);
    redFlagRemoved.risk_factors[0]!.severity = "low";
    assert.ok(auditAIResearchSemanticQuality(redFlagRemoved, context).includes("RISK_SKELETON_MISMATCH"));
  });

  it("preserves an auditable v4 row but excludes it from v5 exact and last-known-good lookup", async () => {
    const context = await stepThreeContext();
    const store = await createAIAnalysisQueueStore({ databaseFilePath: resolve(root, "v4-audit-v5-lookup.sqlite") });
    const v4 = buildAIAnalysisCacheIdentity({
      ...context.identity,
      snapshot_fingerprint: context.snapshot_fingerprint,
      prompt_version: "ai_research_prompt_v4",
      narrative_contract_version: "ai_research_narrative_v3",
      model_id: "gpt-5-mini",
      analysis_schema_version: "ai_research_brief_v2",
      locale: "en",
    });
    const queued = store.enqueue({
      identity: v4,
      session_scope_hash: hashAIAnalysisRateScope("v4-audit"),
      now: NOW,
      rate_limits: { windowMs: 60_000, session: 5, identity: 5, global: 5, cooldownMs: 1_000 },
    });
    const claimed = store.claimNext({ worker_id: "v4-audit-worker", now: NOW, lease_ms: 60_000 });
    assert.equal(claimed?.analysis_id, queued.record?.analysis_id);
    const narrative = parseAIResearchProviderNarrative(JSON.stringify(validNarrative(context)), context);
    const current = hydrateAIResearchBrief(context, narrative, "gpt-5-mini", { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }, NOW, false, claimed!.analysis_id);
    const legacy = { ...current, prompt_version: "ai_research_prompt_v4" as const, output_hash: "0".repeat(64) };
    const storedLegacy = { ...legacy, output_hash: sha256(stableJson(legacy)) };
    store.complete({ analysis_id: claimed!.analysis_id, worker_id: "v4-audit-worker", brief: storedLegacy, validation_status: "VALID", latency_ms: 1, provider_response_id: null, now: NOW });
    assert.equal(store.findByAnalysisId(claimed!.analysis_id)?.result?.prompt_version, "ai_research_prompt_v4");

    const v5 = buildAIAnalysisCacheIdentity({
      ...context.identity,
      snapshot_fingerprint: context.snapshot_fingerprint,
      prompt_version: "ai_research_prompt_v5",
      narrative_contract_version: "ai_research_narrative_v4",
      model_id: "gpt-5-mini",
      analysis_schema_version: "ai_research_brief_v2",
      locale: "en",
    });
    assert.equal(store.lookup(v5).record, null);
    assert.equal(store.lookup(v5).last_known_good, null);
    assert.deepEqual(store.findRecentValidResults(v5), []);
    store.close();
  });
});

async function stepThreeContext(): Promise<AIResearchContext> {
  const context = await buildAIResearchContext("base", ADDRESS, "en", {
    scanner: { runtimeMode: "DEVELOPMENT_DEMO", fixturePath, outputDirPath: resolve(root, "missing-output") },
    followUp: { storePath: resolve(root, "missing-follow-up.json"), now: () => NOW },
    reports: { reportsRootPath: resolve(root, "missing-reports"), now: NOW },
    now: () => NOW,
  });
  context.narrative_contract.research_playbook = {
    current_step: 3,
    current_domain: "security",
    unresolved_controls: ["Honeypot", "TokenSniffer", "De.Fi Scanner"],
    blocked_domains: ["onchain", "social", "team", "docs", "narrative"],
  };
  return context;
}

function validNarrative(context: AIResearchContext) {
  const slot = (entry: { id: string; allowed_support_ids: string[] }, en: string, pl: string) => ({ id: entry.id, support_ids: [entry.allowed_support_ids[0]!], en, pl });
  return {
    narrative_version: "ai_research_narrative_v4" as const,
    summary: slot(context.narrative_contract.slots.summary, correctedEn.summary, correctedPl.summary),
    fact_narratives: context.narrative_contract.slots.facts.map((entry) => slot(entry, correctedEn.fact, correctedPl.fact)),
    risk_narratives: context.narrative_contract.slots.risks.map((entry) => slot(entry, correctedEn.risk, correctedPl.risk)),
    missing_narratives: context.narrative_contract.slots.missing_information.map((entry) => slot(entry, correctedEn.missing, correctedPl.missing)),
    action_narratives: context.narrative_contract.slots.actions.map((entry) => slot(entry, correctedEn.action, correctedPl.action)),
    status_change_narratives: context.narrative_contract.slots.status_change_conditions.map((entry) => slot(entry, correctedEn.condition, correctedPl.condition)),
  };
}

function assertRejected(value: ReturnType<typeof validNarrative>, context: AIResearchContext, violation: string): void {
  assert.throws(() => parseAIResearchProviderNarrative(JSON.stringify(value), context),
    (error) => error instanceof AIResearchValidationError && error.violations.includes(violation as never));
}

function containsSchemaKeyword(value: unknown, keyword: string): boolean {
  if (Array.isArray(value)) return value.some((item) => containsSchemaKeyword(item, keyword));
  if (typeof value !== "object" || value === null) return false;
  return Object.entries(value).some(([key, item]) => key === keyword || containsSchemaKeyword(item, keyword));
}

type BadFixture = { fixture_version: string; summary: { en: string; pl: string } };
type CorrectedFixture = { fixture_version: string; summary: string; fact: string; risk: string; missing: string; action: string; condition: string };
