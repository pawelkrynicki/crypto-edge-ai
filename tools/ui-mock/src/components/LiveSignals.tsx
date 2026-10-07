import React, { useCallback, useEffect, useMemo, useState } from "react";

void React; // Required by the Node TSX test runtime's classic JSX transform.
import { useProductLocale, type ProductLocale } from "../productI18n";
import {
  AxiSignalsDataSourceError,
  loadAxiSignalDetail,
  loadAxiSignals,
  type AxiSignalDetailRecord,
  type AxiSignalLifecycleState,
  type AxiSignalRecord,
} from "../services/axiSignalsDataSource";
import {
  loadSignalEquityPlan,
  type SignalEquityPlanResponse,
} from "../services/signalEquityPlanDataSource";
import {
  loadAxiReferenceEquityCurve,
  type AxiReferenceEquityCurve,
} from "../services/axiReferenceEquityDataSource";
import { ActionButton, LoadingState, ReadOnlyCard, StatusBadge } from "./ProductUi";

type FeedState =
  | { kind: "loading" }
  | { kind: "ready"; signals: AxiSignalRecord[] }
  | { kind: "unavailable" }
  | { kind: "forbidden" }
  | { kind: "error" };

type DetailState =
  | { kind: "idle" }
  | { kind: "loading"; signalId: string }
  | { kind: "ready"; record: AxiSignalDetailRecord }
  | { kind: "not-found"; signalId: string }
  | { kind: "forbidden" }
  | { kind: "error" };

type EquityPlanState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; response: SignalEquityPlanResponse }
  | { kind: "error" };

type ReferenceEquityState =
  | { kind: "loading" }
  | { kind: "ready"; curve: AxiReferenceEquityCurve }
  | { kind: "error" };

type LiveSignalsProps = {
  loadSignals?: typeof loadAxiSignals;
  loadSignalDetail?: typeof loadAxiSignalDetail;
  loadEquityPlan?: typeof loadSignalEquityPlan;
  loadReferenceEquity?: typeof loadAxiReferenceEquityCurve;
};

