import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import TestRenderer from "react-test-renderer";
import {
  ProductAppContent,
  type ProductAppDataSources,
} from "../src/ProductApp.js";
import { CandidateDetailView } from "../src/components/CandidateDetailView.js";
import { CandidateResultsView } from "../src/components/CandidateResultsView.js";
import { ProductWorkspaceShell } from "../src/components/ProductWorkspaceShell.js";
import { PERSISTABLE_SCANNER_SAMPLE } from "../src/fixtures/persistableScannerSample.js";
import {
  PRODUCT_TRANSLATIONS,
  ProductLocaleProvider,
} from "../src/productI18n.js";
import type { ScannerDataSourceLoadResult } from "../src/services/scannerDataSource.js";
import type { ProductVersion } from "../src/productVersion.js";
import type {
  ProductReadinessOutput,
  ScannerApiOutput,
} from "../src/types/scannerTypes.js";
import type { LifecycleRadarView } from "../src/types/lifecycleTypes.js";

void React;

const { act, create } = TestRenderer;
const CONTRACT = "0x1111111111111111111111111111111111111111";
const PAIR = "0x2222222222222222222222222222222222222222";

describe("ProductApp Refresh View last-known-good flow", () => {
  it("keeps the complete accepted view through a failed refresh and replaces it on the next success", async () => {
    const first = readyResult(scannerOutput("scan_refresh_1", "FIRST", "2026-07-30T12:00:00.000Z"));
    const next = readyResult(scannerOutput("scan_refresh_2", "NEXT", "2026-07-30T12:05:00.000Z"));
    const failure = errorResult();
    let resolveFailedRefresh: (value: ScannerDataSourceLoadResult) => void = () => undefined;
    const failedRefresh = new Promise<ScannerDataSourceLoadResult>((resolve) => {
      resolveFailedRefresh = resolve;
    });
    let scannerCalls = 0;
    const snapshots = [first, failedRefresh, next] as const;
    const times = [
      "2026-07-30T12:00:05.000Z",
      "2026-07-30T12:01:05.000Z",
      "2026-07-30T12:05:05.000Z",
    ];
    let timeIndex = 0;
    const dataSources = createDataSources(
      () => {
        const selected = snapshots[scannerCalls];
        scannerCalls += 1;
        if (!selected) throw new Error("UNEXPECTED_SCANNER_CALL");
        return Promise.resolve(selected);
      },
      () => times[Math.min(timeIndex++, times.length - 1)]!,
    );
    const browser = installBrowser(`http://127.0.0.1:5173/?chain=base&contract=${CONTRACT}&detail=market#candidate-detail`);
    const originalFetch = globalThis.fetch;
    const originalActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
    const localReads: string[] = [];
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      localReads.push(String(input));
      return new Response("{}", { status: 404, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    let renderer: ReturnType<typeof create> | undefined;

    try {
      await act(async () => {
        renderer = create(
          <ProductLocaleProvider initialLocale="pl">
            <ProductAppContent dataSources={dataSources} runtimeModeOverride="INTERNAL_BETA" />
          </ProductLocaleProvider>,
        );
        await flushPromises();
      });

      const shell = () => renderer!.root.findByType(ProductWorkspaceShell);
      const detail = () => renderer!.root.findByType(CandidateDetailView);
      const acceptedShellState = scannerShellState(shell().props);
      assert.equal(detail().props.candidate.symbol, "FIRST");
      assert.equal(detail().props.candidate.chain, "base");
      assert.equal(detail().props.candidate.contractAddress, CONTRACT);
      assert.equal(detail().props.activeTab, "market");

      await act(async () => {
        const refresh = shell().props.onRefresh;
        refresh();
        refresh();
        await flushPromises();
      });
      assert.equal(scannerCalls, 2, "double click must share one in-flight refresh");

      await act(async () => {
        resolveFailedRefresh(failure);
        await failedRefresh;
        await flushPromises();
      });

      assert.deepEqual(scannerShellState(shell().props), acceptedShellState);
      assert.equal(detail().props.candidate.symbol, "FIRST");
      assert.equal(detail().props.candidate.chain, "base");
      assert.equal(detail().props.candidate.contractAddress, CONTRACT);
      assert.equal(detail().props.activeTab, "market");
      assert.match(renderedText(renderer!), /Nie udało się pobrać nowej wersji\. Pokazujemy ostatnie prawidłowe dane\./);
      assert.doesNotMatch(renderedText(renderer!), /Radar nie może odczytać prawidłowego skanu/);

      await act(async () => {
        shell().props.onRefresh();
        await flushPromises();
      });

      assert.equal(scannerCalls, 3);
      assert.equal(detail().props.candidate.symbol, "NEXT");
      assert.equal(detail().props.candidate.chain, "base");
      assert.equal(detail().props.candidate.contractAddress, CONTRACT);
      assert.equal(detail().props.activeTab, "market");
      assert.equal(shell().props.runId, "scan_refresh_2");
      assert.equal(shell().props.generatedAt, "2026-07-30T12:05:00.000Z");
      assert.equal(shell().props.viewRefreshedAt, "2026-07-30T12:05:05.000Z");
      assert.equal(shell().props.lastKnownGoodRefreshError, false);
      assert.doesNotMatch(renderedText(renderer!), /Nie udało się pobrać nowej wersji/);
      assert.ok(localReads.every((url) => url.startsWith("/api/")));
      assert.ok(localReads.every((url) => !/collect|provider|automation\/(?:run|enable|activate)/i.test(url)));
    } finally {
      if (renderer) await act(async () => { renderer!.unmount(); });
      browser.restore();
      globalThis.fetch = originalFetch;
      globalThis.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
    }
  });

  it("keeps the independent lifecycle fallback visible when the first scanner load has no valid snapshot", async () => {
    const browser = installBrowser("http://127.0.0.1:5173/#candidate-results");
    const originalFetch = globalThis.fetch;
    const originalActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    globalThis.fetch = (async () => new Response("{}", { status: 404 })) as typeof fetch;
    let renderer: ReturnType<typeof create> | undefined;
    try {
      await act(async () => {
        renderer = create(
          <ProductLocaleProvider initialLocale="en">
            <ProductAppContent
              dataSources={createDataSources(async () => errorResult())}
              runtimeModeOverride="INTERNAL_BETA"
            />
          </ProductLocaleProvider>,
        );
        await flushPromises();
      });
      const radar = renderer!.root.findByType(CandidateResultsView);
      const shell = renderer!.root.findByType(ProductWorkspaceShell);
      assert.deepEqual(radar.props.candidates, []);
      assert.equal(shell.props.runId, null);
      assert.equal(shell.props.lastKnownGoodRefreshError, false);
      assert.match(renderedText(renderer!), /Durable lifecycle records remain visible/);
      assert.doesNotMatch(renderedText(renderer!), /Showing the last valid data/);
    } finally {
      if (renderer) await act(async () => { renderer!.unmount(); });
      browser.restore();
      globalThis.fetch = originalFetch;
      globalThis.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
    }
  });

  it("refreshes the normal product view once after a published version change and preserves Candidate Detail state", async () => {
    const first = readyResult(scannerOutput("scan_pointer_1", "FIRST", "2026-07-30T12:00:00.000Z"));
    const next = readyResult(scannerOutput("scan_pointer_2", "NEXT", "2026-07-30T12:05:00.000Z"));
    const versions: ProductVersion[] = [
      { scanner_run_id: "scan_pointer_1", scanner_generated_at: "2026-07-30T12:00:00.000Z", context_run_id: "context_1", context_generated_at: "2026-07-30T12:00:00.000Z", lifecycle_cycle_id: "cycle_1", lifecycle_updated_at: "2026-07-30T12:00:01.000Z" },
      { scanner_run_id: "scan_pointer_2", scanner_generated_at: "2026-07-30T12:05:00.000Z", context_run_id: "context_2", context_generated_at: "2026-07-30T12:05:00.000Z", lifecycle_cycle_id: "cycle_2", lifecycle_updated_at: "2026-07-30T12:05:01.000Z" },
    ];
    let scannerCalls = 0;
    let versionIndex = 0;
    const browser = installBrowser(`http://127.0.0.1:5173/?chain=base&contract=${CONTRACT}&detail=market#candidate-detail`);
    const originalActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    let renderer: ReturnType<typeof create> | undefined;
    try {
      const dataSources: ProductAppDataSources = {
        ...createDataSources(async () => [first, next][scannerCalls++]!),
        loadProductVersion: async () => versions[versionIndex]!,
      };
      await act(async () => {
        renderer = create(<ProductLocaleProvider initialLocale="en"><ProductAppContent dataSources={dataSources} runtimeModeOverride="INTERNAL_BETA" /></ProductLocaleProvider>);
        await flushPromises();
      });
      assert.equal(scannerCalls, 1);
      assert.equal(renderer!.root.findByType(CandidateDetailView).props.activeTab, "market");

      versionIndex = 1;
      await act(async () => {
        (globalThis.window as unknown as { dispatchEvent: (event: { type: string }) => void }).dispatchEvent({ type: "focus" });
        await flushPromises();
      });

      const detail = renderer!.root.findByType(CandidateDetailView);
      const shell = renderer!.root.findByType(ProductWorkspaceShell);
      assert.equal(scannerCalls, 2, "one changed pointer produces one bounded full refresh");
      assert.equal(detail.props.candidate.symbol, "NEXT");
      assert.equal(detail.props.activeTab, "market");
      assert.equal(shell.props.runId, "scan_pointer_2");
    } finally {
      if (renderer) await act(async () => { renderer!.unmount(); });
      browser.restore();
      globalThis.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
    }
  });

  it("updates the review timestamp through polling without a click and preserves the private lifecycle basket", async () => {
    const first = readyResult(scannerOutput("scan_review_1", "FIRST", "2026-08-04T04:39:00.000Z"));
    const next = readyResult(scannerOutput("scan_review_1-review-1", "NEXT", "2026-08-10T08:30:00.000Z"));
    const versions: ProductVersion[] = [
      { scanner_run_id: "scan_review_1", scanner_generated_at: "2026-08-04T04:39:00.000Z", context_run_id: "context_1", context_generated_at: "2026-08-04T04:39:00.000Z", lifecycle_cycle_id: "cycle_1", lifecycle_updated_at: "2026-08-04T04:39:01.000Z" },
      { scanner_run_id: "scan_review_1-review-1", scanner_generated_at: "2026-08-10T08:30:00.000Z", context_run_id: "context_1", context_generated_at: "2026-08-04T04:39:00.000Z", lifecycle_cycle_id: "cycle_1", lifecycle_updated_at: "2026-08-10T08:30:00.000Z" },
    ];
    let scannerCalls = 0;
    let versionIndex = 0;
    let lifecycleReads = 0;
    const privateRadar = privateFollowUpRadar();
    const browser = installBrowser("http://127.0.0.1:5173/?pc1_review=1#candidate-results");
    const originalActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    let renderer: ReturnType<typeof create> | undefined;
    try {
      const dataSources: ProductAppDataSources = {
        ...createDataSources(async () => [first, next][scannerCalls++]!),
        loadLifecycleRadar: async () => { lifecycleReads += 1; return privateRadar; },
        loadProductVersion: async () => versions[versionIndex]!,
      };
      await act(async () => {
        renderer = create(<ProductLocaleProvider initialLocale="en"><ProductAppContent dataSources={dataSources} runtimeModeOverride="INTERNAL_BETA" /></ProductLocaleProvider>);
        await flushPromises();
      });
      assert.match(renderedText(renderer!), /Auto-update test: oczekiwanie/);

      versionIndex = 1;
      await act(async () => {
        (globalThis.window as unknown as { dispatchEvent: (event: { type: string }) => void }).dispatchEvent({ type: "focus" });
        await flushPromises();
      });

      const shell = renderer!.root.findByType(ProductWorkspaceShell);
      const radar = renderer!.root.findByType(CandidateResultsView);
      assert.equal(scannerCalls, 2, "the published review version performs one full read refresh without Refresh View");
      assert.equal(lifecycleReads, 2, "the private lifecycle view is read again with the refresh");
      assert.equal(shell.props.generatedAt, "2026-08-10T08:30:00.000Z");
      assert.equal(radar.props.lifecycleRadar.private_baskets.follow_up.cards[0]!.user_status, "FOLLOW_UP");
      assert.match(renderedText(renderer!), /New review version published/);
    } finally {
      if (renderer) await act(async () => { renderer!.unmount(); });
      browser.restore();
      globalThis.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
    }
  });

  it("preserves V1 for a missing or invalid V2, then atomically commits a valid V2", async () => {
    const first = readyResult(scannerOutput("scan_lkg_v1", "FIRST", "2026-08-10T08:00:00.000Z"));
    const validV2 = readyResult(scannerOutput("scan_lkg_v2", "SECOND", "2026-08-10T08:05:00.000Z"));
    const versions: ProductVersion[] = [
      { scanner_run_id: "scan_lkg_v1", scanner_generated_at: "2026-08-10T08:00:00.000Z", context_run_id: "context_1", context_generated_at: "2026-08-10T08:00:00.000Z", lifecycle_cycle_id: "cycle_1", lifecycle_updated_at: "2026-08-10T08:00:01.000Z" },
      { scanner_run_id: "scan_lkg_v2", scanner_generated_at: "2026-08-10T08:05:00.000Z", context_run_id: "context_1", context_generated_at: "2026-08-10T08:00:00.000Z", lifecycle_cycle_id: "cycle_1", lifecycle_updated_at: "2026-08-10T08:00:01.000Z" },
    ];
    const scans = [first, errorResult(), validV2, validV2];
    const lifecycleReads = [privateFollowUpRadar(), privateFollowUpRadar(), null, privateFollowUpRadar()];
    let scannerIndex = 0;
    let lifecycleIndex = 0;
    let versionIndex = 0;
    const browser = installBrowser(`http://127.0.0.1:5173/?chain=base&contract=${CONTRACT}&detail=market#candidate-detail`);
    const originalActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    let renderer: ReturnType<typeof create> | undefined;
    try {
      const dataSources: ProductAppDataSources = {
        ...createDataSources(async () => scans[scannerIndex++]!),
        loadLifecycleRadar: async () => lifecycleReads[lifecycleIndex++]!,
        loadProductVersion: async () => versions[versionIndex]!,
      };
      await act(async () => {
        renderer = create(<ProductLocaleProvider initialLocale="en"><ProductAppContent dataSources={dataSources} runtimeModeOverride="INTERNAL_BETA" /></ProductLocaleProvider>);
        await flushPromises();
      });
      const shell = () => renderer!.root.findByType(ProductWorkspaceShell);
      const detail = () => renderer!.root.findByType(CandidateDetailView);
      assert.equal(detail().props.candidate.symbol, "FIRST");

      versionIndex = 1;
      await act(async () => {
        (globalThis.window as unknown as { dispatchEvent: (event: { type: string }) => void }).dispatchEvent({ type: "focus" });
        await flushPromises();
      });
      assert.equal(shell().props.runId, "scan_lkg_v1", "missing V2 must not replace the accepted view");
      assert.equal(detail().props.candidate.symbol, "FIRST");
      assert.equal(shell().props.lastKnownGoodRefreshError, true);
      assert.match(renderedText(renderer!), /Could not load the new version\. Showing the last valid data\./);

      await act(async () => {
        await shell().props.onRefresh();
        await flushPromises();
      });
      assert.equal(shell().props.runId, "scan_lkg_v1", "an invalid required lifecycle read must preserve V1");
      assert.equal(detail().props.candidate.symbol, "FIRST");
      assert.equal(shell().props.lastKnownGoodRefreshError, true);

      await act(async () => {
        await shell().props.onRefresh();
        await flushPromises();
      });
      assert.equal(shell().props.runId, "scan_lkg_v2");
      assert.equal(shell().props.generatedAt, "2026-08-10T08:05:00.000Z");
      assert.equal(detail().props.candidate.symbol, "SECOND");
      assert.equal(detail().props.activeTab, "market");
      assert.equal(shell().props.lastKnownGoodRefreshError, false);
    } finally {
      if (renderer) await act(async () => { renderer!.unmount(); });
      browser.restore();
      globalThis.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
    }
  });

  it("ships the required natural PL and EN last-known-good alert copy", () => {
    assert.equal(
      PRODUCT_TRANSLATIONS.pl["app.refreshLastKnownGood"],
      "Nie udało się pobrać nowej wersji. Pokazujemy ostatnie prawidłowe dane.",
    );
    assert.equal(
      PRODUCT_TRANSLATIONS.en["app.refreshLastKnownGood"],
      "Could not load the new version. Showing the last valid data.",
    );
  });
});

function createDataSources(
  loadScanner: ProductAppDataSources["loadScanner"],
  now: () => string = () => "2026-07-30T12:00:05.000Z",
): ProductAppDataSources {
  return {
    loadScanner,
    loadReadiness: async () => ({ status: "ready", output: readiness() }),
    loadAutomation: async () => null,
    loadEstablishedUniverse: async () => null,
    loadControlCenter: async () => null,
    loadLifecycleRadar: async () => privateFollowUpRadar(),
    loadFollowUpStatus: async () => null,
    loadFollowUpList: async () => null,
    now,
  };
}

function scannerOutput(runId: string, symbol: string, generatedAt: string): ScannerApiOutput {
  const output = structuredClone(PERSISTABLE_SCANNER_SAMPLE) as ScannerApiOutput;
  const candidate = output.candidates[0]!;
  const originalCandidateId = candidate.candidate_id;
  candidate.run_id = runId;
  candidate.candidate_id = "refresh-flow-candidate";
  candidate.symbol = symbol;
  candidate.name = `${symbol} Token`;
  candidate.chain = "base";
  candidate.contract_address = CONTRACT;
  candidate.pair_address = PAIR;
  candidate.discovery_basket = "new_emerging";
  candidate.discovery_method = "dexscreener_latest_token_profiles";
  candidate.observation_only = true;
  candidate.established_eligible = false;
  candidate.address_identity_verified = true;
  output.candidates = [candidate];
  output.security_checks = output.security_checks
    .filter((entry) => entry.candidate_id === originalCandidateId)
    .map((entry) => ({ ...entry, run_id: runId, candidate_id: candidate.candidate_id }));
  output.scorecards = output.scorecards
    .filter((entry) => entry.candidate_id === originalCandidateId)
    .map((entry) => ({ ...entry, run_id: runId, candidate_id: candidate.candidate_id }));
  output.scan_run = {
    ...output.scan_run,
    run_id: runId,
    mode: "live",
    started_at: generatedAt,
    finished_at: generatedAt,
    total_raw: 1,
  };
  output.provenance = {
    schema_version: "persistable_scanner_output_v1",
    contract_version: "scanner_contract_v1",
    generator_version: "refresh-flow-test",
    environment: "INTERNAL_BETA",
    mode: "live",
    fixture_used: false,
    run_id: runId,
    generated_at: generatedAt,
    finished_at: generatedAt,
    source_ids: ["dexscreener"],
    policy_decisions: {},
    metadata: {
      discovery_architecture: "two_basket_discovery_v1",
      source_health: { dexscreener: "READY", goplus_security: "NOT_INVOKED" },
    },
  };
  output._source_meta = {
    source: "real-output",
    reason: "validated current snapshot",
    selected_run_id: runId,
    loaded_at: generatedAt,
    runtime_mode: "INTERNAL_BETA",
    age_seconds: 60,
    source_ids: ["dexscreener"],
    freshness_status: "FRESH",
  };
  return output;
}

function readyResult(output: ScannerApiOutput): ScannerDataSourceLoadResult {
  return {
    status: "ready",
    source: "api",
    resolvedSource: "real-output",
    usedFallback: false,
    output,
  };
}

function errorResult(): ScannerDataSourceLoadResult {
  return {
    status: "error",
    source: "api",
    resolvedSource: "unavailable",
    usedFallback: false,
    reasonCode: "SCANNER_API_UNAVAILABLE",
    error: "temporary local API error",
    output: null,
  };
}

function readiness(): ProductReadinessOutput {
  return {
    status: "ready",
    ready: true,
    runtime_mode: "INTERNAL_BETA",
    scanner: { ready: true, status: "ready", freshness_status: "FRESH", reason_code: null },
    context: { ready: true, reason_code: null },
    discovery: {
      new_emerging: { ready: true, status: "ready", reason_code: null },
      established: { ready: false, configured: true, status: "empty_configured", reason_code: "ESTABLISHED_UNIVERSE_EMPTY" },
    },
    reason_codes: [],
  };
}

function privateFollowUpRadar(): LifecycleRadarView {
  const group = <T,>(cards: T[]) => ({ total: cards.length, displayed: cards.length, limit: 24, next_cursor: null, cards });
  const card = {
    identity: `base:${CONTRACT}`,
    chain: "base",
    contract_address: CONTRACT,
    display_name: "Private token",
    symbol: "PRIVATE",
    first_seen_at: "2026-08-04T04:39:00.000Z",
    last_seen_at: "2026-08-04T04:39:00.000Z",
    snapshot_present: true,
    snapshot_absence_notice: false,
    market: null,
    follow_up: null,
    system_status: "NEW" as const,
    user_status: "FOLLOW_UP" as const,
    user_status_is_override: true,
    conditions: { conditions_met: ["IDENTITY_VALID"], conditions_unmet: [], missing_data: [], risks: [], readiness: "CONDITIONS_MET" as const, security_state: "CHECKED", verification_state: "VERIFIED" },
    actor: { role: "CAMP_USER" as const, capabilities: ["PRIVATE_LIFECYCLE_WRITE"] },
  };
  return {
    schema_version: "lifecycle_radar_view_v1",
    summary: {
      schema_version: "lifecycle_summary_v1",
      system_new_total: 1,
      system_follow_up_total: 0,
      system_main_radar_total: 0,
      follow_up_action_due: 0,
      follow_up_candidates_ready: 0,
      follow_up_displayed: 0,
      follow_up_store_version: "sha256:review",
      last_lifecycle_change_at: "2026-08-04T04:39:00.000Z",
      last_central_cycle_id: "cycle_1",
      summary_as_of: "2026-08-04T04:39:00.000Z",
      last_completed_cycle_id: "cycle_1",
      last_completed_cycle_at: "2026-08-04T04:39:00.000Z",
      delta_source: "CENTRAL_CYCLE",
      last_change_summary: { added: 1, updated: 0, promoted_to_follow_up: 0, promoted_to_main_radar: 0, archived: 0, rejected: 0, duplicate_noop: 0 },
    },
    actor: card.actor,
    new_inbox: group([]),
    follow_up: { action_due: group([]), candidates_ready: group([]), observed: group([]) },
    main_radar: { total: 0 },
    private_new_total: 0,
    private_follow_up_total: 1,
    private_main_radar_total: 0,
    private_baskets: { new: group([]), follow_up: group([card]), main_radar: group([]) },
  };
}

function scannerShellState(props: Record<string, unknown>) {
  return {
    runId: props.runId,
    generatedAt: props.generatedAt,
    viewRefreshedAt: props.viewRefreshedAt,
    ageSeconds: props.ageSeconds,
    freshnessStatus: props.freshnessStatus,
    sourceIds: props.sourceIds,
    resolvedSource: props.resolvedSource,
    sourceHealth: props.sourceHealth,
  };
}

function installBrowser(initialHref: string) {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const values = new Map<string, string>();
  const location = { href: "", search: "", hash: "" };
  const apply = (href: string) => {
    const url = new URL(href);
    location.href = url.toString();
    location.search = url.search;
    location.hash = url.hash;
  };
  apply(initialHref);
  const listeners = new Map<string, Set<(event: { type: string }) => void>>();
  const windowValue = {
    location,
    history: {
      pushState: (_data: unknown, _unused: string, url: URL | string) => apply(String(url)),
    },
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    },
    addEventListener: (name: string, handler: (event: { type: string }) => void) => {
      const entries = listeners.get(name) ?? new Set();
      entries.add(handler);
      listeners.set(name, entries);
    },
    removeEventListener: (name: string, handler: (event: { type: string }) => void) => listeners.get(name)?.delete(handler),
    dispatchEvent: (event: { type: string }) => listeners.get(event.type)?.forEach((handler) => handler(event)),
    setTimeout,
    clearTimeout,
  };
  Object.defineProperty(globalThis, "window", { configurable: true, value: windowValue });
  return {
    restore: () => {
      if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
      else Reflect.deleteProperty(globalThis, "window");
    },
  };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function renderedText(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(renderedText).join("");
  if (value && typeof value === "object" && "children" in value) return renderedText((value as { children?: unknown }).children);
  if (value && typeof value === "object" && "toJSON" in value) return renderedText((value as { toJSON: () => unknown }).toJSON());
  return "";
}
