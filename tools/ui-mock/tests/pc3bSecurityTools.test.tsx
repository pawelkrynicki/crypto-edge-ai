import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import TestRenderer from "react-test-renderer";
import { isSafeOfficialManualResearchUrl, resolveManualResearchTarget } from "../src/externalVerificationTargets.js";
import { ResearchChecklistDetail, ResearchChecklistSummary } from "../src/components/ResearchChecklist.js";
import { ExternalVerificationLinksView } from "../src/components/ExternalVerificationLinksView.js";
import { ProductLocaleProvider } from "../src/productI18n.js";
import { researchChecklistItemValue } from "../src/researchChecklistPresentation.js";
import { resolveResearchChecklist } from "../src/researchChecklistResolver.js";
import type { PersistableScannerOutput, UiTokenCandidate } from "../src/types/scannerTypes.js";
import { createResearchEvidenceRepository, ResearchEvidenceError } from "../server/researchEvidenceRepository.js";
import { createScannerApiHandler } from "../server/scannerApiHandler.js";

void React;

const { act, create } = TestRenderer;

const ADDRESS = "0x1111111111111111111111111111111111111111";
const PAIR = "0x2222222222222222222222222222222222222222";

test("PC.3B resolves only safe official browser targets and declares unsupported chains truthfully", () => {
  for (const [chain, path] of [["ethereum", "/ethereum"], ["eth", "/ethereum"], ["bsc", "/"], ["binance", "/"], ["base", "/base"]] as const) {
    const honeypot = resolveManualResearchTarget("honeypot", { chain, contractAddress: ADDRESS });
    assert.equal(honeypot.availability, "AVAILABLE", chain);
    assert.ok(honeypot.official_url, chain);
    const url = new URL(honeypot.official_url);
    assert.equal(url.hostname, "honeypot.is", chain);
    assert.equal(url.pathname, path, chain);
    assert.equal(url.searchParams.get("address"), ADDRESS, chain);
    assert.doesNotMatch(honeypot.official_url, /api\.honeypot\.is|\/v2\//i);
  }
  for (const chain of ["solana", "polygon", "arbitrum", "optimism"]) {
    const unsupported = resolveManualResearchTarget("honeypot", { chain, contractAddress: ADDRESS });
    assert.equal(unsupported.availability, "UNSUPPORTED_CHAIN", chain);
    assert.equal(unsupported.official_url, null, chain);
  }

  const sniffer = resolveManualResearchTarget("tokensniffer", { chain: "ethereum", contractAddress: ADDRESS });
  assert.equal(sniffer.availability, "MANUAL_SEARCH");
  assert.equal(new URL(sniffer.official_url!).hostname, "tokensniffer.com");
  const defi = resolveManualResearchTarget("defi_scanner", { chain: "bsc", contractAddress: ADDRESS });
  assert.equal(defi.availability, "MANUAL_SEARCH");
  assert.equal(new URL(defi.official_url!).hostname, "de.fi");
  assert.doesNotMatch(defi.official_url!, /defillama/i);
  for (const [chain, expectedChain] of [["ethereum", "eth"], ["eth", "eth"], ["bsc", "bsc"], ["binance", "bsc"], ["base", "base"], ["solana", "solana"], ["polygon", "polygon"], ["arbitrum", "arbitrum"]] as const) {
    const bubbles = resolveManualResearchTarget("bubblemaps", { chain, contractAddress: ADDRESS });
    assert.equal(bubbles.availability, "AVAILABLE", chain);
    assert.ok(bubbles.official_url, chain);
    const url = new URL(bubbles.official_url);
    assert.equal(url.protocol, "https:", chain);
    assert.equal(url.hostname, "v2.bubblemaps.io", chain);
    assert.equal(url.pathname, "/map", chain);
    assert.equal(url.searchParams.get("chain"), expectedChain, chain);
    assert.equal(url.searchParams.get("address"), ADDRESS, chain);
    assert.equal(url.searchParams.get("partnerId"), null, chain);
  }
  const unsupportedBubblemaps = resolveManualResearchTarget("bubblemaps", { chain: "optimism", contractAddress: ADDRESS });
  assert.equal(unsupportedBubblemaps.availability, "MANUAL_SEARCH");
  assert.equal(unsupportedBubblemaps.official_url, "https://v2.bubblemaps.io/");
  assert.equal(resolveManualResearchTarget("tokensniffer", { chain: "solana", contractAddress: ADDRESS }).availability, "UNSUPPORTED_CHAIN");
  assert.equal(resolveManualResearchTarget("defi_scanner", { chain: "solana", contractAddress: ADDRESS }).availability, "UNSUPPORTED_CHAIN");
  assert.equal(resolveManualResearchTarget("bubblemaps", { chain: "unknown", contractAddress: ADDRESS }).availability, "MANUAL_SEARCH");

  for (const unsafe of ["http://honeypot.is/", "javascript:alert(1)", "data:text/html,x", "file:///private", "mailto:test@example.com", "https://evil.example/"]) {
    assert.equal(isSafeOfficialManualResearchUrl(unsafe), false, `rejects ${unsafe}`);
  }
});

test("PC.3B maps private manual outcomes without changing automatic evidence", () => {
  const base = candidate();
  const unrecorded = resolveResearchChecklist(base);
  assert.equal(item(unrecorded, 3, "tokensniffer").state, "OPEN_EXTERNAL_TOOL");
  assert.equal(item(unrecorded, 3, "defi_scanner").state, "OPEN_EXTERNAL_TOOL");
  assert.equal(item(unrecorded, 4, "wallet_clustering").state, "OPEN_EXTERNAL_TOOL");
  assert.equal(item(unrecorded, 3, "honeypot").automatic_state, "AUTO_VERIFIED");

  const score49 = evidence(3, "tokensniffer", "RED_FLAG", { value_number: 49, source_tool: "TokenSniffer" });
  const score50 = evidence(3, "tokensniffer", "MANUAL_VERIFIED", { value_number: 50, source_tool: "TokenSniffer" });
  const score0 = evidence(3, "tokensniffer", "RED_FLAG", { value_number: 0, source_tool: "TokenSniffer" });
  const score100 = evidence(3, "tokensniffer", "MANUAL_VERIFIED", { value_number: 100, source_tool: "TokenSniffer" });
  const lowRisk = evidence(3, "honeypot", "MANUAL_VERIFIED", { value_text: "low_honeypot_risk", source_tool: "Honeypot.is" });
  const detected = evidence(3, "honeypot", "RED_FLAG", { value_text: "honeypot_detected", source_tool: "Honeypot.is" });
  const inconclusive = evidence(3, "honeypot", "MISSING_DATA", { value_text: "no_conclusive_result", source_tool: "Honeypot.is" });
  assert.equal(item(resolveResearchChecklist(base, [score49]), 3, "tokensniffer").state, "RED_FLAG");
  assert.equal(item(resolveResearchChecklist(base, [score50]), 3, "tokensniffer").state, "MANUAL_VERIFIED");
  assert.equal(item(resolveResearchChecklist(base, [score0]), 3, "tokensniffer").value_number, 0);
  assert.equal(item(resolveResearchChecklist(base, [score100]), 3, "tokensniffer").value_number, 100);
  assert.equal(item(resolveResearchChecklist(base, [lowRisk]), 3, "honeypot").state, "MANUAL_VERIFIED");
  assert.equal(item(resolveResearchChecklist(base, [detected]), 3, "honeypot").state, "RED_FLAG");
  assert.equal(item(resolveResearchChecklist(base, [inconclusive]), 3, "honeypot").state, "MISSING_DATA");
  assert.equal(item(resolveResearchChecklist(base, [evidence(4, "wallet_clustering", "RED_FLAG", { value_text: "strong_concentration_or_related_cluster", source_tool: "Bubblemaps" })]), 4, "wallet_clustering").state, "RED_FLAG");
  assert.equal(base.finalLabel, "WATCHLIST", "manual research does not mutate lifecycle-derived candidate data");
});

test("PC.3B keeps research evidence private and requires HTTPS", async (t) => {
  const root = await mkdtemp(resolve(tmpdir(), "crypto-edge-pc3b-"));
  const repository = await createResearchEvidenceRepository({ databaseFilePath: resolve(root, "research.sqlite") });
  t.after(async () => { repository.close(); await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 40 }); });
  repository.upsert({ actorId: "actor-user-a", chain: "base", contractAddress: ADDRESS, stepNumber: 3, itemKey: "tokensniffer", manualState: "MANUAL_VERIFIED", valueNumber: 80, sourceTool: "TokenSniffer" });
  assert.equal(repository.list("actor-user-a", "base", ADDRESS).length, 1);
  assert.deepEqual(repository.list("actor-user-b", "base", ADDRESS), []);
  assert.throws(() => repository.upsert({ actorId: "actor-user-a", chain: "base", contractAddress: ADDRESS, stepNumber: 3, itemKey: "tokensniffer", manualState: "MANUAL_VERIFIED", valueNumber: 80, sourceTool: "TokenSniffer", evidenceUrl: "http://example.com/evidence" }), (error: unknown) => error instanceof ResearchEvidenceError && error.code === "RESEARCH_EVIDENCE_INPUT_INVALID");
});

