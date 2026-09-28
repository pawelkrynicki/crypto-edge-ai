export const AXI_CRYPTO_SIGNAL_SCHEMA_VERSION = "axi_crypto_signal_v1" as const;
export const AXI_CRYPTO_SIGNAL_EVENT_TYPE = "SIGNAL_CREATED" as const;
export const AXI_CRYPTO_SIGNAL_MAX_BODY_BYTES = 16_384;

const MAX_PRICE = 1_000_000_000_000;
const MAX_RR = 1_000;
const MAX_HOLD_SECONDS = 366 * 24 * 60 * 60;
const MAX_VALID_FOR_SECONDS = 7 * 24 * 60 * 60;

export type AxiCryptoSignal = {
  schema_version: typeof AXI_CRYPTO_SIGNAL_SCHEMA_VERSION;
  event_type: typeof AXI_CRYPTO_SIGNAL_EVENT_TYPE;
  signal_id: string;
  source: {
    provider: "AXI";
    engine: "ALLinCrypto Engine";
    engine_version: string;
    strategy_version: string;
    terminal_id: string;
  };
  setup: {
    setup_id: string;
    setup_name: string;
    timeframe: string;
    family: string;
    max_hold_seconds: number | null;
  };
  trade: {
    symbol: string;
    side: "BUY" | "SELL";
    order_type: "MARKET" | "LIMIT";
    source_signal_time: string;
    source_time_basis: "AXI_SERVER";
    entry_price: number;
    stop_loss: number;
    take_profit: number;
    rr: number;
    cancel_price: number | null;
    valid_for_seconds: number | null;
  };
};

export type AxiCryptoSignalValidationErrorCode =
  | "AXI_SIGNAL_PAYLOAD_NOT_OBJECT"
  | "AXI_SIGNAL_PAYLOAD_FIELDS_INVALID"
  | "AXI_SIGNAL_SCHEMA_VERSION_INVALID"
  | "AXI_SIGNAL_EVENT_TYPE_INVALID"
  | "AXI_SIGNAL_SIGNAL_ID_INVALID"
  | "AXI_SIGNAL_SOURCE_NOT_OBJECT"
  | "AXI_SIGNAL_SOURCE_FIELDS_INVALID"
  | "AXI_SIGNAL_SOURCE_PROVIDER_INVALID"
  | "AXI_SIGNAL_SOURCE_ENGINE_INVALID"
  | "AXI_SIGNAL_ENGINE_VERSION_INVALID"
  | "AXI_SIGNAL_STRATEGY_VERSION_INVALID"
  | "AXI_SIGNAL_TERMINAL_ID_INVALID"
  | "AXI_SIGNAL_SETUP_NOT_OBJECT"
  | "AXI_SIGNAL_SETUP_FIELDS_INVALID"
  | "AXI_SIGNAL_SETUP_ID_INVALID"
  | "AXI_SIGNAL_SETUP_NAME_INVALID"
  | "AXI_SIGNAL_TIMEFRAME_INVALID"
  | "AXI_SIGNAL_SETUP_FAMILY_INVALID"
  | "AXI_SIGNAL_MAX_HOLD_SECONDS_INVALID"
  | "AXI_SIGNAL_TRADE_NOT_OBJECT"
  | "AXI_SIGNAL_TRADE_FIELDS_INVALID"
  | "AXI_SIGNAL_SYMBOL_INVALID"
  | "AXI_SIGNAL_SIDE_INVALID"
  | "AXI_SIGNAL_ORDER_TYPE_INVALID"
  | "AXI_SIGNAL_SOURCE_SIGNAL_TIME_INVALID"
  | "AXI_SIGNAL_SOURCE_TIME_BASIS_INVALID"
  | "AXI_SIGNAL_ENTRY_PRICE_INVALID"
  | "AXI_SIGNAL_STOP_LOSS_INVALID"
  | "AXI_SIGNAL_TAKE_PROFIT_INVALID"
  | "AXI_SIGNAL_RR_INVALID"
  | "AXI_SIGNAL_CANCEL_PRICE_INVALID"
  | "AXI_SIGNAL_VALID_FOR_SECONDS_INVALID"
  | "AXI_SIGNAL_PRICE_GEOMETRY_INVALID"
  | "AXI_SIGNAL_RR_MISMATCH"
  | "AXI_SIGNAL_MARKET_CONSTRAINT_INVALID";

export class AxiCryptoSignalValidationError extends Error {
  readonly code: AxiCryptoSignalValidationErrorCode;

  constructor(code: AxiCryptoSignalValidationErrorCode) {
    super(code);
    this.name = "AxiCryptoSignalValidationError";
    this.code = code;
  }
}

