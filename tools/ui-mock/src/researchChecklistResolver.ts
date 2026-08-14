import { resolveProductFilterConditions } from "./productFilterResolver";
import { resolveManualResearchTarget, type ManualResearchTool } from "./externalVerificationTargets";
import { resolveResearchScorecard } from "./researchScorecardResolver";
import type { UiTokenCandidate } from "./types/scannerTypes";
import {
  type PublicResearchEvidence,
  type ResearchChecklistItem,
  type ResearchChecklistItemKey,
  type ResearchChecklistState,
  type ResearchChecklistStep,
  type ResearchChecklistView,
  type ResearchAutomaticProvenance,
  type ResearchStepNumber,
} from "./researchChecklistTypes";

const STEP_ITEM_KEYS: Record<ResearchStepNumber, readonly ResearchChecklistItemKey[]> = {
  1: ["market_cap", "volume_24h", "liquidity", "pair_age", "volume_market_cap_ratio", "token_age"],
  2: ["honeypot", "top1_wallet", "contract_verified", "buy_tax", "sell_tax", "liquidity_unlocked", "tokensniffer", "anonymous_team_young_project", "suspicious_whitepaper"],
  3: ["goplus_coverage", "honeypot", "contract_verified", "ownership", "mint", "blacklist", "whitelist", "sell_restriction", "proxy", "buy_tax", "sell_tax", "liquidity_lock", "tokensniffer", "defi_scanner"],
  4: ["top1_wallet", "top10_wallets", "liquidity_market_cap_ratio", "liquidity_lock", "liquidity_lock_days", "holder_count", "developer_wallet", "liquidity_lock_end_date", "wallet_clustering", "volume_quality"],
  5: ["twitter", "telegram", "discord", "website", "team", "whitepaper", "roadmap"],
  6: ["security_scorecard", "onchain_scorecard", "social_scorecard", "narrative_scorecard"],
  7: ["research_readiness"],
};

const MANUAL_DISABLED = new Set<ResearchChecklistItemKey>([
  "security_scorecard",
  "onchain_scorecard",
  "social_scorecard",
  "narrative_scorecard",
  "research_readiness",
]);

type AutomaticItem = {
  key: ResearchChecklistItemKey;
  step_number: ResearchStepNumber;
  automatic_state: ResearchChecklistState;
  value_text: string | null;
  value_number: number | null;
  threshold: string | null;
  manual_external_tool: ManualResearchTool | null;
  manual_external_state: ResearchChecklistState | null;
  automatic_provenance: ResearchAutomaticProvenance | null;
  automatic_link: ResearchChecklistItem["automatic_link"];
};

