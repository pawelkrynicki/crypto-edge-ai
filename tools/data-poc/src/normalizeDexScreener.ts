import { applyBasicFilters, calculateVolumeMarketCapRatio } from "./filters.js";
import type { CryptoEdgeCandidate, DexScreenerPair } from "./types.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function normalizeDexScreenerPair(pair: DexScreenerPair, now = new Date()): CryptoEdgeCandidate {
  const filterReasons: string[] = [];
  const marketCapUsd = toNullableNumber(pair.marketCap);
  const fdvUsd = toNullableNumber(pair.fdv);
  const volume24hUsd = toNullableNumber(pair.volume?.h24);
  const liquidityUsd = toNullableNumber(pair.liquidity?.usd);
  const volumeMarketCapRatio = calculateVolumeMarketCapRatio(volume24hUsd, marketCapUsd, fdvUsd, filterReasons);
  const pairCreatedAt = normalizeTimestamp(pair.pairCreatedAt);

  const rawCandidate: CryptoEdgeCandidate = {
    symbol: pair.baseToken?.symbol || "UNKNOWN",
    name: pair.baseToken?.name ?? null,
    chain: pair.chainId || "unknown",
    contract_address: pair.baseToken?.address ?? null,
    pair_address: pair.pairAddress ?? null,
    dex: pair.dexId ?? null,
    source: "dexscreener",
    source_url: pair.url ?? null,
    price_usd: parseNullableNumber(pair.priceUsd),
    market_cap_usd: marketCapUsd,
    fdv_usd: fdvUsd,
    liquidity_usd: liquidityUsd,
    volume_24h_usd: volume24hUsd,
    volume_market_cap_ratio: volumeMarketCapRatio,
    pair_created_at: pairCreatedAt,
    pair_age_days: calculatePairAgeDays(pairCreatedAt, now),
    status: "raw",
    filter_reasons: filterReasons
  };

  return applyBasicFilters(rawCandidate);
}

export function normalizeDexScreenerPairs(pairs: DexScreenerPair[], now = new Date()): CryptoEdgeCandidate[] {
  return pairs.map((pair) => normalizeDexScreenerPair(pair, now));
}

export function calculatePairAgeDays(pairCreatedAt: string | null, now = new Date()): number | null {
  if (!pairCreatedAt) {
    return null;
  }

  const created = new Date(pairCreatedAt);
  if (Number.isNaN(created.getTime())) {
    return null;
  }

  return Math.floor((now.getTime() - created.getTime()) / MS_PER_DAY);
}

function normalizeTimestamp(timestampMs: number | undefined): string | null {
  if (!timestampMs) {
    return null;
  }

  const date = new Date(timestampMs);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

function parseNullableNumber(value: string | number | undefined): number | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toNullableNumber(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
