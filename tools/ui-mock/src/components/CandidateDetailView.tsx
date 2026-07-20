import React from "react";
import {
  formatProductDateTime,
  formatProductUsd,
  useProductLocale,
  type ProductLocale,
} from "../productI18n";
import { formatFilterReason } from "../productPresentation";
import type { UiTokenCandidate } from "../types/scannerTypes";

interface CandidateDetailViewProps {
  candidate: UiTokenCandidate | null;
  onBackToResults?: () => void;
  onOpenExternalChecks?: (candidate: UiTokenCandidate) => void;
}

export const CandidateDetailView: React.FC<CandidateDetailViewProps> = ({
  candidate,
  onBackToResults,
  onOpenExternalChecks,
}) => {
  const { locale, t } = useProductLocale();
  if (!candidate) {
    return (
      <section className="candidate-detail-empty product-detail-empty">
        <span className="candidate-detail-eyebrow">{t("detail.eyebrow")}</span>
        <h3>{t("detail.noneTitle")}</h3>
        <p>{t("detail.noneDetail")}</p>
        {onBackToResults && <button type="button" className="candidate-detail-secondary-button" onClick={onBackToResults}>{t("detail.back")}</button>}
      </section>
    );
  }

  const basketLabel = candidate.discoveryBasket === "established"
    ? "Established"
    : locale === "pl" ? "Nowe / Emerging" : "New / Emerging";
  const status = getCandidateStatus(candidate, locale);
  const failedFilters = candidate.filterReasons.map((reason) => formatFilterReason(reason, locale));
  const filterSummary = candidate.basicFilterStatus === "passed_basic_filter"
    ? t("detail.filterPassedSummary")
    : t("detail.filterRejectedSummary");
  const basicFilters = [
    { text: t("filter.marketCapRange"), keyword: "market cap" },
    { text: t("filter.volumeMinimum"), keyword: "volume" },
    { text: t("filter.liquidityMinimum"), keyword: "liquidity" },
    { text: t("filter.ratioRange"), keyword: "ratio" },
    { text: t("filter.pairAgeMinimum"), keyword: "pair age" },
  ];

  return (
    <div className="candidate-detail-view product-candidate-detail">
      <section className="candidate-detail-hero">
        <div className="candidate-detail-hero-copy">
          <span className="candidate-detail-eyebrow">{basketLabel}</span>
          <h3>{candidate.symbol} <small>{candidate.name}</small></h3>
          <div className="candidate-detail-token-line">
            <strong>{status}</strong>
            <span>{candidate.chain || t("detail.networkMissing")}</span>
            <span>{candidate.dex || t("detail.dexMissing")}</span>
            <span>{candidate.source}</span>
            <span>{formatProductDateTime(candidate.lastCheckedAt, locale)}</span>
          </div>
        </div>
        <div className="candidate-detail-boundary">
          <strong>{candidate.observationOnly ? t("detail.boundaryObservation") : t("detail.boundaryManual")}</strong>
          <span>{t("detail.boundaryText")}</span>
        </div>
      </section>

      <section className="product-detail-section" aria-labelledby="identity-heading">
        <SectionHeader id="identity-heading" index="1" title={t("detail.identity")} />
        <div className="product-detail-grid">
          <DetailField label={t("detail.contract")} value={candidate.contractAddress || t("radar.missingData")} copyValue={candidate.contractAddress} mono />
          <DetailField label={t("detail.pairAddress")} value={candidate.pairAddress || t("radar.missingData")} copyValue={candidate.pairAddress} mono />
          <DetailField label={t("detail.chain")} value={candidate.chain || t("radar.missingData")} />
          <DetailField label={t("detail.addressIdentity")} value={candidate.addressIdentityVerified ? t("radar.verified") : t("detail.unverified")} tone={candidate.addressIdentityVerified ? "ready" : "warning"} />
          <DetailField label={t("detail.universeVersion")} value={candidate.discoveryBasket === "established" ? candidate.universeVersion ?? t("radar.missingData") : t("detail.notApplicable")} />
          <DetailField label={t("detail.discoveryMethod")} value={formatDiscoveryMethod(candidate.discoveryMethod, locale)} />
          <DetailField label={t("detail.runId")} value={candidate.runId} mono />
          <DetailField label={t("detail.universeEntry")} value={candidate.universeEntryIndex == null ? t("detail.notApplicable") : String(candidate.universeEntryIndex)} />
        </div>
      </section>

      <section className="product-detail-section" aria-labelledby="market-heading">
        <SectionHeader id="market-heading" index="2" title={t("detail.marketData")} />
        <div className="product-detail-grid market">
          <DetailField label={t("radar.price")} value={formatPrice(candidate.priceUsd, t("radar.missingData"))} />
          <DetailField label={t("radar.marketCap")} value={formatProductUsd(candidate.marketCap, locale, t("radar.missingData"))} />
          <DetailField label={t("detail.fdv")} value={formatProductUsd(candidate.fdvUsd, locale, t("radar.missingData"))} />
          <DetailField label={t("radar.liquidity")} value={formatProductUsd(candidate.liquidity, locale, t("radar.missingData"))} />
          <DetailField label={t("radar.volume24h")} value={formatProductUsd(candidate.volume24h, locale, t("radar.missingData"))} />
          <DetailField label={t("radar.ratio")} value={candidate.volumeMarketCapRatio == null ? t("radar.missingData") : candidate.volumeMarketCapRatio.toFixed(4)} />
          <DetailField label={t("radar.pairAge")} value={formatDays(candidate.pairAgeDays, locale, t("radar.missingData"))} />
          <DetailField label={t("detail.pairCreated")} value={candidate.pairCreatedAt ? formatProductDateTime(candidate.pairCreatedAt, locale) : t("radar.missingData")} />
        </div>
      </section>

      <section className="product-detail-section" aria-labelledby="filters-heading">
        <SectionHeader id="filters-heading" index="3" title={t("detail.filters")} />
        <div className="product-filter-summary">
          <DetailField
            label={t("detail.status")}
            value={candidate.basicFilterStatus === "passed_basic_filter" ? t("detail.conditionsMet") : t("detail.conditionsNotMet")}
            tone={candidate.basicFilterStatus === "passed_basic_filter" ? "ready" : "warning"}
          />
          <div>
            <span>{t("detail.simpleExplanation")}</span>
            <p>{filterSummary}</p>
          </div>
        </div>
        <div className="filter-condition-grid">
          <ConditionList
            title={t("detail.conditionsMet")}
            items={candidate.basicFilterStatus === "passed_basic_filter"
              ? basicFilters.map((item) => item.text)
              : basicFilters.filter((item) => !failedFilters.some((failed) => failed.summary.toLowerCase().includes(item.keyword))).map((item) => item.text)}
            tone="ready"
          />
          <div className={`condition-list ${failedFilters.length > 0 ? "warning" : "neutral"}`}>
            <strong>{t("detail.conditionsNotMet")}</strong>
            {failedFilters.length > 0 ? (
              <ul>{failedFilters.map((reason) => (
                <li key={reason.rawReason}>
                  {reason.summary}
                  {!reason.known && (
                    <details>
                      <summary>{t("app.technicalDetails")}</summary>
                      <code>{reason.rawReason}</code>
                    </details>
                  )}
                </li>
              ))}</ul>
            ) : <p>{t("detail.noFailedConditions")}</p>}
          </div>
        </div>
      </section>

      <section className="product-detail-section" aria-labelledby="security-heading">
        <SectionHeader id="security-heading" index="4" title={t("detail.security")} />
        {candidate.security ? (
          <>
            <div className="product-detail-grid security">
              <DetailField label={t("detail.source")} value={candidate.security.sources.join(", ") || "GoPlus"} />
              <DetailField label={t("detail.securityLabel")} value={formatSecurityLabel(candidate.securityLabel, locale)} tone={getSecurityTone(candidate.securityLabel)} />
              <DetailField label={t("detail.buyTax")} value={formatPercent(candidate.security.buyTax, t("radar.missingData"))} />
              <DetailField label={t("detail.sellTax")} value={formatPercent(candidate.security.sellTax, t("radar.missingData"))} />
              <DetailField label={t("detail.ownership")} value={candidate.security.ownershipStatus || t("radar.missingData")} />
              <DetailField label={t("detail.proxy")} value={formatBooleanRisk(candidate.security.proxyRisk, locale)} />
              <DetailField label={t("detail.blacklist")} value={formatBooleanRisk(candidate.security.blacklistRisk, locale)} />
              <DetailField label={t("detail.mint")} value={formatBooleanRisk(candidate.security.mintRisk, locale)} />
              <DetailField label={t("detail.liquidityLock")} value={formatLiquidityLock(candidate, locale)} />
              <DetailField label={t("detail.contractVerified")} value={formatNullableBoolean(candidate.security.contractVerified, locale)} />
              <DetailField label={t("detail.checkedAt")} value={candidate.security.checkedAt ? formatProductDateTime(candidate.security.checkedAt, locale) : t("radar.missingData")} />
              <DetailField label={t("detail.honeypotStatus")} value={candidate.security.honeypotStatus || t("detail.honeypotNotRun")} />
            </div>
            <div className="security-lists">
              <FlagList title={t("detail.riskFlags")} items={candidate.riskFlags} empty={t("detail.noRiskFlags")} tone="critical" />
              <FlagList title={t("detail.missingData")} items={candidate.missingData} empty={t("detail.noMissingData")} tone="warning" />
            </div>
          </>
        ) : (
          <div className="security-not-invoked">
            <strong>{t("detail.securityNotRunTitle")}</strong>
            <p>{t("detail.securityNotRunDetail")}</p>
            <details>
              <summary>{t("app.technicalDetails")}</summary>
              <code>security_label={candidate.securityLabel || "NOT_CHECKED"}</code>
            </details>
          </div>
        )}
      </section>

      <section className="product-detail-section next-step" aria-labelledby="next-heading">
        <SectionHeader id="next-heading" index="5" title={t("detail.nextStep")} />
        <p>{t("detail.nextStepText")}</p>
        <div className="product-detail-actions">
          {onBackToResults && <button type="button" className="secondary" onClick={onBackToResults}>{t("detail.back")}</button>}
          {onOpenExternalChecks && <button type="button" onClick={() => onOpenExternalChecks(candidate)}>{t("detail.openVerification")}</button>}
        </div>
      </section>
    </div>
  );
};

