import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import {
  ActionButton,
  ActionLink,
  CopyButton,
  ExternalLinkAction,
  ReadOnlyCard,
  StatusBadge,
  TechnicalDetails,
} from "../src/components/ProductUi.js";
import { Feedback } from "../src/components/Feedback.js";
import { ProductLocaleProvider } from "../src/productI18n.js";

void React;

const productRoot = resolve(import.meta.dirname, "..");
const repoRoot = resolve(productRoot, "..", "..");

async function source(path: string): Promise<string> {
  return readFile(resolve(productRoot, path), "utf8");
}

function render(element: React.ReactElement, locale: "pl" | "en" = "en"): string {
  return renderToStaticMarkup(React.createElement(
    ProductLocaleProvider,
    { initialLocale: locale },
    element,
  ));
}

describe("UX.1 interaction affordance contracts", () => {
  it("exposes semantic primary, secondary and tertiary action variants", () => {
    const primary = render(React.createElement(ActionButton, { variant: "primary" }, "Open details"));
    const secondary = render(React.createElement(ActionLink, { variant: "secondary", href: "#reports" }, "Reports"));
    const tertiary = render(React.createElement(ActionButton, { variant: "tertiary" }, "Expand"));
    assert.match(primary, /^<button/);
    assert.match(primary, /data-action-variant="primary"/);
    assert.match(secondary, /^<a /);
    assert.match(secondary, /href="#reports"/);
    assert.match(secondary, /data-action-variant="secondary"/);
    assert.match(tertiary, /data-action-variant="tertiary"/);
  });

  it("marks external links and gives copy controls an accessible live result", () => {
    const external = render(React.createElement(ExternalLinkAction, { href: "https://example.test" }, "Open source"));
    const copy = render(React.createElement(CopyButton, { value: "0xabc", label: "Copy contract", copiedLabel: "Copied" }));
    assert.match(external, /data-external-link="true"/);
    assert.match(external, /target="_blank"/);
    assert.match(external, /<svg[^>]*aria-hidden="true"/);
    assert.match(copy, /aria-label="Copy contract"/);
    assert.match(copy, /aria-live="polite"/);
    assert.match(copy, /<svg[^>]*aria-hidden="true"/);
  });

  it("renders disclosure state, chevron and native expanded semantics", () => {
    for (const locale of ["pl", "en"] as const) {
      const markup = render(React.createElement(TechnicalDetails, { label: locale === "pl" ? "Szczegóły techniczne" : "Technical details" }, "content"), locale);
      assert.match(markup, /^<details/);
      assert.match(markup, /data-interaction="disclosure"/);
      assert.doesNotMatch(markup, /<details[^>]*\sopen=""/);
      assert.match(markup, /<summary aria-expanded="false">/);
      assert.match(markup, /<svg[^>]*aria-hidden="true"/);
      assert.match(markup, locale === "pl" ? /Rozwiń/ : /Expand/);
    }
  });

  it("supports an opt-in initially expanded disclosure without changing the default", () => {
    const markup = render(React.createElement(TechnicalDetails, { label: "Confirm decision", initialOpen: true }, "content"));
    assert.match(markup, /<details[^>]*\sopen=""/);
    assert.match(markup, /<summary aria-expanded="true">/);
    assert.match(markup, /Collapse/);
  });

  it("keeps status badges and read-only cards non-focusable and non-interactive", () => {
    const status = render(React.createElement(StatusBadge, { tone: "ready" }, "No blockers"));
    const card = render(React.createElement(ReadOnlyCard, { className: "metric" }, "42"));
    assert.match(status, /^<span/);
    assert.match(status, /data-interaction="status"/);
    assert.doesNotMatch(status, /tabindex|href=|role="button"/i);
    assert.match(card, /^<article/);
    assert.match(card, /data-interaction="read-only"/);
    assert.doesNotMatch(card, /onclick|tabindex|role="button"/i);
  });

  it("keeps lifecycle and metric surfaces informational while cards expose explicit CTAs", async () => {
    const [flow, results, reports, css] = await Promise.all([
      source("src/components/TokenLifecycleFlow.tsx"),
      source("src/components/CandidateResultsView.tsx"),
      source("src/components/ReportsLibrary.tsx"),
      source("src/index.css"),
    ]);
    assert.match(flow, /data-interaction="read-only"/);
    assert.doesNotMatch(flow, /token-lifecycle-stage[^\n]*onClick/);
    assert.doesNotMatch(flow, /tabIndex=|onClick=|role="button"/);
    assert.match(css, /\.token-lifecycle-stage,[\s\S]*?cursor: default/);
    assert.match(css, /\.token-lifecycle-stage:not\(:last-child\)::after/);
    assert.match(css, /@media \(max-width: 700px\)[\s\S]*?\.token-lifecycle-flow\.compact \.token-lifecycle-stages[\s\S]*?grid-template-columns: 1fr/);
    assert.match(results, /ActionButton variant="primary" icon="arrow" iconPosition="end"/);
    assert.match(results, /variant="secondary"[\s\S]{0,180}className="candidate-source-verification-action"/);
    assert.match(reports, /report-list-card \$\{selectedReport\?\.report_id/);
    assert.match(reports, /aria-current=\{selectedReport\?\.report_id/);
  });

  it("keeps fields, radio categories and owner filters visibly semantic", async () => {
    const [feedback, css] = await Promise.all([
      source("src/components/Feedback.tsx"),
      source("src/index.css"),
    ]);
    assert.match(feedback, /<fieldset>/);
    assert.match(feedback, /<legend>\{copy\.category\}<\/legend>/);
    assert.match(feedback, /type="radio"/);
    assert.match(feedback, /checked=\{category === value\}/);
    assert.match(feedback, /<label className="feedback-field">[\s\S]*?<input/);
    assert.match(feedback, /<label className="feedback-field">[\s\S]*?<textarea/);
    assert.match(feedback, /<label>\{copy\.category\}[\s\S]*?<select/);
    assert.match(css, /\.feedback-category:has\(input:focus-visible\)/);
    assert.match(css, /\.feedback-category\.selected/);
  });

  it("associates disabled controls with visible reasons", async () => {
    const [feedback, ownerRefresh, promotion] = await Promise.all([
      source("src/components/Feedback.tsx"),
      source("src/components/OwnerOperationsPanel.tsx"),
      source("src/components/EstablishedPromotionPanel.tsx"),
    ]);
    assert.match(feedback, /disabled aria-describedby="feedback-export-help"/);
    assert.match(feedback, /id="feedback-export-help"/);
    assert.match(feedback, /aria-describedby=\{!formComplete \? "feedback-submit-help"/);
    assert.match(ownerRefresh, /status\.mode === "REVIEW_SAFE"/);
    assert.match(ownerRefresh, /id="owner-refresh-disabled-help"/);
    assert.match(promotion, /id="established-promotion-disabled-help"/);
    assert.match(promotion, /disabled=\{!canAdd\}/);
  });

  it("describes every missing feedback requirement without showing a waiting state", async () => {
    const markup = render(React.createElement(Feedback, {
      screenContext: "candidate-results",
      initialPublicStatus: {
        capture_available: true,
        feedback_status: "READY",
        submission_enabled: true,
        max_title_length: 120,
        max_details_length: 3_000,
        supported_categories: ["BLOCKER", "IMPROVEMENT", "CLARIFICATION", "LATER"],
      },
      initialOwnerStatus: null,
    }), "pl");
    const css = await source("src/index.css");
    assert.match(markup, /Wybierz kategorię/);
    assert.match(markup, /Tytuł: 0 z wymaganych 5 znaków/);
    assert.match(markup, /Opis: 0 z wymaganych 20 znaków/);
    assert.match(markup, /id="feedback-submit-help" role="status" aria-live="polite"/);
    assert.match(markup, /disabled=""/);
    assert.doesNotMatch(markup, /aria-busy="true"|Zapisywanie/);
    assert.match(css, /\.action-button:disabled:not\(\[aria-busy="true"\]\)[\s\S]*?cursor: not-allowed/);
    assert.match(css, /\.action-button\[aria-busy="true"\]::after/);
    assert.doesNotMatch(css, /\.feedback[^\n{]*\{[^}]*cursor:\s*wait/);
  });

  it("keeps final verification, methodology and owner-release hierarchy semantic", async () => {
    const [detail, verification, methodology, control, translations, css] = await Promise.all([
      source("src/components/CandidateDetailView.tsx"),
      source("src/components/ExternalVerificationLinksView.tsx"),
      source("src/components/Methodology.tsx"),
      source("src/components/ProductControlCenter.tsx"),
      source("src/productI18n.tsx"),
      source("src/index.css"),
    ]);
    assert.doesNotMatch(detail, /candidate-detail-hero-back/);
    assert.match(detail, /product-detail-actions[\s\S]{0,260}variant="secondary"/);
    assert.match(verification, /ExternalLinkAction variant="secondary" className="external-check-link"/);
    assert.match(verification, /CopyButton className="external-check-copy-button"/);
    assert.match(css, /\.external-check-copy-button > \.action-button--tertiary/);
    assert.match(methodology, /<nav className="methodology-toc"/);
    assert.match(methodology, /href=\{`#\$\{link\.id\}`\}/);
    assert.match(methodology, /<ProductIcon name="arrow" \/>/);
    assert.doesNotMatch(methodology, /aria-current|onClick/);
    for (const gate of ["TRUSTED_TESTER_PREVIEW_MODE", "VPS_DEPLOYMENT", "DOMAIN_ACCESS_SMOKE", "ROLLBACK_TEST", "OWNER_TESTER_APPROVAL"]) {
      assert.match(control, new RegExp(`"${gate}"`));
    }
    assert.match(control, /product-control-release-checklist/);
    assert.match(control, /data-interaction="read-only"/);
    assert.doesNotMatch(control.match(/<section className="control-section product-control-blockers"[\s\S]*?<\/section>/)?.[0] ?? "", /onClick|tabIndex|role="button"/);
    for (const label of ["Tryb podglądu zaufanego testera", "Wdrożenie na VPS", "Test domeny i Cloudflare Access", "Test rollbacku/wycofania", "Zgoda właściciela na dostęp testera"]) {
      assert.match(translations, new RegExp(label));
    }
  });

  it("has no interactive divs, role-button shims or injected markup", async () => {
    const componentNames = await readdir(resolve(productRoot, "src", "components"));
    const sources = await Promise.all(componentNames
      .filter((name) => name.endsWith(".tsx"))
      .map((name) => source(`src/components/${name}`)));
    const joined = sources.join("\n");
    assert.doesNotMatch(joined, /<(?:div|article|span)[^>]*\bonClick=/);
    assert.doesNotMatch(joined, /role="button"/);
    assert.doesNotMatch(joined, /dangerouslySetInnerHTML/);
  });

  it("keeps focus, pressed, reduced-motion, mobile hit-area and overflow contracts", async () => {
    const [css, results, shell] = await Promise.all([
      source("src/index.css"),
      source("src/components/CandidateResultsView.tsx"),
      source("src/components/ProductWorkspaceShell.tsx"),
    ]);
    assert.match(css, /:focus-visible/);
    assert.match(css, /\.action-button:active:not\(:disabled\)/);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?animation: none !important/);
    assert.match(css, /@media \(max-width: 420px\)[\s\S]*?min-height: 44px/);
    assert.match(css, /html,[\s\S]*?#root\s*\{[\s\S]*?overflow-x: hidden/);
    assert.match(results, /aria-pressed=\{activeBasket ===/);
    assert.match(shell, /aria-current=\{activeSection === item\.id/);
  });

  it("keeps the frontend provider-free and Refresh view read-only", async () => {
    const files = [
      "src/ProductApp.tsx",
      "src/components/ProductWorkspaceShell.tsx",
      "src/components/CandidateResultsView.tsx",
      "src/components/CandidateDetailView.tsx",
      "src/components/ExternalVerificationLinksView.tsx",
      "src/components/ReportsLibrary.tsx",
      "src/components/Feedback.tsx",
      "src/components/ProductControlCenter.tsx",
    ];
    const joined = (await Promise.all(files.map(source))).join("\n");
    assert.doesNotMatch(joined, /dexscreenerClient|goplusClient|internalBetaCollector|ALLOW_LIVE_PROVIDER_CALLS/);
    assert.match(joined, /onRefresh=\{\(\) => void loadData\(\)\}/);
    assert.doesNotMatch(joined, /onRefresh[\s\S]{0,120}(?:POST|PUT|PATCH|DELETE)/);
  });

  it("ships the safe UX.1 owner-review launcher and portability documentation", async () => {
    const [launcher, documentation] = await Promise.all([
      readFile(resolve(repoRoot, "scripts", "win", "start-interaction-affordance-review.cmd"), "utf8"),
      readFile(resolve(repoRoot, "docs", "interaction_affordance_system.md"), "utf8").catch(() => ""),
    ]);
    const canonicalLauncher = await readFile(resolve(repoRoot, "scripts", "win", "start-product-radar-review.cmd"), "utf8");
    for (const option of ["--detail", "--feedback", "--owner-inbox", "--mobile-guide"]) assert.match(launcher, new RegExp(option));
    for (const item of ["Radar i karta tokena", "Candidate Detail", "Verification", "Reports", "Feedback", "Owner Inbox", "Methodology", "Control Center", "Mobile 390 px", "Keyboard-only"]) assert.match(launcher, new RegExp(item));
    assert.match(launcher, /CRYPTO_EDGE_RUNTIME_MODE=INTERNAL_BETA/);
    assert.match(launcher, /CRYPTO_EDGE_OWNER_OPERATIONS_MODE=DISABLED/);
    assert.match(launcher, /--feedback --owner-operations-review/);
    assert.match(launcher, /Owner Inbox \^\(wymaga --owner-inbox i REVIEW_SAFE\^\)/);
    assert.match(canonicalLauncher, /if \/i not "%RADAR_VIEW%"=="control-center" if \/i not "%RADAR_VIEW%"=="feedback"/);
    assert.doesNotMatch(launcher, /PUBLIC_BETA|OWNER_OPERATIONS_MODE=ENABLED|call[^\n]*collector/i);
    assert.match(documentation, /shadcn\/ui/);
    assert.match(documentation, /Button `default`/);
    assert.match(documentation, /Accordion|Collapsible/);
  });
});
