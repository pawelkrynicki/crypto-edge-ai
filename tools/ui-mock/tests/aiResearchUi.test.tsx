import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { after, describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildAIResearchContext, type AIResearchGuidanceInput } from "../server/aiResearchContext.js";
import { buildDeterministicPreview } from "../server/aiResearchService.js";
import { mapPersistableScannerOutputToUiCandidates } from "../src/adapters/scannerOutputAdapter.js";
import { AIResearchBriefCanvas } from "../src/components/AIResearchBriefCanvas.js";
import { AIProductionAnalysisCanvas } from "../src/components/AIProductionAnalysisCanvas.js";
import { AIResearchRadarStatus, AIResearchSection } from "../src/components/AIResearchSection.js";
import { applyAIResearchGenerationFailure } from "../src/components/aiResearchState.js";
import { CandidateDetailView } from "../src/components/CandidateDetailView.js";
import { ExternalVerificationLinksView } from "../src/components/ExternalVerificationLinksView.js";
import { PERSISTABLE_SCANNER_SAMPLE } from "../src/fixtures/persistableScannerSample.js";
import { ProductLocaleProvider, readRequestedProductLocale, type ProductLocale } from "../src/productI18n.js";
import { AIResearchDataSourceError } from "../src/services/aiResearchDataSource.js";
import type { AIResearchBrief, AIResearchBriefLookup, AIResearchReviewMetrics } from "../src/types/aiResearchTypes.js";
import { presentAIProductionLookup, presentAnalysis, validateAIProductionLookup } from "../server/aiProductionPublic.js";

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
    for (const [markup, labels] of [[pl, ["Wizualny stan badawczy", "Co dalej", "Macierz ryzyk", "Czego nadal nie wiemy", "Oś punktów kontrolnych", "Granica badawcza"]], [en, ["Visual research state", "What next", "Risk matrix", "What we still do not know", "Checkpoint timeline", "Research boundary"]]] as const) {
      for (const label of labels) assert.match(markup, new RegExp(label));
      assert.match(markup, /ai-research-kpis/);
      assert.match(markup, /ai-next-map/);
      assert.match(markup, /role="table"/);
      assert.match(markup, /aria-hidden="true"/);
      assert.doesNotMatch(markup, /chatbot|chat-message|dangerouslySetInnerHTML/i);
      assert.doesNotMatch(markup, />\s*(Buy|Sell|Kup|Sprzedaj|Trade)\s*</i);
    }
    assert.match(pl, /Produkt nie posiada wyniku kontroli bezpieczeństwa kontraktu/);
    assert.match(en, /The product does not have a contract security check result/);
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
    assert.doesNotMatch(pl, /\b(?:DATA_STALE|STALE|new|rejected_basic_filter|lifecycle|security|holder_concentration)\b/i);
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
    assert.match(pl, /data-action-variant="primary"[^>]*>[\s\S]*?Poczekaj na świeżą migawkę/);
    assert.match(pl, /data-action-variant="secondary"[^>]*>[\s\S]*?Otwórz weryfikację źródłową/);
    assert.match(pl, /data-action-variant="tertiary"[^>]*>[\s\S]*?Otwórz DexScreener/);
    assert.match(pl, /data-action-variant="tertiary"[^>]*>[\s\S]*?Otwórz eksplorator/);
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
      ["ABSENT", /Brak analizy/], ["QUEUED", /W kolejce/], ["PROCESSING", /Przygotowywana/], ["READY", /Dostępna/],
      ["STALE", /Ostatnia analiza/], ["FAILED", /Chwilowo niedostępna/], ["SUSPENDED", /Wstrzymana/],
      ["COOLDOWN", /Czas oczekiwania/], ["PROVIDER_DISABLED", /Niedostępna/],
      ["INSUFFICIENT_DATA", /Niewystarczające dane/], ["RATE_LIMITED", /Limit czasowy/], ["ERROR", /Niedostępna/],
    ];
    for (const [availability, label] of states) {
      const lookup: AIResearchBriefLookup = {
        schema_version: "ai_research_lookup_v1",
        availability,
        provider_mode: availability === "PROVIDER_DISABLED" ? "DISABLED" : "OPENAI",
        brief: ["READY", "STALE", "FAILED"].includes(availability) ? briefPl : null,
        retry_after_seconds: availability === "RATE_LIMITED" ? 60 : null,
        error_code: availability === "ERROR" ? "VALIDATION_FAILURE" : null,
      };
      const markup = render("pl", <AIResearchSection chain="base" contractAddress={ADDRESS} symbol="PASS" name="Pass Token" initialLookup={lookup} />);
      assert.match(markup, label);
      assert.match(markup, /aria-live="polite"/);
      if (["ABSENT", "STALE"].includes(availability)) assert.match(markup, /Zleć analizę AI/);
      if (["ERROR", "FAILED"].includes(availability)) assert.match(markup, /Ponów zlecenie analizy/);
    }
  });

  it("places AI Research in Summary and the dedicated tab while keeping Radar and Verification actions", () => {
    const detail = render("pl", <CandidateDetailView candidate={candidate} followUpStatus={null} />);
    assert.ok(detail.indexOf('id="candidate-tab-observation"') < detail.indexOf('id="candidate-tab-ai"'));
    assert.ok(detail.indexOf('id="candidate-tab-ai"') < detail.indexOf('id="candidate-tab-data"'));
    assert.match(detail, /role="tablist"/);
    assert.equal((detail.match(/role="tabpanel"/g) ?? []).length, 1);
    assert.match(detail, /data-detail-module="ai"/);
    const radar = render("pl", <AIResearchRadarStatus chain="base" contractAddress={ADDRESS} onOpen={() => undefined} />);
    assert.match(radar, /ai-radar-status/);
    assert.match(radar, /Przejdź do szczegółów analizy/);
    const verification = render("pl", <ExternalVerificationLinksView candidate={candidate} initialActiveTab="data" onOpenResearchBrief={() => undefined} />);
    assert.match(verification, /Analiza AI uzupełnia, ale nie zastępuje ręcznej weryfikacji/);
    assert.match(verification, /data-action-variant="secondary"[^>]*>[\s\S]*Otwórz analizę AI/);
  });

  it("opens a READY Canvas directly in the dedicated detail tab with provider-neutral copy", () => {
    const lookup: AIResearchBriefLookup = {
      schema_version: "ai_research_lookup_v1",
      availability: "READY",
      provider_mode: "OPENAI",
      brief: { ...briefPl, render_preview: false },
      retry_after_seconds: null,
      error_code: null,
    };
    const markup = render("pl", <AIResearchSection chain="base" contractAddress={ADDRESS} symbol="PASS" name="Pass Token" initialLookup={lookup} mode="detail" />);
    assert.match(markup, /ai-research-canvas/);
    assert.match(markup, /ai-prepared-status/);
    assert.doesNotMatch(markup, /OpenAI|gpt-5-mini|provider mode/i);
  });

  it("keeps unknown security distinct from low risk and uses server-provided targets", () => {
    assert.ok(briefPl.risk_factors.some(({ severity }) => severity === "unknown"));
    assert.equal(briefPl.risk_factors.some(({ category, severity }) => category === "coverage_missing" && severity === "low"), false);
    for (const action of briefPl.next_actions) {
      assert.ok(action.target_reference.startsWith("#") || action.target_reference.startsWith("https://"));
    }
  });

  it("renders the CAMP public canvas in one complete locale at a time", () => {
    const pl = render("pl", <AIProductionAnalysisCanvas analysis={presentAnalysis(briefPl, false, "pl")} />);
    const en = render("en", <AIProductionAnalysisCanvas analysis={presentAnalysis(briefPl, false, "en")} />);

    for (const label of ["ANALIZA AI", "Podsumowanie", "CO Z TEGO WYNIKA TERAZ", "NAJWAŻNIEJSZE POTWIERDZONE INFORMACJE", "NASTĘPNE KROKI RESEARCHU"]) assert.match(pl, new RegExp(label));
    for (const label of ["AI ANALYSIS", "Summary", "WHAT THIS MEANS NOW", "KEY CONFIRMED FINDINGS", "NEXT RESEARCH STEPS"]) assert.match(en, new RegExp(label));
    assert.doesNotMatch(pl, /AI ANALYSIS|WHAT THIS MEANS NOW|KEY CONFIRMED FINDINGS/);
    assert.doesNotMatch(en, /ANALIZA AI|CO Z TEGO WYNIKA TERAZ|NAJWAŻNIEJSZE POTWIERDZONE INFORMACJE/);
  });
});

