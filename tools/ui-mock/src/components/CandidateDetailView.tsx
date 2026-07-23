import React from "react";
import {
  formatProductDateTime,
  formatProductUsd,
  useProductLocale,
  type ProductLocale,
} from "../productI18n";
import {
  resolveProductFilterConditions,
  type BasicFilterCategory,
} from "../productFilterResolver";
import { formatFilterReason } from "../productPresentation";
import {
  isCompletedProductSecurityState,
  resolveProductSecurityState,
  type ProductSecurityState,
} from "../productSecurityResolver";
import type { UiTokenCandidate } from "../types/scannerTypes";
import type { FollowUpPublicEntry } from "../types/followUpTypes";

interface CandidateDetailViewProps {
  candidate: UiTokenCandidate | null;
  followUp?: FollowUpPublicEntry | null;
  onBackToResults?: () => void;
  onOpenExternalChecks?: (candidate: UiTokenCandidate) => void;
}

export const CandidateDetailView: React.FC<CandidateDetailViewProps> = ({
  candidate,
  followUp = null,
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
  const filterResolution = resolveProductFilterConditions({
    basicFilterStatus: candidate.basicFilterStatus,
    filterReasons: candidate.filterReasons,
  });
  const securityResolution = resolveProductSecurityState(candidate);
  const filterSummary = candidate.basicFilterStatus === "passed_basic_filter"
    ? t("detail.filterPassedSummary")
    : t("detail.filterRejectedSummary");
  const passedFilters = filterResolution.conditions
    .filter((condition) => condition.state === "passed")
    .map((condition) => formatBasicFilterCategory(condition.category, t));
  const failedFilters = filterResolution.conditions
    .filter((condition) => condition.state === "failed")
    .map((condition) => {
      const reasons = condition.failureReasons
        .map((reason) => formatFilterReason(reason, locale).summary)
        .join("; ");
      return `${formatBasicFilterCategory(condition.category, t)} — ${reasons}`;
    });
  const unknownFilters = filterResolution.conditions
    .filter((condition) => condition.state === "unknown")
    .map((condition) => formatBasicFilterCategory(condition.category, t));
  const showSecurityDetails = securityResolution.state === "partial"
    || isCompletedProductSecurityState(securityResolution.state);

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
            items={passedFilters}
            empty={t("detail.noPassedConditions")}
            tone="ready"
          />
          <ConditionList
            title={t("detail.conditionsNotMet")}
            items={failedFilters}
            empty={t("detail.noFailedConditions")}
            tone={failedFilters.length > 0 ? "warning" : "neutral"}
          />
          {unknownFilters.length > 0 && (
            <ConditionList
              title={t("detail.conditionsUnknown")}
              items={unknownFilters}
              empty={t("detail.noUnknownConditions")}
              tone="neutral"
            />
          )}
        </div>
        {(filterResolution.preferredRangeNotes.length > 0
          || filterResolution.informationalReasons.length > 0
          || filterResolution.unknownReasons.length > 0) && (
          <div className="filter-additional-notes">
            {filterResolution.preferredRangeNotes.length > 0 && (
              <FilterNoteList
                title={t("detail.preferredRangeNotes")}
                reasons={filterResolution.preferredRangeNotes}
                locale={locale}
              />
            )}
            {(filterResolution.informationalReasons.length > 0 || filterResolution.unknownReasons.length > 0) && (
              <FilterNoteList
                title={t("detail.additionalFilterInfo")}
                reasons={[...filterResolution.informationalReasons, ...filterResolution.unknownReasons]}
                locale={locale}
                showUnknownCodes
              />
            )}
          </div>
        )}
      </section>

      <section className="product-detail-section" aria-labelledby="security-heading">
        <SectionHeader id="security-heading" index="4" title={t("detail.security")} />
        <div className={`security-state-panel ${securityResolution.state}`}>
          <strong>{getSecurityStateTitle(securityResolution.state, t)}</strong>
          <p>{getSecurityStateDetail(securityResolution.state, candidate.basicFilterStatus, t)}</p>
          {securityResolution.state === "not_invoked" && <p>{t("detail.riskFlagsNotAssessed")}</p>}
          <details>
            <summary>{t("app.technicalDetails")}</summary>
            <code>
              security_state={securityResolution.state}; security_label={securityResolution.rawSecurityLabel}; coverage_status={securityResolution.rawCoverageStatus ?? "null"}
            </code>
          </details>
        </div>
        {showSecurityDetails ? (
          <>
            <div className="product-detail-grid security">
              <DetailField label={t("detail.source")} value={securityResolution.sources.join(", ") || t("radar.missingData")} />
              <DetailField label={t("detail.securityLabel")} value={getSecurityStateTitle(securityResolution.state, t)} tone={getSecurityTone(securityResolution.state)} />
              <DetailField label={t("detail.buyTax")} value={formatPercent(candidate.security?.buyTax ?? null, t("radar.missingData"))} />
              <DetailField label={t("detail.sellTax")} value={formatPercent(candidate.security?.sellTax ?? null, t("radar.missingData"))} />
              <DetailField label={t("detail.ownership")} value={formatSecurityText(candidate.security?.ownershipStatus, locale, t("radar.missingData"))} />
              <DetailField label={t("detail.proxy")} value={formatBooleanRisk(candidate.security?.proxyRisk ?? null, locale)} />
              <DetailField label={t("detail.blacklist")} value={formatBooleanRisk(candidate.security?.blacklistRisk ?? null, locale)} />
              <DetailField label={t("detail.mint")} value={formatBooleanRisk(candidate.security?.mintRisk ?? null, locale)} />
              <DetailField label={t("detail.liquidityLock")} value={formatLiquidityLock(candidate, locale)} />
              <DetailField label={t("detail.contractVerified")} value={formatNullableBoolean(candidate.security?.contractVerified ?? null, locale)} />
              <DetailField label={t("detail.checkedAt")} value={securityResolution.checkedAt ? formatProductDateTime(securityResolution.checkedAt, locale) : t("radar.missingData")} />
              <DetailField label={t("detail.honeypotStatus")} value={formatSecurityText(candidate.security?.honeypotStatus, locale, t("detail.honeypotNotRun"))} />
            </div>
            <div className="security-lists">
              <FlagList
                title={t("detail.riskFlags")}
                items={candidate.riskFlags.map((reason) => formatSecurityReason(reason, locale, t))}
                empty={getEmptyRiskFlagsText(securityResolution.state, t)}
                tone="critical"
              />
              <FlagList
                title={t("detail.missingData")}
                items={candidate.missingData.map((reason) => formatSecurityReason(reason, locale, t))}
                empty={t("detail.noMissingData")}
                tone="warning"
              />
            </div>
          </>
        ) : null}
      </section>

      {followUp && (
        <section className="product-detail-section follow-up-detail" aria-labelledby="follow-up-heading">
          <SectionHeader id="follow-up-heading" index="5" title={t("followUp.detailTitle")} />
          <p className="follow-up-candidate-boundary">{t("followUp.detailBoundary")}</p>
          <div className="product-detail-grid">
            <DetailField label={t("followUp.lifecycle")} value={followUp.lifecycle_status} tone={followUp.lifecycle_status === "CANDIDATE_FOR_ESTABLISHED" ? "warning" : "neutral"} />
            <DetailField label={t("followUp.firstSeen")} value={formatProductDateTime(followUp.first_seen_at, locale)} />
            <DetailField label={t("followUp.completedCheckpoints")} value={followUp.completed_checkpoints.length > 0 ? followUp.completed_checkpoints.map((day) => `${day}d`).join(" Â· ") : t("followUp.noneCompleted")} />
            <DetailField label={t("followUp.nextCheckpoint")} value={followUp.next_check_at ? formatProductDateTime(followUp.next_check_at, locale) : t("followUp.noAutomaticCheck")} />
            <DetailField label={t("followUp.filterStatus")} value={followUp.filter_status} />
            <DetailField label={t("followUp.establishedMembership")} value={followUp.established_membership ? t("control.value.yes") : t("control.value.no")} />
            <DetailField label={t("followUp.nextReviewStep")} value={followUp.next_review_step} />
          </div>
        </section>
      )}

      <section className="product-detail-section next-step" aria-labelledby="next-heading">
        <SectionHeader id="next-heading" index={followUp ? "6" : "5"} title={t("detail.nextStep")} />
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

function ConditionList({ title, items, empty, tone }: { title: string; items: string[]; empty: string; tone: "neutral" | "ready" | "warning" }) {
  return <div className={`condition-list ${tone}`}><strong>{title}</strong>{items.length > 0 ? <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul> : <p>{empty}</p>}</div>;
}

function FilterNoteList({
  title,
  reasons,
  locale,
  showUnknownCodes = false,
}: {
  title: string;
  reasons: string[];
  locale: ProductLocale;
  showUnknownCodes?: boolean;
}) {
  const { t } = useProductLocale();
  return (
    <div className="condition-list neutral">
      <strong>{title}</strong>
      <ul>{reasons.map((reason) => {
        const presentation = formatFilterReason(reason, locale);
        return (
          <li key={reason}>
            {presentation.summary}
            {showUnknownCodes && !presentation.known && (
              <details>
                <summary>{t("app.technicalDetails")}</summary>
                <code>{presentation.rawReason}</code>
              </details>
            )}
          </li>
        );
      })}</ul>
    </div>
  );
}

function FlagList({ title, items, empty, tone }: { title: string; items: string[]; empty: string; tone: "warning" | "critical" }) {
  return (
    <div className={`security-flag-list ${tone}`}>
      <strong>{title}</strong>
      <div>{(items.length > 0 ? items : [empty]).map((item) => <span key={item}>{item}</span>)}</div>
    </div>
  );
}

function getCandidateStatus(candidate: UiTokenCandidate, locale: ProductLocale): string {
  if (candidate.discoveryBasket === "new_emerging") return locale === "pl" ? "OBSERWACJA — NOWY PROJEKT" : "OBSERVATION — NEW PROJECT";
  if (candidate.finalLabel === "CRITICAL_RISK") return locale === "pl" ? "Krytyczne ryzyko" : "Critical risk";
  if (candidate.basicFilterStatus === "rejected_basic_filter" || candidate.finalLabel === "REJECT") return locale === "pl" ? "Odrzucony przez filtry" : "Rejected by filters";
  if (!isCompletedProductSecurityState(resolveProductSecurityState(candidate).state) || candidate.finalLabel === "NEEDS_MANUAL_VERIFICATION") return locale === "pl" ? "Wymaga weryfikacji" : "Needs verification";
  return locale === "pl" ? "WATCHLIST — wyłącznie ręczna analiza" : "WATCHLIST — manual review only";
}

type ProductTranslator = ReturnType<typeof useProductLocale>["t"];

function formatBasicFilterCategory(category: BasicFilterCategory, t: ProductTranslator): string {
  if (category === "market_cap") return t("filter.marketCapRange");
  if (category === "volume_24h") return t("filter.volumeMinimum");
  if (category === "liquidity") return t("filter.liquidityMinimum");
  if (category === "volume_market_cap_ratio") return t("filter.ratioRange");
  return t("filter.pairAgeMinimum");
}

function getSecurityStateTitle(state: ProductSecurityState, t: ProductTranslator): string {
  if (state === "not_invoked") return t("detail.securityNotRunTitle");
  if (state === "unavailable") return t("detail.securityUnavailableTitle");
  if (state === "partial") return t("detail.securityPartialTitle");
  if (state === "checked_needs_manual_review") return t("detail.securityNeedsReviewTitle");
  if (state === "checked_critical") return t("detail.securityCriticalTitle");
  return t("detail.securityCheckedTitle");
}

function getSecurityStateDetail(state: ProductSecurityState, basicFilterStatus: string, t: ProductTranslator): string {
  if (state === "not_invoked") {
    return basicFilterStatus === "rejected_basic_filter"
      ? t("detail.securityNotRunRejectedDetail")
      : t("detail.securityNotRunDetail");
  }
  if (state === "unavailable") return t("detail.securityUnavailableDetail");
  if (state === "partial") return t("detail.securityPartialDetail");
  if (state === "checked_needs_manual_review") return t("detail.securityNeedsReviewDetail");
  if (state === "checked_critical") return t("detail.securityCriticalDetail");
  return t("detail.securityCheckedDetail");
}

function getEmptyRiskFlagsText(state: ProductSecurityState, t: ProductTranslator): string {
  if (state === "checked") return t("detail.noRiskFlags");
  if (state === "partial") return t("detail.securityPartialDetail");
  return t("detail.riskFlagsRequireReview");
}

function formatSecurityReason(value: string, locale: ProductLocale, t: ProductTranslator): string {
  const normalized = value.trim().toUpperCase().replaceAll(" ", "_");
  if (normalized === "SECURITY_DATA_UNAVAILABLE") return t("detail.securityUnavailableDetail");
  if (normalized === "PARTIAL_SECURITY_COVERAGE") return t("detail.securityPartialDetail");
  if (normalized === "NOT_CHECKED" || normalized === "UNKNOWN") return t("detail.riskFlagsNotAssessed");
  const humanized = humanizeReason(value);
  return locale === "pl" && humanized.toLowerCase() === "unknown" ? t("radar.missingData") : humanized;
}

function formatSecurityText(value: string | null | undefined, locale: ProductLocale, missing: string): string {
  const normalized = (value ?? "").trim();
  const code = normalized.toUpperCase().replaceAll(" ", "_");
  if (!normalized || code.includes("UNKNOWN")) return missing;
  if (code === "SECURITY_DATA_UNAVAILABLE") return locale === "pl" ? "Dane niedostępne" : "Data unavailable";
  if (code === "PARTIAL_SECURITY_COVERAGE") return locale === "pl" ? "Dane częściowe" : "Partial data";
  if (code === "NOT_CHECKED") return locale === "pl" ? "Nie uruchomiono" : "Not run";
  if (code === "NEEDS_MANUAL_VERIFICATION") return locale === "pl" ? "Wymagana ręczna weryfikacja" : "Manual verification required";
  if (code === "CRITICAL_RISK") return locale === "pl" ? "Wykryto krytyczne ryzyko" : "Critical risk detected";
  if (code === "SECURITY_PASSED" || code === "PASSED") return locale === "pl" ? "Kontrola bez wykrytej flagi" : "Check passed without a reported flag";
  if (code === "FAILED") return locale === "pl" ? "Wykryto problem" : "Issue detected";
  return humanizeReason(normalized);
}

function formatDiscoveryMethod(value: UiTokenCandidate["discoveryMethod"], locale: ProductLocale): string {
  if (value === "address_seeded_universe") return locale === "pl" ? "Wersjonowana lista adresów" : "Versioned address list";
  return locale === "pl" ? "Najnowsze profile DexScreener" : "Latest DexScreener profiles";
}

function getSecurityTone(state: ProductSecurityState): "ready" | "warning" | "critical" {
  if (state === "checked_critical") return "critical";
  if (state === "checked") return "ready";
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
