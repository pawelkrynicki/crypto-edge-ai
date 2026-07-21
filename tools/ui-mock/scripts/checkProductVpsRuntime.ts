import assert from "node:assert/strict";
import { request } from "node:http";
import type { AddressInfo } from "node:net";
import { resolve } from "node:path";
import { createProductVpsServer } from "../server/productVpsServer.js";

const distPath = resolve(import.meta.dirname, "..", "dist");

async function main(): Promise<void> {
  const { server, port } = await startOnSafeRandomPort();
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    assert.notEqual(port, 4180, "runtime smoke must never bind product port 4180");

    const index = await requestRaw(baseUrl, "/");
    assert.equal(index.status, 200, "GET / must return index.html");
    assert.match(index.headers["content-type"] ?? "", /^text\/html/);
    assert.equal(index.headers["cache-control"], "no-store, max-age=0");

    const assetPath = extractAssetPath(index.body);
    const asset = await requestRaw(baseUrl, assetPath);
    assert.equal(asset.status, 200, `GET ${assetPath} must return an asset`);
    assert.match(asset.headers["content-type"] ?? "", /(?:javascript|text\/css)/);

    const health = await requestRaw(baseUrl, "/api/health", { origin: "https://external.invalid" });
    assert.equal(health.status, 200);
    assert.equal(JSON.parse(health.body).runtime_mode, "INTERNAL_BETA");
    assert.equal(health.headers["access-control-allow-origin"], undefined);
    assert.doesNotMatch(JSON.stringify(health.headers), /access-control-allow-origin[^}]*\*/i);

    const readiness = await requestRaw(baseUrl, "/api/readiness");
    assert.ok(readiness.status === 200 || readiness.status === 503);
    const scanner = await requestRaw(baseUrl, "/api/scanner/latest");
    assert.ok(scanner.status === 200 || scanner.status === 503);

    const traversal = await requestRaw(baseUrl, "/%2e%2e/package.json");
    assert.notEqual(traversal.status, 200);
    assert.doesNotMatch(traversal.body, /"name"\s*:\s*"ui-mock"/);

    console.log(JSON.stringify({
      status: "PRODUCT_VPS_RUNTIME_CHECK_OK",
      host: "127.0.0.1",
      test_port: port,
      product_port_4180_used: false,
      checks: ["/", assetPath, "/api/health", "/api/readiness", "/api/scanner/latest", "path-traversal", "cors"],
    }, null, 2));
  } finally {
    await close(server);
  }
}

async function startOnSafeRandomPort(): Promise<{
  server: ReturnType<typeof createProductVpsServer>;
  port: number;
}> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const port = 43_000 + Math.floor(Math.random() * 6_000);
    const server = createProductVpsServer({ runtimeMode: "INTERNAL_BETA", distPath, buildSha: "runtime-smoke" });
    try {
      await listen(server, port);
      return { server, port: (server.address() as AddressInfo).port };
    } catch (error) {
      await closeIfListening(server);
      if (!isErrorCode(error, "EADDRINUSE")) throw error;
    }
  }
  throw new Error("SAFE_RANDOM_TEST_PORT_UNAVAILABLE");
}

function extractAssetPath(html: string): string {
  const match = html.match(/(?:src|href)=["']([^"']+\.(?:js|css))["']/i);
  if (!match) throw new Error("BUILT_ASSET_NOT_FOUND");
  return match[1].startsWith("/") ? match[1] : `/${match[1].replace(/^\.\//, "")}`;
}

function listen(server: ReturnType<typeof createProductVpsServer>, port: number): Promise<void> {
  return new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });
}

function close(server: ReturnType<typeof createProductVpsServer>): Promise<void> {
  return new Promise((resolveClose, rejectClose) => {
    server.close((error) => error ? rejectClose(error) : resolveClose());
  });
}

async function closeIfListening(server: ReturnType<typeof createProductVpsServer>): Promise<void> {
  if (!server.listening) return;
  await close(server);
}

function requestRaw(
  baseUrl: string,
  path: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: string }> {
  const url = new URL(baseUrl);
  return new Promise((resolveRequest, rejectRequest) => {
    const req = request({ hostname: url.hostname, port: url.port, method: "GET", path, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      res.on("end", () => resolveRequest({
        status: res.statusCode ?? 0,
        headers: res.headers,
        body: Buffer.concat(chunks).toString("utf8"),
      }));
    });
    req.once("error", rejectRequest);
    req.end();
  });
}

function isErrorCode(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === code);
}

main().catch((error: unknown) => {
  const code = error instanceof Error ? error.message : "PRODUCT_VPS_RUNTIME_CHECK_FAILED";
  console.error(JSON.stringify({ error: code }));
  process.exitCode = 1;
});
