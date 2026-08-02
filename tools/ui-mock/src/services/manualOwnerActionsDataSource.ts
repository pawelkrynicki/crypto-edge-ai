export type ManualVerificationVerdict = "VERIFIED" | "NEEDS_MORE_DATA" | "CRITICAL_RISK" | "REJECT";

export type ManualVerificationRecord = {
  chain: string;
  contract_address: string;
  display_name: string | null;
  symbol: string | null;
  verdict: ManualVerificationVerdict;
  note: string;
  checked_at: string;
  missing_data: string[];
  available_data: string[];
};

export type FollowUpOwnerActionStatus = {
  mode: "DISABLED" | "REVIEW_SAFE" | "ENABLED";
  owner_controls_visible: true;
  owner_actions_enabled: boolean;
  chain: string;
  contract_address: string;
  display_name: string | null;
  symbol: string | null;
  current_layer: "NEW" | "FOLLOW_UP";
  target_layer: "FOLLOW_UP";
  target_exists: boolean;
  readiness_status: "CONDITIONS_MET" | "CONDITIONS_UNMET";
  conditions_met: string[];
  conditions_unmet: string[];
};

export type FollowUpOwnerActionPreview = FollowUpOwnerActionStatus & {
  preview_id: string;
  created_at: string;
  expires_at: string;
  one_time: true;
  action_plan: "ADD" | "NO_ACTION" | "BLOCKED";
  override_required: boolean;
};

export type FollowUpOwnerActionResult = {
  status: "ADDED" | "NO_ACTION_ALREADY_IN_FOLLOW_UP";
  chain: string;
  contract_address: string;
  entry_id: string;
  entries_total: number;
  audit_created: boolean;
};

export type ManualVerificationOwnerStatus = {
  mode: "DISABLED" | "REVIEW_SAFE" | "ENABLED";
  owner_controls_visible: true;
  owner_actions_enabled: boolean;
  chain: string;
  contract_address: string;
  display_name: string | null;
  symbol: string | null;
  current_layer: "NEW" | "FOLLOW_UP" | "ESTABLISHED";
  missing_data: string[];
  available_data: string[];
  current_record: ManualVerificationRecord | null;
};

export type ManualVerificationPreview = ManualVerificationOwnerStatus & {
  preview_id: string;
  created_at: string;
  expires_at: string;
  one_time: true;
  verdict: ManualVerificationVerdict;
  note: string;
  action_plan: "SAVE" | "NO_ACTION";
};

export type ManualVerificationResult = {
  status: "SAVED" | "NO_ACTION_SAME_RESULT";
  record: ManualVerificationRecord;
  audit_created: boolean;
};

export type OwnerMutationConfirmation = {
  identityConfirmation: string;
  ownerReason: string | null;
};

export async function loadFollowUpOwnerActionStatus(
  chain: string,
  contractAddress: string,
): Promise<FollowUpOwnerActionStatus | null> {
  return loadOwnerGet(
    "/api/owner-operations/follow-up-action/status",
    chain,
    contractAddress,
    isFollowUpStatus,
  );
}

export async function loadFollowUpOwnerActionPreview(
  chain: string,
  contractAddress: string,
): Promise<FollowUpOwnerActionPreview | null> {
  return loadOwnerGet(
    "/api/owner-operations/follow-up-action/preview",
    chain,
    contractAddress,
    isFollowUpPreview,
  );
}

export async function addToFollowUp(
  preview: FollowUpOwnerActionPreview,
  confirmation: OwnerMutationConfirmation,
): Promise<FollowUpOwnerActionResult> {
  return ownerPost(
    "/api/owner-operations/follow-up-action",
    preview.preview_id,
    {
      preview_id: preview.preview_id,
      confirmation: true,
      identity_confirmation: confirmation.identityConfirmation,
      owner_reason: confirmation.ownerReason,
    },
    isFollowUpResult,
  );
}

export async function loadManualVerificationOwnerStatus(
  chain: string,
  contractAddress: string,
): Promise<ManualVerificationOwnerStatus | null> {
  return loadOwnerGet(
    "/api/owner-operations/manual-verification/status",
    chain,
    contractAddress,
    isVerificationOwnerStatus,
  );
}

export async function loadManualVerification(
  chain: string,
  contractAddress: string,
): Promise<ManualVerificationRecord | null> {
  if (!chain || !contractAddress) return null;
  try {
    const query = new URLSearchParams({ chain, contract_address: contractAddress });
    const response = await fetch(`/api/manual-verification?${query.toString()}`, {
      method: "GET",
      credentials: "same-origin",
      headers: { accept: "application/json" },
    });
    if (!response.ok) return null;
    const value: unknown = await response.json();
    return isRecord(value)
      && value.schema_version === "manual_verification_lookup_v1"
      && (value.record === null || isManualVerificationRecord(value.record))
      ? value.record
      : null;
  } catch {
    return null;
  }
}

export async function createManualVerificationPreview(input: {
  chain: string;
  contractAddress: string;
  verdict: ManualVerificationVerdict;
  note: string;
}): Promise<ManualVerificationPreview> {
  return ownerPost(
    "/api/owner-operations/manual-verification-preview",
    null,
    {
      chain: input.chain,
      contract_address: input.contractAddress,
      verdict: input.verdict,
      note: input.note,
    },
    isManualVerificationPreview,
  );
}

