import type { ReviewSessionState } from "../types/reviewSessionTypes";
import { validateReviewSessionState } from "./reviewSessionValidation";

export type ReviewSessionApiStatus = "ready" | "unavailable" | "error";

export type ReviewSessionApiSourceMeta = {
  source_kind: "file-backed-review-session";
  storage_file: string;
  loaded_at: string;
  warning?: string;
};

export type ReviewSessionApiResult = {
  status: "ready";
  state: ReviewSessionState;
  sourceMeta: ReviewSessionApiSourceMeta | null;
} | {
  status: Exclude<ReviewSessionApiStatus, "ready">;
  error: string;
};

type ViteImportMeta = ImportMeta & {
  env?: {
    VITE_SCANNER_API_URL?: string;
  };
};

class ReviewSessionApiHttpError extends Error {}
class ReviewSessionApiValidationError extends Error {}

export async function loadReviewSessionFromApi(): Promise<ReviewSessionApiResult> {
  try {
    const output = await fetchJson(`${getApiBaseUrl()}/api/review-session`);
    return parseReviewSessionApiResponse(output);
  } catch (error) {
    return apiFailureFromError(error);
  }
}

export async function saveReviewSessionToApi(state: ReviewSessionState): Promise<ReviewSessionApiResult> {
  const validation = validateReviewSessionState(state, "Review session");

  if (!validation.ok) {
    return {
      status: "error",
      error: validation.error,
    };
  }

  try {
    const output = await fetchJson(`${getApiBaseUrl()}/api/review-session`, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(validation.state),
    });
    return parseReviewSessionApiResponse(output);
  } catch (error) {
    return apiFailureFromError(error);
  }
}

function parseReviewSessionApiResponse(value: unknown): ReviewSessionApiResult {
  const validation = validateReviewSessionState(value, "Review session API response");

  if (!validation.ok) {
    throw new ReviewSessionApiValidationError(validation.error);
  }

  return {
    status: "ready",
    state: validation.state,
    sourceMeta: getSourceMeta(value),
  };
}

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(url, init);

  if (!res.ok) {
    throw new ReviewSessionApiHttpError(`Review session API returned HTTP ${res.status}.`);
  }

  try {
    return await res.json() as unknown;
  } catch {
    throw new ReviewSessionApiValidationError("Review session API response was not valid JSON.");
  }
}

function apiFailureFromError(error: unknown): ReviewSessionApiResult {
  const message = error instanceof Error ? error.message : String(error);

  if (
    error instanceof ReviewSessionApiHttpError
    || error instanceof ReviewSessionApiValidationError
  ) {
    return {
      status: "error",
      error: message,
    };
  }

  return {
    status: "unavailable",
    error: message,
  };
}

function getApiBaseUrl(): string {
  const viteEnv = (import.meta as ViteImportMeta).env;
  return viteEnv?.VITE_SCANNER_API_URL?.replace(/\/$/, "") ?? "";
}

function getSourceMeta(value: unknown): ReviewSessionApiSourceMeta | null {
  if (!isRecord(value) || !isRecord(value._source_meta)) return null;

  const meta = value._source_meta;

  if (
    meta.source_kind !== "file-backed-review-session"
    || typeof meta.storage_file !== "string"
    || typeof meta.loaded_at !== "string"
  ) {
    return null;
  }

  return {
    source_kind: "file-backed-review-session",
    storage_file: meta.storage_file,
    loaded_at: meta.loaded_at,
    ...(typeof meta.warning === "string" ? { warning: meta.warning } : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
