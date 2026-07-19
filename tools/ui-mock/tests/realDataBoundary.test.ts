import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { after, before, describe, it } from "node:test";
import { createScannerApiServer } from "../server/scannerApiServer.js";
import {
  ContextOutputError,
  readLatestContextOutput,
} from "../server/latestContextOutput.js";
import {
  readLatestScannerOutput,
  ScannerOutputError,
} from "../server/latestScannerOutput.js";
import { getDataSourceOptions } from "../src/App.js";
import { PERSISTABLE_SCANNER_SAMPLE } from "../src/fixtures/persistableScannerSample.js";
import { loadScannerDataSourceResult } from "../src/services/scannerDataSource.js";
import type {
  PersistableCandidate,
  PersistableScannerOutput,
} from "../src/types/scannerTypes.js";
import { getWorkspaceNavGroups } from "../src/workspaceNavigation.js";

const NOW = new Date("2026-07-16T12:00:00.000Z");
let tempRoot = "";

before(async () => {
  tempRoot = await mkdtemp(resolve(tmpdir(), "crypto-edge-real-boundary-"));
});

after(async () => {
  await rm(tempRoot, { recursive: true, force: true });
});

describe("INTERNAL_BETA scanner provenance boundary", () => {
  it("rejects fixture scanner output", async () => {
    const output = makeScannerOutput();
    output.provenance.fixture_used = true;
    await expectScannerCode(output, "SCANNER_FIXTURE_FORBIDDEN");
  });

  it("rejects live output without a manifest", async () => {
    const output = makeScannerOutput() as Record<string, unknown>;
    delete output.provenance;
    await expectScannerCode(output, "SCANNER_MANIFEST_MISSING");
  });

  it("rejects an unknown manifest version", async () => {
    const output = makeScannerOutput();
    output.provenance.schema_version = "scanner_snapshot_v999";
    await expectScannerCode(output, "SCANNER_MANIFEST_VERSION_UNSUPPORTED");
  });

  it("rejects missing policy decisions", async () => {
    const output = makeScannerOutput();
    delete output.provenance.policy_decisions.dexscreener;
    await expectScannerCode(output, "SCANNER_POLICY_DECISIONS_MISSING");
  });

  it("rejects policy decisions for a source omitted from source_ids", async () => {
    const output = makeScannerOutput();
    output.provenance.policy_decisions.unknown_source = allowedPolicy();
    await expectScannerCode(output, "SCANNER_SOURCE_UNKNOWN");
  });

  it("rejects a live output with a fixture marker", async () => {
    const output = makeScannerOutput();
    output.scan_run.query = "fixture";
    await expectScannerCode(output, "SCANNER_FIXTURE_MARKER_DETECTED");
  });

  it("rejects a non-INTERNAL_BETA environment", async () => {
    const output = makeScannerOutput();
    output.provenance.environment = "PUBLIC_BETA";
    await expectScannerCode(output, "SCANNER_ENVIRONMENT_INVALID");
  });

  it("rejects raw_storage allowed", async () => {
    const output = makeScannerOutput();
    output.provenance.policy_decisions.dexscreener.raw_storage = "allowed";
    await expectScannerCode(output, "SCANNER_RAW_STORAGE_ALLOWED");
  });

  it("rejects normalized_storage denied", async () => {
    const output = makeScannerOutput();
    output.provenance.policy_decisions.dexscreener.normalized_storage = "denied";
    await expectScannerCode(output, "SCANNER_POLICY_DENIED");
  });

  it("rejects user_display denied", async () => {
    const output = makeScannerOutput();
    output.provenance.policy_decisions.dexscreener.user_display = "denied";
    await expectScannerCode(output, "SCANNER_POLICY_DENIED");
  });

  it("fails closed for an unknown source", async () => {
    const output = makeScannerOutput();
    output.provenance.source_ids.push("unknown_source");
    output.provenance.policy_decisions.unknown_source = allowedPolicy();
    await expectScannerCode(output, "SCANNER_SOURCE_UNKNOWN");
  });

  it("rejects security lineage not declared in the manifest", async () => {
    const output = makeScannerOutput();
    output.provenance.source_ids = ["dexscreener"];
    delete output.provenance.policy_decisions.goplus_security;
    await expectScannerCode(output, "SCANNER_LINEAGE_MISMATCH");
  });

  it("rejects unknown scanner metadata fields", async () => {
    const output = makeScannerOutput();
    output.provenance.metadata.raw_payload = { secret: true };
    await expectScannerCode(output, "SCANNER_METADATA_INVALID");
  });

  it("rejects source URLs carrying query data", async () => {
    const output = makeScannerOutput();
    output.candidates[0].source_url = "https://dexscreener.com/ethereum/pair?api_key=secret";
    await expectScannerCode(output, "SCANNER_SCHEMA_INVALID");
  });

  it("rejects a stale scanner timestamp", async () => {
    const output = makeScannerOutput();
    setScannerTime(output, "2026-07-16T11:29:00.000Z");
    await expectScannerCode(output, "SCANNER_SNAPSHOT_STALE");
  });

  it("rejects a future scanner timestamp", async () => {
    const output = makeScannerOutput();
    setScannerTime(output, "2026-07-16T12:06:00.000Z");
    await expectScannerCode(output, "SCANNER_TIMESTAMP_FUTURE");
  });

  it("rejects an invalid scanner timestamp", async () => {
    const output = makeScannerOutput();
    setScannerTime(output, "not-a-timestamp");
    await expectScannerCode(output, "SCANNER_TIMESTAMP_INVALID");
  });

  it("expires security older than 30 minutes", async () => {
    const output = makeScannerOutput();
    output.security_checks[0].checked_at = "2026-07-16T11:29:00.000Z";
    const result = await readScanner(output);
    const security = asRecords(result.security_checks)[0];
    assert.equal(security.security_label, "SECURITY DATA UNAVAILABLE");
    assert.deepEqual(security.sources, []);
  });

  it("treats GoPlus as full coverage for the active security contract", async () => {
    const output = makeScannerOutput();
    output.security_checks[0].sources = ["goplus"];
    const result = await readScanner(output);
    const security = asRecords(result.security_checks)[0];
    assert.equal(security.coverage_status, null);
    assert.equal(security.security_label, "NEEDS MANUAL VERIFICATION");
  });

  it("marks the active security source as SECURITY DATA UNAVAILABLE", async () => {
    const output = makeScannerOutput();
    output.security_checks[0].sources = [];
    const result = await readScanner(output);
    const security = asRecords(result.security_checks)[0];
    assert.equal(security.coverage_status, "SECURITY DATA UNAVAILABLE");
    assert.equal(security.security_label, "SECURITY DATA UNAVAILABLE");
  });

  it("removes unknown and raw fields through the API allowlist", async () => {
    const output = makeScannerOutput() as ScannerFactoryOutput & Record<string, unknown>;
    output.local_path = "C:\\Users\\owner\\secret\\full_output.json";
    output.provider_response = { secret: "raw" };
    output.candidates[0] = {
      ...output.candidates[0],
      raw_payload: { secret: true },
      unknown_provider_field: "remove-me",
    };
    const outputDir = await writeScanner(output);
    const server = createScannerApiServer({
      runtimeMode: "INTERNAL_BETA",
      scanner: { outputDirPath: outputDir, now: NOW },
      context: { outputDirPath: resolve(tempRoot, "missing-context"), now: NOW },
    });

    await listen(server);
    try {
      const address = server.address() as AddressInfo;
      const response = await fetch(`http://127.0.0.1:${address.port}/api/scanner/latest`);
      const body = await response.text();
      assert.equal(response.status, 200);
      assert.equal(body.includes("C:\\\\Users"), false);
      for (const forbidden of ["local_path", "provider_response", "raw_payload", "unknown_provider_field", "secret"]) {
        assert.equal(body.includes(forbidden), false, `${forbidden} must be removed`);
      }
      assert.notEqual(response.headers.get("access-control-allow-origin"), "*");
      assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
    } finally {
      await close(server);
    }
  });

  it("preserves allowlisted two-basket identity metadata", async () => {
    const result = await readScanner(makeScannerOutput());
    const candidates = asRecords(result.candidates);
    assert.equal(candidates[0]?.discovery_basket, "established");
    assert.equal(candidates[0]?.discovery_method, "address_seeded_universe");
    assert.equal(candidates[0]?.address_identity_verified, true);
    assert.equal(candidates[1]?.discovery_basket, "new_emerging");
    assert.equal(candidates[1]?.observation_only, true);
    const provenance = result.provenance;
    assert.ok(isRecord(provenance) && isRecord(provenance.metadata));
    assert.equal(provenance.metadata.discovery_architecture, "two_basket_discovery_v1");
  });

  it("accepts an explicit empty established universe without fixture fallback", async () => {
    const result = await readScanner(makeEmptyEstablishedScannerOutput());
    assert.equal(result._source_meta instanceof Object, true);
    assert.equal(asRecords(result.candidates).every((candidate) => candidate.discovery_basket === "new_emerging"), true);
    assert.equal(JSON.stringify(result).includes("fixture-fallback"), false);
  });
});

