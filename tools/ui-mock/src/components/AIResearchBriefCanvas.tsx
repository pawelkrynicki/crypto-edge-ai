import React from "react";
import { formatProductDateTime, formatProductUsd, useProductLocale } from "../productI18n";
import type {
  AIResearchBrief,
  AIResearchCoverageState,
  AIResearchRiskSeverity,
  AIResearchState,
  AIResearchReviewMetrics,
} from "../types/aiResearchTypes";
import { ActionLink, ExternalLinkAction, StatusBadge } from "./ProductUi";

void React;

export function AIResearchBriefCanvas({
  brief,
  symbol,
  name,
  reviewMetrics,
}: {
  brief: AIResearchBrief;
  symbol: string;
  name: string;
  reviewMetrics?: AIResearchReviewMetrics | null;
}) {
  const { locale } = useProductLocale();
  const ui = COPY[locale];
  const currentStage = brief.known_facts.find(({ key }) => key === "lifecycle")?.value ?? brief.research_state;
  const freshness = brief.known_facts.find(({ key }) => key === "freshness")?.value ?? ui.unknown;
  const filters = brief.known_facts.find(({ key }) => key === "basic_filters")?.value ?? ui.unknown;
  const security = brief.coverage.find(({ area }) => area === "security_coverage")?.state ?? "unavailable";
  const currentCheckpoint = brief.checkpoints.find(({ state }) => state === "current" || state === "skipped");
  const mainRisk = brief.risk_factors[0];
  const mainAction = brief.next_actions[0];
  const mainCondition = brief.status_change_conditions[0];
  const freshnessIsStale = String(freshness) === "STALE";
  const filtersAreNotMet = String(filters) === "rejected_basic_filter";
  const currentProblem = freshnessIsStale && filtersAreNotMet
    ? ui.staleAndFiltersFailed
    : mainRisk?.title ?? ui.noRecordedProblem;
  const nextAction = mainAction?.label ?? ui.noAction;
  const reassessmentCondition = freshnessIsStale && filtersAreNotMet
    ? ui.newDataAndFilterRecalculation
    : freshnessIsStale ? ui.newDataPublished : mainCondition?.label ?? ui.noCondition;
  return (
    <article className="ai-research-canvas" aria-labelledby="ai-research-canvas-title">
      <header className="ai-research-header">
        <AddressIdenticon address={brief.identity.contract_address} />
        <div className="ai-research-header-copy">
          <span className="ai-research-eyebrow">{ui.canvasEyebrow}</span>
          <h3 id="ai-research-canvas-title">{symbol || ui.unknown} <small>{name || ui.unknown}</small></h3>
          <div className="ai-research-identity-line">
            <span>{brief.identity.chain}</span>
            <code title={brief.identity.contract_address}>{shortAddress(brief.identity.contract_address)}</code>
            <StatusBadge tone={stateTone(brief.research_state)}>{stateLabel(brief.research_state, locale)}</StatusBadge>
            {brief.render_preview && <StatusBadge tone="accent">{ui.previewBadge}</StatusBadge>}
          </div>
        </div>
        <dl className="ai-research-times">
          <div><dt>{ui.dataTime}</dt><dd>{formatProductDateTime(brief.data_generated_at, locale)}</dd></div>
          <div><dt>{ui.analysisTime}</dt><dd>{formatProductDateTime(brief.generated_at, locale)}</dd></div>
        </dl>
      </header>

      <section className="ai-research-kpis" aria-label={ui.kpiLabel}>
        <Kpi label={ui.researchStage} value={presentValue("lifecycle", currentStage, locale)} tone={lifecycleTone(currentStage)} />
        <Kpi label={ui.freshness} value={presentValue("freshness", freshness, locale)} tone={String(freshness) === "FRESH" ? "ready" : "warning"} />
        <Kpi label={ui.basicFilters} value={filterAssessmentLabel(filters, locale)} tone={String(filters) === "passed_basic_filter" ? "ready" : "warning"} />
        <Kpi label={ui.securityCoverage} value={coverageLabel(security, locale)} tone={coverageTone(security)} />
        <Kpi label={ui.missingAreas} value={String(brief.missing_information.length)} tone={brief.missing_information.length === 0 ? "ready" : "warning"} />
        <Kpi label={ui.nextCheckpoint} value={currentCheckpoint ? `${currentCheckpoint.day} ${checkpointUnit(currentCheckpoint.day, locale)}` : ui.notScheduled} tone={currentCheckpoint ? "accent" : "neutral"} />
      </section>

      <section className="ai-research-panel ai-research-coverage-panel" aria-labelledby="ai-coverage-title">
        <PanelHeading eyebrow="01" id="ai-coverage-title" title={ui.visualState} detail={ui.visualStateHelp} />
        <div className="ai-coverage-grid">
          {brief.coverage.map((item) => (
            <div className={`ai-coverage-cell ${item.state}`} key={item.area}>
              <span>{coverageAreaLabel(item.area, locale)}</span>
              <strong>{coverageLabel(item.state, locale)}</strong>
              <p>{item.explanation}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="ai-research-panel ai-next-map-panel" aria-labelledby="ai-next-map-title">
        <PanelHeading eyebrow="02" id="ai-next-map-title" title={ui.whatsNext} detail={ui.whatsNextHelp} />
        <ol className="ai-next-map">
          <MapNode label={ui.currentStage} value={presentValue("lifecycle", currentStage, locale)} />
          <MapNode label={ui.mainProblem} value={currentProblem} tone={mainRisk ? severityTone(mainRisk.severity) : "ready"} />
          <MapNode label={ui.nextAction} value={nextAction} tone="accent" />
          <MapNode label={ui.reassessmentCondition} value={reassessmentCondition} />
        </ol>
        <div className="ai-next-actions">
          {brief.next_actions.map((action) => <ResearchAction key={action.action_type} action={action} />)}
        </div>
      </section>

      <section className="ai-research-panel ai-risk-panel" aria-labelledby="ai-risk-title">
        <PanelHeading eyebrow="03" id="ai-risk-title" title={ui.riskMatrix} detail={ui.riskHelp} />
        <div className="ai-risk-table" role="table" aria-label={ui.riskMatrix}>
          <div className="ai-risk-row ai-risk-head" role="row">
            <span role="columnheader">{ui.area}</span><span role="columnheader">{ui.state}</span><span role="columnheader">{ui.meaning}</span><span role="columnheader">{ui.sources}</span>
          </div>
          {brief.risk_factors.map((risk, index) => (
            <div className="ai-risk-row" role="row" key={`${risk.category}-${index}`}>
              <strong role="cell" data-label={ui.area}>{risk.title}</strong>
              <span role="cell" data-label={ui.state}><StatusBadge tone={severityTone(risk.severity)}>{severityLabel(risk.severity, locale)}</StatusBadge></span>
              <p role="cell" data-label={ui.meaning}>{risk.explanation}</p>
              <SourceIds ids={risk.evidence_reference_ids} label={ui.sources} locale={locale} />
            </div>
          ))}
        </div>
      </section>

      <section className="ai-research-panel ai-missing-panel" aria-labelledby="ai-missing-title">
        <PanelHeading eyebrow="04" id="ai-missing-title" title={ui.whatWeDoNotKnow} detail={ui.missingHelp} />
        {brief.missing_information.length > 0 ? (
          <ul className="ai-missing-list">{brief.missing_information.map((item) => <li key={item.key}><strong>{item.label}</strong><p>{missingInformationExplanation(item.key, item.explanation, locale)}</p><SourceIds ids={item.source_reference_ids} label={ui.sources} locale={locale} /></li>)}</ul>
        ) : <p className="ai-empty-line">{ui.noRecordedGaps}</p>}
      </section>

      <section className="ai-research-panel ai-checkpoint-panel" id="ai-research-checkpoints" aria-labelledby="ai-checkpoint-title">
        <PanelHeading eyebrow="05" id="ai-checkpoint-title" title={ui.checkpointAxis} detail={ui.checkpointHelp} />
        <ol className="ai-checkpoint-axis">
          {brief.checkpoints.map((checkpoint) => (
            <li className={checkpoint.state} key={checkpoint.day}>
              <span aria-hidden="true">{checkpoint.day}</span>
              <strong>{checkpoint.day} {checkpointUnit(checkpoint.day, locale)}</strong>
              <small>{checkpointLabel(checkpoint.state, locale)}</small>
            </li>
          ))}
        </ol>
      </section>

      <section className="ai-research-panel ai-brief-panel" aria-labelledby="ai-brief-title">
        <PanelHeading eyebrow="06" id="ai-brief-title" title={ui.shortBrief} detail={ui.shortBriefHelp} />
        <p className="ai-brief-summary">{brief.summary}</p>
        <div className="ai-brief-columns">
          <div><h4>{ui.whatWeKnow}</h4><ul>{brief.known_facts.map((fact) => <li key={fact.key}><strong>{fact.label}: {presentValue(fact.key, fact.value, locale)}</strong><span>{fact.interpretation}</span></li>)}</ul></div>
          <div><h4>{ui.statusConditions}</h4><ul>{brief.status_change_conditions.map((condition) => <li key={condition.key}><strong>{condition.label}</strong><span>{condition.explanation}</span></li>)}</ul></div>
        </div>
      </section>

      <section className="ai-research-panel ai-sources-panel" aria-labelledby="ai-sources-title">
        <PanelHeading eyebrow="07" id="ai-sources-title" title={ui.sources} detail={ui.sourcesHelp} />
        <ul className="ai-source-list">
          {brief.source_references.map((source) => (
            <li key={source.id}>
              <div><strong>{sourceReferenceLabel(source.id, locale, source.label)}</strong><span>{source.observed_at ? formatProductDateTime(source.observed_at, locale) : ui.noTimestamp}</span></div>
              <StatusBadge tone={source.completeness === "complete" ? "ready" : source.completeness === "partial" ? "partial" : "warning"}>{sourceCompleteness(source.completeness, locale)}</StatusBadge>
              {source.url && (source.url.startsWith("#")
                ? <ActionLink variant="tertiary" href={source.url}>{ui.openSource}</ActionLink>
                : <ExternalLinkAction variant="tertiary" href={source.url}>{ui.openSource}</ExternalLinkAction>)}
            </li>
          ))}
        </ul>
        <p className="ai-source-boundary">{ui.noExternalCalls}</p>
      </section>

      {!brief.render_preview && (
        <details className="ai-research-technical product-technical-details">
          <summary>{ui.technicalDetails}</summary>
          <dl className="ai-research-technical-grid product-technical-details-content">
            <div><dt>{ui.analysisId}</dt><dd><code>{brief.analysis_id}</code></dd></div>
            <div><dt>{ui.model}</dt><dd>{brief.model}</dd></div>
            <div><dt>{ui.promptVersion}</dt><dd>{brief.prompt_version}</dd></div>
            <div><dt>{ui.snapshotFingerprint}</dt><dd><code>{brief.snapshot_fingerprint}</code></dd></div>
            <div><dt>{ui.analysisTime}</dt><dd>{formatProductDateTime(brief.generated_at, locale)}</dd></div>
            <div><dt>{ui.dataTime}</dt><dd>{formatProductDateTime(brief.data_generated_at, locale)}</dd></div>
            <div><dt>{ui.latency}</dt><dd>{reviewMetrics ? `${reviewMetrics.latency_ms} ms` : ui.notRecorded}</dd></div>
            <div><dt>{ui.promptTokens}</dt><dd>{brief.token_usage.prompt_tokens}</dd></div>
            <div><dt>{ui.outputTokens}</dt><dd>{brief.token_usage.completion_tokens}</dd></div>
            <div><dt>{ui.totalTokens}</dt><dd>{brief.token_usage.total_tokens}</dd></div>
            <div><dt>{ui.cacheHit}</dt><dd>{reviewMetrics ? ui.no : ui.notRecorded}</dd></div>
            <div><dt>{ui.validationStatus}</dt><dd>{reviewMetrics?.validation_status ?? ui.notRecorded}</dd></div>
            {reviewMetrics?.request_id && <div><dt>{ui.requestId}</dt><dd><code>{reviewMetrics.request_id}</code></dd></div>}
          </dl>
        </details>
      )}

      <footer className="ai-research-boundary"><strong>{ui.researchBoundaryTitle}</strong><p>{ui.researchBoundary}</p></footer>
    </article>
  );
}

function AddressIdenticon({ address }: { address: string }) {
  const seed = [...address].reduce((value, character) => Math.imul(value ^ character.charCodeAt(0), 16777619), 2166136261) >>> 0;
  const cells = Array.from({ length: 25 }, (_, index) => {
    const row = Math.floor(index / 5);
    const column = index % 5;
    const mirrored = column > 2 ? 4 - column : column;
    const bit = (seed >>> ((row * 3 + mirrored) % 24)) & 1;
    return bit === 1;
  });
  return <span className="ai-identicon" aria-hidden="true" style={{ "--identicon-hue": String(seed % 90 + 145) } as React.CSSProperties}>{cells.map((filled, index) => <i className={filled ? "filled" : ""} key={index} />)}</span>;
}

function Kpi({ label, value, tone }: { label: string; value: string; tone: "neutral" | "accent" | "ready" | "partial" | "warning" | "not-ready" | "manual" | "critical" }) {
  return <div className={`ai-kpi ${tone}`}><span>{label}</span><strong>{value}</strong></div>;
}

function PanelHeading({ eyebrow, id, title, detail }: { eyebrow: string; id: string; title: string; detail: string }) {
  return <header className="ai-panel-heading"><span>{eyebrow}</span><div><h3 id={id}>{title}</h3><p>{detail}</p></div></header>;
}

function MapNode({ label, value, tone = "neutral" }: { label: string; value: string; tone?: string }) {
  return <li className={tone}><span>{label}</span><strong>{value}</strong></li>;
}

function ResearchAction({ action }: { action: AIResearchBrief["next_actions"][number] }) {
  const variant = action.priority;
  if (action.target_type === "external_url") return <ExternalLinkAction variant={variant} href={action.target_reference}>{action.label}</ExternalLinkAction>;
  if (action.target_type === "internal_route") return <ActionLink variant={variant} href={action.target_reference}>{action.label}</ActionLink>;
  return <ActionLink variant={variant} href="#ai-research-checkpoints">{action.label}</ActionLink>;
}

function SourceIds({ ids, label, locale }: { ids: string[]; label: string; locale: "pl" | "en" }) {
  return <span className="ai-source-ids" role="cell" data-label={label}>{ids.map((id) => sourceReferenceLabel(id, locale)).join(" · ")}</span>;
}

function presentValue(key: string, value: string | number | boolean | null, locale: "pl" | "en"): string {
  if (value === null) return locale === "pl" ? "Brak danych" : "No data";
  if (typeof value === "boolean") return value ? (locale === "pl" ? "Tak" : "Yes") : (locale === "pl" ? "Nie" : "No");
  if (typeof value === "number") {
    if (key.endsWith("_usd")) return formatProductUsd(value, locale, String(value));
    if (key === "volume_market_cap_ratio") return `${(value * 100).toFixed(2)}%`;
    if (key === "pair_age_days") return `${value} ${locale === "pl" ? "dni" : "days"}`;
    return String(value);
  }
  const labels: Record<string, [string, string]> = {
    new: ["New", "Nowe"], follow_up: ["Further observation", "Dalsza obserwacja"], candidate: ["Candidate for Established", "Kandydat do Established"], established: ["Main Radar", "Główny Radar"],
    FRESH: ["Current", "Aktualne"], DELAYED: ["Delayed", "Opóźnione"], STALE: ["Stale", "Nieaktualne"], UNKNOWN: ["Unavailable", "Niedostępne"], UNAVAILABLE: ["Unavailable", "Niedostępne"],
    passed_basic_filter: ["Filters met", "Filtry spełnione"], rejected_basic_filter: ["Filters not met", "Filtry niespełnione"], not_checked: ["Not checked", "Nie sprawdzono"],
  };
  return labels[value]?.[locale === "pl" ? 1 : 0] ?? value;
}

function lifecycleTone(value: string | number | boolean | null): "neutral" | "ready" | "accent" {
  if (value === "established") return "ready";
  if (value === "candidate") return "accent";
  return "neutral";
}

function filterAssessmentLabel(value: string | number | boolean | null, locale: "pl" | "en"): string {
  const labels: Record<string, [string, string]> = {
    passed_basic_filter: ["Sufficient", "Wystarczające"],
    rejected_basic_filter: ["Insufficient", "Niewystarczające"],
    not_checked: ["Unavailable", "Niedostępne"],
  };
  return labels[String(value)]?.[locale === "pl" ? 1 : 0] ?? (locale === "pl" ? "Niedostępne" : "Unavailable");
}

function stateLabel(value: AIResearchState, locale: "pl" | "en") {
  const labels: Record<AIResearchState, [string, string]> = {
    INSUFFICIENT_DATA: ["Insufficient data", "Niewystarczające dane"], BASIC_FILTERS_FAILED: ["Basic filters failed", "Filtry niespełnione"], KEEP_OBSERVING: ["Keep observing", "Kontynuuj obserwację"], MANUAL_VERIFICATION_REQUIRED: ["Manual verification required", "Wymagana ręczna weryfikacja"], OWNER_DECISION_REQUIRED: ["Owner decision required", "Wymagana decyzja właściciela"], ESTABLISHED_RESEARCH: ["Established research", "Analiza Established"], DATA_STALE: ["Data stale", "Dane nieaktualne"],
  };
  return labels[value][locale === "pl" ? 1 : 0];
}

function stateTone(value: AIResearchState): "neutral" | "ready" | "warning" | "manual" | "critical" {
  if (value === "ESTABLISHED_RESEARCH") return "ready";
  if (value === "BASIC_FILTERS_FAILED") return "critical";
  if (value === "OWNER_DECISION_REQUIRED" || value === "MANUAL_VERIFICATION_REQUIRED") return "manual";
  if (value === "DATA_STALE" || value === "INSUFFICIENT_DATA") return "warning";
  return "neutral";
}

function severityLabel(value: AIResearchRiskSeverity, locale: "pl" | "en") {
  const labels: Record<AIResearchRiskSeverity, [string, string]> = { low: ["Low", "Niskie"], medium: ["Medium", "Średnie"], high: ["High", "Wysokie"], unknown: ["Unknown", "Nieznane"] };
  return labels[value][locale === "pl" ? 1 : 0];
}

function severityTone(value: AIResearchRiskSeverity): "ready" | "warning" | "critical" | "partial" {
  return value === "low" ? "ready" : value === "medium" ? "warning" : value === "high" ? "critical" : "partial";
}

function coverageLabel(value: AIResearchCoverageState, locale: "pl" | "en") {
  const labels: Record<AIResearchCoverageState, [string, string]> = { sufficient: ["Sufficient", "Wystarczające"], partial: ["Partial", "Częściowe"], insufficient: ["Insufficient", "Niewystarczające"], unavailable: ["Unavailable", "Niedostępne"] };
  return labels[value][locale === "pl" ? 1 : 0];
}

function coverageTone(value: AIResearchCoverageState): "ready" | "partial" | "warning" {
  return value === "sufficient" ? "ready" : value === "partial" ? "partial" : "warning";
}

function coverageAreaLabel(value: AIResearchBrief["coverage"][number]["area"], locale: "pl" | "en") {
  const labels = { market_data: ["Market data", "Dane rynkowe"], basic_filters: ["Data for filter assessment", "Dane do oceny filtrów"], security_coverage: ["Security coverage", "Pokrycie bezpieczeństwa"], information_completeness: ["Information completeness", "Kompletność informacji"] } as const;
  return labels[value][locale === "pl" ? 1 : 0];
}

function sourceReferenceLabel(id: string, locale: "pl" | "en", fallback?: string): string {
  const labels: Record<string, [string, string]> = {
    basic_filters: ["Basic filters", "Podstawowe filtry"],
    security: ["Security status", "Status bezpieczeństwa"],
    security_status: ["Security status", "Status bezpieczeństwa"],
    scanner_snapshot: ["Scanner snapshot", "Migawka skanera"],
    lifecycle: ["Observation stage", "Etap obserwacji"],
    follow_up_checkpoints: ["Observation stage", "Etap obserwacji"],
    established_membership: ["Established membership", "Członkostwo w Established"],
    methodology: ["Product methodology", "Metodologia produktu"],
    dexscreener_link: ["DexScreener", "DexScreener"],
    explorer_link: ["Network explorer", "Eksplorator sieci"],
    current_report: ["Current report", "Aktualny raport"],
  };
  return labels[id]?.[locale === "pl" ? 1 : 0] ?? fallback ?? humanizeSourceId(id);
}

function humanizeSourceId(value: string): string {
  const normalized = value.replaceAll("_", " ").trim();
  return normalized ? `${normalized[0]!.toUpperCase()}${normalized.slice(1)}` : value;
}

function missingInformationExplanation(key: string, fallback: string, locale: "pl" | "en"): string {
  const labels: Record<string, [string, string]> = {
    security: ["The product does not have a contract security check result.", "Produkt nie posiada wyniku kontroli bezpieczeństwa kontraktu."],
    history: ["The token does not yet have enough history to compare changes across consecutive periods.", "Token nie posiada jeszcze historii pozwalającej porównać zmiany w kolejnych okresach."],
    next_checkpoint: ["The result of the next checkpoint has not been recorded yet.", "Nie zapisano jeszcze wyniku następnego punktu kontrolnego."],
    fresh_data: ["The latest snapshot is older than the allowed freshness limit.", "Ostatnia migawka jest starsza niż dopuszczalny limit świeżości."],
    source_verification: ["The project's identity and external data have not yet been confirmed manually.", "Tożsamość projektu i dane zewnętrzne nie zostały jeszcze potwierdzone ręcznie."],
  };
  return labels[key]?.[locale === "pl" ? 1 : 0] ?? fallback;
}

function checkpointLabel(value: AIResearchBrief["checkpoints"][number]["state"], locale: "pl" | "en") {
  const labels = { completed: ["Completed", "Ukończony"], current: ["Current", "Obecny"], future: ["Future", "Przyszły"], skipped: ["Data missing", "Brak danych"] } as const;
  return labels[value][locale === "pl" ? 1 : 0];
}

function checkpointUnit(day: number, locale: "pl" | "en") {
  if (locale === "pl") return day === 1 ? "dzień" : "dni";
  return day === 1 ? "day" : "days";
}

function sourceCompleteness(value: AIResearchBrief["source_references"][number]["completeness"], locale: "pl" | "en") {
  const labels = { complete: ["Complete", "Kompletne"], partial: ["Partial", "Częściowe"], unavailable: ["Unavailable", "Niedostępne"] } as const;
  return labels[value][locale === "pl" ? 1 : 0];
}

function shortAddress(value: string) { return value.length > 24 ? `${value.slice(0, 12)}…${value.slice(-10)}` : value; }

const COPY = {
  pl: {
    canvasEyebrow: "Visual Candidate Research Canvas", previewBadge: "Podgląd formatu — bez wywołania AI", dataTime: "Czas danych", analysisTime: "Czas analizy", kpiLabel: "Kluczowe wskaźniki analizy", researchStage: "Etap badawczy", freshness: "Świeżość danych", basicFilters: "Podstawowe filtry", securityCoverage: "Pokrycie bezpieczeństwa", missingAreas: "Brakujące obszary", nextCheckpoint: "Następny punkt kontrolny", notScheduled: "Nie zaplanowano", visualState: "Wizualny stan badawczy", visualStateHelp: "Cztery jakościowe obszary bez sztucznego wyniku procentowego.", whatsNext: "Co dalej", whatsNextHelp: "Sekwencja od aktualnego etapu do warunku ponownej oceny.", currentStage: "Aktualny etap", mainProblem: "Główny problem", nextAction: "Następna czynność", reassessmentCondition: "Warunek ponownej oceny", noRecordedProblem: "Brak zapisanej blokady", noAction: "Brak dostępnej czynności", noCondition: "Brak zapisanego warunku", staleAndFiltersFailed: "Dane nieaktualne i filtry niespełnione", waitForFreshSnapshot: "Poczekaj na świeżą migawkę", newDataAndFilterRecalculation: "Publikacja nowych danych i ponowne obliczenie filtrów", newDataPublished: "Publikacja nowych danych", riskMatrix: "Macierz ryzyk", riskHelp: "Brak danych pozostaje stanem nieznanym, nigdy niskim ryzykiem.", area: "Obszar", state: "Stan", meaning: "Znaczenie", sources: "Źródła", whatWeDoNotKnow: "Czego nadal nie wiemy", missingHelp: "Widoczne luki ograniczające dalszą ocenę.", noRecordedGaps: "Brak zapisanych luk w obszarach sprawdzanych przez produkt.", checkpointAxis: "Oś punktów kontrolnych", checkpointHelp: "Terminy ponownej oceny danych, nie automatycznej akceptacji.", shortBrief: "Krótki brief badawczy", shortBriefHelp: "Zwięzłe podsumowanie oparte wyłącznie na zapisanych danych.", whatWeKnow: "Co wiemy", statusConditions: "Co może zmienić aktualny status", sourcesHelp: "Katalog danych użytych do analizy.", noTimestamp: "Brak czasu", openSource: "Otwórz źródło", noExternalCalls: "Podczas tej analizy nie wykonano automatycznych zewnętrznych zapytań.", researchBoundaryTitle: "Granica badawcza", researchBoundary: "Analiza AI porządkuje dostępne dane i proponuje kolejny krok badawczy. Nie potwierdza bezpieczeństwa projektu i nie jest rekomendacją inwestycyjną.", unknown: "Nieznane", technicalDetails: "Szczegóły techniczne", analysisId: "ID analizy", model: "Model", promptVersion: "Wersja promptu", snapshotFingerprint: "Fingerprint snapshotu", latency: "Czas odpowiedzi", promptTokens: "Tokeny wejściowe", outputTokens: "Tokeny wyjściowe", totalTokens: "Tokeny łącznie", cacheHit: "Cache hit", validationStatus: "Walidacja", requestId: "Request ID", notRecorded: "Brak zapisu", no: "Nie",
  },
  en: {
    canvasEyebrow: "Visual Candidate Research Canvas", previewBadge: "Format preview — no AI call", dataTime: "Data time", analysisTime: "Analysis time", kpiLabel: "Key analysis indicators", researchStage: "Research stage", freshness: "Data freshness", basicFilters: "Basic filters", securityCoverage: "Security coverage", missingAreas: "Missing areas", nextCheckpoint: "Next checkpoint", notScheduled: "Not scheduled", visualState: "Visual research state", visualStateHelp: "Four qualitative areas without an artificial percentage score.", whatsNext: "What next", whatsNextHelp: "A sequence from the current stage to the reassessment condition.", currentStage: "Current stage", mainProblem: "Main problem", nextAction: "Next action", reassessmentCondition: "Reassessment condition", noRecordedProblem: "No recorded blocker", noAction: "No available action", noCondition: "No recorded condition", staleAndFiltersFailed: "Data is stale and filters are not met", waitForFreshSnapshot: "Wait for a fresh snapshot", newDataAndFilterRecalculation: "Publication of new data and recalculation of filters", newDataPublished: "Publication of new data", riskMatrix: "Risk matrix", riskHelp: "Missing data remains unknown and is never treated as low risk.", area: "Area", state: "State", meaning: "Meaning", sources: "Sources", whatWeDoNotKnow: "What we still do not know", missingHelp: "Visible gaps that limit further assessment.", noRecordedGaps: "No recorded gaps in areas checked by the product.", checkpointAxis: "Checkpoint timeline", checkpointHelp: "Data reassessment dates, not automatic acceptance.", shortBrief: "Short research brief", shortBriefHelp: "A concise summary based only on stored data.", whatWeKnow: "What we know", statusConditions: "What may change the current status", sourcesHelp: "Catalog of data used by the analysis.", noTimestamp: "No timestamp", openSource: "Open source", noExternalCalls: "No automated external requests were made during this analysis.", researchBoundaryTitle: "Research boundary", researchBoundary: "AI analysis organizes available data and proposes the next research step. It does not confirm project safety and is not investment advice.", unknown: "Unknown", technicalDetails: "Technical details", analysisId: "Analysis ID", model: "Model", promptVersion: "Prompt version", snapshotFingerprint: "Snapshot fingerprint", latency: "Latency", promptTokens: "Input tokens", outputTokens: "Output tokens", totalTokens: "Total tokens", cacheHit: "Cache hit", validationStatus: "Validation", requestId: "Request ID", notRecorded: "Not recorded", no: "No",
  },
} as const;
