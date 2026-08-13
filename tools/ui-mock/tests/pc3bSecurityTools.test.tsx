import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { isSafeOfficialManualResearchUrl, resolveManualResearchTarget } from "../src/externalVerificationTargets.js";
import { ResearchChecklistDetail } from "../src/components/ResearchChecklist.js";
import { ExternalVerificationLinksView } from "../src/components/ExternalVerificationLinksView.js";
import { ProductLocaleProvider } from "../src/productI18n.js";
import { resolveResearchChecklist } from "../src/researchChecklistResolver.js";
import type { PersistableScannerOutput, UiTokenCandidate } from "../src/types/scannerTypes.js";
import { createResearchEvidenceRepository, ResearchEvidenceError } from "../server/researchEvidenceRepository.js";
import { createScannerApiHandler } from "../server/scannerApiHandler.js";

void React;

const ADDRESS = "0x1111111111111111111111111111111111111111";
const PAIR = "0x2222222222222222222222222222222222222222";

test("PC.3B resolves only safe official browser targets and declares unsupported chains truthfully", () => {
  const honeypot = resolveManualResearchTarget("honeypot", { chain: "base", contractAddress: ADDRESS });
  assert.equal(honeypot.availability, "AVAILABLE");
  assert.equal(honeypot.official_url, `https://honeypot.is/?address=${encodeURIComponent(ADDRESS)}`);
  assert.equal(new URL(honeypot.official_url!).hostname, "honeypot.is");
  assert.doesNotMatch(honeypot.official_url!, /api\.honeypot\.is|\/v2\//i);
  assert.equal(resolveManualResearchTarget("honeypot", { chain: "solana", contractAddress: ADDRESS }).availability, "UNSUPPORTED_CHAIN");

  const sniffer = resolveManualResearchTarget("tokensniffer", { chain: "ethereum", contractAddress: ADDRESS });
  assert.equal(sniffer.availability, "MANUAL_SEARCH");
  assert.equal(new URL(sniffer.official_url!).hostname, "tokensniffer.com");
  const defi = resolveManualResearchTarget("defi_scanner", { chain: "bsc", contractAddress: ADDRESS });
  assert.equal(defi.availability, "MANUAL_SEARCH");
  assert.equal(new URL(defi.official_url!).hostname, "de.fi");
  assert.doesNotMatch(defi.official_url!, /defillama/i);
  const bubbles = resolveManualResearchTarget("bubblemaps", { chain: "solana", contractAddress: "So11111111111111111111111111111111111111112" });
  assert.equal(bubbles.availability, "MANUAL_SEARCH");
  assert.equal(new URL(bubbles.official_url!).hostname, "v2.bubblemaps.io");
  assert.equal(resolveManualResearchTarget("tokensniffer", { chain: "solana", contractAddress: ADDRESS }).availability, "UNSUPPORTED_CHAIN");
  assert.equal(resolveManualResearchTarget("defi_scanner", { chain: "solana", contractAddress: ADDRESS }).availability, "UNSUPPORTED_CHAIN");
  assert.equal(resolveManualResearchTarget("bubblemaps", { chain: "unknown", contractAddress: ADDRESS }).availability, "UNSUPPORTED_CHAIN");

  for (const unsafe of ["http://honeypot.is/", "javascript:alert(1)", "data:text/html,x", "file:///private", "mailto:test@example.com", "https://evil.example/"]) {
    assert.equal(isSafeOfficialManualResearchUrl(unsafe), false, `rejects ${unsafe}`);
  }
});

test("PC.3B maps private manual outcomes without changing automatic evidence", () => {
  const base = candidate();
  const unrecorded = resolveResearchChecklist(base);
  assert.equal(item(unrecorded, 3, "tokensniffer").state, "OPEN_EXTERNAL_TOOL");
  assert.equal(item(unrecorded, 3, "defi_scanner").state, "OPEN_EXTERNAL_TOOL");
  assert.equal(item(unrecorded, 4, "wallet_clustering").state, "OPEN_EXTERNAL_TOOL");
  assert.equal(item(unrecorded, 3, "honeypot").automatic_state, "AUTO_VERIFIED");

  const score49 = evidence(3, "tokensniffer", "RED_FLAG", { value_number: 49, source_tool: "TokenSniffer" });
  const score50 = evidence(3, "tokensniffer", "MANUAL_VERIFIED", { value_number: 50, source_tool: "TokenSniffer" });
  const score0 = evidence(3, "tokensniffer", "RED_FLAG", { value_number: 0, source_tool: "TokenSniffer" });
  const score100 = evidence(3, "tokensniffer", "MANUAL_VERIFIED", { value_number: 100, source_tool: "TokenSniffer" });
  assert.equal(item(resolveResearchChecklist(base, [score49]), 3, "tokensniffer").state, "RED_FLAG");
  assert.equal(item(resolveResearchChecklist(base, [score50]), 3, "tokensniffer").state, "MANUAL_VERIFIED");
  assert.equal(item(resolveResearchChecklist(base, [score0]), 3, "tokensniffer").value_number, 0);
  assert.equal(item(resolveResearchChecklist(base, [score100]), 3, "tokensniffer").value_number, 100);
  assert.equal(item(resolveResearchChecklist(base, [evidence(4, "wallet_clustering", "RED_FLAG", { value_text: "strong_concentration_or_related_cluster", source_tool: "Bubblemaps" })]), 4, "wallet_clustering").state, "RED_FLAG");
  assert.equal(base.finalLabel, "WATCHLIST", "manual research does not mutate lifecycle-derived candidate data");
});

test("PC.3B keeps research evidence private and requires HTTPS", async (t) => {
  const root = await mkdtemp(resolve(tmpdir(), "crypto-edge-pc3b-"));
  const repository = await createResearchEvidenceRepository({ databaseFilePath: resolve(root, "research.sqlite") });
  t.after(async () => { repository.close(); await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 40 }); });
  repository.upsert({ actorId: "actor-user-a", chain: "base", contractAddress: ADDRESS, stepNumber: 3, itemKey: "tokensniffer", manualState: "MANUAL_VERIFIED", valueNumber: 80, sourceTool: "TokenSniffer" });
  assert.equal(repository.list("actor-user-a", "base", ADDRESS).length, 1);
  assert.deepEqual(repository.list("actor-user-b", "base", ADDRESS), []);
  assert.throws(() => repository.upsert({ actorId: "actor-user-a", chain: "base", contractAddress: ADDRESS, stepNumber: 3, itemKey: "tokensniffer", manualState: "MANUAL_VERIFIED", valueNumber: 80, sourceTool: "TokenSniffer", evidenceUrl: "http://example.com/evidence" }), (error: unknown) => error instanceof ResearchEvidenceError && error.code === "RESEARCH_EVIDENCE_INPUT_INVALID");
});