export function resolveResearchChecklist(
  candidate: UiTokenCandidate,
  manualEvidence: readonly PublicResearchEvidence[] = [],
): ResearchChecklistView {
  const manualByLocation = new Map(manualEvidence.map((evidence) => [`${evidence.step_number}:${evidence.item_key}`, evidence]));
  const automatic = buildAutomaticEvidence(candidate);
  const rawSteps: ResearchChecklistStep[] = ([1, 2, 3, 4, 5] as const).map((number) => {
    const items = STEP_ITEM_KEYS[number].map((key) => applyManualEvidence(
      automatic.get(`${number}:${key}`) ?? missingItem(number, key),
      manualByLocation.get(`${number}:${key}`) ?? null,
    ));
    return buildStep(number, items);
  });
  // Step 2 is a playbook summary, not a second private-evidence store. Its
  // overlapping checks mirror their canonical Step 3–5 facts in this
  // calculated read model; the one unique Deal Breaker is derived below.
  const steps = reconcileResearchChecklistStep2(rawSteps);

  // Effective research scoring is calculated from the just-resolved shared
  // facts plus this actor's private evidence. It never reads or writes the
  // scanner PersistableScorecard.
  const effectiveScorecard = resolveResearchScorecard(steps);
  steps.push(buildScorecardStep(effectiveScorecard));
  const currentStep = deriveCurrentStep(steps);
  const hasRedFlag = effectiveScorecard.readiness.red_flags > 0;
  const unresolved = effectiveScorecard.readiness.missing > 0;
  const readiness = hasRedFlag
    ? "CRITICAL_RED_FLAG_PRESENT" as const
    : unresolved
      ? "RESEARCH_INCOMPLETE" as const
      : "EVIDENCE_COMPLETE_FOR_REVIEW" as const;
  // Red flags are intentionally first: the final status and all displayed
  // counters resolve from one global, unique-check aggregation.
  const finalAutomaticState: ResearchChecklistState = hasRedFlag
    ? "RED_FLAG"
    : unresolved
      ? "MISSING_DATA"
      : "AUTO_VERIFIED";
  const finalItem = applyManualEvidence({
    key: "research_readiness",
    step_number: 7,
    automatic_state: finalAutomaticState,
    value_text: null,
    value_number: null,
    threshold: null,
    manual_external_tool: null,
    manual_external_state: null,
    automatic_provenance: null,
    automatic_link: null,
  }, null);
  steps.push(buildStep(7, [finalItem]));

  return {
    schema_version: "research_checklist_view_v1",
    chain: candidate.chain.trim().toLowerCase(),
    contract_address: normalizeAddress(candidate.contractAddress),
    manual_evidence_writable: false,
    current_step: currentStep,
    completeness: {
      resolved_checks: effectiveScorecard.resolved_total,
      total_checks: effectiveScorecard.applicable_total,
      percentage: effectiveScorecard.applicable_total === 0 ? 0 : Math.round((effectiveScorecard.resolved_total / effectiveScorecard.applicable_total) * 100),
      red_flags: effectiveScorecard.red_flags_total,
    },
    readiness,
    steps,
    effective_scorecard: effectiveScorecard,
  };
}

export function isResearchChecklistStateResolved(state: ResearchChecklistState): boolean {
  return isResolved(state);
}