/**
 * Validates the complete source-owned contract. Setup fields intentionally use
 * bounded free-form identifiers rather than an application-owned setup enum.
 */
export function validateAxiCryptoSignal(value: unknown): AxiCryptoSignal {
  if (!isRecord(value)) fail("AXI_SIGNAL_PAYLOAD_NOT_OBJECT");
  requireExactKeys(value, ["schema_version", "event_type", "signal_id", "source", "setup", "trade"], "AXI_SIGNAL_PAYLOAD_FIELDS_INVALID");
  if (value.schema_version !== AXI_CRYPTO_SIGNAL_SCHEMA_VERSION) fail("AXI_SIGNAL_SCHEMA_VERSION_INVALID");
  if (value.event_type !== AXI_CRYPTO_SIGNAL_EVENT_TYPE) fail("AXI_SIGNAL_EVENT_TYPE_INVALID");
  const signalId = requireIdentifier(value.signal_id, 128, "AXI_SIGNAL_SIGNAL_ID_INVALID");
  const source = validateSource(value.source);
  const setup = validateSetup(value.setup);
  const trade = validateTrade(value.trade);

  validateTradeSemantics(trade);
  return {
    schema_version: AXI_CRYPTO_SIGNAL_SCHEMA_VERSION,
    event_type: AXI_CRYPTO_SIGNAL_EVENT_TYPE,
    signal_id: signalId,
    source,
    setup,
    trade,
  };
}

export function validateAxiSignalId(value: unknown): string {
  return requireIdentifier(value, 128, "AXI_SIGNAL_SIGNAL_ID_INVALID");
}

/** Canonical JSON is used as the idempotency comparison value in SQLite. */
export function canonicalAxiCryptoSignalPayload(signal: AxiCryptoSignal): string {
  return stableJson(signal);
}

function validateSource(value: unknown): AxiCryptoSignal["source"] {
  if (!isRecord(value)) fail("AXI_SIGNAL_SOURCE_NOT_OBJECT");
  requireExactKeys(value, ["provider", "engine", "engine_version", "strategy_version", "terminal_id"], "AXI_SIGNAL_SOURCE_FIELDS_INVALID");
  if (value.provider !== "AXI") fail("AXI_SIGNAL_SOURCE_PROVIDER_INVALID");
  if (value.engine !== "ALLinCrypto Engine") fail("AXI_SIGNAL_SOURCE_ENGINE_INVALID");
  return {
    provider: "AXI",
    engine: "ALLinCrypto Engine",
    engine_version: requireIdentifier(value.engine_version, 64, "AXI_SIGNAL_ENGINE_VERSION_INVALID"),
    strategy_version: requireIdentifier(value.strategy_version, 64, "AXI_SIGNAL_STRATEGY_VERSION_INVALID"),
    terminal_id: requireIdentifier(value.terminal_id, 128, "AXI_SIGNAL_TERMINAL_ID_INVALID"),
  };
}

function validateSetup(value: unknown): AxiCryptoSignal["setup"] {
  if (!isRecord(value)) fail("AXI_SIGNAL_SETUP_NOT_OBJECT");
  requireExactKeys(value, ["setup_id", "setup_name", "timeframe", "family", "max_hold_seconds"], "AXI_SIGNAL_SETUP_FIELDS_INVALID");
  return {
    setup_id: requireIdentifier(value.setup_id, 128, "AXI_SIGNAL_SETUP_ID_INVALID"),
    setup_name: requireText(value.setup_name, 128, "AXI_SIGNAL_SETUP_NAME_INVALID"),
    timeframe: requireIdentifier(value.timeframe, 32, "AXI_SIGNAL_TIMEFRAME_INVALID"),
    family: requireIdentifier(value.family, 64, "AXI_SIGNAL_SETUP_FAMILY_INVALID"),
    max_hold_seconds: requireNullableDuration(value.max_hold_seconds, MAX_HOLD_SECONDS, "AXI_SIGNAL_MAX_HOLD_SECONDS_INVALID"),
  };
}

