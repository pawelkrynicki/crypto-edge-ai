export type OwnerOperationsMode = "DISABLED" | "REVIEW_SAFE" | "ENABLED";
export type OwnerRefreshPlanMode = "scanner_and_context" | "context_only" | "no_action";
export type OwnerActionStatus = "IN_PROGRESS" | "SUCCESS" | "NO_ACTION" | "FAILED" | "RUN_ALREADY_IN_PROGRESS" | null;

export type OwnerOperationsStatus = {
  mode: OwnerOperationsMode;
  owner_controls_visible: boolean;
  owner_actions_enabled: boolean;
  action_in_progress: boolean;
  last_action_status: OwnerActionStatus;
  last_action_started_at: string | null;
  last_action_finished_at: string | null;
  last_action_run_id?: string;
  scanner_due: boolean;
  context_due: boolean;
  next_scanner_due_at: string | null;
  next_context_due_at: string | null;
  automation_enabled: boolean;
  current_scanner_snapshot_timestamp: string | null;
  current_context_snapshot_timestamp: string | null;
  last_known_good_available: boolean;
};

export type OwnerRefreshPreview = {
  preflight_id: string;
  created_at: string;
  expires_at: string;
  scanner_due: boolean;
  context_due: boolean;
  planned_mode: OwnerRefreshPlanMode;
  sources_may_be_called: string[];
  sources_not_called: string[];
  no_action_reason: string | null;
  lock_available: boolean;
  owner_actions_enabled: boolean;
};

export type OwnerRefreshResult = {
  status: Exclude<OwnerActionStatus, "IN_PROGRESS" | null>;
  run_id?: string;
  error_code?: string;
  last_known_good_preserved: boolean;
};

export async function loadOwnerOperationsStatus(): Promise<OwnerOperationsStatus | null> {
  return loadJson("/api/owner-operations/status", isOwnerOperationsStatus);
}

export async function loadOwnerRefreshPreview(): Promise<OwnerRefreshPreview | null> {
  return loadJson("/api/owner-operations/refresh-preview", isOwnerRefreshPreview);
}

export async function runOwnerRefresh(preview: OwnerRefreshPreview): Promise<OwnerRefreshResult> {
  const response = await fetch("/api/owner-operations/refresh", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "x-crypto-edge-owner-session": preview.preflight_id,
    },
    body: JSON.stringify({ preflight_id: preview.preflight_id, confirmation: true }),
  });
  const value = await response.json() as unknown;
  if (!isOwnerRefreshResult(value)) {
    throw new Error(response.ok ? "OWNER_REFRESH_RESPONSE_INVALID" : safeErrorCode(value));
  }
  return value;
}

async function loadJson<T>(path: string, validate: (value: unknown) => value is T): Promise<T | null> {
  try {
    const response = await fetch(path, {
      method: "GET",
      credentials: "same-origin",
      headers: { accept: "application/json" },
    });
    if (!response.ok) return null;
    const value = await response.json() as unknown;
    return validate(value) ? value : null;
  } catch {
    return null;
  }
}

function isOwnerOperationsStatus(value: unknown): value is OwnerOperationsStatus {
  if (!isRecord(value) || !isMode(value.mode)) return false;
  return [
    "owner_controls_visible",
    "owner_actions_enabled",
    "action_in_progress",
    "scanner_due",
    "context_due",
    "automation_enabled",
    "last_known_good_available",
  ].every((key) => typeof value[key] === "boolean")
    && isActionStatus(value.last_action_status)
    && isNullableIso(value.last_action_started_at)
    && isNullableIso(value.last_action_finished_at)
    && (value.last_action_run_id === undefined || isSafeText(value.last_action_run_id))
    && isNullableIso(value.next_scanner_due_at)
    && isNullableIso(value.next_context_due_at)
    && isNullableIso(value.current_scanner_snapshot_timestamp)
    && isNullableIso(value.current_context_snapshot_timestamp);
}

function isOwnerRefreshPreview(value: unknown): value is OwnerRefreshPreview {
  return isRecord(value)
    && typeof value.preflight_id === "string"
    && value.preflight_id.length > 0
    && isIso(value.created_at)
    && isIso(value.expires_at)
    && typeof value.scanner_due === "boolean"
    && typeof value.context_due === "boolean"
    && isPlanMode(value.planned_mode)
    && isStringArray(value.sources_may_be_called)
    && isStringArray(value.sources_not_called)
    && (value.no_action_reason === null || isSafeText(value.no_action_reason))
    && typeof value.lock_available === "boolean"
    && typeof value.owner_actions_enabled === "boolean";
}

function isOwnerRefreshResult(value: unknown): value is OwnerRefreshResult {
  return isRecord(value)
    && ["SUCCESS", "NO_ACTION", "FAILED", "RUN_ALREADY_IN_PROGRESS"].includes(String(value.status))
    && (value.run_id === undefined || isSafeText(value.run_id))
    && (value.error_code === undefined || isSafeText(value.error_code))
    && typeof value.last_known_good_preserved === "boolean";
}

function isMode(value: unknown): value is OwnerOperationsMode {
  return value === "DISABLED" || value === "REVIEW_SAFE" || value === "ENABLED";
}

function isPlanMode(value: unknown): value is OwnerRefreshPlanMode {
  return value === "scanner_and_context" || value === "context_only" || value === "no_action";
}

function isActionStatus(value: unknown): value is OwnerActionStatus {
  return value === null || ["IN_PROGRESS", "SUCCESS", "NO_ACTION", "FAILED", "RUN_ALREADY_IN_PROGRESS"].includes(String(value));
}

function isNullableIso(value: unknown): value is string | null {
  return value === null || isIso(value);
}

function isIso(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isSafeText(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => isSafeText(entry));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeErrorCode(value: unknown): string {
  return isRecord(value) && isSafeText(value.error) ? value.error : "OWNER_REFRESH_REQUEST_REJECTED";
}
