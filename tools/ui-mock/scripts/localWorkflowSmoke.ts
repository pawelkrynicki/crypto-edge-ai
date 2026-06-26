import assert from "node:assert/strict";
import { mkdir, rm } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createScannerApiServer } from "../server/scannerApiServer.js";
import { mapPersistableScannerOutputToUiCandidates } from "../src/adapters/scannerOutputAdapter";
import { CandidateDetail } from "../src/components/CandidateDetail";
import { MarketContextPanel } from "../src/components/MarketContextPanel";
import { WatchlistTab } from "../src/components/WatchlistTab";
import { toMockCandidate } from "../src/mockData";
import { interpretContextApiOutput, parseMarketContextApiOutput } from "../src/services/contextDataSource";
import {
  createEmptyReviewSession,
  createReviewSessionExport,
  mergeReviewSessionState,
  parseReviewSessionImport,
} from "../src/services/reviewSessionStore";
import { interpretScannerApiOutput } from "../src/services/scannerDataSource";
import type { ReviewSessionState } from "../src/types/reviewSessionTypes";
import type { ScannerApiOutput, UiTokenCandidate } from "../src/types/scannerTypes";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const uiMockRoot = resolve(scriptDir, "..");
const localDir = resolve(uiMockRoot, ".local");
const storageFile = resolve(localDir, "local-workflow-smoke-review-session.json");
const smokeNote = "Local workflow smoke note";

