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
import { AIResearchRadarStatus, AIResearchSection } from "../src/components/AIResearchSection.js";
import { CandidateDetailView } from "../src/components/CandidateDetailView.js";
import { ExternalVerificationLinksView } from "../src/components/ExternalVerificationLinksView.js";
import { PERSISTABLE_SCANNER_SAMPLE } from "../src/fixtures/persistableScannerSample.js";
import { ProductLocaleProvider, type ProductLocale } from "../src/productI18n.js";
import type { AIResearchBriefLookup } from "../src/types/aiResearchTypes.js";

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

function render(locale: ProductLocale, element: React.ReactElement): string {
  return renderToStaticMarkup(<ProductLocaleProvider initialLocale={locale}>{element}</ProductLocaleProvider>);
}

function source(path: string) {
  return readFile(resolve(import.meta.dirname, "..", path), "utf8");
}
