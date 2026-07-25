import React, { useEffect, useState } from "react";
import {
  formatFollowUpLifecycleStatus,
  formatProductDateTime,
  formatProductPairAge,
  formatProductUsd,
  useProductLocale,
  type ProductLocale,
} from "../productI18n";
import {
  resolveProductFilterConditions,
  type BasicFilterCategory,
} from "../productFilterResolver";
import { formatFilterReason, formatProductSourceLabel } from "../productPresentation";
import {
  isCompletedProductSecurityState,
  resolveProductSecurityState,
  type ProductSecurityState,
} from "../productSecurityResolver";
import {
  resolveTokenLifecycle,
  type TokenLifecycleViewModel,
} from "../tokenLifecycle";
import type { UiTokenCandidate } from "../types/scannerTypes";
import type { FollowUpPublicEntry, FollowUpPublicStatus } from "../types/followUpTypes";
import {
  loadEstablishedPromotionStatus,
  type EstablishedPromotionStatus,
} from "../services/establishedPromotionDataSource";
import { EstablishedPromotionPanel } from "./EstablishedPromotionPanel";
import { CopyableAddress, StatusBadge, TechnicalDetails } from "./ProductUi";
import {
  lifecycleActionLabel,
  lifecycleBlockingLabel,
  lifecycleStageLabel,
  TokenLifecycleFlow,
  TokenLifecycleStatus,
} from "./TokenLifecycleFlow";

interface CandidateDetailViewProps {
  candidate: UiTokenCandidate | null;
  followUp?: FollowUpPublicEntry | null;
  followUpStatus?: FollowUpPublicStatus | null;
  onBackToResults?: () => void;
  onOpenExternalChecks?: (candidate: UiTokenCandidate) => void;
  initialOwnerPromotionStatus?: EstablishedPromotionStatus | null;
}

