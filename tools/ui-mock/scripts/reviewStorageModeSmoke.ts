import assert from "node:assert/strict";
import { mkdir, rm } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createScannerApiServer } from "../server/scannerApiServer.js";
import type { ReviewSessionState } from "../src/types/reviewSessionTypes.js";

type ReviewStorageMode = "file" | "sqlite";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const uiMockRoot = resolve(scriptDir, "..");
const localDir = resolve(uiMockRoot, ".local");
const modeArg = process.argv[2] ?? "both";

const sourceKinds: Record<ReviewStorageMode, {
  session: string;
  diagnostics: string;
}> = {
  file: {
    session: "file-backed-review-session",
    diagnostics: "file-backed-review-session-diagnostics",
  },
  sqlite: {
    session: "sqlite-review-session",
    diagnostics: "sqlite-review-session-diagnostics",
  },
};

const validState: ReviewSessionState = {
  version: 1,
  entries: {
    "smoke-pass": {
      candidate_id: "smoke-pass",
      status: "saved_for_follow_up",
      note: "Smoke test note",
      updated_at: new Date().toISOString(),
    },
  },
};

try {
  const modes = parseModeArg(modeArg);

  for (const mode of modes) {
    await runSmoke(mode);
  }

  console.log(`Review storage smoke passed for: ${modes.join(", ")}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function parseModeArg(value: string): ReviewStorageMode[] {
  if (value === "file") return ["file"];
  if (value === "sqlite") return ["sqlite"];
  if (value === "both") return ["file", "sqlite"];

  throw new Error("Usage: reviewStorageModeSmoke.ts file|sqlite|both");
}

async function runSmoke(mode: ReviewStorageMode): Promise<void> {
  await mkdir(localDir, { recursive: true });

  if (mode === "sqlite") {
    await assertNodeSqliteAvailable();
  }

  const storageFile = resolveStorageFile(mode);
  await removeStorageFile(storageFile);

  const previousProvider = process.env.CRYPTO_EDGE_REVIEW_STORAGE_PROVIDER;
  const previousSqlitePath = process.env.CRYPTO_EDGE_REVIEW_SQLITE_PATH;
  const server = createScannerApiServer(configureMode(mode, storageFile));

  try {
    await listen(server);
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const initialState = await getJson(`${baseUrl}/api/review-session`) as ReviewSessionState & {
      _source_meta: { source_kind: string };
    };
    assert.equal(initialState._source_meta.source_kind, sourceKinds[mode].session);
    assert.deepEqual(pickReviewState(initialState), { version: 1, entries: {} });

    const initialDiagnostics = await getJson(`${baseUrl}/api/review-session/diagnostics`) as Record<string, unknown>;
    assert.equal(initialDiagnostics.source_kind, sourceKinds[mode].diagnostics);
    assertDiagnosticsSafe(initialDiagnostics);

    const putResponse = await requestJson(`${baseUrl}/api/review-session`, {
      method: "PUT",
      body: validState,
    });
    assert.equal(putResponse.statusCode, 200);
    assert.equal(
      (putResponse.body as { _source_meta?: { source_kind?: string } })._source_meta?.source_kind,
      sourceKinds[mode].session,
    );
    assert.deepEqual(pickReviewState(putResponse.body), validState);

    const savedState = await getJson(`${baseUrl}/api/review-session`);
    assert.deepEqual(pickReviewState(savedState), validState);

    const savedDiagnostics = await getJson(`${baseUrl}/api/review-session/diagnostics`) as Record<string, unknown>;
    assert.equal(savedDiagnostics.source_kind, sourceKinds[mode].diagnostics);
    assert.equal(savedDiagnostics.entries_count, 1);
    assert.equal(savedDiagnostics.valid, true);
    assertDiagnosticsSafe(savedDiagnostics);

    const invalidPutResponse = await requestJson(`${baseUrl}/api/review-session`, {
      method: "PUT",
      body: {
        version: 2,
        entries: {},
      },
    });
    assert.equal(invalidPutResponse.statusCode, 400);

    const stateAfterInvalidPut = await getJson(`${baseUrl}/api/review-session`);
    assert.deepEqual(pickReviewState(stateAfterInvalidPut), validState);

    const diagnosticsAfterInvalidPut = await getJson(`${baseUrl}/api/review-session/diagnostics`) as Record<string, unknown>;
    assert.equal(diagnosticsAfterInvalidPut.source_kind, sourceKinds[mode].diagnostics);
    assert.equal(diagnosticsAfterInvalidPut.entries_count, 1);
    assert.equal(diagnosticsAfterInvalidPut.valid, true);
    assertDiagnosticsSafe(diagnosticsAfterInvalidPut);

    console.log(`Review storage ${mode} smoke OK`);
  } finally {
    await close(server);
    restoreOptionalEnv("CRYPTO_EDGE_REVIEW_STORAGE_PROVIDER", previousProvider);
    restoreOptionalEnv("CRYPTO_EDGE_REVIEW_SQLITE_PATH", previousSqlitePath);
    await removeStorageFile(storageFile);
  }
}

function configureMode(mode: ReviewStorageMode, storageFile: string) {
  if (mode === "file") {
    delete process.env.CRYPTO_EDGE_REVIEW_STORAGE_PROVIDER;
    delete process.env.CRYPTO_EDGE_REVIEW_SQLITE_PATH;

    return {
      reviewSession: {
        storageFilePath: storageFile,
      },
    };
  }

  process.env.CRYPTO_EDGE_REVIEW_STORAGE_PROVIDER = "sqlite";
  process.env.CRYPTO_EDGE_REVIEW_SQLITE_PATH = storageFile;

  return {};
}

function resolveStorageFile(mode: ReviewStorageMode): string {
  if (mode === "file") {
    return resolve(localDir, "review-session-smoke.json");
  }

  return resolve(process.env.CRYPTO_EDGE_REVIEW_SQLITE_PATH ?? resolve(localDir, "review-session-smoke.sqlite"));
}

async function assertNodeSqliteAvailable(): Promise<void> {
  try {
    await import("node:sqlite");
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `ERROR: node:sqlite jest niedostępny w tej wersji Node. Tryb SQLite smoke wymaga Node z wbudowanym node:sqlite. Szczegóły: ${detail}`,
    );
  }
}

function pickReviewState(value: unknown): ReviewSessionState {
  assert.ok(isRecord(value));
  assert.equal(value.version, 1);
  assert.ok(isRecord(value.entries));

  return {
    version: 1,
    entries: value.entries as ReviewSessionState["entries"],
  };
}

function assertDiagnosticsSafe(diagnostics: Record<string, unknown>): void {
  assert.equal(Object.prototype.hasOwnProperty.call(diagnostics, "entries"), false);

  const serialized = JSON.stringify(diagnostics);
  assert.equal(serialized.includes("Smoke test note"), false);
  assert.equal(serialized.includes("smoke-pass"), false);
}

async function getJson(url: string): Promise<unknown> {
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

async function removeStorageFile(storageFile: string): Promise<void> {
  await rm(storageFile, { force: true });
  await rm(`${storageFile}-shm`, { force: true });
  await rm(`${storageFile}-wal`, { force: true });
}

function restoreOptionalEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
