import {
  resolveProductFilterConditions,
  resolveProductFilterThreshold,
  type BasicFilterCategory,
} from "../src/productFilterResolver.js";
import type {
  AIProductionFilterFailure,
  AIProductionGuidanceAction,
  AIProductionInsight,
  AIProductionResearchGuidance,
} from "../src/types/aiProductionTypes.js";
import type { AIResearchBrief, AIResearchLocale } from "../src/types/aiResearchTypes.js";
import type { AIResearchGuidanceInput } from "./aiResearchContext.js";

/**
 * Projects validated product facts into the fixed CAMP research playbook. This
 * is deliberately deterministic: provider prose never chooses the active step
 * or the order of the next checks.
 */
export function presentAIResearchGuidance(
  brief: AIResearchBrief,
  locale: AIResearchLocale,
  input?: AIResearchGuidanceInput,
): AIProductionResearchGuidance {
  const source = input ?? fallbackInput(brief);
  const pl = locale === "pl";
  const filtersPassed = source.filters.status === "passed_basic_filter";
  const filtersFailed = source.filters.status === "rejected_basic_filter";
  const snapshotNeedsRefresh = source.freshness !== "FRESH";
  const securityReady = source.security.coverage === "complete"
    && source.security.contract_verified !== null
    && hasRecordedSecurityStatus(source.security.honeypot_status);
  const filterFailures = presentFilterFailures(source, locale);

  if (snapshotNeedsRefresh || !filtersPassed) {
    const blockers: AIProductionInsight[] = [];
    if (snapshotNeedsRefresh) blockers.push(insight(
      pl ? "Migawka wymaga odświeżenia" : "Snapshot needs refreshing",
      pl ? "Zapisane dane nie są wystarczająco świeże do ponownej oceny filtrów researchu." : "The recorded data is not fresh enough to re-evaluate the research filters.",
    ));
    if (filtersFailed) blockers.push(insight(
      pl ? "Podstawowe filtry nie są spełnione" : "Basic filters are not met",
      pl ? "Przed przejściem do głębszego researchu trzeba ponownie sprawdzić zapisane wartości i progi poniżej." : "Before deeper research, review the recorded values and thresholds below.",
    ));
    if (!filtersPassed && !filtersFailed) blockers.push(insight(
      pl ? "Brak potwierdzonego wyniku filtrów" : "No confirmed filter result",
      pl ? "Migawka nie zawiera potwierdzonego wyniku podstawowych filtrów researchu." : "The snapshot does not contain a confirmed basic-filter result.",
    ));

    const refreshAction = actionFromCatalog(source, "WAIT_FOR_CHECKPOINT");
    const actions: AIProductionGuidanceAction[] = [
      guidanceAction(
        pl ? "Odśwież dane" : "Refresh the data",
        snapshotNeedsRefresh
          ? (pl ? "Migawka jest nieaktualna." : "The snapshot is stale.")
          : (pl ? "Wynik filtrów wymaga ponownego sprawdzenia na zapisanych danych." : "The filter result needs re-checking against the recorded data."),
        pl ? "Czy aktualna migawka nadal prowadzi do tego samego wyniku podstawowych filtrów." : "Whether the current snapshot still leads to the same basic-filter result.",
        refreshAction,
      ),
      guidanceAction(
        pl ? "Sprawdź dokładne wyniki filtrów" : "Review the exact filter results",
        pl ? "To ten etap zatrzymuje dalszy research." : "This stage is the current research gate.",
        pl ? "Które mierzalne warunki trzeba spełnić przed etapem bezpieczeństwa." : "Which measurable conditions must be met before the Security stage.",
        null,
      ),
    ];
    const unlocks = [
      ...(snapshotNeedsRefresh ? [pl ? "Świeża migawka danych" : "Fresh data snapshot"] : []),
      ...filterFailures.slice(0, 5).map((item) => pl
        ? `${item.label}: spełnia wymagany próg`
        : `${item.label}: meets the required threshold`),
      ...(!filtersPassed && filterFailures.length === 0 ? [pl ? "Potwierdzony wynik podstawowych filtrów" : "Confirmed basic-filter result"] : []),
    ].slice(0, 6);
    return {
      current_step: {
        number: 1,
        title: pl ? "SZYBKI FILTR" : "QUICK FILTER",
        posture: snapshotNeedsRefresh ? (pl ? "ODŚWIEŻ DANE" : "REFRESH DATA") : (pl ? "NIE SPEŁNIA FILTRÓW RESEARCHU" : "RESEARCH FILTERS NOT MET"),
      },
      blockers: blockers.slice(0, 3),
      filter_failures: filterFailures,
      actions: actions.slice(0, 3),
      unlock_conditions: unlocks,
    };
  }

  if (!securityReady) {
    const unavailable = source.security.coverage === "unavailable";
    const reviewSecurity = actionFromCatalog(source, "REVIEW_SECURITY");
    const verification = actionFromCatalog(source, "OPEN_VERIFICATION");
    const explorer = actionFromCatalog(source, "OPEN_EXPLORER");
    return {
      current_step: {
        number: unavailable ? 2 : 3,
        title: unavailable
          ? (pl ? "BLOKERY — BEZPIECZEŃSTWO" : "DEAL BREAKERS — SECURITY")
          : (pl ? "BEZPIECZEŃSTWO / 3 KONTROLE" : "SECURITY / 3 STAMPS"),
        posture: pl ? "WYMAGA WERYFIKACJI BEZPIECZEŃSTWA" : "SECURITY VERIFICATION REQUIRED",
      },
      blockers: [insight(
        unavailable ? (pl ? "Brak wyniku bezpieczeństwa" : "Security result missing") : (pl ? "Bezpieczeństwo wymaga uzupełnienia" : "Security review needs completion"),
        unavailable
          ? (pl ? "Nie można jeszcze ocenić honeypotu, weryfikacji kontraktu, podatków kupna/sprzedaży ani krytycznych flag kontraktu." : "Honeypot status, contract verification, buy/sell taxes, and critical contract flags cannot yet be assessed.")
          : (pl ? "Przed etapem on-chain trzeba zamknąć wymagane kontrole bezpieczeństwa." : "The required security checks must be completed before the on-chain stage."),
      ), ...(!source.address_identity_verified ? [insight(
        pl ? "Źródło lub tożsamość wymagają weryfikacji" : "Source or identity needs verification",
        pl ? "Bez ręcznego potwierdzenia źródła dane nie powinny stanowić mocniejszego wniosku researchowego." : "Until the source is manually confirmed, it should not support a stronger research conclusion.",
      )] : [])].slice(0, 3),
      filter_failures: [],
      actions: [
        guidanceAction(
          pl ? "Sprawdź bezpieczeństwo" : "Review security",
          pl ? "Brakuje wyniku, który zamyka podstawowe ryzyka kontraktu." : "The result needed to close the basic contract-risk checks is missing.",
          pl ? "Status honeypotu, weryfikację kontraktu, podatki kupna/sprzedaży i krytyczne flagi." : "Honeypot status, contract verification, buy/sell taxes, and critical flags.",
          reviewSecurity,
        ),
        guidanceAction(
          pl ? "Zweryfikuj źródło" : "Verify the source",
          pl ? "Weryfikacja źródła wiąże wynik z właściwym tokenem i kontraktem." : "Source verification ties the result to the correct token and contract.",
          pl ? "Czy zapisane dane odnoszą się do właściwej tożsamości projektu." : "Whether the recorded data belongs to the intended project identity.",
          verification,
        ),
        ...(explorer ? [guidanceAction(
          pl ? "Otwórz eksplorator" : "Open the explorer",
          pl ? "Istniejąca dozwolona trasa pomaga sprawdzić zapis kontraktu." : "The existing permitted route helps inspect the recorded contract.",
          pl ? "Dane kontraktu potrzebne do ręcznej weryfikacji." : "Contract data needed for the manual verification.",
          explorer,
        )] : []),
      ].slice(0, 3),
      unlock_conditions: [
        pl ? "Wynik bezpieczeństwa jest dostępny" : "Security result is available",
        pl ? "Weryfikacja kontraktu została oceniona" : "Contract verification is assessed",
        pl ? "Krytyczne flagi zostały przejrzane" : "Critical flags are reviewed",
      ],
    };
  }

  if (!source.holder_data_available) {
    const explorer = actionFromCatalog(source, "OPEN_EXPLORER");
    const verification = actionFromCatalog(source, "OPEN_VERIFICATION");
    return {
      current_step: {
        number: 4,
        title: pl ? "DANE ON-CHAIN" : "ON-CHAIN",
        posture: pl ? "WYMAGA DANYCH ON-CHAIN" : "ON-CHAIN DATA REQUIRED",
      },
      blockers: [insight(
        pl ? "Brak struktury holderów" : "Holder structure missing",
        pl ? "Nie można ocenić koncentracji podaży bez zapisanych danych o największych portfelach." : "Supply concentration cannot be assessed without recorded top-holder data.",
      )],
      filter_failures: [],
      actions: [guidanceAction(
        pl ? "Sprawdź dane holderów on-chain" : "Review on-chain holder data",
        pl ? "Etap Security jest wystarczająco zamknięty, ale brakuje danych o koncentracji." : "The Security stage is sufficiently complete, but concentration data is missing.",
        pl ? "Czy koncentracja podaży może zostać oceniona na podstawie zapisanych danych holderów." : "Whether supply concentration can be assessed from recorded holder data.",
        explorer ?? verification,
      )],
      unlock_conditions: [
        pl ? "Struktura holderów jest dostępna" : "Holder structure is available",
        pl ? "Koncentracja podaży została oceniona" : "Supply concentration is assessed",
      ],
    };
  }

  return {
    current_step: {
      number: 5,
      title: pl ? "SPOŁECZNOŚĆ" : "SOCIAL",
      posture: pl ? "GOTOWY DO KOLEJNEGO KROKU RESEARCHU" : "READY FOR THE NEXT RESEARCH STEP",
    },
    blockers: [insight(
      pl ? "Kolejny etap playbooka" : "Next playbook stage",
      pl ? "Dostępne dane zamykają bramki kroków 1–4; kolejne etapy zostaną wzbogacone w PC.3." : "Available data closes the gates for steps 1–4; later stages will be enriched in PC.3.",
    )],
    filter_failures: [],
    actions: [guidanceAction(
      pl ? "Przygotuj kolejny etap researchu" : "Prepare the next research stage",
      pl ? "Kolejne kroki playbooka wymagają jeszcze zaplanowanych integracji danych." : "The next playbook steps still need the planned data integrations.",
      pl ? "Jakie dane Social są potrzebne do kolejnej kontroli." : "Which Social data is needed for the next check.",
      null,
    )],
    unlock_conditions: [pl ? "Dane Social są dostępne do researchu" : "Social data is available for research"],
  };
}

