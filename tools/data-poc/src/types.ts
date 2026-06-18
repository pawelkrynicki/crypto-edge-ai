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

export type SecurityPocMode = "live" | "fixture";

export type SecurityCandidate = {
  symbol: string;
  chain: string;
  contract_address: string | null;
};

export type HoneypotStatus = "passed" | "failed" | "unknown";
export type OwnershipStatus = "renounced" | "active" | "unknown";
export type SecurityLabel = "SECURITY_PASSED" | "NEEDS_MANUAL_VERIFICATION" | "CRITICAL_RISK";

export type NormalizedSecurity = {
  sources: ("goplus" | "honeypot")[];
  honeypot_status: HoneypotStatus;
  buy_tax: number | null;
  sell_tax: number | null;
  contract_verified: boolean | null;
  ownership_status: OwnershipStatus;
  liquidity_locked: boolean | null;
  liquidity_lock_days: number | null;
  mint_risk: boolean | null;
  blacklist_risk: boolean | null;
  whitelist_risk: boolean | null;
  sell_restriction_risk: boolean | null;
  proxy_risk: boolean | null;
  top_wallet_pct: number | null;
  top_10_wallets_pct: number | null;
  risk_flags: string[];
  missing_data: string[];
  raw_sources_available: {
    goplus: boolean;
    honeypot: boolean;
  };
};

export type SecurityDecision = {
  security_label: SecurityLabel;
  critical_reasons: string[];
  warning_reasons: string[];
};

export type SecurityPocOutput = {
  source: "security-poc";
  mode: SecurityPocMode;
  generated_at: string;
  candidate: SecurityCandidate;
  security: NormalizedSecurity;
  decision: SecurityDecision;
};

export type GoPlusTokenSecurityResponse = Record<string, unknown>;
export type HoneypotTokenResponse = Record<string, unknown>;
