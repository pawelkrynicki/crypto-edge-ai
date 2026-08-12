import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import TestRenderer from "react-test-renderer";
import { resolveCanonicalProductDataPaths } from "../server/canonicalProductDataPaths.js";
import { ProductAppContent, type ProductAppDataSources } from "../src/ProductApp.js";
import { resolveDetailTab, resolveRouteTokenIdentity } from "../src/candidateDetailRoute.js";
import { CandidateDetailView } from "../src/components/CandidateDetailView.js";
import { AIResearchSection } from "../src/components/AIResearchSection.js";
import { ExternalVerificationLinksView } from "../src/components/ExternalVerificationLinksView.js";
import { VerificationTokenBrowser } from "../src/components/VerificationTokenBrowser.js";
import { CandidateResultsView } from "../src/components/CandidateResultsView.js";
import { ProductWorkspaceShell } from "../src/components/ProductWorkspaceShell.js";
import { PERSISTABLE_SCANNER_SAMPLE } from "../src/fixtures/persistableScannerSample.js";
import { mapPersistableScannerOutputToUiCandidates } from "../src/adapters/scannerOutputAdapter.js";
import { formatProductDateTime, ProductLocaleProvider } from "../src/productI18n.js";
import type { ScannerDataSourceLoadResult } from "../src/services/scannerDataSource.js";
import type { FollowUpPublicEntry, FollowUpPublicStatus } from "../src/types/followUpTypes.js";
import type { ProductReadinessOutput } from "../src/types/scannerTypes.js";
import { resolveGlobalProductTimestamp } from "../src/productRefreshState.js";

void React;

const { act, create } = TestRenderer;
const GENERATED_AT = "2026-08-01T12:27:09.015Z";