function validateTrade(value: unknown): AxiCryptoSignal["trade"] {
  if (!isRecord(value)) fail("AXI_SIGNAL_TRADE_NOT_OBJECT");
  requireExactKeys(value, [
    "symbol", "side", "order_type", "source_signal_time", "source_time_basis", "entry_price",
    "stop_loss", "take_profit", "rr", "cancel_price", "valid_for_seconds",
  ], "AXI_SIGNAL_TRADE_FIELDS_INVALID");
  if (value.side !== "BUY" && value.side !== "SELL") fail("AXI_SIGNAL_SIDE_INVALID");
  if (value.order_type !== "MARKET" && value.order_type !== "LIMIT") fail("AXI_SIGNAL_ORDER_TYPE_INVALID");
  if (value.source_time_basis !== "AXI_SERVER") fail("AXI_SIGNAL_SOURCE_TIME_BASIS_INVALID");
  return {
    symbol: requireSymbol(value.symbol),
    side: value.side,
    order_type: value.order_type,
    source_signal_time: requireUtcTimestamp(value.source_signal_time),
    source_time_basis: "AXI_SERVER",
    entry_price: requirePositiveNumber(value.entry_price, "AXI_SIGNAL_ENTRY_PRICE_INVALID"),
    stop_loss: requirePositiveNumber(value.stop_loss, "AXI_SIGNAL_STOP_LOSS_INVALID"),
    take_profit: requirePositiveNumber(value.take_profit, "AXI_SIGNAL_TAKE_PROFIT_INVALID"),
    rr: requireRr(value.rr),
    cancel_price: requireNullablePositiveNumber(value.cancel_price, "AXI_SIGNAL_CANCEL_PRICE_INVALID"),
    valid_for_seconds: requireNullableDuration(value.valid_for_seconds, MAX_VALID_FOR_SECONDS, "AXI_SIGNAL_VALID_FOR_SECONDS_INVALID"),
  };
}

function validateTradeSemantics(trade: AxiCryptoSignal["trade"]): void {
  const buyGeometry = trade.side === "BUY"
    && trade.stop_loss < trade.entry_price
    && trade.entry_price < trade.take_profit;
  const sellGeometry = trade.side === "SELL"
    && trade.take_profit < trade.entry_price
    && trade.entry_price < trade.stop_loss;
  if (!buyGeometry && !sellGeometry) fail("AXI_SIGNAL_PRICE_GEOMETRY_INVALID");
  if (trade.order_type === "MARKET" && (trade.cancel_price !== null || trade.valid_for_seconds !== null)) {
    fail("AXI_SIGNAL_MARKET_CONSTRAINT_INVALID");
  }
  const reward = trade.side === "BUY"
    ? trade.take_profit - trade.entry_price
    : trade.entry_price - trade.take_profit;
  const risk = trade.side === "BUY"
    ? trade.entry_price - trade.stop_loss
    : trade.stop_loss - trade.entry_price;
  const impliedRr = reward / risk;
  if (!Number.isFinite(impliedRr) || Math.abs(trade.rr - impliedRr) / impliedRr > 0.02) {
    fail("AXI_SIGNAL_RR_MISMATCH");
  }
}

function requireSymbol(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,31}$/.test(value)) fail("AXI_SIGNAL_SYMBOL_INVALID");
  return value;
}

function requireIdentifier(value: unknown, maxLength: number, code: AxiCryptoSignalValidationErrorCode): string {
  if (typeof value !== "string" || value.length > maxLength || !/^[A-Za-z0-9][A-Za-z0-9._:.-]*$/.test(value)) fail(code);
  return value;
}

function requireText(value: unknown, maxLength: number, code: AxiCryptoSignalValidationErrorCode): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength || value !== value.trim() || /[\u0000-\u001f\u007f]/.test(value)) fail(code);
  return value;
}

function requireUtcTimestamp(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
    || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) {
    fail("AXI_SIGNAL_SOURCE_SIGNAL_TIME_INVALID");
  }
  return value;
}

function requirePositiveNumber(value: unknown, code: AxiCryptoSignalValidationErrorCode): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > MAX_PRICE) fail(code);
  return value;
}

function requireNullablePositiveNumber(value: unknown, code: AxiCryptoSignalValidationErrorCode): number | null {
  if (value === null) return null;
  return requirePositiveNumber(value, code);
}

function requireRr(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > MAX_RR) fail("AXI_SIGNAL_RR_INVALID");
  return value;
}

function requireNullableDuration(value: unknown, max: number, code: AxiCryptoSignalValidationErrorCode): number | null {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0 || value > max) fail(code);
  return value;
}

function requireExactKeys(value: Record<string, unknown>, expected: string[], code: AxiCryptoSignalValidationErrorCode): void {
  const keys = Object.keys(value).sort();
  const expectedKeys = [...expected].sort();
  if (keys.length !== expectedKeys.length || keys.some((key, index) => key !== expectedKeys[index])) fail(code);
}

function stableJson(value: unknown): string {
  if (value === null || typeof value === "number" || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  throw new Error("AXI_SIGNAL_CANONICALIZATION_INVALID");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(code: AxiCryptoSignalValidationErrorCode): never {
  throw new AxiCryptoSignalValidationError(code);
}