test("PC.3B API validates token scores and keeps trusted testers read-only", async (t) => {
  const root = await mkdtemp(resolve(tmpdir(), "crypto-edge-pc3b-api-"));
  const fixturePath = resolve(root, "scanner.json");
  await writeFile(fixturePath, JSON.stringify(scannerOutput()), "utf8");
  const repository = await createResearchEvidenceRepository({ databaseFilePath: resolve(root, "research.sqlite") });
  const beforeActor = process.env.CRYPTO_EDGE_PC1_REVIEW_DEFAULT_ACTOR;
  process.env.CRYPTO_EDGE_PC1_REVIEW_DEFAULT_ACTOR = "CAMP_USER";
  const server = createServer(createScannerApiHandler({ runtimeMode: "DEVELOPMENT_DEMO", scanner: { fixturePath, outputDirPath: resolve(root, "output"), allowFixtureFallback: true }, researchEvidence: { repository } }));
  t.after(async () => {
    if (beforeActor === undefined) delete process.env.CRYPTO_EDGE_PC1_REVIEW_DEFAULT_ACTOR;
    else process.env.CRYPTO_EDGE_PC1_REVIEW_DEFAULT_ACTOR = beforeActor;
    await new Promise<void>((done) => server.close(() => done()));
    repository.close();
    await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 40 });
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", () => done()));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  const checklist = await fetch(`${origin}/api/research-checklist?chain=base&contract_address=${ADDRESS}`);
  const cookie = checklist.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie);
  const write = async (score: unknown, state: string) => fetch(`${origin}/api/research-evidence`, {
    method: "PUT",
    headers: { cookie: cookie!, origin, "content-type": "application/json" },
    body: JSON.stringify({ chain: "base", contract_address: ADDRESS, step_number: 3, item_key: "tokensniffer", manual_state: state, value_number: score, source_tool: "TokenSniffer" }),
  });
  assert.equal((await write(49, "RED_FLAG")).status, 200);
  assert.equal((await write(50, "MANUAL_VERIFIED")).status, 200);
  assert.equal((await write(0, "RED_FLAG")).status, 200);
  assert.equal((await write(100, "MANUAL_VERIFIED")).status, 200);
  for (const invalid of [-1, 101, "NaN", null, Number.POSITIVE_INFINITY]) assert.equal((await write(invalid, "MANUAL_VERIFIED")).status, 400);
  assert.equal((await write(49, "MANUAL_VERIFIED")).status, 400, "server derives the score state deterministically");
  const writeRaw = async (body: Record<string, unknown>) => fetch(`${origin}/api/research-evidence`, {
    method: "PUT", headers: { cookie: cookie!, origin, "content-type": "application/json" }, body: JSON.stringify({ chain: "base", contract_address: ADDRESS, ...body }),
  });
  assert.equal((await writeRaw({ step_number: 3, item_key: "honeypot", manual_state: "MANUAL_VERIFIED", value_text: "low_honeypot_risk", source_tool: "Honeypot.is" })).status, 200);
  assert.equal((await writeRaw({ step_number: 3, item_key: "honeypot", manual_state: "RED_FLAG", value_text: "honeypot_detected", source_tool: "Honeypot.is" })).status, 200);
  assert.equal((await writeRaw({ step_number: 3, item_key: "honeypot", manual_state: "MISSING_DATA", value_text: "no_conclusive_result", source_tool: "Honeypot.is" })).status, 200);
  assert.equal((await writeRaw({ step_number: 3, item_key: "honeypot", manual_state: "RED_FLAG", value_text: "low_honeypot_risk", source_tool: "Honeypot.is" })).status, 400);
  assert.equal((await writeRaw({ step_number: 3, item_key: "defi_scanner", manual_state: "NOT_APPLICABLE", value_text: "Not applicable to this contract", source_tool: "De.Fi Scanner" })).status, 200);
  assert.equal((await writeRaw({ step_number: 3, item_key: "defi_scanner", manual_state: "MANUAL_VERIFIED", source_tool: "DefiLlama" })).status, 400);
  assert.equal((await writeRaw({ step_number: 4, item_key: "wallet_clustering", manual_state: "RED_FLAG", value_text: "strong_concentration_or_related_cluster", source_tool: "Bubblemaps" })).status, 200);

});

