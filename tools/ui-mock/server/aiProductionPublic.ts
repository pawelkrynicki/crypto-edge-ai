import type { AIResearchBrief, AIResearchBriefLookup, AIResearchLocale } from "../src/types/aiResearchTypes.js";
import type {
  AIProductionAnalysis,
  AIProductionAnalysisLookup,
  AIProductionAnalysisStatus,
  AIProductionInsight,
  AIProductionRisk,
} from "../src/types/aiProductionTypes.js";

/**
 * Converts a validated shared bilingual brief into the only analysis shape exposed
 * to CAMP users. Provider, model, queue and internal identifiers never cross this
 * boundary; the evidence-bound provider narrative does.
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

/** The public result reads one stored bilingual generation; locale never calls a provider. */
export function presentAnalysis(brief: AIResearchBrief, stale = false, locale: AIResearchLocale = "en"): AIProductionAnalysis {
  const copy = (value: { en: string; pl: string }) => value[locale];
  const insight = (title: string, detail: string): AIProductionInsight => ({ title, detail });
  const factByKey = (...keys: string[]) => brief.known_facts.find((item) => keys.includes(item.key));
  const riskByCategory = (...keys: string[]) => brief.risk_factors.find((item) => keys.includes(item.category));
  const factInsight = (item: AIResearchBrief["known_facts"][number] | undefined, title: string, unavailable: string) => item
    ? insight(factLabel(item.key, locale), copy(item.interpretation))
    : insight(title, unavailable);
  const riskInsight = (item: AIResearchBrief["risk_factors"][number] | undefined, title: string, unavailable: string) => item
    ? insight(riskLabel(item.category, locale), copy(item.explanation))
    : insight(title, unavailable);

  const analysis: AIProductionAnalysis = {
    schema_version: "ai_production_analysis_v2",
    analysis_summary: copy(brief.summary),
    confirmed_findings: brief.known_facts.slice(0, 3).map((item) => insight(factLabel(item.key, locale), copy(item.interpretation))),
    risks: [...brief.risk_factors]
      .sort((left, right) => riskPriority(left.severity) - riskPriority(right.severity))
      .slice(0, 3)
      .map((risk) => ({ title: riskLabel(risk.category, locale), detail: copy(risk.explanation), severity: risk.severity })),
    missing_data: [...brief.missing_information]
      .sort((left, right) => missingPriority(left.key) - missingPriority(right.key))
      .slice(0, 3)
      .map((item) => insight(missingLabel(item.key, locale), copy(item.explanation))),
    market_context: factInsight(
      factByKey("market_cap_usd", "volume_24h_usd"),
      locale === "pl" ? "Dane rynkowe" : "Market data",
      locale === "pl" ? "Migawka nie zawiera zapisanej wartości rynkowej, więc nie można ocenić kontekstu rynkowego." : "The snapshot has no recorded market value, so market context cannot be assessed.",
    ),
    security_context: riskInsight(
      riskByCategory("security", "security_flag"),
      locale === "pl" ? "Bezpieczeństwo" : "Security",
      locale === "pl" ? "Brak zapisanego wyniku bezpieczeństwa, więc nie można ocenić ograniczeń kontraktu ani flag ostrzegawczych." : "No security result is recorded, so contract restrictions and warning flags cannot be assessed.",
    ),
    liquidity_context: factInsight(
      factByKey("liquidity_usd"),
      locale === "pl" ? "Płynność" : "Liquidity",
      locale === "pl" ? "Migawka nie zawiera zapisanej wartości płynności, więc nie można ocenić jej kontekstu." : "The snapshot has no recorded liquidity value, so its context cannot be assessed.",
    ),
    holder_context: factInsight(
      factByKey("holders"),
      locale === "pl" ? "Holderzy" : "Holders",
      locale === "pl" ? "Migawka nie zawiera danych pozwalających ocenić strukturę holderów." : "The snapshot does not provide data that can assess holder structure.",
    ),
    next_research_steps: [...brief.next_actions]
      .sort((left, right) => actionPriority(left.priority) - actionPriority(right.priority))
      .slice(0, 3)
      .map((item) => ({ title: actionLabel(item.action_type, locale), detail: copy(item.reason), priority: item.priority })),
    reassessment_signals: brief.status_change_conditions.slice(0, 3)
      .map((item) => insight(item.label, copy(item.explanation))),
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
  };
  return validateAIProductionAnalysis(analysis);
}

function riskPriority(value: AIProductionRisk["severity"]): number {
  return { high: 0, medium: 1, unknown: 2, low: 3 }[value];
}

function missingPriority(value: string): number {
  return ["security", "holders", "source_verification", "fresh_data", "history", "next_checkpoint"].indexOf(value) + 1 || 99;
}

function actionPriority(value: "primary" | "secondary" | "tertiary"): number {
  return { primary: 0, secondary: 1, tertiary: 2 }[value];
}

function factLabel(value: string, locale: AIResearchLocale): string {
  const labels: Record<string, [string, string]> = {
    lifecycle: ["Etap obserwacji", "Observation stage"], basic_filters: ["Podstawowe filtry", "Basic filters"], freshness: ["Świeżość danych", "Data freshness"],
    market_cap_usd: ["Kapitalizacja", "Market cap"], liquidity_usd: ["Płynność", "Liquidity"], volume_24h_usd: ["Wolumen 24 h", "24h volume"], pair_age_days: ["Wiek pary", "Pair age"], holders: ["Holderzy", "Holders"],
  };
  return labels[value]?.[locale === "pl" ? 0 : 1] ?? value;
}

