import type {
  FollowUpLifecycleStatus,
  FollowUpPublicEntry,
  FollowUpPublicList,
  FollowUpPublicStatus,
} from "../types/followUpTypes";

const LIFECYCLE = new Set<FollowUpLifecycleStatus>([
  "NEW", "MATURING", "CANDIDATE_FOR_ESTABLISHED", "ESTABLISHED", "ARCHIVED",
]);

export async function loadFollowUpStatus(): Promise<FollowUpPublicStatus | null> {
  return loadJson("/api/follow-up/status", isFollowUpStatus);
}

export async function loadFollowUpList(): Promise<FollowUpPublicList | null> {
  return loadJson("/api/follow-up", isFollowUpList);
}

async function loadJson<T>(path: string, validate: (value: unknown) => value is T): Promise<T | null> {
  try {
    const response = await fetch(`${getApiBaseUrl()}${path}`, { method: "GET", headers: { accept: "application/json" } });
    if (!response.ok) return null;
    const value = await response.json() as unknown;
    return validate(value) ? value : null;
  } catch {
    return null;
  }
}

function isFollowUpStatus(value: unknown): value is FollowUpPublicStatus {
  if (!isRecord(value) || value.schema_version !== "follow_up_status_v1") return false;
  if (typeof value.store_available !== "boolean" || !isValidationStatus(value.validation_status)) return false;
  return [
    "entries_total", "new_count", "maturing_count", "candidate_count", "established_count", "archived_count", "due_count",
  ].every((field) => isCount(value[field]))
    && isNullableIso(value.next_due_at)
    && isNullableIso(value.last_updated_at);
}

function isFollowUpList(value: unknown): value is FollowUpPublicList {
  return isRecord(value)
    && value.schema_version === "follow_up_list_v1"
    && isValidationStatus(value.validation_status)
    && Array.isArray(value.entries)
    && value.entries.length <= 100
    && value.entries.every(isFollowUpEntry);
}

function isFollowUpEntry(value: unknown): value is FollowUpPublicEntry {
  if (!isRecord(value) || typeof value.entry_id !== "string" || !/^fup_[0-9a-f]{16}$/.test(value.entry_id)) return false;
  if (typeof value.chain !== "string" || typeof value.contract_address !== "string" || !LIFECYCLE.has(value.lifecycle_status as FollowUpLifecycleStatus)) return false;
  if (!isNullableString(value.display_name) || !isNullableString(value.symbol) || !isNullableNumber(value.pair_age)) return false;
  if (!isIso(value.first_seen_at) || !isIso(value.last_seen_at) || !isNullableIso(value.last_checked_at) || !isNullableIso(value.next_check_at)) return false;
  if (!Array.isArray(value.completed_checkpoints) || value.completed_checkpoints.some((day) => ![1, 3, 7, 14, 30].includes(Number(day)))) return false;
  if (!isRecord(value.market_metrics) || Object.values(value.market_metrics).some((metric) => !isNullableNumber(metric))) return false;
  return ["passed_basic_filter", "rejected_basic_filter", "not_checked"].includes(String(value.filter_status))
    && Array.isArray(value.filter_reasons) && value.filter_reasons.every((reason) => typeof reason === "string")
    && typeof value.security_status === "string"
    && Array.isArray(value.missing_data) && value.missing_data.every((reason) => typeof reason === "string")
    && typeof value.established_membership === "boolean"
    && ["WAIT_FOR_NEXT_CHECKPOINT", "OWNER_DECISION_REQUIRED", "ESTABLISHED_MONITORING", "FOLLOW_UP_COMPLETE"].includes(String(value.next_review_step));
}

function isValidationStatus(value: unknown): value is FollowUpPublicStatus["validation_status"] {
  return ["valid", "recovered", "invalid", "unavailable"].includes(String(value));
}

function isCount(value: unknown): boolean {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function isIso(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isNullableIso(value: unknown): value is string | null {
  return value === null || isIso(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getApiBaseUrl(): string {
  const env = (import.meta as ImportMeta & { env?: { VITE_SCANNER_API_URL?: string } }).env;
  return env?.VITE_SCANNER_API_URL?.replace(/\/$/, "") ?? "";
}
