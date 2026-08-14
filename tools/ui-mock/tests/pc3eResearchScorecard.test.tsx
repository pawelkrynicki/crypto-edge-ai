import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CandidateDetailView } from "../src/components/CandidateDetailView.js";
import { ExternalVerificationLinksView } from "../src/components/ExternalVerificationLinksView.js";
import { ResearchChecklistDetail } from "../src/components/ResearchChecklist.js";
import { ProductLocaleProvider } from "../src/productI18n.js";
import { resolveResearchChecklist } from "../src/researchChecklistResolver.js";
import { RESEARCH_SCORECARD_MAXIMUMS, resolveResearchScorecard } from "../src/researchScorecardResolver.js";
import type { PublicResearchEvidence, ResearchChecklistItemKey, ResearchChecklistState, ResearchChecklistView } from "../src/researchChecklistTypes.js";
import type { PersistableScannerOutput, UiTokenCandidate } from "../src/types/scannerTypes.js";
import { createResearchEvidenceRepository } from "../server/researchEvidenceRepository.js";
import { createScannerApiHandler } from "../server/scannerApiHandler.js";

const ADDRESS = "0x1111111111111111111111111111111111111111";
const PAIR = "0x2222222222222222222222222222222222222222";
const NOW = "2026-08-14T12:00:00.000Z";

test("PC.3E uses frozen weights, keeps the 100-point denominator, and never scores Narrative from prose", () => {
  const view = resolveResearchChecklist(candidate());
  const scorecard = view.effective_scorecard;

  assert.deepEqual(RESEARCH_SCORECARD_MAXIMUMS, { security: 30, onchain: 25, social: 25, narrative: 20, total: 100 });
  assert.equal(scorecard.schema_version, "research_scorecard_view_v1");
  assert.equal(scorecard.scoring_version, "research_scorecard_v1");
  assert.equal(scorecard.total.max, 100);
  assert.equal(scorecard.total.scored_max, 80);
  assert.equal(scorecard.total.unresolved_max, 20);
  assert.equal(scorecard.narrative.earned, 0);
  assert.equal(scorecard.narrative.scored, false);
  assert.equal(scorecard.narrative.unresolved_max, 20);
  assert.equal(scorecard.partial, true);
  assert.equal(scorecard.complete, false);
  assert.ok(scorecard.total.earned < 100, "partial evidence is never normalized to 100");
  assert.equal(scorecard.security.reasons.filter((entry) => entry.key === "honeypot").length, 1, "step 2/3 honeypot remains one security criterion");
  assert.equal(scorecard.onchain.reasons.filter((entry) => entry.key === "liquidity_lock").length, 1, "liquidity lock is allocated once");

  const stateOnly = cloneView(view);
  setStateOnly(stateOnly, 3, "contract_verified", "AUTO_VERIFIED");
  const stateOnlyScore = resolveResearchScorecard(stateOnly.steps);
  assert.equal(criterion(stateOnlyScore, "security", "contract_verified").state, "RESOLVED", "AUTO_VERIFIED alone is not a positive predicate");
});

