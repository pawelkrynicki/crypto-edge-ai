// ─────────────────────────────────────────────────────────────────────────────
// scannerOutputAdapter.ts
// Maps PersistableScannerOutput → UiTokenCandidate[]
//
// Rules:
//   - Each candidate produces one UiTokenCandidate.
//   - security_check is matched by candidate_id.
//   - scorecard is matched by candidate_id.
//   - If no security_check exists, securityLabel = NOT_CHECKED, security = null.
//   - finalLabel is taken directly from candidate.final_label.
//   - mainReason: first 1–2 entries from final_reasons, or a label-based fallback.
//   - lastCheckedAt priority: security_check.checked_at → scorecard.created_at → candidate.created_at.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  PersistableScannerOutput,
  PersistableCandidate,
  PersistableSecurityCheck,
  PersistableScorecard,
  UiTokenCandidate,
  PersistableFinalLabel,
} from "../types/scannerTypes";

// ── Helpers ──────────────────────────────────────────────────────────────────

const FINAL_LABEL_FALLBACK: Record<PersistableFinalLabel, string> = {
  WATCHLIST:                 "Passed basic filters and available security checks.",
  CRITICAL_RISK:             "Critical security flag detected.",
  NEEDS_MANUAL_VERIFICATION: "Missing or unclear security data — manual verification required.",
  REJECT:                    "Failed basic market or liquidity filters.",
};

function buildMainReason(candidate: PersistableCandidate): string {
  const reasons = candidate.final_reasons ?? [];
  if (reasons.length === 0) return FINAL_LABEL_FALLBACK[candidate.final_label];
  return reasons.slice(0, 2).join(" · ");
}

function splitReasons(candidate: PersistableCandidate, security: PersistableSecurityCheck | undefined) {
  const all = candidate.final_reasons ?? [];
  const riskFlags = security?.risk_flags ?? [];
  const missing   = security?.missing_data ?? [];

  // Heuristic split: reasons that mention "missing" / "unknown" → warning,
  // reasons that mention critical keywords → critical, rest → filter.
  const criticalKeywords = ["honeypot", "tax above", "mint risk", "blacklist", "sell restriction", "rug"];
  const missingKeywords  = ["missing", "unknown", "not available", "partial"];

  const filterReasons:   string[] = [];
  const criticalReasons: string[] = [];
  const warningReasons:  string[] = [];

  for (const r of all) {
    const lower = r.toLowerCase();
    if (criticalKeywords.some((k) => lower.includes(k)) || riskFlags.length > 0) {
      criticalReasons.push(r);
    } else if (missingKeywords.some((k) => lower.includes(k)) || missing.length > 0) {
      warningReasons.push(r);
    } else {
      filterReasons.push(r);
    }
  }

  return { filterReasons, criticalReasons, warningReasons };
}

function resolveLastCheckedAt(
  candidate: PersistableCandidate,
  security: PersistableSecurityCheck | undefined,
  scorecard: PersistableScorecard | undefined,
): string {
  return security?.checked_at ?? scorecard?.created_at ?? candidate.created_at;
}

// ── Main adapter function ────────────────────────────────────────────────────

export function mapPersistableScannerOutputToUiCandidates(
  output: PersistableScannerOutput,
): UiTokenCandidate[] {
  // Build lookup maps for O(1) access
  const securityByCandidate = new Map<string, PersistableSecurityCheck>();
  for (const sc of output.security_checks) {
    securityByCandidate.set(sc.candidate_id, sc);
  }

  const scorecardByCandidate = new Map<string, PersistableScorecard>();
  for (const sc of output.scorecards) {
    scorecardByCandidate.set(sc.candidate_id, sc);
  }

  return output.candidates.map((c): UiTokenCandidate => {
    const security  = securityByCandidate.get(c.id);
    const scorecard = scorecardByCandidate.get(c.id);

    const { filterReasons, criticalReasons, warningReasons } = splitReasons(c, security);

    return {
      // Identity
      id:              c.id,
      symbol:          c.symbol,
      name:            c.name,
      chain:           c.chain,
      dex:             c.dex,
      contractAddress: c.contract_address,
      pairAddress:     c.pair_address,
      sourceUrl:       c.source_url,

      // Market data
      marketCap:              c.market_cap_usd,
      liquidity:              c.liquidity_usd,
      volume24h:              c.volume_24h_usd,
      volumeMarketCapRatio:   c.volume_market_cap_ratio,
      pairAgeDays:            c.pair_age_days,

      // Labels
      basicFilterStatus: c.basic_filter_status,
      securityLabel:     security ? c.security_label : "NOT_CHECKED",
      finalLabel:        c.final_label,

      // Reasons
      mainReason:     buildMainReason(c),
      filterReasons,
      criticalReasons,
      warningReasons,

      // Security detail
      missingData: security?.missing_data ?? [],
      riskFlags:   security?.risk_flags   ?? [],
      security: security
        ? {
            honeypotStatus:       security.honeypot_status,
            buyTax:               security.buy_tax,
            sellTax:              security.sell_tax,
            contractVerified:     security.contract_verified,
            ownershipStatus:      security.ownership_status,
            liquidityLocked:      security.liquidity_locked,
            liquidityLockDays:    security.liquidity_lock_days,
            mintRisk:             security.mint_risk,
            blacklistRisk:        security.blacklist_risk,
            sellRestrictionRisk:  security.sell_restriction_risk,
            topWalletPct:         security.top_wallet_pct,
            top10WalletsPct:      security.top_10_wallets_pct,
          }
        : null,

      // Scorecard
      scorecard: scorecard
        ? {
            totalScore:     scorecard.total_score,
            filterScore:    scorecard.filter_score,
            securityScore:  scorecard.security_score,
            volumeScore:    scorecard.volume_score,
            liquidityScore: scorecard.liquidity_score,
            ageScore:       scorecard.age_score,
            notes:          scorecard.notes,
          }
        : null,

      // Timestamp
      lastCheckedAt: resolveLastCheckedAt(c, security, scorecard),
    };
  });
}
