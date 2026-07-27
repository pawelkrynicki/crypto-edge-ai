import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { after, describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildAIResearchContext } from "../server/aiResearchContext.js";
import { buildDeterministicPreview } from "../server/aiResearchService.js";
import { mapPersistableScannerOutputToUiCandidates } from "../src/adapters/scannerOutputAdapter.js";
import { AIResearchBriefCanvas } from "../src/components/AIResearchBriefCanvas.js";
import { AIResearchRadarStatus, AIResearchSection, applyAIResearchGenerationFailure } from "../src/components/AIResearchSection.js";
import { CandidateDetailView } from "../src/components/CandidateDetailView.js";
import { ExternalVerificationLinksView } from "../src/components/ExternalVerificationLinksView.js";
import { PERSISTABLE_SCANNER_SAMPLE } from "../src/fixtures/persistableScannerSample.js";
import { ProductLocaleProvider, type ProductLocale } from "../src/productI18n.js";
import { AIResearchDataSourceError } from "../src/services/aiResearchDataSource.js";
import type { AIResearchBrief, AIResearchBriefLookup, AIResearchReviewMetrics } from "../src/types/aiResearchTypes.js";

void React;

const root = await mkdtemp(resolve(tmpdir(), "crypto-edge-ai-research-ui-"));
const fixturePath = resolve(root, "scanner.json");
const ADDRESS = "0x1111111111111111111111111111111111111111";
const value = structuredClone(PERSISTABLE_SCANNER_SAMPLE);
value.candidates[0]!.chain = "base";
value.candidates[0]!.contract_address = ADDRESS;
value.candidates[0]!.source_url = `https://dexscreener.com/base/${ADDRESS}`;
value.candidates[0]!.address_identity_verified = true;
await writeFile(fixturePath, JSON.stringify(value), "utf8");
const context = await buildAIResearchContext("base", ADDRESS, "pl", {
  scanner: { runtimeMode: "DEVELOPMENT_DEMO", outputDirPath: resolve(root, "missing"), fixturePath },
  followUp: { storePath: resolve(root, "missing-follow-up.json") },
  reports: { reportsRootPath: resolve(root, "missing-reports") },
});
const briefPl = buildDeterministicPreview(context, new Date("2026-07-26T15:00:00.000Z"));
const contextEn = await buildAIResearchContext("base", ADDRESS, "en", {
  scanner: { runtimeMode: "DEVELOPMENT_DEMO", outputDirPath: resolve(root, "missing"), fixturePath },
  followUp: { storePath: resolve(root, "missing-follow-up.json") },
  reports: { reportsRootPath: resolve(root, "missing-reports") },
});
const briefEn = buildDeterministicPreview(contextEn, new Date("2026-07-26T15:00:00.000Z"));
const semanticBriefPl = buildSemanticReviewBrief(briefPl, "pl");
const semanticBriefEn = buildSemanticReviewBrief(briefEn, "en");
const candidate = mapPersistableScannerOutputToUiCandidates(value)[0]!;

after(async () => { await rm(root, { recursive: true, force: true }); });

