// ─────────────────────────────────────────────────────────────────────────────
// Mock data for Crypto Edge AI Camp BETA UI preview.
// Data structure is aligned with CombinedScannerCandidate / PersistableScanner
// output from tools/data-poc. No real API calls are made.
// ─────────────────────────────────────────────────────────────────────────────

export type FinalLabel = "WATCHLIST" | "CRITICAL_RISK" | "NEEDS_MANUAL_VERIFICATION" | "REJECT";
export type SecurityLabel = "SECURITY_PASSED" | "NEEDS_MANUAL_VERIFICATION" | "CRITICAL_RISK" | "NOT_CHECKED";
export type BasicFilterStatus = "passed_basic_filter" | "rejected_basic_filter";

export interface NormalizedSecurity {
  honeypot_status: "passed" | "failed" | "unknown";
  buy_tax: number | null;
  sell_tax: number | null;
  contract_verified: boolean | null;
  ownership_status: "renounced" | "active" | "unknown";
  liquidity_locked: boolean | null;
  liquidity_lock_days: number | null;
  mint_risk: boolean | null;
  blacklist_risk: boolean | null;
  sell_restriction_risk: boolean | null;
  top_wallet_pct: number | null;
  top_10_wallets_pct: number | null;
  risk_flags: string[];
  missing_data: string[];
}

export interface MockCandidate {
  id: string;
  symbol: string;
  name: string;
  chain: string;
  dex: string;
  contract_address: string;
  pair_address: string;
  source_url: string;
  price_usd: number | null;
  market_cap_usd: number;
  fdv_usd: number | null;
  liquidity_usd: number;
  volume_24h_usd: number;
  volume_market_cap_ratio: number;
  pair_age_days: number;
  basic_filter_status: BasicFilterStatus;
  security_label: SecurityLabel;
  final_label: FinalLabel;
  final_reasons: string[];
  security: NormalizedSecurity | null;
  last_checked: string;
}

