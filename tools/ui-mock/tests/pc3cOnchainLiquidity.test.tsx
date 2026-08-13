import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { resolveManualResearchTarget } from "../src/externalVerificationTargets.js";
import { ProductLocaleProvider } from "../src/productI18n.js";
import { resolveResearchChecklist } from "../src/researchChecklistResolver.js";
import type { PersistableScannerOutput, UiTokenCandidate } from "../src/types/scannerTypes.js";
import { ResearchChecklistDetail } from "../src/components/ResearchChecklist.js";
import { createResearchEvidenceRepository } from "../server/researchEvidenceRepository.js";
import { createScannerApiHandler } from "../server/scannerApiHandler.js";

const ADDRESS = "0x1111111111111111111111111111111111111111";
const PAIR = "0x2222222222222222222222222222222222222222";

test("PC.3C keeps existing Step 4 data factual, provenance-aware, and separate from frozen security deal breakers", () => {
  const view = resolveResearchChecklist(candidate());
  assert.equal(item(view, "top1_wallet").state, "AUTO_VERIFIED");
  assert.equal(item(view, "top1_wallet").value_number, 8.5);
  assert.equal(item(view, "top1_wallet").threshold, "preferred <10%; deal-breaker >30%");
  assert.equal(item(view, "top1_wallet").automatic_provenance?.source, "GoPlus");
  assert.equal(item(view, "top10_wallets").state, "AUTO_VERIFIED");
  assert.equal(item(view, "top10_wallets").value_number, 34.2);
  assert.equal(item(view, "top10_wallets").threshold, "preferred <40%");
  assert.equal(item(view, "liquidity_market_cap_ratio").value_number, 0.12);
  assert.equal(item(view, "liquidity_lock").value_text, "locked");
  assert.equal(item(view, "liquidity_lock_days").value_number, 210);
  assert.equal(item(view, "liquidity_market_cap_ratio").automatic_provenance?.source, "DexScreener");
  assert.equal(item(view, "holder_count").state, "MISSING_DATA");
  assert.equal(item(view, "developer_wallet").state, "MISSING_DATA");
  assert.equal(item(view, "liquidity_lock_end_date").state, "MISSING_DATA");
  assert.equal(item(view, "volume_quality").state, "MISSING_DATA");

  assert.equal(item(resolveResearchChecklist(candidate({ security: { ...security(), topWalletPct: 31 } })), "top1_wallet").state, "RED_FLAG");
  assert.equal(item(resolveResearchChecklist(candidate({ security: { ...security(), top10WalletsPct: 34.2 } })), "top10_wallets").state, "AUTO_VERIFIED");
  assert.equal(item(resolveResearchChecklist(candidate({ security: { ...security(), top10WalletsPct: 55 } })), "top10_wallets").state, "AUTO_VERIFIED");
  assert.equal(item(resolveResearchChecklist(candidate({ security: { ...security(), top10WalletsPct: 61 } })), "top10_wallets").state, "AUTO_VERIFIED");
  assert.equal(item(resolveResearchChecklist(candidate({ security: { ...security(), top10WalletsPct: 80 } })), "top10_wallets").state, "AUTO_VERIFIED");
  assert.equal(item(resolveResearchChecklist(candidate({ liquidity: 20_000 })), "liquidity_market_cap_ratio").state, "RED_FLAG");
  assert.equal(item(resolveResearchChecklist(candidate({ liquidity: 400_000 })), "liquidity_market_cap_ratio").state, "AUTO_VERIFIED", "more than 30% stays neutral rather than becoming an invented risk");
});

