import React, { useCallback, useEffect, useState } from "react";
import {
  formatProductDateTime,
  formatProductPairAge,
  formatProductUsd,
  useProductLocale,
  type ProductLocale,
} from "../productI18n";
import {
  BASIC_FILTER_CATEGORIES,
  getProductFilterRequirement,
  resolveCurrentProductFilterConditions,
  resolveProductFilterConditions,
  type BasicFilterCategory,
  type BasicFilterConditionState,
} from "../productFilterResolver";
import { formatFilterReason, formatProductSourceLabel } from "../productPresentation";
import {
  isCompletedProductSecurityState,
  resolveProductSecurityState,
  type ProductSecurityState,
} from "../productSecurityResolver";
import {
  resolveTokenIdentity,
  resolveTokenLifecycle,
  type TokenLifecycleViewModel,
} from "../tokenLifecycle";
import type { UiTokenCandidate } from "../types/scannerTypes";
import type { FollowUpPublicEntry, FollowUpPublicStatus } from "../types/followUpTypes";
import type { ResearchStepNumber } from "../researchChecklistTypes";
import { followUpToResearchCandidate } from "../followUpResearchCandidate";
import { CANDIDATE_DETAIL_TAB_IDS, type CandidateDetailTabId } from "../candidateDetailTabs";
import { TokenDetailTabPanel, TokenDetailTabs } from "./TokenDetailTabs";
import {
  loadEstablishedPromotionStatus,
  type EstablishedPromotionStatus,
} from "../services/establishedPromotionDataSource";
import { EstablishedPromotionPanel } from "./EstablishedPromotionPanel";
import { AIResearchSection } from "./AIResearchSection";
import { ManualVerificationStatusCard } from "./ManualVerificationStatusCard";
import { OwnerFollowUpActionPanel } from "./OwnerFollowUpActionPanel";
import { PersonalRadarPanel } from "./PersonalRadarPanel";
import type { PrivateVerificationRecord } from "../services/manualOwnerActionsDataSource";
import { ActionButton, CopyButton, CopyableAddress, StatusBadge, TechnicalDetails } from "./ProductUi";
import { ResearchChecklistDetail, ResearchChecklistSummary } from "./ResearchChecklist";
import {
  lifecycleActionLabel,
  lifecycleBlockingLabel,
  lifecycleStageLabel,
  TokenLifecycleFlow,
} from "./TokenLifecycleFlow";

interface CandidateDetailViewProps {
  candidate: UiTokenCandidate | null;
  followUp?: FollowUpPublicEntry | null;
  followUpStatus?: FollowUpPublicStatus | null;
  onBackToResults?: () => void;
  onOpenExternalChecks?: (candidate: UiTokenCandidate) => void;
  onOpenResearchChecklistStep?: (candidate: UiTokenCandidate | FollowUpPublicEntry, step: ResearchStepNumber) => void;
  onOpenVerificationForResearchStep?: (candidate: UiTokenCandidate | FollowUpPublicEntry, step: ResearchStepNumber) => void;
  onBackToResearchPlaybook?: () => void;
  onOpenFollowUpExternalChecks?: (followUp: FollowUpPublicEntry) => void;
  initialManualVerification?: PrivateVerificationRecord | null;
  onLifecycleChanged?: () => void | Promise<void>;
  initialOwnerPromotionStatus?: EstablishedPromotionStatus | null;
  activeTab?: CandidateDetailTabId;
  initialActiveTab?: CandidateDetailTabId;
  onActiveTabChange?: (tab: CandidateDetailTabId) => void;
  focusResearchPlaybook?: boolean;
  focusedResearchStep?: ResearchStepNumber | null;
}

export const CandidateDetailView: React.FC<CandidateDetailViewProps> = (props) => {
  const tokenIdentityKey = `${props.candidate?.chain ?? props.followUp?.chain ?? ""}:${props.candidate?.contractAddress ?? props.followUp?.contract_address ?? ""}`;
  return <CandidateDetailViewForIdentity key={tokenIdentityKey} {...props} />;
};

