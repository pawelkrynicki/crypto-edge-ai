import { BoundedHttpClient } from "./boundedHttpClient.js";
import {
  fetchDexScreenerTokenPairs,
  fetchLatestDexScreenerTokenProfiles,
} from "./dexscreenerClient.js";
import { normalizeDexScreenerPairs } from "./normalizeDexScreener.js";
import type { CryptoEdgeCandidate, DexScreenerPair, DexScreenerTokenProfile } from "./types.js";

export const DEXSCREENER_DISCOVERY_METHOD = "dexscreener_latest_token_profiles";
export const DEFAULT_DEXSCREENER_SEED_LIMIT = 20;
export const MAX_DEXSCREENER_SEED_LIMIT = 30;

export type DexScreenerDiscoveryMetadata = {
  discovery_method: typeof DEXSCREENER_DISCOVERY_METHOD;
  seed_count: number;
  pairs_loaded: number;
  candidates_before_filters: number;
  candidates_after_filters: number;
};

export type DexScreenerDiscoveryResult = {
  candidates: CryptoEdgeCandidate[];
  metadata: DexScreenerDiscoveryMetadata;
};

export type DexScreenerDiscoveryOptions = {
  environment: string;
  seedLimit?: number;
  now?: Date;
  client: BoundedHttpClient;
};

type Seed = { chainId: string; tokenAddress: string };

export async function collectDexScreenerDiscovery(
  options: DexScreenerDiscoveryOptions,
): Promise<DexScreenerDiscoveryResult> {
  const seedLimit = clampSeedLimit(options.seedLimit);
  const profiles = await fetchLatestDexScreenerTokenProfiles({
    environment: options.environment,
    client: options.client,
  });
  const seeds = selectProfileSeeds(profiles, seedLimit);
  if (seeds.length === 0) {
    throw new Error("DEXSCREENER_SEEDS_UNAVAILABLE");
  }

  const pairGroups = await Promise.all(seeds.map(async (seed) => ({
    seed,
    pairs: await fetchDexScreenerTokenPairs(seed.chainId, seed.tokenAddress, {
      environment: options.environment,
      client: options.client,
    }),
  })));

  const pairsLoaded = pairGroups.reduce((total, group) => total + group.pairs.length, 0);
  const selectedPairs = pairGroups
    .map(({ seed, pairs }) => selectHighestLiquidityPair(seed, pairs))
    .filter((pair): pair is DexScreenerPair => pair !== null);
  const deduplicatedPairs = deduplicatePairs(selectedPairs);
  if (deduplicatedPairs.length === 0) {
    throw new Error("DEXSCREENER_PAIRS_UNAVAILABLE");
  }
  const candidates = normalizeDexScreenerPairs(deduplicatedPairs, options.now ?? new Date()).map((candidate) => ({
    ...candidate,
    discovery_basket: "new_emerging" as const,
    discovery_method: DEXSCREENER_DISCOVERY_METHOD as typeof DEXSCREENER_DISCOVERY_METHOD,
    observation_only: true,
    established_eligible: false,
    universe_version: null,
    universe_entry_index: null,
    address_identity_verified: false,
  }));

  return {
    candidates,
    metadata: {
      discovery_method: DEXSCREENER_DISCOVERY_METHOD,
      seed_count: seeds.length,
      pairs_loaded: pairsLoaded,
      candidates_before_filters: deduplicatedPairs.length,
      candidates_after_filters: candidates.filter((candidate) => candidate.status === "passed_basic_filter").length,
    },
  };
}

export function selectProfileSeeds(profiles: DexScreenerTokenProfile[], limit: number): Seed[] {
  const selected: Seed[] = [];
  const seen = new Set<string>();

  for (const profile of profiles) {
    if (selected.length >= clampSeedLimit(limit)) break;
    if (typeof profile.chainId !== "string" || typeof profile.tokenAddress !== "string") continue;
    const chainId = profile.chainId.trim();
    const tokenAddress = profile.tokenAddress.trim();
    if (!chainId || !tokenAddress) continue;
    const key = `${chainId.toLowerCase()}:${tokenAddress.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    selected.push({ chainId, tokenAddress });
  }

  return selected;
}

export function selectHighestLiquidityPair(seed: Seed, pairs: DexScreenerPair[]): DexScreenerPair | null {
  const matching = pairs.filter((pair) => {
    const address = pair.baseToken?.address;
    return typeof address === "string"
      && pair.chainId?.toLowerCase() === seed.chainId.toLowerCase()
      && address.toLowerCase() === seed.tokenAddress.toLowerCase()
      && typeof pair.liquidity?.usd === "number"
      && Number.isFinite(pair.liquidity.usd)
      && pair.liquidity.usd >= 0;
  });

  return matching.reduce<DexScreenerPair | null>((best, pair) => {
    if (!best) return pair;
    return Number(pair.liquidity?.usd) > Number(best.liquidity?.usd) ? pair : best;
  }, null);
}

export function deduplicatePairs(pairs: DexScreenerPair[]): DexScreenerPair[] {
  const seen = new Set<string>();
  return pairs.filter((pair) => {
    const key = [pair.chainId, pair.baseToken?.address, pair.pairAddress]
      .map((value) => String(value ?? "").toLowerCase())
      .join(":");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function clampSeedLimit(value = DEFAULT_DEXSCREENER_SEED_LIMIT): number {
  if (!Number.isFinite(value)) return DEFAULT_DEXSCREENER_SEED_LIMIT;
  return Math.max(1, Math.min(Math.floor(value), MAX_DEXSCREENER_SEED_LIMIT));
}
