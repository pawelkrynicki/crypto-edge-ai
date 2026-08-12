import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CandidateDetailView } from "../src/components/CandidateDetailView.js";
import { ExternalVerificationLinksView } from "../src/components/ExternalVerificationLinksView.js";
import { ResearchChecklistDetail } from "../src/components/ResearchChecklist.js";
import { ProductLocaleProvider } from "../src/productI18n.js";
import { resolveResearchChecklist } from "../src/researchChecklistResolver.js";
import type { UiTokenCandidate } from "../src/types/scannerTypes.js";

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
  assert.equal((detail.match(/role="tab"/g) ?? []).length, 7);
  assert.equal((drawer.match(/role="tab"/g) ?? []).length, 6);
});
