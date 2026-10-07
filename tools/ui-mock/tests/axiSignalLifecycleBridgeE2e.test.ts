import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { createAxiSignalRepository } from "../server/axiSignalRepository.js";
import { createScannerApiHandler } from "../server/scannerApiHandler.js";
import { runAxiMt4SignalBridgeCycle } from "../server/axiMt4SignalBridge.js";

const TOKEN = "lifecycle-bridge-e2e-token";

test("MT4 outbox -> Bridge -> API -> SQLite resolves a full MARKET lifecycle", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "crypto-edge-life-bridge-e2e-"));
  const bridgeRoot = join(root, "bridge");
  await Promise.all(["outbox", "sent", "rejected"].map((name) => mkdir(join(bridgeRoot, name), { recursive: true })));

  const repository = await createAxiSignalRepository({ databaseFilePath: resolve(root, "axi.sqlite") });
  const server = createServer(createScannerApiHandler({
    runtimeMode: "DEVELOPMENT_DEMO",
    lifecycle: {
      defaultSessionRole: "OWNER",
      campIdentityRegistryPath: resolve(root, "camp-identities.json"),
    },
    axiSignals: {
      repository,
      token: TOKEN,
      featureFlagEnvironment: { CRYPTO_EDGE_AXI_SIGNALS: "1" },
    },
  }));

  try {
    await listen(server);
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const signalId = "ACC1246441380-J-1791165600-BUY-MARKET";

    const signal = {
      schema_version: "axi_crypto_signal_v1",
      event_type: "SIGNAL_CREATED",
      signal_id: signalId,
      source: {
        provider: "AXI",
        engine: "ALLinCrypto Engine",
        engine_version: "1.10",
        strategy_version: "1.10",
        terminal_id: "ACC1246441380",
      },
      setup: {
        setup_id: "J",
        setup_name: "Pullback EMA50",
        timeframe: "H4",
        family: "ENGINE",
        max_hold_seconds: 1209600,
      },
      trade: {
        symbol: "ETHUSD",
        side: "BUY",
        order_type: "MARKET",
        source_signal_time: "2026-10-05T22:00:00.000Z",
        source_time_basis: "AXI_SERVER",
        entry_price: 2700,
        stop_loss: 2670,
        take_profit: 2760,
        rr: 2,
        cancel_price: null,
        valid_for_seconds: null,
      },
    };

    const fill = {
      schema_version: "axi_signal_lifecycle_v1",
      event_type: "ORDER_FILLED",
      event_id: `${signalId}-ORDER_FILLED`,
      signal_id: signalId,
      source_event_time: "2026-10-05T22:00:02.000Z",
      fill_price: 2700,
    };

    const close = {
      schema_version: "axi_signal_lifecycle_v1",
      event_type: "POSITION_CLOSED",
      event_id: `${signalId}-POSITION_CLOSED`,
      signal_id: signalId,
      source_event_time: "2026-10-06T02:00:00.000Z",
      close_price: 2760,
      close_reason: "TP",
    };

    await writeFile(join(bridgeRoot, "outbox", "ACC1246441380-J-1791165600-BUY-MARKET.json"), JSON.stringify(signal), "utf8");
    await writeFile(join(bridgeRoot, "outbox", "ACC1246441380-J-1791165600-BUY-MARKET.zz.ORDER_FILLED.json"), JSON.stringify(fill), "utf8");
    await writeFile(join(bridgeRoot, "outbox", "ACC1246441380-J-1791165600-BUY-MARKET.zz.POSITION_CLOSED.json"), JSON.stringify(close), "utf8");

    const result = await runAxiMt4SignalBridgeCycle({
      root: bridgeRoot,
      endpoint: `${base}/api/v1/trading/signals/axi`,
      lifecycleEndpoint: `${base}/api/v1/trading/signals/axi-lifecycle`,
      token: TOKEN,
      pollMs: 1_000,
    }, { logger: silentLogger() });

    assert.deepEqual(result, { scanned: 3, sent: 3, rejected: 0, retryable: 0 });

    const snapshot = repository.getLifecycle(signalId);
    assert.equal(snapshot.state.status, "CLOSED");
    assert.equal(snapshot.state.filled_at, "2026-10-05T22:00:02.000Z");
    assert.equal(snapshot.state.close_reason, "TP");
    assert.equal(snapshot.state.result_r, 2);
    assert.equal(snapshot.events.length, 2);
  } finally {
    await closeServer(server);
    repository.close();
    await rm(root, { recursive: true, force: true, maxRetries: 3 });
  }
});

function silentLogger() {
  return { info: () => {}, warn: () => {}, error: () => {} };
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

function closeServer(server: Server): Promise<void> {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
}
