import {
  CRYPTO_EDGE_CANDIDATE_OBSERVATION_SCHEMA_VERSION,
  type CanonicalAssetIdentity,
  type CanonicalCandidateDisplay,
  type CanonicalCandidateObservation,
  type CanonicalMarketObservation,
  type CanonicalPairReference,
  type CanonicalProviderReference,
} from "../discovery/canonicalCandidate.js";
import type { NormalizedSocialLink } from "../types.js";
import {
  createSourceIntelligenceObservation,
  CRYPTO_EDGE_SOURCE_INTELLIGENCE_OBSERVATION_SCHEMA_VERSION,
  SOURCE_INTELLIGENCE_DOMAINS,
  type SourceIntelligenceDomain,
  type SourceIntelligenceEvidenceItem,
  type SourceIntelligenceEvidenceStatus,
  type SourceIntelligenceObservation,
  type SourceIntelligenceObservationStatus,
  type SourceIntelligenceSource,
} from "../intelligence/sourceIntelligence.js";
import {
  CRYPTO_EDGE_INVESTMENT_CHANGE_SET_SCHEMA_VERSION,
  type InvestmentChangeSet,
  type InvestmentComparisonStatus,
  type InvestmentEvidenceChange,
  type InvestmentEvidenceChangedField,
  type InvestmentEvidenceSlotIdentity,
} from "./investmentChangeDetection.js";

export const CRYPTO_EDGE_INVESTMENT_V2_READ_MODEL_SCHEMA_VERSION = "crypto_edge_investment_v2_read_model_v1" as const;
export const INVESTMENT_V2_CANDIDATE_INVALID = "INVESTMENT_V2_CANDIDATE_INVALID" as const;
export const INVESTMENT_V2_SOURCE_INVALID = "INVESTMENT_V2_SOURCE_INVALID" as const;
export const INVESTMENT_V2_IDENTITY_MISMATCH = "INVESTMENT_V2_IDENTITY_MISMATCH" as const;
export const INVESTMENT_V2_DUPLICATE_SOURCE = "INVESTMENT_V2_DUPLICATE_SOURCE" as const;
export const INVESTMENT_V2_CHANGE_SET_INVALID = "INVESTMENT_V2_CHANGE_SET_INVALID" as const;
export const INVESTMENT_V2_DUPLICATE_CHANGE_SET = "INVESTMENT_V2_DUPLICATE_CHANGE_SET" as const;
export const INVESTMENT_V2_ORPHAN_CHANGE_SET = "INVESTMENT_V2_ORPHAN_CHANGE_SET" as const;
export const INVESTMENT_V2_CHANGE_SET_MISMATCH = "INVESTMENT_V2_CHANGE_SET_MISMATCH" as const;

export type InvestmentV2ReadModelInput = {
  candidate: CanonicalCandidateObservation;
  source_observations: SourceIntelligenceObservation[];
  change_sets: InvestmentChangeSet[];
};

export type InvestmentV2AssetProjection = {
  identity: CanonicalAssetIdentity;
  display: CanonicalCandidateDisplay;
  observed_at: string;
  pair: CanonicalPairReference | null;
  market: CanonicalMarketObservation;
  social_links: NormalizedSocialLink[];
  provider_references: CanonicalProviderReference[];
};

export type InvestmentV2EvidenceGroup = {
  domain: SourceIntelligenceDomain;
  items: SourceIntelligenceEvidenceItem[];
};

export type InvestmentV2SourceView = {
  source: SourceIntelligenceSource;
  observed_at: string;
  status: SourceIntelligenceObservationStatus;
  reason_codes: string[];
  evidence_groups: InvestmentV2EvidenceGroup[];
  latest_change: InvestmentChangeSet | null;
};

export type InvestmentV2ReadModelSummary = {
  sources_total: number;
  sources_ready: number;
  sources_degraded: number;
  sources_unavailable: number;
  sources_with_changes: number;
  evidence_items_total: number;
  evidence_changes_total: number;
  comparisons_complete: number;
  comparisons_partial: number;
  comparisons_not_comparable: number;
};

/** A deterministic, source-local projection for a future Investment V2 surface. */
export type InvestmentV2ReadModel = {
  schema_version: typeof CRYPTO_EDGE_INVESTMENT_V2_READ_MODEL_SCHEMA_VERSION;
  asset: InvestmentV2AssetProjection;
  sources: InvestmentV2SourceView[];
  summary: InvestmentV2ReadModelSummary;
};

