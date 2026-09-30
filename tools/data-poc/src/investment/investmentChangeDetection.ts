import {
  createSourceIntelligenceObservation,
  CRYPTO_EDGE_SOURCE_INTELLIGENCE_OBSERVATION_SCHEMA_VERSION,
  type SourceIntelligenceEvidenceItem,
  type SourceIntelligenceObservation,
  type SourceIntelligenceObservationStatus,
} from "../intelligence/sourceIntelligence.js";
import type { CanonicalAssetIdentity } from "../discovery/canonicalCandidate.js";

export const CRYPTO_EDGE_INVESTMENT_CHANGE_SET_SCHEMA_VERSION = "crypto_edge_investment_change_set_v1" as const;
export const INVESTMENT_CHANGE_INPUT_INVALID = "INVESTMENT_CHANGE_INPUT_INVALID" as const;
export const INVESTMENT_CHANGE_IDENTITY_MISMATCH = "INVESTMENT_CHANGE_IDENTITY_MISMATCH" as const;
export const INVESTMENT_CHANGE_SOURCE_MISMATCH = "INVESTMENT_CHANGE_SOURCE_MISMATCH" as const;
export const INVESTMENT_CHANGE_TIME_ORDER_INVALID = "INVESTMENT_CHANGE_TIME_ORDER_INVALID" as const;

export type InvestmentComparisonStatus = "COMPLETE" | "PARTIAL" | "NOT_COMPARABLE";
export type InvestmentEvidenceChangeType = "ADDED" | "REMOVED" | "UPDATED";
export type InvestmentEvidenceChangedField = "value" | "status" | "reason_code";

export type InvestmentEvidenceSlotIdentity = {
  domain: SourceIntelligenceEvidenceItem["domain"];
  key: string;
  unit: string | null;
  source_reference: string | null;
  occurrence_index: number;
};

export type InvestmentEvidenceChange = {
  change_type: InvestmentEvidenceChangeType;
  identity: InvestmentEvidenceSlotIdentity;
  previous: SourceIntelligenceEvidenceItem | null;
  current: SourceIntelligenceEvidenceItem | null;
  changed_fields: InvestmentEvidenceChangedField[];
};

/**
 * A factual, source-local delta between two source intelligence observations.
 * Evidence is ordered deterministically: updates then additions in current
 * evidence order, followed by removals in previous evidence order.
 */
export type InvestmentChangeSet = {
  schema_version: typeof CRYPTO_EDGE_INVESTMENT_CHANGE_SET_SCHEMA_VERSION;
  identity: CanonicalAssetIdentity;
  source_id: string;
  previous_observed_at: string;
  current_observed_at: string;
  comparison_status: InvestmentComparisonStatus;
  source_status_change: {
    previous: SourceIntelligenceObservationStatus;
    current: SourceIntelligenceObservationStatus;
    changed: boolean;
  };
  reason_code_changes: {
    added: string[];
    removed: string[];
  };
  evidence_changes: InvestmentEvidenceChange[];
  has_changes: boolean;
};

/**
 * Compares two validated observations for one exact asset and source. It is a
 * pure factual boundary: it performs no materiality, risk, or investment
 * interpretation.
 */