function buildAutomaticEvidence(candidate: UiTokenCandidate): Map<string, AutomaticItem> {
  const output = new Map<string, AutomaticItem>();
  const dexScreenerProvenance: ResearchAutomaticProvenance = {
    source: "DexScreener",
    snapshot_at: candidate.candidateSnapshotAt ?? candidate.lastCheckedAt ?? null,
    normalization_path: "candidate_snapshot",
  };
  const goPlusProvenance = candidate.security?.sources.some((source) => source.trim().toLowerCase() === "goplus")
    ? {
      source: "GoPlus" as const,
      snapshot_at: candidate.security.checkedAt,
      normalization_path: "security_snapshot" as const,
    }
    : null;
  const filter = resolveProductFilterConditions({
    basicFilterStatus: candidate.basicFilterStatus,
    filterReasons: candidate.filterReasons,
  });
  const filterState = (category: "market_cap" | "volume_24h" | "liquidity" | "pair_age" | "volume_market_cap_ratio", value: number | null): ResearchChecklistState => {
    const condition = filter.conditions.find((entry) => entry.category === category);
    if (condition?.state === "failed") return "RED_FLAG";
    return value === null || condition?.state !== "passed" ? "MISSING_DATA" : "AUTO_VERIFIED";
  };
  add(output, 1, "market_cap", filterState("market_cap", candidate.marketCap), candidate.marketCap, null, "$300K–$10M");
  add(output, 1, "volume_24h", filterState("volume_24h", candidate.volume24h), candidate.volume24h, null, ">= $30K");
  add(output, 1, "liquidity", filterState("liquidity", candidate.liquidity), candidate.liquidity, null, ">= $30K");
  add(output, 1, "pair_age", filterState("pair_age", candidate.pairAgeDays), candidate.pairAgeDays, null, "> 7 days; preferred 14–90 days");
  add(output, 1, "volume_market_cap_ratio", filterState("volume_market_cap_ratio", candidate.volumeMarketCapRatio), candidate.volumeMarketCapRatio, null, "1%–100%; preferred 5%–30%");
  add(output, 1, "token_age", "MISSING_DATA", null, null, null);

  const security = candidate.security;
  const honeypotState = security ? stateForHoneypot(security.honeypotStatus) : "MISSING_DATA";
  const top1State = security ? stateForMaximum(security.topWalletPct, 30) : "MISSING_DATA";
  const contractState = security ? stateForRequiredBoolean(security.contractVerified) : "MISSING_DATA";
  const buyTaxState = security ? stateForMaximum(security.buyTax, 10) : "MISSING_DATA";
  const sellTaxState = security ? stateForMaximum(security.sellTax, 10) : "MISSING_DATA";
  const liquidityState = security ? stateForRequiredBoolean(security.liquidityLocked) : "MISSING_DATA";
  const liquidityLockText = lockText(security?.liquidityLocked);
  add(output, 2, "honeypot", honeypotState, null, security?.honeypotStatus ?? null, null);
  add(output, 2, "top1_wallet", top1State, security?.topWalletPct ?? null, null, "<= 30%");
  add(output, 2, "contract_verified", contractState, null, boolText(security?.contractVerified), "required");
  add(output, 2, "buy_tax", buyTaxState, security?.buyTax ?? null, null, "<= 10%");
  add(output, 2, "sell_tax", sellTaxState, security?.sellTax ?? null, null, "<= 10%");
  add(output, 2, "liquidity_unlocked", liquidityState, null, liquidityLockText, "must be locked");
  add(output, 2, "tokensniffer", "MISSING_DATA", null, null, null);
  add(output, 2, "anonymous_team_young_project", "MISSING_DATA", null, null, null);
  add(output, 2, "suspicious_whitepaper", "MISSING_DATA", null, null, null);

  const goplusAvailable = Boolean(security?.sources.some((source) => source.trim().toLowerCase().includes("goplus")));
  add(output, 3, "goplus_coverage", goplusAvailable ? "AUTO_VERIFIED" : "MISSING_DATA", null, null, null);
  add(output, 3, "honeypot", honeypotState, null, security?.honeypotStatus ?? null, null, "honeypot", honeypotState === "MISSING_DATA" ? manualExternalState(candidate, "honeypot") : honeypotState);
  add(output, 3, "contract_verified", contractState, null, boolText(security?.contractVerified), null);
  add(output, 3, "ownership", stateForKnownOwnership(security?.ownershipStatus), null, ownershipText(security?.ownershipStatus), null);
  add(output, 3, "mint", security ? stateForRiskBoolean(security.mintRisk) : "MISSING_DATA", null, boolText(security?.mintRisk), null);
  add(output, 3, "blacklist", security ? stateForRiskBoolean(security.blacklistRisk) : "MISSING_DATA", null, boolText(security?.blacklistRisk), null);
  add(output, 3, "whitelist", security ? stateForRiskBoolean(security.whitelistRisk) : "MISSING_DATA", null, boolText(security?.whitelistRisk), null);
  add(output, 3, "sell_restriction", security ? stateForRiskBoolean(security.sellRestrictionRisk) : "MISSING_DATA", null, boolText(security?.sellRestrictionRisk), null);
  add(output, 3, "proxy", security ? stateForRiskBoolean(security.proxyRisk) : "MISSING_DATA", null, boolText(security?.proxyRisk), null);
  add(output, 3, "buy_tax", buyTaxState, security?.buyTax ?? null, null, "<= 10%");
  add(output, 3, "sell_tax", sellTaxState, security?.sellTax ?? null, null, "<= 10%");
  add(output, 3, "liquidity_lock", liquidityState, null, liquidityLockText, null);
  add(output, 3, "tokensniffer", "MISSING_DATA", null, null, null, "tokensniffer", manualExternalState(candidate, "tokensniffer"));
  add(output, 3, "defi_scanner", "MISSING_DATA", null, null, null, "defi_scanner", manualExternalState(candidate, "defi_scanner"));

  // Step 4 quality context deliberately stays separate from frozen Step 2
  // deal-breaker rules. Top 10 concentration has a quality preference only;
  // every available value remains factual context in PC.3C.
  add(output, 4, "top1_wallet", top1State, security?.topWalletPct ?? null, null, "preferred <10%; deal-breaker >30%", null, null, goPlusProvenance);
  add(output, 4, "top10_wallets", security?.top10WalletsPct == null ? "MISSING_DATA" : "AUTO_VERIFIED", security?.top10WalletsPct ?? null, null, "preferred <40%", null, null, goPlusProvenance);
  const liquidityMarketCap = candidate.liquidity == null || candidate.marketCap == null
    ? null
    : liquidityMarketCapRatio(candidate.liquidity, candidate.marketCap);
  add(output, 4, "liquidity_market_cap_ratio", liquidityMarketCap == null ? "MISSING_DATA" : stateForMinimum(liquidityMarketCap, 0.03), liquidityMarketCap, null, "optimal 10–30%; red concern <3%", null, null, liquidityMarketCap == null ? null : { ...dexScreenerProvenance, normalization_path: "derived_from_candidate_snapshot" });
  add(output, 4, "liquidity_lock", liquidityState, null, liquidityLockText, "must be locked", null, null, goPlusProvenance);
  add(output, 4, "liquidity_lock_days", security?.liquidityLockDays == null ? "MISSING_DATA" : "AUTO_VERIFIED", security?.liquidityLockDays ?? null, null, "preferred 180–365 days", null, null, goPlusProvenance);
  for (const key of ["holder_count", "developer_wallet", "liquidity_lock_end_date", "volume_quality"] as const) add(output, 4, key, "MISSING_DATA", null, null, null);
  add(output, 4, "wallet_clustering", "MISSING_DATA", null, null, null, "bubblemaps", manualExternalState(candidate, "bubblemaps"));

  for (const key of STEP_ITEM_KEYS[5]) {
    const link = (candidate.socialLinks ?? []).find((entry) => entry.category === key) ?? null;
    add(
      output,
      5,
      key,
      "MISSING_DATA",
      null,
      null,
      null,
      null,
      null,
      link ? { source: link.source, snapshot_at: link.snapshotAt, normalization_path: "candidate_snapshot" } : null,
      link ? { url: link.url, provenance: { source: link.source, snapshot_at: link.snapshotAt, normalization_path: "candidate_snapshot" } } : null,
    );
  }
  return output;
}