function SectionHeader({ id, index, title }: { id: string; index: string; title: string }) {
  return <header className="product-detail-section-header"><span>{index}</span><h3 id={id}>{title}</h3></header>;
}

function DetailField({
  label,
  value,
  copyValue,
  mono = false,
  tone = "neutral",
}: {
  label: string;
  value: string;
  copyValue?: string;
  mono?: boolean;
  tone?: "neutral" | "ready" | "warning" | "critical";
}) {
  const { t } = useProductLocale();
  return (
    <div className={`product-detail-field ${tone}`}>
      <span>{label}</span>
      <div className={mono ? "mono" : ""} title={value}>{value}</div>
      {copyValue && <button type="button" onClick={() => copyToClipboard(copyValue)} aria-label={t("detail.copyLabel", { label })}>{t("radar.copy")}</button>}
    </div>
  );
}

function ConditionList({ title, items, tone }: { title: string; items: string[]; tone: "neutral" | "ready" | "warning" }) {
  return <div className={`condition-list ${tone}`}><strong>{title}</strong><ul>{items.map((item) => <li key={item}>{item}</li>)}</ul></div>;
}

function FlagList({ title, items, empty, tone }: { title: string; items: string[]; empty: string; tone: "warning" | "critical" }) {
  return (
    <div className={`security-flag-list ${tone}`}>
      <strong>{title}</strong>
      <div>{(items.length > 0 ? items : [empty]).map((item) => <span key={item}>{humanizeReason(item)}</span>)}</div>
    </div>
  );
}