try {
  await runSmoke();
  console.log("LOCAL WORKFLOW SMOKE OK");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

async function runSmoke(): Promise<void> {
  await mkdir(localDir, { recursive: true });
  await removeSmokeStorageFile(storageFile);

  const server = createScannerApiServer({
    reviewSession: {
      storageFilePath: storageFile,
    },
  });

  try {
    await listen(server);
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const health = await getJson(`${baseUrl}/api/health`);
    assertRecord(health, "health response");
    assert.equal(health.status, "ok");
    assert.equal(health.service, "crypto-edge-ai-scanner-api");

    const scannerSources = await getJson(`${baseUrl}/api/scanner/sources`);
    assertRecord(scannerSources, "scanner sources response");
    assert.equal(typeof scannerSources.output_dir_exists, "boolean");
    assert.equal(typeof scannerSources.fixture_fallback_available, "boolean");
    assert.ok(Array.isArray(scannerSources.runs));

    const scannerLatest = await getJson(`${baseUrl}/api/scanner/latest`) as ScannerApiOutput;
    const scannerResult = interpretScannerApiOutput(scannerLatest);
    const scannerOutput = scannerResult.output;
    assert.ok(scannerOutput.candidates.length > 0, "scanner latest must include candidates");
    assert.ok(
      scannerOutput.candidates.every((candidate) => candidate.candidate_id.length > 0),
      "all scanner candidates must include candidate_id",
    );

    const uiCandidates = mapPersistableScannerOutputToUiCandidates(scannerOutput);
    assert.equal(
      uiCandidates.length,
      scannerOutput.candidates.length,
      "scanner output must map to the same number of UI candidates",
    );

    const uiCandidatesById = new Map(uiCandidates.map((candidate) => [candidate.id, candidate]));
    for (const candidate of scannerOutput.candidates) {
      const uiCandidate = uiCandidatesById.get(candidate.candidate_id);
      assert.ok(uiCandidate, `UI candidate missing for ${candidate.candidate_id}`);
      assert.equal(uiCandidate.finalLabel, candidate.final_label, "adapter must preserve final_label");
    }

    const reviewUiCandidate = chooseReviewCandidate(uiCandidates);
    const reviewCandidate = scannerOutput.candidates.find(
      (candidate) => candidate.candidate_id === reviewUiCandidate.id,
    );
    assert.ok(reviewCandidate, "selected review candidate must come from scanner latest");
    assert.equal(reviewUiCandidate.id, reviewCandidate.candidate_id);
    assert.equal(reviewUiCandidate.finalLabel, reviewCandidate.final_label);
    console.log(`Scanner latest source: ${scannerResult.resolvedSource}`);

    const contextLatest = parseMarketContextApiOutput(await getJson(`${baseUrl}/api/context/latest`));
    const contextResult = interpretContextApiOutput(contextLatest);
    assert.equal(contextResult.status, "ready");
    assert.ok(contextLatest.sources.length > 0, "context latest must include source summaries");
    assert.ok(
      contextLatest._source_meta.source_kind === "approved-sources-output"
        || contextLatest._source_meta.source_kind === "fixture-fallback",
      "context latest must resolve to real output or fixture fallback",
    );
    console.log(`Context latest source: ${contextResult.resolvedSource}`);

    const initialStateResponse = await getJson(`${baseUrl}/api/review-session`);
    assert.deepEqual(pickReviewState(initialStateResponse), createEmptyReviewSession());

    const initialDiagnostics = await getJson(`${baseUrl}/api/review-session/diagnostics`);
    assertDiagnostics(initialDiagnostics, {
      expectedEntriesCount: 0,
      candidateId: reviewUiCandidate.id,
    });

    const validState = buildReviewState(reviewUiCandidate.id);
    const putResponse = await requestJson(`${baseUrl}/api/review-session`, {
      method: "PUT",
      body: validState,
    });
    assert.equal(putResponse.statusCode, 200);
    assert.deepEqual(pickReviewState(putResponse.body), validState);

    const savedStateResponse = await getJson(`${baseUrl}/api/review-session`);
    assert.deepEqual(pickReviewState(savedStateResponse), validState);

    const savedDiagnostics = await getJson(`${baseUrl}/api/review-session/diagnostics`);
    assertDiagnostics(savedDiagnostics, {
      expectedEntriesCount: 1,
      candidateId: reviewUiCandidate.id,
    });

    const invalidPutResponse = await requestJson(`${baseUrl}/api/review-session`, {
      method: "PUT",
      body: {
        version: 2,
        entries: {},
      },
    });
    assert.equal(invalidPutResponse.statusCode, 400);

    const stateAfterInvalidPut = await getJson(`${baseUrl}/api/review-session`);
    assert.deepEqual(
      pickReviewState(stateAfterInvalidPut),
      validState,
      "invalid PUT must not overwrite the saved review state",
    );

    const diagnosticsAfterInvalidPut = await getJson(`${baseUrl}/api/review-session/diagnostics`);
    assertDiagnostics(diagnosticsAfterInvalidPut, {
      expectedEntriesCount: 1,
      candidateId: reviewUiCandidate.id,
    });

    assertReviewExportImport(validState, reviewUiCandidate.id);
    assertUiSmoke({
      contextLatest,
      contextFallbackReason: contextResult.usedFallback ? contextResult.fallbackReason : undefined,
      reviewState: validState,
      uiCandidates,
      reviewUiCandidate,
    });
  } finally {
    await close(server);
    await removeSmokeStorageFile(storageFile);
  }
}

function chooseReviewCandidate(candidates: UiTokenCandidate[]): UiTokenCandidate {
  const watchlistCandidate = candidates.find((candidate) => candidate.finalLabel === "WATCHLIST");
  return watchlistCandidate ?? candidates[0];
}

function buildReviewState(candidateId: string): ReviewSessionState {
  return {
    version: 1,
    entries: {
      [candidateId]: {
        candidate_id: candidateId,
        status: "saved_for_follow_up",
        note: smokeNote,
        updated_at: new Date().toISOString(),
      },
    },
  };
}

function assertReviewExportImport(state: ReviewSessionState, candidateId: string): void {
  const exported = createReviewSessionExport(state);
  assert.ok(exported.includes(candidateId), "review export must include candidate_id");
  assert.ok(exported.includes(smokeNote), "review export must include analyst note");

  const parsed = parseReviewSessionImport(exported);
  assert.equal(parsed.ok, true, parsed.ok ? undefined : parsed.error);

  if (!parsed.ok) return;

  assert.equal(parsed.entries_count, 1);
  assert.equal(parsed.state.entries[candidateId]?.candidate_id, candidateId);
  assert.equal(parsed.state.entries[candidateId]?.status, "saved_for_follow_up");
  assert.equal(parsed.state.entries[candidateId]?.note, smokeNote);

  const merged = mergeReviewSessionState(createEmptyReviewSession(), parsed.state, "merge");
  assert.deepEqual(merged.entries[candidateId], state.entries[candidateId]);
}

function assertUiSmoke({
  contextLatest,
  contextFallbackReason,
  reviewState,
  uiCandidates,
  reviewUiCandidate,
}: {
  contextLatest: ReturnType<typeof parseMarketContextApiOutput>;
  contextFallbackReason?: string;
  reviewState: ReviewSessionState;
  uiCandidates: UiTokenCandidate[];
  reviewUiCandidate: UiTokenCandidate;
}): void {
  const mockCandidates = uiCandidates.map(toMockCandidate);
  const reviewCandidate = toMockCandidate(reviewUiCandidate);
  const reviewRecord = reviewState.entries[reviewUiCandidate.id];

  const marketContextMarkup = renderToStaticMarkup(React.createElement(MarketContextPanel, {
    state: {
      status: "ready",
      context: contextLatest,
      message: contextFallbackReason,
    },
  }));
  assertMarkupIncludes(marketContextMarkup, "Market Context", "MarketContextPanel");
  assertMarkupIncludes(marketContextMarkup, "not a buy/sell signal", "MarketContextPanel");

  const candidateDetailMarkup = renderToStaticMarkup(React.createElement(CandidateDetail, {
    candidate: reviewCandidate,
    marketContextState: {
      status: "ready",
      context: contextLatest,
      message: contextFallbackReason,
    },
    reviewRecord,
    onSaveReview: () => undefined,
    onClearReview: () => undefined,
  }));
  assertMarkupIncludes(candidateDetailMarkup, reviewCandidate.symbol, "CandidateDetail");
  assertMarkupIncludes(candidateDetailMarkup, "Saved for follow-up", "CandidateDetail");
  assertMarkupIncludes(candidateDetailMarkup, smokeNote, "CandidateDetail");
  assertMarkupIncludes(candidateDetailMarkup, "not a buy/sell signal", "CandidateDetail");

  const watchlistMarkup = renderToStaticMarkup(React.createElement(WatchlistTab, {
    candidates: mockCandidates,
    reviewSession: reviewState,
    reviewStorageStatus: {
      tone: "ready",
      text: "Local workflow smoke storage",
      detail: storageFile,
    },
    onClearReview: () => undefined,
    onOpenCandidate: () => undefined,
    onImportReviewSession: () => undefined,
    onResetReviewSession: async () => ({
      status: "ready",
      message: "Local workflow smoke reset skipped.",
    }),
  }));
  assertMarkupIncludes(watchlistMarkup, "Review Queue", "WatchlistTab");
  assertMarkupIncludes(watchlistMarkup, "Review status does not change scanner labels", "WatchlistTab");
  assertMarkupIncludes(watchlistMarkup, "not a buy/sell signal", "WatchlistTab");
  assert.ok(
    watchlistMarkup.includes(reviewCandidate.symbol) || watchlistMarkup.includes(reviewCandidate.id),
    "WatchlistTab must render the selected candidate symbol or candidate_id",
  );
}

function assertMarkupIncludes(markup: string, expected: string, componentName: string): void {
  assert.ok(
    markup.includes(expected),
    `${componentName} markup must include "${expected}"`,
  );
}

function pickReviewState(value: unknown): ReviewSessionState {
  assertRecord(value, "review session response");
  assert.equal(value.version, 1);
  assertRecord(value.entries, "review session entries");

  return {
    version: 1,
    entries: value.entries as ReviewSessionState["entries"],
  };
}

function assertDiagnostics(
  value: unknown,
  options: { expectedEntriesCount: number; candidateId: string },
): void {
  assertRecord(value, "review session diagnostics");
  assert.equal(value.valid, true);
  assert.equal(value.entries_count, options.expectedEntriesCount);
  assert.equal(Object.prototype.hasOwnProperty.call(value, "entries"), false);

  const serialized = JSON.stringify(value);
  assert.equal(serialized.includes(smokeNote), false, "diagnostics must not expose analyst notes");
  assert.equal(serialized.includes(options.candidateId), false, "diagnostics must not expose review entries");
}

async function getJson(url: string): Promise<unknown> {
  assertLocalLoopbackUrl(url);
  const response = await fetch(url);
  const body = await response.json() as unknown;

  if (!response.ok) {
    throw new Error(`GET ${url} failed with HTTP ${response.status}: ${JSON.stringify(body)}`);
  }

  return body;
}

async function requestJson(
  url: string,
  options: { method: "PUT"; body: unknown },
): Promise<{ statusCode: number; body: unknown }> {
  assertLocalLoopbackUrl(url);
  const response = await fetch(url, {
    method: options.method,
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(options.body),
  });

  return {
    statusCode: response.status,
    body: await response.json() as unknown,
  };
}

function assertLocalLoopbackUrl(url: string): void {
  const parsed = new URL(url);
  assert.equal(parsed.protocol, "http:");
  assert.equal(parsed.hostname, "127.0.0.1");
}

function listen(server: ReturnType<typeof createScannerApiServer>): Promise<void> {
  return new Promise((resolveListen) => {
    server.listen(0, "127.0.0.1", resolveListen);
  });
}

function close(server: ReturnType<typeof createScannerApiServer>): Promise<void> {
  return new Promise((resolveClose, rejectClose) => {
    server.close((error) => {
      if (error) rejectClose(error);
      else resolveClose();
    });
  });
}

async function removeSmokeStorageFile(filePath: string): Promise<void> {
  assertSmokeStorageFile(filePath);
  await rm(filePath, { force: true });
  await rm(`${filePath}-shm`, { force: true });
  await rm(`${filePath}-wal`, { force: true });
}

function assertSmokeStorageFile(filePath: string): void {
  const resolvedFile = resolve(filePath);
  const resolvedLocalDir = resolve(localDir);
  const pathFromLocalDir = relative(resolvedLocalDir, resolvedFile);
  const fileName = basename(resolvedFile);
  const isUnderLocalDir = pathFromLocalDir.length > 0
    && !pathFromLocalDir.startsWith("..")
    && !isAbsolute(pathFromLocalDir);
  const isSmokeFile = fileName.includes("local-workflow-smoke");
  const isProtectedReviewFile = fileName === "review-session.json" || fileName === "review-session.sqlite";

  if (!isUnderLocalDir || !isSmokeFile || isProtectedReviewFile) {
    throw new Error(`Refusing to remove non-smoke review storage file: ${resolvedFile}`);
  }
}

function assertRecord(value: unknown, subject: string): asserts value is Record<string, unknown> {
  assert.ok(
    typeof value === "object" && value !== null && !Array.isArray(value),
    `${subject} must be a JSON object`,
  );
}