const CandidateDetailViewForIdentity: React.FC<CandidateDetailViewProps> = ({
  candidate,
  followUp = null,
  followUpStatus,
  onBackToResults,
  onOpenExternalChecks,
  onOpenResearchChecklistStep,
  onOpenVerificationForResearchStep,
  onBackToResearchPlaybook,
  onOpenFollowUpExternalChecks,
  initialManualVerification,
  onLifecycleChanged,
  initialOwnerPromotionStatus,
  activeTab: controlledActiveTab,
  initialActiveTab = "summary",
  onActiveTabChange,
  focusResearchPlaybook = false,
  focusedResearchStep = null,
}) => {
  const { locale, t } = useProductLocale();
  const [internalActiveTab, setInternalActiveTab] = useState<CandidateDetailTabId>(initialActiveTab);
  const activeTab = controlledActiveTab ?? internalActiveTab;
  const setActiveTab = useCallback((tab: CandidateDetailTabId) => {
    if (controlledActiveTab === undefined) setInternalActiveTab(tab);
    onActiveTabChange?.(tab);
  }, [controlledActiveTab, onActiveTabChange]);
  const [ownerPromotionStatus, setOwnerPromotionStatus] = useState<EstablishedPromotionStatus | null>(
    initialOwnerPromotionStatus ?? null,
  );
  useEffect(() => {
    if (initialOwnerPromotionStatus !== undefined) {
      return;
    }
    const chain = candidate?.chain ?? followUp?.chain;
    const contractAddress = candidate?.contractAddress ?? followUp?.contract_address;
    if (!chain || !contractAddress) return;
    let cancelled = false;
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
        {onBackToResults && <ActionButton variant="secondary" className="candidate-detail-secondary-button" onClick={onBackToResults}>{t("detail.back")}</ActionButton>}
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
        onOpenFollowUpExternalChecks={onOpenFollowUpExternalChecks}
        onOpenResearchChecklistStep={onOpenResearchChecklistStep}
        onOpenVerificationForResearchStep={onOpenVerificationForResearchStep}
        onBackToResearchPlaybook={onBackToResearchPlaybook}
        initialManualVerification={initialManualVerification}
        onLifecycleChanged={onLifecycleChanged}
        activeTab={activeTab}
        onActiveTabChange={setActiveTab}
        focusResearchPlaybook={focusResearchPlaybook}
        focusedResearchStep={focusedResearchStep}
      />
    );
  }
  if (!candidate) return null;

  const basketLabel = candidate.discoveryBasket === "established"
    ? "Established"
    : locale === "pl" ? "Nowe" : "New / Emerging";
  const status = getCandidateStatus(candidate, locale);
  const technicalIdentity = resolveTokenIdentity(candidate.chain, candidate.contractAddress);
  const filterResolution = resolveProductFilterConditions({
    basicFilterStatus: candidate.basicFilterStatus,
    filterReasons: candidate.filterReasons,
  });
  const securityResolution = resolveProductSecurityState(candidate);
  const missingSecurityItems = formatSecurityMissingData(candidate.missingData, locale);
  const filterSummary = candidate.basicFilterStatus === "passed_basic_filter"
    ? t("detail.filterPassedSummary")
    : t("detail.filterRejectedSummary");
  const showSecurityDetails = securityResolution.state === "partial"
    || isCompletedProductSecurityState(securityResolution.state);
  const hasFollowUpOwnership = Boolean(followUp || (ownerPromotionStatus && ownerPromotionStatus.source_layer !== "SCANNER"));

  const workspaceCopy = getTabbedWorkspaceCopy(locale);
  const missingMarketValues = [
    candidate.priceUsd,
    candidate.marketCap,
    candidate.fdvUsd,
    candidate.liquidity,
    candidate.volume24h,
    candidate.volumeMarketCapRatio,
    candidate.pairAgeDays,
  ].filter((value) => value == null).length;
  const completeness = candidate.missingData.length === 0 && missingMarketValues === 0
    ? workspaceCopy.complete
    : candidate.missingData.length + missingMarketValues >= 5
      ? workspaceCopy.missingData
      : workspaceCopy.partial;
  const blockingSummary = lifecycle.blocking_conditions.length > 0
    ? lifecycle.blocking_conditions.map((condition) => lifecycleBlockingLabel(condition, locale)).join(" · ")
    : candidate.basicFilterStatus === "rejected_basic_filter"
      ? t("detail.conditionsNotMet")
      : securityResolution.state === "not_invoked" || securityResolution.state === "unavailable"
        ? workspaceCopy.verificationRequired
        : workspaceCopy.noCurrentBlockers;
  const systemStatus = candidateDetailSystemStatusLabel(lifecycle, locale);
  const nextStep = candidateDetailNextStep(lifecycle, followUp, locale);
  const market = followUp?.market_metrics;
  const marketObservedAt = followUp?.market_observed_at ?? null;
  let activeTabContent: React.ReactNode = null;
  if (activeTab === "summary") {
    activeTabContent = (
      <section className="candidate-summary-tab" aria-labelledby="candidate-summary-heading">
        <header className="candidate-tab-content-heading">
          <h3 id="candidate-summary-heading">{workspaceCopy.tabs.summary}</h3>
          <p>{workspaceCopy.summaryIntro}</p>
        </header>
        <div className="candidate-summary-facts">
          <SummaryFact label={workspaceCopy.whatIsIt} value={`${candidate.symbol} · ${candidate.name || candidate.chain}`} />
          <SummaryFact label={workspaceCopy.radarLayer} value={systemStatus} />
          <SummaryFact label={workspaceCopy.dataCompleteness} value={completeness} tone={completeness === workspaceCopy.complete ? "ready" : "warning"} />
          <SummaryFact label={workspaceCopy.blockers} value={blockingSummary} tone={blockingSummary === workspaceCopy.noCurrentBlockers ? "ready" : "warning"} />
          <SummaryFact label={workspaceCopy.nextResearchStep} value={nextStep} />
        </div>
        <div className="candidate-summary-supporting-grid">
          <section className="candidate-summary-identity" aria-labelledby="summary-identity-heading">
            <h4 id="summary-identity-heading">{t("detail.identity")}</h4>
            <div className="product-detail-grid">
              <DetailField label={t("detail.contract")} value={candidate.contractAddress || t("radar.missingData")} copyValue={candidate.contractAddress} copyLabel={t("verification.copyContract")} mono />
              <DetailField label={t("detail.chain")} value={candidate.chain || t("radar.missingData")} />
              <DetailField label={t("detail.technicalIdentity")} value={technicalIdentity.status === "valid" ? t("detail.technicalIdentityValid") : t("detail.technicalIdentityInvalid")} tone={technicalIdentity.status === "valid" ? "ready" : "warning"} />
              <DetailField label={t("detail.sourceVerification")} value={candidate.addressIdentityVerified ? t("detail.sourceVerificationConfirmed") : t("detail.sourceVerificationRequired")} tone={candidate.addressIdentityVerified ? "ready" : "warning"} />
            </div>
          </section>
          <AIResearchSection chain={candidate.chain} contractAddress={candidate.contractAddress} symbol={candidate.symbol} name={candidate.name} mode="summary" onOpen={() => setActiveTab("ai")} />
        </div>
        {focusedResearchStep ? (
          <ResearchChecklistDetail
            candidate={candidate}
            focusedStep={focusedResearchStep}
            onBackToResearchPlaybook={onBackToResearchPlaybook}
            onOpenVerificationForStep={(step) => onOpenVerificationForResearchStep?.(candidate, step)}
          />
        ) : (
          <ResearchChecklistSummary
            candidate={candidate}
            focusOnMount={focusResearchPlaybook}
            onOpenStep={(step) => {
              if (onOpenResearchChecklistStep) onOpenResearchChecklistStep(candidate, step);
            }}
          />
        )}
        {onOpenExternalChecks && <div className="candidate-summary-actions"><ActionButton variant="secondary" onClick={() => onOpenExternalChecks(candidate)}>{t("detail.openVerification")}</ActionButton></div>}
      </section>
    );
  } else if (activeTab === "observation") {
    activeTabContent = (
      <LifecycleDetailSection
        model={lifecycle}
        followUp={followUp}
        universeVersion={candidate.discoveryBasket === "established" ? candidate.universeVersion : null}
      />
    );
  } else if (activeTab === "market") {
    activeTabContent = (
      <section className="product-detail-section" aria-labelledby="market-heading">
        <SectionHeader id="market-heading" title={t("detail.marketData")} />
        <div className="product-detail-grid market">
          <DetailField label={t("radar.price")} value={formatPrice(market?.price_usd ?? candidate.priceUsd, t("radar.missingData"))} />
          <DetailField label={t("radar.marketCap")} value={formatProductUsd(market?.market_cap_usd ?? candidate.marketCap, locale, t("radar.missingData"))} />
          <DetailField label={t("detail.fdv")} value={formatProductUsd(market?.fdv_usd ?? candidate.fdvUsd, locale, t("radar.missingData"))} />
          <DetailField label={t("radar.liquidity")} value={formatProductUsd(market?.liquidity_usd ?? candidate.liquidity, locale, t("radar.missingData"))} />
          <DetailField label={t("radar.volume24h")} value={formatProductUsd(market?.volume_24h_usd ?? candidate.volume24h, locale, t("radar.missingData"))} />
          <DetailField label={t("radar.ratio")} value={(market?.volume_market_cap_ratio ?? candidate.volumeMarketCapRatio) == null ? t("radar.missingData") : (market?.volume_market_cap_ratio ?? candidate.volumeMarketCapRatio)!.toFixed(4)} />
          <DetailField label={t("radar.pairAge")} value={formatProductPairAge(followUp?.pair_age ?? candidate.pairAgeDays, locale, t("radar.missingData"), { pairCreatedAt: candidate.pairCreatedAt })} />
          <DetailField label={locale === "pl" ? "Dane aktualne na" : "Market data as of"} value={marketObservedAt ? formatProductDateTime(marketObservedAt, locale) : t("app.noData")} />
        </div>
      </section>
    );
  } else if (activeTab === "filters") {
    activeTabContent = (
      <section className="product-detail-section" aria-labelledby="filters-heading">
        <SectionHeader id="filters-heading" title={t("detail.filters")} />
        <div className="product-filter-summary">
          <DetailField
            label={t("detail.status")}
            value={candidate.basicFilterStatus === "passed_basic_filter" ? t("detail.conditionsMet") : t("detail.conditionsNotMet")}
            tone={candidate.basicFilterStatus === "passed_basic_filter" ? "ready" : "warning"}
          />
          <div><span>{t("detail.simpleExplanation")}</span><p>{filterSummary}</p></div>
        </div>
        <FilterFacts resolution={filterResolution} candidate={candidate} locale={locale} historical={false} />
        {(filterResolution.preferredRangeNotes.length > 0 || filterResolution.informationalReasons.length > 0 || filterResolution.unknownReasons.length > 0) && (
          <div className="filter-additional-notes">
            {filterResolution.preferredRangeNotes.length > 0 && <FilterNoteList title={t("detail.preferredRangeNotes")} reasons={filterResolution.preferredRangeNotes} locale={locale} />}
            {(filterResolution.informationalReasons.length > 0 || filterResolution.unknownReasons.length > 0) && (
              <FilterNoteList title={t("detail.additionalFilterInfo")} reasons={[...filterResolution.informationalReasons, ...filterResolution.unknownReasons]} locale={locale} />
            )}
          </div>
        )}
      </section>
    );
  } else if (activeTab === "security") {
    activeTabContent = (
      <>
        <section className="product-detail-section" aria-labelledby="security-heading">
          <SectionHeader id="security-heading" title={t("detail.security")} />
          <div className={`security-state-panel ${securityResolution.state}`}>
            <strong>{getSecurityStateTitle(securityResolution.state, t)}</strong>
            <p>{getSecurityStateDetail(securityResolution.state, candidate.basicFilterStatus, t)}</p>
            {securityResolution.state === "not_invoked" && <p>{t("detail.riskFlagsNotAssessed")}</p>}
            <TechnicalDetails label={t("app.technicalDetails")}>
              <code>security_state={securityResolution.state}; security_label={securityResolution.rawSecurityLabel}; coverage_status={securityResolution.rawCoverageStatus ?? "null"}</code>
            </TechnicalDetails>
          </div>
          {showSecurityDetails && (
            <>
              <h4 className="security-section-heading">{locale === "pl" ? "Potwierdzone / dostępne" : "Confirmed / available"}</h4>
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
                <FlagList title={t("detail.riskFlags")} items={candidate.riskFlags.map((reason) => formatSecurityReason(reason, locale, t))} empty={getEmptyRiskFlagsText(securityResolution.state, t)} tone="critical" />
                {missingSecurityItems.length > 0 && <FlagList title={locale === "pl" ? "Brakujące kontrole" : "Missing checks"} items={missingSecurityItems} empty={t("detail.noMissingData")} tone="warning" />}
              </div>
            </>
          )}
          {onOpenExternalChecks && <div className="product-detail-actions"><ActionButton variant="primary" icon="arrow" iconPosition="end" onClick={() => onOpenExternalChecks(candidate)}>{t("detail.openVerification")}</ActionButton></div>}
          <ManualVerificationStatusCard chain={candidate.chain} contractAddress={candidate.contractAddress} initialRecord={initialManualVerification} />
        </section>
        {!hasFollowUpOwnership && <OwnerFollowUpActionPanel candidate={candidate} onLifecycleChanged={onLifecycleChanged} />}
        {hasFollowUpOwnership && ownerPromotionStatus?.owner_controls_visible && <EstablishedPromotionPanel initialStatus={ownerPromotionStatus} onStatusChange={setOwnerPromotionStatus} onLifecycleChanged={onLifecycleChanged} />}
      </>
    );
  } else if (activeTab === "ai") {
    activeTabContent = <AIResearchSection
      chain={candidate.chain}
      contractAddress={candidate.contractAddress}
      symbol={candidate.symbol}
      name={candidate.name}
      mode="detail"
      active
    />;
  } else if (activeTab === "data") {
    activeTabContent = (
      <div className="candidate-data-sources-tab">
        <section className="product-detail-section data-freshness" aria-labelledby="freshness-heading">
          <SectionHeader id="freshness-heading" title={t("detail.dataFreshness")} />
          <div className="product-detail-grid data">
            <DetailField label={t("followUp.lastChecked")} value={formatProductDateTime(candidate.lastCheckedAt, locale)} />
            <DetailField label={t("detail.pairCreated")} value={candidate.pairCreatedAt ? formatProductDateTime(candidate.pairCreatedAt, locale) : t("radar.missingData")} />
            <DetailField label={t("detail.universeVersion")} value={candidate.discoveryBasket === "established" ? candidate.universeVersion ?? t("radar.missingData") : t("detail.notApplicable")} />
            {candidate.universeEntryIndex != null && <DetailField label={t("detail.universeEntry")} value={String(candidate.universeEntryIndex)} />}
          </div>
        </section>
        <section className="product-detail-section" aria-labelledby="sources-heading">
          <SectionHeader id="sources-heading" title={workspaceCopy.tabs.data} />
          <div className="product-detail-grid data">
            <DetailField label={t("detail.contract")} value={candidate.contractAddress || t("radar.missingData")} copyValue={candidate.contractAddress} copyLabel={t("verification.copyContract")} mono />
            <DetailField label={t("detail.pairAddress")} value={candidate.pairAddress || t("radar.missingData")} copyValue={candidate.pairAddress} copyLabel={t("verification.copyPair")} mono />
            <DetailField label={t("detail.source")} value={candidate.source ? formatProductSourceLabel(candidate.source) : t("radar.missingData")} />
            <DetailField label={t("detail.discoveryMethod")} value={formatDiscoveryMethod(candidate.discoveryMethod, locale)} />
            <DetailField label={t("detail.sourceVerification")} value={candidate.addressIdentityVerified ? t("detail.sourceVerificationConfirmed") : t("detail.sourceVerificationRequired")} tone={candidate.addressIdentityVerified ? "ready" : "warning"} />
            <DetailField label={t("detail.checkedAt")} value={formatProductDateTime(candidate.lastCheckedAt, locale)} />
          </div>
          <TechnicalDetails label={t("app.technicalDetails")}>
            <dl className="product-control-details"><div><dt>{t("detail.runId")}</dt><dd className="mono">{candidate.runId}</dd></div></dl>
          </TechnicalDetails>
        </section>
      </div>
    );
  }

  return (
    <div className="token-detail-workspace" data-active-detail-tab={activeTab}>
      <header className="token-detail-header">
        <div className="token-detail-header-main">
          {onBackToResults && <ActionButton variant="tertiary" className="token-detail-back" onClick={onBackToResults}>{t("detail.back")}</ActionButton>}
          <div className="token-detail-title">
            <span className="candidate-detail-eyebrow">{basketLabel}</span>
            <h2>{candidate.symbol} <small>{candidate.name}</small></h2>
          </div>
          {candidate.discoveryBasket !== "new_emerging" && <StatusBadge tone={candidate.finalLabel === "WATCHLIST" ? "manual" : candidate.basicFilterStatus === "passed_basic_filter" ? "ready" : "warning"}>{status}</StatusBadge>}
        </div>
        <div className="token-detail-header-meta">
          <HeaderFact label={workspaceCopy.radarLayer} value={systemStatus} />
          <HeaderFact label={t("detail.chain")} value={candidate.chain || t("detail.networkMissing")} />
          <HeaderFact label="DEX" value={candidate.dex || t("detail.dexMissing")} />
          <HeaderFact label={workspaceCopy.dataCompleteness} value={completeness} tone={completeness === workspaceCopy.complete ? "ready" : "warning"} />
          <CopyableAddress value={candidate.contractAddress} displayValue={shortenAddress(candidate.contractAddress, t("radar.missingData"))} copyLabel={t("verification.copyContract")} copiedLabel={t("app.copied")} buttonLabel={t("app.copy")} className="token-detail-address" />
        </div>
        <div className="token-detail-next-step">
          <span>{workspaceCopy.nextResearchStep}</span>
          <strong>{nextStep}</strong>
          <PersonalRadarPanel chain={candidate.chain} contractAddress={candidate.contractAddress} onChanged={onLifecycleChanged} placement="detail" />
        </div>
      </header>
      <TokenDetailTabs tabs={CANDIDATE_DETAIL_TAB_IDS.map((id) => ({ id, label: workspaceCopy.tabs[id] }))} activeTab={activeTab} onChange={setActiveTab} idPrefix="candidate" ariaLabel={workspaceCopy.tablistLabel} />
      <TokenDetailTabPanel activeTab={activeTab} idPrefix="candidate">
        {activeTabContent}
      </TokenDetailTabPanel>
    </div>
  );
};

