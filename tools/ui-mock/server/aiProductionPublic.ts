import type { AIResearchBrief, AIResearchBriefLookup, AIResearchLocale } from "../src/types/aiResearchTypes.js";
import type {
  AIProductionAnalysis,
  AIProductionAnalysisLookup,
  AIProductionRisk,
  AIProductionAnalysisStatus,
} from "../src/types/aiProductionTypes.js";

/**
 * Converts the internal queue/result record to the only analysis shape exposed to CAMP users.
 * Internal identifiers, model/provider metadata, usage and raw error codes never cross this boundary.
 */
export function presentAIProductionLookup(value: AIResearchBriefLookup, locale: AIResearchLocale = "en"): AIProductionAnalysisLookup {
  const lastKnownGood = value.is_last_known_good === true || (Boolean(value.brief) && value.availability !== "READY");
  const status = lastKnownGood ? "STALE" : presentStatus(value.availability);
  const analysis = value.brief ? presentAnalysis(value.brief, status === "STALE", locale) : null;
  return validateAIProductionLookup({
    schema_version: "ai_production_analysis_lookup_v1",
    status,
    analysis,
    retry_after_seconds: safeRetry(value.retry_after_seconds),
    is_last_known_good: lastKnownGood,
  });
}

export function presentAIProductionAvailability(available: boolean) {
  return { schema_version: "ai_production_availability_v1" as const, available };
}

/**
 * Compiles the canonical, shared analysis skeleton into the caller's locale.
 *
 * Provider prose is deliberately not translated here: an LLM translation would add
 * a second non-deterministic call and make locale switch behaviour unbounded. The
 * stored English narrative remains internal; all CAMP-facing strings below are
 * derived only from the same persisted facts, risks, coverage and actions.
 */
export function presentAnalysis(brief: AIResearchBrief, stale = false, locale: AIResearchLocale = "en"): AIProductionAnalysis {
  const fact = (key: string) => brief.known_facts.find((item) => item.key === key);
  const factText = (key: string, fallback: string) => {
    const item = fact(key);
    if (!item) return fallback;
    const value = item.value === null ? missingValue(locale) : presentFactValue(item.value, locale);
    return `${factLabel(item.key, locale)}: ${value}. ${recordedEvidence(locale)}`;
  };
  const coverageText = (area: AIResearchBrief["coverage"][number]["area"], fallback: string) => {
    const item = brief.coverage.find((value) => value.area === area);
    return item ? presentCoverage(item.area, item.state, locale) : fallback;
  };
  const strengths = brief.coverage
    .filter((item) => item.state === "sufficient")
    .map((item) => presentCoverage(item.area, item.state, locale))
    .filter((item) => item.length > 0)
    .slice(0, 6);
  const analysis: AIProductionAnalysis = {
    schema_version: "ai_production_analysis_v1",
    analysis_summary: presentSummary(brief, locale),
    strengths,
    risks: brief.risk_factors.map((risk) => ({
      title: riskLabel(risk.category, locale),
      detail: presentRisk(risk.category, risk.severity, locale),
      severity: risk.severity,
    })),
    missing_data: brief.missing_information.map((item) => `${missingLabel(item.key, locale)}: ${missingDetail(locale)}`),
    market_context: factText("market_cap_usd", factText("volume_24h_usd", coverageText("market_data", unavailable("market_data", locale)))),
    security_context: coverageText("security_coverage", unavailable("security_coverage", locale)),
    liquidity_context: factText("liquidity_usd", unavailable("liquidity", locale)),
    holder_context: factText("holders", unavailable("holders", locale)),
    evidence: brief.source_references.map((item) => ({
      label: sourceLabel(item.source_type, item.label, locale),
      observed_at: item.observed_at,
      completeness: item.completeness,
      url: item.url,
    })),
    generated_at: brief.generated_at,
    data_snapshot_at: brief.data_generated_at,
    freshness: stale || brief.research_state === "DATA_STALE" ? "STALE" : "FRESH",
    analysis_version: brief.schema_version,
    watch_items: brief.next_actions.map((item) => presentAction(item.action_type, locale)).slice(0, 8),
  };
  return validateAIProductionAnalysis(analysis);
}