describe("AI.1 Visual Candidate Research Canvas", () => {
  it("renders the complete deterministic Canvas in PL and EN without chatbot or trading language", () => {
    const pl = render("pl", <AIResearchBriefCanvas brief={briefPl} symbol="PASS" name="Pass Token" />);
    const en = render("en", <AIResearchBriefCanvas brief={briefEn} symbol="PASS" name="Pass Token" />);
    for (const [markup, labels] of [[pl, ["Wizualny stan badawczy", "Co dalej", "Macierz ryzyk", "Czego nadal nie wiemy", "Oś checkpointów", "Granica badawcza"]], [en, ["Visual research state", "What next", "Risk matrix", "What we still do not know", "Checkpoint timeline", "Research boundary"]]] as const) {
      for (const label of labels) assert.match(markup, new RegExp(label));
      assert.match(markup, /ai-research-kpis/);
      assert.match(markup, /ai-next-map/);
      assert.match(markup, /role="table"/);
      assert.match(markup, /aria-hidden="true"/);
      assert.doesNotMatch(markup, /chatbot|chat-message|dangerouslySetInnerHTML/i);
      assert.doesNotMatch(markup, />\s*(Buy|Sell|Kup|Sprzedaj|Trade)\s*</i);
    }
    assert.match(pl, /Produkt nie posiada danych pozwalających ocenić ten obszar/);
    assert.match(en, /The product has no data that can assess this area/);
    assert.match(pl, /Podgląd formatu — bez wywołania AI/);
    assert.match(en, /Format preview — no AI call/);
  });

  it("separates lifecycle, freshness and filter assessment in the PL and EN presentation", () => {
    const pl = render("pl", <AIResearchBriefCanvas brief={semanticBriefPl} symbol="SCOOBERT" name="Scoobert" />);
    const en = render("en", <AIResearchBriefCanvas brief={semanticBriefEn} symbol="SCOOBERT" name="Scoobert" />);

    assert.match(pl, /Etap badawczy<\/span><strong>Nowe<\/strong>/);
    assert.match(pl, /Świeżość danych<\/span><strong>Nieaktualne<\/strong>/);
    assert.match(pl, /Podstawowe filtry<\/span><strong>Niewystarczające<\/strong>/);
    assert.match(pl, /Dane do oceny filtrów<\/span><strong>Wystarczające<\/strong>/);
    assert.match(en, /Research stage<\/span><strong>New<\/strong>/);
    assert.match(en, /Data freshness<\/span><strong>Stale<\/strong>/);
    assert.match(en, /Basic filters<\/span><strong>Insufficient<\/strong>/);
    assert.match(en, /Data for filter assessment<\/span><strong>Sufficient<\/strong>/);
  });

  it("prioritizes a fresh snapshot while keeping verification secondary and external links tertiary", () => {
    const pl = render("pl", <AIResearchBriefCanvas brief={semanticBriefPl} symbol="SCOOBERT" name="Scoobert" />);
    const en = render("en", <AIResearchBriefCanvas brief={semanticBriefEn} symbol="SCOOBERT" name="Scoobert" />);

    for (const label of [
      "Aktualny etap", "Nowe", "Dane nieaktualne i filtry niespełnione", "Poczekaj na świeżą migawkę",
      "Publikacja nowych danych i ponowne obliczenie filtrów",
    ]) assert.match(pl, new RegExp(label));
    for (const label of [
      "Current stage", "New", "Data is stale and filters are not met", "Wait for a fresh snapshot",
      "Publication of new data and recalculation of filters",
    ]) assert.match(en, new RegExp(label));
    assert.match(pl, /data-action-variant="secondary"[^>]*>[\s\S]*?Otwórz weryfikację źródłową/);
    assert.match(pl, /data-action-variant="tertiary"[^>]*>[\s\S]*?Otwórz DexScreener/);
    assert.match(pl, /data-action-variant="tertiary"[^>]*>[\s\S]*?Otwórz eksplorator/);
    assert.doesNotMatch(pl, /data-action-variant="primary"/);
  });

  it("uses natural source labels and concrete missing-information copy without exposing raw refs", () => {
    const pl = render("pl", <AIResearchBriefCanvas brief={semanticBriefPl} symbol="SCOOBERT" name="Scoobert" />);
    const en = render("en", <AIResearchBriefCanvas brief={semanticBriefEn} symbol="SCOOBERT" name="Scoobert" />);

    for (const label of ["Podstawowe filtry", "Status bezpieczeństwa", "Migawka skanera", "Etap obserwacji", "Członkostwo w Established", "Metodologia produktu"]) assert.match(pl, new RegExp(label));
    for (const label of ["Basic filters", "Security status", "Scanner snapshot", "Observation stage", "Established membership", "Product methodology"]) assert.match(en, new RegExp(label));
    assert.doesNotMatch(pl, /basic_filters|security_status|scanner_snapshot|established_membership|follow_up_checkpoints|>security</);
    assert.doesNotMatch(en, /basic_filters|security_status|scanner_snapshot|established_membership|follow_up_checkpoints|>security</);

    for (const description of [
      "Produkt nie posiada wyniku kontroli bezpieczeństwa kontraktu.",
      "Token nie posiada jeszcze historii pozwalającej porównać zmiany w kolejnych okresach.",
      "Nie zapisano jeszcze wyniku następnego punktu kontrolnego.",
      "Ostatnia migawka jest starsza niż dopuszczalny limit świeżości.",
      "Tożsamość projektu i dane zewnętrzne nie zostały jeszcze potwierdzone ręcznie.",
    ]) assert.match(pl, new RegExp(description.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    for (const description of [
      "The product does not have a contract security check result.",
      "The token does not yet have enough history to compare changes across consecutive periods.",
      "The result of the next checkpoint has not been recorded yet.",
      "The latest snapshot is older than the allowed freshness limit.",
      "The project&#x27;s identity and external data have not yet been confirmed manually.",
    ]) assert.match(en, new RegExp(description.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });

  it("renders all Candidate Detail states with aria-live, aria-busy and UX.1 hierarchy", () => {
    const states: Array<[AIResearchBriefLookup["availability"], RegExp]> = [
      ["ABSENT", /Brak analizy/], ["GENERATING", /Generowanie/], ["READY", /Gotowa/], ["STALE", /Nieaktualna/],
      ["PROVIDER_DISABLED", /Niedostępna/], ["INSUFFICIENT_DATA", /Niewystarczające dane/], ["RATE_LIMITED", /Limit czasowy/], ["ERROR", /Błąd/],
    ];
    for (const [availability, label] of states) {
      const lookup: AIResearchBriefLookup = {
        schema_version: "ai_research_lookup_v1",
        availability,
        provider_mode: availability === "PROVIDER_DISABLED" ? "DISABLED" : "OPENAI",
        brief: availability === "READY" || availability === "STALE" ? briefPl : null,
        retry_after_seconds: availability === "RATE_LIMITED" ? 60 : null,
        error_code: availability === "ERROR" ? "VALIDATION_FAILURE" : null,
      };
      const markup = render("pl", <AIResearchSection chain="base" contractAddress={ADDRESS} symbol="PASS" name="Pass Token" initialLookup={lookup} />);
      assert.match(markup, label);
      assert.match(markup, /aria-live="polite"/);
      if (["ABSENT", "ERROR", "STALE", "RATE_LIMITED"].includes(availability)) assert.match(markup, /data-action-variant="primary"/);
    }
    const generating = render("pl", <AIResearchSection chain="base" contractAddress={ADDRESS} symbol="PASS" name="Pass Token" initialLookup={{ schema_version: "ai_research_lookup_v1", availability: "GENERATING", provider_mode: "OPENAI", brief: null, retry_after_seconds: null, error_code: null }} />);
    assert.match(generating, /Generowanie/);
  });

  it("places AI Research after lifecycle in Candidate Detail and adds compact Radar and Verification actions", () => {
    const detail = render("pl", <CandidateDetailView candidate={candidate} followUpStatus={null} />);
    assert.ok(detail.indexOf("Przepływ obserwacji") < detail.indexOf("Analiza badawcza AI"));
    assert.ok(detail.indexOf("Analiza badawcza AI") < detail.indexOf("Dane rynkowe"));
    const radar = render("pl", <AIResearchRadarStatus chain="base" contractAddress={ADDRESS} onOpen={() => undefined} />);
    assert.match(radar, /ai-radar-status/);
    assert.match(radar, /Przejdź do szczegółów, aby wygenerować/);
    const verification = render("pl", <ExternalVerificationLinksView candidate={candidate} onOpenResearchBrief={() => undefined} />);
    assert.match(verification, /Analiza AI uzupełnia, ale nie zastępuje ręcznej weryfikacji/);
    assert.match(verification, /data-action-variant="secondary"[^>]*>[\s\S]*Otwórz analizę AI/);
  });

  it("keeps unknown security distinct from low risk and uses server-provided targets", () => {
    assert.ok(briefPl.risk_factors.some(({ severity }) => severity === "unknown"));
    assert.equal(briefPl.risk_factors.some(({ category, severity }) => category === "coverage_missing" && severity === "low"), false);
    for (const action of briefPl.next_actions) {
      assert.ok(action.target_reference.startsWith("#") || action.target_reference.startsWith("https://"));
    }
  });
});

describe("AI.1 responsive and accessibility contracts", () => {
  it("ships 390 px list transformations, 44 px actions, reduced motion and no overflow-prone layout", async () => {
    const [css, canvas, section, client] = await Promise.all([
      source("src/index.css"), source("src/components/AIResearchBriefCanvas.tsx"), source("src/components/AIResearchSection.tsx"), source("src/services/aiResearchDataSource.ts"),
    ]);
    assert.match(css, /@media \(max-width: 420px\)[\s\S]*\.ai-research-kpis[\s\S]*repeat\(2/);
    assert.match(css, /\.ai-risk-table,[\s\S]*\.ai-risk-row[\s\S]*display: block/);
    assert.match(css, /\.ai-next-actions \.action-button[\s\S]*min-height: 44px/);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.ai-research-canvas/);
    assert.match(css, /\.ai-research-canvas[\s\S]*min-width: 0[\s\S]*overflow: hidden/);
    assert.match(canvas, /role="table"/);
    assert.match(canvas, /<ol className="ai-checkpoint-axis">/);
    assert.match(section, /aria-live="polite"/);
    assert.match(section, /loading=\{generating\}/);
    assert.doesNotMatch([canvas, section, client].join("\n"), /dangerouslySetInnerHTML|onClick=\{undefined\}|role="button"/);
  });

  it("keeps the schema portable to AI KINTEL storage and billing adapters", async () => {
    const [types, store, provider] = await Promise.all([
      source("src/types/aiResearchTypes.ts"), source("server/aiResearchStore.ts"), source("server/aiResearchProvider.ts"),
    ]);
    for (const field of ["analysis_id", "snapshot_fingerprint", "prompt_version", "model", "token_usage", "input_hash", "output_hash", "generated_at"]) assert.match(types, new RegExp(field));
    assert.match(store, /crypto_ai_research_briefs/);
    assert.match(store, /idx_ai_research_identity/);
    assert.match(store, /idx_ai_research_generated_at/);
    assert.match(store, /idx_ai_research_snapshot/);
    assert.match(provider, /AIResearchUsageRecorder/);
    assert.match(provider, /NOOP_AI_RESEARCH_USAGE_RECORDER/);
  });

  it("ships a render-only owner launcher with isolated stores and zero-call defaults", async () => {
    const launcher = await readFile(resolve(import.meta.dirname, "..", "..", "..", "scripts", "win", "start-ai-research-brief-review.cmd"), "utf8");
    assert.match(launcher, /CRYPTO_EDGE_RUNTIME_MODE=INTERNAL_BETA/);
    assert.match(launcher, /CRYPTO_EDGE_AI_RESEARCH_PROVIDER=DISABLED/);
    assert.match(launcher, /CRYPTO_EDGE_AI_RESEARCH_RENDER_PREVIEW=1/);
    assert.match(launcher, /CRYPTO_EDGE_AI_RESEARCH_SQLITE_PATH=%TEMP%/);
    assert.match(launcher, /CRYPTO_EDGE_FEEDBACK_SQLITE_PATH=%TEMP%/);
    assert.match(launcher, /start-product-radar-review\.cmd" --candidate-detail/);
    assert.match(launcher, /OpenAI calls: 0/);
    assert.doesNotMatch(launcher, /collect:internal-beta|scanner:persist:live|CRYPTO_EDGE_AI_RESEARCH_PROVIDER=OPENAI|^\s*call .*--apply/im);
  });
});

describe("AI.2 controlled OpenAI owner review UI", () => {
  it("moves a failed clicked generation without a brief to visible ERROR instead of leaving ABSENT", () => {
    const failure = applyAIResearchGenerationFailure({
      schema_version: "ai_research_lookup_v1",
      availability: "ABSENT",
      provider_mode: "OPENAI",
      brief: null,
      retry_after_seconds: null,
      error_code: null,
    }, new AIResearchDataSourceError(502, "PROVIDER_ERROR", null, null));

    assert.equal(failure.availability, "ERROR");
    assert.notEqual(failure.availability, "ABSENT");
    assert.equal(failure.brief, null);
    const markup = render("pl", <AIResearchSection chain="base" contractAddress={ADDRESS} symbol="SCOOBERT" name="Scoobert" initialLookup={failure} />);
    assert.match(markup, /Błąd/);
    assert.match(markup, /Nie udało się przygotować briefu/);
    assert.match(markup, /Żądanie zakończyło się bez zapisu/);
    assert.match(markup, /Wygeneruj analizę AI/);
    assert.doesNotMatch(markup, /Brak analizy/);
  });

  it("keeps the last-known-good brief available as STALE after a failed update", () => {
    const previous: AIResearchBriefLookup = {
      schema_version: "ai_research_lookup_v1",
      availability: "READY",
      provider_mode: "OPENAI",
      brief: { ...semanticBriefPl, render_preview: false },
      retry_after_seconds: null,
      error_code: null,
    };
    const failure = applyAIResearchGenerationFailure(
      previous,
      new AIResearchDataSourceError(504, "PROVIDER_TIMEOUT", null, null),
    );

    assert.equal(failure.availability, "STALE");
    assert.equal(failure.brief, previous.brief);
    const markup = render("pl", <AIResearchSection chain="base" contractAddress={ADDRESS} symbol="SCOOBERT" name="Scoobert" initialLookup={failure} />);
    assert.match(markup, /Nieaktualna/);
    assert.match(markup, /Nie udało się zaktualizować analizy/);
    assert.match(markup, /Poprzedni brief pozostaje dostępny/);
    assert.match(markup, /Otwórz analizę AI/);
  });

  it("shows OpenAI provenance and owner-only technical metrics without a preview badge or raw payload", () => {
    const brief = { ...semanticBriefPl, render_preview: false, model: "configured-test-model" };
    const metrics: AIResearchReviewMetrics = {
      schema_version: "ai_research_review_metrics_v1",
      analysis_id: brief.analysis_id,
      model: brief.model,
      prompt_version: brief.prompt_version,
      snapshot_fingerprint: brief.snapshot_fingerprint,
      generated_at: brief.generated_at,
      data_generated_at: brief.data_generated_at,
      latency_ms: 432,
      prompt_tokens: brief.token_usage.prompt_tokens,
      output_tokens: brief.token_usage.completion_tokens,
      total_tokens: brief.token_usage.total_tokens,
      cache_hit: false,
      validation_status: "VALID",
      request_id: "req_owner_review_123",
    };
    const canvas = render("pl", <AIResearchBriefCanvas brief={brief} symbol="SCOOBERT" name="Scoobert" reviewMetrics={metrics} />);
    assert.match(canvas, /Szczegóły techniczne/);
    assert.match(canvas, /req_owner_review_123/);
    assert.match(canvas, /432 ms/);
    assert.match(canvas, /Fingerprint snapshotu/);
    assert.doesNotMatch(canvas, /Podgląd formatu|raw prompt|raw completion|cost USD/i);

    const section = render("pl", <AIResearchSection chain="base" contractAddress={ADDRESS} symbol="SCOOBERT" name="Scoobert" initialLookup={{
      schema_version: "ai_research_lookup_v1",
      availability: "READY",
      provider_mode: "OPENAI",
      brief,
      retry_after_seconds: null,
      error_code: null,
    }} />);
    assert.match(section, /Analiza wygenerowana przez OpenAI/);
  });

  it("keeps generation disabled after the live-one budget is consumed while preserving cache access", () => {
    const absent = render("pl", <AIResearchSection chain="base" contractAddress={ADDRESS} symbol="SCOOBERT" name="Scoobert" initialLookup={{
      schema_version: "ai_research_lookup_v1",
      availability: "ABSENT",
      provider_mode: "OPENAI",
      brief: null,
      retry_after_seconds: null,
      error_code: null,
      generation_blocked_reason: "LIVE_CALL_BUDGET_EXHAUSTED",
    }} />);
    assert.match(absent, /Limit jednego płatnego wywołania został wykorzystany/);
    assert.match(absent, /<button[^>]*disabled=""[^>]*>Wygeneruj analizę AI<\/button>/);

    const stale = render("pl", <AIResearchSection chain="base" contractAddress={ADDRESS} symbol="SCOOBERT" name="Scoobert" initialLookup={{
      schema_version: "ai_research_lookup_v1",
      availability: "STALE",
      provider_mode: "OPENAI",
      brief: { ...semanticBriefPl, render_preview: false },
      retry_after_seconds: null,
      error_code: null,
      generation_blocked_reason: "LIVE_CALL_BUDGET_EXHAUSTED",
    }} />);
    assert.match(stale, /Otwórz analizę AI/);
    assert.match(stale, /<button[^>]*disabled=""[^>]*>Zaktualizuj analizę AI<\/button>/);
  });
});

function render(locale: ProductLocale, element: React.ReactElement): string {
  return renderToStaticMarkup(<ProductLocaleProvider initialLocale={locale}>{element}</ProductLocaleProvider>);
}

function buildSemanticReviewBrief(brief: AIResearchBrief, locale: ProductLocale): AIResearchBrief {
  const pl = locale === "pl";
  const result = structuredClone(brief);
  result.research_state = "DATA_STALE";
  for (const fact of result.known_facts) {
    if (fact.key === "lifecycle") fact.value = "new";
    if (fact.key === "freshness") fact.value = "STALE";
    if (fact.key === "basic_filters") fact.value = "rejected_basic_filter";
  }
  const filterCoverage = result.coverage.find(({ area }) => area === "basic_filters");
  if (filterCoverage) filterCoverage.state = "sufficient";
  result.risk_factors = [{
    severity: "high",
    category: "basic_filters",
    title: pl ? "Filtry niespełnione" : "Filters not met",
    explanation: pl ? "Co najmniej jeden podstawowy warunek produktu nie jest spełniony." : "At least one basic product condition is not met.",
    evidence_reference_ids: ["basic_filters", "security_status", "scanner_snapshot", "follow_up_checkpoints", "established_membership", "methodology"],
  }];
  result.missing_information = [
    ["security", pl ? "Brak danych bezpieczeństwa" : "Security data missing", "security_status"],
    ["history", pl ? "Brak wystarczającej historii" : "Insufficient history", "follow_up_checkpoints"],
    ["next_checkpoint", pl ? "Brak kolejnego checkpointu" : "Next checkpoint missing", "follow_up_checkpoints"],
    ["fresh_data", pl ? "Brak świeżych danych" : "Fresh data missing", "scanner_snapshot"],
    ["source_verification", pl ? "Brak weryfikacji źródłowej" : "Source verification missing", "scanner_snapshot"],
  ].map(([key, label, source_reference_id]) => ({ key, label, explanation: pl ? "Opis ogólny." : "Generic description.", source_reference_ids: [source_reference_id] }));
  result.next_actions = [{
    action_type: "OPEN_VERIFICATION", label: pl ? "Otwórz weryfikację źródłową" : "Open source verification", priority: "primary", reason: "", target_type: "internal_route", target_reference: "#external-checks",
  }, {
    action_type: "OPEN_DEXSCREENER", label: pl ? "Otwórz DexScreener" : "Open DexScreener", priority: "secondary", reason: "", target_type: "external_url", target_reference: "https://dexscreener.com/base/0x1111111111111111111111111111111111111111",
  }, {
    action_type: "OPEN_EXPLORER", label: pl ? "Otwórz eksplorator" : "Open explorer", priority: "secondary", reason: "", target_type: "external_url", target_reference: "https://basescan.org/token/0x1111111111111111111111111111111111111111",
  }];
  result.source_references = [
    ["basic_filters", "basic_filters"], ["security_status", "security_status"], ["scanner_snapshot", "scanner_snapshot"],
    ["follow_up_checkpoints", "lifecycle"], ["established_membership", "established_membership"], ["methodology", "methodology"],
  ].map(([id, label]) => ({ id, source_type: sourceType(id), label, observed_at: null, completeness: "complete", url: null }));
  return result;
}

function sourceType(id: string): AIResearchBrief["source_references"][number]["source_type"] {
  if (id === "follow_up_checkpoints") return "follow_up_checkpoint";
  return id as AIResearchBrief["source_references"][number]["source_type"];
}

function source(path: string) {
  return readFile(resolve(import.meta.dirname, "..", path), "utf8");
}