export const CandidateDetailView: React.FC<CandidateDetailViewProps> = ({
  candidate,
  followUp = null,
  followUpStatus,
  onBackToResults,
  onOpenExternalChecks,
  initialOwnerPromotionStatus,
}) => {
  const { locale, t } = useProductLocale();
  const [ownerPromotionStatus, setOwnerPromotionStatus] = useState<EstablishedPromotionStatus | null>(
    initialOwnerPromotionStatus ?? null,
  );
  useEffect(() => {
    if (initialOwnerPromotionStatus !== undefined) {
      setOwnerPromotionStatus(initialOwnerPromotionStatus);
      return;
    }
    const chain = candidate?.chain ?? followUp?.chain;
    const contractAddress = candidate?.contractAddress ?? followUp?.contract_address;
    if (!chain || !contractAddress) {
      setOwnerPromotionStatus(null);
      return;
    }
    let cancelled = false;
    setOwnerPromotionStatus(null);
    void loadEstablishedPromotionStatus(chain, contractAddress).then((status) => {
      if (!cancelled) setOwnerPromotionStatus(status?.owner_controls_visible ? status : null);
    });
    return () => { cancelled = true; };
  }, [candidate?.chain, candidate?.contractAddress, followUp?.chain, followUp?.contract_address, initialOwnerPromotionStatus]);
  const lifecycle = resolveTokenLifecycle({
    candidate,
    followUp,
    followUpStatus,
    establishedMembership: ownerPromotionStatus?.established_membership === "ACTIVE"
      || followUp?.established_membership === true
      || candidate?.discoveryBasket === "established",
  });
  if (!candidate && !followUp) {
    return (
      <section className="candidate-detail-empty product-detail-empty">
        <span className="candidate-detail-eyebrow">{t("detail.eyebrow")}</span>
        <h3>{t("detail.noneTitle")}</h3>
        <p>{t("detail.noneDetail")}</p>
        {onBackToResults && <button type="button" className="candidate-detail-secondary-button" onClick={onBackToResults}>{t("detail.back")}</button>}
      </section>
    );
  }
  if (!candidate && followUp) {
    return (
      <FollowUpOnlyDetail
        followUp={followUp}
        lifecycle={lifecycle}
        ownerPromotionStatus={ownerPromotionStatus}
        onOwnerPromotionStatusChange={setOwnerPromotionStatus}
        onBackToResults={onBackToResults}
      />
    );
  }
  if (!candidate) return null;

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
    .map((condition) => buildFailedFilterRow(condition.category, condition.failureReasons, candidate, locale, t));
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
            <StatusBadge tone={candidate.finalLabel === "WATCHLIST" ? "manual" : candidate.basicFilterStatus === "passed_basic_filter" ? "ready" : "warning"}>{status}</StatusBadge>
            <span>{candidate.chain || t("detail.networkMissing")}</span>
            <span>{candidate.dex || t("detail.dexMissing")}</span>
            <span>{formatProductSourceLabel(candidate.source)}</span>
            <span>{formatProductDateTime(candidate.lastCheckedAt, locale)}</span>
          </div>
          <CopyableAddress
            value={candidate.contractAddress}
            displayValue={shortenAddress(candidate.contractAddress, t("radar.missingData"))}
            copyLabel={t("detail.copyLabel", { label: t("detail.contract") })}
            copiedLabel={t("app.copied")}
            buttonLabel={t("app.copy")}
            className="candidate-detail-hero-address"
          />
        </div>
        <div className="candidate-detail-boundary">
          <strong>{candidate.observationOnly ? t("detail.boundaryObservation") : t("detail.boundaryManual")}</strong>
          <span>{t("detail.boundaryText")}</span>
          {onBackToResults && <button type="button" className="candidate-detail-hero-back" onClick={onBackToResults}>{t("detail.back")}</button>}
        </div>
      </section>

      <section className="product-detail-section" aria-labelledby="identity-heading">
        <SectionHeader id="identity-heading" index="1" title={t("detail.identity")} />
        <div className="product-detail-grid">
          <DetailField label={t("detail.contract")} value={candidate.contractAddress || t("radar.missingData")} copyValue={candidate.contractAddress} mono />
          <DetailField label={t("detail.pairAddress")} value={candidate.pairAddress || t("radar.missingData")} copyValue={candidate.pairAddress} mono />
          <DetailField label={t("detail.chain")} value={candidate.chain || t("radar.missingData")} />
          <DetailField label={t("detail.addressIdentity")} value={candidate.addressIdentityVerified ? t("radar.verified") : t("detail.unverified")} tone={candidate.addressIdentityVerified ? "ready" : "warning"} />
        </div>
      </section>

      <LifecycleDetailSection
        model={lifecycle}
        followUp={followUp}
        universeVersion={candidate.discoveryBasket === "established" ? candidate.universeVersion : null}
      />

      <section className="product-detail-section" aria-labelledby="market-heading">
        <SectionHeader id="market-heading" index="3" title={t("detail.marketData")} />
        <div className="product-detail-grid market">
          <DetailField label={t("radar.price")} value={formatPrice(candidate.priceUsd, t("radar.missingData"))} />
          <DetailField label={t("radar.marketCap")} value={formatProductUsd(candidate.marketCap, locale, t("radar.missingData"))} />
          <DetailField label={t("detail.fdv")} value={formatProductUsd(candidate.fdvUsd, locale, t("radar.missingData"))} />
          <DetailField label={t("radar.liquidity")} value={formatProductUsd(candidate.liquidity, locale, t("radar.missingData"))} />
          <DetailField label={t("radar.volume24h")} value={formatProductUsd(candidate.volume24h, locale, t("radar.missingData"))} />
          <DetailField label={t("radar.ratio")} value={candidate.volumeMarketCapRatio == null ? t("radar.missingData") : candidate.volumeMarketCapRatio.toFixed(4)} />
          <DetailField label={t("radar.pairAge")} value={formatProductPairAge(candidate.pairAgeDays, locale, t("radar.missingData"), { pairCreatedAt: candidate.pairCreatedAt })} />
        </div>
      </section>

      <section className="product-detail-section data-freshness" aria-labelledby="freshness-heading">
        <SectionHeader id="freshness-heading" index="4" title={t("detail.dataFreshness")} />
        <div className="product-detail-grid data">
          <DetailField label={t("detail.source")} value={candidate.source ? formatProductSourceLabel(candidate.source) : t("radar.missingData")} />
          <DetailField label={t("followUp.lastChecked")} value={formatProductDateTime(candidate.lastCheckedAt, locale)} />
          <DetailField label={t("detail.pairCreated")} value={candidate.pairCreatedAt ? formatProductDateTime(candidate.pairCreatedAt, locale) : t("radar.missingData")} />
          <DetailField label={t("detail.discoveryMethod")} value={formatDiscoveryMethod(candidate.discoveryMethod, locale)} />
          <DetailField label={t("detail.universeVersion")} value={candidate.discoveryBasket === "established" ? candidate.universeVersion ?? t("radar.missingData") : t("detail.notApplicable")} />
          {candidate.universeEntryIndex != null && <DetailField label={t("detail.universeEntry")} value={String(candidate.universeEntryIndex)} />}
        </div>
        <TechnicalDetails label={t("app.technicalDetails")}>
          <dl className="product-control-details">
            <div><dt>{t("detail.runId")}</dt><dd className="mono">{candidate.runId}</dd></div>
          </dl>
        </TechnicalDetails>
      </section>

      <section className="product-detail-section" aria-labelledby="filters-heading">
        <SectionHeader id="filters-heading" index="5" title={t("detail.filters")} />
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
          <FailedConditionList
            title={t("detail.conditionsNotMet")}
            items={failedFilters}
            empty={t("detail.noFailedConditions")}
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
        <SectionHeader id="security-heading" index="6" title={t("detail.security")} />
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
              <DetailField label={t("detail.source")} value={securityResolution.sources.map(formatProductSourceLabel).join(", ") || t("radar.missingData")} />
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

      {ownerPromotionStatus?.owner_controls_visible && (
        <EstablishedPromotionPanel
          initialStatus={ownerPromotionStatus}
          onStatusChange={setOwnerPromotionStatus}
        />
      )}

      <section className="product-detail-section next-step research-actions" aria-labelledby="next-heading">
        <SectionHeader id="next-heading" index="7" title={t("detail.nextStep")} />
        <p>{t("detail.nextStepText")}</p>
        <div className="product-detail-actions">
          {onBackToResults && <button type="button" className="secondary" onClick={onBackToResults}>{t("detail.back")}</button>}
          {onOpenExternalChecks && <button type="button" onClick={() => onOpenExternalChecks(candidate)}>{t("detail.openVerification")}</button>}
        </div>
      </section>
    </div>
  );
};

