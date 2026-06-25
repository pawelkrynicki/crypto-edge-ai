import assert from "node:assert/strict";
import { get } from "node:http";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import type { AddressInfo } from "node:net";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { mapPersistableScannerOutputToUiCandidates } from "../src/adapters/scannerOutputAdapter";
import { CandidateDetail, getMissingSecurityText } from "../src/components/CandidateDetail";
import { MarketContextPanel } from "../src/components/MarketContextPanel";
import { ScannerRadar } from "../src/components/ScannerRadar";
import { WatchlistTab } from "../src/components/WatchlistTab";
import { PERSISTABLE_SCANNER_SAMPLE } from "../src/fixtures/persistableScannerSample";
import { toMockCandidate } from "../src/mockData";
import { interpretContextApiOutput, parseMarketContextApiOutput } from "../src/services/contextDataSource";
import {
  createEmptyReviewSession,
  getCandidateReview,
  loadReviewSession,
  REVIEW_SESSION_STORAGE_KEY,
  saveReviewRecord,
} from "../src/services/reviewSessionStore";
import type { StorageLike } from "../src/services/reviewSessionStore";
import { interpretScannerApiOutput } from "../src/services/scannerDataSource";
import type { ReviewSessionState } from "../src/types/reviewSessionTypes";
import type { PersistableScannerOutput, ScannerApiOutput } from "../src/types/scannerTypes";
import { createScannerApiServer } from "../server/scannerApiServer";
import { readLatestContextOutput, type ContextLatestOutput } from "../server/latestContextOutput";
import { isPersistableScannerOutputShape } from "../server/latestScannerOutput";

const realFixture = PERSISTABLE_SCANNER_SAMPLE;
const uiCandidates = mapPersistableScannerOutputToUiCandidates(realFixture);
const passCandidate = realFixture.candidates.find((candidate) => candidate.symbol === "PASS");
const lowlCandidate = realFixture.candidates.find((candidate) => candidate.symbol === "LOWL");
const fdvCandidate = realFixture.candidates.find((candidate) => candidate.symbol === "FDV");

assert.ok(passCandidate);
assert.ok(lowlCandidate);
assert.ok(fdvCandidate);

const passUi = uiCandidates.find((candidate) => candidate.symbol === "PASS");
const lowlUi = uiCandidates.find((candidate) => candidate.symbol === "LOWL");
const fdvUi = uiCandidates.find((candidate) => candidate.symbol === "FDV");

assert.ok(passUi);
assert.ok(lowlUi);
assert.ok(fdvUi);

assert.equal(passUi.id, passCandidate.candidate_id, "candidate_id becomes UI id");
assert.equal(passUi.security?.honeypotStatus, "passed", "security_check joins by candidate_id");
assert.equal(passUi.securityLabel, "SECURITY_PASSED", "security_label comes from security_check");
assert.equal(passUi.scorecard?.decisionLabel, "WATCHLIST", "scorecard joins by candidate_id");
assert.equal(passUi.priceUsd, passCandidate.price_usd, "price_usd is preserved");
assert.equal(fdvUi.fdvUsd, fdvCandidate.fdv_usd, "fdv_usd is preserved");

assert.equal(passUi.finalLabel, "WATCHLIST");
assert.ok(passUi.security, "WATCHLIST candidate with security displays security data");

assert.equal(lowlUi.finalLabel, "REJECT");
assert.equal(lowlUi.security, null, "rejected candidate has no security detail");
assert.equal(lowlUi.securityLabel, "NOT_CHECKED", "rejected candidate without security remains NOT_CHECKED");

const passedWithoutSecurity = {
  ...realFixture,
  candidates: [
    {
      ...passCandidate,
      candidate_id: "passed-without-security",
      basic_filter_status: "passed_basic_filter",
    },
  ],
  security_checks: [],
  scorecards: [],
} satisfies PersistableScannerOutput;
const [missingSecurityUi] = mapPersistableScannerOutputToUiCandidates(passedWithoutSecurity);

