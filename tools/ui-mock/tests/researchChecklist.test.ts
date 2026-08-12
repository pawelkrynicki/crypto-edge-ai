import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";
import { resolveResearchChecklist } from "../src/researchChecklistResolver.js";
import type { PersistableScannerOutput, UiTokenCandidate } from "../src/types/scannerTypes.js";
import { createResearchEvidenceRepository, ResearchEvidenceError } from "../server/researchEvidenceRepository.js";
import { createScannerApiHandler } from "../server/scannerApiHandler.js";

const ADDRESS = "0x1111111111111111111111111111111111111111";
const PAIR = "0x2222222222222222222222222222222222222222";

test("PC.3A resolves the 7-step checklist from existing product evidence without changing filters", () => {
  const failed = candidate({ liquidity: 12_000, basicFilterStatus: "rejected_basic_filter", filterReasons: ["liquidity_below_30000"] });
  const failedView = resolveResearchChecklist(failed);
  assert.equal(failedView.current_step, 1);
  assert.equal(item(failedView, 1, "liquidity").state, "RED_FLAG");
  assert.equal(item(failedView, 1, "liquidity").threshold, ">= $30K");
  assert.equal(item(failedView, 7, "research_readiness").state, "MISSING_DATA");
  assert.equal(failedView.steps[6]!.state, "MISSING_DATA");
  assert.equal(item(failedView, 1, "volume_market_cap_ratio").threshold, "1%–100%; preferred 5%–30%");

  const securityMissing = candidate({ security: null });
  const securityMissingView = resolveResearchChecklist(securityMissing);
  assert.equal(securityMissingView.current_step, 2);
  assert.equal(item(securityMissingView, 2, "honeypot").state, "MISSING_DATA");

  const topWalletRisk = candidate({ security: { ...security(), topWalletPct: 31, top10WalletsPct: 55 } });
  const topWalletView = resolveResearchChecklist(topWalletRisk);
  assert.equal(item(topWalletView, 2, "top1_wallet").state, "RED_FLAG");
  assert.equal(item(topWalletView, 4, "top10_wallets").state, "AUTO_VERIFIED");

  const noWalletData = candidate({ security: { ...security(), topWalletPct: null, top10WalletsPct: null } });
  const noWalletView = resolveResearchChecklist(noWalletData);
  assert.equal(item(noWalletView, 4, "top1_wallet").state, "MISSING_DATA");
  assert.equal(item(noWalletView, 4, "top10_wallets").state, "MISSING_DATA");
  assert.equal(item(noWalletView, 1, "token_age").state, "MISSING_DATA");
  assert.equal(item(noWalletView, 6, "security_scorecard").state, "MISSING_DATA");
  assert.equal(item(noWalletView, 6, "security_scorecard").value_text, null);
});

test("PC.3A treats only known ownership states as automatically checked", () => {
  const unknownView = resolveResearchChecklist(candidate({ security: { ...security(), ownershipStatus: "unknown" } }));
  const activeView = resolveResearchChecklist(candidate({ security: { ...security(), ownershipStatus: "active" } }));
  const renouncedView = resolveResearchChecklist(candidate({ security: { ...security(), ownershipStatus: "renounced" } }));
  const missingSecurity = { ...security() } as { ownershipStatus?: string } & NonNullable<UiTokenCandidate["security"]>;
  delete missingSecurity.ownershipStatus;
  const missingView = resolveResearchChecklist(candidate({ security: missingSecurity }));

  assert.equal(item(unknownView, 3, "ownership").state, "MISSING_DATA");
  assert.equal(item(unknownView, 3, "ownership").value_text, "unknown");
  assert.equal(item(missingView, 3, "ownership").state, "MISSING_DATA");
  assert.equal(item(activeView, 3, "ownership").state, "AUTO_VERIFIED");
  assert.equal(item(activeView, 3, "ownership").value_text, "active");
  assert.equal(item(renouncedView, 3, "ownership").state, "AUTO_VERIFIED");
  assert.equal(item(renouncedView, 3, "ownership").value_text, "renounced");
  assert.equal(activeView.completeness.resolved_checks, unknownView.completeness.resolved_checks + 1, "unknown ownership earns no resolved-check credit");

  for (const key of ["honeypot", "contract_verified", "mint", "blacklist"] as const) {
    assert.equal(item(activeView, 3, key).state, item(unknownView, 3, key).state, `${key} security rule remains unchanged`);
  }
});

