import type { AxiSignalRepository } from "./axiSignalRepository.js";

export const AXI_REFERENCE_EQUITY_SCHEMA_VERSION = "axi_reference_equity_curve_v1" as const;

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
  schema_version: typeof AXI_REFERENCE_EQUITY_SCHEMA_VERSION;
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

export function buildAxiReferenceEquityCurve(
  repository: AxiSignalRepository,
  options: {
    startingEquityUsd?: number;
    riskPctPerTrade?: number;
    maxSignals?: number;
  } = {},
): AxiReferenceEquityCurve {
  const startingEquityUsd = options.startingEquityUsd ?? 10_000;
  const riskPctPerTrade = options.riskPctPerTrade ?? 1;
  const maxSignals = options.maxSignals ?? 5_000;

  if (!Number.isFinite(startingEquityUsd) || startingEquityUsd <= 0) throw new Error("AXI_REFERENCE_EQUITY_START_INVALID");
  if (!Number.isFinite(riskPctPerTrade) || riskPctPerTrade <= 0 || riskPctPerTrade > 100) throw new Error("AXI_REFERENCE_EQUITY_RISK_INVALID");
  if (!Number.isSafeInteger(maxSignals) || maxSignals < 1 || maxSignals > 10_000) throw new Error("AXI_REFERENCE_EQUITY_LIMIT_INVALID");

  const closed = repository.listForLifecycle(maxSignals)
    .map((record) => ({ record, lifecycle: repository.getLifecycle(record.signal.signal_id).state }))
    .filter(({ lifecycle }) => lifecycle.status === "CLOSED"
      && lifecycle.closed_at !== null
      && lifecycle.close_reason !== null
      && lifecycle.result_r !== null)
    .sort((left, right) => {
      const byTime = left.lifecycle.closed_at!.localeCompare(right.lifecycle.closed_at!);
      return byTime !== 0 ? byTime : left.record.signal.signal_id.localeCompare(right.record.signal.signal_id);
    });

  let equity = startingEquityUsd;
  let peak = startingEquityUsd;
  let maxDrawdownPct = 0;
  let wins = 0;
  let losses = 0;
  let flats = 0;
  let totalR = 0;

  const points: AxiReferenceEquityPoint[] = closed.map(({ record, lifecycle }) => {
    const resultR = lifecycle.result_r!;
    const before = equity;
    const riskUsd = before * (riskPctPerTrade / 100);
    const pnlUsd = riskUsd * resultR;
    equity = before + pnlUsd;
    peak = Math.max(peak, equity);
    const drawdownPct = peak > 0 ? Math.max(0, (peak - equity) / peak * 100) : 0;
    maxDrawdownPct = Math.max(maxDrawdownPct, drawdownPct);
    totalR += resultR;
    if (resultR > 0) wins += 1;
    else if (resultR < 0) losses += 1;
    else flats += 1;

    return {
      signal_id: record.signal.signal_id,
      setup_id: record.signal.setup.setup_id,
      symbol: record.signal.trade.symbol,
      side: record.signal.trade.side,
      closed_at: lifecycle.closed_at!,
      close_reason: lifecycle.close_reason!,
      result_r: round(resultR, 6),
      equity_before_usd: round(before, 2),
      pnl_usd: round(pnlUsd, 2),
      equity_after_usd: round(equity, 2),
      drawdown_pct: round(drawdownPct, 4),
    };
  });

  const closedTradeCount = points.length;
  const winRatePct = closedTradeCount > 0 ? wins / closedTradeCount * 100 : null;

  return {
    schema_version: AXI_REFERENCE_EQUITY_SCHEMA_VERSION,
    basis: "ENGINE_LIFECYCLE",
    starting_equity_usd: round(startingEquityUsd, 2),
    risk_pct_per_trade: round(riskPctPerTrade, 4),
    closed_trade_count: closedTradeCount,
    win_count: wins,
    loss_count: losses,
    flat_count: flats,
    win_rate_pct: winRatePct === null ? null : round(winRatePct, 2),
    ending_equity_usd: round(equity, 2),
    net_pnl_usd: round(equity - startingEquityUsd, 2),
    net_return_pct: round((equity - startingEquityUsd) / startingEquityUsd * 100, 4),
    max_drawdown_pct: round(maxDrawdownPct, 4),
    total_r: round(totalR, 6),
    points,
  };
}

function round(value: number, digits: number): number {
  const scale = 10 ** digits;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}