test("PC.3B API validates token scores and keeps trusted testers read-only", async (t) => {
  const root = await mkdtemp(resolve(tmpdir(), "crypto-edge-pc3b-api-"));
  const fixturePath = resolve(root, "scanner.json");
  await writeFile(fixturePath, JSON.stringify(scannerOutput()), "utf8");
  const repository = await createResearchEvidenceRepository({ databaseFilePath: resolve(root, "research.sqlite") });
  const beforeActor = process.env.CRYPTO_EDGE_PC1_REVIEW_DEFAULT_ACTOR;
  process.env.CRYPTO_EDGE_PC1_REVIEW_DEFAULT_ACTOR = "CAMP_USER";
  const server = createServer(createScannerApiHandler({ runtimeMode: "DEVELOPMENT_DEMO", scanner: { fixturePath, outputDirPath: resolve(root, "output"), allowFixtureFallback: true }, researchEvidence: { repository } }));
  t.after(async () => {
    if (beforeActor === undefined) delete process.env.CRYPTO_EDGE_PC1_REVIEW_DEFAULT_ACTOR;
    else process.env.CRYPTO_EDGE_PC1_REVIEW_DEFAULT_ACTOR = beforeActor;
    await new Promise<void>((done) => server.close(() => done()));
    repository.close();
    await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 40 });
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", () => done()));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  const checklist = await fetch(`${origin}/api/research-checklist?chain=base&contract_address=${ADDRESS}`);
  const cookie = checklist.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie);
  const write = async (score: unknown, state: string) => fetch(`${origin}/api/research-evidence`, {
    method: "PUT",
    headers: { cookie: cookie!, origin, "content-type": "application/json" },
    body: JSON.stringify({ chain: "base", contract_address: ADDRESS, step_number: 3, item_key: "tokensniffer", manual_state: state, value_number: score, source_tool: "TokenSniffer" }),
  });
  assert.equal((await write(49, "RED_FLAG")).status, 200);
  assert.equal((await write(50, "MANUAL_VERIFIED")).status, 200);
  assert.equal((await write(0, "RED_FLAG")).status, 200);
  assert.equal((await write(100, "MANUAL_VERIFIED")).status, 200);
  for (const invalid of [-1, 101, "NaN", null, Number.POSITIVE_INFINITY]) assert.equal((await write(invalid, "MANUAL_VERIFIED")).status, 400);
  assert.equal((await write(49, "MANUAL_VERIFIED")).status, 400, "server derives the score state deterministically");
  const writeRaw = async (body: Record<string, unknown>) => fetch(`${origin}/api/research-evidence`, {
    method: "PUT", headers: { cookie: cookie!, origin, "content-type": "application/json" }, body: JSON.stringify({ chain: "base", contract_address: ADDRESS, ...body }),
  });
  assert.equal((await writeRaw({ step_number: 3, item_key: "honeypot", manual_state: "MANUAL_VERIFIED", value_text: "no_honeypot", source_tool: "Honeypot.is" })).status, 200);
  assert.equal((await writeRaw({ step_number: 3, item_key: "honeypot", manual_state: "MANUAL_VERIFIED", value_text: "honeypot_detected", source_tool: "Honeypot.is" })).status, 400);
  assert.equal((await writeRaw({ step_number: 3, item_key: "defi_scanner", manual_state: "NOT_APPLICABLE", value_text: "Not applicable to this contract", source_tool: "De.Fi Scanner" })).status, 200);
  assert.equal((await writeRaw({ step_number: 3, item_key: "defi_scanner", manual_state: "MANUAL_VERIFIED", source_tool: "DefiLlama" })).status, 400);
  assert.equal((await writeRaw({ step_number: 4, item_key: "wallet_clustering", manual_state: "RED_FLAG", value_text: "strong_concentration_or_related_cluster", source_tool: "Bubblemaps" })).status, 200);

});

