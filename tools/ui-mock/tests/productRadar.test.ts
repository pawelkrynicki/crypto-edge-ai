import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { mapPersistableScannerOutputToUiCandidates } from "../src/adapters/scannerOutputAdapter.js";
import { CandidateDetailView } from "../src/components/CandidateDetailView.js";
import {
  CandidateResultsView,
  EstablishedBasket,
  NewEmergingBasket,
  getEstablishedState,
  resolveInitialBasket,
} from "../src/components/CandidateResultsView.js";
import { ExternalVerificationLinksView } from "../src/components/ExternalVerificationLinksView.js";
import { getApiReadinessPresentation } from "../src/components/ProductWorkspaceShell.js";
import { PERSISTABLE_SCANNER_SAMPLE } from "../src/fixtures/persistableScannerSample.js";
import type {
  PersistableScannerOutput,
  ProductReadinessOutput,
  ScannerDiscoveryMetadata,
  UiTokenCandidate,
} from "../src/types/scannerTypes.js";

const productRoot = resolve(process.cwd());
const repoRoot = resolve(productRoot, "..", "..");

const newCandidate: UiTokenCandidate = {
  ...mapPersistableScannerOutputToUiCandidates(PERSISTABLE_SCANNER_SAMPLE)[0],
  discoveryBasket: "new_emerging",
  discoveryMethod: "dexscreener_latest_token_profiles",
  observationOnly: true,
  establishedEligible: false,
  universeVersion: null,
  universeEntryIndex: null,
  addressIdentityVerified: false,
  security: null,
  securityLabel: "NOT_CHECKED",
  filterReasons: ["liquidity_below_min", "pair_age_below_min"],
  basicFilterStatus: "rejected_basic_filter",
};

const establishedCandidate: UiTokenCandidate = {
  ...mapPersistableScannerOutputToUiCandidates(PERSISTABLE_SCANNER_SAMPLE)[0],
  id: "established-solana-pass",
  discoveryBasket: "established",
  discoveryMethod: "address_seeded_universe",
  observationOnly: false,
  establishedEligible: true,
  universeVersion: "established_address_universe_v1",
  universeEntryIndex: 0,
  addressIdentityVerified: true,
  finalLabel: "WATCHLIST",
  basicFilterStatus: "passed_basic_filter",
};

const emptyMetadata: ScannerDiscoveryMetadata = {
  discovery_architecture: "two_basket_discovery_v1",
  new_emerging: {
    discovery_method: "dexscreener_latest_token_profiles",
    seed_count: 3,
    pair_requests_succeeded: 3,
    pair_requests_failed: 0,
    pairs_loaded: 1,
    candidates_before_filters: 1,
    candidates_after_filters: 0,
    discovery_status: "READY",
    failure_reason_counts: {},
  },
  established: {
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
  },
  readiness: {
    process: "READY",
    new_emerging: "READY",
    established: "EMPTY_CONFIGURED",
    context: "READY",
  },
  source_health: { dexscreener: "READY", goplus_security: "NOT_INVOKED" },
};

const emptyReadiness: ProductReadinessOutput = {
  status: "ready",
  ready: true,
  runtime_mode: "INTERNAL_BETA",
  scanner: { ready: true, reason_code: null },
  context: { ready: true, reason_code: null },
  discovery: {
    new_emerging: { ready: true, status: "ready", reason_code: null },
    established: { ready: false, configured: true, status: "empty_configured", reason_code: "ESTABLISHED_UNIVERSE_EMPTY" },
    context: { ready: true, reason_code: null },
  },
  reason_codes: [],
};

