import type { AxiCryptoSignal } from "./axiCryptoSignalContract.js";

export const AXI_SIGNAL_LIFECYCLE_SCHEMA_VERSION = "axi_signal_lifecycle_v1" as const;

export type AxiSignalLifecycleEventType =
  | "ORDER_FILLED"
  | "SIGNAL_EXPIRED"
  | "SIGNAL_CANCELLED"
  | "POSITION_CLOSED";

export type AxiSignalCloseReason = "TP" | "SL" | "TIME_EXIT" | "MANUAL" | "OTHER";
export type AxiSignalLifecycleStatus = "PENDING" | "ACTIVE" | "EXPIRED" | "CANCELLED" | "CLOSED";

type BaseLifecycleEvent = {
  schema_version: typeof AXI_SIGNAL_LIFECYCLE_SCHEMA_VERSION;
  event_type: AxiSignalLifecycleEventType;
  event_id: string;
  signal_id: string;
  source_event_time: string;
};

export type AxiSignalOrderFilledEvent = BaseLifecycleEvent & {
  event_type: "ORDER_FILLED";
  fill_price: number;
};

export type AxiSignalExpiredEvent = BaseLifecycleEvent & {
  event_type: "SIGNAL_EXPIRED";
};

export type AxiSignalCancelledEvent = BaseLifecycleEvent & {
  event_type: "SIGNAL_CANCELLED";
};

export type AxiSignalPositionClosedEvent = BaseLifecycleEvent & {
  event_type: "POSITION_CLOSED";
  close_price: number;
  close_reason: AxiSignalCloseReason;
};

export type AxiSignalLifecycleEvent =
  | AxiSignalOrderFilledEvent
  | AxiSignalExpiredEvent
  | AxiSignalCancelledEvent
  | AxiSignalPositionClosedEvent;

export type AxiSignalLifecycleState = {
  signal_id: string;
  status: AxiSignalLifecycleStatus;
  entry_price: number | null;
  filled_at: string | null;
  closed_at: string | null;
  close_price: number | null;
  close_reason: AxiSignalCloseReason | null;
  result_r: number | null;
  last_event_time: string;
};

export class AxiSignalLifecycleError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "AxiSignalLifecycleError";
    this.code = code;
  }
}

export function validateAxiSignalLifecycleEvent(value: unknown): AxiSignalLifecycleEvent {
  if (!isRecord(value)) fail("AXI_LIFECYCLE_PAYLOAD_NOT_OBJECT");
  if (value.schema_version !== AXI_SIGNAL_LIFECYCLE_SCHEMA_VERSION) fail("AXI_LIFECYCLE_SCHEMA_VERSION_INVALID");
  const eventType = value.event_type;
  if (eventType !== "ORDER_FILLED" && eventType !== "SIGNAL_EXPIRED"
    && eventType !== "SIGNAL_CANCELLED" && eventType !== "POSITION_CLOSED") {
    fail("AXI_LIFECYCLE_EVENT_TYPE_INVALID");
  }

  const base = {
    schema_version: AXI_SIGNAL_LIFECYCLE_SCHEMA_VERSION,
    event_type: eventType,
    event_id: requireIdentifier(value.event_id, "AXI_LIFECYCLE_EVENT_ID_INVALID"),
    signal_id: requireIdentifier(value.signal_id, "AXI_LIFECYCLE_SIGNAL_ID_INVALID"),
    source_event_time: requireUtcTimestamp(value.source_event_time),
  } as const;

  if (eventType === "ORDER_FILLED") {
    requireExactKeys(value, ["schema_version", "event_type", "event_id", "signal_id", "source_event_time", "fill_price"]);
    return { ...base, event_type: "ORDER_FILLED", fill_price: requirePositiveNumber(value.fill_price, "AXI_LIFECYCLE_FILL_PRICE_INVALID") };
  }
  if (eventType === "SIGNAL_EXPIRED") {
    requireExactKeys(value, ["schema_version", "event_type", "event_id", "signal_id", "source_event_time"]);
    return { ...base, event_type: "SIGNAL_EXPIRED" };
  }
  if (eventType === "SIGNAL_CANCELLED") {
    requireExactKeys(value, ["schema_version", "event_type", "event_id", "signal_id", "source_event_time"]);
    return { ...base, event_type: "SIGNAL_CANCELLED" };
  }

  requireExactKeys(value, ["schema_version", "event_type", "event_id", "signal_id", "source_event_time", "close_price", "close_reason"]);
  const closeReason = value.close_reason;
  if (closeReason !== "TP" && closeReason !== "SL" && closeReason !== "TIME_EXIT"
    && closeReason !== "MANUAL" && closeReason !== "OTHER") {
    fail("AXI_LIFECYCLE_CLOSE_REASON_INVALID");
  }
  return {
    ...base,
    event_type: "POSITION_CLOSED",
    close_price: requirePositiveNumber(value.close_price, "AXI_LIFECYCLE_CLOSE_PRICE_INVALID"),
    close_reason: closeReason,
  };
}

