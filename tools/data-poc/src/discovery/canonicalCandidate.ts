import type { CryptoEdgeCandidate, NormalizedSocialLink } from "../types.js";

export const CRYPTO_EDGE_CANDIDATE_OBSERVATION_SCHEMA_VERSION = "crypto_edge_candidate_observation_v1" as const;

/** Source-neutral asset identity. Address normalization is intentionally deferred. */
export type CanonicalAssetIdentity = {
  chain: string;
  contract_or_mint: string | null;
};

export type CanonicalCandidateDisplay = {
  symbol: string;
  name: string | null;
};

export type CanonicalPairReference = {
  pair_address: string | null;
  dex: string | null;
};

export type CanonicalMarketObservation = {
  price_usd: number | null;
  market_cap_usd: number | null;
  fdv_usd: number | null;
  liquidity_usd: number | null;
  volume_24h_usd: number | null;
  volume_market_cap_ratio: number | null;
  pair_created_at: string | null;
  pair_age_days: number | null;
};

export type CanonicalProviderReference = {
  provider_id: string;
  source_url: string | null;
  observed_at: string;
  provider_candidate_id: string | null;
  discovery_method: string | null;
};

/**
 * A source-neutral observation. It intentionally excludes lifecycle, filter,
 * security, and persisted-scanner state so that providers can share one
 * additive candidate contract without changing the current Core candidate.
 */
export type CanonicalCandidateObservation = {
  schema_version: typeof CRYPTO_EDGE_CANDIDATE_OBSERVATION_SCHEMA_VERSION;
  identity: CanonicalAssetIdentity;
  display: CanonicalCandidateDisplay;
  pair: CanonicalPairReference | null;
  market: CanonicalMarketObservation;
  social_links: NormalizedSocialLink[];
  observed_at: string;
  discovered_at: string | null;
  confidence: number | null;
  provider_references: CanonicalProviderReference[];
};

/**
 * Maps the existing DEXScreener candidate into the additive canonical
 * observation contract. The caller provides observation time explicitly so
 * this adapter is deterministic and performs no I/O or clock reads.
 */
export function canonicalizeLegacyCandidate(
  candidate: CryptoEdgeCandidate,
  observedAt: string,
): CanonicalCandidateObservation {
  return {
    schema_version: CRYPTO_EDGE_CANDIDATE_OBSERVATION_SCHEMA_VERSION,
    identity: {
      chain: candidate.chain,
      contract_or_mint: candidate.contract_address,
    },
    display: {
      symbol: candidate.symbol,
      name: candidate.name,
    },
    pair: candidate.pair_address === null && candidate.dex === null
      ? null
      : {
          pair_address: candidate.pair_address,
          dex: candidate.dex,
        },
    market: {
      price_usd: candidate.price_usd,
      market_cap_usd: candidate.market_cap_usd,
      fdv_usd: candidate.fdv_usd,
      liquidity_usd: candidate.liquidity_usd,
      volume_24h_usd: candidate.volume_24h_usd,
      volume_market_cap_ratio: candidate.volume_market_cap_ratio,
      pair_created_at: candidate.pair_created_at,
      pair_age_days: candidate.pair_age_days,
    },
    social_links: (candidate.social_links ?? []).map((link) => ({ ...link })),
    observed_at: observedAt,
    discovered_at: null,
    confidence: null,
    provider_references: [{
      provider_id: "dexscreener",
      source_url: candidate.source_url,
      observed_at: observedAt,
      provider_candidate_id: null,
      discovery_method: candidate.discovery_method ?? null,
    }],
  };
}
