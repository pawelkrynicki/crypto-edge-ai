import {
  RESEARCH_SCORECARD_VERSION,
  RESEARCH_SCORECARD_VIEW_VERSION,
  type ResearchChecklistItem,
  type ResearchChecklistState,
  type ResearchChecklistStep,
  type ResearchScorecardCriterion,
  type ResearchScorecardCriterionState,
  type ResearchScorecardDomain,
  type ResearchScorecardNarrative,
  type ResearchScorecardView,
} from "./researchChecklistTypes";

export const RESEARCH_SCORECARD_MAXIMUMS = {
  security: 30,
  onchain: 25,
  social: 25,
  narrative: 20,
  total: 100,
} as const;

type CriterionSpec = {
  key: string;
  step: 1 | 3 | 4 | 5;
  positive: (item: ResearchChecklistItem) => boolean;
};

type ResolvedCriterion = ResearchScorecardCriterion & { applicable: boolean; resolved: boolean };

const SECURITY_CRITERIA: readonly CriterionSpec[] = [
  spec("honeypot", 3, (item) => hasText(item, "low_honeypot_risk", "no_honeypot", "passed", "pass", "false", "no", "safe", "not_honeypot")),
  spec("contract_verified", 3, (item) => hasText(item, "yes", "true", "verified")),
  spec("buy_tax", 3, (item) => numberAtMost(item, 10)),
  spec("sell_tax", 3, (item) => numberAtMost(item, 10)),
  spec("ownership", 3, (item) => hasText(item, "renounced")),
  spec("mint", 3, (item) => hasText(item, "no", "false")),
  spec("blacklist", 3, (item) => hasText(item, "no", "false")),
  spec("whitelist", 3, (item) => hasText(item, "no", "false")),
  spec("sell_restriction", 3, (item) => hasText(item, "no", "false")),
  spec("proxy", 3, (item) => hasText(item, "no", "false")),
  spec("tokensniffer", 3, (item) => item.value_number !== null && item.value_number >= 50),
  spec("defi_scanner", 3, (item) => item.manual_evidence?.source_tool === "De.Fi Scanner" && hasText(item, "clean", "acceptable")),
];

const ONCHAIN_CRITERIA: readonly CriterionSpec[] = [
  spec("top1_wallet", 4, (item) => numberBelow(item, 10)),
  spec("top10_wallets", 4, (item) => numberBelow(item, 40)),
  spec("liquidity_market_cap_ratio", 4, (item) => item.value_number !== null && item.value_number >= 0.1 && item.value_number <= 0.3),
  spec("liquidity_lock", 4, (item) => hasText(item, "locked", "yes", "true")),
  spec("liquidity_lock_days", 4, (item) => item.value_number !== null && item.value_number >= 180 && item.value_number <= 365),
  spec("holder_count", 4, (item) => item.value_number !== null && item.value_number >= 300),
  spec("developer_wallet", 4, (item) => item.value_number !== null && item.value_number < 5),
  spec("wallet_clustering", 4, (item) => hasText(item, "no_material_cluster")),
  spec("volume_quality", 4, (item) => hasText(item, "natural")),
];

const SOCIAL_CRITERIA: readonly CriterionSpec[] = [
  spec("twitter", 5, (item) => hasText(item, "healthy")),
  spec("telegram", 5, (item) => hasText(item, "healthy")),
  spec("discord", 5, (item) => hasText(item, "healthy")),
  spec("website", 5, (item) => hasText(item, "working")),
  spec("team", 5, (item) => hasText(item, "transparent")),
  spec("whitepaper", 5, (item) => hasText(item, "reasonable")),
  spec("roadmap", 5, (item) => hasText(item, "coherent")),
];

const STEP_ONE_CRITERIA: readonly CriterionSpec[] = [
  spec("market_cap", 1, () => false),
  spec("volume_24h", 1, () => false),
  spec("liquidity", 1, () => false),
  spec("pair_age", 1, () => false),
  spec("volume_market_cap_ratio", 1, () => false),
  spec("token_age", 1, () => false),
];