function presentSummary(brief: AIResearchBrief, locale: AIResearchLocale): string {
  const facts = brief.known_facts.length;
  const risks = brief.risk_factors.length;
  const state = researchStateLabel(brief.research_state, locale);
  return locale === "pl"
    ? `Analiza porządkuje ${facts} zapisane fakty i ${risks} obszary wymagające weryfikacji. Aktualny stan badawczy: ${state}.`
    : `The analysis organizes ${facts} recorded facts and ${risks} areas requiring review. Current research state: ${state}.`;
}

function presentCoverage(area: AIResearchBrief["coverage"][number]["area"], state: AIResearchBrief["coverage"][number]["state"], locale: AIResearchLocale): string {
  const areaLabel = coverageLabel(area, locale);
  const stateLabel = coverageStateLabel(state, locale);
  return locale === "pl"
    ? `${areaLabel}: ${stateLabel}. Ocena opiera się wyłącznie na zapisanych danych.`
    : `${areaLabel}: ${stateLabel}. This assessment uses recorded evidence only.`;
}

function presentRisk(category: string, severity: AIProductionRisk["severity"], locale: AIResearchLocale): string {
  const categoryLabel = riskLabel(category, locale);
  const severityLabel = riskSeverityLabel(severity, locale);
  return locale === "pl"
    ? `${categoryLabel}: poziom ${severityLabel} wymaga dalszej weryfikacji zapisanych dowodów.`
    : `${categoryLabel}: the ${severityLabel} level requires further review of recorded evidence.`;
}

function presentAction(action: string, locale: AIResearchLocale): string {
  const label = actionLabel(action, locale);
  return locale === "pl"
    ? `${label}. Działanie wynika z zapisanego stanu produktu i nie zmienia cyklu życia.`
    : `${label}. This action follows the recorded product state and does not change lifecycle.`;
}

function recordedEvidence(locale: AIResearchLocale): string {
  return locale === "pl" ? "Wartość pochodzi z zapisanych danych." : "The value comes from recorded evidence.";
}

function missingDetail(locale: AIResearchLocale): string {
  return locale === "pl" ? "Dostarczone dane nie pokrywają obecnie tego obszaru." : "The supplied evidence does not currently cover this area.";
}

function unavailable(subject: string, locale: AIResearchLocale): string {
  const labels: Record<string, [string, string]> = {
    market_data: ["danych rynkowych", "Market data"], security_coverage: ["danych bezpieczeństwa", "Security coverage"], liquidity: ["danych o płynności", "Liquidity data"], holders: ["danych o posiadaczach", "Holder data"],
  };
  const label = labels[subject]?.[locale === "pl" ? 0 : 1] ?? subject;
  return locale === "pl" ? `Brak dostępnych ${label}.` : `${capitalize(label)} is not available in the supplied evidence.`;
}

function missingValue(locale: AIResearchLocale): string {
  return locale === "pl" ? "Brak danych" : "No data";
}

function presentFactValue(value: string | number | boolean, locale: AIResearchLocale): string {
  if (typeof value === "boolean") return value ? (locale === "pl" ? "Tak" : "Yes") : (locale === "pl" ? "Nie" : "No");
  if (typeof value !== "string") return String(value);
  const labels: Record<string, [string, string]> = {
    new: ["Nowe", "New"], follow_up: ["Dalsza obserwacja", "Further observation"], candidate: ["Kandydat do Established", "Established candidate"], established: ["Główny Radar", "Main Radar"],
    FRESH: ["Aktualne", "Current"], DELAYED: ["Opóźnione", "Delayed"], STALE: ["Nieaktualne", "Stale"], UNKNOWN: ["Niedostępne", "Unavailable"], UNAVAILABLE: ["Niedostępne", "Unavailable"],
    passed_basic_filter: ["Filtry spełnione", "Filters met"], rejected_basic_filter: ["Filtry niespełnione", "Filters not met"], not_checked: ["Nie sprawdzono", "Not checked"],
  };
  return labels[value]?.[locale === "pl" ? 0 : 1] ?? value;
}

