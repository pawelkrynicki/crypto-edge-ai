import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ResearchChecklistDetail } from "../src/components/ResearchChecklist.js";
import { ProductLocaleProvider } from "../src/productI18n.js";
import { resolveResearchChecklist } from "../src/researchChecklistResolver.js";
import { normalizeSafePublicHttpsUrl, normalizeSafeSocialLinkUrl } from "../src/socialLinks.js";
import type { PersistableScannerOutput, UiTokenCandidate } from "../src/types/scannerTypes.js";
import { createResearchEvidenceRepository } from "../server/researchEvidenceRepository.js";
import { createScannerApiHandler } from "../server/scannerApiHandler.js";

const ADDRESS = "0x1111111111111111111111111111111111111111";
const PAIR = "0x2222222222222222222222222222222222222222";
const SNAPSHOT_AT = "2026-08-13T12:00:00.000Z";

test("PC.3D keeps automatic links actionable but does not complete a social-quality check", () => {
  const view = resolveResearchChecklist(candidate());
  const twitter = stepItem(view, "twitter");
  assert.equal(twitter.state, "MISSING_DATA");
  assert.equal(twitter.automatic_link?.url, "https://x.com/project");
  assert.equal(twitter.automatic_link?.provenance.source, "DexScreener");
  assert.equal(twitter.automatic_link?.provenance.snapshot_at, SNAPSHOT_AT);
  assert.equal(view.steps[4]?.state, "MISSING_DATA", "a link does not become a PASS");

  const polish = renderToStaticMarkup(<ProductLocaleProvider initialLocale="pl"><ResearchChecklistDetail candidate={candidate()} focusedStep={5} /></ProductLocaleProvider>);
  const english = renderToStaticMarkup(<ProductLocaleProvider initialLocale="en"><ResearchChecklistDetail candidate={candidate()} focusedStep={5} /></ProductLocaleProvider>);
  assert.match(polish, /data-pc3d-social-beginner/);
  assert.match(polish, /Dostępne źródła/);
  assert.match(polish, /data-pc3d-social-link="twitter"/);
  assert.match(polish, /Link ze źródła tokena/);
  assert.ok(polish.includes("Pokaż szczegóły Social / Team / Docs"));
  assert.doesNotMatch(polish, /Official/);
  assert.doesNotMatch(polish, /research-checklist-item/);
  assert.match(english, /Available sources/);
  assert.ok(english.includes("Show Social / Team / Docs details"));

  const empty = renderToStaticMarkup(<ProductLocaleProvider initialLocale="pl"><ResearchChecklistDetail candidate={candidate({ socialLinks: [] })} focusedStep={5} /></ProductLocaleProvider>);
  assert.match(empty, /Nie znaleziono linków społecznościowych w obecnym źródle/);
  assert.match(empty, /Otwórz źródło tokena/);
  assert.doesNotMatch(empty, /research-checklist-item/);
});

test("PC.3D independently validates every outbound source link before browser presentation", () => {
  assert.equal(normalizeSafeSocialLinkUrl("twitter", "https://x.com/project"), "https://x.com/project");
  assert.equal(normalizeSafeSocialLinkUrl("telegram", "https://t.me/project"), "https://t.me/project");
  assert.equal(normalizeSafeSocialLinkUrl("discord", "https://discord.com/invite/project"), "https://discord.com/invite/project");
  assert.equal(normalizeSafePublicHttpsUrl("https://project.example"), "https://project.example/");
  for (const unsafe of ["javascript:alert(1)", "data:text/html,boom", "file:///tmp/x", "https://localhost/x", "https://192.168.0.1/x", "https://user:pass@project.example/"]) {
    assert.equal(normalizeSafePublicHttpsUrl(unsafe), null, unsafe);
  }
});

