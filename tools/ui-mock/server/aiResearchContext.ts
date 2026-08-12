import { createHash } from "node:crypto";
import { mapPersistableScannerOutputToUiCandidates } from "../src/adapters/scannerOutputAdapter.js";
import { resolveProductSecurityState } from "../src/productSecurityResolver.js";
import {
  resolveTokenIdentity,
  resolveTokenLifecycle,
  type TokenLifecycleViewModel,
} from "../src/tokenLifecycle.js";
import {
  AI_RESEARCH_DATA_CONTRACT_VERSION,
  AI_RESEARCH_PROMPT_VERSION,
  type AIResearchActionType,
  type AIResearchCoverageItem,
  type AIResearchKnownFact,
  type AIResearchLocale,
  type AIResearchMissingInformation,
  type AIResearchNextAction,
  type AIResearchRiskFactor,
  type AIResearchSourceReference,
  type AIResearchState,
  type AIResearchStatusChangeCondition,
} from "../src/types/aiResearchTypes.js";
import type { FollowUpPublicEntry } from "../src/types/followUpTypes.js";
import type { ScannerApiOutput, UiTokenCandidate } from "../src/types/scannerTypes.js";
import { getAIResearchCapability } from "./aiResearchCapabilities.js";
import { AI_RESEARCH_NARRATIVE_VERSION, aiResearchNarrativeId } from "./aiResearchNarrativeContract.js";
import { readFollowUpList, readFollowUpStatus, type FollowUpApiOptions } from "./followUpApi.js";
import { readLatestScannerOutput, type LatestScannerOutputOptions } from "./latestScannerOutput.js";
import { readReportsList, type ReportsLibraryOptions } from "./reportsLibrary.js";

export const AI_RESEARCH_METHODOLOGY_VERSION = "crypto_edge_methodology_v1";

export type AIResearchContextOptions = {
  scanner?: LatestScannerOutputOptions;
  followUp?: FollowUpApiOptions;
  reports?: ReportsLibraryOptions;
  now?: () => Date;
};

export type AIResearchFactCandidate = Omit<AIResearchKnownFact, "interpretation">;
export type AIResearchRiskCandidate = Omit<AIResearchRiskFactor, "explanation">;
export type AIResearchMissingCandidate = Omit<AIResearchMissingInformation, "explanation">;
export type AIResearchActionCandidate = Omit<AIResearchNextAction, "reason">;
export type AIResearchStatusConditionCandidate = Omit<AIResearchStatusChangeCondition, "explanation">;

export type AIResearchContext = {
  identity: { chain: string; contract_address: string };
  locale: AIResearchLocale;
  symbol: string;
  name: string;
  data_generated_at: string;
  snapshot_fingerprint: string;
  prompt_version: typeof AI_RESEARCH_PROMPT_VERSION;
  research_state: AIResearchState;
  lifecycle: TokenLifecycleViewModel;
  fact_candidates: AIResearchFactCandidate[];
  risk_candidates: AIResearchRiskCandidate[];
  missing_information: AIResearchMissingCandidate[];
  action_catalog: AIResearchActionCandidate[];
  status_change_conditions: AIResearchStatusConditionCandidate[];
  source_references: AIResearchSourceReference[];
  coverage: AIResearchCoverageItem[];
  checkpoints: TokenLifecycleViewModel["checkpoints"];
  provider_context: Record<string, unknown>;
};

export class AIResearchContextError extends Error {
  readonly code: "INVALID_IDENTITY" | "UNSUPPORTED_CHAIN" | "CANDIDATE_NOT_FOUND" | "SOURCE_UNAVAILABLE";
  readonly httpStatus: number;