test("PC.3B trusted testers can read but cannot write private tool findings", async (t) => {
  const root = await mkdtemp(resolve(tmpdir(), "crypto-edge-pc3b-trusted-"));
  const fixturePath = resolve(root, "scanner.json");
  await writeFile(fixturePath, JSON.stringify(scannerOutput()), "utf8");
  const repository = await createResearchEvidenceRepository({ databaseFilePath: resolve(root, "research.sqlite") });
  const beforeActor = process.env.CRYPTO_EDGE_PC1_REVIEW_DEFAULT_ACTOR;
  process.env.CRYPTO_EDGE_PC1_REVIEW_DEFAULT_ACTOR = "TRUSTED_TESTER";
  const server = createServer(createScannerApiHandler({ runtimeMode: "DEVELOPMENT_DEMO", scanner: { fixturePath, outputDirPath: resolve(root, "output"), allowFixtureFallback: true }, researchEvidence: { repository } }));
  t.after(async () => {
    if (beforeActor === undefined) delete process.env.CRYPTO_EDGE_PC1_REVIEW_DEFAULT_ACTOR;
    else process.env.CRYPTO_EDGE_PC1_REVIEW_DEFAULT_ACTOR = beforeActor;
    await new Promise<void>((done) => server.close(() => done()));
    repository.close();
    await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 40 });
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", () => done()));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  const lookup = await fetch(`${origin}/api/research-checklist?chain=base&contract_address=${ADDRESS}`);
  assert.equal(lookup.status, 200);
  const cookie = lookup.headers.get("set-cookie")?.split(";")[0];
  const denied = await fetch(`${origin}/api/research-evidence`, {
    method: "PUT", headers: { cookie: cookie!, origin, "content-type": "application/json" },
    body: JSON.stringify({ chain: "base", contract_address: ADDRESS, step_number: 3, item_key: "tokensniffer", manual_state: "MANUAL_VERIFIED", value_number: 50, source_tool: "TokenSniffer" }),
  });
  assert.equal(denied.status, 403);
});

test("PC.3B places the four actions beside focused checklist items and preserves the 7/6 tab boundaries", () => {
  const step3 = renderToStaticMarkup(<ProductLocaleProvider initialLocale="pl"><ResearchChecklistDetail candidate={candidate()} focusedStep={3} /></ProductLocaleProvider>);
  const step4 = renderToStaticMarkup(<ProductLocaleProvider initialLocale="en"><ResearchChecklistDetail candidate={candidate()} focusedStep={4} /></ProductLocaleProvider>);
  const focusedDrawer = renderToStaticMarkup(<ProductLocaleProvider initialLocale="en"><ExternalVerificationLinksView candidate={candidate()} focusedResearchStep={3} /></ProductLocaleProvider>);
  assert.match(step3, /Sprawdź Honeypot/);
  assert.match(step3, /Otwórz TokenSniffer/);
  assert.match(step3, /Otwórz De\.Fi Scanner/);
  assert.match(step3, /Dodaj wynik/);
  assert.match(step4, /Open Bubblemaps/);
  assert.match(step3, /target="_blank"[^>]*rel="noopener noreferrer"/);
  assert.equal((focusedDrawer.match(/role="tab"/g) ?? []).length, 6);
  assert.doesNotMatch(focusedDrawer, /external-checks-list|AI Research Brief/);
});

function item(view: ReturnType<typeof resolveResearchChecklist>, step: number, key: string) {
  const result = view.steps.find((entry) => entry.number === step)?.items.find((entry) => entry.key === key);
  assert.ok(result, `Missing checklist item ${step}:${key}`);
  return result;
}

