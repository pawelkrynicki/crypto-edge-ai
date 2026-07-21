export type AutomationStatus = {
  enabled: boolean;
  active_run_id: string | null;
  last_result: "SUCCESS" | "FAILED" | null;
  last_error_code: string | null;
  last_attempt_at: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  next_scanner_run_at: string | null;
  next_context_run_at: string | null;
  last_published_scanner_run_id: string | null;
  last_published_context_run_id: string | null;
  request_counts: Record<string, number>;
  scheduler_status: string;
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
    && (status.last_result === null || status.last_result === "SUCCESS" || status.last_result === "FAILED")
    && typeof status.scheduler_status === "string"
    && Boolean(status.request_counts) && typeof status.request_counts === "object";
}

function getApiBaseUrl(): string {
  const env = (import.meta as ImportMeta & { env?: { VITE_SCANNER_API_URL?: string } }).env;
  return env?.VITE_SCANNER_API_URL?.replace(/\/$/, "") ?? "";
}
