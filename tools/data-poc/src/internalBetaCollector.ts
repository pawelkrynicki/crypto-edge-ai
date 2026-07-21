import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { publishAtomicJson, type AtomicPublishResult } from "./atomicPublish.js";
import { BoundedHttpClient, type FetchLike } from "./boundedHttpClient.js";
import { buildCombinedScannerOutput } from "./combinedScanner.js";
import { configureCollectorNetwork } from "./collectorNetworkBootstrap.js";
import {
  assertInternalBetaCollectorEnvironment,
  type CollectorEnvironment,
} from "./collectorEnvironment.js";
import { validateDisplayEligibleContextSnapshot } from "./contextSnapshotValidator.js";
import {
  collectDexScreenerDiscovery,
  DEFAULT_DEXSCREENER_SEED_LIMIT,
  type DexScreenerDiscoveryMetadata,
} from "./dexscreenerDiscovery.js";
import {
  collectEstablishedAddressUniverse,
  type EstablishedAddressDiscoveryMetadata,
} from "./establishedAddressDiscovery.js";
import {
  loadEstablishedAddressUniverse,
  validateEstablishedAddressUniverse,
} from "./establishedAddressUniverse.js";
import { validateDisplayEligibleScannerSnapshot } from "./displaySnapshotValidator.js";
import {
  fetchGoPlusSecurityResult,
  GOPLUS_ATTRIBUTION_PROVIDER,
  type GoPlusSecurityResult,
} from "./goplusClient.js";
import { buildPersistableScannerOutput, type PersistableScannerOutput } from "./persistableScannerModel.js";
import { APPROVED_SOURCES_OUTPUT_FILENAME } from "./sources/runApprovedSourcesPoc.js";
import {
  collectInternalBetaContext,
  type ContextSourceId,
} from "./internalBetaContextCollection.js";
import type { ApprovedSourcesRunOutput } from "./sources/sourceAdapterTypes.js";
import type { CryptoEdgeCandidate } from "./types.js";

export { assertInternalBetaCollectorEnvironment, type CollectorEnvironment } from "./collectorEnvironment.js";

export const DEFAULT_SECURITY_CANDIDATE_LIMIT = 10;
export const MAX_SECURITY_CANDIDATE_LIMIT = 20;

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUTPUT_DIR = resolve(__dirname, "../../output");

export type InternalBetaCollectorOptions = {
  env?: CollectorEnvironment;
  fetchImpl?: FetchLike;
  outputDir?: string;
  seedLimit?: number;
  securityCandidateLimit?: number;
  timeoutMs?: number;
  concurrency?: number;
  now?: Date;
  goplusApiToken?: string;
  establishedUniverse?: unknown;
  establishedUniversePath?: string;
  contextDueSourceIds?: ContextSourceId[];
  previousContext?: ApprovedSourcesRunOutput;
  previousContextRunId?: string | null;
};

export type InternalBetaCollectorResult = {
  run_id: string;
  context_run_id: string;
  discovery: {
    new_emerging: DexScreenerDiscoveryMetadata;
    established: EstablishedAddressDiscoveryMetadata;
  };
  security: {
    candidates_requested: number;
    candidates_available: number;
    coverage: "FULL" | "UNAVAILABLE" | "NOT_INVOKED" | "DEGRADED";
    reason_codes: string[];
  };
  source_health: Record<string, "READY" | "DEGRADED" | "UNAVAILABLE" | "NOT_INVOKED">;
  request_counts: Record<string, number>;
  context_refreshed_source_ids: ContextSourceId[];
  scanner: PersistableScannerOutput;
  context: ApprovedSourcesRunOutput;
  scanner_publish: AtomicPublishResult;
  context_publish: AtomicPublishResult;
};

