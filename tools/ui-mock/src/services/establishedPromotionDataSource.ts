export type OwnerOperationsMode = "DISABLED" | "REVIEW_SAFE" | "ENABLED";
export type PromotionEligibilityStatus = "ELIGIBLE" | "BLOCKED" | "NO_ACTION";
export type PromotionActionPlan = "ADD" | "NO_ACTION" | "BLOCKED";

export type EstablishedPromotionStatus = {
  mode: OwnerOperationsMode;
  owner_controls_visible: true;
  owner_actions_enabled: boolean;
  chain: string;
  contract_address: string;
  display_name: string | null;
  symbol: string | null;
  source_layer: "SCANNER" | "FOLLOW_UP" | "SCANNER_AND_FOLLOW_UP";
  lifecycle_status: "NEW" | "MATURING" | "CANDIDATE_FOR_ESTABLISHED" | "ESTABLISHED" | "ARCHIVED";
  eligibility_status: PromotionEligibilityStatus;
  eligibility_reason_codes: string[];
  basic_filter_status: "passed_basic_filter" | "rejected_basic_filter" | "not_checked";
  security_status: string;
  established_membership: "NOT_ESTABLISHED" | "ACTIVE" | "DISABLED";
  current_universe_version: string | null;
  current_universe_checksum: string | null;
  universe_validation_status: "valid" | "invalid" | "unavailable";
};

export type EstablishedPromotionPreview = {
  preview_id: string;
  created_at: string;
  expires_at: string;
  one_time: true;
  eligibility_status: PromotionEligibilityStatus;
  reason_codes: string[];
  chain: string;
  contract_address: string;
  display_name: string | null;
  symbol_hint: string | null;
  current_universe_version: string | null;
  planned_universe_version: string | null;
  current_entries_total: number | null;
  planned_entries_total: number | null;
  current_entries_enabled: number | null;
  planned_entries_enabled: number | null;
  duplicate_status: "NONE" | "ACTIVE_ENTRY_EXISTS" | "DISABLED_ENTRY_EXISTS";
  address_validation_status: "VALID";
  lifecycle_status: EstablishedPromotionStatus["lifecycle_status"];
  basic_filter_status: EstablishedPromotionStatus["basic_filter_status"];
  security_status: string;
  manual_verification_required: boolean;
  action_plan: PromotionActionPlan;
  lock_available: boolean;
  owner_actions_enabled: boolean;
};

export type EstablishedPromotionResult = {
  status: "ADDED" | "NO_ACTION_ALREADY_ESTABLISHED";
  chain: string;
  contract_address: string;
  from_version: string;
  to_version: string;
  entries_total: number;
  entries_enabled: number;
  checksum: string;
  history_created: boolean;
  audit_created: boolean;
};

export async function loadEstablishedPromotionStatus(
  chain: string,
  contractAddress: string,
): Promise<EstablishedPromotionStatus | null> {
  return loadPromotionJson(
    "/api/owner-operations/established-promotion/status",
    chain,
    contractAddress,
    isEstablishedPromotionStatus,
  );
}

export async function loadEstablishedPromotionPreview(
  chain: string,
  contractAddress: string,
): Promise<EstablishedPromotionPreview | null> {
  return loadPromotionJson(
    "/api/owner-operations/established-promotion-preview",
    chain,
    contractAddress,
    isEstablishedPromotionPreview,
  );
}

export async function addToEstablished(
  preview: EstablishedPromotionPreview,
): Promise<EstablishedPromotionResult> {
  const response = await fetch("/api/owner-operations/established-promotion", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "x-crypto-edge-owner-session": preview.preview_id,
    },
    body: JSON.stringify({ preview_id: preview.preview_id, confirmation: true }),
  });
  const value = await response.json() as unknown;
  if (!response.ok || !isEstablishedPromotionResult(value)) {
    throw new Error(safeErrorCode(value));
  }
  return value;
}

