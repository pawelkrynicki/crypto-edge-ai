export const CANDIDATE_DETAIL_LAYER_IDS = [
  "identity",
  "observation",
  "market",
  "filters",
  "security",
  "ai",
  "data",
  "sources",
] as const;

export type CandidateDetailLayerId = (typeof CANDIDATE_DETAIL_LAYER_IDS)[number];

export function isCandidateDetailLayerId(value: string | null): value is CandidateDetailLayerId {
  return CANDIDATE_DETAIL_LAYER_IDS.includes(value as CandidateDetailLayerId);
}