export async function runInternalBetaCollector(
  options: InternalBetaCollectorOptions = {},
): Promise<InternalBetaCollectorResult> {
  assertInternalBetaCollectorEnvironment(options.env ?? process.env);
  configureCollectorNetwork();

  const now = options.now ?? new Date();
  const seedLimit = clamp(options.seedLimit, DEFAULT_DEXSCREENER_SEED_LIMIT, 1, 30);
  const securityLimit = clamp(options.securityCandidateLimit, DEFAULT_SECURITY_CANDIDATE_LIMIT, 1, MAX_SECURITY_CANDIDATE_LIMIT);
  const universe = options.establishedUniverse === undefined
    ? loadEstablishedAddressUniverse(options.establishedUniversePath)
    : validateEstablishedAddressUniverse(options.establishedUniverse);
  const enabledUniverseEntries = universe.entries.filter((entry) => entry.enabled).length;
  const common = {
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs,
    concurrency: options.concurrency,
  };
  const clients = {
    dexscreener: new BoundedHttpClient({
      ...common,
      sourceId: "dexscreener",
      maxRequests: 1 + seedLimit + Math.min(seedLimit, 5)
        + enabledUniverseEntries + Math.min(enabledUniverseEntries, 5),
    }),
    goplus_security: new BoundedHttpClient({
      ...common,
      sourceId: "goplus_security",
      maxRequests: securityLimit + Math.min(securityLimit, 3),
    }),
  };

  const startedAt = now.toISOString();
  const newEmerging = await collectDexScreenerDiscovery({
    environment: "INTERNAL_BETA",
    seedLimit,
    now,
    client: clients.dexscreener,
  });
  const established = await collectEstablishedAddressUniverse({
    env: options.env ?? process.env,
    universe,
    now,
    client: clients.dexscreener,
  });
  const discovery = { new_emerging: newEmerging.metadata, established: established.metadata };

  const securityResults = new Map<string, GoPlusSecurityResult>();
  const combined = await buildCombinedScannerOutput({
    mode: "live",
    query: "two_basket_discovery",
    candidates: [...newEmerging.candidates, ...established.candidates],
    maxCandidates: securityLimit,
    now,
    securityEligibility: (candidate) => candidate.discovery_basket === "established",
    securityRawProvider: async (candidate) => {
      const result = await fetchCandidateSecurity(candidate, clients.goplus_security, options.goplusApiToken);
      securityResults.set(candidateKey(candidate), result);
      return { goplusRaw: result.raw, honeypotRaw: null };
    },
  });

  for (const item of combined.candidates) {
    const reasonCode = securityResults.get(candidateKey(item.candidate))?.reason_code;
    if (reasonCode && item.security && !item.security.missing_data.includes(reasonCode)) {
      item.security.missing_data.push(reasonCode);
    }
  }

  const contextRunId = uniqueRunId("approved_sources", now);
  const contextCollection = await collectInternalBetaContext({
    now,
    runId: contextRunId,
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs,
    concurrency: options.concurrency,
    outputDir: options.outputDir,
    dueSourceIds: options.contextDueSourceIds,
    previousContext: options.previousContext,
    previousContextRunId: options.previousContextRunId,
  });
  const context = contextCollection.context;

  const requestCounts = {
    dexscreener: clients.dexscreener.getStats().request_count,
    goplus_security: clients.goplus_security.getStats().request_count,
    ...contextCollection.request_counts,
  };
  validateDisplayEligibleContextSnapshot(context);

  const securityRequested = securityResults.size;
  const securityAvailable = [...securityResults.values()].filter((result) => result.availability === "available").length;
  const securityReasonCodes = [...new Set([...securityResults.values()]
    .map((result) => result.reason_code)
    .filter((reason): reason is string => Boolean(reason)))];
  const sourceHealth = buildSourceHealth(
    requestCounts,
    discovery.new_emerging,
    securityRequested,
    securityAvailable,
    context,
  );
  const finishedAt = (options.now ?? new Date()).toISOString();
  const runId = uniqueRunId("scan", now);
  const scanner = buildPersistableScannerOutput({
    combined,
    runId,
    startedAt,
    finishedAt,
    environment: "INTERNAL_BETA",
    sourceIds: [
      "dexscreener",
      ...(requestCounts.goplus_security > 0 ? ["goplus_security"] : []),
    ],
    publishScorecards: false,
    metadata: {
      discovery_architecture: "two_basket_discovery_v1",
      new_emerging: discovery.new_emerging,
      established: discovery.established,
      readiness: buildDiscoveryReadiness(discovery.established, sourceHealth),
      security_candidate_limit: securityLimit,
      security_candidates_requested: securityRequested,
      request_counts: requestCounts,
      source_health: sourceHealth,
      ...(requestCounts.goplus_security > 0
        ? { attribution: { provider: GOPLUS_ATTRIBUTION_PROVIDER } }
        : {}),
    },
  });
  validateDisplayEligibleScannerSnapshot(scanner);

  const outputDir = options.outputDir ?? DEFAULT_OUTPUT_DIR;
  const contextPublish = await publishAtomicJson({
    output: context,
    baseOutputDir: outputDir,
    runId: contextRunId,
    fileName: APPROVED_SOURCES_OUTPUT_FILENAME,
    validate: validateDisplayEligibleContextSnapshot,
  });
  const scannerPublish = await publishAtomicJson({
    output: scanner,
    baseOutputDir: outputDir,
    runId,
    fileName: "full_output.json",
    validate: validateDisplayEligibleScannerSnapshot,
  });

  return {
    run_id: runId,
    context_run_id: contextRunId,
    discovery,
    security: {
      candidates_requested: securityRequested,
      candidates_available: securityAvailable,
      coverage: securityCoverage(securityRequested, securityAvailable),
      reason_codes: securityReasonCodes,
    },
    source_health: sourceHealth,
    request_counts: requestCounts,
    context_refreshed_source_ids: contextCollection.refreshed_source_ids,
    scanner,
    context,
    scanner_publish: scannerPublish,
    context_publish: contextPublish,
  };
}