assert.equal(missingSecurityUi.securityLabel, "NOT_CHECKED");
assert.equal(
  getMissingSecurityText({ basic_filter_status: missingSecurityUi.basicFilterStatus }),
  "Security data is unavailable. Manual verification is required.",
  "missing security for a passed candidate does not claim it failed basic filters",
);

const obsoleteIdOnlyShape = {
  scan_run: { id: "old-run" },
  candidates: [{ id: "old-candidate" }],
  security_checks: [{ id: "old-security", candidate_id: "old-candidate" }],
  scorecards: [{ id: "old-scorecard", candidate_id: "old-candidate" }],
};

assert.equal(
  isPersistableScannerOutputShape(obsoleteIdOnlyShape),
  false,
  "obsolete id-only fixture is rejected by API validation",
);
assert.equal(
  isPersistableScannerOutputShape(realFixture),
  true,
  "real data-poc shaped fixture passes validation",
);

const publicFixturePath = resolve("public", "fixtures", "persistableScannerSample.json");
const publicFixture = JSON.parse(await readFile(publicFixturePath, "utf8"));

assert.equal(
  isPersistableScannerOutputShape(publicFixture),
  true,
  "public JSON fixture passes validation",
);

const apiRealOutput: ScannerApiOutput = {
  ...realFixture,
  _source_meta: {
    source: "real-output",
    path: "../data-poc/output/scan_20260623073520/full_output.json",
    reason: "latest valid tools/data-poc output selected",
    selected_run_id: "scan_20260623073520",
    loaded_at: "2026-06-23T07:35:21.000Z",
  },
};
const apiRealResult = interpretScannerApiOutput(apiRealOutput);

assert.equal(apiRealResult.usedFallback, false, "API real-output metadata is not a fallback");
assert.equal(apiRealResult.resolvedSource, "real-output", "API real-output metadata resolves correctly");

const apiFixtureFallbackOutput: ScannerApiOutput = {
  ...realFixture,
  _source_meta: {
    source: "fixture-fallback",
    path: "public/fixtures/persistableScannerSample.json",
    reason: "no valid real scanner output found",
    selected_run_id: null,
    loaded_at: "2026-06-23T07:35:21.000Z",
  },
};
const apiFixtureFallbackResult = interpretScannerApiOutput(apiFixtureFallbackOutput);

assert.equal(apiFixtureFallbackResult.usedFallback, true, "API fixture-fallback metadata is a fallback");
assert.equal(
  apiFixtureFallbackResult.fallbackReason,
  "no valid real scanner output found",
  "fallbackReason comes from API source metadata",
);
assert.equal(
  apiFixtureFallbackResult.resolvedSource,
  "fixture-fallback",
  "API fixture-fallback metadata resolves correctly",
);

const contextFixturePath = resolve("public", "fixtures", "contextLatestFixture.json");
const contextFixture = JSON.parse(await readFile(contextFixturePath, "utf8"));
const parsedContextFixture = parseMarketContextApiOutput(contextFixture);
const interpretedContextFixture = interpretContextApiOutput(parsedContextFixture);

if (interpretedContextFixture.status !== "ready") {
  throw new Error("context fixture should parse as a ready API result");
}

assert.equal(
  parsedContextFixture._source_meta.source_kind,
  "fixture-fallback",
  "context fallback fixture declares fixture-fallback metadata",
);
assert.equal(
  interpretedContextFixture.usedFallback,
  true,
  "context API client recognizes fixture-fallback metadata",
);

const fixturePanelMarkup = renderToStaticMarkup(React.createElement(MarketContextPanel, {
  state: {
    status: "ready",
    context: parsedContextFixture,
    message: interpretedContextFixture.fallbackReason,
  },
}));

assert.match(fixturePanelMarkup, /42/, "panel renders Fear & Greed value");
assert.match(fixturePanelMarkup, /Lido/, "panel renders DefiLlama protocol rows");
assert.match(fixturePanelMarkup, /Uniswap V3/, "panel renders multiple DefiLlama rows");
assert.match(fixturePanelMarkup, /Fixture fallback/, "panel renders fixture fallback badge");
assert.match(
  fixturePanelMarkup,
  /Context data is for research only\. It is not a buy\/sell signal\./,
  "panel renders compliance note",
);

