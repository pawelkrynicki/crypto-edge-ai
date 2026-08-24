import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { after, describe, it } from "node:test";
import { buildAIResearchContext, type AIResearchContext } from "../server/aiResearchContext.js";
import { buildAIAnalysisCacheIdentity } from "../server/aiResearchQueueStore.js";
import { hydrateAIResearchBrief } from "../server/aiResearchService.js";
import {
  AIResearchValidationError,
  auditAIResearchSemanticQuality,
  parseAIResearchProviderNarrativeWithDiagnostics,
} from "../server/aiResearchSchema.js";
import { PERSISTABLE_SCANNER_SAMPLE } from "../src/fixtures/persistableScannerSample.js";

const root = await mkdtemp(resolve(tmpdir(), "crypto-edge-ai-narrative-v7-"));
const fixturePath = resolve(root, "scanner.json");
const ADDRESS = "0x1111111111111111111111111111111111111111";
const NOW = new Date("2026-08-24T12:00:00.000Z");
const failedV6 = JSON.parse(await readFile(resolve(import.meta.dirname, "fixtures", "aiResearchV6SemanticFallback.invalid.json"), "utf8")) as { slot: string; en: string; pl: string };
const scanner = structuredClone(PERSISTABLE_SCANNER_SAMPLE);
scanner.candidates[0]!.chain = "base";
scanner.candidates[0]!.contract_address = ADDRESS;
scanner.candidates[0]!.source_url = `https://dexscreener.com/base/${ADDRESS}`;
scanner.candidates[0]!.address_identity_verified = true;
await writeFile(fixturePath, JSON.stringify(scanner), "utf8");
after(async () => { await rm(root, { recursive: true, force: true }); });

describe("AI v7 slot composition policy", () => {
  it("accepts valid declarative Polish and English narrative slots without fallback", async () => {
    const context = await researchContext();
    const parsed = parseAIResearchProviderNarrativeWithDiagnostics(JSON.stringify(validNarrative(context)), context);
    assert.equal(parsed.accepted_provider_slot_count, issuedSlotCount(context));
    assert.equal(parsed.slot_fallbacks.length, 0);
    assert.equal(parsed.full_deterministic_fallback, false);
    assertSafe(context, parsed.narrative);
  });

  it("uses the sanitized failed v6 regression fixture as a slot fallback, not a complete-result failure", async () => {
    const context = await researchContext();
    const value = validNarrative(context);
    value.summary = { ...value.summary, en: failedV6.en, pl: failedV6.pl };
    const parsed = parseAIResearchProviderNarrativeWithDiagnostics(JSON.stringify(value), context);
    assert.deepEqual(parsed.slot_fallbacks.map(({ slot_id }) => slot_id), [failedV6.slot]);
    assert.ok(parsed.slot_fallbacks[0]!.violations.includes("UNKNOWN_FACT"));
    assert.ok(parsed.slot_fallbacks[0]!.violations.includes("INVENTED_NUMBER"));
    assert.ok(parsed.slot_fallbacks[0]!.violations.includes("MACHINE_VALUE_IN_NARRATIVE"));
    assert.doesNotMatch(parsed.narrative.summary.en, /999999|READY|lifecycle|new/u);
    assert.doesNotMatch(parsed.narrative.summary.pl, /999999|lifecycle|new/u);
    assertSafe(context, parsed.narrative);
  });

  it("preserves safe slots while replacing invented numbers, machine values, and out-of-scope entities", async () => {
    const context = await researchContext();
    const value = validNarrative(context);
    const untouched = value.fact_narratives[1]!.en;
    value.fact_narratives[0]!.en = "The recorded amount is 999999.";
    value.risk_narratives[0]!.pl = "Stan lifecycle follow_up pozostaje niepełny.";
    value.missing_narratives[0]!.en = "Bytecode investigation is required before the current security context.";
    const parsed = parseAIResearchProviderNarrativeWithDiagnostics(JSON.stringify(value), context);
    assert.deepEqual(parsed.slot_fallbacks.map(({ slot_id }) => slot_id), [
      value.fact_narratives[0]!.id,
      value.risk_narratives[0]!.id,
      value.missing_narratives[0]!.id,
    ]);
    assert.equal(parsed.narrative.fact_narratives[1]!.en, untouched);
    assertSafe(context, parsed.narrative);
  });

  it("replaces instructions, foreign script, truncation, and language mismatch slot by slot", async () => {
    const context = await researchContext();
    const value = validNarrative(context);
    value.summary.en = "Review the evidence now.";
    value.fact_narratives[0]!.pl = "Ta analiza obejmuje 新增.";
    value.risk_narratives[0]!.en = "The recorded evidence remains";
    value.missing_narratives[0]!.en = "Dane pozostają niepełne.";
    const parsed = parseAIResearchProviderNarrativeWithDiagnostics(JSON.stringify(value), context);
    assert.equal(parsed.slot_fallbacks.length, 4);
    assertSafe(context, parsed.narrative);
  });

  it("allows full deterministic fallback when every structurally valid provider slot is unsafe", async () => {
    const context = await researchContext();
    const value = validNarrative(context);
    for (const binding of allBindings(value)) {
      binding.en = "Review the evidence now.";
      binding.pl = "Sprawdź dane teraz.";
    }
    const parsed = parseAIResearchProviderNarrativeWithDiagnostics(JSON.stringify(value), context);
    assert.equal(parsed.accepted_provider_slot_count, 0);
    assert.equal(parsed.slot_fallbacks.length, issuedSlotCount(context));
    assert.equal(parsed.full_deterministic_fallback, true);
    assertSafe(context, parsed.narrative);
  });

  it("keeps unknown slots and invalid response structure hard failures", async () => {
    const context = await researchContext();
    const unknown = validNarrative(context);
    unknown.fact_narratives[0]!.id = "fact:unknown";
    assert.throws(() => parseAIResearchProviderNarrativeWithDiagnostics(JSON.stringify(unknown), context),
      (error) => error instanceof AIResearchValidationError && error.code === "SKELETON_MISMATCH");
    assert.throws(() => parseAIResearchProviderNarrativeWithDiagnostics("{not-json", context),
      (error) => error instanceof AIResearchValidationError && error.code === "INVALID_JSON");
  });

  it("keeps v6 cache records incompatible with the v7 composition identity", async () => {
    const context = await researchContext();
    const v6 = buildAIAnalysisCacheIdentity({
      ...context.identity, snapshot_fingerprint: context.snapshot_fingerprint, locale: "en", model_id: "gpt-5-mini",
      prompt_version: "ai_research_prompt_v6", narrative_contract_version: "ai_research_narrative_v5",
      semantic_policy_version: "ai_research_semantic_policy_v2", composition_policy_version: "legacy", provider_wire_schema_version: "ai_research_wire_schema_v3",
    });
    const v7 = buildAIAnalysisCacheIdentity({ ...context.identity, snapshot_fingerprint: context.snapshot_fingerprint, locale: "en", model_id: "gpt-5-mini" });
    assert.notEqual(v6.cache_key, v7.cache_key);
  });
});