export async function saveManualVerification(
  preview: ManualVerificationPreview,
  confirmation: OwnerMutationConfirmation,
): Promise<ManualVerificationResult> {
  return ownerPost(
    "/api/owner-operations/manual-verification",
    preview.preview_id,
    {
      preview_id: preview.preview_id,
      confirmation: true,
      identity_confirmation: confirmation.identityConfirmation,
      owner_reason: confirmation.ownerReason,
    },
    isManualVerificationResult,
  );
}

async function loadOwnerGet<T>(
  path: string,
  chain: string,
  contractAddress: string,
  validate: (value: unknown) => value is T,
): Promise<T | null> {
  if (!chain || !contractAddress) return null;
  try {
    const query = new URLSearchParams({ chain, contract_address: contractAddress });
    const response = await fetch(`${path}?${query.toString()}`, {
      method: "GET",
      credentials: "same-origin",
      headers: { accept: "application/json" },
    });
    if (!response.ok) return null;
    const value: unknown = await response.json();
    return validate(value) ? value : null;
  } catch {
    return null;
  }
}

async function ownerPost<T>(
  path: string,
  previewId: string | null,
  body: unknown,
  validate: (value: unknown) => value is T,
): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      ...(previewId ? { "x-crypto-edge-owner-session": previewId } : {}),
    },
    body: JSON.stringify(body),
  });
  const value: unknown = await response.json();
  if (!response.ok || !validate(value)) {
    throw new Error(isRecord(value) && typeof value.error === "string" ? value.error : "OWNER_ACTION_REJECTED");
  }
  return value;
}

function isFollowUpStatus(value: unknown): value is FollowUpOwnerActionStatus {
  return isRecord(value)
    && isOwnerBase(value)
    && (value.current_layer === "NEW" || value.current_layer === "FOLLOW_UP")
    && value.target_layer === "FOLLOW_UP"
    && typeof value.target_exists === "boolean"
    && isReadiness(value);
}

function isFollowUpPreview(value: unknown): value is FollowUpOwnerActionPreview {
  const preview = value as Record<string, unknown>;
  return isFollowUpStatus(value)
    && isPreview(value)
    && ["ADD", "NO_ACTION", "BLOCKED"].includes(String(preview.action_plan))
    && typeof preview.override_required === "boolean";
}

function isFollowUpResult(value: unknown): value is FollowUpOwnerActionResult {
  return isRecord(value)
    && ["ADDED", "NO_ACTION_ALREADY_IN_FOLLOW_UP"].includes(String(value.status))
    && isText(value.chain, 32)
    && isText(value.contract_address, 128)
    && /^fup_[0-9a-f]{16}$/.test(String(value.entry_id))
    && isCount(value.entries_total)
    && typeof value.audit_created === "boolean";
}

function isVerificationOwnerStatus(value: unknown): value is ManualVerificationOwnerStatus {
  return isRecord(value)
    && isOwnerBase(value)
    && ["NEW", "FOLLOW_UP", "ESTABLISHED"].includes(String(value.current_layer))
    && isTextArray(value.missing_data)
    && isTextArray(value.available_data)
    && (value.current_record === null || isManualVerificationRecord(value.current_record));
}

function isManualVerificationPreview(value: unknown): value is ManualVerificationPreview {
  const preview = value as Record<string, unknown>;
  return isVerificationOwnerStatus(value)
    && isPreview(value)
    && isVerdict(preview.verdict)
    && isText(preview.note, 500)
    && (preview.action_plan === "SAVE" || preview.action_plan === "NO_ACTION");
}

function isManualVerificationResult(value: unknown): value is ManualVerificationResult {
  return isRecord(value)
    && (value.status === "SAVED" || value.status === "NO_ACTION_SAME_RESULT")
    && isManualVerificationRecord(value.record)
    && typeof value.audit_created === "boolean";
}

function isManualVerificationRecord(value: unknown): value is ManualVerificationRecord {
  return isRecord(value)
    && isText(value.chain, 32)
    && isText(value.contract_address, 128)
    && (value.display_name === null || isText(value.display_name, 120))
    && (value.symbol === null || isText(value.symbol, 120))
    && isVerdict(value.verdict)
    && isText(value.note, 500)
    && isIso(value.checked_at)
    && isTextArray(value.missing_data)
    && isTextArray(value.available_data);
}

function isOwnerBase(value: Record<string, unknown>): boolean {
  return ["DISABLED", "REVIEW_SAFE", "ENABLED"].includes(String(value.mode))
    && value.owner_controls_visible === true
    && typeof value.owner_actions_enabled === "boolean"
    && isText(value.chain, 32)
    && isText(value.contract_address, 128)
    && (value.display_name === null || isText(value.display_name, 120))
    && (value.symbol === null || isText(value.symbol, 120));
}

function isReadiness(value: Record<string, unknown>): boolean {
  return (value.readiness_status === "CONDITIONS_MET" || value.readiness_status === "CONDITIONS_UNMET")
    && isTextArray(value.conditions_met)
    && isTextArray(value.conditions_unmet);
}

function isPreview(value: Record<string, unknown>): boolean {
  return isText(value.preview_id, 8_192)
    && isIso(value.created_at)
    && isIso(value.expires_at)
    && value.one_time === true;
}

function isVerdict(value: unknown): value is ManualVerificationVerdict {
  return value === "VERIFIED" || value === "NEEDS_MORE_DATA" || value === "CRITICAL_RISK" || value === "REJECT";
}

function isTextArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= 100 && value.every((entry) => isText(entry, 160));
}

function isText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

function isIso(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isCount(value: unknown): boolean {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