/**
 * Builds a read-only factual projection from accepted Next contracts. It makes
 * no investment, risk, ranking, research-progress, or provider decisions.
 */
export function buildInvestmentV2ReadModel(input: InvestmentV2ReadModelInput): InvestmentV2ReadModel {
  if (!isRecord(input)) throw new Error(INVESTMENT_V2_CANDIDATE_INVALID);

  const asset = validateCandidate(input.candidate);
  const sourceObservations = validateSourceObservations(input.source_observations, asset.identity);
  const changeSetsBySource = validateChangeSets(input.change_sets, asset.identity, sourceObservations);
  const sources = sourceObservations
    .sort((left, right) => compareLexically(left.source.source_id, right.source.source_id))
    .map((observation) => projectSourceView(observation, changeSetsBySource.get(observation.source.source_id) ?? null));

  return {
    schema_version: CRYPTO_EDGE_INVESTMENT_V2_READ_MODEL_SCHEMA_VERSION,
    asset,
    sources,
    summary: buildSummary(sources),
  };
}

function validateCandidate(value: unknown): InvestmentV2AssetProjection {
  if (!isRecord(value) || value.schema_version !== CRYPTO_EDGE_CANDIDATE_OBSERVATION_SCHEMA_VERSION
    || !isCanonicalIdentity(value.identity) || !isCandidateDisplay(value.display) || typeof value.observed_at !== "string"
    || !isCanonicalPair(value.pair) || !isCanonicalMarket(value.market)
    || !isDenseArray(value.social_links) || !isDenseArray(value.provider_references)) {
    throw new Error(INVESTMENT_V2_CANDIDATE_INVALID);
  }

  const socialLinks = value.social_links.map((link) => cloneSocialLink(link));
  const providerReferences = value.provider_references.map((reference) => cloneProviderReference(reference));
  if (socialLinks.some((link) => link === null) || providerReferences.some((reference) => reference === null)) {
    throw new Error(INVESTMENT_V2_CANDIDATE_INVALID);
  }

  return {
    identity: cloneIdentity(value.identity),
    display: { symbol: value.display.symbol, name: value.display.name },
    observed_at: value.observed_at,
    pair: value.pair === null ? null : { pair_address: value.pair.pair_address, dex: value.pair.dex },
    market: cloneMarket(value.market),
    social_links: socialLinks as NormalizedSocialLink[],
    provider_references: providerReferences as CanonicalProviderReference[],
  };
}

function validateSourceObservations(
  value: unknown,
  identity: CanonicalAssetIdentity,
): SourceIntelligenceObservation[] {
  if (!isDenseArray(value)) throw new Error(INVESTMENT_V2_SOURCE_INVALID);

  const sourcesById = new Map<string, SourceIntelligenceObservation>();
  for (const rawObservation of value) {
    const observation = validateSourceObservation(rawObservation);
    if (!identitiesMatch(observation.identity, identity)) throw new Error(INVESTMENT_V2_IDENTITY_MISMATCH);
    if (sourcesById.has(observation.source.source_id)) throw new Error(INVESTMENT_V2_DUPLICATE_SOURCE);
    sourcesById.set(observation.source.source_id, observation);
  }
  return [...sourcesById.values()];
}

function validateSourceObservation(value: unknown): SourceIntelligenceObservation {
  if (!isRecord(value) || value.schema_version !== CRYPTO_EDGE_SOURCE_INTELLIGENCE_OBSERVATION_SCHEMA_VERSION) {
    throw new Error(INVESTMENT_V2_SOURCE_INVALID);
  }

  try {
    return createSourceIntelligenceObservation({
      identity: value.identity as CanonicalAssetIdentity,
      source: value.source as SourceIntelligenceSource,
      observed_at: value.observed_at as string,
      status: value.status as SourceIntelligenceObservationStatus,
      reason_codes: value.reason_codes as string[],
      evidence: value.evidence as SourceIntelligenceEvidenceItem[],
    });
  } catch {
    throw new Error(INVESTMENT_V2_SOURCE_INVALID);
  }
}

