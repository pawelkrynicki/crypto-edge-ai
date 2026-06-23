import { mapPersistableScannerOutputToUiCandidates } from "./adapters/scannerOutputAdapter";
import { PERSISTABLE_SCANNER_SAMPLE } from "./fixtures/persistableScannerSample";
import type { UiTokenCandidate } from "./types/scannerTypes";

export type FinalLabel = UiTokenCandidate["finalLabel"];
export type SecurityLabel = UiTokenCandidate["securityLabel"];
export type BasicFilterStatus = UiTokenCandidate["basicFilterStatus"];

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
  market_cap_usd: number | null;
  fdv_usd: number | null;
  liquidity_usd: number | null;
  volume_24h_usd: number | null;
  volume_market_cap_ratio: number | null;
  pair_age_days: number | null;
  basic_filter_status: BasicFilterStatus;
  security_label: SecurityLabel;
  final_label: FinalLabel;
  final_reasons: string[];
  security: {
    sources: string[];
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
  } | null;
  last_checked: string;
}

function uniqueNonEmpty(values: string[]): string[] {
  return values.filter((value, index, array) => value.length > 0 && array.indexOf(value) === index);
}

export function toMockCandidate(u: UiTokenCandidate): MockCandidate {
  return {
    id: u.id,
    symbol: u.symbol,
    name: u.name,
    chain: u.chain,
    dex: u.dex,
    contract_address: u.contractAddress,
    pair_address: u.pairAddress,
    source_url: u.sourceUrl,
    price_usd: u.priceUsd,
    market_cap_usd: u.marketCap,
    fdv_usd: u.fdvUsd,
    liquidity_usd: u.liquidity,
    volume_24h_usd: u.volume24h,
    volume_market_cap_ratio: u.volumeMarketCapRatio,
    pair_age_days: u.pairAgeDays,
    basic_filter_status: u.basicFilterStatus,
    security_label: u.securityLabel,
    final_label: u.finalLabel,
    final_reasons: uniqueNonEmpty([
      ...u.finalReasons,
      ...u.filterReasons,
      ...u.criticalReasons,
      ...u.warningReasons,
    ]),
    security: u.security
      ? {
          sources: u.security.sources,
          honeypot_status: u.security.honeypotStatus,
          buy_tax: u.security.buyTax,
          sell_tax: u.security.sellTax,
          contract_verified: u.security.contractVerified,
          ownership_status: u.security.ownershipStatus,
          liquidity_locked: u.security.liquidityLocked,
          liquidity_lock_days: u.security.liquidityLockDays,
          mint_risk: u.security.mintRisk,
          blacklist_risk: u.security.blacklistRisk,
          whitelist_risk: u.security.whitelistRisk,
          sell_restriction_risk: u.security.sellRestrictionRisk,
          proxy_risk: u.security.proxyRisk,
          top_wallet_pct: u.security.topWalletPct,
          top_10_wallets_pct: u.security.top10WalletsPct,
          risk_flags: u.riskFlags,
          missing_data: u.missingData,
        }
      : null,
    last_checked: u.lastCheckedAt,
  };
}

const UI_CANDIDATES: UiTokenCandidate[] =
  mapPersistableScannerOutputToUiCandidates(PERSISTABLE_SCANNER_SAMPLE);

export const MOCK_CANDIDATES: MockCandidate[] = UI_CANDIDATES.map(toMockCandidate);

export const MOCK_SUMMARY = {
  total_candidates: MOCK_CANDIDATES.length,
  watchlist: MOCK_CANDIDATES.filter((c) => c.final_label === "WATCHLIST").length,
  critical_risk: MOCK_CANDIDATES.filter((c) => c.final_label === "CRITICAL_RISK").length,
  needs_manual_verification: MOCK_CANDIDATES.filter((c) => c.final_label === "NEEDS_MANUAL_VERIFICATION").length,
  rejected: MOCK_CANDIDATES.filter((c) => c.final_label === "REJECT").length,
};

export const MOCK_SCAN_RUN = PERSISTABLE_SCANNER_SAMPLE.scan_run;
