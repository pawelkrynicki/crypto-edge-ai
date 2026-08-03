import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import React, { useState } from "react";
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

  it("saves the Verification decision into Candidate Detail without provider or OpenAI calls", async () => {
    const originalFetch = globalThis.fetch;
    const externalCalls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (/provider|openai/i.test(url)) externalCalls.push(url);
      if (url.startsWith("/api/owner-operations/manual-verification/status")) return response(ownerStatus());
      if (url === "/api/owner-operations/manual-verification-preview") return response({ ...ownerStatus(), preview_id: "preview-12345678", created_at: "2026-08-02T12:00:00.000Z", expires_at: "2026-08-02T12:10:00.000Z", one_time: true, verdict: "VERIFIED", note: "Identity checked", action_plan: "SAVE" });
      if (url === "/api/owner-operations/manual-verification") return response({ status: "SAVED", record: savedRecord(), audit_created: true });
      return new Response("{}", { status: 404, headers: { "content-type": "application/json" } });
    }) as typeof fetch;

    try {
      const renderer = await render(<DecisionToDetailHarness />);
      await act(async () => { await flushPromises(); });
      const textarea = renderer.root.findByType("textarea");
      await act(async () => { textarea.props.onChange({ target: { value: "Identity checked" } }); });
      assert.equal(renderer.root.findAll((node) => node.props.role === "radio").length, 4);
      await act(async () => { button(renderer, "Zapisz decyzję").props.onClick(); await flushPromises(); });
      const confirmation = renderer.root.findByProps({ "aria-label": "Potwierdzenie tożsamości" });
      await act(async () => { confirmation.props.onChange({ target: { value: identity } }); });
      const checkbox = renderer.root.findAllByType("input").find((input) => input.props.type === "checkbox");
      assert.ok(checkbox);
      await act(async () => { checkbox.props.onChange({ target: { checked: true } }); });
      await act(async () => { button(renderer, "Zapisz status weryfikacji").props.onClick(); await flushPromises(); });

      assert.equal(renderer.root.findAllByProps({ "data-verification-verdict": "VERIFIED" }).length >= 2, true);
      assert.deepEqual(externalCalls, []);
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
      if (url.startsWith("/api/owner-operations/manual-verification/status")) return response(ownerStatus());
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

function VerificationBrowserHarness({ selected = false }: { selected?: boolean }) {
  const [selection, setSelection] = useState(selected ? candidate : null);
  return <ProductLocaleProvider initialLocale="pl"><VerificationTokenBrowser candidates={[candidate]} followUpEntries={[]} selectedCandidate={selection} onSelectToken={(token) => setSelection(token as typeof candidate)} onCloseToken={() => setSelection(null)} /></ProductLocaleProvider>;
}

function DecisionToDetailHarness() {
  const [record, setRecord] = useState<ReturnType<typeof savedRecord> | null>(null);
  return <ProductLocaleProvider initialLocale="pl"><ExternalVerificationLinksView candidate={candidate} initialActiveTab="decision" onVerificationSaved={setRecord} /><CandidateDetailView candidate={candidate} initialActiveTab="security" initialManualVerification={record} /></ProductLocaleProvider>;
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

function ownerStatus() {
  return { mode: "ENABLED", owner_controls_visible: true, owner_actions_enabled: true, chain: candidate.chain, contract_address: candidate.contractAddress, display_name: candidate.name, symbol: candidate.symbol, current_layer: "NEW", missing_data: [], available_data: ["chain", "contract_address"], current_record: null } as const;
}

function savedRecord() {
  return { chain: candidate.chain, contract_address: candidate.contractAddress, display_name: candidate.name, symbol: candidate.symbol, verdict: "VERIFIED" as const, note: "Identity checked", checked_at: "2026-08-02T12:00:00.000Z", missing_data: [], available_data: ["chain", "contract_address"] };
}

function response(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