function validateChangeSets(
  value: unknown,
  identity: CanonicalAssetIdentity,
  sourceObservations: readonly SourceIntelligenceObservation[],
): Map<string, InvestmentChangeSet> {
  if (!isDenseArray(value)) throw new Error(INVESTMENT_V2_CHANGE_SET_INVALID);

  const sourcesById = new Map(sourceObservations.map((observation) => [observation.source.source_id, observation]));
  const changeSetsBySource = new Map<string, InvestmentChangeSet>();
  for (const rawChangeSet of value) {
    const changeSet = validateChangeSet(rawChangeSet);
    if (!identitiesMatch(changeSet.identity, identity)) throw new Error(INVESTMENT_V2_IDENTITY_MISMATCH);
    if (changeSetsBySource.has(changeSet.source_id)) throw new Error(INVESTMENT_V2_DUPLICATE_CHANGE_SET);

    const sourceObservation = sourcesById.get(changeSet.source_id);
    if (!sourceObservation) throw new Error(INVESTMENT_V2_ORPHAN_CHANGE_SET);
    if (changeSet.current_observed_at !== sourceObservation.observed_at) {
      throw new Error(INVESTMENT_V2_CHANGE_SET_MISMATCH);
    }
    changeSetsBySource.set(changeSet.source_id, changeSet);
  }
  return changeSetsBySource;
}

function validateChangeSet(value: unknown): InvestmentChangeSet {
  if (!isRecord(value) || value.schema_version !== CRYPTO_EDGE_INVESTMENT_CHANGE_SET_SCHEMA_VERSION
    || !isCanonicalIdentity(value.identity) || !isNonBlankString(value.source_id)
    || typeof value.previous_observed_at !== "string" || typeof value.current_observed_at !== "string"
    || !isComparisonStatus(value.comparison_status) || !isSourceStatusChange(value.source_status_change)
    || !isReasonCodeChanges(value.reason_code_changes) || !isDenseArray(value.evidence_changes)
    || typeof value.has_changes !== "boolean") {
    throw new Error(INVESTMENT_V2_CHANGE_SET_INVALID);
  }

  const evidenceChanges = value.evidence_changes.map((change) => cloneEvidenceChange(change));
  if (evidenceChanges.some((change) => change === null)) throw new Error(INVESTMENT_V2_CHANGE_SET_INVALID);

  return {
    schema_version: CRYPTO_EDGE_INVESTMENT_CHANGE_SET_SCHEMA_VERSION,
    identity: cloneIdentity(value.identity),
    source_id: value.source_id,
    previous_observed_at: value.previous_observed_at,
    current_observed_at: value.current_observed_at,
    comparison_status: value.comparison_status,
    source_status_change: {
      previous: value.source_status_change.previous,
      current: value.source_status_change.current,
      changed: value.source_status_change.changed,
    },
    reason_code_changes: {
      added: [...value.reason_code_changes.added],
      removed: [...value.reason_code_changes.removed],
    },
    evidence_changes: evidenceChanges as InvestmentEvidenceChange[],
    has_changes: value.has_changes,
  };
}

function projectSourceView(
  observation: SourceIntelligenceObservation,
  latestChange: InvestmentChangeSet | null,
): InvestmentV2SourceView {
  return {
    source: cloneSource(observation.source),
    observed_at: observation.observed_at,
    status: observation.status,
    reason_codes: [...observation.reason_codes],
    evidence_groups: groupEvidence(observation.evidence),
    latest_change: latestChange === null ? null : cloneChangeSet(latestChange),
  };
}

function groupEvidence(evidence: readonly SourceIntelligenceEvidenceItem[]): InvestmentV2EvidenceGroup[] {
  return SOURCE_INTELLIGENCE_DOMAINS.flatMap((domain) => {
    const items = evidence.filter((item) => item.domain === domain).map((item) => cloneEvidence(item));
    return items.length === 0 ? [] : [{ domain, items }];
  });
}

function buildSummary(sources: readonly InvestmentV2SourceView[]): InvestmentV2ReadModelSummary {
  return sources.reduce<InvestmentV2ReadModelSummary>((summary, source) => {
    summary.sources_total += 1;
    if (source.status === "READY") summary.sources_ready += 1;
    if (source.status === "DEGRADED") summary.sources_degraded += 1;
    if (source.status === "UNAVAILABLE") summary.sources_unavailable += 1;
    if (source.latest_change?.has_changes === true) summary.sources_with_changes += 1;
    summary.evidence_items_total += source.evidence_groups.reduce((count, group) => count + group.items.length, 0);
    summary.evidence_changes_total += source.latest_change?.evidence_changes.length ?? 0;
    if (source.latest_change?.comparison_status === "COMPLETE") summary.comparisons_complete += 1;
    if (source.latest_change?.comparison_status === "PARTIAL") summary.comparisons_partial += 1;
    if (source.latest_change?.comparison_status === "NOT_COMPARABLE") summary.comparisons_not_comparable += 1;
    return summary;
  }, {
    sources_total: 0,
    sources_ready: 0,
    sources_degraded: 0,
    sources_unavailable: 0,
    sources_with_changes: 0,
    evidence_items_total: 0,
    evidence_changes_total: 0,
    comparisons_complete: 0,
    comparisons_partial: 0,
    comparisons_not_comparable: 0,
  });
}

