import React from "react";
import { useProductLocale } from "../productI18n";
import { ProductIcon } from "./ProductUi";

export const Methodology: React.FC = () => {
  const { locale, t } = useProductLocale();
  const ui = METHODOLOGY_UI_COPY[locale];
  const filters = [
    t("filter.marketCapRange"),
    t("filter.volumeMinimum"),
    t("filter.liquidityMinimum"),
    t("filter.ratioRange"),
    t("filter.pairAgeMinimum"),
  ];

  return (
    <div className="product-methodology">
      <section className="methodology-lead">
        <span className="candidate-results-eyebrow">{t("method.eyebrow")}</span>
        <h3>{t("method.title")}</h3>
        <p>{t("method.intro")}</p>
      </section>

      <nav className="methodology-toc" aria-label={ui.contents}>
        <strong>{ui.contents}</strong>
        <div>{ui.links.map((link) => (
          <a key={link.id} href={`#${link.id}`}>
            <ProductIcon name="arrow" />
            <span>{link.label}</span>
          </a>
        ))}</div>
      </nav>

      <section className="methodology-document-section" id="method-lifecycle" aria-labelledby="method-lifecycle-heading">
        <header><span>01</span><div><h3 id="method-lifecycle-heading">{ui.lifecycle}</h3><p>{ui.lifecycleHelp}</p></div></header>
        <div className="methodology-baskets">
        <article>
          <span>01</span>
          <h4>{t("method.newTitle")}</h4>
          <p>{t("method.newDetail")}</p>
        </article>
        <article>
          <span>02</span>
          <h4>{t("method.followUpTitle")}</h4>
          <p>{t("method.followUpDetail")}</p>
        </article>
        <article>
          <span>03</span>
          <h4>{t("method.establishedTitle")}</h4>
          <p>{t("method.establishedDetail")}</p>
        </article>
        </div>
      </section>

      <section className="methodology-document-section" id="method-sources" aria-labelledby="method-sources-heading">
        <header><span>02</span><div><h3 id="method-sources-heading">{t("method.sources")}</h3><p>{ui.sourcesHelp}</p></div></header>
        <article className="methodology-definition">
          <h4>{t("method.sources")}</h4>
          <p>{t("method.sourcesDetail")}</p>
        </article>
      </section>

      <section className="methodology-document-section" id="method-filters" aria-labelledby="method-filters-heading">
        <header><span>03</span><div><h3 id="method-filters-heading">{t("method.filters")}</h3><p>{ui.filtersHelp}</p></div></header>
        <article className="methodology-definition">
          <h4>{t("method.filters")}</h4>
          <ul>{filters.map((filter) => <li key={filter}>{filter}</li>)}</ul>
        </article>
      </section>

      <section className="methodology-document-section" id="method-security" aria-labelledby="method-security-heading">
        <header><span>04</span><div><h3 id="method-security-heading">{ui.security}</h3><p>{ui.securityHelp}</p></div></header>
        <article className="methodology-notice"><strong>{ui.manualBoundary}</strong><p>{ui.manualBoundaryHelp}</p></article>
      </section>

      <section className="methodology-document-section" id="method-statuses" aria-labelledby="method-statuses-heading">
        <header><span>05</span><div><h3 id="method-statuses-heading">{ui.statuses}</h3><p>{ui.statusesHelp}</p></div></header>
        <div className="methodology-grid">
          <article>
            <h4>{t("method.watchlist")}</h4>
            <p>{t("method.watchlistDetail")}</p>
          </article>
          <article>
            <h4>{ui.candidateEstablished}</h4>
            <p>{t("method.followUpDetail")}</p>
          </article>
          <article>
            <h4>{t("method.missingData")}</h4>
            <p>{t("method.missingDataDetail")}</p>
          </article>
        </div>
      </section>

      <section className="methodology-document-section methodology-limitations" id="method-limitations" aria-labelledby="method-limitations-heading">
        <header><span>06</span><div><h3 id="method-limitations-heading">{t("method.limitations")}</h3><p>{ui.limitationsHelp}</p></div></header>
        <ul>
          <li>{t("method.limitationManual")}</li>
          <li>{t("method.limitationStale")}</li>
          <li>{t("method.limitationAutomation")}</li>
          <li>{t("method.limitationUniverse")}</li>
        </ul>
        <article className="methodology-research-boundary">
          <strong>{ui.researchOnly}</strong>
          <p>{ui.researchOnlyHelp}</p>
        </article>
      </section>
    </div>
  );
};