const apiFailureMarkup = renderToStaticMarkup(React.createElement(MarketContextPanel, {
  state: {
    status: "error",
    context: null,
    message: "Context API unavailable: test failure",
  },
}));

assert.match(apiFailureMarkup, /API unavailable/, "panel shows API failure state");
assert.match(apiFailureMarkup, /Context API unavailable: test failure/, "panel renders API failure detail");

const passMockCandidate = toMockCandidate(passUi);
const lowlMockCandidate = toMockCandidate(lowlUi);
const fdvMockCandidate = toMockCandidate(fdvUi);
const reviewStorage = createMemoryStorage();
const savedReviewState = saveReviewRecord({
  candidate_id: passMockCandidate.id,
  status: "saved_for_follow_up",
  note: "Track community and liquidity follow-up.",
}, reviewStorage);
const savedReviewRecord = getCandidateReview(passMockCandidate.id, savedReviewState);

assert.ok(savedReviewRecord, "saved review record is available from review session state");
assert.equal(savedReviewRecord.status, "saved_for_follow_up", "review status is persisted");
assert.equal(savedReviewRecord.note, "Track community and liquidity follow-up.", "review note is persisted");
assert.ok(reviewStorage.getItem(REVIEW_SESSION_STORAGE_KEY), "review session is written to local storage key");

const reloadedReviewState = loadReviewSession(reviewStorage);
assert.equal(
  getCandidateReview(passMockCandidate.id, reloadedReviewState)?.status,
  "saved_for_follow_up",
  "review session reloads saved record",
);

const corruptReviewStorage = createMemoryStorage({
  [REVIEW_SESSION_STORAGE_KEY]: "{ invalid json",
});
assert.deepEqual(
  loadReviewSession(corruptReviewStorage),
  createEmptyReviewSession(),
  "corrupt review session JSON falls back safely",
);
assert.equal(passMockCandidate.final_label, "WATCHLIST", "saving review status does not change scanner label");

const detailWithContextMarkup = renderToStaticMarkup(React.createElement(CandidateDetail, {
  candidate: passMockCandidate,
  marketContextState: {
    status: "ready",
    context: parsedContextFixture,
    message: interpretedContextFixture.fallbackReason,
  },
}));

assert.match(detailWithContextMarkup, /Data Coverage.*Context/, "candidate detail renders research context section");
assert.match(detailWithContextMarkup, /42 - Fear/, "candidate detail renders Fear & Greed context");
assert.match(detailWithContextMarkup, /Paid market\/onchain data/, "candidate detail shows paid market source category as deferred");
assert.match(detailWithContextMarkup, /Clarification pending; no new source connected/, "candidate detail shows dedicated security source category as deferred");
assert.match(detailWithContextMarkup, /Token unlocks \/ vesting/, "candidate detail shows unlock source category as deferred");
assert.match(detailWithContextMarkup, /This is not a buy\/sell signal\./, "candidate detail renders compliance note");
assert.match(detailWithContextMarkup, /Context does not alter scanner label\./, "candidate detail explains context does not alter label");
assert.match(detailWithContextMarkup, /Fixture context/, "candidate detail represents fixture context fallback");
assert.match(detailWithContextMarkup, /Local Review Session/, "candidate detail renders local review session");
assert.match(detailWithContextMarkup, /This does not change scanner label\./, "candidate detail explains review does not change label");
assert.match(detailWithContextMarkup, /Further review only/, "candidate detail keeps candidate final label visible");
assert.equal(passMockCandidate.final_label, "WATCHLIST", "context rendering does not change candidate final label");

const detailWithReviewMarkup = renderToStaticMarkup(React.createElement(CandidateDetail, {
  candidate: passMockCandidate,
  reviewRecord: savedReviewRecord,
  onSaveReview: () => undefined,
  onClearReview: () => undefined,
}));

