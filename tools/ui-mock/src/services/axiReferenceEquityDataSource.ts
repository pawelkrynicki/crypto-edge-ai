export type AxiReferenceEquityPoint = {
  signal_id: string;
  setup_id: string;
  symbol: string;
  side: "BUY" | "SELL";
  closed_at: string;
  close_reason: "TP" | "SL" | "TIME_EXIT" | "MANUAL" | "OTHER";
  result_r: number;
  equity_before_usd: number;
  pnl_usd: number;
  equity_after_usd: number;
  drawdown_pct: number;
};

export type AxiReferenceEquityCurve = {
  schema_version: "axi_reference_equity_curve_v1";
  basis: "ENGINE_LIFECYCLE";
  starting_equity_usd: number;
  risk_pct_per_trade: number;
  closed_trade_count: number;
  win_count: number;
  loss_count: number;
  flat_count: number;
  win_rate_pct: number | null;
  ending_equity_usd: number;
  net_pnl_usd: number;
  net_return_pct: number;
  max_drawdown_pct: number;
  total_r: number;
  points: AxiReferenceEquityPoint[];
};

export async function loadAxiReferenceEquityCurve(fetchImpl: typeof fetch = fetch): Promise<AxiReferenceEquityCurve> {
  const response = await fetchImpl("/api/v1/trading/signals/equity-curve", {
    method: "GET",
    credentials: "same-origin",
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error("AXI_REFERENCE_EQUITY_UNAVAILABLE");
  const value: unknown = await response.json();
  if (!isCurve(value)) throw new Error("AXI_REFERENCE_EQUITY_RESPONSE_INVALID");
  return value;
}

function isCurve(value: unknown): value is AxiReferenceEquityCurve {
  if (!isRecord(value)
    || value.schema_version !== "axi_reference_equity_curve_v1"
    || value.basis !== "ENGINE_LIFECYCLE"
    || !isFiniteNumber(value.starting_equity_usd)
    || !isFiniteNumber(value.risk_pct_per_trade)
    || !isSafeNonNegativeInteger(value.closed_trade_count)
    || !isSafeNonNegativeInteger(value.win_count)
    || !isSafeNonNegativeInteger(value.loss_count)
    || !isSafeNonNegativeInteger(value.flat_count)
    || !(value.win_rate_pct === null || isFiniteNumber(value.win_rate_pct))
    || !isFiniteNumber(value.ending_equity_usd)
    || !isFiniteNumber(value.net_pnl_usd)
    || !isFiniteNumber(value.net_return_pct)
    || !isFiniteNumber(value.max_drawdown_pct)
    || !isFiniteNumber(value.total_r)
    || !Array.isArray(value.points)) return false;

  return value.points.every((point) => isRecord(point)
    && typeof point.signal_id === "string"
    && typeof point.setup_id === "string"
    && typeof point.symbol === "string"
    && (point.side === "BUY" || point.side === "SELL")
    && typeof point.closed_at === "string"
    && Number.isFinite(Date.parse(point.closed_at))
    && ["TP", "SL", "TIME_EXIT", "MANUAL", "OTHER"].includes(String(point.close_reason))
    && isFiniteNumber(point.result_r)
    && isFiniteNumber(point.equity_before_usd)
    && isFiniteNumber(point.pnl_usd)
    && isFiniteNumber(point.equity_after_usd)
    && isFiniteNumber(point.drawdown_pct));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isSafeNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
