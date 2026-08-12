import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { after, describe, it } from "node:test";
import React from "react";
import TestRenderer from "react-test-renderer";
import { buildAIResearchContext } from "../server/aiResearchContext.js";
import { presentAIProductionLookup } from "../server/aiProductionPublic.js";
import { buildDeterministicPreview } from "../server/aiResearchService.js";
import { mapPersistableScannerOutputToUiCandidates } from "../src/adapters/scannerOutputAdapter.js";
import { CandidateDetailView } from "../src/components/CandidateDetailView.js";
import { PERSISTABLE_SCANNER_SAMPLE } from "../src/fixtures/persistableScannerSample.js";
import { ProductLocaleProvider } from "../src/productI18n.js";
import { selectAIResearchReviewCandidate } from "../src/ProductApp.js";
import type { AIResearchBriefLookup } from "../src/types/aiResearchTypes.js";

void React;

const { act, create } = TestRenderer;
const root = await mkdtemp(resolve(tmpdir(), "crypto-edge-ai3-launcher-ui-"));
const fixturePath = resolve(root, "scanner.json");
const ADDRESS = "0x1111111111111111111111111111111111111111";
const scanner = structuredClone(PERSISTABLE_SCANNER_SAMPLE);
scanner.candidates[0]!.chain = "base";
scanner.candidates[0]!.contract_address = ADDRESS;
scanner.candidates[0]!.source_url = `https://dexscreener.com/base/${ADDRESS}`;
scanner.candidates[0]!.address_identity_verified = true;
await writeFile(fixturePath, JSON.stringify(scanner), "utf8");

const context = await buildAIResearchContext("base", ADDRESS, "pl", {
  scanner: { runtimeMode: "DEVELOPMENT_DEMO", outputDirPath: resolve(root, "missing"), fixturePath },
  followUp: { storePath: resolve(root, "missing-follow-up.json") },
  reports: { reportsRootPath: resolve(root, "missing-reports") },
});
const previewLookup: AIResearchBriefLookup = {
  schema_version: "ai_research_lookup_v1",
  availability: "READY",
  provider_mode: "DISABLED",
  brief: buildDeterministicPreview(context, new Date("2026-07-29T12:00:00.000Z")),
  retry_after_seconds: null,
  error_code: null,
  queue_status: "READY",
  shared_result: true,
};
const candidate = mapPersistableScannerOutputToUiCandidates(scanner)[0]!;

after(async () => { await rm(root, { recursive: true, force: true }); });

describe("AI.3 real owner-review launcher flow", () => {
  it("selects a canonical token for owner preview instead of an unsupported first candidate", () => {
    withPreviewRuntime(() => {
      const unsupported = { ...candidate, id: "unsupported", chain: "robinhood", contractAddress: ADDRESS };
      assert.equal(selectAIResearchReviewCandidate([unsupported, candidate])?.id, candidate.id);
    });
  });

  it("replaces the first PROCESSING render with the safe public preview and ignores review-state query tampering", async () => {
    const cases = [
      {
        search: "?ai_review_state=cooldown",
        expected: ["Dostępna", "Analiza gotowa", "Podsumowanie"],
      },
      {
        search: "?ai_review_state=failed",
        expected: ["Dostępna", "Analiza gotowa", "Podsumowanie"],
      },
      {
        search: "?ai_review_state=suspended",
        expected: ["Dostępna", "Analiza gotowa", "Podsumowanie"],
      },
      {
        search: "",
        expected: ["Dostępna", "Analiza gotowa", "Podsumowanie"],
      },
    ] as const;

    for (const testCase of cases) {
      await runCandidateDetailFlow(testCase);
    }
  });
});

