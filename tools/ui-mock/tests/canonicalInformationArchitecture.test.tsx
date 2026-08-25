import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  resolveResearchChecklistStep,
  resolveResearchPlaybookFocus,
  resolveResearchVerificationCheck,
  writeResearchPlaybookRoute,
  writeVerificationRoute,
} from "../src/candidateDetailRoute.js";
import { CANDIDATE_DETAIL_TAB_IDS } from "../src/candidateDetailTabs.js";
import { CandidateDetailView } from "../src/components/CandidateDetailView.js";
import { ExternalVerificationLinksView } from "../src/components/ExternalVerificationLinksView.js";
import { followUpToResearchCandidate } from "../src/followUpResearchCandidate.js";
import { ProductLocaleProvider } from "../src/productI18n.js";
import { RESEARCH_PLAYBOOK_STAGES } from "../src/researchPlaybookStages.js";
import { resolveResearchChecklist } from "../src/researchChecklistResolver.js";
import type { FollowUpPublicEntry } from "../src/types/followUpTypes.js";
import type { UiTokenCandidate } from "../src/types/scannerTypes.js";

void React;

const candidate: UiTokenCandidate = {
  id: "canonical-ia",
  runId: "canonical-ia",
  symbol: "MAX",
  name: "Max",
  chain: "bsc",
  dex: "pancakeswap",
  source: "dexscreener",
  contractAddress: "0xe9bc5c6a86caa44fd7b469bf3cc7c563e4f77777",
  pairAddress: "0x1111111111111111111111111111111111111111",
  sourceUrl: "https://dexscreener.com/bsc/0x1111111111111111111111111111111111111111",
  discoveryBasket: "new_emerging",
  discoveryMethod: "dexscreener_latest_token_profiles",
  observationOnly: false,
  establishedEligible: false,
  universeVersion: null,
  universeEntryIndex: null,
  addressIdentityVerified: true,
  priceUsd: 0.002,
  marketCap: 2_000_000,
  fdvUsd: 2_000_000,
  liquidity: 155_000,
  volume24h: 700_000,
  volumeMarketCapRatio: 0.35,
  pairCreatedAt: "2026-08-01T00:00:00.000Z",
  pairAgeDays: 24,
  basicFilterStatus: "passed_basic_filter",
  securityLabel: "PARTIAL",
  finalLabel: "NEEDS_MANUAL_VERIFICATION",
  mainReason: "Manual verification required",
  filterReasons: [],
  criticalReasons: [],
  warningReasons: [],
  finalReasons: [],
  missingData: ["honeypot_status"],
  riskFlags: [],
  security: {
    sources: ["goplus"],
    coverageStatus: null,
    honeypotStatus: "unknown",
    buyTax: null,
    sellTax: null,
    contractVerified: null,
    ownershipStatus: "unknown",
    liquidityLocked: null,
    liquidityLockDays: null,
    mintRisk: null,
    blacklistRisk: null,
    whitelistRisk: null,
    sellRestrictionRisk: null,
    proxyRisk: null,
    topWalletPct: null,
    top10WalletsPct: null,
    checkedAt: "2026-08-17T13:32:08.630Z",
  },
  scorecard: null,
  lastCheckedAt: "2026-08-17T13:32:08.630Z",
};

const followUp: FollowUpPublicEntry = {
  entry_id: "fup_1111111111111111",
  chain: candidate.chain,
  contract_address: candidate.contractAddress,
  display_name: candidate.name,
  symbol: candidate.symbol,
  pair_address: candidate.pairAddress,
  lifecycle_status: "CANDIDATE_FOR_ESTABLISHED",
  pair_age: candidate.pairAgeDays,
  first_seen_at: candidate.pairCreatedAt,
  last_seen_at: candidate.lastCheckedAt,
  last_checked_at: candidate.lastCheckedAt,
  market_observed_at: candidate.lastCheckedAt,
  next_check_at: "2026-08-31T11:47:00.000Z",
  completed_checkpoints: [1, 3, 7, 14],
  market_metrics: {
    price_usd: candidate.priceUsd,
    market_cap_usd: candidate.marketCap,
    fdv_usd: candidate.fdvUsd,
    liquidity_usd: candidate.liquidity,
    volume_24h_usd: candidate.volume24h,
    volume_market_cap_ratio: candidate.volumeMarketCapRatio,
  },
  filter_status: "passed_basic_filter",
  filter_reasons: [],
  security_status: "PARTIAL",
  missing_data: ["honeypot_status"],
  established_membership: false,
  next_review_step: "OWNER_DECISION_REQUIRED",
};

