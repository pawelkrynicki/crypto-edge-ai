import type {
  PersistableCandidate,
  PersistableScannerOutput,
  PersistableScorecard,
  PersistableSecurityCheck,
  UiTokenCandidate,
} from "../types/scannerTypes";

const FINAL_LABEL_FALLBACK: Record<string, string> = {
  WATCHLIST: "Eligible for further review only.",
  CRITICAL_RISK: "Critical security flag detected.",
  NEEDS_MANUAL_VERIFICATION: "Missing or unclear security data; manual verification required.",
  REJECT: "Failed basic market or liquidity filters.",
};

function buildMainReason(candidate: PersistableCandidate): string {
  const reasons = candidate.final_reasons ?? [];
  if (reasons.length > 0) return reasons.slice(0, 2).join(" | ");
  return FINAL_LABEL_FALLBACK[candidate.final_label] ?? candidate.final_label;
}

function safeString(value: string | null, fallback = ""): string {
  return value ?? fallback;
}

function resolveLastCheckedAt(
  candidate: PersistableCandidate,
  security: PersistableSecurityCheck | undefined,
  scorecard: PersistableScorecard | undefined,
): string {
  return security?.checked_at ?? scorecard?.created_at ?? candidate.created_at;
}

function mapSecurity(security: PersistableSecurityCheck): UiTokenCandidate["security"] {
  return {
    sources: security.sources,
    honeypotStatus: security.honeypot_status,
    buyTax: security.buy_tax,
    sellTax: security.sell_tax,
    contractVerified: security.contract_verified,
    ownershipStatus: security.ownership_status,
    liquidityLocked: security.liquidity_locked,
    liquidityLockDays: security.liquidity_lock_days,
    mintRisk: security.mint_risk,
    blacklistRisk: security.blacklist_risk,
    whitelistRisk: security.whitelist_risk,
    sellRestrictionRisk: security.sell_restriction_risk,
    proxyRisk: security.proxy_risk,
    topWalletPct: security.top_wallet_pct,
    top10WalletsPct: security.top_10_wallets_pct,
    checkedAt: security.checked_at,
  };
}

function mapScorecard(scorecard: PersistableScorecard): UiTokenCandidate["scorecard"] {
  return {
    securityScore: scorecard.security_score,
    onchainScore: scorecard.onchain_score,
    socialScore: scorecard.social_score,
    narrativeScore: scorecard.narrative_score,
    totalScore: scorecard.total_score,
    decisionLabel: scorecard.decision_label,
    riskLevel: scorecard.risk_level,
    confidence: scorecard.confidence,
    checklist: scorecard.checklist,
    createdAt: scorecard.created_at,
  };
}

export function mapPersistableScannerOutputToUiCandidates(
  output: PersistableScannerOutput,
): UiTokenCandidate[] {
  const securityByCandidate = new Map<string, PersistableSecurityCheck>();
  for (const security of output.security_checks) {
    securityByCandidate.set(security.candidate_id, security);
  }

  const scorecardByCandidate = new Map<string, PersistableScorecard>();
  for (const scorecard of output.scorecards) {
    scorecardByCandidate.set(scorecard.candidate_id, scorecard);
  }

  return output.candidates.map((candidate): UiTokenCandidate => {
    const security = securityByCandidate.get(candidate.candidate_id);
    const scorecard = scorecardByCandidate.get(candidate.candidate_id);

    return {
      id: candidate.candidate_id,
      runId: candidate.run_id,
      symbol: candidate.symbol,
      name: safeString(candidate.name, candidate.symbol),
      chain: candidate.chain,
      dex: safeString(candidate.dex),
      source: candidate.source,
      contractAddress: safeString(candidate.contract_address),
      pairAddress: safeString(candidate.pair_address),
      sourceUrl: safeString(candidate.source_url),

      priceUsd: candidate.price_usd,
      marketCap: candidate.market_cap_usd,
      fdvUsd: candidate.fdv_usd,
      liquidity: candidate.liquidity_usd,
      volume24h: candidate.volume_24h_usd,
      volumeMarketCapRatio: candidate.volume_market_cap_ratio,
      pairCreatedAt: candidate.pair_created_at,
      pairAgeDays: candidate.pair_age_days,

      basicFilterStatus: candidate.basic_filter_status,
      securityLabel: security ? security.security_label : "NOT_CHECKED",
      finalLabel: candidate.final_label,

      mainReason: buildMainReason(candidate),
      filterReasons: candidate.filter_reasons ?? [],
      criticalReasons: security?.critical_reasons ?? [],
      warningReasons: security?.warning_reasons ?? [],
      finalReasons: candidate.final_reasons ?? [],

      missingData: security?.missing_data ?? [],
      riskFlags: security?.risk_flags ?? [],
      security: security ? mapSecurity(security) : null,

      scorecard: scorecard ? mapScorecard(scorecard) : null,
      lastCheckedAt: resolveLastCheckedAt(candidate, security, scorecard),
    };
  });
}
