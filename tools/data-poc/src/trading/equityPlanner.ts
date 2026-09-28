/**
 * Equity Planner — pure trading/risk sizing core.
 *
 * A source signal (e.g. axi_crypto_signal_v1) defines strategy geometry:
 * side, entry, stop loss, and take profit. It never defines how large a
 * position a given account should take — that depends on the account's
 * equity and risk profile, which differ per Crypto Edge user and are
 * unknown to the signal source.
 *
 * This planner converts { account equity + risk profile, signal geometry }
 * into a target USD position notional and a deterministic safety result.
 * It intentionally stops at USD notional: converting that notional into a
 * Kraken order quantity requires the instrument's contract size, tick size,
 * and minimum order size, which are exchange/instrument facts unrelated to
 * risk planning. That conversion belongs to a later Kraken instrument
 * adapter so this module stays reusable for SIMULATED accounts (including
 * an owner test profile with a supplied USD 10,000 equity) and for
 * KRAKEN_LIVE accounts once live equity is wired in, without ever guessing
 * Kraken contract sizes here.
 */

export const CRYPTO_EDGE_EQUITY_PLAN_SCHEMA_VERSION = "crypto_edge_equity_plan_v1" as const;

export type EquityPlanAccountMode = "SIMULATED" | "KRAKEN_LIVE";

export type EquityPlanSignal = {
  side: "BUY" | "SELL";
  entry_price: number;
  stop_loss: number;
  take_profit: number;
};

export type EquityPlanAccount = {
  account_mode: EquityPlanAccountMode;
  equity_usd: number;
  available_margin_usd: number | null;
  risk_pct_per_trade: number;
  max_leverage: number;
  max_position_notional_usd?: number | null;
  max_risk_usd?: number | null;
  /**
   * Reserved for future-safe cap logic (e.g. capping planned notional
   * against exposure already open on the account). Validated when
   * provided but not yet applied to any v1 calculation.
   */
  existing_exposure_notional_usd?: number | null;
};

export type EquityPlanInput = {
  account: EquityPlanAccount;
  signal: EquityPlanSignal;
};

export type EquityPlanStatus = "READY" | "REDUCED_BY_LIMIT" | "BLOCKED";

export type EquityPlanReasonCode =
  | "INVALID_EQUITY_USD"
  | "INVALID_AVAILABLE_MARGIN_USD"
  | "INVALID_RISK_PCT_PER_TRADE"
  | "INVALID_MAX_LEVERAGE"
  | "INVALID_MAX_POSITION_NOTIONAL_USD"
  | "INVALID_MAX_RISK_USD"
  | "INVALID_EXISTING_EXPOSURE_NOTIONAL_USD"
  | "INVALID_ENTRY_PRICE"
  | "INVALID_STOP_LOSS"
  | "INVALID_TAKE_PROFIT"
  | "INVALID_PRICE_GEOMETRY"
  | "ZERO_STOP_DISTANCE"
  | "ZERO_PLANNED_NOTIONAL"
  | "AVAILABLE_MARGIN_CAP"
  | "MAX_LEVERAGE_CAP"
  | "MAX_POSITION_NOTIONAL_CAP"
  | "MAX_RISK_CAP";

export type EquityPlan = {
  schema_version: typeof CRYPTO_EDGE_EQUITY_PLAN_SCHEMA_VERSION;
  status: EquityPlanStatus;
  reason_codes: EquityPlanReasonCode[];
  account_mode: EquityPlanAccountMode;
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
  signal: EquityPlanSignal;
};

/**
 * Deterministic, pure: no I/O, no clock reads, no Kraken API calls, no
 * exchange-instrument assumptions. Never returns NaN/Infinity — invalid or
 * degenerate inputs resolve to a BLOCKED plan with finite zeroed fields.
 */