function render(locale: "pl" | "en", node: React.ReactElement): string {
  return renderToStaticMarkup(<ProductLocaleProvider initialLocale={locale}>{node}</ProductLocaleProvider>);
}

test("canonical product IA keeps one master, seven Candidate tabs and six Verification tools", () => {
  const checklist = resolveResearchChecklist(candidate);
  const summary = render("pl", <CandidateDetailView candidate={candidate} initialOwnerPromotionStatus={null} />);
  const focused = render("pl", <CandidateDetailView candidate={candidate} initialOwnerPromotionStatus={null} focusedResearchStep={3} />);
  const verification = render("pl", <ExternalVerificationLinksView candidate={candidate} focusedResearchStep={3} focusedResearchCheck="honeypot" />);

  assert.equal(CANDIDATE_DETAIL_TAB_IDS.length, 7);
  assert.equal((summary.match(/role="tab"/g) ?? []).length, 7);
  assert.equal((verification.match(/role="tab"/g) ?? []).length, 6);
  assert.equal(RESEARCH_PLAYBOOK_STAGES.length, 7);
  assert.equal((summary.match(/data-research-playbook-progress-stage="[1-7]"/g) ?? []).length, 7);
  assert.equal((summary.match(/data-research-step-nav="[1-7]"/g) ?? []).length, 7);
  assert.match(summary, new RegExp(`data-research-current-step-cta="${checklist.current_step}"`));
  assert.match(focused, /research-checklist-focus-3/);
  assert.match(focused, /data-research-verification-action="honeypot"/);
  assert.doesNotMatch(focused, /verification-tab-data/);
  assert.match(verification, /data-research-playbook-context="verification"/);
  assert.match(verification, new RegExp(`data-research-playbook-current-step="${checklist.current_step}"`));
  assert.match(verification, /sprawdzany punkt: Honeypot/);
  assert.doesNotMatch(verification, /research-checklist-focus-3/);
  assert.doesNotMatch(verification, /data-research-playbook-progress-tracker/);
});

test("canonical routes preserve candidate identity, focused step and specific verification context", () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const location = new URL("http://127.0.0.1:4180/?locale=pl");
  const fakeWindow = {
    get location() { return location; },
    history: { pushState: (_state: unknown, _title: string, next: URL) => { location.href = String(next); } },
  };
  Object.defineProperty(globalThis, "window", { configurable: true, value: fakeWindow });
  try {
    const identity = { chain: candidate.chain, contract_address: candidate.contractAddress };
    writeResearchPlaybookRoute(identity, 3);
    assert.equal(resolveResearchPlaybookFocus(), true);
    assert.equal(resolveResearchChecklistStep(), 3);
    assert.equal(location.hash, "#candidate-detail");
    writeVerificationRoute(identity, 3, "honeypot");
    assert.equal(resolveResearchPlaybookFocus(), false);
    assert.equal(resolveResearchChecklistStep(), 3);
    assert.equal(resolveResearchVerificationCheck(), "honeypot");
    assert.equal(location.hash, "#external-checks");
  } finally {
    Object.defineProperty(globalThis, "window", originalWindow ?? { configurable: true, value: undefined });
  }
});

test("one Checklist current step is composed consistently across every Playbook surface", () => {
  const checklist = resolveResearchChecklist(candidate);
  const summary = render("pl", <CandidateDetailView candidate={candidate} initialOwnerPromotionStatus={null} />);
  const ai = render("pl", <CandidateDetailView candidate={candidate} initialOwnerPromotionStatus={null} activeTab="ai" />);
  const focused = render("pl", <CandidateDetailView candidate={candidate} initialOwnerPromotionStatus={null} focusedResearchStep={checklist.current_step} />);
  const verification = render("pl", <ExternalVerificationLinksView candidate={candidate} focusedResearchStep={checklist.current_step} focusedResearchCheck="honeypot" />);

  assert.match(summary, new RegExp(`data-research-current-step-cta="${checklist.current_step}"`));
  assert.match(ai, new RegExp(`data-research-playbook-current-step="${checklist.current_step}"`));
  assert.match(ai, new RegExp(`Aktualny etap: ${checklist.current_step}/7`));
  assert.doesNotMatch(ai, /data-research-playbook-progress-tracker/);
  assert.match(focused, new RegExp(`Krok ${checklist.current_step}/7`));
  assert.match(verification, new RegExp(`data-research-playbook-current-step="${checklist.current_step}"`));
  assert.match(verification, new RegExp(`Narzędzie dla kroku ${checklist.current_step}/7`));
});