describe("P1.1 Radar operational usability", () => {
  it("derives product snapshot paths from the central canonical resolver", async () => {
    const repoRoot = resolve(process.cwd(), "..", "..");
    const dataPocRoot = resolve(repoRoot, "tools", "data-poc");
    const automationState = resolve(dataPocRoot, ".local", "automation", "automation-state.json");
    const scannerRunId = "scan_20260801122707_dc880d81";
    const contextRunId = "approved_sources_20260801122707_7510004d";
    const resolved = await resolveCanonicalProductDataPaths(async () => ({
      repo_root: repoRoot,
      automation_state: automationState,
      follow_up_store: resolve(dataPocRoot, ".local", "follow-up", "store.json"),
      follow_up_backup: resolve(dataPocRoot, ".local", "follow-up", "store.json.bak"),
      scanner_snapshot: resolve(dataPocRoot, "output", scannerRunId, "full_output.json"),
      context_snapshot: resolve(dataPocRoot, "output", contextRunId, "approved_sources_output.json"),
      established_universe: resolve(repoRoot, "config", "established_address_universe_v1.json"),
      run_once_receipt: resolve(dataPocRoot, ".local", "data-cycle", "last-run-once.json"),
      backups_directory: resolve(dataPocRoot, ".local", "data-cycle", "backups"),
    }));

    assert.equal(resolved.automationStatePath, automationState);
    assert.equal(resolved.outputDirPath, resolve(dataPocRoot, "output"));
    assert.equal(resolved.scannerRunId, scannerRunId);
    assert.equal(resolved.contextRunId, contextRunId);
  });

  it("preserves the validated scanner query required by the frontend contract", async () => {
    const repoRoot = resolve(process.cwd(), "..", "..");
    const [serverBoundary, clientBoundary] = await Promise.all([
      readFile(resolve(repoRoot, "tools", "ui-mock", "server", "latestScannerOutput.ts"), "utf8"),
      readFile(resolve(repoRoot, "tools", "ui-mock", "src", "services", "scannerDataSource.ts"), "utf8"),
    ]);
    assert.match(serverBoundary, /query: value\.query/);
    assert.match(clientBoundary, /isSafeString\(value\.query\)/);
  });

  it("ships one provider-free INTERNAL_BETA visual-review command with local owner actions", async () => {
    const repoRoot = resolve(process.cwd(), "..", "..");
    const command = await readFile(resolve(repoRoot, "scripts", "win", "start-radar-visual-review.cmd"), "utf8");
    const launcher = await readFile(resolve(repoRoot, "scripts", "win", "start-radar-visual-review.ps1"), "utf8");
    assert.match(command, /start-radar-visual-review\.ps1/);
    assert.match(launcher, /CRYPTO_EDGE_RUNTIME_MODE = "INTERNAL_BETA"/);
    assert.match(launcher, /CRYPTO_EDGE_AUTOMATION_ENABLED = "0"/);
    assert.match(launcher, /ALLOW_LIVE_PROVIDER_CALLS = "0"/);
    assert.match(launcher, /CRYPTO_EDGE_AI_RESEARCH_PROVIDER = "DISABLED"/);
    assert.match(launcher, /OPENAI_API_KEY = ""/);
    assert.match(launcher, /CRYPTO_EDGE_OWNER_OPERATIONS_MODE = "ENABLED"/);
    assert.match(launcher, /productVpsServer/);
    assert.equal((launcher.match(/Start-Process \$productUrl/g) ?? []).length, 1);
    assert.doesNotMatch(launcher, /run-central-data-cycle|collect:internal-beta|scanner_and_context|PASS|FAIL/i);
  });

  it("resolves the global last-update timestamp in scanner, context, Follow-up priority order", () => {
    assert.equal(resolveGlobalProductTimestamp(GENERATED_AT, "2026-08-01T11:00:00.000Z", "2026-08-01T10:00:00.000Z"), GENERATED_AT);
    assert.equal(resolveGlobalProductTimestamp(null, "2026-08-01T11:00:00.000Z", "2026-08-01T10:00:00.000Z"), "2026-08-01T11:00:00.000Z");
    assert.equal(resolveGlobalProductTimestamp(null, null, "2026-08-01T10:00:00.000Z"), "2026-08-01T10:00:00.000Z");
    assert.equal(resolveGlobalProductTimestamp("invalid", "also-invalid", null), null);
  });

  it("shows explicit disabled AI guidance and an actionable manual verification workspace", () => {
    const candidate = mapPersistableScannerOutputToUiCandidates(PERSISTABLE_SCANNER_SAMPLE)[0]!;
    const aiMarkup = renderToStaticMarkup(
      <ProductLocaleProvider initialLocale="pl">
        <AIResearchSection
          chain={candidate.chain}
          contractAddress={candidate.contractAddress}
          symbol={candidate.symbol}
          name={candidate.name}
          mode="detail"
          onOpenControlCenter={() => undefined}
          initialLookup={{
            schema_version: "ai_research_lookup_v1",
            availability: "PROVIDER_DISABLED",
            provider_mode: "DISABLED",
            brief: null,
            retry_after_seconds: null,
            error_code: "PROVIDER_DISABLED",
          }}
        />
      </ProductLocaleProvider>,
    );
    assert.match(aiMarkup, /Niedostępna/);
    assert.match(aiMarkup, /Analiza AI jest obecnie niedostępna\./);
    assert.match(aiMarkup, /Aktywuj analizę AI w Centrum sterowania/);
    assert.doesNotMatch(aiMarkup, /provider|model|api[_ -]?key/i);

    const verificationMarkup = renderToStaticMarkup(
      <ProductLocaleProvider initialLocale="pl">
        <ExternalVerificationLinksView candidate={candidate} />
      </ProductLocaleProvider>,
    );
    assert.match(verificationMarkup, new RegExp(escapeRegExp(candidate.contractAddress)));
    assert.match(verificationMarkup, /Nazwa/);
    assert.match(verificationMarkup, /Symbol/);
    assert.match(verificationMarkup, /Dane i źródła/);
    assert.match(verificationMarkup, /Decyzja weryfikacyjna/);
    assert.match(verificationMarkup, /verification-panel-identity/);
  });

  it("keeps the Verification list visible and reuses the Details token drawer for a selected token", async () => {
    const candidate = mapPersistableScannerOutputToUiCandidates(PERSISTABLE_SCANNER_SAMPLE)[0]!;
    const markup = renderToStaticMarkup(
      <ProductLocaleProvider initialLocale="pl">
        <VerificationTokenBrowser
          candidates={[candidate]}
          followUpEntries={[]}
          selectedCandidate={candidate}
          onSelectToken={() => undefined}
          onCloseToken={() => undefined}
        />
      </ProductLocaleProvider>,
    );
    const sourceRoot = resolve(process.cwd(), "src", "components");
    const [detailsSource, verificationSource] = await Promise.all([
      readFile(resolve(sourceRoot, "CandidateDetail.tsx"), "utf8"),
      readFile(resolve(sourceRoot, "ExternalVerificationLinksView.tsx"), "utf8"),
    ]);

    assert.match(markup, /Tokeny z bieżącego Radaru/);
    assert.match(markup, new RegExp(escapeRegExp(candidate.contractAddress)));
    assert.match(markup, /data-token-detail-drawer="true"/);
    assert.match(markup, /aria-label="Zamknij kartę tokena"/);
    assert.match(detailsSource, /import \{ TokenDetailDrawer \} from "\.\/TokenDetailDrawer"/);
    assert.match(verificationSource, /import \{ TokenDetailDrawer \} from "\.\/TokenDetailDrawer"/);
    assert.doesNotMatch(markup, /queue|kolejka/i);
  });

  it("shows real New data, the scanner timestamp, context source statuses, and unambiguous counters", () => {
    const candidate = {
      ...mapPersistableScannerOutputToUiCandidates(PERSISTABLE_SCANNER_SAMPLE)[0]!,
      discoveryBasket: "new_emerging" as const,
      observationOnly: true,
    };
    const markup = renderToStaticMarkup(
      <ProductLocaleProvider initialLocale="pl">
        <CandidateResultsView
          candidates={[candidate]}
          generatedAt={GENERATED_AT}
          ageSeconds={60}
          freshnessStatus="FRESH"
          sourceIds={["dexscreener"]}
          readiness={readyReadiness()}
          followUpStatus={followUpStatus(385)}
          followUpEntries={[followUpEntry(1)]}
          establishedUniverseStatus={establishedStatus(7)}
        />
      </ProductLocaleProvider>,
    );

    assert.match(markup, new RegExp(escapeRegExp(formatProductDateTime(GENERATED_AT, "pl"))));
    assert.match(markup, /DexScreener/);
    assert.match(markup, /Alternative\.me/);
    assert.match(markup, /DefiLlama/);
    assert.match(markup, /Łącznie obserwowane/);
    assert.match(markup, /Wyświetlane teraz/);
    assert.match(markup, /Kandydaci do Głównego Radaru/);
    assert.match(markup, /Wpisy Established/);
  });

  it("keeps Follow-up usable without scanner data and explains the 100-of-385 limit", () => {
    const entries = Array.from({ length: 100 }, (_, index) => followUpEntry(index + 1));
    const markup = renderToStaticMarkup(
      <ProductLocaleProvider initialLocale="pl">
        <CandidateResultsView
          candidates={[]}
          scannerUnavailableReasonCode="SCANNER_OUTPUT_UNAVAILABLE"
          followUpStatus={followUpStatus(385)}
          followUpEntries={entries}
          establishedUniverseStatus={establishedStatus(7)}
          onOpenFollowUp={() => undefined}
        />
      </ProductLocaleProvider>,
    );
    const identities = entries.map((entry) => `${entry.chain}:${entry.contract_address}`);

    assert.match(markup, /Wyświetlono 100 z 385/);
    assert.equal((markup.match(/data-contract-address=/g) ?? []).length, 100);
    assert.equal((markup.match(/<button/g) ?? []).length >= 100, true);
    assert.equal(new Set(identities).size, 100, "visible chain + contract_address identities must be unique");
    assert.doesNotMatch(markup, /Radar nie może odczytać prawidłowego skanu/);
  });

  it("opens a Follow-up token by chain and contract, preserves the tab on refresh, and performs reads only", async () => {
    const entry = followUpEntry(1);
    const calls = { scanner: 0, readiness: 0, automation: 0, universe: 0, control: 0, status: 0, list: 0 };
    const dataSources: ProductAppDataSources = {
      loadScanner: async () => { calls.scanner += 1; return scannerUnavailable(); },
      loadReadiness: async () => { calls.readiness += 1; return { status: "ready", output: unavailableReadiness() }; },
      loadAutomation: async () => { calls.automation += 1; return null; },
      loadEstablishedUniverse: async () => { calls.universe += 1; return establishedStatus(7); },
      loadControlCenter: async () => { calls.control += 1; return null; },
      loadFollowUpStatus: async () => { calls.status += 1; return followUpStatus(385); },
      loadFollowUpList: async () => { calls.list += 1; return { schema_version: "follow_up_list_v1", validation_status: "valid", entries: [entry] }; },
      now: () => "2026-08-02T14:00:00.000Z",
    };
    const browser = installBrowser(`http://127.0.0.1:4180/?chain=${entry.chain}&contract=${entry.contract_address}#candidate-detail`);
    const originalFetch = globalThis.fetch;
    const originalActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
    const localRequests: Array<{ url: string; method: string }> = [];
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      localRequests.push({ url: String(input), method: init?.method ?? "GET" });
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

      let detail = renderer!.root.findByType(CandidateDetailView);
      assert.equal(detail.props.followUp.chain, entry.chain);
      assert.equal(detail.props.followUp.contract_address, entry.contract_address);
      assert.equal(resolveRouteTokenIdentity()?.chain, entry.chain);
      assert.equal(resolveRouteTokenIdentity()?.contract_address, entry.contract_address);
      assert.equal(renderer!.root.findAll((node) => node.props.role === "tab").length, 7);

      await act(async () => { detail.props.onActiveTabChange("market"); });
      assert.equal(resolveDetailTab(), "market");
      const shell = renderer!.root.findByType(ProductWorkspaceShell);
      await act(async () => { shell.props.onRefresh(); await flushPromises(); });
      detail = renderer!.root.findByType(CandidateDetailView);
      assert.equal(detail.props.followUp.contract_address, entry.contract_address);
      assert.equal(detail.props.activeTab, "market");
      assert.deepEqual(calls, { scanner: 2, readiness: 2, automation: 2, universe: 2, control: 2, status: 2, list: 2 });
      assert.ok(localRequests.every((request) => request.method === "GET"));
      assert.ok(localRequests.every((request) => request.url.startsWith("/api/")));
      assert.ok(localRequests.every((request) => !/provider|openai|collect|automation\/(?:run|enable|activate)|central/i.test(request.url)));
    } finally {
      if (renderer) await act(async () => { renderer!.unmount(); });
      browser.restore();
      globalThis.fetch = originalFetch;
      globalThis.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
    }
  });
});