function getCandidateStatus(candidate: UiTokenCandidate, locale: ProductLocale): string {
  if (candidate.discoveryBasket === "new_emerging") return locale === "pl" ? "OBSERWACJA — NOWY PROJEKT" : "OBSERVATION — NEW PROJECT";
  if (candidate.finalLabel === "CRITICAL_RISK") return locale === "pl" ? "Krytyczne ryzyko" : "Critical risk";
  if (candidate.basicFilterStatus === "rejected_basic_filter" || candidate.finalLabel === "REJECT") return locale === "pl" ? "Odrzucony przez filtry" : "Rejected by filters";
  if (!candidate.security || candidate.finalLabel === "NEEDS_MANUAL_VERIFICATION") return locale === "pl" ? "Wymaga weryfikacji" : "Needs verification";
  return locale === "pl" ? "WATCHLIST — wyłącznie ręczna analiza" : "WATCHLIST — manual review only";
}

function formatDiscoveryMethod(value: UiTokenCandidate["discoveryMethod"], locale: ProductLocale): string {
  if (value === "address_seeded_universe") return locale === "pl" ? "Wersjonowana lista adresów" : "Versioned address list";
  return locale === "pl" ? "Najnowsze profile DexScreener" : "Latest DexScreener profiles";
}

function formatSecurityLabel(value: string, locale: ProductLocale): string {
  if (value === "SECURITY_PASSED") return locale === "pl" ? "Sprawdzone — nadal wymaga ręcznej analizy" : "Checked — still requires manual review";
  if (value.includes("CRITICAL")) return locale === "pl" ? "Krytyczne ryzyko" : "Critical risk";
  if (value === "NOT_CHECKED") return locale === "pl" ? "Nie sprawdzono" : "Not checked";
  return locale === "pl" ? "Wymaga weryfikacji" : "Needs verification";
}

