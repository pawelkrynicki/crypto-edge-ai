import type {
  AnalystReviewStatus,
  CandidateReviewInput,
  CandidateReviewRecord,
  ReviewSessionState,
} from "../types/reviewSessionTypes";
import { REVIEW_STATUS_OPTIONS } from "../types/reviewSessionTypes";
import {
  createEmptyReviewSession,
  parseReviewSessionState,
  validateReviewSessionState,
  type ReviewSessionValidationResult,
} from "./reviewSessionValidation";

export { createEmptyReviewSession } from "./reviewSessionValidation";

export const REVIEW_SESSION_STORAGE_KEY = "crypto-edge-ai.review-session.v1";

export type ReviewSessionImportMode = "replace" | "merge";

export type ReviewSessionImportResult = ReviewSessionValidationResult;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const REVIEW_STATUS_SET = new Set<AnalystReviewStatus>(REVIEW_STATUS_OPTIONS);

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

export function saveReviewSessionState(
  state: ReviewSessionState,
  storage = getDefaultStorage(),
): ReviewSessionState {
  persistReviewSession(state, storage);
  return state;
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

export function createReviewSessionExport(state: ReviewSessionState): string {
  const exportState = parseReviewSessionState(state);
  return `${JSON.stringify(exportState, null, 2)}\n`;
}

export function parseReviewSessionImport(jsonText: string): ReviewSessionImportResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return {
      ok: false,
      error: "Review backup JSON is invalid.",
    };
  }

  return validateReviewSessionState(parsed, "Review backup");
}

export function importReviewSession(
  importedState: ReviewSessionState,
  mode: ReviewSessionImportMode,
  storage = getDefaultStorage(),
): ReviewSessionState {
  const current = mode === "merge" ? loadReviewSession(storage) : createEmptyReviewSession();
  const next = mergeReviewSessionState(current, importedState, mode);
  return saveReviewSessionState(next, storage);
}

export function mergeReviewSessionState(
  currentState: ReviewSessionState,
  importedState: ReviewSessionState,
  mode: ReviewSessionImportMode,
): ReviewSessionState {
  const cleanCurrent = parseReviewSessionState(currentState);
  const cleanImported = parseReviewSessionState(importedState);

  if (mode === "replace") {
    return cleanImported;
  }

  return {
    version: 1,
    entries: {
      ...cleanCurrent.entries,
      ...cleanImported.entries,
    },
  };
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
