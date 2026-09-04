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
import { PersonalRadarPanel } from "../src/components/PersonalRadarPanel.js";
import { VerificationTokenBrowser } from "../src/components/VerificationTokenBrowser.js";
import { CandidateResultsView } from "../src/components/CandidateResultsView.js";
import { ProductWorkspaceShell } from "../src/components/ProductWorkspaceShell.js";
import { PERSISTABLE_SCANNER_SAMPLE } from "../src/fixtures/persistableScannerSample.js";
import { mapPersistableScannerOutputToUiCandidates } from "../src/adapters/scannerOutputAdapter.js";
import { formatProductDateTime, ProductLocaleProvider } from "../src/productI18n.js";
import type { ScannerDataSourceLoadResult } from "../src/services/scannerDataSource.js";
import type { FollowUpPublicEntry, FollowUpPublicStatus } from "../src/types/followUpTypes.js";
import type { LifecycleRadarCard, LifecycleRadarView, LifecycleTokenView } from "../src/types/lifecycleTypes.js";
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

  it("shows a deterministic ineligibility reason and an actionable manual verification workspace", () => {
    const candidate = mapPersistableScannerOutputToUiCandidates(PERSISTABLE_SCANNER_SAMPLE)[0]!;
    const aiMarkup = renderToStaticMarkup(
      <ProductLocaleProvider initialLocale="pl">
        <AIResearchSection
          chain={candidate.chain}
          contractAddress={candidate.contractAddress}
          symbol={candidate.symbol}
          name={candidate.name}
          mode="detail"
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
    assert.match(aiMarkup, /Niedostępna dla tego tokena/);
    assert.match(aiMarkup, /adres kontraktu jest nieprawidłowy/);
    assert.match(aiMarkup, /Nie można zlecić ani ponowić analizy/);
    assert.doesNotMatch(aiMarkup, /provider|model|api[_ -]?key|Centrum sterowania|Aktywuj/i);

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

  it("marks effective Product and assigned Private Radar states as active, while no assignment is neutral", () => {
    const mainMarkup = renderToStaticMarkup(
      <ProductLocaleProvider initialLocale="pl">
        <PersonalRadarPanel chain="bsc" contractAddress="0x1111111111111111111111111111111111111111" initialView={lifecycleTokenView("FOLLOW_UP", "MAIN_RADAR", true)} />
      </ProductLocaleProvider>,
    );
    assert.equal((mainMarkup.match(/data-status-active="true"/g) ?? []).length, 2);
    assert.equal((mainMarkup.match(/role="status"/g) ?? []).length, 2);
    assert.match(mainMarkup, /Radar produktu: Dalsza obserwacja/);
    assert.match(mainMarkup, /Twój Radar: Główny Radar/);

    const followUpMarkup = renderToStaticMarkup(
      <ProductLocaleProvider initialLocale="pl">
        <PersonalRadarPanel chain="bsc" contractAddress="0x3333333333333333333333333333333333333333" initialView={lifecycleTokenView("FOLLOW_UP", "FOLLOW_UP", true)} />
      </ProductLocaleProvider>,
    );
    assert.equal((followUpMarkup.match(/data-status-active="true"/g) ?? []).length, 2);
    assert.match(followUpMarkup, /Twój Radar: Dalsza obserwacja/);

    const unassignedMarkup = renderToStaticMarkup(
      <ProductLocaleProvider initialLocale="pl">
        <PersonalRadarPanel chain="bsc" contractAddress="0x2222222222222222222222222222222222222222" initialView={lifecycleTokenView("FOLLOW_UP", "FOLLOW_UP", false)} />
      </ProductLocaleProvider>,
    );
    assert.match(unassignedMarkup, /Radar produktu: Dalsza obserwacja/);
    assert.match(unassignedMarkup, /Twój Radar: Brak prywatnego przypisania/);
    assert.equal((unassignedMarkup.match(/data-status-active="true"/g) ?? []).length, 1);
    assert.match(unassignedMarkup, /data-status-active="false"/);
  });

  it("uses a high-contrast mint marker only for active Radar states", async () => {
    const css = await readFile(resolve(process.cwd(), "src", "index.css"), "utf8");
    const activeRule = css.match(/\.personal-radar-active\[data-status-active="true"\] \.product-status-indicator\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
    const unassignedRule = css.match(/\.personal-radar-active\[data-status-active="false"\] \.product-status-indicator\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";

    assert.match(activeRule, /background:\s*var\(--color-status-ready\)/);
    assert.match(activeRule, /border-color:\s*var\(--color-status-ready\)/);
    assert.match(activeRule, /0 0 12px color-mix\(in srgb, var\(--color-status-ready\)/);
    assert.match(unassignedRule, /color:\s*var\(--color-status-neutral\)/);
    assert.match(unassignedRule, /border-style:\s*dashed/);
    assert.doesNotMatch(unassignedRule, /color-status-ready/);
  });

  it("redirects retired Opinions and Feedback hashes to Radar without restoring their screen", async () => {
    const dataSources: ProductAppDataSources = {
      loadScanner: async () => scannerUnavailable(),
      loadReadiness: async () => ({ status: "ready", output: readyReadiness() }),
      loadAutomation: async () => null,
      loadEstablishedUniverse: async () => establishedStatus(0),
      loadControlCenter: async () => null,
      loadFollowUpStatus: async () => followUpStatus(0),
      loadFollowUpList: async () => ({ schema_version: "follow_up_list_v1", validation_status: "valid", entries: [] }),
    };
    const browser = installBrowser("http://127.0.0.1:4180/#feedback");
    const originalActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
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
      assert.equal(globalThis.window.location.hash, "#candidate-results");
      assert.equal(renderer!.root.findByType(ProductWorkspaceShell).props.activeSection, "candidate-results");

      await act(async () => {
        globalThis.window.location.hash = "#opinion";
        globalThis.window.dispatchEvent(new Event("hashchange"));
        await flushPromises();
      });
      assert.equal(globalThis.window.location.hash, "#candidate-results");
      assert.equal(renderer!.root.findByType(ProductWorkspaceShell).props.activeSection, "candidate-results");
      assert.equal(renderer!.root.findAll((node) => node.props.children === "Opinie").length, 0);
    } finally {
      if (renderer) await act(async () => { renderer!.unmount(); });
      browser.restore();
      globalThis.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
    }
  });

  it("keeps the Your Radar heading outside a three-card desktop grid and uses two columns on tablets", async () => {
    const [component, css] = await Promise.all([
      readFile(resolve(process.cwd(), "src", "components", "CandidateResultsView.tsx"), "utf8"),
      readFile(resolve(process.cwd(), "src", "index.css"), "utf8"),
    ]);
    assert.match(component, /<section className="private-radar-section"[\s\S]*?<header className="private-radar-switcher-heading"[\s\S]*?<div className="basket-switcher">/);
    assert.match(css, /\.basket-switcher\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
    assert.match(css, /@media \(min-width: 761px\) and \(max-width: 960px\)[\s\S]*?\.private-radar-section > \.basket-switcher \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); \}/);
    assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.basket-switcher[\s\S]*?grid-template-columns: 1fr/);
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

  it("shows real New data with the beginner Radar hierarchy and distinct counters", () => {
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
    assert.match(markup, /Crypto Edge wykrywa nowe projekty i obserwuje je w czasie\./);
    assert.match(markup, /Aktywne w obserwacji/);
    assert.match(markup, /Do sprawdzenia/);
    assert.match(markup, /Główny Radar/);
    assert.match(markup, /Tokeny aktualnie dostępne w sekcji Nowe \/ obserwacja Twojego Radaru\./);
    assert.match(markup, /Systemowy koszyk Dalsza obserwacja\./);
    assert.match(markup, /Projekty po pełnym procesie obserwacji i weryfikacji\./);
    assert.doesNotMatch(markup, /Łącznie obserwowane|Do działania teraz|Wyświetlane teraz|Wpisy Established/);
  });

  it("separates the active Radar observation count from historical detections and keeps Polish load-more copy valid", () => {
    const candidate = {
      ...mapPersistableScannerOutputToUiCandidates(PERSISTABLE_SCANNER_SAMPLE)[0]!,
      discoveryBasket: "new_emerging" as const,
    };
    const lifecycleRadar = lifecycleRadarView(2, 290, "next-page");
    const markup = renderToStaticMarkup(
      <ProductLocaleProvider initialLocale="pl">
        <CandidateResultsView candidates={[candidate]} lifecycleRadar={lifecycleRadar} />
      </ProductLocaleProvider>,
    );

    assert.match(markup, /<span>Aktywne w obserwacji<\/span><strong>2<\/strong>/);
    assert.match(markup, /Więcej informacji o danych[\s\S]*?<span>Wykryte łącznie<\/span><strong>290<\/strong>/);
    assert.match(markup, /Pokaż więcej/);
    assert.doesNotMatch(markup, /Poka\u0139\u013d wi\u00c4\u2122cej/);
  });

  it("selects Verification by canonical chain and contract, with safe direct and stale-route fallbacks", () => {
    const first = mapPersistableScannerOutputToUiCandidates(PERSISTABLE_SCANNER_SAMPLE)[0]!;
    const selected = { ...first, id: "same-symbol-other-contract", contractAddress: "0x2222222222222222222222222222222222222222", symbol: first.symbol };
    const selectedIdentity = { chain: selected.chain, contract_address: selected.contractAddress };
    const selectedMarkup = renderToStaticMarkup(
      <ProductLocaleProvider initialLocale="pl">
        <VerificationTokenBrowser candidates={[first, selected]} followUpEntries={[]} selectedIdentity={selectedIdentity} onSelectToken={() => undefined} onCloseToken={() => undefined} />
      </ProductLocaleProvider>,
    );
    assert.match(selectedMarkup, new RegExp(`data-verification-token="${escapeRegExp(`${selected.chain}:${selected.contractAddress}`)}"`));
    assert.match(selectedMarkup, new RegExp(`data-verification-token="${escapeRegExp(`${selected.chain}:${selected.contractAddress}`)}"[\\s\\S]*?aria-pressed="true"|aria-pressed="true"[\\s\\S]*?data-verification-token="${escapeRegExp(`${selected.chain}:${selected.contractAddress}`)}"`));
    assert.match(selectedMarkup, new RegExp(escapeRegExp(selected.contractAddress)));

    const directMarkup = renderToStaticMarkup(
      <ProductLocaleProvider initialLocale="pl">
        <VerificationTokenBrowser candidates={[first]} followUpEntries={[]} onSelectToken={() => undefined} onCloseToken={() => undefined} />
      </ProductLocaleProvider>,
    );
    const staleMarkup = renderToStaticMarkup(
      <ProductLocaleProvider initialLocale="pl">
        <VerificationTokenBrowser candidates={[first]} followUpEntries={[]} selectedIdentity={{ chain: "base", contract_address: "0x3333333333333333333333333333333333333333" }} onSelectToken={() => undefined} onCloseToken={() => undefined} />
      </ProductLocaleProvider>,
    );
    for (const markup of [directMarkup, staleMarkup]) {
      assert.match(markup, /Wybierz token do weryfikacji/);
      assert.equal((markup.match(/aria-pressed="true"/g) ?? []).length, 0);
    }

    const lifecycleOnly = { ...selected, id: "lifecycle-only", contractAddress: "0x4444444444444444444444444444444444444444" };
    const lifecycleOnlyIdentity = { chain: lifecycleOnly.chain, contract_address: lifecycleOnly.contractAddress };
    const lifecycleOnlyMarkup = renderToStaticMarkup(
      <ProductLocaleProvider initialLocale="pl">
        <VerificationTokenBrowser candidates={[first]} followUpEntries={[]} selectedCandidate={lifecycleOnly} selectedIdentity={lifecycleOnlyIdentity} onSelectToken={() => undefined} onCloseToken={() => undefined} />
      </ProductLocaleProvider>,
    );
    assert.match(lifecycleOnlyMarkup, new RegExp(escapeRegExp(lifecycleOnly.contractAddress)));
    assert.match(lifecycleOnlyMarkup, /data-token-detail-drawer="true"/);
    assert.equal((lifecycleOnlyMarkup.match(/aria-pressed="true"/g) ?? []).length, 0, "a lifecycle-only route must not select a different sidebar token");
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

      for (const tab of ["summary", "observation", "market", "filters", "security", "ai", "data"] as const) {
        await act(async () => { detail.props.onActiveTabChange(tab); });
        assert.equal(resolveDetailTab(), tab);
        assert.deepEqual(resolveRouteTokenIdentity(), { chain: entry.chain, contract_address: entry.contract_address });
        detail = renderer!.root.findByType(CandidateDetailView);
        assert.equal(detail.props.activeTab, tab);
      }
      await act(async () => { browser.back(); });
      detail = renderer!.root.findByType(CandidateDetailView);
      assert.equal(detail.props.activeTab, "ai");
      await act(async () => { browser.forward(); });
      detail = renderer!.root.findByType(CandidateDetailView);
      assert.equal(detail.props.activeTab, "data");
      const shell = renderer!.root.findByType(ProductWorkspaceShell);
      await act(async () => { shell.props.onRefresh(); await flushPromises(); });
      detail = renderer!.root.findByType(CandidateDetailView);
      assert.equal(detail.props.followUp.contract_address, entry.contract_address);
      assert.equal(detail.props.activeTab, "data");
      assert.deepEqual(calls, { scanner: 2, readiness: 2, automation: 2, universe: 2, control: 0, status: 1, list: 1 });
      assert.ok(localRequests.every((request) => request.method === "GET"));
      assert.ok(localRequests.every((request) => request.url.startsWith("/api/")));
      assert.ok(localRequests.every((request) => !/provider|openai|collect|automation\/(?:run|enable|activate)|central/i.test(request.url)));

      await act(async () => { detail.props.onActiveTabChange("security"); });
      const verificationButton = renderer!.root.find((node) => (
        node.type === "button" && node.children.some((child) => child === "Przejdź do weryfikacji źródłowej")
      ));
      await act(async () => { verificationButton.props.onClick(); await flushPromises(); });
      assert.equal(globalThis.window.location.hash, "#external-checks");
      assert.deepEqual(resolveRouteTokenIdentity(), { chain: entry.chain, contract_address: entry.contract_address });
      const verification = renderer!.root.findByType(VerificationTokenBrowser);
      assert.deepEqual(verification.props.selectedIdentity, { chain: entry.chain, contract_address: entry.contract_address });
      const selectedVerificationToken = renderer!.root.find((node) => node.props["data-verification-token"] === `${entry.chain}:${entry.contract_address}`);
      assert.equal(selectedVerificationToken.props["aria-pressed"], true);
      assert.equal(renderer!.root.findAll((node) => node.props.role === "tab").length, 6);
    } finally {
      if (renderer) await act(async () => { renderer!.unmount(); });
      browser.restore();
      globalThis.fetch = originalFetch;
      globalThis.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
    }
  });

  it("keeps a lifecycle-only Candidate Detail identity through sidebar and source-verification navigation", async () => {
    const lifecycleCard = lifecycleOnlyCard();
    const dataSources: ProductAppDataSources = {
      loadScanner: async () => ({ status: "ready", source: "api", resolvedSource: "real-output", usedFallback: false, output: PERSISTABLE_SCANNER_SAMPLE }),
      loadReadiness: async () => ({ status: "ready", output: readyReadiness() }),
      loadAutomation: async () => null,
      loadEstablishedUniverse: async () => establishedStatus(7),
      loadControlCenter: async () => null,
      loadFollowUpStatus: async () => followUpStatus(0),
      loadFollowUpList: async () => ({ schema_version: "follow_up_list_v1", validation_status: "valid", entries: [] }),
      loadLifecycleRadar: async () => lifecycleRadarWithCard(lifecycleCard),
      now: () => "2026-08-02T14:00:00.000Z",
    };
    const browser = installBrowser(`http://127.0.0.1:4180/?chain=${lifecycleCard.chain}&contract=${lifecycleCard.contract_address}#candidate-detail`);
    const originalFetch = globalThis.fetch;
    const originalActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
    const localRequests: string[] = [];
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      localRequests.push(String(input));
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
      assert.equal(detail.props.candidate.contractAddress, lifecycleCard.contract_address);
      const shell = renderer!.root.findByType(ProductWorkspaceShell);
      await act(async () => { shell.props.onSectionChange("external-checks"); await flushPromises(); });

      let verification = renderer!.root.findByType(VerificationTokenBrowser);
      assert.deepEqual(verification.props.selectedIdentity, { chain: lifecycleCard.chain, contract_address: lifecycleCard.contract_address });
      assert.equal(verification.props.selectedCandidate.contractAddress, lifecycleCard.contract_address);
      assert.equal(renderer!.root.findAllByProps({ "data-token-detail-drawer": "true" }).length, 1);
      assert.equal(renderer!.root.findAll((node) => node.props["data-verification-token"] === `${lifecycleCard.chain}:${lifecycleCard.contract_address}`).length, 0, "the Verification list remains the scanner/Follow-up list");

      await act(async () => { verification.props.onReturnToDetail(); await flushPromises(); });
      detail = renderer!.root.findByType(CandidateDetailView);
      const sourceVerification = renderer!.root.findAllByType("button").find((node) => node.children.some((child) => child === "Przejdź do weryfikacji źródłowej"));
      assert.ok(sourceVerification, "Candidate Detail must expose the source-verification CTA");
      await act(async () => { sourceVerification.props.onClick(); await flushPromises(); });

      verification = renderer!.root.findByType(VerificationTokenBrowser);
      assert.deepEqual(verification.props.selectedIdentity, { chain: lifecycleCard.chain, contract_address: lifecycleCard.contract_address });
      assert.equal(verification.props.selectedCandidate.contractAddress, lifecycleCard.contract_address);
      assert.equal(renderer!.root.findAllByProps({ "data-token-detail-drawer": "true" }).length, 1);
      assert.equal(localRequests.some((url) => /provider|openai/i.test(url)), false);
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

function lifecycleTokenView(system: LifecycleTokenView["system_status"], user: LifecycleTokenView["user_status"], override: boolean): LifecycleTokenView {
  return {
    identity: `bsc:0x${"1".repeat(40)}`,
    system_status: system,
    user_status: user,
    user_status_is_override: override,
    conditions: { conditions_met: [], conditions_unmet: [], missing_data: [], risks: [], readiness: "CONDITIONS_UNMET", security_state: "PARTIAL", verification_state: "PENDING" },
    actor: { role: "CAMP_USER", capabilities: ["CAMP_USER_WORKSPACE_WRITE"] },
  };
}

function lifecycleRadarView(activeNewTotal: number, detectedTotal: number, nextCursor: string | null): LifecycleRadarView {
  const emptyGroup = { total: 0, displayed: 0, limit: 100, next_cursor: null, cards: [] };
  const newGroup = { total: activeNewTotal, displayed: 0, limit: 100, next_cursor: nextCursor, cards: [] };
  return {
    schema_version: "lifecycle_radar_view_v1",
    summary: {
      schema_version: "lifecycle_summary_v1",
      system_new_total: activeNewTotal,
      system_detected_total: detectedTotal,
      system_follow_up_total: 0,
      system_main_radar_total: 0,
      follow_up_action_due: 0,
      follow_up_candidates_ready: 0,
      follow_up_displayed: 0,
      follow_up_store_version: "test",
      last_lifecycle_change_at: null,
      last_central_cycle_id: null,
      summary_as_of: null,
      last_completed_cycle_id: null,
      last_completed_cycle_at: null,
      delta_source: "NONE",
      last_change_summary: { added: 0, updated: 0, promoted_to_follow_up: 0, promoted_to_main_radar: 0, archived: 0, rejected: 0, duplicate_noop: 0 },
    },
    actor: { role: "CAMP_USER", capabilities: [] },
    new_inbox: { ...newGroup },
    follow_up: { action_due: { ...emptyGroup }, candidates_ready: { ...emptyGroup }, observed: { ...emptyGroup } },
    main_radar: { total: 0 },
    private_new_total: activeNewTotal,
    private_follow_up_total: 0,
    private_main_radar_total: 0,
    private_baskets: { new: newGroup, follow_up: { ...emptyGroup }, main_radar: { ...emptyGroup } },
  };
}

function lifecycleOnlyCard(): LifecycleRadarCard {
  return {
    identity: "bsc:0x4444444444444444444444444444444444444444",
    chain: "bsc",
    contract_address: "0x4444444444444444444444444444444444444444",
    display_name: "RWASWEEP",
    symbol: "RWASWEEP",
    system_status: "NEW",
    user_status: "NEW",
    user_status_is_override: false,
    conditions: {
      conditions_met: ["IDENTITY_VALID"],
      conditions_unmet: [],
      missing_data: [],
      risks: [],
      readiness: "CONDITIONS_MET",
      security_state: "PARTIAL",
      verification_state: "PENDING",
    },
    actor: { role: "CAMP_USER", capabilities: [] },
    first_seen_at: "2026-08-02T12:00:00.000Z",
    last_seen_at: "2026-08-02T13:00:00.000Z",
    snapshot_present: false,
    snapshot_absence_notice: true,
    market: null,
    follow_up: null,
  };
}

function lifecycleRadarWithCard(card: LifecycleRadarCard): LifecycleRadarView {
  const radar = lifecycleRadarView(1, 1, null);
  const newInbox = { ...radar.new_inbox, total: 1, displayed: 1, cards: [card] };
  return {
    ...radar,
    new_inbox: newInbox,
    private_baskets: { ...radar.private_baskets, new: { ...radar.private_baskets.new, total: 1, displayed: 1, cards: [card] } },
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
  const entries = [initialHref];
  let index = 0;
  const listeners = new Map<string, Set<(event: Event) => void>>();
  const location = { href: "", pathname: "", search: "", hash: "" };
  const apply = (href: string) => {
    const url = new URL(href, location.href || initialHref);
    location.href = url.toString();
    location.pathname = url.pathname;
    location.search = url.search;
    location.hash = url.hash;
  };
  apply(initialHref);
  const dispatch = (event: Event) => {
    for (const listener of listeners.get(event.type) ?? []) listener(event);
    return true;
  };
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location,
      history: {
        pushState: (_data: unknown, _unused: string, url: URL | string) => {
          entries.splice(index + 1);
          entries.push(new URL(String(url), location.href || initialHref).toString());
          index = entries.length - 1;
          apply(entries[index]!);
        },
        replaceState: (_data: unknown, _unused: string, url: URL | string) => {
          entries[index] = new URL(String(url), location.href || initialHref).toString();
          apply(entries[index]!);
        },
      },
      localStorage: { getItem: () => null, setItem: () => undefined },
      addEventListener: (type: string, listener: (event: Event) => void) => {
        const registered = listeners.get(type) ?? new Set<(event: Event) => void>();
        registered.add(listener);
        listeners.set(type, registered);
      },
      removeEventListener: (type: string, listener: (event: Event) => void) => listeners.get(type)?.delete(listener),
      dispatchEvent: dispatch,
      setTimeout,
      clearTimeout,
    },
  });
  return {
    back: () => {
      if (index === 0) return;
      index -= 1;
      apply(entries[index]!);
      dispatch(new Event("popstate"));
    },
    forward: () => {
      if (index >= entries.length - 1) return;
      index += 1;
      apply(entries[index]!);
      dispatch(new Event("popstate"));
    },
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