function cloneChangeSet(changeSet: InvestmentChangeSet): InvestmentChangeSet {
  return {
    schema_version: CRYPTO_EDGE_INVESTMENT_CHANGE_SET_SCHEMA_VERSION,
    identity: cloneIdentity(changeSet.identity),
    source_id: changeSet.source_id,
    previous_observed_at: changeSet.previous_observed_at,
    current_observed_at: changeSet.current_observed_at,
    comparison_status: changeSet.comparison_status,
    source_status_change: { ...changeSet.source_status_change },
    reason_code_changes: {
      added: [...changeSet.reason_code_changes.added],
      removed: [...changeSet.reason_code_changes.removed],
    },
    evidence_changes: changeSet.evidence_changes.map((change) => ({
      change_type: change.change_type,
      identity: { ...change.identity },
      previous: change.previous === null ? null : cloneEvidence(change.previous),
      current: change.current === null ? null : cloneEvidence(change.current),
      changed_fields: [...change.changed_fields],
    })),
    has_changes: changeSet.has_changes,
  };
}

function cloneEvidenceChange(value: unknown): InvestmentEvidenceChange | null {
  if (!isRecord(value) || !isEvidenceChangeType(value.change_type) || !isEvidenceSlotIdentity(value.identity)
    || !isDenseArray(value.changed_fields) || !value.changed_fields.every(isChangedField)
    || !isNullableEvidence(value.previous) || !isNullableEvidence(value.current)) {
    return null;
  }
  return {
    change_type: value.change_type,
    identity: {
      domain: value.identity.domain,
      key: value.identity.key,
      unit: value.identity.unit,
      source_reference: value.identity.source_reference,
      occurrence_index: value.identity.occurrence_index,
    },
    previous: value.previous === null ? null : cloneEvidence(value.previous),
    current: value.current === null ? null : cloneEvidence(value.current),
    changed_fields: [...value.changed_fields],
  };
}

function cloneEvidence(value: SourceIntelligenceEvidenceItem): SourceIntelligenceEvidenceItem {
  return {
    key: value.key,
    domain: value.domain,
    value: value.value,
    unit: value.unit,
    status: value.status,
    reason_code: value.reason_code,
    source_reference: value.source_reference,
  };
}

function cloneMarket(value: CanonicalMarketObservation): CanonicalMarketObservation {
  return {
    price_usd: value.price_usd,
    market_cap_usd: value.market_cap_usd,
    fdv_usd: value.fdv_usd,
    liquidity_usd: value.liquidity_usd,
    volume_24h_usd: value.volume_24h_usd,
    volume_market_cap_ratio: value.volume_market_cap_ratio,
    pair_created_at: value.pair_created_at,
    pair_age_days: value.pair_age_days,
  };
}

function cloneSocialLink(value: unknown): NormalizedSocialLink | null {
  if (!isRecord(value) || !isNonBlankString(value.category) || !isNonBlankString(value.url)) return null;
  return { category: value.category as NormalizedSocialLink["category"], url: value.url };
}

function cloneProviderReference(value: unknown): CanonicalProviderReference | null {
  if (!isRecord(value) || !isNonBlankString(value.provider_id) || !isNullableString(value.source_url)
    || typeof value.observed_at !== "string" || !isNullableString(value.provider_candidate_id)
    || !isNullableString(value.discovery_method)) {
    return null;
  }
  return {
    provider_id: value.provider_id,
    source_url: value.source_url,
    observed_at: value.observed_at,
    provider_candidate_id: value.provider_candidate_id,
    discovery_method: value.discovery_method,
  };
}

function cloneIdentity(value: CanonicalAssetIdentity): CanonicalAssetIdentity {
  return { chain: value.chain, contract_or_mint: value.contract_or_mint };
}

