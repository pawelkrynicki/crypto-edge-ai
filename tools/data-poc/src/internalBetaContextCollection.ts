import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BoundedHttpClient, type FetchLike } from "./boundedHttpClient.js";
import { validateDisplayEligibleContextSnapshot } from "./contextSnapshotValidator.js";
import {
  collectApprovedSourcesOutput,
  APPROVED_SOURCES_OUTPUT_FILENAME,
} from "./sources/runApprovedSourcesPoc.js";
import { getApprovedSourceAdapters } from "./sources/sourceAdapterRegistry.js";
import type {
  ApprovedSourcesRunOutput,
  NormalizedSourceOutput,
  SourceAdapter,
} from "./sources/sourceAdapterTypes.js";

export const CONTEXT_SOURCE_IDS = ["alternative_me_fng", "defillama_api"] as const;
export type ContextSourceId = typeof CONTEXT_SOURCE_IDS[number];

const DEFAULT_OUTPUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../output");

export type InternalBetaContextCollectionOptions = {
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  concurrency?: number;
  now: Date;
  runId: string;
  outputDir?: string;
  dueSourceIds?: ContextSourceId[];
  previousContext?: ApprovedSourcesRunOutput;
  previousContextRunId?: string | null;
};

export type InternalBetaContextCollectionResult = {
  context: ApprovedSourcesRunOutput;
  request_counts: Record<ContextSourceId, number>;
  refreshed_source_ids: ContextSourceId[];
  source_health: Record<ContextSourceId, "READY" | "DEGRADED" | "UNAVAILABLE">;
};

export async function collectInternalBetaContext(
  options: InternalBetaContextCollectionOptions,
): Promise<InternalBetaContextCollectionResult> {
  const previous = options.previousContext
    ?? await readPreviousContext(options.outputDir, options.previousContextRunId);
  const requestedDue = options.dueSourceIds ?? [...CONTEXT_SOURCE_IDS];
  const effectiveDue = previous ? requestedDue : [...CONTEXT_SOURCE_IDS];
  const due = new Set<ContextSourceId>(effectiveDue);
  const common = {
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs,
    concurrency: options.concurrency,
  };
  const clients = {
    alternative_me_fng: new BoundedHttpClient({ ...common, sourceId: "alternative_me_fng", maxRequests: 2 }),
    defillama_api: new BoundedHttpClient({ ...common, sourceId: "defillama_api", maxRequests: 2 }),
  };
  const adapters = getApprovedSourceAdapters().map((adapter) => {
    const sourceId = asContextSourceId(adapter.sourceId);
    if (due.has(sourceId)) return adapter;
    const previousSource = previous?.sources.find((source) => source.source_id === sourceId);
    if (!previousSource) throw new Error("PREVIOUS_CONTEXT_SOURCE_UNAVAILABLE");
    return passthroughAdapter(adapter, previousSource);
  });
  const context = await collectApprovedSourcesOutput({
    mode: "live",
    environment: "INTERNAL_BETA",
    now: options.now,
    runId: options.runId,
    adapters,
    requestJsonBySource: {
      alternative_me_fng: <T>(url: string | URL, init?: RequestInit) => clients.alternative_me_fng.requestJson<T>(url, init),
      defillama_api: <T>(url: string | URL, init?: RequestInit) => clients.defillama_api.requestJson<T>(url, init),
    },
  });
  const refreshedSourceIds: ContextSourceId[] = [];
  for (let index = 0; index < context.sources.length; index += 1) {
    const source = context.sources[index]!;
    const sourceId = asContextSourceId(source.source_id);
    if (!due.has(sourceId)) continue;
    if (source.records.length > 0 && source.errors.length === 0) {
      source.fetched_at = options.now.toISOString();
      refreshedSourceIds.push(sourceId);
      continue;
    }
    const previousSource = previous?.sources.find((candidate) => candidate.source_id === sourceId);
    if (previousSource?.records.length && previousSource.errors.length === 0) {
      context.sources[index] = {
        ...structuredClone(previousSource),
        health_status: "degraded_external_source",
        warnings: [...new Set([
          ...previousSource.warnings,
          `SOURCE_LAST_KNOWN_GOOD: ${sourceId}`,
        ])],
        errors: [],
      };
    }
  }
  const requestCounts = {
    alternative_me_fng: clients.alternative_me_fng.getStats().request_count,
    defillama_api: clients.defillama_api.getStats().request_count,
  };
  context.provenance.metadata = {
    request_counts: requestCounts,
    attributions: Object.fromEntries(context.sources.map((source) => [source.source_id, source.attribution])),
  };
  context.summary = summarizeContext(context.sources);
  validateDisplayEligibleContextSnapshot(context);
  return {
    context,
    request_counts: requestCounts,
    refreshed_source_ids: refreshedSourceIds,
    source_health: Object.fromEntries(context.sources.map((source) => [
      source.source_id,
      source.records.length === 0 || source.errors.length > 0
        ? "UNAVAILABLE"
        : source.health_status === "degraded_external_source" || source.warnings.length > 0
          ? "DEGRADED"
          : "READY",
    ])) as InternalBetaContextCollectionResult["source_health"],
  };
}

function summarizeContext(sources: NormalizedSourceOutput[]): ApprovedSourcesRunOutput["summary"] {
  return {
    sources_requested: CONTEXT_SOURCE_IDS.length,
    sources_allowed: sources.filter((source) => source.policy.allowed).length,
    sources_denied: sources.filter((source) => !source.policy.allowed).length,
    records_total: sources.reduce((total, source) => total + source.records.length, 0),
    warnings_total: sources.reduce((total, source) => total + source.warnings.length, 0),
    errors_total: sources.reduce((total, source) => total + source.errors.length, 0),
    degraded_external_sources_total: sources.filter((source) => source.health_status === "degraded_external_source").length,
    hard_failures_total: sources.filter((source) => source.health_status === "error" && source.errors.length > 0).length,
  };
}

async function readPreviousContext(outputDir: string | undefined, runId: string | null | undefined): Promise<ApprovedSourcesRunOutput | undefined> {
  if (!runId) return undefined;
  try {
    const path = resolve(outputDir ?? DEFAULT_OUTPUT_DIR, runId, APPROVED_SOURCES_OUTPUT_FILENAME);
    const output = JSON.parse(await readFile(path, "utf8")) as ApprovedSourcesRunOutput;
    validateDisplayEligibleContextSnapshot(output);
    return output;
  } catch {
    return undefined;
  }
}

function passthroughAdapter(adapter: SourceAdapter, previous: NormalizedSourceOutput): SourceAdapter {
  const copy = () => Promise.resolve(structuredClone(previous));
  return { ...adapter, fetchFixture: copy, fetchLive: copy };
}

function asContextSourceId(value: string): ContextSourceId {
  if (value === "alternative_me_fng" || value === "defillama_api") return value;
  throw new Error("CONTEXT_SOURCE_NOT_APPROVED");
}