assert.match(detailWithReviewMarkup, /Local Review Session/, "candidate detail renders review controls");
assert.match(detailWithReviewMarkup, /Saved for follow-up/, "candidate detail shows saved review status");
assert.match(detailWithReviewMarkup, /Track community and liquidity follow-up\./, "candidate detail shows saved analyst note");
assert.match(detailWithReviewMarkup, /This does not change scanner label\./, "candidate detail includes scanner-label compliance copy");
assert.match(detailWithReviewMarkup, /Further review only/, "review rendering keeps scanner final label visible");
assert.equal(passMockCandidate.final_label, "WATCHLIST", "saved review status does not mutate final_label");

const radarWithReviewMarkup = renderToStaticMarkup(React.createElement(ScannerRadar, {
  candidates: [passMockCandidate],
  reviewSession: savedReviewState,
  onSaveReview: () => undefined,
  onClearReview: () => undefined,
}));

assert.match(radarWithReviewMarkup, /Review/, "scanner radar renders review column");
assert.match(radarWithReviewMarkup, /Follow-up/, "scanner radar renders local review badge");

const reviewQueueState = {
  version: 1 as const,
  entries: {
    [passMockCandidate.id]: savedReviewRecord,
    [lowlMockCandidate.id]: {
      candidate_id: lowlMockCandidate.id,
      status: "needs_more_research",
      note: "Check why liquidity failed before any follow-up.",
      updated_at: "2026-06-24T12:15:00.000Z",
    },
    [fdvMockCandidate.id]: {
      candidate_id: fdvMockCandidate.id,
      status: "waiting_for_more_data",
      note: "Wait for updated security coverage.",
      updated_at: "2026-06-24T12:20:00.000Z",
    },
    "stored-review-not-in-scan": {
      candidate_id: "stored-review-not-in-scan",
      status: "dismissed_after_review",
      note: "Removed from this local review pass.",
      updated_at: "2026-06-24T12:25:00.000Z",
    },
  },
} satisfies ReviewSessionState;

const reviewQueueMarkup = renderToStaticMarkup(React.createElement(WatchlistTab, {
  candidates: [passMockCandidate, lowlMockCandidate, fdvMockCandidate],
  reviewSession: reviewQueueState,
  onClearReview: () => undefined,
  onOpenCandidate: () => undefined,
}));

assert.match(reviewQueueMarkup, /Review Queue/, "watchlist tab renders review queue workspace");
assert.match(reviewQueueMarkup, /Saved for follow-up/, "review queue renders local saved follow-up status");
assert.match(reviewQueueMarkup, /Track community and liquidity follow-up\./, "review queue renders analyst note preview");
assert.match(reviewQueueMarkup, /Scanner label/, "review queue labels scanner output separately");
assert.match(reviewQueueMarkup, /Review status/, "review queue labels local review status separately");
assert.match(reviewQueueMarkup, /Further review only/, "review queue keeps scanner label visible");
assert.match(reviewQueueMarkup, /Needs more research/, "review queue renders needs research status");
assert.match(reviewQueueMarkup, /Waiting for more data/, "review queue renders waiting data status");
assert.match(reviewQueueMarkup, /Dismissed after review/, "review queue renders dismissed status");
assert.match(reviewQueueMarkup, /Stored reviews not in current scan/, "review queue renders missing-current-scan section");
assert.match(reviewQueueMarkup, /stored-review-not-in-scan/, "review queue shows stored review candidate_id");
assert.match(
  reviewQueueMarkup,
  /This review belongs to a candidate not present in the current scanner output\./,
  "review queue explains stored reviews outside current scan",
);
assert.match(
  reviewQueueMarkup,
  /Review status does not change scanner labels\./,
  "review queue includes scanner-label compliance copy",
);
assert.equal(passMockCandidate.final_label, "WATCHLIST", "review queue rendering does not mutate final_label");

const emptyReviewQueueMarkup = renderToStaticMarkup(React.createElement(WatchlistTab, {
  candidates: [passMockCandidate],
  reviewSession: createEmptyReviewSession(),
  onClearReview: () => undefined,
  onOpenCandidate: () => undefined,
}));

assert.match(emptyReviewQueueMarkup, /No local review items yet\./, "review queue renders empty state");
assert.match(
  emptyReviewQueueMarkup,
  /Mark a candidate as Saved for follow-up or Needs more research from the scanner detail panel\./,
  "review queue empty state points back to scanner detail",
);