function riskLabel(value: string, locale: AIResearchLocale): string {
  const labels: Record<string, [string, string]> = {
    basic_filters: ["Podstawowe filtry", "Basic filters"], coverage_missing: ["Braki w danych", "Evidence gaps"], security: ["Bezpieczeństwo", "Security"], freshness: ["Świeżość danych", "Data freshness"], security_flag: ["Flaga bezpieczeństwa", "Security flag"], workflow: ["Proces obserwacji", "Observation workflow"],
  };
  return labels[value]?.[locale === "pl" ? 0 : 1] ?? (locale === "pl" ? "Zapisane ryzyko" : "Recorded risk");
}

function missingLabel(value: string, locale: AIResearchLocale): string {
  const labels: Record<string, [string, string]> = {
    security: ["Dane bezpieczeństwa", "Security data"], holders: ["Struktura holderów", "Holder structure"], history: ["Historia", "History"], next_checkpoint: ["Kolejny punkt kontrolny", "Next checkpoint"], fresh_data: ["Świeża migawka", "Fresh snapshot"], source_verification: ["Weryfikacja źródła", "Source verification"],
  };
  return labels[value]?.[locale === "pl" ? 0 : 1] ?? value;
}

function actionLabel(value: string, locale: AIResearchLocale): string {
  const labels: Record<string, [string, string]> = {
    OPEN_VERIFICATION: ["Otwórz weryfikację źródła", "Open source verification"], OPEN_DEXSCREENER: ["Otwórz DexScreener", "Open DexScreener"], OPEN_EXPLORER: ["Otwórz eksplorator", "Open explorer"], REVIEW_SECURITY: ["Przejrzyj bezpieczeństwo", "Review security"],
    WAIT_FOR_CHECKPOINT: ["Poczekaj na punkt kontrolny", "Wait for checkpoint"], REVIEW_CHECKPOINTS: ["Przejrzyj punkty kontrolne", "Review checkpoints"], OPEN_REPORT: ["Otwórz raport", "Open report"], OWNER_REVIEW: ["Przegląd ownera", "Owner review"], RETURN_TO_RADAR: ["Wróć do Radaru", "Return to Radar"],
  };
  return labels[value]?.[locale === "pl" ? 0 : 1] ?? value;
}

function sourceLabel(sourceType: string, fallback: string, locale: AIResearchLocale): string {
  const labels: Record<string, [string, string]> = {
    scanner_snapshot: ["Migawka skanera", "Scanner snapshot"], follow_up_checkpoint: ["Punkty kontrolne obserwacji", "Observation checkpoints"], basic_filters: ["Podstawowe filtry", "Basic filters"], security_status: ["Status bezpieczeństwa", "Security status"], established_membership: ["Członkostwo Established", "Established membership"], methodology: ["Metodologia produktu", "Product methodology"], dexscreener: ["DexScreener", "DexScreener"], explorer: ["Eksplorator sieci", "Network explorer"], report: ["Aktualny raport", "Current report"],
  };
  return labels[sourceType]?.[locale === "pl" ? 0 : 1] ?? fallback;
}

export function validateAIProductionLookup(value: AIProductionAnalysisLookup): AIProductionAnalysisLookup {
  if (value.schema_version !== "ai_production_analysis_lookup_v1"
    || !["NO_ANALYSIS", "QUEUED", "PROCESSING", "READY", "STALE", "ERROR", "LIMIT", "DISABLED"].includes(value.status)
    || (value.analysis !== null && !isProductionAnalysis(value.analysis))
    || (value.retry_after_seconds !== null && (!Number.isSafeInteger(value.retry_after_seconds) || value.retry_after_seconds < 1))
    || typeof value.is_last_known_good !== "boolean") throw new Error("AI_PRODUCTION_PUBLIC_CONTRACT_INVALID");
  return value;
}

export function validateAIProductionAnalysis(value: AIProductionAnalysis): AIProductionAnalysis {
  if (!isProductionAnalysis(value)) throw new Error("AI_PRODUCTION_OUTPUT_SCHEMA_INVALID");
  return value;
}

function isProductionAnalysis(value: AIProductionAnalysis): boolean {
  return value.schema_version === "ai_production_analysis_v2"
    && typeof value.analysis_summary === "string"
    && isInsightArray(value.confirmed_findings)
    && Array.isArray(value.risks) && value.risks.every((item) => typeof item.title === "string" && typeof item.detail === "string" && ["low", "medium", "high", "unknown"].includes(item.severity))
    && isInsightArray(value.missing_data)
    && isInsight(value.market_context) && isInsight(value.security_context) && isInsight(value.liquidity_context) && isInsight(value.holder_context)
    && Array.isArray(value.next_research_steps) && value.next_research_steps.every((item) => isInsight(item) && ["primary", "secondary", "tertiary"].includes(item.priority))
    && isInsightArray(value.reassessment_signals)
    && Array.isArray(value.evidence) && value.evidence.every((item) => typeof item.label === "string" && (item.observed_at === null || typeof item.observed_at === "string") && ["complete", "partial", "unavailable"].includes(item.completeness) && (item.url === null || typeof item.url === "string"))
    && typeof value.generated_at === "string" && typeof value.data_snapshot_at === "string" && (value.freshness === "FRESH" || value.freshness === "STALE") && typeof value.analysis_version === "string";
}

function isInsight(value: unknown): value is AIProductionInsight {
  return Boolean(value && typeof value === "object" && "title" in value && "detail" in value && typeof value.title === "string" && typeof value.detail === "string");
}

function isInsightArray(value: unknown): value is AIProductionInsight[] {
  return Array.isArray(value) && value.every(isInsight);
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