function LifecycleDetailSection({
  model,
  followUp,
  universeVersion,
}: {
  model: TokenLifecycleViewModel;
  followUp: FollowUpPublicEntry | null;
  universeVersion: string | null;
}) {
  const { locale, t } = useProductLocale();
  const blockers = model.blocking_conditions.length > 0
    ? model.blocking_conditions.map((condition) => lifecycleBlockingLabel(condition, locale)).join(" · ")
    : (locale === "pl" ? "Brak blokady bieżącego kroku" : "No blocker for the current step");
  const automatic = model.next_action_type === "owner_decision"
    ? (locale === "pl" ? "Automatyczne checkpointy zakończyły bieżący etap." : "Automatic checkpoints completed the current stage.")
    : lifecycleActionLabel(model.next_action_type, locale);
  const manual = model.owner_decision_required
    ? (locale === "pl" ? "Decyzja właściciela. Token nie został dodany automatycznie." : "Owner decision. The token was not promoted automatically.")
    : model.tracking_status === "established"
      ? (locale === "pl" ? "Brak ręcznej akcji w tym widoku." : "No manual action in this view.")
      : (locale === "pl" ? "Nie wymaga ręcznego przenoszenia do dalszej obserwacji." : "No manual move to follow-up is required.");
  const howItGotHere = lifecycleOrigin(model, locale);
  return (
    <section className="product-detail-section lifecycle-detail-section" aria-labelledby="follow-up-heading">
      <SectionHeader id="follow-up-heading" index="2" title={locale === "pl" ? "Przepływ obserwacji" : "Observation flow"} />
      {model.owner_decision_required && (
        <p className="follow-up-candidate-boundary">{t("followUp.detailBoundary")}</p>
      )}
      <TokenLifecycleFlow model={model} showCheckpoints={Boolean(followUp)} />
      <TokenLifecycleStatus model={model} />
      <div className="lifecycle-detail-grid">
        <DetailField label={locale === "pl" ? "Gdzie jest teraz" : "Current position"} value={lifecycleStageLabel(model.current_stage, locale)} />
        <DetailField label={locale === "pl" ? "Jak trafił na ten etap" : "How it reached this stage"} value={howItGotHere} />
        <DetailField label={locale === "pl" ? "Co nastąpi automatycznie" : "What happens automatically"} value={automatic} />
        <DetailField label={locale === "pl" ? "Co wymaga decyzji" : "What requires a decision"} value={manual} tone={model.owner_decision_required ? "warning" : "neutral"} />
        <DetailField
          label={locale === "pl" ? "Najbliższy termin" : "Next due date"}
          value={model.next_checkpoint_at ? formatProductDateTime(model.next_checkpoint_at, locale) : t("followUp.noAutomaticCheck")}
        />
        <DetailField label={locale === "pl" ? "Warunki blokujące" : "Blocking conditions"} value={blockers} tone={model.blocking_conditions.length > 0 ? "warning" : "neutral"} />
      </div>
      {followUp && (
        <div className="lifecycle-source-facts">
          <DetailField label={t("followUp.firstSeen")} value={formatProductDateTime(followUp.first_seen_at, locale)} />
          <DetailField label={t("followUp.lastChecked")} value={followUp.last_checked_at ? formatProductDateTime(followUp.last_checked_at, locale) : t("app.noData")} />
          <DetailField label={t("followUp.filterStatus")} value={formatFollowUpFilterStatus(followUp.filter_status, locale)} />
          <DetailField label={t("followUp.securityStatus")} value={formatFollowUpSecurityStatus(followUp.security_status, locale)} tone="warning" />
        </div>
      )}
      {model.tracking_status === "established" && (
        <p className="established-source-note">
          {locale === "pl"
            ? `Przepływ jest ukończony. Historia checkpointów może pozostać w Follow-up, ale źródłem prawdy jest Established Universe${universeVersion ? ` (${universeVersion})` : ""}.`
            : `The flow is complete. Checkpoint history may remain in Follow-up, but the Established Universe is the source of truth${universeVersion ? ` (${universeVersion})` : ""}.`}
        </p>
      )}
    </section>
  );
}