describe("Product Radar owner acceptance", () => {
  it("keeps MockCandidate out of the INTERNAL_BETA product path", async () => {
    for (const file of [
      "src/ProductApp.tsx",
      "src/components/CandidateResultsView.tsx",
      "src/components/CandidateDetailView.tsx",
      "src/components/ExternalVerificationLinksView.tsx",
    ]) {
      assert.doesNotMatch(await readFile(resolve(productRoot, file), "utf8"), /MockCandidate|toMockCandidate/);
    }
  });

  it("preserves all basket metadata in the adapter", () => {
    const output = structuredClone(PERSISTABLE_SCANNER_SAMPLE) as PersistableScannerOutput;
    Object.assign(output.candidates[0], {
      discovery_basket: "established",
      discovery_method: "address_seeded_universe",
      observation_only: false,
      established_eligible: true,
      universe_version: "established_address_universe_v1",
      universe_entry_index: 7,
      address_identity_verified: true,
    });
    const [mapped] = mapPersistableScannerOutputToUiCandidates(output);
    assert.deepEqual(
      [mapped.discoveryBasket, mapped.discoveryMethod, mapped.observationOnly, mapped.establishedEligible, mapped.universeVersion, mapped.universeEntryIndex, mapped.addressIdentityVerified],
      ["established", "address_seeded_universe", false, true, "established_address_universe_v1", 7, true],
    );
    assert.ok(mapped.runId && mapped.filterReasons && mapped.riskFlags && mapped.missingData && mapped.securityLabel && mapped.lastCheckedAt);
  });

  it("separates new-emerging and established baskets", () => {
    assert.equal(resolveInitialBasket([newCandidate]), "new_emerging");
    assert.equal(resolveInitialBasket([newCandidate, establishedCandidate]), "established");
    const newMarkup = renderToStaticMarkup(React.createElement(NewEmergingBasket, { candidates: [newCandidate] }));
    const establishedMarkup = renderToStaticMarkup(React.createElement(EstablishedBasket, { candidates: [establishedCandidate] }));
    assert.match(newMarkup, /OBSERWACJA — NOWY PROJEKT/);
    assert.match(establishedMarkup, /Główny Radar oparty na adresach/);
  });

  it("shows observation_only for every new-emerging record", () => {
    const markup = renderToStaticMarkup(React.createElement(NewEmergingBasket, { candidates: [newCandidate] }));
    assert.match(markup, /observation_only=true/);
    assert.match(markup, /established_eligible=false/);
  });

  it("shows DEGRADED partial data while preserving real new-emerging candidates", () => {
    const metadata = structuredClone(emptyMetadata);
    metadata.new_emerging = {
      discovery_method: "dexscreener_latest_token_profiles",
      seed_count: 10,
      pair_requests_succeeded: 9,
      pair_requests_failed: 1,
      pairs_loaded: 9,
      candidates_before_filters: 9,
      candidates_after_filters: 9,
      discovery_status: "DEGRADED",
      failure_reason_counts: { NETWORK_ERROR: 1 },
    };
    metadata.readiness = { ...metadata.readiness, new_emerging: "DEGRADED" };
    metadata.source_health = { ...metadata.source_health, dexscreener: "DEGRADED" };
    const readiness = structuredClone(emptyReadiness);
    readiness.discovery.new_emerging = {
      ready: true,
      status: "degraded",
      reason_code: "DEXSCREENER_PARTIAL_COVERAGE",
    };
    const markup = renderToStaticMarkup(React.createElement(CandidateResultsView, {
      candidates: [newCandidate],
      metadata,
      readiness,
      ageSeconds: 60,
      sourceIds: ["dexscreener"],
    }));
    assert.match(markup, /DEGRADED/);
    assert.match(markup, /Dane częściowe — część par DexScreener była chwilowo niedostępna/);
    assert.match(markup, new RegExp(newCandidate.symbol));
    assert.match(markup, /observation_only=true/);
    assert.doesNotMatch(markup, /fixture-fallback|Built-in sample|Radar nie może odczytać aktualnego skanu/);
  });

  it("renders the dedicated Established empty-universe state", () => {
    const markup = renderToStaticMarkup(React.createElement(EstablishedBasket, { candidates: [], metadata: emptyMetadata, readiness: emptyReadiness }));
    assert.match(markup, /Koszyk Established jest pusty/);
    assert.match(markup, /ESTABLISHED_UNIVERSE_EMPTY/);
    assert.match(markup, /Aktywne wpisy/);
    assert.match(markup, />0</);
  });

  it("does not turn configured Established empty into a global error", () => {
    const markup = renderToStaticMarkup(React.createElement(EstablishedBasket, { candidates: [], metadata: emptyMetadata, readiness: emptyReadiness }));
    assert.equal(getEstablishedState(emptyMetadata, emptyReadiness, []), "empty");
    assert.doesNotMatch(markup, /role="alert"|Radar jest obecnie niedostępny/);
  });

  it("does not use fixture or demo candidates for Established empty", () => {
    const markup = renderToStaticMarkup(React.createElement(EstablishedBasket, { candidates: [], metadata: emptyMetadata, readiness: emptyReadiness }));
    assert.doesNotMatch(markup, /PASSTOKEN|LOWLIQTOKEN|FDVFALLBACKTOKEN|Built-in sample|DEVELOPMENT_DEMO/);
    assert.match(markup, /nie zastępuje braku wpisów przykładowymi tokenami/);
  });

  it("shows a fresh timestamp as current", () => {
    const markup = renderToStaticMarkup(React.createElement(CandidateResultsView, {
      candidates: [newCandidate], metadata: emptyMetadata, readiness: emptyReadiness, ageSeconds: 90, generatedAt: "2026-07-19T10:00:00.000Z", sourceIds: ["dexscreener"],
    }));
    assert.match(markup, /Aktualne/);
    assert.match(markup, /1 min temu/);
  });

  it("shows the exact stale reason code", () => {
    const staleReadiness = structuredClone(emptyReadiness);
    staleReadiness.scanner = { ready: false, reason_code: "SCANNER_SNAPSHOT_STALE" };
    const markup = renderToStaticMarkup(React.createElement(CandidateResultsView, {
      candidates: [newCandidate], metadata: emptyMetadata, readiness: staleReadiness, ageSeconds: 7200, sourceIds: ["dexscreener"],
    }));
    assert.match(markup, /Nieaktualne/);
    assert.match(markup, /SCANNER_SNAPSHOT_STALE/);
  });

  it("does not present security-not-invoked as security passed", () => {
    const markup = renderToStaticMarkup(React.createElement(CandidateDetailView, { candidate: newCandidate }));
    assert.match(markup, /Security nie zostało uruchomione dla tego koszyka\/statusu/);
    assert.match(markup, /nie jest wynikiem pozytywnym/);
    assert.doesNotMatch(markup, /SECURITY_PASSED/);
  });

  it("describes WATCHLIST as Manual Review Only", () => {
    const markup = renderToStaticMarkup(React.createElement(EstablishedBasket, { candidates: [establishedCandidate] }));
    assert.match(markup, /WATCHLIST — wyłącznie ręczna analiza/);
  });

  it("protects the layout from long contract addresses", async () => {
    const css = await readFile(resolve(productRoot, "src", "index.css"), "utf8");
    assert.match(css, /product-detail-field[\s\S]*?overflow-wrap:\s*anywhere/);
    assert.match(css, /\.mono[\s\S]*?word-break:\s*break-all/);
  });

  it("never creates sample candidates for an empty scanner result", () => {
    const markup = renderToStaticMarkup(React.createElement(CandidateResultsView, { candidates: [] }));
    assert.match(markup, /system nie tworzy sample candidates/i);
    assert.doesNotMatch(markup, /PASSTOKEN|LOWLIQTOKEN|FDVFALLBACKTOKEN/);
  });

  it("limits product navigation to Radar, Details, Verification and Methodology", async () => {
    const source = await readFile(resolve(productRoot, "src", "ProductApp.tsx"), "utf8");
    for (const label of ["Radar", "Szczegóły", "Weryfikacja", "Metodologia"]) assert.match(source, new RegExp(`label: "${label}"`));
    assert.doesNotMatch(source, /label: "(?:Token Lookup|Trusted Preview|Webinar Teaser|Control Center|Feedback Notes)"/);
  });

  it("keeps demo/sample surfaces out of the INTERNAL_BETA build assertion", async () => {
    const source = await readFile(resolve(productRoot, "scripts", "assertInternalBetaBuild.ts"), "utf8");
    for (const marker of ["/fixtures/", "persistableScannerSample", "Built-in sample", "Trusted Preview"]) assert.match(source, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });

  it("uses INTERNAL_BETA in the canonical owner-review launcher", async () => {
    const source = await readFile(resolve(repoRoot, "scripts", "win", "start-product-radar-review.cmd"), "utf8");
    const apiWrapper = await readFile(resolve(repoRoot, "scripts", "win", "start-product-radar-api.cmd"), "utf8");
    assert.match(source, /CRYPTO_EDGE_RUNTIME_MODE=INTERNAL_BETA/);
    assert.match(source, /SCANNER_API_PORT=5177/);
    assert.match(source, /--mode internal-beta/);
    assert.match(source, /kill-local-ports\.cmd/);
    assert.match(source, /--check/);
    assert.match(source, /start-product-radar-api\.cmd/);
    assert.doesNotMatch(source, /start[^\r\n]*set ""CRYPTO_EDGE_RUNTIME_MODE/);
    assert.match(apiWrapper, /set "CRYPTO_EDGE_RUNTIME_MODE=INTERNAL_BETA"/);
    assert.match(apiWrapper, /set "SCANNER_API_PORT=5177"/);
    assert.doesNotMatch(source, /DEVELOPMENT_DEMO|fixtures|persistableScannerSample/);
    assert.doesNotMatch(apiWrapper, /DEVELOPMENT_DEMO|fixtures|persistableScannerSample/);
  });

  it("has a bounded real runtime smoke for the owner launcher", async () => {
    const command = await readFile(resolve(repoRoot, "scripts", "win", "check-product-radar-review.cmd"), "utf8");
    const runtimeCheck = await readFile(resolve(productRoot, "scripts", "checkProductRadarReviewRuntime.ts"), "utf8");
    assert.match(command, /kill-local-ports\.cmd/g);
    assert.match(command, /start-product-radar-api\.cmd/);
    assert.match(runtimeCheck, /STARTUP_TIMEOUT_MS\s*=\s*20_000/);
    for (const endpoint of ["/api/health", "/api/readiness", "/api/scanner/latest"]) assert.match(runtimeCheck, new RegExp(endpoint.replaceAll("/", "\\/")));
    assert.match(runtimeCheck, /runtime_mode/);
    assert.match(runtimeCheck, /INTERNAL_BETA/);
    assert.match(runtimeCheck, /RUNTIME_MODE_UNCONFIGURED/);
    assert.match(runtimeCheck, /scanner\.status !== 200 && scanner\.status !== 503/);
  });

  it("distinguishes a reachable API with stale data from an unavailable API", () => {
    const staleReadiness = structuredClone(emptyReadiness);
    staleReadiness.status = "not_ready";
    staleReadiness.ready = false;
    staleReadiness.scanner = { ready: false, reason_code: "SCANNER_SNAPSHOT_STALE" };
    staleReadiness.context = { ready: false, reason_code: "CONTEXT_ENVIRONMENT_INVALID" };
    staleReadiness.reason_codes = ["SCANNER_SNAPSHOT_STALE", "CONTEXT_ENVIRONMENT_INVALID"];
    assert.deepEqual(
      getApiReadinessPresentation(false, "unavailable", staleReadiness),
      { value: "Połączone", tone: "warning" },
    );
    assert.deepEqual(
      getApiReadinessPresentation(false, "unavailable", null),
      { value: "Niedostępne", tone: "error" },
    );
  });

  it("keeps context unavailability local when scanner data is usable", () => {
    const readiness = structuredClone(emptyReadiness);
    readiness.ready = false;
    readiness.status = "not_ready";
    readiness.context = { ready: false, reason_code: "CONTEXT_OUTPUT_UNAVAILABLE" };
    readiness.reason_codes = ["CONTEXT_OUTPUT_UNAVAILABLE"];
    const markup = renderToStaticMarkup(React.createElement(CandidateResultsView, {
      candidates: [newCandidate], metadata: emptyMetadata, readiness, ageSeconds: 60, sourceIds: ["dexscreener"],
    }));
    assert.match(markup, /OBSERWACJA — NOWY PROJEKT/);
    assert.doesNotMatch(markup, /Radar nie może odczytać aktualnego skanu/);
  });

  it("builds verification links only from the selected real candidate", () => {
    const markup = renderToStaticMarkup(React.createElement(ExternalVerificationLinksView, { candidate: establishedCandidate }));
    assert.match(markup, new RegExp(establishedCandidate.contractAddress));
    assert.match(markup, /target="_blank" rel="noreferrer noopener"/);
    assert.match(markup, /Brak automatycznego Honeypot\.is/);
    assert.doesNotMatch(markup, /\bfetch\s*\(/);
  });
});
