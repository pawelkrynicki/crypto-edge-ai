import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { publishAtomicJson, type AtomicPublishResult } from "./atomicPublish.js";
import type { FetchLike } from "./boundedHttpClient.js";
import { configureCollectorNetwork } from "./collectorNetworkBootstrap.js";
import { assertInternalBetaCollectorEnvironment, type CollectorEnvironment } from "./collectorEnvironment.js";
import { validateDisplayEligibleContextSnapshot } from "./contextSnapshotValidator.js";
import {
  collectInternalBetaContext,
  type ContextSourceId,
} from "./internalBetaContextCollection.js";
import { APPROVED_SOURCES_OUTPUT_FILENAME } from "./sources/runApprovedSourcesPoc.js";
import type { ApprovedSourcesRunOutput } from "./sources/sourceAdapterTypes.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUTPUT_DIR = resolve(__dirname, "../../output");

export type InternalBetaContextCollectorOptions = {
  env?: CollectorEnvironment;
  fetchImpl?: FetchLike;
  outputDir?: string;
  timeoutMs?: number;
  concurrency?: number;
  now?: Date;
  dueSourceIds?: ContextSourceId[];
  previousContext?: ApprovedSourcesRunOutput;
  previousContextRunId?: string | null;
};

export type InternalBetaContextCollectorResult = {
  context_run_id: string;
  request_counts: Record<string, number>;
  refreshed_source_ids: ContextSourceId[];
  context: ApprovedSourcesRunOutput;
  context_publish: AtomicPublishResult;
};

export async function runInternalBetaContextCollector(
  options: InternalBetaContextCollectorOptions = {},
): Promise<InternalBetaContextCollectorResult> {
  assertInternalBetaCollectorEnvironment(options.env ?? process.env);
  configureCollectorNetwork();
  const now = options.now ?? new Date();
  const contextRunId = uniqueRunId("approved_sources", now);
  const collected = await collectInternalBetaContext({
    now,
    runId: contextRunId,
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs,
    concurrency: options.concurrency,
    outputDir: options.outputDir,
    dueSourceIds: options.dueSourceIds,
    previousContext: options.previousContext,
    previousContextRunId: options.previousContextRunId,
  });
  const { context, request_counts: requestCounts, refreshed_source_ids: refreshedSourceIds } = collected;
  validateDisplayEligibleContextSnapshot(context);
  const contextPublish = await publishAtomicJson({
    output: context,
    baseOutputDir: options.outputDir ?? DEFAULT_OUTPUT_DIR,
    runId: contextRunId,
    fileName: APPROVED_SOURCES_OUTPUT_FILENAME,
    validate: validateDisplayEligibleContextSnapshot,
  });
  return {
    context_run_id: contextRunId,
    request_counts: requestCounts,
    refreshed_source_ids: refreshedSourceIds,
    context,
    context_publish: contextPublish,
  };
}

function uniqueRunId(prefix: string, now: Date): string {
  const timestamp = now.toISOString().replace(/[^0-9]/g, "").slice(0, 14);
  return `${prefix}_${timestamp}_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
}
