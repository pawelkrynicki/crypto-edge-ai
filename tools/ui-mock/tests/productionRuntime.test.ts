import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { request } from "node:http";
import type { AddressInfo } from "node:net";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { after, before, describe, it } from "node:test";
import { createProductVpsServer, resolveProductVpsRuntimeConfig } from "../server/productVpsServer.js";
import { createScannerApiServer } from "../server/scannerApiServer.js";

describe("production same-origin VPS runtime", () => {
  let tempRoot: string;
  let distPath: string;
  let outputDirPath: string;
  let contextOutputDirPath: string;
  let reportsRootPath: string;
  let productServer: ReturnType<typeof createProductVpsServer>;
  let scannerServer: ReturnType<typeof createScannerApiServer>;
  let productBaseUrl: string;
  let scannerBaseUrl: string;

  before(async () => {
    tempRoot = await mkdtemp(resolve(tmpdir(), "crypto-edge-product-runtime-"));
    distPath = resolve(tempRoot, "dist");
    outputDirPath = resolve(tempRoot, "scanner-output");
    contextOutputDirPath = resolve(tempRoot, "context-output");
    reportsRootPath = resolve(tempRoot, "reports");
    await mkdir(resolve(distPath, "assets"), { recursive: true });
    await mkdir(outputDirPath, { recursive: true });
    await mkdir(contextOutputDirPath, { recursive: true });
    await mkdir(reportsRootPath, { recursive: true });
    await writeFile(resolve(distPath, "index.html"), "<!doctype html><html><body>INTERNAL_BETA PRODUCT</body></html>", "utf8");
    await writeFile(resolve(distPath, "assets", "app-12345678.js"), "globalThis.__PRODUCT_ASSET__ = true;", "utf8");

    const apiOptions = {
      runtimeMode: "INTERNAL_BETA" as const,
      scanner: { outputDirPath },
      context: { outputDirPath: contextOutputDirPath },
      reviewSession: { storageFilePath: resolve(tempRoot, "review-session.json") },
      reports: { reportsRootPath, now: new Date("2026-06-23T09:35:00.000Z") },
    };
    productServer = createProductVpsServer({
      ...apiOptions,
      distPath,
      buildSha: "test-build-sha",
      uptimeSeconds: () => 42.9,
    });
    scannerServer = createScannerApiServer(apiOptions);
    await Promise.all([listen(productServer), listen(scannerServer)]);
    productBaseUrl = serverUrl(productServer);
    scannerBaseUrl = serverUrl(scannerServer);
  });

  after(async () => {
    await Promise.all([close(productServer), close(scannerServer)]);
    await rm(tempRoot, { recursive: true, force: true });
  });

  it("fails closed unless CRYPTO_EDGE_RUNTIME_MODE is INTERNAL_BETA", () => {
    assert.throws(
      () => resolveProductVpsRuntimeConfig({}),
      /INTERNAL_BETA_RUNTIME_MODE_REQUIRED/,
    );
    assert.throws(
      () => resolveProductVpsRuntimeConfig({ CRYPTO_EDGE_RUNTIME_MODE: "DEVELOPMENT_DEMO" }),
      /INTERNAL_BETA_RUNTIME_MODE_REQUIRED/,
    );
    assert.throws(
      () => createProductVpsServer({ runtimeMode: "DEVELOPMENT_DEMO", distPath }),
      /INTERNAL_BETA_RUNTIME_MODE_REQUIRED/,
    );
    assert.throws(
      () => resolveProductVpsRuntimeConfig({
        CRYPTO_EDGE_RUNTIME_MODE: "INTERNAL_BETA",
        CRYPTO_EDGE_PRODUCT_HOST: "invalid host",
      }),
      /PRODUCT_HOST_INVALID/,
    );
  });

  it("defaults to loopback port 4180 and accepts explicit deployment identifiers", () => {
    const defaults = resolveProductVpsRuntimeConfig({ CRYPTO_EDGE_RUNTIME_MODE: "INTERNAL_BETA" });
    assert.equal(defaults.host, "127.0.0.1");
    assert.equal(defaults.port, 4180);

    const configured = resolveProductVpsRuntimeConfig({
      CRYPTO_EDGE_RUNTIME_MODE: "INTERNAL_BETA",
      CRYPTO_EDGE_PRODUCT_HOST: "127.0.0.2",
      CRYPTO_EDGE_PRODUCT_PORT: "43123",
      CRYPTO_EDGE_UI_DIST_PATH: distPath,
      CRYPTO_EDGE_BUILD_SHA: "abc123",
    });
    assert.equal(configured.host, "127.0.0.2");
    assert.equal(configured.port, 43123);
    assert.equal(configured.buildSha, "abc123");
  });

  it("serves index, SPA fallback and hashed assets with safe headers", async () => {
    const index = await requestRaw(productBaseUrl, "/");
    assert.equal(index.status, 200);
    assert.match(index.body, /INTERNAL_BETA PRODUCT/);
    assert.match(index.headers["content-type"] ?? "", /^text\/html/);
    assert.equal(index.headers["cache-control"], "no-store, max-age=0");
    assert.equal(index.headers["x-content-type-options"], "nosniff");

    const fallback = await requestRaw(productBaseUrl, "/radar/candidate/example");
    assert.equal(fallback.status, 200);
    assert.match(fallback.body, /INTERNAL_BETA PRODUCT/);
    assert.equal(fallback.headers["cache-control"], "no-store, max-age=0");

    const asset = await requestRaw(productBaseUrl, "/assets/app-12345678.js");
    assert.equal(asset.status, 200);
    assert.match(asset.headers["content-type"] ?? "", /^text\/javascript/);
    assert.equal(asset.headers["cache-control"], "public, max-age=31536000, immutable");
  });

  it("blocks traversal and never serves a file outside dist", async () => {
    await writeFile(resolve(tempRoot, "outside-secret.txt"), "must-not-leak", "utf8");
    for (const path of ["/%2e%2e/outside-secret.txt", "/..%2foutside-secret.txt", "/%2e%2e%5coutside-secret.txt"]) {
      const response = await requestRaw(productBaseUrl, path);
      assert.notEqual(response.status, 200, path);
      assert.doesNotMatch(response.body, /must-not-leak/);
    }
  });

  it("uses the shared API contract on the UI origin without wildcard CORS", async () => {
    const health = await requestRaw(productBaseUrl, "/api/health", { origin: "https://external.invalid" });
    assert.equal(health.status, 200);
    assert.equal(health.headers["access-control-allow-origin"], undefined);
    assert.doesNotMatch(JSON.stringify(health.headers), /access-control-allow-origin[^}]*\*/i);
    assert.deepEqual(JSON.parse(health.body), {
      status: "ok",
      service: "crypto-edge-ai-product",
      runtime_mode: "INTERNAL_BETA",
      build_sha: "test-build-sha",
      process_uptime_seconds: 42,
    });

    for (const path of [
      "/api/readiness",
      "/api/scanner/latest",
      "/api/context/latest",
      "/api/scanner/sources",
      "/api/established-universe/status",
      "/api/follow-up/status",
      "/api/follow-up",
      "/api/reports/status",
      "/api/reports",
    ]) {
      const [product, scanner] = await Promise.all([
        requestRaw(productBaseUrl, path),
        requestRaw(scannerBaseUrl, path),
      ]);
      assert.equal(product.status, scanner.status, path);
      assert.deepEqual(JSON.parse(product.body), JSON.parse(scanner.body), path);
    }
  });

  it("handles 100 concurrent reads without collector, provider or snapshot writes", async () => {
    const originalFetch = globalThis.fetch;
    let providerFetchCalls = 0;
    globalThis.fetch = (async () => {
      providerFetchCalls += 1;
      throw new Error("provider fetch forbidden in request path");
    }) as typeof fetch;
    const beforeEntries = await readdir(outputDirPath);

    try {
      const responses = await Promise.all(Array.from({ length: 100 }, () => requestRaw(productBaseUrl, "/api/scanner/latest")));
      assert.ok(responses.every((response) => response.status === 503));
      assert.ok(responses.every((response) => JSON.parse(response.body).reason_code === "SCANNER_OUTPUT_UNAVAILABLE"));
    } finally {
      globalThis.fetch = originalFetch;
    }

    assert.equal(providerFetchCalls, 0);
    assert.deepEqual(await readdir(outputDirPath), beforeEntries);
  });
});

function listen(server: ReturnType<typeof createProductVpsServer>): Promise<void> {
  return new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", () => {
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

function serverUrl(server: ReturnType<typeof createProductVpsServer>): string {
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

function requestRaw(
  baseUrl: string,
  path: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: string }> {
  const url = new URL(baseUrl);
  return new Promise((resolveRequest, rejectRequest) => {
    const req = request({
      hostname: url.hostname,
      port: url.port,
      method: "GET",
      path,
      headers,
    }, (res) => {
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