const METHODOLOGY_UI_COPY = {
  pl: {
    contents: "Na tej stronie",
    links: [
      { id: "method-lifecycle", label: "Cykl obserwacji" },
      { id: "method-sources", label: "Źródła i aktualność" },
      { id: "method-filters", label: "Filtry" },
      { id: "method-security", label: "Granica bezpieczeństwa" },
      { id: "method-statuses", label: "Znaczenie statusów" },
      { id: "method-limitations", label: "Ograniczenia" },
    ],
    lifecycle: "Trzy warstwy obserwacji",
    lifecycleHelp: "Każda warstwa opisuje inny poziom obserwacji, nie poziom bezpieczeństwa.",
    sourcesHelp: "Radar pokazuje aktualność opublikowanej migawki. Otwarcie widoku nie uruchamia nowego zbierania danych.",
    filtersHelp: "Progi pozostają zamrożone; ich niespełnienie jest prezentowane bez zmiany logiki.",
    security: "Granica bezpieczeństwa",
    securityHelp: "Automatyczna kontrola ma ograniczony zakres i nie zastępuje ręcznej weryfikacji.",
    manualBoundary: "Brak alarmu nie oznacza bezpieczeństwa",
    manualBoundaryHelp: "GoPlus dotyczy wyłącznie kwalifikujących się rekordów Established. Honeypot.is nie uruchamia się automatycznie.",
    statuses: "WATCHLIST i Kandydat do Established",
    statusesHelp: "Oba statusy organizują ręczną pracę badawczą i nie są rekomendacją.",
    candidateEstablished: "Kandydat do Established",
    limitationsHelp: "Najważniejsze ograniczenia pozostają widoczne przed udostępnieniem wyników.",
    researchOnly: "Wyłącznie materiał badawczy",
    researchOnlyHelp: "Radar nie zatwierdza aktywów, nie wykonuje transakcji i nie udziela rekomendacji inwestycyjnych.",
  },
  en: {
    contents: "On this page",
    links: [
      { id: "method-lifecycle", label: "Lifecycle" },
      { id: "method-sources", label: "Sources and freshness" },
      { id: "method-filters", label: "Filters" },
      { id: "method-security", label: "Security boundary" },
      { id: "method-statuses", label: "Status meaning" },
      { id: "method-limitations", label: "Limitations" },
    ],
    lifecycle: "Three lifecycle layers",
    lifecycleHelp: "Each layer describes a different observation stage, not a safety level.",
    sourcesHelp: "Radar shows the freshness of published snapshots. Opening the view does not start new data collection.",
    filtersHelp: "Thresholds remain frozen; unmet conditions are presented without changing filter logic.",
    security: "Security boundary",
    securityHelp: "Automated checks have limited scope and do not replace manual verification.",
    manualBoundary: "No alert does not mean safe",
    manualBoundaryHelp: "GoPlus applies only to qualifying Established records. Honeypot.is is not run automatically.",
    statuses: "WATCHLIST and Candidate for Established",
    statusesHelp: "Both statuses organize manual research work and are not recommendations.",
    candidateEstablished: "Candidate for Established",
    limitationsHelp: "Key limitations remain visible before research results are shared.",
    researchOnly: "Research material only",
    researchOnlyHelp: "Radar does not approve assets, execute trades or provide investment recommendations.",
  },
} as const;