function buildScorecardStep(scorecard: ReturnType<typeof resolveResearchScorecard>): ResearchChecklistStep {
  const stateForDomain = (domain: { missing: number; red_flags: number }): ResearchChecklistState => domain.red_flags > 0
    ? "RED_FLAG"
    : domain.missing > 0
      ? "MISSING_DATA"
      : "AUTO_VERIFIED";
  const items = [
    ["security_scorecard", scorecard.security],
    ["onchain_scorecard", scorecard.onchain],
    ["social_scorecard", scorecard.social],
    ["narrative_scorecard", scorecard.narrative],
  ] as const;
  return buildStep(6, items.map(([key, domain]) => applyManualEvidence({
    key,
    step_number: 6,
    automatic_state: stateForDomain(domain),
    value_text: domain === scorecard.narrative && !scorecard.narrative.scored ? null : `${domain.earned}/${domain.max}`,
    value_number: domain.earned,
    threshold: null,
    manual_external_tool: null,
    manual_external_state: null,
    automatic_provenance: null,
    automatic_link: null,
  }, null)));
}

function add(
  output: Map<string, AutomaticItem>,
  step: Exclude<ResearchStepNumber, 7>,
  key: ResearchChecklistItemKey,
  automaticState: ResearchChecklistState,
  valueNumber: number | null,
  valueText: string | null,
  threshold: string | null,
  manualExternalTool: ManualResearchTool | null = null,
  manualExternalState: ResearchChecklistState | null = null,
  automaticProvenance: ResearchAutomaticProvenance | null = null,
  automaticLink: ResearchChecklistItem["automatic_link"] = null,
): void {
  output.set(`${step}:${key}`, {
    key,
    step_number: step,
    automatic_state: automaticState,
    value_text: valueText,
    value_number: valueNumber,
    threshold,
    manual_external_tool: manualExternalTool,
    manual_external_state: manualExternalState,
    automatic_provenance: automaticProvenance,
    automatic_link: automaticLink,
  });
}