test("PC.3E applies N/A allocation and all prescribed on-chain/security predicates without inventing red flags", () => {
  const base = resolveResearchChecklist(candidate({ security: { ...security(), topWalletPct: 12, top10WalletsPct: 45, liquidityLockDays: 180 } }), [
    evidence(4, "holder_count", "MANUAL_VERIFIED", null, 300, "Manual holder research"),
    evidence(4, "developer_wallet", "MANUAL_VERIFIED", "wallet", 5, "Manual developer wallet (locked)"),
    evidence(4, "wallet_clustering", "MANUAL_VERIFIED", "needs_attention", null, "Bubblemaps"),
    evidence(4, "volume_quality", "MANUAL_VERIFIED", "natural", null, "Manual volume-quality research"),
  ]);
  const scorecard = base.effective_scorecard;
  assert.equal(criterion(scorecard, "onchain", "top1_wallet").state, "RESOLVED");
  assert.equal(criterion(scorecard, "onchain", "top10_wallets").state, "RESOLVED");
  assert.equal(criterion(scorecard, "onchain", "liquidity_market_cap_ratio").state, "POSITIVE");
  assert.equal(criterion(scorecard, "onchain", "liquidity_lock_days").state, "POSITIVE");
  assert.equal(criterion(scorecard, "onchain", "holder_count").state, "POSITIVE");
  assert.equal(criterion(scorecard, "onchain", "developer_wallet").state, "RESOLVED", "5–10% is a resolved concern");
  assert.equal(criterion(scorecard, "onchain", "wallet_clustering").state, "RESOLVED");
  assert.equal(criterion(scorecard, "onchain", "volume_quality").state, "POSITIVE");
  assert.equal(scorecard.onchain.red_flags, 0, "Top10 >=40% and resolved concerns do not create new red flags");

  const withNa = cloneView(base);
  setStateOnly(withNa, 4, "developer_wallet", "NOT_APPLICABLE");
  const naScore = resolveResearchScorecard(withNa.steps);
  assert.equal(naScore.onchain.applicable, scorecard.onchain.applicable - 1);
  assert.ok(naScore.onchain.earned > scorecard.onchain.earned, "N/A redistributes the fixed 25-point domain allocation");

  const red = resolveResearchChecklist(candidate({ liquidity: 20_000, basicFilterStatus: "rejected_basic_filter", filterReasons: ["liquidity_below_30000"], security: { ...security(), topWalletPct: 31 } }));
  assert.equal(red.effective_scorecard.readiness.status, "RED_FLAGS_DETECTED");
  assert.equal(red.effective_scorecard.red_flags_total, red.effective_scorecard.readiness.red_flags);
  assert.ok(red.effective_scorecard.missing_total > 0, "missing remains independently visible");
});

test("PC.3E keeps Social evidence actor-private, link-only evidence at zero, and maps social concerns correctly", () => {
  const shared = candidate();
  const sharedBefore = JSON.stringify(shared);
  const linkOnly = resolveResearchChecklist(shared).effective_scorecard;
  assert.equal(linkOnly.social.earned, 0, "an automatic link is not a healthy finding");

  const userA = resolveResearchChecklist(shared, [evidence(5, "twitter", "MANUAL_VERIFIED", "healthy", null, "Manual social research: twitter")]).effective_scorecard;
  const userB = resolveResearchChecklist(shared).effective_scorecard;
  assert.ok(userA.social.earned > userB.social.earned, "User A's healthy X finding changes only User A's effective score");
  assert.equal(userB.social.earned, 0);
  assert.equal(JSON.stringify(shared), sharedBefore, "shared scanner candidate and PersistableScorecard input are untouched");

  const concerns = resolveResearchChecklist(shared, [
    evidence(5, "telegram", "MANUAL_VERIFIED", "needs_attention", null, "Manual social research: telegram"),
    evidence(5, "team", "MANUAL_VERIFIED", "anonymous", null, "Manual social research: team"),
    evidence(5, "discord", "RED_FLAG", "suspicious", null, "Manual social research: discord"),
    evidence(5, "whitepaper", "RED_FLAG", "suspected_copy_paste", null, "Manual social research: whitepaper"),
  ]).effective_scorecard;
  assert.equal(criterion(concerns, "social", "telegram").state, "RESOLVED");
  assert.equal(criterion(concerns, "social", "team").state, "RESOLVED");
  assert.equal(criterion(concerns, "social", "discord").state, "RED_FLAG");
  assert.equal(criterion(concerns, "social", "whitepaper").state, "RED_FLAG");
  assert.equal(concerns.social.red_flags, 2);
});

