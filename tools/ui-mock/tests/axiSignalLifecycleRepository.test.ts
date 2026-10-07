import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import type { AxiCryptoSignal } from "../server/axiCryptoSignalContract.js";
import { createAxiSignalRepository } from "../server/axiSignalRepository.js";

test("persists lifecycle events and rebuilds current state after repository reopen", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "crypto-edge-lifecycle-repo-"));
  const db = resolve(root, "axi-signals.sqlite");

  try {
    const first = await createAxiSignalRepository({ databaseFilePath: db });
    const signal = limitSignal();
    first.ingest({ signal, now: new Date("2026-09-28T12:00:00.000Z") });

    const filled = first.ingestLifecycle({
      event: {
        schema_version: "axi_signal_lifecycle_v1",
        event_type: "ORDER_FILLED",
        event_id: "repo-life-fill",
        signal_id: signal.signal_id,
        source_event_time: "2026-09-28T12:30:00.000Z",
        fill_price: 100,
      },
      now: new Date("2026-09-28T12:30:01.000Z"),
    });
    assert.equal(filled.status, "CREATED");
    assert.equal(filled.snapshot.state.status, "ACTIVE");

    const closed = first.ingestLifecycle({
      event: {
        schema_version: "axi_signal_lifecycle_v1",
        event_type: "POSITION_CLOSED",
        event_id: "repo-life-close",
        signal_id: signal.signal_id,
        source_event_time: "2026-09-28T13:00:00.000Z",
        close_price: 80,
        close_reason: "TP",
      },
      now: new Date("2026-09-28T13:00:01.000Z"),
    });
    assert.equal(closed.status, "CREATED");
    assert.equal(closed.snapshot.state.status, "CLOSED");
    assert.equal(closed.snapshot.state.result_r, 2);
    first.close();

    const reopened = await createAxiSignalRepository({ databaseFilePath: db });
    const snapshot = reopened.getLifecycle(signal.signal_id);
    assert.equal(snapshot.state.status, "CLOSED");
    assert.equal(snapshot.state.close_reason, "TP");
    assert.equal(snapshot.state.result_r, 2);
    assert.equal(snapshot.events.length, 2);
    reopened.close();
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 3 });
  }
});

test("lifecycle event ingest is idempotent and rejects conflicting event ids", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "crypto-edge-lifecycle-idempotency-"));
  try {
    const repository = await createAxiSignalRepository({ databaseFilePath: resolve(root, "axi.sqlite") });
    const signal = limitSignal();
    repository.ingest({ signal });

    const event = {
      schema_version: "axi_signal_lifecycle_v1" as const,
      event_type: "SIGNAL_EXPIRED" as const,
      event_id: "repo-life-expire",
      signal_id: signal.signal_id,
      source_event_time: "2026-09-28T13:00:00.000Z",
    };

    assert.equal(repository.ingestLifecycle({ event }).status, "CREATED");
    assert.equal(repository.ingestLifecycle({ event }).status, "DUPLICATE");

    const conflict = repository.ingestLifecycle({
      event: { ...event, source_event_time: "2026-09-28T13:01:00.000Z" },
    });
    assert.equal(conflict.status, "CONFLICT");
    repository.close();
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 3 });
  }
});

test("rejects lifecycle event for unknown signal", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "crypto-edge-lifecycle-missing-"));
  try {
    const repository = await createAxiSignalRepository({ databaseFilePath: resolve(root, "axi.sqlite") });
    assert.throws(() => repository.ingestLifecycle({
      event: {
        schema_version: "axi_signal_lifecycle_v1",
        event_type: "SIGNAL_CANCELLED",
        event_id: "missing-cancel",
        signal_id: "missing-signal",
        source_event_time: "2026-09-28T13:00:00.000Z",
      },
    }), /AXI_SIGNAL_NOT_FOUND/);
    repository.close();
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 3 });
  }
});

function limitSignal(): AxiCryptoSignal {
  return {
    schema_version: "axi_crypto_signal_v1",
    event_type: "SIGNAL_CREATED",
    signal_id: "repo-limit-1",
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