export function canonicalAxiSignalLifecycleEvent(event: AxiSignalLifecycleEvent): string {
  return stableJson(event);
}

export function initialAxiSignalLifecycleState(signal: AxiCryptoSignal): AxiSignalLifecycleState {
  return {
    signal_id: signal.signal_id,
    status: signal.trade.order_type === "LIMIT" ? "PENDING" : "ACTIVE",
    entry_price: signal.trade.order_type === "MARKET" ? signal.trade.entry_price : null,
    filled_at: null,
    closed_at: null,
    close_price: null,
    close_reason: null,
    result_r: null,
    last_event_time: signal.trade.source_signal_time,
  };
}

export function applyAxiSignalLifecycleEvent(
  signal: AxiCryptoSignal,
  state: AxiSignalLifecycleState,
  event: AxiSignalLifecycleEvent,
): AxiSignalLifecycleState {
  if (event.signal_id !== signal.signal_id || state.signal_id !== signal.signal_id) {
    fail("AXI_LIFECYCLE_SIGNAL_MISMATCH");
  }
  if (Date.parse(event.source_event_time) < Date.parse(state.last_event_time)) {
    fail("AXI_LIFECYCLE_EVENT_TIME_REGRESSION");
  }

  if (event.event_type === "ORDER_FILLED") {
    const limitFill = signal.trade.order_type === "LIMIT" && state.status === "PENDING";
    const marketFill = signal.trade.order_type === "MARKET" && state.status === "ACTIVE" && state.filled_at === null;
    if (!limitFill && !marketFill) fail("AXI_LIFECYCLE_INVALID_TRANSITION");
    return {
      ...state,
      status: "ACTIVE",
      entry_price: event.fill_price,
      filled_at: event.source_event_time,
      last_event_time: event.source_event_time,
    };
  }

  if (event.event_type === "SIGNAL_EXPIRED") {
    if (state.status !== "PENDING") fail("AXI_LIFECYCLE_INVALID_TRANSITION");
    return { ...state, status: "EXPIRED", last_event_time: event.source_event_time };
  }

  if (event.event_type === "SIGNAL_CANCELLED") {
    if (state.status !== "PENDING") fail("AXI_LIFECYCLE_INVALID_TRANSITION");
    return { ...state, status: "CANCELLED", last_event_time: event.source_event_time };
  }

  if (state.status !== "ACTIVE" || state.entry_price === null || state.filled_at === null) fail("AXI_LIFECYCLE_INVALID_TRANSITION");
  const resultR = resolveResultR(signal, state.entry_price, event.close_price);
  return {
    ...state,
    status: "CLOSED",
    closed_at: event.source_event_time,
    close_price: event.close_price,
    close_reason: event.close_reason,
    result_r: resultR,
    last_event_time: event.source_event_time,
  };
}

function resolveResultR(signal: AxiCryptoSignal, entryPrice: number, closePrice: number): number {
  const risk = signal.trade.side === "BUY"
    ? entryPrice - signal.trade.stop_loss
    : signal.trade.stop_loss - entryPrice;
  if (!Number.isFinite(risk) || risk <= 0) fail("AXI_LIFECYCLE_INVALID_ENTRY_GEOMETRY");

  const pnl = signal.trade.side === "BUY"
    ? closePrice - entryPrice
    : entryPrice - closePrice;
  return Math.round((pnl / risk) * 1_000_000) / 1_000_000;
}

function requireIdentifier(value: unknown, code: string): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:.-]{0,127}$/.test(value)) fail(code);
  return value;
}

function requireUtcTimestamp(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
    || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) {
    fail("AXI_LIFECYCLE_EVENT_TIME_INVALID");
  }
  return value;
}

function requirePositiveNumber(value: unknown, code: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > 1_000_000_000_000) fail(code);
  return value;
}

function requireExactKeys(value: Record<string, unknown>, expected: string[]): void {
  const keys = Object.keys(value).sort();
  const expectedKeys = [...expected].sort();
  if (keys.length !== expectedKeys.length || keys.some((key, index) => key !== expectedKeys[index])) {
    fail("AXI_LIFECYCLE_PAYLOAD_FIELDS_INVALID");
  }
}

function stableJson(value: unknown): string {
  if (value === null || typeof value === "number" || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  throw new Error("AXI_LIFECYCLE_CANONICALIZATION_INVALID");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(code: string): never {
  throw new AxiSignalLifecycleError(code);
}
