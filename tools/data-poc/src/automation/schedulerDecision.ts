import type { AutomationState } from "./automationState.js";
import { planSourceCadence, type SourceCadencePlan } from "./sourceCadence.js";

export const SCHEDULER_SCHEMA_VERSION = "central_source_scheduler_v1";

export type SchedulerDecisionCode =
  | "RUN_SCANNER_AND_CONTEXT"
  | "RUN_CONTEXT_ONLY"
  | "NOTHING_DUE"
  | "RUN_ALREADY_IN_PROGRESS"
  | "AUTOMATION_DISABLED"
  | "STATE_UNAVAILABLE";

export type PublishedSnapshotTimes = {
  scanner_published_at?: string | null;
  context_published_at?: string | null;
  alternative_me_published_at?: string | null;
  defillama_published_at?: string | null;
};

export type SchedulerDecisionInput = {
  now: Date;
  enabled: boolean;
  state: AutomationState | null;
  state_available?: boolean;
  active_lock_run_id?: string | null;
  snapshots?: PublishedSnapshotTimes;
  user_count?: number;
};

export type SchedulerDecision = {
  scheduler_schema_version: typeof SCHEDULER_SCHEMA_VERSION;
  decision: SchedulerDecisionCode;
  checked_at: string;
  active_run_id: string | null;
  cadence: SourceCadencePlan;
  missed_schedule_increment: 0 | 1;
};

export function decideCentralSchedule(input: SchedulerDecisionInput): SchedulerDecision {
  const state = input.state;
  const snapshots = input.snapshots ?? {};
  const scannerSuccess = state?.last_scanner_success_at ?? snapshots.scanner_published_at ?? null;
  const contextSuccess = state?.last_context_success_at ?? snapshots.context_published_at ?? null;
  const alternativeSuccess = successFromNext(state?.next_alternative_me_run_at ?? null, 6 * 60 * 60 * 1_000)
    ?? snapshots.alternative_me_published_at
    ?? contextSuccess;
  const defillamaSuccess = successFromNext(state?.next_defillama_run_at ?? null, 2 * 60 * 60 * 1_000)
    ?? snapshots.defillama_published_at
    ?? contextSuccess;
  const cadence = planSourceCadence({
    now: input.now,
    last_success_at: {
      dexscreener: scannerSuccess,
      alternative_me_fng: alternativeSuccess,
      defillama_api: defillamaSuccess,
    },
  });
  const activeRunId = input.active_lock_run_id === undefined
    ? state?.active_run_id ?? null
    : input.active_lock_run_id;
  let decision: SchedulerDecisionCode;
  if (!input.enabled) decision = "AUTOMATION_DISABLED";
  else if (input.state_available === false || state === null) decision = "STATE_UNAVAILABLE";
  else if (activeRunId) decision = "RUN_ALREADY_IN_PROGRESS";
  else if (cadence.requires_scanner_and_context) decision = "RUN_SCANNER_AND_CONTEXT";
  else if (cadence.requires_context_only) decision = "RUN_CONTEXT_ONLY";
  else decision = "NOTHING_DUE";

  return {
    scheduler_schema_version: SCHEDULER_SCHEMA_VERSION,
    decision,
    checked_at: input.now.toISOString(),
    active_run_id: activeRunId,
    cadence,
    missed_schedule_increment: state && isNewlyMissedSchedule(state.last_scheduler_check_at, cadence) ? 1 : 0,
  };
}

function successFromNext(nextRunAt: string | null, intervalMs: number): string | null {
  if (nextRunAt === null) return null;
  const parsed = Date.parse(nextRunAt);
  return Number.isFinite(parsed) ? new Date(parsed - intervalMs).toISOString() : null;
}

export function isNewlyMissedSchedule(lastCheckAt: string | null, cadence: SourceCadencePlan): boolean {
  const delayed = Object.values(cadence.sources).filter((source) => source.delay_ms > 0 && source.next_run_at !== null);
  if (delayed.length === 0) return false;
  const previousCheckMs = lastCheckAt === null ? Number.NEGATIVE_INFINITY : Date.parse(lastCheckAt);
  return delayed.some((source) => previousCheckMs <= Date.parse(source.next_run_at as string));
}
