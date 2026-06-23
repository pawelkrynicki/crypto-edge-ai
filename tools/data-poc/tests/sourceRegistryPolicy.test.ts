import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { searchDexScreenerPairs } from "../src/dexscreenerClient.js";
import { getSourcePolicyDecision, getActiveSourceEnvironment, isSourcePolicyError } from "../src/sourcePolicy.js";
import { loadSourceRegistry, resolveRepoFile, validateDefaultSourceRegistry } from "../src/sourceRegistryValidator.js";

const EXPECTED_SOURCE_IDS = [
  "dexscreener",
  "goplus_security",
  "honeypot_is",
  "coingecko_api",
  "geckoterminal_api",
  "defillama_api",
  "alternative_me_fng",
  "etherscan_api",
  "bscscan_api",
  "solscan_api",
  "bubblemaps_api",
  "aikintel_market_news",
  "cryptocompare_ccdata",
  "dune_api",
  "coinmarketcap_api",
  "tokensniffer_api",
  "defi_scanner",
  "dextools_api",
  "arkham_api",
  "lunarcrush_api",
  "token_unlocks_tokenomist"
] as const;

const STALE_PROVISIONAL_SOURCE_IDS = [
  ["crypto", "compare_api"].join(""),
  ["dune", "public", "dashboards"].join("_"),
  ["gdelt", "api"].join("_"),
  ["token", "unlocks"].join("_")
];
const SOURCE_ENVIRONMENTS = ["FIXTURE_ONLY", "LOCAL_POC", "INTERNAL_BETA", "PUBLIC_BETA", "COMMERCIAL"] as const;

describe("source registry validation", () => {
  it("validates the registry JSON", () => {
    const result = validateDefaultSourceRegistry();

    assert.equal(result.valid, true);
    assert.deepEqual(result.errors, []);
    assert.equal(result.source_count, 21);
  });

  it("keeps source_ids unique", () => {
    const registry = loadSourceRegistry();
    const sourceIds = registry.sources.map((source) => source.source_id);

    assert.equal(new Set(sourceIds).size, sourceIds.length);
  });

  it("matches the authoritative source_id set", () => {
    const registry = loadSourceRegistry();
    const sourceIds = registry.sources.map((source) => source.source_id).sort();

    assert.deepEqual(sourceIds, [...EXPECTED_SOURCE_IDS].sort());
  });

  it("keeps Priority A and Priority B counts from the authoritative registry", () => {
    const registry = loadSourceRegistry();
    const priorityCounts = registry.sources.reduce<Record<string, number>>((counts, source) => {
      const priority = typeof source.priority === "string" ? source.priority : "missing";
      counts[priority] = (counts[priority] ?? 0) + 1;
      return counts;
    }, {});

    assert.equal(priorityCounts.A, 12);
    assert.equal(priorityCounts.B, 9);
  });

  it("keeps the exact Camp BETA ready and blocked/pending reference lists", () => {
    const registry = loadSourceRegistry();
    const sourceIds = new Set(registry.sources.map((source) => source.source_id));
    const references = [...registry.sources_ready_for_camp_beta, ...registry.sources_blocked_or_pending];

    assert.deepEqual([...registry.sources_ready_for_camp_beta].sort(), ["alternative_me_fng", "defillama_api"]);
    assert.equal(registry.sources_blocked_or_pending.length, 19);
    assert.equal(references.every((sourceId) => sourceIds.has(sourceId)), true);
  });

  it("does not contain stale provisional source IDs", () => {
    const registry = loadSourceRegistry();
    const sourceIds = new Set(registry.sources.map((source) => source.source_id));

    for (const staleSourceId of STALE_PROVISIONAL_SOURCE_IDS) {
      assert.equal(sourceIds.has(staleSourceId), false, `${staleSourceId} must not remain in the registry`);
    }
  });
});

