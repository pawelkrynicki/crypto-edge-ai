import React, { useEffect, useState } from "react";
import type {
  AnalystReviewStatus,
  CandidateReviewInput,
  CandidateReviewRecord,
} from "../types/reviewSessionTypes";
import {
  REVIEW_STATUS_LABELS,
  REVIEW_STATUS_OPTIONS,
  REVIEW_STATUS_SHORT_LABELS,
} from "../types/reviewSessionTypes";

interface CandidateReviewControlsProps {
  candidateId: string;
  reviewRecord?: CandidateReviewRecord | null;
  onSaveReview?: (input: CandidateReviewInput) => void;
  onClearReview?: (candidateId: string) => void;
}

const REVIEW_STATUS_BADGE_STYLES: Record<AnalystReviewStatus, string> = {
  not_reviewed: "text-[#64748b] bg-[#64748b]/10 border-[#64748b]/25",
  needs_more_research: "text-[#f59e0b] bg-[#f59e0b]/10 border-[#f59e0b]/25",
  saved_for_follow_up: "text-[#22c55e] bg-[#22c55e]/10 border-[#22c55e]/25",
  dismissed_after_review: "text-[#94a3b8] bg-[#64748b]/10 border-[#64748b]/25",
  waiting_for_more_data: "text-[#38bdf8] bg-[#38bdf8]/10 border-[#38bdf8]/25",
};

export const ReviewStatusBadge: React.FC<{
  status?: AnalystReviewStatus | null;
  short?: boolean;
}> = ({ status, short = false }) => {
  const resolvedStatus = status ?? "not_reviewed";
  const label = short ? REVIEW_STATUS_SHORT_LABELS[resolvedStatus] : REVIEW_STATUS_LABELS[resolvedStatus];

  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold ${REVIEW_STATUS_BADGE_STYLES[resolvedStatus]}`}
    >
      {label}
    </span>
  );
};

export const CandidateReviewControls: React.FC<CandidateReviewControlsProps> = ({
  candidateId,
  reviewRecord,
  onSaveReview,
  onClearReview,
}) => {
  const [status, setStatus] = useState<AnalystReviewStatus>(reviewRecord?.status ?? "not_reviewed");
  const [note, setNote] = useState(reviewRecord?.note ?? "");

  useEffect(() => {
    setStatus(reviewRecord?.status ?? "not_reviewed");
    setNote(reviewRecord?.note ?? "");
  }, [candidateId, reviewRecord?.note, reviewRecord?.status]);

  const hasDraft = status !== "not_reviewed" || note.length > 0;
  const updatedAt = reviewRecord ? formatReviewDate(reviewRecord.updated_at) : null;

  const handleSave = () => {
    if (!onSaveReview) return;

    onSaveReview({
      candidate_id: candidateId,
      status,
      note,
    });
  };

  const handleClear = () => {
    setStatus("not_reviewed");
    setNote("");
    if (reviewRecord && onClearReview) {
      onClearReview(candidateId);
    }
  };

  return (
    <div className="rounded-md p-3 space-y-3" style={{ background: "var(--bg-raised)", border: "1px solid var(--border-sub)" }}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>Local Review Session</div>
          <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
            {updatedAt ? `Last updated: ${updatedAt}` : "Saved locally after review."}
          </div>
        </div>
        <ReviewStatusBadge status={reviewRecord?.status ?? "not_reviewed"} />
      </div>

      <label className="block space-y-1">
        <span className="section-label">Review status</span>
        <select
          className="ai-input"
          value={status}
          onChange={(event) => setStatus(event.target.value as AnalystReviewStatus)}
        >
          {REVIEW_STATUS_OPTIONS.map((option) => (
            <option key={option} value={option}>{REVIEW_STATUS_LABELS[option]}</option>
          ))}
        </select>
      </label>

      <label className="block space-y-1">
        <span className="section-label">Analyst note</span>
        <textarea
          className="ai-input min-h-[72px]"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Analyst note"
        />
      </label>

      <div className="flex items-center gap-2">
        <button
          type="button"
          className="btn-primary"
          onClick={handleSave}
          disabled={!onSaveReview}
        >
          Save review
        </button>
        <button
          type="button"
          className="px-3 py-2 rounded-md text-[12px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            background: "var(--bg-card)",
            color: "var(--text-secondary)",
            border: "1px solid var(--border)",
          }}
          onClick={handleClear}
          disabled={!reviewRecord && !hasDraft}
        >
          Clear review
        </button>
      </div>

      <div className="rounded-md px-3 py-2 text-[11px] leading-relaxed space-y-1"
        style={{ background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.18)", color: "var(--text-secondary)" }}>
        <div>Local review is saved only in this browser.</div>
        <div>This does not change scanner label.</div>
        <div>This is not a buy/sell signal.</div>
      </div>
    </div>
  );
};

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
