export const FEEDBACK_CATEGORIES = ["BLOCKER", "IMPROVEMENT", "CLARIFICATION", "LATER"] as const;
export const FEEDBACK_STATUSES = ["NEW", "TRIAGED", "PLANNED", "RESOLVED", "CLOSED"] as const;
export type FeedbackCategory = typeof FEEDBACK_CATEGORIES[number];
export type FeedbackStatus = typeof FEEDBACK_STATUSES[number];
export type FeedbackScreenContext =
  | "candidate-results"
  | "candidate-detail"
  | "external-checks"
  | "reports"
  | "methodology"
  | "control-center"
  | "trusted-preview"
  | "feedback";

export type FeedbackSubjectRef = { type: "candidate" | "follow_up" | "report"; id: string };

export type FeedbackPublicStatus = {
  capture_available: boolean;
  feedback_status: "READY" | "PARTIAL" | "NOT_READY";
  submission_enabled: boolean;
  max_title_length: number;
  max_details_length: number;
  supported_categories: FeedbackCategory[];
};

export type FeedbackReceipt = {
  submission_status: "RECORDED" | "ALREADY_RECORDED";
  feedback_id: string;
  created_at: string;
  category: FeedbackCategory;
};

export type OwnerFeedbackStatus = {
  storage_available: boolean;
  feedback_status: "READY" | "PARTIAL" | "NOT_READY";
  total_count: number;
  new_count: number;
  blocker_count: number;
  improvement_count: number;
  clarification_count: number;
  later_count: number;
  latest_feedback_at: string | null;
  oldest_new_feedback_at: string | null;
};

export type OwnerFeedbackListItem = {
  feedback_id: string;
  created_at: string;
  category: FeedbackCategory;
  status: FeedbackStatus;
  title: string;
  screen_context: FeedbackScreenContext;
  locale: "pl" | "en";
  subject_summary: string | null;
  build_sha: string | null;
  viewport_class: "desktop" | "tablet" | "mobile" | null;
};

export type OwnerFeedbackDetail = OwnerFeedbackListItem & {
  updated_at: string;
  details: string;
  candidate_identity: { chain: string; contract_address: string } | null;
  follow_up_entry_id: string | null;
  report_id: string | null;
  scanner_run_id: string | null;
  route_context: FeedbackScreenContext | null;
  session_group: string;
  product_version: string | null;
  runtime_mode: string;
};

export type FeedbackSubmissionPayload = {
  submission_key: string;
  category: FeedbackCategory;
  title: string;
  details: string;
  screen_context: FeedbackScreenContext;
  locale: "pl" | "en";
  subject_ref?: FeedbackSubjectRef;
};

export class FeedbackSubmissionError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(code);
    this.name = "FeedbackSubmissionError";
    this.status = status;
    this.code = code;
  }
}

export async function loadFeedbackStatus(): Promise<FeedbackPublicStatus | null> {
  try {
    const response = await fetch(`${getApiBaseUrl()}/api/feedback/status`, {
      method: "GET",
      headers: { accept: "application/json" },
      credentials: "same-origin",
    });
    if (!response.ok) return null;
    const value = await response.json() as unknown;
    return isFeedbackPublicStatus(value) ? value : null;
  } catch {
    return null;
  }
}

export async function submitFeedback(payload: FeedbackSubmissionPayload): Promise<FeedbackReceipt> {
  const response = await fetch(`${getApiBaseUrl()}/api/feedback`, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "x-crypto-edge-feedback": "1",
    },
    body: JSON.stringify(payload),
  });
  const value = await response.json().catch(() => null) as unknown;
  if (!response.ok || !isFeedbackReceipt(value)) {
    throw new FeedbackSubmissionError(response.status, errorCode(value));
  }
  return value;
}

export async function loadOwnerFeedbackStatus(): Promise<OwnerFeedbackStatus | null> {
  return loadOwnerJson("/api/owner/feedback/status", isOwnerFeedbackStatus);
}

export async function loadOwnerFeedbackList(filters: {
  category?: FeedbackCategory;
  status?: FeedbackStatus;
  screen_context?: FeedbackScreenContext;
} = {}): Promise<OwnerFeedbackListItem[] | null> {
  const params = new URLSearchParams({ limit: "100" });
  if (filters.category) params.set("category", filters.category);
  if (filters.status) params.set("status", filters.status);
  if (filters.screen_context) params.set("screen_context", filters.screen_context);
  const result = await loadOwnerJson(`/api/owner/feedback?${params}`, isOwnerFeedbackListResponse);
  return result?.feedback ?? null;
}