test("all seven stages are inspectable in Summary without creating a Verification playbook", () => {
  for (const stage of RESEARCH_PLAYBOOK_STAGES) {
    const focused = render("en", <CandidateDetailView
      candidate={candidate}
      initialOwnerPromotionStatus={null}
      focusedResearchStep={stage.number}
    />);
    assert.match(focused, new RegExp(`research-checklist-focus-${stage.number}`));
    assert.match(focused, new RegExp(`Step ${stage.number}/7`));
    assert.doesNotMatch(focused, /verification-tab-data/);
  }
});

test("the canonical Follow-up read model receives the same Summary master and AI context", () => {
  const projected = followUpToResearchCandidate(followUp);
  const checklist = resolveResearchChecklist(projected);
  const summary = render("pl", <CandidateDetailView candidate={null} followUp={followUp} initialOwnerPromotionStatus={null} />);
  const ai = render("pl", <CandidateDetailView candidate={null} followUp={followUp} initialOwnerPromotionStatus={null} activeTab="ai" />);
  const verification = render("pl", <ExternalVerificationLinksView followUp={followUp} focusedResearchStep={3} focusedResearchCheck="honeypot" />);

  assert.equal(projected.contractAddress, followUp.contract_address);
  assert.equal(projected.marketCap, followUp.market_metrics.market_cap_usd);
  assert.match(summary, new RegExp(`data-research-current-step-cta="${checklist.current_step}"`));
  assert.equal((summary.match(/data-research-step-nav="[1-7]"/g) ?? []).length, 7);
  assert.match(ai, new RegExp(`data-research-playbook-current-step="${checklist.current_step}"`));
  assert.match(verification, /data-research-playbook-context="verification"/);
  assert.match(verification, /sprawdzany punkt: Honeypot/);
});

test("canonical document and AI boundary prohibit competing Playbook ownership", async () => {
  const root = resolve(import.meta.dirname, "..", "..", "..");
  const [document, aiSection, aiCanvas, checklist, readme, roadmap, ...historical] = await Promise.all([
    readFile(resolve(root, "docs", "canonical_product_information_architecture.md"), "utf8"),
    readFile(resolve(root, "tools", "ui-mock", "src", "components", "AIResearchSection.tsx"), "utf8"),
    readFile(resolve(root, "tools", "ui-mock", "src", "components", "AIProductionAnalysisCanvas.tsx"), "utf8"),
    readFile(resolve(root, "tools", "ui-mock", "src", "researchChecklistResolver.ts"), "utf8"),
    readFile(resolve(root, "README.md"), "utf8"),
    readFile(resolve(root, "docs", "roadmap.md"), "utf8"),
    ...[
      "aikintel_integration_plan.md",
      "ai_kintel_database_migration_blueprint.md",
      "ai_kintel_implementation_entry_checklist.md",
      "ai_kintel_release_readiness_matrix.md",
      "local_mvp_release_candidate.md",
      "product_scope.md",
      "todo.md",
    ].map((file) => readFile(resolve(root, "docs", file), "utf8")),
  ]);
  assert.match(document, /AUTHORITATIVE/);
  assert.match(document, /AIKINTEL is not the runtime host/);
  assert.match(document, /Deal Breakers rule/);
  assert.match(checklist, /function resolveResearchChecklist/);
  assert.match(aiSection, /playbookContext/);
  assert.doesNotMatch(aiCanvas, /ResearchPlaybookProgressTracker/);
  assert.match(readme, /canonical_product_information_architecture/);
  assert.match(roadmap, /canonical_product_information_architecture/);
  for (const source of historical) assert.match(source, /HISTORICAL \/ SUPERSEDED/);
});
