import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import { FEEDBACK_CATEGORIES } from "../src/services/feedbackDataSource.js";

const productRoot = resolve(import.meta.dirname, "..");
const repoRoot = resolve(productRoot, "..", "..");

async function source(path: string): Promise<string> {
  return readFile(resolve(productRoot, path), "utf8");
}

describe("Premium UI.2 presentation contracts", () => {
  it("keeps the real Control Center status, READY feedback and blocker semantics", async () => {
    const [component, resolver, i18n] = await Promise.all([
      source("src/components/ProductControlCenter.tsx"),
      source("src/controlCenterStatus.ts"),
      source("src/productI18n.tsx"),
    ]);
    assert.match(component, /const overallStatus = status\?\.overallStatus \?\? "NOT_READY"/);
    assert.match(component, /status=\{status\.feedback\.status\}/);
    assert.match(component, /status\?\.unmetGates/);
    assert.match(component, /Gotowość danych/);
    assert.match(component, /Możliwości produktu/);
    assert.match(component, /Dostęp i wdrożenie/);
    assert.doesNotMatch(component, /setOverallStatus|overallStatus\s*=\s*"READY"/);
    assert.match(resolver, /if \(feedbackStatus !== "READY"\) unmetGates\.push\("PERSISTENT_FEEDBACK_CAPTURE"\)/);
    for (const label of ["Środowisko i API", "Dane i migawki", "Koszyk Established", "Dalsza obserwacja", "Zapis analiz"]) {
      assert.match(i18n, new RegExp(label));
    }
    const polishCopy = i18n.slice(
      i18n.indexOf("const PL: TranslationTable"),
      i18n.indexOf("export const PRODUCT_TRANSLATIONS"),
    );
    assert.match(polishCopy, /Środowisko i API/);
    assert.doesNotMatch(polishCopy, /same-origin API/);
    assert.match(polishCopy, /do przeglądu właściciela/);
    assert.match(polishCopy, /reguł stanu źródeł współdzielonych z Radarem/);
    assert.doesNotMatch(polishCopy, /do przeglądu ownera|reguł source health współdzielonych z Product Radar/);
  });

  it("keeps public feedback API categories and a receipt without raw session data", async () => {
    const [feedback, service, app] = await Promise.all([
      source("src/components/Feedback.tsx"),
      source("src/services/feedbackDataSource.ts"),
      source("src/ProductApp.tsx"),
    ]);
    assert.deepEqual(FEEDBACK_CATEGORIES, ["BLOCKER", "IMPROVEMENT", "CLARIFICATION", "LATER"]);
    for (const category of FEEDBACK_CATEGORIES) assert.match(feedback, new RegExp(category));
    assert.match(feedback, /FeedbackReceiptPanel/);
    assert.match(feedback, /ALREADY_RECORDED/);
    assert.match(feedback, /rate_limited/);
    assert.match(feedback, /aria-live="polite"/);
    assert.match(feedback, /formComplete/);
    assert.match(feedback, /useState<FeedbackCategory \| null>\(null\)/);
    assert.match(feedback, /category !== null/);
    assert.match(feedback, /Opinia nie zmienia Radaru, oceny, cyklu obserwacji/);
    assert.doesNotMatch(feedback, /Opinia nie zmienia Radaru, scoringu, cyklu obserwacji/);
    assert.doesNotMatch(feedback, /detail\.session_group\}/);
    assert.doesNotMatch(feedback, /session_id|Raw session/i);
    assert.match(service, /credentials:\s*"same-origin"/);
    assert.match(feedback, /initialReceipt\?: FeedbackReceipt/);
    assert.match(feedback, /initialReceipt \? "success" : "idle"/);
    assert.doesNotMatch(app, /ui2-receipt|getLocalUi2ReceiptReview|fb_00000000/);
  });

  it("keeps owner inbox and exports behind the existing owner capability", async () => {
    const [feedback, handler] = await Promise.all([
      source("src/components/Feedback.tsx"),
      source("server/scannerApiHandler.ts"),
    ]);
    assert.match(feedback, /if \(!status\) return null/);
    assert.match(feedback, /getOwnerFeedbackExportUrl\("json"\)/);
    assert.match(feedback, /getOwnerFeedbackExportUrl\("csv"\)/);
    assert.match(feedback, /owner-feedback-empty-state/);
    assert.match(feedback, /status\.total_count === 0/);
    assert.match(feedback, /<button type="button" disabled>\{copy\.exportJson\}<\/button>/);
    assert.match(handler, /requireOwnerFeedbackCapability\(req, ownerMode\)/);
    assert.match(handler, /mode !== "DISABLED" && isLocalOwnerRequest\(req\)/);
    assert.doesNotMatch(feedback, /mark.*resolved|addComment|updateFeedback/i);
  });

  it("keeps Reports read-only and moves technical identifiers out of its primary hierarchy", async () => {
    const [reports, dataSource] = await Promise.all([
      source("src/components/ReportsLibrary.tsx"),
      source("src/services/reportsDataSource.ts"),
    ]);
    assert.match(reports, /TechnicalDetails label=\{copy\.technicalDetails\}/);
    assert.match(reports, /report\.report_version/);
    assert.match(reports, /copy\.researchReport/);
    assert.match(reports, /copy\.available/);
    assert.match(reports, /libraryIsEmpty/);
    assert.match(reports, /reports-library-empty-panel/);
    assert.match(reports, /Biblioteka przechowuje do 100 najnowszych raportów\. Dane techniczne plików pozostają ukryte\./);
    assert.doesNotMatch(reports, />\{report\.validation_status\}</);
    assert.match(dataSource, /method:\s*"GET"/);
    assert.doesNotMatch(dataSource, /POST|PUT|PATCH|DELETE|provider|collector/i);
  });

  it("keeps Verification manual and provider-free", async () => {
    const [verification, targets, i18n] = await Promise.all([
      source("src/components/ExternalVerificationLinksView.tsx"),
      source("src/externalVerificationTargets.ts"),
      source("src/productI18n.tsx"),
    ]);
    for (const section of ["verification.identity", "Dane rynkowe", "Kontrakt i eksplorator", "Status bezpieczeństwa", "Źródła zewnętrzne", "Lista ręcznej weryfikacji"]) {
      assert.match(verification, new RegExp(section));
    }
    assert.doesNotMatch(verification, /fetch\(|axios|XMLHttpRequest|submit/i);
    assert.doesNotMatch(targets, /fetch\(|axios|XMLHttpRequest/);
    assert.match(verification, /securityManual/);
    assert.doesNotMatch(verification, /Honeypot\.is nie uruchamia się automatycznie/);
    for (const label of ["Wymaga ręcznej weryfikacji", "Dozwolony link zewnętrzny", "Kopiuj kontrakt", "Kopiuj adres pary", "Kopiuj link"]) {
      assert.match(i18n, new RegExp(label));
    }
    assert.match(targets, /copyLabel: "Copy Pair Address"/);
    assert.match(targets, /copyLabel: "Copy Link"/);
  });

  it("presents Methodology as a document without changing frozen thresholds", async () => {
    const [methodology, i18n] = await Promise.all([
      source("src/components/Methodology.tsx"),
      source("src/productI18n.tsx"),
    ]);
    for (const id of ["method-lifecycle", "method-sources", "method-filters", "method-security", "method-statuses", "method-limitations"]) {
      assert.match(methodology, new RegExp(id));
    }
    for (const filterKey of ["filter.marketCapRange", "filter.volumeMinimum", "filter.liquidityMinimum", "filter.ratioRange", "filter.pairAgeMinimum"]) {
      assert.match(methodology, new RegExp(filterKey.replace(".", "\\.")));
    }
    assert.match(i18n, /Market cap is between USD 300,000 and USD 10,000,000/);
    assert.match(i18n, /Pair age exceeds 7 days/);
    for (const label of ["Nowe \/ obserwacja", "Dalsza obserwacja", "Kandydat do Established"]) {
      assert.match(i18n, new RegExp(label));
    }
    assert.match(methodology, /Cykl obserwacji/);
    assert.match(methodology, /dostawców danych/);
    const polishMethodology = methodology.slice(methodology.indexOf("  pl:"), methodology.indexOf("  en:"));
    const polishMethodCopy = i18n.slice(
      i18n.indexOf('"method.eyebrow"', i18n.indexOf("const PL: TranslationTable")),
      i18n.indexOf("export const PRODUCT_TRANSLATIONS"),
    );
    for (const forbidden of ["Lifecycle", "Emerging", "Follow-up", "Candidate for Established", "providerzy"]) {
      assert.equal(polishMethodology.includes(forbidden), false, forbidden);
      assert.equal(polishMethodCopy.includes(forbidden), false, forbidden);
    }
  });

  it("keeps Run ID in Candidate Detail technical details and renders readable failed-condition rows", async () => {
    const detail = await source("src/components/CandidateDetailView.tsx");
    const freshnessSection = detail.slice(detail.indexOf('aria-labelledby="freshness-heading"'), detail.indexOf('aria-labelledby="filters-heading"'));
    assert.doesNotMatch(freshnessSection, /DetailField label=\{t\("detail\.runId"\)\}/);
    assert.match(freshnessSection, /TechnicalDetails label=\{t\("app\.technicalDetails"\)\}/);
    assert.match(freshnessSection, /<dt>\{t\("detail\.runId"\)\}<\/dt>/);
    assert.match(detail, /failed-condition-row/);
    assert.match(detail, /actual/);
    assert.match(detail, /required/);
    assert.match(detail, /buildFailedFilterRow/);
  });

  it("keeps complete PL/EN tagline, routes, focus, mobile overflow and reduced motion", async () => {
    const [i18n, app, css, ui] = await Promise.all([
      source("src/productI18n.tsx"),
      source("src/ProductApp.tsx"),
      source("src/index.css"),
      source("src/components/ProductUi.tsx"),
    ]);
    assert.match(i18n, /Digital asset research radar/);
    assert.match(i18n, /Radar badawczy aktywów cyfrowych/);
    for (const route of ["#control-center", "#reports", "#feedback", "#external-checks", "#methodology"]) assert.match(app, new RegExp(route));
    assert.match(css, /\.product-mark p \{ white-space: normal; overflow: visible; text-overflow: clip; \}/);
    assert.match(css, /html,[\s\S]*?#root\s*\{[\s\S]*?overflow-x: hidden/);
    assert.match(css, /:focus-visible/);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
    assert.match(css, /min-height: 44px/);
    assert.match(ui, /aria-expanded=\{open\}/);
  });

  it("keeps UI.2 presentation injection-free, provider-free and refresh read-only", async () => {
    const files = [
      "src/components/ProductControlCenter.tsx",
      "src/components/ReportsLibrary.tsx",
      "src/components/Feedback.tsx",
      "src/components/ExternalVerificationLinksView.tsx",
      "src/components/Methodology.tsx",
      "src/components/CandidateDetailView.tsx",
    ];
    const joined = (await Promise.all(files.map(source))).join("\n");
    assert.doesNotMatch(joined, /dangerouslySetInnerHTML/);
    assert.doesNotMatch(joined, /dexscreenerClient|goplusClient|internalBetaCollector|ALLOW_LIVE_PROVIDER_CALLS/);
    const controlDataSource = await source("src/services/controlCenterStatusDataSource.ts");
    assert.match(controlDataSource, /method:\s*"GET"/);
    assert.doesNotMatch(controlDataSource, /POST|PUT|PATCH|DELETE/);
  });

  it("extends the single safe owner review launcher with UI.2", async () => {
    const launcher = await readFile(resolve(repoRoot, "scripts", "win", "start-premium-ui-review.cmd"), "utf8");
    assert.match(launcher, /--ui2/);
    assert.match(launcher, /--control-center --owner-operations-review/);
    for (const label of ["Control Center", "Reports", "Feedback", "Owner Feedback Inbox", "Verification", "Methodology"]) assert.match(launcher, new RegExp(label));
    assert.match(launcher, /CRYPTO_EDGE_RUNTIME_MODE=INTERNAL_BETA/);
    assert.doesNotMatch(launcher, /DEVELOPMENT_DEMO|run collector|PUBLIC_BETA|OWNER_OPERATIONS_MODE=ENABLED/);
  });
});
