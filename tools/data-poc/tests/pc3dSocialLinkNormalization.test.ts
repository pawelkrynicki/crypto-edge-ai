import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeDexScreenerPair } from "../src/normalizeDexScreener.js";
import { buildPersistableScannerOutput, buildCandidateId } from "../src/persistableScannerModel.js";
import { normalizeSafeSocialUrl } from "../src/socialLinkNormalization.js";
import type { CombinedScannerOutput, DexScreenerPair } from "../src/types.js";

const SNAPSHOT_AT = "2026-08-13T12:00:00.000Z";

test("PC.3D central normalization keeps existing DexScreener links bound to chain + contract without a provider call", () => {
  const first = normalizeDexScreenerPair(pair({
    chainId: "base",
    baseToken: { address: "0x1111111111111111111111111111111111111111", name: "Same", symbol: "SAME" },
    info: {
      socials: [{ type: "twitter", url: "https://x.com/project" }, { type: "telegram", url: "https://t.me/project" }],
      websites: [{ label: "Website", url: "https://project.example" }, { label: "Docs", url: "https://docs.project.example" }],
    },
  }), new Date(SNAPSHOT_AT));
  const second = normalizeDexScreenerPair(pair({
    chainId: "ethereum",
    baseToken: { address: "0x2222222222222222222222222222222222222222", name: "Same", symbol: "SAME" },
    info: { socials: [{ type: "twitter", url: "https://x.com/other-project" }] },
  }), new Date(SNAPSHOT_AT));

  assert.deepEqual(first.social_links, [
    { category: "twitter", url: "https://x.com/project" },
    { category: "telegram", url: "https://t.me/project" },
    { category: "website", url: "https://project.example/" },
    { category: "whitepaper", url: "https://docs.project.example/" },
  ]);
  assert.deepEqual(second.social_links, [{ category: "twitter", url: "https://x.com/other-project" }]);
  assert.notEqual(
    buildCandidateId(first.chain, first.contract_address, first.pair_address, first.source),
    buildCandidateId(second.chain, second.contract_address, second.pair_address, second.source),
    "same symbol/name never joins social evidence across chain + contract identities",
  );

  const persisted = buildPersistableScannerOutput({ combined: combined(first), finishedAt: SNAPSHOT_AT });
  assert.deepEqual(persisted.candidates[0]?.social_links, [
    { category: "twitter", url: "https://x.com/project", source: "DexScreener", snapshot_at: SNAPSHOT_AT },
    { category: "telegram", url: "https://t.me/project", source: "DexScreener", snapshot_at: SNAPSHOT_AT },
    { category: "website", url: "https://project.example/", source: "DexScreener", snapshot_at: SNAPSHOT_AT },
    { category: "whitepaper", url: "https://docs.project.example/", source: "DexScreener", snapshot_at: SNAPSHOT_AT },
  ]);
});

test("PC.3D URL normalization accepts public HTTPS source links and rejects unsafe destinations", () => {
  assert.equal(normalizeSafeSocialUrl("twitter", "https://x.com/project"), "https://x.com/project");
  assert.equal(normalizeSafeSocialUrl("telegram", "https://t.me/project"), "https://t.me/project");
  assert.equal(normalizeSafeSocialUrl("discord", "https://discord.gg/project"), "https://discord.gg/project");
  assert.equal(normalizeSafeSocialUrl("website", "https://project.example/path"), "https://project.example/path");
  for (const unsafe of [
    "javascript:alert(1)",
    "data:text/html,boom",
    "file:///etc/passwd",
    "https://localhost/private",
    "https://127.0.0.1/private",
    "https://10.0.0.1/private",
    "https://user:password@project.example/",
  ]) assert.equal(normalizeSafeSocialUrl("website", unsafe), null, unsafe);
  assert.equal(normalizeSafeSocialUrl("twitter", "https://example.com/not-x"), null);
  assert.equal(normalizeSafeSocialUrl("telegram", "https://telegram.org/not-a-channel"), null);
});

function pair(overrides: Partial<DexScreenerPair> = {}): DexScreenerPair {
  return {
    chainId: "base",
    dexId: "uniswap",
    url: "https://dexscreener.com/base/pair",
    pairAddress: "0x3333333333333333333333333333333333333333",
    baseToken: { address: "0x1111111111111111111111111111111111111111", name: "Project", symbol: "PRJ" },
    priceUsd: "1",
    marketCap: 1_000_000,
    fdv: 1_000_000,
    pairCreatedAt: new Date("2026-07-01T00:00:00.000Z").getTime(),
    liquidity: { usd: 120_000 },
    volume: { h24: 100_000 },
    ...overrides,
  };
}

function combined(candidate: ReturnType<typeof normalizeDexScreenerPair>): CombinedScannerOutput {
  return {
    source: "combined-scanner-poc",
    mode: "fixture",
    query: "fixture",
    generated_at: SNAPSHOT_AT,
    limits: { max_candidates: 1 },
    summary: { total_raw: 1, passed_basic_filter: 1, rejected_basic_filter: 0, security_checked: 0, security_passed: 0, needs_manual_verification: 0, critical_risk: 0, watchlist_candidates: 1 },
    candidates: [{ candidate, security: null, decision: { basic_filter_status: "passed_basic_filter", security_label: "NOT_CHECKED", final_label: "WATCHLIST", final_reasons: [] } }],
  };
}
