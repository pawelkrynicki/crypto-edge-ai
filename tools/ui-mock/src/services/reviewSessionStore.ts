import type {
  AnalystReviewStatus,
  CandidateReviewInput,
  CandidateReviewRecord,
  ReviewSessionState,
} from "../types/reviewSessionTypes";
import { REVIEW_STATUS_OPTIONS } from "../types/reviewSessionTypes";

export const REVIEW_SESSION_STORAGE_KEY = "crypto-edge-ai.review-session.v1";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const REVIEW_STATUS_SET = new Set<AnalystReviewStatus>(REVIEW_STATUS_OPTIONS);

export function createEmptyReviewSession(): ReviewSessionState {
  return {
    version: 1,
    entries: {},
  };
}

export function loadReviewSession(storage = getDefaultStorage()): ReviewSessionState {
  if (!storage) return createEmptyReviewSession();

  try {
    const raw = storage.getItem(REVIEW_SESSION_STORAGE_KEY);
    if (!raw) return createEmptyReviewSession();

    const parsed = JSON.parse(raw) as unknown;
    return parseReviewSessionState(parsed);
  } catch {
    return createEmptyReviewSession();
  }
}

export function saveReviewRecord(
  input: CandidateReviewInput,
  storage = getDefaultStorage(),
): ReviewSessionState {
  const current = loadReviewSession(storage);
  const candidateId = input.candidate_id.trim();
  if (!candidateId || !REVIEW_STATUS_SET.has(input.status)) {
    return current;
  }

  const next: ReviewSessionState = {
    version: 1,
    entries: {
      ...current.entries,
      [candidateId]: {
        candidate_id: candidateId,
        status: input.status,
        note: input.note,
        updated_at: new Date().toISOString(),
      },
    },
  };

  persistReviewSession(next, storage);
  return next;
}

export function clearReviewRecord(candidateId: string, storage = getDefaultStorage()): ReviewSessionState {
  const current = loadReviewSession(storage);
  const normalizedId = candidateId.trim();
  if (!normalizedId || !current.entries[normalizedId]) {
    return current;
  }

  const nextEntries = { ...current.entries };
  delete nextEntries[normalizedId];

  const next: ReviewSessionState = {
    version: 1,
    entries: nextEntries,
  };

  persistReviewSession(next, storage);
  return next;
}

export function getCandidateReview(
  candidateId: string,
  state: ReviewSessionState,
): CandidateReviewRecord | null {
  return state.entries[candidateId] ?? null;
}

function persistReviewSession(state: ReviewSessionState, storage: StorageLike | null): void {
  if (!storage) return;

  try {
    if (Object.keys(state.entries).length === 0) {
      storage.removeItem(REVIEW_SESSION_STORAGE_KEY);
      return;
    }

    storage.setItem(REVIEW_SESSION_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage can be blocked or full. The UI should keep working.
  }
}

function getDefaultStorage(): StorageLike | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

function parseReviewSessionState(value: unknown): ReviewSessionState {
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
