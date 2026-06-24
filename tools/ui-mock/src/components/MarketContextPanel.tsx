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
        <div className="px-4 py-5 text-sm" style={{ color: "var(--text-secondary)" }}>
          Loading market context...
        </div>
      </section>
    );
  }

  if (state.status === "error") {
    return (
      <section className="card market-context-card">
        <PanelHeader titleMeta="API unavailable" />
        <div className="market-context-warning">
          <div className="font-semibold">API unavailable</div>
          <div>{state.message}</div>
        </div>
        <ComplianceNote />
      </section>
    );
  }

  const context = state.context;
  const fearGreed = findFearGreedRecord(context);
  const defiRows = findDefiRecords(context).slice(0, 5);
  const sourceKind = context._source_meta.source_kind;
  const sourceLabel = sourceKind === "approved-sources-output" ? "Real output" : "Fixture fallback";
  const sourceBadgeClass = sourceKind === "approved-sources-output" ? "badge-watchlist" : "badge-manual";
  const warningNotes = collectSourceNotes(context, "warnings");
  const errorNotes = collectSourceNotes(context, "errors");
  const hasNoRecords = !fearGreed && defiRows.length === 0;

  return (
    <section className="card market-context-card">
      <PanelHeader
        sourceLabel={sourceLabel}
        sourceBadgeClass={sourceBadgeClass}
        environment={context.environment}
        titleMeta={`Loaded ${formatDate(context._source_meta.loaded_at || context.generated_at)}`}
      />

      {state.message && (
        <div className="market-context-warning">
          <div className="font-semibold">Fixture fallback</div>
          <div>{state.message}</div>
        </div>
      )}

      {(context.summary.warnings_total > 0 || context.summary.errors_total > 0) && (
        <div className="market-context-warning">
          <div className="font-semibold">
            Context notes: {context.summary.warnings_total} warning{context.summary.warnings_total === 1 ? "" : "s"}, {context.summary.errors_total} error{context.summary.errors_total === 1 ? "" : "s"}
          </div>
          {[...warningNotes, ...errorNotes].slice(0, 3).map((note) => (
            <div key={note}>{note}</div>
          ))}
        </div>
      )}

      {hasNoRecords ? (
        <div className="px-4 py-5 text-sm" style={{ color: "var(--text-secondary)" }}>
          No context records available.
        </div>
      ) : (
        <div className="market-context-layout">
          <section className="market-context-section">
            <div className="section-label">Fear & Greed</div>
            {fearGreed ? (
              <div className="mt-2 flex items-start justify-between gap-4">
                <div>
                  <div className="text-3xl font-bold tabular-nums leading-none" style={{ color: "var(--text-primary)" }}>
                    {fearGreed.value}
                  </div>
                  <div className="text-sm font-semibold mt-1" style={{ color: "var(--text-secondary)" }}>
                    {fearGreed.value_classification}
                  </div>
                </div>
                <div className="text-right min-w-0">
                  <div className="text-[10px] uppercase font-semibold" style={{ color: "var(--text-muted)" }}>
                    Timestamp
                  </div>
                  <div className="text-xs break-words" style={{ color: "var(--text-secondary)" }}>
                    {formatDate(fearGreed.timestamp)}
                  </div>
                  <div className="mt-2 text-[11px]" style={{ color: "var(--accent)" }}>
                    Market sentiment context only
                  </div>
                </div>
              </div>
            ) : (
              <EmptyState label="No sentiment record available." />
            )}
          </section>

          <section className="market-context-section market-context-defi">
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="section-label">DefiLlama</div>
              <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                {defiRows.length} row{defiRows.length === 1 ? "" : "s"}
              </span>
            </div>
            {defiRows.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="data-table market-context-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Chain</th>
                      <th>TVL</th>
                      <th>1d</th>
                      <th>7d</th>
                      <th>URL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {defiRows.map((row) => (
                      <tr key={`${row.record_type}-${row.name}-${row.chain ?? "all"}`}>
                        <td className="font-semibold">{row.name}</td>
                        <td>{row.chain ?? "--"}</td>
                        <td>{formatUsd(row.tvl_usd)}</td>
                        <td className={changeClass(row.change_1d)}>{formatChange(row.change_1d)}</td>
                        <td className={changeClass(row.change_7d)}>{formatChange(row.change_7d)}</td>
                        <td>
                          {row.url ? (
                            <a href={row.url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                              Open
                            </a>
                          ) : "--"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState label="No DeFi context records available." />
            )}
          </section>
        </div>
      )}

      <div className="market-context-summary">
        <SummaryItem label="Sources allowed" value={context.summary.sources_allowed} />
        <SummaryItem label="Records total" value={context.summary.records_total} />
        <SummaryItem label="Warnings" value={context.summary.warnings_total} />
        <SummaryItem label="Errors" value={context.summary.errors_total} />
      </div>

      <ComplianceNote />
    </section>
  );
};

function PanelHeader({
  sourceLabel,
  sourceBadgeClass,
  environment,
  titleMeta,
}: {
  sourceLabel?: string;
  sourceBadgeClass?: string;
  environment?: string;
  titleMeta: string;
}) {
  return (
    <div className="market-context-header">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-bold leading-tight" style={{ color: "var(--text-primary)" }}>
            Market Context
          </h2>
          {sourceLabel && (
            <span className={`badge ${sourceBadgeClass ?? "badge-reject"} text-[10px]`}>
              {sourceLabel}
            </span>
          )}
          {environment && (
            <span className="badge badge-reject text-[10px]">
              {environment}
            </span>
          )}
        </div>
        <div className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>
          {titleMeta}
        </div>
      </div>
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0">
      <div className="section-label">{label}</div>
      <div className="text-lg font-bold tabular-nums leading-tight" style={{ color: "var(--text-primary)" }}>
        {value}
      </div>
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
  if (value > 0) return "text-[#22c55e]";
  if (value < 0) return "text-[#ef4444]";
  return "text-secondary";
}
