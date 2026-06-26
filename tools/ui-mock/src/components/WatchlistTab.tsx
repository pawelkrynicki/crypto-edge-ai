import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { MockCandidate } from "../mockData";
import { LabelBadge } from "./LabelBadge";
import { ReviewStatusBadge } from "./CandidateReviewControls";
import {
  loadReviewSessionDiagnosticsFromApi,
  type ReviewSessionApiStatus,
  type ReviewSessionDiagnosticsApiResult,
} from "../services/reviewSessionApi";
import {
  createReviewSessionExport,
  mergeReviewSessionState,
  parseReviewSessionImport,
} from "../services/reviewSessionStore";
import type { ReviewSessionImportMode } from "../services/reviewSessionStore";
import type {
  AnalystReviewStatus,
  CandidateReviewRecord,
  ReviewSessionState,
} from "../types/reviewSessionTypes";
import { formatReasonText, formatSecurityFlag } from "../utils/displayText";

interface Props {
  candidates: MockCandidate[];
  reviewSession: ReviewSessionState;
  reviewStorageStatus: ReviewStorageStatus;
  onClearReview: (candidateId: string) => void;
  onOpenCandidate: (candidateId: string) => void;
  onImportReviewSession: (nextState: ReviewSessionState) => void;
  onResetReviewSession: () => Promise<{
    status: ReviewSessionApiStatus;
    message: string;
  }>;
}

const CHAIN_LABELS: Record<string, string> = {
  solana: "SOL",
  ethereum: "ETH",
  bsc: "BSC",
  base: "BASE",
};

type ReviewQueueStatus = Exclude<AnalystReviewStatus, "not_reviewed">;
type ReviewQueueFilter = "ALL" | ReviewQueueStatus;
type ReviewStorageStatus = {
  tone: "ready" | "fallback" | "warning" | "error";
  text: string;
  detail?: string;
};
type ReviewDiagnosticsState = { status: "idle" | "loading" } | ReviewSessionDiagnosticsApiResult;
type ResetLocalReviewsStatus = {
  tone: "success" | "warning" | "error";
  message: string;
};

const REVIEW_QUEUE_FILTERS: { label: string; value: ReviewQueueFilter }[] = [
  { label: "All review items", value: "ALL" },
  { label: "Follow-up", value: "saved_for_follow_up" },
  { label: "Needs research", value: "needs_more_research" },
  { label: "Waiting data", value: "waiting_for_more_data" },
  { label: "Dismissed", value: "dismissed_after_review" },
];

const IMPORT_MODE_LABELS: Record<ReviewSessionImportMode, string> = {
  merge: "Merge with current",
  replace: "Replace current",
};

interface ReviewQueueItem {
  candidate: MockCandidate;
  reviewRecord: CandidateReviewRecord;
}

function fmtUsd(n: number | null): string {
  if (n === null) return "--";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  return `$${(n / 1_000).toFixed(0)}K`;
}

function fmtDays(n: number | null): string {
  return n === null ? "--" : `${n}d`;
}

function isReviewQueueStatus(status: AnalystReviewStatus): status is ReviewQueueStatus {
  return status !== "not_reviewed";
}