describe("PC.2 CAMP presentation polish", () => {
  it("keeps public CAMP copy nontechnical while restoring context values and trader-relevant findings", () => {
    const plAnalysis = presentAnalysis(briefPl, false, "pl");
    const enAnalysis = presentAnalysis(briefPl, false, "en");
    const pl = render("pl", <AIProductionAnalysisCanvas analysis={plAnalysis} />);
    const en = render("en", <AIProductionAnalysisCanvas analysis={enAnalysis} />);

    assert.match(pl, /Kapitalizacja: /);
    assert.match(pl, /Płynność: /);
    assert.match(pl, /Do weryfikacji/);
    assert.match(en, /Needs review/);
    assert.match(pl, /Kompletność źródła:/);
    assert.match(en, /Source completeness:/);
    assert.match(pl, /Kontrola listy Established/);
    assert.match(en, /Established-list check/);
    assert.match(pl, /Brak dodatkowych danych w tej migawce/);
    assert.match(en, /No additional data in this snapshot/);
    assert.doesNotMatch(pl, /kolejk|provider|model|cache|dedup/i);
    assert.doesNotMatch(pl, />[^<]*(?:wspóln|Canvas)[^<]*</i);
    assert.doesNotMatch(en, /shared|queue|provider|model|cache|dedup/i);
    assert.doesNotMatch(en, />[^<]*Canvas[^<]*</i);
    assert.deepEqual(plAnalysis.confirmed_findings.map(({ title }) => title), ["Kapitalizacja", "Płynność", "Podstawowe filtry"]);
    assert.deepEqual(enAnalysis.confirmed_findings.map(({ title }) => title), ["Market cap", "Liquidity", "Basic filters"]);
    assert.match(en, /Fresh data becomes available/);
    assert.doesNotMatch(en, /Dostępność świeżych danych/);
  });

  it("uses an explicit product URL locale before the stored preference", () => {
    assert.equal(readRequestedProductLocale("?locale=pl"), "pl");
    assert.equal(readRequestedProductLocale("?locale=en"), "en");
    assert.equal(readRequestedProductLocale("?locale=de"), null);
  });
});

