export type CandidateStatus = "raw" | "passed_basic_filter" | "rejected_basic_filter";

export type DexScreenerPocMode = "live" | "fixture";

export type DexScreenerToken = {
  address?: string;
  name?: string;
  symbol?: string;
};

export type DexScreenerPair = {
  chainId?: string;
  dexId?: string;
  url?: string;
  pairAddress?: string;
  baseToken?: DexScreenerToken;
  priceUsd?: string;
  fdv?: number;
  marketCap?: number;
  pairCreatedAt?: number;
  liquidity?: {
    usd?: number;
  };
  volume?: {
    h24?: number;
  };
};

export type DexScreenerSearchResponse = {
  pairs?: DexScreenerPair[];
};

export type CryptoEdgeCandidate = {
  symbol: string;
  name: string | null;
  chain: string;
  contract_address: string | null;
  pair_address: string | null;
  dex: string | null;
  source: "dexscreener";
  source_url: string | null;
  price_usd: number | null;
  market_cap_usd: number | null;
  fdv_usd: number | null;
  liquidity_usd: number | null;
  volume_24h_usd: number | null;
  volume_market_cap_ratio: number | null;
  pair_created_at: string | null;
  pair_age_days: number | null;
  status: CandidateStatus;
  filter_reasons: string[];
};

export type PocOutput = {
  source: "dexscreener";
  mode: DexScreenerPocMode;
  query: string;
  generated_at: string;
  total_raw: number;
  total_passed: number;
  total_rejected: number;
  candidates: CryptoEdgeCandidate[];
};