export function detectInvestmentChanges(
  previousInput: SourceIntelligenceObservation,
  currentInput: SourceIntelligenceObservation,
): InvestmentChangeSet {
  const previous = validateObservation(previousInput);
  const current = validateObservation(currentInput);

  if (previous.identity.chain !== current.identity.chain
    || previous.identity.contract_or_mint !== current.identity.contract_or_mint) {
    throw new Error(INVESTMENT_CHANGE_IDENTITY_MISMATCH);
  }
  if (previous.source.source_id !== current.source.source_id) {
    throw new Error(INVESTMENT_CHANGE_SOURCE_MISMATCH);
  }
  if (new Date(current.observed_at).getTime() <= new Date(previous.observed_at).getTime()) {
    throw new Error(INVESTMENT_CHANGE_TIME_ORDER_INVALID);
  }

  const comparisonStatus = determineComparisonStatus(previous.status, current.status);
  const reasonCodeChanges = detectReasonCodeChanges(previous.reason_codes, current.reason_codes);
  const evidenceChanges = detectEvidenceChanges(previous.evidence, current.evidence, comparisonStatus);
  const sourceStatusChange = {
    previous: previous.status,
    current: current.status,
    changed: previous.status !== current.status,
  };

  return {
    schema_version: CRYPTO_EDGE_INVESTMENT_CHANGE_SET_SCHEMA_VERSION,
    identity: cloneIdentity(previous.identity),
    source_id: previous.source.source_id,
    previous_observed_at: previous.observed_at,
    current_observed_at: current.observed_at,
    comparison_status: comparisonStatus,
    source_status_change: sourceStatusChange,
    reason_code_changes: reasonCodeChanges,
    evidence_changes: evidenceChanges,
    has_changes: sourceStatusChange.changed
      || reasonCodeChanges.added.length > 0
      || reasonCodeChanges.removed.length > 0
      || evidenceChanges.length > 0,
  };
}

function validateObservation(value: unknown): SourceIntelligenceObservation {
  if (!isRecord(value) || value.schema_version !== CRYPTO_EDGE_SOURCE_INTELLIGENCE_OBSERVATION_SCHEMA_VERSION) {
    throw new Error(INVESTMENT_CHANGE_INPUT_INVALID);
  }

  try {
    return createSourceIntelligenceObservation({
      identity: value.identity as CanonicalAssetIdentity,
      source: value.source as SourceIntelligenceObservation["source"],
      observed_at: value.observed_at as string,
      status: value.status as SourceIntelligenceObservationStatus,
      reason_codes: value.reason_codes as string[],
      evidence: value.evidence as SourceIntelligenceEvidenceItem[],
    });
  } catch {
    throw new Error(INVESTMENT_CHANGE_INPUT_INVALID);
  }
}

function determineComparisonStatus(
  previous: SourceIntelligenceObservationStatus,
  current: SourceIntelligenceObservationStatus,
): InvestmentComparisonStatus {
  if (previous === "UNAVAILABLE" || current === "UNAVAILABLE") return "NOT_COMPARABLE";
  if (previous === "DEGRADED" || current === "DEGRADED") return "PARTIAL";
  return "COMPLETE";
}

function detectReasonCodeChanges(previous: readonly string[], current: readonly string[]): { added: string[]; removed: string[] } {
  const previousCodes = new Set(previous);
  const currentCodes = new Set(current);

  return {
    added: [...currentCodes].filter((code) => !previousCodes.has(code)).sort(),
    removed: [...previousCodes].filter((code) => !currentCodes.has(code)).sort(),
  };
}

