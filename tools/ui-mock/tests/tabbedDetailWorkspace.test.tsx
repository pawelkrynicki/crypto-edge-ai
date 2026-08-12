import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import TestRenderer from "react-test-renderer";
import { mapPersistableScannerOutputToUiCandidates } from "../src/adapters/scannerOutputAdapter.js";
import { resolveDetailTab, resolveRouteTokenIdentity, writeCandidateDetailRoute } from "../src/candidateDetailRoute.js";
import { AIResearchSection } from "../src/components/AIResearchSection.js";
import { CandidateDetailView } from "../src/components/CandidateDetailView.js";
import { ProductWorkspaceShell } from "../src/components/ProductWorkspaceShell.js";
import { PERSISTABLE_SCANNER_SAMPLE } from "../src/fixtures/persistableScannerSample.js";
import { ProductLocaleProvider, type ProductLocale } from "../src/productI18n.js";
import { resolveProductSourceHealth } from "../src/productSourceHealth.js";
import type { AIResearchBriefLookup } from "../src/types/aiResearchTypes.js";

void React;

const { act, create } = TestRenderer;
const ADDRESS_A = "0x1111111111111111111111111111111111111111";
const ADDRESS_B = "0x2222222222222222222222222222222222222222";
const baseCandidate = mapPersistableScannerOutputToUiCandidates(PERSISTABLE_SCANNER_SAMPLE)[0]!;
const candidateA = { ...baseCandidate, id: "base:a", chain: "base", contractAddress: ADDRESS_A, pairAddress: ADDRESS_B, addressIdentityVerified: true };
const candidateB = { ...candidateA, id: "base:b", symbol: "NEXT", name: "Next Token", contractAddress: ADDRESS_B };