async function researchContext(): Promise<AIResearchContext> {
  return buildAIResearchContext("base", ADDRESS, "en", {
    scanner: { runtimeMode: "DEVELOPMENT_DEMO", fixturePath, outputDirPath: resolve(root, "missing-output") },
    followUp: { storePath: resolve(root, "missing-follow-up.json"), now: () => NOW },
    reports: { reportsRootPath: resolve(root, "missing-reports"), now: NOW }, now: () => NOW,
  });
}

function validNarrative(context: AIResearchContext) {
  const slot = (entry: { id: string; allowed_support_ids: string[] }, en: string, pl: string) => ({ id: entry.id, support_ids: [entry.allowed_support_ids[0]!], en, pl });
  return {
    narrative_version: "ai_research_narrative_v6" as const,
    summary: slot(context.narrative_contract.slots.summary, "Recorded evidence describes the current research context without a final conclusion.", "Zapisane dane opisują obecny kontekst analizy bez ostatecznego wniosku."),
    fact_narratives: context.narrative_contract.slots.facts.map((entry) => slot(entry, "This recorded fact adds context to the evidence view.", "Ten zapisany fakt uzupełnia kontekst danych.")),
    risk_narratives: context.narrative_contract.slots.risks.map((entry) => slot(entry, "This recorded risk remains unresolved in the evidence view.", "To zapisane ryzyko pozostaje nierozstrzygnięte w kontekście danych.")),
    missing_narratives: context.narrative_contract.slots.missing_information.map((entry) => slot(entry, "This evidence gap limits the current research context.", "Ta luka w danych ogranicza obecny kontekst analizy.")),
  };
}

function allBindings(value: ReturnType<typeof validNarrative>) {
  return [value.summary, ...value.fact_narratives, ...value.risk_narratives, ...value.missing_narratives];
}

function issuedSlotCount(context: AIResearchContext) {
  return 1 + context.narrative_contract.slots.facts.length + context.narrative_contract.slots.risks.length + context.narrative_contract.slots.missing_information.length;
}

function assertSafe(context: AIResearchContext, narrative: ReturnType<typeof validNarrative>) {
  const brief = hydrateAIResearchBrief(context, narrative, "gpt-5-mini", { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }, NOW, false);
  assert.deepEqual(auditAIResearchSemanticQuality(brief, context), []);
}