function evidence(step: 3 | 4, key: "tokensniffer" | "wallet_clustering", state: "MANUAL_VERIFIED" | "RED_FLAG", values: Partial<ReturnType<typeof defaultEvidence>>) {
  return { ...defaultEvidence(), step_number: step, item_key: key, manual_state: state, ...values };
}

function defaultEvidence() {
  return { schema_version: "research_evidence_sqlite_v1" as const, chain: "base", contract_address: ADDRESS, step_number: 3 as const, item_key: "tokensniffer" as const, manual_state: "MANUAL_VERIFIED" as const, value_text: null, value_number: null, note: null, source_tool: null, evidence_url: null, observed_at: null, created_at: "2026-08-13T12:00:00.000Z", updated_at: "2026-08-13T12:00:00.000Z" };
}

function candidate(): UiTokenCandidate {
  return {
    id: "candidate-a", runId: "run-a", symbol: "PASS", name: "Pass Token", chain: "base", dex: "uniswap", source: "dexscreener", contractAddress: ADDRESS, pairAddress: PAIR, sourceUrl: "https://example.com/pair", discoveryBasket: "new_emerging", discoveryMethod: "dexscreener_latest_token_profiles", observationOnly: false, establishedEligible: false, universeVersion: null, universeEntryIndex: null, addressIdentityVerified: true,
    priceUsd: 1, marketCap: 1_000_000, fdvUsd: 1_000_000, liquidity: 120_000, volume24h: 100_000, volumeMarketCapRatio: 0.1, pairCreatedAt: "2026-01-01T00:00:00.000Z", pairAgeDays: 30,
    basicFilterStatus: "passed_basic_filter", securityLabel: "SECURITY_PASSED", finalLabel: "WATCHLIST", mainReason: "Eligible for further review", filterReasons: [], criticalReasons: [], warningReasons: [], finalReasons: [], missingData: [], riskFlags: [], security: security(), scorecard: null, lastCheckedAt: "2026-08-13T12:00:00.000Z",
  };
}

function security(): NonNullable<UiTokenCandidate["security"]> {
  return { sources: ["goplus", "honeypot"], coverageStatus: null, honeypotStatus: "passed", buyTax: 3, sellTax: 4, contractVerified: true, ownershipStatus: "renounced", liquidityLocked: true, liquidityLockDays: 120, mintRisk: false, blacklistRisk: false, whitelistRisk: false, sellRestrictionRisk: false, proxyRisk: false, topWalletPct: 8.5, top10WalletsPct: 34.2, checkedAt: "2026-08-13T12:00:00.000Z" };
}

function scannerOutput(): PersistableScannerOutput {
  const value = candidate();
  return {
    scan_run: { run_id: "run-a", source: "combined-scanner-poc", mode: "fixture", query: "fixture", started_at: null, finished_at: "2026-08-13T12:00:00.000Z", total_raw: 1, passed_basic_filter: 1, rejected_basic_filter: 0, security_checked: 1, security_passed: 1, needs_manual_verification: 0, critical_risk: 0, watchlist_candidates: 1, errors: [] },
    candidates: [{ run_id: "run-a", candidate_id: value.id, symbol: value.symbol, name: value.name, chain: value.chain, contract_address: value.contractAddress, pair_address: value.pairAddress, dex: value.dex, source: value.source, source_url: value.sourceUrl, price_usd: value.priceUsd, market_cap_usd: value.marketCap, fdv_usd: value.fdvUsd, liquidity_usd: value.liquidity, volume_24h_usd: value.volume24h, volume_market_cap_ratio: value.volumeMarketCapRatio, pair_created_at: value.pairCreatedAt, pair_age_days: value.pairAgeDays, basic_filter_status: value.basicFilterStatus, filter_reasons: [], final_label: value.finalLabel, final_reasons: [], created_at: value.lastCheckedAt }],
    security_checks: [{ run_id: "run-a", candidate_id: value.id, sources: security().sources, coverage_status: null, honeypot_status: security().honeypotStatus, buy_tax: security().buyTax, sell_tax: security().sellTax, contract_verified: security().contractVerified, ownership_status: security().ownershipStatus, liquidity_locked: security().liquidityLocked, liquidity_lock_days: security().liquidityLockDays, mint_risk: security().mintRisk, blacklist_risk: security().blacklistRisk, whitelist_risk: security().whitelistRisk, sell_restriction_risk: security().sellRestrictionRisk, proxy_risk: security().proxyRisk, top_wallet_pct: security().topWalletPct, top_10_wallets_pct: security().top10WalletsPct, risk_flags: [], missing_data: [], security_label: "SECURITY_PASSED", critical_reasons: [], warning_reasons: [], checked_at: value.lastCheckedAt }],
    scorecards: [],
  };
}
