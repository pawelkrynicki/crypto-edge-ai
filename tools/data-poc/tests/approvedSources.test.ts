import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { relative, resolve } from "node:path";
import { describe, it } from "node:test";
import {
  ALTERNATIVE_ME_FNG_SOURCE_ID,
  ALTERNATIVE_ME_FNG_URL,
  alternativeMeFngAdapter
} from "../src/sources/alternativeMeFngAdapter.js";
import { DEFILLAMA_PROTOCOLS_URL, DEFILLAMA_SOURCE_ID, defillamaAdapter } from "../src/sources/defillamaAdapter.js";
import {
  APPROVED_SOURCES_OUTPUT_FILENAME,
  DEGRADED_EXTERNAL_SOURCE_STATUS,
  EXTERNAL_SOURCE_DEGRADED_LABEL,
  runApprovedSourcesPoc,
  shouldFailApprovedSourcesRun
} from "../src/sources/runApprovedSourcesPoc.js";
import { getApprovedSourceAdapters, getSourceAdapter } from "../src/sources/sourceAdapterRegistry.js";
import type { SourceAdapter } from "../src/sources/sourceAdapterTypes.js";
import { assertSourceActionAllowed, getSourcePolicyDecision } from "../src/sourcePolicy.js";
import { resolveRepoFile } from "../src/sourceRegistryValidator.js";

