export const CANDIDATE_DETAIL_TAB_IDS = [
  "summary",
  "observation",
  "market",
  "filters",
  "security",
  "ai",
  "data",
] as const;

export type CandidateDetailTabId = (typeof CANDIDATE_DETAIL_TAB_IDS)[number];

export function isCandidateDetailTabId(value: string | null): value is CandidateDetailTabId {
  return CANDIDATE_DETAIL_TAB_IDS.includes(value as CandidateDetailTabId);
}
