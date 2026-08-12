import React from "react";
import { formatProductDateTime, useProductLocale } from "../productI18n";
import type { AIProductionAnalysis, AIProductionInsight, AIProductionResearchStep } from "../types/aiProductionTypes";
import { ExternalLinkAction, StatusBadge } from "./ProductUi";

void React;

/** CAMP-safe canvas backed by one stored bilingual PC.2 analysis, never a locale-triggered provider call. */
export function AIProductionAnalysisCanvas({ analysis }: { analysis: AIProductionAnalysis }) {
  const { locale } = useProductLocale();
  const pl = locale === "pl";
  const headings = pl ? {
    eyebrow: "ANALIZA AI", title: "Podsumowanie", summary: "CO Z TEGO WYNIKA TERAZ", findings: "NAJWAŻNIEJSZE POTWIERDZONE INFORMACJE", risks: "RYZYKA", missing: "NAJWAŻNIEJSZE BRAKI W DANYCH",
    context: "KONTEKST DANYCH", next: "NASTĘPNE KROKI RESEARCHU", reassessment: "KIEDY WARTO WRÓCIĆ DO ANALIZY", evidence: "ŹRÓDŁA I DOWODY", market: "Rynek", security: "Bezpieczeństwo", liquidity: "Płynność", holders: "Holderzy",
    generated: "Przygotowano", snapshot: "Migawka danych", fresh: "Świeża", stale: "Wymaga odświeżenia", empty: "Brak dodatkowych danych w tej migawce.", boundary: "Analiza opiera się wyłącznie na zapisanych danych i służy do researchu, nie stanowi rekomendacji inwestycyjnej.",
  } : {
    eyebrow: "AI ANALYSIS", title: "Summary", summary: "WHAT THIS MEANS NOW", findings: "KEY CONFIRMED FINDINGS", risks: "RISKS", missing: "HIGHEST-IMPACT DATA GAPS",
    context: "DATA CONTEXT", next: "NEXT RESEARCH STEPS", reassessment: "WHEN TO REVISIT THE ANALYSIS", evidence: "SOURCES AND EVIDENCE", market: "Market", security: "Security", liquidity: "Liquidity", holders: "Holders",
    generated: "Generated", snapshot: "Data snapshot", fresh: "Fresh", stale: "Refreshing", empty: "No additional data in this snapshot.", boundary: "This analysis uses recorded data only and is for research, not investment advice.",
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

function riskSeverityLabel(value: AIProductionAnalysis["risks"][number]["severity"], locale: "pl" | "en") {
  const labels = { low: ["Niskie", "Low"], medium: ["Średnie", "Medium"], high: ["Wysokie", "High"], unknown: ["Do weryfikacji", "Needs review"] } as const;
  return labels[value][locale === "pl" ? 0 : 1];
}

function completenessLabel(value: AIProductionAnalysis["evidence"][number]["completeness"], locale: "pl" | "en") {
  const labels = { complete: ["Kompletność źródła: pełna", "Source completeness: complete"], partial: ["Kompletność źródła: częściowa", "Source completeness: partial"], unavailable: ["Kompletność źródła: niedostępna", "Source completeness: unavailable"] } as const;
  return labels[value][locale === "pl" ? 0 : 1];
}
