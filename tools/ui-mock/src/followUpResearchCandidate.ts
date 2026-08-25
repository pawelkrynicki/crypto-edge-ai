import type { FollowUpPublicEntry } from "./types/followUpTypes";
import type { UiTokenCandidate } from "./types/scannerTypes";

/**
 * Read-only projection for a retained Follow-up identity that is no longer in
 * the current scanner snapshot. It lets the canonical Checklist use the same
 * chain + contract and last-known-good Follow-up facts without persisting or
 * manufacturing scanner data.
 */
export function followUpToResearchCandidate(entry: FollowUpPublicEntry): UiTokenCandidate {
  const basicFilterStatus = entry.filter_status === "passed_basic_filter"
    ? "passed_basic_filter"
    : entry.filter_status === "rejected_basic_filter"
      ? "rejected_basic_filter"
      : "not_evaluated";
  return {
    id: `follow-up:${entry.entry_id}`,
    runId: "follow-up-read-model",
    symbol: entry.symbol ?? entry.display_name ?? entry.contract_address,
    name: entry.display_name ?? entry.symbol ?? entry.contract_address,
    chain: entry.chain,
    dex: "",
    source: "follow_up",
    contractAddress: entry.contract_address,
    pairAddress: entry.pair_address ?? "",
    sourceUrl: "",
    discoveryBasket: "new_emerging",
    discoveryMethod: "dexscreener_latest_token_profiles",
    observationOnly: true,
    establishedEligible: false,
    universeVersion: null,
    universeEntryIndex: null,
    // A syntactically valid identity is not a completed source verification.
    addressIdentityVerified: false,
    priceUsd: entry.market_metrics.price_usd,
    marketCap: entry.market_metrics.market_cap_usd,
    fdvUsd: entry.market_metrics.fdv_usd,
    liquidity: entry.market_metrics.liquidity_usd,
    volume24h: entry.market_metrics.volume_24h_usd,
    volumeMarketCapRatio: entry.market_metrics.volume_market_cap_ratio,
    pairCreatedAt: entry.first_seen_at,
    pairAgeDays: entry.pair_age,
    basicFilterStatus,
    securityLabel: entry.security_status,
    finalLabel: "NEEDS_MANUAL_VERIFICATION",
    mainReason: entry.filter_reasons[0] ?? entry.missing_data[0] ?? "FOLLOW_UP",
    filterReasons: entry.filter_reasons,
    criticalReasons: [],
    warningReasons: entry.missing_data,
    finalReasons: [...entry.filter_reasons, ...entry.missing_data],
    missingData: entry.missing_data,
    riskFlags: [],
    security: null,
    scorecard: null,
    lastCheckedAt: entry.last_checked_at ?? entry.last_seen_at,
  };
}