function researchStateLabel(value: AIResearchBrief["research_state"], locale: AIResearchLocale): string {
  const labels: Record<AIResearchBrief["research_state"], [string, string]> = {
    INSUFFICIENT_DATA: ["Niewystarczające dane", "Insufficient data"], BASIC_FILTERS_FAILED: ["Filtry niespełnione", "Filters not met"], KEEP_OBSERVING: ["Kontynuuj obserwację", "Keep observing"],
    MANUAL_VERIFICATION_REQUIRED: ["Wymagana ręczna weryfikacja", "Manual verification required"], OWNER_DECISION_REQUIRED: ["Wymagana decyzja właściciela", "Owner decision required"],
    ESTABLISHED_RESEARCH: ["Analiza Established", "Established research"], DATA_STALE: ["Dane nieaktualne", "Data is stale"],
  };
  return labels[value][locale === "pl" ? 0 : 1];
}

function factLabel(value: string, locale: AIResearchLocale): string {
  const labels: Record<string, [string, string]> = {
    lifecycle: ["Etap obserwacji", "Observation stage"], basic_filters: ["Podstawowe filtry", "Basic filters"], freshness: ["Świeżość danych", "Data freshness"],
    market_cap_usd: ["Kapitalizacja", "Market cap"], liquidity_usd: ["Płynność", "Liquidity"], volume_24h_usd: ["Wolumen 24 h", "24h volume"], pair_age_days: ["Wiek pary", "Pair age"], holders: ["Posiadacze", "Holders"],
  };
  return labels[value]?.[locale === "pl" ? 0 : 1] ?? value;
}

function coverageLabel(value: string, locale: AIResearchLocale): string {
  const labels: Record<string, [string, string]> = {
    market_data: ["Dane rynkowe", "Market data"], basic_filters: ["Podstawowe filtry", "Basic filters"], security_coverage: ["Pokrycie bezpieczeństwa", "Security coverage"], information_completeness: ["Kompletność informacji", "Information completeness"],
  };
  return labels[value]?.[locale === "pl" ? 0 : 1] ?? value;
}

function coverageStateLabel(value: string, locale: AIResearchLocale): string {
  const labels: Record<string, [string, string]> = {
    sufficient: ["wystarczające", "sufficient"], partial: ["częściowe", "partial"], insufficient: ["niewystarczające", "insufficient"], unavailable: ["niedostępne", "unavailable"],
  };
  return labels[value]?.[locale === "pl" ? 0 : 1] ?? value;
}

function riskLabel(value: string, locale: AIResearchLocale): string {
  const labels: Record<string, [string, string]> = {
    basic_filters: ["Podstawowe filtry", "Basic filters"], coverage_missing: ["Brak pokrycia", "Coverage missing"], security: ["Bezpieczeństwo", "Security"], freshness: ["Świeżość danych", "Data freshness"], security_flag: ["Flaga bezpieczeństwa", "Security flag"], workflow: ["Proces obserwacji", "Observation workflow"],
  };
  return labels[value]?.[locale === "pl" ? 0 : 1] ?? (locale === "pl" ? "Zapisane ryzyko" : "Recorded risk");
}

function riskSeverityLabel(value: AIProductionRisk["severity"], locale: AIResearchLocale): string {
  const labels: Record<AIProductionRisk["severity"], [string, string]> = {
    low: ["niski", "low"], medium: ["średni", "medium"], high: ["wysoki", "high"], unknown: ["nieznany", "unknown"],
  };
  return labels[value][locale === "pl" ? 0 : 1];
}

function missingLabel(value: string, locale: AIResearchLocale): string {
  const labels: Record<string, [string, string]> = {
    security: ["Brak danych bezpieczeństwa", "Security data missing"], history: ["Brak wystarczającej historii", "Insufficient history"], next_checkpoint: ["Brak kolejnego punktu kontrolnego", "Next checkpoint missing"], fresh_data: ["Brak świeżych danych", "Fresh data missing"], source_verification: ["Brak weryfikacji źródłowej", "Source verification missing"],
  };
  return labels[value]?.[locale === "pl" ? 0 : 1] ?? value;
}

function actionLabel(value: string, locale: AIResearchLocale): string {
  const labels: Record<string, [string, string]> = {
    OPEN_VERIFICATION: ["Otwórz weryfikację źródłową", "Open source verification"], OPEN_DEXSCREENER: ["Otwórz DexScreener", "Open DexScreener"], OPEN_EXPLORER: ["Otwórz eksplorator", "Open explorer"], REVIEW_SECURITY: ["Przejrzyj bezpieczeństwo", "Review security"],
    WAIT_FOR_CHECKPOINT: ["Poczekaj na punkt kontrolny", "Wait for checkpoint"], REVIEW_CHECKPOINTS: ["Przejrzyj punkty kontrolne", "Review checkpoints"], OPEN_REPORT: ["Otwórz raport", "Open report"], OWNER_REVIEW: ["Przegląd właściciela", "Owner review"], RETURN_TO_RADAR: ["Wróć do Radaru", "Return to Radar"],
  };
  return labels[value]?.[locale === "pl" ? 0 : 1] ?? value;
}

