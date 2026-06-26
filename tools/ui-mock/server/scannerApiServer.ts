import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import { type LatestContextOutputOptions, readLatestContextOutput } from "./latestContextOutput.js";
import {
  getScannerSourcesDiagnostics,
  INVALID_SCANNER_OUTPUT,
  readLatestScannerOutput,
  ScannerOutputError,
} from "./latestScannerOutput.js";
import {
  readReviewSessionFile,
  ReviewSessionFileStoreError,
  writeReviewSessionFile,
  type ReviewSessionFileStoreOptions,
  type ReviewSessionFileStoreResult,
} from "./reviewSessionFileStore.js";

const DEFAULT_PORT = 5177;
const port = Number.parseInt(process.env.SCANNER_API_PORT ?? String(DEFAULT_PORT), 10);

const headers = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, PUT, OPTIONS",
  "access-control-allow-headers": "content-type",
  "content-type": "application/json; charset=utf-8",
};

export type ScannerApiServerOptions = {
  context?: LatestContextOutputOptions;
  reviewSession?: ReviewSessionFileStoreOptions;
};

export function createScannerApiServer(options: ScannerApiServerOptions = {}) {
  return createServer(async (req, res) => {
    const path = getRequestPath(req.url);

    if (req.method === "OPTIONS") {
      res.writeHead(204, headers);
      res.end();
      return;
    }

    if (req.method === "GET" && path === "/api/health") {
      sendJson(res, 200, {
        status: "ok",
        service: "crypto-edge-ai-scanner-api",
      });
      return;
    }

    if (req.method === "GET" && path === "/api/context/latest") {
      try {
        const output = await readLatestContextOutput(options.context);
        sendJson(res, 200, output);
      } catch {
        sendJson(res, 500, {
          error: "context_output_unavailable",
          message: "Approved source context output is unavailable",
        });
      }
      return;
    }

    if (req.method === "GET" && path === "/api/scanner/latest") {
      try {
        const output = await readLatestScannerOutput();
        sendJson(res, 200, output);
      } catch (error) {
        if (error instanceof ScannerOutputError && error.code === INVALID_SCANNER_OUTPUT) {
          sendJson(res, 500, {
            error: "invalid_scanner_output",
            message: "Scanner output does not match expected PersistableScannerOutput shape",
          });
          return;
        }

        sendJson(res, 500, {
          error: "scanner_output_unavailable",
          message: "Scanner output file is unavailable",
        });
      }
      return;
    }

    if (req.method === "GET" && path === "/api/scanner/sources") {
      try {
        const diagnostics = await getScannerSourcesDiagnostics();
        sendJson(res, 200, diagnostics);
      } catch {
        sendJson(res, 500, {
          error: "scanner_sources_unavailable",
          message: "Scanner source diagnostics are unavailable",
        });
      }
      return;
    }

    if (req.method === "GET" && path === "/api/review-session") {
      const output = await readReviewSessionFile(options.reviewSession);
      sendReviewSessionJson(res, 200, output);
      return;
    }

    if (req.method === "PUT" && path === "/api/review-session") {
      try {
        const body = await readJsonBody(req);
        const output = await writeReviewSessionFile(body, options.reviewSession);
        sendReviewSessionJson(res, 200, output);
      } catch (error) {
        if (error instanceof RequestBodyError || (
          error instanceof ReviewSessionFileStoreError
          && error.code === "invalid_review_session"
        )) {
          sendJson(res, 400, {
            error: "invalid_review_session",
            message: error.message,
          });
          return;
        }

        sendJson(res, 500, {
          error: "review_session_storage_unavailable",
          message: "Review session storage could not be written",
        });
      }
      return;
    }

    sendJson(res, 404, {
      error: "not_found",
      message: "Route not found",
    });
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = createScannerApiServer();
  server.listen(port, () => {
    console.log(`Scanner API listening on http://localhost:${port}`);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
}

function sendReviewSessionJson(
  res: ServerResponse,
  status: number,
  result: ReviewSessionFileStoreResult,
) {
  sendJson(res, status, {
    ...result.state,
    _source_meta: result._source_meta,
  });
}

function getRequestPath(url: string | undefined): string {
  return url?.split("?")[0] ?? "/";
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
