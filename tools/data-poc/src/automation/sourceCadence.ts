export const SOURCE_CADENCE_SCHEMA_VERSION = "source_aware_cadence_v1";

export const SOURCE_CADENCE_MS = {
  dexscreener: 15 * 60 * 1_000,
  alternative_me_fng: 6 * 60 * 60 * 1_000,
  defillama_api: 2 * 60 * 60 * 1_000,
} as const;

export type ScheduledSourceId = keyof typeof SOURCE_CADENCE_MS;
export type CadenceSourceId = ScheduledSourceId | "goplus_security" | "honeypot_is";

export type SourceCadenceStatus = {
  source_id: CadenceSourceId;
  due: boolean;
  reason: "NEVER_SUCCEEDED" | "INTERVAL_ELAPSED" | "INTERVAL_NOT_ELAPSED"
    | "CANDIDATE_SCOPED_WITH_SCANNER" | "MANUAL_LINK_ONLY";
  last_success_at: string | null;
  next_run_at: string | null;
  delay_ms: number;
};

export type SourceCadencePlan = {
  schema_version: typeof SOURCE_CADENCE_SCHEMA_VERSION;
  checked_at: string;
  sources: Record<CadenceSourceId, SourceCadenceStatus>;
  due_sources: CadenceSourceId[];
  not_due_sources: CadenceSourceId[];
  requires_scanner_and_context: boolean;
  requires_context_only: boolean;
};

export type SourceCadenceInput = {
  now: Date;
  last_success_at?: Partial<Record<ScheduledSourceId, string | null>>;
  // Accepted only to make the user-count independence explicit and testable.
  user_count?: number;
};

export function planSourceCadence(input: SourceCadenceInput): SourceCadencePlan {
  const nowMs = validDate(input.now).getTime();
  const last = input.last_success_at ?? {};
  const dexscreener = scheduledStatus("dexscreener", last.dexscreener ?? null, nowMs);
  const alternativeMe = scheduledStatus("alternative_me_fng", last.alternative_me_fng ?? null, nowMs);
  const defillama = scheduledStatus("defillama_api", last.defillama_api ?? null, nowMs);
  const goplus: SourceCadenceStatus = {
    source_id: "goplus_security",
    due: false,
    reason: "CANDIDATE_SCOPED_WITH_SCANNER",
    last_success_at: null,
    next_run_at: null,
    delay_ms: 0,
  };
  const honeypot: SourceCadenceStatus = {
    source_id: "honeypot_is",
    due: false,
    reason: "MANUAL_LINK_ONLY",
    last_success_at: null,
    next_run_at: null,
    delay_ms: 0,
  };
  const sources: SourceCadencePlan["sources"] = {
    dexscreener,
    goplus_security: goplus,
    alternative_me_fng: alternativeMe,
    defillama_api: defillama,
    honeypot_is: honeypot,
  };
  const allSources = Object.values(sources);
  const scannerDue = dexscreener.due;
  const contextDue = alternativeMe.due || defillama.due;

  return {
    schema_version: SOURCE_CADENCE_SCHEMA_VERSION,
    checked_at: input.now.toISOString(),
    sources,
    due_sources: allSources.filter((source) => source.due).map((source) => source.source_id),
    not_due_sources: allSources.filter((source) => !source.due).map((source) => source.source_id),
    requires_scanner_and_context: scannerDue,
    requires_context_only: !scannerDue && contextDue,
  };
}

export function nextRunAt(lastSuccessAt: string | null, intervalMs: number): string | null {
  if (lastSuccessAt === null) return null;
  const parsed = Date.parse(lastSuccessAt);
  if (!Number.isFinite(parsed)) throw new Error("SOURCE_CADENCE_TIMESTAMP_INVALID");
  return new Date(parsed + intervalMs).toISOString();
}

function scheduledStatus(sourceId: ScheduledSourceId, lastSuccessAt: string | null, nowMs: number): SourceCadenceStatus {
  const intervalMs = SOURCE_CADENCE_MS[sourceId];
  const next = nextRunAt(lastSuccessAt, intervalMs);
  if (next === null) {
    return {
      source_id: sourceId,
      due: true,
      reason: "NEVER_SUCCEEDED",
      last_success_at: null,
      next_run_at: null,
      delay_ms: 0,
    };
  }
  const nextMs = Date.parse(next);
  const due = nowMs >= nextMs;
  return {
    source_id: sourceId,
    due,
    reason: due ? "INTERVAL_ELAPSED" : "INTERVAL_NOT_ELAPSED",
    last_success_at: lastSuccessAt,
    next_run_at: next,
    delay_ms: due ? Math.max(0, nowMs - nextMs) : 0,
  };
}

function validDate(value: Date): Date {
  if (!Number.isFinite(value.getTime())) throw new Error("SOURCE_CADENCE_NOW_INVALID");
  return value;
}
