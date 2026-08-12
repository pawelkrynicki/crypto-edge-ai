import React from "react";
import { formatProductDateTime, useProductLocale } from "../productI18n";
import type { AIProductionAnalysis, AIProductionInsight, AIProductionResearchGuidance, AIProductionResearchStep } from "../types/aiProductionTypes";
import { ActionLink, ExternalLinkAction, StatusBadge } from "./ProductUi";

void React;

/** CAMP-safe canvas backed by one stored bilingual PC.2 analysis, never a locale-triggered provider call. */
export function AIProductionAnalysisCanvas({ analysis }: { analysis: AIProductionAnalysis }) {
  const { locale } = useProductLocale();
  const pl = locale === "pl";
  const headings = pl ? {
    eyebrow: "ANALIZA AI", title: "Podsumowanie", summary: "CO Z TEGO WYNIKA TERAZ", findings: "NAJWAŻNIEJSZE POTWIERDZONE INFORMACJE", risks: "RYZYKA", missing: "NAJWAŻNIEJSZE BRAKI W DANYCH",
    context: "KONTEKST DANYCH", next: "NASTĘPNE KROKI RESEARCHU", reassessment: "KIEDY WARTO WRÓCIĆ DO ANALIZY", evidence: "ŹRÓDŁA I DOWODY", market: "Rynek", security: "Bezpieczeństwo", liquidity: "Płynność", holders: "Holderzy",
    generated: "Przygotowano", snapshot: "Migawka danych", fresh: "Świeża", stale: "Wymaga odświeżenia", empty: "Brak dodatkowych danych w tej migawce.", boundary: "Analiza opiera się wyłącznie na zapisanych danych i służy do researchu, nie stanowi rekomendacji inwestycyjnej.",
    guidance: "ETAP RESEARCHU", posture: "STAN RESEARCHU", blockers: "CO BLOKUJE DALSZY RESEARCH", actions: "CO ZROBIĆ TERAZ", unlocks: "CO ODBLOKUJE KOLEJNY ETAP", why: "Dlaczego", resolves: "Co to rozstrzygnie", filterFailures: "DOKŁADNE WYNIKI FILTRÓW", details: "SZCZEGÓŁY ANALIZY",
  } : {
    eyebrow: "AI ANALYSIS", title: "Summary", summary: "WHAT THIS MEANS NOW", findings: "KEY CONFIRMED FINDINGS", risks: "RISKS", missing: "HIGHEST-IMPACT DATA GAPS",
    context: "DATA CONTEXT", next: "NEXT RESEARCH STEPS", reassessment: "WHEN TO REVISIT THE ANALYSIS", evidence: "SOURCES AND EVIDENCE", market: "Market", security: "Security", liquidity: "Liquidity", holders: "Holders",
    generated: "Generated", snapshot: "Data snapshot", fresh: "Fresh", stale: "Refreshing", empty: "No additional data in this snapshot.", boundary: "This analysis uses recorded data only and is for research, not investment advice.",
    guidance: "RESEARCH STAGE", posture: "RESEARCH POSTURE", blockers: "WHAT BLOCKS FURTHER RESEARCH", actions: "WHAT TO DO NOW", unlocks: "WHAT UNLOCKS THE NEXT STAGE", why: "Why", resolves: "What this check should resolve", filterFailures: "EXACT FILTER RESULTS", details: "ANALYSIS DETAILS",
  };
  return (
    <article className="ai-research-canvas ai-production-analysis" aria-labelledby="ai-production-analysis-title">
      <header className="ai-research-header ai-production-header">
        <div className="ai-research-header-copy">
          <span className="ai-research-eyebrow">{headings.eyebrow}</span>
          <h3 id="ai-production-analysis-title">{headings.title}</h3>
        </div>
        <dl className="ai-research-times">
          <div><dt>{headings.snapshot}</dt><dd>{formatProductDateTime(analysis.data_snapshot_at, locale)}</dd></div>
          <div><dt>{headings.generated}</dt><dd>{formatProductDateTime(analysis.generated_at, locale)}</dd></div>
        </dl>
      </header>

      <ResearchGuidancePanel guidance={analysis.research_guidance} locale={locale} headings={headings} />

      <details className="ai-production-details">
        <summary>{headings.details}</summary>
        <div className="ai-production-details-content">
          <section className="ai-production-summary" aria-labelledby="ai-production-summary-title">
            <h4 id="ai-production-summary-title">{headings.summary}</h4>
            <p>{analysis.analysis_summary}</p>
          </section>

          <section className="ai-research-panel ai-production-context" aria-labelledby="ai-production-context-title">
            <h3 id="ai-production-context-title">{headings.context}</h3>
            <div className="ai-research-kpis" aria-label={headings.context}>
              <ContextCard label={headings.market} insight={analysis.market_context} />
              <ContextCard label={headings.security} insight={analysis.security_context} />
              <ContextCard label={headings.liquidity} insight={analysis.liquidity_context} />
              <ContextCard label={headings.holders} insight={analysis.holder_context} />
            </div>
            <p className="ai-production-freshness">{headings.snapshot}: {analysis.freshness === "FRESH" ? headings.fresh : headings.stale}</p>
          </section>

          <div className="ai-brief-columns ai-production-insight-columns">
            <InsightList title={headings.findings} items={analysis.confirmed_findings} empty={headings.empty} />
            <InsightList title={headings.missing} items={analysis.missing_data} empty={headings.empty} />
          </div>

          <section className="ai-research-panel ai-risk-panel" aria-labelledby="ai-production-risks">
            <h3 id="ai-production-risks">{headings.risks}</h3>
            {analysis.risks.length === 0 ? <p>{headings.empty}</p> : <ul className="ai-missing-list">{analysis.risks.map((risk, index) => (
              <li key={`${risk.title}-${index}`}><strong>{risk.title} <StatusBadge tone={risk.severity === "high" ? "critical" : risk.severity === "medium" ? "warning" : "partial"}>{riskSeverityLabel(risk.severity, locale)}</StatusBadge></strong><p>{risk.detail}</p></li>
            ))}</ul>}
          </section>

          <ResearchSteps title={headings.next} items={analysis.next_research_steps} empty={headings.empty} />
          <InsightList title={headings.reassessment} items={analysis.reassessment_signals} empty={headings.empty} />

          <section className="ai-research-panel ai-sources-panel" aria-labelledby="ai-production-evidence">
            <h3 id="ai-production-evidence">{headings.evidence}</h3>
            <ul className="ai-source-list">{analysis.evidence.map((item, index) => (
              <li key={`${item.label}-${index}`}><div><strong>{item.label}</strong><span>{item.observed_at ? formatProductDateTime(item.observed_at, locale) : headings.empty}</span></div>
                <StatusBadge tone={item.completeness === "complete" ? "ready" : "warning"}>{completenessLabel(item.completeness, locale)}</StatusBadge>
                {item.url && <ExternalLinkAction variant="tertiary" href={item.url}>{pl ? "Otwórz źródło" : "Open source"}</ExternalLinkAction>}
              </li>
            ))}</ul>
          </section>
        </div>
      </details>
      <footer className="ai-production-boundary">{headings.boundary}</footer>
    </article>
  );
}