export const MOCK_CANDIDATES: MockCandidate[] = [
  // ── A. PASS / Solana / WATCHLIST ──────────────────────────────────────────
  {
    id: "pass-sol-1",
    symbol: "PASS",
    name: "PassToken",
    chain: "solana",
    dex: "Raydium",
    contract_address: "PassXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    pair_address: "PairPassXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    source_url: "https://dexscreener.com/solana/PairPassXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    price_usd: 0.00142,
    market_cap_usd: 1_000_000,
    fdv_usd: 1_200_000,
    liquidity_usd: 120_000,
    volume_24h_usd: 100_000,
    volume_market_cap_ratio: 0.10,
    pair_age_days: 45,
    basic_filter_status: "passed_basic_filter",
    security_label: "SECURITY_PASSED",
    final_label: "WATCHLIST",
    final_reasons: ["Passed basic filters and security checks"],
    security: {
      honeypot_status: "passed",
      buy_tax: 1.0,
      sell_tax: 1.0,
      contract_verified: true,
      ownership_status: "renounced",
      liquidity_locked: true,
      liquidity_lock_days: 180,
      mint_risk: false,
      blacklist_risk: false,
      sell_restriction_risk: false,
      top_wallet_pct: 4.2,
      top_10_wallets_pct: 22.1,
      risk_flags: [],
      missing_data: [],
    },
    last_checked: "2026-06-18T08:00:00Z",
  },

  // ── B. LOWL / Ethereum / REJECT ───────────────────────────────────────────
  {
    id: "lowl-eth-1",
    symbol: "LOWL",
    name: "LowLiquid",
    chain: "ethereum",
    dex: "Uniswap V3",
    contract_address: "0xLOWLXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    pair_address: "0xPairLOWLXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    source_url: "https://dexscreener.com/ethereum/0xPairLOWLXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    price_usd: 0.00089,
    market_cap_usd: 800_000,
    fdv_usd: 900_000,
    liquidity_usd: 12_000,
    volume_24h_usd: 60_000,
    volume_market_cap_ratio: 0.075,
    pair_age_days: 12,
    basic_filter_status: "rejected_basic_filter",
    security_label: "NOT_CHECKED",
    final_label: "REJECT",
    final_reasons: ["Liquidity below minimum threshold ($30K)"],
    security: null,
    last_checked: "2026-06-18T08:00:00Z",
  },

  // ── C. MINT / BSC / CRITICAL_RISK ────────────────────────────────────────
  {
    id: "mint-bsc-1",
    symbol: "MINT",
    name: "MintRisk",
    chain: "bsc",
    dex: "PancakeSwap",
    contract_address: "0xMINTXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    pair_address: "0xPairMINTXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    source_url: "https://dexscreener.com/bsc/0xPairMINTXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    price_usd: 0.00231,
    market_cap_usd: 1_500_000,
    fdv_usd: 2_000_000,
    liquidity_usd: 90_000,
    volume_24h_usd: 75_000,
    volume_market_cap_ratio: 0.05,
    pair_age_days: 8,
    basic_filter_status: "passed_basic_filter",
    security_label: "CRITICAL_RISK",
    final_label: "CRITICAL_RISK",
    final_reasons: ["Mint risk detected — contract can issue new tokens"],
    security: {
      honeypot_status: "passed",
      buy_tax: 5.0,
      sell_tax: 5.0,
      contract_verified: true,
      ownership_status: "active",
      liquidity_locked: false,
      liquidity_lock_days: null,
      mint_risk: true,
      blacklist_risk: false,
      sell_restriction_risk: false,
      top_wallet_pct: 12.5,
      top_10_wallets_pct: 48.3,
      risk_flags: ["mint_risk_detected", "liquidity_lock_missing"],
      missing_data: [],
    },
    last_checked: "2026-06-18T08:00:00Z",
  },

  // ── D. MISS / Base / NEEDS_MANUAL_VERIFICATION ───────────────────────────
  {
    id: "miss-base-1",
    symbol: "MISS",
    name: "MissingData",
    chain: "base",
    dex: "BaseSwap",
    contract_address: "0xMISSXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    pair_address: "0xPairMISSXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    source_url: "https://dexscreener.com/base/0xPairMISSXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    price_usd: 0.00055,
    market_cap_usd: 950_000,
    fdv_usd: 1_100_000,
    liquidity_usd: 70_000,
    volume_24h_usd: 55_000,
    volume_market_cap_ratio: 0.058,
    pair_age_days: 21,
    basic_filter_status: "passed_basic_filter",
    security_label: "NEEDS_MANUAL_VERIFICATION",
    final_label: "NEEDS_MANUAL_VERIFICATION",
    final_reasons: ["Missing data: liquidity_lock_missing, top_10_wallets_pct_missing"],
    security: {
      honeypot_status: "passed",
      buy_tax: 2.0,
      sell_tax: 2.0,
      contract_verified: true,
      ownership_status: "unknown",
      liquidity_locked: null,
      liquidity_lock_days: null,
      mint_risk: false,
      blacklist_risk: false,
      sell_restriction_risk: false,
      top_wallet_pct: 7.8,
      top_10_wallets_pct: null,
      risk_flags: [],
      missing_data: ["liquidity_lock_missing", "top_10_wallets_pct_missing"],
    },
    last_checked: "2026-06-18T08:00:00Z",
  },

  // ── E. NOVA / Solana / WATCHLIST ──────────────────────────────────────────
  {
    id: "nova-sol-2",
    symbol: "NOVA",
    name: "NovaProtocol",
    chain: "solana",
    dex: "Orca",
    contract_address: "NovaXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    pair_address: "PairNovaXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    source_url: "https://dexscreener.com/solana/PairNovaXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    price_usd: 0.00318,
    market_cap_usd: 2_100_000,
    fdv_usd: 2_500_000,
    liquidity_usd: 185_000,
    volume_24h_usd: 210_000,
    volume_market_cap_ratio: 0.10,
    pair_age_days: 33,
    basic_filter_status: "passed_basic_filter",
    security_label: "SECURITY_PASSED",
    final_label: "WATCHLIST",
    final_reasons: ["Passed basic filters and security checks"],
    security: {
      honeypot_status: "passed",
      buy_tax: 0.5,
      sell_tax: 0.5,
      contract_verified: true,
      ownership_status: "renounced",
      liquidity_locked: true,
      liquidity_lock_days: 365,
      mint_risk: false,
      blacklist_risk: false,
      sell_restriction_risk: false,
      top_wallet_pct: 3.1,
      top_10_wallets_pct: 18.4,
      risk_flags: [],
      missing_data: [],
    },
    last_checked: "2026-06-18T08:00:00Z",
  },

  // ── F. RUGX / BSC / CRITICAL_RISK ────────────────────────────────────────
  {
    id: "rugx-bsc-2",
    symbol: "RUGX",
    name: "RugXToken",
    chain: "bsc",
    dex: "PancakeSwap",
    contract_address: "0xRUGXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    pair_address: "0xPairRUGXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    source_url: "https://dexscreener.com/bsc/0xPairRUGXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    price_usd: 0.00009,
    market_cap_usd: 500_000,
    fdv_usd: 800_000,
    liquidity_usd: 35_000,
    volume_24h_usd: 42_000,
    volume_market_cap_ratio: 0.084,
    pair_age_days: 3,
    basic_filter_status: "passed_basic_filter",
    security_label: "CRITICAL_RISK",
    final_label: "CRITICAL_RISK",
    final_reasons: ["Honeypot detected", "Tax above threshold (buy 25%, sell 30%)"],
    security: {
      honeypot_status: "failed",
      buy_tax: 25.0,
      sell_tax: 30.0,
      contract_verified: false,
      ownership_status: "active",
      liquidity_locked: false,
      liquidity_lock_days: null,
      mint_risk: true,
      blacklist_risk: true,
      sell_restriction_risk: true,
      top_wallet_pct: 38.0,
      top_10_wallets_pct: 72.5,
      risk_flags: ["honeypot_detected", "tax_above_threshold", "mint_risk_detected", "blacklist_risk_detected", "sell_restriction_risk"],
      missing_data: [],
    },
    last_checked: "2026-06-18T08:00:00Z",
  },

  // ── G. VELO / Ethereum / NEEDS_MANUAL_VERIFICATION ───────────────────────
  {
    id: "velo-eth-2",
    symbol: "VELO",
    name: "VeloToken",
    chain: "ethereum",
    dex: "Uniswap V2",
    contract_address: "0xVELOXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    pair_address: "0xPairVELOXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    source_url: "https://dexscreener.com/ethereum/0xPairVELOXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    price_usd: 0.00412,
    market_cap_usd: 3_200_000,
    fdv_usd: 4_000_000,
    liquidity_usd: 95_000,
    volume_24h_usd: 88_000,
    volume_market_cap_ratio: 0.0275,
    pair_age_days: 60,
    basic_filter_status: "passed_basic_filter",
    security_label: "NEEDS_MANUAL_VERIFICATION",
    final_label: "NEEDS_MANUAL_VERIFICATION",
    final_reasons: ["Missing data: top_wallet_pct_missing, contract_verification_missing"],
    security: {
      honeypot_status: "passed",
      buy_tax: 3.0,
      sell_tax: 3.0,
      contract_verified: null,
      ownership_status: "unknown",
      liquidity_locked: true,
      liquidity_lock_days: 90,
      mint_risk: false,
      blacklist_risk: null,
      sell_restriction_risk: false,
      top_wallet_pct: null,
      top_10_wallets_pct: null,
      risk_flags: [],
      missing_data: ["top_wallet_pct_missing", "contract_verification_missing"],
    },
    last_checked: "2026-06-18T08:00:00Z",
  },

  // ── H. DRFT / Base / REJECT ───────────────────────────────────────────────
  {
    id: "drft-base-3",
    symbol: "DRFT",
    name: "DriftCoin",
    chain: "base",
    dex: "Aerodrome",
    contract_address: "0xDRFTXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    pair_address: "0xPairDRFTXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    source_url: "https://dexscreener.com/base/0xPairDRFTXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    price_usd: 0.00003,
    market_cap_usd: 150_000,
    fdv_usd: 200_000,
    liquidity_usd: 8_000,
    volume_24h_usd: 5_000,
    volume_market_cap_ratio: 0.033,
    pair_age_days: 2,
    basic_filter_status: "rejected_basic_filter",
    security_label: "NOT_CHECKED",
    final_label: "REJECT",
    final_reasons: ["Market cap below minimum ($300K)", "Liquidity below minimum ($30K)", "Volume below minimum ($30K)"],
    security: null,
    last_checked: "2026-06-18T08:00:00Z",
  },

  // ── I. APEX / Solana / WATCHLIST ──────────────────────────────────────────
  {
    id: "apex-sol-3",
    symbol: "APEX",
    name: "ApexFinance",
    chain: "solana",
    dex: "Raydium",
    contract_address: "ApexXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    pair_address: "PairApexXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    source_url: "https://dexscreener.com/solana/PairApexXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    price_usd: 0.00721,
    market_cap_usd: 4_500_000,
    fdv_usd: 5_000_000,
    liquidity_usd: 320_000,
    volume_24h_usd: 450_000,
    volume_market_cap_ratio: 0.10,
    pair_age_days: 90,
    basic_filter_status: "passed_basic_filter",
    security_label: "SECURITY_PASSED",
    final_label: "WATCHLIST",
    final_reasons: ["Passed basic filters and security checks"],
    security: {
      honeypot_status: "passed",
      buy_tax: 0.0,
      sell_tax: 0.0,
      contract_verified: true,
      ownership_status: "renounced",
      liquidity_locked: true,
      liquidity_lock_days: 730,
      mint_risk: false,
      blacklist_risk: false,
      sell_restriction_risk: false,
      top_wallet_pct: 2.8,
      top_10_wallets_pct: 15.2,
      risk_flags: [],
      missing_data: [],
    },
    last_checked: "2026-06-18T08:00:00Z",
  },

  // ── J. FLUX / BSC / NEEDS_MANUAL_VERIFICATION ────────────────────────────
  {
    id: "flux-bsc-4",
    symbol: "FLUX",
    name: "FluxProtocol",
    chain: "bsc",
    dex: "PancakeSwap",
    contract_address: "0xFLUXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    pair_address: "0xPairFLUXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    source_url: "https://dexscreener.com/bsc/0xPairFLUXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    price_usd: 0.00188,
    market_cap_usd: 1_800_000,
    fdv_usd: 2_200_000,
    liquidity_usd: 110_000,
    volume_24h_usd: 95_000,
    volume_market_cap_ratio: 0.0528,
    pair_age_days: 17,
    basic_filter_status: "passed_basic_filter",
    security_label: "NEEDS_MANUAL_VERIFICATION",
    final_label: "NEEDS_MANUAL_VERIFICATION",
    final_reasons: ["Missing data: ownership_status_unknown, liquidity_lock_missing"],
    security: {
      honeypot_status: "passed",
      buy_tax: 1.5,
      sell_tax: 1.5,
      contract_verified: true,
      ownership_status: "unknown",
      liquidity_locked: null,
      liquidity_lock_days: null,
      mint_risk: false,
      blacklist_risk: false,
      sell_restriction_risk: false,
      top_wallet_pct: 9.1,
      top_10_wallets_pct: 31.4,
      risk_flags: [],
      missing_data: ["ownership_status_unknown", "liquidity_lock_missing"],
    },
    last_checked: "2026-06-18T08:00:00Z",
  },
];

export const MOCK_SUMMARY = {
  total_candidates: MOCK_CANDIDATES.length,
  watchlist: MOCK_CANDIDATES.filter((c) => c.final_label === "WATCHLIST").length,
  critical_risk: MOCK_CANDIDATES.filter((c) => c.final_label === "CRITICAL_RISK").length,
  needs_manual_verification: MOCK_CANDIDATES.filter((c) => c.final_label === "NEEDS_MANUAL_VERIFICATION").length,
  rejected: MOCK_CANDIDATES.filter((c) => c.final_label === "REJECT").length,
};