async function loadPromotionJson<T>(
  endpoint: string,
  chain: string,
  contractAddress: string,
  validate: (value: unknown) => value is T,
): Promise<T | null> {
  if (!chain || !contractAddress) return null;
  try {
    const query = new URLSearchParams({ chain, contract_address: contractAddress });
    const response = await fetch(`${endpoint}?${query.toString()}`, {
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

function isEstablishedPromotionStatus(value: unknown): value is EstablishedPromotionStatus {
  return isRecord(value)
    && isMode(value.mode)
    && value.owner_controls_visible === true
    && typeof value.owner_actions_enabled === "boolean"
    && isSafeText(value.chain, 32)
    && isSafeText(value.contract_address, 128)
    && isNullableText(value.display_name, 120)
    && isNullableText(value.symbol, 120)
    && ["SCANNER", "FOLLOW_UP", "SCANNER_AND_FOLLOW_UP"].includes(String(value.source_layer))
    && isLifecycle(value.lifecycle_status)
    && isEligibility(value.eligibility_status)
    && isSafeTextArray(value.eligibility_reason_codes)
    && isBasicFilterStatus(value.basic_filter_status)
    && isSafeText(value.security_status, 160)
    && ["NOT_ESTABLISHED", "ACTIVE", "DISABLED"].includes(String(value.established_membership))
    && isNullableText(value.current_universe_version, 128)
    && isNullableText(value.current_universe_checksum, 128)
    && ["valid", "invalid", "unavailable"].includes(String(value.universe_validation_status));
}

function isEstablishedPromotionPreview(value: unknown): value is EstablishedPromotionPreview {
  return isRecord(value)
    && typeof value.preview_id === "string"
    && value.preview_id.length > 0
    && value.preview_id.length <= 8_192
    && isIso(value.created_at)
    && isIso(value.expires_at)
    && value.one_time === true
    && isEligibility(value.eligibility_status)
    && isSafeTextArray(value.reason_codes)
    && isSafeText(value.chain, 32)
    && isSafeText(value.contract_address, 128)
    && isNullableText(value.display_name, 120)
    && isNullableText(value.symbol_hint, 120)
    && isNullableText(value.current_universe_version, 128)
    && isNullableText(value.planned_universe_version, 128)
    && isNullableCount(value.current_entries_total)
    && isNullableCount(value.planned_entries_total)
    && isNullableCount(value.current_entries_enabled)
    && isNullableCount(value.planned_entries_enabled)
    && ["NONE", "ACTIVE_ENTRY_EXISTS", "DISABLED_ENTRY_EXISTS"].includes(String(value.duplicate_status))
    && value.address_validation_status === "VALID"
    && isLifecycle(value.lifecycle_status)
    && isBasicFilterStatus(value.basic_filter_status)
    && isSafeText(value.security_status, 160)
    && typeof value.manual_verification_required === "boolean"
    && ["ADD", "NO_ACTION", "BLOCKED"].includes(String(value.action_plan))
    && typeof value.lock_available === "boolean"
    && typeof value.owner_actions_enabled === "boolean";
}

function isEstablishedPromotionResult(value: unknown): value is EstablishedPromotionResult {
  return isRecord(value)
    && ["ADDED", "NO_ACTION_ALREADY_ESTABLISHED"].includes(String(value.status))
    && isSafeText(value.chain, 32)
    && isSafeText(value.contract_address, 128)
    && isSafeText(value.from_version, 128)
    && isSafeText(value.to_version, 128)
    && isCount(value.entries_total)
    && isCount(value.entries_enabled)
    && isSafeText(value.checksum, 128)
    && typeof value.history_created === "boolean"
    && typeof value.audit_created === "boolean";
}

function isMode(value: unknown): value is OwnerOperationsMode {
  return value === "DISABLED" || value === "REVIEW_SAFE" || value === "ENABLED";
}

function isLifecycle(value: unknown): value is EstablishedPromotionStatus["lifecycle_status"] {
  return value === "NEW" || value === "MATURING" || value === "CANDIDATE_FOR_ESTABLISHED"
    || value === "ESTABLISHED" || value === "ARCHIVED";
}

function isEligibility(value: unknown): value is PromotionEligibilityStatus {
  return value === "ELIGIBLE" || value === "BLOCKED" || value === "NO_ACTION";
}

function isBasicFilterStatus(value: unknown): value is EstablishedPromotionStatus["basic_filter_status"] {
  return value === "passed_basic_filter" || value === "rejected_basic_filter" || value === "not_checked";
}

function isNullableText(value: unknown, limit: number): value is string | null {
  return value === null || isSafeText(value, limit);
}

function isSafeText(value: unknown, limit: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= limit && !/[\u0000-\u001f]/.test(value);
}

function isSafeTextArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= 32 && value.every((entry) => isSafeText(entry, 160));
}

function isNullableCount(value: unknown): value is number | null {
  return value === null || isCount(value);
}

function isCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function isIso(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeErrorCode(value: unknown): string {
  return isRecord(value) && isSafeText(value.error, 128) ? value.error : "PROMOTION_REQUEST_REJECTED";
}
