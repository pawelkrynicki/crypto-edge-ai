import { createServer, type ServerResponse } from "node:http";
import {
  getScannerSourcesDiagnostics,
  INVALID_SCANNER_OUTPUT,
  readLatestScannerOutput,
  ScannerOutputError,
} from "./latestScannerOutput.js";

const DEFAULT_PORT = 5177;
const port = Number.parseInt(process.env.SCANNER_API_PORT ?? String(DEFAULT_PORT), 10);

const headers = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "content-type",
  "content-type": "application/json; charset=utf-8",
};

const server = createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, headers);
    res.end();
    return;
  }

  if (req.method === "GET" && req.url === "/api/health") {
    sendJson(res, 200, {
      status: "ok",
      service: "crypto-edge-ai-scanner-api",
    });
    return;
  }

  if (req.method === "GET" && req.url === "/api/scanner/latest") {
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

  if (req.method === "GET" && req.url === "/api/scanner/sources") {
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

  sendJson(res, 404, {
    error: "not_found",
    message: "Route not found",
  });
});

server.listen(port, () => {
  console.log(`Scanner API listening on http://localhost:${port}`);
});

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
}
