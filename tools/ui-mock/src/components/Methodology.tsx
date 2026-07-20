import React from "react";
import { useProductLocale } from "../productI18n";

export const Methodology: React.FC = () => {
  const { t } = useProductLocale();
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

      <section className="methodology-baskets">
        <article>
          <span>01</span>
          <h4>{t("method.newTitle")}</h4>
          <p>{t("method.newDetail")}</p>
        </article>
        <article>
          <span>02</span>
          <h4>{t("method.establishedTitle")}</h4>
          <p>{t("method.establishedDetail")}</p>
        </article>
      </section>

      <section className="methodology-grid">
        <article>
          <h4>{t("method.sources")}</h4>
          <p>{t("method.sourcesDetail")}</p>
        </article>
        <article>
          <h4>{t("method.filters")}</h4>
          <ul>{filters.map((filter) => <li key={filter}>{filter}</li>)}</ul>
        </article>
        <article>
          <h4>{t("method.watchlist")}</h4>
          <p>{t("method.watchlistDetail")}</p>
        </article>
        <article>
          <h4>{t("method.missingData")}</h4>
          <p>{t("method.missingDataDetail")}</p>
        </article>
      </section>

      <section className="methodology-limitations">
        <h4>{t("method.limitations")}</h4>
        <ul>
          <li>{t("method.limitationManual")}</li>
          <li>{t("method.limitationStale")}</li>
          <li>{t("method.limitationAutomation")}</li>
          <li>{t("method.limitationUniverse")}</li>
        </ul>
      </section>
    </div>
  );
};
