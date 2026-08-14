import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { resolve } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import TestRenderer from "react-test-renderer";
import { CandidateDetailView } from "../src/components/CandidateDetailView.js";
import { ExternalVerificationLinksView } from "../src/components/ExternalVerificationLinksView.js";
import { ResearchChecklistDetail, ResearchChecklistSummary } from "../src/components/ResearchChecklist.js";
import { ProductLocaleProvider } from "../src/productI18n.js";
import { resolveResearchChecklist } from "../src/researchChecklistResolver.js";
import type { UiTokenCandidate } from "../src/types/scannerTypes.js";

const { act, create } = TestRenderer;

const candidate: UiTokenCandidate = {
  id: "candidate-a", runId: "run-a", symbol: "PASS", name: "Pass Token", chain: "base", dex: "uniswap", source: "dexscreener", contractAddress: "0x1111111111111111111111111111111111111111", pairAddress: "0x2222222222222222222222222222222222222222", sourceUrl: "https://example.com/pair", discoveryBasket: "new_emerging", discoveryMethod: "dexscreener_latest_token_profiles", observationOnly: false, establishedEligible: false, universeVersion: null, universeEntryIndex: null, addressIdentityVerified: true,
  priceUsd: 1, marketCap: 1_000_000, fdvUsd: 1_000_000, liquidity: 120_000, volume24h: 100_000, volumeMarketCapRatio: 0.1, pairCreatedAt: "2026-01-01T00:00:00.000Z", pairAgeDays: 30,
  basicFilterStatus: "passed_basic_filter", securityLabel: "SECURITY_PASSED", finalLabel: "WATCHLIST", mainReason: "Eligible for further review", filterReasons: [], criticalReasons: [], warningReasons: [], finalReasons: [], missingData: [], riskFlags: [],
  security: { sources: ["goplus", "honeypot"], coverageStatus: null, honeypotStatus: "passed", buyTax: 3, sellTax: 4, contractVerified: true, ownershipStatus: "renounced", liquidityLocked: true, liquidityLockDays: 120, mintRisk: false, blacklistRisk: false, whitelistRisk: false, sellRestrictionRisk: false, proxyRisk: false, topWalletPct: 8.5, top10WalletsPct: 34.2, checkedAt: "2026-08-12T12:00:00.000Z" },
  scorecard: null, lastCheckedAt: "2026-08-12T12:00:00.000Z",
};

test("PC.3A presents the same checklist state in PL/EN without raw research enums and preserves 7/6 tabs", () => {
  const model = resolveResearchChecklist(candidate);
  assert.equal(model.current_step, 2);
  assert.equal(model.steps.length, 7);

  const polish = renderToStaticMarkup(<ProductLocaleProvider initialLocale="pl"><ResearchChecklistDetail candidate={candidate} /></ProductLocaleProvider>);
  const english = renderToStaticMarkup(<ProductLocaleProvider initialLocale="en"><ResearchChecklistDetail candidate={candidate} /></ProductLocaleProvider>);
  assert.match(polish, /Sprawdzone automatycznie/);
  assert.match(polish, /Brak danych/);
  assert.match(english, /Automatically checked/);
  assert.match(english, /Missing data/);
  assert.doesNotMatch(polish, /AUTO_VERIFIED|MISSING_DATA|RED_FLAG/);
  assert.doesNotMatch(english, /AUTO_VERIFIED|MISSING_DATA|RED_FLAG/);

  const detail = renderToStaticMarkup(<ProductLocaleProvider initialLocale="pl"><CandidateDetailView candidate={candidate} initialOwnerPromotionStatus={null} /></ProductLocaleProvider>);
  const drawer = renderToStaticMarkup(<ProductLocaleProvider initialLocale="pl"><ExternalVerificationLinksView candidate={candidate} /></ProductLocaleProvider>);
  const detailEnglish = renderToStaticMarkup(<ProductLocaleProvider initialLocale="en"><CandidateDetailView candidate={candidate} initialOwnerPromotionStatus={null} /></ProductLocaleProvider>);
  assert.equal((detail.match(/role="tab"/g) ?? []).length, 7);
  assert.equal((drawer.match(/role="tab"/g) ?? []).length, 6);
  assert.match(detail, /Dane bazowe kompletne/);
  assert.match(detail, /Research niekompletny/);
  assert.match(detailEnglish, /Base data complete/);
});