const detailFailureMarkup = renderToStaticMarkup(React.createElement(CandidateDetail, {
  candidate: passMockCandidate,
  marketContextState: {
    status: "error",
    context: null,
    message: "Context API unavailable: test failure",
  },
}));

assert.match(detailFailureMarkup, /Context unavailable/, "candidate detail handles context API failure");
assert.match(detailFailureMarkup, /Further review only/, "candidate detail still renders label when context is unavailable");

const contextTempRoot = await mkdtemp(resolve(tmpdir(), "crypto-edge-context-api-"));
try {
  const outputDir = resolve(contextTempRoot, "output");
  await mkdir(outputDir, { recursive: true });
  await writeContextRun(outputDir, makeContextOutput("approved_sources_20260624010101", 3));
  await writeContextRun(outputDir, makeContextOutput("approved_sources_20260624020202", 9));

  const latestContext = await readLatestContextOutput({ outputDirPath: outputDir, fixturePath: contextFixturePath });
  assert.equal(
    latestContext.run_id,
    "approved_sources_20260624020202",
    "context API reader selects the newest approved_sources_* directory",
  );
  assert.equal(latestContext._source_meta.source_kind, "approved-sources-output", "latest output metadata is included");
  assert.ok(latestContext._source_meta.output_file?.endsWith("approved_sources_output.json"));
  assert.equal(latestContext.summary.records_total, 3, "summary counts are preserved from approved source output");
  assert.deepEqual(
    latestContext.sources.map((source) => source.source_id),
    ["alternative_me_fng", "defillama_api"],
    "approved context source IDs are preserved",
  );

  const server = createScannerApiServer({
    context: {
      outputDirPath: outputDir,
      fixturePath: contextFixturePath,
    },
  });
  await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));

  try {
    const address = server.address() as AddressInfo;
    const response = await getJson(`http://127.0.0.1:${address.port}/api/context/latest`) as ContextLatestOutput;

    assert.equal(response.run_id, "approved_sources_20260624020202", "GET /api/context/latest returns latest approved output");
    assert.equal(response._source_meta.source_kind, "approved-sources-output", "GET /api/context/latest includes source metadata");
    assert.equal(response.summary.sources_requested, 2, "GET /api/context/latest preserves summary counts");
  } finally {
    await new Promise<void>((resolveClose, rejectClose) => {
      server.close((error) => {
        if (error) rejectClose(error);
        else resolveClose();
      });
    });
  }

  const emptyOutputDir = resolve(contextTempRoot, "empty-output");
  await mkdir(emptyOutputDir, { recursive: true });
  const fallbackContext = await readLatestContextOutput({ outputDirPath: emptyOutputDir, fixturePath: contextFixturePath });
  assert.equal(fallbackContext._source_meta.source_kind, "fixture-fallback", "context reader falls back when no output exists");
  assert.equal(fallbackContext._source_meta.output_file, null, "fixture fallback does not claim an output file");

  const invalidOutputDir = resolve(contextTempRoot, "invalid-output");
  await mkdir(resolve(invalidOutputDir, "approved_sources_20260624030303"), { recursive: true });
  await writeFile(
    resolve(invalidOutputDir, "approved_sources_20260624030303", "approved_sources_output.json"),
    "{ invalid json",
    "utf8",
  );
  const invalidFallbackContext = await readLatestContextOutput({ outputDirPath: invalidOutputDir, fixturePath: contextFixturePath });
  assert.equal(
    invalidFallbackContext._source_meta.source_kind,
    "fixture-fallback",
    "context reader handles invalid JSON with fixture fallback",
  );

  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = (async () => {
    fetchCalled = true;
    throw new Error("context reader must not call network");
  }) as typeof fetch;

  try {
    await readLatestContextOutput({ outputDirPath: outputDir, fixturePath: contextFixturePath });
    assert.equal(fetchCalled, false, "context reader does not call network");
  } finally {
    globalThis.fetch = originalFetch;
  }

  const rawLeakOutputDir = resolve(contextTempRoot, "raw-leak-output");
  const rawLeakOutput = makeContextOutput("approved_sources_20260624040404", 5);
  await writeContextRun(rawLeakOutputDir, {
    ...rawLeakOutput,
    metadata: { provider: "raw" },
    sources: rawLeakOutput.sources.map((source) => ({
      ...source,
      raw: { unsafe: true },
      provider_response: { unsafe: true },
      records: source.records.map((record) => ({
        ...record,
        description: "raw provider field",
        symbol: "RAW",
        chains: ["Ethereum"],
      })),
    })),
  });
  const sanitizedContext = await readLatestContextOutput({ outputDirPath: rawLeakOutputDir, fixturePath: contextFixturePath });
  const serializedContext = JSON.stringify(sanitizedContext);
  for (const forbiddenField of ["metadata", "description", "symbol", "chains", "raw", "provider_response"]) {
    assert.equal(
      serializedContext.includes(`"${forbiddenField}"`),
      false,
      `context output must not expose raw provider field ${forbiddenField}`,
    );
  }
} finally {
  await rm(contextTempRoot, { recursive: true, force: true });
}

