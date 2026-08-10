export type ReviewPublicationStatus = {
  schema_version: "pc1_review_publication_status_v1";
  status: "WAITING" | "PREPARING" | "VALIDATING" | "PUBLISHING" | "PUBLISHED" | "RETRY_WAIT" | "FAILED";
  attempt: number;
  failure_stage: string | null;
  reason_code: string | null;
  next_retry_at: string | null;
  timer_scheduled_at: string | null;
  timer_due_at: string | null;
  timer_fired_at: string | null;
  provider_calls: 0;
  openai_calls: 0;
  canonical_mutations: 0;
};

type ViteImportMeta = ImportMeta & {
  env?: { VITE_SCANNER_API_URL?: string };
};

export async function loadReviewPublicationStatus(): Promise<ReviewPublicationStatus | null> {
  try {
    const response = await fetch(`${getApiBaseUrl()}/api/product/review/publication-status?pc1_review=1`, {
      credentials: "same-origin",
    });
    const value = await response.json() as unknown;
    return response.ok && isReviewPublicationStatus(value) ? value : null;
  } catch {
    return null;
  }
}

function isReviewPublicationStatus(value: unknown): value is ReviewPublicationStatus {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return record.schema_version === "pc1_review_publication_status_v1"
    && ["WAITING", "PREPARING", "VALIDATING", "PUBLISHING", "PUBLISHED", "RETRY_WAIT", "FAILED"].includes(String(record.status))
    && typeof record.attempt === "number"
    && (record.failure_stage === null || typeof record.failure_stage === "string")
    && (record.reason_code === null || typeof record.reason_code === "string")
    && (record.next_retry_at === null || typeof record.next_retry_at === "string")
    && (record.timer_scheduled_at === null || typeof record.timer_scheduled_at === "string")
    && (record.timer_due_at === null || typeof record.timer_due_at === "string")
    && (record.timer_fired_at === null || typeof record.timer_fired_at === "string")
    && record.provider_calls === 0
    && record.openai_calls === 0
    && record.canonical_mutations === 0;
}

function getApiBaseUrl(): string {
  const configured = (import.meta as ViteImportMeta).env?.VITE_SCANNER_API_URL?.trim();
  return configured ? configured.replace(/\/$/, "") : "";
}