function getSecurityTone(value: string): "ready" | "warning" | "critical" {
  if (value.includes("CRITICAL")) return "critical";
  if (value === "SECURITY_PASSED") return "ready";
  return "warning";
}

function formatPrice(value: number | null, missing: string): string {
  return value == null ? missing : `$${value.toLocaleString("en-US", { maximumSignificantDigits: 6 })}`;
}

function formatDays(value: number | null, locale: ProductLocale, missing: string): string {
  if (value == null) return missing;
  const amount = value.toLocaleString(locale === "pl" ? "pl-PL" : "en-US", { maximumFractionDigits: 1 });
  return locale === "pl" ? `${amount} dni` : `${amount} days`;
}

function formatPercent(value: number | null, missing: string): string {
  return value == null ? missing : `${value}%`;
}

function formatNullableBoolean(value: boolean | null, locale: ProductLocale): string {
  if (value == null) return locale === "pl" ? "Brak danych" : "No data";
  return value ? (locale === "pl" ? "Tak" : "Yes") : (locale === "pl" ? "Nie" : "No");
}

function formatBooleanRisk(value: boolean | null, locale: ProductLocale): string {
  if (value == null) return locale === "pl" ? "Brak danych" : "No data";
  return value
    ? (locale === "pl" ? "Wykryto ryzyko" : "Risk detected")
    : (locale === "pl" ? "Nie wykryto flagi" : "No flag detected");
}

function formatLiquidityLock(candidate: UiTokenCandidate, locale: ProductLocale): string {
  if (!candidate.security || candidate.security.liquidityLocked == null) return locale === "pl" ? "Brak danych" : "No data";
  if (!candidate.security.liquidityLocked) return locale === "pl" ? "Niepotwierdzona" : "Unconfirmed";
  if (candidate.security.liquidityLockDays == null) return locale === "pl" ? "Potwierdzona" : "Confirmed";
  return locale === "pl"
    ? `Potwierdzona · ${candidate.security.liquidityLockDays} dni`
    : `Confirmed · ${candidate.security.liquidityLockDays} days`;
}

function humanizeReason(value: string): string {
  const normalized = value.replaceAll("_", " ").trim();
  return normalized.length === 0 ? value : normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function copyToClipboard(value: string): void {
  if (!value || typeof navigator === "undefined" || !navigator.clipboard) return;
  void navigator.clipboard.writeText(value);
}
