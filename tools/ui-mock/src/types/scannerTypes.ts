// Types for the Crypto Edge AI scanner pipeline.
//
// Persistable* mirrors tools/data-poc/src/persistableScannerModel.ts.
// UiTokenCandidate is the UI-facing shape produced by the adapter.

export type PersistableFinalLabel =
  | "WATCHLIST"
  | "CRITICAL_RISK"
  | "NEEDS_MANUAL_VERIFICATION"
  | "REJECT";

export type PersistableSecurityLabel =
  | "SECURITY_PASSED"
  | "NEEDS_MANUAL_VERIFICATION"
  | "CRITICAL_RISK"
  | "NOT_CHECKED"
  | "CRITICAL RISK"
  | "NEEDS MANUAL VERIFICATION"
  | "SECURITY DATA UNAVAILABLE"
  | "PARTIAL SECURITY COVERAGE";

export type PersistableBasicFilterStatus =
  | "passed_basic_filter"
  | "rejected_basic_filter";

export type PersistableRiskLevel = "low" | "medium" | "high" | "critical" | null;

export type PersistableScanRun = {
  run_id: string;
  source: "combined-scanner-poc";
  mode: "fixture" | "live";
  query: string;
  filters?: Record<string, unknown>;
  limits?: Record<string, unknown>;
  started_at: string | null;
  finished_at: string;
  total_raw: number;
  passed_basic_filter: number;
  rejected_basic_filter: number;
  security_checked: number;
  security_passed: number;
  needs_manual_verification: number;
  critical_risk: number;
  watchlist_candidates: number;
  errors: string[];
};

export type PersistableCandidate = {
  run_id: string;
  candidate_id: string;
  symbol: string;
  name: string | null;
  chain: string;
  contract_address: string | null;
  pair_address: string | null;
  dex: string | null;
  source: string;
  source_url: string | null;
  price_usd: number | null;
  market_cap_usd: number | null;
  fdv_usd: number | null;
  liquidity_usd: number | null;
  volume_24h_usd: number | null;
  volume_market_cap_ratio: number | null;
  pair_created_at: string | null;
  pair_age_days: number | null;
  basic_filter_status: string;
  filter_reasons: string[];
  final_label: string;
  final_reasons: string[];
  created_at: string;
};

export type PersistableSecurityCheck = {
  run_id: string;
  candidate_id: string;
  sources: string[];
  coverage_status?: "SECURITY DATA UNAVAILABLE" | "PARTIAL SECURITY COVERAGE" | null;
  honeypot_status: string;
  buy_tax: number | null;
  sell_tax: number | null;
  contract_verified: boolean | null;
  ownership_status: string;
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
  security_label: string;
  critical_reasons: string[];
  warning_reasons: string[];
  checked_at: string | null;
};

export type PersistableScorecard = {
  run_id: string;
  candidate_id: string;
  security_score: number | null;
  onchain_score: number | null;
  social_score: number | null;
  narrative_score: number | null;
  total_score: number | null;
  decision_label: string;
  risk_level: PersistableRiskLevel;
  confidence: number | null;
  checklist: {
    security: string[];
    distribution: string[];
    liquidity: string[];
    social: string[];
    personal: string[];
  };
  created_at: string;
};

export type PersistableScannerOutput = {
  provenance?: {
    schema_version: string;
    contract_version: string;
    generator_version: string;
    environment: string;
    mode: "fixture" | "live";
    fixture_used: boolean;
    run_id: string;
    generated_at: string;
    finished_at: string;
    source_ids: string[];
    policy_decisions: Record<string, Record<string, "allowed" | "denied">>;
  };
  scan_run: PersistableScanRun;
  candidates: PersistableCandidate[];
  security_checks: PersistableSecurityCheck[];
  scorecards: PersistableScorecard[];
};

export type ScannerSourceMeta = {
  source: "real-output" | "fixture-fallback";
  path?: string;
  reason: string;
  selected_run_id: string | null;
  loaded_at: string;
  runtime_mode?: "DEVELOPMENT_DEMO" | "INTERNAL_BETA" | "UNCONFIGURED";
  age_seconds?: number | null;
  source_ids?: string[];
};

export type ScannerApiOutput = PersistableScannerOutput & {
  _source_meta?: ScannerSourceMeta;
};

export interface UiTokenCandidate {
  id: string;
  runId: string;
  symbol: string;
  name: string;
  chain: string;
  dex: string;
  source: string;
  contractAddress: string;
  pairAddress: string;
  sourceUrl: string;

  priceUsd: number | null;
  marketCap: number | null;
  fdvUsd: number | null;
  liquidity: number | null;
  volume24h: number | null;
  volumeMarketCapRatio: number | null;
  pairCreatedAt: string | null;
  pairAgeDays: number | null;

  basicFilterStatus: string;
  securityLabel: string;
  finalLabel: string;

  mainReason: string;
  filterReasons: string[];
  criticalReasons: string[];
  warningReasons: string[];
  finalReasons: string[];

  missingData: string[];
  riskFlags: string[];
  security: {
    sources: string[];
    honeypotStatus: string;
    buyTax: number | null;
    sellTax: number | null;
    contractVerified: boolean | null;
    ownershipStatus: string;
    liquidityLocked: boolean | null;
    liquidityLockDays: number | null;
    mintRisk: boolean | null;
    blacklistRisk: boolean | null;
    whitelistRisk: boolean | null;
    sellRestrictionRisk: boolean | null;
    proxyRisk: boolean | null;
    topWalletPct: number | null;
    top10WalletsPct: number | null;
    checkedAt: string;
  } | null;

  scorecard: {
    securityScore: number | null;
    onchainScore: number | null;
    socialScore: number | null;
    narrativeScore: number | null;
    totalScore: number | null;
    decisionLabel: string;
    riskLevel: PersistableRiskLevel;
    confidence: number | null;
    checklist: PersistableScorecard["checklist"];
    createdAt: string;
  } | null;

  lastCheckedAt: string;
}
