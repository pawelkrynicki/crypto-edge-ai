import { readFile, realpath, stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createScannerApiHandler,
  type ScannerApiHandlerOptions,
} from "./scannerApiHandler.js";
import { resolveProductRuntimeMode } from "../src/runtimeMode.js";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 4180;
const DEFAULT_DIST_PATH = fileURLToPath(new URL("../dist", import.meta.url));
const HASHED_ASSET_PATTERN = /-[A-Za-z0-9_-]{8,}\.[^/]+$/;

const MIME_TYPES: Readonly<Record<string, string>> = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

export type ProductVpsRuntimeConfig = {
  runtimeMode: "INTERNAL_BETA";
  host: string;
  port: number;
  distPath: string;
  buildSha?: string;
};

export type ProductVpsServerOptions = Omit<ScannerApiHandlerOptions, "runtimeMode" | "health"> & {
  runtimeMode: string;
  distPath: string;
  buildSha?: string;
  uptimeSeconds?: () => number;
};

export class ProductVpsRuntimeError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "ProductVpsRuntimeError";
    this.code = code;
  }
}

export function resolveProductVpsRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): ProductVpsRuntimeConfig {
  if (resolveProductRuntimeMode(env.CRYPTO_EDGE_RUNTIME_MODE) !== "INTERNAL_BETA") {
    throw new ProductVpsRuntimeError("INTERNAL_BETA_RUNTIME_MODE_REQUIRED");
  }

  const host = normalizeHost(env.CRYPTO_EDGE_PRODUCT_HOST);
  const port = parsePort(env.CRYPTO_EDGE_PRODUCT_PORT);
  const configuredDistPath = env.CRYPTO_EDGE_UI_DIST_PATH?.trim();
  const distPath = configuredDistPath
    ? isAbsolute(configuredDistPath) ? configuredDistPath : resolve(configuredDistPath)
    : DEFAULT_DIST_PATH;
  const buildSha = normalizeBuildSha(env.CRYPTO_EDGE_BUILD_SHA);

  return {
    runtimeMode: "INTERNAL_BETA",
    host,
    port,
    distPath: resolve(distPath),
    ...(buildSha ? { buildSha } : {}),
  };
}

export function createProductVpsServer(options: ProductVpsServerOptions): Server {
  if (resolveProductRuntimeMode(options.runtimeMode) !== "INTERNAL_BETA") {
    throw new ProductVpsRuntimeError("INTERNAL_BETA_RUNTIME_MODE_REQUIRED");
  }

  const distPath = resolve(options.distPath);
  const apiHandler = createScannerApiHandler({
    runtimeMode: "INTERNAL_BETA",
    scanner: options.scanner,
    context: options.context,
    reviewSession: options.reviewSession,
    reviewSessionProvider: options.reviewSessionProvider,
    automation: options.automation,
    health: {
      service: "crypto-edge-ai-product",
      buildSha: normalizeBuildSha(options.buildSha),
      uptimeSeconds: options.uptimeSeconds ?? (() => process.uptime()),
    },
  });

  return createServer(async (req, res) => {
    const requestPath = rawRequestPath(req.url);
    if (requestPath === "/api" || requestPath.startsWith("/api/")) {
      apiHandler(req, res);
      return;
    }

    try {
      await serveProductAsset(req, res, distPath);
    } catch {
      sendPlain(res, 500, "Internal Server Error");
    }
  });
}

export async function startProductVpsRuntime(
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ server: Server; config: ProductVpsRuntimeConfig }> {
  const config = resolveProductVpsRuntimeConfig(env);
  await assertUsableDist(config.distPath);
  const server = createProductVpsServer({
    runtimeMode: config.runtimeMode,
    distPath: config.distPath,
    buildSha: config.buildSha,
  });

  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(config.port, config.host, () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });
  installGracefulShutdown(server);
  return { server, config };
}

export function installGracefulShutdown(server: Server): () => void {
  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    server.close((error) => {
      if (error) process.exitCode = 1;
    });
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  return () => {
    process.off("SIGINT", shutdown);
    process.off("SIGTERM", shutdown);
  };
}