function detectEvidenceChanges(
  previous: readonly SourceIntelligenceEvidenceItem[],
  current: readonly SourceIntelligenceEvidenceItem[],
  comparisonStatus: InvestmentComparisonStatus,
): InvestmentEvidenceChange[] {
  if (comparisonStatus === "NOT_COMPARABLE") return [];

  const previousSlots = createEvidenceSlots(previous);
  const currentSlots = createEvidenceSlots(current);
  const previousByIdentity = new Map(previousSlots.map((slot) => [slot.encodedIdentity, slot]));
  const currentByIdentity = new Map(currentSlots.map((slot) => [slot.encodedIdentity, slot]));
  const previousBaseSlotCounts = countBaseSlots(previousSlots);
  const currentBaseSlotCounts = countBaseSlots(currentSlots);
  const updates: InvestmentEvidenceChange[] = [];

  for (const currentSlot of currentSlots) {
    const previousSlot = previousByIdentity.get(currentSlot.encodedIdentity);
    if (!previousSlot) continue;
    if (comparisonStatus === "PARTIAL"
      && previousBaseSlotCounts.get(currentSlot.baseSlotIdentity) !== currentBaseSlotCounts.get(currentSlot.baseSlotIdentity)) {
      continue;
    }

    const changedFields = changedEvidenceFields(previousSlot.evidence, currentSlot.evidence);
    if (changedFields.length > 0) {
      updates.push({
        change_type: "UPDATED",
        identity: cloneSlotIdentity(currentSlot.identity),
        previous: cloneEvidence(previousSlot.evidence),
        current: cloneEvidence(currentSlot.evidence),
        changed_fields: changedFields,
      });
    }
  }

  if (comparisonStatus === "PARTIAL") return updates;

  const additions = currentSlots
    .filter((slot) => !previousByIdentity.has(slot.encodedIdentity))
    .map((slot) => ({
      change_type: "ADDED" as const,
      identity: cloneSlotIdentity(slot.identity),
      previous: null,
      current: cloneEvidence(slot.evidence),
      changed_fields: [],
    }));
  const removals = previousSlots
    .filter((slot) => !currentByIdentity.has(slot.encodedIdentity))
    .map((slot) => ({
      change_type: "REMOVED" as const,
      identity: cloneSlotIdentity(slot.identity),
      previous: cloneEvidence(slot.evidence),
      current: null,
      changed_fields: [],
    }));

  return [...updates, ...additions, ...removals];
}

type EvidenceSlot = {
  identity: InvestmentEvidenceSlotIdentity;
  baseSlotIdentity: string;
  encodedIdentity: string;
  evidence: SourceIntelligenceEvidenceItem;
};

function createEvidenceSlots(evidence: readonly SourceIntelligenceEvidenceItem[]): EvidenceSlot[] {
  const occurrenceCounts = new Map<string, number>();

  return evidence.map((item) => {
    const slotFields = [item.domain, item.key, item.unit, item.source_reference] as const;
    const slotIdentity = JSON.stringify(slotFields);
    const occurrenceIndex = occurrenceCounts.get(slotIdentity) ?? 0;
    occurrenceCounts.set(slotIdentity, occurrenceIndex + 1);
    const identity = {
      domain: item.domain,
      key: item.key,
      unit: item.unit,
      source_reference: item.source_reference,
      occurrence_index: occurrenceIndex,
    };

    return {
      identity,
      baseSlotIdentity: slotIdentity,
      encodedIdentity: JSON.stringify([...slotFields, occurrenceIndex]),
      evidence: item,
    };
  });
}

function countBaseSlots(slots: readonly EvidenceSlot[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const slot of slots) {
    counts.set(slot.baseSlotIdentity, (counts.get(slot.baseSlotIdentity) ?? 0) + 1);
  }
  return counts;
}

function changedEvidenceFields(
  previous: SourceIntelligenceEvidenceItem,
  current: SourceIntelligenceEvidenceItem,
): InvestmentEvidenceChangedField[] {
  const fields: InvestmentEvidenceChangedField[] = [];
  if (previous.value !== current.value) fields.push("value");
  if (previous.status !== current.status) fields.push("status");
  if (previous.reason_code !== current.reason_code) fields.push("reason_code");
  return fields;
}

function cloneIdentity(identity: CanonicalAssetIdentity): CanonicalAssetIdentity {
  return { chain: identity.chain, contract_or_mint: identity.contract_or_mint };
}

function cloneSlotIdentity(identity: InvestmentEvidenceSlotIdentity): InvestmentEvidenceSlotIdentity {
  return {
    domain: identity.domain,
    key: identity.key,
    unit: identity.unit,
    source_reference: identity.source_reference,
    occurrence_index: identity.occurrence_index,
  };
}

function cloneEvidence(evidence: SourceIntelligenceEvidenceItem): SourceIntelligenceEvidenceItem {
  return {
    key: evidence.key,
    domain: evidence.domain,
    value: evidence.value,
    unit: evidence.unit,
    status: evidence.status,
    reason_code: evidence.reason_code,
    source_reference: evidence.source_reference,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
