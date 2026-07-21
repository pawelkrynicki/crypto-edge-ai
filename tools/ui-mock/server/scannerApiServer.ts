import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import {
  createScannerApiHandler,
  type ScannerApiHandlerOptions,
} from "./scannerApiHandler.js";

const DEFAULT_PORT = 5177;
const port = Number.parseInt(process.env.SCANNER_API_PORT ?? String(DEFAULT_PORT), 10);

export type ScannerApiServerOptions = ScannerApiHandlerOptions;

export function createScannerApiServer(options: ScannerApiServerOptions = {}) {
  return createServer(createScannerApiHandler(options));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = createScannerApiServer();
  server.listen(port, "127.0.0.1", () => {
    console.log(`Scanner API listening on http://127.0.0.1:${port}`);
  });
}