describe("source runtime policy", () => {
  it("fails closed for an unknown source", () => {
    const decision = getSourcePolicyDecision({
      sourceId: "unknown_source",
      environment: "PUBLIC_BETA",
      action: "live_fetch"
    });

    assert.equal(decision.allowed, false);
    assert.equal(decision.access_status, null);
    assert.match(decision.reason, /unknown source_id/);
  });

  it("defaults missing environment to FIXTURE_ONLY", () => {
    const environment = getActiveSourceEnvironment(undefined);
    const decision = getSourcePolicyDecision({
      sourceId: "dexscreener",
      action: "fixture_load"
    });

    assert.equal(environment, "FIXTURE_ONLY");
    assert.equal(decision.environment, "FIXTURE_ONLY");
  });

  it("allows fixture_load for fixture workflows", () => {
    const decision = getSourcePolicyDecision({
      sourceId: "dexscreener",
      action: "fixture_load"
    });

    assert.equal(decision.allowed, true);
  });

  it("allows dexscreener live_fetch in LOCAL_POC", () => {
    const decision = getSourcePolicyDecision({
      sourceId: "dexscreener",
      environment: "LOCAL_POC",
      action: "live_fetch"
    });

    assert.equal(decision.allowed, true);
  });

  it("blocks dexscreener live_fetch in PUBLIC_BETA", () => {
    const decision = getSourcePolicyDecision({
      sourceId: "dexscreener",
      environment: "PUBLIC_BETA",
      action: "live_fetch"
    });

    assert.equal(decision.allowed, false);
  });

  it("blocks goplus_security in PUBLIC_BETA", () => {
    const decision = getSourcePolicyDecision({
      sourceId: "goplus_security",
      environment: "PUBLIC_BETA",
      action: "live_fetch"
    });

    assert.equal(decision.allowed, false);
  });

  it("blocks honeypot_is in PUBLIC_BETA", () => {
    const decision = getSourcePolicyDecision({
      sourceId: "honeypot_is",
      environment: "PUBLIC_BETA",
      action: "live_fetch"
    });

    assert.equal(decision.allowed, false);
  });

  it("allows alternative_me_fng in PUBLIC_BETA", () => {
    const decision = getSourcePolicyDecision({
      sourceId: "alternative_me_fng",
      environment: "PUBLIC_BETA",
      action: "live_fetch"
    });

    assert.equal(decision.allowed, true);
  });

  it("allows defillama_api in PUBLIC_BETA", () => {
    const decision = getSourcePolicyDecision({
      sourceId: "defillama_api",
      environment: "PUBLIC_BETA",
      action: "live_fetch"
    });

    assert.equal(decision.allowed, true);
  });

  it("blocks bscscan_api in every environment", () => {
    for (const environment of SOURCE_ENVIRONMENTS) {
      const decision = getSourcePolicyDecision({
        sourceId: "bscscan_api",
        environment,
        action: "live_fetch"
      });

      assert.equal(decision.allowed, false);
    }
  });

  it("blocks aikintel_market_news without owner permission", () => {
    const decision = getSourcePolicyDecision({
      sourceId: "aikintel_market_news",
      environment: "PUBLIC_BETA",
      action: "live_fetch"
    });

    assert.equal(decision.allowed, false);
  });

  it("denies raw_storage for all v1 automated sources", () => {
    const sourceIds = ["alternative_me_fng", "defillama_api", "dexscreener", "goplus_security", "honeypot_is"];

    for (const sourceId of sourceIds) {
      for (const environment of SOURCE_ENVIRONMENTS) {
        const decision = getSourcePolicyDecision({
          sourceId,
          environment,
          action: "raw_storage"
        });

        assert.equal(decision.allowed, false, `${sourceId} raw_storage should be denied in ${environment}`);
      }
    }
  });

  it("does not execute a network client when policy denies the source", async () => {
    const originalFetch = globalThis.fetch;
    let fetchCalled = false;
    globalThis.fetch = async () => {
      fetchCalled = true;
      throw new Error("fetch should not run");
    };

    try {
      await assert.rejects(
        () => searchDexScreenerPairs("SOL", { environment: "PUBLIC_BETA" }),
        (error: unknown) => isSourcePolicyError(error)
      );
      assert.equal(fetchCalled, false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("does not include a scraping fallback", () => {
    const paths = [
      "tools/data-poc/src/dexscreenerClient.ts",
      "tools/data-poc/src/goplusClient.ts",
      "tools/data-poc/src/honeypotClient.ts"
    ];
    const forbiddenPatterns = [
      /cheerio/i,
      /puppeteer/i,
      /playwright/i,
      /parseHTML/i,
      /DOMParser/i,
      /text\/html/i,
      /\.text\(\)/
    ];

    for (const path of paths) {
      const contents = readFileSync(resolveRepoFile(path), "utf8");
      for (const pattern of forbiddenPatterns) {
        assert.equal(pattern.test(contents), false, `${path} must not contain scraping fallback pattern ${pattern}`);
      }
    }
  });
});
