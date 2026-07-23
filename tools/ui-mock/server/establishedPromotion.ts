import { createHash, randomBytes } from "node:crypto";
import { access } from "node:fs/promises";
import {
  getDefaultEstablishedUniverseStorePath,
  normalizeEstablishedAddress,
  normalizeEstablishedChain,
  universeIdentityKey,
  type SupportedEstablishedChain,
} from "../../data-poc/src/establishedAddressUniverse.js";
import {
  mutateEstablishedUniverse,
  readEstablishedUniverseStore,
  type EstablishedUniverseStore,
  type UniverseMutationOptions,
  type UniverseMutationResult,
} from "../../data-poc/src/establishedUniverseManager.js";
import {
  inspectFollowUpStore,
  resolveFollowUpStatusAt,
  type FollowUpEntry,
  type FollowUpLifecycleStatus,
} from "../../data-poc/src/followUpBasket.js";
import type { PersistableCandidate, PersistableSecurityCheck } from "../../data-poc/src/persistableScannerModel.js";
import { readLatestScannerOutput, type LatestScannerOutputOptions } from "./latestScannerOutput.js";
import type { FollowUpApiOptions } from "./followUpApi.js";
import { resolveOwnerOperationsMode, type OwnerOperationsMode } from "./ownerOperations.js";
import {
  createSignedOwnerPreflight,
  normalizeOwnerPreflightTtl,
  OwnerPreflightError,
  pruneConsumedOwnerPreflights,
  verifySignedOwnerPreflight,
} from "./ownerPreflight.js";

export type EstablishedPromotionSourceLayer = "SCANNER" | "FOLLOW_UP" | "SCANNER_AND_FOLLOW_UP";
export type EstablishedPromotionEligibility = "ELIGIBLE" | "BLOCKED" | "NO_ACTION";
export type EstablishedPromotionMembership = "NOT_ESTABLISHED" | "ACTIVE" | "DISABLED";
export type EstablishedPromotionActionPlan = "ADD" | "NO_ACTION" | "BLOCKED";

export type EstablishedPromotionProductRecord = {
  chain: string;
  contract_address: string;
  display_name: string | null;
  symbol_hint: string | null;
  source_layer: EstablishedPromotionSourceLayer;
  source_record_id: string;
  source_run_id: string;
  lifecycle_status: FollowUpLifecycleStatus;
  basic_filter_status: "passed_basic_filter" | "rejected_basic_filter" | "not_checked";
  security_status: string;
};

export type EstablishedPromotionStatus = {
  mode: OwnerOperationsMode;
  owner_controls_visible: true;
  owner_actions_enabled: boolean;
  chain: SupportedEstablishedChain;
  contract_address: string;
  display_name: string | null;
  symbol: string | null;
  source_layer: EstablishedPromotionSourceLayer;
  lifecycle_status: FollowUpLifecycleStatus;
  eligibility_status: EstablishedPromotionEligibility;
  eligibility_reason_codes: string[];
  basic_filter_status: EstablishedPromotionProductRecord["basic_filter_status"];
  security_status: string;
  established_membership: EstablishedPromotionMembership;
  current_universe_version: string | null;
  current_universe_checksum: string | null;
  universe_validation_status: "valid" | "invalid" | "unavailable";
};

export type EstablishedPromotionPreview = {
  preview_id: string;
  created_at: string;
  expires_at: string;
  one_time: true;
  eligibility_status: EstablishedPromotionEligibility;
  reason_codes: string[];
  chain: SupportedEstablishedChain;
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
  lifecycle_status: FollowUpLifecycleStatus;
  basic_filter_status: EstablishedPromotionProductRecord["basic_filter_status"];
  security_status: string;
  manual_verification_required: boolean;
  action_plan: EstablishedPromotionActionPlan;
  lock_available: boolean;
  owner_actions_enabled: boolean;
};

export type EstablishedPromotionResult = {
  status: "ADDED" | "NO_ACTION_ALREADY_ESTABLISHED";
  chain: SupportedEstablishedChain;
  contract_address: string;
  from_version: string;
  to_version: string;
  entries_total: number;
  entries_enabled: number;
  checksum: string;
  history_created: boolean;
  audit_created: boolean;
};

