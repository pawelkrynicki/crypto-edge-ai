export type AutomationStatus = {
  enabled: boolean;
  active_run_id: string | null;
  last_result: "SUCCESS" | "PARTIAL" | "FAILED" | null;
  last_error_code: string | null;
  last_attempt_at: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  next_run_at: string | null;
  next_due_at: string | null;
  next_scanner_run_at: string | null;
  next_context_run_at: string | null;
  last_published_scanner_run_id: string | null;
  last_published_context_run_id: string | null;
  request_counts: Record<string, number>;
  scheduler_status: string;
  cycle_id?: string | null;
  cycle_status?: "IN_PROGRESS" | "SUCCESS" | "PARTIAL" | "FAILED" | null;
  cycle_duration_ms?: number | null;
  snapshot_generated_at?: string | null;
  snapshot_age_seconds?: number | null;
  records_received?: number;
  records_valid?: number;
  records_rejected?: number;
  new_records?: number;
  follow_up_ingested?: number;
  checkpoints_processed?: number;
  source_statuses?: Record<string, "READY" | "DEGRADED" | "UNAVAILABLE" | "NOT_INVOKED">;
  failure_code?: string | null;
  safe_error?: string | null;
  data_status?: "FRESH" | "STALE" | "PARTIAL" | "LAST_KNOWN_GOOD" | "IN_PROGRESS" | "UNAVAILABLE";
};

export async function loadAutomationStatus(): Promise<AutomationStatus | null> {
  try {
    const response = await fetch(`${getApiBaseUrl()}/api/automation/status`, {
      method: "GET",
      headers: { accept: "application/json" },
    });
    if (!response.ok) return null;
    const value = await response.json() as unknown;
    return isAutomationStatus(value) ? value : null;
  } catch {
    return null;
  }
}

function isAutomationStatus(value: unknown): value is AutomationStatus {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const status = value as Record<string, unknown>;
  return typeof status.enabled === "boolean"
    && (status.active_run_id === null || typeof status.active_run_id === "string")
    && (status.last_result === null || status.last_result === "SUCCESS" || status.last_result === "PARTIAL" || status.last_result === "FAILED")
    && isNullableString(status.next_run_at)
    && isNullableString(status.next_due_at)
    && typeof status.scheduler_status === "string"
    && typeof status.data_status === "string"
    && Boolean(status.request_counts) && typeof status.request_counts === "object" && !Array.isArray(status.request_counts);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function getApiBaseUrl(): string {
  const env = (import.meta as ImportMeta & { env?: { VITE_SCANNER_API_URL?: string } }).env;
  return env?.VITE_SCANNER_API_URL?.replace(/\/$/, "") ?? "";
}