function presentFilterFailures(input: AIResearchGuidanceInput, locale: AIResearchLocale): AIProductionFilterFailure[] {
  const pl = locale === "pl";
  const resolution = resolveProductFilterConditions({
    basicFilterStatus: input.filters.status,
    filterReasons: input.filters.reasons,
  });
  return resolution.conditions
    .filter((condition) => condition.state === "failed")
    .map((condition) => {
      const threshold = resolveProductFilterThreshold(condition);
      return {
        label: filterLabel(condition.category, locale),
        value: presentMetricValue(condition.category, input.filters.metrics, locale),
        requirement: threshold
          ? presentThreshold(threshold.comparator, threshold.value, threshold.format, locale)
          : (pl ? "Wymagany kanoniczny próg produktu" : "Canonical product threshold required"),
        status: pl ? "NIE SPEŁNIA" : "NOT MET",
      };
    })
    .slice(0, 3);
}

function fallbackInput(brief: AIResearchBrief): AIResearchGuidanceInput {
  const fact = (key: string) => brief.known_facts.find((item) => item.key === key)?.value ?? null;
  const coverage = brief.coverage.find((item) => item.area === "security_coverage")?.state;
  return {
    freshness: brief.research_state === "DATA_STALE" ? "STALE" : "FRESH",
    filters: {
      status: String(fact("basic_filters") ?? "not_checked"),
      reasons: [],
      metrics: {
        market_cap_usd: numericFact(fact("market_cap_usd")),
        liquidity_usd: numericFact(fact("liquidity_usd")),
        volume_24h_usd: numericFact(fact("volume_24h_usd")),
        volume_market_cap_ratio: null,
        pair_age_days: numericFact(fact("pair_age_days")),
      },
    },
    security: {
      coverage: coverage === "sufficient" ? "complete" : coverage === "partial" ? "partial" : "unavailable",
      contract_verified: null,
      honeypot_status: null,
      buy_tax: null,
      sell_tax: null,
      critical_flags_recorded: brief.risk_factors.some((item) => item.category === "security_flag"),
    },
    holder_data_available: brief.known_facts.some((item) => item.key === "holders" && item.value !== null),
    address_identity_verified: !brief.missing_information.some((item) => item.key === "source_verification"),
    action_catalog: brief.next_actions.map(({ action_type, label, priority, target_type, target_reference }) => ({ action_type, label, priority, target_type, target_reference })),
  };
}