function missingItem(step: ResearchStepNumber, key: ResearchChecklistItemKey): AutomaticItem {
  return { key, step_number: step, automatic_state: "MISSING_DATA", value_text: null, value_number: null, threshold: null, manual_external_tool: null, manual_external_state: null, automatic_provenance: null, automatic_link: null };
}

function applyManualEvidence(automatic: AutomaticItem, manual: PublicResearchEvidence | null): ResearchChecklistItem {
  const automaticState = automatic.automatic_state;
  const manualWins = automatic.manual_external_tool !== null || automaticState === "MISSING_DATA" || automaticState === "OPEN_EXTERNAL_TOOL";
  const manualApplies = Boolean(manual && manualWins);
  const state = manualApplies && manual
    ? manual.manual_state
    : automatic.manual_external_state ?? automaticState;
  const source = manualApplies ? "MANUAL"
    : automatic.automatic_link ? "AUTOMATIC"
    : state === "MISSING_DATA" || state === "OPEN_EXTERNAL_TOOL"
    ? manual ? "MANUAL" : "UNAVAILABLE"
    : "AUTOMATIC";
  return {
    ...automatic,
    state,
    source,
    value_text: manualApplies && manual ? manual.value_text : automatic.value_text,
    value_number: manualApplies && manual ? manual.value_number : automatic.value_number,
    manual_allowed: !MANUAL_DISABLED.has(automatic.key),
    manual_evidence: manual,
  };
}

const STEP_TWO_CANONICAL_SOURCES: Partial<Record<ResearchChecklistItemKey, { step: 3 | 4 | 5; key: ResearchChecklistItemKey }>> = {
  honeypot: { step: 3, key: "honeypot" },
  contract_verified: { step: 3, key: "contract_verified" },
  buy_tax: { step: 3, key: "buy_tax" },
  sell_tax: { step: 3, key: "sell_tax" },
  tokensniffer: { step: 3, key: "tokensniffer" },
  top1_wallet: { step: 4, key: "top1_wallet" },
  liquidity_unlocked: { step: 4, key: "liquidity_lock" },
  suspicious_whitepaper: { step: 5, key: "whitepaper" },
};

/**
 * Reconciles Step 2 as a calculated playbook view. The function deliberately
 * creates no evidence and never replaces an actual Step 2 result. It is
 * exported so the contract can be exercised with token-age fixtures that the
 * frozen scanner candidate does not currently provide.
 */
export function reconcileResearchChecklistStep2(steps: readonly ResearchChecklistStep[]): ResearchChecklistStep[] {
  const stepOne = steps.find((step) => step.number === 1);
  const stepTwo = steps.find((step) => step.number === 2);
  const stepFive = steps.find((step) => step.number === 5);
  if (!stepTwo) return [...steps];

  const tokenAge = stepOne?.items.find((item) => item.key === "token_age") ?? null;
  const team = stepFive?.items.find((item) => item.key === "team") ?? null;
  const items = stepTwo.items.map((item) => {
    if (hasDirectStepTwoEvidence(item)) return item;
    if (item.key === "anonymous_team_young_project") return deriveAnonymousTeamYoungProject(item, tokenAge, team);
    const source = STEP_TWO_CANONICAL_SOURCES[item.key];
    const canonicalItem = source
      ? steps.find((step) => step.number === source.step)?.items.find((entry) => entry.key === source.key) ?? null
      : null;
    return canonicalItem ? mirrorCanonicalResearchItem(item, canonicalItem) : item;
  });
  const reconciled = buildStep(2, items);
  return steps.map((step) => step.number === 2 ? reconciled : step);
}