function SummaryFact({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "ready" | "warning";
}) {
  return <div className={`candidate-summary-fact ${tone}`}><span>{label}</span><strong>{value}</strong></div>;
}

function HeaderFact({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "ready" | "warning" }) {
  return <span className={`token-detail-header-fact ${tone}`}><small>{label}</small><strong>{value}</strong></span>;
}

function getTabbedWorkspaceCopy(locale: ProductLocale) {
  if (locale === "pl") {
    return {
      tablistLabel: "Zakładki szczegółów tokena",
      summaryIntro: "Najważniejsze odpowiedzi o tokenie, kompletności danych, blokadach i następnym kroku.",
      whatIsIt: "Co to jest?",
      radarLayer: "Status systemowy",
      dataCompleteness: "Kompletność danych",
      blockers: "Główne blokady",
      nextResearchStep: "Następny krok",
      complete: "Dane bazowe kompletne",
      partial: "Częściowo dostępne",
      missingData: "Brak danych",
      verificationRequired: "Wymagana weryfikacja",
      noCurrentBlockers: "Brak bieżących blokad",
      available: "Dostępne",
      tabs: {
        summary: "Podsumowanie",
        observation: "Obserwacja",
        market: "Dane rynkowe",
        filters: "Filtry",
        security: "Bezpieczeństwo",
        ai: "Analiza AI",
        data: "Dane i źródła",
      },
    } as const;
  }
  return {
    tablistLabel: "Token detail tabs",
    summaryIntro: "The essential answers about the token, data completeness, blockers and next step.",
    whatIsIt: "What is it?",
    radarLayer: "System status",
    dataCompleteness: "Data completeness",
    blockers: "Main blockers",
    nextResearchStep: "Next step",
    complete: "Base data complete",
    partial: "Partially available",
    missingData: "No data",
    verificationRequired: "Verification required",
    noCurrentBlockers: "No current blockers",
    available: "Available",
    tabs: {
      summary: "Summary",
      observation: "Observation",
      market: "Market data",
      filters: "Filters",
      security: "Security",
      ai: "AI analysis",
      data: "Data and sources",
    },
  } as const;
}

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
  const observation = campUserObservation(model, followUp, locale);
  return (
    <section className="product-detail-section lifecycle-detail-section" aria-labelledby="follow-up-heading">
      <SectionHeader id="follow-up-heading" title={locale === "pl" ? "Przepływ obserwacji" : "Observation flow"} />
      <TokenLifecycleFlow model={model} showCheckpoints={Boolean(followUp)} campUser />
      <div className="token-lifecycle-status active" role="status" data-interaction="status">
        <div>
          <strong>{observation.statusTitle}</strong>
          <p>{observation.statusDetail}</p>
        </div>
        <dl>
          <div><dt>{locale === "pl" ? "Następny krok" : "Next step"}</dt><dd>{observation.nextStep}</dd></div>
          <div><dt>{locale === "pl" ? "Obecna blokada" : "Current blocker"}</dt><dd>{observation.blocker}</dd></div>
        </dl>
      </div>
      <div className="lifecycle-detail-grid">
        <DetailField label={locale === "pl" ? "Gdzie jest teraz" : "Current position"} value={observation.position} />
        <DetailField label={locale === "pl" ? "Jak trafił na ten etap" : "How it reached this stage"} value={observation.arrival} />
        <DetailField label={locale === "pl" ? "Obecny wynik filtrów" : "Current filter result"} value={observation.filters} tone={observation.filtersReady ? "ready" : "warning"} />
        <DetailField label={locale === "pl" ? "Status bezpieczeństwa" : "Security status"} value={observation.security} tone={observation.needsVerification ? "warning" : "ready"} />
        <DetailField label={locale === "pl" ? "Następny krok" : "Next step"} value={observation.nextStep} tone={observation.needsVerification ? "warning" : "neutral"} />
        <DetailField label={locale === "pl" ? "Obecna blokada" : "Current blocker"} value={observation.blocker} tone={observation.blocker === observation.noBlocker ? "ready" : "warning"} />
      </div>
      {followUp && (
        <div className="lifecycle-source-facts">
          <DetailField label={t("followUp.firstSeen")} value={formatProductDateTime(followUp.first_seen_at, locale)} />
          <DetailField label={t("followUp.lastChecked")} value={followUp.last_checked_at ? formatProductDateTime(followUp.last_checked_at, locale) : t("app.noData")} />
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
  onOpenFollowUpExternalChecks,
  onOpenResearchChecklistStep,
  onOpenVerificationForResearchStep,
  onBackToResearchPlaybook,
  initialManualVerification,
  onLifecycleChanged,
  activeTab,
  onActiveTabChange,
  focusResearchPlaybook,
  focusedResearchStep,
}: {
  followUp: FollowUpPublicEntry;
  lifecycle: TokenLifecycleViewModel;
  ownerPromotionStatus: EstablishedPromotionStatus | null;
  onOwnerPromotionStatusChange: (status: EstablishedPromotionStatus) => void;
  onBackToResults?: () => void;
  onOpenFollowUpExternalChecks?: (followUp: FollowUpPublicEntry) => void;
  onOpenResearchChecklistStep?: (candidate: UiTokenCandidate | FollowUpPublicEntry, step: ResearchStepNumber) => void;
  onOpenVerificationForResearchStep?: (candidate: UiTokenCandidate | FollowUpPublicEntry, step: ResearchStepNumber) => void;
  onBackToResearchPlaybook?: () => void;
  initialManualVerification?: PrivateVerificationRecord | null;
  onLifecycleChanged?: () => void | Promise<void>;
  activeTab: CandidateDetailTabId;
  onActiveTabChange: (tab: CandidateDetailTabId) => void;
  focusResearchPlaybook: boolean;
  focusedResearchStep: ResearchStepNumber | null;
}) {
  const { locale, t } = useProductLocale();
  const copy = getTabbedWorkspaceCopy(locale);
  const symbol = followUp.symbol ?? t("radar.missingData");
  const systemStatus = candidateDetailSystemStatusLabel(lifecycle, locale);
  const nextStep = candidateDetailNextStep(lifecycle, followUp, locale);
  const filterResolution = resolveProductFilterConditions({
    basicFilterStatus: followUp.filter_status,
    filterReasons: followUp.filter_reasons,
  });
  const advisoryReasons = [
    ...filterResolution.preferredRangeNotes,
    ...filterResolution.informationalReasons,
  ];
  const missingSecurityItems = formatSecurityMissingData(followUp.missing_data, locale);
  const marketMissing = Object.values(followUp.market_metrics).filter((value) => value == null).length;
  const completeness = followUp.missing_data.length === 0 && marketMissing === 0 ? copy.complete : copy.partial;
  const researchCandidate = followUpToResearchCandidate(followUp);
  let content: React.ReactNode = null;
  if (activeTab === "summary") {
    content = (
      <section className="candidate-summary-tab" aria-labelledby="candidate-summary-heading">
        <header className="candidate-tab-content-heading">
          <h3 id="candidate-summary-heading">{copy.tabs.summary}</h3>
          <p>{copy.summaryIntro}</p>
        </header>
        <div className="candidate-summary-facts">
          <SummaryFact label={copy.whatIsIt} value={`${symbol} · ${followUp.display_name ?? followUp.chain}`} />
          <SummaryFact label={copy.radarLayer} value={systemStatus} />
          <SummaryFact label={copy.dataCompleteness} value={completeness} tone="warning" />
          <SummaryFact label={copy.blockers} value={followUp.missing_data.length > 0 ? copy.verificationRequired : copy.noCurrentBlockers} tone={followUp.missing_data.length > 0 ? "warning" : "ready"} />
          <SummaryFact label={copy.nextResearchStep} value={nextStep} />
        </div>
        <div className="candidate-summary-supporting-grid">
          <section className="candidate-summary-identity" aria-labelledby="summary-identity-heading">
            <h4 id="summary-identity-heading">{t("detail.identity")}</h4>
            <div className="product-detail-grid">
              <DetailField label={t("detail.contract")} value={followUp.contract_address} copyValue={followUp.contract_address} copyLabel={t("verification.copyContract")} mono />
              <DetailField label={t("detail.chain")} value={followUp.chain} />
            </div>
          </section>
          <AIResearchSection chain={followUp.chain} contractAddress={followUp.contract_address} symbol={followUp.symbol ?? ""} name={followUp.display_name ?? followUp.symbol ?? ""} mode="summary" onOpen={() => onActiveTabChange("ai")} />
        </div>
        {focusedResearchStep ? (
          <ResearchChecklistDetail
            candidate={researchCandidate}
            focusedStep={focusedResearchStep}
            onBackToResearchPlaybook={onBackToResearchPlaybook}
            onOpenVerificationForStep={(step) => onOpenVerificationForResearchStep?.(followUp, step)}
          />
        ) : (
          <ResearchChecklistSummary
            candidate={researchCandidate}
            focusOnMount={focusResearchPlaybook}
            onOpenStep={(step) => onOpenResearchChecklistStep?.(followUp, step)}
          />
        )}
      </section>
    );
  } else if (activeTab === "observation") {
    content = <LifecycleDetailSection model={lifecycle} followUp={followUp} universeVersion={null} />;
  } else if (activeTab === "market") {
    content = (
      <section className="product-detail-section" aria-labelledby="follow-up-data-heading">
        <SectionHeader id="follow-up-data-heading" title={t("detail.marketData")} />
        <div className="product-detail-grid market">
          <DetailField label={t("radar.price")} value={formatPrice(followUp.market_metrics.price_usd, t("radar.missingData"))} />
          <DetailField label={t("radar.marketCap")} value={formatProductUsd(followUp.market_metrics.market_cap_usd, locale, t("radar.missingData"))} />
          <DetailField label={t("radar.liquidity")} value={formatProductUsd(followUp.market_metrics.liquidity_usd, locale, t("radar.missingData"))} />
          <DetailField label={t("radar.volume24h")} value={formatProductUsd(followUp.market_metrics.volume_24h_usd, locale, t("radar.missingData"))} />
          <DetailField label={locale === "pl" ? "Dane aktualne na" : "Market data as of"} value={followUp.market_observed_at ? formatProductDateTime(followUp.market_observed_at, locale) : t("app.noData")} />
        </div>
      </section>
    );
  } else if (activeTab === "filters") {
    content = (
      <section className="product-detail-section" aria-labelledby="filters-heading">
        <SectionHeader id="filters-heading" title={t("detail.filters")} />
        <DetailField label={locale === "pl" ? "Wynik przy ostatnim checkpointcie" : "Result at the last checkpoint"} value={formatFollowUpFilterStatus(followUp.filter_status, locale)} detail={followUp.filter_evaluated_at ? formatProductDateTime(followUp.filter_evaluated_at, locale) : undefined} tone={followUp.filter_status === "passed_basic_filter" ? "ready" : "warning"} />
        <p className="product-filter-historical-note">{locale === "pl" ? "To zapisany wynik filtra z ostatniego checkpointu. Obecne dane rynkowe mogą się od niego różnić i nie zmieniają automatycznie etapu obserwacji." : "This is the recorded filter result from the last checkpoint. Current market data can differ and does not automatically change the observation stage."}</p>
        <FilterFacts resolution={filterResolution} candidate={researchCandidate} locale={locale} historical />
        {filterResolution.hardFailureReasons.length > 0 && (
          <FilterNoteList title={t("detail.conditionsNotMet")} reasons={filterResolution.hardFailureReasons} locale={locale} />
        )}
        {advisoryReasons.length > 0 && (
          <FilterNoteList title={t("detail.preferredRangeNotes")} reasons={advisoryReasons} locale={locale} />
        )}
        {filterResolution.missingDataReasons.length > 0 && (
          <FilterNoteList title={t("detail.missingData")} reasons={filterResolution.missingDataReasons} locale={locale} />
        )}
        {filterResolution.unknownReasons.length > 0 && (
          <FilterNoteList title={t("detail.additionalFilterInfo")} reasons={filterResolution.unknownReasons} locale={locale} />
        )}
      </section>
    );
  } else if (activeTab === "security") {
    content = (
      <>
        <section className="product-detail-section" aria-labelledby="security-heading">
          <SectionHeader id="security-heading" title={t("detail.security")} />
          <DetailField label={t("followUp.securityStatus")} value={formatFollowUpSecurityStatus(followUp.security_status, locale)} tone="warning" />
          <h4 className="security-section-heading">{locale === "pl" ? "Potwierdzone / dostępne" : "Confirmed / available"}</h4>
          <p>{locale === "pl" ? "Ta zachowana obserwacja nie zawiera szczegółowych automatycznych kontroli bezpieczeństwa." : "This retained observation does not include detailed automated security controls."}</p>
          <h4 className="security-section-heading">{locale === "pl" ? "Brakujące kontrole" : "Missing checks"}</h4>
          <FlagList title={locale === "pl" ? "Do uzupełnienia" : "To complete"} items={missingSecurityItems} empty={t("detail.noMissingData")} tone="warning" />
          {onOpenFollowUpExternalChecks && <div className="product-detail-actions"><ActionButton variant="primary" icon="arrow" iconPosition="end" onClick={() => onOpenFollowUpExternalChecks(followUp)}>{t("detail.openVerification")}</ActionButton></div>}
          <ManualVerificationStatusCard chain={followUp.chain} contractAddress={followUp.contract_address} initialRecord={initialManualVerification} />
        </section>
        {ownerPromotionStatus?.owner_controls_visible && (
          <EstablishedPromotionPanel initialStatus={ownerPromotionStatus} onStatusChange={onOwnerPromotionStatusChange} onLifecycleChanged={onLifecycleChanged} />
        )}
      </>
    );
  } else if (activeTab === "ai") {
    content = (
      <AIResearchSection
        chain={followUp.chain}
        contractAddress={followUp.contract_address}
        symbol={followUp.symbol ?? ""}
        name={followUp.display_name ?? followUp.symbol ?? ""}
        mode="detail"
        active
      />
    );
  } else if (activeTab === "data") {
    content = (
      <div className="candidate-data-sources-tab">
        <section className="product-detail-section" aria-labelledby="freshness-heading">
          <SectionHeader id="freshness-heading" title={t("detail.dataFreshness")} />
          <div className="product-detail-grid data">
            <DetailField label={t("followUp.firstSeen")} value={formatProductDateTime(followUp.first_seen_at, locale)} />
            <DetailField label={t("followUp.lastChecked")} value={followUp.last_checked_at ? formatProductDateTime(followUp.last_checked_at, locale) : t("app.noData")} />
            <DetailField label={locale === "pl" ? "Następny checkpoint" : "Next checkpoint"} value={followUp.next_check_at ? formatProductDateTime(followUp.next_check_at, locale) : t("app.noData")} />
          </div>
        </section>
        <section className="product-detail-section" aria-labelledby="sources-heading">
          <SectionHeader id="sources-heading" title={copy.tabs.data} />
          <div className="product-detail-grid data">
            <DetailField label={t("detail.contract")} value={followUp.contract_address} copyValue={followUp.contract_address} copyLabel={t("verification.copyContract")} mono />
            <DetailField label={t("detail.chain")} value={followUp.chain} />
            <DetailField label={locale === "pl" ? "Pochodzenie danych rynkowych" : "Market-data provenance"} value={locale === "pl" ? "Źródło tej zachowanej obserwacji nie zostało zapisane." : "The source of this retained observation was not stored."} tone="warning" />
            <DetailField label={locale === "pl" ? "Dane rynkowe z" : "Market data captured"} value={followUp.market_observed_at ? formatProductDateTime(followUp.market_observed_at, locale) : t("app.noData")} />
          </div>
          <p>{locale === "pl" ? "Widoczne wartości pochodzą z ostatniej prawidłowej, zachowanej obserwacji Follow-up. Ręczne linki weryfikacyjne są miejscem sprawdzenia danych, a nie automatycznym źródłem tych wartości." : "The displayed values come from the latest valid retained Follow-up observation. Manual verification links are places to check data, not an automatic source of these values."}</p>
        </section>
      </div>
    );
  }
  return (
    <div className="token-detail-workspace follow-up-only-detail" data-active-detail-tab={activeTab}>
      <header className="token-detail-header">
        <div className="token-detail-header-main">
          {onBackToResults && <ActionButton variant="tertiary" className="token-detail-back" onClick={onBackToResults}>{t("detail.back")}</ActionButton>}
          <div className="token-detail-title">
            <span className="candidate-detail-eyebrow">{locale === "pl" ? "Dalsza obserwacja" : "Follow-up"}</span>
            <h2>{symbol} <small>{followUp.display_name ?? ""}</small></h2>
          </div>
          <StatusBadge tone="neutral">{systemStatus}</StatusBadge>
        </div>
        <div className="token-detail-header-meta">
          <HeaderFact label={copy.radarLayer} value={systemStatus} />
          <HeaderFact label={t("detail.chain")} value={followUp.chain} />
          <HeaderFact label={copy.dataCompleteness} value={completeness} tone="warning" />
          <CopyableAddress value={followUp.contract_address} displayValue={shortenAddress(followUp.contract_address, t("radar.missingData"))} copyLabel={t("verification.copyContract")} copiedLabel={t("app.copied")} buttonLabel={t("app.copy")} className="token-detail-address" />
        </div>
        <div className="token-detail-next-step">
          <span>{copy.nextResearchStep}</span>
          <strong>{nextStep}</strong>
          <PersonalRadarPanel chain={followUp.chain} contractAddress={followUp.contract_address} onChanged={onLifecycleChanged} placement="detail" />
        </div>
      </header>
      <TokenDetailTabs tabs={CANDIDATE_DETAIL_TAB_IDS.map((id) => ({ id, label: copy.tabs[id] }))} activeTab={activeTab} onChange={onActiveTabChange} idPrefix="candidate" ariaLabel={copy.tablistLabel} />
      <TokenDetailTabPanel activeTab={activeTab} idPrefix="candidate">
        {content}
      </TokenDetailTabPanel>
    </div>
  );
}

function candidateDetailSystemStatusLabel(model: TokenLifecycleViewModel, locale: ProductLocale): string {
  // CANDIDATE_FOR_ESTABLISHED is a legacy Follow-up store value. CAMP_USER sees
  // the system basket it is actually in, not that internal promotion label.
  if (model.current_stage === "candidate") return locale === "pl" ? "Dalsza obserwacja" : "Further observation";
  return lifecycleStageLabel(model.current_stage, locale);
}

function candidateDetailNextStep(model: TokenLifecycleViewModel, followUp: FollowUpPublicEntry | null, locale: ProductLocale): string {
  if (requiresCampUserVerification(followUp)) {
    return locale === "pl" ? "Dokończ weryfikację" : "Complete verification";
  }
  if (model.current_stage === "candidate") return locale === "pl" ? "Poczekaj na ponowną ocenę systemu" : "Wait for the next system reassessment";
  return lifecycleActionLabel(model.next_action_type, locale);
}

function campUserObservation(model: TokenLifecycleViewModel, followUp: FollowUpPublicEntry | null, locale: ProductLocale) {
  const filtersReady = followUp?.filter_status === "passed_basic_filter";
  const needsVerification = requiresCampUserVerification(followUp);
  const position = candidateDetailSystemStatusLabel(model, locale);
  const noBlocker = locale === "pl" ? "Brak bieżącej blokady" : "No current blocker";
  const blocker = needsVerification
    ? (locale === "pl" ? "Brakuje pełnej weryfikacji" : "Full verification is still required")
    : model.current_stage === "candidate"
      ? (locale === "pl" ? "System ocenia pozostałe warunki przejścia" : "The system is evaluating the remaining transition conditions")
      : model.blocking_conditions.length > 0
        ? model.blocking_conditions.map((condition) => lifecycleBlockingLabel(condition, locale)).join(" · ")
        : noBlocker;
  const filters = filtersReady
    ? (locale === "pl" ? "Podstawowe filtry spełnione" : "Basic filters passed")
    : followUp?.filter_status === "rejected_basic_filter"
      ? (locale === "pl" ? "Podstawowe filtry niespełnione" : "Basic filters not met")
      : (locale === "pl" ? "Wynik filtrów wymaga ponownej oceny" : "Filter result needs reassessment");
  const security = needsVerification
    ? (locale === "pl" ? "Dane częściowe; wymagana weryfikacja" : "Partial data; verification required")
    : followUp?.security_status === "CHECKED"
      ? (locale === "pl" ? "Weryfikacja kompletna" : "Verification complete")
      : (locale === "pl" ? "Status bezpieczeństwa wymaga potwierdzenia" : "Security status needs confirmation");
  const nextStep = candidateDetailNextStep(model, followUp, locale);
  const arrival = filtersReady
    ? (locale === "pl" ? "Spełnił podstawowe warunki i przeszedł do dalszej obserwacji." : "It met the basic conditions and moved into further observation.")
    : (locale === "pl" ? "Przeszedł do dalszej obserwacji, aby system mógł ponownie ocenić dane." : "It moved into further observation so the system can reassess the data.");
  const statusTitle = filtersReady ? (locale === "pl" ? "Warunki rynkowe spełnione" : "Market conditions met") : position;
  const statusDetail = needsVerification
    ? (locale === "pl" ? "Brakuje pełnej weryfikacji. Po jej uzupełnieniu system ponownie oceni warunki przejścia do Głównego Radaru." : "Full verification is still required. Once it is complete, the system will reassess the conditions for Main Radar.")
    : (locale === "pl" ? "System ocenia warunki przejścia do Głównego Radaru w centralnym cyklu danych." : "The system evaluates Main Radar conditions in the central data cycle.");
  return { position, arrival, filters, filtersReady, security, needsVerification, nextStep, blocker, noBlocker, statusTitle, statusDetail };
}

function requiresCampUserVerification(followUp: FollowUpPublicEntry | null): boolean {
  return Boolean(followUp && (followUp.missing_data.length > 0 || ["PARTIAL", "MANUAL_VERIFICATION_REQUIRED"].includes(followUp.security_status)));
}

function SectionHeader({ id, title }: { id: string; title: string }) {
  return <header className="product-detail-section-header"><h3 id={id}>{title}</h3></header>;
}

function DetailField({
  label,
  value,
  copyValue,
  copyLabel,
  detail,
  mono = false,
  tone = "neutral",
}: {
  label: string;
  value: string;
  copyValue?: string;
  copyLabel?: string;
  detail?: string;
  mono?: boolean;
  tone?: "neutral" | "ready" | "warning" | "critical";
}) {
  const { t } = useProductLocale();
  return (
    <div className={`product-detail-field ${tone}`}>
      <span>{label}</span>
      <div className={mono ? "mono" : ""} title={value}>{value}</div>
      {detail && <small>{detail}</small>}
      {copyValue && (
        <CopyButton
          value={copyValue}
          label={copyLabel ?? t("detail.copyLabel", { label })}
          copiedLabel={t("app.copied")}
        />
      )}
    </div>
  );
}

function FilterNoteList({
  title,
  reasons,
  locale,
}: {
  title: string;
  reasons: string[];
  locale: ProductLocale;
}) {
  return (
    <div className="condition-list neutral">
      <strong>{title}</strong>
      <ul>{reasons.map((reason) => {
        const presentation = formatFilterReason(reason, locale);
        return (
          <li key={reason}>
            {presentation.summary}
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

/** A presentation of the five canonical basic filters. Its state comes from
 * resolveProductFilterConditions; it never recalculates lifecycle eligibility. */
function FilterFacts({
  resolution,
  candidate,
  locale,
  historical,
}: {
  resolution: ReturnType<typeof resolveProductFilterConditions>;
  candidate: Pick<UiTokenCandidate, "marketCap" | "fdvUsd" | "volume24h" | "liquidity" | "volumeMarketCapRatio" | "pairAgeDays">;
  locale: ProductLocale;
  historical: boolean;
}) {
  const { t } = useProductLocale();
  const missing = t("radar.missingData");
  const displayConditions = historical ? resolveCurrentProductFilterConditions(candidate) : resolution.conditions;
  const status = (state: BasicFilterConditionState) => (
    state === "passed" ? (locale === "pl" ? "Spełniony" : "Met")
      : state === "failed" ? (locale === "pl" ? "Niespełniony" : "Not met")
        : (locale === "pl" ? "Brak rozstrzygnięcia" : "Not resolved")
  );
  const value = (category: BasicFilterCategory): string => {
    if (category === "market_cap") return formatProductUsd(candidate.marketCap ?? candidate.fdvUsd, locale, missing);
    if (category === "volume_24h") return formatProductUsd(candidate.volume24h, locale, missing);
    if (category === "liquidity") return formatProductUsd(candidate.liquidity, locale, missing);
    if (category === "volume_market_cap_ratio") return candidate.volumeMarketCapRatio == null ? missing : `${(candidate.volumeMarketCapRatio * 100).toFixed(2)}%`;
    return candidate.pairAgeDays == null ? missing : (locale === "pl" ? `${candidate.pairAgeDays} dni` : `${candidate.pairAgeDays} days`);
  };
  return <section className="filter-facts" aria-label={locale === "pl" ? "Podstawowe filtry" : "Basic filters"} data-filter-facts={historical ? "checkpoint" : "snapshot"}>
    <h4>{locale === "pl" ? "Podstawowe filtry" : "Basic filters"}</h4>
    <div className="product-detail-grid filter-facts-grid">
      {BASIC_FILTER_CATEGORIES.map((category) => {
        const condition = displayConditions.find((item) => item.category === category)!;
        const requirement = getProductFilterRequirement(category);
        return <DetailField
          key={category}
          label={formatBasicFilterCategory(category, t)}
          value={`${value(category)} · ${status(condition.state)}`}
          detail={`${historical ? (locale === "pl" ? "Aktualna ocena informacyjna — nie zmienia etapu obserwacji. " : "Current informational assessment — it does not change the observation stage. ") : ""}${locale === "pl" ? "Wymaganie" : "Required"}: ${localizeFilterRequirement(requirement.hard, locale)}${requirement.preferred ? ` · ${locale === "pl" ? "Preferowane, nie blokuje" : "Preferred, non-blocking"}: ${localizeFilterRequirement(requirement.preferred, locale)}` : ""}`}
          tone={condition.state === "passed" ? "ready" : condition.state === "failed" ? "warning" : "neutral"}
        />;
      })}
    </div>
  </section>;
}

function localizeFilterRequirement(value: string, locale: ProductLocale): string {
  return locale === "pl" ? value.replace("days", "dni") : value;
}

function formatSecurityMissingData(values: readonly string[], locale: ProductLocale): string[] {
  return [...new Set(values.map((value) => formatSecurityMissingItem(value, locale)).filter((value): value is string => value !== null))];
}

function formatSecurityMissingItem(value: string, locale: ProductLocale): string | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === "honeypot_source" || normalized === "goplus_source") return null;
  const pl = locale === "pl";
  if (normalized === "honeypot_status" || normalized === "honeypot_missing") return pl ? "Honeypot — Brak wyniku" : "Honeypot — No result";
  if (normalized === "liquidity_locked" || normalized === "liquidity_lock_missing") return pl ? "Blokada płynności — Brak danych" : "Liquidity lock — No data";
  if (normalized === "top_10_wallets_pct" || normalized === "top_10_wallets_pct_missing") return pl ? "Udział Top 10 portfeli — Brak danych" : "Top 10 wallet share — No data";
  if (normalized === "top_wallet_pct" || normalized === "top_wallet_pct_missing") return pl ? "Udział największego portfela — Brak danych" : "Largest wallet share — No data";
  if (normalized === "ownership_status" || normalized === "ownership_unknown") return pl ? "Status właściciela — Brak danych" : "Ownership status — No data";
  if (normalized === "security_not_checked") return pl ? "Weryfikacja bezpieczeństwa — Nie rozpoczęto" : "Security verification — Not started";
  return pl ? "Inne dane bezpieczeństwa wymagają uzupełnienia" : "Other security data needs completion";
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

function shortenAddress(value: string, missing: string): string {
  if (!value) return missing;
  if (value.length <= 24) return value;
  return `${value.slice(0, 12)}…${value.slice(-10)}`;
}

function humanizeReason(value: string): string {
  const normalized = value.replaceAll("_", " ").trim();
  return normalized.length === 0 ? value : normalized.charAt(0).toUpperCase() + normalized.slice(1);
}