export function planEquity(input: EquityPlanInput): EquityPlan {
  const { account, signal } = input;

  if (!isFiniteNumber(account.equity_usd) || account.equity_usd <= 0) {
    return blockedPlan(input, ["INVALID_EQUITY_USD"]);
  }
  if (
    account.available_margin_usd !== null
    && (!isFiniteNumber(account.available_margin_usd) || account.available_margin_usd < 0)
  ) {
    return blockedPlan(input, ["INVALID_AVAILABLE_MARGIN_USD"]);
  }
  if (!isFiniteNumber(account.risk_pct_per_trade) || account.risk_pct_per_trade <= 0) {
    return blockedPlan(input, ["INVALID_RISK_PCT_PER_TRADE"]);
  }
  if (!isFiniteNumber(account.max_leverage) || account.max_leverage < 1) {
    return blockedPlan(input, ["INVALID_MAX_LEVERAGE"]);
  }
  const maxPositionNotionalUsd = account.max_position_notional_usd ?? null;
  if (maxPositionNotionalUsd !== null && (!isFiniteNumber(maxPositionNotionalUsd) || maxPositionNotionalUsd <= 0)) {
    return blockedPlan(input, ["INVALID_MAX_POSITION_NOTIONAL_USD"]);
  }
  const maxRiskUsd = account.max_risk_usd ?? null;
  if (maxRiskUsd !== null && (!isFiniteNumber(maxRiskUsd) || maxRiskUsd <= 0)) {
    return blockedPlan(input, ["INVALID_MAX_RISK_USD"]);
  }
  const existingExposureNotionalUsd = account.existing_exposure_notional_usd ?? null;
  if (
    existingExposureNotionalUsd !== null
    && (!isFiniteNumber(existingExposureNotionalUsd) || existingExposureNotionalUsd < 0)
  ) {
    return blockedPlan(input, ["INVALID_EXISTING_EXPOSURE_NOTIONAL_USD"]);
  }
  if (!isFiniteNumber(signal.entry_price) || signal.entry_price <= 0) {
    return blockedPlan(input, ["INVALID_ENTRY_PRICE"]);
  }
  if (!isFiniteNumber(signal.stop_loss) || signal.stop_loss <= 0) {
    return blockedPlan(input, ["INVALID_STOP_LOSS"]);
  }
  if (!isFiniteNumber(signal.take_profit) || signal.take_profit <= 0) {
    return blockedPlan(input, ["INVALID_TAKE_PROFIT"]);
  }

  if (signal.entry_price === signal.stop_loss) {
    return blockedPlan(input, ["ZERO_STOP_DISTANCE"]);
  }
  const geometryValid = signal.side === "BUY"
    ? signal.stop_loss < signal.entry_price && signal.entry_price < signal.take_profit
    : signal.take_profit < signal.entry_price && signal.entry_price < signal.stop_loss;
  if (!geometryValid) {
    return blockedPlan(input, ["INVALID_PRICE_GEOMETRY"]);
  }

  const stopDistancePct = Math.abs(signal.entry_price - signal.stop_loss) / signal.entry_price;
  if (!isFiniteNumber(stopDistancePct) || stopDistancePct <= 0) {
    return blockedPlan(input, ["ZERO_STOP_DISTANCE"]);
  }

  const equityUsd = account.equity_usd;
  const requestedRiskUsd = equityUsd * account.risk_pct_per_trade / 100;
  const effectiveRiskCapUsd = maxRiskUsd !== null ? Math.min(requestedRiskUsd, maxRiskUsd) : requestedRiskUsd;
  const riskBasedNotionalUsd = effectiveRiskCapUsd / stopDistancePct;

  const leverageCapNotionalUsd = equityUsd * account.max_leverage;
  const marginCapNotionalUsd = account.available_margin_usd !== null
    ? account.available_margin_usd * account.max_leverage
    : null;

  const notionalCandidates = [riskBasedNotionalUsd, leverageCapNotionalUsd];
  if (marginCapNotionalUsd !== null) notionalCandidates.push(marginCapNotionalUsd);
  if (maxPositionNotionalUsd !== null) notionalCandidates.push(maxPositionNotionalUsd);

  const plannedNotionalUsd = Math.min(...notionalCandidates);

  const reasonCodes: EquityPlanReasonCode[] = [];
  if (maxRiskUsd !== null && maxRiskUsd < requestedRiskUsd) {
    reasonCodes.push("MAX_RISK_CAP");
  }
  const notionalCaps: Array<{ code: EquityPlanReasonCode; value: number }> = [
    { code: "MAX_LEVERAGE_CAP", value: leverageCapNotionalUsd },
  ];
  if (marginCapNotionalUsd !== null) notionalCaps.push({ code: "AVAILABLE_MARGIN_CAP", value: marginCapNotionalUsd });
  if (maxPositionNotionalUsd !== null) notionalCaps.push({ code: "MAX_POSITION_NOTIONAL_CAP", value: maxPositionNotionalUsd });
  for (const cap of notionalCaps) {
    if (cap.value === plannedNotionalUsd && cap.value < riskBasedNotionalUsd) {
      reasonCodes.push(cap.code);
    }
  }

  if (!isFiniteNumber(plannedNotionalUsd) || plannedNotionalUsd <= 0) {
    reasonCodes.push("ZERO_PLANNED_NOTIONAL");
    return {
      schema_version: CRYPTO_EDGE_EQUITY_PLAN_SCHEMA_VERSION,
      status: "BLOCKED",
      reason_codes: reasonCodes,
      account_mode: account.account_mode,
      equity_usd: equityUsd,
      risk_pct_per_trade: account.risk_pct_per_trade,
      requested_risk_usd: requestedRiskUsd,
      effective_risk_cap_usd: effectiveRiskCapUsd,
      stop_distance_pct: stopDistancePct,
      risk_based_notional_usd: riskBasedNotionalUsd,
      planned_notional_usd: 0,
      planned_risk_usd: 0,
      effective_leverage: 0,
      required_margin_usd: 0,
      risk_utilization_pct: requestedRiskUsd > 0 ? 0 : null,
      signal: echoSignal(signal),
    };
  }

  const plannedRiskUsd = plannedNotionalUsd * stopDistancePct;
  const effectiveLeverage = plannedNotionalUsd / equityUsd;
  const requiredMarginUsd = plannedNotionalUsd / account.max_leverage;
  const riskUtilizationPct = requestedRiskUsd > 0 ? (plannedRiskUsd / requestedRiskUsd) * 100 : null;

  return {
    schema_version: CRYPTO_EDGE_EQUITY_PLAN_SCHEMA_VERSION,
    status: reasonCodes.length > 0 ? "REDUCED_BY_LIMIT" : "READY",
    reason_codes: reasonCodes,
    account_mode: account.account_mode,
    equity_usd: equityUsd,
    risk_pct_per_trade: account.risk_pct_per_trade,
    requested_risk_usd: requestedRiskUsd,
    effective_risk_cap_usd: effectiveRiskCapUsd,
    stop_distance_pct: stopDistancePct,
    risk_based_notional_usd: riskBasedNotionalUsd,
    planned_notional_usd: plannedNotionalUsd,
    planned_risk_usd: plannedRiskUsd,
    effective_leverage: effectiveLeverage,
    required_margin_usd: requiredMarginUsd,
    risk_utilization_pct: riskUtilizationPct,
    signal: echoSignal(signal),
  };
}