function hasDirectStepTwoEvidence(item: ResearchChecklistItem): boolean {
  return item.manual_evidence !== null || !["MISSING_DATA", "OPEN_EXTERNAL_TOOL"].includes(item.state);
}

function mirrorCanonicalResearchItem(stepTwoItem: ResearchChecklistItem, canonicalItem: ResearchChecklistItem): ResearchChecklistItem {
  return {
    ...stepTwoItem,
    state: canonicalItem.state,
    automatic_state: canonicalItem.automatic_state,
    value_text: canonicalItem.value_text,
    value_number: canonicalItem.value_number,
    source: canonicalItem.source,
    automatic_provenance: canonicalItem.automatic_provenance,
    automatic_link: canonicalItem.automatic_link,
    // The canonical row remains the sole owner of a private research record.
    // Step 2 exposes only its effective result.
    manual_evidence: null,
  };
}

function deriveAnonymousTeamYoungProject(
  stepTwoItem: ResearchChecklistItem,
  tokenAge: ResearchChecklistItem | null,
  team: ResearchChecklistItem | null,
): ResearchChecklistItem {
  const teamValue = normalizedResearchValue(team);
  const source = team?.source === "MANUAL" ? "MANUAL" : "AUTOMATIC";
  const resolvedBase = (state: ResearchChecklistState, valueText: string, valueNumber: number | null): ResearchChecklistItem => ({
    ...stepTwoItem,
    state,
    automatic_state: state,
    value_text: valueText,
    value_number: valueNumber,
    threshold: "anonymous team + token age <30 days",
    source: state === "MISSING_DATA" ? "UNAVAILABLE" : source,
    automatic_provenance: null,
    automatic_link: null,
    manual_evidence: null,
  });

  // A transparent team clears the composite even if token age is still
  // unavailable. This is intentionally token age only—never pair age.
  if (teamValue === "transparent") return resolvedBase("AUTO_VERIFIED", "transparent_team", null);
  if (teamValue !== "anonymous") return resolvedBase("MISSING_DATA", "team_missing", null);

  const tokenAgeValue = tokenAge?.value_number ?? null;
  const ageKnown = tokenAge !== null
    && tokenAgeValue !== null
    && Number.isFinite(tokenAgeValue)
    && isResolved(tokenAge.state)
    && tokenAge.state !== "RED_FLAG";
  if (!ageKnown || tokenAgeValue === null) return resolvedBase("MISSING_DATA", "anonymous_team_token_age_missing", null);
  return tokenAgeValue < 30
    ? resolvedBase("RED_FLAG", "anonymous_team_token_age_under_30", tokenAgeValue)
    : resolvedBase("AUTO_VERIFIED", "anonymous_team_token_age_30_or_more", tokenAgeValue);
}

function normalizedResearchValue(item: ResearchChecklistItem | null): string {
  return (item?.value_text ?? "").trim().toLowerCase().replaceAll(" ", "_");
}

function manualExternalState(candidate: UiTokenCandidate, tool: ManualResearchTool): ResearchChecklistState {
  const target = resolveManualResearchTarget(tool, { chain: candidate.chain, contractAddress: candidate.contractAddress });
  return target.availability === "AVAILABLE" || target.availability === "MANUAL_SEARCH"
    ? "OPEN_EXTERNAL_TOOL"
    : "MISSING_DATA";
}