function numericFact(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function insight(title: string, detail: string): AIProductionInsight {
  return { title, detail };
}

function guidanceAction(
  title: string,
  why: string,
  resolves: string,
  cta: AIResearchGuidanceInput["action_catalog"][number] | null,
): AIProductionGuidanceAction {
  return {
    title,
    why,
    resolves,
    cta: cta ? {
      label: cta.label,
      href: cta.target_reference,
      external: cta.target_type === "external_url",
    } : null,
  };
}

function actionFromCatalog(input: AIResearchGuidanceInput, actionType: string) {
  return input.action_catalog.find((action) => action.action_type === actionType) ?? null;
}

function hasRecordedSecurityStatus(value: string | null): boolean {
  return typeof value === "string" && value.trim().length > 0 && value.trim().toUpperCase() !== "NOT_CHECKED";
}

function filterLabel(category: BasicFilterCategory, locale: AIResearchLocale): string {
  const labels: Record<BasicFilterCategory, [string, string]> = {
    market_cap: ["Kapitalizacja", "Market cap"],
    volume_24h: ["Wolumen 24 h", "24h volume"],
    liquidity: ["Płynność", "Liquidity"],
    volume_market_cap_ratio: ["Relacja wolumenu do kapitalizacji", "Volume-to-market-cap ratio"],
    pair_age: ["Wiek pary", "Pair age"],
  };
  return labels[category][locale === "pl" ? 0 : 1];
}

function presentMetricValue(
  category: BasicFilterCategory,
  metrics: AIResearchGuidanceInput["filters"]["metrics"],
  locale: AIResearchLocale,
): string {
  const value = {
    market_cap: metrics.market_cap_usd,
    volume_24h: metrics.volume_24h_usd,
    liquidity: metrics.liquidity_usd,
    volume_market_cap_ratio: metrics.volume_market_cap_ratio,
    pair_age: metrics.pair_age_days,
  }[category];
  if (value === null) return locale === "pl" ? "Brak danych" : "No data";
  if (category === "volume_market_cap_ratio") return `${new Intl.NumberFormat(locale === "pl" ? "pl-PL" : "en-US", { maximumFractionDigits: 2 }).format(value * 100)}%`;
  if (category === "pair_age") return `${new Intl.NumberFormat(locale === "pl" ? "pl-PL" : "en-US", { maximumFractionDigits: 1 }).format(value)} ${locale === "pl" ? "dni" : "days"}`;
  return `${new Intl.NumberFormat(locale === "pl" ? "pl-PL" : "en-US", { maximumFractionDigits: value < 1 ? 6 : 0 }).format(value)} USD`;
}

function presentThreshold(
  comparator: "minimum" | "maximum",
  value: number,
  format: "usd" | "percent" | "days",
  locale: AIResearchLocale,
): string {
  const pl = locale === "pl";
  const rendered = format === "percent"
    ? `${new Intl.NumberFormat(pl ? "pl-PL" : "en-US", { maximumFractionDigits: 2 }).format(value * 100)}%`
    : format === "days"
      ? `${new Intl.NumberFormat(pl ? "pl-PL" : "en-US", { maximumFractionDigits: 1 }).format(value)} ${pl ? "dni" : "days"}`
      : `${new Intl.NumberFormat(pl ? "pl-PL" : "en-US", { maximumFractionDigits: 0 }).format(value)} USD`;
  if (comparator === "minimum") return pl ? `Wymagane minimum: ${rendered}` : `Required minimum: ${rendered}`;
  return pl ? `Wymagane maksimum: ${rendered}` : `Required maximum: ${rendered}`;
}