export type EstablishedPromotionOptions = {
  mode?: OwnerOperationsMode | string;
  sessionSecret?: string;
  now?: () => Date;
  preflightTtlMs?: number;
  storePath?: string;
  actor?: string;
  scanner?: LatestScannerOutputOptions;
  followUp?: FollowUpApiOptions;
  readProductRecord?: (chain: SupportedEstablishedChain, contractAddress: string) => Promise<EstablishedPromotionProductRecord | null>;
  readUniverseStore?: () => Promise<EstablishedUniverseStore>;
  mutateUniverse?: (
    mutation: Parameters<typeof mutateEstablishedUniverse>[0],
    options: UniverseMutationOptions,
  ) => Promise<UniverseMutationResult>;
  inspectUniverseLock?: () => Promise<boolean>;
};

type PromotionEvaluation = {
  record: EstablishedPromotionProductRecord;
  store: EstablishedUniverseStore | null;
  universeValidationStatus: "valid" | "invalid" | "unavailable";
  membership: EstablishedPromotionMembership;
  lifecycleStatus: FollowUpLifecycleStatus;
  eligibilityStatus: EstablishedPromotionEligibility;
  reasonCodes: string[];
  actionPlan: EstablishedPromotionActionPlan;
  lockAvailable: boolean;
  sourceFingerprint: string;
  eligibilityFingerprint: string;
};

type PromotionPreflightContext = {
  chain: SupportedEstablishedChain;
  contract_address: string;
  expected_universe_version: string | null;
  expected_universe_checksum: string | null;
  source_fingerprint: string;
  eligibility_fingerprint: string;
};

export class EstablishedPromotionError extends Error {
  readonly code: string;
  readonly httpStatus: number;