function buildStep(number: ResearchStepNumber, items: ResearchChecklistItem[]): ResearchChecklistStep {
  const resolvedChecks = items.filter((item) => isResolved(item.state)).length;
  const state = items.some((item) => item.state === "RED_FLAG")
    ? "RED_FLAG"
    : items.some((item) => item.state === "OPEN_EXTERNAL_TOOL")
      ? "OPEN_EXTERNAL_TOOL"
      : items.some((item) => item.state === "MISSING_DATA")
        ? "MISSING_DATA"
        : items.length > 0 && items.every((item) => item.state === "NOT_APPLICABLE")
          ? "NOT_APPLICABLE"
          : items.some((item) => item.state === "MANUAL_VERIFIED")
            ? "MANUAL_VERIFIED"
            : "AUTO_VERIFIED";
  return { number, state, resolved_checks: resolvedChecks, total_checks: items.length, items };
}

function deriveCurrentStep(steps: readonly ResearchChecklistStep[]): ResearchStepNumber {
  const stepOne = steps.find((step) => step.number === 1);
  const mandatoryStepOne = stepOne?.items.filter((item) => item.key !== "token_age") ?? [];
  if (mandatoryStepOne.some((item) => !isResolved(item.state) || item.state === "RED_FLAG")) return 1;
  for (const step of steps.filter((entry) => entry.number >= 2 && entry.number <= 6)) {
    if (step.items.some((item) => !isResolved(item.state) || item.state === "RED_FLAG")) return step.number;
  }
  return 7;
}

function isResolved(state: ResearchChecklistState): boolean {
  return state === "AUTO_VERIFIED" || state === "MANUAL_VERIFIED" || state === "NOT_APPLICABLE" || state === "RED_FLAG";
}

function stateForMaximum(value: number | null, maximum: number): ResearchChecklistState {
  if (value == null) return "MISSING_DATA";
  return value > maximum ? "RED_FLAG" : "AUTO_VERIFIED";
}

function stateForMinimum(value: number | null, minimum: number): ResearchChecklistState {
  if (value == null) return "MISSING_DATA";
  return value < minimum ? "RED_FLAG" : "AUTO_VERIFIED";
}

function stateForRequiredBoolean(value: boolean | null): ResearchChecklistState {
  if (value == null) return "MISSING_DATA";
  return value ? "AUTO_VERIFIED" : "RED_FLAG";
}

function stateForRiskBoolean(value: boolean | null): ResearchChecklistState {
  if (value == null) return "MISSING_DATA";
  return value ? "RED_FLAG" : "AUTO_VERIFIED";
}

function stateForHoneypot(value: string): ResearchChecklistState {
  const normalized = value.trim().toLowerCase().replaceAll(" ", "_");
  if (!normalized || normalized === "not_checked" || normalized === "unknown" || normalized === "unavailable") return "MISSING_DATA";
  if (["passed", "pass", "false", "no", "safe", "not_honeypot"].includes(normalized)) return "AUTO_VERIFIED";
  if (["true", "yes", "honeypot", "failed", "fail", "is_honeypot"].includes(normalized)) return "RED_FLAG";
  return "MISSING_DATA";
}

function stateForKnownOwnership(value: string | null | undefined): ResearchChecklistState {
  const normalized = value?.trim().toLowerCase();
  return normalized === "renounced" || normalized === "active" ? "AUTO_VERIFIED" : "MISSING_DATA";
}

function ownershipText(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized === "renounced" || normalized === "active" || normalized === "unknown" ? normalized : null;
}

function boolText(value: boolean | null | undefined): string | null {
  return value == null ? null : value ? "yes" : "no";
}

function lockText(value: boolean | null | undefined): string | null {
  return value == null ? null : value ? "locked" : "unlocked";
}

function liquidityMarketCapRatio(liquidity: number, marketCap: number): number | null {
  return marketCap > 0 ? liquidity / marketCap : null;
}

function normalizeAddress(value: string): string {
  return value.startsWith("0x") ? value.toLowerCase() : value;
}