function blockedPlan(input: EquityPlanInput, reasonCodes: EquityPlanReasonCode[]): EquityPlan {
  const { account, signal } = input;
  return {
    schema_version: CRYPTO_EDGE_EQUITY_PLAN_SCHEMA_VERSION,
    status: "BLOCKED",
    reason_codes: reasonCodes,
    account_mode: account.account_mode,
    equity_usd: toFiniteOrZero(account.equity_usd),
    risk_pct_per_trade: toFiniteOrZero(account.risk_pct_per_trade),
    requested_risk_usd: 0,
    effective_risk_cap_usd: 0,
    stop_distance_pct: 0,
    risk_based_notional_usd: 0,
    planned_notional_usd: 0,
    planned_risk_usd: 0,
    effective_leverage: 0,
    required_margin_usd: 0,
    risk_utilization_pct: null,
    signal: echoSignal(signal),
  };
}

function echoSignal(signal: EquityPlanSignal): EquityPlanSignal {
  return {
    side: signal.side,
    entry_price: toFiniteOrZero(signal.entry_price),
    stop_loss: toFiniteOrZero(signal.stop_loss),
    take_profit: toFiniteOrZero(signal.take_profit),
  };
}

function isFiniteNumber(value: number): boolean {
  return typeof value === "number" && Number.isFinite(value);
}

function toFiniteOrZero(value: number): number {
  return isFiniteNumber(value) ? value : 0;
}