function followUpEntry(index: number): FollowUpPublicEntry {
  const suffix = index.toString(16).padStart(40, "0");
  return {
    entry_id: `fup_${index.toString(16).padStart(16, "0")}`,
    chain: "base",
    contract_address: `0x${suffix}`,
    display_name: `Token ${index}`,
    symbol: `TOK${index}`,
    lifecycle_status: "MATURING",
    pair_age: 2,
    first_seen_at: "2026-07-30T12:00:00.000Z",
    last_seen_at: "2026-08-01T12:00:00.000Z",
    last_checked_at: "2026-08-01T12:00:00.000Z",
    next_check_at: "2026-08-03T12:00:00.000Z",
    completed_checkpoints: [1],
    market_metrics: {
      price_usd: 1,
      market_cap_usd: 1_000_000,
      fdv_usd: 1_000_000,
      liquidity_usd: 100_000,
      volume_24h_usd: 200_000,
      volume_market_cap_ratio: 0.2,
    },
    filter_status: "rejected_basic_filter",
    filter_reasons: ["pair_age_below_30d"],
    security_status: "MANUAL_VERIFICATION_REQUIRED",
    missing_data: ["security_not_checked"],
    established_membership: false,
    next_review_step: "WAIT_FOR_NEXT_CHECKPOINT",
  };
}