function sourceLabel(sourceType: string, fallback: string, locale: AIResearchLocale): string {
  const labels: Record<string, [string, string]> = {
    scanner_snapshot: ["Migawka skanera", "Scanner snapshot"], follow_up_checkpoint: ["Punkty kontrolne obserwacji", "Observation checkpoints"], basic_filters: ["Podstawowe filtry", "Basic filters"], security_status: ["Status bezpieczeństwa", "Security status"], established_membership: ["Członkostwo Established", "Established membership"], methodology: ["Metodologia produktu", "Product methodology"], dexscreener: ["DexScreener", "DexScreener"], explorer: ["Eksplorator sieci", "Network explorer"], report: ["Aktualny raport", "Current report"],
  };
  return labels[sourceType]?.[locale === "pl" ? 0 : 1] ?? fallback;
}

function capitalize(value: string): string {
  return value.length > 0 ? `${value[0]!.toUpperCase()}${value.slice(1)}` : value;
}

export function validateAIProductionLookup(value: AIProductionAnalysisLookup): AIProductionAnalysisLookup {
  if (value.schema_version !== "ai_production_analysis_lookup_v1"
    || !["NO_ANALYSIS", "QUEUED", "PROCESSING", "READY", "STALE", "ERROR", "LIMIT", "DISABLED"].includes(value.status)
    || (value.analysis !== null && !isProductionAnalysis(value.analysis))
    || (value.retry_after_seconds !== null && (!Number.isSafeInteger(value.retry_after_seconds) || value.retry_after_seconds < 1))
    || typeof value.is_last_known_good !== "boolean") {
    throw new Error("AI_PRODUCTION_PUBLIC_CONTRACT_INVALID");
  }
  return value;
}

export function validateAIProductionAnalysis(value: AIProductionAnalysis): AIProductionAnalysis {
  if (!isProductionAnalysis(value)) throw new Error("AI_PRODUCTION_OUTPUT_SCHEMA_INVALID");
  return value;
}

function isProductionAnalysis(value: AIProductionAnalysis): boolean {
  return value.schema_version === "ai_production_analysis_v1"
    && typeof value.analysis_summary === "string"
    && Array.isArray(value.strengths) && value.strengths.every((item) => typeof item === "string")
    && Array.isArray(value.risks) && value.risks.every((item) => typeof item.title === "string" && typeof item.detail === "string"
      && ["low", "medium", "high", "unknown"].includes(item.severity))
    && Array.isArray(value.missing_data) && value.missing_data.every((item) => typeof item === "string")
    && typeof value.market_context === "string" && typeof value.security_context === "string"
    && typeof value.liquidity_context === "string" && typeof value.holder_context === "string"
    && Array.isArray(value.watch_items) && value.watch_items.every((item) => typeof item === "string")
    && Array.isArray(value.evidence) && value.evidence.every((item) => typeof item.label === "string"
      && (item.observed_at === null || typeof item.observed_at === "string")
      && ["complete", "partial", "unavailable"].includes(item.completeness)
      && (item.url === null || typeof item.url === "string"))
    && typeof value.generated_at === "string" && typeof value.data_snapshot_at === "string"
    && (value.freshness === "FRESH" || value.freshness === "STALE")
    && typeof value.analysis_version === "string";
}

function presentStatus(value: AIResearchBriefLookup["availability"]): AIProductionAnalysisStatus {
  if (value === "ABSENT" || value === "INSUFFICIENT_DATA") return "NO_ANALYSIS";
  if (value === "QUEUED") return "QUEUED";
  if (value === "PROCESSING") return "PROCESSING";
  if (value === "READY") return "READY";
  if (value === "STALE") return "STALE";
  if (value === "COOLDOWN" || value === "RATE_LIMITED") return "LIMIT";
  if (value === "PROVIDER_DISABLED") return "DISABLED";
  return "ERROR";
}

function safeRetry(value: number | null): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1 ? value : null;
}
