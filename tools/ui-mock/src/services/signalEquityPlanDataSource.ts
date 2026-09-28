export const SIGNAL_EQUITY_PLAN_SCHEMA_VERSION = "crypto_edge_signal_equity_plan_v1" as const;
export const EQUITY_PLAN_SCHEMA_VERSION = "crypto_edge_equity_plan_v1" as const;

export type EquityPlanReasonCode = string;

export type EquityPlan = {
  schema_version: typeof EQUITY_PLAN_SCHEMA_VERSION;
  status: "READY" | "REDUCED_BY_LIMIT" | "BLOCKED";
  reason_codes: EquityPlanReasonCode[];
  account_mode: "SIMULATED" | "KRAKEN_LIVE";
  equity_usd: number;
  risk_pct_per_trade: number;
  requested_risk_usd: number;
  effective_risk_cap_usd: number;
  stop_distance_pct: number;
  risk_based_notional_usd: number;
  planned_notional_usd: number;
  planned_risk_usd: number;
  effective_leverage: number;
  required_margin_usd: number;
  risk_utilization_pct: number | null;
  signal: { side: "BUY" | "SELL"; entry_price: number; stop_loss: number; take_profit: number };
};

export type SignalEquityPlanResponse = {
  schema_version: typeof SIGNAL_EQUITY_PLAN_SCHEMA_VERSION;
  signal_id: string;
  account_source: "CRYPTO_EDGE_SIMULATION" | "KRAKEN_FUTURES";
  account_observed_at: string;
  profile_updated_at: string;
  plan: EquityPlan;
};

export class SignalEquityPlanDataSourceError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(code);
    this.name = "SignalEquityPlanDataSourceError";
    this.status = status;
    this.code = code;
  }
}

export async function loadSignalEquityPlan(
  signalId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SignalEquityPlanResponse> {
  const response = await fetchImpl(`/api/v1/trading/signals/${encodeURIComponent(signalId)}/equity-plan`, {
    method: "GET",
    credentials: "same-origin",
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw await parseError(response);
  const value: unknown = await response.json();
  if (!isResponse(value)) throw new SignalEquityPlanDataSourceError(502, "SIGNAL_EQUITY_PLAN_RESPONSE_INVALID");
  return value;
}

async function parseError(response: Response): Promise<SignalEquityPlanDataSourceError> {
  let value: unknown = null;
  try { value = await response.json(); } catch { /* Keep response details safe. */ }
  return new SignalEquityPlanDataSourceError(
    response.status,
    isRecord(value) && typeof value.error === "string" ? value.error : "SIGNAL_EQUITY_PLAN_UNAVAILABLE",
  );
}

function isResponse(value: unknown): value is SignalEquityPlanResponse {
  return isRecord(value)
    && value.schema_version === SIGNAL_EQUITY_PLAN_SCHEMA_VERSION
    && typeof value.signal_id === "string"
    && (value.account_source === "CRYPTO_EDGE_SIMULATION" || value.account_source === "KRAKEN_FUTURES")
    && isTimestamp(value.account_observed_at)
    && isTimestamp(value.profile_updated_at)
    && isPlan(value.plan);
}

function isPlan(value: unknown): value is EquityPlan {
  if (!isRecord(value)
    || value.schema_version !== EQUITY_PLAN_SCHEMA_VERSION
    || (value.status !== "READY" && value.status !== "REDUCED_BY_LIMIT" && value.status !== "BLOCKED")
    || !Array.isArray(value.reason_codes) || !value.reason_codes.every((code) => typeof code === "string")
    || (value.account_mode !== "SIMULATED" && value.account_mode !== "KRAKEN_LIVE")
    || !isFiniteNumber(value.equity_usd)
    || !isFiniteNumber(value.risk_pct_per_trade)
    || !isFiniteNumber(value.requested_risk_usd)
    || !isFiniteNumber(value.effective_risk_cap_usd)
    || !isFiniteNumber(value.stop_distance_pct)
    || !isFiniteNumber(value.risk_based_notional_usd)
    || !isFiniteNumber(value.planned_notional_usd)
    || !isFiniteNumber(value.planned_risk_usd)
    || !isFiniteNumber(value.effective_leverage)
    || !isFiniteNumber(value.required_margin_usd)
    || (value.risk_utilization_pct !== null && !isFiniteNumber(value.risk_utilization_pct))
    || !isSignal(value.signal)) return false;
  return true;
}

function isSignal(value: unknown): value is EquityPlan["signal"] {
  return isRecord(value)
    && (value.side === "BUY" || value.side === "SELL")
    && isFiniteNumber(value.entry_price)
    && isFiniteNumber(value.stop_loss)
    && isFiniteNumber(value.take_profit);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
