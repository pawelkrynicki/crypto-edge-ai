import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import {
  buildReconcilePlan,
  parseBrokerLogLine,
  parseEngineLogLine,
  resolveAxiMt4LifecycleLogReconcilerConfig,
  runAxiMt4LifecycleLogReconcilerCycle,
} from "../server/axiMt4LifecycleLogReconciler.js";
import type { AxiCryptoSignal } from "../server/axiCryptoSignalContract.js";

const roots: string[] = [];

after(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

describe("AXI MT4 lifecycle log reconciler", () => {
  it("requires explicit PREVIEW bridge and terminal roots and uses a one-second poll", () => {
    const config = resolveAxiMt4LifecycleLogReconcilerConfig({
      CRYPTO_EDGE_MT4_BRIDGE_ROOT: "C:\\Bridge",
      CRYPTO_EDGE_MT4_TERMINAL_ROOT: "C:\\Terminal",
    });
    assert.equal(config.pollMs, 1_000);
    assert.equal(config.lookbackDays, 7);
    assert.throws(
      () => resolveAxiMt4LifecycleLogReconcilerConfig({ CRYPTO_EDGE_MT4_BRIDGE_ROOT: "C:\\Bridge" }),
      /MT4_RECONCILER_TERMINAL_ROOT_REQUIRED/,
    );
  });

  it("parses real Engine and broker log shapes", () => {
    const signal = parseEngineLogLine(
      "0 11:30:01.751 ALLinCrypto Engine 1.10 EURUSD,M15: ALLinCrypto: SYGNAL B BTCUSD M30 SELL @83814.50 SL 84385.05 TP 82673.39",
      "20261008",
    );
    assert.equal(signal?.kind, "SIGNAL");
    assert.equal(signal?.setup, "B");
    assert.equal(signal?.symbol, "BTCUSD");
    assert.equal(signal?.side, "SELL");

    const opened = parseEngineLogLine(
      "0 11:30:01.998 ALLinCrypto Engine 1.10 EURUSD,M15: ALLinCrypto: B BTCUSD: otwarto SELL 0.16 lota @83814.50 SL 84385.05 TP 82673.39 (ticket 301285982)",
      "20261008",
    );
    assert.equal(opened?.kind, "MARKET_OPEN");
    assert.equal(opened?.ticket, "301285982");

    const closed = parseBrokerLogLine(
      "0 12:21:30.389 '1246441380': order #301285982 sell 0.16 BTCUSD at 83814.50 closed due take-profit at price 82637.05",
      "20261008",
    );
    assert.equal(closed?.kind, "ORDER_CLOSED");
    assert.equal(closed?.closeReason, "TP");
    assert.equal(closed?.price, 82637.05);
  });

  it("reconciles a MARKET signal from Engine open through broker TP close", async () => {
    const root = await fixtureRoot();
    const signal = marketSignal();
    await writeFile(join(root.bridge, "sent", signal.signal_id + ".json"), JSON.stringify(signal), "utf8");
    await writeFile(
      join(root.terminal, "MQL4", "Logs", "20261008.log"),
      [
        "0 11:30:01.751 ALLinCrypto Engine 1.10 EURUSD,M15: ALLinCrypto: SYGNAL B BTCUSD M30 SELL @100.00 SL 110.00 TP 80.00",
        "0 11:30:01.998 ALLinCrypto Engine 1.10 EURUSD,M15: ALLinCrypto: B BTCUSD: otwarto SELL 0.16 lota @100.00 SL 110.00 TP 80.00 (ticket 301285982)",
      ].join("\n"),
      "utf8",
    );
    await writeFile(
      join(root.terminal, "logs", "20261008.log"),
      "0 12:21:30.389 '123': order #301285982 sell 0.16 BTCUSD at 100.00 closed due take-profit at price 79.50",
      "utf8",
    );

    const result = await runAxiMt4LifecycleLogReconcilerCycle(config(root));
    assert.equal(result.fills_written, 1);
    assert.equal(result.closes_written, 1);
    assert.equal(result.source_only, 0);

    const files = (await readdir(join(root.bridge, "outbox"))).sort();
    assert.equal(files.length, 2);
    const events = await Promise.all(files.map(async (name) => JSON.parse(await readFile(join(root.bridge, "outbox", name), "utf8"))));
    assert.equal(events.find((event) => event.event_type === "ORDER_FILLED")?.fill_price, 100);
    const close = events.find((event) => event.event_type === "POSITION_CLOSED");
    assert.equal(close?.close_reason, "TP");
    assert.equal(close?.close_price, 79.5);
  });

  it("leaves a source-only MARKET signal without a ticket untouched", () => {
    const signal = marketSignal();
    const engine = [
      parseEngineLogLine(
        "0 11:30:01.751 ALLinCrypto Engine 1.10 EURUSD,M15: ALLinCrypto: SYGNAL B BTCUSD M30 SELL @100.00 SL 110.00 TP 80.00",
        "20261008",
      )!,
    ];
    const plan = buildReconcilePlan(signal, engine, []);
    assert.equal(plan.sourceOnly, true);
    assert.deepEqual(plan.events, []);
  });

  it("turns a removed LIMIT into CANCELLED without inventing a fill", () => {
    const signal = limitSignal();
    const engine = [
      parseEngineLogLine(
        "0 18:00:02.579 ALLinCrypto Engine 1.10 EURUSD,M15: ALLinCrypto: SYGNAL C ETHUSD H1 SELL LIMIT @100.00 SL 110.00 TP 80.00",
        "20261008",
      )!,
      parseEngineLogLine(
        "0 18:00:02.806 ALLinCrypto Engine 1.10 EURUSD,M15: ALLinCrypto: C ETHUSD: SELL LIMIT 1.00 lota @100.00 SL 110.00 TP 80.00, wazne do 2026.10.09 11:00 (ticket 301346042)",
        "20261008",
      )!,
      parseEngineLogLine(
        "0 19:40:57.854 ALLinCrypto Engine 1.10 EURUSD,M15: ALLinCrypto: C ETHUSD: limit usuniety - cena przebila B 95.00",
        "20261008",
      )!,
    ];
    const plan = buildReconcilePlan(signal, engine, []);
    assert.equal(plan.sourceOnly, false);
    assert.equal(plan.events.length, 1);
    assert.equal(plan.events[0]?.event_type, "SIGNAL_CANCELLED");
  });
});

function marketSignal(): AxiCryptoSignal {
  return {
    schema_version: "axi_crypto_signal_v1",
    event_type: "SIGNAL_CREATED",
    signal_id: "ACC123-B-1791459000-SELL-MARKET",
    source: {
      provider: "AXI",
      engine: "ALLinCrypto Engine",
      engine_version: "1.10",
      strategy_version: "1.10",
      terminal_id: "ACC123",
    },
    setup: {
      setup_id: "B",
      setup_name: "PAC1",
      timeframe: "M30",
      family: "PAC1",
      max_hold_seconds: 172800,
    },
    trade: {
      symbol: "BTCUSD",
      side: "SELL",
      order_type: "MARKET",
      source_signal_time: "2026-10-08T11:30:00.000Z",
      source_time_basis: "AXI_SERVER",
      entry_price: 100,
      stop_loss: 110,
      take_profit: 80,
      rr: 2,
      cancel_price: null,
      valid_for_seconds: null,
    },
  };
}

function limitSignal(): AxiCryptoSignal {
  return {
    ...marketSignal(),
    signal_id: "ACC123-C-1791482400-SELL-LIMIT",
    setup: {
      setup_id: "C",
      setup_name: "PAC2",
      timeframe: "H1",
      family: "PAC2",
      max_hold_seconds: 345600,
    },
    trade: {
      symbol: "ETHUSD",
      side: "SELL",
      order_type: "LIMIT",
      source_signal_time: "2026-10-08T18:00:00.000Z",
      source_time_basis: "AXI_SERVER",
      entry_price: 100,
      stop_loss: 110,
      take_profit: 80,
      rr: 2,
      cancel_price: 95,
      valid_for_seconds: 144000,
    },
  };
}

async function fixtureRoot(): Promise<{ bridge: string; terminal: string }> {
  const root = await mkdtemp(join(tmpdir(), "axi-lifecycle-reconciler-"));
  roots.push(root);
  const bridge = join(root, "bridge");
  const terminal = join(root, "terminal");
  await Promise.all([
    join(bridge, "outbox"),
    join(bridge, "sent"),
    join(bridge, "rejected"),
    join(terminal, "MQL4", "Logs"),
    join(terminal, "logs"),
  ].map((path) => mkdir(path, { recursive: true })));
  return { bridge, terminal };
}

function config(root: { bridge: string; terminal: string }) {
  return {
    bridgeRoot: root.bridge,
    terminalRoot: root.terminal,
    pollMs: 1_000,
    lookbackDays: 7,
  };
}
