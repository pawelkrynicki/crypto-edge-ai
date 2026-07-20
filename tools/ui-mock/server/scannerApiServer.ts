import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import {
  ContextOutputError,
  type LatestContextOutputOptions,
  readLatestContextOutput,
} from "./latestContextOutput.js";
import {
  getScannerSourcesDiagnostics,
  type LatestScannerOutputOptions,
  readLatestScannerOutput,
  ScannerOutputError,
} from "./latestScannerOutput.js";
import type { ReviewSessionFileStoreOptions } from "./reviewSessionFileStore.js";
import { createConfiguredReviewSessionStorageProvider } from "./reviewSessionProviderConfig.js";
import {
  ReviewSessionStorageProviderError,
  type ReviewSessionStorageProvider,
  type ReviewSessionStorageResult,
} from "./reviewSessionStorageProvider.js";
import {
  resolveProductRuntimeMode,
  type ProductRuntimeMode,
  type ResolvedProductRuntimeMode,
} from "../src/runtimeMode.js";

const DEFAULT_PORT = 5177;
const port = Number.parseInt(process.env.SCANNER_API_PORT ?? String(DEFAULT_PORT), 10);
const DEMO_CORS_ORIGINS = new Set(["http://127.0.0.1:5173", "http://localhost:5173"]);

export type ScannerApiServerOptions = {
  runtimeMode?: ProductRuntimeMode | string;
  scanner?: LatestScannerOutputOptions;
  context?: LatestContextOutputOptions;
  reviewSession?: ReviewSessionFileStoreOptions;
  reviewSessionProvider?: ReviewSessionStorageProvider;
};