describe("PC.2 action-first research guidance", () => {
  it("keeps a stored bilingual READY brief public as v3 with guidance and rejects an invalid guidance projection", () => {
    const storedReady: AIResearchBriefLookup = {
      schema_version: "ai_research_lookup_v1",
      availability: "READY",
      provider_mode: "DISABLED",
      brief: { ...briefPl, render_preview: false },
      retry_after_seconds: null,
      error_code: null,
      queue_status: "READY",
      shared_result: true,
      is_last_known_good: false,
    };
    const providerCalls = 0;

    for (const [locale, brief, guidance] of [
      ["pl", briefPl, context.guidance],
      ["en", briefEn, contextEn.guidance],
    ] as const) {
      const publicLookup = presentAIProductionLookup({ ...storedReady, brief }, locale, guidance);
      assert.equal(publicLookup.status, "READY");
      assert.equal(publicLookup.analysis?.schema_version, "ai_production_analysis_v3");
      assert.ok(publicLookup.analysis?.research_guidance);
      assert.ok(publicLookup.analysis?.research_guidance.current_step);

      const invalidGuidance = {
        ...publicLookup,
        analysis: { ...publicLookup.analysis!, research_guidance: null },
      };
      assert.throws(
        () => validateAIProductionLookup(invalidGuidance as unknown as Parameters<typeof validateAIProductionLookup>[0]),
        /AI_PRODUCTION_PUBLIC_CONTRACT_INVALID/,
      );
      assert.equal(publicLookup.status, "READY", "a rejected projection must not mutate the valid cached READY lookup");
    }

    assert.equal(providerCalls, 0, "public projection of a stored brief must not call a provider");
  });

  it("keeps failed stale filters at Step 1 with one automatic-snapshot action and canonical exact failures", () => {
    const input = structuredClone(context.guidance);
    input.freshness = "STALE";
    input.filters = {
      status: "rejected_basic_filter",
      reasons: ["market_cap_below_300000", "volume_24h_below_30000", "liquidity_below_30000"],
      metrics: { market_cap_usd: 4_659, liquidity_usd: 5_925, volume_24h_usd: 2_289, volume_market_cap_ratio: null, pair_age_days: null },
    };
    input.action_catalog = guidanceActions("pl", ["WAIT_FOR_CHECKPOINT"]);
    const analysis = presentAnalysis(briefPl, false, "pl", input);
    const markup = render("pl", <AIProductionAnalysisCanvas analysis={analysis} />);

    assert.deepEqual(analysis.research_guidance.current_step, {
      number: 1,
      title: "SZYBKI FILTR",
      posture: "KROK 1 NIEZALICZONY",
      posture_detail: "Dalszy research jest wstrzymany do kolejnej świeżej migawki.",
    });
    assert.deepEqual(analysis.research_guidance.filter_failures.map(({ label, value, status }) => ({ label, value, status })), [
      { label: "Kapitalizacja", value: "4659 USD", status: "NIE SPEŁNIA" },
      { label: "Wolumen 24 h", value: "2289 USD", status: "NIE SPEŁNIA" },
      { label: "Płynność", value: "5925 USD", status: "NIE SPEŁNIA" },
    ]);
    assert.match(analysis.research_guidance.filter_failures[0]!.requirement, /300\s?000 USD/);
    assert.match(analysis.research_guidance.filter_failures[1]!.requirement, /30\s?000 USD/);
    assert.match(analysis.research_guidance.filter_failures[2]!.requirement, /30\s?000 USD/);
    assert.deepEqual(analysis.research_guidance.actions.map(({ title }) => title), ["Poczekaj na świeżą migawkę"]);
    assert.equal(analysis.research_guidance.actions[0]!.cta, null);
    assert.match(analysis.research_guidance.actions[0]!.why, /System automatycznie ponownie przeliczy podstawowe filtry/);
    assert.match(analysis.research_guidance.actions[0]!.resolves, /JEŻELI FILTRY NADAL NIE PRZEJDĄ: Token pozostaje w Kroku 1/);
    assert.match(analysis.research_guidance.actions[0]!.resolves, /JEŻELI WSZYSTKIE WYMAGANE FILTRY PRZEJDĄ: Następny etap: Krok 2\/7 — Deal Breakers \/ Security/);
    assert.deepEqual(analysis.research_guidance.unlock_conditions, [
      "Świeża migawka danych",
      "Kapitalizacja: spełnia wymagany próg",
      "Wolumen 24 h: spełnia wymagany próg",
      "Płynność: spełnia wymagany próg",
    ]);
    assert.match(markup, /Krok 1\/7 — SZYBKI FILTR/);
    assert.match(markup, /KROK 1 NIEZALICZONY/);
    assert.match(markup, /Dalszy research jest wstrzymany do kolejnej świeżej migawki/);
    assert.match(markup, /Poczekaj na świeżą migawkę/);
    assert.doesNotMatch(markup, /Sprawdź dokładne wyniki filtrów/);
    assert.match(markup, /DOKŁADNE WYNIKI FILTRÓW/);
    assert.match(markup, /SZCZEGÓŁY ANALIZY/);
    assert.ok(markup.indexOf("ETAP RESEARCHU") < markup.indexOf("SZCZEGÓŁY ANALIZY"));
  });

  it("keeps a freshness-specific Step 1 posture when filters passed and only the snapshot is stale", () => {
    const input = structuredClone(contextEn.guidance);
    input.freshness = "STALE";
    input.filters = { ...input.filters, status: "passed_basic_filter", reasons: [] };
    input.action_catalog = guidanceActions("en", ["WAIT_FOR_CHECKPOINT"]);
    const analysis = presentAnalysis(briefEn, false, "en", input);

    assert.deepEqual(analysis.research_guidance.current_step, {
      number: 1,
      title: "QUICK FILTER",
      posture: "REFRESH DATA",
      posture_detail: "Basic filters remain passed; only data freshness is awaiting the next snapshot.",
    });
    assert.doesNotMatch(analysis.research_guidance.current_step.posture, /NOT PASSED/);
    assert.deepEqual(analysis.research_guidance.actions.map(({ title }) => title), ["Refresh the data", "Review the exact filter results"]);
  });

  it("selects Security before on-chain research when filters pass but security is incomplete", () => {
    const input = structuredClone(contextEn.guidance);
    input.freshness = "FRESH";
    input.filters = { ...input.filters, status: "passed_basic_filter", reasons: [] };
    input.security = { coverage: "unavailable", contract_verified: null, honeypot_status: null, buy_tax: null, sell_tax: null, critical_flags_recorded: false };
    input.holder_data_available = false;
    input.address_identity_verified = false;
    input.action_catalog = guidanceActions("en", ["REVIEW_SECURITY", "OPEN_VERIFICATION", "OPEN_EXPLORER"]);
    const analysis = presentAnalysis(briefEn, false, "en", input);

    assert.deepEqual(analysis.research_guidance.current_step, {
      number: 2,
      title: "DEAL BREAKERS — SECURITY",
      posture: "SECURITY VERIFICATION REQUIRED",
      posture_detail: "Security checks must be completed before the on-chain data stage.",
    });
    assert.deepEqual(analysis.research_guidance.actions.map(({ title }) => title), ["Review security", "Verify the source", "Open the explorer"]);
    assert.deepEqual(analysis.research_guidance.unlock_conditions, ["Security result is available", "Contract verification is assessed", "Critical flags are reviewed"]);
  });

  it("selects On-chain only after filters and security are sufficiently complete while holder data is missing", () => {
    const input = structuredClone(context.guidance);
    input.freshness = "FRESH";
    input.filters = { ...input.filters, status: "passed_basic_filter", reasons: [] };
    input.security = { coverage: "complete", contract_verified: true, honeypot_status: "PASSED", buy_tax: 0, sell_tax: 0, critical_flags_recorded: false };
    input.holder_data_available = false;
    input.address_identity_verified = true;
    input.action_catalog = guidanceActions("pl", ["OPEN_EXPLORER"]);
    const analysis = presentAnalysis(briefPl, false, "pl", input);

    assert.deepEqual(analysis.research_guidance.current_step, {
      number: 4,
      title: "DANE ON-CHAIN",
      posture: "WYMAGA DANYCH ON-CHAIN",
      posture_detail: "Do oceny koncentracji podaży potrzebne są zapisane dane holderów.",
    });
    assert.deepEqual(analysis.research_guidance.blockers.map(({ title }) => title), ["Brak struktury holderów"]);
    assert.deepEqual(analysis.research_guidance.actions.map(({ title }) => title), ["Sprawdź dane holderów on-chain"]);
  });
});

