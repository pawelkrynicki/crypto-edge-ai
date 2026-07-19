import { createHash } from "node:crypto";
import {
  buildSnapshotProvenanceManifest,
  type SnapshotProvenanceManifest,
} from "./provenanceManifest.js";
import type { CombinedScannerFinalLabel, CombinedScannerOutput } from "./types.js";

export const SCANNER_SCHEMA_VERSION = "scanner_snapshot_v1";
export const SCANNER_GENERATOR_VERSION = "data_poc_persistable_scanner_v1";

export type PersistableScannerOutput = {
  provenance?: SnapshotProvenanceManifest;
  scan_run: PersistableScanRun;
  candidates: PersistableCandidate[];
  security_checks: PersistableSecurityCheck[];
  scorecards: PersistableScorecard[];
};

export type PersistableScanRun = {
  run_id: string;
  source: "combined-scanner-poc";
  mode: "fixture" | "live";
  query: string;
  filters: Record<string, unknown>;
  limits: Record<string, unknown>;
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
  discovery_basket?: "new_emerging" | "established";
  discovery_method?: "dexscreener_latest_token_profiles" | "address_seeded_universe";
  observation_only?: boolean;
  established_eligible?: boolean;
  universe_version?: string | null;
  universe_entry_index?: number | null;
  address_identity_verified?: boolean;
};