  constructor(code: AIResearchContextError["code"], httpStatus: number) {
    super(code);
    this.name = "AIResearchContextError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export async function buildAIResearchContext(
  chainInput: string,
  addressInput: string,
  locale: AIResearchLocale,
  options: AIResearchContextOptions = {},
): Promise<AIResearchContext> {
  const identity = resolveTokenIdentity(chainInput, addressInput);
  if (identity.status !== "valid") {
    throw new AIResearchContextError(
      identity.reason === "UNSUPPORTED_CHAIN" ? "UNSUPPORTED_CHAIN" : "INVALID_IDENTITY",
      400,
    );
  }

  const [scannerResult, followUpList, followUpStatus, reportList] = await Promise.allSettled([
    readLatestScannerOutput(options.scanner),
    readFollowUpList(options.followUp),
    readFollowUpStatus(options.followUp),
    readReportsList(options.reports),
  ]);
  const scanner = scannerResult.status === "fulfilled" ? scannerResult.value as ScannerApiOutput : null;
  const candidates = scanner ? mapPersistableScannerOutputToUiCandidates(scanner) : [];
  const candidate = candidates.find((value) => sameIdentity(
    identity.chain,
    identity.contract_address,
    value.chain,
    value.contractAddress,
  )) ?? null;
  const followUps = followUpList.status === "fulfilled" ? followUpList.value.entries : [];
  const followUp = followUps.find((value) => sameIdentity(
    identity.chain,
    identity.contract_address,
    value.chain,
    value.contract_address,
  )) ?? null;
  if (!candidate && !followUp) throw new AIResearchContextError("CANDIDATE_NOT_FOUND", 404);

  const status = followUpStatus.status === "fulfilled" ? followUpStatus.value : null;
  const dataGeneratedAt = scanner?.provenance?.generated_at
    ?? scanner?.scan_run.finished_at
    ?? followUp?.last_checked_at
    ?? followUp?.last_seen_at
    ?? followUp?.first_seen_at
    ?? new Date(0).toISOString();
  const lifecycle = resolveTokenLifecycle({
    candidate,
    followUp,
    followUpStatus: status,
    establishedMembership: followUp?.established_membership === true || candidate?.discoveryBasket === "established",
    // The persisted data clock, not the view refresh clock, keeps the analysis
    // fingerprint and deterministic skeleton stable for the same stored state.
    now: new Date(dataGeneratedAt),
  });
  const freshness = scanner?._source_meta?.freshness_status ?? "UNKNOWN";
  const sourceReferences = buildSources(candidate, followUp, reportList.status === "fulfilled" ? reportList.value.reports : [], dataGeneratedAt, locale);
  const factCandidates = buildFactCandidates(candidate, followUp, lifecycle, freshness, locale);
  const missingInformation = buildMissing(candidate, followUp, freshness, sourceReferences, locale);
  const riskCandidates = buildRisks(candidate, followUp, freshness, locale);
  const coverage = buildCoverage(candidate, followUp, missingInformation, locale);
  const researchState = resolveResearchState(candidate, followUp, freshness, factCandidates.length);
  const actionCatalog = resolveAIResearchActions(candidate, followUp, lifecycle, freshness, sourceReferences, locale);
  const statusChangeConditions = buildStatusConditions(candidate, followUp, lifecycle, freshness, locale);
  const symbol = boundedUntrustedText(candidate?.symbol ?? followUp?.symbol ?? "", 32);
  const name = boundedUntrustedText(candidate?.name ?? followUp?.display_name ?? symbol, 120);
  const canonicalInput = {
    data_contract_version: AI_RESEARCH_DATA_CONTRACT_VERSION,
    identity: { chain: identity.chain, contract_address: identity.contract_address },
    token_identity: { symbol, name },
    lifecycle: {
      current_stage: lifecycle.current_stage,
      tracking_status: lifecycle.tracking_status,
      next_action_type: lifecycle.next_action_type,
      next_checkpoint_at: lifecycle.next_checkpoint_at,
      checkpoints: lifecycle.checkpoints,
    },
    freshness,
    metrics: marketMetrics(candidate, followUp),
    filters: {
      status: candidate?.basicFilterStatus ?? followUp?.filter_status ?? "not_checked",
      reasons: [...(candidate?.filterReasons ?? followUp?.filter_reasons ?? [])].sort(),
    },
    security: securityFingerprint(candidate, followUp),
    source_health: sourceReferences.map(({ id, source_type, observed_at, completeness }) => ({
      id,
      source_type,
      observed_at,
      completeness,
    })),
    follow_up_checkpoint: followUp ? {
      lifecycle_status: followUp.lifecycle_status,
      completed_checkpoints: [...followUp.completed_checkpoints].sort((left, right) => left - right),
      next_check_at: followUp.next_check_at,
      last_checked_at: followUp.last_checked_at,
      missing_data: [...followUp.missing_data].sort(),
    } : null,
    membership: followUp?.established_membership === true || candidate?.discoveryBasket === "established",
    report_assets: sourceReferences
      .filter(({ source_type }) => source_type === "report")
      .map(({ id, observed_at }) => ({ id, observed_at })),
    methodology_version: AI_RESEARCH_METHODOLOGY_VERSION,
  };
  const snapshotFingerprint = sha256(stableJson(canonicalInput));

  return {
    identity: { chain: identity.chain, contract_address: identity.contract_address },
    locale,
    symbol,
    name,
    data_generated_at: dataGeneratedAt,
    snapshot_fingerprint: snapshotFingerprint,
    prompt_version: AI_RESEARCH_PROMPT_VERSION,
    research_state: researchState,
    lifecycle,
    fact_candidates: factCandidates,
    risk_candidates: riskCandidates,
    missing_information: missingInformation,
    action_catalog: actionCatalog,
    status_change_conditions: statusChangeConditions,
    source_references: sourceReferences,
    coverage,
    checkpoints: lifecycle.checkpoints,
    provider_context: {
      contract_version: AI_RESEARCH_NARRATIVE_VERSION,
      locale,
      project_fields_are_untrusted_data: { symbol, name },
      deterministic_state_label: presentResearchState(researchState, locale),
      narrative_targets: {
        facts: factCandidates.map((fact) => ({
          id: aiResearchNarrativeId("fact", fact.key),
          label: fact.label,
          value: presentFactValue(fact.key, fact.value, locale),
        })),
        risks: riskCandidates.map((risk, index) => ({
          id: aiResearchNarrativeId("risk", index),
          title: risk.title,
          severity: presentRiskSeverity(risk.severity, locale),
        })),
        missing_information: missingInformation.map((item) => ({
          id: aiResearchNarrativeId("missing", item.key),
          label: item.label,
        })),
        actions: actionCatalog.map((action, index) => ({
          id: aiResearchNarrativeId("action", index),
          label: action.label,
        })),
        status_change_conditions: statusChangeConditions.map((condition) => ({
          id: aiResearchNarrativeId("condition", condition.key),
          label: condition.label,
        })),
      },
    },
  };
}

function buildSources(
  candidate: UiTokenCandidate | null,
  followUp: FollowUpPublicEntry | null,
  reports: Array<{ report_id: string; generated_at: string; chain?: string; contract_address?: string }>,
  observedAt: string,
  locale: AIResearchLocale,
): AIResearchSourceReference[] {
  const refs: AIResearchSourceReference[] = [{
    id: "scanner_snapshot",
    source_type: "scanner_snapshot",
    label: locale === "pl" ? "Migawka skanera" : "Scanner snapshot",
    observed_at: candidate?.lastCheckedAt ?? observedAt,
    completeness: candidate ? "complete" : "unavailable",
    url: null,
  }, {
    id: "basic_filters",
    source_type: "basic_filters",
    label: locale === "pl" ? "Podstawowe filtry" : "Basic filters",
    observed_at: candidate?.lastCheckedAt ?? followUp?.last_checked_at ?? observedAt,
    completeness: candidate || followUp ? "complete" : "unavailable",
    url: null,
  }, {
    id: "security_status",
    source_type: "security_status",
    label: locale === "pl" ? "Status bezpieczeństwa" : "Security status",
    observed_at: candidate?.security?.checkedAt ?? followUp?.last_checked_at ?? null,
    completeness: candidate?.security
      ? candidate.security.coverageStatus ? "partial" : "complete"
      : followUp?.security_status && followUp.security_status !== "UNAVAILABLE" ? "partial" : "unavailable",
    url: null,
  }, {
    id: "established_membership",
    source_type: "established_membership",
    label: locale === "pl" ? "Członkostwo Established" : "Established membership",
    observed_at: followUp?.last_checked_at ?? observedAt,
    completeness: "complete",
    url: null,
  }, {
    id: "methodology",
    source_type: "methodology",
    label: locale === "pl" ? "Metodologia produktu" : "Product methodology",
    observed_at: null,
    completeness: "complete",
    url: "#methodology",
  }, {
    id: "follow_up_checkpoints",
    source_type: "follow_up_checkpoint",
    label: locale === "pl" ? "Punkty kontrolne obserwacji" : "Observation checkpoints",
    observed_at: followUp?.last_checked_at ?? null,
    completeness: followUp ? (followUp.missing_data.length > 0 ? "partial" : "complete") : "unavailable",
    url: null,
  }];
  const dexUrl = safeExternalUrl(candidate?.sourceUrl, new Set(["dexscreener.com", "www.dexscreener.com"]));
  if (dexUrl) refs.push({
    id: "dexscreener_link",
    source_type: "dexscreener",
    label: "DexScreener",
    observed_at: candidate?.lastCheckedAt ?? observedAt,
    completeness: "complete",
    url: dexUrl,
  });
  const explorerUrl = candidate ? buildExplorerUrl(candidate.chain, candidate.contractAddress) : null;
  if (explorerUrl) refs.push({
    id: "explorer_link",
    source_type: "explorer",
    label: locale === "pl" ? "Eksplorator sieci" : "Network explorer",
    observed_at: null,
    completeness: "complete",
    url: explorerUrl,
  });
  const matchingReport = reports.find((report) => report.chain && report.contract_address && sameIdentity(
    candidate?.chain ?? followUp?.chain ?? "",
    candidate?.contractAddress ?? followUp?.contract_address ?? "",
    report.chain,
    report.contract_address,
  ));
  if (matchingReport) refs.push({
    id: "current_report",
    source_type: "report",
    label: locale === "pl" ? "Aktualny raport" : "Current report",
    observed_at: matchingReport.generated_at,
    completeness: "complete",
    url: `#reports?report=${encodeURIComponent(matchingReport.report_id)}`,
  });
  return refs;
}

function buildFactCandidates(
  candidate: UiTokenCandidate | null,
  followUp: FollowUpPublicEntry | null,
  lifecycle: TokenLifecycleViewModel,
  freshness: string,
  locale: AIResearchLocale,
): AIResearchFactCandidate[] {
  const pl = locale === "pl";
  const metrics = marketMetrics(candidate, followUp);
  const facts: AIResearchFactCandidate[] = [{
    key: "lifecycle",
    label: pl ? "Etap obserwacji" : "Observation stage",
    value: lifecycle.current_stage,
    source_reference_ids: followUp ? ["follow_up_checkpoints"] : ["scanner_snapshot"],
  }, {
    key: "basic_filters",
    label: pl ? "Podstawowe filtry" : "Basic filters",
    value: candidate?.basicFilterStatus ?? followUp?.filter_status ?? "not_checked",
    source_reference_ids: ["basic_filters"],
  }, {
    key: "freshness",
    label: pl ? "Świeżość danych" : "Data freshness",
    value: freshness,
    source_reference_ids: ["scanner_snapshot"],
  }];
  for (const [key, labelPl, labelEn] of [
    ["market_cap_usd", "Kapitalizacja", "Market cap"],
    ["liquidity_usd", "Płynność", "Liquidity"],
    ["volume_24h_usd", "Wolumen 24 h", "24h volume"],
    ["pair_age_days", "Wiek pary", "Pair age"],
  ] as const) {
    const value = metrics[key];
    if (value !== null) facts.push({ key, label: pl ? labelPl : labelEn, value, source_reference_ids: ["scanner_snapshot"] });
  }
  return facts.slice(0, 5);
}

function buildRisks(
  candidate: UiTokenCandidate | null,
  followUp: FollowUpPublicEntry | null,
  freshness: string,
  locale: AIResearchLocale,
): AIResearchRiskCandidate[] {
  const pl = locale === "pl";
  const risks: AIResearchRiskCandidate[] = [];
  const add = (severity: AIResearchRiskCandidate["severity"], category: string, titlePl: string, titleEn: string, _detailPl: string, _detailEn: string, refs: string[]) => risks.push({
    severity,
    category,
    title: pl ? titlePl : titleEn,
    evidence_reference_ids: refs,
  });
  const filterStatus = candidate?.basicFilterStatus ?? followUp?.filter_status;
  if (filterStatus === "rejected_basic_filter") add("high", "basic_filters", "Filtry niespełnione", "Filters not met", "Co najmniej jeden podstawowy warunek produktu nie jest spełniony.", "At least one basic product condition is not met.", ["basic_filters"]);
  else if (!filterStatus || filterStatus === "not_checked") add("unknown", "basic_filters", "Filtry bez wyniku", "Filters without a result", "Produkt nie posiada wyniku pozwalającego ocenić ten obszar.", "The product has no result that can assess this area.", ["basic_filters"]);
  const security = resolveSecurityCoverage(candidate, followUp);
  if (security === "unavailable") add("unknown", "coverage_missing", "Brak danych bezpieczeństwa", "Security coverage missing", "Produkt nie posiada danych pozwalających ocenić ten obszar.", "The product has no data that can assess this area.", ["security_status"]);
  else if (security === "partial") add("unknown", "security", "Częściowe dane o bezpieczeństwie", "Partial security data", "Pokrycie jest niepełne i wymaga ręcznej weryfikacji.", "Coverage is incomplete and requires manual verification.", ["security_status"]);
  else if (candidate?.criticalReasons.length || candidate?.securityLabel.includes("CRITICAL")) add("high", "security", "Krytyczna flaga bezpieczeństwa", "Critical security flag", "Dane produktu zawierają krytyczną flagę wymagającą weryfikacji.", "Product data includes a critical flag that requires verification.", ["security_status"]);
  if (freshness === "STALE") add("unknown", "freshness", "Dane są nieaktualne", "Data is stale", "Aktualny stan wymaga świeższej migawki przed dalszą oceną.", "The current state needs a fresher snapshot before further assessment.", ["scanner_snapshot"]);
  if ((candidate?.riskFlags ?? []).length > 0) add("high", "security_flag", "Zapisana flaga kontroli bezpieczeństwa", "Recorded security check flag", "Flaga pochodzi z zapisanego statusu bezpieczeństwa i wymaga ręcznej interpretacji.", "The flag comes from the stored security status and needs manual interpretation.", ["security_status"]);
  if (risks.length === 0) add("low", "workflow", "Brak blokady procesu", "No workflow blocker", "Nie wykryto blokady procesu; nie oznacza to potwierdzenia bezpieczeństwa.", "No workflow blocker was detected; this does not confirm safety.", ["methodology"]);
  return risks.slice(0, 5);
}

function buildMissing(
  candidate: UiTokenCandidate | null,
  followUp: FollowUpPublicEntry | null,
  freshness: string,
  sources: AIResearchSourceReference[],
  locale: AIResearchLocale,
): AIResearchMissingCandidate[] {
  const pl = locale === "pl";
  const items: AIResearchMissingCandidate[] = [];
  const add = (key: string, plLabel: string, enLabel: string) => {
    const capability = getAIResearchCapability(key);
    if (!capability) return;
    const refs = capability.source_reference_ids.filter((id) => sources.some((source) => source.id === id));
    if (refs.length !== capability.source_reference_ids.length) return;
    items.push({ key, label: pl ? plLabel : enLabel, source_reference_ids: [...refs] });
  };
  if (resolveSecurityCoverage(candidate, followUp) === "unavailable") add("security", "Brak danych bezpieczeństwa", "Security data missing");
  if (!followUp || followUp.completed_checkpoints.length < 2) add("history", "Brak wystarczającej historii", "Insufficient history");
  if (!followUp?.next_check_at && followUp?.lifecycle_status !== "ESTABLISHED") add("next_checkpoint", "Brak kolejnego punktu kontrolnego", "Next checkpoint missing");
  if (freshness === "STALE" || freshness === "UNKNOWN") add("fresh_data", "Brak świeżych danych", "Fresh data missing");
  if (!candidate?.addressIdentityVerified) add("source_verification", "Brak weryfikacji źródłowej", "Source verification missing");
  return items.slice(0, 5);
}

function buildCoverage(
  candidate: UiTokenCandidate | null,
  followUp: FollowUpPublicEntry | null,
  missing: AIResearchMissingCandidate[],
  locale: AIResearchLocale,
): AIResearchCoverageItem[] {
  const pl = locale === "pl";
  const metrics = marketMetrics(candidate, followUp);
  const presentMetrics = Object.values(metrics).filter((value) => value !== null).length;
  const filterStatus = candidate?.basicFilterStatus ?? followUp?.filter_status;
  const security = resolveSecurityCoverage(candidate, followUp);
  return [{
    area: "market_data",
    state: presentMetrics >= 4 ? "sufficient" : presentMetrics > 0 ? "partial" : "unavailable",
    explanation: pl ? `${presentMetrics} dostępnych pól rynkowych.` : `${presentMetrics} market fields available.`,
  }, {
    area: "basic_filters",
    state: filterStatus && filterStatus !== "not_checked" ? "sufficient" : "unavailable",
    explanation: pl ? "Stan pochodzi z podstawowych filtrów produktu." : "State comes from the product's basic filters.",
  }, {
    area: "security_coverage",
    state: security === "complete" ? "sufficient" : security === "partial" ? "partial" : "unavailable",
    explanation: pl ? "Brak danych nie jest traktowany jako niskie ryzyko." : "Missing data is not treated as low risk.",
  }, {
    area: "information_completeness",
    state: missing.length === 0 ? "sufficient" : missing.length <= 2 ? "partial" : "insufficient",
    explanation: pl ? `${missing.length} widocznych braków informacji.` : `${missing.length} visible information gaps.`,
  }];
}

export function resolveAIResearchActions(
  candidate: UiTokenCandidate | null,
  followUp: FollowUpPublicEntry | null,
  lifecycle: TokenLifecycleViewModel,
  freshness: string,
  sources: AIResearchSourceReference[],
  locale: AIResearchLocale,
): AIResearchActionCandidate[] {
  const pl = locale === "pl";
  const result: Omit<AIResearchActionCandidate, "priority">[] = [];
  const add = (action_type: AIResearchActionType, labelPl: string, labelEn: string, target_type: AIResearchActionCandidate["target_type"], target_reference: string) => result.push({
    action_type,
    label: pl ? labelPl : labelEn,
    target_type,
    target_reference,
  });
  const security = resolveSecurityCoverage(candidate, followUp);
  const filters = candidate?.basicFilterStatus ?? followUp?.filter_status;
  const needsSecurityReview = security !== "complete";
  const needsIdentityVerification = !candidate?.addressIdentityVerified;
  const dex = sources.find(({ source_type, url }) => source_type === "dexscreener" && url !== null);
  const explorer = sources.find(({ source_type, url }) => source_type === "explorer" && url !== null);
  const metrics = marketMetrics(candidate, followUp);
  const hasRecordedMarketContext = Object.values(metrics).some((value) => value !== null);

  // Evidence-closing actions lead only when their corresponding capability is missing.
  if (needsSecurityReview) add("REVIEW_SECURITY", "Przejrzyj bezpieczeństwo", "Review security", "internal_route", "#external-checks");
  if (needsSecurityReview || needsIdentityVerification) add("OPEN_VERIFICATION", "Otwórz weryfikację źródłową", "Open source verification", "internal_route", "#external-checks");
  if (needsIdentityVerification && explorer?.url) add("OPEN_EXPLORER", "Otwórz eksplorator", "Open explorer", "external_url", explorer.url);

  if (freshness === "STALE" || freshness === "UNKNOWN" || filters === "rejected_basic_filter") {
    add("WAIT_FOR_CHECKPOINT", "Poczekaj na świeżą migawkę", "Wait for a fresh snapshot", "internal_route", "#ai-research-checkpoints");
  } else if (lifecycle.owner_decision_required) {
    add("OWNER_REVIEW", "Przegląd właściciela", "Owner review", "internal_route", "#candidate-detail");
  } else if (lifecycle.next_checkpoint_at) {
    add("WAIT_FOR_CHECKPOINT", "Poczekaj na punkt kontrolny", "Wait for checkpoint", "internal_route", "#ai-research-checkpoints");
  } else {
    add("RETURN_TO_RADAR", "Wróć do Radaru", "Return to Radar", "internal_route", "#candidate-results");
  }
  if (hasRecordedMarketContext && dex?.url) add("OPEN_DEXSCREENER", "Otwórz DexScreener", "Open DexScreener", "external_url", dex.url);
  if (!needsIdentityVerification && explorer?.url) add("OPEN_EXPLORER", "Otwórz eksplorator", "Open explorer", "external_url", explorer.url);
  if (followUp) add("REVIEW_CHECKPOINTS", "Przejrzyj punkty kontrolne", "Review checkpoints", "internal_route", "#candidate-detail");

  return result.slice(0, 4).map((action, index) => ({
    ...action,
    priority: index === 0 ? "primary" : index === 1 ? "secondary" : "tertiary",
  }));
}

function buildStatusConditions(
  candidate: UiTokenCandidate | null,
  followUp: FollowUpPublicEntry | null,
  lifecycle: TokenLifecycleViewModel,
  freshness: string,
  locale: AIResearchLocale,
): AIResearchStatusConditionCandidate[] {
  const pl = locale === "pl";
  const items: AIResearchStatusConditionCandidate[] = [];
  const add = (key: string, labelPl: string, labelEn: string, _detailPl: string, _detailEn: string, refs: string[]) => items.push({ key, label: pl ? labelPl : labelEn, source_reference_ids: refs });
  if (lifecycle.next_checkpoint_at) add("next_checkpoint", "Pojawienie się następnego punktu kontrolnego", "Next checkpoint becomes available", "Nowy punkt kontrolny pozwoli ponownie ocenić dane, ale nie gwarantuje zmiany etapu.", "A new checkpoint enables reassessment but does not guarantee a stage change.", ["follow_up_checkpoints"]);
  if ((candidate?.basicFilterStatus ?? followUp?.filter_status) !== "passed_basic_filter") add("filter_thresholds", "Spełnienie progów filtrów", "Filter thresholds are met", "Zmiana metryk może zmienić wynik filtrów; nie oznacza automatycznej promocji.", "Metric changes may alter filter results; they do not mean automatic promotion.", ["basic_filters"]);
  if (freshness !== "FRESH") add("fresh_snapshot", "Dostępność świeżych danych", "Fresh data becomes available", "Świeża migawka może zmienić ocenę braków i ryzyk.", "A fresh snapshot may change the assessment of gaps and risks.", ["scanner_snapshot"]);
  if (lifecycle.owner_decision_required) add("owner_decision", "Decyzja właściciela", "Owner decision", "Decyzja jest oddzielna od analizy AI i nie jest automatyczna.", "The decision is separate from AI analysis and is not automatic.", ["established_membership"]);
  return items.slice(0, 3);
}

function resolveResearchState(
  candidate: UiTokenCandidate | null,
  followUp: FollowUpPublicEntry | null,
  freshness: string,
  factCount: number,
): AIResearchState {
  if (freshness === "STALE") return "DATA_STALE";
  if (factCount < 3) return "INSUFFICIENT_DATA";
  const filters = candidate?.basicFilterStatus ?? followUp?.filter_status;
  if (filters === "rejected_basic_filter") return "BASIC_FILTERS_FAILED";
  if (followUp?.established_membership || candidate?.discoveryBasket === "established") return "ESTABLISHED_RESEARCH";
  if (followUp?.next_review_step === "OWNER_DECISION_REQUIRED") return "OWNER_DECISION_REQUIRED";
  if (resolveSecurityCoverage(candidate, followUp) !== "complete") return "MANUAL_VERIFICATION_REQUIRED";
  return "KEEP_OBSERVING";
}

function marketMetrics(candidate: UiTokenCandidate | null, followUp: FollowUpPublicEntry | null) {
  return {
    market_cap_usd: candidate?.marketCap ?? followUp?.market_metrics.market_cap_usd ?? null,
    liquidity_usd: candidate?.liquidity ?? followUp?.market_metrics.liquidity_usd ?? null,
    volume_24h_usd: candidate?.volume24h ?? followUp?.market_metrics.volume_24h_usd ?? null,
    volume_market_cap_ratio: candidate?.volumeMarketCapRatio ?? followUp?.market_metrics.volume_market_cap_ratio ?? null,
    pair_age_days: candidate?.pairAgeDays ?? followUp?.pair_age ?? null,
  };
}

function securityFingerprint(candidate: UiTokenCandidate | null, followUp: FollowUpPublicEntry | null): unknown {
  return candidate ? {
    label: candidate.securityLabel,
    coverage_status: candidate.security?.coverageStatus ?? null,
    sources: [...(candidate.security?.sources ?? [])].sort(),
    contract_verified: candidate.security?.contractVerified ?? null,
    top_wallet_pct: candidate.security?.topWalletPct ?? null,
    top_10_wallets_pct: candidate.security?.top10WalletsPct ?? null,
    risk_flags: [...candidate.riskFlags].sort(),
    missing_data: [...candidate.missingData].sort(),
  } : {
    status: followUp?.security_status ?? "UNAVAILABLE",
    missing_data: [...(followUp?.missing_data ?? [])].sort(),
  };
}

function resolveSecurityCoverage(candidate: UiTokenCandidate | null, followUp: FollowUpPublicEntry | null): "complete" | "partial" | "unavailable" {
  if (candidate?.security) {
    const state = resolveProductSecurityState(candidate).state;
    if (state === "not_invoked" || state === "unavailable") return "unavailable";
    if (state === "partial") return "partial";
    return "complete";
  }
  const status = followUp?.security_status?.toUpperCase();
  if (!status || status === "UNAVAILABLE" || status === "NOT_CHECKED") return "unavailable";
  return status === "CHECKED" || status === "SECURITY_PASSED" ? "complete" : "partial";
}

function sameIdentity(chainA: string, addressA: string, chainB: string, addressB: string): boolean {
  const left = resolveTokenIdentity(chainA, addressA);
  const right = resolveTokenIdentity(chainB, addressB);
  return left.status === "valid" && right.status === "valid" && left.key === right.key;
}

function presentResearchState(value: AIResearchState, locale: AIResearchLocale): string {
  const labels: Record<AIResearchState, [string, string]> = {
    INSUFFICIENT_DATA: ["Niewystarczające dane", "Insufficient data"],
    BASIC_FILTERS_FAILED: ["Filtry niespełnione", "Filters not met"],
    KEEP_OBSERVING: ["Kontynuuj obserwację", "Keep observing"],
    MANUAL_VERIFICATION_REQUIRED: ["Wymagana ręczna weryfikacja", "Manual verification required"],
    OWNER_DECISION_REQUIRED: ["Wymagana decyzja właściciela", "Owner decision required"],
    ESTABLISHED_RESEARCH: ["Analiza Established", "Established research"],
    DATA_STALE: ["Dane nieaktualne", "Data is stale"],
  };
  return labels[value][locale === "pl" ? 0 : 1];
}

function presentFactValue(key: string, value: AIResearchFactCandidate["value"], locale: AIResearchLocale): string | number | boolean | null {
  if (typeof value !== "string") return value;
  const labels: Record<string, [string, string]> = {
    new: ["Nowe", "New"],
    follow_up: ["Dalsza obserwacja", "Further observation"],
    candidate: ["Kandydat do Established", "Established candidate"],
    established: ["Główny Radar", "Main Radar"],
    FRESH: ["Aktualne", "Current"],
    DELAYED: ["Opóźnione", "Delayed"],
    STALE: ["Dane nieaktualne", "Stale data"],
    UNKNOWN: ["Niedostępne", "Unavailable"],
    UNAVAILABLE: ["Niedostępne", "Unavailable"],
    passed_basic_filter: ["Filtry spełnione", "Filters met"],
    rejected_basic_filter: ["Filtry niespełnione", "Filters not met"],
    not_checked: ["Nie sprawdzono", "Not checked"],
  };
  return labels[value]?.[locale === "pl" ? 0 : 1] ?? (key === "lifecycle" ? presentResearchState("KEEP_OBSERVING", locale) : value);
}

function presentRiskSeverity(value: AIResearchRiskFactor["severity"], locale: AIResearchLocale): string {
  const labels = {
    low: ["Niskie", "Low"],
    medium: ["Średnie", "Medium"],
    high: ["Wysokie", "High"],
    unknown: ["Nieznane", "Unknown"],
  } as const;
  return labels[value][locale === "pl" ? 0 : 1];
}

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function boundedUntrustedText(value: string, max: number): string {
  return Array.from(value, (character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127 ? " " : character;
  }).join("").trim().slice(0, max);
}

function safeExternalUrl(value: string | null | undefined, hosts: Set<string>): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !hosts.has(url.hostname.toLowerCase()) || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function buildExplorerUrl(chain: string, address: string): string | null {
  const bases: Record<string, string> = {
    ethereum: "https://etherscan.io/token/",
    bsc: "https://bscscan.com/token/",
    base: "https://basescan.org/token/",
    arbitrum: "https://arbiscan.io/token/",
    polygon: "https://polygonscan.com/token/",
    avalanche: "https://snowtrace.io/token/",
    solana: "https://solscan.io/token/",
  };
  const base = bases[chain.toLowerCase()];
  return base ? `${base}${encodeURIComponent(address)}` : null;
}