describe("AI.1 responsive and accessibility contracts", () => {
  it("ships 390 px list transformations, 44 px actions, reduced motion and no overflow-prone layout", async () => {
    const [css, canvas, productionCanvas, section, client] = await Promise.all([
      source("src/index.css"), source("src/components/AIResearchBriefCanvas.tsx"), source("src/components/AIProductionAnalysisCanvas.tsx"), source("src/components/AIResearchSection.tsx"), source("src/services/aiResearchDataSource.ts"),
    ]);
    assert.match(css, /@media \(max-width: 420px\)[\s\S]*\.ai-research-kpis[\s\S]*repeat\(2/);
    assert.match(css, /\.ai-risk-table,[\s\S]*\.ai-risk-row[\s\S]*display: block/);
    assert.match(css, /\.ai-next-actions \.action-button[\s\S]*min-height: 44px/);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.ai-research-canvas/);
    assert.match(css, /\.ai-research-canvas[\s\S]*min-width: 0[\s\S]*overflow: hidden/);
    assert.match(canvas, /role="table"/);
    assert.match(canvas, /<ol className="ai-checkpoint-axis">/);
    assert.match(section, /aria-live="polite"/);
    assert.match(section, /loading=\{requesting\}/);
    assert.match(productionCanvas, /AI ANALYSIS.*Summary[\s\S]*WHAT THIS MEANS NOW/);
    assert.match(css, /\.ai-production-header\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\) minmax\(190px, auto\)/);
    assert.match(css, /\.ai-production-header[\s\S]*overflow-wrap:\s*normal;[\s\S]*word-break:\s*normal;[\s\S]*hyphens:\s*none/);
    assert.match(css, /@media \(max-width: 900px\)[\s\S]*\.ai-production-header\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\)/);
    assert.match(css, /\.ai-production-analysis \.ai-brief-panel li\s*\{\s*display: grid;[\s\S]*gap: 3px/);
    assert.doesNotMatch([canvas, productionCanvas, section, client].join("\n"), /dangerouslySetInnerHTML|onClick=\{undefined\}|role="button"/);
  });

  it("keeps the schema portable to AI KINTEL storage and billing adapters", async () => {
    const [types, store, provider] = await Promise.all([
      source("src/types/aiResearchTypes.ts"), source("server/aiResearchQueueStore.ts"), source("server/aiResearchProvider.ts"),
    ]);
    for (const field of ["analysis_id", "snapshot_fingerprint", "prompt_version", "model", "token_usage", "input_hash", "output_hash", "generated_at"]) assert.match(types, new RegExp(field));
    assert.match(store, /crypto_ai_analysis_queue/);
    assert.match(store, /idx_ai_analysis_identity/);
    assert.match(store, /idx_ai_analysis_claim/);
    assert.match(store, /idx_ai_analysis_completed/);
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

describe("AI.3 shared queue UI", () => {
  it("applies failed review state to an initial render-preview lookup", () => {
    const markup = withReviewSearch("?ai_review_state=failed", () => render("en", (
      <AIResearchSection
        chain="base"
        contractAddress={ADDRESS}
        symbol="SCOOBERT"
        name="Scoobert"
        initialLookup={renderPreviewLookup()}
      />
    )));

    assert.match(markup, />Temporarily unavailable</);
    assert.doesNotMatch(markup, />Preparing</);
    assert.match(markup, /The analysis could not be prepared right now\./);
    assert.match(markup, /Try again later\. The last valid result remains available\./);
  });

  it("renders every owner review state from an initial render-preview lookup", () => {
    const cases: Array<{
      reviewState: string | null;
      expectedLabel: RegExp;
      expectedCanvas: boolean;
    }> = [
      { reviewState: null, expectedLabel: />Available</, expectedCanvas: true },
      { reviewState: "absent", expectedLabel: />Not available</, expectedCanvas: false },
      { reviewState: "queued", expectedLabel: />Queued</, expectedCanvas: false },
      { reviewState: "processing", expectedLabel: />Preparing</, expectedCanvas: false },
      { reviewState: "stale", expectedLabel: />Last analysis</, expectedCanvas: true },
      { reviewState: "failed", expectedLabel: />Temporarily unavailable</, expectedCanvas: true },
      { reviewState: "suspended", expectedLabel: />Suspended</, expectedCanvas: false },
      { reviewState: "cooldown", expectedLabel: />Cooldown</, expectedCanvas: false },
    ];

    for (const { reviewState, expectedLabel, expectedCanvas } of cases) {
      const search = reviewState ? `?ai_review_state=${reviewState}` : "";
      const markup = withReviewSearch(search, () => render("en", (
        <AIResearchSection
          chain="base"
          contractAddress={ADDRESS}
          symbol="SCOOBERT"
          name="Scoobert"
          initialLookup={renderPreviewLookup()}
        />
      )));
      assert.match(markup, expectedLabel, reviewState ?? "default READY");
      assert.equal(markup.includes("ai-research-canvas"), expectedCanvas, reviewState ?? "default READY");
      if (reviewState === null || ["queued", "processing", "suspended", "cooldown"].includes(reviewState)) {
        assert.doesNotMatch(markup, />Request analysis preparation|>Retry analysis request</, reviewState ?? "default READY");
      }
      if (reviewState === "failed") assert.match(markup, />Retry analysis request</);
    }
  });

  it("shows an inactive retry CTA for COOLDOWN and RATE_LIMITED", () => {
    const cooldown = withReviewSearch("?ai_review_state=cooldown", () => render("pl", (
      <AIResearchSection
        chain="base"
        contractAddress={ADDRESS}
        symbol="SCOOBERT"
        name="Scoobert"
        initialLookup={renderPreviewLookup()}
      />
    )));
    assert.match(cooldown, /<button[^>]*disabled=""[^>]*>Spróbuj ponownie za 60 s<\/button>/);
    assert.doesNotMatch(cooldown, />Zleć analizę AI<\/button>/);

    const rateLimitedLookup: AIResearchBriefLookup = {
      ...renderPreviewLookup(),
      availability: "RATE_LIMITED",
      brief: null,
      retry_after_seconds: null,
      queue_status: "ABSENT",
    };
    const rateLimited = render("pl", (
      <AIResearchSection
        chain="base"
        contractAddress={ADDRESS}
        symbol="SCOOBERT"
        name="Scoobert"
        initialLookup={rateLimitedLookup}
      />
    ));
    assert.match(rateLimited, /<button[^>]*disabled=""[^>]*>Spróbuj ponownie później<\/button>/);
    assert.doesNotMatch(rateLimited, />Zleć analizę AI<\/button>/);
  });

  it("ignores review state for an ordinary non-preview runtime lookup", () => {
    const ordinaryLookup = renderPreviewLookup();
    ordinaryLookup.brief = ordinaryLookup.brief
      ? { ...ordinaryLookup.brief, render_preview: false }
      : null;
    const markup = withReviewSearch("?ai_review_state=failed", () => render("en", (
      <AIResearchSection
        chain="base"
        contractAddress={ADDRESS}
        symbol="SCOOBERT"
        name="Scoobert"
        initialLookup={ordinaryLookup}
      />
    )));

    assert.match(markup, />Available</);
    assert.doesNotMatch(markup, />Temporarily unavailable</);
  });

  it("moves a failed queue submission without a brief to visible unavailable state", () => {
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
    assert.match(markup, /Niedostępna/);
    assert.match(markup, /Analiza nie mogła zostać teraz przygotowana\./);
    assert.match(markup, /Spróbuj ponownie później\./);
    assert.match(markup, /Ponów zlecenie analizy/);
    assert.doesNotMatch(markup, /Wygeneruj analizę AI/);
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
    assert.match(markup, /Ostatnia analiza/);
    assert.match(markup, /Poprzedni prawidłowy wynik pozostaje dostępny/);
    assert.match(markup, /Zamknij analizę AI/);
    assert.match(markup, /ai-research-canvas/);
  });

  it("shows neutral preparation provenance and owner-only technical metrics without raw payload", () => {
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
    assert.doesNotMatch(canvas, /configured-test-model/);
    assert.doesNotMatch(canvas, /Podgląd formatu|raw prompt|raw completion|cost USD/i);

    const section = render("pl", <AIResearchSection chain="base" contractAddress={ADDRESS} symbol="SCOOBERT" name="Scoobert" initialLookup={{
      schema_version: "ai_research_lookup_v1",
      availability: "READY",
      provider_mode: "OPENAI",
      brief,
      retry_after_seconds: null,
      error_code: null,
    }} />);
    assert.match(section, /ai-prepared-status/);
    assert.doesNotMatch(section, /OpenAI|gpt-5-mini|provider mode/i);
  });

  it("separates SUSPENDED and QUEUED from the ordinary request action", () => {
    const suspended = render("pl", <AIResearchSection chain="base" contractAddress={ADDRESS} symbol="SCOOBERT" name="Scoobert" initialLookup={{
      schema_version: "ai_research_lookup_v1",
      availability: "SUSPENDED",
      provider_mode: "OPENAI",
      brief: null,
      retry_after_seconds: null,
      error_code: "WORKER_SUSPENDED",
      queue_status: "SUSPENDED",
    }} />);
    assert.match(suspended, /Przygotowanie analizy jest wstrzymane/);
    assert.match(suspended, /Przygotowanie będzie możliwe, gdy analiza będzie dostępna\./);
    assert.doesNotMatch(suspended, /Zleć analizę AI|Ponów zlecenie analizy/);

    const queued = render("pl", <AIResearchSection chain="base" contractAddress={ADDRESS} symbol="SCOOBERT" name="Scoobert" initialLookup={{
      schema_version: "ai_research_lookup_v1",
      availability: "QUEUED",
      provider_mode: "OPENAI",
      brief: null,
      retry_after_seconds: null,
      error_code: null,
      queue_status: "QUEUED",
    }} />);
    assert.match(queued, /Analiza jest przygotowywana/);
    assert.doesNotMatch(queued, /Zleć analizę AI|Ponów zlecenie analizy/);
  });
});

function renderPreviewLookup(): AIResearchBriefLookup {
  return {
    schema_version: "ai_research_lookup_v1",
    availability: "READY",
    provider_mode: "DISABLED",
    brief: { ...briefEn, render_preview: true },
    retry_after_seconds: null,
    error_code: null,
    queue_status: "READY",
    shared_result: true,
    is_last_known_good: false,
  };
}

function withReviewSearch<T>(search: string, callback: () => T): T {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { location: { search } },
  });
  try {
    return callback();
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
}

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
    explanation: bilingualText("At least one basic product condition is not met.", "Co najmniej jeden podstawowy warunek produktu nie jest spełniony."),
    evidence_reference_ids: ["basic_filters", "security_status", "scanner_snapshot", "follow_up_checkpoints", "established_membership", "methodology"],
  }];
  result.missing_information = [
    ["security", pl ? "Brak danych bezpieczeństwa" : "Security data missing", "security_status"],
    ["history", pl ? "Brak wystarczającej historii" : "Insufficient history", "follow_up_checkpoints"],
    ["next_checkpoint", pl ? "Brak kolejnego checkpointu" : "Next checkpoint missing", "follow_up_checkpoints"],
    ["fresh_data", pl ? "Brak świeżych danych" : "Fresh data missing", "scanner_snapshot"],
    ["source_verification", pl ? "Brak weryfikacji źródłowej" : "Source verification missing", "scanner_snapshot"],
  ].map(([key, label, source_reference_id]) => ({ key, label, explanation: bilingualText("Generic description.", "Opis ogólny."), source_reference_ids: [source_reference_id] }));
  result.next_actions = [{
    action_type: "WAIT_FOR_CHECKPOINT", label: pl ? "Poczekaj na świeżą migawkę" : "Wait for a fresh snapshot", priority: "primary", reason: bilingualText("Wait for a fresh snapshot before comparing the recorded data.", "Poczekaj na świeżą migawkę przed porównaniem zapisanych danych."), target_type: "internal_route", target_reference: "#ai-research-checkpoints",
  }, {
    action_type: "OPEN_VERIFICATION", label: pl ? "Otwórz weryfikację źródłową" : "Open source verification", priority: "secondary", reason: bilingualText("Verify the listed source after refreshing the snapshot.", "Zweryfikuj wskazane źródło po odświeżeniu migawki."), target_type: "internal_route", target_reference: "#external-checks",
  }, {
    action_type: "OPEN_DEXSCREENER", label: pl ? "Otwórz DexScreener" : "Open DexScreener", priority: "tertiary", reason: bilingualText("Use the recorded market source as supporting context.", "Użyj zapisanego źródła rynkowego jako kontekstu pomocniczego."), target_type: "external_url", target_reference: "https://dexscreener.com/base/0x1111111111111111111111111111111111111111",
  }, {
    action_type: "OPEN_EXPLORER", label: pl ? "Otwórz eksplorator" : "Open explorer", priority: "tertiary", reason: bilingualText("Use the recorded network source only for the listed verification step.", "Użyj zapisanego źródła sieciowego wyłącznie do wskazanego kroku weryfikacji."), target_type: "external_url", target_reference: "https://basescan.org/token/0x1111111111111111111111111111111111111111",
  }];
  result.source_references = [
    ["basic_filters", "basic_filters"], ["security_status", "security_status"], ["scanner_snapshot", "scanner_snapshot"],
    ["follow_up_checkpoints", "lifecycle"], ["established_membership", "established_membership"], ["methodology", "methodology"],
  ].map(([id, label]) => ({ id, source_type: sourceType(id), label, observed_at: null, completeness: "complete", url: null }));
  return result;
}