test("PC.3B trusted testers can read but cannot write private tool findings", async (t) => {
  const root = await mkdtemp(resolve(tmpdir(), "crypto-edge-pc3b-trusted-"));
  const fixturePath = resolve(root, "scanner.json");
  await writeFile(fixturePath, JSON.stringify(scannerOutput()), "utf8");
  const repository = await createResearchEvidenceRepository({ databaseFilePath: resolve(root, "research.sqlite") });
  const beforeActor = process.env.CRYPTO_EDGE_PC1_REVIEW_DEFAULT_ACTOR;
  process.env.CRYPTO_EDGE_PC1_REVIEW_DEFAULT_ACTOR = "TRUSTED_TESTER";
  const server = createServer(createScannerApiHandler({ runtimeMode: "DEVELOPMENT_DEMO", scanner: { fixturePath, outputDirPath: resolve(root, "output"), allowFixtureFallback: true }, researchEvidence: { repository } }));
  t.after(async () => {
    if (beforeActor === undefined) delete process.env.CRYPTO_EDGE_PC1_REVIEW_DEFAULT_ACTOR;
    else process.env.CRYPTO_EDGE_PC1_REVIEW_DEFAULT_ACTOR = beforeActor;
    await new Promise<void>((done) => server.close(() => done()));
    repository.close();
    await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 40 });
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", () => done()));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  const lookup = await fetch(`${origin}/api/research-checklist?chain=base&contract_address=${ADDRESS}`);
  assert.equal(lookup.status, 200);
  const cookie = lookup.headers.get("set-cookie")?.split(";")[0];
  const denied = await fetch(`${origin}/api/research-evidence`, {
    method: "PUT", headers: { cookie: cookie!, origin, "content-type": "application/json" },
    body: JSON.stringify({ chain: "base", contract_address: ADDRESS, step_number: 3, item_key: "tokensniffer", manual_state: "MANUAL_VERIFIED", value_number: 50, source_tool: "TokenSniffer" }),
  });
  assert.equal(denied.status, 403);
});