describe("approved free source adapters", () => {
  it("normalizes the Alternative.me Fear & Greed fixture", async () => {
    const output = await alternativeMeFngAdapter.fetchFixture();

    assert.equal(output.source_id, ALTERNATIVE_ME_FNG_SOURCE_ID);
    assert.equal(output.source_name, "Alternative.me Fear & Greed Index");
    assert.equal(output.mode, "fixture");
    assert.equal(output.policy.action, "fixture_load");
    assert.equal(output.policy.allowed, true);
    assert.equal(output.data_category, "sentiment");
    assert.equal(output.records.length, 1);
    assert.deepEqual(output.records[0], {
      record_type: "fear_greed_index",
      value: 42,
      value_classification: "Fear",
      timestamp: "2024-03-09T16:00:00.000Z",
      time_until_update: "12345"
    });
  });

  it("normalizes the DefiLlama protocols fixture", async () => {
    const output = await defillamaAdapter.fetchFixture();

    assert.equal(output.source_id, DEFILLAMA_SOURCE_ID);
    assert.equal(output.source_name, "DefiLlama API");
    assert.equal(output.mode, "fixture");
    assert.equal(output.policy.action, "fixture_load");
    assert.equal(output.policy.allowed, true);
    assert.equal(output.data_category, "defi_context");
    assert.equal(output.records.length, 2);
    assert.deepEqual(output.records[0], {
      record_type: "defi_protocol_snapshot",
      name: "Lido",
      chain: "Ethereum",
      tvl_usd: 35400000000,
      change_1d: 0.75,
      change_7d: -2.1,
      url: "https://lido.fi"
    });
    assert.deepEqual(output.records[1], {
      record_type: "defi_protocol_snapshot",
      name: "Uniswap V3",
      chain: "Ethereum",
      tvl_usd: 4200000000,
      change_1d: 1.2,
      change_7d: 3.4,
      url: "https://app.uniswap.org"
    });
  });

  it("allows approved free sources to live_fetch in PUBLIC_BETA", () => {
    for (const sourceId of [ALTERNATIVE_ME_FNG_SOURCE_ID, DEFILLAMA_SOURCE_ID]) {
      const decision = getSourcePolicyDecision({
        sourceId,
        environment: "PUBLIC_BETA",
        action: "live_fetch"
      });

      assert.equal(decision.allowed, true, `${sourceId} should be allowed in PUBLIC_BETA`);
    }
  });

  it("fails closed for unknown sources", () => {
    const decision = getSourcePolicyDecision({
      sourceId: "unknown_source",
      environment: "PUBLIC_BETA",
      action: "live_fetch"
    });

    assert.equal(decision.allowed, false);
    assert.match(decision.reason, /unknown source_id/);
  });

  it("keeps DexScreener, GoPlus, and Honeypot blocked in PUBLIC_BETA", () => {
    for (const sourceId of ["dexscreener", "goplus_security", "honeypot_is"]) {
      const decision = getSourcePolicyDecision({
        sourceId,
        environment: "PUBLIC_BETA",
        action: "live_fetch"
      });

      assert.equal(decision.allowed, false, `${sourceId} should remain blocked in PUBLIC_BETA`);
    }
  });

  it("fixture mode does not call network", async () => {
    const originalFetch = globalThis.fetch;
    let fetchCalled = false;
    globalThis.fetch = (async () => {
      fetchCalled = true;
      throw new Error("fixture mode must not call fetch");
    }) as typeof fetch;

    try {
      await Promise.all([alternativeMeFngAdapter.fetchFixture(), defillamaAdapter.fetchFixture()]);
      assert.equal(fetchCalled, false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("live mode calls only the approved public API URLs", async () => {
    const originalFetch = globalThis.fetch;
    const fetchedUrls: string[] = [];
    const alternativeFixture = await readFile(resolveRepoFile("tools/data-poc/fixtures/alternative_me_fng_sample.json"), "utf8");
    const defillamaFixture = await readFile(resolveRepoFile("tools/data-poc/fixtures/defillama_protocols_sample.json"), "utf8");

    globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input);
      fetchedUrls.push(url);

      if (url === ALTERNATIVE_ME_FNG_URL) {
        return new Response(alternativeFixture, { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url === DEFILLAMA_PROTOCOLS_URL) {
        return new Response(defillamaFixture, { status: 200, headers: { "content-type": "application/json" } });
      }

      throw new Error(`unexpected URL ${url}`);
    }) as typeof fetch;

    try {
      await alternativeMeFngAdapter.fetchLive({ environment: "PUBLIC_BETA" });
      await defillamaAdapter.fetchLive({ environment: "PUBLIC_BETA" });
      assert.deepEqual(fetchedUrls, [ALTERNATIVE_ME_FNG_URL, DEFILLAMA_PROTOCOLS_URL]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("stores normalized output without raw provider responses", async () => {
    const outputs = await Promise.all([alternativeMeFngAdapter.fetchFixture(), defillamaAdapter.fetchFixture()]);
    const serialized = JSON.stringify(outputs);

    assert.equal(serialized.includes('"metadata"'), false);
    assert.equal(serialized.includes('"description"'), false);
    assert.equal(serialized.includes('"symbol"'), false);
    assert.equal(serialized.includes('"chains"'), false);
  });

  it("writes approved source output to a temporary output folder", async () => {
    const tempRoot = await mkdtemp(resolve(tmpdir(), "crypto-edge-approved-sources-"));

    try {
      const result = await runApprovedSourcesPoc({
        mode: "fixture",
        now: new Date("2026-06-24T12:34:56.000Z"),
        baseOutputDir: tempRoot
      });
      const persisted = JSON.parse(await readFile(result.output_file, "utf8")) as unknown;

      assert.equal(result.output.run_id, "approved_sources_20260624123456");
      assert.equal(result.output_file.endsWith(APPROVED_SOURCES_OUTPUT_FILENAME), true);
      assert.equal(relative(tempRoot, result.output_dir), result.output.run_id);
      assert.deepEqual(persisted, result.output);
      assert.equal(result.output.summary.sources_requested, 2);
      assert.equal(result.output.summary.sources_allowed, 2);
      assert.equal(result.output.summary.sources_denied, 0);
      assert.equal(result.output.summary.records_total, 3);
      assert.equal(result.output.provenance.schema_version, "context_snapshot_v1");
      assert.equal(result.output.provenance.contract_version, "real_data_boundary_v1");
      assert.equal(result.output.provenance.environment, "DEVELOPMENT_DEMO");
      assert.equal(result.output.provenance.fixture_used, true);
      assert.equal(result.output.provenance.policy_decisions.alternative_me_fng.raw_storage, "denied");
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("treats a PUBLIC_BETA DefiLlama fetch failure as degraded for local RC", async () => {
    const tempRoot = await mkdtemp(resolve(tmpdir(), "crypto-edge-approved-sources-"));
    const adapter = failingLiveAdapter(DEFILLAMA_SOURCE_ID, "DefiLlama API", new Error("fetch failed"));

    try {
      const result = await runApprovedSourcesPoc({
        mode: "live",
        environment: "PUBLIC_BETA",
        now: new Date("2026-06-24T12:34:56.000Z"),
        baseOutputDir: tempRoot,
        adapters: [adapter]
      });
      const source = result.output.sources[0];

      assert.equal(source.source_id, DEFILLAMA_SOURCE_ID);
      assert.equal(source.policy.allowed, true);
      assert.equal(source.policy.environment, "PUBLIC_BETA");
      assert.equal(source.policy.action, "live_fetch");
      assert.equal(source.health_status, DEGRADED_EXTERNAL_SOURCE_STATUS);
      assert.notEqual(source.health_status, "ok");
      assert.deepEqual(source.records, []);
      assert.deepEqual(source.errors, ["fetch failed"]);
      assert.match(source.warnings.join("\n"), new RegExp(EXTERNAL_SOURCE_DEGRADED_LABEL));
      assert.match(source.warnings.join("\n"), new RegExp(DEGRADED_EXTERNAL_SOURCE_STATUS));
      assert.equal(result.output.summary.errors_total, 1);
      assert.equal(result.output.summary.warnings_total, 1);
      assert.equal(result.output.summary.degraded_external_sources_total, 1);
      assert.equal(result.output.summary.hard_failures_total, 0);
      assert.equal(shouldFailApprovedSourcesRun(result.output), false);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("keeps strict live source mode hard-failing on degraded external sources", async () => {
    const tempRoot = await mkdtemp(resolve(tmpdir(), "crypto-edge-approved-sources-"));
    const adapter = failingLiveAdapter(DEFILLAMA_SOURCE_ID, "DefiLlama API", new Error("fetch failed"));

    try {
      const result = await runApprovedSourcesPoc({
        mode: "live",
        environment: "PUBLIC_BETA",
        now: new Date("2026-06-24T12:34:56.000Z"),
        baseOutputDir: tempRoot,
        adapters: [adapter]
      });

      assert.equal(shouldFailApprovedSourcesRun(result.output, { strictLiveSources: true }), true);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("keeps policy denied live sources as hard failures", async () => {
    const tempRoot = await mkdtemp(resolve(tmpdir(), "crypto-edge-approved-sources-"));
    const adapter: SourceAdapter = {
      sourceId: "dexscreener",
      displayName: "DexScreener",
      supportedActions: ["fixture_load", "live_fetch"],
      async fetchFixture() {
        throw new Error("not used");
      },
      async fetchLive(options) {
        assertSourceActionAllowed({
          sourceId: "dexscreener",
          environment: options.environment,
          action: "live_fetch"
        });
        throw new Error("unreachable");
      }
    };

    try {
      const result = await runApprovedSourcesPoc({
        mode: "live",
        environment: "PUBLIC_BETA",
        now: new Date("2026-06-24T12:34:56.000Z"),
        baseOutputDir: tempRoot,
        adapters: [adapter]
      });
      const source = result.output.sources[0];

      assert.equal(source.policy.allowed, false);
      assert.equal(source.health_status, "error");
      assert.equal(source.warnings.some((warning) => warning.includes(DEGRADED_EXTERNAL_SOURCE_STATUS)), false);
      assert.equal(result.output.summary.degraded_external_sources_total, 0);
      assert.equal(result.output.summary.hard_failures_total, 1);
      assert.equal(shouldFailApprovedSourcesRun(result.output), true);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("keeps non-fetch live source errors as hard failures", async () => {
    const tempRoot = await mkdtemp(resolve(tmpdir(), "crypto-edge-approved-sources-"));
    const adapter = failingLiveAdapter(DEFILLAMA_SOURCE_ID, "DefiLlama API", new Error("Cannot read properties of undefined"));

    try {
      const result = await runApprovedSourcesPoc({
        mode: "live",
        environment: "PUBLIC_BETA",
        now: new Date("2026-06-24T12:34:56.000Z"),
        baseOutputDir: tempRoot,
        adapters: [adapter]
      });
      const source = result.output.sources[0];

      assert.equal(source.policy.allowed, true);
      assert.equal(source.health_status, "error");
      assert.equal(result.output.summary.degraded_external_sources_total, 0);
      assert.equal(result.output.summary.hard_failures_total, 1);
      assert.equal(shouldFailApprovedSourcesRun(result.output), true);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("registers only the approved Camp BETA adapters", () => {
    assert.deepEqual(
      getApprovedSourceAdapters().map((adapter) => adapter.sourceId).sort(),
      [ALTERNATIVE_ME_FNG_SOURCE_ID, DEFILLAMA_SOURCE_ID].sort()
    );
    assert.equal(getSourceAdapter("coingecko_api"), null);
  });

  it("does not include a scraping fallback in source adapters", () => {
    const paths = [
      "tools/data-poc/src/sources/alternativeMeFngAdapter.ts",
      "tools/data-poc/src/sources/defillamaAdapter.ts"
    ];
    const forbiddenPatterns = [/cheerio/i, /puppeteer/i, /playwright/i, /parseHTML/i, /DOMParser/i, /text\/html/i, /\.text\(\)/];

    for (const path of paths) {
      const contents = readFileSync(resolveRepoFile(path), "utf8");
      for (const pattern of forbiddenPatterns) {
        assert.equal(pattern.test(contents), false, `${path} must not contain scraping fallback pattern ${pattern}`);
      }
    }
  });
});

function failingLiveAdapter(sourceId: string, displayName: string, error: Error): SourceAdapter {
  return {
    sourceId,
    displayName,
    supportedActions: ["fixture_load", "live_fetch"],
    async fetchFixture() {
      throw new Error("not used");
    },
    async fetchLive() {
      throw error;
    }
  };
}