async function serveProductAsset(
  req: IncomingMessage,
  res: ServerResponse,
  distPath: string,
): Promise<void> {
  res.setHeader("x-content-type-options", "nosniff");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("allow", "GET, HEAD, OPTIONS");
    sendPlain(res, 405, "Method Not Allowed");
    return;
  }

  const decodedPath = decodeSafePath(rawRequestPath(req.url));
  if (decodedPath === null) {
    sendPlain(res, 400, "Bad Request");
    return;
  }

  const relativePath = decodedPath === "/" ? "index.html" : decodedPath.replace(/^\/+/, "");
  let selectedPath = resolve(distPath, relativePath);
  if (!isContainedPath(distPath, selectedPath)) {
    sendPlain(res, 400, "Bad Request");
    return;
  }

  let selectedStat = await stat(selectedPath).catch(() => null);
  if (!selectedStat?.isFile()) {
    if (extname(decodedPath)) {
      sendPlain(res, 404, "Not Found");
      return;
    }
    selectedPath = resolve(distPath, "index.html");
    selectedStat = await stat(selectedPath).catch(() => null);
  }
  if (!selectedStat?.isFile() || !(await isRealPathContained(distPath, selectedPath))) {
    sendPlain(res, 404, "Not Found");
    return;
  }

  const body = await readFile(selectedPath);
  const extension = extname(selectedPath).toLowerCase();
  const isIndex = selectedPath.toLowerCase() === resolve(distPath, "index.html").toLowerCase();
  res.setHeader("content-type", MIME_TYPES[extension] ?? "application/octet-stream");
  res.setHeader("content-length", String(body.byteLength));
  res.setHeader(
    "cache-control",
    isIndex
      ? "no-store, max-age=0"
      : HASHED_ASSET_PATTERN.test(relativePath)
        ? "public, max-age=31536000, immutable"
        : "no-cache, max-age=0",
  );
  res.writeHead(200);
  res.end(req.method === "HEAD" ? undefined : body);
}

async function assertUsableDist(distPath: string): Promise<void> {
  const indexPath = resolve(distPath, "index.html");
  const indexStat = await stat(indexPath).catch(() => null);
  if (!indexStat?.isFile() || !(await isRealPathContained(distPath, indexPath))) {
    throw new ProductVpsRuntimeError("UI_DIST_NOT_READY");
  }
}

function rawRequestPath(url: string | undefined): string {
  return (url ?? "/").split("?", 1)[0] || "/";
}

function decodeSafePath(rawPath: string): string | null {
  try {
    const decoded = decodeURIComponent(rawPath);
    if (decoded.includes("\0") || decoded.includes("\\")) return null;
    if (decoded.split("/").some((segment) => segment === "..")) return null;
    return decoded;
  } catch {
    return null;
  }
}

function isContainedPath(root: string, candidate: string): boolean {
  const normalizedRoot = resolve(root);
  const normalizedCandidate = resolve(candidate);
  if (process.platform === "win32") {
    const rootLower = normalizedRoot.toLowerCase();
    const candidateLower = normalizedCandidate.toLowerCase();
    return candidateLower === rootLower || candidateLower.startsWith(`${rootLower}${sep}`);
  }
  return normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(`${normalizedRoot}${sep}`);
}

async function isRealPathContained(root: string, candidate: string): Promise<boolean> {
  try {
    const [realRoot, realCandidate] = await Promise.all([realpath(root), realpath(candidate)]);
    const relativePath = relative(realRoot, realCandidate);
    return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
  } catch {
    return false;
  }
}

function parsePort(value: string | undefined): number {
  if (value === undefined || value.trim() === "") return DEFAULT_PORT;
  if (!/^\d+$/.test(value.trim())) throw new ProductVpsRuntimeError("PRODUCT_PORT_INVALID");
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new ProductVpsRuntimeError("PRODUCT_PORT_INVALID");
  }
  return port;
}

function normalizeHost(value: string | undefined): string {
  const host = value?.trim() || DEFAULT_HOST;
  if (host.length > 255 || !/^[A-Za-z0-9.:[\]_-]+$/.test(host)) {
    throw new ProductVpsRuntimeError("PRODUCT_HOST_INVALID");
  }
  return host;
}

function normalizeBuildSha(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized && /^[A-Za-z0-9._-]{1,128}$/.test(normalized) ? normalized : undefined;
}

function sendPlain(res: ServerResponse, status: number, body: string): void {
  if (res.headersSent) {
    res.end();
    return;
  }
  res.setHeader("content-type", "text/plain; charset=utf-8");
  res.setHeader("cache-control", "no-store, max-age=0");
  res.setHeader("x-content-type-options", "nosniff");
  res.writeHead(status);
  res.end(body);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startProductVpsRuntime()
    .then(({ config }) => {
      console.log(`Crypto Edge AI product listening on http://${config.host}:${config.port}`);
    })
    .catch((error: unknown) => {
      const code = error instanceof ProductVpsRuntimeError ? error.code : "PRODUCT_RUNTIME_START_FAILED";
      console.error(JSON.stringify({ error: code }));
      process.exitCode = 1;
    });
}