export type PersistableSecurityCheck = {
  run_id: string;
  candidate_id: string;
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
  security_label: string;
  critical_reasons: string[];
  warning_reasons: string[];
  checked_at: string;
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
  risk_level: "low" | "medium" | "high" | "critical" | null;
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

export type BuildPersistableScannerInput = {
  combined: CombinedScannerOutput;
  runId?: string;
  startedAt?: string | null;
  finishedAt?: string;
  environment?: string;
  sourceIds?: string[];
  metadata?: Record<string, unknown>;
  publishScorecards?: boolean;
};

export function buildPersistableScannerOutput(input: BuildPersistableScannerInput): PersistableScannerOutput {
  const finishedAt = input.finishedAt ?? input.combined.generated_at;
  const runId = input.runId ?? buildRunId(finishedAt);

  const candidates = input.combined.candidates.map((item) => {
    const candidateId = buildCandidateId(item.candidate.chain, item.candidate.contract_address, item.candidate.pair_address, item.candidate.source);
    return {
      run_id: runId,
      candidate_id: candidateId,
      symbol: item.candidate.symbol,
      name: item.candidate.name,
      chain: item.candidate.chain,
      contract_address: item.candidate.contract_address,
      pair_address: item.candidate.pair_address,
      dex: item.candidate.dex,
      source: item.candidate.source,
      source_url: item.candidate.source_url,
      price_usd: item.candidate.price_usd,
      market_cap_usd: item.candidate.market_cap_usd,
      fdv_usd: item.candidate.fdv_usd,
      liquidity_usd: item.candidate.liquidity_usd,
      volume_24h_usd: item.candidate.volume_24h_usd,
      volume_market_cap_ratio: item.candidate.volume_market_cap_ratio,
      pair_created_at: item.candidate.pair_created_at,
      pair_age_days: item.candidate.pair_age_days,
      basic_filter_status: item.decision.basic_filter_status,
      filter_reasons: item.candidate.filter_reasons,
      final_label: item.decision.final_label,
      final_reasons: item.decision.final_reasons,
      created_at: finishedAt,
      discovery_basket: item.candidate.discovery_basket ?? "new_emerging",
      discovery_method: item.candidate.discovery_method ?? "dexscreener_latest_token_profiles",
      observation_only: item.candidate.observation_only ?? true,
      established_eligible: item.candidate.established_eligible ?? false,
      universe_version: item.candidate.universe_version ?? null,
      universe_entry_index: item.candidate.universe_entry_index ?? null,
      address_identity_verified: item.candidate.address_identity_verified ?? false,
    };
  });

  const securityChecks = input.combined.candidates.flatMap((item) => {
    if (!item.security) return [];
    const candidateId = buildCandidateId(item.candidate.chain, item.candidate.contract_address, item.candidate.pair_address, item.candidate.source);
    return [
      {
        run_id: runId,
        candidate_id: candidateId,
        sources: item.security.sources,
        honeypot_status: item.security.honeypot_status,
        buy_tax: item.security.buy_tax,
        sell_tax: item.security.sell_tax,
        contract_verified: item.security.contract_verified,
        ownership_status: item.security.ownership_status,
        liquidity_locked: item.security.liquidity_locked,
        liquidity_lock_days: item.security.liquidity_lock_days,
        mint_risk: item.security.mint_risk,
        blacklist_risk: item.security.blacklist_risk,
        whitelist_risk: item.security.whitelist_risk,
        sell_restriction_risk: item.security.sell_restriction_risk,
        proxy_risk: item.security.proxy_risk,
        top_wallet_pct: item.security.top_wallet_pct,
        top_10_wallets_pct: item.security.top_10_wallets_pct,
        risk_flags: item.security.risk_flags,
        missing_data: item.security.missing_data,
        security_label: item.decision.security_label,
        critical_reasons: item.decision.final_label === "CRITICAL_RISK" ? item.decision.final_reasons : [],
        warning_reasons: item.decision.final_label === "NEEDS_MANUAL_VERIFICATION" ? item.decision.final_reasons : [],
        checked_at: finishedAt
      }
    ];
  });

  const scorecards = input.publishScorecards === false ? [] : input.combined.candidates.map((item) => ({
    run_id: runId,
    candidate_id: buildCandidateId(item.candidate.chain, item.candidate.contract_address, item.candidate.pair_address, item.candidate.source),
    security_score: null,
    onchain_score: null,
    social_score: null,
    narrative_score: null,
    total_score: null,
    decision_label: item.decision.final_label,
    risk_level: riskLevelForLabel(item.decision.final_label),
    confidence: null,
    checklist: {
      security: [],
      distribution: [],
      liquidity: [],
      social: [],
      personal: []
    },
    created_at: finishedAt
  }));

  const securitySourceIds = input.combined.candidates.flatMap((item) => (
    item.security?.sources.map((source) => source === "goplus" ? "goplus_security" : "honeypot_is") ?? []
  ));
  const sourceIds = input.sourceIds ?? ["dexscreener", ...new Set(securitySourceIds)];

  return {
    provenance: buildSnapshotProvenanceManifest({
      schemaVersion: SCANNER_SCHEMA_VERSION,
      generatorVersion: SCANNER_GENERATOR_VERSION,
      environment: input.environment ?? "FIXTURE_ONLY",
      mode: input.combined.mode,
      runId,
      generatedAt: finishedAt,
      finishedAt,
      sourceIds,
      metadata: input.metadata,
    }),
    scan_run: {
      run_id: runId,
      source: input.combined.source,
      mode: input.combined.mode,
      query: input.combined.query,
      filters: {
        basic_filters: "dexscreener_basic_filters_v1"
      },
      limits: input.combined.limits,
      started_at: input.startedAt ?? null,
      finished_at: finishedAt,
      total_raw: input.combined.summary.total_raw,
      passed_basic_filter: input.combined.summary.passed_basic_filter,
      rejected_basic_filter: input.combined.summary.rejected_basic_filter,
      security_checked: input.combined.summary.security_checked,
      security_passed: input.combined.summary.security_passed,
      needs_manual_verification: input.combined.summary.needs_manual_verification,
      critical_risk: input.combined.summary.critical_risk,
      watchlist_candidates: input.combined.summary.watchlist_candidates,
      errors: []
    },
    candidates,
    security_checks: securityChecks,
    scorecards
  };
}

export function buildRunId(finishedAt: string): string {
  return `scan_${finishedAt.replace(/[^0-9]/g, "").slice(0, 14)}`;
}

export function buildCandidateId(chain: string, contractAddress: string | null, pairAddress: string | null, source: string): string {
  const raw = [chain, contractAddress ?? "", pairAddress ?? "", source].join("|").toLowerCase();
  return createHash("sha256").update(raw).digest("hex");
}

function riskLevelForLabel(label: CombinedScannerFinalLabel): PersistableScorecard["risk_level"] {
  if (label === "CRITICAL_RISK") return "critical";
  if (label === "NEEDS_MANUAL_VERIFICATION") return "medium";
  if (label === "WATCHLIST") return "low";
  if (label === "REJECT") return "high";
  return null;
}