function reviewTime(record: CandidateReviewRecord): number {
  const parsed = Date.parse(record.updated_at);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function sortReviewRecords(a: CandidateReviewRecord, b: CandidateReviewRecord): number {
  return reviewTime(b) - reviewTime(a);
}

function formatReviewDate(value: string): string {
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

function getNotePreview(note: string): string {
  const trimmed = note.trim();
  if (!trimmed) return "No analyst note saved.";
  return trimmed.length > 128 ? `${trimmed.slice(0, 125)}...` : trimmed;
}

function getChainLabel(chain: string): string {
  return CHAIN_LABELS[chain] ?? chain.toUpperCase();
}

function getCandidateReason(candidate: MockCandidate): string {
  const firstReason = candidate.final_reasons[0];
  return firstReason ? formatReasonText(firstReason) : "No scanner reason available.";
}

function filterReviewRecord(record: CandidateReviewRecord, filter: ReviewQueueFilter): boolean {
  return filter === "ALL" || record.status === filter;
}

function getFilteredEmptyText(filter: ReviewQueueFilter): string {
  if (filter === "saved_for_follow_up") {
    return "No saved follow-up items in this session.";
  }

  return "No local review items match this filter.";
}

function getReviewEntryCountText(count: number): string {
  return `${count} review entr${count === 1 ? "y" : "ies"}`;
}

export const WatchlistTab: React.FC<Props> = ({
  candidates,
  reviewSession,
  reviewStorageStatus,
  onClearReview,
  onOpenCandidate,
  onImportReviewSession,
  onResetReviewSession,
}) => {
  const [reviewFilter, setReviewFilter] = useState<ReviewQueueFilter>("ALL");
  const [importMode, setImportMode] = useState<ReviewSessionImportMode>("merge");
  const [backupStatus, setBackupStatus] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);
  const [diagnosticsState, setDiagnosticsState] = useState<ReviewDiagnosticsState>({ status: "idle" });
  const [resetConfirmation, setResetConfirmation] = useState("");
  const [resetStatus, setResetStatus] = useState<ResetLocalReviewsStatus | null>(null);
  const [resetInProgress, setResetInProgress] = useState(false);
  const watchlist = candidates.filter((c) => c.final_label === "WATCHLIST");

  const {
    localReviewRecords,
    reviewQueueItems,
    storedReviewsNotInScan,
  } = useMemo(() => {
    const candidatesById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
    const records = Object.values(reviewSession.entries)
      .filter((record) => isReviewQueueStatus(record.status))
      .sort(sortReviewRecords);

    const matchedItems: ReviewQueueItem[] = [];
    const unmatchedRecords: CandidateReviewRecord[] = [];

    for (const record of records) {
      const candidate = candidatesById.get(record.candidate_id);
      if (candidate) {
        matchedItems.push({ candidate, reviewRecord: record });
      } else {
        unmatchedRecords.push(record);
      }
    }

    return {
      localReviewRecords: records,
      reviewQueueItems: matchedItems,
      storedReviewsNotInScan: unmatchedRecords,
    };
  }, [candidates, reviewSession.entries]);

  const filteredQueueItems = reviewQueueItems.filter((item) => filterReviewRecord(item.reviewRecord, reviewFilter));
  const filteredStoredReviews = storedReviewsNotInScan.filter((record) => filterReviewRecord(record, reviewFilter));
  const hasLocalReviews = localReviewRecords.length > 0;
  const hasFilteredReviews = filteredQueueItems.length > 0 || filteredStoredReviews.length > 0;
  const localReviewEntryCount = Object.keys(reviewSession.entries).length;

  const refreshDiagnostics = useCallback(async () => {
    setDiagnosticsState({ status: "loading" });
    const result = await loadReviewSessionDiagnosticsFromApi();
    setDiagnosticsState(result);
  }, []);

  useEffect(() => {
    void refreshDiagnostics();
  }, [refreshDiagnostics]);

  const handleExportReviewJson = () => {
    try {
      const jsonText = createReviewSessionExport(reviewSession);
      const blob = new Blob([jsonText], { type: "application/json" });
      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = objectUrl;
      link.download = `crypto-edge-review-session-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(objectUrl);

      setBackupStatus({
        tone: "success",
        message: `Exported ${getReviewEntryCountText(localReviewEntryCount)} to JSON.`,
      });
    } catch {
      setBackupStatus({
        tone: "error",
        message: "Review backup export failed in this browser.",
      });
    }
  };

  const handleImportFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];

    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".json")) {
      setBackupStatus({
        tone: "error",
        message: "Choose a .json review backup file.",
      });
      input.value = "";
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      const jsonText = typeof reader.result === "string" ? reader.result : "";
      const parsed = parseReviewSessionImport(jsonText);

      if (!parsed.ok) {
        setBackupStatus({
          tone: "error",
          message: parsed.error,
        });
        input.value = "";
        return;
      }

      const nextState = mergeReviewSessionState(reviewSession, parsed.state, importMode);
      onImportReviewSession(nextState);
      setBackupStatus({
        tone: "success",
        message: `Imported ${getReviewEntryCountText(parsed.entries_count)}. Mode: ${IMPORT_MODE_LABELS[importMode]}.`,
      });
      input.value = "";
    };

    reader.onerror = () => {
      setBackupStatus({
        tone: "error",
        message: "Review backup file could not be read.",
      });
      input.value = "";
    };

    reader.readAsText(file);
  };

  const handleResetLocalReviews = async () => {
    if (resetConfirmation !== "RESET" || resetInProgress) return;

    setResetInProgress(true);
    setResetStatus(null);

    try {
      const result = await onResetReviewSession();

      setResetStatus({
        tone: result.status === "ready" ? "success" : "warning",
        message: result.message,
      });
      setResetConfirmation("");
      await refreshDiagnostics();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setResetStatus({
        tone: "error",
        message: `Reset failed: ${message}`,
      });
    } finally {
      setResetInProgress(false);
    }
  };

  const diagnostics = diagnosticsState.status === "ready" ? diagnosticsState.diagnostics : null;
  const diagnosticsError = diagnosticsState.status === "unavailable" || diagnosticsState.status === "error"
    ? diagnosticsState.error
    : null;

  return (
    <div className="space-y-5 max-w-6xl">
      <header className="space-y-2">
        <div>
          <h2 className="text-lg font-bold leading-tight text-primary">Review Queue</h2>
          <p className="text-xs text-secondary">
            Local analyst workspace for scanner candidates marked for follow-up, more research, waiting data, or dismissal.
          </p>
        </div>

        <div className="rounded-md px-4 py-2.5 flex items-start gap-2.5"
          style={{ background: "var(--accent-dim)", border: "1px solid var(--accent-border)" }}>
          <span className="text-accent text-sm mt-0.5 shrink-0">i</span>
          <div className="text-xs text-secondary space-y-0.5">
            <p>Review storage uses the local API when available, with browser localStorage fallback.</p>
            <p>Review status does not change scanner labels.</p>
            <p>This is not a buy/sell signal.</p>
          </div>
        </div>
      </header>

      <section className="card p-4 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-sm font-bold text-primary">Review Backup</h3>
            <p className="text-xs text-secondary">
              Backup includes only local review status and analyst notes.
            </p>
            <p className="text-xs text-secondary">
              It does not include scanner output or market data.
            </p>
            <div
              className="mt-2 rounded-md px-3 py-2 text-xs"
              style={{
                background: getReviewStorageStatusBackground(reviewStorageStatus.tone),
                border: getReviewStorageStatusBorder(reviewStorageStatus.tone),
                color: getReviewStorageStatusColor(reviewStorageStatus.tone),
              }}
            >
              <p className="font-semibold">{reviewStorageStatus.text}</p>
              {reviewStorageStatus.detail && (
                <p className="mt-0.5 break-all opacity-85">{reviewStorageStatus.detail}</p>
              )}
            </div>
          </div>
          <span className="scanner-result-count">
            {localReviewEntryCount} stored item{localReviewEntryCount !== 1 ? "s" : ""}
          </span>
        </div>

        <div className="flex items-end gap-3 flex-wrap">
          <button type="button" className="details-button" onClick={handleExportReviewJson}>
            Export review JSON
          </button>

          <label className="block space-y-1">
            <span className="section-label">Import mode</span>
            <select
              className="ai-input min-w-[180px]"
              value={importMode}
              onChange={(event) => setImportMode(event.target.value as ReviewSessionImportMode)}
            >
              <option value="merge">Merge with current</option>
              <option value="replace">Replace current</option>
            </select>
          </label>

          <label className="block space-y-1">
            <span className="section-label">Import review JSON</span>
            <input
              className="ai-input max-w-[260px] text-xs"
              type="file"
              accept=".json,application/json"
              onChange={handleImportFile}
            />
          </label>
        </div>

        {backupStatus && (
          <div
            className="rounded-md px-3 py-2 text-xs"
            style={{
              background: backupStatus.tone === "success" ? "rgba(50, 209, 132, 0.1)" : "rgba(245, 184, 75, 0.1)",
              border: backupStatus.tone === "success" ? "1px solid rgba(50, 209, 132, 0.25)" : "1px solid rgba(245, 184, 75, 0.3)",
              color: backupStatus.tone === "success" ? "#32d184" : "#f5b84b",
            }}
          >
            {backupStatus.message}
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-2 pt-2">
          <div
            className="rounded-md p-3 space-y-3"
            style={{ background: "var(--bg-raised)", border: "1px solid var(--border)" }}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <h4 className="text-xs font-bold text-primary">Storage diagnostics</h4>
                <p className="text-xs text-secondary">Local Review Storage status without review notes or entries.</p>
              </div>
              <button
                type="button"
                className="details-button"
                onClick={refreshDiagnostics}
                disabled={diagnosticsState.status === "loading"}
              >
                {diagnosticsState.status === "loading" ? "Refreshing..." : "Refresh diagnostics"}
              </button>
            </div>

            <div className="grid sm:grid-cols-2 gap-2 text-xs">
              <DiagnosticField label="App storage status" value={reviewStorageStatus.text} />
              <DiagnosticField label="API diagnostics" value={getDiagnosticsAvailabilityText(diagnosticsState)} />
              {reviewStorageStatus.detail && (
                <DiagnosticField label="App storage detail" value={reviewStorageStatus.detail} />
              )}
              <DiagnosticField label="Storage file path" value={diagnostics?.storage_file ?? "--"} breakAll />
              <DiagnosticField label="File exists" value={diagnostics ? formatBoolean(diagnostics.file_exists) : "--"} />
              <DiagnosticField label="File size" value={diagnostics ? formatFileSize(diagnostics.file_size_bytes) : "--"} />
              <DiagnosticField label="Entries count" value={diagnostics ? String(diagnostics.entries_count) : "--"} />
              <DiagnosticField label="Valid" value={diagnostics ? formatBoolean(diagnostics.valid) : "--"} />
              {diagnostics?.warning && (
                <DiagnosticField label="Warning" value={diagnostics.warning} breakAll />
              )}
              {diagnosticsError && (
                <DiagnosticField label="Diagnostics detail" value={diagnosticsError} breakAll />
              )}
            </div>
          </div>

          <div
            className="rounded-md p-3 space-y-3"
            style={{ background: "var(--bg-raised)", border: "1px solid var(--border)" }}
          >
            <div>
              <h4 className="text-xs font-bold text-primary">Reset local reviews</h4>
              <p className="text-xs text-secondary">
                Reset clears only local review status and analyst notes.
              </p>
              <p className="text-xs text-secondary">
                It does not delete scanner output or market data.
              </p>
            </div>

            <label className="block space-y-1">
              <span className="section-label">Type RESET to confirm</span>
              <input
                className="ai-input max-w-[220px]"
                value={resetConfirmation}
                onChange={(event) => setResetConfirmation(event.target.value)}
                placeholder="RESET"
                autoComplete="off"
              />
            </label>

            <button
              type="button"
              className="details-button"
              onClick={handleResetLocalReviews}
              disabled={resetConfirmation !== "RESET" || resetInProgress}
            >
              {resetInProgress ? "Resetting..." : "Reset local reviews"}
            </button>

            {resetStatus && (
              <div
                className="rounded-md px-3 py-2 text-xs"
                style={{
                  background: getResetStatusBackground(resetStatus.tone),
                  border: getResetStatusBorder(resetStatus.tone),
                  color: getResetStatusColor(resetStatus.tone),
                }}
              >
                {resetStatus.message}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="space-y-2.5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-sm font-bold text-primary">Scanner Watchlist</h3>
            <p className="text-xs text-secondary">Candidates with scanner label WATCHLIST.</p>
          </div>
          <span className="scanner-result-count">{watchlist.length} item{watchlist.length !== 1 ? "s" : ""}</span>
        </div>

        <div className="rounded-md px-4 py-2.5 flex items-start gap-2.5"
          style={{ background: "var(--accent-dim)", border: "1px solid var(--accent-border)" }}>
          <span className="text-accent text-sm mt-0.5 shrink-0">i</span>
          <p className="text-xs text-secondary">
            <strong className="text-primary">Watchlist</strong> means the token is eligible for further research only. It is{" "}
            <strong className="text-[#f5b84b]">not a decision layer</strong>. This is not a buy/sell signal. Independent due diligence is required before any decision.
          </p>
        </div>

        {watchlist.length === 0 ? (
          <div className="card p-5 text-sm text-secondary">No scanner watchlist candidates in the current output.</div>
        ) : (
          <div className="space-y-2.5">
            {watchlist.map((c) => (
              <div key={c.id} className="card p-4 space-y-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div>
                      <span className="font-bold text-primary text-sm">{c.symbol}</span>
                      <span className="text-secondary text-xs ml-2">{c.name}</span>
                    </div>
                    <span className="text-[10px] text-secondary px-2 py-0.5 rounded-md"
                      style={{ background: "var(--bg-raised)", border: "1px solid var(--border)" }}>
                      {getChainLabel(c.chain)} - {c.dex}
                    </span>
                  </div>
                  <LabelBadge label={c.final_label} />
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {[
                    { label: "Market Cap", value: fmtUsd(c.market_cap_usd) },
                    { label: "Liquidity", value: fmtUsd(c.liquidity_usd) },
                    { label: "24h Volume", value: fmtUsd(c.volume_24h_usd) },
                    { label: "Pair Age", value: fmtDays(c.pair_age_days) },
                  ].map((s) => (
                    <div key={s.label} className="rounded-md px-2.5 py-2"
                      style={{ background: "var(--bg-raised)", border: "1px solid var(--border)" }}>
                      <div className="section-label mb-0.5">{s.label}</div>
                      <div className="text-sm font-semibold text-primary">{s.value}</div>
                    </div>
                  ))}
                </div>

                <div>
                  <div className="section-label mb-1">Why Watchlist</div>
                  <p className="text-xs text-secondary">{c.final_reasons.map(formatReasonText).join(" - ")}</p>
                </div>

                {c.security && c.security.missing_data.length > 0 && (
                  <div>
                    <div className="section-label mb-1">Missing Manual Checks</div>
                    <div className="flex flex-wrap gap-1">
                      {c.security.missing_data.map((m) => (
                        <span key={m} className="badge badge-manual text-[10px]">{formatSecurityFlag(m)}</span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between gap-3 text-[10px] flex-wrap"
                  style={{ color: "var(--text-muted)" }}>
                  <span>Last checked: {new Date(c.last_checked).toLocaleString()}</span>
                  <button type="button" className="details-button" onClick={() => onOpenCandidate(c.id)}>
                    Open details
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-2.5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-sm font-bold text-primary">Local Review Queue</h3>
            <p className="text-xs text-secondary">Local review status is separate from scanner label.</p>
          </div>
          <span className="scanner-result-count">{localReviewRecords.length} local item{localReviewRecords.length !== 1 ? "s" : ""}</span>
        </div>

        <div className="scanner-toolbar">
          {REVIEW_QUEUE_FILTERS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setReviewFilter(opt.value)}
              className={`pill ${reviewFilter === opt.value ? "pill-active" : ""}`}
            >
              {opt.label}
            </button>
          ))}
          <span className="scanner-result-count">
            {filteredQueueItems.length + filteredStoredReviews.length} result{filteredQueueItems.length + filteredStoredReviews.length !== 1 ? "s" : ""}
          </span>
        </div>

        {!hasLocalReviews ? (
          <div className="card p-5 text-sm text-secondary space-y-1">
            <p>No local review items yet.</p>
            <p>Mark a candidate as Saved for follow-up or Needs more research from the scanner detail panel.</p>
          </div>
        ) : !hasFilteredReviews ? (
          <div className="card p-5 text-sm text-secondary">{getFilteredEmptyText(reviewFilter)}</div>
        ) : (
          <div className="space-y-3">
            {filteredQueueItems.length > 0 && (
              <div className="card scanner-table-card">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Token</th>
                      <th>Chain</th>
                      <th>Scanner label</th>
                      <th>Review status</th>
                      <th>Analyst note</th>
                      <th>Last updated</th>
                      <th>Reason</th>
                      <th aria-label="Review actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredQueueItems.map(({ candidate, reviewRecord }) => (
                      <tr key={reviewRecord.candidate_id}>
                        <td>
                          <div className="scanner-token">
                            <strong>{candidate.symbol}</strong>
                            <span>{candidate.name}</span>
                          </div>
                        </td>
                        <td>
                          <span className="research-context-chip">{getChainLabel(candidate.chain)}</span>
                        </td>
                        <td>
                          <LabelBadge label={candidate.final_label} />
                        </td>
                        <td>
                          <ReviewStatusBadge status={reviewRecord.status} />
                        </td>
                        <td>
                          <p className="scanner-reason">{getNotePreview(reviewRecord.note)}</p>
                        </td>
                        <td>
                          <span className="text-[11px] text-secondary">{formatReviewDate(reviewRecord.updated_at)}</span>
                        </td>
                        <td>
                          <p className="scanner-reason">{getCandidateReason(candidate)}</p>
                        </td>
                        <td>
                          <div className="flex items-center gap-2">
                            <button type="button" className="details-button" onClick={() => onOpenCandidate(candidate.id)}>
                              Open details
                            </button>
                            <button type="button" className="pill" onClick={() => onClearReview(reviewRecord.candidate_id)}>
                              Clear review
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {filteredStoredReviews.length > 0 && (
              <div className="space-y-2">
                <div>
                  <h4 className="text-xs font-bold text-primary">Stored reviews not in current scan</h4>
                  <p className="text-xs text-secondary">This review belongs to a candidate not present in the current scanner output.</p>
                </div>
                <div className="card scanner-table-card">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Candidate ID</th>
                        <th>Review status</th>
                        <th>Analyst note</th>
                        <th>Last updated</th>
                        <th aria-label="Stored review actions" />
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStoredReviews.map((record) => (
                        <tr key={record.candidate_id}>
                          <td>
                            <code className="text-[11px] text-secondary break-all">{record.candidate_id}</code>
                          </td>
                          <td>
                            <ReviewStatusBadge status={record.status} />
                          </td>
                          <td>
                            <p className="scanner-reason">{getNotePreview(record.note)}</p>
                          </td>
                          <td>
                            <span className="text-[11px] text-secondary">{formatReviewDate(record.updated_at)}</span>
                          </td>
                          <td>
                            <button type="button" className="pill" onClick={() => onClearReview(record.candidate_id)}>
                              Clear review
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
};

function getReviewStorageStatusBackground(tone: ReviewStorageStatus["tone"]): string {
  if (tone === "ready") return "rgba(50, 209, 132, 0.1)";
  if (tone === "warning") return "rgba(245, 184, 75, 0.1)";
  if (tone === "error") return "rgba(245, 184, 75, 0.12)";
  return "var(--bg-raised)";
}

function getReviewStorageStatusBorder(tone: ReviewStorageStatus["tone"]): string {
  if (tone === "ready") return "1px solid rgba(50, 209, 132, 0.25)";
  if (tone === "warning" || tone === "error") return "1px solid rgba(245, 184, 75, 0.3)";
  return "1px solid var(--border)";
}

function getReviewStorageStatusColor(tone: ReviewStorageStatus["tone"]): string {
  if (tone === "ready") return "#32d184";
  if (tone === "warning" || tone === "error") return "#f5b84b";
  return "var(--text-secondary)";
}

function DiagnosticField({
  label,
  value,
  breakAll = false,
}: {
  label: string;
  value: string;
  breakAll?: boolean;
}) {
  return (
    <div className={breakAll ? "min-w-0 sm:col-span-2" : "min-w-0"}>
      <div className="section-label mb-0.5">{label}</div>
      <div className={`text-primary ${breakAll ? "break-all" : ""}`}>{value}</div>
    </div>
  );
}

function getDiagnosticsAvailabilityText(state: ReviewDiagnosticsState): string {
  if (state.status === "ready") return "Available";
  if (state.status === "loading") return "Refreshing";
  if (state.status === "unavailable") return "Unavailable";
  if (state.status === "error") return "Error";
  return "Not loaded";
}

function formatBoolean(value: boolean): string {
  return value ? "Yes" : "No";
}

function formatFileSize(value: number | null): string {
  if (value === null) return "--";
  if (value < 1024) return `${value} B`;
  return `${(value / 1024).toFixed(1)} KB`;
}

function getResetStatusBackground(tone: ResetLocalReviewsStatus["tone"]): string {
  if (tone === "success") return "rgba(50, 209, 132, 0.1)";
  if (tone === "warning") return "rgba(245, 184, 75, 0.1)";
  return "rgba(255, 94, 94, 0.1)";
}

function getResetStatusBorder(tone: ResetLocalReviewsStatus["tone"]): string {
  if (tone === "success") return "1px solid rgba(50, 209, 132, 0.25)";
  if (tone === "warning") return "1px solid rgba(245, 184, 75, 0.3)";
  return "1px solid rgba(255, 94, 94, 0.25)";
}

function getResetStatusColor(tone: ResetLocalReviewsStatus["tone"]): string {
  if (tone === "success") return "#32d184";
  if (tone === "warning") return "#f5b84b";
  return "#ff7b7b";
}
