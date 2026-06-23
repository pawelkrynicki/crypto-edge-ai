import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { searchDexScreenerPairs } from "../src/dexscreenerClient.js";
import { getSourcePolicyDecision, getActiveSourceEnvironment, isSourcePolicyError } from "../src/sourcePolicy.js";
import { loadSourceRegistry, resolveRepoFile, validateDefaultSourceRegistry } from "../src/sourceRegistryValidator.js";

describe("source registry validation", () => {
  it("validates the registry JSON", () => {
    const result = validateDefaultSourceRegistry();

    assert.equal(result.valid, true);
    assert.deepEqual(result.errors, []);
    assert.ok(result.source_count > 0);
  });

  it("keeps source_ids unique", () => {
    const registry = loadSourceRegistry();
    const sourceIds = registry.sources.map((source) => source.source_id);

    assert.equal(new Set(sourceIds).size, sourceIds.length);
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
    for (const environment of ["FIXTURE_ONLY", "LOCAL_POC", "INTERNAL_BETA", "PUBLIC_BETA", "COMMERCIAL"]) {
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
      for (const environment of ["FIXTURE_ONLY", "LOCAL_POC", "INTERNAL_BETA", "PUBLIC_BETA", "COMMERCIAL"]) {
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