function followUpStatus(total: number): FollowUpPublicStatus {
  return {
    schema_version: "follow_up_status_v1",
    store_available: true,
    validation_status: "valid",
    entries_total: total,
    new_count: 0,
    maturing_count: total,
    candidate_count: 4,
    established_count: 0,
    archived_count: 0,
    due_count: 0,
    next_due_at: "2026-08-03T12:00:00.000Z",
    last_updated_at: GENERATED_AT,
  };
}

function establishedStatus(entries: number) {
  return {
    universe_version: "established-universe-v000001",
    generated_at: GENERATED_AT,
    entries_total: entries,
    entries_enabled: entries,
    validation_status: "valid" as const,
    last_change_at: GENERATED_AT,
  };
}

function readyReadiness(): ProductReadinessOutput {
  return {
    status: "ready",
    ready: true,
    runtime_mode: "INTERNAL_BETA",
    scanner: { ready: true, status: "ready", reason_code: null, freshness_status: "FRESH", generated_at: GENERATED_AT, age_seconds: 60 },
    context: {
      ready: true,
      reason_code: null,
      run_id: "approved_sources_20260801122707_7510004d",
      generated_at: GENERATED_AT,
      freshness_status: "FRESH",
      source_statuses: { alternative_me_fng: "READY", defillama_api: "READY" },
    },
    discovery: {
      new_emerging: { ready: true, status: "ready", reason_code: null },
      established: { ready: true, configured: true, status: "ready", reason_code: null },
    },
    reason_codes: [],
  };
}