test("PC.3A compact playbook uses native buttons to target every detailed step, including keyboard activation", async () => {
  const originalFetch = globalThis.fetch;
  const originalActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const requests: string[] = [];
  const opened: number[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    requests.push(String(input));
    return new Response("{}", { status: 404, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  let renderer: ReturnType<typeof create> | undefined;
  try {
    await act(async () => {
      renderer = create(<ProductLocaleProvider initialLocale="pl"><ResearchChecklistSummary candidate={candidate} onOpenStep={(step) => opened.push(step)} /></ProductLocaleProvider>);
    });
    const steps = renderer!.root.findAll((node) => node.props["data-research-step-nav"] !== undefined);
    assert.deepEqual(steps.map((step) => step.props["data-research-step-nav"]), [1, 2, 3, 4, 5, 6, 7]);
    assert.ok(steps.every((step) => step.type === "button" && step.props.type === "button"));

    await act(async () => { steps[2]!.props.onClick(); });
    let prevented = false;
    await act(async () => { steps[2]!.props.onKeyDown({ key: "Enter", preventDefault: () => { prevented = true; } }); });
    await act(async () => { steps[2]!.props.onKeyDown({ key: " ", preventDefault: () => { prevented = true; } }); });
    assert.deepEqual(opened, [3, 3, 3]);
    assert.equal(prevented, true);

    const currentStep = renderer!.root.findByProps({ "data-research-current-step-cta": 2 });
    await act(async () => { currentStep.props.onClick(); });
    assert.deepEqual(opened, [3, 3, 3, 2]);
    assert.ok(requests.every((request) => request.startsWith("/api/research-checklist")), "the UI reads only the local research endpoint");
  } finally {
    if (renderer) await act(async () => { renderer!.unmount(); });
    globalThis.fetch = originalFetch;
    globalThis.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
  }
});

test("PC.3A focus mode keeps navigation in normal flow, avoids title duplication and returns to the compact playbook", async () => {
  const detail = renderToStaticMarkup(<ProductLocaleProvider initialLocale="en"><ResearchChecklistDetail candidate={candidate} focusedStep={3} /></ProductLocaleProvider>);
  const polishDetail = renderToStaticMarkup(<ProductLocaleProvider initialLocale="pl"><ResearchChecklistDetail candidate={candidate} focusedStep={3} /></ProductLocaleProvider>);
  const drawer = renderToStaticMarkup(<ProductLocaleProvider initialLocale="en"><ExternalVerificationLinksView candidate={candidate} focusedResearchStep={3} /></ProductLocaleProvider>);
  const normalDrawer = renderToStaticMarkup(<ProductLocaleProvider initialLocale="en"><ExternalVerificationLinksView candidate={candidate} initialActiveTab="data" onOpenResearchBrief={() => undefined} /></ProductLocaleProvider>);
  assert.match(detail, /id="research-checklist-step-3"[^>]*data-research-step="3"[^>]*data-research-focused="true"/);
  assert.match(detail, /id="research-checklist-focus-3"[^>]*tabindex="-1"/);
  assert.match(detail, /class="research-checklist-step[^"]*focused/);
  assert.equal((detail.match(/data-research-step="/g) ?? []).length, 1, "focus mode renders one detailed step");
  assert.doesNotMatch(detail, /research-checklist-step-[124567]/);
  assert.match(detail, /← Back to Research Playbook/);
  assert.match(detail, /Step 3\/7/);
  const navigationStart = detail.indexOf("data-research-focus-navigation");
  const stepCardStart = detail.indexOf("id=\"research-checklist-step-3\"");
  const focusNavigation = detail.slice(navigationStart, stepCardStart);
  assert.ok(navigationStart >= 0 && navigationStart < stepCardStart, "Back navigation precedes the focused step card");
  assert.doesNotMatch(focusNavigation, /Security \/ 3 checks/, "the navigation does not duplicate the full step title");
  assert.match(polishDetail, /← Wróć do Research Playbook/);
  assert.match(polishDetail, /Sprawdzone/);
  assert.match(polishDetail, /Czerwone flagi/);
  assert.doesNotMatch(polishDetail, /data-research-item-group="red-flag"/, "empty red-flag groups are omitted in focus mode");
  assert.match(polishDetail, /Główne kontrole/);
  assert.match(polishDetail, /Pokaż szczegóły techniczne \(11\)/);
  assert.match(polishDetail, /Pokaż/);
  assert.doesNotMatch(polishDetail, /data-research-technical-details="3"[^>]*\sopen=/, "technical details start collapsed");
  assert.match(detail, /Key checks/);
  assert.equal((drawer.match(/role="tab"/g) ?? []).length, 6);
  assert.match(drawer, /id="verification-tab-data"[^>]*aria-selected="true"/);
  assert.match(drawer, /id="research-checklist-step-3"/);
  assert.match(drawer, /class="[^"]*verification-token-drawer research-focus-drawer[^"]*"/);
  assert.doesNotMatch(normalDrawer, /research-focus-drawer/, "normal Verification drawers stay bounded");
  assert.doesNotMatch(drawer, /external-checks-list/, "focused research does not show the generic external-card wall");
  assert.doesNotMatch(drawer, /AI Research Brief/, "focused research does not show the generic AI action");
  assert.match(normalDrawer, /external-checks-list/, "normal Data and sources keeps the external-card wall");
  assert.match(normalDrawer, /AI Research Brief/, "normal Data and sources keeps the generic AI action");

  const [researchSource, css] = await Promise.all([
    readFile(resolve(process.cwd(), "src", "components", "ResearchChecklist.tsx"), "utf8"),
    readFile(resolve(process.cwd(), "src", "index.css"), "utf8"),
  ]);
  assert.match(researchSource, /getElementById\(`research-checklist-focus-\$\{focusedStep\}`\)/);
  const navigationCss = css.match(/\.research-focus-navigation\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.match(navigationCss, /position:\s*static/);
  assert.match(navigationCss, /top:\s*auto/);
  assert.match(navigationCss, /z-index:\s*auto/);
  assert.doesNotMatch(navigationCss, /sticky|fixed/);
  assert.match(css, /\.verification-token-drawer\.research-focus-drawer\s*\{[^}]*max-height:\s*none;[^}]*min-height:\s*0;[^}]*overflow:\s*visible;/);
  assert.match(css, /\.research-focus-drawer \.token-detail-drawer-body--tabbed\s*\{[^}]*flex:\s*0 0 auto;[^}]*overflow:\s*visible;/);
  assert.match(css, /\.research-focus-drawer \.token-detail-tabpanel\s*\{[^}]*overflow-x:\s*visible;[^}]*overflow-y:\s*visible;/);
  assert.match(css, /\.detail-panel\s*\{[\s\S]*?max-height:\s*calc\(100vh - 170px\);/, "normal drawers retain their accepted height");
  assert.match(css, /\.token-detail-tabpanel\s*\{[\s\S]*?overflow-y:\s*auto;/, "normal drawers retain their internal tab scrolling");

  const originalFetch = globalThis.fetch;
  const originalActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.fetch = (async () => new Response("{}", { status: 404, headers: { "content-type": "application/json" } })) as typeof fetch;
  const returned: string[] = [];
  let renderer: ReturnType<typeof create> | undefined;
  try {
    await act(async () => {
      renderer = create(<ProductLocaleProvider initialLocale="pl"><ResearchChecklistDetail candidate={candidate} focusedStep={3} onBackToResearchPlaybook={() => returned.push("playbook")} /></ProductLocaleProvider>);
    });
    const back = renderer!.root.findByProps({ "data-research-playbook-back": true });
    assert.equal(back.type, "button");
    assert.equal(back.props.type, "button");
    await act(async () => { back.props.onClick(); });
    assert.deepEqual(returned, ["playbook"]);
  } finally {
    if (renderer) await act(async () => { renderer!.unmount(); });
    globalThis.fetch = originalFetch;
    globalThis.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
  }

  const returnedDetail = renderToStaticMarkup(<ProductLocaleProvider initialLocale="pl"><CandidateDetailView candidate={candidate} initialOwnerPromotionStatus={null} focusResearchPlaybook /></ProductLocaleProvider>);
  assert.match(returnedDetail, /id="research-playbook-summary"[^>]*data-research-playbook-focused="true"/);
  assert.match(returnedDetail, /role="tab"[^>]*aria-selected="true"[^>]*>Podsumowanie/);
});

test("PC.3A focus mode localizes methodology values, omits unavailable rows, and keeps red flags visible", () => {
  const unknownCandidate: UiTokenCandidate = {
    ...candidate,
    security: { ...candidate.security!, honeypotStatus: "unknown", ownershipStatus: "unknown", contractVerified: null, liquidityLocked: null },
  };
  const polish = renderToStaticMarkup(<ProductLocaleProvider initialLocale="pl"><ResearchChecklistDetail candidate={unknownCandidate} focusedStep={2} /></ProductLocaleProvider>);
  const english = renderToStaticMarkup(<ProductLocaleProvider initialLocale="en"><ResearchChecklistDetail candidate={unknownCandidate} focusedStep={2} /></ProductLocaleProvider>);
  assert.match(polish, /Brakuje danych dla 6 dodatkowych kontroli/);
  assert.doesNotMatch(polish, /unknown|\bnull\b|\bundefined\b/i);
  assert.doesNotMatch(polish, /<strong>Zweryfikowany kontrakt<\/strong>/);
  assert.match(english, /Data is unavailable for 6 additional checks/);
  const scorecardPolish = renderToStaticMarkup(<ProductLocaleProvider initialLocale="pl"><ResearchChecklistDetail candidate={candidate} focusedStep={6} /></ProductLocaleProvider>);
  assert.match(scorecardPolish, /SCORECARD RESEARCHU/);
  assert.match(scorecardPolish, /Wynik częściowy/);
  assert.match(scorecardPolish, /Narracja: nieoceniona/);
  assert.doesNotMatch(scorecardPolish, /PC\.3A|not calculated/i);

  const redFlagCandidate: UiTokenCandidate = {
    ...candidate,
    liquidity: 12_000,
    basicFilterStatus: "rejected_basic_filter",
    filterReasons: ["liquidity_below_30000"],
  };
  const redFlag = renderToStaticMarkup(<ProductLocaleProvider initialLocale="pl"><ResearchChecklistDetail candidate={redFlagCandidate} focusedStep={1} /></ProductLocaleProvider>);
  assert.match(redFlag, /Czerwona flaga/);
  assert.match(redFlag, /data-research-red-flag-reveal/);
  assert.match(redFlag, /data-research-technical-red-flags/);
});

test("PC.3A renders ownership only after a known ownership state is resolved", () => {
  const unknownCandidate: UiTokenCandidate = { ...candidate, security: { ...candidate.security!, ownershipStatus: "unknown" } };
  const activeCandidate: UiTokenCandidate = { ...candidate, security: { ...candidate.security!, ownershipStatus: "active" } };
  const unknownPolish = renderToStaticMarkup(<ProductLocaleProvider initialLocale="pl"><ResearchChecklistDetail candidate={unknownCandidate} focusedStep={3} /></ProductLocaleProvider>);
  const unknownEnglish = renderToStaticMarkup(<ProductLocaleProvider initialLocale="en"><ResearchChecklistDetail candidate={unknownCandidate} focusedStep={3} /></ProductLocaleProvider>);
  const activePolish = renderToStaticMarkup(<ProductLocaleProvider initialLocale="pl"><ResearchChecklistDetail candidate={activeCandidate} focusedStep={3} /></ProductLocaleProvider>);
  const renouncedEnglish = renderToStaticMarkup(<ProductLocaleProvider initialLocale="en"><ResearchChecklistDetail candidate={candidate} focusedStep={3} /></ProductLocaleProvider>);
  const ownershipItem = (markup: string, label: string) => {
    const start = markup.indexOf(`<strong>${label}</strong>`);
    assert.ok(start >= 0, `missing ownership item for ${label}`);
    return markup.slice(start, markup.indexOf("</article>", start));
  };

  assert.doesNotMatch(unknownPolish, /<strong>Własność<\/strong>/);
  assert.doesNotMatch(unknownEnglish, /<strong>Ownership<\/strong>/);
  assert.match(unknownPolish, /Pokaż brakujące pola/);
  assert.match(ownershipItem(activePolish, "Własność"), /Własność aktywna/);
  assert.match(ownershipItem(activePolish, "Własność"), /Sprawdzone automatycznie/);
  assert.match(ownershipItem(renouncedEnglish, "Ownership"), /Ownership renounced/);
  assert.match(ownershipItem(renouncedEnglish, "Ownership"), /Automatically checked/);
});

test("PC.3A focus mode collapses unavailable technical schema fields into one compact disclosure", () => {
  const noResolvedSecurity = {
    ...candidate.security!,
    sources: [], honeypotStatus: "unknown", buyTax: null, sellTax: null, contractVerified: null, ownershipStatus: "unknown", liquidityLocked: null,
    mintRisk: null, blacklistRisk: null, whitelistRisk: null, sellRestrictionRisk: null, proxyRisk: null,
  };
  const markup = renderToStaticMarkup(<ProductLocaleProvider initialLocale="pl"><ResearchChecklistDetail candidate={{ ...candidate, security: noResolvedSecurity }} focusedStep={3} /></ProductLocaleProvider>);
  assert.doesNotMatch(markup, /data-research-red-flag-reveal/);
  assert.doesNotMatch(markup, /data-research-technical-details="3"/);
  assert.match(markup, /data-research-unavailable-data="3"/);
  assert.match(markup, /Brakuje danych dla 11 dodatkowych kontroli/);
  assert.match(markup, /Pokaż brakujące pola \(11\)/);
  assert.match(markup, /Pokrycie GoPlus/);
  assert.match(markup, /Blokada płynności/);
  assert.doesNotMatch(markup, /<strong>Pokrycie GoPlus<\/strong>/);
});