  constructor(code: string, httpStatus: number) {
    super(code);
    this.name = "EstablishedPromotionError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export type EstablishedPromotionService = ReturnType<typeof createEstablishedPromotionService>;

export function createEstablishedPromotionService(options: EstablishedPromotionOptions = {}) {
  const mode = resolveOwnerOperationsMode(options.mode ?? process.env.CRYPTO_EDGE_OWNER_OPERATIONS_MODE);
  const now = options.now ?? (() => new Date());
  const preflightTtlMs = normalizeOwnerPreflightTtl(options.preflightTtlMs);
  const storePath = options.storePath ?? getDefaultEstablishedUniverseStorePath();
  const sessionSecret = mode === "DISABLED"
    ? null
    : normalizeSessionSecret(options.sessionSecret) ?? randomBytes(32).toString("base64url");
  const consumedPreflights = new Map<string, number>();
  let promotionInProgress = false;

  async function getStatus(
    chainInput: string,
    addressInput: string,
    localOwnerRequest: boolean,
  ): Promise<EstablishedPromotionStatus> {
    requireVisible(localOwnerRequest);
    const identity = normalizeIdentity(chainInput, addressInput);
    const evaluation = await evaluate(identity.chain, identity.contract_address);
    return statusFromEvaluation(evaluation, mode);
  }

  function assertVisible(localOwnerRequest: boolean): void {
    requireVisible(localOwnerRequest);
  }

  async function createPreview(
    chainInput: string,
    addressInput: string,
    localOwnerRequest: boolean,
  ): Promise<EstablishedPromotionPreview> {
    requireVisible(localOwnerRequest);
    const identity = normalizeIdentity(chainInput, addressInput);
    const evaluation = await evaluate(identity.chain, identity.contract_address);
    let dryRun: UniverseMutationResult | null = null;
    if (evaluation.actionPlan === "ADD" && evaluation.store) {
      try {
        dryRun = await (options.mutateUniverse ?? mutateEstablishedUniverse)(addMutation(evaluation.record), {
          apply: false,
          storePath,
          actor: options.actor ?? "owner-established-promotion",
          now,
          expectedCurrentVersion: evaluation.store.current.universe_version,
          expectedCurrentChecksum: evaluation.store.current.checksum,
        });
      } catch (error) {
        if (safeErrorCode(error) === "ESTABLISHED_UNIVERSE_STALE") {
          throw new EstablishedPromotionError("STALE_PREVIEW", 409);
        }
        throw new EstablishedPromotionError("PROMOTION_PREVIEW_UNAVAILABLE", 409);
      }
    }
    const context: PromotionPreflightContext = {
      chain: identity.chain,
      contract_address: identity.contract_address,
      expected_universe_version: evaluation.store?.current.universe_version ?? null,
      expected_universe_checksum: evaluation.store?.current.checksum ?? null,
      source_fingerprint: evaluation.sourceFingerprint,
      eligibility_fingerprint: evaluation.eligibilityFingerprint,
    };
    const signed = createSignedOwnerPreflight({
      secret: requireSessionSecret(),
      fingerprint: evaluation.eligibilityFingerprint,
      context,
      now: now(),
      ttlMs: preflightTtlMs,
    });
    const current = evaluation.store?.current ?? null;
    return {
      preview_id: signed.preflightId,
      created_at: signed.payload.created_at,
      expires_at: signed.payload.expires_at,
      one_time: true,
      eligibility_status: evaluation.eligibilityStatus,
      reason_codes: evaluation.reasonCodes,
      chain: identity.chain,
      contract_address: identity.contract_address,
      display_name: evaluation.record.display_name,
      symbol_hint: evaluation.record.symbol_hint,
      current_universe_version: current?.universe_version ?? null,
      planned_universe_version: evaluation.actionPlan === "ADD" ? dryRun?.to_version ?? null : null,
      current_entries_total: current?.entries.length ?? null,
      planned_entries_total: evaluation.actionPlan === "ADD" ? dryRun?.entries_total ?? null : null,
      current_entries_enabled: current?.entries.filter((entry) => entry.enabled).length ?? null,
      planned_entries_enabled: evaluation.actionPlan === "ADD" ? dryRun?.entries_enabled ?? null : null,
      duplicate_status: evaluation.membership === "ACTIVE"
        ? "ACTIVE_ENTRY_EXISTS"
        : evaluation.membership === "DISABLED" ? "DISABLED_ENTRY_EXISTS" : "NONE",
      address_validation_status: "VALID",
      lifecycle_status: evaluation.lifecycleStatus,
      basic_filter_status: evaluation.record.basic_filter_status,
      security_status: evaluation.record.security_status,
      manual_verification_required: requiresManualVerification(evaluation.record.security_status),
      action_plan: evaluation.actionPlan,
      lock_available: evaluation.lockAvailable,
      owner_actions_enabled: mode === "ENABLED",
    };
  }

  async function promote(
    previewId: string,
    ownerSessionHeader: string,
    localOwnerRequest: boolean,
  ): Promise<EstablishedPromotionResult> {
    requireEnabled(localOwnerRequest);
    if (ownerSessionHeader !== previewId) throw new EstablishedPromotionError("OWNER_SESSION_INVALID", 403);
    let payload;
    try {
      payload = verifySignedOwnerPreflight(previewId, requireSessionSecret(), isPromotionPreflightContext);
    } catch (error) {
      if (error instanceof OwnerPreflightError) throw new EstablishedPromotionError(error.code, 400);
      throw error;
    }
    const nowMs = now().getTime();
    if (Date.parse(payload.expires_at) <= nowMs) throw new EstablishedPromotionError("STALE_PREVIEW", 409);
    pruneConsumedOwnerPreflights(consumedPreflights, nowMs);
    if (consumedPreflights.has(previewId)) throw new EstablishedPromotionError("PREFLIGHT_ALREADY_USED", 409);
    if (promotionInProgress) throw new EstablishedPromotionError("PROMOTION_ALREADY_IN_PROGRESS", 409);
    consumedPreflights.set(previewId, Date.parse(payload.expires_at));

    const evaluation = await evaluate(payload.context.chain, payload.context.contract_address);
    if (evaluation.membership === "ACTIVE" && evaluation.store) {
      return noActionResult(evaluation);
    }
    if (!evaluation.lockAvailable) throw new EstablishedPromotionError("PROMOTION_ALREADY_IN_PROGRESS", 409);
    if (
      payload.fingerprint !== evaluation.eligibilityFingerprint
      || payload.context.source_fingerprint !== evaluation.sourceFingerprint
      || payload.context.eligibility_fingerprint !== evaluation.eligibilityFingerprint
      || payload.context.expected_universe_version !== (evaluation.store?.current.universe_version ?? null)
      || payload.context.expected_universe_checksum !== (evaluation.store?.current.checksum ?? null)
    ) {
      throw new EstablishedPromotionError("STALE_PREVIEW", 409);
    }
    if (evaluation.actionPlan !== "ADD" || !evaluation.store) {
      throw new EstablishedPromotionError("PROMOTION_NOT_ELIGIBLE", 409);
    }
    promotionInProgress = true;
    try {
      const result = await (options.mutateUniverse ?? mutateEstablishedUniverse)(addMutation(evaluation.record), {
        apply: true,
        storePath,
        actor: options.actor ?? "owner-established-promotion",
        now,
        expectedCurrentVersion: payload.context.expected_universe_version ?? undefined,
        expectedCurrentChecksum: payload.context.expected_universe_checksum ?? undefined,
      });
      return {
        status: "ADDED",
        chain: payload.context.chain,
        contract_address: payload.context.contract_address,
        from_version: result.from_version,
        to_version: result.to_version,
        entries_total: result.entries_total,
        entries_enabled: result.entries_enabled,
        checksum: result.checksum,
        history_created: true,
        audit_created: true,
      };
    } catch (error) {
      const code = safeErrorCode(error);
      if (code === "ESTABLISHED_UNIVERSE_MANAGEMENT_LOCKED") {
        throw new EstablishedPromotionError("PROMOTION_ALREADY_IN_PROGRESS", 409);
      }
      if (code === "ESTABLISHED_UNIVERSE_STALE") throw new EstablishedPromotionError("STALE_PREVIEW", 409);
      if (code === "ESTABLISHED_UNIVERSE_DUPLICATE_IDENTITY") {
        const latest = await evaluate(payload.context.chain, payload.context.contract_address);
        if (latest.membership === "ACTIVE" && latest.store) return noActionResult(latest);
        throw new EstablishedPromotionError("STALE_PREVIEW", 409);
      }
      throw new EstablishedPromotionError("PROMOTION_WRITE_FAILED", 500);
    } finally {
      promotionInProgress = false;
    }
  }

  async function evaluate(
    chain: SupportedEstablishedChain,
    contractAddress: string,
  ): Promise<PromotionEvaluation> {
    const record = await (options.readProductRecord ?? defaultReadProductRecord)(chain, contractAddress);
    if (!record) throw new EstablishedPromotionError("PRODUCT_RECORD_NOT_FOUND", 404);
    const normalizedRecord = normalizeProductRecord(record, chain, contractAddress);
    const universe = await readUniverseSafely();
    const store = universe.store;
    const matching = store?.current.entries.find((entry) => (
      universeIdentityKey(entry.chain, entry.contract_address) === universeIdentityKey(chain, contractAddress)
    ));
    const membership: EstablishedPromotionMembership = matching
      ? matching.enabled ? "ACTIVE" : "DISABLED"
      : "NOT_ESTABLISHED";
    const lifecycleStatus: FollowUpLifecycleStatus = membership === "ACTIVE"
      ? "ESTABLISHED"
      : normalizedRecord.lifecycle_status;
    const lockAvailable = !promotionInProgress && await inspectLock();
    const reasonCodes: string[] = [];
    let eligibilityStatus: EstablishedPromotionEligibility = "ELIGIBLE";
    let actionPlan: EstablishedPromotionActionPlan = "ADD";

    if (membership === "ACTIVE" || lifecycleStatus === "ESTABLISHED") {
      eligibilityStatus = "NO_ACTION";
      actionPlan = "NO_ACTION";
      reasonCodes.push("ALREADY_ESTABLISHED");
    } else {
      if (universe.validationStatus !== "valid") reasonCodes.push("UNIVERSE_NOT_VALID");
      if (membership === "DISABLED") reasonCodes.push("DISABLED_ENTRY_EXISTS");
      if (lifecycleStatus !== "CANDIDATE_FOR_ESTABLISHED") reasonCodes.push(`LIFECYCLE_${lifecycleStatus}`);
      if (normalizedRecord.basic_filter_status !== "passed_basic_filter") reasonCodes.push("BASIC_FILTER_NOT_PASSED");
      if (!lockAvailable) reasonCodes.push("PROMOTION_ALREADY_IN_PROGRESS");
      if (reasonCodes.length > 0) {
        eligibilityStatus = "BLOCKED";
        actionPlan = "BLOCKED";
      }
    }
    const sourceFingerprint = fingerprint({
      chain,
      contract_address: contractAddress,
      source_layer: normalizedRecord.source_layer,
      source_record_id: normalizedRecord.source_record_id,
      source_run_id: normalizedRecord.source_run_id,
      display_name: normalizedRecord.display_name,
      symbol_hint: normalizedRecord.symbol_hint,
    });
    const eligibilityFingerprint = fingerprint({
      source_fingerprint: sourceFingerprint,
      lifecycle_status: lifecycleStatus,
      basic_filter_status: normalizedRecord.basic_filter_status,
      membership,
      universe_version: store?.current.universe_version ?? null,
      universe_checksum: store?.current.checksum ?? null,
      universe_validation_status: universe.validationStatus,
      action_plan: actionPlan,
    });
    return {
      record: normalizedRecord,
      store,
      universeValidationStatus: universe.validationStatus,
      membership,
      lifecycleStatus,
      eligibilityStatus,
      reasonCodes,
      actionPlan,
      lockAvailable,
      sourceFingerprint,
      eligibilityFingerprint,
    };
  }

  async function defaultReadProductRecord(
    chain: SupportedEstablishedChain,
    contractAddress: string,
  ): Promise<EstablishedPromotionProductRecord | null> {
    const [scanner, followUpDiagnostics] = await Promise.all([
      readLatestScannerOutput(options.scanner).catch(() => null),
      inspectFollowUpStore(options.followUp?.storePath).catch(() => null),
    ]);
    const identity = universeIdentityKey(chain, contractAddress);
    const scannerCandidates = scanner && Array.isArray(scanner.candidates)
      ? scanner.candidates as PersistableCandidate[]
      : [];
    const scannerCandidate = scannerCandidates.find((candidate) => candidate.contract_address && sameIdentity(
      identity,
      candidate.chain,
      candidate.contract_address,
    ));
    const followUpEntry = followUpDiagnostics?.store_available
      ? followUpDiagnostics.store.entries.find((entry) => sameIdentity(identity, entry.chain, entry.contract_address))
      : undefined;
    if (!scannerCandidate && !followUpEntry) return null;
    const securityChecks = scanner && Array.isArray(scanner.security_checks)
      ? scanner.security_checks as PersistableSecurityCheck[]
      : [];
    return productRecordFromSources(chain, contractAddress, scannerCandidate, followUpEntry, securityChecks, now());
  }

  async function readUniverseSafely(): Promise<{
    store: EstablishedUniverseStore | null;
    validationStatus: "valid" | "invalid" | "unavailable";
  }> {
    try {
      return {
        store: await (options.readUniverseStore ?? (() => readEstablishedUniverseStore(storePath)))(),
        validationStatus: "valid",
      };
    } catch (error) {
      const code = safeErrorCode(error);
      return {
        store: null,
        validationStatus: code.includes("UNAVAILABLE") || code.includes("LOAD_FAILED") ? "unavailable" : "invalid",
      };
    }
  }

  async function inspectLock(): Promise<boolean> {
    if (options.inspectUniverseLock) return options.inspectUniverseLock();
    try {
      await access(`${storePath}.lock`);
      return false;
    } catch (error) {
      if (isErrorCode(error, "ENOENT")) return true;
      return false;
    }
  }

  function requireVisible(localOwnerRequest: boolean): void {
    if (!localOwnerRequest || mode === "DISABLED" || sessionSecret === null) {
      throw new EstablishedPromotionError("OWNER_OPERATIONS_UNAVAILABLE", 404);
    }
  }

  function requireEnabled(localOwnerRequest: boolean): void {
    requireVisible(localOwnerRequest);
    if (mode !== "ENABLED") throw new EstablishedPromotionError("OWNER_ACTIONS_DISABLED", 403);
  }

  function requireSessionSecret(): string {
    if (sessionSecret === null) throw new EstablishedPromotionError("OWNER_OPERATIONS_UNAVAILABLE", 404);
    return sessionSecret;
  }

  return { assertVisible, getStatus, createPreview, promote };
}

function statusFromEvaluation(
  evaluation: PromotionEvaluation,
  mode: OwnerOperationsMode,
): EstablishedPromotionStatus {
  return {
    mode,
    owner_controls_visible: true,
    owner_actions_enabled: mode === "ENABLED",
    chain: normalizeEstablishedChain(evaluation.record.chain),
    contract_address: evaluation.record.contract_address,
    display_name: evaluation.record.display_name,
    symbol: evaluation.record.symbol_hint,
    source_layer: evaluation.record.source_layer,
    lifecycle_status: evaluation.lifecycleStatus,
    eligibility_status: evaluation.eligibilityStatus,
    eligibility_reason_codes: evaluation.reasonCodes,
    basic_filter_status: evaluation.record.basic_filter_status,
    security_status: evaluation.record.security_status,
    established_membership: evaluation.membership,
    current_universe_version: evaluation.store?.current.universe_version ?? null,
    current_universe_checksum: evaluation.store?.current.checksum ?? null,
    universe_validation_status: evaluation.universeValidationStatus,
  };
}

function normalizeIdentity(chainInput: string, addressInput: string): {
  chain: SupportedEstablishedChain;
  contract_address: string;
} {
  try {
    const chain = normalizeEstablishedChain(chainInput);
    return { chain, contract_address: normalizeEstablishedAddress(chain, addressInput) };
  } catch (error) {
    throw new EstablishedPromotionError(safeErrorCode(error), 400);
  }
}

function normalizeProductRecord(
  record: EstablishedPromotionProductRecord,
  expectedChain: SupportedEstablishedChain,
  expectedAddress: string,
): EstablishedPromotionProductRecord {
  const identity = normalizeIdentity(record.chain, record.contract_address);
  if (identity.chain !== expectedChain || identity.contract_address !== expectedAddress) {
    throw new EstablishedPromotionError("PRODUCT_RECORD_IDENTITY_MISMATCH", 409);
  }
  if (!isLifecycle(record.lifecycle_status) || !isBasicFilterStatus(record.basic_filter_status)) {
    throw new EstablishedPromotionError("PRODUCT_RECORD_INVALID", 409);
  }
  for (const value of [record.source_record_id, record.source_run_id, record.security_status]) {
    if (typeof value !== "string" || value.length === 0 || value.length > 160) {
      throw new EstablishedPromotionError("PRODUCT_RECORD_INVALID", 409);
    }
  }
  return { ...record, chain: identity.chain, contract_address: identity.contract_address };
}

function productRecordFromSources(
  chain: SupportedEstablishedChain,
  contractAddress: string,
  scanner: PersistableCandidate | undefined,
  followUp: FollowUpEntry | undefined,
  securityChecks: PersistableSecurityCheck[],
  currentTime: Date,
): EstablishedPromotionProductRecord {
  const security = scanner ? securityChecks.find((entry) => entry.candidate_id === scanner.candidate_id) : undefined;
  return {
    chain,
    contract_address: contractAddress,
    display_name: followUp?.display_name ?? scanner?.name ?? null,
    symbol_hint: followUp?.symbol_hint ?? scanner?.symbol ?? null,
    source_layer: scanner && followUp ? "SCANNER_AND_FOLLOW_UP" : followUp ? "FOLLOW_UP" : "SCANNER",
    source_record_id: followUp?.entry_id ?? scanner?.candidate_id ?? "unknown",
    source_run_id: followUp?.source_run_id ?? scanner?.run_id ?? "unknown",
    lifecycle_status: followUp
      ? resolveFollowUpStatusAt(followUp, currentTime.toISOString())
      : scanner?.discovery_basket === "established" ? "ESTABLISHED" : "NEW",
    basic_filter_status: followUp?.latest_filter_result?.status
      ?? (scanner?.basic_filter_status === "passed_basic_filter" ? "passed_basic_filter" : "rejected_basic_filter"),
    security_status: followUp?.latest_security_status.status ?? scannerSecurityStatus(security),
  };
}

function scannerSecurityStatus(security: PersistableSecurityCheck | undefined): string {
  if (!security) return "MANUAL_VERIFICATION_REQUIRED";
  if (security.security_label === "SECURITY_PASSED") return "CHECKED";
  if (security.security_label === "CRITICAL_RISK") return "CRITICAL_RISK";
  return security.missing_data.length > 0 ? "PARTIAL" : "MANUAL_VERIFICATION_REQUIRED";
}

function addMutation(record: EstablishedPromotionProductRecord) {
  return {
    operation: "add" as const,
    chain: record.chain,
    contract_address: record.contract_address,
    enabled: true,
    ...(record.display_name ? { display_name: record.display_name } : {}),
    ...(record.symbol_hint ? { symbol_hint: record.symbol_hint } : {}),
  };
}

function noActionResult(evaluation: PromotionEvaluation): EstablishedPromotionResult {
  if (!evaluation.store) throw new EstablishedPromotionError("UNIVERSE_NOT_VALID", 409);
  const current = evaluation.store.current;
  return {
    status: "NO_ACTION_ALREADY_ESTABLISHED",
    chain: normalizeEstablishedChain(evaluation.record.chain),
    contract_address: evaluation.record.contract_address,
    from_version: current.universe_version,
    to_version: current.universe_version,
    entries_total: current.entries.length,
    entries_enabled: current.entries.filter((entry) => entry.enabled).length,
    checksum: current.checksum,
    history_created: false,
    audit_created: false,
  };
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("base64url");
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function isPromotionPreflightContext(value: unknown): value is PromotionPreflightContext {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value).sort();
  const expected = [
    "chain", "contract_address", "eligibility_fingerprint", "expected_universe_checksum",
    "expected_universe_version", "source_fingerprint",
  ];
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) return false;
  try {
    const chain = normalizeEstablishedChain(String(value.chain ?? ""));
    if (normalizeEstablishedAddress(chain, String(value.contract_address ?? "")) !== value.contract_address) return false;
  } catch {
    return false;
  }
  return (value.expected_universe_version === null || typeof value.expected_universe_version === "string")
    && (value.expected_universe_checksum === null || typeof value.expected_universe_checksum === "string")
    && isFingerprint(value.source_fingerprint)
    && isFingerprint(value.eligibility_fingerprint);
}

function sameIdentity(expected: string, chain: string, address: string): boolean {
  try {
    const normalizedChain = normalizeEstablishedChain(chain);
    return universeIdentityKey(normalizedChain, normalizeEstablishedAddress(normalizedChain, address)) === expected;
  } catch {
    return false;
  }
}

function requiresManualVerification(status: string): boolean {
  return status === "MANUAL_VERIFICATION_REQUIRED" || status === "PARTIAL" || status === "UNAVAILABLE";
}

function normalizeSessionSecret(value: string | undefined): string | null {
  if (value === undefined) return null;
  return value.length >= 32 && value.length <= 256 ? value : null;
}

function isFingerprint(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}

function isLifecycle(value: unknown): value is FollowUpLifecycleStatus {
  return value === "NEW" || value === "MATURING" || value === "CANDIDATE_FOR_ESTABLISHED"
    || value === "ESTABLISHED" || value === "ARCHIVED";
}

function isBasicFilterStatus(value: unknown): value is EstablishedPromotionProductRecord["basic_filter_status"] {
  return value === "passed_basic_filter" || value === "rejected_basic_filter" || value === "not_checked";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isErrorCode(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === code);
}

function safeErrorCode(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const normalized = raw.toUpperCase().replace(/[^A-Z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 96);
  return normalized || "PROMOTION_ERROR";
}