/**
 * Resolves the effective score from automatic checklist facts plus the current
 * actor's already-filtered private evidence. This function is pure: it has no
 * persistence, provider, lifecycle, Radar, or AI-cache side effects.
 */
export function resolveResearchScorecard(steps: readonly ResearchChecklistStep[]): ResearchScorecardView {
  const security = resolveDomain(SECURITY_CRITERIA, steps, RESEARCH_SCORECARD_MAXIMUMS.security);
  const onchain = resolveDomain(ONCHAIN_CRITERIA, steps, RESEARCH_SCORECARD_MAXIMUMS.onchain);
  const social = resolveDomain(SOCIAL_CRITERIA, steps, RESEARCH_SCORECARD_MAXIMUMS.social);
  const narrative = unresolvedNarrative();

  const stepOne = STEP_ONE_CRITERIA.map((criterion) => resolveCriterion(criterion, steps));
  const readinessGroups = [
    readinessGroup(1, stepOne),
    readinessGroup(2, []),
    readinessGroup(3, criteriaForReadiness(security.reasons)),
    readinessGroup(4, criteriaForReadiness(onchain.reasons)),
    readinessGroup(5, criteriaForReadiness(social.reasons)),
    readinessGroup(6, criteriaForReadiness(narrative.reasons)),
  ];
  const readiness = aggregateReadiness(readinessGroups);
  const totalEarned = security.earned + onchain.earned + social.earned + narrative.earned;
  const complete = readiness.red_flags === 0 && readiness.missing === 0 && narrative.scored;

  return {
    schema_version: RESEARCH_SCORECARD_VIEW_VERSION,
    scoring_version: RESEARCH_SCORECARD_VERSION,
    security,
    onchain,
    social,
    narrative,
    total: {
      earned: totalEarned,
      max: RESEARCH_SCORECARD_MAXIMUMS.total,
      scored_max: RESEARCH_SCORECARD_MAXIMUMS.security + RESEARCH_SCORECARD_MAXIMUMS.onchain + RESEARCH_SCORECARD_MAXIMUMS.social,
      unresolved_max: narrative.unresolved_max,
    },
    complete,
    partial: !complete,
    red_flags_total: readiness.red_flags,
    missing_total: readiness.missing,
    resolved_total: readiness.resolved,
    applicable_total: readiness.applicable,
    readiness,
  };
}

function resolveDomain(specs: readonly CriterionSpec[], steps: readonly ResearchChecklistStep[], max: number): ResearchScorecardDomain {
  const resolved = specs.map((criterion) => resolveCriterion(criterion, steps));
  const applicable = resolved.filter((criterion) => criterion.applicable);
  const allocation = applicable.length === 0 ? 0 : max / applicable.length;
  const reasons = resolved.map(({ key, state, reason }) => ({ key, state, reason }));
  return {
    earned: applicable.filter((criterion) => criterion.state === "POSITIVE").length * allocation,
    max,
    resolved: applicable.filter((criterion) => criterion.resolved).length,
    applicable: applicable.length,
    missing: applicable.filter((criterion) => criterion.state === "MISSING").length,
    red_flags: applicable.filter((criterion) => criterion.state === "RED_FLAG").length,
    reasons,
  };
}

function unresolvedNarrative(): ResearchScorecardNarrative {
  return {
    earned: 0,
    max: RESEARCH_SCORECARD_MAXIMUMS.narrative,
    scored: false,
    unresolved_max: RESEARCH_SCORECARD_MAXIMUMS.narrative,
    resolved: 0,
    applicable: 1,
    missing: 1,
    red_flags: 0,
    reasons: [{ key: "narrative", state: "MISSING", reason: "No approved numeric narrative source is available." }],
  };
}