function cloneSource(value: SourceIntelligenceSource): SourceIntelligenceSource {
  return {
    source_id: value.source_id,
    source_name: value.source_name,
    source_url: value.source_url,
    provider_record_id: value.provider_record_id,
  };
}

function identitiesMatch(left: CanonicalAssetIdentity, right: CanonicalAssetIdentity): boolean {
  return left.chain === right.chain && left.contract_or_mint === right.contract_or_mint;
}

function isCanonicalIdentity(value: unknown): value is CanonicalAssetIdentity {
  return isRecord(value) && isNonBlankString(value.chain) && isNullableString(value.contract_or_mint);
}

function isCandidateDisplay(value: unknown): value is CanonicalCandidateDisplay {
  return isRecord(value) && typeof value.symbol === "string" && isNullableString(value.name);
}

function isCanonicalPair(value: unknown): value is CanonicalPairReference | null {
  return value === null || (isRecord(value) && isNullableString(value.pair_address) && isNullableString(value.dex));
}

function isCanonicalMarket(value: unknown): value is CanonicalMarketObservation {
  if (!isRecord(value)) return false;
  return isNullableFiniteNumber(value.price_usd) && isNullableFiniteNumber(value.market_cap_usd)
    && isNullableFiniteNumber(value.fdv_usd) && isNullableFiniteNumber(value.liquidity_usd)
    && isNullableFiniteNumber(value.volume_24h_usd) && isNullableFiniteNumber(value.volume_market_cap_ratio)
    && isNullableString(value.pair_created_at) && isNullableFiniteNumber(value.pair_age_days);
}

function isSourceStatusChange(value: unknown): value is InvestmentChangeSet["source_status_change"] {
  return isRecord(value) && isObservationStatus(value.previous) && isObservationStatus(value.current)
    && typeof value.changed === "boolean";
}

function isReasonCodeChanges(value: unknown): value is InvestmentChangeSet["reason_code_changes"] {
  return isRecord(value) && isDenseArray(value.added) && isDenseArray(value.removed)
    && value.added.every((reasonCode) => typeof reasonCode === "string")
    && value.removed.every((reasonCode) => typeof reasonCode === "string");
}

function isNullableEvidence(value: unknown): value is SourceIntelligenceEvidenceItem | null {
  return value === null || isSourceEvidence(value);
}

function isSourceEvidence(value: unknown): value is SourceIntelligenceEvidenceItem {
  return isRecord(value) && isNonBlankString(value.key) && isSourceDomain(value.domain)
    && (value.value === null || typeof value.value === "string" || typeof value.value === "boolean"
      || (typeof value.value === "number" && Number.isFinite(value.value)))
    && isNullableString(value.unit) && isEvidenceStatus(value.status) && isNullableString(value.reason_code)
    && isNullableString(value.source_reference);
}

function isEvidenceSlotIdentity(value: unknown): value is InvestmentEvidenceSlotIdentity {
  return isRecord(value) && isSourceDomain(value.domain) && isNonBlankString(value.key)
    && isNullableString(value.unit) && isNullableString(value.source_reference)
    && typeof value.occurrence_index === "number"
    && Number.isInteger(value.occurrence_index) && value.occurrence_index >= 0;
}

function isEvidenceChangeType(value: unknown): value is InvestmentEvidenceChange["change_type"] {
  return value === "ADDED" || value === "REMOVED" || value === "UPDATED";
}

function isChangedField(value: unknown): value is InvestmentEvidenceChangedField {
  return value === "value" || value === "status" || value === "reason_code";
}

function isComparisonStatus(value: unknown): value is InvestmentComparisonStatus {
  return value === "COMPLETE" || value === "PARTIAL" || value === "NOT_COMPARABLE";
}

function isObservationStatus(value: unknown): value is SourceIntelligenceObservationStatus {
  return value === "READY" || value === "DEGRADED" || value === "UNAVAILABLE";
}

function isEvidenceStatus(value: unknown): value is SourceIntelligenceEvidenceStatus {
  return value === "OBSERVED" || value === "UNKNOWN" || value === "UNAVAILABLE";
}

function isSourceDomain(value: unknown): value is SourceIntelligenceDomain {
  return typeof value === "string" && (SOURCE_INTELLIGENCE_DOMAINS as readonly string[]).includes(value);
}

function isDenseArray(value: unknown): value is unknown[] {
  if (!Array.isArray(value)) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (!(index in value)) return false;
  }
  return true;
}

function isNullableFiniteNumber(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compareLexically(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
