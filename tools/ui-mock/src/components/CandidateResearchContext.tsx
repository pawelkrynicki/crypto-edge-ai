import React from "react";
import type { MockCandidate } from "../mockData";
import type {
  DefiContextRecord,
  FearGreedIndexRecord,
  MarketContextApiOutput,
  NormalizedContextRecord,
  NormalizedSourceOutput,
} from "../types/contextTypes";
import type { MarketContextPanelState } from "./MarketContextPanel";

interface Props {
  candidate: MockCandidate;
  marketContextState?: MarketContextPanelState;
}

const MISSING_CATEGORIES = [
  {
    label: "Paid market/onchain data",
    status: "Deferred",
    detail: "Not connected in UX1",
  },
  {
    label: "Dedicated scam/security source",
    status: "Deferred",
    detail: "Clarification pending; no new source connected",
  },
  {
    label: "Token unlocks / vesting",
    status: "Deferred",
    detail: "Not connected in UX1",
  },
  {
    label: "Holder concentration / wallet clusters",
    status: "Deferred",
    detail: "Not connected in UX1",
  },
  {
    label: "Social sentiment",
    status: "Not connected yet",
    detail: "Deferred",
  },
];

export const CandidateResearchContext: React.FC<Props> = ({ candidate, marketContextState }) => {
  const readyContext = marketContextState?.status === "ready" ? marketContextState.context : null;
  const fearGreed = readyContext ? findFearGreedRecord(readyContext) : null;
  const defiRecords = readyContext ? findDefiRecords(readyContext) : [];
  const defillamaSource = readyContext?.sources.find((source) => source.source_id === "defillama_api") ?? null;
  const activeSources = readyContext ? getActiveSourceNames(readyContext.sources) : [];
  const contextUnavailable = marketContextState?.status === "error" || !marketContextState;
  const fixtureFallback = readyContext?._source_meta.source_kind === "fixture-fallback";

  return (
    <div className="research-context-panel">
      <div className="research-context-grid">
        <CoverageItem
          label="Market sentiment context"
          state={fearGreed ? "available" : contextStatus(marketContextState)}
          detail={fearGreed ? `${fearGreed.value} - ${fearGreed.value_classification}` : contextFallbackText(marketContextState)}
        />
        <CoverageItem
          label="DeFi context"
          state={defiRecords.length > 0 ? "available" : contextStatus(marketContextState)}
          detail={defiRecords.length > 0 ? `${defiRecords.length} record${defiRecords.length === 1 ? "" : "s"} available` : contextFallbackText(marketContextState)}
        />
        <CoverageItem
          label="Candidate Snapshot"
          state="available"
          detail={`${candidate.symbol} candidate source output loaded`}
        />
        <CoverageItem
          label="Security check"
          state={candidate.security ? "available" : "missing"}
          detail={candidate.security ? "Candidate security data available" : "Manual Review still required"}
        />
      </div>

      {contextUnavailable && (
        <div className="research-context-note warning">
          <div className="font-semibold">Context unavailable</div>
          <div>{marketContextState?.status === "error" ? marketContextState.message : "Market context is not loaded yet."}</div>
        </div>
      )}

      {readyContext && (
        <div className="research-context-block">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="section-label">Approved free sources active</span>
            {fixtureFallback && <span className="badge badge-manual text-[10px]">Sample context</span>}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {activeSources.length > 0 ? activeSources.map((sourceName) => (
              <span key={sourceName} className="research-context-chip available">{sourceName}</span>
            )) : (
              <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>No active approved source listed.</span>
            )}
          </div>
        </div>
      )}

      {fearGreed && (
        <div className="research-context-block">
          <div className="section-label mb-2">Fear & Greed</div>
          <div className="research-context-mini-grid">
            <MiniMetric label="Value" value={String(fearGreed.value)} />
            <MiniMetric label="Classification" value={fearGreed.value_classification} />
            <MiniMetric label="Timestamp" value={formatDate(fearGreed.timestamp)} />
          </div>
        </div>
      )}

      {readyContext && (
        <div className="research-context-block">
          <div className="section-label mb-2">DefiLlama context</div>
          <div className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
            {defiRecords.length} context record{defiRecords.length === 1 ? "" : "s"} available
            {defillamaSource ? `, ${defillamaSource.warnings.length} warning${defillamaSource.warnings.length === 1 ? "" : "s"}` : ""}
            {defiRecords[0] ? `, top example: ${defiRecords[0].name}` : ""}.
          </div>
        </div>
      )}

      <div className="research-context-block">
        <div className="section-label mb-2">Missing / future data</div>
        <div className="space-y-1.5">
          {MISSING_CATEGORIES.map((item) => (
            <div key={item.label} className="research-context-missing-row">
              <div className="min-w-0">
                <div className="text-[12px] font-medium" style={{ color: "var(--text-primary)" }}>{item.label}</div>
                <div className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{item.detail}</div>
              </div>
              <span className="research-context-chip pending">{item.status}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="research-context-note">
        <div>Market context may help frame research, but it does not change this candidate's label.</div>
        <div>Research-only. Human Manual Review Required.</div>
        <div>Context does not alter scanner label.</div>
      </div>
    </div>
  );
};

function CoverageItem({
  label,
  state,
  detail,
}: {
  label: string;
  state: "available" | "missing" | "loading" | "unavailable";
  detail: string;
}) {
  const stateLabel: Record<"available" | "missing" | "loading" | "unavailable", string> = {
    available: "Available now",
    missing: "Manual Review",
    loading: "Loading",
    unavailable: "Unavailable",
  };

  return (
    <div className="research-context-coverage">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium" style={{ color: "var(--text-primary)" }}>{label}</span>
        <span className={`research-context-chip ${state}`}>{stateLabel[state]}</span>
      </div>
      <div className="text-[11px] mt-1" style={{ color: "var(--text-secondary)" }}>{detail}</div>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase font-semibold" style={{ color: "var(--text-muted)" }}>{label}</div>
      <div className="text-[12px] font-semibold break-words" style={{ color: "var(--text-primary)" }}>{value}</div>
    </div>
  );
}

function contextStatus(state?: MarketContextPanelState): "missing" | "loading" | "unavailable" {
  if (!state || state.status === "error") return "unavailable";
  if (state.status === "loading") return "loading";
  return "missing";
}

function contextFallbackText(state?: MarketContextPanelState): string {
  if (!state) return "Context unavailable";
  if (state.status === "loading") return "Context loading";
  if (state.status === "error") return "Context unavailable";
  return "No context record available";
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

function getActiveSourceNames(sources: NormalizedSourceOutput[]): string[] {
  return sources
    .filter((source) => source.policy.allowed)
    .map((source) => source.source_name);
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
