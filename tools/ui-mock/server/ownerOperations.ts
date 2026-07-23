import { createHmac, randomBytes } from "node:crypto";
import {
  createAutomationStateStore,
  type AutomationState,
  type AutomationStateStore,
} from "../../data-poc/src/automation/automationState.js";
import { inspectActiveGlobalCollectorLock } from "../../data-poc/src/automation/globalCollectorLock.js";
import { readPublishedSnapshotTimes } from "../../data-poc/src/automation/publishedSnapshotTimes.js";
import {
  runCentralSchedulerOnce,
  type RunCentralSchedulerOnceOptions,
  type RunCentralSchedulerOnceResult,
} from "../../data-poc/src/automation/runCentralAutomation.js";
import {
  decideCentralSchedule,
  type PublishedSnapshotTimes,
  type SchedulerDecision,
} from "../../data-poc/src/automation/schedulerDecision.js";
import {
  createSignedOwnerPreflight,
  normalizeOwnerPreflightTtl,
  OwnerPreflightError,
  pruneConsumedOwnerPreflights,
  verifySignedOwnerPreflight,
} from "./ownerPreflight.js";

export { OWNER_SESSION_HEADER } from "./ownerPreflight.js";
export const OWNER_OPERATIONS_MODES = ["DISABLED", "REVIEW_SAFE", "ENABLED"] as const;
export { DEFAULT_OWNER_PREFLIGHT_TTL_MS } from "./ownerPreflight.js";
const OWNER_SOURCE_IDS = [
  "dexscreener",
  "goplus_security",
  "alternative_me_fng",
  "defillama_api",
  "honeypot_is",
] as const;

export type OwnerOperationsMode = typeof OWNER_OPERATIONS_MODES[number];
export type OwnerRefreshPlanMode = "scanner_and_context" | "context_only" | "no_action";
export type OwnerActionStatus = "IN_PROGRESS" | "SUCCESS" | "NO_ACTION" | "FAILED" | "RUN_ALREADY_IN_PROGRESS" | null;

export type OwnerSnapshotStatus = {
  scanner_timestamp: string | null;
  context_timestamp: string | null;
  last_known_good_available: boolean;
};

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

export type OwnerOperationsOptions = {
  mode?: OwnerOperationsMode | string;
  sessionSecret?: string;
  now?: () => Date;
  preflightTtlMs?: number;
  automationEnabled?: boolean;
  automationDirectoryPath?: string;
  stateStore?: AutomationStateStore;
  readSnapshots?: (state: AutomationState) => Promise<PublishedSnapshotTimes>;
  inspectActiveLock?: () => Promise<string | null>;
  runOnce?: (options: RunCentralSchedulerOnceOptions) => Promise<RunCentralSchedulerOnceResult>;
};

type LastAction = {
  status: Exclude<OwnerActionStatus, null>;
  started_at: string;
  finished_at: string | null;
  run_id: string | null;
};

type ScheduleView = {
  schedule: SchedulerDecision;
  state: AutomationState | null;
  snapshots: PublishedSnapshotTimes;
  lock_available: boolean;
  scanner_due: boolean;
  context_due: boolean;
  planned_mode: OwnerRefreshPlanMode;
  sources_may_be_called: string[];
  sources_not_called: string[];
  no_action_reason: string | null;
};

export class OwnerOperationsError extends Error {
  readonly code: string;
  readonly httpStatus: number;