console.log("contract tests passed");

async function writeContextRun(outputDir: string, output: Record<string, unknown>): Promise<void> {
  const runDir = resolve(outputDir, output.run_id as string);
  await mkdir(runDir, { recursive: true });
  await writeFile(resolve(runDir, "approved_sources_output.json"), `${JSON.stringify(output, null, 2)}\n`, "utf8");
}

function makeContextOutput(runId: string, fearGreedValue: number): Omit<ContextLatestOutput, "_source_meta"> {
  return {
    run_id: runId,
    generated_at: "2026-06-24T00:00:00.000Z",
    environment: "PUBLIC_BETA",
    sources: [
      {
        source_id: "alternative_me_fng",
        source_name: "Alternative.me Fear & Greed Index",
        mode: "live",
        fetched_at: "2026-06-24T00:00:01.000Z",
        policy: {
          environment: "PUBLIC_BETA",
          action: "live_fetch",
          allowed: true,
          reason: "Allowed in PUBLIC_BETA",
        },
        data_category: "sentiment",
        records: [
          {
            record_type: "fear_greed_index",
            value: fearGreedValue,
            value_classification: "Fear",
            timestamp: "2026-06-24T00:00:00.000Z",
            time_until_update: "12345",
          },
        ],
        warnings: [],
        errors: [],
      },
      {
        source_id: "defillama_api",
        source_name: "DefiLlama API",
        mode: "live",
        fetched_at: "2026-06-24T00:00:02.000Z",
        policy: {
          environment: "PUBLIC_BETA",
          action: "live_fetch",
          allowed: true,
          reason: "Allowed in PUBLIC_BETA",
        },
        data_category: "defi_context",
        records: [
          {
            record_type: "defi_protocol_snapshot",
            name: "Lido",
            chain: "Ethereum",
            tvl_usd: 35400000000,
            change_1d: 0.75,
            change_7d: -2.1,
            url: "https://lido.fi",
          },
          {
            record_type: "defi_protocol_snapshot",
            name: "Uniswap V3",
            chain: "Ethereum",
            tvl_usd: 4200000000,
            change_1d: 1.2,
            change_7d: 3.4,
            url: "https://app.uniswap.org",
          },
        ],
        warnings: [],
        errors: [],
      },
    ],
    summary: {
      sources_requested: 2,
      sources_allowed: 2,
      sources_denied: 0,
      records_total: 3,
      warnings_total: 0,
      errors_total: 0,
    },
  };
}

function getJson(url: string): Promise<unknown> {
  return new Promise((resolveRequest, rejectRequest) => {
    const request = get(url, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        if (response.statusCode !== 200) {
          rejectRequest(new Error(`GET ${url} failed with HTTP ${response.statusCode}: ${body}`));
          return;
        }

        try {
          resolveRequest(JSON.parse(body));
        } catch (error) {
          rejectRequest(error);
        }
      });
    });
    request.on("error", rejectRequest);
  });
}

function createMemoryStorage(initial: Record<string, string> = {}): StorageLike {
  const values = new Map(Object.entries(initial));

  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
    removeItem(key: string) {
      values.delete(key);
    },
  };
}
