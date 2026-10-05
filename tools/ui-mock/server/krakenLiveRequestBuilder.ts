import { createHash } from "node:crypto";
import type { KrakenOrderIntent } from "./krakenOrderIntent.js";
import { roundDownToStep } from "./krakenOrderIntent.js";

export type KrakenSendOrderType = "mkt" | "lmt" | "stp" | "take_profit";
export type KrakenSendOrderSide = "buy" | "sell";

export type KrakenSendOrderRequest = {
  orderType: KrakenSendOrderType;
  symbol: string;
  side: KrakenSendOrderSide;
  size: number;
  cliOrdId: string;
  limitPrice?: number;
  stopPrice?: number;
  triggerSignal?: "mark" | "index" | "last";
  reduceOnly?: boolean;
  processBefore?: string;
};

export type KrakenLivePilotEntryPlan = {
  source_intent_id: string;
  source_quantity: number;
  source_notional_usd: number;
  pilot_max_notional_usd: number;
  pilot_quantity: number;
  estimated_pilot_notional_usd: number;
  request: KrakenSendOrderRequest;
};

export type KrakenProtectiveExitPlan = {
  source_intent_id: string;
  filled_quantity: number;
  stop_loss: KrakenSendOrderRequest;
  take_profit: KrakenSendOrderRequest;
  peer_cancel_required_after_first_fill: true;
};

export class KrakenLiveRequestError extends Error {
  readonly code:
    | "KRAKEN_LIVE_INTENT_NOT_READY"
    | "KRAKEN_LIVE_PILOT_CAP_INVALID"
    | "KRAKEN_LIVE_PILOT_QUANTITY_ZERO"
    | "KRAKEN_LIVE_FILLED_QUANTITY_INVALID";

  constructor(code: KrakenLiveRequestError["code"]) {
    super(code);
    this.name = "KrakenLiveRequestError";
    this.code = code;
  }
}

export function buildKrakenLivePilotEntryPlan(
  intent: KrakenOrderIntent,
  pilotMaxNotionalUsd: number,
): KrakenLivePilotEntryPlan {
  if (intent.status !== "READY") throw new KrakenLiveRequestError("KRAKEN_LIVE_INTENT_NOT_READY");
  if (!Number.isFinite(pilotMaxNotionalUsd) || pilotMaxNotionalUsd <= 0) {
    throw new KrakenLiveRequestError("KRAKEN_LIVE_PILOT_CAP_INVALID");
  }

  const maxQuantityByPilot = pilotMaxNotionalUsd / intent.reference_price;
  const pilotQuantity = roundDownToStep(
    Math.min(intent.quantity, maxQuantityByPilot),
    intent.quantity_step,
  );
  if (pilotQuantity <= 0) throw new KrakenLiveRequestError("KRAKEN_LIVE_PILOT_QUANTITY_ZERO");

  const request: KrakenSendOrderRequest = {
    orderType: intent.order_type,
    symbol: intent.kraken_symbol,
    side: intent.side,
    size: pilotQuantity,
    cliOrdId: clientOrderId(intent.intent_id, "entry"),
    reduceOnly: false,
  };
  if (intent.order_type === "lmt") {
    if (intent.limit_price === null) throw new KrakenLiveRequestError("KRAKEN_LIVE_INTENT_NOT_READY");
    request.limitPrice = intent.limit_price;
  }

  return {
    source_intent_id: intent.intent_id,
    source_quantity: intent.quantity,
    source_notional_usd: intent.estimated_notional_usd,
    pilot_max_notional_usd: pilotMaxNotionalUsd,
    pilot_quantity: pilotQuantity,
    estimated_pilot_notional_usd: pilotQuantity * intent.reference_price,
    request,
  };
}

export function buildKrakenProtectiveExitPlan(
  intent: KrakenOrderIntent,
  filledQuantity: number,
): KrakenProtectiveExitPlan {
  if (intent.status !== "READY") throw new KrakenLiveRequestError("KRAKEN_LIVE_INTENT_NOT_READY");
  const quantity = roundDownToStep(filledQuantity, intent.quantity_step);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new KrakenLiveRequestError("KRAKEN_LIVE_FILLED_QUANTITY_INVALID");
  }

  const exitSide: KrakenSendOrderSide = intent.side === "buy" ? "sell" : "buy";
  return {
    source_intent_id: intent.intent_id,
    filled_quantity: quantity,
    stop_loss: {
      orderType: "stp",
      symbol: intent.kraken_symbol,
      side: exitSide,
      size: quantity,
      cliOrdId: clientOrderId(intent.intent_id, "sl"),
      stopPrice: intent.stop_loss_price,
      triggerSignal: "mark",
      reduceOnly: true,
    },
    take_profit: {
      orderType: "take_profit",
      symbol: intent.kraken_symbol,
      side: exitSide,
      size: quantity,
      cliOrdId: clientOrderId(intent.intent_id, "tp"),
      stopPrice: intent.take_profit_price,
      triggerSignal: "mark",
      reduceOnly: true,
    },
    peer_cancel_required_after_first_fill: true,
  };
}

export function clientOrderId(intentId: string, leg: "entry" | "sl" | "tp"): string {
  const digest = createHash("sha256").update(intentId).digest("hex").slice(0, 24);
  return `ce-${leg}-${digest}`;
}