function FollowUpOnlyDetail({
  followUp,
  lifecycle,
  ownerPromotionStatus,
  onOwnerPromotionStatusChange,
  onBackToResults,
}: {
  followUp: FollowUpPublicEntry;
  lifecycle: TokenLifecycleViewModel;
  ownerPromotionStatus: EstablishedPromotionStatus | null;
  onOwnerPromotionStatusChange: (status: EstablishedPromotionStatus) => void;
  onBackToResults?: () => void;
}) {
  const { locale, t } = useProductLocale();
  return (
    <div className="candidate-detail-view product-candidate-detail follow-up-only-detail">
      <section className="candidate-detail-hero">
        <div className="candidate-detail-hero-copy">
          <span className="candidate-detail-eyebrow">{locale === "pl" ? "Dalsza obserwacja" : "Follow-up"}</span>
          <h3>{followUp.symbol ?? t("radar.missingData")} <small>{followUp.display_name ?? ""}</small></h3>
          <div className="candidate-detail-token-line">
            <StatusBadge tone={followUp.lifecycle_status === "CANDIDATE_FOR_ESTABLISHED" ? "manual" : "neutral"}>
              {formatFollowUpLifecycleStatus(followUp.lifecycle_status, locale)}
            </StatusBadge>
            <span>{followUp.chain}</span>
          </div>
          <CopyableAddress
            value={followUp.contract_address}
            displayValue={shortenAddress(followUp.contract_address, t("radar.missingData"))}
            copyLabel={t("detail.copyLabel", { label: t("detail.contract") })}
            copiedLabel={t("app.copied")}
            buttonLabel={t("app.copy")}
            className="candidate-detail-hero-address"
          />
        </div>
        <div className="candidate-detail-boundary">
          <strong>{locale === "pl" ? "Badania i obserwacja" : "Research and observation"}</strong>
          <span>{locale === "pl" ? "Status nie jest rekomendacją inwestycyjną ani potwierdzeniem bezpieczeństwa." : "This status is not investment advice or a safety approval."}</span>
          {onBackToResults && <button type="button" className="candidate-detail-hero-back" onClick={onBackToResults}>{t("detail.back")}</button>}
        </div>
      </section>

      <section className="product-detail-section" aria-labelledby="identity-heading">
        <SectionHeader id="identity-heading" index="1" title={t("detail.identity")} />
        <div className="product-detail-grid">
          <DetailField label={t("detail.contract")} value={followUp.contract_address} copyValue={followUp.contract_address} mono />
          <DetailField label={t("detail.chain")} value={followUp.chain} />
        </div>
      </section>

      <LifecycleDetailSection model={lifecycle} followUp={followUp} universeVersion={null} />

      <section className="product-detail-section" aria-labelledby="follow-up-data-heading">
        <SectionHeader id="follow-up-data-heading" index="3" title={locale === "pl" ? "Bieżące dane obserwacji" : "Current observation data"} />
        <div className="product-detail-grid market">
          <DetailField label={t("radar.price")} value={formatPrice(followUp.market_metrics.price_usd, t("radar.missingData"))} />
          <DetailField label={t("radar.marketCap")} value={formatProductUsd(followUp.market_metrics.market_cap_usd, locale, t("radar.missingData"))} />
          <DetailField label={t("radar.liquidity")} value={formatProductUsd(followUp.market_metrics.liquidity_usd, locale, t("radar.missingData"))} />
          <DetailField label={t("radar.volume24h")} value={formatProductUsd(followUp.market_metrics.volume_24h_usd, locale, t("radar.missingData"))} />
          <DetailField label={t("followUp.filterStatus")} value={formatFollowUpFilterStatus(followUp.filter_status, locale)} />
          <DetailField label={t("followUp.securityStatus")} value={formatFollowUpSecurityStatus(followUp.security_status, locale)} tone="warning" />
        </div>
      </section>

      {ownerPromotionStatus?.owner_controls_visible && (
        <EstablishedPromotionPanel
          initialStatus={ownerPromotionStatus}
          onStatusChange={onOwnerPromotionStatusChange}
        />
      )}

      <section className="product-detail-section next-step research-actions" aria-labelledby="next-heading">
        <SectionHeader id="next-heading" index="4" title={t("detail.nextStep")} />
        <p>{lifecycleActionLabel(lifecycle.next_action_type, locale)}</p>
        {onBackToResults && (
          <div className="product-detail-actions">
            <button type="button" className="secondary" onClick={onBackToResults}>{t("detail.back")}</button>
          </div>
        )}
      </section>
    </div>
  );
}

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