  constructor(code: string, httpStatus: number) {
    super(code);
    this.name = "OwnerOperationsError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export type OwnerOperationsService = ReturnType<typeof createOwnerOperationsService>;

export function resolveOwnerOperationsMode(value: unknown): OwnerOperationsMode {
  return typeof value === "string" && (OWNER_OPERATIONS_MODES as readonly string[]).includes(value)
    ? value as OwnerOperationsMode
    : "DISABLED";
}

export function createOwnerOperationsService(options: OwnerOperationsOptions = {}) {
  const mode = resolveOwnerOperationsMode(options.mode ?? process.env.CRYPTO_EDGE_OWNER_OPERATIONS_MODE);
  const now = options.now ?? (() => new Date());
  const preflightTtlMs = normalizeOwnerPreflightTtl(options.preflightTtlMs);
  const automationEnabled = options.automationEnabled ?? process.env.CRYPTO_EDGE_AUTOMATION_ENABLED === "1";
  const stateStore = options.stateStore ?? createAutomationStateStore(options.automationDirectoryPath);
  const sessionSecret = mode === "DISABLED"
    ? null
    : normalizeSessionSecret(options.sessionSecret) ?? randomBytes(32).toString("base64url");
  let actionInProgress = false;
  let lastAction: LastAction | null = null;
  const consumedPreflights = new Map<string, number>();

  async function getStatus(snapshot: OwnerSnapshotStatus, localOwnerRequest: boolean): Promise<OwnerOperationsStatus> {
    const effectiveMode = localOwnerRequest ? mode : "DISABLED";
    const visible = effectiveMode !== "DISABLED" && sessionSecret !== null;
    const schedule = visible ? await readSchedule() : null;
    return {
      mode: effectiveMode,
      owner_controls_visible: visible,
      owner_actions_enabled: effectiveMode === "ENABLED" && visible,
      action_in_progress: visible && (actionInProgress || schedule?.lock_available === false),
      last_action_status: visible ? lastAction?.status ?? null : null,
      last_action_started_at: visible ? lastAction?.started_at ?? null : null,
      last_action_finished_at: visible ? lastAction?.finished_at ?? null : null,
      ...(visible && lastAction?.run_id ? { last_action_run_id: lastAction.run_id } : {}),
      scanner_due: visible ? schedule?.scanner_due ?? false : false,
      context_due: visible ? schedule?.context_due ?? false : false,
      next_scanner_due_at: visible ? schedule?.schedule.cadence.sources.dexscreener.next_run_at ?? null : null,
      next_context_due_at: visible ? earliestIso(
        schedule?.schedule.cadence.sources.alternative_me_fng.next_run_at ?? null,
        schedule?.schedule.cadence.sources.defillama_api.next_run_at ?? null,
      ) : null,
      automation_enabled: automationEnabled,
      current_scanner_snapshot_timestamp: snapshot.scanner_timestamp,
      current_context_snapshot_timestamp: snapshot.context_timestamp,
      last_known_good_available: snapshot.last_known_good_available,
    };
  }

  async function createRefreshPreview(localOwnerRequest: boolean): Promise<OwnerRefreshPreview> {
    requireVisible(localOwnerRequest);
    const view = await readSchedule();
    const createdAt = now();
    const signed = createSignedOwnerPreflight({
      secret: requireSessionSecret(),
      now: createdAt,
      ttlMs: preflightTtlMs,
      fingerprint: scheduleFingerprint(view),
      context: null,
    });
    const payload = signed.payload;
    return {
      preflight_id: signed.preflightId,
      created_at: payload.created_at,
      expires_at: payload.expires_at,
      scanner_due: view.scanner_due,
      context_due: view.context_due,
      planned_mode: view.planned_mode,
      sources_may_be_called: view.sources_may_be_called,
      sources_not_called: view.sources_not_called,
      no_action_reason: view.no_action_reason,
      lock_available: view.lock_available,
      owner_actions_enabled: mode === "ENABLED",
    };
  }

  async function refresh(
    preflightId: string,
    ownerSessionHeader: string,
    localOwnerRequest: boolean,
  ): Promise<OwnerRefreshResult> {
    requireEnabled(localOwnerRequest);
    if (ownerSessionHeader !== preflightId) {
      throw new OwnerOperationsError("OWNER_SESSION_INVALID", 403);
    }
    let payload;
    try {
      payload = verifySignedOwnerPreflight(preflightId, requireSessionSecret(), (value): value is null => value === null);
    } catch (error) {
      if (error instanceof OwnerPreflightError) throw new OwnerOperationsError(error.code, 400);
      throw error;
    }
    if (Date.parse(payload.expires_at) <= now().getTime()) {
      throw new OwnerOperationsError("PREFLIGHT_STALE", 409);
    }
    if (actionInProgress) {
      throw new OwnerOperationsError("RUN_ALREADY_IN_PROGRESS", 409);
    }
    pruneConsumedOwnerPreflights(consumedPreflights, now().getTime());
    if (consumedPreflights.has(preflightId)) {
      throw new OwnerOperationsError("PREFLIGHT_STALE", 409);
    }
    consumedPreflights.set(preflightId, Date.parse(payload.expires_at));

    const view = await readSchedule();
    if (payload.fingerprint !== scheduleFingerprint(view)) {
      throw new OwnerOperationsError("PREFLIGHT_STALE", 409);
    }
    if (!view.lock_available) {
      throw new OwnerOperationsError("RUN_ALREADY_IN_PROGRESS", 409);
    }
    if (view.planned_mode === "no_action") {
      const instant = now().toISOString();
      lastAction = { status: "NO_ACTION", started_at: instant, finished_at: instant, run_id: null };
      return { status: "NO_ACTION", last_known_good_preserved: true };
    }
    if (actionInProgress) {
      throw new OwnerOperationsError("RUN_ALREADY_IN_PROGRESS", 409);
    }

    actionInProgress = true;
    const startedAt = now().toISOString();
    lastAction = { status: "IN_PROGRESS", started_at: startedAt, finished_at: null, run_id: null };
    try {
      const runResult = await (options.runOnce ?? runCentralSchedulerOnce)({
        enabled: true,
        now,
        automationDirectoryPath: options.automationDirectoryPath,
        stateStore,
        snapshots: view.snapshots,
      });
      const finishedAt = now().toISOString();
      if (runResult.run_status === "SUCCESS" && runResult.run_id) {
        lastAction = { status: "SUCCESS", started_at: startedAt, finished_at: finishedAt, run_id: runResult.run_id };
        return { status: "SUCCESS", run_id: runResult.run_id, last_known_good_preserved: false };
      }
      if (runResult.run_status === "RUN_ALREADY_IN_PROGRESS" || runResult.decision === "RUN_ALREADY_IN_PROGRESS") {
        lastAction = { status: "RUN_ALREADY_IN_PROGRESS", started_at: startedAt, finished_at: finishedAt, run_id: null };
        throw new OwnerOperationsError("RUN_ALREADY_IN_PROGRESS", 409);
      }
      if (runResult.decision === "NOTHING_DUE") {
        lastAction = { status: "NO_ACTION", started_at: startedAt, finished_at: finishedAt, run_id: null };
        return { status: "NO_ACTION", last_known_good_preserved: true };
      }
      const runId = runResult.run_id ?? null;
      lastAction = { status: "FAILED", started_at: startedAt, finished_at: finishedAt, run_id: runId };
      return {
        status: "FAILED",
        ...(runId ? { run_id: runId } : {}),
        error_code: safeErrorCode(runResult.error_code),
        last_known_good_preserved: true,
      };
    } catch (error) {
      if (error instanceof OwnerOperationsError) throw error;
      const finishedAt = now().toISOString();
      lastAction = { status: "FAILED", started_at: startedAt, finished_at: finishedAt, run_id: null };
      return {
        status: "FAILED",
        error_code: safeErrorCode(error),
        last_known_good_preserved: true,
      };
    } finally {
      actionInProgress = false;
    }
  }

  async function readSchedule(): Promise<ScheduleView> {
    let state: AutomationState | null = null;
    let snapshots: PublishedSnapshotTimes = {};
    let stateAvailable = true;
    try {
      state = await stateStore.read();
      snapshots = options.readSnapshots
        ? await options.readSnapshots(state)
        : await readPublishedSnapshotTimes(state);
    } catch {
      stateAvailable = false;
    }

    let activeRunId: string | null = null;
    try {
      activeRunId = options.inspectActiveLock
        ? await options.inspectActiveLock()
        : await inspectActiveGlobalCollectorLock({ directoryPath: options.automationDirectoryPath, now });
    } catch {
      stateAvailable = false;
    }
    const schedule = decideCentralSchedule({
      now: now(),
      enabled: true,
      state,
      state_available: stateAvailable,
      active_lock_run_id: activeRunId,
      snapshots,
    });
    const scannerDue = schedule.cadence.sources.dexscreener.due;
    const contextDue = schedule.cadence.sources.alternative_me_fng.due
      || schedule.cadence.sources.defillama_api.due;
    const plannedMode: OwnerRefreshPlanMode = !stateAvailable
      ? "no_action"
      : schedule.cadence.requires_scanner_and_context
        ? "scanner_and_context"
        : schedule.cadence.requires_context_only ? "context_only" : "no_action";
    const sourcesMayBeCalled = plannedMode === "no_action"
      ? []
      : [
        ...schedule.cadence.due_sources.filter((sourceId) => sourceId !== "goplus_security" && sourceId !== "honeypot_is"),
        ...(scannerDue ? ["goplus_security"] : []),
      ];
    const mayCallSet = new Set(sourcesMayBeCalled);
    return {
      schedule,
      state,
      snapshots,
      lock_available: activeRunId === null && stateAvailable,
      scanner_due: scannerDue,
      context_due: contextDue,
      planned_mode: plannedMode,
      sources_may_be_called: sourcesMayBeCalled,
      sources_not_called: OWNER_SOURCE_IDS.filter((sourceId) => !mayCallSet.has(sourceId)),
      no_action_reason: plannedMode === "no_action"
        ? stateAvailable ? "NOTHING_DUE" : "STATE_UNAVAILABLE"
        : null,
    };
  }

  function requireVisible(localOwnerRequest: boolean): void {
    if (!localOwnerRequest || mode === "DISABLED" || sessionSecret === null) {
      throw new OwnerOperationsError("OWNER_OPERATIONS_UNAVAILABLE", 404);
    }
  }

  function requireEnabled(localOwnerRequest: boolean): void {
    requireVisible(localOwnerRequest);
    if (mode !== "ENABLED") throw new OwnerOperationsError("OWNER_ACTIONS_DISABLED", 403);
  }

  function requireSessionSecret(): string {
    if (sessionSecret === null) throw new OwnerOperationsError("OWNER_OPERATIONS_UNAVAILABLE", 404);
    return sessionSecret;
  }

  return { getStatus, createRefreshPreview, refresh };
}

function scheduleFingerprint(view: ScheduleView): string {
  return createHmac("sha256", "owner-refresh-plan-v1")
    .update(JSON.stringify({
      planned_mode: view.planned_mode,
      due_sources: [...view.schedule.cadence.due_sources].sort(),
      lock_available: view.lock_available,
      state_available: view.schedule.decision !== "STATE_UNAVAILABLE",
    }))
    .digest("base64url");
}

function normalizeSessionSecret(value: string | undefined): string | null {
  if (value === undefined) return null;
  return value.length >= 32 && value.length <= 256 ? value : null;
}

function earliestIso(...values: Array<string | null>): string | null {
  return values
    .filter((value): value is string => value !== null)
    .sort((left, right) => Date.parse(left) - Date.parse(right))[0] ?? null;
}

function safeErrorCode(value: unknown): string {
  const candidate = typeof value === "string"
    ? value
    : value && typeof value === "object" && "code" in value
      ? String(value.code)
      : "OWNER_REFRESH_FAILED";
  const normalized = candidate.toUpperCase().replace(/[^A-Z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 96);
  return normalized || "OWNER_REFRESH_FAILED";
}