function unavailableReadiness(): ProductReadinessOutput {
  return {
    status: "not_ready",
    ready: false,
    runtime_mode: "INTERNAL_BETA",
    scanner: { ready: false, status: "unavailable", reason_code: "SCANNER_OUTPUT_UNAVAILABLE" },
    context: { ready: false, reason_code: "CONTEXT_OUTPUT_UNAVAILABLE" },
    discovery: {
      new_emerging: { ready: false, status: "unavailable", reason_code: "SCANNER_OUTPUT_UNAVAILABLE" },
      established: { ready: false, configured: true, status: "unavailable", reason_code: "SCANNER_OUTPUT_UNAVAILABLE" },
    },
    reason_codes: ["SCANNER_OUTPUT_UNAVAILABLE", "CONTEXT_OUTPUT_UNAVAILABLE"],
  };
}

function scannerUnavailable(): ScannerDataSourceLoadResult {
  return {
    status: "error",
    source: "api",
    resolvedSource: "unavailable",
    usedFallback: false,
    reasonCode: "SCANNER_OUTPUT_UNAVAILABLE",
    error: "scanner unavailable",
    output: null,
  };
}

function installBrowser(initialHref: string) {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const location = { href: "", search: "", hash: "" };
  const apply = (href: string) => {
    const url = new URL(href);
    location.href = url.toString();
    location.search = url.search;
    location.hash = url.hash;
  };
  apply(initialHref);
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location,
      history: { pushState: (_data: unknown, _unused: string, url: URL | string) => apply(String(url)) },
      localStorage: { getItem: () => null, setItem: () => undefined },
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      setTimeout,
      clearTimeout,
    },
  });
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
