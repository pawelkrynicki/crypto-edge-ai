// ─────────────────────────────────────────────────────────────────────────────
// scannerTypes.ts
// Types for the Crypto Edge AI scanner pipeline.
//
// Two type families:
//   1. Persistable* — matches the shape of full_output.json / PersistableScanner
//      output from tools/data-poc. Used as the data-source contract.
//   2. UiTokenCandidate — the flat, UI-ready shape consumed by all components.
//
// No runtime logic here — types only.
// ─────────────────────────────────────────────────────────────────────────────

// ── Persistable types ────────────────────────────────────────────────────────

export type PersistableFinalLabel =
  | "WATCHLIST"
  | "CRITICAL_RISK"
  | "NEEDS_MANUAL_VERIFICATION"
  | "REJECT";

export type PersistableSecurityLabel =
  | "SECURITY_PASSED"
  | "NEEDS_MANUAL_VERIFICATION"
  | "CRITICAL_RISK"
  | "NOT_CHECKED";

export type PersistableBasicFilterStatus =
  | "passed_basic_filter"
  | "rejected_basic_filter";

export type PersistableHoneypotStatus = "passed" | "failed" | "unknown";
export type PersistableOwnershipStatus = "renounced" | "active" | "unknown";

/** Security check record — one per candidate, keyed by candidate_id. */
export interface PersistableSecurityCheck {
  id: string;
  candidate_id: string;
  checked_at: string; // ISO 8601
  source: "goplus" | "honeypot" | "combined" | "manual";
  honeypot_status: PersistableHoneypotStatus;
  buy_tax: number | null;
  sell_tax: number | null;
  contract_verified: boolean | null;
  ownership_status: PersistableOwnershipStatus;
  liquidity_locked: boolean | null;
  liquidity_lock_days: number | null;
  mint_risk: boolean | null;
  blacklist_risk: boolean | null;
  sell_restriction_risk: boolean | null;
  top_wallet_pct: number | null;
  top_10_wallets_pct: number | null;
  risk_flags: string[];
  missing_data: string[];
  raw_goplus: Record<string, unknown> | null;
  raw_honeypot: Record<string, unknown> | null;
}

/** Scorecard record — optional, one per candidate. */
export interface PersistableScorecard {
  id: string;
  candidate_id: string;
  created_at: string; // ISO 8601
  total_score: number | null;
  filter_score: number | null;
  security_score: number | null;
  volume_score: number | null;
  liquidity_score: number | null;
  age_score: number | null;
  notes: string | null;
}

/** Core candidate record. */
export interface PersistableCandidate {
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
  basic_filter_status: PersistableBasicFilterStatus;
  security_label: PersistableSecurityLabel;
  final_label: PersistableFinalLabel;
  final_reasons: string[];
  created_at: string; // ISO 8601
}

/** Scan run metadata. */
export interface PersistableScanRun {
  id: string;
  started_at: string;
  finished_at: string | null;
  chains: string[];
  total_discovered: number;
  total_passed_basic: number;
  total_watchlist: number;
  total_critical: number;
  total_needs_manual: number;
  total_rejected: number;
  notes: string | null;
}

/** Top-level output shape — matches full_output.json. */
export interface PersistableScannerOutput {
  scan_run: PersistableScanRun;
  candidates: PersistableCandidate[];
  security_checks: PersistableSecurityCheck[];
  scorecards: PersistableScorecard[];
}

// ── UI type ──────────────────────────────────────────────────────────────────

/** Flat, UI-ready candidate consumed by all React components. */
export interface UiTokenCandidate {
  // Identity
  id: string;
  symbol: string;
  name: string;
  chain: string;
  dex: string;
  contractAddress: string;
  pairAddress: string;
  sourceUrl: string;

  // Market data
  marketCap: number;
  liquidity: number;
  volume24h: number;
  volumeMarketCapRatio: number;
  pairAgeDays: number;

  // Labels
  basicFilterStatus: PersistableBasicFilterStatus;
  securityLabel: PersistableSecurityLabel;
  finalLabel: PersistableFinalLabel;

  // Reasons (split for UI rendering)
  mainReason: string;
  filterReasons: string[];
  criticalReasons: string[];
  warningReasons: string[];

  // Security detail (null when NOT_CHECKED)
  missingData: string[];
  riskFlags: string[];
  security: {
    honeypotStatus: PersistableHoneypotStatus;
    buyTax: number | null;
    sellTax: number | null;
    contractVerified: boolean | null;
    ownershipStatus: PersistableOwnershipStatus;
    liquidityLocked: boolean | null;
    liquidityLockDays: number | null;
    mintRisk: boolean | null;
    blacklistRisk: boolean | null;
    sellRestrictionRisk: boolean | null;
    topWalletPct: number | null;
    top10WalletsPct: number | null;
  } | null;

  // Scorecard (null when absent)
  scorecard: {
    totalScore: number | null;
    filterScore: number | null;
    securityScore: number | null;
    volumeScore: number | null;
    liquidityScore: number | null;
    ageScore: number | null;
    notes: string | null;
  } | null;

  // Timestamps
  lastCheckedAt: string; // ISO 8601
}
