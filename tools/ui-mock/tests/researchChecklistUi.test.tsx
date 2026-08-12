import assert from "node:assert/strict";
import { test } from "node:test";
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

test("PC.3A focuses Step 3 in the existing Data and sources drawer without changing tab counts", () => {
  const detail = renderToStaticMarkup(<ProductLocaleProvider initialLocale="en"><ResearchChecklistDetail candidate={candidate} focusedStep={3} /></ProductLocaleProvider>);
  const drawer = renderToStaticMarkup(<ProductLocaleProvider initialLocale="en"><ExternalVerificationLinksView candidate={candidate} focusedResearchStep={3} /></ProductLocaleProvider>);
  assert.match(detail, /id="research-checklist-step-3"[^>]*data-research-step="3"[^>]*data-research-focused="true"/);
  assert.match(detail, /class="research-checklist-step[^"]*focused/);
  assert.match(detail, /Research incomplete/);
  assert.equal((drawer.match(/role="tab"/g) ?? []).length, 6);
  assert.match(drawer, /id="verification-tab-data"[^>]*aria-selected="true"/);
  assert.match(drawer, /id="research-checklist-step-3"/);
});
