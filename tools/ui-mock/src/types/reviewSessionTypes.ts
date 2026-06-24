export type AnalystReviewStatus =
  | "not_reviewed"
  | "needs_more_research"
  | "saved_for_follow_up"
  | "dismissed_after_review"
  | "waiting_for_more_data";

export type CandidateReviewRecord = {
  candidate_id: string;
  status: AnalystReviewStatus;
  note: string;
  updated_at: string;
};

export type ReviewSessionState = {
  version: 1;
  entries: Record<string, CandidateReviewRecord>;
};

export type CandidateReviewInput = {
  candidate_id: string;
  status: AnalystReviewStatus;
  note: string;
};

export const REVIEW_STATUS_LABELS: Record<AnalystReviewStatus, string> = {
  not_reviewed: "Not reviewed",
  needs_more_research: "Needs more research",
  saved_for_follow_up: "Saved for follow-up",
  dismissed_after_review: "Dismissed after review",
  waiting_for_more_data: "Waiting for more data",
};

export const REVIEW_STATUS_SHORT_LABELS: Record<AnalystReviewStatus, string> = {
  not_reviewed: "Not reviewed",
  needs_more_research: "Needs research",
  saved_for_follow_up: "Follow-up",
  dismissed_after_review: "Dismissed",
  waiting_for_more_data: "Waiting data",
};

export const REVIEW_STATUS_OPTIONS: AnalystReviewStatus[] = [
  "not_reviewed",
  "needs_more_research",
  "saved_for_follow_up",
  "dismissed_after_review",
  "waiting_for_more_data",
];