function ContextCard({ label, insight }: { label: string; insight: AIProductionInsight }) {
  return <div className="ai-kpi neutral"><span>{label}</span><strong>{insight.title}</strong><p>{insight.detail}</p></div>;
}

function InsightList({ title, items, empty }: { title: string; items: AIProductionInsight[]; empty: string }) {
  return <section className="ai-research-panel ai-brief-panel"><h3>{title}</h3>{items.length === 0 ? <p>{empty}</p> : <ul>{items.map((item, index) => <li key={`${item.title}-${index}`}><strong>{item.title}</strong><span>{item.detail}</span></li>)}</ul>}</section>;
}

function ResearchSteps({ title, items, empty }: { title: string; items: AIProductionResearchStep[]; empty: string }) {
  return <section className="ai-research-panel ai-production-steps"><h3>{title}</h3>{items.length === 0 ? <p>{empty}</p> : <ol>{items.map((item, index) => <li key={`${item.title}-${index}`}><strong>{item.title}</strong><span>{item.detail}</span></li>)}</ol>}</section>;
}

function ResearchGuidancePanel({
  guidance,
  locale,
  headings,
}: {
  guidance: AIProductionResearchGuidance;
  locale: "pl" | "en";
  headings: {
    guidance: string; posture: string; blockers: string; actions: string; unlocks: string; why: string; resolves: string; filterFailures: string;
  };
}) {
  const pl = locale === "pl";
  return <section className="ai-research-guidance" aria-labelledby="ai-research-guidance-title">
    <header>
      <span>{headings.guidance}</span>
      <h4 id="ai-research-guidance-title">{pl ? "Krok" : "Step"} {guidance.current_step.number}/7 — {guidance.current_step.title}</h4>
      <dl><dt>{headings.posture}</dt><dd>{guidance.current_step.posture}</dd></dl>
    </header>
    <div className="ai-guidance-grid">
      <section aria-labelledby="ai-research-guidance-blockers">
        <h5 id="ai-research-guidance-blockers">{headings.blockers}</h5>
        <ul className="ai-guidance-blockers">{guidance.blockers.map((item, index) => <li key={`${item.title}-${index}`}><strong>{item.title}</strong><span>{item.detail}</span></li>)}</ul>
        {guidance.filter_failures.length > 0 && <div className="ai-guidance-filter-failures">
          <h6>{headings.filterFailures}</h6>
          <ul>{guidance.filter_failures.map((item, index) => <li key={`${item.label}-${index}`}>
            <strong>{item.label}</strong><span>{item.value}</span><span>{item.requirement}</span><em>{item.status}</em>
          </li>)}</ul>
        </div>}
      </section>
      <section aria-labelledby="ai-research-guidance-actions">
        <h5 id="ai-research-guidance-actions">{headings.actions}</h5>
        <ol className="ai-guidance-actions">{guidance.actions.map((item, index) => <li key={`${item.title}-${index}`}>
          <div className="ai-guidance-action-number" aria-hidden="true">{index + 1}</div>
          <div className="ai-guidance-action-copy"><strong>{item.title}</strong><p><b>{headings.why}:</b> {item.why}</p><p><b>{headings.resolves}:</b> {item.resolves}</p>
            {item.cta && (item.cta.external
              ? <ExternalLinkAction variant="secondary" href={item.cta.href}>{item.cta.label}</ExternalLinkAction>
              : <ActionLink variant="secondary" href={item.cta.href}>{item.cta.label}</ActionLink>)}
          </div>
        </li>)}</ol>
      </section>
    </div>
    <section className="ai-guidance-unlocks" aria-labelledby="ai-research-guidance-unlocks">
      <h5 id="ai-research-guidance-unlocks">{headings.unlocks}</h5>
      <ul>{guidance.unlock_conditions.map((condition, index) => <li key={`${condition}-${index}`}>{condition}</li>)}</ul>
    </section>
  </section>;
}

function riskSeverityLabel(value: AIProductionAnalysis["risks"][number]["severity"], locale: "pl" | "en") {
  const labels = { low: ["Niskie", "Low"], medium: ["Średnie", "Medium"], high: ["Wysokie", "High"], unknown: ["Do weryfikacji", "Needs review"] } as const;
  return labels[value][locale === "pl" ? 0 : 1];
}

function completenessLabel(value: AIProductionAnalysis["evidence"][number]["completeness"], locale: "pl" | "en") {
  const labels = { complete: ["Kompletność źródła: pełna", "Source completeness: complete"], partial: ["Kompletność źródła: częściowa", "Source completeness: partial"], unavailable: ["Kompletność źródła: niedostępna", "Source completeness: unavailable"] } as const;
  return labels[value][locale === "pl" ? 0 : 1];
}
