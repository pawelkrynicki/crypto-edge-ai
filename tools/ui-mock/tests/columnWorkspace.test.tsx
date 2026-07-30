import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import TestRenderer from "react-test-renderer";
import { mapPersistableScannerOutputToUiCandidates } from "../src/adapters/scannerOutputAdapter.js";
import { AIResearchSection } from "../src/components/AIResearchSection.js";
import { CandidateDetailView } from "../src/components/CandidateDetailView.js";
import { ProductWorkspaceShell } from "../src/components/ProductWorkspaceShell.js";
import { PERSISTABLE_SCANNER_SAMPLE } from "../src/fixtures/persistableScannerSample.js";
import { ProductLocaleProvider, type ProductLocale } from "../src/productI18n.js";
import { resolveDetailLayer, resolveRouteTokenIdentity } from "../src/candidateDetailRoute.js";
import { resolveProductSourceHealth } from "../src/productSourceHealth.js";
import type { AIResearchBriefLookup } from "../src/types/aiResearchTypes.js";

void React;

const { act, create } = TestRenderer;
const ADDRESS_A = "0x1111111111111111111111111111111111111111";
const ADDRESS_B = "0x2222222222222222222222222222222222222222";
const baseCandidate = mapPersistableScannerOutputToUiCandidates(PERSISTABLE_SCANNER_SAMPLE)[0]!;
const candidateA = { ...baseCandidate, id: "base:a", chain: "base", contractAddress: ADDRESS_A, pairAddress: ADDRESS_B, addressIdentityVerified: true };
const candidateB = { ...candidateA, id: "base:b", symbol: "NEXT", name: "Next Token", contractAddress: ADDRESS_B };

