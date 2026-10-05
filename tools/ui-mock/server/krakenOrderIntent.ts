import { createHash } from "node:crypto";
import type { EquityPlan } from "../../data-poc/src/trading/equityPlanner.js";
import type { AxiCryptoSignal } from "./axiCryptoSignalContract.js";
import type { KrakenInstrumentFacts } from "./krakenInstrumentAdapter.js";

export const KRAKEN_ORDER_INTENT_SCHEMA_VERSION =
  "crypto_edge_kraken_order_intent_v1" as const;

export type KrakenOrderIntentStatus = "READY" | "BLOCKED";

export type KrakenOrderIntentReasonCode =
  | "EQUITY_PLAN_BLOCKED"
  | "KRAKEN_INSTRUMENT_NOT_TRADEABLE"
  | "KRAKEN_INSTRUMENT_SYMBOL_MISMATCH"
  | "KRAKEN_QUANTITY_ROUNDED_TO_ZERO"
  | "KRAKEN_MAX_POSITION_SIZE_EXCEEDED"
  | "KRAKEN_PRICE_ALIGNMENT_INVALID";

export type KrakenOrderIntent = {
  schema_version: typeof KRAKEN_ORDER_INTENT_SCHEMA_VERSION;
  mode: "DRY_RUN";
  status: KrakenOrderIntentStatus;
  reason_codes: KrakenOrderIntentReasonCode[];
  intent_id: string;
  signal_id: string;
  source_symbol: string;
  kraken_symbol: string;
  side: "buy" | "sell";
  order_type: "mkt" | "lmt";
  quantity: number;
  quantity_step: number;
  reference_price: number;
  limit_price: number | null;
  stop_loss_price: number;
  take_profit_price: number;
  planned_notional_usd: number;
  estimated_notional_usd: number;
  effective_leverage: number;
  reduce_only: false;
  valid_for_seconds: number | null;
  source_prices: {
    entry_price: number;
    stop_loss: number;
    take_profit: number;
  };
};

export function buildKrakenOrderIntent(input: {
  signal: AxiCryptoSignal;
  plan: EquityPlan;
  instrument: KrakenInstrumentFacts;
}): KrakenOrderIntent {
  const { signal, plan, instrument } = input;
  const base = baseIntent(signal, plan, instrument);

  if (plan.status === "BLOCKED") return blocked(base, "EQUITY_PLAN_BLOCKED");
  if (!instrument.tradeable) return blocked(base, "KRAKEN_INSTRUMENT_NOT_TRADEABLE");
  if (!symbolsMatch(signal.trade.symbol, instrument.source_symbol)) {
    return blocked(base, "KRAKEN_INSTRUMENT_SYMBOL_MISMATCH");
  }

  const referencePrice = referencePriceForOrder(signal, instrument.tick_size);
  const quantity = roundDownToStep(
    plan.planned_notional_usd / referencePrice,
    instrument.quantity_step,
  );

  if (!Number.isFinite(quantity) || quantity <= 0) {
    return blocked({ ...base, reference_price: referencePrice, quantity: 0 }, "KRAKEN_QUANTITY_ROUNDED_TO_ZERO");
  }
  if (instrument.max_position_size !== null && quantity > instrument.max_position_size) {
    return blocked({ ...base, reference_price: referencePrice, quantity }, "KRAKEN_MAX_POSITION_SIZE_EXCEEDED");
  }

  const limitPrice = signal.trade.order_type === "LIMIT"
    ? alignEntryPrice(signal.trade.entry_price, instrument.tick_size, signal.trade.side)
    : null;
  const stopLoss = alignStopPrice(signal.trade.stop_loss, instrument.tick_size, signal.trade.side);
  const takeProfit = alignTakeProfitPrice(signal.trade.take_profit, instrument.tick_size, signal.trade.side);

  const geometryReference = limitPrice ?? referencePrice;
  const geometryValid = signal.trade.side === "BUY"
    ? stopLoss < geometryReference && geometryReference < takeProfit
    : takeProfit < geometryReference && geometryReference < stopLoss;

  if (!geometryValid) {
    return blocked(
      {
        ...base,
        reference_price: referencePrice,
        quantity,
        limit_price: limitPrice,
        stop_loss_price: stopLoss,
        take_profit_price: takeProfit,
      },
      "KRAKEN_PRICE_ALIGNMENT_INVALID",
    );
  }

  const estimatedNotionalUsd = quantity * referencePrice;
  const ready: KrakenOrderIntent = {
    ...base,
    status: "READY",
    reason_codes: [],
    reference_price: referencePrice,
    quantity,
    limit_price: limitPrice,
    stop_loss_price: stopLoss,
    take_profit_price: takeProfit,
    estimated_notional_usd: estimatedNotionalUsd,
  };
  return { ...ready, intent_id: intentId(ready) };
}

