import React from "react";
import { formatProductDateTime, useProductLocale } from "../productI18n";
import type { AIProductionAnalysis } from "../types/aiProductionTypes";
import { ExternalLinkAction, StatusBadge } from "./ProductUi";

void React;

/** CAMP-safe structured result canvas. It only consumes the PC.2 public analysis contract. */
export function AIProductionAnalysisCanvas({ analysis }: { analysis: AIProductionAnalysis }) {
  const { locale } = useProductLocale();
  const pl = locale === "pl";
  const headings = pl ? {
    summary: "Podsumowanie analizy", strengths: "Mocne strony", risks: "Ryzyka", missing: "Brakujące dane",
    context: "Kontekst danych", watch: "Elementy do obserwacji", evidence: "Źródła i dowody",
    market: "Rynek", security: "Bezpieczeństwo", liquidity: "Płynność", holders: "Holderzy",
    generated: "Przygotowano", snapshot: "Migawka danych", fresh: "Świeża", stale: "Wymaga odświeżenia",
    empty: "Brak dodatkowych pozycji.",
  } : {
    summary: "Analysis summary", strengths: "Strengths", risks: "Risks", missing: "Missing data",
    context: "Data context", watch: "Watch items", evidence: "Sources and evidence",
    market: "Market", security: "Security", liquidity: "Liquidity", holders: "Holders",
    generated: "Generated", snapshot: "Data snapshot", fresh: "Fresh", stale: "Refreshing",
    empty: "No additional items.",
  };
  return (
    <article className="ai-research-canvas ai-production-analysis" aria-labelledby="ai-production-analysis-title">
      <header className="ai-research-header">
        <div className="ai-research-header-copy">
          <span className="ai-research-eyebrow">{headings.summary}</span>
          <h3 id="ai-production-analysis-title">{headings.summary}</h3>
        </div>
        <dl className="ai-research-times">
          <div><dt>{headings.snapshot}</dt><dd>{formatProductDateTime(analysis.data_snapshot_at, locale)}</dd></div>
          <div><dt>{headings.generated}</dt><dd>{formatProductDateTime(analysis.generated_at, locale)}</dd></div>
        </dl>
      </header>
      <p className="ai-brief-summary">{analysis.analysis_summary}</p>
      <div className="ai-research-kpis" aria-label={headings.context}>
        <Kpi label={headings.market} value={analysis.market_context} />
        <Kpi label={headings.security} value={analysis.security_context} />
        <Kpi label={headings.liquidity} value={analysis.liquidity_context} />
        <Kpi label={headings.holders} value={analysis.holder_context} />
        <Kpi label={headings.snapshot} value={analysis.freshness === "FRESH" ? headings.fresh : headings.stale} />
      </div>
      <div className="ai-brief-columns">
        <ListSection title={headings.strengths} items={analysis.strengths} empty={headings.empty} />
        <ListSection title={headings.missing} items={analysis.missing_data} empty={headings.empty} />
      </div>
      <section className="ai-research-panel ai-risk-panel" aria-labelledby="ai-production-risks">
        <h3 id="ai-production-risks">{headings.risks}</h3>
        {analysis.risks.length === 0 ? <p>{headings.empty}</p> : <ul className="ai-missing-list">{analysis.risks.map((risk, index) => (
          <li key={`${risk.title}-${index}`}><strong>{risk.title} <StatusBadge tone={risk.severity === "high" ? "critical" : risk.severity === "medium" ? "warning" : "partial"}>{risk.severity}</StatusBadge></strong><p>{risk.detail}</p></li>
        ))}</ul>}
      </section>
      <ListSection title={headings.watch} items={analysis.watch_items} empty={headings.empty} />
      <section className="ai-research-panel ai-sources-panel" aria-labelledby="ai-production-evidence">
        <h3 id="ai-production-evidence">{headings.evidence}</h3>
        <ul className="ai-source-list">{analysis.evidence.map((item, index) => (
          <li key={`${item.label}-${index}`}><div><strong>{item.label}</strong><span>{item.observed_at ? formatProductDateTime(item.observed_at, locale) : headings.empty}</span></div>
            <StatusBadge tone={item.completeness === "complete" ? "ready" : "warning"}>{item.completeness}</StatusBadge>
            {item.url && <ExternalLinkAction variant="tertiary" href={item.url}>{pl ? "Otwórz źródło" : "Open source"}</ExternalLinkAction>}
          </li>
        ))}</ul>
      </section>
    </article>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return <div className="ai-kpi neutral"><span>{label}</span><strong>{value}</strong></div>;
}

function ListSection({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return <section className="ai-research-panel ai-brief-panel"><h3>{title}</h3>{items.length === 0 ? <p>{empty}</p> : <ul>{items.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul>}</section>;
}