describe("UX.2 column Candidate Detail workspace", () => {
  it("renders a compact summary with eight modules instead of every full section", () => {
    for (const locale of ["en", "pl"] as const) {
      const markup = render(locale, <CandidateDetailView candidate={candidateA} />);
      assert.match(markup, /candidate-detail-workspace is-summary/);
      assert.equal((markup.match(/data-detail-module=/g) ?? []).length, 8);
      assert.equal((markup.match(/product-detail-section/g) ?? []).length, 0);
      assert.match(markup, new RegExp(candidateA.symbol));
      assert.match(markup, new RegExp(ADDRESS_A));
      assert.match(markup, locale === "pl" ? /Wybierz moduł/ : /Choose a module/);
    }
  });

  it("opens exactly one active right-hand layer and keeps token context visible", () => {
    const markup = render("en", <CandidateDetailView candidate={candidateA} initialActiveLayer="market" />);
    assert.match(markup, /data-active-detail-layer="market"/);
    assert.equal((markup.match(/aria-pressed="true"/g) ?? []).length, 1);
    assert.equal((markup.match(/candidate-layer-body/g) ?? []).length, 1);
    assert.match(markup, /Market data/);
    assert.doesNotMatch(markup, /id="identity-heading"|id="filters-heading"|id="security-heading"/);
    assert.match(markup, new RegExp(candidateA.symbol));
  });

  it("resets an incompatible layer when the selected token changes", async () => {
    const originalFetch = globalThis.fetch;
    const originalActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    globalThis.fetch = offlineFetch;
    let renderer: ReturnType<typeof create> | undefined;
    try {
      await act(async () => {
        renderer = create(<ProductLocaleProvider initialLocale="en"><CandidateDetailView candidate={candidateA} /></ProductLocaleProvider>);
      });
      const market = renderer!.root.findAll((node) => node.props["data-detail-module"] === "market")[0]!;
      await act(async () => { market.props.onClick(); });
      assert.equal(renderer!.root.find((node) => node.props["data-active-detail-layer"] !== undefined).props["data-active-detail-layer"], "market");

      await act(async () => {
        renderer!.update(<ProductLocaleProvider initialLocale="en"><CandidateDetailView candidate={candidateB} /></ProductLocaleProvider>);
      });
      assert.equal(renderer!.root.find((node) => node.props["data-active-detail-layer"] !== undefined).props["data-active-detail-layer"], "summary");
      assert.match(renderedText(renderer!), /NEXT/);
      assert.doesNotMatch(renderedText(renderer!), /Market data/);
    } finally {
      if (renderer) await act(async () => { renderer!.unmount(); });
      globalThis.fetch = originalFetch;
      globalThis.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
    }
  });

  it("keeps contract and pair copy actions in the identity layer", () => {
    const markup = render("en", <CandidateDetailView candidate={candidateA} initialActiveLayer="identity" />);
    assert.match(markup, /Copy contract address/);
    assert.match(markup, /Copy pair address/);
    assert.match(markup, new RegExp(ADDRESS_A));
    assert.match(markup, new RegExp(ADDRESS_B));
  });

  it("ships desktop columns, narrow-desktop drawer, mobile sequencing and overflow guards", async () => {
    const css = await source("src/index.css");
    assert.match(css, /\.candidate-detail-workspace[\s\S]*grid-template-columns: minmax\(190px,[\s\S]*minmax\(360px/);
    assert.match(css, /\.candidate-workspace-column[\s\S]*overflow-y: auto/);
    assert.match(css, /@media \(max-width: 1200px\) and \(min-width: 761px\)[\s\S]*\.candidate-layer-column[\s\S]*position: fixed/);
    assert.match(css, /@media \(max-width: 760px\)[\s\S]*\.candidate-context-column \{ display: none; \}/);
    assert.match(css, /\.candidate-detail-workspace\.has-active-layer \.candidate-summary-column \{ display: none; \}/);
    assert.match(css, /html,[\s\S]*body,[\s\S]*#root,[\s\S]*overflow-x: hidden/);
    assert.match(css, /\.candidate-mobile-back[\s\S]*min-height: 44px/);
  });

  it("restores chain, contract address and one supported layer from the URL", () => {
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { location: { search: `?chain=base&contract=${ADDRESS_A}&detail=security` } },
    });
    try {
      assert.deepEqual(resolveRouteTokenIdentity(), { chain: "base", contract_address: ADDRESS_A });
      assert.equal(resolveDetailLayer(), "security");
      globalThis.window.location.search = `?chain=base&contract=${ADDRESS_A}&detail=unsupported`;
      assert.equal(resolveDetailLayer(), null);
    } finally {
      restoreProperty("window", originalWindow);
    }
  });

  it("ships a one-tab owner launcher using a supported identity from the current snapshot", async () => {
    const launcher = await readFile(resolve(process.cwd(), "..", "..", "scripts", "win", "start-column-workspace-review.cmd"), "utf8");
    const resolver = await source("scripts/resolveColumnWorkspaceReviewUrl.ts");
    assert.match(launcher, /start-product-radar-review\.cmd" --candidate-detail --no-open/);
    assert.equal((launcher.match(/^start ""/gm) ?? []).length, 1);
    assert.match(launcher, /CRYPTO_EDGE_AI_RESEARCH_PROVIDER=DISABLED/);
    assert.match(launcher, /OPENAI_API_KEY=/);
    assert.doesNotMatch(launcher, /collect:internal-beta|scanner:persist:live|ALLOW_LIVE_PROVIDER_CALLS=1|CRYPTO_EDGE_ALLOW_LIVE_SOURCE_CHECK=1|--apply/i);
    assert.match(resolver, /api\/scanner\/latest/);
    assert.match(resolver, /resolveTokenIdentity/);
    assert.match(resolver, /chain[\s\S]*contract/);
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

  it("renders nontechnical STALE, PARTIAL and unavailable alerts in content", () => {
    const partial = renderShellAlert("PARTIAL");
    const stale = renderShellAlert("STALE");
    const unavailable = renderShellAlert("UNAVAILABLE");
    assert.match(partial, /Some data is temporarily unavailable/);
    assert.match(stale, /Data may be out of date/);
    assert.match(unavailable, /Data is temporarily unavailable/);
    for (const markup of [partial, stale, unavailable]) {
      assert.doesNotMatch(markup, /SCANNER_|CONTEXT_|pointer|stack trace|provider mode|api\.openai\.com/i);
    }
  });

  it("keeps AI client copy provider-neutral while owner-only metrics retain technical model data", async () => {
    const lookup: AIResearchBriefLookup = {
      schema_version: "ai_research_lookup_v1",
      availability: "PROVIDER_DISABLED",
      provider_mode: "OPENAI",
      brief: null,
      retry_after_seconds: null,
      error_code: null,
    };
    const client = render("en", <AIResearchSection chain="base" contractAddress={ADDRESS_A} symbol="PASS" name="Pass" initialLookup={lookup} mode="summary" />);
    assert.match(client, /central analysis system is temporarily unavailable/i);
    assert.doesNotMatch(client, /OpenAI|gpt-5-mini|provider mode|PROVIDER_DISABLED/i);

    const canvas = await source("src/components/AIResearchBriefCanvas.tsx");
    const handler = await source("server/scannerApiHandler.ts");
    const worker = await source("server/aiResearchWorker.ts");
    assert.match(canvas, /reviewMetrics && !brief\.render_preview/);
    assert.match(canvas, /brief\.model/);
    assert.match(handler, /review-metrics[\s\S]*isLocalOwnerRequest/);
    assert.match(worker, /provider_mode: provider\.mode/);
    assert.match(worker, /model_id: provider\.model/);
  });
});

function render(locale: ProductLocale, node: React.ReactNode): string {
  return renderToStaticMarkup(<ProductLocaleProvider initialLocale={locale}>{node}</ProductLocaleProvider>);
}

function renderShellAlert(dataStatus: "STALE" | "PARTIAL" | "UNAVAILABLE"): string {
  const readiness = readyReadiness();
  const resolvedSource = dataStatus === "UNAVAILABLE" ? "unavailable" : "real-output";
  return render("en", <ProductWorkspaceShell
    navItems={[]}
    activeSection="candidate-results"
    onSectionChange={() => undefined}
    onSendFeedback={() => undefined}
    loading={false}
    runtimeMode="INTERNAL_BETA"
    resolvedSource={resolvedSource}
    runId={null}
    generatedAt="2026-07-29T12:00:00.000Z"
    ageSeconds={dataStatus === "STALE" ? 7200 : 60}
    freshnessStatus={dataStatus === "STALE" ? "STALE" : "FRESH"}
    viewRefreshedAt={null}
    sourceIds={["dexscreener"]}
    sourceHealth={dataStatus === "UNAVAILABLE"
      ? { status: "unavailable", detailSourceIds: [], basis: "unavailable" }
      : dataStatus === "PARTIAL"
        ? { status: "partial", detailSourceIds: ["dexscreener"], basis: "metadata" }
        : { status: "available", detailSourceIds: ["dexscreener"], basis: "metadata" }}
    readiness={readiness}
    automationStatus={{ data_status: dataStatus } as never}
    onRefresh={() => undefined}
  ><div /></ProductWorkspaceShell>);
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

function restoreProperty(name: string, descriptor: PropertyDescriptor | undefined) {
  if (descriptor) Object.defineProperty(globalThis, name, descriptor);
  else Reflect.deleteProperty(globalThis, name);
}