test("PC.3C renders a compact Step 4 first, surfaces red flags, keeps details closed, and preserves Bubblemaps deep links", () => {
  const markup = renderToStaticMarkup(<ProductLocaleProvider initialLocale="pl"><ResearchChecklistDetail candidate={candidate({ security: { ...security(), topWalletPct: 31 } })} focusedStep={4} /></ProductLocaleProvider>);
  assert.match(markup, /data-research-simple-summary="4"/);
  assert.match(markup, /Sprawdzone/);
  assert.match(markup, /Czerwone flagi/);
  assert.match(markup, /Do sprawdzenia/);
  assert.match(markup, /data-research-red-flag-reveal/);
  assert.match(markup, /data-research-technical-details="4"/);
  assert.doesNotMatch(markup, /data-research-technical-details="4" open=""/);
  assert.match(markup, /data-pc3c-onchain-manual/);
  assert.doesNotMatch(markup, /data-pc3c-onchain-manual open=""/);
  assert.match(markup, /Brakuje danych dla 4 dodatkowych kontroli/);
  assert.match(markup, /31\.00%/);
  assert.match(markup, /34\.20%/);
  assert.match(markup, /Próg metodologii: Preferowane: &lt;40%/);
  assert.match(markup, /12\.00%/);
  assert.doesNotMatch(markup, /natural volume|naturalny wolumen/i);

  const bubblemaps = resolveManualResearchTarget("bubblemaps", { chain: "base", contractAddress: ADDRESS });
  assert.equal(bubblemaps.availability, "AVAILABLE");
  assert.equal(bubblemaps.official_url, `https://v2.bubblemaps.io/map?chain=base&address=${ADDRESS}`);
});

