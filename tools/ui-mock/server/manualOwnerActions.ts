import { createHash } from "node:crypto";
import {
  FOLLOW_UP_ENTRY_LIMIT,
  findLatestManualVerification,
  followUpIdentity,
  ingestFollowUpObservations,
  inspectFollowUpStore,
  recordManualVerification,
  updateFollowUpStore,
  type FollowUpEntry,
  type FollowUpOwnerDecisionAudit,
  type FollowUpStore,
  type ManualVerificationRecord,
  type ManualVerificationVerdict,
} from "../../data-poc/src/followUpBasket.js";
import {
  universeIdentityKey,
  type SupportedEstablishedChain,
} from "../../data-poc/src/establishedAddressUniverse.js";
import type {
  PersistableCandidate,
  PersistableSecurityCheck,
} from "../../data-poc/src/persistableScannerModel.js";
import { readLatestScannerOutput, type LatestScannerOutputOptions } from "./latestScannerOutput.js";
import { resolveOwnerOperationsMode, type OwnerOperationsMode } from "./ownerOperations.js";
import {
  createSignedOwnerPreflight,
  createOwnerSessionSecret,
  normalizeOwnerPreflightTtl,
  OwnerPreflightError,
  pruneConsumedOwnerPreflights,
  verifySignedOwnerPreflight,
} from "./ownerPreflight.js";

export type OwnerConditionStatus = "CONDITIONS_MET" | "CONDITIONS_UNMET";

export type FollowUpOwnerActionStatus = {
  mode: OwnerOperationsMode;
  owner_controls_visible: true;
  owner_actions_enabled: boolean;
  chain: SupportedEstablishedChain;
  contract_address: string;
  display_name: string | null;
  symbol: string | null;
  current_layer: "NEW" | "FOLLOW_UP";
  target_layer: "FOLLOW_UP";
  target_exists: boolean;
  readiness_status: OwnerConditionStatus;
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
  chain: SupportedEstablishedChain;
  contract_address: string;
  entry_id: string;
  entries_total: number;
  audit_created: boolean;
};

export type ManualVerificationOwnerStatus = {
  mode: OwnerOperationsMode;
  owner_controls_visible: true;
  owner_actions_enabled: boolean;
  chain: SupportedEstablishedChain;
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
  confirmation: true;
  identity_confirmation: string;
  owner_reason: string | null;
};

export type ManualOwnerActionsOptions = {
  mode?: OwnerOperationsMode | string;
  sessionSecret?: string;
  now?: () => Date;
  preflightTtlMs?: number;
  storePath?: string;
  scanner?: LatestScannerOutputOptions;
  readScanner?: () => Promise<Awaited<ReturnType<typeof readLatestScannerOutput>>>;
};

type ProductEvaluation = {
  identity: ReturnType<typeof followUpIdentity>;
  candidate: PersistableCandidate | null;
  followUp: FollowUpEntry | null;
  security: PersistableSecurityCheck | null;
  store: FollowUpStore;
  manualVerification: ManualVerificationRecord | null;
  displayName: string | null;
  symbol: string | null;
  sourceRunId: string;
  currentLayer: "NEW" | "FOLLOW_UP" | "ESTABLISHED";
  conditionsMet: string[];
  conditionsUnmet: string[];
  availableData: string[];
  missingData: string[];
  fingerprint: string;
};

type FollowUpPreflightContext = {
  action: "ADD_TO_FOLLOW_UP";
  chain: SupportedEstablishedChain;
  contract_address: string;
  expected_store_checksum: string;
  evaluation_fingerprint: string;
};

type VerificationPreflightContext = {
  action: "SAVE_MANUAL_VERIFICATION";
  chain: SupportedEstablishedChain;
  contract_address: string;
  expected_store_checksum: string;
  evaluation_fingerprint: string;
  verdict: ManualVerificationVerdict;
  note: string;
};

export class ManualOwnerActionError extends Error {
  readonly code: string;
  readonly httpStatus: number;

