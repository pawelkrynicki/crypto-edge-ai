import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import type { AxiCryptoSignal } from "../server/axiCryptoSignalContract.js";
import { createAxiSignalRepository } from "../server/axiSignalRepository.js";
import { createScannerApiHandler } from "../server/scannerApiHandler.js";

const TOKEN = "axi-lifecycle-api-token";

test("lifecycle API accepts machine events and OWNER can read the resolved state", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "crypto-edge-lifecycle-api-"));
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
      now: () => new Date("2026-09-28T12:00:00.000Z"),
    },
  }));

  try {
    await listen(server);
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const signal = limitSignal();

    const created = await fetch(`${base}/api/v1/trading/signals/axi`, {
      method: "POST",
      headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify(signal),
    });
    assert.equal(created.status, 201);

    const filled = await fetch(`${base}/api/v1/trading/signals/axi-lifecycle`, {
      method: "POST",
      headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({
        schema_version: "axi_signal_lifecycle_v1",
        event_type: "ORDER_FILLED",
        event_id: "api-life-fill",
        signal_id: signal.signal_id,
        source_event_time: "2026-09-28T12:30:00.000Z",
        fill_price: signal.trade.entry_price,
      }),
    });
    assert.equal(filled.status, 201);

    const closed = await fetch(`${base}/api/v1/trading/signals/axi-lifecycle`, {
      method: "POST",
      headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({
        schema_version: "axi_signal_lifecycle_v1",
        event_type: "POSITION_CLOSED",
        event_id: "api-life-close",
        signal_id: signal.signal_id,
        source_event_time: "2026-09-28T13:00:00.000Z",
        close_price: signal.trade.take_profit,
        close_reason: "TP",
      }),
    });
    assert.equal(closed.status, 201);

    const session = await fetch(`${base}/api/lifecycle/session`);
    const cookie = session.headers.get("set-cookie")?.split(";", 1)[0];
    assert.ok(cookie);

    const detail = await fetch(`${base}/api/v1/trading/signals/${signal.signal_id}/lifecycle`, {
      headers: { cookie: cookie! },
    });
    assert.equal(detail.status, 200);

    const body = await detail.json() as {
      schema_version: string;
      state: { status: string; close_reason: string; result_r: number };
      events: unknown[];
    };
    assert.equal(body.schema_version, "axi_signal_lifecycle_detail_v1");
    assert.equal(body.state.status, "CLOSED");
    assert.equal(body.state.close_reason, "TP");
    assert.equal(body.state.result_r, 2);
    assert.equal(body.events.length, 2);
  } finally {
    await close(server);
    repository.close();
    await rm(root, { recursive: true, force: true, maxRetries: 3 });
  }
});

function limitSignal(): AxiCryptoSignal {
  return {
    schema_version: "axi_crypto_signal_v1",
    event_type: "SIGNAL_CREATED",
    signal_id: "api-life-signal",
    source: {
      provider: "AXI",
      engine: "ALLinCrypto Engine",
      engine_version: "1.10",
      strategy_version: "1.00",
      terminal_id: "ACC1246441380",
    },
    setup: {
      setup_id: "C",
      setup_name: "PAC2 limit",
      timeframe: "H4",
      family: "ENGINE",
      max_hold_seconds: 86400,
    },
    trade: {
      symbol: "ETHUSD",
      side: "SELL",
      order_type: "LIMIT",
      source_signal_time: "2026-09-28T11:58:59.000Z",
      source_time_basis: "AXI_SERVER",
      entry_price: 100,
      stop_loss: 110,
      take_profit: 80,
      rr: 2,
      cancel_price: 115,
      valid_for_seconds: 900,
    },
  };
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
  return new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
}