function resolveCriterion(specification: CriterionSpec, steps: readonly ResearchChecklistStep[]): ResolvedCriterion {
  const item = findItem(steps, specification.step, specification.key);
  if (!item || item.state === "MISSING_DATA" || item.state === "OPEN_EXTERNAL_TOOL") {
    return criterion(specification.key, "MISSING", "Evidence has not been recorded.", true, false);
  }
  if (item.state === "NOT_APPLICABLE") {
    return criterion(specification.key, "NOT_APPLICABLE", "This check is not applicable.", false, false);
  }
  if (item.state === "RED_FLAG") {
    return criterion(specification.key, "RED_FLAG", "A red flag was recorded.", true, true);
  }
  // AUTO_VERIFIED means the fact is known. It does not itself earn points;
  // every positive result must satisfy its criterion-specific value predicate.
  if (specification.positive(item)) {
    return criterion(specification.key, "POSITIVE", "Positive evidence was confirmed.", true, true);
  }
  return criterion(specification.key, "RESOLVED", "The evidence is known but does not meet the positive criterion.", true, true);
}

function readinessGroup(stepNumber: 1 | 2 | 3 | 4 | 5 | 6, criteria: readonly (ResolvedCriterion | ResearchScorecardCriterion)[]) {
  const applicable = criteria.filter((criterion) => criterion.state !== "NOT_APPLICABLE");
  return {
    step_number: stepNumber,
    resolved: applicable.filter((criterion) => criterion.state === "POSITIVE" || criterion.state === "RESOLVED" || criterion.state === "RED_FLAG").length,
    applicable: applicable.length,
    missing: applicable.filter((criterion) => criterion.state === "MISSING").length,
    red_flags: applicable.filter((criterion) => criterion.state === "RED_FLAG").length,
    reasons: criteria.map(({ key, state, reason }) => ({ key, state, reason })),
  };
}

function aggregateReadiness(groups: ReturnType<typeof readinessGroup>[]) {
  const resolved = groups.reduce((sum, group) => sum + group.resolved, 0);
  const applicable = groups.reduce((sum, group) => sum + group.applicable, 0);
  const missing = groups.reduce((sum, group) => sum + group.missing, 0);
  const redFlags = groups.reduce((sum, group) => sum + group.red_flags, 0);
  return {
    status: redFlags > 0
      ? "RED_FLAGS_DETECTED" as const
      : missing > 0
        ? "RESEARCH_INCOMPLETE" as const
        : "RESEARCH_COMPLETE_FOR_OWN_ASSESSMENT" as const,
    resolved,
    applicable,
    missing,
    red_flags: redFlags,
    groups,
  };
}

function criteriaForReadiness(criteria: readonly ResearchScorecardCriterion[]): ResearchScorecardCriterion[] {
  return criteria.map((criterion) => ({ ...criterion }));
}

function criterion(key: string, state: ResearchScorecardCriterionState, reason: string, applicable: boolean, resolved: boolean): ResolvedCriterion {
  return { key, state, reason, applicable, resolved };
}

function findItem(steps: readonly ResearchChecklistStep[], step: number, key: string): ResearchChecklistItem | null {
  return steps.find((entry) => entry.number === step)?.items.find((item) => item.key === key) ?? null;
}

function spec(key: string, step: CriterionSpec["step"], positive: CriterionSpec["positive"]): CriterionSpec {
  return { key, step, positive };
}

function normalText(item: ResearchChecklistItem): string {
  return (item.value_text ?? "").trim().toLowerCase().replaceAll(" ", "_");
}

function hasText(item: ResearchChecklistItem, ...values: string[]): boolean {
  return values.includes(normalText(item));
}

function numberAtMost(item: ResearchChecklistItem, maximum: number): boolean {
  return item.value_number !== null && item.value_number <= maximum;
}

function numberBelow(item: ResearchChecklistItem, maximum: number): boolean {
  return item.value_number !== null && item.value_number < maximum;
}

/** Re-exported for focused unit tests and documentation checks. */
export function isResearchScorecardResolvedState(state: ResearchChecklistState): boolean {
  return state === "AUTO_VERIFIED" || state === "MANUAL_VERIFIED" || state === "NOT_APPLICABLE" || state === "RED_FLAG";
}