test("PC.3B renders four usable external tool actions, shows saved state truthfully, and preserves the 7/6 tab boundaries", async () => {
  const step3 = renderToStaticMarkup(<ProductLocaleProvider initialLocale="pl"><ResearchChecklistDetail candidate={candidate()} focusedStep={3} /></ProductLocaleProvider>);
  const step4 = renderToStaticMarkup(<ProductLocaleProvider initialLocale="en"><ResearchChecklistDetail candidate={candidate()} focusedStep={4} /></ProductLocaleProvider>);
  const focusedDrawer = renderToStaticMarkup(<ProductLocaleProvider initialLocale="en"><ExternalVerificationLinksView candidate={candidate()} focusedResearchStep={3} /></ProductLocaleProvider>);
  const css = await readFile("src/index.css", "utf8");
  const [researchSource, presentationSource, targetsSource] = await Promise.all([
    readFile("src/components/ResearchChecklist.tsx", "utf8"),
    readFile("src/researchChecklistPresentation.ts", "utf8"),
    readFile("src/externalVerificationTargets.ts", "utf8"),
  ]);
  const step3Actions = externalActions(step3);
  const step4Actions = externalActions(step4);

  assertExternalAction(step3Actions, "Sprawdź Honeypot", `https://honeypot.is/base?address=${ADDRESS}`);
  assertExternalAction(step3Actions, "Otwórz TokenSniffer", "https://tokensniffer.com/");
  assertExternalAction(step3Actions, "Otwórz De.Fi Scanner", "https://de.fi/scanner");
  assertExternalAction(step4Actions, "Open Bubblemaps", `https://v2.bubblemaps.io/map?chain=base&address=${ADDRESS}`);
  assert.match(step3, /data-research-simple-summary="3"/);
  assert.match(step3, /Research niekompletny/);
  assert.match(step3, /Sprawdzone/);
  assert.match(step3, /Do sprawdzenia/);
  for (const tool of ["honeypot", "tokensniffer", "defi_scanner"]) assert.match(step3, new RegExp(`data-key-research-tool="${tool}"`));
  assert.doesNotMatch(step3, /data-key-research-tool="bubblemaps"/);
  assert.match(step4, /data-key-research-tool="bubblemaps"/);
  assert.doesNotMatch(step4, /data-key-research-tool="honeypot"/);
  assert.match(step3, /Główne kontrole/);
  assert.match(step3, /Pokaż szczegóły techniczne/);
  assert.doesNotMatch(step3, /data-research-technical-details="3"[^>]*\sopen=/, "technical details start collapsed");
  assert.doesNotMatch(step3, /research-external-result-form/, "result forms are hidden until Add result");
  assert.match(step3, /Własność/);
  assert.match(step3, /Mint/);
  assert.match(step4, /Top 10 wallets/);
  assert.match(step4, /12\.00%/);
  assert.doesNotMatch(step4, /<strong>Holder count<\/strong>/);
  assert.match(step3, /Dodaj wynik/);
  assert.match(step3, /Kopiuj CA/);
  assert.match(step3, /Wklej skopiowany adres w polu wyszukiwania TokenSniffer\./);
  assert.match(step3, /Wklej skopiowany adres w wyszukiwarce De\.Fi Scanner\./);
  assertActionOrder(manualToolRegion(step3, "tokensniffer"), ["Kopiuj CA", "Otwórz TokenSniffer", "Dodaj wynik"]);
  assertActionOrder(manualToolRegion(step3, "defi_scanner"), ["Kopiuj CA", "Otwórz De.Fi Scanner", "Dodaj wynik"]);
  assert.doesNotMatch(manualToolRegion(step3, "honeypot"), /Kopiuj CA/);
  assert.doesNotMatch(manualToolRegion(step4, "bubblemaps"), /Copy CA/);
  assert.match(css, /\.research-external-open-action\s*\{/);
  assert.match(css, /\.research-external-open-action\s*\{[^}]*cursor:\s*pointer/s);
  assert.match(css, /\.research-external-open-action:hover\s*\{/);
  assert.match(css, /\.research-external-open-action:focus-visible\s*\{/);
  assert.match(researchSource, /Niskie ryzyko honeypota/);
  assert.match(researchSource, /Low honeypot risk/);
  assert.match(researchSource, /Brak jednoznacznego wyniku/);
  assert.match(researchSource, /No conclusive result/);
  assert.doesNotMatch(`${researchSource}${presentationSource}`, /Brak honeypota|No honeypot detected/);
  assert.doesNotMatch(`${researchSource}${presentationSource}${targetsSource}`, /fetch\(|axios|XMLHttpRequest|openai|api\.honeypot\.is|api\.bubblemaps|<iframe|partnerId/i);
  for (const [markup, tool] of [[step3, "honeypot"], [step3, "tokensniffer"], [step3, "defi_scanner"], [step4, "bubblemaps"]] as const) {
    const toolRegion = manualToolRegion(markup, tool);
    assert.match(toolRegion, /Sprawdzone|Do sprawdzenia|Checked|To check/);
    assert.doesNotMatch(toolRegion, /research-external-result-form/);
  }

  const unrecorded = resolveResearchChecklist(candidate());
  for (const [step, key] of [[3, "honeypot"], [3, "tokensniffer"], [3, "defi_scanner"], [4, "wallet_clustering"]] as const) {
    assert.equal(researchChecklistItemValue(item(unrecorded, step, key), "pl"), "Brak zapisanego wyniku");
  }

  const recorded = resolveResearchChecklist(candidate(), [
    evidence(3, "honeypot", "MANUAL_VERIFIED", { value_text: "low_honeypot_risk", source_tool: "Honeypot.is" }),
    evidence(3, "tokensniffer", "MANUAL_VERIFIED", { value_number: 80, source_tool: "TokenSniffer" }),
    evidence(3, "defi_scanner", "MANUAL_VERIFIED", { source_tool: "De.Fi Scanner" }),
    evidence(4, "wallet_clustering", "MANUAL_VERIFIED", { value_text: "no_material_cluster", source_tool: "Bubblemaps" }),
  ]);
  assert.equal(researchChecklistItemValue(item(recorded, 3, "honeypot"), "pl"), "Niskie ryzyko honeypota");
  assert.equal(researchChecklistItemValue(item(recorded, 3, "tokensniffer"), "pl"), "Ręcznie zapisany wynik TokenSniffer: 80");
  assert.equal(researchChecklistItemValue(item(recorded, 3, "defi_scanner"), "pl"), "Zapisany wynik");
  assert.equal(researchChecklistItemValue(item(recorded, 4, "wallet_clustering"), "pl"), "Brak istotnego klastra");
  assert.equal((focusedDrawer.match(/role="tab"/g) ?? []).length, 6);
  assert.doesNotMatch(focusedDrawer, /external-checks-list|AI Research Brief/);
});

test("PC.3B keeps the simplified focus view compact while retaining expandable technical and result details", async () => {
  const initialView = resolveResearchChecklist(candidate());
  initialView.manual_evidence_writable = true;
  const savedEvidence = evidence(3, "tokensniffer", "MANUAL_VERIFIED", { value_number: 80, source_tool: "TokenSniffer" });
  const savedView = resolveResearchChecklist(candidate(), [savedEvidence]);
  savedView.manual_evidence_writable = true;
  const originalFetch = globalThis.fetch;
  const originalActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  let saved = false;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith("/api/research-checklist")) return new Response(JSON.stringify(saved ? savedView : initialView), { status: 200, headers: { "content-type": "application/json" } });
    if (url === "/api/research-evidence" && init?.method === "PUT") {
      saved = true;
      return new Response(JSON.stringify({ evidence: savedEvidence }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response("{}", { status: 404, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  let renderer: ReturnType<typeof create> | undefined;
  try {
    await act(async () => {
      renderer = create(<ProductLocaleProvider initialLocale="pl"><ResearchChecklistDetail candidate={candidate()} focusedStep={3} /></ProductLocaleProvider>);
      await Promise.resolve();
    });
    const technical = renderer!.root.findByProps({ "data-research-technical-details": 3 });
    assert.equal(technical.props.open, false);
    assert.equal(renderer!.root.findAll((node) => String(node.props.className ?? "").includes("research-external-result-form")).length, 0);

    assert.deepEqual(renderer!.root.findAllByProps({ "data-key-research-tool": "honeypot" }).length, 1);
    assert.deepEqual(renderer!.root.findAllByProps({ "data-key-research-tool": "tokensniffer" }).length, 1);
    assert.deepEqual(renderer!.root.findAllByProps({ "data-key-research-tool": "defi_scanner" }).length, 1);
    assert.equal(renderer!.root.findAllByProps({ "data-key-research-tool": "bubblemaps" }).length, 0);

    const tokenSnifferWorkflow = renderer!.root.findByProps({ "data-manual-research-tool": "tokensniffer" });
    const addResult = tokenSnifferWorkflow.findAllByType("button").find((node) => buttonText(node) === "Dodaj wynik");
    assert.ok(addResult);
    await act(async () => { addResult!.props.onClick(); });
    const scoreInput = renderer!.root.findAllByType("input").find((node) => node.props.type === "number");
    assert.ok(scoreInput);
    await act(async () => { scoreInput!.props.onChange({ target: { value: "80" } }); });
    const saveResult = renderer!.root.findAllByType("button").find((node) => buttonText(node) === "Zapisz wynik");
    assert.ok(saveResult);
    await act(async () => { await saveResult!.props.onClick(); });
    assert.equal(renderer!.root.findAll((node) => String(node.props.className ?? "").includes("research-external-result-form")).length, 0, "save collapses the result form");
    assert.ok(renderer!.root.findAllByType("button").some((node) => buttonText(node) === "Edytuj wynik"), "saved results remain editable");
  } finally {
    if (renderer) await act(async () => { renderer!.unmount(); });
    globalThis.fetch = originalFetch;
    globalThis.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
  }
});

test("PC.3B surfaces a technical red flag in the simple layer and reveals technical details on demand", async () => {
  const redFlagCandidate: UiTokenCandidate = { ...candidate(), security: { ...security(), mintRisk: true } };
  const redFlagView = resolveResearchChecklist(redFlagCandidate);
  redFlagView.manual_evidence_writable = true;
  const originalFetch = globalThis.fetch;
  const originalActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.fetch = (async () => new Response(JSON.stringify(redFlagView), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;
  let renderer: ReturnType<typeof create> | undefined;
  try {
    await act(async () => {
      renderer = create(<ProductLocaleProvider initialLocale="pl"><ResearchChecklistDetail candidate={redFlagCandidate} focusedStep={3} /></ProductLocaleProvider>);
      await Promise.resolve();
    });
    const reveal = renderer!.root.findByProps({ "data-research-red-flag-reveal": true });
    assert.match(buttonText(reveal), /Wykryto 1 czerwoną flagę/);
    await act(async () => { reveal.props.onClick(); });
    assert.equal(renderer!.root.findByProps({ "data-research-technical-details": 3 }).props.open, true);
    assert.ok(renderer!.root.findByProps({ "data-research-technical-red-flags": true }));
  } finally {
    if (renderer) await act(async () => { renderer!.unmount(); });
    globalThis.fetch = originalFetch;
    globalThis.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
  }
});

test("PC.3B keeps one global tool overview and maps each tool to its contextual step", async () => {
  const originalFetch = globalThis.fetch;
  const originalActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.fetch = (async () => new Response("{}", { status: 404, headers: { "content-type": "application/json" } })) as typeof fetch;
  const opened: number[] = [];
  let renderer: ReturnType<typeof create> | undefined;
  try {
    await act(async () => {
      renderer = create(<ProductLocaleProvider initialLocale="pl"><ResearchChecklistSummary candidate={candidate()} onOpenStep={(step) => opened.push(step)} /></ProductLocaleProvider>);
      await Promise.resolve();
    });
    assert.equal(renderer!.root.findAllByProps({ "data-research-global-tools": true }).length, 1);
    for (const [tool, expectedStep] of [["honeypot", 3], ["tokensniffer", 3], ["defi_scanner", 3], ["bubblemaps", 4]] as const) {
      const action = renderer!.root.findByProps({ "data-research-global-tool": tool });
      await act(async () => { action.props.onClick(); });
      assert.equal(opened.at(-1), expectedStep, `${tool} opens its contextual step`);
    }
    assert.deepEqual(opened, [3, 3, 3, 4]);
  } finally {
    if (renderer) await act(async () => { renderer!.unmount(); });
    globalThis.fetch = originalFetch;
    globalThis.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
  }
});

test("PC.3B renders only meaningful step data and uses compact unavailable states", () => {
  const ratioCandidate: UiTokenCandidate = { ...candidate(), liquidity: 1_271_700, marketCap: 1_000_000 };
  const step4 = renderToStaticMarkup(<ProductLocaleProvider initialLocale="pl"><ResearchChecklistDetail candidate={ratioCandidate} focusedStep={4} /></ProductLocaleProvider>);
  const step5 = renderToStaticMarkup(<ProductLocaleProvider initialLocale="pl"><ResearchChecklistDetail candidate={candidate()} focusedStep={5} /></ProductLocaleProvider>);
  const step6 = renderToStaticMarkup(<ProductLocaleProvider initialLocale="pl"><ResearchChecklistDetail candidate={candidate()} focusedStep={6} /></ProductLocaleProvider>);
  const step7 = renderToStaticMarkup(<ProductLocaleProvider initialLocale="pl"><ResearchChecklistDetail candidate={candidate()} focusedStep={7} /></ProductLocaleProvider>);
  const deadSecurity = { ...security(), sources: [], contractVerified: null, ownershipStatus: "unknown", liquidityLocked: null, mintRisk: null, blacklistRisk: null, whitelistRisk: null, sellRestrictionRisk: null, proxyRisk: null, buyTax: null, sellTax: null };
  const step3WithDeadRows = renderToStaticMarkup(<ProductLocaleProvider initialLocale="pl"><ResearchChecklistDetail candidate={{ ...candidate(), security: deadSecurity }} focusedStep={3} /></ProductLocaleProvider>);
  const redFlag = renderToStaticMarkup(<ProductLocaleProvider initialLocale="pl"><ResearchChecklistDetail candidate={{ ...candidate(), security: { ...security(), mintRisk: true } }} focusedStep={3} /></ProductLocaleProvider>);

  assert.match(step4, /127\.17%/);
  for (const name of ["Liczba holderów", "Portfel dewelopera", "Data końca blokady", "Jakość wolumenu"]) assert.doesNotMatch(step4, new RegExp(`<strong>${name}<\\/strong>`));
  assert.match(step4, /Brakuje danych dla 4 dodatkowych kontroli/);
  assert.doesNotMatch(step3WithDeadRows, /<strong>Mint<\/strong>/);
  assert.doesNotMatch(step3WithDeadRows, /<strong>Własność<\/strong>/);
  assert.match(redFlag, /data-research-red-flag-reveal/);
  assert.match(redFlag, /<strong>Mint<\/strong>/);

  assert.doesNotMatch(step5, /data-key-research-tool=/);
  assert.match(step5, /Nie znaleziono automatycznych linków społecznościowych w obecnym źródle/);
  assert.match(step5, /Research społeczny wymaga ręcznego uzupełnienia/);
  for (const name of ["X / Twitter", "Telegram", "Discord", "Strona WWW", "Zespół", "Whitepaper", "Roadmap"]) assert.doesNotMatch(step5, new RegExp(`<strong>${name}<\\/strong>`));
  assert.doesNotMatch(step6, /data-key-research-tool=/);
  assert.match(step6, /SCORECARD RESEARCHU/);
  assert.match(step6, /Wynik częściowy/);
  assert.doesNotMatch(step6, /PC\.3A|<strong>Bezpieczeństwo \(30\)<\/strong>|<strong>On-chain \(25\)<\/strong>/);
  assert.match(step7, /data-pc3e-final-readiness-beginner/);
  assert.match(step7, /Research niekompletny/);
  assert.doesNotMatch(step7, /<strong>Gotowość researchu<\/strong>|Brak zapisanych danych/);
});

function externalActions(markup: string) {
  return [...markup.matchAll(/<a class="research-external-open-action" href="([^"]+)" target="_blank" rel="noopener noreferrer">([^<]+)<span aria-hidden="true">↗<\/span><\/a>/g)]
    .map((match) => ({ href: match[1].replaceAll("&amp;", "&"), label: match[2].trim() }));
}

function assertExternalAction(actions: { href: string; label: string }[], label: string, href: string) {
  const action = actions.find((entry) => entry.label === label);
  assert.ok(action, `Missing visible external action: ${label}`);
  assert.equal(action.href, href);
  assert.equal(new URL(action.href).protocol, "https:");
}

function assertActionOrder(markup: string, labels: string[]) {
  const positions = labels.map((label) => markup.indexOf(label));
  assert.ok(positions.every((position) => position >= 0), `Missing workflow actions: ${labels.join(", ")}`);
  assert.ok(positions.every((position, index) => index === 0 || position > positions[index - 1]), `Workflow action order is incorrect: ${labels.join(" → ")}`);
}

function buttonText(node: TestRenderer.ReactTestInstance): string {
  return node.children.map((child) => typeof child === "string" || typeof child === "number" ? String(child) : "").join("");
}

function manualToolRegion(markup: string, tool: string) {
  const workflow = markup.indexOf(`data-manual-research-tool="${tool}"`);
  assert.notEqual(workflow, -1, `Missing manual tool workflow: ${tool}`);
  const start = markup.lastIndexOf("<article", workflow);
  const end = markup.indexOf("</article>", workflow);
  assert.ok(start >= 0 && end >= workflow, `Missing item bounds for manual tool: ${tool}`);
  return markup.slice(start, end + "</article>".length);
}

function item(view: ReturnType<typeof resolveResearchChecklist>, step: number, key: string) {
  const result = view.steps.find((entry) => entry.number === step)?.items.find((entry) => entry.key === key);
  assert.ok(result, `Missing checklist item ${step}:${key}`);
  return result;
}

function evidence(step: 3 | 4, key: "honeypot" | "tokensniffer" | "defi_scanner" | "wallet_clustering", state: "MANUAL_VERIFIED" | "MISSING_DATA" | "RED_FLAG", values: Partial<ReturnType<typeof defaultEvidence>>) {
  return { ...defaultEvidence(), step_number: step, item_key: key, manual_state: state, ...values };
}

function defaultEvidence() {
  return { schema_version: "research_evidence_sqlite_v1" as const, chain: "base", contract_address: ADDRESS, step_number: 3 as const, item_key: "tokensniffer" as const, manual_state: "MANUAL_VERIFIED" as const, value_text: null, value_number: null, note: null, source_tool: null, evidence_url: null, observed_at: null, created_at: "2026-08-13T12:00:00.000Z", updated_at: "2026-08-13T12:00:00.000Z" };
}

function candidate(): UiTokenCandidate {
  return {
    id: "candidate-a", runId: "run-a", symbol: "PASS", name: "Pass Token", chain: "base", dex: "uniswap", source: "dexscreener", contractAddress: ADDRESS, pairAddress: PAIR, sourceUrl: "https://example.com/pair", discoveryBasket: "new_emerging", discoveryMethod: "dexscreener_latest_token_profiles", observationOnly: false, establishedEligible: false, universeVersion: null, universeEntryIndex: null, addressIdentityVerified: true,
    priceUsd: 1, marketCap: 1_000_000, fdvUsd: 1_000_000, liquidity: 120_000, volume24h: 100_000, volumeMarketCapRatio: 0.1, pairCreatedAt: "2026-01-01T00:00:00.000Z", pairAgeDays: 30,
    basicFilterStatus: "passed_basic_filter", securityLabel: "SECURITY_PASSED", finalLabel: "WATCHLIST", mainReason: "Eligible for further review", filterReasons: [], criticalReasons: [], warningReasons: [], finalReasons: [], missingData: [], riskFlags: [], security: security(), scorecard: null, lastCheckedAt: "2026-08-13T12:00:00.000Z",
  };
}

function security(): NonNullable<UiTokenCandidate["security"]> {
  return { sources: ["goplus", "honeypot"], coverageStatus: null, honeypotStatus: "passed", buyTax: 3, sellTax: 4, contractVerified: true, ownershipStatus: "renounced", liquidityLocked: true, liquidityLockDays: 120, mintRisk: false, blacklistRisk: false, whitelistRisk: false, sellRestrictionRisk: false, proxyRisk: false, topWalletPct: 8.5, top10WalletsPct: 34.2, checkedAt: "2026-08-13T12:00:00.000Z" };
}

function scannerOutput(): PersistableScannerOutput {
  const value = candidate();
  return {
    scan_run: { run_id: "run-a", source: "combined-scanner-poc", mode: "fixture", query: "fixture", started_at: null, finished_at: "2026-08-13T12:00:00.000Z", total_raw: 1, passed_basic_filter: 1, rejected_basic_filter: 0, security_checked: 1, security_passed: 1, needs_manual_verification: 0, critical_risk: 0, watchlist_candidates: 1, errors: [] },
    candidates: [{ run_id: "run-a", candidate_id: value.id, symbol: value.symbol, name: value.name, chain: value.chain, contract_address: value.contractAddress, pair_address: value.pairAddress, dex: value.dex, source: value.source, source_url: value.sourceUrl, price_usd: value.priceUsd, market_cap_usd: value.marketCap, fdv_usd: value.fdvUsd, liquidity_usd: value.liquidity, volume_24h_usd: value.volume24h, volume_market_cap_ratio: value.volumeMarketCapRatio, pair_created_at: value.pairCreatedAt, pair_age_days: value.pairAgeDays, basic_filter_status: value.basicFilterStatus, filter_reasons: [], final_label: value.finalLabel, final_reasons: [], created_at: value.lastCheckedAt }],
    security_checks: [{ run_id: "run-a", candidate_id: value.id, sources: security().sources, coverage_status: null, honeypot_status: security().honeypotStatus, buy_tax: security().buyTax, sell_tax: security().sellTax, contract_verified: security().contractVerified, ownership_status: security().ownershipStatus, liquidity_locked: security().liquidityLocked, liquidity_lock_days: security().liquidityLockDays, mint_risk: security().mintRisk, blacklist_risk: security().blacklistRisk, whitelist_risk: security().whitelistRisk, sell_restriction_risk: security().sellRestrictionRisk, proxy_risk: security().proxyRisk, top_wallet_pct: security().topWalletPct, top_10_wallets_pct: security().top10WalletsPct, risk_flags: [], missing_data: [], security_label: "SECURITY_PASSED", critical_reasons: [], warning_reasons: [], checked_at: value.lastCheckedAt }],
    scorecards: [],
  };
}
