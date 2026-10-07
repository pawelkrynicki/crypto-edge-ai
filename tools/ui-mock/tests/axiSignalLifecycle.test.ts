import assert from "node:assert/strict";
import test from "node:test";
import type { AxiCryptoSignal } from "../server/axiCryptoSignalContract.js";
import {
  applyAxiSignalLifecycleEvent,
  initialAxiSignalLifecycleState,
  validateAxiSignalLifecycleEvent,
} from "../server/axiSignalLifecycle.js";

test("MARKET starts ACTIVE and closes at TP with configured RR", () => {
  const signal = marketSignal({ signal_id: "life-market-1" });
  const initial = initialAxiSignalLifecycleState(signal);
  assert.equal(initial.status, "ACTIVE");

  const closed = applyAxiSignalLifecycleEvent(signal, initial, validateAxiSignalLifecycleEvent({
    schema_version: "axi_signal_lifecycle_v1",
    event_type: "POSITION_CLOSED",
    event_id: "life-market-1-close",
    signal_id: signal.signal_id,
    source_event_time: "2026-09-28T13:00:00.000Z",
    close_price: signal.trade.take_profit,
    close_reason: "TP",
  }));

  assert.equal(closed.status, "CLOSED");
  assert.equal(closed.close_reason, "TP");
  assert.ok(closed.result_r !== null);
  assert.ok(Math.abs(closed.result_r - signal.trade.rr) < 0.03);
});

test("LIMIT starts PENDING, fills, then closes at SL with -1R", () => {
  const signal = limitSignal({ signal_id: "life-limit-1" });
  const initial = initialAxiSignalLifecycleState(signal);
  assert.equal(initial.status, "PENDING");

  const active = applyAxiSignalLifecycleEvent(signal, initial, validateAxiSignalLifecycleEvent({
    schema_version: "axi_signal_lifecycle_v1",
    event_type: "ORDER_FILLED",
    event_id: "life-limit-1-fill",
    signal_id: signal.signal_id,
    source_event_time: "2026-09-28T12:30:00.000Z",
    fill_price: signal.trade.entry_price,
  }));
  assert.equal(active.status, "ACTIVE");

  const closed = applyAxiSignalLifecycleEvent(signal, active, validateAxiSignalLifecycleEvent({
    schema_version: "axi_signal_lifecycle_v1",
    event_type: "POSITION_CLOSED",
    event_id: "life-limit-1-close",
    signal_id: signal.signal_id,
    source_event_time: "2026-09-28T13:30:00.000Z",
    close_price: signal.trade.stop_loss,
    close_reason: "SL",
  }));
  assert.equal(closed.status, "CLOSED");
  assert.equal(closed.result_r, -1);
});

test("LIMIT can expire without becoming active", () => {
  const signal = limitSignal({ signal_id: "life-limit-expire" });
  const expired = applyAxiSignalLifecycleEvent(signal, initialAxiSignalLifecycleState(signal), validateAxiSignalLifecycleEvent({
    schema_version: "axi_signal_lifecycle_v1",
    event_type: "SIGNAL_EXPIRED",
    event_id: "life-limit-expire-event",
    signal_id: signal.signal_id,
    source_event_time: "2026-09-28T14:00:00.000Z",
  }));
  assert.equal(expired.status, "EXPIRED");
  assert.equal(expired.result_r, null);
});

test("rejects closing a pending LIMIT before fill", () => {
  const signal = limitSignal({ signal_id: "life-limit-invalid" });
  assert.throws(() => applyAxiSignalLifecycleEvent(signal, initialAxiSignalLifecycleState(signal), validateAxiSignalLifecycleEvent({
    schema_version: "axi_signal_lifecycle_v1",
    event_type: "POSITION_CLOSED",
    event_id: "life-limit-invalid-close",
    signal_id: signal.signal_id,
    source_event_time: "2026-09-28T13:00:00.000Z",
    close_price: signal.trade.take_profit,
    close_reason: "TP",
  })), /AXI_LIFECYCLE_INVALID_TRANSITION/);
});

test("rejects lifecycle time regression", () => {
  const signal = marketSignal({ signal_id: "life-time-regression" });
  assert.throws(() => applyAxiSignalLifecycleEvent(signal, initialAxiSignalLifecycleState(signal), validateAxiSignalLifecycleEvent({
    schema_version: "axi_signal_lifecycle_v1",
    event_type: "POSITION_CLOSED",
    event_id: "life-time-regression-close",
    signal_id: signal.signal_id,
    source_event_time: "2026-09-28T11:00:00.000Z",
    close_price: signal.trade.stop_loss,
    close_reason: "SL",
  })), /AXI_LIFECYCLE_EVENT_TIME_REGRESSION/);
});

function marketSignal(overrides: Partial<AxiCryptoSignal> = {}): AxiCryptoSignal {
  const signal: AxiCryptoSignal = {
    schema_version: "axi_crypto_signal_v1",
    event_type: "SIGNAL_CREATED",
    signal_id: "market-0001",
    source: {
      provider: "AXI",
      engine: "ALLinCrypto Engine",
      engine_version: "1.10",
      strategy_version: "1.00",
      terminal_id: "ACC1246441380",
    },
    setup: {
      setup_id: "J",
      setup_name: "Test setup",
      timeframe: "H4",
      family: "ENGINE",
      max_hold_seconds: 86400,
    },
    trade: {
      symbol: "BTCUSD",
      side: "BUY",
      order_type: "MARKET",
      source_signal_time: "2026-09-28T11:59:59.000Z",
      source_time_basis: "AXI_SERVER",
      entry_price: 100,
      stop_loss: 90,
      take_profit: 120,
      rr: 2,
      cancel_price: null,
      valid_for_seconds: null,
    },
  };
  return { ...signal, ...overrides };
}

function limitSignal(overrides: Partial<AxiCryptoSignal> = {}): AxiCryptoSignal {
  const signal = marketSignal({
    signal_id: "limit-0001",
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
  });
  return { ...signal, ...overrides };
}