test("PC.3A private research evidence is actor-isolated, URL-safe, and never mutates a checklist lifecycle input", async (t) => {
  const root = await mkdtemp(resolve(tmpdir(), "crypto-edge-research-evidence-"));
  const repository = await createResearchEvidenceRepository({ databaseFilePath: resolve(root, "research.sqlite") });
  t.after(async () => { repository.close(); await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 40 }); });
  const created = repository.upsert({
    actorId: "actor-user-a",
    chain: "base",
    contractAddress: ADDRESS,
    stepNumber: 5,
    itemKey: "twitter",
    manualState: "MANUAL_VERIFIED",
    valueText: "Active daily",
    note: "Checked in browser",
    sourceTool: "Browser",
    evidenceUrl: "https://example.com/research",
    observedAt: "2026-08-12T12:00:00.000Z",
    now: new Date("2026-08-12T12:05:00.000Z"),
  });
  assert.equal((created as unknown as Record<string, unknown>).actor_id, undefined);
  assert.equal(repository.list("actor-user-a", "BASE", ADDRESS).length, 1);
  assert.deepEqual(repository.list("actor-user-b", "base", ADDRESS), []);
  assert.throws(() => repository.upsert({
    actorId: "actor-user-a", chain: "base", contractAddress: ADDRESS, stepNumber: 5, itemKey: "twitter", manualState: "MANUAL_VERIFIED", evidenceUrl: "http://localhost/private",
  }), (error: unknown) => error instanceof ResearchEvidenceError && error.code === "RESEARCH_EVIDENCE_INPUT_INVALID");

  const before = candidate();
  const beforeView = resolveResearchChecklist(before);
  const afterView = resolveResearchChecklist(before, repository.list("actor-user-a", "base", ADDRESS));
  assert.equal(before.basicFilterStatus, "passed_basic_filter");
  assert.equal(before.finalLabel, "WATCHLIST");
  assert.equal(item(afterView, 5, "twitter").state, "MANUAL_VERIFIED");
  assert.equal(item(beforeView, 5, "twitter").state, "MISSING_DATA");
  assert.equal(afterView.current_step, 2);
  assert.equal(repository.integrity().ok, true);
});

test("PC.3A API keeps trusted testers read-only and performs no provider or OpenAI request", async (t) => {
  const root = await mkdtemp(resolve(tmpdir(), "crypto-edge-research-api-"));
  const fixturePath = resolve(root, "scanner.json");
  const databaseFilePath = resolve(root, "research.sqlite");
  await writeFile(fixturePath, JSON.stringify(scannerOutput()), "utf8");
  const researchRepository = await createResearchEvidenceRepository({ databaseFilePath });
  const previousRole = process.env.CRYPTO_EDGE_PC1_REVIEW_DEFAULT_ACTOR;
  process.env.CRYPTO_EDGE_PC1_REVIEW_DEFAULT_ACTOR = "TRUSTED_TESTER";
  const server = createServer(createScannerApiHandler({
    runtimeMode: "DEVELOPMENT_DEMO",
    scanner: { fixturePath, outputDirPath: resolve(root, "output"), allowFixtureFallback: true },
    researchEvidence: { repository: researchRepository },
  }));
  t.after(async () => {
    if (previousRole === undefined) delete process.env.CRYPTO_EDGE_PC1_REVIEW_DEFAULT_ACTOR;
    else process.env.CRYPTO_EDGE_PC1_REVIEW_DEFAULT_ACTOR = previousRole;
    await new Promise<void>((done) => server.close(() => done()));
    researchRepository.close();
    await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 40 });
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", () => done()));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  const lookup = await fetch(`${origin}/api/research-checklist?chain=base&contract_address=${ADDRESS}`);
  assert.equal(lookup.status, 200, await lookup.clone().text());
  const cookie = lookup.headers.get("set-cookie");
  assert.ok(cookie);
  const checklist = await lookup.json() as { manual_evidence_writable: boolean; steps: unknown[] };
  assert.equal(checklist.manual_evidence_writable, false);
  assert.equal(checklist.steps.length, 7);
  const write = await fetch(`${origin}/api/research-evidence`, {
    method: "PUT",
    headers: {
      cookie: cookie!.split(";")[0]!,
      origin,
      "content-type": "application/json",
    },
    body: JSON.stringify({ chain: "base", contract_address: ADDRESS, step_number: 5, item_key: "twitter", manual_state: "MANUAL_VERIFIED" }),
  });
  assert.equal(write.status, 403);
  assert.equal((await write.json() as { error: string }).error, "forbidden");
});