describe("UX.2 Tabbed Token Detail Workspace", () => {
  it("renders seven complete PL/EN tabs, Summary by default and exactly one tabpanel", () => {
    const expected = {
      en: ["Summary", "Observation", "Market data", "Filters", "Security", "AI analysis", "Data and sources"],
      pl: ["Podsumowanie", "Obserwacja", "Rynek", "Filtry", "Bezpieczeństwo", "Analiza AI", "Dane i źródła"],
    } as const;
    for (const locale of ["en", "pl"] as const) {
      const markup = render(locale, <CandidateDetailView candidate={candidateA} initialOwnerPromotionStatus={null} />);
      assert.match(markup, /class="token-detail-workspace" data-active-detail-tab="summary"/);
      assert.match(markup, /role="tablist"/);
      assert.equal((markup.match(/role="tab"/g) ?? []).length, 7);
      assert.equal((markup.match(/role="tabpanel"/g) ?? []).length, 1);
      assert.match(markup, /id="candidate-tab-summary"[^>]*aria-selected="true"/);
      const labels = locale === "pl"
        ? ["Podsumowanie", "Obserwacja", "Dane rynkowe", "Filtry", "Bezpieczeństwo", "Analiza AI", "Dane i źródła"]
        : expected.en;
      for (const label of labels) assert.match(markup, new RegExp(escapeRegExp(label)));
      assert.doesNotMatch(markup, /Wybierz moduł|Choose a module|candidate-(?:context|summary|layer)-column|candidate-layer-body/);
      assert.doesNotMatch(markup, /id="market-heading"|id="filters-heading"|id="security-heading"/);
    }
  });

  it("switches Market and AI inside the same single panel and removes prior full content", async () => {
    const originalFetch = globalThis.fetch;
    const originalActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    let localApiRequests = 0;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      localApiRequests += 1;
      return offlineFetch(input);
    }) as typeof fetch;
    let renderer: ReturnType<typeof create> | undefined;
    try {
      await act(async () => {
        renderer = create(<ProductLocaleProvider initialLocale="en"><CandidateDetailView candidate={candidateA} initialOwnerPromotionStatus={null} /></ProductLocaleProvider>);
      });
      const getTab = (id: string) => renderer!.root.find((node) => node.props.id === `candidate-tab-${id}`);
      assert.equal(getTab("summary").props["aria-selected"], true);

      await act(async () => { getTab("market").props.onClick(); });
      assert.equal(renderer!.root.findAll((node) => node.props.role === "tabpanel").length, 1);
      assert.equal(renderer!.root.find((node) => node.props["data-active-detail-tab"] !== undefined).props["data-active-detail-tab"], "market");
      assert.equal(getTab("market").props["aria-selected"], true);
      assert.match(renderedText(renderer!), /Market data/);
      assert.doesNotMatch(renderedText(renderer!), /The essential answers about the token/);

      await act(async () => { getTab("ai").props.onClick(); });
      assert.equal(renderer!.root.findAll((node) => node.props.role === "tabpanel").length, 1);
      assert.equal(renderer!.root.find((node) => node.props["data-active-detail-tab"] !== undefined).props["data-active-detail-tab"], "ai");
      assert.equal(getTab("ai").props["aria-selected"], true);
      assert.match(renderedText(renderer!), /AI analysis/);
      assert.doesNotMatch(activePanelText(renderer!), /Market data/);
      assert.ok(localApiRequests >= 1, "AI UI may read only its local API state");
    } finally {
      if (renderer) await act(async () => { renderer!.unmount(); });
      globalThis.fetch = originalFetch;
      globalThis.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
    }
  });

  it("returns to Summary when the selected token changes", async () => {
    const originalFetch = globalThis.fetch;
    const originalActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    globalThis.fetch = offlineFetch;
    let renderer: ReturnType<typeof create> | undefined;
    try {
      await act(async () => {
        renderer = create(<ProductLocaleProvider initialLocale="en"><CandidateDetailView candidate={candidateA} initialOwnerPromotionStatus={null} /></ProductLocaleProvider>);
      });
      await act(async () => { renderer!.root.find((node) => node.props.id === "candidate-tab-market").props.onClick(); });
      assert.equal(renderer!.root.find((node) => node.props["data-active-detail-tab"] !== undefined).props["data-active-detail-tab"], "market");
      await act(async () => {
        renderer!.update(<ProductLocaleProvider initialLocale="en"><CandidateDetailView candidate={candidateB} initialOwnerPromotionStatus={null} /></ProductLocaleProvider>);
      });
      assert.equal(renderer!.root.find((node) => node.props["data-active-detail-tab"] !== undefined).props["data-active-detail-tab"], "summary");
      assert.match(renderedText(renderer!), /NEXT/);
      assert.doesNotMatch(activePanelText(renderer!), /Market data/);
    } finally {
      if (renderer) await act(async () => { renderer!.unmount(); });
      globalThis.fetch = originalFetch;
      globalThis.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
    }
  });

  it("restores token identity and tab from URL, including Back and Forward history", async () => {
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
    const history = createFakeHistory(`http://127.0.0.1:5173/?chain=base&contract=${ADDRESS_A}&detail=summary#candidate-detail`);
    Object.defineProperty(globalThis, "window", { configurable: true, value: history.window });
    try {
      assert.deepEqual(resolveRouteTokenIdentity(), { chain: "base", contract_address: ADDRESS_A });
      assert.equal(resolveDetailTab(), "summary");
      writeCandidateDetailRoute({ chain: "base", contract_address: ADDRESS_A }, "market");
      writeCandidateDetailRoute({ chain: "base", contract_address: ADDRESS_A }, "ai");
      assert.equal(resolveDetailTab(), "ai");
      history.back();
      assert.equal(resolveDetailTab(), "market");
      history.forward();
      assert.equal(resolveDetailTab(), "ai");
      history.replace(`http://127.0.0.1:5173/?chain=base&contract=${ADDRESS_A}&detail=unsupported#candidate-detail`);
      assert.equal(resolveDetailTab(), "summary");

      const app = await source("src/ProductApp.tsx");
      assert.match(app, /addEventListener\("popstate", handlePopState\)/);
      assert.match(app, /setActiveDetailTab\(resolveDetailTab\(\)\)/);
      assert.match(app, /writeCandidateDetailRoute\(identity, "summary"\)/);
    } finally {
      restoreProperty("window", originalWindow);
    }
  });

  it("copies contract and pair addresses from Data and sources", async () => {
    const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
    const originalActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
    const copied: string[] = [];
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: { clipboard: { writeText: async (value: string) => { copied.push(value); } } } });
    Object.defineProperty(globalThis, "window", { configurable: true, value: { setTimeout, clearTimeout } });
    let renderer: ReturnType<typeof create> | undefined;
    try {
      await act(async () => {
        renderer = create(<ProductLocaleProvider initialLocale="en"><CandidateDetailView candidate={candidateA} initialActiveTab="data" initialOwnerPromotionStatus={null} /></ProductLocaleProvider>);
      });
      const contractButtons = renderer!.root.findAll((node) => node.props["aria-label"] === "Copy contract address");
      const pairButton = renderer!.root.find((node) => node.props["aria-label"] === "Copy pair address");
      await act(async () => {
        contractButtons.at(-1)!.props.onClick();
        pairButton.props.onClick();
        await Promise.resolve();
      });
      assert.deepEqual(copied, [ADDRESS_A, ADDRESS_B]);
    } finally {
      if (renderer) await act(async () => { renderer!.unmount(); });
      restoreProperty("navigator", originalNavigator);
      restoreProperty("window", originalWindow);
      globalThis.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
    }
  });

  it("uses full desktop width and mobile-safe horizontal tab scrolling without page overflow", async () => {
    const css = await source("src/index.css");
    assert.match(css, /\.token-detail-workspace\s*\{[\s\S]*?grid-template-rows: auto auto minmax\(0, 1fr\);[\s\S]*?width: 100%/);
    assert.match(css, /\.token-detail-tabpanel\s*\{[\s\S]*?width: 100%;[\s\S]*?overflow-y: auto/);
    assert.match(css, /\.token-detail-tabs\s*\{[\s\S]*?overflow-x: auto/);
    assert.match(css, /@media \(max-width: 760px\)[\s\S]*?html,[\s\S]*?overflow-x: hidden/);
    assert.match(css, /\.token-detail-tabs \[role="tab"\][\s\S]*?min-height: 44px/);
    assert.doesNotMatch(css, /\.column-workspace-section|\.candidate-detail-workspace|\.candidate-context-column|\.candidate-layer-column/);
  });

  it("ships one safe owner-review tab at Summary with zero provider-call opt-ins", async () => {
    const launcher = await readFile(resolve(process.cwd(), "..", "..", "scripts", "win", "start-tabbed-detail-review.cmd"), "utf8");
    const resolver = await source("scripts/resolveTabbedDetailReviewUrl.ts");
    assert.match(launcher, /start-product-radar-review\.cmd" --candidate-detail --no-open/);
    assert.equal((launcher.match(/^start ""/gm) ?? []).length, 1);
    assert.match(launcher, /CRYPTO_EDGE_AI_RESEARCH_PROVIDER=DISABLED/);
    assert.match(launcher, /OPENAI_API_KEY=/);
    assert.doesNotMatch(launcher, /collect:internal-beta|scanner:persist:live|ALLOW_LIVE_PROVIDER_CALLS=1|CRYPTO_EDGE_ALLOW_LIVE_SOURCE_CHECK=1|--apply/i);
    assert.match(resolver, /api\/scanner\/latest/);
    assert.match(resolver, /resolveTokenIdentity/);
    assert.match(resolver, /searchParams\.set\("detail", "summary"\)/);
    assert.doesNotMatch(resolver, /fixture|PERSISTABLE_SCANNER_SAMPLE|MockCandidate/);
  });
});

describe("UX.3 client header and UX.4 provider-neutral AI", () => {
  it("keeps only the data update, language switch and refresh action in the client header", () => {
    const markup = render("en", <ProductWorkspaceShell
      navItems={[]}
      activeSection="candidate-results"
      onSectionChange={() => undefined}
      onSendFeedback={() => undefined}
      loading={false}
      runtimeMode="INTERNAL_BETA"
      resolvedSource="real-output"
      runId="owner-only-run"
      generatedAt="2026-07-29T12:00:00.000Z"
      ageSeconds={60}
      freshnessStatus="FRESH"
      viewRefreshedAt="2026-07-29T12:01:00.000Z"
      sourceIds={["dexscreener"]}
      sourceHealth={resolveProductSourceHealth({ metadata: null, readiness: readyReadiness(), sourceIds: ["dexscreener"] })}
      readiness={readyReadiness()}
      onRefresh={() => undefined}
    ><div /></ProductWorkspaceShell>);
    const header = markup.slice(markup.indexOf("<header"), markup.indexOf("</header>") + 9);
    assert.match(header, /Crypto Edge AI/);
    assert.match(header, /Last updated/);
    assert.match(header, /Refresh view/);
    assert.match(header, />EN<|>PL</);
    assert.doesNotMatch(header, /API connectivity|Snapshot freshness|Data status|Sources|Technical details|Environment|Run ID|Send feedback/);
  });

  it("keeps client AI provider-neutral while technical model data remains server-side", async () => {
    const lookup: AIResearchBriefLookup = {
      schema_version: "ai_research_lookup_v1",
      availability: "PROVIDER_DISABLED",
      provider_mode: "OPENAI",
      brief: null,
      retry_after_seconds: null,
      error_code: null,
    };
    const client = render("en", <AIResearchSection chain="base" contractAddress={ADDRESS_A} symbol="PASS" name="Pass" initialLookup={lookup} mode="summary" />);
    assert.match(client, /AI analysis is currently unavailable/);
    assert.doesNotMatch(client, /OpenAI|gpt-5-mini|provider mode|PROVIDER_DISABLED/i);

    const canvas = await source("src/components/AIResearchBriefCanvas.tsx");
    const handler = await source("server/scannerApiHandler.ts");
    const worker = await source("server/aiResearchWorker.ts");
    assert.match(canvas, /reviewMetrics && !brief\.render_preview/);
    assert.doesNotMatch(canvas, /brief\.model/);
    assert.match(handler, /review-metrics[\s\S]*isLocalOwnerRequest/);
    assert.match(worker, /provider_mode: provider\.mode/);
    assert.match(worker, /model_id: provider\.model/);
  });
});

function render(locale: ProductLocale, node: React.ReactNode): string {
  return renderToStaticMarkup(<ProductLocaleProvider initialLocale={locale}>{node}</ProductLocaleProvider>);
}

function readyReadiness() {
  return {
    status: "ready" as const,
    ready: true,
    scanner: { ready: true, reason_code: null },
    context: { ready: true, reason_code: null },
    discovery: {
      new_emerging: { ready: true, reason_code: null },
      established: { ready: true, reason_code: null },
    },
    reason_codes: [],
  };
}

async function offlineFetch(input: RequestInfo | URL): Promise<Response> {
  const url = String(input);
  if (url.startsWith("/api/v1/ai-analyses/result?")) {
    return new Response(JSON.stringify({
      schema_version: "ai_research_lookup_v1",
      availability: "ABSENT",
      provider_mode: "DISABLED",
      brief: null,
      retry_after_seconds: null,
      error_code: null,
    }), { status: 200, headers: { "content-type": "application/json" } });
  }
  return new Response("{}", { status: 404, headers: { "content-type": "application/json" } });
}

function createFakeHistory(initialHref: string) {
  const entries = [initialHref];
  let index = 0;
  const location = { href: "", search: "", hash: "" };
  const apply = (href: string) => {
    const url = new URL(href);
    location.href = url.toString();
    location.search = url.search;
    location.hash = url.hash;
  };
  apply(initialHref);
  const windowValue = {
    location,
    history: {
      pushState: (_data: unknown, _unused: string, url: URL | string) => {
        entries.splice(index + 1);
        entries.push(String(url));
        index = entries.length - 1;
        apply(entries[index]!);
      },
    },
  };
  return {
    window: windowValue,
    back: () => { if (index > 0) apply(entries[--index]!); },
    forward: () => { if (index < entries.length - 1) apply(entries[++index]!); },
    replace: apply,
  };
}

async function source(path: string): Promise<string> {
  return readFile(resolve(process.cwd(), path), "utf8");
}

function renderedText(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(renderedText).join("");
  if (value && typeof value === "object" && "children" in value) return renderedText((value as { children?: unknown }).children);
  if (value && typeof value === "object" && "toJSON" in value) return renderedText((value as { toJSON: () => unknown }).toJSON());
  return "";
}

function activePanelText(renderer: ReturnType<typeof create>): string {
  return renderedText(renderer.root.find((node) => node.props.role === "tabpanel"));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function restoreProperty(name: string, descriptor: PropertyDescriptor | undefined) {
  if (descriptor) Object.defineProperty(globalThis, name, descriptor);
  else Reflect.deleteProperty(globalThis, name);
}
