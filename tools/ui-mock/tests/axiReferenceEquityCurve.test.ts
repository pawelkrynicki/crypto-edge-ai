import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import type { AxiCryptoSignal } from "../server/axiCryptoSignalContract.js";
import { buildAxiReferenceEquityCurve } from "../server/axiReferenceEquityCurve.js";
import { createAxiSignalRepository } from "../server/axiSignalRepository.js";

test("builds a 10k compounded reference curve from closed Engine lifecycle only", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "crypto-edge-reference-equity-"));
  const repository = await createAxiSignalRepository({ databaseFilePath: resolve(root, "axi.sqlite") });

  try {
    await closeMarket(repository, signal("eq-1", "A", "2026-10-01T10:00:00.000Z"), "2026-10-01T10:01:00.000Z", 120, "TP");
    await closeMarket(repository, signal("eq-2", "B", "2026-10-02T10:00:00.000Z"), "2026-10-02T10:01:00.000Z", 90, "SL");
    await closeMarket(repository, signal("eq-3", "C", "2026-10-03T10:00:00.000Z", 110), "2026-10-03T10:01:00.000Z", 110, "OTHER");

    const open = signal("eq-open", "D", "2026-10-04T10:00:00.000Z");
    repository.ingest({ signal: open });
    repository.ingestLifecycle({ event: {
      schema_version: "axi_signal_lifecycle_v1",
      event_type: "ORDER_FILLED",
      event_id: "eq-open-fill",
      signal_id: open.signal_id,
      source_event_time: "2026-10-04T10:01:00.000Z",
      fill_price: 100,
    }});

    const curve = buildAxiReferenceEquityCurve(repository);
    assert.equal(curve.starting_equity_usd, 10_000);
    assert.equal(curve.risk_pct_per_trade, 1);
    assert.equal(curve.closed_trade_count, 3);
    assert.equal(curve.win_count, 2);
    assert.equal(curve.loss_count, 1);
    assert.equal(curve.flat_count, 0);
    assert.equal(curve.win_rate_pct, 66.67);
    assert.equal(curve.points[0]?.equity_after_usd, 10_200);
    assert.equal(curve.points[1]?.equity_after_usd, 10_098);
    assert.equal(curve.points[2]?.equity_after_usd, 10_198.98);
    assert.equal(curve.ending_equity_usd, 10_198.98);
    assert.equal(curve.net_pnl_usd, 198.98);
    assert.equal(curve.max_drawdown_pct, 1);
    assert.equal(curve.total_r, 2);
    assert.deepEqual(curve.points.map((point) => point.signal_id), ["eq-1", "eq-2", "eq-3"]);
  } finally {
    repository.close();
    await rm(root, { recursive: true, force: true, maxRetries: 3 });
  }
});

async function closeMarket(
  repository: Awaited<ReturnType<typeof createAxiSignalRepository>>,
  source: AxiCryptoSignal,
  fillTime: string,
  closePrice: number,
  closeReason: "TP" | "SL" | "OTHER",
): Promise<void> {
  repository.ingest({ signal: source });
  repository.ingestLifecycle({ event: {
    schema_version: "axi_signal_lifecycle_v1",
    event_type: "ORDER_FILLED",
    event_id: `${source.signal_id}-fill`,
    signal_id: source.signal_id,
    source_event_time: fillTime,
    fill_price: 100,
  }});
  repository.ingestLifecycle({ event: {
    schema_version: "axi_signal_lifecycle_v1",
    event_type: "POSITION_CLOSED",
    event_id: `${source.signal_id}-close`,
    signal_id: source.signal_id,
    source_event_time: fillTime.replace("10:01:00", "11:00:00"),
    close_price: closePrice,
    close_reason: closeReason,
  }});
}

function signal(id: string, setupId: string, sourceTime: string, takeProfit = 120): AxiCryptoSignal {
  return {
    schema_version: "axi_crypto_signal_v1",
    event_type: "SIGNAL_CREATED",
    signal_id: id,
    source: {
      provider: "AXI",
      engine: "ALLinCrypto Engine",
      engine_version: "1.10",
      strategy_version: "1.10",
      terminal_id: "ACC1246441380",
    },
    setup: {
      setup_id: setupId,
      setup_name: `Setup ${setupId}`,
      timeframe: "H1",
      family: "ENGINE",
      max_hold_seconds: 86400,
    },
    trade: {
      symbol: "BTCUSD",
      side: "BUY",
      order_type: "MARKET",
      source_signal_time: sourceTime,
      source_time_basis: "AXI_SERVER",
      entry_price: 100,
      stop_loss: 90,
      take_profit: takeProfit,
      rr: (takeProfit - 100) / 10,
      cancel_price: null,
      valid_for_seconds: null,
    },
  };
}
