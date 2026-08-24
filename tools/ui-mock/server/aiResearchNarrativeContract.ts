/**
 * v5 makes the narrative a closed, evidence-bound presentation layer.  The
 * provider writes only prose for server-issued slots; it does not own facts,
 * risks, actions, targets, priorities, conditions, sources, or playbook
 * progression.
 */
export const AI_RESEARCH_NARRATIVE_VERSION = "ai_research_narrative_v5" as const;

export type AIResearchNarrativeKind = "fact" | "risk" | "missing" | "action" | "condition";

export function aiResearchNarrativeId(kind: AIResearchNarrativeKind, key: string | number): string {
  return `${kind}:${key}`;
}

export type AIResearchNarrativeSupport = {
  id: string;
  kind: "fact" | "risk" | "missing" | "action" | "condition" | "source" | "playbook";
  label: string;
  value: string | number | boolean | null;
};

export type AIResearchNarrativeSlot = {
  id: string;
  allowed_support_ids: string[];
};

export type AIResearchPlaybookBoundary = {
  current_step: number;
  current_domain: "filters" | "security" | "onchain" | "social" | "review";
  unresolved_controls: string[];
  blocked_domains: Array<"onchain" | "social" | "team" | "docs" | "narrative">;
};

export type AIResearchNarrativeContract = {
  version: typeof AI_RESEARCH_NARRATIVE_VERSION;
  research_playbook: AIResearchPlaybookBoundary;
  support_catalog: AIResearchNarrativeSupport[];
  slots: {
    summary: AIResearchNarrativeSlot;
    facts: AIResearchNarrativeSlot[];
    risks: AIResearchNarrativeSlot[];
    missing_information: AIResearchNarrativeSlot[];
    actions: AIResearchNarrativeSlot[];
    status_change_conditions: AIResearchNarrativeSlot[];
  };
};

type NarrativeContractInput = {
  fact_candidates: Array<{ key: string; label: string; value: string | number | boolean | null; source_reference_ids: string[] }>;
  risk_candidates: Array<{ title: string; evidence_reference_ids: string[] }>;
  missing_information: Array<{ key: string; label: string; source_reference_ids: string[] }>;
  action_catalog: Array<{ label: string }>;
  status_change_conditions: Array<{ key: string; label: string; source_reference_ids: string[] }>;
  source_references: Array<{ id: string; label: string }>;
  security_coverage: "complete" | "partial" | "unavailable";
  research_state: string;
};

/** Builds the complete server-issued support and slot allowlists for one job. */
export function buildAIResearchNarrativeContract(input: NarrativeContractInput): AIResearchNarrativeContract {
  const playbook = resolvePlaybookBoundary(input.security_coverage, input.research_state);
  const supports: AIResearchNarrativeSupport[] = [
    { id: `playbook:${playbook.current_step}`, kind: "playbook", label: "Current research playbook step", value: playbook.current_step },
    ...input.fact_candidates.map((item) => ({ id: `fact:${item.key}`, kind: "fact" as const, label: item.label, value: item.value })),
    ...input.risk_candidates.map((item, index) => ({ id: `risk:${index}`, kind: "risk" as const, label: item.title, value: null })),
    ...input.missing_information.map((item) => ({ id: `missing:${item.key}`, kind: "missing" as const, label: item.label, value: null })),
    ...input.action_catalog.map((item, index) => ({ id: `action:${index}`, kind: "action" as const, label: item.label, value: null })),
    ...input.status_change_conditions.map((item) => ({ id: `condition:${item.key}`, kind: "condition" as const, label: item.label, value: null })),
    ...input.source_references.map((item) => ({ id: `source:${item.id}`, kind: "source" as const, label: item.label, value: null })),
  ];
  const sourceSupports = (ids: string[]) => ids.map((id) => `source:${id}`);
  const slot = (id: string, ids: string[]) => ({ id, allowed_support_ids: [...new Set(ids)] });
  const factSlots = input.fact_candidates.map((item) => slot(
    aiResearchNarrativeId("fact", item.key),
    [`fact:${item.key}`, ...sourceSupports(item.source_reference_ids), `playbook:${playbook.current_step}`],
  ));
  const riskSlots = input.risk_candidates.map((item, index) => slot(
    aiResearchNarrativeId("risk", index),
    [`risk:${index}`, ...sourceSupports(item.evidence_reference_ids), `playbook:${playbook.current_step}`],
  ));
  const missingSlots = input.missing_information.map((item) => slot(
    aiResearchNarrativeId("missing", item.key),
    [`missing:${item.key}`, ...sourceSupports(item.source_reference_ids), `playbook:${playbook.current_step}`],
  ));
  const actionSlots = input.action_catalog.map((_item, index) => slot(
    aiResearchNarrativeId("action", index),
    [`action:${index}`, `playbook:${playbook.current_step}`],
  ));
  const conditionSlots = input.status_change_conditions.map((item) => slot(
    aiResearchNarrativeId("condition", item.key),
    [`condition:${item.key}`, ...sourceSupports(item.source_reference_ids), `playbook:${playbook.current_step}`],
  ));
  return {
    version: AI_RESEARCH_NARRATIVE_VERSION,
    research_playbook: playbook,
    support_catalog: supports,
    slots: {
      summary: slot("summary:overall", supports.map(({ id }) => id)),
      facts: factSlots,
      risks: riskSlots,
      missing_information: missingSlots,
      actions: actionSlots,
      status_change_conditions: conditionSlots,
    },
  };
}

function resolvePlaybookBoundary(
  securityCoverage: NarrativeContractInput["security_coverage"],
  researchState: string,
): AIResearchPlaybookBoundary {
  if (securityCoverage === "unavailable") {
    return { current_step: 2, current_domain: "security", unresolved_controls: [], blocked_domains: ["onchain", "social", "team", "docs", "narrative"] };
  }
  if (securityCoverage === "partial" || researchState === "MANUAL_VERIFICATION_REQUIRED") {
    return {
      current_step: 3,
      current_domain: "security",
      unresolved_controls: ["Honeypot", "TokenSniffer", "De.Fi Scanner"],
      blocked_domains: ["onchain", "social", "team", "docs", "narrative"],
    };
  }
  return { current_step: 4, current_domain: "onchain", unresolved_controls: [], blocked_domains: ["social", "team", "docs", "narrative"] };
}