function baseIntent(
  signal: AxiCryptoSignal,
  plan: EquityPlan,
  instrument: KrakenInstrumentFacts,
): KrakenOrderIntent {
  const referencePrice = referencePriceForOrder(signal, instrument.tick_size);
  const intent: KrakenOrderIntent = {
    schema_version: KRAKEN_ORDER_INTENT_SCHEMA_VERSION,
    mode: "DRY_RUN",
    status: "BLOCKED",
    reason_codes: [],
    intent_id: "",
    signal_id: signal.signal_id,
    source_symbol: signal.trade.symbol,
    kraken_symbol: instrument.kraken_symbol,
    side: signal.trade.side === "BUY" ? "buy" : "sell",
    order_type: signal.trade.order_type === "MARKET" ? "mkt" : "lmt",
    quantity: 0,
    quantity_step: instrument.quantity_step,
    reference_price: referencePrice,
    limit_price: signal.trade.order_type === "LIMIT"
      ? alignEntryPrice(signal.trade.entry_price, instrument.tick_size, signal.trade.side)
      : null,
    stop_loss_price: alignStopPrice(signal.trade.stop_loss, instrument.tick_size, signal.trade.side),
    take_profit_price: alignTakeProfitPrice(signal.trade.take_profit, instrument.tick_size, signal.trade.side),
    planned_notional_usd: plan.planned_notional_usd,
    estimated_notional_usd: 0,
    effective_leverage: plan.effective_leverage,
    reduce_only: false,
    valid_for_seconds: signal.trade.valid_for_seconds,
    source_prices: {
      entry_price: signal.trade.entry_price,
      stop_loss: signal.trade.stop_loss,
      take_profit: signal.trade.take_profit,
    },
  };
  return { ...intent, intent_id: intentId(intent) };
}

function blocked(intent: KrakenOrderIntent, reason: KrakenOrderIntentReasonCode): KrakenOrderIntent {
  const value: KrakenOrderIntent = {
    ...intent,
    status: "BLOCKED",
    reason_codes: [reason],
  };
  return { ...value, intent_id: intentId(value) };
}

function referencePriceForOrder(signal: AxiCryptoSignal, tick: number): number {
  if (signal.trade.order_type === "LIMIT") {
    return alignEntryPrice(signal.trade.entry_price, tick, signal.trade.side);
  }
  return alignNearest(signal.trade.entry_price, tick);
}

function alignEntryPrice(value: number, tick: number, side: "BUY" | "SELL"): number {
  return side === "BUY" ? alignDown(value, tick) : alignUp(value, tick);
}

function alignStopPrice(value: number, tick: number, side: "BUY" | "SELL"): number {
  return side === "BUY" ? alignUp(value, tick) : alignDown(value, tick);
}

function alignTakeProfitPrice(value: number, tick: number, side: "BUY" | "SELL"): number {
  return side === "BUY" ? alignDown(value, tick) : alignUp(value, tick);
}

function symbolsMatch(left: string, right: string): boolean {
  return normalizeSymbol(left) === normalizeSymbol(right);
}

function normalizeSymbol(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function roundDownToStep(value: number, step: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(step) || value < 0 || step <= 0) return 0;
  const units = Math.floor((value + Number.EPSILON) / step);
  return normalizeDecimal(units * step);
}

export function alignNearest(value: number, tick: number): number {
  if (!validPriceAndTick(value, tick)) return 0;
  return normalizeDecimal(Math.round(value / tick) * tick);
}

export function alignDown(value: number, tick: number): number {
  if (!validPriceAndTick(value, tick)) return 0;
  return normalizeDecimal(Math.floor((value + Number.EPSILON) / tick) * tick);
}

export function alignUp(value: number, tick: number): number {
  if (!validPriceAndTick(value, tick)) return 0;
  return normalizeDecimal(Math.ceil((value - Number.EPSILON) / tick) * tick);
}

function validPriceAndTick(value: number, tick: number): boolean {
  return Number.isFinite(value) && Number.isFinite(tick) && value > 0 && tick > 0;
}

function normalizeDecimal(value: number): number {
  return Number(value.toPrecision(15));
}

function intentId(intent: Omit<KrakenOrderIntent, "intent_id"> | KrakenOrderIntent): string {
  const canonical = [
    intent.signal_id,
    intent.kraken_symbol,
    intent.side,
    intent.order_type,
    intent.quantity,
    intent.reference_price,
    intent.limit_price,
    intent.stop_loss_price,
    intent.take_profit_price,
    intent.planned_notional_usd,
    intent.status,
    intent.reason_codes.join(","),
  ].join("|");
  return `ki_${createHash("sha256").update(canonical).digest("hex").slice(0, 32)}`;
}
