import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, it } from "node:test";
import {
  assertInternalBetaCollectorEnvironment,
  runInternalBetaCollector,
} from "../src/internalBetaCollector.js";
import { validateDisplayEligibleContextSnapshot } from "../src/contextSnapshotValidator.js";
import { validateDisplayEligibleScannerSnapshot } from "../src/displaySnapshotValidator.js";

const NOW = new Date("2026-07-16T12:00:00.000Z");
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("INTERNAL_BETA live collector", () => {
  it("fails closed before the first fetch without explicit network consent", async () => {
    let fetchCalls = 0;
    await assert.rejects(
      () => runInternalBetaCollector({
        env: {
          CRYPTO_EDGE_DATA_ENV: "INTERNAL_BETA",
          CRYPTO_EDGE_RUNTIME_MODE: "INTERNAL_BETA",
        },
        fetchImpl: async () => { fetchCalls += 1; return Response.json({}); },
      }),
      /LIVE_PROVIDER_CALLS_NOT_ALLOWED/,
    );
    assert.equal(fetchCalls, 0);
  });

  it("requires both INTERNAL_BETA environment flags", () => {
    assert.throws(() => assertInternalBetaCollectorEnvironment({
      CRYPTO_EDGE_DATA_ENV: "LOCAL_POC",
      CRYPTO_EDGE_RUNTIME_MODE: "INTERNAL_BETA",
      ALLOW_LIVE_PROVIDER_CALLS: "1",
    }), /COLLECTOR_DATA_ENV_INVALID/);
  });

  it("runs discovery, filters before security, and publishes normalized live snapshots", async () => {
    const root = await tempRoot();
    const fetchedUrls: string[] = [];
    const result = await runInternalBetaCollector({
      env: {
        CRYPTO_EDGE_DATA_ENV: "INTERNAL_BETA",
        CRYPTO_EDGE_RUNTIME_MODE: "INTERNAL_BETA",
        ALLOW_LIVE_PROVIDER_CALLS: "1",
      },
      outputDir: root,
      seedLimit: 2,
      securityCandidateLimit: 3,
      now: NOW,
      fetchImpl: async (input) => {
        const url = String(input);
        fetchedUrls.push(url);
        if (url.endsWith("/token-profiles/latest/v1")) {
          return Response.json([
            { chainId: "base", tokenAddress: "0xpass" },
            { chainId: "base", tokenAddress: "0xreject" },
          ]);
        }
        if (url.includes("/token-pairs/v1/base/0xpass")) return Response.json([dexPair("0xpass", "pair-pass", 60_000)]);
        if (url.includes("/token-pairs/v1/base/0xreject")) return Response.json([dexPair("0xreject", "pair-reject", 100)]);
        if (url.includes("gopluslabs.io/api/v1/token_security/8453")) {
          return Response.json({
            result: {
              "0xpass": {
                is_honeypot: "0",
                buy_tax: "0.01",
                sell_tax: "0.02",
                is_open_source: "1",
                owner_address: "0x0000000000000000000000000000000000000000",
                liquidity_locked: "1",
                is_mintable: "0",
                is_blacklisted: "0",
                is_whitelisted: "0",
                cannot_sell_all: "0",
                is_proxy: "0",
              },
            },
            provider_private_field: "must-not-persist",
          });
        }
        if (url === "https://api.alternative.me/fng/?limit=1") {
          return Response.json({ data: [{ value: "40", value_classification: "Fear", timestamp: "1784203200", time_until_update: "3600" }] });
        }
        if (url === "https://api.llama.fi/protocols") {
          return Response.json([{ name: "Lido", chain: "Ethereum", tvl: 1_000_000, change_1d: 1, change_7d: 2, url: "https://lido.fi" }]);
        }
        throw new Error(`unexpected URL ${url}`);
      },
    });

    assert.equal(result.discovery.seed_count, 2);
    assert.equal(result.discovery.pairs_loaded, 2);
    assert.equal(result.discovery.candidates_after_filters, 1);
    assert.equal(result.security.candidates_requested, 1);
    assert.equal(result.request_counts.goplus_security, 1);
    assert.equal(fetchedUrls.some((url) => url.includes("honeypot.is")), false);
    assert.equal(result.scanner.provenance?.fixture_used, false);
    assert.deepEqual(result.scanner.provenance?.source_ids, ["dexscreener", "goplus_security"]);
    assert.equal(result.scanner.scorecards.length, 0);
    assert.equal(result.context.sources.every((source) => source.mode === "live" && source.records.length > 0), true);
    assert.deepEqual(result.scanner.provenance?.metadata?.attribution, { provider: "GoPlus Security" });
    assert.deepEqual(
      result.context.sources.map((source) => source.attribution.provider),
      ["Alternative.me", "DefiLlama"],
    );

    const persisted = await readFile(result.scanner_publish.output_file, "utf8");
    assert.equal(persisted.includes("provider_private_field"), false);
    assert.equal(persisted.includes("must-not-persist"), false);
    assert.equal(persisted.includes("honeypot_is"), false);

    const unsafeScanner = structuredClone(result.scanner);
    assert.ok(unsafeScanner.provenance?.metadata);
    unsafeScanner.provenance.metadata.raw_payload = { secret: true };
    assert.throws(() => validateDisplayEligibleScannerSnapshot(unsafeScanner), /SCANNER_UNKNOWN_FIELD/);

    const unsafeContext = structuredClone(result.context) as typeof result.context & {
      sources: Array<(typeof result.context.sources)[number] & { raw_payload?: unknown }>;
    };
    unsafeContext.sources[0].raw_payload = { secret: true };
    assert.throws(() => validateDisplayEligibleContextSnapshot(unsafeContext), /CONTEXT_UNKNOWN_FIELD/);
  });
});

function dexPair(address: string, pairAddress: string, liquidity: number) {
  return {
    chainId: "base",
    dexId: "uniswap",
    url: `https://dexscreener.com/base/${pairAddress}`,
    pairAddress,
    baseToken: { address, symbol: address === "0xpass" ? "REAL" : "LOW", name: "Real Token" },
    priceUsd: "1.25",
    marketCap: 1_000_000,
    fdv: 1_000_000,
    liquidity: { usd: liquidity },
    volume: { h24: 100_000 },
    pairCreatedAt: Date.parse("2026-06-16T12:00:00.000Z"),
  };
}

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(resolve(tmpdir(), "crypto-edge-collector-"));
  roots.push(root);
  return root;
}
