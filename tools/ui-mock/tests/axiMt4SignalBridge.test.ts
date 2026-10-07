import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, describe, it } from "node:test";
import {
  resolveAxiMt4SignalBridgeConfig,
  runAxiMt4SignalBridgeCycle,
  type AxiMt4SignalBridgeConfig,
} from "../server/axiMt4SignalBridge.js";

const roots: string[] = [];
const TOKEN = "bridge-test-token";

after(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

describe("AXI MT4 signal bridge", () => {
  it("uses the APPDATA MetaTrader COMMON root and local product endpoint by default", () => {
    const config = resolveAxiMt4SignalBridgeConfig({ APPDATA: "C:\\BridgeFixture\\Roaming", CRYPTO_EDGE_AXI_SIGNAL_TOKEN: TOKEN });
    assert.equal(config.root, resolve("C:\\BridgeFixture\\Roaming", "MetaQuotes", "Terminal", "Common", "Files", "CryptoEdge"));
    assert.equal(config.endpoint, "http://127.0.0.1:4180/api/v1/trading/signals/axi");
    assert.equal(config.lifecycleEndpoint, "http://127.0.0.1:4180/api/v1/trading/signals/axi-lifecycle");
    assert.equal(config.pollMs, 1_000);
  });

  it("posts original JSON bytes and archives successful 201 and 200 duplicate responses", async () => {
    const root = await bridgeRoot();
    await writeOutbox(root, "first.json", '{"signal_id":"first"}');
    await writeOutbox(root, "second.json", '{"signal_id":"second"}');
    const delivered: string[] = [];
    const logs: string[] = [];
    const result = await runAxiMt4SignalBridgeCycle(configFor(root), {
      fetchImpl: async (_input, init) => {
        assert.equal(init?.headers instanceof Headers ? init.headers.get("authorization") : (init?.headers as Record<string, string>).authorization, `Bearer ${TOKEN}`);
        delivered.push(Buffer.from(init?.body as Buffer).toString("utf8"));
        return new Response(JSON.stringify({ status: delivered.length === 1 ? "CREATED" : "DUPLICATE" }), { status: delivered.length === 1 ? 201 : 200 });
      },
      logger: testLogger(logs),
    });
    assert.deepEqual(delivered, ['{"signal_id":"first"}', '{"signal_id":"second"}']);
    assert.deepEqual(result, { scanned: 2, sent: 2, rejected: 0, retryable: 0 });
    assert.equal(await readFile(join(root, "sent", "first.json"), "utf8"), '{"signal_id":"first"}');
    assert.equal(await readFile(join(root, "sent", "second.json"), "utf8"), '{"signal_id":"second"}');
    assert.doesNotMatch(logs.join("\n"), new RegExp(TOKEN));
  });



  it("routes lifecycle payloads to the lifecycle endpoint while source signals stay on the signal endpoint", async () => {
    const root = await bridgeRoot();
    await writeOutbox(root, "a-signal.json", JSON.stringify({
      schema_version: "axi_crypto_signal_v1",
      event_type: "SIGNAL_CREATED",
      signal_id: "route-signal",
    }));
    await writeOutbox(root, "b-fill.json", JSON.stringify({
      schema_version: "axi_signal_lifecycle_v1",
      event_type: "ORDER_FILLED",
      event_id: "route-signal-ORDER_FILLED",
      signal_id: "route-signal",
      source_event_time: "2026-10-07T12:00:00.000Z",
      fill_price: 100,
    }));

    const urls: string[] = [];
    const result = await runAxiMt4SignalBridgeCycle(configFor(root), {
      fetchImpl: async (input) => {
        urls.push(String(input));
        return new Response("created", { status: 201 });
      },
      logger: testLogger([]),
    });

    assert.deepEqual(result, { scanned: 2, sent: 2, rejected: 0, retryable: 0 });
    assert.deepEqual(urls, [
      "http://127.0.0.1:4180/api/v1/trading/signals/axi",
      "http://127.0.0.1:4180/api/v1/trading/signals/axi-lifecycle",
    ]);
  });

  it("preserves retryable gateway failures and unreadable source files in the outbox", async () => {
    const root = await bridgeRoot();
    await writeOutbox(root, "auth.json", '{"signal_id":"auth"}');
    await writeOutbox(root, "gateway-off.json", '{"signal_id":"retry"}');
    await writeOutbox(root, "server.json", '{"signal_id":"server"}');
    await writeOutbox(root, "still-writing.json", '{"signal_id":');
    const result = await runAxiMt4SignalBridgeCycle(configFor(root), {
      fetchImpl: async (_input, init) => {
        const body = Buffer.from(init?.body as Buffer).toString("utf8");
        return new Response("retry", { status: body.includes("auth") ? 401 : body.includes("server") ? 503 : 404 });
      },
      logger: testLogger([]),
    });
    assert.deepEqual(result, { scanned: 4, sent: 0, rejected: 0, retryable: 4 });
    assert.equal(await readFile(join(root, "outbox", "auth.json"), "utf8"), '{"signal_id":"auth"}');
    assert.equal(await readFile(join(root, "outbox", "gateway-off.json"), "utf8"), '{"signal_id":"retry"}');
    assert.equal(await readFile(join(root, "outbox", "server.json"), "utf8"), '{"signal_id":"server"}');
    assert.equal(await readFile(join(root, "outbox", "still-writing.json"), "utf8"), '{"signal_id":');
  });

  it("moves 400, 409, and 413 gateway outcomes to rejected without changing bytes", async () => {
    const root = await bridgeRoot();
    await writeOutbox(root, "conflict.json", '{"signal_id":"conflict"}');
    await writeOutbox(root, "invalid.json", '{"signal_id":"invalid"}');
    await writeOutbox(root, "large.json", '{"signal_id":"large"}');
    const result = await runAxiMt4SignalBridgeCycle(configFor(root), {
      fetchImpl: async (_input, init) => {
        const body = Buffer.from(init?.body as Buffer).toString("utf8");
        return new Response("permanent", { status: body.includes("conflict") ? 409 : body.includes("large") ? 413 : 400 });
      },
      logger: testLogger([]),
    });
    assert.deepEqual(result, { scanned: 3, sent: 0, rejected: 3, retryable: 0 });
    assert.equal(await readFile(join(root, "rejected", "conflict.json"), "utf8"), '{"signal_id":"conflict"}');
    assert.equal(await readFile(join(root, "rejected", "invalid.json"), "utf8"), '{"signal_id":"invalid"}');
    assert.equal(await readFile(join(root, "rejected", "large.json"), "utf8"), '{"signal_id":"large"}');
  });

  it("uses a collision-safe deterministic archive name", async () => {
    const root = await bridgeRoot();
    await writeFile(join(root, "sent", "signal.json"), "previous evidence", "utf8");
    await writeOutbox(root, "signal.json", '{"signal_id":"new"}');
    await runAxiMt4SignalBridgeCycle(configFor(root), {
      fetchImpl: async () => new Response("created", { status: 201 }),
      logger: testLogger([]),
    });
    assert.equal(await readFile(join(root, "sent", "signal.json"), "utf8"), "previous evidence");
    assert.equal(await readFile(join(root, "sent", "signal.1.json"), "utf8"), '{"signal_id":"new"}');
  });
});

function configFor(root: string): AxiMt4SignalBridgeConfig {
  return {
    root,
    endpoint: "http://127.0.0.1:4180/api/v1/trading/signals/axi",
    lifecycleEndpoint: "http://127.0.0.1:4180/api/v1/trading/signals/axi-lifecycle",
    token: TOKEN,
    pollMs: 1_000,
  };
}

async function bridgeRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "axi-mt4-bridge-"));
  roots.push(root);
  await Promise.all(["outbox", "sent", "rejected"].map((name) => mkdir(join(root, name), { recursive: true })));
  return root;
}

async function writeOutbox(root: string, filename: string, contents: string): Promise<string> {
  const path = join(root, "outbox", filename);
  await writeFile(path, contents, "utf8");
  return path;
}

function testLogger(lines: string[]) {
  return {
    info: (message: string) => lines.push(message),
    warn: (message: string) => lines.push(message),
    error: (message: string) => lines.push(message),
  };
}
