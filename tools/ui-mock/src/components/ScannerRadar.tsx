import React, { useState } from "react";
import type { MockCandidate, FinalLabel } from "../mockData";
import { CandidateDetail } from "./CandidateDetail";
import { ScannerCandidateCard } from "./ScannerCandidateCard";
import type { MarketContextPanelState } from "./MarketContextPanel";
import type { CandidateReviewInput, ReviewSessionState } from "../types/reviewSessionTypes";
import { getCandidateReview } from "../services/reviewSessionStore";

interface Props {
  candidates: MockCandidate[];
  marketContextState?: MarketContextPanelState;
  selectedCandidateId?: string | null;
  onCandidateSelected?: (candidateId: string | null) => void;
  reviewSession: ReviewSessionState;
  onSaveReview: (input: CandidateReviewInput) => void;
  onClearReview: (candidateId: string) => void;
}

type ScannerFilter = FinalLabel | "ALL" | "FOLLOW_UP";

const FILTER_OPTIONS: { label: string; value: ScannerFilter }[] = [
  { label: "All", value: "ALL" },
  { label: "Watchlist Candidate", value: "WATCHLIST" },
  { label: "Risk Flags", value: "CRITICAL_RISK" },
  { label: "Manual Verification Required", value: "NEEDS_MANUAL_VERIFICATION" },
  { label: "Out of Research Scope", value: "REJECT" },
  { label: "Follow-up", value: "FOLLOW_UP" },
];

export const ScannerRadar: React.FC<Props> = ({
  candidates,
  marketContextState,
  selectedCandidateId,
  onCandidateSelected,
  reviewSession,
  onSaveReview,
  onClearReview,
}) => {
  const [filter, setFilter] = useState<ScannerFilter>("ALL");

  React.useEffect(() => {
    setFilter("ALL");
  }, [candidates]);

  const selected = React.useMemo(() => {
    if (selectedCandidateId === null) return null;
    if (!selectedCandidateId) return candidates[0] ?? null;

    return candidates.find((candidate) => candidate.id === selectedCandidateId) ?? candidates[0] ?? null;
  }, [candidates, selectedCandidateId]);

  const filtered = filter === "ALL"
    ? candidates
    : filter === "FOLLOW_UP"
      ? candidates.filter((candidate) => getCandidateReview(candidate.id, reviewSession)?.status === "saved_for_follow_up")
      : candidates.filter((candidate) => candidate.final_label === filter);

  return (
    <div className="scanner-workbench">
      <section className="scanner-list-panel">
        <header className="scanner-radar-header">
          <div className="min-w-0">
            <h3>Candidate Source Review</h3>
            <p>Candidate source output is read-only. WATCHLIST means Manual Review Only.</p>
          </div>
          <div className="scanner-guidance-list" aria-label="Candidate source guidance">
            <span>Local review status is an analyst note layer and does not change scanner label.</span>
            <span>Research-only. Human Manual Review Required.</span>
          </div>
        </header>

        <div className="scanner-toolbar">
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setFilter(opt.value)}
              className={`pill ${filter === opt.value ? "pill-active" : ""}`}
            >
              {opt.label}
            </button>
          ))}
          <span className="scanner-result-count">
            {filtered.length} result{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>

        <div className="scanner-card-list" aria-label="Research Candidate list">
          {filtered.length > 0 ? filtered.map((candidate) => (
            <ScannerCandidateCard
              key={candidate.id}
              candidate={candidate}
              selected={selected?.id === candidate.id}
              reviewRecord={getCandidateReview(candidate.id, reviewSession)}
              onSelect={() => onCandidateSelected?.(candidate.id)}
            />
          )) : (
            <div className="scanner-empty-state">
              No Research Candidates match the current filter.
            </div>
          )}
        </div>
      </section>

      <aside className="scanner-detail-panel">
        {selected ? (
          <CandidateDetail
            candidate={selected}
            marketContextState={marketContextState}
            reviewRecord={getCandidateReview(selected.id, reviewSession)}
            onSaveReview={onSaveReview}
            onClearReview={onClearReview}
            onClose={() => onCandidateSelected?.(null)}
          />
        ) : (
          <div className="scanner-empty-state">
            Select a token to open Candidate Detail.
          </div>
        )}
      </aside>
    </div>
  );
};
