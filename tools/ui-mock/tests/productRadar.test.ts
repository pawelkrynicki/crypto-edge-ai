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
  getFreshnessPresentation,
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
  formatProductPairAge,
  PRODUCT_LOCALE_STORAGE_KEY,
  PRODUCT_TRANSLATION_KEYS,
  PRODUCT_TRANSLATIONS,
  ProductLocaleProvider,
  readStoredProductLocale,
  type ProductLocale,
} from "../src/productI18n.js";
import {
  BASIC_FILTER_CATEGORIES,
  resolveProductFilterConditions,
} from "../src/productFilterResolver.js";
import { formatFilterReason, SUPPORTED_FILTER_REASONS } from "../src/productPresentation.js";
import { resolveProductSecurityState } from "../src/productSecurityResolver.js";
import { resolveProductSourceHealth } from "../src/productSourceHealth.js";
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

const beansCandidate: UiTokenCandidate = {
  ...newCandidate,
  id: "beans-owner-review",
  symbol: "BEANS",
  name: "Beans",
  marketCap: 7_167,
  volume24h: 20_109,
  liquidity: 6_214,
  volumeMarketCapRatio: 2.8057,
  pairAgeDays: 0,
  filterReasons: [
    "market_cap_below_300000",
    "volume_24h_below_30000",
    "liquidity_below_30000",
    "volume_market_cap_ratio_above_100_percent",
    "pair_age_not_above_7_days",
    "volume_market_cap_ratio_outside_sweet_spot_5_30_percent",
    "pair_age_outside_preferred_14_90_days",
  ],
  securityLabel: "SECURITY DATA UNAVAILABLE",
  security: {
    sources: [],
    coverageStatus: "SECURITY DATA UNAVAILABLE",
    honeypotStatus: "unknown",
    buyTax: null,
    sellTax: null,
    contractVerified: null,
    ownershipStatus: "unknown",
    liquidityLocked: null,
    liquidityLockDays: null,
    mintRisk: null,
    blacklistRisk: null,
    whitelistRisk: null,
    sellRestrictionRisk: null,
    proxyRisk: null,
    topWalletPct: null,
    top10WalletsPct: null,
    checkedAt: null,
  },
  riskFlags: [],
  missingData: ["security_data_unavailable"],
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
  it("formats pair age below 24 hours in hours and switches to days at 24 hours", () => {
    const now = new Date("2026-07-23T12:00:00.000Z");
    const pairAge = (createdAt: string, locale: ProductLocale) => formatProductPairAge(
      0,
      locale,
      "missing",
      { pairCreatedAt: createdAt, now },
    );

    assert.equal(pairAge("2026-07-23T11:30:00.000Z", "pl"), "mniej niż 1 godz.");
    assert.equal(pairAge("2026-07-23T11:30:00.000Z", "en"), "less than 1 hour");
    assert.equal(pairAge("2026-07-23T11:00:00.000Z", "pl"), "1 godz.");
    assert.equal(pairAge("2026-07-23T11:00:00.000Z", "en"), "1 hour");
    assert.equal(pairAge("2026-07-23T07:00:00.000Z", "pl"), "5 godz.");
    assert.equal(pairAge("2026-07-23T07:00:00.000Z", "en"), "5 hours");
    assert.equal(pairAge("2026-07-22T13:00:00.000Z", "pl"), "23 godz.");
    assert.equal(pairAge("2026-07-22T13:00:00.000Z", "en"), "23 hours");
    assert.equal(pairAge("2026-07-22T12:00:00.000Z", "pl"), "1 dzień");
    assert.equal(pairAge("2026-07-22T12:00:00.000Z", "en"), "1 day");
    assert.equal(pairAge("2026-07-21T12:00:00.000Z", "pl"), "2 dni");
    assert.equal(pairAge("2026-07-21T12:00:00.000Z", "en"), "2 days");
    assert.notEqual(pairAge("2026-07-23T11:30:00.000Z", "pl"), "0 dni");
  });

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

  it("preserves nullable checked_at and coverage_status in the UI security contract", () => {
    const output = structuredClone(PERSISTABLE_SCANNER_SAMPLE) as PersistableScannerOutput;
    const security = output.security_checks[0];
    assert.ok(security);
    security.coverage_status = "SECURITY DATA UNAVAILABLE";
    security.checked_at = null;
    security.security_label = "SECURITY DATA UNAVAILABLE";
    const mapped = mapPersistableScannerOutputToUiCandidates(output)
      .find((candidate) => candidate.id === security.candidate_id);
    assert.ok(mapped?.security);
    assert.equal(mapped.security.coverageStatus, "SECURITY DATA UNAVAILABLE");
    assert.equal(mapped.security.checkedAt, null);
  });

  it("classifies BEANS filters only from canonical reason codes", () => {
    const resolution = resolveProductFilterConditions({
      basicFilterStatus: beansCandidate.basicFilterStatus,
      filterReasons: beansCandidate.filterReasons,
    });
    assert.deepEqual(
      resolution.conditions.map(({ category, state }) => [category, state]),
      BASIC_FILTER_CATEGORIES.map((category) => [category, "failed"]),
    );
    assert.equal(resolution.conditions.some((condition) => condition.state === "passed"), false);
    assert.deepEqual(resolution.preferredRangeNotes, [
      "volume_market_cap_ratio_outside_sweet_spot_5_30_percent",
      "pair_age_outside_preferred_14_90_days",
    ]);

    const englishCopy = beansCandidate.filterReasons.map((reason) => formatFilterReason(reason, "en").summary);
    const polishCopy = beansCandidate.filterReasons.map((reason) => formatFilterReason(reason, "pl").summary);
    assert.notDeepEqual(englishCopy, polishCopy);
    assert.deepEqual(
      resolveProductFilterConditions({ basicFilterStatus: "rejected_basic_filter", filterReasons: beansCandidate.filterReasons }),
      resolution,
      "translation is not an input to classification",
    );
  });

  it("keeps preferred ranges separate from the five hard filter conditions", () => {
    const ratio = resolveProductFilterConditions({
      basicFilterStatus: "passed_basic_filter",
      filterReasons: ["volume_market_cap_ratio_outside_sweet_spot_5_30_percent"],
    });
    const age = resolveProductFilterConditions({
      basicFilterStatus: "passed_basic_filter",
      filterReasons: ["pair_age_outside_preferred_14_90_days"],
    });
    assert.equal(ratio.conditions.find((condition) => condition.category === "volume_market_cap_ratio")?.state, "passed");
    assert.deepEqual(ratio.preferredRangeNotes, ["volume_market_cap_ratio_outside_sweet_spot_5_30_percent"]);
    assert.equal(age.conditions.find((condition) => condition.category === "pair_age")?.state, "passed");
    assert.deepEqual(age.preferredRangeNotes, ["pair_age_outside_preferred_14_90_days"]);
  });

  it("keeps FDV fallback and unknown filter codes neutral while supporting legacy codes", () => {
    const fallback = resolveProductFilterConditions({
      basicFilterStatus: "passed_basic_filter",
      filterReasons: ["market_cap_missing_using_fdv"],
    });
    assert.equal(fallback.conditions.find((condition) => condition.category === "market_cap")?.state, "passed");
    assert.deepEqual(fallback.informationalReasons, ["market_cap_missing_using_fdv"]);

    const legacy = resolveProductFilterConditions({
      basicFilterStatus: "rejected_basic_filter",
      filterReasons: [
        "market_cap_below_min",
        "volume_24h_below_min",
        "liquidity_below_min",
        "volume_market_cap_ratio_above_max",
        "pair_age_below_min",
      ],
    });
    assert.equal(legacy.conditions.every((condition) => condition.state === "failed"), true);

    const unknownOnly = resolveProductFilterConditions({
      basicFilterStatus: "rejected_basic_filter",
      filterReasons: ["future_filter_reason"],
    });
    assert.equal(unknownOnly.conditions.every((condition) => condition.state === "unknown"), true);
    assert.deepEqual(unknownOnly.unknownReasons, ["future_filter_reason"]);

    const knownAndUnknown = resolveProductFilterConditions({
      basicFilterStatus: "rejected_basic_filter",
      filterReasons: ["liquidity_below_30000", "future_filter_reason"],
    });
    assert.equal(knownAndUnknown.conditions.find((condition) => condition.category === "liquidity")?.state, "failed");
    assert.equal(knownAndUnknown.conditions.filter((condition) => condition.category !== "liquidity").every((condition) => condition.state === "passed"), true);
    assert.deepEqual(knownAndUnknown.unknownReasons, ["future_filter_reason"]);
  });

  it("resolves every canonical product security state without guessing from object presence", () => {
    const checked = structuredClone(establishedCandidate);
    assert.ok(checked.security);
    checked.security.coverageStatus = null;
    checked.security.checkedAt = "2026-07-21T08:00:00.000Z";
    checked.securityLabel = "SECURITY_PASSED";
    checked.finalLabel = "WATCHLIST";

    const rejectedPlaceholder = structuredClone(beansCandidate);
    assert.equal(resolveProductSecurityState(rejectedPlaceholder).state, "not_invoked");
    assert.equal(resolveProductSecurityState({ ...rejectedPlaceholder, observationOnly: false }).state, "not_invoked");
    assert.equal(resolveProductSecurityState({ ...checked, securityLabel: "NOT_CHECKED" }).state, "not_invoked");

    const missingTimestamp = structuredClone(checked);
    assert.ok(missingTimestamp.security);
    missingTimestamp.security.checkedAt = null;
    assert.equal(resolveProductSecurityState(missingTimestamp).state, "unavailable");

    const unavailable = structuredClone(checked);
    assert.ok(unavailable.security);
    unavailable.security.coverageStatus = "SECURITY DATA UNAVAILABLE";
    unavailable.securityLabel = "SECURITY DATA UNAVAILABLE";
    unavailable.security.checkedAt = null;
    assert.equal(resolveProductSecurityState(unavailable).state, "unavailable");

    const partial = structuredClone(checked);
    assert.ok(partial.security);
    partial.security.coverageStatus = "PARTIAL SECURITY COVERAGE";
    partial.securityLabel = "PARTIAL SECURITY COVERAGE";
    assert.equal(resolveProductSecurityState(partial).state, "partial");

    const manual = structuredClone(checked);
    manual.securityLabel = "NEEDS_MANUAL_VERIFICATION";
    manual.finalLabel = "NEEDS_MANUAL_VERIFICATION";
    assert.equal(resolveProductSecurityState(manual).state, "checked_needs_manual_review");

    const critical = structuredClone(checked);
    critical.securityLabel = "CRITICAL_RISK";
    critical.finalLabel = "CRITICAL_RISK";
    assert.equal(resolveProductSecurityState(critical).state, "checked_critical");
    assert.equal(resolveProductSecurityState(checked).state, "checked");
  });

  it("shows one shared not-invoked security meaning for BEANS in Details and Verification", () => {
    for (const locale of ["en", "pl"] as const) {
      const details = renderWithLocale(locale, React.createElement(CandidateDetailView, { candidate: beansCandidate }));
      const verification = renderWithLocale(locale, React.createElement(ExternalVerificationLinksView, { candidate: beansCandidate }));
      const detailsWithoutTechnical = details.replace(/<details>[\s\S]*?<\/details>/g, "");

      if (locale === "pl") {
        assert.match(details, /Kontrola bezpieczeństwa nie została uruchomiona/);
        assert.match(details, /Projekt nie przeszedł podstawowych filtrów i pozostaje wyłącznie obserwacyjny\. Brak kontroli nie oznacza braku ryzyka\./);
        assert.match(details, /Flagi ryzyka nie zostały ocenione\./);
        assert.match(verification, /<span>Bezpieczeństwo<\/span><strong>Kontrola nieuruchomiona<\/strong>/);
      } else {
        assert.match(details, /Security check was not run/);
        assert.match(details, /The project did not pass the basic filters and remains observation-only\. No check does not mean no risk\./);
        assert.match(details, /Risk flags were not assessed\./);
        assert.match(verification, /<span>Security<\/span><strong>Check not run<\/strong>/);
      }

      assert.doesNotMatch(details, /GoPlus|Buy tax|Sell tax|Podatek kupna|Podatek sprzedaży|Brak zgłoszonych flag|No reported flags/);
      assert.doesNotMatch(verification, /Dane obecne|Security data present|Data present — verify it/);
      assert.doesNotMatch(detailsWithoutTechnical, /unknown|Security data unavailable|Not checked|Partial security coverage/i);
      assert.match(details, /<details><summary>(?:Technical details|Szczegóły techniczne)<\/summary><code>security_state=not_invoked; security_label=SECURITY DATA UNAVAILABLE;/);
      assert.match(verification, locale === "pl" ? /Bezpieczeństwo — kontrola ręczna/ : /Security — manual check/);

      const basicConditionLabels = [
        PRODUCT_TRANSLATIONS[locale]["filter.marketCapRange"],
        PRODUCT_TRANSLATIONS[locale]["filter.volumeMinimum"],
        PRODUCT_TRANSLATIONS[locale]["filter.liquidityMinimum"],
        PRODUCT_TRANSLATIONS[locale]["filter.ratioRange"],
        PRODUCT_TRANSLATIONS[locale]["filter.pairAgeMinimum"],
      ];
      for (const label of basicConditionLabels) {
        assert.equal((details.match(new RegExp(escapeRegExp(label), "g")) ?? []).length, 1, `${label} must appear in exactly one condition state`);
      }
    }
  });

  it("translates unavailable and partial security without exposing raw labels as product copy", () => {
    const base = structuredClone(establishedCandidate);
    assert.ok(base.security);
    base.security.checkedAt = "2026-07-21T08:00:00.000Z";

    const unavailable = structuredClone(base);
    assert.ok(unavailable.security);
    unavailable.security.coverageStatus = "SECURITY DATA UNAVAILABLE";
    unavailable.security.checkedAt = null;
    unavailable.securityLabel = "SECURITY DATA UNAVAILABLE";

    const partial = structuredClone(base);
    assert.ok(partial.security);
    partial.security.coverageStatus = "PARTIAL SECURITY COVERAGE";
    partial.securityLabel = "PARTIAL SECURITY COVERAGE";

    const unavailableDetails = renderWithLocale("pl", React.createElement(CandidateDetailView, { candidate: unavailable }));
    const unavailableVerification = renderWithLocale("pl", React.createElement(ExternalVerificationLinksView, { candidate: unavailable }));
    const partialDetails = renderWithLocale("pl", React.createElement(CandidateDetailView, { candidate: partial }));
    const partialVerification = renderWithLocale("pl", React.createElement(ExternalVerificationLinksView, { candidate: partial }));

    assert.match(unavailableDetails, /Dane bezpieczeństwa są niedostępne\. Wymagana jest ręczna weryfikacja\./);
    assert.match(unavailableVerification, /Dane niedostępne — wymagana ręczna weryfikacja/);
    assert.doesNotMatch(unavailableDetails, /<span>Sprawdzono<\/span>/);
    assert.match(partialDetails, /Dostępna jest tylko część danych bezpieczeństwa\. Wymagana jest ręczna weryfikacja\./);
    assert.match(partialVerification, /Dane częściowe — wymagana ręczna weryfikacja/);

    for (const markup of [unavailableDetails, unavailableVerification, partialDetails, partialVerification]) {
      const withoutTechnical = markup.replace(/<details>[\s\S]*?<\/details>/g, "");
      assert.doesNotMatch(withoutTechnical, /unknown|Security data unavailable|Not checked|Partial security coverage/i);
    }
  });

  it("keeps checked SECURITY_PASSED explicitly Manual Review Only", () => {
    const checked = structuredClone(establishedCandidate);
    assert.ok(checked.security);
    checked.security.coverageStatus = null;
    checked.security.checkedAt = "2026-07-21T08:00:00.000Z";
    checked.securityLabel = "SECURITY_PASSED";
    const details = renderWithLocale("en", React.createElement(CandidateDetailView, { candidate: checked }));
    const verification = renderWithLocale("en", React.createElement(ExternalVerificationLinksView, { candidate: checked }));
    assert.equal(resolveProductSecurityState(checked).state, "checked");
    assert.match(details, /Security checked — Manual Review Only/);
    assert.match(verification, /Checked — Manual Review Only/);
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

  it("uses one canonical source-health resolution in the header and Radar summary", () => {
    const readyMetadata = structuredClone(emptyMetadata);
    readyMetadata.source_health = {
      dexscreener: "READY",
      goplus_security: "NOT_INVOKED",
      alternative_me_fng: "READY",
      defillama_api: "READY",
    };
    const defillamaDegraded = structuredClone(readyMetadata);
    defillamaDegraded.source_health = { ...defillamaDegraded.source_health, defillama_api: "DEGRADED" };
    const optionalUnavailable = structuredClone(readyMetadata);
    optionalUnavailable.source_health = { ...optionalUnavailable.source_health, alternative_me_fng: "UNAVAILABLE" };
    const allUnavailable = structuredClone(readyMetadata);
    allUnavailable.source_health = {
      dexscreener: "UNAVAILABLE",
      goplus_security: "NOT_INVOKED",
      alternative_me_fng: "UNAVAILABLE",
      defillama_api: "UNAVAILABLE",
    };
    const sourceIds = ["dexscreener"];

    assert.deepEqual(resolveProductSourceHealth({ metadata: readyMetadata, readiness: emptyReadiness, sourceIds }), {
      status: "available",
      detailSourceIds: ["dexscreener", "alternative_me_fng", "defillama_api"],
      basis: "metadata",
    });
    assert.deepEqual(resolveProductSourceHealth({ metadata: defillamaDegraded, readiness: emptyReadiness, sourceIds }), {
      status: "partial",
      detailSourceIds: ["defillama_api"],
      basis: "metadata",
    });
    assert.equal(
      resolveProductSourceHealth({ metadata: optionalUnavailable, readiness: emptyReadiness, sourceIds }).status,
      "partial",
    );
    assert.equal(
      resolveProductSourceHealth({ metadata: allUnavailable, readiness: emptyReadiness, sourceIds }).status,
      "unavailable",
    );

    const staleReadiness = structuredClone(emptyReadiness);
    staleReadiness.status = "degraded";
    staleReadiness.scanner = {
      ready: true,
      status: "stale",
      freshness_status: "STALE",
      reason_code: "SCANNER_SNAPSHOT_STALE",
    };
    staleReadiness.reason_codes = ["SCANNER_SNAPSHOT_STALE"];
    assert.equal(
      resolveProductSourceHealth({ metadata: readyMetadata, readiness: staleReadiness, sourceIds }).status,
      "available",
    );
    assert.equal(getFreshnessPresentation(7200, "STALE").value, "Delayed");
    assert.equal(
      resolveProductSourceHealth({ metadata: defillamaDegraded, readiness: emptyReadiness, sourceIds }).status,
      "partial",
    );
    assert.equal(getFreshnessPresentation(60, "FRESH").value, "Current");

    const fallbackPartialReadiness = structuredClone(emptyReadiness);
    fallbackPartialReadiness.status = "degraded";
    fallbackPartialReadiness.context = { ready: false, reason_code: "CONTEXT_OUTPUT_UNAVAILABLE" };
    fallbackPartialReadiness.discovery.context = { ready: false, reason_code: "CONTEXT_OUTPUT_UNAVAILABLE" };
    fallbackPartialReadiness.reason_codes = ["CONTEXT_OUTPUT_UNAVAILABLE"];
    assert.deepEqual(resolveProductSourceHealth({ metadata: null, readiness: fallbackPartialReadiness, sourceIds }), {
      status: "partial",
      detailSourceIds: [],
      basis: "readiness",
    });
    assert.equal(
      resolveProductSourceHealth({ metadata: null, readiness: emptyReadiness, sourceIds }).status,
      "available",
    );
    assert.equal(
      resolveProductSourceHealth({ metadata: null, readiness: null, sourceIds: [] }).status,
      "unavailable",
    );

    const renderSurfaces = (
      locale: ProductLocale,
      sourceHealth: ReturnType<typeof resolveProductSourceHealth>,
      metadata: ScannerDiscoveryMetadata,
      readiness: ProductReadinessOutput,
      ageSeconds: number,
      freshnessStatus: "FRESH" | "STALE",
    ) => ({
      header: renderWithLocale(locale, React.createElement(ProductWorkspaceShell, {
        navItems: [],
        activeSection: "candidate-results",
        onSectionChange: () => undefined,
        loading: false,
        runtimeMode: "INTERNAL_BETA",
        resolvedSource: "real-output",
        runId: "source-health-run",
        generatedAt: "2026-07-20T10:00:00.000Z",
        ageSeconds,
        freshnessStatus,
        viewRefreshedAt: "2026-07-20T12:00:00.000Z",
        sourceIds,
        sourceHealth,
        readiness,
        onRefresh: () => undefined,
        children: React.createElement("div"),
      })),
      summary: renderWithLocale(locale, React.createElement(CandidateResultsView, {
        candidates: [newCandidate],
        metadata,
        readiness,
        ageSeconds,
        freshnessStatus,
        sourceIds,
        sourceHealth,
      })),
    });

    const readyResolution = resolveProductSourceHealth({ metadata: readyMetadata, readiness: emptyReadiness, sourceIds });
    const partialResolution = resolveProductSourceHealth({ metadata: defillamaDegraded, readiness: staleReadiness, sourceIds });
    const fallbackResolution = resolveProductSourceHealth({ metadata: null, readiness: fallbackPartialReadiness, sourceIds });
    const noDetailedMetadata = structuredClone(emptyMetadata);
    delete noDetailedMetadata.source_health;
    for (const locale of ["en", "pl"] as const) {
      const ready = renderSurfaces(locale, readyResolution, readyMetadata, emptyReadiness, 60, "FRESH");
      const partialHeader = renderSurfaces(locale, partialResolution, defillamaDegraded, staleReadiness, 7200, "STALE");
      const partialSummary = renderSurfaces(locale, partialResolution, defillamaDegraded, emptyReadiness, 60, "FRESH");
      const fallback = renderSurfaces(locale, fallbackResolution, noDetailedMetadata, fallbackPartialReadiness, 60, "FRESH");
      if (locale === "en") {
        assert.match(ready.header, /<span>Sources<\/span><strong>Available<\/strong>/);
        assert.match(ready.summary, /<span>Source status<\/span><strong>Available<\/strong>/);
        assert.match(partialHeader.header, /<span>Sources<\/span><strong>Partially available<\/strong>/);
        assert.match(partialSummary.summary, /<span>Source status<\/span><strong>Source partially available<\/strong><p>defillama_api<\/p>/);
        assert.match(partialHeader.header, /Snapshot freshness<\/span><strong>Delayed<\/strong>/);
        assert.match(partialSummary.summary, /<span>Data<\/span><strong>Current<\/strong>/);
        assert.match(fallback.header, /<span>Sources<\/span><strong>Partially available<\/strong>/);
        assert.match(fallback.summary, /<span>Source status<\/span><strong>Source partially available<\/strong><p>Source details unavailable<\/p>/);
      } else {
        assert.match(ready.header, /<span>Źródła<\/span><strong>Dostępne<\/strong>/);
        assert.match(ready.summary, /<span>Stan źródeł<\/span><strong>Dostępne<\/strong>/);
        assert.match(partialHeader.header, /<span>Źródła<\/span><strong>Częściowo dostępne<\/strong>/);
        assert.match(partialSummary.summary, /<span>Stan źródeł<\/span><strong>Źródło częściowo dostępne<\/strong><p>defillama_api<\/p>/);
        assert.match(partialHeader.header, /Aktualność danych<\/span><strong>Opóźnione<\/strong>/);
        assert.match(partialSummary.summary, /<span>Dane<\/span><strong>Aktualne<\/strong>/);
        assert.match(fallback.header, /<span>Źródła<\/span><strong>Częściowo dostępne<\/strong>/);
        assert.match(fallback.summary, /<span>Stan źródeł<\/span><strong>Źródło częściowo dostępne<\/strong><p>Brak szczegółów źródeł<\/p>/);
      }
    }
  });

  it("renders the dedicated Established empty-universe state", () => {
    const markup = renderToStaticMarkup(React.createElement(EstablishedBasket, { candidates: [], metadata: emptyMetadata, readiness: emptyReadiness }));
    assert.match(markup, /The Established basket is empty/);
    assert.match(markup, /ESTABLISHED_UNIVERSE_EMPTY/);
    assert.match(markup, /Active entries/);
    assert.match(markup, />0</);
  });

  it("separates inactive cadence from a scheduled run in EN and PL Technical details", () => {
    const lastRunAt = "2026-07-21T12:00:00.000Z";
    const nextDueAt = "2026-07-21T12:16:00.000Z";
    const render = (locale: ProductLocale, enabled: boolean) => renderWithLocale(locale, React.createElement(ProductWorkspaceShell, {
      navItems: [],
      activeSection: "candidate-results",
      onSectionChange: () => undefined,
      loading: false,
      runtimeMode: "INTERNAL_BETA",
      resolvedSource: "unavailable",
      runId: null,
      generatedAt: null,
      ageSeconds: null,
      freshnessStatus: null,
      viewRefreshedAt: null,
      sourceIds: [],
      sourceHealth: resolveProductSourceHealth({ metadata: null, readiness: null, sourceIds: [] }),
      readiness: null,
      automationStatus: {
        enabled,
        active_run_id: null,
        last_result: "SUCCESS",
        last_error_code: null,
        last_attempt_at: lastRunAt,
        last_success_at: "2026-07-21T12:01:00.000Z",
        last_failure_at: null,
        next_run_at: enabled ? nextDueAt : null,
        next_due_at: nextDueAt,
        next_scanner_run_at: nextDueAt,
        next_context_run_at: "2026-07-21T14:01:00.000Z",
        last_published_scanner_run_id: "scan_safe",
        last_published_context_run_id: "context_safe",
        request_counts: {},
        scheduler_status: "NOTHING_DUE",
      },
      onRefresh: () => undefined,
      children: React.createElement("div"),
    }));
    const disabledEnglish = render("en", false);
    const disabledPolish = render("pl", false);
    const enabledEnglish = render("en", true);
    const enabledPolish = render("pl", true);

    assert.match(disabledEnglish, /Automation<\/dt><dd>Disabled/);
    assert.match(disabledEnglish, /Next run<\/dt><dd>Not scheduled/);
    assert.match(disabledEnglish, new RegExp(`Last run<\\/dt><dd>${escapeRegExp(formatProductDateTime(lastRunAt, "en"))}`));
    assert.match(disabledEnglish, new RegExp(`Next due after activation<\\/dt><dd>${escapeRegExp(formatProductDateTime(nextDueAt, "en"))}`));
    assert.match(disabledPolish, /Automatyzacja<\/dt><dd>Nieaktywna/);
    assert.match(disabledPolish, /Następny run<\/dt><dd>Nie zaplanowano/);
    assert.match(disabledPolish, new RegExp(`Ostatni run<\\/dt><dd>${escapeRegExp(formatProductDateTime(lastRunAt, "pl"))}`));
    assert.match(disabledPolish, new RegExp(`Najbliższy termin po aktywacji<\\/dt><dd>${escapeRegExp(formatProductDateTime(nextDueAt, "pl"))}`));

    assert.match(enabledEnglish, /Automation<\/dt><dd>Active/);
    assert.match(enabledEnglish, new RegExp(`Next run<\\/dt><dd>${escapeRegExp(formatProductDateTime(nextDueAt, "en"))}`));
    assert.doesNotMatch(enabledEnglish, /Next due after activation/);
    assert.match(enabledPolish, /Automatyzacja<\/dt><dd>Aktywna/);
    assert.match(enabledPolish, new RegExp(`Następny run<\\/dt><dd>${escapeRegExp(formatProductDateTime(nextDueAt, "pl"))}`));
    assert.doesNotMatch(enabledPolish, /Najbliższy termin po aktywacji/);
    assert.doesNotMatch(disabledEnglish, /Run collector|Start collector/);
  });

  it("does not turn configured Established empty into a global error", () => {
    const markup = renderToStaticMarkup(React.createElement(EstablishedBasket, { candidates: [], metadata: emptyMetadata, readiness: emptyReadiness }));
    assert.equal(getEstablishedState(emptyMetadata, emptyReadiness, []), "empty");
    assert.doesNotMatch(markup, /role="alert"|Radar is currently unavailable/);
  });

  it("keeps an invalid Established universe unavailable even when readiness is missing", () => {
    const invalidMetadata: ScannerDiscoveryMetadata = {
      ...emptyMetadata,
      established: {
        ...emptyMetadata.established,
        universe_status: "ESTABLISHED_UNIVERSE_INVALID",
        validation_status: "invalid",
      },
    };
    assert.equal(getEstablishedState(invalidMetadata, null, []), "unavailable");
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
        sourceHealth: resolveProductSourceHealth({ metadata: emptyMetadata, readiness: emptyReadiness, sourceIds: ["dexscreener"] }),
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
    assert.match(markup, /Security check was not run/);
    assert.match(markup, /No check does not mean no risk/);
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

  it("preserves Radar, Details, Verification and Methodology while adding Reports and Control Center", async () => {
    const source = await readFile(resolve(productRoot, "src", "ProductApp.tsx"), "utf8");
    for (const key of ["nav.radar", "nav.details", "nav.verification", "nav.reports", "nav.methodology", "nav.controlCenter"]) {
      assert.match(source, new RegExp(key.replace(".", "\\.")));
    }
    assert.match(source, /"#reports":\s*"reports"/);
    assert.match(source, /groupLabel:\s*t\("nav\.groupReview"\)/);
    assert.doesNotMatch(source, /label: "(?:Token Lookup|Trusted Preview|Webinar Teaser|Feedback Notes)"/);
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
    assert.match(source, /--reports/);
    assert.match(source, /RADAR_VIEW=reports/);
    assert.match(source, /start-product-radar-api\.cmd/);
    assert.doesNotMatch(source, /generate-analyst-report|report:analyst/);
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
    assert.match(english, /Three Radar layers with three different meanings/);
    assert.match(english, /Manual source verification/);
    assert.match(english, /How to read the Radar/);
    assert.match(polish, /Trzy warstwy Radaru, trzy różne znaczenia/);
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
    const automationSource = await readFile(resolve(productRoot, "src", "services", "automationStatusDataSource.ts"), "utf8");
    const apiSource = await readFile(resolve(productRoot, "server", "scannerApiServer.ts"), "utf8");
    assert.doesNotMatch(localeSource, /\bfetch\s*\(/);
    assert.equal(PRODUCT_TRANSLATIONS.en["app.refresh"], "Refresh view");
    assert.equal(PRODUCT_TRANSLATIONS.pl["app.refresh"], "Odśwież widok");
    assert.match(appSource, /refreshPromiseRef\.current/);
    assert.match(appSource, /getAcceptedProductRefreshTimestamps\(output, new Date\(\)\.toISOString\(\)\)/);
    assert.doesNotMatch(appSource, /finally\(\(\) => \{[\s\S]*?setViewRefreshedAt/);
    assert.doesNotMatch(appSource, /dexscreenerClient|goplusClient|internalBetaCollector/);
    assert.match(appSource, /loadAutomationStatus\(\)/);
    assert.doesNotMatch(appSource, /CRYPTO_EDGE_AUTOMATION_ENABLED|runCentralAutomation|automation\/(?:run|enable|activate)/);
    assert.match(scannerSource, /\/api\/scanner\/latest/);
    assert.match(scannerSource, /\/api\/readiness/);
    assert.doesNotMatch(scannerSource, /https?:\/\//);
    assert.match(automationSource, /\/api\/automation\/status/);
    assert.match(automationSource, /method: "GET"/);
    assert.doesNotMatch(automationSource, /method: "POST"|runCentralAutomation|provider|activate/i);
    assert.doesNotMatch(apiSource, /internalBetaCollector|dexscreenerClient|goplusClient|collect:/);
    assert.doesNotMatch(apiSource, /\/api\/scanner\/(?:scan|collect|refresh)/);
  });
});