test("PC.3D manual evidence stays private, uses controlled mappings, and trusted testers are read-only", async (t) => {
  const root = await mkdtemp(resolve(tmpdir(), "crypto-edge-pc3d-"));
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
  const lookupB = await fetch(`${origin}/api/research-checklist?chain=base&contract_address=${ADDRESS}`);
  const cookieB = lookupB.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookieA && cookieB);
  const put = (item_key: string, value_text: string, manual_state: string, options: { value_number?: number | null; evidence_url?: string | null } = {}, cookie = cookieA) => fetch(`${origin}/api/research-evidence`, {
    method: "PUT",
    headers: { cookie: cookie!, origin, "content-type": "application/json" },
    body: JSON.stringify({ chain: "base", contract_address: ADDRESS, step_number: 5, item_key, value_text, manual_state, value_number: options.value_number ?? null, source_tool: `Manual social research: ${item_key}`, evidence_url: options.evidence_url ?? null }),
  });
  assert.equal((await put("twitter", "healthy", "MANUAL_VERIFIED", { value_number: 3.2, evidence_url: "https://x.com/project" })).status, 200);
  assert.equal((await put("telegram", "needs_attention", "MANUAL_VERIFIED", { value_number: 12, evidence_url: "https://t.me/project" })).status, 200);
  assert.equal((await put("discord", "suspicious", "RED_FLAG", { evidence_url: "https://discord.gg/project" })).status, 200);
  assert.equal((await put("team", "anonymous", "MANUAL_VERIFIED")).status, 200, "anonymous alone is not a hard red flag");
  assert.equal((await put("whitepaper", "suspected_copy_paste", "RED_FLAG", { evidence_url: "https://docs.project.example" })).status, 200);
  assert.equal((await put("roadmap", "needs_attention", "MANUAL_VERIFIED", { evidence_url: "https://project.example/roadmap" })).status, 200);
  assert.equal((await put("twitter", "healthy", "RED_FLAG", { evidence_url: "https://x.com/project" })).status, 400);
  assert.equal((await put("telegram", "healthy", "MANUAL_VERIFIED", { evidence_url: "https://example.com/not-telegram" })).status, 400);

  const stateA = await (await fetch(`${origin}/api/research-checklist?chain=base&contract_address=${ADDRESS}`, { headers: { cookie: cookieA! } })).json() as { steps: Array<{ number: number; items: Array<{ key: string; state: string }> }> };
  const socialA = stateA.steps.find((step) => step.number === 5)?.items ?? [];
  assert.equal(socialA.find((entry) => entry.key === "twitter")?.state, "MANUAL_VERIFIED");
  assert.equal(socialA.find((entry) => entry.key === "discord")?.state, "RED_FLAG");
  assert.equal(socialA.find((entry) => entry.key === "team")?.state, "MANUAL_VERIFIED");
  assert.equal(socialA.find((entry) => entry.key === "whitepaper")?.state, "RED_FLAG");
  const stateB = await (await fetch(`${origin}/api/research-checklist?chain=base&contract_address=${ADDRESS}`, { headers: { cookie: cookieB! } })).json() as { steps: Array<{ number: number; items: Array<{ key: string; state: string }> }> };
  assert.equal(stateB.steps.find((step) => step.number === 5)?.items.find((entry) => entry.key === "twitter")?.state, "MISSING_DATA", "User A evidence is not visible to User B");

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
  const write = await fetch(`${trustedOrigin}/api/research-evidence`, { method: "PUT", headers: { cookie: trustedCookie!, origin: trustedOrigin, "content-type": "application/json" }, body: JSON.stringify({ chain: "base", contract_address: ADDRESS, step_number: 5, item_key: "twitter", manual_state: "MANUAL_VERIFIED", value_text: "healthy", value_number: 3, source_tool: "Manual social research: twitter", evidence_url: "https://x.com/project" }) });
  assert.equal(write.status, 403);
});

function stepItem(view: ReturnType<typeof resolveResearchChecklist>, key: string) {
  const item = view.steps.find((step) => step.number === 5)?.items.find((entry) => entry.key === key);
  assert.ok(item, `missing Step 5 item ${key}`);
  return item;
}

function candidate(overrides: Partial<UiTokenCandidate> = {}): UiTokenCandidate {
  return {
    id: "candidate-a", runId: "run-a", symbol: "PASS", name: "Pass Token", chain: "base", dex: "uniswap", source: "dexscreener", contractAddress: ADDRESS, pairAddress: PAIR, sourceUrl: "https://dexscreener.com/base/pair", socialLinks: [{ category: "twitter", url: "https://x.com/project", source: "DexScreener", snapshotAt: SNAPSHOT_AT }, { category: "telegram", url: "https://t.me/project", source: "DexScreener", snapshotAt: SNAPSHOT_AT }, { category: "website", url: "https://project.example", source: "DexScreener", snapshotAt: SNAPSHOT_AT }], discoveryBasket: "new_emerging", discoveryMethod: "dexscreener_latest_token_profiles", observationOnly: false, establishedEligible: false, universeVersion: null, universeEntryIndex: null, addressIdentityVerified: true,
    priceUsd: 1, marketCap: 1_000_000, fdvUsd: 1_000_000, liquidity: 120_000, volume24h: 100_000, volumeMarketCapRatio: 0.1, pairCreatedAt: "2026-01-01T00:00:00.000Z", pairAgeDays: 30,
    basicFilterStatus: "passed_basic_filter", securityLabel: "SECURITY_PASSED", finalLabel: "WATCHLIST", mainReason: "Eligible for further review", filterReasons: [], criticalReasons: [], warningReasons: [], finalReasons: [], missingData: [], riskFlags: [], security: null, scorecard: null, lastCheckedAt: SNAPSHOT_AT, ...overrides,
  };
}

function scannerOutput(): PersistableScannerOutput {
  const value = candidate();
  return {
    scan_run: { run_id: value.runId, source: "combined-scanner-poc", mode: "fixture", query: "fixture", started_at: null, finished_at: SNAPSHOT_AT, total_raw: 1, passed_basic_filter: 1, rejected_basic_filter: 0, security_checked: 0, security_passed: 0, needs_manual_verification: 0, critical_risk: 0, watchlist_candidates: 1, errors: [] },
    candidates: [{ run_id: value.runId, candidate_id: value.id, symbol: value.symbol, name: value.name, chain: value.chain, contract_address: value.contractAddress, pair_address: value.pairAddress, dex: value.dex, source: value.source, source_url: value.sourceUrl, social_links: value.socialLinks?.map((link) => ({ category: link.category, url: link.url, source: link.source, snapshot_at: link.snapshotAt })), price_usd: value.priceUsd, market_cap_usd: value.marketCap, fdv_usd: value.fdvUsd, liquidity_usd: value.liquidity, volume_24h_usd: value.volume24h, volume_market_cap_ratio: value.volumeMarketCapRatio, pair_created_at: value.pairCreatedAt, pair_age_days: value.pairAgeDays, basic_filter_status: value.basicFilterStatus, filter_reasons: [], final_label: value.finalLabel, final_reasons: [], created_at: SNAPSHOT_AT }],
    security_checks: [], scorecards: [],
  };
}
