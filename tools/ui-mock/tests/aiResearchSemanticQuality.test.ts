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
    assert.equal(parseAIResearchProviderNarrative(JSON.stringify(providerNarrative(pl)), pl).narrative_version, "ai_research_narrative_v2");
    assert.equal(parseAIResearchProviderNarrative(JSON.stringify(providerNarrative(en)), en).narrative_version, "ai_research_narrative_v2");

    const rawEnum = providerNarrative(pl);
    rawEnum.summary = "Stan DATA_STALE wymaga sprawdzenia.";
    assert.throws(() => parseAIResearchProviderNarrative(JSON.stringify(rawEnum), pl), /RAW_MACHINE_VALUE/);
    const machineValue = providerNarrative(pl);
    machineValue.fact_narratives[0]!.interpretation = "Etap lifecycle ma wartość new.";
    assert.throws(() => parseAIResearchProviderNarrative(JSON.stringify(machineValue), pl), /RAW_MACHINE_VALUE/);
    const mixed = providerNarrative(en);
    mixed.summary = "Dane wymagają świeżej migawki.";
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
    reason: "action_reason" in fixture ? fixture.action_reason : action.reason,
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
    schema_version: "ai_research_brief_v1",
    research_state: context.research_state,
    summary: fixture.summary,
    known_facts: context.fact_candidates.map((fact) => ({
      ...fact,
      interpretation: fixture.fact_interpretations[fact.key]
        ?? (context.locale === "pl" ? "Wartość pochodzi z danych produktu." : "The value comes from product data."),
    })),
    risk_factors: context.risk_candidates.map((risk) => ({
      ...risk,
      explanation: "risk_explanation" in fixture ? fixture.risk_explanation : risk.explanation,
    })),
    missing_information: [
      ...context.missing_information.map((item) => ({
        ...item,
        explanation: "missing_explanation" in fixture ? fixture.missing_explanation : item.explanation,
      })),
      ...(capturedFixture ? [capturedFixture.unsupported_missing] : []),
    ],
    next_actions: actions,
    status_change_conditions: context.status_change_conditions.map((condition) => ({
      ...condition,
      explanation: "condition_explanation" in fixture ? fixture.condition_explanation : condition.explanation,
    })),
  };
}

function providerNarrative(context: AIResearchContext) {
  const pl = context.locale === "pl";
  return {
    narrative_version: "ai_research_narrative_v2" as const,
    summary: pl
      ? "Dane wymagają dalszego sprawdzenia. Kolejny krok wynika ze stanu produktu."
      : "The data needs further review. The next step follows from the product state.",
    fact_narratives: context.fact_candidates.map((fact) => ({
      id: `fact:${fact.key}`,
      interpretation: pl ? "Wartość pochodzi z danych produktu." : "The value comes from product data.",
    })),
    risk_narratives: context.risk_candidates.map((_risk, index) => ({
      id: `risk:${index}`,
      explanation: pl ? "Stan wymaga dalszego sprawdzenia." : "The state needs further review.",
    })),
    missing_narratives: context.missing_information.map((item) => ({
      id: `missing:${item.key}`,
      explanation: pl ? "Produkt wskazuje brak danych w tym obszarze." : "The product identifies missing data in this area.",
    })),
    action_narratives: context.action_catalog.map((_action, index) => ({
      id: `action:${index}`,
      reason: pl ? "Krok wynika z bieżącego stanu produktu." : "The step follows from the current product state.",
    })),
    status_change_narratives: context.status_change_conditions.map((condition) => ({
      id: `condition:${condition.key}`,
      explanation: pl ? "Zmiana danych pozwoli ponowić ocenę." : "A data change will allow reassessment.",
    })),
  };
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