function buildDiscoveryReadiness(
  established: EstablishedAddressDiscoveryMetadata,
  sourceHealth: InternalBetaCollectorResult["source_health"],
): Record<string, string> {
  return {
    process: "READY",
    new_emerging: sourceHealth.dexscreener === "DEGRADED" ? "DEGRADED" : "READY",
    established: established.universe_status === "ESTABLISHED_UNIVERSE_EMPTY" ? "EMPTY_CONFIGURED" : "READY",
    context: sourceHealth.alternative_me_fng === "UNAVAILABLE" || sourceHealth.defillama_api === "UNAVAILABLE"
      ? "UNAVAILABLE"
      : "READY",
  };
}

export function clampSecurityCandidateLimit(value = DEFAULT_SECURITY_CANDIDATE_LIMIT): number {
  return clamp(value, DEFAULT_SECURITY_CANDIDATE_LIMIT, 1, MAX_SECURITY_CANDIDATE_LIMIT);
}

function fetchCandidateSecurity(
  candidate: CryptoEdgeCandidate,
  client: BoundedHttpClient,
  apiToken?: string,
): Promise<GoPlusSecurityResult> {
  if (!candidate.contract_address) {
    return Promise.resolve({
      raw: null,
      availability: "unavailable",
      reason_code: "GOPLUS_CONTRACT_ADDRESS_MISSING",
      request_invoked: false,
      attribution: { provider: GOPLUS_ATTRIBUTION_PROVIDER },
    });
  }
  return fetchGoPlusSecurityResult(candidate.chain, candidate.contract_address, {
    environment: "INTERNAL_BETA",
    client,
    apiToken,
  });
}

function buildSourceHealth(
  requestCounts: Record<string, number>,
  newEmerging: DexScreenerDiscoveryMetadata,
  securityRequested: number,
  securityAvailable: number,
  context: ApprovedSourcesRunOutput,
): InternalBetaCollectorResult["source_health"] {
  const contextHealth = (sourceId: string) => {
    const source = context.sources.find((candidate) => candidate.source_id === sourceId);
    if (!source || source.records.length === 0 || source.errors.length > 0) return "UNAVAILABLE" as const;
    if (source.health_status === "degraded_external_source" || source.warnings.length > 0) return "DEGRADED" as const;
    return "READY" as const;
  };
  return {
    dexscreener: requestCounts.dexscreener > 0 ? newEmerging.discovery_status : "UNAVAILABLE",
    goplus_security: securityRequested === 0
      ? "NOT_INVOKED"
      : securityAvailable === 0
        ? "UNAVAILABLE"
        : securityAvailable === securityRequested
          ? "READY"
          : "DEGRADED",
    alternative_me_fng: contextHealth("alternative_me_fng"),
    defillama_api: contextHealth("defillama_api"),
  };
}

function securityCoverage(requested: number, available: number): InternalBetaCollectorResult["security"]["coverage"] {
  if (requested === 0) return "NOT_INVOKED";
  if (available === 0) return "UNAVAILABLE";
  return available === requested ? "FULL" : "DEGRADED";
}

function uniqueRunId(prefix: string, now: Date): string {
  const timestamp = now.toISOString().replace(/[^0-9]/g, "").slice(0, 14);
  return `${prefix}_${timestamp}_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
}

function candidateKey(candidate: CryptoEdgeCandidate): string {
  return `${candidate.chain}:${candidate.contract_address ?? candidate.pair_address ?? candidate.symbol}`.toLowerCase();
}

function clamp(value: number | undefined, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(Math.floor(Number(value)), max));
}