/** Read-only presentation for records accepted by the AXI signal gateway. */
export function LiveSignals({
  loadSignals = loadAxiSignals,
  loadSignalDetail = loadAxiSignalDetail,
  loadEquityPlan = loadSignalEquityPlan,
  loadReferenceEquity = loadAxiReferenceEquityCurve,
}: LiveSignalsProps) {
  const { locale } = useProductLocale();
  const copy = LIVE_SIGNALS_COPY[locale];
  const [state, setState] = useState<FeedState>({ kind: "loading" });
  const [detail, setDetail] = useState<DetailState>({ kind: "idle" });
  const [equityPlan, setEquityPlan] = useState<EquityPlanState>({ kind: "idle" });
  const [referenceEquity, setReferenceEquity] = useState<ReferenceEquityState>({ kind: "loading" });

  const reload = useCallback(async () => {
    setState({ kind: "loading" });
    setDetail({ kind: "idle" });
    setEquityPlan({ kind: "idle" });
    try {
      const signals = sortNewestFirst(await loadSignals(50));
      setState({ kind: "ready", signals });
    } catch (error) {
      setState(classifyFeedError(error));
    }
  }, [loadSignals]);

  useEffect(() => {
    let cancelled = false;
    void loadSignals(50)
      .then((signals) => {
        if (!cancelled) setState({ kind: "ready", signals: sortNewestFirst(signals) });
      })
      .catch((error) => {
        if (!cancelled) setState(classifyFeedError(error));
      });
    return () => {
      cancelled = true;
    };
  }, [loadSignals]);

  useEffect(() => {
    let cancelled = false;
    setReferenceEquity({ kind: "loading" });
    void loadReferenceEquity()
      .then((curve) => {
        if (!cancelled) setReferenceEquity({ kind: "ready", curve });
      })
      .catch(() => {
        if (!cancelled) setReferenceEquity({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [loadReferenceEquity]);

  const selectSignal = useCallback(async (signalId: string) => {
    setDetail({ kind: "loading", signalId });
    setEquityPlan({ kind: "loading" });
    const [detailResult, planResult] = await Promise.allSettled([
      loadSignalDetail(signalId),
      loadEquityPlan(signalId),
    ]);
    if (detailResult.status === "fulfilled") {
      setDetail({ kind: "ready", record: detailResult.value });
    } else {
      setDetail(classifyDetailError(detailResult.reason, signalId));
    }
    if (planResult.status === "fulfilled") {
      setEquityPlan({ kind: "ready", response: planResult.value });
    } else {
      setEquityPlan({ kind: "error" });
    }
  }, [loadEquityPlan, loadSignalDetail]);

  const counts = useMemo(() => state.kind === "ready" ? summarizeSignals(state.signals) : null, [state]);

  return (
    <div className="live-signals" data-live-signals-state={state.kind}>
      <section className="live-signals-hero" aria-labelledby="live-signals-heading">
        <div>
          <span className="section-label">{copy.eyebrow}</span>
          <h3 id="live-signals-heading">{copy.title}</h3>
          <p>{copy.intro}</p>
        </div>
        <StatusBadge tone="warning" className="live-signals-source-only">{copy.sourceOnly}</StatusBadge>
      </section>

      <ReferenceEquityPanel state={referenceEquity} locale={locale} copy={copy} />

      {state.kind === "loading" && <LoadingState label={copy.loading} />}

      {state.kind === "unavailable" && (
        <FeedStateCard
          title={copy.unavailableTitle}
          detail={copy.unavailableDetail}
          actionLabel={copy.retry}
          onAction={() => void reload()}
          tone="warning"
        />
      )}

      {state.kind === "forbidden" && (
        <FeedStateCard
          title={copy.forbiddenTitle}
          detail={copy.forbiddenDetail}
          actionLabel={copy.retry}
          onAction={() => void reload()}
          tone="critical"
        />
      )}

      {state.kind === "error" && (
        <FeedStateCard
          title={copy.errorTitle}
          detail={copy.errorDetail}
          actionLabel={copy.retry}
          onAction={() => void reload()}
          tone="critical"
        />
      )}

      {state.kind === "ready" && state.signals.length === 0 && (
        <FeedStateCard title={copy.emptyTitle} detail={copy.emptyDetail} tone="neutral" />
      )}

      {state.kind === "ready" && state.signals.length > 0 && counts && (
        <>
          <dl className="live-signals-summary" aria-label={copy.summaryLabel}>
            <SummaryMetric label={copy.totalLoaded} value={String(counts.total)} />
            <SummaryMetric label="BUY" value={String(counts.buy)} />
            <SummaryMetric label="SELL" value={String(counts.sell)} />
            <SummaryMetric label="MARKET" value={String(counts.market)} />
            <SummaryMetric label="LIMIT" value={String(counts.limit)} />
          </dl>

          <div className="live-signals-layout">
            <div className="live-signals-list" aria-label={copy.feedLabel}>
              {state.signals.map((record) => (
                <SignalCard
                  key={record.signal.signal_id}
                  record={record}
                  locale={locale}
                  copy={copy}
                  selected={detail.kind === "ready" && detail.record.signal.signal_id === record.signal.signal_id}
                  onSelect={selectSignal}
                />
              ))}
            </div>
            <SignalDetailPanel detail={detail} equityPlan={equityPlan} locale={locale} copy={copy} />
          </div>
        </>
      )}
    </div>
  );
}

function ReferenceEquityPanel({
  state,
  locale,
  copy,
}: {
  state: ReferenceEquityState;
  locale: ProductLocale;
  copy: LiveSignalsCopy;
}) {
  if (state.kind === "loading") {
    return <ReadOnlyCard className="live-signals-equity"><p>{copy.referenceEquityLoading}</p></ReadOnlyCard>;
  }
  if (state.kind === "error") {
    return <ReadOnlyCard className="live-signals-equity"><strong>{copy.referenceEquityUnavailable}</strong></ReadOnlyCard>;
  }

  const curve = state.curve;
  const values = [curve.starting_equity_usd, ...curve.points.map((point) => point.equity_after_usd)];
  const width = 720;
  const height = 180;
  const pad = 18;
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const span = Math.max(1, maxValue - minValue);
  const xStep = values.length > 1 ? (width - 2 * pad) / (values.length - 1) : 0;
  const chartPoints = values.map((value, index) => {
    const x = pad + index * xStep;
    const y = pad + (maxValue - value) / span * (height - 2 * pad);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

  return (
    <ReadOnlyCard className="live-signals-equity" aria-label={copy.referenceEquityTitle}>
      <header className="live-signals-equity-header">
        <div>
          <span className="section-label">{copy.referenceEquityEyebrow}</span>
          <h4>{copy.referenceEquityTitle}</h4>
          <p>{copy.referenceEquityBasis}</p>
        </div>
        <StatusBadge tone="accent">{formatSignalNumber(curve.risk_pct_per_trade, locale)}% {copy.riskPerTrade}</StatusBadge>
      </header>

      <dl className="live-signals-equity-metrics">
        <SummaryMetric label={copy.startingEquity} value={formatUsd(curve.starting_equity_usd, locale)} />
        <SummaryMetric label={copy.endingEquity} value={formatUsd(curve.ending_equity_usd, locale)} />
        <SummaryMetric label={copy.netResult} value={formatSignedUsd(curve.net_pnl_usd, locale)} />
        <SummaryMetric label={copy.totalR} value={formatR(curve.total_r, locale)} />
        <SummaryMetric label={copy.winRate} value={curve.win_rate_pct === null ? "—" : `${formatSignalNumber(curve.win_rate_pct, locale)}%`} />
        <SummaryMetric label={copy.maxDrawdown} value={`${formatSignalNumber(curve.max_drawdown_pct, locale)}%`} />
      </dl>

      {curve.closed_trade_count === 0 ? (
        <p className="live-signals-equity-empty">{copy.noClosedTrades}</p>
      ) : (
        <div className="live-signals-equity-chart">
          <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={copy.referenceEquityChartLabel}>
            <polyline className="live-signals-equity-line" points={chartPoints} fill="none" />
          </svg>
          <footer>
            <span>{copy.closedTrades}: {curve.closed_trade_count}</span>
            <span>{copy.referenceEquityLast}: {formatSignalTimestamp(curve.points[curve.points.length - 1]!.closed_at, locale)}</span>
          </footer>
        </div>
      )}
    </ReadOnlyCard>
  );
}

function SignalCard({
  record,
  locale,
  copy,
  selected,
  onSelect,
}: {
  record: AxiSignalRecord;
  locale: ProductLocale;
  copy: LiveSignalsCopy;
  selected: boolean;
  onSelect: (signalId: string) => void;
}) {
  const { signal, lifecycle } = record;
  const lifecycleBadge = lifecyclePresentation(lifecycle, locale);
  return (
    <ReadOnlyCard className={`live-signal-card ${selected ? "selected" : ""}`}>
      <header className="live-signal-card-header">
        <div>
          <h4>{signal.trade.symbol}</h4>
          <p>{signal.setup.timeframe}</p>
        </div>
        <div className="live-signal-badges">
          <StatusBadge tone={lifecycleBadge.tone}>{lifecycleBadge.label}</StatusBadge>
          <StatusBadge tone={signal.trade.side === "BUY" ? "ready" : "critical"}>{signal.trade.side}</StatusBadge>
          <StatusBadge tone="accent">{signal.trade.order_type}</StatusBadge>
        </div>
      </header>

      <dl className="live-signal-facts">
        <Fact label={copy.sourceSignalTime} value={formatSignalTimestamp(signal.trade.source_signal_time, locale)} />
        <Fact label={copy.entry} value={formatSignalNumber(signal.trade.entry_price, locale)} />
        <Fact label={copy.stopLoss} value={formatSignalNumber(signal.trade.stop_loss, locale)} />
        <Fact label={copy.takeProfit} value={formatSignalNumber(signal.trade.take_profit, locale)} />
        <Fact label="RR" value={`1:${formatSignalNumber(signal.trade.rr, locale)}`} />
        {lifecycle.filled_at !== null && lifecycle.entry_price !== null && (
          <Fact label={copy.actualFill} value={formatSignalNumber(lifecycle.entry_price, locale)} />
        )}
        {lifecycle.status === "CLOSED" && lifecycle.result_r !== null && (
          <Fact label={copy.resultR} value={formatR(lifecycle.result_r, locale)} />
        )}
        {signal.setup.max_hold_seconds !== null && <Fact label={copy.maxHold} value={formatDuration(signal.setup.max_hold_seconds, locale)} />}
        {signal.trade.order_type === "LIMIT" && signal.trade.cancel_price !== null && <Fact label={copy.cancelPrice} value={formatSignalNumber(signal.trade.cancel_price, locale)} />}
        {signal.trade.order_type === "LIMIT" && signal.trade.valid_for_seconds !== null && <Fact label={copy.validFor} value={formatDuration(signal.trade.valid_for_seconds, locale)} />}
      </dl>

      <footer className="live-signal-card-footer">
        <p>{signal.source.engine} {signal.source.engine_version}</p>
        <p>{copy.receivedAt}: {formatSignalTimestamp(record.received_at, locale)}</p>
        <ActionButton variant="tertiary" onClick={() => onSelect(signal.signal_id)}>{copy.openDetail}</ActionButton>
      </footer>
    </ReadOnlyCard>
  );
}

function SignalDetailPanel({
  detail,
  equityPlan,
  locale,
  copy,
}: {
  detail: DetailState;
  equityPlan: EquityPlanState;
  locale: ProductLocale;
  copy: LiveSignalsCopy;
}) {
  if (detail.kind === "idle") {
    return <aside className="live-signal-detail live-signal-detail-placeholder" data-live-signals-detail-state="idle"><p>{copy.detailPlaceholder}</p></aside>;
  }
  if (detail.kind === "loading") {
    return <aside className="live-signal-detail" data-live-signals-detail-state="loading"><LoadingState label={copy.detailLoading} /></aside>;
  }
  if (detail.kind === "not-found") {
    return <aside className="live-signal-detail live-signal-detail-state" data-live-signals-detail-state="not-found"><strong>{copy.notFoundTitle}</strong><p>{copy.notFoundDetail}</p></aside>;
  }
  if (detail.kind === "forbidden") {
    return <aside className="live-signal-detail live-signal-detail-state" data-live-signals-detail-state="forbidden"><strong>{copy.forbiddenTitle}</strong><p>{copy.forbiddenDetail}</p></aside>;
  }
  if (detail.kind === "error") {
    return <aside className="live-signal-detail live-signal-detail-state" data-live-signals-detail-state="error"><strong>{copy.detailErrorTitle}</strong><p>{copy.detailErrorDetail}</p></aside>;
  }
  const { signal, lifecycle } = detail.record;
  const lifecycleBadge = lifecyclePresentation(lifecycle, locale);
  return (
    <aside className="live-signal-detail" data-live-signals-detail-state="ready" aria-label={copy.detailLabel}>
      <span className="section-label">{copy.detailLabel}</span>
      <h4>{signal.trade.symbol} <span aria-hidden="true">·</span> {signal.trade.side}</h4>
      <StatusBadge tone={lifecycleBadge.tone}>{lifecycleBadge.label}</StatusBadge>
      <dl className="live-signal-detail-facts">
        <Fact label={copy.sourceEngine} value={`${signal.source.engine} ${signal.source.engine_version}`} />
        <Fact label={copy.receivedAt} value={formatSignalTimestamp(detail.record.received_at, locale)} />
        {lifecycle.filled_at !== null && <Fact label={copy.filledAt} value={formatSignalTimestamp(lifecycle.filled_at, locale)} />}
        {lifecycle.entry_price !== null && lifecycle.filled_at !== null && <Fact label={copy.actualFill} value={formatSignalNumber(lifecycle.entry_price, locale)} />}
        {lifecycle.closed_at !== null && <Fact label={copy.closedAt} value={formatSignalTimestamp(lifecycle.closed_at, locale)} />}
        {lifecycle.close_price !== null && <Fact label={copy.closePrice} value={formatSignalNumber(lifecycle.close_price, locale)} />}
        {lifecycle.close_reason !== null && <Fact label={copy.closeReason} value={lifecycleCloseReasonLabel(lifecycle.close_reason, locale)} />}
        {lifecycle.result_r !== null && <Fact label={copy.resultR} value={formatR(lifecycle.result_r, locale)} />}
      </dl>
      <p className="live-signal-detail-boundary">{copy.detailBoundary}</p>
      <EquityPlanPanel state={equityPlan} locale={locale} copy={copy} />
    </aside>
  );
}

function EquityPlanPanel({ state, locale, copy }: { state: EquityPlanState; locale: ProductLocale; copy: LiveSignalsCopy }) {
  if (state.kind === "idle") return null;
  if (state.kind === "loading") return <section className="signal-equity-plan" data-signal-equity-plan-state="loading"><p>{copy.planLoading}</p></section>;
  if (state.kind === "error") return <section className="signal-equity-plan" data-signal-equity-plan-state="error"><strong>{copy.planUnavailable}</strong><p>{copy.planUnavailableDetail}</p></section>;
  const { plan, account_source: accountSource } = state.response;
  const statusTone = plan.status === "READY" ? "ready" : plan.status === "REDUCED_BY_LIMIT" ? "warning" : "critical";
  const missing = copy.unavailableValue;
  return (
    <section className="signal-equity-plan" data-signal-equity-plan-state="ready" aria-label={copy.yourPositionPlan}>
      <span className="section-label">{copy.yourPositionPlan}</span>
      <StatusBadge tone={statusTone}>{plan.status}</StatusBadge>
      <dl className="live-signal-detail-facts">
        <Fact label={copy.planAccountMode} value={accountSource === "CRYPTO_EDGE_SIMULATION" ? copy.planSimulation : "Kraken Futures"} />
        <Fact label={copy.planEquity} value={formatUsd(plan.equity_usd, locale)} />
        <Fact label={copy.planRiskPct} value={formatPercent(plan.risk_pct_per_trade, locale)} />
        <Fact label={copy.planRequestedRisk} value={formatUsd(plan.requested_risk_usd, locale)} />
        <Fact label={copy.planStopDistance} value={formatPercent(plan.stop_distance_pct * 100, locale)} />
        <Fact label={copy.planNotional} value={formatUsd(plan.planned_notional_usd, locale)} />
        <Fact label={copy.planRisk} value={formatUsd(plan.planned_risk_usd, locale)} />
        <Fact label={copy.planLeverage} value={`${formatSignalNumber(plan.effective_leverage, locale)}×`} />
        <Fact label={copy.planMargin} value={formatUsd(plan.required_margin_usd, locale)} />
        <Fact label={copy.planRiskUtilization} value={plan.risk_utilization_pct === null ? missing : formatPercent(plan.risk_utilization_pct, locale)} />
        <Fact label={copy.planReasonCodes} value={plan.reason_codes.length ? plan.reason_codes.map((code) => humanizePlanReason(code, locale)).join(", ") : copy.planNoReduction} />
      </dl>
      <p className="live-signal-detail-boundary">{copy.planBoundary}</p>
    </section>
  );
}

function FeedStateCard({
  title,
  detail,
  actionLabel,
  onAction,
  tone,
}: {
  title: string;
  detail: string;
  actionLabel?: string;
  onAction?: () => void;
  tone: "neutral" | "warning" | "critical";
}) {
  return (
    <ReadOnlyCard className="live-signals-state-card">
      <StatusBadge tone={tone}>{title}</StatusBadge>
      <p>{detail}</p>
      {actionLabel && onAction && <ActionButton variant="secondary" onClick={onAction}>{actionLabel}</ActionButton>}
    </ReadOnlyCard>
  );
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

function sortNewestFirst(signals: AxiSignalRecord[]): AxiSignalRecord[] {
  return [...signals].sort((left, right) => {
    const difference = Date.parse(right.received_at) - Date.parse(left.received_at);
    return difference || left.signal.signal_id.localeCompare(right.signal.signal_id);
  });
}

function summarizeSignals(signals: AxiSignalRecord[]) {
  return signals.reduce((counts, { signal }) => ({
    total: counts.total + 1,
    buy: counts.buy + Number(signal.trade.side === "BUY"),
    sell: counts.sell + Number(signal.trade.side === "SELL"),
    market: counts.market + Number(signal.trade.order_type === "MARKET"),
    limit: counts.limit + Number(signal.trade.order_type === "LIMIT"),
  }), { total: 0, buy: 0, sell: 0, market: 0, limit: 0 });
}

function classifyFeedError(error: unknown): FeedState {
  if (error instanceof AxiSignalsDataSourceError && error.status === 404) return { kind: "unavailable" };
  if (error instanceof AxiSignalsDataSourceError && error.status === 403) return { kind: "forbidden" };
  return { kind: "error" };
}

function classifyDetailError(error: unknown, signalId: string): DetailState {
  if (error instanceof AxiSignalsDataSourceError && error.status === 404) return { kind: "not-found", signalId };
  if (error instanceof AxiSignalsDataSourceError && error.status === 403) return { kind: "forbidden" };
  return { kind: "error" };
}

function lifecyclePresentation(
  lifecycle: AxiSignalLifecycleState,
  locale: ProductLocale,
): { label: string; tone: "neutral" | "accent" | "ready" | "warning" | "critical" } {
  if (lifecycle.status === "PENDING") return { label: locale === "pl" ? "OCZEKUJE" : "PENDING", tone: "warning" };
  if (lifecycle.status === "EXPIRED") return { label: locale === "pl" ? "WYGASŁ" : "EXPIRED", tone: "neutral" };
  if (lifecycle.status === "CANCELLED") return { label: locale === "pl" ? "ANULOWANY" : "CANCELLED", tone: "neutral" };
  if (lifecycle.status === "ACTIVE") {
    if (lifecycle.filled_at === null) return { label: locale === "pl" ? "OCZEKUJE NA FILL" : "AWAITING FILL", tone: "warning" };
    return { label: locale === "pl" ? "AKTYWNY" : "ACTIVE", tone: "accent" };
  }
  if (lifecycle.close_reason === "TP") return { label: "TP", tone: "ready" };
  if (lifecycle.close_reason === "SL") return { label: "SL", tone: "critical" };
  if (lifecycle.close_reason === "TIME_EXIT") return { label: locale === "pl" ? "CZAS" : "TIME EXIT", tone: "warning" };
  if (lifecycle.close_reason === "MANUAL") return { label: locale === "pl" ? "RĘCZNIE" : "MANUAL", tone: "neutral" };
  return { label: locale === "pl" ? "ZAMKNIĘTY" : "CLOSED", tone: "neutral" };
}

function lifecycleCloseReasonLabel(
  reason: NonNullable<AxiSignalLifecycleState["close_reason"]>,
  locale: ProductLocale,
): string {
  if (reason === "TP" || reason === "SL") return reason;
  if (reason === "TIME_EXIT") return locale === "pl" ? "Wyjście po czasie" : "Time exit";
  if (reason === "MANUAL") return locale === "pl" ? "Ręcznie" : "Manual";
  return locale === "pl" ? "Inne" : "Other";
}

function formatR(value: number, locale: ProductLocale): string {
  const prefix = value > 0 ? "+" : "";
  return prefix + formatSignalNumber(value, locale) + "R";
}

function formatSignedUsd(value: number, locale: ProductLocale): string {
  const prefix = value > 0 ? "+" : "";
  return prefix + formatUsd(value, locale);
}

function formatSignalNumber(value: number, locale: ProductLocale): string {
  return new Intl.NumberFormat(locale === "pl" ? "pl-PL" : "en-US", {
    maximumFractionDigits: 8,
  }).format(value);
}

function formatSignalTimestamp(value: string, locale: ProductLocale): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(locale === "pl" ? "pl-PL" : "en-US", {
    dateStyle: "short",
    timeStyle: "medium",
  });
}

function formatDuration(seconds: number, locale: ProductLocale): string {
  if (seconds % 86_400 === 0) return locale === "pl" ? `${seconds / 86_400} d` : `${seconds / 86_400} d`;
  if (seconds % 3_600 === 0) return locale === "pl" ? `${seconds / 3_600} godz.` : `${seconds / 3_600} hr`;
  if (seconds % 60 === 0) return `${seconds / 60} min`;
  return locale === "pl" ? `${seconds} sek.` : `${seconds} sec`;
}

function formatUsd(value: number, locale: ProductLocale): string {
  return new Intl.NumberFormat(locale === "pl" ? "pl-PL" : "en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value < 1 ? 6 : 2,
  }).format(value);
}

function formatPercent(value: number, locale: ProductLocale): string {
  return `${formatSignalNumber(value, locale)}%`;
}

function humanizePlanReason(code: string, locale: ProductLocale): string {
  const labels: Record<string, [string, string]> = {
    AVAILABLE_MARGIN_CAP: ["Available-margin cap", "Limit dostępnego marginu"],
    MAX_LEVERAGE_CAP: ["Maximum-leverage cap", "Limit maksymalnej dźwigni"],
    MAX_POSITION_NOTIONAL_CAP: ["Maximum-notional cap", "Limit maksymalnego nominału"],
    MAX_RISK_CAP: ["Maximum-risk cap", "Limit maksymalnego ryzyka"],
    INVALID_EQUITY_USD: ["Invalid equity", "Nieprawidłowe equity"],
    INVALID_AVAILABLE_MARGIN_USD: ["Invalid available margin", "Nieprawidłowy dostępny margin"],
    INVALID_RISK_PCT_PER_TRADE: ["Invalid risk setting", "Nieprawidłowe ustawienie ryzyka"],
    INVALID_MAX_LEVERAGE: ["Invalid leverage setting", "Nieprawidłowe ustawienie dźwigni"],
    INVALID_MAX_POSITION_NOTIONAL_USD: ["Invalid notional cap", "Nieprawidłowy limit nominału"],
    INVALID_ENTRY_PRICE: ["Invalid entry price", "Nieprawidłowa cena wejścia"],
    INVALID_STOP_LOSS: ["Invalid stop loss", "Nieprawidłowy stop loss"],
    INVALID_TAKE_PROFIT: ["Invalid take profit", "Nieprawidłowy take profit"],
    INVALID_PRICE_GEOMETRY: ["Invalid signal geometry", "Nieprawidłowa geometria sygnału"],
    ZERO_STOP_DISTANCE: ["Zero stop distance", "Zerowy dystans stop loss"],
    ZERO_PLANNED_NOTIONAL: ["Zero planned notional", "Zerowy planowany nominał"],
  };
  return (labels[code] ?? [code, code])[locale === "pl" ? 1 : 0];
}

type LiveSignalsCopy = {
  eyebrow: string;
  title: string;
  intro: string;
  sourceOnly: string;
  loading: string;
  unavailableTitle: string;
  unavailableDetail: string;
  forbiddenTitle: string;
  forbiddenDetail: string;
  errorTitle: string;
  errorDetail: string;
  retry: string;
  emptyTitle: string;
  emptyDetail: string;
  summaryLabel: string;
  totalLoaded: string;
  feedLabel: string;
  sourceSignalTime: string;
  entry: string;
  actualFill: string;
  filledAt: string;
  closedAt: string;
  closePrice: string;
  closeReason: string;
  resultR: string;
  referenceEquityEyebrow: string;
  referenceEquityTitle: string;
  referenceEquityBasis: string;
  referenceEquityLoading: string;
  referenceEquityUnavailable: string;
  referenceEquityChartLabel: string;
  riskPerTrade: string;
  startingEquity: string;
  endingEquity: string;
  netResult: string;
  totalR: string;
  winRate: string;
  maxDrawdown: string;
  closedTrades: string;
  noClosedTrades: string;
  referenceEquityLast: string;
  stopLoss: string;
  takeProfit: string;
  maxHold: string;
  cancelPrice: string;
  validFor: string;
  receivedAt: string;
  openDetail: string;
  detailPlaceholder: string;
  detailLoading: string;
  notFoundTitle: string;
  notFoundDetail: string;
  detailErrorTitle: string;
  detailErrorDetail: string;
  detailLabel: string;
  sourceEngine: string;
  detailBoundary: string;
  yourPositionPlan: string;
  planLoading: string;
  planUnavailable: string;
  planUnavailableDetail: string;
  planAccountMode: string;
  planSimulation: string;
  planEquity: string;
  planRiskPct: string;
  planRequestedRisk: string;
  planStopDistance: string;
  planNotional: string;
  planRisk: string;
  planLeverage: string;
  planMargin: string;
  planRiskUtilization: string;
  planReasonCodes: string;
  planNoReduction: string;
  planBoundary: string;
  unavailableValue: string;
};

const LIVE_SIGNALS_COPY: Record<ProductLocale, LiveSignalsCopy> = {
  en: {
    eyebrow: "Trading · AXI source feed",
    title: "Live Signals",
    intro: "Latest AXI source signals with their observed ALLinCrypto Engine lifecycle.",
    sourceOnly: "AXI source + Engine lifecycle · not Kraken execution",
    loading: "Loading live source signals…",
    unavailableTitle: "Live Signals are unavailable",
    unavailableDetail: "The AXI signal feed may be disabled or is not available in this environment.",
    forbiddenTitle: "Live Signals access is restricted",
    forbiddenDetail: "Your current session is not permitted to read AXI source signals.",
    errorTitle: "Could not load Live Signals",
    errorDetail: "The source signal feed is temporarily unavailable. No trading action was attempted.",
    retry: "Try again",
    emptyTitle: "No source signals received",
    emptyDetail: "The signal gateway is available, but it has not received any source signals yet.",
    summaryLabel: "Loaded source signal summary",
    totalLoaded: "Loaded",
    feedLabel: "AXI live source signals",
    sourceSignalTime: "Source signal time",
    entry: "Signal entry",
    actualFill: "Actual Engine fill",
    filledAt: "Filled",
    closedAt: "Closed",
    closePrice: "Close price",
    closeReason: "Close reason",
    resultR: "Result",
    referenceEquityEyebrow: "Strategy reference",
    referenceEquityTitle: "Reference equity · $10,000",
    referenceEquityBasis: "Compounded from closed ALLinCrypto Engine lifecycle results only. This is not Kraken account equity.",
    referenceEquityLoading: "Loading reference equity…",
    referenceEquityUnavailable: "Reference equity is temporarily unavailable",
    referenceEquityChartLabel: "Reference equity curve from closed Engine trades",
    riskPerTrade: "risk / trade",
    startingEquity: "Start",
    endingEquity: "Current",
    netResult: "Net P/L",
    totalR: "Total R",
    winRate: "Win rate",
    maxDrawdown: "Max DD",
    closedTrades: "Closed trades",
    noClosedTrades: "No closed Engine trades yet. The curve starts at $10,000.",
    referenceEquityLast: "Last close",
    stopLoss: "Stop loss",
    takeProfit: "Take profit",
    maxHold: "Max hold",
    cancelPrice: "Cancel price",
    validFor: "Valid for",
    receivedAt: "Received",
    openDetail: "View source details",
    detailPlaceholder: "Select a source signal to read its received record details.",
    detailLoading: "Loading source signal details…",
    notFoundTitle: "Source signal not found",
    notFoundDetail: "This source signal is no longer available from the gateway.",
    detailErrorTitle: "Could not load source signal details",
    detailErrorDetail: "The list remains available; try selecting the signal again later.",
    detailLabel: "Source record details",
    sourceEngine: "Source engine",
    detailBoundary: "Lifecycle reflects the AXI ALLinCrypto Engine execution. It is separate from Kraken Copy execution.",
    yourPositionPlan: "Your position plan",
    planLoading: "Calculating your personal sizing plan…",
    planUnavailable: "Your position plan is unavailable",
    planUnavailableDetail: "The source signal remains available. Try loading the personal plan again later.",
    planAccountMode: "Account mode / source",
    planSimulation: "Crypto Edge per-user simulation",
    planEquity: "Equity",
    planRiskPct: "Risk %",
    planRequestedRisk: "Requested risk USD",
    planStopDistance: "Stop distance %",
    planNotional: "Planned position notional USD",
    planRisk: "Planned risk USD",
    planLeverage: "Effective leverage",
    planMargin: "Required margin USD",
    planRiskUtilization: "Risk utilization %",
    planReasonCodes: "Reduction / block reasons",
    planNoReduction: "No reduction",
    planBoundary: "This is a sizing plan, not an executed order.",
    unavailableValue: "Unavailable",
  },
  pl: {
    eyebrow: "Trading · feed źródłowych sygnałów AXI",
    title: "Sygnały na żywo",
    intro: "Najnowsze sygnały AXI wraz z obserwowanym przebiegiem transakcji w ALLinCrypto Engine.",
    sourceOnly: "Źródło AXI + cykl Engine · to nie jest wykonanie na Krakenie",
    loading: "Ładowanie sygnałów źródłowych…",
    unavailableTitle: "Sygnały na żywo są niedostępne",
    unavailableDetail: "Feed sygnałów AXI może być wyłączony albo niedostępny w tym środowisku.",
    forbiddenTitle: "Dostęp do sygnałów na żywo jest ograniczony",
    forbiddenDetail: "Bieżąca sesja nie ma uprawnień do odczytu źródłowych sygnałów AXI.",
    errorTitle: "Nie udało się pobrać sygnałów na żywo",
    errorDetail: "Feed sygnałów źródłowych jest chwilowo niedostępny. Nie podjęto żadnej akcji transakcyjnej.",
    retry: "Spróbuj ponownie",
    emptyTitle: "Brak odebranych sygnałów źródłowych",
    emptyDetail: "Bramka sygnałów jest dostępna, ale nie odebrała jeszcze żadnych sygnałów źródłowych.",
    summaryLabel: "Podsumowanie załadowanych sygnałów źródłowych",
    totalLoaded: "Załadowano",
    feedLabel: "Źródłowe sygnały AXI na żywo",
    sourceSignalTime: "Czas sygnału źródłowego",
    entry: "Wejście z sygnału",
    actualFill: "Faktyczne wejście Engine",
    filledAt: "Aktywacja",
    closedAt: "Zamknięcie",
    closePrice: "Cena zamknięcia",
    closeReason: "Powód zamknięcia",
    resultR: "Wynik",
    referenceEquityEyebrow: "Wynik referencyjny strategii",
    referenceEquityTitle: "Krzywa kapitału · 10 000 USD",
    referenceEquityBasis: "Kapitał składany wyłącznie z zamkniętych transakcji lifecycle ALLinCrypto Engine. To nie jest equity konta Kraken.",
    referenceEquityLoading: "Ładowanie krzywej kapitału…",
    referenceEquityUnavailable: "Referencyjna krzywa kapitału jest chwilowo niedostępna",
    referenceEquityChartLabel: "Referencyjna krzywa kapitału z zamkniętych transakcji Engine",
    riskPerTrade: "ryzyka / trade",
    startingEquity: "Start",
    endingEquity: "Aktualnie",
    netResult: "Wynik netto",
    totalR: "Suma R",
    winRate: "Skuteczność",
    maxDrawdown: "Max DD",
    closedTrades: "Zamknięte transakcje",
    noClosedTrades: "Brak zamkniętych transakcji Engine. Krzywa startuje od 10 000 USD.",
    referenceEquityLast: "Ostatnie zamknięcie",
    stopLoss: "Stop loss",
    takeProfit: "Take profit",
    maxHold: "Maks. czas utrzymania",
    cancelPrice: "Cena anulowania",
    validFor: "Ważny przez",
    receivedAt: "Odebrano",
    openDetail: "Pokaż szczegóły źródła",
    detailPlaceholder: "Wybierz sygnał źródłowy, aby odczytać szczegóły odebranego rekordu.",
    detailLoading: "Ładowanie szczegółów sygnału źródłowego…",
    notFoundTitle: "Nie znaleziono sygnału źródłowego",
    notFoundDetail: "Ten sygnał źródłowy nie jest już dostępny w bramce.",
    detailErrorTitle: "Nie udało się pobrać szczegółów sygnału źródłowego",
    detailErrorDetail: "Lista pozostaje dostępna; spróbuj wybrać sygnał ponownie później.",
    detailLabel: "Szczegóły rekordu źródłowego",
    sourceEngine: "Silnik źródłowy",
    detailBoundary: "Lifecycle pokazuje wykonanie w źródłowym ALLinCrypto Engine na AXI. Jest oddzielne od wykonania KRAKEN Copy.",
    yourPositionPlan: "Twój plan pozycji",
    planLoading: "Wyliczanie Twojego osobistego planu wielkości…",
    planUnavailable: "Twój plan pozycji jest niedostępny",
    planUnavailableDetail: "Sygnał źródłowy pozostaje dostępny. Spróbuj ponownie załadować osobisty plan później.",
    planAccountMode: "Tryb / źródło konta",
    planSimulation: "Symulacja Crypto Edge per użytkownik",
    planEquity: "Equity",
    planRiskPct: "Ryzyko %",
    planRequestedRisk: "Żądane ryzyko USD",
    planStopDistance: "Odległość stop loss %",
    planNotional: "Planowany nominał pozycji USD",
    planRisk: "Planowane ryzyko USD",
    planLeverage: "Efektywna dźwignia",
    planMargin: "Wymagany margin USD",
    planRiskUtilization: "Wykorzystanie ryzyka %",
    planReasonCodes: "Powody redukcji / blokady",
    planNoReduction: "Brak redukcji",
    planBoundary: "To plan wielkości, nie wykonane zlecenie.",
    unavailableValue: "Niedostępne",
  },
};