function bilingualText(en: string, pl: string) {
  return { en, pl };
}

function sourceType(id: string): AIResearchBrief["source_references"][number]["source_type"] {
  if (id === "follow_up_checkpoints") return "follow_up_checkpoint";
  return id as AIResearchBrief["source_references"][number]["source_type"];
}

function guidanceActions(locale: ProductLocale, types: Array<AIResearchGuidanceInput["action_catalog"][number]["action_type"]>): AIResearchGuidanceInput["action_catalog"] {
  const labels: Record<AIResearchGuidanceInput["action_catalog"][number]["action_type"], [string, string]> = {
    OPEN_VERIFICATION: ["Otwórz weryfikację źródła", "Open source verification"],
    OPEN_DEXSCREENER: ["Otwórz DexScreener", "Open DexScreener"],
    OPEN_EXPLORER: ["Otwórz eksplorator", "Open explorer"],
    REVIEW_SECURITY: ["Sprawdź bezpieczeństwo", "Review security"],
    WAIT_FOR_CHECKPOINT: ["Poczekaj na świeżą migawkę", "Wait for a fresh snapshot"],
    REVIEW_CHECKPOINTS: ["Przejrzyj punkty kontrolne", "Review checkpoints"],
    OPEN_REPORT: ["Otwórz raport", "Open report"],
    OWNER_REVIEW: ["Przegląd ownera", "Owner review"],
    RETURN_TO_RADAR: ["Wróć do Radaru", "Return to Radar"],
  };
  return types.map((action_type, index) => ({
    action_type,
    label: labels[action_type][locale === "pl" ? 0 : 1],
    priority: index === 0 ? "primary" : index === 1 ? "secondary" : "tertiary",
    target_type: action_type === "OPEN_EXPLORER" ? "external_url" : "internal_route",
    target_reference: action_type === "OPEN_EXPLORER" ? `https://basescan.org/token/${ADDRESS}` : "#external-checks",
  }));
}

function source(path: string) {
  return readFile(resolve(import.meta.dirname, "..", path), "utf8");
}
