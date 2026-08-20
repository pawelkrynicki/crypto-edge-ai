import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import React, { useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import TestRenderer from "react-test-renderer";
import { mapPersistableScannerOutputToUiCandidates } from "../src/adapters/scannerOutputAdapter.js";
import { CandidateDetailView } from "../src/components/CandidateDetailView.js";
import { ExternalVerificationLinksView } from "../src/components/ExternalVerificationLinksView.js";
import { VerificationTokenBrowser } from "../src/components/VerificationTokenBrowser.js";
import { PERSISTABLE_SCANNER_SAMPLE } from "../src/fixtures/persistableScannerSample.js";
import { ProductLocaleProvider } from "../src/productI18n.js";

void React;

const { act, create } = TestRenderer;
const candidate = mapPersistableScannerOutputToUiCandidates(PERSISTABLE_SCANNER_SAMPLE)[0]!;
const identity = `${candidate.chain}:${candidate.contractAddress}`;
const followUpCandidate = {
  entry_id: "fup_efec70c089b1dfe9",
  chain: "bsc",
  contract_address: "0xe9bc5c6a86caa44fd7b469bf3cc7c563e4f77777",
  display_name: "Giggle Mascot",
  symbol: "Max",
  pair_address: "0xa2b1926Cb477e92445Cf70602f1A7200361F761D",
  lifecycle_status: "MATURING" as const,
  pair_age: 16,
  first_seen_at: "2026-08-01T07:47:39.000Z",
  last_seen_at: "2026-08-17T12:40:12.000Z",
  last_checked_at: "2026-08-17T13:32:08.630Z",
  market_observed_at: "2026-08-17T13:32:08.630Z",
  next_check_at: "2026-08-31T09:47:39.000Z",
  completed_checkpoints: [1, 3, 7, 14],
  market_metrics: {
    price_usd: 0.002002,
    market_cap_usd: 2_002_830,
    fdv_usd: 2_002_829,
    liquidity_usd: 156_562.6,
    volume_24h_usd: 737_569.94,
    volume_market_cap_ratio: 0.36826387661459,
  },
  filter_status: "passed_basic_filter" as const,
  filter_reasons: ["volume_market_cap_ratio_outside_sweet_spot_5_30_percent"],
  security_status: "PARTIAL",
  missing_data: ["honeypot_status", "liquidity_locked", "top_10_wallets_pct", "honeypot_source"],
  established_membership: false,
  next_review_step: "WAIT_FOR_NEXT_CHECKPOINT" as const,
};

describe("Verification drawer tabs", () => {
  it("opens from the Verification list, defaults to Identity, and exposes the six required tabs", async () => {
    const renderer = await render(<VerificationBrowserHarness />);
    const listToken = renderer.root.findByProps({ "data-verification-token": identity });

    await act(async () => { listToken.props.onClick(); });

    assert.equal(renderer.root.findAllByProps({ "data-token-detail-drawer": "true" }).length, 1);
    const tabs = renderer.root.findAll((node) => node.props.role === "tab");
    assert.deepEqual(tabs.map((tab) => tab.children.join("")), ["Tożsamość", "Dane rynkowe", "Filtry", "Bezpieczeństwo", "Dane i źródła", "Decyzja weryfikacyjna"]);
    assert.equal(renderer.root.findByProps({ id: "verification-tab-identity" }).props["aria-selected"], true);
    assert.equal(renderer.root.findByProps({ id: "verification-panel-identity" }).props.role, "tabpanel");
  });

  it("switches a single active panel while retaining the selected token identity", async () => {
    const renderer = await render(<VerificationBrowserHarness selected />);
    assert.match(JSON.stringify(renderer.toJSON()), new RegExp(candidate.contractAddress));

    await act(async () => { renderer.root.findByProps({ id: "verification-tab-market" }).props.onClick(); });

    assert.equal(renderer.root.findByProps({ id: "verification-tab-market" }).props["aria-selected"], true);
    assert.equal(renderer.root.findAllByProps({ id: "verification-panel-identity" }).length, 0);
    assert.equal(renderer.root.findByProps({ id: "verification-panel-market" }).props.role, "tabpanel");
    assert.match(JSON.stringify(renderer.toJSON()), new RegExp(candidate.contractAddress));
  });

  it("presents manual-verification verdicts in Polish and English without exposing backend enums", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      if (String(input).startsWith("/api/manual-verification?")) return response({ schema_version: "manual_verification_lookup_v1", record: savedRecord() });
      return new Response("{}", { status: 404, headers: { "content-type": "application/json" } });
    }) as typeof fetch;

    try {
      const polish = await render(<VerificationDecisionLocaleHarness locale="pl" />);
      await act(async () => { await flushPromises(); });
      const polishText = visibleText(polish.toJSON());
      for (const label of ["Zweryfikowany", "Potrzebne dodatkowe dane", "Krytyczne ryzyko", "Odrzuć"]) assert.match(polishText, new RegExp(label));
      assert.doesNotMatch(polishText, /\b(?:VERIFIED|NEEDS_MORE_DATA|CRITICAL_RISK|REJECT)\b/);
      await act(async () => { polish.unmount(); });

      const english = await render(<VerificationDecisionLocaleHarness locale="en" />);
      await act(async () => { await flushPromises(); });
      const englishText = visibleText(english.toJSON());
      for (const label of ["Verified", "Needs more data", "Critical risk", "Reject"]) assert.match(englishText, new RegExp(label));
      assert.doesNotMatch(englishText, /\b(?:VERIFIED|NEEDS_MORE_DATA|CRITICAL_RISK|REJECT)\b/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("keeps Follow-up verification data tied to its LKG snapshot and exposes only approved manual links", () => {
    const market = followUpMarkup("market");
    const data = followUpMarkup("data");
    const filters = followUpMarkup("filters");
    const security = followUpMarkup("security");

    for (const markup of [market, data]) {
      assert.match(markup, /17\.08\.2026, 15:32/);
      assert.doesNotMatch(markup, /17\.08\.2026, 14:40|20\.08\.2026/);
    }
    assert.match(market, /Dane aktualne na/);
    assert.match(data, /Brak informacji o źródle/);
    assert.doesNotMatch(data, />Follow-up</);
    assert.match(data, /https:\/\/dexscreener\.com\/bsc\/0xa2b1926Cb477e92445Cf70602f1A7200361F761D/);
    assert.match(data, /https:\/\/honeypot\.is\/\?address=0xe9bc5c6a86caa44fd7b469bf3cc7c563e4f77777/);
    assert.match(data, /Źródło niedostępne/);

    assert.match(filters, /Wolumen \/ kapitalizacja[\s\S]*Spełniony[\s\S]*Uwaga: poza preferowanym zakresem 5–30%\./);
    assert.doesNotMatch(filters, /Wolumen \/ kapitalizacja[\s\S]*Niespełniony/);

    const decision = followUpMarkup("decision");
    assert.match(security, /<span>Honeypot<\/span><strong>Brak wyniku/);
    assert.match(security, /<span>Blokada płynności<\/span><strong>Brak danych/);
    assert.match(security, /<span>Udział Top 10 portfeli<\/span><strong>Brak danych/);
    for (const markup of [security, decision]) {
      assert.doesNotMatch(markup, /honeypot_source|honeypot_status|liquidity_locked|top_10_wallets_pct|PARTIAL|MANUAL VERIFICATION REQUIRED/);
    }
    for (const item of ["Honeypot — Brak wyniku", "Blokada płynności — Brak danych", "Udział Top 10 portfeli — Brak danych"]) assert.match(decision, new RegExp(item));
    assert.match(security, /Dane częściowe/);
    assert.match(security, /Wymaga ręcznej weryfikacji/);
  });

  it("leaves an unsaved Follow-up decision unselected and removes internal Polish copy", () => {
    const decision = followUpMarkup("decision");

    assert.match(decision, /Brak zapisanej decyzji/);
    assert.match(decision, /Twoja notatka/);
    assert.match(decision, /Szczegółów tokena/);
    assert.doesNotMatch(decision, /aria-checked="true"|owner|Candidate Detail|Krótka notatka ownera/);
  });

  it("stacks token heading, metadata and tabs without letting long metadata overlap the drawer tabs", async () => {
    const longCandidate = {
      ...candidate,
      name: "Token with a deliberately long verification display name for header regression coverage",
      contractAddress: `0x${"abcdef0123456789".repeat(10)}`,
    };
    const renderer = await render(<VerificationBrowserHarness selected token={longCandidate} />);
    const drawer = renderer.root.findByProps({ "data-token-detail-drawer": "true" });
    const sections = drawer.children.filter((node) => typeof node !== "string" && node.props["data-token-drawer-section"]);

    assert.deepEqual(sections.map((node) => node.props["data-token-drawer-section"]), ["token-header", "metadata", "tabs"]);
    assert.match(JSON.stringify(renderer.toJSON()), new RegExp(longCandidate.contractAddress));
    for (const tab of ["identity", "market", "filters", "security", "data", "decision"]) {
      await act(async () => { renderer.root.findByProps({ id: `verification-tab-${tab}` }).props.onClick(); });
    }

    const css = await readFile(resolve(process.cwd(), "src", "index.css"), "utf8");
    assert.match(css, /\.verification-token-drawer > \.detail-tab-bar[\s\S]*padding-top: 14px/);
    assert.match(css, /\.verification-token-drawer > \.detail-header-information[\s\S]*width: 100%/);
    assert.match(css, /\.verification-token-drawer > \.detail-header-information \.research-context-chip code[\s\S]*overflow-wrap: anywhere/);
    assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.verification-token-drawer > \.detail-header-information \.detail-header-meta \{ display: grid; grid-template-columns: minmax\(0, 1fr\); \}/);
    assert.match(css, /\.verification-token-browser[\s\S]*max-width:\s*100%[\s\S]*min-width:\s*0/);
    const verificationHeaderCss = css.slice(css.indexOf("/* Verification keeps"), css.indexOf("@keyframes verification-drawer-enter"));
    assert.doesNotMatch(verificationHeaderCss, /position:\s*absolute|margin-[^:]+:\s*-\d/);
  });

  it("requires an explicit CAMP_USER save and keeps the saved decision in Candidate Detail without provider or OpenAI calls", async () => {
    const originalFetch = globalThis.fetch;
    const externalCalls: string[] = [];
    const writes: Record<string, unknown>[] = [];
    let persisted: ReturnType<typeof needsMoreRecord> | null = null;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (/provider|openai/i.test(url)) externalCalls.push(url);
      if (url.startsWith("/api/manual-verification?")) {
        return response({ schema_version: "manual_verification_lookup_v1", record: persisted });
      }
      if (url === "/api/manual-verification" && init?.method === "POST") {
        const payload = JSON.parse(String(init.body ?? "{}")) as Record<string, unknown>;
        writes.push(payload);
        persisted = needsMoreRecord(String(payload.note));
        return response({ status: "SAVED", record: persisted, audit_created: true });
      }
      return new Response("{}", { status: 404, headers: { "content-type": "application/json" } });
    }) as typeof fetch;

    try {
      const renderer = await render(<DecisionToDetailHarness />);
      await act(async () => { await flushPromises(); });
      const textarea = renderer.root.findByType("textarea");
      await act(async () => { textarea.props.onChange({ target: { value: "Identity checked" } }); });
      assert.equal(renderer.root.findAll((node) => node.props.role === "radio").length, 4);
      const saveButton = button(renderer, "Zapisz wynik weryfikacji");
      assert.equal(saveButton.props.disabled, true, "no verdict keeps Save disabled");
      await act(async () => { button(renderer, "Potrzebne dodatkowe dane").props.onClick(); });
      assert.match(visibleText(renderer.toJSON()), /Werdykt wskaże, że przed decyzją potrzebne są dodatkowe dane\./);
      assert.deepEqual(writes, [], "selecting a draft never writes");
      assert.equal(button(renderer, "Zapisz wynik weryfikacji").props.disabled, false);
      await act(async () => { button(renderer, "Zapisz wynik weryfikacji").props.onClick(); await flushPromises(); });

      assert.deepEqual(writes, [{ chain: candidate.chain, contract_address: candidate.contractAddress, verdict: "NEEDS_MORE_DATA", note: "Identity checked" }]);
      assert.equal(renderer.root.findAllByProps({ "data-verification-verdict": "NEEDS_MORE_DATA" }).length >= 2, true);
      assert.match(visibleText(renderer.toJSON()), /Zapisano wynik weryfikacji: Potrzebne dodatkowe dane/);
      assert.match(visibleText(renderer.toJSON()), /Identity checked/);
      assert.deepEqual(externalCalls, []);

      await act(async () => { renderer.unmount(); });
      const refreshed = await render(<DecisionToDetailHarness />);
      await act(async () => { await flushPromises(); });
      assert.match(visibleText(refreshed.toJSON()), /Potrzebne dodatkowe dane/);
      assert.match(visibleText(refreshed.toJSON()), /Identity checked/);
      await act(async () => { refreshed.unmount(); });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("closes back to the unchanged list and keeps provider/OpenAI calls at zero while tabs open", async () => {
    const originalFetch = globalThis.fetch;
    const calls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.startsWith("/api/manual-verification?")) return response({ schema_version: "manual_verification_lookup_v1", record: null });
      return new Response("{}", { status: 404, headers: { "content-type": "application/json" } });
    }) as typeof fetch;

    try {
      const renderer = await render(<VerificationBrowserHarness selected />);
      await act(async () => { await flushPromises(); });
      for (const tab of ["identity", "market", "filters", "security", "data", "decision"]) {
        await act(async () => { renderer.root.findByProps({ id: `verification-tab-${tab}` }).props.onClick(); });
      }
      await act(async () => { renderer.root.findByProps({ "aria-label": "Zamknij kartę tokena" }).props.onClick(); });

      assert.equal(renderer.root.findAllByProps({ "data-token-detail-drawer": "true" }).length, 0);
      assert.equal(renderer.root.findAllByProps({ "data-verification-token": identity }).length, 1);
      assert.equal(calls.some((url) => /provider|openai/i.test(url)), false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("keeps the list narrow and gives every Verification drawer panel readable desktop and mobile geometry", async () => {
    const css = await readFile(resolve(process.cwd(), "src", "index.css"), "utf8");
    const component = await readFile(resolve(process.cwd(), "src", "components", "ExternalVerificationLinksView.tsx"), "utf8");
    assert.match(component, /TokenDetailTabs/);
    assert.match(css, /\.verification-token-browser[\s\S]*grid-template-columns:\s*clamp\(240px, 22%, 280px\) minmax\(0, 1fr\)/);
    assert.match(css, /@media \(max-width: 1180px\)[\s\S]*\.verification-token-browser \{ grid-template-columns: 220px minmax\(0, 1fr\);/);
    assert.match(component, /verification-identity-grid/);
    assert.match(component, /verification-contract-panel/);
    assert.match(css, /\.verification-tab-content \.verification-research-section > header[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\)/);
    assert.match(css, /\.verification-identity-panel > \.verification-identity-grid[\s\S]*repeat\(4, minmax\(150px, 1fr\)\)/);
    assert.match(css, /\.verification-identity-panel > \.verification-contract-panel[\s\S]*grid-column: 1 \/ -1/);
    assert.match(component, /verification-decision-options/);
    assert.match(component, /verification-decision-note/);
    assert.match(css, /\.verification-decision-options[\s\S]*repeat\(2, minmax\(0, 1fr\)\)/);
    assert.match(css, /\.verification-decision-note textarea[\s\S]*min-height: 112px/);
    assert.match(css, /\.token-detail-tabs[\s\S]*overflow-x:\s*auto/);
    assert.match(css, /\.verification-token-browser[\s\S]*max-width:\s*100%[\s\S]*min-width:\s*0/);
    assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.verification-token-browser \{ grid-template-columns: 1fr;/);
    assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.verification-decision-options[\s\S]*grid-template-columns: 1fr/);
  });
});

function VerificationBrowserHarness({ selected = false, token = candidate }: { selected?: boolean; token?: typeof candidate }) {
  const [selection, setSelection] = useState(selected ? token : null);
  return <ProductLocaleProvider initialLocale="pl"><VerificationTokenBrowser candidates={[token]} followUpEntries={[]} selectedCandidate={selection} onSelectToken={(selectedToken) => setSelection(selectedToken as typeof candidate)} onCloseToken={() => setSelection(null)} /></ProductLocaleProvider>;
}

function DecisionToDetailHarness() {
  const [record, setRecord] = useState<ReturnType<typeof savedRecord> | null>(null);
  return <ProductLocaleProvider initialLocale="pl"><ExternalVerificationLinksView candidate={candidate} initialActiveTab="decision" onVerificationSaved={setRecord} /><CandidateDetailView candidate={candidate} initialActiveTab="security" initialManualVerification={record} /></ProductLocaleProvider>;
}

function VerificationDecisionLocaleHarness({ locale }: { locale: "pl" | "en" }) {
  return <ProductLocaleProvider initialLocale={locale}><ExternalVerificationLinksView candidate={candidate} initialActiveTab="decision" /></ProductLocaleProvider>;
}

function followUpMarkup(initialActiveTab: "market" | "filters" | "security" | "data" | "decision") {
  return renderToStaticMarkup(<ProductLocaleProvider initialLocale="pl"><ExternalVerificationLinksView followUp={followUpCandidate} initialActiveTab={initialActiveTab} /></ProductLocaleProvider>);
}

async function render(node: React.ReactNode): Promise<ReturnType<typeof create>> {
  let renderer: ReturnType<typeof create> | undefined;
  await act(async () => { renderer = create(node); await flushPromises(); });
  return renderer!;
}

function button(renderer: ReturnType<typeof create>, label: string) {
  const found = renderer.root.findAllByType("button").find((item) => item.children.join("") === label);
  assert.ok(found, `Missing button: ${label}`);
  return found;
}

function savedRecord() {
  return { chain: candidate.chain, contract_address: candidate.contractAddress, display_name: candidate.name, symbol: candidate.symbol, verdict: "VERIFIED" as const, note: "Identity checked", checked_at: "2026-08-02T12:00:00.000Z", missing_data: [], available_data: ["chain", "contract_address"] };
}

function needsMoreRecord(note = "Identity checked") {
  return { chain: candidate.chain, contract_address: candidate.contractAddress, display_name: candidate.name, symbol: candidate.symbol, verdict: "NEEDS_MORE_DATA" as const, note, checked_at: "2026-08-02T12:00:00.000Z", missing_data: [], available_data: ["chain", "contract_address"] };
}

function response(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function visibleText(node: unknown): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(visibleText).join(" ");
  if (node && typeof node === "object" && "children" in node) return visibleText((node as { children?: unknown }).children);
  return "";
}
