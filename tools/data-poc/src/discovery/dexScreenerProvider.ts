import type { BoundedHttpClient } from "../boundedHttpClient.js";
import {
  collectDexScreenerDiscovery,
  type DexScreenerDiscoveryOptions,
  type DexScreenerDiscoveryResult,
} from "../dexscreenerDiscovery.js";
import { canonicalizeLegacyCandidate } from "./canonicalCandidate.js";
import {
  CRYPTO_EDGE_PROVIDER_DISCOVERY_BATCH_SCHEMA_VERSION,
  parseDiscoveryObservedAt,
  type DiscoveryProvider,
  type ProviderDiscoveryBatch,
} from "./discoveryProvider.js";

export const DEXSCREENER_PROVIDER_ID = "dexscreener" as const;

export type DexScreenerCollect = (options: DexScreenerDiscoveryOptions) => Promise<DexScreenerDiscoveryResult>;

export type DexScreenerProviderDependencies = {
  client: BoundedHttpClient;
  seedLimit?: number;
  collect?: DexScreenerCollect;
};

/**
 * Creates a shadow-only provider facade around the existing DEXScreener
 * collector. It delegates collection unchanged and has no production caller.
 */
export function createDexScreenerProvider(dependencies: DexScreenerProviderDependencies): DiscoveryProvider {
  const collect = dependencies.collect ?? collectDexScreenerDiscovery;

  return {
    id: DEXSCREENER_PROVIDER_ID,
    async discover(request): Promise<ProviderDiscoveryBatch> {
      const observedAtDate = parseDiscoveryObservedAt(request.observed_at);
      const result = await collect({
        environment: request.environment,
        seedLimit: dependencies.seedLimit,
        now: observedAtDate,
        client: dependencies.client,
      });
      return adaptDexScreenerDiscoveryResult(result, request.observed_at);
    },
  };
}

/** Pure adaptation of the legacy discovery result into a generic provider batch. */
export function adaptDexScreenerDiscoveryResult(
  result: DexScreenerDiscoveryResult,
  observedAt: string,
): ProviderDiscoveryBatch {
  const candidates = result.candidates.map((candidate) => canonicalizeLegacyCandidate(candidate, observedAt));

  return {
    schema_version: CRYPTO_EDGE_PROVIDER_DISCOVERY_BATCH_SCHEMA_VERSION,
    provider_id: DEXSCREENER_PROVIDER_ID,
    observed_at: observedAt,
    candidates,
    diagnostics: {
      status: result.metadata.discovery_status,
      records_received: result.metadata.pairs_loaded,
      records_emitted: candidates.length,
      reason_codes: Object.entries(result.metadata.failure_reason_counts)
        .filter(([, count]) => typeof count === "number" && count > 0)
        .map(([reasonCode]) => reasonCode)
        .sort(),
    },
  };
}