function item(view: ReturnType<typeof resolveResearchChecklist>, step: number, key: string) {
  const result = view.steps.find((entry) => entry.number === step)?.items.find((entry) => entry.key === key);
  assert.ok(result, `Missing checklist item ${step}:${key}`);
  return result;
}

function candidate(overrides: Partial<UiTokenCandidate> = {}): UiTokenCandidate {
  return {
    id: "candidate-a", runId: "run-a", symbol: "PASS", name: "Pass Token", chain: "base", dex: "uniswap", source: "dexscreener", contractAddress: ADDRESS, pairAddress: PAIR, sourceUrl: "https://example.com/pair", discoveryBasket: "new_emerging", discoveryMethod: "dexscreener_latest_token_profiles", observationOnly: false, establishedEligible: false, universeVersion: null, universeEntryIndex: null, addressIdentityVerified: true,
    priceUsd: 1, marketCap: 1_000_000, fdvUsd: 1_000_000, liquidity: 120_000, volume24h: 100_000, volumeMarketCapRatio: 0.1, pairCreatedAt: "2026-01-01T00:00:00.000Z", pairAgeDays: 30,
    basicFilterStatus: "passed_basic_filter", securityLabel: "SECURITY_PASSED", finalLabel: "WATCHLIST", mainReason: "Eligible for further review", filterReasons: [], criticalReasons: [], warningReasons: [], finalReasons: [], missingData: [], riskFlags: [], security: security(), scorecard: null, lastCheckedAt: "2026-08-12T12:00:00.000Z", ...overrides,
  };
}

function security(): NonNullable<UiTokenCandidate["security"]> {
  return { sources: ["goplus", "honeypot"], coverageStatus: null, honeypotStatus: "passed", buyTax: 3, sellTax: 4, contractVerified: true, ownershipStatus: "renounced", liquidityLocked: true, liquidityLockDays: 120, mintRisk: false, blacklistRisk: false, whitelistRisk: false, sellRestrictionRisk: false, proxyRisk: false, topWalletPct: 8.5, top10WalletsPct: 34.2, checkedAt: "2026-08-12T12:00:00.000Z" };
}

function scannerOutput(): PersistableScannerOutput {
  const candidateValue = candidate();
  return {
    scan_run: { run_id: "run-a", source: "combined-scanner-poc", mode: "fixture", query: "fixture", started_at: null, finished_at: "2026-08-12T12:00:00.000Z", total_raw: 1, passed_basic_filter: 1, rejected_basic_filter: 0, security_checked: 1, security_passed: 1, needs_manual_verification: 0, critical_risk: 0, watchlist_candidates: 1, errors: [] },
    candidates: [{ run_id: "run-a", candidate_id: candidateValue.id, symbol: candidateValue.symbol, name: candidateValue.name, chain: candidateValue.chain, contract_address: candidateValue.contractAddress, pair_address: candidateValue.pairAddress, dex: candidateValue.dex, source: candidateValue.source, source_url: candidateValue.sourceUrl, price_usd: candidateValue.priceUsd, market_cap_usd: candidateValue.marketCap, fdv_usd: candidateValue.fdvUsd, liquidity_usd: candidateValue.liquidity, volume_24h_usd: candidateValue.volume24h, volume_market_cap_ratio: candidateValue.volumeMarketCapRatio, pair_created_at: candidateValue.pairCreatedAt, pair_age_days: candidateValue.pairAgeDays, basic_filter_status: candidateValue.basicFilterStatus, filter_reasons: [], final_label: candidateValue.finalLabel, final_reasons: [], created_at: candidateValue.lastCheckedAt }],
    security_checks: [{ run_id: "run-a", candidate_id: candidateValue.id, sources: security().sources, coverage_status: null, honeypot_status: security().honeypotStatus, buy_tax: security().buyTax, sell_tax: security().sellTax, contract_verified: security().contractVerified, ownership_status: security().ownershipStatus, liquidity_locked: security().liquidityLocked, liquidity_lock_days: security().liquidityLockDays, mint_risk: security().mintRisk, blacklist_risk: security().blacklistRisk, whitelist_risk: security().whitelistRisk, sell_restriction_risk: security().sellRestrictionRisk, proxy_risk: security().proxyRisk, top_wallet_pct: security().topWalletPct, top_10_wallets_pct: security().top10WalletsPct, risk_flags: [], missing_data: [], security_label: "SECURITY_PASSED", critical_reasons: [], warning_reasons: [], checked_at: candidateValue.lastCheckedAt }],
    scorecards: [],
  };
}