test("PC.3E resolves exact User A/User B evidence from the private repository without touching a shared scorecard", async (t) => {
  const root = await mkdtemp(resolve(tmpdir(), "crypto-edge-pc3e-isolation-"));
  const repository = await createResearchEvidenceRepository({ databaseFilePath: resolve(root, "research.sqlite") });
  t.after(async () => { repository.close(); await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 40 }); });
  const sharedCandidate = candidate();
  const sharedBefore = JSON.stringify(sharedCandidate);
  repository.upsert({ actorId: "actor-user-a", chain: "base", contractAddress: ADDRESS, stepNumber: 5, itemKey: "twitter", manualState: "MANUAL_VERIFIED", valueText: "healthy", sourceTool: "Manual social research: twitter", now: new Date(NOW) });
  const userA = resolveResearchChecklist(sharedCandidate, repository.list("actor-user-a", "base", ADDRESS)).effective_scorecard;
  const userB = resolveResearchChecklist(sharedCandidate, repository.list("actor-user-b", "base", ADDRESS)).effective_scorecard;
  assert.equal(repository.list("actor-user-a", "base", ADDRESS).length, 1);
  assert.equal(repository.list("actor-user-b", "base", ADDRESS).length, 0);
  assert.ok(userA.social.earned > userB.social.earned);
  assert.equal(JSON.stringify(sharedCandidate), sharedBefore, "private scoring does not mutate scanner inputs, lifecycle, Radar, Established, or AI cache");
});

test("PC.3E renders Step 6 and 7 with one global readiness aggregation and preserves 7/6 navigation", () => {
  const scorecardMarkup = renderToStaticMarkup(<ProductLocaleProvider initialLocale="pl"><ResearchChecklistDetail candidate={candidate()} focusedStep={6} /></ProductLocaleProvider>);
  const readinessMarkup = renderToStaticMarkup(<ProductLocaleProvider initialLocale="pl"><ResearchChecklistDetail candidate={candidate()} focusedStep={7} /></ProductLocaleProvider>);
  const detail = renderToStaticMarkup(<ProductLocaleProvider initialLocale="pl"><CandidateDetailView candidate={candidate()} initialOwnerPromotionStatus={null} /></ProductLocaleProvider>);
  const drawer = renderToStaticMarkup(<ProductLocaleProvider initialLocale="pl"><ExternalVerificationLinksView candidate={candidate()} /></ProductLocaleProvider>);
  assert.match(scorecardMarkup, /data-pc3e-scorecard-beginner/);
  assert.match(scorecardMarkup, /Wynik częściowy/);
  assert.match(scorecardMarkup, /Narracja: nieoceniona/);
  assert.match(scorecardMarkup, /nie rekomendacja inwestycyjna/);
  assert.match(scorecardMarkup, /Pokaż, jak powstał wynik/);
  assert.match(readinessMarkup, /data-pc3e-final-readiness-beginner/);
  assert.match(readinessMarkup, /Research niekompletny/);
  assert.match(readinessMarkup, /Pokaż pełną checklistę/);
  assert.doesNotMatch(`${scorecardMarkup}${readinessMarkup}`, /\b(BUY|SELL|INVEST|SAFE|UNSAFE|A\+)\b/);
  assert.equal((detail.match(/role="tab"/g) ?? []).length, 7);
  assert.equal((drawer.match(/role="tab"/g) ?? []).length, 6);

  const redView = resolveResearchChecklist(candidate({ liquidity: 20_000, basicFilterStatus: "rejected_basic_filter", filterReasons: ["liquidity_below_30000"] }));
  const redMarkup = renderToStaticMarkup(<ProductLocaleProvider initialLocale="pl"><ResearchChecklistDetail candidate={candidate({ liquidity: 20_000, basicFilterStatus: "rejected_basic_filter", filterReasons: ["liquidity_below_30000"] })} focusedStep={7} /></ProductLocaleProvider>);
  assert.equal(redView.effective_scorecard.readiness.status, "RED_FLAGS_DETECTED");
  assert.equal(redView.effective_scorecard.red_flags_total, redView.effective_scorecard.readiness.red_flags);
  assert.match(redMarkup, /Status: Wykryto czerwone flagi/);
  assert.match(redMarkup, new RegExp(`Czerwone flagi</dt><dd>${redView.effective_scorecard.red_flags_total}</dd>`));
});

