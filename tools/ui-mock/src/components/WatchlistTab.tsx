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
  const reviewQueueResultCount = filteredQueueItems.length + filteredStoredReviews.length;
  const summaryCards = [
    {
      label: "Scanner WATCHLIST",
      value: watchlist.length,
      detail: "Current scanner candidates eligible for further manual review only.",
    },
    {
      label: "Local review entries",
      value: localReviewEntryCount,
      detail: "Stored local review status and analyst notes.",
    },
    {
      label: "Saved for follow-up",
      value: countReviewStatus(localReviewRecords, "saved_for_follow_up"),
      detail: "Local status only, separate from scanner labels.",
    },
    {
      label: "Needs more research",
      value: countReviewStatus(localReviewRecords, "needs_more_research"),
      detail: "Analyst marked for more manual context.",
    },
    {
      label: "Waiting for more data",
      value: countReviewStatus(localReviewRecords, "waiting_for_more_data"),
      detail: "Local queue item waiting on future coverage.",
    },
    {
      label: "Dismissed after review",
      value: countReviewStatus(localReviewRecords, "dismissed_after_review"),
      detail: "Local review cleanup state only.",
    },
    {
      label: "Stored reviews not in current scan",
      value: storedReviewsNotInScan.length,
      detail: "Notes from earlier scanner outputs.",
    },
  ];

  return (
    <div className="review-workspace">
      <header className="review-workspace-header">
        <div className="review-workspace-title">
          <span className="section-label">Local analyst layer</span>
          <h2>Review Queue Workspace</h2>
          <p>Local analyst status and notes only.</p>
        </div>

        <div className="review-compliance-panel">
          <span>Scope</span>
          <div>
            <p>Review status does not change scanner labels, scoring, final_label or WATCHLIST meaning.</p>
            <p>This is not a buy/sell signal.</p>
          </div>
        </div>
      </header>

      <section className="review-summary-grid" aria-label="Review queue summary">
        {summaryCards.map((card) => (
          <ReviewSummaryCard
            key={card.label}
            label={card.label}
            value={card.value}
            detail={card.detail}
          />
        ))}
      </section>

      <section className="review-storage-section">
        <div className="review-storage-header">
          <div>
            <span className="section-label">Local review session only</span>
            <h3>Storage & Backup</h3>
            <p>Review storage uses the local API when available, with browser localStorage fallback.</p>
            <p>Export/import includes only local review status and analyst notes.</p>
            <p>Diagnostics do not show notes or entries. Reset local reviews clears only local review state.</p>
            <div
              className="review-storage-status"
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

        <div className="review-backup-copy">
          <h4>Review Backup</h4>
          <p>Backup includes only local review status and analyst notes. It does not include scanner output or market data.</p>
        </div>

        <div className="review-backup-actions">
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

        <div className="review-storage-grid">
          <div className="review-storage-panel">
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

          <div className="review-storage-panel">
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

      <section className="review-workspace-section scanner-watchlist-section">
        <ReviewSectionHeader
          title="Scanner Watchlist"
          description="Current scanner candidates with final_label = WATCHLIST."
          meta={`${watchlist.length} item${watchlist.length !== 1 ? "s" : ""}`}
        />

        <div className="review-info-note">
          <span>WATCHLIST</span>
          <p>
            WATCHLIST means eligible for further manual review only. Local review status is a separate analyst layer.
            This is not a buy/sell signal.
          </p>
        </div>

        {watchlist.length === 0 ? (
          <div className="review-empty-state">No scanner watchlist candidates in the current output.</div>
        ) : (
          <div className="review-card-list">
            {watchlist.map((c) => (
              <div key={c.id} className="review-item-card scanner-watchlist-card">
                <div className="review-item-topline">
                  <div className="review-item-token">
                    <strong>{c.symbol}</strong>
                    <span>{c.name}</span>
                  </div>
                  <div className="review-item-badges">
                    <LabelBadge label={c.final_label} />
                    <ReviewStatusBadge status={reviewSession.entries[c.id]?.status ?? "not_reviewed"} />
                  </div>
                </div>

                <div className="review-item-meta">
                  <span>{getChainLabel(c.chain)} - {c.dex}</span>
                  <code>{c.id}</code>
                  <span>final_label: {c.final_label}</span>
                </div>

                <div className="review-metric-grid">
                  {[
                    { label: "Market Cap", value: fmtUsd(c.market_cap_usd) },
                    { label: "Liquidity", value: fmtUsd(c.liquidity_usd) },
                    { label: "24h Volume", value: fmtUsd(c.volume_24h_usd) },
                    { label: "Pair Age", value: fmtDays(c.pair_age_days) },
                  ].map((s) => (
                    <div key={s.label} className="review-metric">
                      <span>{s.label}</span>
                      <strong>{s.value}</strong>
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

                <div className="review-item-actions">
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

      <section className="review-workspace-section local-review-section">
        <ReviewSectionHeader
          title="Local Review Queue"
          description="Local review status is separate from scanner final_label, scoring, and WATCHLIST meaning."
          meta={`${localReviewRecords.length} local item${localReviewRecords.length !== 1 ? "s" : ""}`}
        />

        <div className="scanner-toolbar review-filter-toolbar">
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
            {reviewQueueResultCount} result{reviewQueueResultCount !== 1 ? "s" : ""}
          </span>
        </div>

        {!hasLocalReviews ? (
          <div className="review-empty-state">
            <p>No local review items yet.</p>
            <p>Mark a candidate as Saved for follow-up or Needs more research from the scanner detail panel.</p>
          </div>
        ) : filteredQueueItems.length === 0 ? (
          <div className="review-empty-state">
            <p>{hasFilteredReviews ? "No current-scan local review items match this filter." : getFilteredEmptyText(reviewFilter)}</p>
          </div>
        ) : (
          <div className="review-card-list">
            {filteredQueueItems.map(({ candidate, reviewRecord }) => (
              <ReviewQueueItemCard
                key={reviewRecord.candidate_id}
                candidate={candidate}
                reviewRecord={reviewRecord}
                onOpenCandidate={onOpenCandidate}
                onClearReview={onClearReview}
              />
            ))}
          </div>
        )}
      </section>

      <section className="review-workspace-section stored-review-section">
        <ReviewSectionHeader
          title="Stored Reviews Not In Current Scan"
          description="Local notes from previous scans. These entries do not imply the candidate is active in the current scanner output."
          meta={`${storedReviewsNotInScan.length} stored item${storedReviewsNotInScan.length !== 1 ? "s" : ""}`}
        />

        {storedReviewsNotInScan.length === 0 ? (
          <div className="review-empty-state">
            <p>No stored reviews outside the current scan.</p>
          </div>
        ) : filteredStoredReviews.length === 0 ? (
          <div className="review-empty-state">
            <p>No stored reviews outside the current scan match this filter.</p>
          </div>
        ) : (
          <div className="review-card-list">
            {filteredStoredReviews.map((record) => (
              <ReviewQueueItemCard
                key={record.candidate_id}
                reviewRecord={record}
                onClearReview={onClearReview}
              />
            ))}
          </div>
        )}
      </section>

      <section className="report-workspace-card">
        <div className="report-workspace-copy">
          <span className="section-label">Local CMD export</span>
          <h3>Analyst Report Workspace</h3>
          <p>
            Generate the analyst report locally from CMD. The UI does not run report generation, so no new endpoint is needed.
          </p>
          <p>
            The report is Markdown plus JSON and contains scanner summary, market context, review notes, stored reviews not in current scan,
            candidate snapshot, and compliance.
          </p>
          <p>It is a local research workflow export, not investment advice.</p>
          <p className="report-compliance">This is not a buy/sell signal.</p>
        </div>

        <div className="report-command-grid">
          <CommandBlock label="Generate report" value={"scripts\\win\\generate-analyst-report.cmd"} />
          <CommandBlock label="Smoke check" value={"scripts\\win\\check-analyst-report.cmd"} />
          <CommandBlock label="Output path" value={"tools\\ui-mock\\.local\\reports"} />
        </div>
      </section>
    </div>
  );
};

function countReviewStatus(records: CandidateReviewRecord[], status: ReviewQueueStatus): number {
  return records.filter((record) => record.status === status).length;
}

function ReviewSummaryCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <article className="review-summary-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  );
}

function ReviewSectionHeader({
  title,
  description,
  meta,
}: {
  title: string;
  description: string;
  meta: string;
}) {
  return (
    <div className="review-section-header">
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      <span className="scanner-result-count">{meta}</span>
    </div>
  );
}

function ReviewQueueItemCard({
  candidate,
  reviewRecord,
  onOpenCandidate,
  onClearReview,
}: {
  candidate?: MockCandidate;
  reviewRecord: CandidateReviewRecord;
  onOpenCandidate?: (candidateId: string) => void;
  onClearReview: (candidateId: string) => void;
}) {
  return (
    <article className={`review-item-card ${candidate ? "" : "stored-review-card"}`}>
      <div className="review-item-topline">
        <div className="review-item-token">
          <strong>{candidate?.symbol ?? "Stored review"}</strong>
          <span>{candidate?.name ?? "Not present in current scanner output"}</span>
        </div>
        <div className="review-item-badges">
          {candidate && <LabelBadge label={candidate.final_label} />}
          <ReviewStatusBadge status={reviewRecord.status} />
        </div>
      </div>

      <div className="review-item-meta">
        <code>{reviewRecord.candidate_id}</code>
        {candidate && <span>{getChainLabel(candidate.chain)} - {candidate.dex}</span>}
        {candidate ? (
          <span>final_label: {candidate.final_label}</span>
        ) : (
          <span>This review belongs to a candidate not present in the current scanner output.</span>
        )}
      </div>

      <div className="review-item-body">
        <div>
          <span className="section-label">Review status</span>
          <ReviewStatusBadge status={reviewRecord.status} />
        </div>
        <div>
          <span className="section-label">Analyst note</span>
          <p>{getNotePreview(reviewRecord.note)}</p>
        </div>
        <div>
          <span className="section-label">Last updated</span>
          <p>{formatReviewDate(reviewRecord.updated_at)}</p>
        </div>
        <div>
          <span className="section-label">Scanner reason</span>
          <p>{candidate ? getCandidateReason(candidate) : "Scanner reason unavailable in the current output."}</p>
        </div>
      </div>

      <div className="review-item-actions">
        <span>{candidate ? "Current scanner output" : "Local note from an earlier scan"}</span>
        <div className="flex items-center gap-2">
          {candidate && onOpenCandidate && (
            <button type="button" className="details-button" onClick={() => onOpenCandidate(candidate.id)}>
              Open details
            </button>
          )}
          <button type="button" className="pill" onClick={() => onClearReview(reviewRecord.candidate_id)}>
            Clear review
          </button>
        </div>
      </div>
    </article>
  );
}

function CommandBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="report-command-block">
      <span>{label}</span>
      <code>{value}</code>
    </div>
  );
}

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