async function runCandidateDetailFlow(testCase: {
  search: string;
  expected: readonly string[];
  disabledCta?: string;
}) {
  let resolveLookup: ((response: Response) => void) | undefined;
  const lookupResponse = new Promise<Response>((resolveResponse) => { resolveLookup = resolveResponse; });
  const fetches: Array<{ url: string; method: string }> = [];
  const originalFetch = globalThis.fetch;
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalPreview = Object.getOwnPropertyDescriptor(globalThis, "__CRYPTO_EDGE_AI_RESEARCH_RENDER_PREVIEW__");
  const originalActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: { search: testCase.search, hash: "#candidate-detail" },
      localStorage: { getItem: () => null, setItem: () => undefined },
    },
  });
  Object.defineProperty(globalThis, "__CRYPTO_EDGE_AI_RESEARCH_RENDER_PREVIEW__", { configurable: true, value: true });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    fetches.push({ url, method });
    if (url.startsWith("/api/v1/ai-analyses/result?")) return lookupResponse;
    if (url.startsWith("/api/owner-operations/established-promotion/status?")) {
      return new Response("{}", { status: 404, headers: { "content-type": "application/json" } });
    }
    throw new Error(`Unexpected launcher-flow request: ${method} ${url}`);
  }) as typeof fetch;

  let renderer: ReturnType<typeof create> | undefined;
  try {
    await act(async () => {
      renderer = create(
        <ProductLocaleProvider initialLocale="pl">
          <CandidateDetailView candidate={candidate} followUpStatus={null} initialActiveTab="ai" />
        </ProductLocaleProvider>,
      );
    });

    const firstRender = renderedText(renderer!);
    assert.match(firstRender, /Przygotowywana/);
    assert.match(firstRender, /Analiza jest przygotowywana/);

    await act(async () => {
      resolveLookup!(new Response(JSON.stringify(presentAIProductionLookup(previewLookup, "pl")), {
        status: 200,
        headers: { "content-type": "application/json" },
      }));
      await lookupResponse;
    });

    const finalRender = renderedText(renderer!);
    for (const expected of testCase.expected) assert.match(finalRender, new RegExp(expected));
    assert.doesNotMatch(finalRender, /Analiza jest przygotowywana/);
    assert.doesNotMatch(finalRender, /Przygotowywana/);

    if (testCase.disabledCta) {
      const retryButton = renderer!.root.findAllByType("button")
        .find((button) => renderedText(button.children) === testCase.disabledCta);
      assert.ok(retryButton, `Missing retry CTA: ${testCase.disabledCta}`);
      assert.equal(retryButton.props.disabled, true);
    }

    assert.equal(fetches.filter(({ url }) => url.startsWith("/api/v1/ai-analyses/result?")).length, 1);
    assert.equal(fetches.some(({ method }) => method !== "GET"), false);
  } finally {
    if (renderer) await act(async () => { renderer!.unmount(); });
    globalThis.fetch = originalFetch;
    restoreProperty("window", originalWindow);
    restoreProperty("__CRYPTO_EDGE_AI_RESEARCH_RENDER_PREVIEW__", originalPreview);
    globalThis.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
  }
}

function withPreviewRuntime(run: () => void) {
  const original = Object.getOwnPropertyDescriptor(globalThis, "__CRYPTO_EDGE_AI_RESEARCH_RENDER_PREVIEW__");
  Object.defineProperty(globalThis, "__CRYPTO_EDGE_AI_RESEARCH_RENDER_PREVIEW__", { configurable: true, value: true });
  try { run(); } finally { restoreProperty("__CRYPTO_EDGE_AI_RESEARCH_RENDER_PREVIEW__", original); }
}

function restoreProperty(name: string, descriptor: PropertyDescriptor | undefined) {
  if (descriptor) Object.defineProperty(globalThis, name, descriptor);
  else Reflect.deleteProperty(globalThis, name);
}

function renderedText(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(renderedText).join("");
  if (value && typeof value === "object" && "children" in value) {
    return renderedText((value as { children?: unknown }).children);
  }
  if (value && typeof value === "object" && "toJSON" in value) {
    return renderedText((value as { toJSON: () => unknown }).toJSON());
  }
  return "";
}