test("PC.3E API exposes a read-only effective scorecard for trusted testers with no provider, OpenAI, or score-write path", async (t) => {
  const root = await mkdtemp(resolve(tmpdir(), "crypto-edge-pc3e-"));
  const fixturePath = resolve(root, "scanner.json");
  const repository = await createResearchEvidenceRepository({ databaseFilePath: resolve(root, "research.sqlite") });
  await writeFile(fixturePath, JSON.stringify(scannerOutput()), "utf8");
  const priorRole = process.env.CRYPTO_EDGE_PC1_REVIEW_DEFAULT_ACTOR;
  process.env.CRYPTO_EDGE_PC1_REVIEW_DEFAULT_ACTOR = "TRUSTED_TESTER";
  const server = createServer(createScannerApiHandler({ runtimeMode: "DEVELOPMENT_DEMO", scanner: { fixturePath, outputDirPath: resolve(root, "output"), allowFixtureFallback: true }, researchEvidence: { repository } }));
  t.after(async () => {
    if (priorRole === undefined) delete process.env.CRYPTO_EDGE_PC1_REVIEW_DEFAULT_ACTOR;
    else process.env.CRYPTO_EDGE_PC1_REVIEW_DEFAULT_ACTOR = priorRole;
    await new Promise<void>((done) => server.close(() => done()));
    repository.close();
    await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 40 });
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", () => done()));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  const get = await fetch(`${origin}/api/research-checklist?chain=base&contract_address=${ADDRESS}`);
  assert.equal(get.status, 200);
  const cookie = get.headers.get("set-cookie")?.split(";")[0];
  const payload = await get.json() as { effective_scorecard: { schema_version: string; total: { max: number } }; manual_evidence_writable: boolean };
  assert.equal(payload.effective_scorecard.schema_version, "research_scorecard_view_v1");
  assert.equal(payload.effective_scorecard.total.max, 100);
  assert.equal(payload.manual_evidence_writable, false);
  const evidenceWrite = await fetch(`${origin}/api/research-evidence`, { method: "PUT", headers: { cookie: cookie!, origin, "content-type": "application/json" }, body: JSON.stringify({ chain: "base", contract_address: ADDRESS, step_number: 5, item_key: "twitter", manual_state: "MANUAL_VERIFIED" }) });
  assert.equal(evidenceWrite.status, 403);
  const scoreWrite = await fetch(`${origin}/api/research-scorecard`, { method: "PUT", headers: { cookie: cookie!, origin, "content-type": "application/json" }, body: "{}" });
  assert.notEqual(scoreWrite.status, 200, "score editing is not an API capability");
});

function criterion(scorecard: ReturnType<typeof resolveResearchChecklist>["effective_scorecard"], domain: "security" | "onchain" | "social", key: string) {
  const result = scorecard[domain].reasons.find((entry) => entry.key === key);
  assert.ok(result, `Missing ${domain}:${key}`);
  return result;
}

function cloneView(view: ResearchChecklistView): ResearchChecklistView { return structuredClone(view); }

function setStateOnly(view: ResearchChecklistView, step: number, key: ResearchChecklistItemKey, state: ResearchChecklistState): void {
  const item = view.steps.find((entry) => entry.number === step)?.items.find((entry) => entry.key === key);
  assert.ok(item, `Missing ${step}:${key}`);
  item.state = state;
  item.value_number = null;
  item.value_text = null;
  item.manual_evidence = null;
}

function evidence(step: 3 | 4 | 5, key: ResearchChecklistItemKey, manualState: PublicResearchEvidence["manual_state"], valueText: string | null, valueNumber: number | null, sourceTool: string): PublicResearchEvidence {
  return { schema_version: "research_evidence_sqlite_v1", chain: "base", contract_address: ADDRESS, step_number: step, item_key: key, manual_state: manualState, value_text: valueText, value_number: valueNumber, note: null, source_tool: sourceTool, evidence_url: null, observed_at: null, created_at: NOW, updated_at: NOW };
}