test("PC.3C manual evidence is actor-scoped, fail-closed, and trusted testers remain read-only", async (t) => {
  const root = await mkdtemp(resolve(tmpdir(), "crypto-edge-pc3c-"));
  const fixturePath = resolve(root, "scanner.json");
  const databaseFilePath = resolve(root, "research.sqlite");
  await writeFile(fixturePath, JSON.stringify(scannerOutput()), "utf8");
  const repository = await createResearchEvidenceRepository({ databaseFilePath });
  const previousRole = process.env.CRYPTO_EDGE_PC1_REVIEW_DEFAULT_ACTOR;
  process.env.CRYPTO_EDGE_PC1_REVIEW_DEFAULT_ACTOR = "CAMP_USER";
  const server = createServer(createScannerApiHandler({ runtimeMode: "DEVELOPMENT_DEMO", scanner: { fixturePath, outputDirPath: resolve(root, "output"), allowFixtureFallback: true }, researchEvidence: { repository } }));
  t.after(async () => {
    if (previousRole === undefined) delete process.env.CRYPTO_EDGE_PC1_REVIEW_DEFAULT_ACTOR;
    else process.env.CRYPTO_EDGE_PC1_REVIEW_DEFAULT_ACTOR = previousRole;
    await new Promise<void>((done) => server.close(() => done()));
    repository.close();
    await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 40 });
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", () => done()));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  const lookupA = await fetch(`${origin}/api/research-checklist?chain=base&contract_address=${ADDRESS}`);
  const cookieA = lookupA.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookieA);
  const lookupB = await fetch(`${origin}/api/research-checklist?chain=base&contract_address=${ADDRESS}`);
  const cookieB = lookupB.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookieB);

  const put = async (body: Record<string, unknown>, cookie = cookieA) => fetch(`${origin}/api/research-evidence`, {
    method: "PUT",
    headers: { cookie: cookie!, origin, "content-type": "application/json" },
    body: JSON.stringify({ chain: "base", contract_address: ADDRESS, step_number: 4, ...body }),
  });
  assert.equal((await put({ item_key: "holder_count", manual_state: "MANUAL_VERIFIED", value_number: 1842, source_tool: "Manual holder research" })).status, 200);
  assert.equal((await put({ item_key: "developer_wallet", manual_state: "RED_FLAG", value_text: "0xdev", value_number: 11, source_tool: "Manual developer wallet (unlocked)" })).status, 200);
  assert.equal((await put({ item_key: "liquidity_lock_end_date", manual_state: "MANUAL_VERIFIED", value_text: "2027-03-01", source_tool: "Manual liquidity lock research" })).status, 200);
  assert.equal((await put({ item_key: "volume_quality", manual_state: "RED_FLAG", value_text: "suspicious", source_tool: "Manual volume-quality research" })).status, 200);

  const invalidPayloads = [
    { item_key: "holder_count", manual_state: "MANUAL_VERIFIED", value_number: -1, source_tool: "Manual holder research" },
    { item_key: "developer_wallet", manual_state: "MANUAL_VERIFIED", value_text: "0xdev", value_number: 101, source_tool: "Manual developer wallet (locked)" },
    { item_key: "liquidity_lock_end_date", manual_state: "MANUAL_VERIFIED", value_text: "not-a-date", source_tool: "Manual liquidity lock research" },
    { item_key: "volume_quality", manual_state: "MANUAL_VERIFIED", value_text: "invented", source_tool: "Manual volume-quality research" },
  ];
  for (const payload of invalidPayloads) assert.equal((await put(payload)).status, 400);

  const stateA = await (await fetch(`${origin}/api/research-checklist?chain=base&contract_address=${ADDRESS}`, { headers: { cookie: cookieA! } })).json() as { steps: Array<{ number: number; items: Array<{ key: string; state: string; value_number: number | null }> }> };
  assert.equal(stateA.steps.find((step) => step.number === 4)?.items.find((entry) => entry.key === "holder_count")?.value_number, 1842);
  assert.equal(stateA.steps.find((step) => step.number === 4)?.items.find((entry) => entry.key === "developer_wallet")?.state, "RED_FLAG");
  const stateB = await (await fetch(`${origin}/api/research-checklist?chain=base&contract_address=${ADDRESS}`, { headers: { cookie: cookieB! } })).json() as { steps: Array<{ number: number; items: Array<{ key: string; state: string }> }> };
  assert.equal(stateB.steps.find((step) => step.number === 4)?.items.find((entry) => entry.key === "holder_count")?.state, "MISSING_DATA");

  await new Promise<void>((done) => server.close(() => done()));
  process.env.CRYPTO_EDGE_PC1_REVIEW_DEFAULT_ACTOR = "TRUSTED_TESTER";
  const trustedServer = createServer(createScannerApiHandler({ runtimeMode: "DEVELOPMENT_DEMO", scanner: { fixturePath, outputDirPath: resolve(root, "trusted-output"), allowFixtureFallback: true }, researchEvidence: { repository } }));
  t.after(async () => { await new Promise<void>((done) => trustedServer.close(() => done())); });
  await new Promise<void>((done) => trustedServer.listen(0, "127.0.0.1", () => done()));
  const trustedAddress = trustedServer.address();
  assert.ok(trustedAddress && typeof trustedAddress === "object");
  const trustedOrigin = `http://127.0.0.1:${trustedAddress.port}`;
  const trustedLookup = await fetch(`${trustedOrigin}/api/research-checklist?chain=base&contract_address=${ADDRESS}`);
  const trustedCookie = trustedLookup.headers.get("set-cookie")?.split(";")[0];
  assert.ok(trustedCookie);
  const trustedWrite = await fetch(`${trustedOrigin}/api/research-evidence`, { method: "PUT", headers: { cookie: trustedCookie!, origin: trustedOrigin, "content-type": "application/json" }, body: JSON.stringify({ chain: "base", contract_address: ADDRESS, step_number: 4, item_key: "holder_count", manual_state: "MANUAL_VERIFIED", value_number: 1, source_tool: "Manual holder research" }) });
  assert.equal(trustedWrite.status, 403);
});

function item(view: ReturnType<typeof resolveResearchChecklist>, key: string) {
  const value = view.steps.find((step) => step.number === 4)?.items.find((entry) => entry.key === key);
  assert.ok(value, `Missing Step 4 item ${key}`);
  return value;
}

