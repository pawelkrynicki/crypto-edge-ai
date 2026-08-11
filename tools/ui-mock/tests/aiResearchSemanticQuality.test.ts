import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { after, describe, it } from "node:test";
import {
  AI_RESEARCH_CAPABILITY_REGISTRY,
  getAIResearchCapability,
  isCapabilitySourceSupported,
} from "../server/aiResearchCapabilities.js";
import { buildAIResearchContext, type AIResearchContext } from "../server/aiResearchContext.js";
import {
  AIResearchValidationError,
  auditAIResearchSemanticQuality,
  parseAIResearchProviderNarrative,
} from "../server/aiResearchSchema.js";
import { PERSISTABLE_SCANNER_SAMPLE } from "../src/fixtures/persistableScannerSample.js";

const root = await mkdtemp(resolve(tmpdir(), "crypto-edge-ai-semantic-quality-"));
const fixturePath = resolve(root, "scanner.json");
const ADDRESS = "0x1111111111111111111111111111111111111111";
const NOW = new Date("2026-07-27T09:00:00.000Z");
const captured = JSON.parse(await readFile(resolve(import.meta.dirname, "fixtures", "aiResearchCapturedLiveV1.invalid.json"), "utf8")) as CapturedFixture;
const corrected = JSON.parse(await readFile(resolve(import.meta.dirname, "fixtures", "aiResearchCorrectedV2.valid.json"), "utf8")) as CorrectedFixture;

const scanner = structuredClone(PERSISTABLE_SCANNER_SAMPLE);
const candidate = scanner.candidates[0]!;
candidate.chain = "base";
candidate.contract_address = ADDRESS;
candidate.source_url = `https://dexscreener.com/base/${ADDRESS}`;
candidate.address_identity_verified = false;
await writeFile(fixturePath, JSON.stringify(scanner), "utf8");
after(async () => { await rm(root, { recursive: true, force: true }); });

describe("AI.2C capability registry", () => {
  it("allows only supported missing areas with their dedicated source references", async () => {
    assert.deepEqual(Object.keys(AI_RESEARCH_CAPABILITY_REGISTRY), [
      "security", "history", "next_checkpoint", "fresh_data", "source_verification",
    ]);
    assert.equal(getAIResearchCapability("holder_concentration"), null);
    const context = await researchContext("pl");
    assert.equal(context.missing_information.some(({ key }) => key === "holder_concentration"), false);
    for (const item of context.missing_information) {
      assert.ok(getAIResearchCapability(item.key));
      assert.equal(isCapabilitySourceSupported(item, context.source_references), true);
    }
    assert.equal(isCapabilitySourceSupported({ key: "history", source_reference_ids: ["security_status"] }, context.source_references), false);
  });
});

describe("AI.2C captured live-response regression", () => {
  it("rejects the anonymized v1 result for all confirmed semantic defects", async () => {
    const context = await researchContext("pl");
    const legacy = semanticCandidate(context, captured);
    const violations = auditAIResearchSemanticQuality(legacy, context);
    for (const expected of [
      "UNSUPPORTED_MISSING_CAPABILITY",
      "MISSING_SOURCE_MISMATCH",
      "RAW_ENUM_IN_NARRATIVE",
      "MACHINE_VALUE_IN_NARRATIVE",
      "ACTION_SKELETON_MISMATCH",
    ] as const) assert.ok(violations.includes(expected), `${expected} missing from ${violations.join(",")}`);
    assert.throws(
      () => parseAIResearchProviderNarrative(JSON.stringify(legacy), context),
      (error) => error instanceof AIResearchValidationError && error.code === "SCHEMA_MISMATCH",
    );
  });

  it("accepts the corrected fixture through the same semantic quality audit", async () => {
    const context = await researchContext("pl");
    assert.deepEqual(auditAIResearchSemanticQuality(semanticCandidate(context, corrected), context), []);
  });
});

