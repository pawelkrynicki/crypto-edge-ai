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
import { Methodology } from "../src/components/Methodology.js";
import {
  ProductWorkspaceShell,
  getApiReadinessPresentation,
} from "../src/components/ProductWorkspaceShell.js";
import {
  getAcceptedProductRefreshTimestamps,
  resolveScannerSnapshotTimestamp,
} from "../src/ProductApp.js";
import { PERSISTABLE_SCANNER_SAMPLE } from "../src/fixtures/persistableScannerSample.js";
import {
  applyProductLocale,
  DEFAULT_PRODUCT_LOCALE,
  formatProductDateTime,
  PRODUCT_LOCALE_STORAGE_KEY,
  PRODUCT_TRANSLATION_KEYS,
  PRODUCT_TRANSLATIONS,
  ProductLocaleProvider,
  readStoredProductLocale,
  type ProductLocale,
} from "../src/productI18n.js";
import { formatFilterReason, SUPPORTED_FILTER_REASONS } from "../src/productPresentation.js";
import type {
  PersistableScannerOutput,
  ProductReadinessOutput,
  ScannerApiOutput,
  ScannerDiscoveryMetadata,
  UiTokenCandidate,
} from "../src/types/scannerTypes.js";

const productRoot = resolve(process.cwd());
const repoRoot = resolve(productRoot, "..", "..");

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renderWithLocale(locale: ProductLocale, element: React.ReactElement): string {
  return renderToStaticMarkup(React.createElement(ProductLocaleProvider, { initialLocale: locale }, element));
}

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
    assert.match(newMarkup, /OBSERVATION — NEW PROJECT/);
    assert.match(establishedMarkup, /Main address-based Radar/);
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
    assert.match(markup, /Source partially available/);
    assert.match(markup, /Some DexScreener pairs were temporarily unavailable/);
    assert.match(markup, new RegExp(newCandidate.symbol));
    assert.match(markup, /observation_only=true/);
    assert.doesNotMatch(markup, /fixture-fallback|Built-in sample|Radar cannot read a valid scan/);
  });

  it("renders the dedicated Established empty-universe state", () => {
    const markup = renderToStaticMarkup(React.createElement(EstablishedBasket, { candidates: [], metadata: emptyMetadata, readiness: emptyReadiness }));
    assert.match(markup, /The Established basket is empty/);
    assert.match(markup, /ESTABLISHED_UNIVERSE_EMPTY/);
    assert.match(markup, /Active entries/);
    assert.match(markup, />0</);
  });

  it("does not turn configured Established empty into a global error", () => {
    const markup = renderToStaticMarkup(React.createElement(EstablishedBasket, { candidates: [], metadata: emptyMetadata, readiness: emptyReadiness }));
    assert.equal(getEstablishedState(emptyMetadata, emptyReadiness, []), "empty");
    assert.doesNotMatch(markup, /role="alert"|Radar is currently unavailable/);
  });

  it("does not use fixture or demo candidates for Established empty", () => {
    const markup = renderToStaticMarkup(React.createElement(EstablishedBasket, { candidates: [], metadata: emptyMetadata, readiness: emptyReadiness }));
    assert.doesNotMatch(markup, /PASSTOKEN|LOWLIQTOKEN|FDVFALLBACKTOKEN|Built-in sample|DEVELOPMENT_DEMO/);
    assert.match(markup, /never replaced with sample tokens/);
  });

  it("shows a fresh timestamp as current", () => {
    const markup = renderToStaticMarkup(React.createElement(CandidateResultsView, {
      candidates: [newCandidate], metadata: emptyMetadata, readiness: emptyReadiness, ageSeconds: 90, generatedAt: "2026-07-19T10:00:00.000Z", sourceIds: ["dexscreener"],
    }));
    assert.match(markup, /Current/);
    assert.match(markup, /1 min/);
  });

  it("keeps stale candidates visible with timestamp-first EN and PL semantics", () => {
    const staleReadiness = structuredClone(emptyReadiness);
    staleReadiness.status = "degraded";
    staleReadiness.scanner = { ready: true, status: "stale", freshness_status: "STALE", reason_code: "SCANNER_SNAPSHOT_STALE" };
    const generatedAt = "2026-07-19T10:19:00.000Z";
    for (const locale of ["en", "pl"] as const) {
      const markup = renderWithLocale(locale, React.createElement(CandidateResultsView, {
        candidates: [newCandidate], metadata: emptyMetadata, readiness: staleReadiness, ageSeconds: 7200,
        generatedAt, freshnessStatus: "STALE", sourceIds: ["dexscreener"],
      }));
      const label = locale === "en" ? "Last updated" : "Ostatnia aktualizacja";
      const delayed = locale === "en" ? "Delayed" : "Opóźnione";
      const timestamp = formatProductDateTime(generatedAt, locale);
      assert.match(markup, /product-stale-warning/);
      assert.match(markup, new RegExp(`<span>${label}</span><strong>${escapeRegExp(timestamp)}</strong><p>Status: ${delayed}</p>`));
      assert.match(markup, locale === "en"
        ? /Data is older than the freshness limit\. The last valid snapshot remains available\./
        : /Dane są starsze niż limit świeżości\. Ostatnia prawidłowa migawka pozostaje dostępna\./);
      assert.doesNotMatch(markup, /scheduled update|zaplanowaną aktualizację/i);
      assert.match(markup, new RegExp(newCandidate.symbol));
      assert.doesNotMatch(markup, /Radar cannot read a valid scan/);
    }
  });

  it("keeps snapshot time stable across rereads and advances only for a newer accepted snapshot", () => {
    const firstOutput = structuredClone(PERSISTABLE_SCANNER_SAMPLE) as ScannerApiOutput;
    const first = getAcceptedProductRefreshTimestamps(firstOutput, "2026-07-20T10:30:00.000Z");
    const sameSnapshot = getAcceptedProductRefreshTimestamps(firstOutput, "2026-07-20T10:31:00.000Z");
    assert.equal(sameSnapshot.generatedAt, first.generatedAt);
    assert.notEqual(sameSnapshot.viewRefreshedAt, first.viewRefreshedAt);

    const newerOutput = structuredClone(firstOutput);
    newerOutput.scan_run.finished_at = "2026-07-20T10:32:00.000Z";
    const newerSnapshot = getAcceptedProductRefreshTimestamps(newerOutput, "2026-07-20T10:33:00.000Z");
    assert.notEqual(newerSnapshot.generatedAt, first.generatedAt);
    assert.equal(newerSnapshot.generatedAt, newerOutput.scan_run.finished_at);

    const generatedAt = "2026-07-20T10:34:00.000Z";
    const provenanceOutput = {
      ...newerOutput,
      provenance: { generated_at: generatedAt },
    } as ScannerApiOutput;
    assert.equal(resolveScannerSnapshotTimestamp(provenanceOutput), generatedAt);

    for (const locale of ["en", "pl"] as const) {
      const renderShell = (timestamps: typeof first) => renderWithLocale(locale, React.createElement(ProductWorkspaceShell, {
        navItems: [],
        activeSection: "candidate-results",
        onSectionChange: () => undefined,
        loading: false,
        runtimeMode: "INTERNAL_BETA",
        resolvedSource: "real-output",
        runId: firstOutput.scan_run.run_id,
        generatedAt: timestamps.generatedAt,
        ageSeconds: 7200,
        freshnessStatus: "STALE",
        viewRefreshedAt: timestamps.viewRefreshedAt,
        sourceIds: ["dexscreener"],
        readiness: emptyReadiness,
        onRefresh: () => undefined,
        children: React.createElement("div"),
      }));
      const firstMarkup = renderShell(first);
      const rereadMarkup = renderShell(sameSnapshot);
      const snapshotTime = formatProductDateTime(first.generatedAt!, locale);
      assert.match(firstMarkup, new RegExp(escapeRegExp(snapshotTime)));
      assert.match(rereadMarkup, new RegExp(escapeRegExp(snapshotTime)));
      assert.match(firstMarkup, new RegExp(escapeRegExp(formatProductDateTime(first.viewRefreshedAt, locale))));
      assert.match(rereadMarkup, new RegExp(escapeRegExp(formatProductDateTime(sameSnapshot.viewRefreshedAt, locale))));
      assert.match(rereadMarkup, locale === "en" ? /Refresh view/ : /Odśwież widok/);
    }
  });

  it("does not present security-not-invoked as security passed", () => {
    const markup = renderToStaticMarkup(React.createElement(CandidateDetailView, { candidate: newCandidate }));
    assert.match(markup, /Security was not run for this basket or status/);
    assert.match(markup, /not a positive result/);
    assert.doesNotMatch(markup, /SECURITY_PASSED/);
  });

  it("describes WATCHLIST as Manual Review Only", () => {
    const markup = renderToStaticMarkup(React.createElement(EstablishedBasket, { candidates: [establishedCandidate] }));
    assert.match(markup, /WATCHLIST — manual review only/);
  });

  it("protects the layout from long contract addresses", async () => {
    const css = await readFile(resolve(productRoot, "src", "index.css"), "utf8");
    assert.match(css, /product-detail-field[\s\S]*?overflow-wrap:\s*anywhere/);
    assert.match(css, /\.mono[\s\S]*?word-break:\s*break-all/);
  });

  it("never creates sample candidates for an empty scanner result", () => {
    const markup = renderToStaticMarkup(React.createElement(CandidateResultsView, { candidates: [] }));
    assert.match(markup, /system does not create sample candidates/i);
    assert.doesNotMatch(markup, /PASSTOKEN|LOWLIQTOKEN|FDVFALLBACKTOKEN/);
  });

  it("limits product navigation to Radar, Details, Verification and Methodology", async () => {
    const source = await readFile(resolve(productRoot, "src", "ProductApp.tsx"), "utf8");
    for (const key of ["nav.radar", "nav.details", "nav.verification", "nav.methodology"]) assert.match(source, new RegExp(key.replace(".", "\\.")));
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
    staleReadiness.status = "degraded";
    staleReadiness.ready = true;
    staleReadiness.scanner = { ready: true, status: "stale", freshness_status: "STALE", reason_code: "SCANNER_SNAPSHOT_STALE" };
    staleReadiness.context = { ready: false, reason_code: "CONTEXT_ENVIRONMENT_INVALID" };
    staleReadiness.reason_codes = ["SCANNER_SNAPSHOT_STALE", "CONTEXT_ENVIRONMENT_INVALID"];
    assert.deepEqual(
      getApiReadinessPresentation(false, "unavailable", staleReadiness),
      { value: "Connected", tone: "warning" },
    );
    assert.deepEqual(
      getApiReadinessPresentation(false, "unavailable", null),
      { value: "Unavailable", tone: "error" },
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
    assert.match(markup, /OBSERVATION — NEW PROJECT/);
    assert.doesNotMatch(markup, /Radar cannot read a valid scan/);
  });

  it("builds verification links only from the selected real candidate", () => {
    const markup = renderToStaticMarkup(React.createElement(ExternalVerificationLinksView, { candidate: establishedCandidate }));
    assert.match(markup, new RegExp(establishedCandidate.contractAddress));
    assert.match(markup, /target="_blank" rel="noreferrer noopener"/);
    assert.match(markup, /No automated Honeypot\.is/);
    assert.doesNotMatch(markup, /\bfetch\s*\(/);
  });

  it("defaults to English and persists the one-click locale selection", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    };
    const documentElement = { lang: "" };
    assert.equal(DEFAULT_PRODUCT_LOCALE, "en");
    assert.equal(readStoredProductLocale(storage), "en");
    applyProductLocale("pl", storage, documentElement);
    assert.equal(values.get(PRODUCT_LOCALE_STORAGE_KEY), "pl");
    assert.equal(readStoredProductLocale(storage), "pl");
    assert.equal(documentElement.lang, "pl");
  });

  it("renders important Radar views completely in English and Polish", () => {
    const english = [
      renderWithLocale("en", React.createElement(CandidateResultsView, { candidates: [newCandidate], ageSeconds: 60 })),
      renderWithLocale("en", React.createElement(CandidateDetailView, { candidate: newCandidate })),
      renderWithLocale("en", React.createElement(ExternalVerificationLinksView, { candidate: establishedCandidate })),
      renderWithLocale("en", React.createElement(Methodology)),
    ].join(" ");
    const polish = [
      renderWithLocale("pl", React.createElement(CandidateResultsView, { candidates: [newCandidate], ageSeconds: 60 })),
      renderWithLocale("pl", React.createElement(CandidateDetailView, { candidate: newCandidate })),
      renderWithLocale("pl", React.createElement(ExternalVerificationLinksView, { candidate: establishedCandidate })),
      renderWithLocale("pl", React.createElement(Methodology)),
    ].join(" ");
    assert.match(english, /Two baskets with two different meanings/);
    assert.match(english, /Manual source verification/);
    assert.match(english, /How to read the Radar/);
    assert.match(polish, /Dwa koszyki, dwa różne znaczenia/);
    assert.match(polish, /Ręczna weryfikacja źródłowa/);
    assert.match(polish, /Jak czytać Radar/);
    assert.equal(PRODUCT_TRANSLATION_KEYS.length, Object.keys(PRODUCT_TRANSLATIONS.pl).length);
  });

  it("formats every supported filter reason in both languages and fails safely", () => {
    for (const reason of SUPPORTED_FILTER_REASONS) {
      const en = formatFilterReason(reason, "en");
      const pl = formatFilterReason(reason, "pl");
      assert.equal(en.known, true, reason);
      assert.equal(pl.known, true, reason);
      assert.notEqual(en.summary, reason);
      assert.notEqual(pl.summary, reason);
    }
    assert.equal(formatFilterReason("future_filter_reason", "en").summary, "A filter condition needs review");
    assert.equal(formatFilterReason("future_filter_reason", "pl").summary, "Warunek filtra wymaga sprawdzenia");
    assert.equal(formatFilterReason("future_filter_reason", "en").rawReason, "future_filter_reason");
  });

  it("keeps locale switching fetch-free and refresh first-party only", async () => {
    const localeSource = await readFile(resolve(productRoot, "src", "productI18n.tsx"), "utf8");
    const appSource = await readFile(resolve(productRoot, "src", "ProductApp.tsx"), "utf8");
    const scannerSource = await readFile(resolve(productRoot, "src", "services", "scannerDataSource.ts"), "utf8");
    const apiSource = await readFile(resolve(productRoot, "server", "scannerApiServer.ts"), "utf8");
    assert.doesNotMatch(localeSource, /\bfetch\s*\(/);
    assert.equal(PRODUCT_TRANSLATIONS.en["app.refresh"], "Refresh view");
    assert.equal(PRODUCT_TRANSLATIONS.pl["app.refresh"], "Odśwież widok");
    assert.match(appSource, /refreshPromiseRef\.current/);
    assert.match(appSource, /getAcceptedProductRefreshTimestamps\(output, new Date\(\)\.toISOString\(\)\)/);
    assert.doesNotMatch(appSource, /finally\(\(\) => \{[\s\S]*?setViewRefreshedAt/);
    assert.doesNotMatch(appSource, /dexscreenerClient|goplusClient|internalBetaCollector/);
    assert.match(scannerSource, /\/api\/scanner\/latest/);
    assert.match(scannerSource, /\/api\/readiness/);
    assert.doesNotMatch(scannerSource, /https?:\/\//);
    assert.doesNotMatch(apiSource, /internalBetaCollector|dexscreenerClient|goplusClient|collect:/);
    assert.doesNotMatch(apiSource, /\/api\/scanner\/(?:scan|collect|refresh)/);
  });
});
