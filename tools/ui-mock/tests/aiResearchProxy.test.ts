import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer as createHttpServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { after, describe, it } from "node:test";
import { createServer as createViteServer, type ViteDevServer } from "vite";
import { createFeedbackStore } from "../server/feedbackStore.js";
import { createScannerApiHandler } from "../server/scannerApiHandler.js";
import type { AIResearchProvider, AIResearchProviderConfig } from "../server/aiResearchProvider.js";
import { createAIResearchService } from "../server/aiResearchService.js";
import { createAIResearchStore } from "../server/aiResearchStore.js";
import { LOCAL_API_PROXY } from "../vite.config.js";

const root = await mkdtemp(resolve(tmpdir(), "crypto-edge-ai-proxy-tests-"));
const TEST_API_KEY = "proxy-test-key-must-never-be-logged";

after(async () => { await rm(root, { recursive: true, force: true }); });

describe("AI.2 local same-origin proxy", () => {
  it("uses the loopback target without rewriting Origin and enables forwarded headers", () => {
    assert.equal(LOCAL_API_PROXY.target, "http://127.0.0.1:5177");
    assert.equal(LOCAL_API_PROXY.changeOrigin, false);
    assert.equal(LOCAL_API_PROXY.xfwd, true);
  });

  it("accepts the public proxy host, rejects a foreign Origin, validates forwarded host and spends no live budget", async () => {
    const store = await createAIResearchStore({ databaseFilePath: resolve(root, "ai-research-openai-review.sqlite") });
    const feedbackStore = await createFeedbackStore({ databaseFilePath: resolve(root, "feedback.sqlite") });
    let providerCalls = 0;
    const provider: AIResearchProvider = {
      mode: "OPENAI",
      model: "configured-test-model",
      async generate() {
        providerCalls += 1;
        throw new Error("provider must not be called by proxy validation tests");
      },
    };
    const service = createAIResearchService({
      provider,
      providerConfig: liveOneConfig(),
      store,
    });
    const forwardedHosts: Array<string | string[] | undefined> = [];
    const handler = createScannerApiHandler({
      runtimeMode: "INTERNAL_BETA",
      aiResearch: { service, sessionSecret: "proxy-test-session-secret" },
      feedback: { store: feedbackStore },
    });
    const apiServer = createHttpServer((req, res) => {
      if (req.url === "/api/ai-research/generate") forwardedHosts.push(req.headers["x-forwarded-host"]);
      void handler(req, res);
    });
    let vite: ViteDevServer | null = null;
    const capturedLogs: string[] = [];
    const originalError = console.error;
    const originalWarn = console.warn;

    try {
      await listen(apiServer);
      const apiPort = requirePort(apiServer);
      vite = await createViteServer({
        configFile: false,
        root: resolve(import.meta.dirname, ".."),
        cacheDir: resolve(root, "vite-cache"),
        logLevel: "silent",
        server: {
          host: "127.0.0.1",
          port: 0,
          strictPort: true,
          allowedHosts: true,
          proxy: {
            "/api": { ...LOCAL_API_PROXY, target: `http://127.0.0.1:${apiPort}` },
          },
        },
      });
      await vite.listen();
      const publicBase = `http://127.0.0.1:${requireVitePort(vite)}`;
      const publicHost = new URL(publicBase).host;
      console.error = (...values: unknown[]) => { capturedLogs.push(values.join(" ")); };
      console.warn = (...values: unknown[]) => { capturedLogs.push(values.join(" ")); };

      const acceptedOrigin = await postEmptyBody(`${publicBase}/api/ai-research/generate`, publicBase);
      assert.equal(acceptedOrigin.status, 400);
      assert.equal((await acceptedOrigin.json() as { error?: string }).error, "BODY_INVALID");
      assert.notEqual(acceptedOrigin.headers.get("access-control-allow-origin"), "*");
      assert.equal(forwardedHosts[0], publicHost);

      const foreignOrigin = await postEmptyBody(`${publicBase}/api/ai-research/generate`, "http://attacker.invalid");
      assert.equal(foreignOrigin.status, 403);
      assert.equal((await foreignOrigin.json() as { error?: string }).error, "SAME_ORIGIN_REQUIRED");
      assert.notEqual(foreignOrigin.headers.get("access-control-allow-origin"), "*");

      const forgedForwardedHost = await fetch(`http://127.0.0.1:${apiPort}/api/ai-research/generate`, {
        method: "POST",
        headers: {
          origin: `http://127.0.0.1:${apiPort}`,
          "content-type": "application/json",
          "x-forwarded-host": "attacker.invalid",
        },
        body: "{}",
      });
      assert.equal(forgedForwardedHost.status, 403);
      assert.equal((await forgedForwardedHost.json() as { error?: string }).error, "SAME_ORIGIN_REQUIRED");
      assert.notEqual(forgedForwardedHost.headers.get("access-control-allow-origin"), "*");

      assert.equal(providerCalls, 0);
      assert.equal(store.liveCallBudgetUsage(), 0);
      assert.equal(store.stats().records, 0);
      assert.doesNotMatch(capturedLogs.join("\n"), new RegExp(TEST_API_KEY));
    } finally {
      console.error = originalError;
      console.warn = originalWarn;
      if (vite) await vite.close();
      await close(apiServer);
      feedbackStore.close();
      store.close();
    }
  });
});

function liveOneConfig(): AIResearchProviderConfig {
  return {
    mode: "OPENAI",
    model: "configured-test-model",
    apiKey: TEST_API_KEY,
    timeoutMs: 5_000,
    maxConcurrency: 1,
    liveCallBudget: 1,
    liveCallBudgetInvalid: false,
  };
}

function postEmptyBody(url: string, origin: string) {
  return fetch(url, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: "{}",
  });
}

function listen(server: Server): Promise<void> {
  return new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolveListen();
    });
  });
}

function close(server: Server): Promise<void> {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolveClose, reject) => {
    server.close((error) => error ? reject(error) : resolveClose());
  });
}

function requirePort(server: Server): number {
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return (address as AddressInfo).port;
}

function requireVitePort(vite: ViteDevServer): number {
  const address = vite.httpServer?.address();
  assert.ok(address && typeof address !== "string");
  return (address as AddressInfo).port;
}