export function createScannerApiServer(options: ScannerApiServerOptions = {}) {
  const runtimeMode = resolveProductRuntimeMode(options.runtimeMode ?? process.env.CRYPTO_EDGE_RUNTIME_MODE);
  const reviewSessionProvider = options.reviewSessionProvider
    ?? createConfiguredReviewSessionStorageProvider({ reviewSession: options.reviewSession });
  const scannerOptions: LatestScannerOutputOptions = { ...options.scanner, runtimeMode };
  const contextOptions: LatestContextOutputOptions = { ...options.context, runtimeMode };

  return createServer(async (req, res) => {
    const path = getRequestPath(req.url);

    if (req.method === "OPTIONS") {
      sendEmpty(req, res, isCorsOriginDenied(req, runtimeMode) ? 403 : 204, runtimeMode);
      return;
    }

    if (req.method === "GET" && path === "/api/health") {
      sendJson(req, res, 200, {
        status: "ok",
        service: "crypto-edge-ai-scanner-api",
        runtime_mode: runtimeMode,
      }, runtimeMode);
      return;
    }

    if (req.method === "GET" && path === "/api/readiness") {
      const [scanner, context] = await Promise.all([
        getReadinessEntry(() => readLatestScannerOutput(scannerOptions)),
        getReadinessEntry(() => readLatestContextOutput(contextOptions)),
      ]);
      const discovery = buildDiscoveryReadiness(scanner, context);
      const scannerReadiness = publicScannerReadinessEntry(scanner);
      const ready = scanner.ready;
      const degraded = ready && (
        scannerReadiness.freshness_status === "STALE"
        || !context.ready
        || discovery.new_emerging.status === "degraded"
      );
      sendJson(req, res, ready ? 200 : 503, {
        status: !ready
          ? "not_ready"
          : degraded
            ? "degraded"
            : discovery.established.status === "empty_configured" ? "ready_with_empty_established_universe" : "ready",
        runtime_mode: runtimeMode,
        ready,
        process: { ready: true, reason_code: null },
        scanner: scannerReadiness,
        context: publicReadinessEntry(context),
        new_emerging: discovery.new_emerging,
        established: discovery.established,
        discovery,
        reason_codes: [
          scannerReadiness.reason_code,
          context.reason_code,
          discovery.new_emerging.reason_code,
          discovery.established.reason_code,
        ].filter(isString),
      }, runtimeMode);
      return;
    }

    if (req.method === "GET" && path === "/api/context/latest") {
      try {
        sendJson(req, res, 200, await readLatestContextOutput(contextOptions), runtimeMode);
      } catch (error) {
        sendDataUnavailable(req, res, errorCode(error, "CONTEXT_OUTPUT_UNAVAILABLE"), runtimeMode);
      }
      return;
    }

    if (req.method === "GET" && path === "/api/scanner/latest") {
      try {
        sendJson(req, res, 200, await readLatestScannerOutput(scannerOptions), runtimeMode);
      } catch (error) {
        sendDataUnavailable(req, res, errorCode(error, "SCANNER_OUTPUT_UNAVAILABLE"), runtimeMode);
      }
      return;
    }

    if (req.method === "GET" && path === "/api/scanner/sources") {
      try {
        sendJson(req, res, 200, await getScannerSourcesDiagnostics(scannerOptions), runtimeMode);
      } catch {
        sendDataUnavailable(req, res, "SCANNER_SOURCES_UNAVAILABLE", runtimeMode);
      }
      return;
    }

    if (req.method === "GET" && path === "/api/review-session") {
      sendReviewSessionJson(req, res, 200, await reviewSessionProvider.read(), runtimeMode);
      return;
    }

    if (req.method === "GET" && path === "/api/review-session/diagnostics") {
      try {
        sendJson(req, res, 200, await reviewSessionProvider.diagnostics(), runtimeMode);
      } catch {
        sendJson(req, res, 500, {
          error: "review_session_diagnostics_unavailable",
          message: "Review session storage diagnostics are unavailable",
        }, runtimeMode);
      }
      return;
    }

    if (req.method === "PUT" && path === "/api/review-session") {
      try {
        const body = await readJsonBody(req);
        sendReviewSessionJson(req, res, 200, await reviewSessionProvider.write(body), runtimeMode);
      } catch (error) {
        if (error instanceof RequestBodyError || (
          error instanceof ReviewSessionStorageProviderError
          && error.code === "invalid_review_session"
        )) {
          sendJson(req, res, 400, {
            error: "invalid_review_session",
            message: error.message,
          }, runtimeMode);
          return;
        }
        sendJson(req, res, 500, {
          error: "review_session_storage_unavailable",
          message: "Review session storage could not be written",
        }, runtimeMode);
      }
      return;
    }

    sendJson(req, res, 404, {
      error: "not_found",
      message: "Route not found",
    }, runtimeMode);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = createScannerApiServer();
  server.listen(port, "127.0.0.1", () => {
    console.log(`Scanner API listening on http://127.0.0.1:${port}`);
  });
}

function sendDataUnavailable(
  req: IncomingMessage,
  res: ServerResponse,
  reasonCode: string,
  runtimeMode: ResolvedProductRuntimeMode,
): void {
  sendJson(req, res, 503, {
    status: "data_unavailable",
    reason_code: reasonCode,
    message: "Data Unavailable",
  }, runtimeMode);
}

function sendJson(
  req: IncomingMessage,
  res: ServerResponse,
  status: number,
  body: unknown,
  runtimeMode: ResolvedProductRuntimeMode,
) {
  res.writeHead(status, responseHeaders(req, runtimeMode));
  res.end(JSON.stringify(body));
}

function sendEmpty(
  req: IncomingMessage,
  res: ServerResponse,
  status: number,
  runtimeMode: ResolvedProductRuntimeMode,
): void {
  res.writeHead(status, responseHeaders(req, runtimeMode));
  res.end();
}

function responseHeaders(req: IncomingMessage, runtimeMode: ResolvedProductRuntimeMode): Record<string, string> {
  const headers: Record<string, string> = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store, max-age=0",
    "x-content-type-options": "nosniff",
  };
  const origin = req.headers.origin;

  if (runtimeMode === "DEVELOPMENT_DEMO" && origin && DEMO_CORS_ORIGINS.has(origin)) {
    headers["access-control-allow-origin"] = origin;
    headers["access-control-allow-methods"] = "GET, PUT, OPTIONS";
    headers["access-control-allow-headers"] = "content-type";
    headers.vary = "Origin";
  }

  return headers;
}

function isCorsOriginDenied(req: IncomingMessage, runtimeMode: ResolvedProductRuntimeMode): boolean {
  const origin = req.headers.origin;
  if (!origin) return false;
  return runtimeMode !== "DEVELOPMENT_DEMO" || !DEMO_CORS_ORIGINS.has(origin);
}

function sendReviewSessionJson(
  req: IncomingMessage,
  res: ServerResponse,
  status: number,
  result: ReviewSessionStorageResult,
  runtimeMode: ResolvedProductRuntimeMode,
) {
  sendJson(req, res, status, { ...result.state, _source_meta: result._source_meta }, runtimeMode);
}

async function getReadinessEntry(read: () => Promise<unknown>): Promise<{
  ready: boolean;
  reason_code: string | null;
  value?: unknown;
}> {
  try {
    return { ready: true, reason_code: null, value: await read() };
  } catch (error) {
    return { ready: false, reason_code: errorCode(error, "DATA_UNAVAILABLE") };
  }
}

type ReadinessEntry = Awaited<ReturnType<typeof getReadinessEntry>>;

function publicReadinessEntry(entry: ReadinessEntry): { ready: boolean; reason_code: string | null } {
  return { ready: entry.ready, reason_code: entry.reason_code };
}

function publicScannerReadinessEntry(entry: ReadinessEntry): {
  ready: boolean;
  status: "ready" | "stale" | "unavailable";
  reason_code: string | null;
  freshness_status: "FRESH" | "STALE" | null;
  generated_at: string | null;
  age_seconds: number | null;
} {
  if (!entry.ready || !isRecord(entry.value)) {
    return {
      ready: false,
      status: "unavailable",
      reason_code: entry.reason_code,
      freshness_status: null,
      generated_at: null,
      age_seconds: null,
    };
  }
  const meta = isRecord(entry.value._source_meta) ? entry.value._source_meta : null;
  const provenance = isRecord(entry.value.provenance) ? entry.value.provenance : null;
  const freshnessStatus = meta?.freshness_status === "STALE" ? "STALE" : "FRESH";
  return {
    ready: true,
    status: freshnessStatus === "STALE" ? "stale" : "ready",
    reason_code: freshnessStatus === "STALE" ? "SCANNER_SNAPSHOT_STALE" : null,
    freshness_status: freshnessStatus,
    generated_at: typeof provenance?.generated_at === "string" ? provenance.generated_at : null,
    age_seconds: typeof meta?.age_seconds === "number" ? meta.age_seconds : null,
  };
}

function buildDiscoveryReadiness(scanner: ReadinessEntry, context: ReadinessEntry) {
  if (!scanner.ready || !isRecord(scanner.value)) {
    const reasonCode = scanner.reason_code ?? "SCANNER_OUTPUT_UNAVAILABLE";
    return {
      new_emerging: { ready: false, status: "unavailable", reason_code: reasonCode },
      established: { ready: false, configured: false, status: "unavailable", reason_code: reasonCode },
    };
  }
  const provenance = isRecord(scanner.value.provenance) ? scanner.value.provenance : null;
  const metadata = provenance && isRecord(provenance.metadata) ? provenance.metadata : null;
  const readiness = metadata && isRecord(metadata.readiness) ? metadata.readiness : null;
  if (!readiness) {
    return {
      new_emerging: { ready: false, status: "unavailable", reason_code: "SCANNER_METADATA_INVALID" },
      established: { ready: false, configured: false, status: "unavailable", reason_code: "SCANNER_METADATA_INVALID" },
    };
  }
  const newEmergingReady = readiness.new_emerging === "READY";
  const newEmergingDegraded = readiness.new_emerging === "DEGRADED";
  const establishedEmpty = readiness.established === "EMPTY_CONFIGURED";
  return {
    new_emerging: {
      ready: newEmergingReady || newEmergingDegraded,
      status: newEmergingDegraded ? "degraded" : newEmergingReady ? "ready" : "unavailable",
      reason_code: newEmergingDegraded
        ? "DEXSCREENER_PARTIAL_COVERAGE"
        : newEmergingReady ? null : "NEW_EMERGING_UNAVAILABLE",
    },
    established: establishedEmpty
      ? {
        ready: false,
        configured: true,
        status: "empty_configured",
        reason_code: "ESTABLISHED_UNIVERSE_EMPTY",
      }
      : {
        ready: readiness.established === "READY",
        configured: true,
        status: readiness.established === "READY" ? "ready" : "unavailable",
        reason_code: readiness.established === "READY" ? null : "ESTABLISHED_UNAVAILABLE",
      },
    context: publicReadinessEntry(context),
  };
}

function errorCode(error: unknown, fallback: string): string {
  if (error instanceof ScannerOutputError || error instanceof ContextOutputError) return error.code;
  return fallback;
}

function getRequestPath(url: string | undefined): string {
  return url?.split("?")[0] ?? "/";
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

class RequestBodyError extends Error {
  readonly code: "invalid_json" | "body_too_large";

  constructor(code: RequestBodyError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.length;
    if (totalBytes > 1_000_000) {
      throw new RequestBodyError("body_too_large", "Review session request body is too large.");
    }
    chunks.push(buffer);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new RequestBodyError("invalid_json", "Request body must be valid ReviewSessionState JSON.");
  }
}
