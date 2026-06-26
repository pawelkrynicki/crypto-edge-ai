import type {
  AnalystReviewStatus,
  CandidateReviewRecord,
  ReviewSessionState,
} from "../types/reviewSessionTypes";
import { REVIEW_STATUS_OPTIONS } from "../types/reviewSessionTypes";

export type ReviewSessionValidationResult = {
  ok: true;
  state: ReviewSessionState;
  entries_count: number;
} | {
  ok: false;
  error: string;
};

const REVIEW_STATUS_SET = new Set<AnalystReviewStatus>(REVIEW_STATUS_OPTIONS);

export function createEmptyReviewSession(): ReviewSessionState {
  return {
    version: 1,
    entries: {},
  };
}

export function parseReviewSessionState(value: unknown): ReviewSessionState {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.entries)) {
    return createEmptyReviewSession();
  }

  const entries: Record<string, CandidateReviewRecord> = {};

  for (const [candidateId, record] of Object.entries(value.entries)) {
    const parsedRecord = parseReviewRecord(candidateId, record);
    if (parsedRecord) {
      entries[parsedRecord.candidate_id] = parsedRecord;
    }
  }

  return {
    version: 1,
    entries,
  };
}

export function validateReviewSessionState(
  value: unknown,
  subject = "Review session",
): ReviewSessionValidationResult {
  if (!isRecord(value)) {
    return {
      ok: false,
      error: `${subject} must be a JSON object.`,
    };
  }

  if (value.version !== 1) {
    return {
      ok: false,
      error: `Unsupported ${subject.toLowerCase()} version. Expected version 1.`,
    };
  }

  if (!isRecord(value.entries)) {
    return {
      ok: false,
      error: `${subject} entries must be an object.`,
    };
  }

  const entries: Record<string, CandidateReviewRecord> = {};

  for (const [candidateId, record] of Object.entries(value.entries)) {
    const parsedRecord = parseReviewRecord(candidateId, record);

    if (!parsedRecord) {
      return {
        ok: false,
        error: `${subject} entry "${candidateId}" is invalid.`,
      };
    }

    entries[parsedRecord.candidate_id] = parsedRecord;
  }

  return {
    ok: true,
    state: {
      version: 1,
      entries,
    },
    entries_count: Object.keys(entries).length,
  };
}

function parseReviewRecord(candidateId: string, value: unknown): CandidateReviewRecord | null {
  if (!isRecord(value)) return null;
  if (typeof value.candidate_id !== "string") return null;
  if (value.candidate_id !== candidateId) return null;
  if (typeof value.note !== "string") return null;
  if (typeof value.updated_at !== "string") return null;
  if (!REVIEW_STATUS_SET.has(value.status as AnalystReviewStatus)) return null;

  return {
    candidate_id: value.candidate_id,
    status: value.status as AnalystReviewStatus,
    note: value.note,
    updated_at: value.updated_at,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