function candidate(overrides: Partial<UiTokenCandidate> = {}): UiTokenCandidate {
  return {
    id: "candidate-a", runId: "run-a", symbol: "PASS", name: "Pass Token", chain: "base", dex: "uniswap", source: "dexscreener", contractAddress: ADDRESS, pairAddress: PAIR, sourceUrl: "https://dexscreener.com/base/pair", discoveryBasket: "new_emerging", discoveryMethod: "dexscreener_latest_token_profiles", observationOnly: false, establishedEligible: false, universeVersion: null, universeEntryIndex: null, addressIdentityVerified: true,
    priceUsd: 1, marketCap: 1_000_000, fdvUsd: 1_000_000, liquidity: 120_000, volume24h: 100_000, volumeMarketCapRatio: 0.1, pairCreatedAt: "2026-01-01T00:00:00.000Z", pairAgeDays: 30,
    basicFilterStatus: "passed_basic_filter", securityLabel: "SECURITY_PASSED", finalLabel: "WATCHLIST", mainReason: "Eligible for further review", filterReasons: [], criticalReasons: [], warningReasons: [], finalReasons: [], missingData: [], riskFlags: [], security: security(), scorecard: null, lastCheckedAt: "2026-08-13T12:00:00.000Z", ...overrides,
  };
}

function security(): NonNullable<UiTokenCandidate["security"]> {
  return { sources: ["goplus", "honeypot"], coverageStatus: null, honeypotStatus: "passed", buyTax: 3, sellTax: 4, contractVerified: true, ownershipStatus: "renounced", liquidityLocked: true, liquidityLockDays: 210, mintRisk: false, blacklistRisk: false, whitelistRisk: false, sellRestrictionRisk: false, proxyRisk: false, topWalletPct: 8.5, top10WalletsPct: 34.2, checkedAt: "2026-08-13T12:00:00.000Z" };
}

function scannerOutput(): PersistableScannerOutput {
  const value = candidate();
  return {
    scan_run: { run_id: value.runId, source: "combined-scanner-poc", mode: "fixture", query: "fixture", started_at: null, finished_at: value.lastCheckedAt, total_raw: 1, passed_basic_filter: 1, rejected_basic_filter: 0, security_checked: 1, security_passed: 1, needs_manual_verification: 0, critical_risk: 0, watchlist_candidates: 1, errors: [] },
    candidates: [{ run_id: value.runId, candidate_id: value.id, symbol: value.symbol, name: value.name, chain: value.chain, contract_address: value.contractAddress, pair_address: value.pairAddress, dex: value.dex, source: value.source, source_url: value.sourceUrl, price_usd: value.priceUsd, market_cap_usd: value.marketCap, fdv_usd: value.fdvUsd, liquidity_usd: value.liquidity, volume_24h_usd: value.volume24h, volume_market_cap_ratio: value.volumeMarketCapRatio, pair_created_at: value.pairCreatedAt, pair_age_days: value.pairAgeDays, basic_filter_status: value.basicFilterStatus, filter_reasons: [], final_label: value.finalLabel, final_reasons: [], created_at: value.lastCheckedAt }],
    security_checks: [{ run_id: value.runId, candidate_id: value.id, sources: security().sources, coverage_status: null, honeypot_status: security().honeypotStatus, buy_tax: security().buyTax, sell_tax: security().sellTax, contract_verified: security().contractVerified, ownership_status: security().ownershipStatus, liquidity_locked: security().liquidityLocked, liquidity_lock_days: security().liquidityLockDays, mint_risk: security().mintRisk, blacklist_risk: security().blacklistRisk, whitelist_risk: security().whitelistRisk, sell_restriction_risk: security().sellRestrictionRisk, proxy_risk: security().proxyRisk, top_wallet_pct: security().topWalletPct, top_10_wallets_pct: security().top10WalletsPct, risk_flags: [], missing_data: [], security_label: "SECURITY_PASSED", critical_reasons: [], warning_reasons: [], checked_at: value.lastCheckedAt }],
    scorecards: [],
  };
}
