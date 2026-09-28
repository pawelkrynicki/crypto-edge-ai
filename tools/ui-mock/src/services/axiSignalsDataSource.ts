export type AxiSignalSide = "BUY" | "SELL";
export type AxiSignalOrderType = "MARKET" | "LIMIT";

export type AxiSignalRecord = {
  signal: {
    schema_version: "axi_crypto_signal_v1";
    event_type: "SIGNAL_CREATED";
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
      side: AxiSignalSide;
      order_type: AxiSignalOrderType;
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
  received_at: string;
};

export class AxiSignalsDataSourceError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(code);
    this.name = "AxiSignalsDataSourceError";
    this.status = status;
    this.code = code;
  }
}

/**
 * Reads the user-session-protected AXI source feed. This client deliberately
 * knows no ingest token or feature-flag value; the server remains authoritative.
 */
export async function loadAxiSignals(
  limit = 50,
  fetchImpl: typeof fetch = fetch,
): Promise<AxiSignalRecord[]> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new AxiSignalsDataSourceError(400, "AXI_SIGNAL_LIST_LIMIT_INVALID");
  }
  const response = await fetchImpl(`/api/v1/trading/signals?limit=${limit}`, {
    method: "GET",
    credentials: "same-origin",
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw await parseError(response);
  const value: unknown = await response.json();
  if (!isSignalList(value)) throw new AxiSignalsDataSourceError(502, "AXI_SIGNAL_LIST_RESPONSE_INVALID");
  return value.signals;
}

export async function loadAxiSignalDetail(
  signalId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<AxiSignalRecord> {
  const response = await fetchImpl(`/api/v1/trading/signals/${encodeURIComponent(signalId)}`, {
    method: "GET",
    credentials: "same-origin",
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw await parseError(response);
  const value: unknown = await response.json();
  if (!isSignalDetail(value)) throw new AxiSignalsDataSourceError(502, "AXI_SIGNAL_DETAIL_RESPONSE_INVALID");
  return { signal: value.signal, received_at: value.received_at };
}

async function parseError(response: Response): Promise<AxiSignalsDataSourceError> {
  let value: unknown = null;
  try { value = await response.json(); } catch { /* fail closed without response details */ }
  const code = isRecord(value) && typeof value.error === "string"
    ? value.error
    : "AXI_SIGNALS_UNAVAILABLE";
  return new AxiSignalsDataSourceError(response.status, code);
}

function isSignalList(value: unknown): value is { schema_version: "axi_signal_list_v1"; signals: AxiSignalRecord[] } {
  return isRecord(value)
    && value.schema_version === "axi_signal_list_v1"
    && Array.isArray(value.signals)
    && value.signals.every(isSignalRecord);
}

function isSignalDetail(value: unknown): value is { schema_version: "axi_signal_detail_v1"; signal: AxiSignalRecord["signal"]; received_at: string } {
  return isRecord(value)
    && value.schema_version === "axi_signal_detail_v1"
    && isSignal(value.signal)
    && isUtcTimestamp(value.received_at);
}

function isSignalRecord(value: unknown): value is AxiSignalRecord {
  return isRecord(value) && isSignal(value.signal) && isUtcTimestamp(value.received_at);
}

function isSignal(value: unknown): value is AxiSignalRecord["signal"] {
  if (!isRecord(value)
    || value.schema_version !== "axi_crypto_signal_v1"
    || value.event_type !== "SIGNAL_CREATED"
    || !isText(value.signal_id)
    || !isRecord(value.source)
    || !isRecord(value.setup)
    || !isRecord(value.trade)) return false;
  const source = value.source;
  const setup = value.setup;
  const trade = value.trade;
  return source.provider === "AXI"
    && source.engine === "ALLinCrypto Engine"
    && isText(source.engine_version)
    && isText(source.strategy_version)
    && isText(source.terminal_id)
    && isText(setup.setup_id)
    && isText(setup.setup_name)
    && isText(setup.timeframe)
    && isText(setup.family)
    && isNullablePositiveInteger(setup.max_hold_seconds)
    && isText(trade.symbol)
    && (trade.side === "BUY" || trade.side === "SELL")
    && (trade.order_type === "MARKET" || trade.order_type === "LIMIT")
    && isUtcTimestamp(trade.source_signal_time)
    && trade.source_time_basis === "AXI_SERVER"
    && isPositiveNumber(trade.entry_price)
    && isPositiveNumber(trade.stop_loss)
    && isPositiveNumber(trade.take_profit)
    && isPositiveNumber(trade.rr)
    && isNullablePositiveNumber(trade.cancel_price)
    && isNullablePositiveInteger(trade.valid_for_seconds);
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isNullablePositiveNumber(value: unknown): value is number | null {
  return value === null || isPositiveNumber(value);
}

function isNullablePositiveInteger(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isSafeInteger(value) && value > 0);
}

function isUtcTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