describe("API and frontend fail-closed behavior", () => {
  it("returns 503 without an output directory and never returns a fixture", async () => {
    const server = createScannerApiServer({
      runtimeMode: "INTERNAL_BETA",
      scanner: { outputDirPath: resolve(tempRoot, "does-not-exist-scanner"), now: NOW },
      context: { outputDirPath: resolve(tempRoot, "does-not-exist-context"), now: NOW },
    });
    await listen(server);
    try {
      const address = server.address() as AddressInfo;
      const response = await fetch(`http://127.0.0.1:${address.port}/api/scanner/latest`);
      const body = await response.json() as Record<string, unknown>;
      assert.equal(response.status, 503);
      assert.equal(body.reason_code, "SCANNER_OUTPUT_DIRECTORY_MISSING");
      assert.equal(JSON.stringify(body).includes("fixture"), false);

      const diagnosticsResponse = await fetch(`http://127.0.0.1:${address.port}/api/scanner/sources`);
      const diagnosticsBody = await diagnosticsResponse.text();
      assert.equal(diagnosticsResponse.status, 200);
      assert.equal(diagnosticsBody.includes("fixture"), false);
    } finally {
      await close(server);
    }
  });

  it("defaults direct readers to fail-closed when runtime mode is missing", async () => {
    await assert.rejects(
      () => readLatestScannerOutput({ outputDirPath: resolve(tempRoot, "default-mode-scanner") }),
      (error: unknown) => error instanceof ScannerOutputError && error.code === "RUNTIME_MODE_UNCONFIGURED",
    );
    await assert.rejects(
      () => readLatestContextOutput({ outputDirPath: resolve(tempRoot, "default-mode-context") }),
      (error: unknown) => error instanceof ContextOutputError && error.code === "RUNTIME_MODE_UNCONFIGURED",
    );
  });

  it("keeps process health 200 while data readiness is 503", async () => {
    const server = createScannerApiServer({
      runtimeMode: "INTERNAL_BETA",
      scanner: { outputDirPath: resolve(tempRoot, "health-missing-scanner"), now: NOW },
      context: { outputDirPath: resolve(tempRoot, "health-missing-context"), now: NOW },
    });
    await listen(server);
    try {
      const address = server.address() as AddressInfo;
      const base = `http://127.0.0.1:${address.port}`;
      assert.equal((await fetch(`${base}/api/health`)).status, 200);
      const readiness = await fetch(`${base}/api/readiness`);
      assert.equal(readiness.status, 503);
      const body = await readiness.json() as Record<string, unknown>;
      assert.equal(body.status, "not_ready");
    } finally {
      await close(server);
    }
  });

  it("reports process/new/context ready and established empty but configured", async () => {
    const scannerDir = await writeScanner(makeEmptyEstablishedScannerOutput());
    const contextDir = await writeContext(makeContextOutput());
    const server = createScannerApiServer({
      runtimeMode: "INTERNAL_BETA",
      scanner: { outputDirPath: scannerDir, now: NOW },
      context: { outputDirPath: contextDir, now: NOW },
    });
    await listen(server);
    try {
      const address = server.address() as AddressInfo;
      const response = await fetch(`http://127.0.0.1:${address.port}/api/readiness`);
      const body = await response.json() as Record<string, unknown>;
      assert.equal(response.status, 200);
      assert.equal(body.status, "ready_with_empty_established_universe");
      assert.deepEqual(body.process, { ready: true, reason_code: null });
      assert.deepEqual(body.new_emerging, { ready: true, status: "ready", reason_code: null });
      assert.deepEqual(body.established, {
        ready: false,
        configured: true,
        status: "empty_configured",
        reason_code: "ESTABLISHED_UNIVERSE_EMPTY",
      });
    } finally {
      await close(server);
    }
  });

  it("returns zero sample candidates after a frontend API error", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({
      status: "data_unavailable",
      reason_code: "SCANNER_OUTPUT_UNAVAILABLE",
      message: "Data Unavailable",
    }), { status: 503, headers: { "content-type": "application/json" } })) as typeof fetch;

    try {
      const result = await loadScannerDataSourceResult("api", { runtimeMode: "INTERNAL_BETA" });
      assert.equal(result.status, "error");
      assert.equal(result.output, null);
      assert.equal(result.usedFallback, false);
      if (result.status === "error") assert.equal(result.reasonCode, "SCANNER_OUTPUT_UNAVAILABLE");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("rejects a fixture response returned with HTTP 200 in INTERNAL_BETA", async () => {
    const originalFetch = globalThis.fetch;
    const output = structuredClone(PERSISTABLE_SCANNER_SAMPLE) as ScannerApiOutput;
    output._source_meta = {
      source: "fixture-fallback",
      output_file: null,
      reason: "demo response",
      selected_run_id: null,
      loaded_at: NOW.toISOString(),
      runtime_mode: "DEVELOPMENT_DEMO",
    };
    globalThis.fetch = (async () => new Response(JSON.stringify(output), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;

    try {
      const result = await loadScannerDataSourceResult("api", { runtimeMode: "INTERNAL_BETA" });
      assert.equal(result.status, "error");
      assert.equal(result.output, null);
      if (result.status === "error") {
        assert.equal(result.reasonCode, "SCANNER_FIXTURE_RESPONSE_FORBIDDEN");
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("allows fixture only in explicit DEVELOPMENT_DEMO", async () => {
    const missingOutput = resolve(tempRoot, "demo-missing-output");
    const fixturePath = resolve("public", "fixtures", "persistableScannerSample.json");
    const output = await readLatestScannerOutput({
      runtimeMode: "DEVELOPMENT_DEMO",
      outputDirPath: missingOutput,
      fixturePath,
      now: NOW,
    });
    assert.equal(output._source_meta.source, "fixture-fallback");
    assert.equal(output._source_meta.runtime_mode, "DEVELOPMENT_DEMO");
  });

  it("hides demo source selectors and demo navigation in INTERNAL_BETA", () => {
    assert.deepEqual(getDataSourceOptions("INTERNAL_BETA"), []);
    const serializedNav = JSON.stringify(getWorkspaceNavGroups("INTERNAL_BETA"));
    for (const forbidden of ["Built-in sample", "Local data file", "Trusted Preview", "Webinar Teaser"]) {
      assert.equal(serializedNav.includes(forbidden), false);
    }
    for (const required of ["Radar", "Szczegóły", "Weryfikacja", "Metodologia"]) {
      assert.equal(serializedNav.includes(required), true);
    }
  });
});

describe("INTERNAL_BETA context freshness boundary", () => {
  it("accepts allowlisted fresh context and exposes real provenance", async () => {
    const output = makeContextOutput();
    const result = await readContext(output);
    assert.equal(result.environment, "INTERNAL_BETA");
    assert.equal(result.summary.data_status, "READY");
    assert.deepEqual(result._source_meta.source_ids, ["alternative_me_fng", "defillama_api"]);
    assert.deepEqual(result.sources.map((source) => source.attribution?.provider), ["Alternative.me", "DefiLlama"]);
  });

  it("rejects context metadata that could carry raw provider data", async () => {
    const output = makeContextOutput();
    output.provenance.metadata.raw_payload = { secret: true };
    await expectContextCode(output, "CONTEXT_METADATA_INVALID");
  });

  it("rejects Alternative.me after 30 hours", async () => {
    const output = makeContextOutput();
    output.sources[0].fetched_at = "2026-07-15T05:59:00.000Z";
    await expectContextCode(output, "CONTEXT_ALTERNATIVE_ME_STALE");
  });

  it("rejects DefiLlama after 6 hours", async () => {
    const output = makeContextOutput();
    output.sources[1].fetched_at = "2026-07-16T05:59:00.000Z";
    await expectContextCode(output, "CONTEXT_DEFILLAMA_STALE");
  });

  it("keeps last-known-good inside SLA explicitly DEGRADED", async () => {
    const output = makeContextOutput();
    output.sources[1].health_status = "degraded_external_source";
    output.sources[1].warnings = ["last-known-good"];
    const result = await readContext(output);
    assert.equal(result.sources[1].status, "DEGRADED");
    assert.equal(result.summary.data_status, "DEGRADED");
  });

  it("rejects fixture context in INTERNAL_BETA", async () => {
    const output = makeContextOutput();
    output.provenance.fixture_used = true;
    await expectContextCode(output, "CONTEXT_FIXTURE_FORBIDDEN");
  });
});

async function expectScannerCode(output: unknown, code: string): Promise<void> {
  await assert.rejects(
    () => readScanner(output),
    (error: unknown) => error instanceof ScannerOutputError && error.code === code,
  );
}

async function readScanner(output: unknown): Promise<Record<string, unknown>> {
  const outputDir = await writeScanner(output);
  return readLatestScannerOutput({
    runtimeMode: "INTERNAL_BETA",
    outputDirPath: outputDir,
    now: NOW,
  });
}

async function writeScanner(output: unknown): Promise<string> {
  const outputDir = resolve(tempRoot, `scanner-${crypto.randomUUID()}`);
  const runId = isRecord(output) && isRecord(output.scan_run) && typeof output.scan_run.run_id === "string"
    ? output.scan_run.run_id
    : `scan_${crypto.randomUUID()}`;
  const runDir = resolve(outputDir, runId);
  await mkdir(runDir, { recursive: true });
  await writeFile(resolve(runDir, "full_output.json"), JSON.stringify(output), "utf8");
  return outputDir;
}

async function writeContext(output: ContextFactoryOutput): Promise<string> {
  const outputDir = resolve(tempRoot, `context-${crypto.randomUUID()}`);
  const runDir = resolve(outputDir, output.run_id);
  await mkdir(runDir, { recursive: true });
  await writeFile(resolve(runDir, "approved_sources_output.json"), JSON.stringify(output), "utf8");
  return outputDir;
}

async function expectContextCode(output: ContextFactoryOutput, code: string): Promise<void> {
  await assert.rejects(
    () => readContext(output),
    (error: unknown) => error instanceof ContextOutputError && error.code === code,
  );
}

async function readContext(output: ContextFactoryOutput) {
  const outputDir = resolve(tempRoot, `context-${crypto.randomUUID()}`);
  const runDir = resolve(outputDir, output.run_id);
  await mkdir(runDir, { recursive: true });
  await writeFile(resolve(runDir, "approved_sources_output.json"), JSON.stringify(output), "utf8");
  return readLatestContextOutput({
    runtimeMode: "INTERNAL_BETA",
    outputDirPath: outputDir,
    now: NOW,
  });
}

function makeScannerOutput(): ScannerFactoryOutput {
  const output = structuredClone(PERSISTABLE_SCANNER_SAMPLE) as ScannerFactoryOutput;
  const runId = "scan_20260716120000";
  output.scan_run.run_id = runId;
  output.scan_run.mode = "live";
  output.scan_run.query = "two_basket_discovery";
  output.scan_run.started_at = "2026-07-16T11:58:00.000Z";
  output.scan_run.finished_at = NOW.toISOString();
  output.scan_run.errors = [];
  output.candidates = output.candidates.map((candidate, index) => ({
    ...candidate,
    run_id: runId,
    symbol: `TKN${index + 1}`,
    name: `Token ${index + 1}`,
    contract_address: `0x${String(index + 1).repeat(40)}`,
    pair_address: `0x${String(index + 4).repeat(40)}`,
    source_url: `https://dexscreener.com/ethereum/pair-${index + 1}`,
    created_at: NOW.toISOString(),
    discovery_basket: index === 1 ? "new_emerging" : "established",
    discovery_method: index === 1 ? "dexscreener_latest_token_profiles" : "address_seeded_universe",
    observation_only: index === 1,
    established_eligible: index !== 1 && candidate.basic_filter_status === "passed_basic_filter",
    universe_version: index === 1 ? null : "established_address_universe_v1",
    universe_entry_index: index === 1 ? null : index === 0 ? 0 : 1,
    address_identity_verified: index !== 1,
  }));
  const candidateIds = output.candidates.map((candidate) => candidate.candidate_id);
  const establishedPassedIds = output.candidates
    .filter((candidate) => candidate.discovery_basket === "established" && candidate.basic_filter_status === "passed_basic_filter")
    .map((candidate) => candidate.candidate_id);
  output.security_checks = output.security_checks.map((security, index) => ({
    ...security,
    run_id: runId,
    candidate_id: establishedPassedIds[index] ?? establishedPassedIds[0],
    checked_at: NOW.toISOString(),
    sources: ["goplus"],
  }));
  output.scorecards = output.scorecards.map((scorecard, index) => ({
    ...scorecard,
    run_id: runId,
    candidate_id: candidateIds[index],
    created_at: NOW.toISOString(),
  }));
  output.provenance = {
    schema_version: "scanner_snapshot_v1",
    contract_version: "real_data_boundary_v1",
    generator_version: "data_poc_persistable_scanner_v1",
    environment: "INTERNAL_BETA",
    mode: "live",
    fixture_used: false,
    run_id: runId,
    generated_at: NOW.toISOString(),
    finished_at: NOW.toISOString(),
    source_ids: ["dexscreener", "goplus_security"],
    policy_decisions: {
      dexscreener: allowedPolicy(),
      goplus_security: allowedPolicy(),
    },
    metadata: {
      discovery_architecture: "two_basket_discovery_v1",
      new_emerging: {
        discovery_method: "dexscreener_latest_token_profiles",
        seed_count: 1,
        pairs_loaded: 1,
        candidates_before_filters: 1,
        candidates_after_filters: output.candidates.filter((candidate) => candidate.discovery_basket === "new_emerging" && candidate.basic_filter_status === "passed_basic_filter").length,
      },
      established: {
        discovery_method: "address_seeded_universe",
        universe_version: "established_address_universe_v1",
        universe_status: "ESTABLISHED_UNIVERSE_READY",
        entries_total: 2,
        entries_enabled: 2,
        pairs_loaded: 2,
        candidates_before_filters: 2,
        candidates_after_filters: output.candidates.filter((candidate) => candidate.discovery_basket === "established" && candidate.basic_filter_status === "passed_basic_filter").length,
        base_token_candidates: 2,
        quote_token_candidates: 0,
      },
      readiness: {
        process: "READY",
        new_emerging: "READY",
        established: "READY",
        context: "READY",
      },
      security_candidate_limit: 3,
      security_candidates_requested: Math.min(
        3,
        output.candidates.filter((candidate) => candidate.discovery_basket === "established" && candidate.basic_filter_status === "passed_basic_filter").length,
      ),
      request_counts: {
        dexscreener: output.candidates.length + 1,
        goplus_security: 1,
        alternative_me_fng: 1,
        defillama_api: 1,
      },
      source_health: {
        dexscreener: "READY",
        goplus_security: "READY",
        alternative_me_fng: "READY",
        defillama_api: "READY",
      },
      attribution: { provider: "GoPlus Security" },
    },
  };
  return output;
}

function makeEmptyEstablishedScannerOutput(): ScannerFactoryOutput {
  const output = makeScannerOutput();
  const observation = output.candidates.find((candidate) => candidate.discovery_basket === "new_emerging");
  assert.ok(observation);
  output.candidates = [observation];
  output.security_checks = [];
  output.scorecards = [];
  output.provenance.source_ids = ["dexscreener"];
  delete output.provenance.policy_decisions.goplus_security;
  output.provenance.metadata.new_emerging = {
    discovery_method: "dexscreener_latest_token_profiles",
    seed_count: 1,
    pairs_loaded: 1,
    candidates_before_filters: 1,
    candidates_after_filters: observation.basic_filter_status === "passed_basic_filter" ? 1 : 0,
  };
  output.provenance.metadata.established = {
    discovery_method: "address_seeded_universe",
    universe_version: "established_address_universe_v1",
    universe_status: "ESTABLISHED_UNIVERSE_EMPTY",
    entries_total: 0,
    entries_enabled: 0,
    pairs_loaded: 0,
    candidates_before_filters: 0,
    candidates_after_filters: 0,
    base_token_candidates: 0,
    quote_token_candidates: 0,
  };
  output.provenance.metadata.readiness = {
    process: "READY",
    new_emerging: "READY",
    established: "EMPTY_CONFIGURED",
    context: "READY",
  };
  output.provenance.metadata.security_candidates_requested = 0;
  output.provenance.metadata.request_counts.dexscreener = 2;
  output.provenance.metadata.request_counts.goplus_security = 0;
  output.provenance.metadata.source_health.goplus_security = "NOT_INVOKED";
  delete (output.provenance.metadata as Record<string, unknown>).attribution;
  return output;
}

function setScannerTime(output: ScannerFactoryOutput, timestamp: string): void {
  output.provenance.generated_at = timestamp;
  output.provenance.finished_at = timestamp;
  output.scan_run.finished_at = timestamp;
}

function makeContextOutput(): ContextFactoryOutput {
  const runId = "approved_sources_20260716120000";
  return {
    provenance: {
      schema_version: "context_snapshot_v1",
      contract_version: "real_data_boundary_v1",
      generator_version: "approved_sources_poc_v1",
      environment: "INTERNAL_BETA",
      mode: "live",
      fixture_used: false,
      run_id: runId,
      generated_at: NOW.toISOString(),
      finished_at: NOW.toISOString(),
      source_ids: ["alternative_me_fng", "defillama_api"],
      policy_decisions: {
        alternative_me_fng: allowedPolicy(),
        defillama_api: allowedPolicy(),
      },
      metadata: {
        request_counts: { alternative_me_fng: 1, defillama_api: 1 },
        attributions: {
          alternative_me_fng: alternativeMeAttribution(),
          defillama_api: defillamaAttribution(),
        },
        raw_payload: undefined,
      },
    },
    run_id: runId,
    generated_at: NOW.toISOString(),
    environment: "INTERNAL_BETA",
    sources: [
      {
        source_id: "alternative_me_fng",
        source_name: "Alternative.me Fear & Greed Index",
        mode: "live",
        fetched_at: "2026-07-16T11:00:00.000Z",
        attribution: alternativeMeAttribution(),
        policy: internalFetchPolicy("alternative_me_fng"),
        data_category: "sentiment",
        records: [{
          record_type: "fear_greed_index",
          value: 42,
          value_classification: "Fear",
          timestamp: "2026-07-16T11:00:00.000Z",
          time_until_update: "3600",
        }],
        warnings: [],
        errors: [],
      },
      {
        source_id: "defillama_api",
        source_name: "DefiLlama API",
        mode: "live",
        fetched_at: "2026-07-16T11:00:00.000Z",
        attribution: defillamaAttribution(),
        policy: internalFetchPolicy("defillama_api"),
        data_category: "defi_context",
        records: [{
          record_type: "defi_protocol_snapshot",
          name: "Lido",
          chain: "Ethereum",
          tvl_usd: 35_400_000_000,
          change_1d: 0.75,
          change_7d: -2.1,
          url: "https://lido.fi",
        }],
        warnings: [],
        errors: [],
      },
    ],
    summary: {
      sources_requested: 2,
      sources_allowed: 2,
      sources_denied: 0,
      records_total: 2,
      warnings_total: 0,
      errors_total: 0,
    },
  };
}

function allowedPolicy() {
  return {
    live_fetch: "allowed" as const,
    normalized_storage: "allowed" as const,
    user_display: "allowed" as const,
    raw_storage: "denied" as const,
  };
}

function internalFetchPolicy(sourceId: string) {
  return {
    environment: "INTERNAL_BETA",
    action: "live_fetch",
    allowed: true,
    reason: `Allowed: ${sourceId} may perform live_fetch in INTERNAL_BETA`,
  };
}

function alternativeMeAttribution() {
  return {
    provider: "Alternative.me",
    requirement: "Attribution appreciated, not required",
    url: "https://alternative.me/crypto/fear-and-greed-index/",
  };
}

function defillamaAttribution() {
  return {
    provider: "DefiLlama",
    requirement: "Attribution appreciated",
    url: "https://defillama.com/",
  };
}

function asRecords(value: unknown): Record<string, unknown>[] {
  assert.ok(Array.isArray(value));
  assert.equal(value.every(isRecord), true);
  return value as Record<string, unknown>[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function listen(server: ReturnType<typeof createScannerApiServer>): Promise<void> {
  return new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
}

function close(server: ReturnType<typeof createScannerApiServer>): Promise<void> {
  return new Promise((resolveClose, rejectClose) => {
    server.close((error) => error ? rejectClose(error) : resolveClose());
  });
}

type ScannerFactoryOutput = PersistableScannerOutput & {
  provenance: {
    schema_version: string;
    contract_version: string;
    generator_version: string;
    environment: string;
    mode: string;
    fixture_used: boolean;
    run_id: string;
    generated_at: string;
    finished_at: string;
    source_ids: string[];
    policy_decisions: Record<string, ReturnType<typeof allowedPolicy>>;
    metadata: {
      discovery_architecture: string;
      new_emerging: Record<string, unknown>;
      established: Record<string, unknown>;
      readiness: Record<string, unknown>;
      security_candidate_limit: number;
      security_candidates_requested: number;
      request_counts: Record<string, number>;
      source_health: Record<string, string>;
      attribution: { provider: string };
      raw_payload?: unknown;
    };
  };
  candidates: Array<Record<string, unknown> & PersistableCandidate>;
};

type ContextFactoryOutput = ReturnType<typeof makeContextOutputShape>;

function makeContextOutputShape() {
  return {
    provenance: {
      schema_version: "",
      contract_version: "",
      generator_version: "",
      environment: "",
      mode: "live",
      fixture_used: false,
      run_id: "",
      generated_at: "",
      finished_at: "",
      source_ids: [] as string[],
      policy_decisions: {} as Record<string, ReturnType<typeof allowedPolicy>>,
      metadata: {
        request_counts: {} as Record<string, number>,
        attributions: {} as Record<string, ReturnType<typeof alternativeMeAttribution>>,
        raw_payload: undefined as unknown,
      },
    },
    run_id: "",
    generated_at: "",
    environment: "",
    sources: [] as Array<{
      source_id: "alternative_me_fng" | "defillama_api";
      source_name: string;
      mode: "live";
      fetched_at: string;
      health_status?: "degraded_external_source";
      attribution: ReturnType<typeof alternativeMeAttribution>;
      policy: ReturnType<typeof internalFetchPolicy>;
      data_category: "sentiment" | "defi_context";
      records: Array<Record<string, unknown>>;
      warnings: string[];
      errors: string[];
    }>,
    summary: {
      sources_requested: 0,
      sources_allowed: 0,
      sources_denied: 0,
      records_total: 0,
      warnings_total: 0,
      errors_total: 0,
    },
  };
}