export async function loadOwnerFeedbackDetail(feedbackId: string): Promise<OwnerFeedbackDetail | null> {
  if (!/^fb_[0-9a-f-]{36}$/i.test(feedbackId)) return null;
  return loadOwnerJson(`/api/owner/feedback/${encodeURIComponent(feedbackId)}`, isOwnerFeedbackDetail);
}

export function getOwnerFeedbackExportUrl(format: "json" | "csv"): string {
  return `${getApiBaseUrl()}/api/owner/feedback/export?format=${format}`;
}

async function loadOwnerJson<T>(path: string, validate: (value: unknown) => value is T): Promise<T | null> {
  try {
    const response = await fetch(`${getApiBaseUrl()}${path}`, {
      method: "GET",
      headers: { accept: "application/json" },
      credentials: "same-origin",
    });
    if (!response.ok) return null;
    const value = await response.json() as unknown;
    return validate(value) ? value : null;
  } catch {
    return null;
  }
}

function isFeedbackPublicStatus(value: unknown): value is FeedbackPublicStatus {
  if (!isRecord(value) || Object.keys(value).length !== 6) return false;
  return typeof value.capture_available === "boolean"
    && isReadiness(value.feedback_status)
    && typeof value.submission_enabled === "boolean"
    && value.max_title_length === 120
    && value.max_details_length === 3_000
    && Array.isArray(value.supported_categories)
    && value.supported_categories.every(isCategory);
}

function isFeedbackReceipt(value: unknown): value is FeedbackReceipt {
  return isRecord(value)
    && (value.submission_status === "RECORDED" || value.submission_status === "ALREADY_RECORDED")
    && typeof value.feedback_id === "string"
    && typeof value.created_at === "string"
    && isCategory(value.category);
}

function isOwnerFeedbackStatus(value: unknown): value is OwnerFeedbackStatus {
  return isRecord(value)
    && typeof value.storage_available === "boolean"
    && isReadiness(value.feedback_status)
    && typeof value.total_count === "number"
    && typeof value.new_count === "number"
    && typeof value.blocker_count === "number";
}

function isOwnerFeedbackListResponse(value: unknown): value is { feedback: OwnerFeedbackListItem[]; next_cursor: string | null } {
  return isRecord(value) && Array.isArray(value.feedback) && value.feedback.every(isOwnerFeedbackListItem)
    && (value.next_cursor === null || typeof value.next_cursor === "string");
}

function isOwnerFeedbackListItem(value: unknown): value is OwnerFeedbackListItem {
  return isRecord(value)
    && typeof value.feedback_id === "string"
    && typeof value.created_at === "string"
    && isCategory(value.category)
    && isStatus(value.status)
    && typeof value.title === "string"
    && typeof value.screen_context === "string";
}

function isOwnerFeedbackDetail(value: unknown): value is OwnerFeedbackDetail {
  if (!isOwnerFeedbackListItem(value)) return false;
  const record = value as unknown as Record<string, unknown>;
  return typeof record.details === "string"
    && typeof record.updated_at === "string"
    && typeof record.session_group === "string"
    && typeof record.runtime_mode === "string";
}

function isReadiness(value: unknown): value is FeedbackPublicStatus["feedback_status"] {
  return value === "READY" || value === "PARTIAL" || value === "NOT_READY";
}

function isCategory(value: unknown): value is FeedbackCategory {
  return typeof value === "string" && (FEEDBACK_CATEGORIES as readonly string[]).includes(value);
}

function isStatus(value: unknown): value is FeedbackStatus {
  return typeof value === "string" && (FEEDBACK_STATUSES as readonly string[]).includes(value);
}

function errorCode(value: unknown): string {
  return isRecord(value) && typeof value.error === "string" ? value.error : "feedback_unavailable";
}

function getApiBaseUrl(): string {
  const env = (import.meta as ImportMeta & { env?: { VITE_SCANNER_API_URL?: string } }).env;
  return env?.VITE_SCANNER_API_URL?.replace(/\/$/, "") ?? "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
