import React from "react";
import type {
  DefiContextRecord,
  FearGreedIndexRecord,
  MarketContextApiOutput,
  NormalizedContextRecord,
} from "../types/contextTypes";

export type MarketContextPanelState =
  | {
      status: "loading";
      context: null;
    }
  | {
      status: "error";
      context: null;
      message: string;
    }
  | {
      status: "ready";
      context: MarketContextApiOutput;
      message?: string;
    };

interface Props {
  state: MarketContextPanelState;
}

const COMPLIANCE_NOTE = "Context data is for research only. It is not a buy/sell signal.";

export const MarketContextPanel: React.FC<Props> = ({ state }) => {
  if (state.status === "loading") {
    return (
      <section className="card market-context-card">
        <PanelHeader titleMeta="Loading context..." />
        <div className="px-5 py-6 text-sm" style={{ color: "var(--text-secondary)" }}>
          Loading market context...
        </div>
      </section>
    );
  }

  if (state.status === "error") {
    return (
      <section className="card market-context-card">
        <PanelHeader titleMeta="API unavailable" />
        <div className="market-notes mt-4">
          <div className="market-context-warning">
            <div className="font-semibold">API unavailable</div>
            <div>{state.message}</div>
          </div>
        </div>
        <ComplianceNote />
      </section>
    );
  }

  const context = state.context;
  const fearGreed = findFearGreedRecord(context);
  const defiRows = findDefiRecords(context).slice(0, 3);
  const sourceKind = context._source_meta.source_kind;
  const sourceLabel = sourceKind === "approved-sources-output" ? "Real output" : "Fixture fallback";
  const sourceBadgeClass = sourceKind === "approved-sources-output" ? "badge-watchlist" : "badge-manual";
  const warningNotes = collectSourceNotes(context, "warnings");
  const errorNotes = collectSourceNotes(context, "errors");
  const notePreview = [...warningNotes, ...errorNotes].slice(0, 4);
  const hasNoRecords = !fearGreed && defiRows.length === 0;

  return (
    <section className="card market-context-card">
      <PanelHeader
        sourceLabel={sourceLabel}
        sourceBadgeClass={sourceBadgeClass}
        environment={context.environment}
        titleMeta={`Loaded ${formatDate(context._source_meta.loaded_at || context.generated_at)}`}
        summary={context.summary}
      />

      {(state.message || notePreview.length > 0) && (
        <div className="market-notes">
          {state.message && (
            <div className="market-context-warning">
              <span className="font-semibold">Fixture fallback:</span>{" "}
              <span>{state.message}</span>
            </div>
          )}
          {notePreview.length > 0 && (
            <div className="market-context-warning">
              <span className="font-semibold">
                Context notes: {context.summary.warnings_total} warning{context.summary.warnings_total === 1 ? "" : "s"}, {context.summary.errors_total} error{context.summary.errors_total === 1 ? "" : "s"}
              </span>
              <span> - {notePreview.join(" / ")}</span>
            </div>
          )}
        </div>
      )}

      {hasNoRecords ? (
        <div className="px-5 py-6 text-sm" style={{ color: "var(--text-secondary)" }}>
          No context records available.
        </div>
      ) : (
        <div className="market-context-layout">
          <section className="fear-greed-card">
            <div className="section-label">Fear & Greed</div>
            {fearGreed ? (
              <div className="mt-2 flex items-center gap-3">
                <div
                  className="fear-greed-meter"
                  style={{
                    "--meter-value": `${clamp(fearGreed.value, 0, 100)}%`,
                    "--meter-color": sentimentColor(fearGreed.value),
                  } as React.CSSProperties}
                  aria-label={`Fear and Greed value ${fearGreed.value}`}
                >
                  <span>{fearGreed.value}</span>
                </div>
                <div className="min-w-0">
                  <div className="text-base font-bold leading-tight" style={{ color: "var(--text-primary)" }}>
                    {fearGreed.value_classification}
                  </div>
                  <div className="mt-0.5 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                    Broad market sentiment context.
                  </div>
                  <div className="mt-1.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
                    {formatDate(fearGreed.timestamp)}
                  </div>
                </div>
              </div>
            ) : (
              <EmptyState label="No sentiment record available." />
            )}
          </section>

          <section className="market-context-section">
            <div className="mb-1.5 flex items-center gap-2">
              <div className="section-label">DeFi Context</div>
              <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                Top {defiRows.length} record{defiRows.length === 1 ? "" : "s"}
              </div>
            </div>

            {defiRows.length > 0 ? (
              <div className="defi-list">
                {defiRows.map((row) => (
                  <div key={`${row.record_type}-${row.name}-${row.chain ?? "all"}`} className="defi-item">
                    <div className="defi-item-main">
                      {row.url ? (
                        <a href={row.url} target="_blank" rel="noopener noreferrer">
                          {row.name}
                        </a>
                      ) : (
                        <span>{row.name}</span>
                      )}
                      <span>{row.chain ?? "All chains"}</span>
                    </div>
                    <DefiMetric label="TVL" value={formatUsd(row.tvl_usd)} />
                    <DefiMetric label="1d" value={formatChange(row.change_1d)} valueClass={changeClass(row.change_1d)} />
                    <DefiMetric label="7d" value={formatChange(row.change_7d)} valueClass={changeClass(row.change_7d)} />
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState label="No DeFi context records available." />
            )}
          </section>
        </div>
      )}

      <ComplianceNote />
    </section>
  );
};

function PanelHeader({
  sourceLabel,
  sourceBadgeClass,
  environment,
  titleMeta,
  summary,
}: {
  sourceLabel?: string;
  sourceBadgeClass?: string;
  environment?: string;
  titleMeta: string;
  summary?: MarketContextApiOutput["summary"];
}) {
  return (
    <div className="market-context-header">
      <div className="market-header-copy min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2>Market Context</h2>
          {sourceLabel && (
            <span className={`badge ${sourceBadgeClass ?? "badge-reject"}`}>
              {sourceLabel}
            </span>
          )}
          {environment && (
            <span className="badge badge-context">
              {environment}
            </span>
          )}
        </div>
        <p>{titleMeta}</p>
      </div>
      {summary && (
        <div className="market-context-summary">
          <SummaryItem label="Sources" value={summary.sources_allowed} />
          <SummaryItem label="Records" value={summary.records_total} />
          <SummaryItem label="Warnings" value={summary.warnings_total} />
          <SummaryItem label="Errors" value={summary.errors_total} />
        </div>
      )}
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0">
      <div className="section-label">{label}</div>
      <div className="text-sm font-bold tabular-nums leading-tight" style={{ color: "var(--text-primary)" }}>
        {value}
      </div>
    </div>
  );
}

function DefiMetric({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="defi-metric">
      <span>{label}</span>
      <span className={valueClass}>{value}</span>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="text-sm py-3" style={{ color: "var(--text-secondary)" }}>
      {label}
    </div>
  );
}

function ComplianceNote() {
  return (
    <div className="market-context-compliance">
      {COMPLIANCE_NOTE}
    </div>
  );
}

function findFearGreedRecord(context: MarketContextApiOutput): FearGreedIndexRecord | null {
  for (const record of allRecords(context)) {
    if (record.record_type === "fear_greed_index") {
      return record;
    }
  }

  return null;
}

function findDefiRecords(context: MarketContextApiOutput): DefiContextRecord[] {
  return allRecords(context).filter((record): record is DefiContextRecord => (
    record.record_type === "defi_protocol_snapshot" || record.record_type === "chain_tvl_snapshot"
  ));
}

function allRecords(context: MarketContextApiOutput): NormalizedContextRecord[] {
  return context.sources.flatMap((source) => source.records);
}

function collectSourceNotes(context: MarketContextApiOutput, field: "warnings" | "errors"): string[] {
  return context.sources.flatMap((source) => source[field].map((note) => `${source.source_name}: ${note}`));
}

function formatDate(value: string | null): string {
  if (!value) return "--";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatUsd(value: number | null): string {
  if (value === null) return "--";
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

function formatChange(value: number | null): string {
  if (value === null) return "--";
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(2)}%`;
}

function changeClass(value: number | null): string {
  if (value === null) return "text-secondary";
  if (value > 0) return "text-[#32d184]";
  if (value < 0) return "text-[#ff6575]";
  return "text-secondary";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function sentimentColor(value: number): string {
  if (value >= 65) return "var(--green)";
  if (value >= 35) return "var(--amber)";
  return "var(--red)";
}