describe("AI.2C deterministic actions and PL/EN narrative boundary", () => {
  it("keeps fresh data first, source verification second and external sources tertiary", async () => {
    const staleScanner = structuredClone(scanner);
    staleScanner.candidates[0]!.basic_filter_status = "rejected_basic_filter";
    const staleOutput = resolve(root, "stale-output", "scan_20260623073520");
    await mkdir(staleOutput, { recursive: true });
    await writeFile(resolve(staleOutput, "full_output.json"), JSON.stringify(staleScanner), "utf8");
    const context = await buildAIResearchContext("base", ADDRESS, "pl", {
      scanner: { runtimeMode: "DEVELOPMENT_DEMO", outputDirPath: resolve(root, "stale-output"), fixturePath },
      followUp: { storePath: resolve(root, "missing-follow-up.json"), now: () => NOW },
      reports: { reportsRootPath: resolve(root, "missing-reports"), now: NOW },
      now: () => NOW,
    });
    assert.equal(context.research_state, "DATA_STALE");
    assert.equal(context.fact_candidates.find(({ key }) => key === "basic_filters")?.value, "rejected_basic_filter");
    assert.deepEqual(context.action_catalog.slice(0, 2).map(({ action_type, priority }) => ({ action_type, priority })), [
      { action_type: "WAIT_FOR_CHECKPOINT", priority: "primary" },
      { action_type: "OPEN_VERIFICATION", priority: "secondary" },
    ]);
    assert.ok(context.action_catalog.filter(({ target_type }) => target_type === "external_url").every(({ priority }) => priority === "tertiary"));
  });

  it("accepts natural PL/EN narrative and rejects raw enums, machine values and mixed language", async () => {
    const pl = await researchContext("pl");
    const en = await researchContext("en");
    assert.equal(parseAIResearchProviderNarrative(JSON.stringify(providerNarrative(pl)), pl).narrative_version, "ai_research_narrative_v3");
    assert.equal(parseAIResearchProviderNarrative(JSON.stringify(providerNarrative(en)), en).narrative_version, "ai_research_narrative_v3");

    const rawEnum = providerNarrative(pl);
    rawEnum.summary.pl = "Stan DATA_STALE wymaga sprawdzenia.";
    assert.throws(() => parseAIResearchProviderNarrative(JSON.stringify(rawEnum), pl), /RAW_MACHINE_VALUE/);
    const machineValue = providerNarrative(pl);
    machineValue.fact_narratives[0]!.pl = "Etap lifecycle ma wartość new.";
    assert.throws(() => parseAIResearchProviderNarrative(JSON.stringify(machineValue), pl), /RAW_MACHINE_VALUE/);
    const mixed = providerNarrative(en);
    mixed.summary.en = "Dane wymagają świeżej migawki.";
    assert.throws(() => parseAIResearchProviderNarrative(JSON.stringify(mixed), en), /LANGUAGE_MISMATCH/);
  });
});

function researchContext(locale: "pl" | "en") {
  return buildAIResearchContext("base", ADDRESS, locale, {
    scanner: { runtimeMode: "DEVELOPMENT_DEMO", fixturePath, outputDirPath: resolve(root, "missing-output") },
    followUp: { storePath: resolve(root, "missing-follow-up.json"), now: () => NOW },
    reports: { reportsRootPath: resolve(root, "missing-reports"), now: NOW },
    now: () => NOW,
  });
}