function candidate(overrides: Partial<UiTokenCandidate> = {}): UiTokenCandidate {
  return {
    id: "candidate-a", runId: "run-a", symbol: "PASS", name: "Pass Token", chain: "base", dex: "uniswap", source: "dexscreener", contractAddress: ADDRESS, pairAddress: PAIR, sourceUrl: "https://example.com/pair", socialLinks: [{ category: "twitter", url: "https://x.com/project", source: "DexScreener", snapshotAt: NOW }], discoveryBasket: "new_emerging", discoveryMethod: "dexscreener_latest_token_profiles", observationOnly: false, establishedEligible: false, universeVersion: null, universeEntryIndex: null, addressIdentityVerified: true,
    priceUsd: 1, marketCap: 1_000_000, fdvUsd: 1_000_000, liquidity: 120_000, volume24h: 100_000, volumeMarketCapRatio: 0.1, pairCreatedAt: "2026-01-01T00:00:00.000Z", pairAgeDays: 30,
    basicFilterStatus: "passed_basic_filter", securityLabel: "SECURITY_PASSED", finalLabel: "WATCHLIST", mainReason: "Eligible for further review", filterReasons: [], criticalReasons: [], warningReasons: [], finalReasons: [], missingData: [], riskFlags: [], security: security(), scorecard: null, lastCheckedAt: NOW, ...overrides,
  };
}

function security(): NonNullable<UiTokenCandidate["security"]> {
  return { sources: ["goplus", "honeypot"], coverageStatus: null, honeypotStatus: "passed", buyTax: 3, sellTax: 4, contractVerified: true, ownershipStatus: "renounced", liquidityLocked: true, liquidityLockDays: 120, mintRisk: false, blacklistRisk: false, whitelistRisk: false, sellRestrictionRisk: false, proxyRisk: false, topWalletPct: 8.5, top10WalletsPct: 34.2, checkedAt: NOW };
}

function scannerOutput(): PersistableScannerOutput {
  const value = candidate();
  return {
    scan_run: { run_id: "run-a", source: "fixture", mode: "fixture", query: "fixture", started_at: null, finished_at: NOW, total_raw: 1, passed_basic_filter: 1, rejected_basic_filter: 0, security_checked: 1, security_passed: 1, needs_manual_verification: 0, critical_risk: 0, watchlist_candidates: 1, errors: [] },
    candidates: [{ run_id: "run-a", candidate_id: value.id, symbol: value.symbol, name: value.name, chain: value.chain, contract_address: value.contractAddress, pair_address: value.pairAddress, dex: value.dex, source: value.source, source_url: value.sourceUrl, price_usd: value.priceUsd, market_cap_usd: value.marketCap, fdv_usd: value.fdvUsd, liquidity_usd: value.liquidity, volume_24h_usd: value.volume24h, volume_market_cap_ratio: value.volumeMarketCapRatio, pair_created_at: value.pairCreatedAt, pair_age_days: value.pairAgeDays, basic_filter_status: value.basicFilterStatus, filter_reasons: [], final_label: value.finalLabel, final_reasons: [], created_at: NOW }],
    security_checks: [{ run_id: "run-a", candidate_id: value.id, sources: security().sources, coverage_status: null, honeypot_status: security().honeypotStatus, buy_tax: security().buyTax, sell_tax: security().sellTax, contract_verified: security().contractVerified, ownership_status: security().ownershipStatus, liquidity_locked: security().liquidityLocked, liquidity_lock_days: security().liquidityLockDays, mint_risk: security().mintRisk, blacklist_risk: security().blacklistRisk, whitelist_risk: security().whitelistRisk, sell_restriction_risk: security().sellRestrictionRisk, proxy_risk: security().proxyRisk, top_wallet_pct: security().topWalletPct, top_10_wallets_pct: security().top10WalletsPct, risk_flags: [], missing_data: [], security_label: "SECURITY_PASSED", critical_reasons: [], warning_reasons: [], checked_at: NOW }],
    scorecards: [],
  };
}