  constructor(code: string, httpStatus: number) {
    super(code);
    this.name = "ManualOwnerActionError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export function createManualOwnerActionsService(options: ManualOwnerActionsOptions = {}) {
  const mode = resolveOwnerOperationsMode(options.mode ?? process.env.CRYPTO_EDGE_OWNER_OPERATIONS_MODE);
  const now = options.now ?? (() => new Date());
  const ttlMs = normalizeOwnerPreflightTtl(options.preflightTtlMs);
  const sessionSecret = mode === "DISABLED"
    ? null
    : normalizeSessionSecret(options.sessionSecret) ?? createOwnerSessionSecret(undefined);
  const consumedPreflights = new Map<string, number>();

  async function getFollowUpStatus(
    chain: string,
    contractAddress: string,
    localOwnerRequest: boolean,
  ): Promise<FollowUpOwnerActionStatus> {
    requireVisible(localOwnerRequest);
    return followUpStatus(await evaluate(chain, contractAddress), mode);
  }

  async function createFollowUpPreview(
    chain: string,
    contractAddress: string,
    localOwnerRequest: boolean,
  ): Promise<FollowUpOwnerActionPreview> {
    requireVisible(localOwnerRequest);
    const evaluation = await evaluate(chain, contractAddress);
    const status = followUpStatus(evaluation, mode);
    const actionPlan = evaluation.followUp
      ? "NO_ACTION" as const
      : evaluation.store.entries.length >= FOLLOW_UP_ENTRY_LIMIT
        ? "BLOCKED" as const
        : "ADD" as const;
    const context: FollowUpPreflightContext = {
      action: "ADD_TO_FOLLOW_UP",
      chain: evaluation.identity.chain,
      contract_address: evaluation.identity.contract_address,
      expected_store_checksum: evaluation.store.checksum,
      evaluation_fingerprint: evaluation.fingerprint,
    };
    const signed = createSignedOwnerPreflight({
      secret: requireSessionSecret(),
      fingerprint: evaluation.fingerprint,
      context,
      now: now(),
      ttlMs,
    });
    return {
      ...status,
      preview_id: signed.preflightId,
      created_at: signed.payload.created_at,
      expires_at: signed.payload.expires_at,
      one_time: true,
      action_plan: actionPlan,
      override_required: actionPlan === "ADD" && evaluation.conditionsUnmet.length > 0,
    };
  }

  async function addToFollowUp(
    previewId: string,
    ownerSessionHeader: string,
    confirmation: OwnerMutationConfirmation,
    localOwnerRequest: boolean,
  ): Promise<FollowUpOwnerActionResult> {
    requireEnabled(localOwnerRequest);
    const payload = verifyPreflight(previewId, ownerSessionHeader, isFollowUpPreflightContext);
    const evaluation = await evaluate(payload.context.chain, payload.context.contract_address);
    assertFreshEvaluation(payload, evaluation);
    assertIdentityConfirmation(evaluation, confirmation.identity_confirmation);
    if (evaluation.followUp) return noActionFollowUp(evaluation);
    if (evaluation.store.entries.length >= FOLLOW_UP_ENTRY_LIMIT) {
      throw new ManualOwnerActionError("FOLLOW_UP_CAPACITY_REACHED", 409);
    }
    const ownerReason = normalizeOwnerReason(confirmation.owner_reason, evaluation.conditionsUnmet.length > 0);
    const candidate = evaluation.candidate;
    if (!candidate) throw new ManualOwnerActionError("SCANNER_CANDIDATE_REQUIRED", 409);
    const ownerDecision = decisionAudit(
      evaluation,
      "NEW",
      "FOLLOW_UP",
      ownerReason,
    );
    let updated: FollowUpStore;
    try {
      updated = await updateFollowUpStore((store) => {
        if (store.checksum !== payload.context.expected_store_checksum) {
          throw new ManualOwnerActionError("STALE_PREVIEW", 409);
        }
        return ingestFollowUpObservations(
          store,
          [candidate],
          now().toISOString(),
          candidate.run_id,
          null,
          "OWNER_MANUAL_INGEST",
          ownerDecision,
        );
      }, { storePath: options.storePath, now: now() });
    } catch (error) {
      if (error instanceof ManualOwnerActionError) throw error;
      throw new ManualOwnerActionError(safeErrorCode(error, "FOLLOW_UP_WRITE_FAILED"), 500);
    }
    const entry = updated.entries.find((item) => item.entry_id === evaluation.identity.entry_id);
    if (!entry) throw new ManualOwnerActionError("FOLLOW_UP_WRITE_FAILED", 500);
    return {
      status: "ADDED",
      chain: evaluation.identity.chain,
      contract_address: evaluation.identity.contract_address,
      entry_id: entry.entry_id,
      entries_total: updated.entries.length,
      audit_created: true,
    };
  }

  async function getVerificationStatus(
    chain: string,
    contractAddress: string,
    localOwnerRequest: boolean,
  ): Promise<ManualVerificationOwnerStatus> {
    requireVisible(localOwnerRequest);
    return verificationStatus(await evaluate(chain, contractAddress), mode);
  }

  async function getPublicVerification(
    chain: string,
    contractAddress: string,
  ): Promise<ManualVerificationRecord | null> {
    const diagnostics = await inspectFollowUpStore(options.storePath);
    if (!diagnostics.store_available) return null;
    try {
      return findLatestManualVerification(diagnostics.store, chain, contractAddress);
    } catch {
      return null;
    }
  }

  async function createVerificationPreview(
    chain: string,
    contractAddress: string,
    verdict: ManualVerificationVerdict,
    note: string,
    localOwnerRequest: boolean,
  ): Promise<ManualVerificationPreview> {
    requireVisible(localOwnerRequest);
    const normalizedNote = normalizeVerificationNote(note);
    if (!isManualVerificationVerdict(verdict)) throw new ManualOwnerActionError("VERIFICATION_VERDICT_INVALID", 400);
    const evaluation = await evaluate(chain, contractAddress);
    const existing = evaluation.manualVerification;
    const same = Boolean(existing
      && existing.verdict === verdict
      && existing.note === normalizedNote);
    const context: VerificationPreflightContext = {
      action: "SAVE_MANUAL_VERIFICATION",
      chain: evaluation.identity.chain,
      contract_address: evaluation.identity.contract_address,
      expected_store_checksum: evaluation.store.checksum,
      evaluation_fingerprint: evaluation.fingerprint,
      verdict,
      note: normalizedNote,
    };
    const fingerprint = hash({ ...context, same });
    const signed = createSignedOwnerPreflight({
      secret: requireSessionSecret(),
      fingerprint,
      context,
      now: now(),
      ttlMs,
    });
    return {
      ...verificationStatus(evaluation, mode),
      preview_id: signed.preflightId,
      created_at: signed.payload.created_at,
      expires_at: signed.payload.expires_at,
      one_time: true,
      verdict,
      note: normalizedNote,
      action_plan: same ? "NO_ACTION" : "SAVE",
    };
  }

  async function saveVerification(
    previewId: string,
    ownerSessionHeader: string,
    confirmation: OwnerMutationConfirmation,
    localOwnerRequest: boolean,
  ): Promise<ManualVerificationResult> {
    requireEnabled(localOwnerRequest);
    const payload = verifyPreflight(previewId, ownerSessionHeader, isVerificationPreflightContext);
    const evaluation = await evaluate(payload.context.chain, payload.context.contract_address);
    if (payload.context.expected_store_checksum !== evaluation.store.checksum
      || payload.context.evaluation_fingerprint !== evaluation.fingerprint) {
      throw new ManualOwnerActionError("STALE_PREVIEW", 409);
    }
    assertIdentityConfirmation(evaluation, confirmation.identity_confirmation);
    const record: ManualVerificationRecord = {
      chain: evaluation.identity.chain,
      contract_address: evaluation.identity.contract_address,
      display_name: evaluation.displayName,
      symbol: evaluation.symbol,
      verdict: payload.context.verdict,
      note: payload.context.note,
      checked_at: now().toISOString(),
      missing_data: [...evaluation.missingData],
      available_data: [...evaluation.availableData],
    };
    const existing = evaluation.manualVerification;
    if (existing
      && existing.verdict === record.verdict
      && existing.note === record.note) {
      return { status: "NO_ACTION_SAME_RESULT", record: existing, audit_created: false };
    }
    const ownerReason = normalizeOwnerReason(confirmation.owner_reason ?? payload.context.note, true);
    let updated: FollowUpStore;
    try {
      updated = await updateFollowUpStore((store) => {
        if (store.checksum !== payload.context.expected_store_checksum) {
          throw new ManualOwnerActionError("STALE_PREVIEW", 409);
        }
        return recordManualVerification(
          store,
          record,
          evaluation.sourceRunId,
          decisionAudit(evaluation, evaluation.currentLayer, evaluation.currentLayer, ownerReason),
        );
      }, { storePath: options.storePath, now: now() });
    } catch (error) {
      if (error instanceof ManualOwnerActionError) throw error;
      throw new ManualOwnerActionError(safeErrorCode(error, "VERIFICATION_WRITE_FAILED"), 500);
    }
    const saved = findLatestManualVerification(
      updated,
      evaluation.identity.chain,
      evaluation.identity.contract_address,
    );
    if (!saved) throw new ManualOwnerActionError("VERIFICATION_WRITE_FAILED", 500);
    return { status: "SAVED", record: saved, audit_created: true };
  }

  async function evaluate(chain: string, contractAddress: string): Promise<ProductEvaluation> {
    let identity;
    try {
      identity = followUpIdentity(chain, contractAddress);
    } catch {
      throw new ManualOwnerActionError("TOKEN_IDENTITY_INVALID", 400);
    }
    const [scanner, diagnostics] = await Promise.all([
      (options.readScanner ?? (() => readLatestScannerOutput(options.scanner)))().catch(() => null),
      inspectFollowUpStore(options.storePath),
    ]);
    if (!diagnostics.store_available) throw new ManualOwnerActionError(diagnostics.reason_code, 503);
    const key = identity.identity;
    const candidate = (scanner?.candidates as PersistableCandidate[] | undefined)?.find((item) => (
      item.contract_address !== null && sameIdentity(key, item.chain, item.contract_address)
    )) ?? null;
    const followUp = diagnostics.store.entries.find((item) => (
      universeIdentityKey(item.chain, item.contract_address) === key
    )) ?? null;
    if (!candidate && !followUp) throw new ManualOwnerActionError("PRODUCT_RECORD_NOT_FOUND", 404);
    const security = candidate
      ? (scanner?.security_checks as PersistableSecurityCheck[] | undefined)?.find((item) => item.candidate_id === candidate.candidate_id) ?? null
      : null;
    const manualVerification = findLatestManualVerification(
      diagnostics.store,
      identity.chain,
      identity.contract_address,
    );
    const missingData = resolveMissingData(candidate, followUp, security);
    const availableData = resolveAvailableData(candidate, followUp, security);
    const conditionsMet: string[] = ["IDENTITY_VALID", "PRODUCT_RECORD_AVAILABLE"];
    const conditionsUnmet: string[] = [];
    if ((candidate?.basic_filter_status ?? followUp?.latest_filter_result?.status) === "passed_basic_filter") {
      conditionsMet.push("BASIC_FILTERS_PASSED");
    } else {
      conditionsUnmet.push("BASIC_FILTERS_NOT_MET");
    }
    const liquidity = candidate?.liquidity_usd ?? followUp?.last_valid_market_snapshot?.liquidity_usd ?? null;
    if (liquidity !== null && liquidity >= 30_000) conditionsMet.push("LIQUIDITY_THRESHOLD_MET");
    else conditionsUnmet.push(liquidity === null ? "LIQUIDITY_MISSING" : "LIQUIDITY_TOO_LOW");
    if (security || followUp?.latest_security_status.status === "CHECKED") conditionsMet.push("SECURITY_DATA_AVAILABLE");
    else conditionsUnmet.push("SECURITY_MISSING");
    if (missingData.length === 0) conditionsMet.push("REQUIRED_DATA_AVAILABLE");
    else conditionsUnmet.push("REQUIRED_DATA_MISSING");
    if (manualVerification?.verdict === "VERIFIED") conditionsMet.push("MANUAL_VERIFICATION_COMPLETED");
    else conditionsUnmet.push("MANUAL_VERIFICATION_MISSING");
    const currentLayer = followUp?.lifecycle_status === "ESTABLISHED"
      ? "ESTABLISHED" as const
      : followUp ? "FOLLOW_UP" as const : "NEW" as const;
    const sourceRunId = followUp?.source_run_id ?? candidate?.run_id ?? "owner_manual_action";
    const displayName = followUp?.display_name ?? candidate?.name ?? null;
    const symbol = followUp?.symbol_hint ?? candidate?.symbol ?? null;
    const fingerprint = hash({
      chain: identity.chain,
      contract_address: identity.contract_address,
      store_checksum: diagnostics.store.checksum,
      candidate_run_id: candidate?.run_id ?? null,
      follow_up_entry_id: followUp?.entry_id ?? null,
      follow_up_status: followUp?.lifecycle_status ?? null,
      manual_verification: manualVerification,
      conditions_met: conditionsMet,
      conditions_unmet: conditionsUnmet,
    });
    return {
      identity,
      candidate,
      followUp,
      security,
      store: diagnostics.store,
      manualVerification,
      displayName,
      symbol,
      sourceRunId,
      currentLayer,
      conditionsMet,
      conditionsUnmet,
      availableData,
      missingData,
      fingerprint,
    };
  }

  function requireVisible(localOwnerRequest: boolean): void {
    if (!localOwnerRequest || mode === "DISABLED" || sessionSecret === null) {
      throw new ManualOwnerActionError("OWNER_OPERATIONS_UNAVAILABLE", 404);
    }
  }

  function requireEnabled(localOwnerRequest: boolean): void {
    requireVisible(localOwnerRequest);
    if (mode !== "ENABLED") throw new ManualOwnerActionError("OWNER_ACTIONS_DISABLED", 403);
  }

  function requireSessionSecret(): string {
    if (!sessionSecret) throw new ManualOwnerActionError("OWNER_OPERATIONS_UNAVAILABLE", 404);
    return sessionSecret;
  }

  function verifyPreflight<T>(
    previewId: string,
    ownerSessionHeader: string,
    validateContext: (value: unknown) => value is T,
  ) {
    if (ownerSessionHeader !== previewId) throw new ManualOwnerActionError("OWNER_SESSION_INVALID", 403);
    let payload;
    try {
      payload = verifySignedOwnerPreflight(previewId, requireSessionSecret(), validateContext);
    } catch (error) {
      if (error instanceof OwnerPreflightError) throw new ManualOwnerActionError(error.code, 400);
      throw error;
    }
    const currentTime = now().getTime();
    if (Date.parse(payload.expires_at) <= currentTime) throw new ManualOwnerActionError("STALE_PREVIEW", 409);
    pruneConsumedOwnerPreflights(consumedPreflights, currentTime);
    if (consumedPreflights.has(previewId)) throw new ManualOwnerActionError("PREFLIGHT_ALREADY_USED", 409);
    consumedPreflights.set(previewId, Date.parse(payload.expires_at));
    return payload;
  }

  return {
    getFollowUpStatus,
    createFollowUpPreview,
    addToFollowUp,
    getVerificationStatus,
    getPublicVerification,
    createVerificationPreview,
    saveVerification,
  };
}

function followUpStatus(evaluation: ProductEvaluation, mode: OwnerOperationsMode): FollowUpOwnerActionStatus {
  return {
    mode,
    owner_controls_visible: true,
    owner_actions_enabled: mode === "ENABLED",
    chain: evaluation.identity.chain,
    contract_address: evaluation.identity.contract_address,
    display_name: evaluation.displayName,
    symbol: evaluation.symbol,
    current_layer: evaluation.followUp ? "FOLLOW_UP" : "NEW",
    target_layer: "FOLLOW_UP",
    target_exists: evaluation.followUp !== null,
    readiness_status: evaluation.conditionsUnmet.length === 0 ? "CONDITIONS_MET" : "CONDITIONS_UNMET",
    conditions_met: [...evaluation.conditionsMet],
    conditions_unmet: [...evaluation.conditionsUnmet],
  };
}

function verificationStatus(evaluation: ProductEvaluation, mode: OwnerOperationsMode): ManualVerificationOwnerStatus {
  return {
    mode,
    owner_controls_visible: true,
    owner_actions_enabled: mode === "ENABLED",
    chain: evaluation.identity.chain,
    contract_address: evaluation.identity.contract_address,
    display_name: evaluation.displayName,
    symbol: evaluation.symbol,
    current_layer: evaluation.currentLayer,
    missing_data: [...evaluation.missingData],
    available_data: [...evaluation.availableData],
    current_record: evaluation.manualVerification,
  };
}

function decisionAudit(
  evaluation: ProductEvaluation,
  previousLayer: "NEW" | "FOLLOW_UP" | "ESTABLISHED",
  newLayer: "NEW" | "FOLLOW_UP" | "ESTABLISHED",
  ownerReason: string | null,
): FollowUpOwnerDecisionAudit {
  return {
    actor: "owner",
    previous_layer: previousLayer,
    new_layer: newLayer,
    chain: evaluation.identity.chain,
    contract_address: evaluation.identity.contract_address,
    conditions_met: [...evaluation.conditionsMet],
    conditions_unmet: [...evaluation.conditionsUnmet],
    owner_reason: ownerReason,
  };
}

function noActionFollowUp(evaluation: ProductEvaluation): FollowUpOwnerActionResult {
  if (!evaluation.followUp) throw new ManualOwnerActionError("FOLLOW_UP_ENTRY_NOT_FOUND", 404);
  return {
    status: "NO_ACTION_ALREADY_IN_FOLLOW_UP",
    chain: evaluation.identity.chain,
    contract_address: evaluation.identity.contract_address,
    entry_id: evaluation.followUp.entry_id,
    entries_total: evaluation.store.entries.length,
    audit_created: false,
  };
}

function assertFreshEvaluation(
  payload: { fingerprint: string; context: FollowUpPreflightContext },
  evaluation: ProductEvaluation,
): void {
  if (payload.fingerprint !== evaluation.fingerprint
    || payload.context.evaluation_fingerprint !== evaluation.fingerprint
    || payload.context.expected_store_checksum !== evaluation.store.checksum) {
    throw new ManualOwnerActionError("STALE_PREVIEW", 409);
  }
}

function assertIdentityConfirmation(evaluation: ProductEvaluation, value: string): void {
  const expected = `${evaluation.identity.chain}:${evaluation.identity.contract_address}`;
  if (value !== expected) throw new ManualOwnerActionError("TOKEN_IDENTITY_CONFIRMATION_REQUIRED", 400);
}

function normalizeOwnerReason(value: string | null, required: boolean): string | null {
  if (value === null || value.trim() === "") {
    if (required) throw new ManualOwnerActionError("OWNER_REASON_REQUIRED", 400);
    return null;
  }
  if (value.trim() !== value || value.length < 3 || value.length > 500) {
    throw new ManualOwnerActionError("OWNER_REASON_INVALID", 400);
  }
  return value;
}

function normalizeVerificationNote(value: string): string {
  if (typeof value !== "string" || value.trim() !== value || value.length < 3 || value.length > 500) {
    throw new ManualOwnerActionError("VERIFICATION_NOTE_REQUIRED", 400);
  }
  return value;
}

function resolveMissingData(
  candidate: PersistableCandidate | null,
  followUp: FollowUpEntry | null,
  security: PersistableSecurityCheck | null,
): string[] {
  const values = new Set<string>();
  for (const reason of followUp?.latest_security_status.missing_data ?? security?.missing_data ?? ["security_not_checked"]) {
    values.add(reason);
  }
  const market = followUp?.last_valid_market_snapshot;
  if ((candidate?.liquidity_usd ?? market?.liquidity_usd ?? null) === null) values.add("liquidity_missing");
  if ((candidate?.market_cap_usd ?? market?.market_cap_usd ?? null) === null) values.add("market_cap_missing");
  if ((candidate?.volume_24h_usd ?? market?.volume_24h_usd ?? null) === null) values.add("volume_24h_missing");
  return [...values].sort();
}

function resolveAvailableData(
  candidate: PersistableCandidate | null,
  followUp: FollowUpEntry | null,
  security: PersistableSecurityCheck | null,
): string[] {
  const values = new Set<string>(["chain", "contract_address"]);
  const market = followUp?.last_valid_market_snapshot;
  if (candidate?.symbol || followUp?.symbol_hint) values.add("symbol");
  if (candidate?.name || followUp?.display_name) values.add("display_name");
  if ((candidate?.liquidity_usd ?? market?.liquidity_usd ?? null) !== null) values.add("liquidity");
  if ((candidate?.market_cap_usd ?? market?.market_cap_usd ?? null) !== null) values.add("market_cap");
  if ((candidate?.volume_24h_usd ?? market?.volume_24h_usd ?? null) !== null) values.add("volume_24h");
  if (security || followUp?.latest_security_status.status === "CHECKED") values.add("security_data");
  return [...values].sort();
}

function isFollowUpPreflightContext(value: unknown): value is FollowUpPreflightContext {
  return isPreflightContext(value, "ADD_TO_FOLLOW_UP")
    && typeof value.evaluation_fingerprint === "string";
}

function isVerificationPreflightContext(value: unknown): value is VerificationPreflightContext {
  return isPreflightContext(value, "SAVE_MANUAL_VERIFICATION")
    && isManualVerificationVerdict(value.verdict)
    && typeof value.note === "string"
    && value.note.length >= 3
    && value.note.length <= 500;
}

function isPreflightContext(value: unknown, action: string): value is Record<string, unknown> & {
  action: string;
  chain: SupportedEstablishedChain;
  contract_address: string;
  expected_store_checksum: string;
  evaluation_fingerprint: string;
} {
  if (!isRecord(value) || value.action !== action) return false;
  try {
    const identity = followUpIdentity(String(value.chain ?? ""), String(value.contract_address ?? ""));
    return value.chain === identity.chain
      && value.contract_address === identity.contract_address
      && typeof value.expected_store_checksum === "string"
      && value.expected_store_checksum.startsWith("sha256:")
      && typeof value.evaluation_fingerprint === "string"
      && /^[A-Za-z0-9_-]{43}$/.test(value.evaluation_fingerprint);
  } catch {
    return false;
  }
}

function sameIdentity(expected: string, chain: string, contractAddress: string): boolean {
  try {
    return followUpIdentity(chain, contractAddress).identity === expected;
  } catch {
    return false;
  }
}

function isManualVerificationVerdict(value: unknown): value is ManualVerificationVerdict {
  return value === "VERIFIED" || value === "NEEDS_MORE_DATA" || value === "CRITICAL_RISK" || value === "REJECT";
}

function normalizeSessionSecret(value: string | undefined): string | null {
  return typeof value === "string" && value.length >= 32 && value.length <= 256 ? value : null;
}

function hash(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("base64url");
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function safeErrorCode(error: unknown, fallback: string): string {
  if (error instanceof ManualOwnerActionError) return error.code;
  const raw = error instanceof Error ? error.message : String(error);
  const code = raw.toUpperCase().replace(/[^A-Z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 96);
  return code || fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