function semanticCandidate(context: AIResearchContext, fixture: CapturedFixture | CorrectedFixture) {
  const capturedFixture = "unsupported_missing" in fixture ? fixture : null;
  const actions = context.action_catalog.map((action) => ({
    ...action,
    reason: bilingual(
      "Use this permitted research step to verify the evidence.",
      "action_reason" in fixture ? fixture.action_reason : "Wykorzystaj ten dozwolony krok analizy, aby sprawdzić dane.",
    ),
  }));
  if (capturedFixture) {
    const index = actions.findIndex(({ action_type }) => action_type === capturedFixture.primary_action_type);
    if (index >= 0) {
      const [verification] = actions.splice(index, 1);
      actions.unshift({ ...verification!, priority: "primary" });
      if (actions[1]) actions[1] = { ...actions[1], priority: "secondary" };
    }
  }
  return {
    schema_version: "ai_research_brief_v2",
    research_state: context.research_state,
    summary: bilingual("Recorded evidence requires a focused follow-up review.", fixture.summary),
    known_facts: context.fact_candidates.map((fact) => ({
      ...fact,
      interpretation: bilingual(
        "This recorded fact adds context to the research view.",
        fixture.fact_interpretations[fact.key] ?? "Ten zapisany fakt uzupełnia obecną analizę.",
      ),
    })),
    risk_factors: context.risk_candidates.map((risk) => ({
      ...risk,
      explanation: bilingual("This recorded risk needs verification against the listed evidence.", "risk_explanation" in fixture ? fixture.risk_explanation : "To zapisane ryzyko wymaga sprawdzenia względem wskazanych danych."),
    })),
    missing_information: [
      ...context.missing_information.map((item) => ({
        ...item,
        explanation: bilingual("This evidence gap limits the current research view.", "missing_explanation" in fixture ? fixture.missing_explanation : "Ta luka w danych ogranicza obecną analizę."),
      })),
      ...(capturedFixture ? [{ ...capturedFixture.unsupported_missing, explanation: bilingual("This unsupported gap was returned.", capturedFixture.unsupported_missing.explanation) }] : []),
    ],
    next_actions: actions,
    status_change_conditions: context.status_change_conditions.map((condition) => ({
      ...condition,
      explanation: bilingual("This condition would justify reviewing the research view.", "condition_explanation" in fixture ? fixture.condition_explanation : "Ten warunek uzasadnia ponowne sprawdzenie analizy."),
    })),
  };
}

function providerNarrative(context: AIResearchContext) {
  return {
    narrative_version: "ai_research_narrative_v3" as const,
    summary: bilingual("The recorded data needs further review before the next research step.", "Zapisane dane wymagają dalszego sprawdzenia przed kolejnym krokiem analizy."),
    fact_narratives: context.fact_candidates.map((fact) => ({
      id: `fact:${fact.key}`,
      ...bilingual("This recorded fact adds context to the research view.", "Ten zapisany fakt uzupełnia obecną analizę."),
    })),
    risk_narratives: context.risk_candidates.map((_risk, index) => ({
      id: `risk:${index}`,
      ...bilingual("This recorded risk needs verification against the listed evidence.", "To zapisane ryzyko wymaga sprawdzenia względem wskazanych danych."),
    })),
    missing_narratives: context.missing_information.map((item) => ({
      id: `missing:${item.key}`,
      ...bilingual("This evidence gap limits the current research view.", "Ta luka w danych ogranicza obecną analizę."),
    })),
    action_narratives: context.action_catalog.map((_action, index) => ({
      id: `action:${index}`,
      ...bilingual("Use this permitted research step to verify the evidence.", "Wykorzystaj ten dozwolony krok analizy, aby sprawdzić dane."),
    })),
    status_change_narratives: context.status_change_conditions.map((condition) => ({
      id: `condition:${condition.key}`,
      ...bilingual("This condition would justify reviewing the research view.", "Ten warunek uzasadnia ponowne sprawdzenie analizy."),
    })),
  };
}

function bilingual(en: string, pl: string) {
  return { en, pl };
}

type CapturedFixture = {
  fixture_version: string;
  summary: string;
  fact_interpretations: Record<string, string>;
  unsupported_missing: {
    key: string;
    label: string;
    explanation: string;
    source_reference_ids: string[];
  };
  primary_action_type: string;
};

type CorrectedFixture = {
  fixture_version: string;
  summary: string;
  fact_interpretations: Record<string, string>;
  risk_explanation: string;
  missing_explanation: string;
  action_reason: string;
  condition_explanation: string;
};