type FailedFilterRow = {
  name: string;
  actual: string;
  required: string;
  description: string;
};

function FailedConditionList({ title, items, empty }: { title: string; items: FailedFilterRow[]; empty: string }) {
  const { locale } = useProductLocale();
  const copy = locale === "pl"
    ? { actual: "Wartość", required: "Wymaganie" }
    : { actual: "Actual", required: "Required" };
  return (
    <div className={`condition-list ${items.length > 0 ? "warning" : "neutral"}`}>
      <strong>{title}</strong>
      {items.length > 0 ? (
        <div className="failed-condition-rows">
          {items.map((item) => (
            <article key={item.name} className="failed-condition-row">
              <h4>{item.name}</h4>
              <dl>
                <div><dt>{copy.actual}</dt><dd>{item.actual}</dd></div>
                <div><dt>{copy.required}</dt><dd>{item.required}</dd></div>
              </dl>
              <p>{item.description}</p>
            </article>
          ))}
        </div>
      ) : <p>{empty}</p>}
    </div>
  );
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

function lifecycleOrigin(model: TokenLifecycleViewModel, locale: ProductLocale): string {
  if (model.tracking_status === "established") {
    return locale === "pl"
      ? "Właściciel dodał tę tożsamość do aktywnego Established Universe."
      : "The owner added this identity to the enabled Established Universe.";
  }
  if (model.tracking_status === "candidate") {
    return locale === "pl"
      ? "Automatyczna obserwacja potwierdziła spełnienie podstawowych filtrów."
      : "Automatic observation confirmed that the basic filters were met.";
  }
  if (model.tracking_status === "active" || model.tracking_status === "complete") {
    return locale === "pl"
      ? "Centralny collector automatycznie zapisał poprawne chain + contract_address."
      : "The central collector automatically enrolled the valid chain + contract address.";
  }
  if (model.tracking_status === "waiting") {
    return locale === "pl"
      ? "Token został wykryty w warstwie Nowe i ma poprawną tożsamość."
      : "The token was detected in New and has a valid identity.";
  }
  return locale === "pl"
    ? "Token został wykryty, ale dalszy etap wymaga dostępnej i poprawnej tożsamości."
    : "The token was detected, but the next stage requires an available, valid identity.";
}

function formatFollowUpFilterStatus(
  value: FollowUpPublicEntry["filter_status"],
  locale: ProductLocale,
): string {
  if (value === "passed_basic_filter") return locale === "pl" ? "Podstawowe filtry spełnione" : "Basic filters met";
  if (value === "rejected_basic_filter") return locale === "pl" ? "Podstawowe filtry niespełnione" : "Basic filters not met";
  return locale === "pl" ? "Filtry jeszcze niesprawdzone" : "Filters not checked yet";
}

function formatFollowUpSecurityStatus(value: string, locale: ProductLocale): string {
  if (value === "CHECKED") return locale === "pl" ? "Sprawdzono; nadal wymaga oceny" : "Checked; still requires review";
  if (value === "CRITICAL_RISK") return locale === "pl" ? "Wykryto ryzyko krytyczne" : "Critical risk detected";
  if (value === "PARTIAL") return locale === "pl" ? "Dane częściowe; wymagana weryfikacja" : "Partial data; verification required";
  if (value === "UNAVAILABLE") return locale === "pl" ? "Dane niedostępne; wymagana weryfikacja" : "Data unavailable; verification required";
  return locale === "pl" ? "Wymagana ręczna weryfikacja" : "Manual verification required";
}

function formatPrice(value: number | null, missing: string): string {
  return value == null ? missing : `$${value.toLocaleString("en-US", { maximumSignificantDigits: 6 })}`;
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

function buildFailedFilterRow(
  category: BasicFilterCategory,
  reasons: string[],
  candidate: UiTokenCandidate,
  locale: ProductLocale,
  t: ProductTranslator,
): FailedFilterRow {
  const missing = t("radar.missingData");
  const actual = category === "market_cap"
    ? formatProductUsd(candidate.marketCap ?? candidate.fdvUsd, locale, missing)
    : category === "volume_24h"
      ? formatProductUsd(candidate.volume24h, locale, missing)
      : category === "liquidity"
        ? formatProductUsd(candidate.liquidity, locale, missing)
        : category === "volume_market_cap_ratio"
          ? candidate.volumeMarketCapRatio == null ? missing : `${(candidate.volumeMarketCapRatio * 100).toFixed(2)}%`
          : candidate.pairAgeDays == null
            ? missing
            : locale === "pl" ? `${candidate.pairAgeDays} dni` : `${candidate.pairAgeDays} days`;
  const required = category === "market_cap"
    ? "$300k–$10m"
    : category === "volume_24h" || category === "liquidity"
      ? "≥ $30k"
      : category === "volume_market_cap_ratio"
        ? "1%–100%"
        : locale === "pl" ? "> 7 dni" : "> 7 days";
  return {
    name: formatBasicFilterCategory(category, t),
    actual,
    required,
    description: reasons.map((reason) => formatFilterReason(reason, locale).summary).join(" "),
  };
}

function shortenAddress(value: string, missing: string): string {
  if (!value) return missing;
  if (value.length <= 24) return value;
  return `${value.slice(0, 12)}…${value.slice(-10)}`;
}

function humanizeReason(value: string): string {
  const normalized = value.replaceAll("_", " ").trim();
  return normalized.length === 0 ? value : normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function copyToClipboard(value: string): void {
  if (!value || typeof navigator === "undefined" || !navigator.clipboard) return;
  void navigator.clipboard.writeText(value);
}
