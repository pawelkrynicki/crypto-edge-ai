import React, { useMemo, useState } from "react";
import {
  formatFollowUpLifecycleStatus,
  formatProductAge,
  formatProductDateTime,
  formatProductElapsedSince,
  formatProductPairAge,
  formatProductUsd,
  PRODUCT_TRANSLATIONS,
  useProductLocale,
  type ProductLocale,
} from "../productI18n";
import {
  formatProductSourceLabel,
  formatStatusReason,
} from "../productPresentation";
import {
  resolveProductSourceHealth,
  type ProductSourceHealthResolution,
} from "../productSourceHealth";
import { presentProductSourceHealth } from "../productSourceHealthPresentation";
import {
  isCompletedProductSecurityState,
  resolveProductSecurityState,
  type ProductSecurityState,
} from "../productSecurityResolver";
import {
  findFollowUpByIdentity,
  resolveTokenLifecycle,
} from "../tokenLifecycle";
import type {
  ProductReadinessOutput,
  ScannerDiscoveryMetadata,
  UiTokenCandidate,
} from "../types/scannerTypes";
import type { FollowUpPublicEntry, FollowUpPublicStatus } from "../types/followUpTypes";
import type { LifecycleRadarCard, LifecycleRadarView, LifecycleSummary, LifecycleTokenView } from "../types/lifecycleTypes";
import type { EstablishedUniverseStatus } from "../services/establishedUniverseStatusDataSource";
import { ActionButton, CopyableAddress, ReadOnlyCard, StatusBadge, TechnicalDetails } from "./ProductUi";
import { AIResearchRadarStatus } from "./AIResearchSection";
import { PersonalRadarPanel } from "./PersonalRadarPanel";
import {
  lifecycleStageLabel,
  TokenCheckpointAxis,
  TokenLifecycleCardSummary,
  TokenLifecycleFlow,
} from "./TokenLifecycleFlow";

type BasketId = "new_emerging" | "maturing" | "established";
type Tone = "neutral" | "accent" | "warning" | "critical" | "ready";

interface CandidateResultsViewProps {
  candidates: UiTokenCandidate[];
  metadata?: ScannerDiscoveryMetadata | null;
  readiness?: ProductReadinessOutput | null;
  generatedAt?: string | null;
  ageSeconds?: number | null;
  freshnessStatus?: "FRESH" | "STALE" | null;
  sourceIds?: string[];
  sourceHealth?: ProductSourceHealthResolution;
  scannerUnavailableReasonCode?: string | null;
  followUpStatus?: FollowUpPublicStatus | null;
  lifecycleSummary?: LifecycleSummary | null;
  lifecycleRadar?: LifecycleRadarView | null;
  preferredLifecycleBasket?: BasketId | null;
  onLifecycleBasketChange?: (basket: BasketId) => void;
  onLifecycleChanged?: (view: LifecycleTokenView) => void | Promise<void>;
  onLoadMoreLifecycle?: (cursor: string) => void;
  followUpEntries?: FollowUpPublicEntry[];
  establishedUniverseStatus?: EstablishedUniverseStatus | null;
  onOpenCandidate?: (candidateId: string) => void;
  onOpenFollowUp?: (entryId: string) => void;
  onOpenLifecycleCard?: (identity: { chain: string; contract_address: string }) => void;
  onOpenExternalChecks?: (candidate: UiTokenCandidate) => void;
}

export const CandidateResultsView: React.FC<CandidateResultsViewProps> = ({
  candidates,
  metadata,
  readiness,
  generatedAt = null,
  ageSeconds = null,
  freshnessStatus = null,
  sourceIds = [],
  sourceHealth,
  scannerUnavailableReasonCode = null,
  followUpStatus = null,
  lifecycleSummary = null,
  lifecycleRadar = null,
  preferredLifecycleBasket = null,
  onLifecycleBasketChange,
  onLifecycleChanged,
  onLoadMoreLifecycle,
  followUpEntries = [],
  establishedUniverseStatus = null,
  onOpenCandidate,
  onOpenFollowUp,
  onOpenLifecycleCard,
  onOpenExternalChecks,
}) => {
  const { locale, t } = useProductLocale();
  const newCandidates = useMemo(
    () => candidates.filter((candidate) => candidate.discoveryBasket === "new_emerging"
      && findFollowUpByIdentity(followUpEntries, candidate) === null),
    [candidates, followUpEntries],
  );
  const establishedCandidates = useMemo(
    () => candidates.filter((candidate) => candidate.discoveryBasket === "established"),
    [candidates],
  );
  const displayedFollowUpEntries = followUpEntries.filter((entry) => (
    entry.lifecycle_status !== "ESTABLISHED"
    && entry.lifecycle_status !== "ARCHIVED"
    && !entry.established_membership
  ));
  const establishedFollowUpEntries = followUpEntries.filter((entry) => (
    entry.lifecycle_status === "ESTABLISHED" || entry.established_membership
  ));
  const [activeBasket, setActiveBasket] = useState<BasketId>(() => preferredLifecycleBasket ?? resolveInitialBasket(
    candidates,
    followUpEntries,
    Boolean(scannerUnavailableReasonCode),
  ));
  const [lifecycleGuideOpen, setLifecycleGuideOpen] = useState(false);
  const visibleBasket = activeBasket;
  const selectBasket = (basket: BasketId) => {
    setActiveBasket(basket);
    onLifecycleBasketChange?.(basket);
  };

  const establishedEntries = lifecycleRadar?.main_radar.total
    ?? establishedUniverseStatus?.entries_enabled
    ?? metadata?.established?.entries_enabled
    ?? establishedCandidates.length;
  const followUpTotal = lifecycleSummary?.system_follow_up_total ?? followUpStatus?.entries_total ?? 0;
  const followUpDisplayed = lifecycleRadar?.summary.follow_up_displayed ?? lifecycleSummary?.follow_up_displayed ?? displayedFollowUpEntries.length;
  const establishedAfterFilters = metadata?.established?.candidates_after_filters
    ?? establishedCandidates.filter((candidate) => candidate.basicFilterStatus === "passed_basic_filter").length;
  const securityChecked = establishedCandidates.filter((candidate) => (
    isCompletedProductSecurityState(resolveProductSecurityState(candidate).state)
  )).length;
  const freshness = getFreshness(ageSeconds, freshnessStatus, locale);
  const resolvedSourceHealth = sourceHealth
    ?? resolveProductSourceHealth({ metadata, readiness, sourceIds });
  const sourceState = presentProductSourceHealth(resolvedSourceHealth, locale, "summary");
  const stale = freshnessStatus === "STALE" || (ageSeconds !== null && ageSeconds > 1800);
  const privateViewCopy = locale === "pl" ? "TwĂłj prywatny widok" : "Your private view";

  return (
    <div className="candidate-results-view product-radar">
      {stale && generatedAt && (
        <section className="product-stale-warning" role="status">
          <strong>{t("status.delayed")}</strong>
          <p>{t("radar.staleWarning")}</p>
          {ageSeconds !== null && <small>{t("radar.staleAge", { age: formatProductAge(ageSeconds, locale) })}</small>}
        </section>
      )}

      <section className="product-radar-intro">
        <div>
          <span className="candidate-results-eyebrow">{t("radar.eyebrow")}</span>
          <h3>{t("radar.title")}</h3>
          <p>{t("radar.intro")}</p>
        </div>
      </section>

      <section className="product-summary-grid primary" aria-label={t("radar.summary")}>
        <SummaryCard label={t("radar.newProjects")} value={String(lifecycleSummary?.system_new_total ?? newCandidates.length)} detail={lifecycleSummary ? t("lifecycle.persistentNewInbox") : t("radar.observationOnly")} />
        <SummaryCard label={t("lifecycle.totalObserved")} value={String(followUpTotal)} detail={t("followUp.totalCountDetail")} />
        <SummaryCard label={t("lifecycle.actionDueNow")} value={String(lifecycleSummary?.follow_up_action_due ?? followUpStatus?.due_count ?? 0)} detail={t("lifecycle.checkpointsAction")} />
        <SummaryCard label={t("lifecycle.mainRadarCandidates")} value={String(lifecycleSummary?.follow_up_candidates_ready ?? followUpStatus?.candidate_count ?? 0)} detail={t("followUp.candidateCountDetail")} tone="accent" />
        <SummaryCard label={t("lifecycle.displayedNow")} value={String(followUpDisplayed)} detail={t("followUp.displayedCountDetail")} />
        <SummaryCard label={t("radar.establishedEntries")} value={String(establishedEntries)} detail={t("radar.activeUniverseAddresses")} />
        <SummaryCard
          label={t("app.generated")}
          value={generatedAt ? formatProductDateTime(generatedAt, locale) : t("status.noTimestamp")}
          detail={`${t("detail.status")}: ${freshness.value}`}
          tone={freshness.tone}
        />
      </section>

      <section className="radar-lifecycle-guide">
        <button
          type="button"
          className="radar-lifecycle-guide-trigger"
          aria-expanded={lifecycleGuideOpen}
          aria-controls="radar-lifecycle-guide-content"
          data-interaction="disclosure"
          onClick={() => setLifecycleGuideOpen((open) => !open)}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            setLifecycleGuideOpen((open) => !open);
          }}
        >
          <span>{locale === "pl" ? "Jak token przechodzi przez Radar" : "How a token moves through Radar"}</span>
          <span className="radar-lifecycle-guide-state">{lifecycleGuideOpen
            ? (locale === "pl" ? "Zwiń" : "Collapse")
            : (locale === "pl" ? "Rozwiń" : "Expand")}</span>
          <span className="radar-lifecycle-guide-chevron" aria-hidden="true">⌄</span>
        </button>
        <ol id="radar-lifecycle-guide-content" hidden={!lifecycleGuideOpen}>
          <li>{locale === "pl" ? "Nowy token zostaje wykryty." : "A new token is detected."}</li>
          <li>{locale === "pl" ? "System automatycznie awansuje projekt po spełnieniu jawnych warunków; użytkownik może wcześniej przesunąć go w swoim prywatnym Radarze." : "The system promotes a project after explicit conditions are met; a user may move it earlier in their private Radar."}</li>
          <li>{locale === "pl" ? "Token przechodzi checkpointy 1 / 3 / 7 / 14 / 30 dni." : "The token moves through 1 / 3 / 7 / 14 / 30-day checkpoints."}</li>
          <li>{locale === "pl" ? "Po spełnieniu filtrów może zostać kandydatem." : "After meeting the filters, it may become a candidate."}</li>
          <li>{locale === "pl" ? "Prywatny ruch nie zmienia statusu innych użytkowników, a owner/admin nie wykonuje codziennych ręcznych przesunięć." : "A private move does not change other users’ status, and owner/admin do not perform daily manual moves."}</li>
        </ol>
      </section>

      <section className="product-summary-grid operational" aria-label={t("radar.data")}>
        <SummaryCard label={t("radar.establishedAfterFilters")} value={String(establishedAfterFilters)} detail={t("radar.candidatesForReview")} />
        <SummaryCard label={t("radar.securityChecked")} value={String(securityChecked)} detail={t("radar.goPlusAfterFilters")} />
        <SummaryCard label={t("radar.sourceState")} value={sourceState.value} detail={sourceState.detail} tone={sourceState.tone} />
      </section>

      <section className="basket-switcher" aria-label={t("radar.basketSelection")}>
        <button
          type="button"
          className={activeBasket === "new_emerging" ? "active" : ""}
          onClick={() => selectBasket("new_emerging")}
          aria-pressed={activeBasket === "new_emerging"}
          data-lifecycle-layer="observation"
        >
          <span>{t("radar.newBasket")}</span>
          <strong>{lifecycleRadar?.private_new_total ?? lifecycleSummary?.system_new_total ?? newCandidates.length}</strong>
          <small>{lifecycleRadar ? privateViewCopy : t("radar.newBasketDescription")}</small>
        </button>
        <button
          type="button"
          className={activeBasket === "maturing" ? "active" : ""}
          onClick={() => selectBasket("maturing")}
          aria-pressed={activeBasket === "maturing"}
          data-lifecycle-layer="follow-up"
        >
          <span>{t("followUp.basket")}</span>
          <strong>{lifecycleRadar?.private_follow_up_total ?? followUpDisplayed}</strong>
          <small>{lifecycleRadar ? privateViewCopy : t("followUp.displayedOfTotal", { displayed: followUpDisplayed, total: followUpTotal })}</small>
        </button>
        <button
          type="button"
          className={activeBasket === "established" ? "active" : ""}
          onClick={() => selectBasket("established")}
          aria-pressed={activeBasket === "established"}
          data-lifecycle-layer="established"
        >
          <span>{t("radar.establishedBasket")}</span>
          <strong>{lifecycleRadar?.private_main_radar_total ?? establishedEntries}</strong>
          <small>{lifecycleRadar ? privateViewCopy : getEstablishedTabStatus(metadata, readiness, locale, establishedUniverseStatus)}</small>
        </button>
      </section>

      {lifecycleRadar && scannerUnavailableReasonCode && <section className="product-partial-data lifecycle-scanner-warning" role="status"><strong>{t("status.delayed")}</strong><span>{t("lifecycle.scannerUnavailable")}</span></section>}
      {!lifecycleRadar && visibleBasket !== "established" && <p className="product-inline-warning personal-radar-unavailable" role="status">{t("lifecycle.privateStatusesUnavailable")}</p>}
      {visibleBasket === "new_emerging" && lifecycleRadar ? (
        <PrivateLifecycleBasket basket="new" group={lifecycleRadar.private_baskets.new} locale={locale} onLoadMore={onLoadMoreLifecycle} onOpenDetails={onOpenLifecycleCard} onLifecycleChanged={onLifecycleChanged} />
      ) : visibleBasket === "new_emerging" && scannerUnavailableReasonCode ? (
        <BasketUnavailable
          title={t("radar.unavailableTitle")}
          reasonCode={scannerUnavailableReasonCode}
          detail={t("radar.unavailableDetail")}
        />
      ) : visibleBasket === "new_emerging" ? (
        <NewEmergingBasket
          candidates={newCandidates}
          metadata={metadata?.new_emerging}
          readiness={readiness}
          followUpEntries={followUpEntries}
          followUpStatus={followUpStatus}
          onOpenCandidate={onOpenCandidate}
          onOpenExternalChecks={onOpenExternalChecks}
          privateStatusesUnavailable={!lifecycleRadar}
        />
      ) : visibleBasket === "maturing" && lifecycleRadar ? (
        <PrivateLifecycleBasket basket="follow_up" group={lifecycleRadar.private_baskets.follow_up} locale={locale} onLoadMore={onLoadMoreLifecycle} onOpenDetails={onOpenLifecycleCard} onLifecycleChanged={onLifecycleChanged} />
      ) : visibleBasket === "maturing" ? (
        <MaturingFollowUpBasket
          entries={displayedFollowUpEntries}
          status={followUpStatus}
          onOpenFollowUp={onOpenFollowUp}
          privateStatusesUnavailable={!lifecycleRadar}
        />
      ) : lifecycleRadar ? (
        <PrivateLifecycleBasket basket="main_radar" group={lifecycleRadar.private_baskets.main_radar} locale={locale} onLoadMore={onLoadMoreLifecycle} onOpenDetails={onOpenLifecycleCard} onLifecycleChanged={onLifecycleChanged} />
      ) : (
        <EstablishedBasket
          candidates={establishedCandidates}
          metadata={metadata}
          readiness={readiness}
          universeStatus={establishedUniverseStatus}
          followUpEntries={establishedFollowUpEntries}
          onOpenCandidate={onOpenCandidate}
          onOpenFollowUp={onOpenFollowUp}
          onOpenExternalChecks={onOpenExternalChecks}
        />
      )}
    </div>
  );
};

function PrivateLifecycleBasket({ basket, group, locale, onLoadMore, onOpenDetails, onLifecycleChanged }: { basket: "new" | "follow_up" | "main_radar"; group: LifecycleRadarView["private_baskets"]["new"]; locale: ProductLocale; onLoadMore?: (cursor: string) => void; onOpenDetails?: (identity: { chain: string; contract_address: string }) => void; onLifecycleChanged?: (view: LifecycleTokenView) => void | Promise<void> }) {
  const copy = locale === "pl"
    ? {
      new: { title: "Nowe projekty", empty: "Brak projektĂłw w Twoim prywatnym widoku Nowe." },
      follow_up: { title: "Dalsza obserwacja", empty: "Brak projektĂłw w Twojej prywatnej dalszej obserwacji." },
      main_radar: { title: "GĹ‚Ăłwny Radar", empty: "Brak projektĂłw w Twoim prywatnym GĹ‚Ăłwnym Radarze." },
      absent: "Projekt nie wystÄ…piĹ‚ w ostatnim skanie, ale pozostaje w Twoim prywatnym Radarze.",
      more: "PokaĹĽ wiÄ™cej",
      privateView: "TwĂłj prywatny widok",
    }
    : {
      new: { title: "New projects", empty: "No projects in your private New view." },
      follow_up: { title: "Follow-up", empty: "No projects in your private Follow-up." },
      main_radar: { title: "Main Radar", empty: "No projects in your private Main Radar." },
      absent: "This project was not present in the latest scan, but remains in your private Radar.",
      more: "Show more",
      privateView: "Your private view",
    };
  const basketCopy = copy[basket];
  return <section className={`basket-content private-lifecycle-basket private-lifecycle-${basket}`} aria-label={basketCopy.title}>
    <header className="basket-heading"><div><span>{basketCopy.title}</span><h3>{group.displayed}/{group.total}</h3><p>{copy.privateView}</p></div></header>
    {group.cards.length === 0 ? <BasketEmpty title={basketCopy.title} detail={basketCopy.empty} code={`PRIVATE_${basket.toUpperCase()}_EMPTY`} /> : <div className="product-candidate-list">{group.cards.map((card) => <LifecycleRadarCardView key={card.identity} card={card} locale={locale} absentNotice={copy.absent} onOpenDetails={onOpenDetails} onLifecycleChanged={onLifecycleChanged} />)}</div>}
    {group.next_cursor && <button type="button" className="product-secondary-action" data-lifecycle-more={`private_${basket}`} onClick={() => onLoadMore?.(group.next_cursor!)}>{copy.more}</button>}
  </section>;
}

function LifecycleRadarCardView({ card, locale, absentNotice, onOpenDetails, onLifecycleChanged }: { card: LifecycleRadarCard; locale: ProductLocale; absentNotice?: string; onOpenDetails?: (identity: { chain: string; contract_address: string }) => void; onLifecycleChanged?: (view: LifecycleTokenView) => void | Promise<void> }) {
  const { t } = useProductLocale();
  const copy = locale === "pl"
    ? { firstSeen: "Pierwsze wykrycie", lastSeen: "Ostatnie wykrycie", price: "Cena", marketCap: "Kapitalizacja", liquidity: "Płynność", volume: "Wolumen 24h", snapshot: "Snapshot", nextCheck: "Następne sprawdzenie", missingData: "Brakujące dane", none: "Brak" }
    : { firstSeen: "First seen", lastSeen: "Last seen", price: "Price", marketCap: "Market cap", liquidity: "Liquidity", volume: "24h volume", snapshot: "Snapshot", nextCheck: "Next check", missingData: "Missing data", none: "None" };
  return <article className="product-candidate-card observation token-card-compact lifecycle-radar-card" data-lifecycle-card={card.identity}>
    <header className="product-candidate-topline"><div><span className="candidate-results-eyebrow">{formatChain(card.chain, locale === "pl" ? "Brak sieci" : "Network unavailable")}</span><h4>{card.symbol ?? card.display_name ?? card.contract_address} <small>{card.display_name ?? ""}</small></h4><CopyableAddress value={card.contract_address} displayValue={shortenAddress(card.contract_address, locale === "pl" ? "Brak danych" : "No data")} copyLabel={locale === "pl" ? "Kopiuj kontrakt" : "Copy contract"} copiedLabel={locale === "pl" ? "Skopiowano" : "Copied"} className="contract-line" /></div></header>
    <div className="product-metrics-grid">
      <Metric label={copy.firstSeen} value={formatProductDateTime(card.first_seen_at, locale)} />
      <Metric label={copy.lastSeen} value={formatProductDateTime(card.last_seen_at, locale)} />
      <Metric label={copy.price} value={formatPrice(card.market?.price_usd ?? null, locale === "pl" ? "Brak danych" : "No data")} />
      <Metric label={copy.marketCap} value={formatProductUsd(card.market?.market_cap_usd ?? null, locale, locale === "pl" ? "Brak danych" : "No data")} />
      <Metric label={copy.liquidity} value={formatProductUsd(card.market?.liquidity_usd ?? null, locale, locale === "pl" ? "Brak danych" : "No data")} />
      <Metric label={copy.volume} value={formatProductUsd(card.market?.volume_24h_usd ?? null, locale, locale === "pl" ? "Brak danych" : "No data")} />
    </div>
    <div className="candidate-explanation-grid">
      <Explanation label={copy.snapshot} value={card.snapshot_present ? (locale === "pl" ? "Obecny" : "Present") : (locale === "pl" ? "Brak w ostatnim skanie" : "Absent from latest scan")} />
      <Explanation label={copy.nextCheck} value={card.follow_up?.next_check_at ? formatProductDateTime(card.follow_up.next_check_at, locale) : copy.none} />
      <Explanation label={copy.missingData} value={card.follow_up?.missing_data.length ? card.follow_up.missing_data.join(", ") : copy.none} />
    </div>
    {card.snapshot_absence_notice && absentNotice && <p className="product-inline-warning">{absentNotice}</p>}
    <footer className="product-candidate-footer lifecycle-radar-card-footer">
      <PersonalRadarPanel
        chain={card.chain}
        contractAddress={card.contract_address}
        initialView={card}
        onChanged={onLifecycleChanged}
        trailingAction={onOpenDetails ? (
          <ActionButton variant="primary" icon="arrow" iconPosition="end" onClick={() => onOpenDetails({ chain: card.chain, contract_address: card.contract_address })}>
            {t("radar.openDetails")}
          </ActionButton>
        ) : null}
      />
    </footer>
  </article>;
}

export function MaturingFollowUpBasket({
  entries,
  status,
  onOpenFollowUp,
  privateStatusesUnavailable = false,
}: {
  entries: FollowUpPublicEntry[];
  status?: FollowUpPublicStatus | null;
  onOpenFollowUp?: (entryId: string) => void;
  privateStatusesUnavailable?: boolean;
}) {
  const { locale, t } = useProductLocale();
  if (status && (!status.store_available || status.validation_status === "invalid" || status.validation_status === "unavailable")) {
    return (
      <BasketUnavailable
        title={t("followUp.unavailableTitle")}
        reasonCode="FOLLOW_UP_STORE_UNAVAILABLE"
        detail={t("followUp.unavailableDetail")}
      />
    );
  }
  if (entries.length === 0) {
    return <BasketEmpty title={t("followUp.emptyTitle")} detail={t("followUp.emptyDetail")} code="FOLLOW_UP_EMPTY" />;
  }
  return (
    <section className="basket-content follow-up-basket" aria-label={t("followUp.basket")}>
      <header className="basket-heading">
        <div>
          <span>{t("followUp.headingEyebrow")}</span>
          <h3>{t("followUp.heading")}</h3>
          <p>{t("followUp.headingDetail")}</p>
        </div>
        <StatusBadge tone="manual" className="basket-status observation">{t("followUp.readOnly")}</StatusBadge>
      </header>
      <p className="follow-up-result-limit" role="status">
        {t("followUp.displayedOfTotal", { displayed: entries.length, total: status?.entries_total ?? entries.length })}
      </p>
      <div className="product-candidate-list">
        {entries.map((entry) => {
          const lifecycle = resolveTokenLifecycle({ followUp: entry, followUpStatus: status });
          return (
          <article
            className={`product-candidate-card follow-up ${entry.lifecycle_status.toLowerCase()}`}
            data-chain={entry.chain}
            data-contract-address={entry.contract_address}
            key={entry.entry_id}
          >
            <header className="product-candidate-topline">
              <div>
                <span className="candidate-results-eyebrow">{t("followUp.lifecycle")}</span>
                <h4>{entry.symbol ?? t("radar.missingData")} <small>{entry.display_name ?? ""}</small></h4>
                <p>{entry.chain.toUpperCase()}</p>
                <CopyableAddress
                  value={entry.contract_address}
                  displayValue={shortenAddress(entry.contract_address, t("radar.missingData"))}
                  copyLabel={t("verification.copyContract")}
                  copiedLabel={t("app.copied")}
                  className="contract-line"
                />
              </div>
              <StatusBadge tone={entry.lifecycle_status === "CANDIDATE_FOR_ESTABLISHED" ? "manual" : "neutral"} className={`basket-status ${entry.lifecycle_status === "CANDIDATE_FOR_ESTABLISHED" ? "candidate" : "observation"}`}>
                {formatFollowUpLifecycleStatus(entry.lifecycle_status, locale)}
              </StatusBadge>
            </header>
            {entry.lifecycle_status === "CANDIDATE_FOR_ESTABLISHED" && (
              <p className="follow-up-candidate-boundary">{t("followUp.candidateBoundary")}</p>
            )}
            <TokenLifecycleFlow model={lifecycle} compact />
            <TokenLifecycleCardSummary model={lifecycle} />
            <TokenCheckpointAxis model={lifecycle} />
            <div className="product-metrics-grid">
              <Metric label={t("radar.pairAge")} value={formatProductPairAge(entry.pair_age, locale, t("radar.missingData"))} />
              <Metric label={t("followUp.firstSeen")} value={formatProductElapsedSince(entry.first_seen_at, new Date(), locale, t("radar.missingData"))} />
              <Metric label={t("followUp.lastChecked")} value={entry.last_checked_at ? formatProductDateTime(entry.last_checked_at, locale) : t("app.noData")} />
              <Metric label={t("followUp.nextCheckpoint")} value={entry.next_check_at ? formatProductDateTime(entry.next_check_at, locale) : t("followUp.noAutomaticCheck")} />
              <Metric label={t("followUp.completedCheckpoints")} value={entry.completed_checkpoints.length > 0 ? entry.completed_checkpoints.map((day) => `${day}d`).join(" Â· ") : t("followUp.noneCompleted")} />
              <Metric label={t("followUp.filterStatus")} value={formatFollowUpFilter(entry.filter_status, locale)} tone={entry.filter_status === "passed_basic_filter" ? "ready" : "warning"} />
              <Metric label={t("followUp.securityStatus")} value={formatFollowUpSecurity(entry.security_status, locale)} tone="warning" />
            </div>
            <div className="candidate-explanation-grid">
              <Explanation label={t("followUp.nextReviewStep")} value={formatFollowUpNextStep(entry.next_review_step, locale)} />
              <Explanation label={t("detail.missingData")} value={formatFollowUpMissingData(entry.missing_data, locale, t("detail.noMissingData"))} />
              <Explanation label={t("followUp.establishedMembership")} value={entry.established_membership ? t("control.value.yes") : t("control.value.no")} />
            </div>
            <AIResearchRadarStatus
              chain={entry.chain}
              contractAddress={entry.contract_address}
              onOpen={onOpenFollowUp ? () => onOpenFollowUp(entry.entry_id) : undefined}
            />
            {onOpenFollowUp && (
              <footer className="product-candidate-footer follow-up-actions">
                <p>{entry.lifecycle_status === "CANDIDATE_FOR_ESTABLISHED"
                  ? (locale === "pl" ? "Nie dodano automatycznie. Następny krok: decyzja właściciela." : "Not promoted automatically. Next: owner decision.")
                  : (locale === "pl" ? "Dalsze sprawdzenie nastąpi automatycznie." : "The next check happens automatically.")}</p>
                <PersonalRadarPanel chain={entry.chain} contractAddress={entry.contract_address} unavailable={privateStatusesUnavailable} />
                <ActionButton variant="primary" icon="arrow" iconPosition="end" onClick={() => onOpenFollowUp(entry.entry_id)}>
                  {t("radar.openDetails")}
                </ActionButton>
              </footer>
            )}
          </article>
        );})}
      </div>
    </section>
  );
}

export function NewEmergingBasket({
  candidates,
  metadata,
  readiness,
  followUpEntries = [],
  followUpStatus,
  onOpenCandidate,
  onOpenExternalChecks,
  privateStatusesUnavailable = false,
}: {
  candidates: UiTokenCandidate[];
  metadata?: ScannerDiscoveryMetadata["new_emerging"];
  readiness?: ProductReadinessOutput | null;
  followUpEntries?: FollowUpPublicEntry[];
  followUpStatus?: FollowUpPublicStatus | null;
  onOpenCandidate?: (candidateId: string) => void;
  onOpenExternalChecks?: (candidate: UiTokenCandidate) => void;
  privateStatusesUnavailable?: boolean;
}) {
  const { t } = useProductLocale();
  const state = readiness?.discovery.new_emerging;
  if (state && !state.ready) {
    return (
      <BasketUnavailable
        title={t("radar.newUnavailableTitle")}
        reasonCode={state.reason_code ?? "NEW_EMERGING_UNAVAILABLE"}
        detail={t("radar.newUnavailableDetail")}
      />
    );
  }

  if (candidates.length === 0) {
    return (
      <BasketEmpty
        title={t("radar.newEmptyTitle")}
        detail={t("radar.newEmptyDetail")}
        code="NEW_EMERGING_EMPTY"
      />
    );
  }

  return (
    <section className="basket-content" aria-label={t("radar.newBasket")}>
      {metadata?.discovery_status === "DEGRADED" && (
        <div className="product-partial-data" role="status">
          <strong>{t("radar.partialTitle")}</strong>
          <span>{t("radar.partialDetail")}</span>
          <small>{t("radar.partialRequests", {
            succeeded: metadata.pair_requests_succeeded ?? 0,
            total: metadata.seed_count ?? 0,
          })}</small>
        </div>
      )}
      <header className="basket-heading">
        <div>
          <span>{t("radar.newHeadingEyebrow")}</span>
          <h3>{t("radar.newHeading")}</h3>
          <p>{t("radar.newHeadingDetail")}</p>
        </div>
      </header>
      <div className="product-candidate-list">
        {candidates.map((candidate) => (
          <NewCandidateCard
            key={candidate.id}
            candidate={candidate}
            followUp={findFollowUpByIdentity(followUpEntries, candidate)}
            followUpStatus={followUpStatus}
            onOpenCandidate={onOpenCandidate}
            onOpenExternalChecks={onOpenExternalChecks}
            privateStatusesUnavailable={privateStatusesUnavailable}
          />
        ))}
      </div>
    </section>
  );
}

function NewCandidateCard({
  candidate,
  followUp,
  followUpStatus,
  onOpenCandidate,
  onOpenExternalChecks,
  privateStatusesUnavailable,
}: {
  candidate: UiTokenCandidate;
  followUp?: FollowUpPublicEntry | null;
  followUpStatus?: FollowUpPublicStatus | null;
  onOpenCandidate?: (candidateId: string) => void;
  onOpenExternalChecks?: (candidate: UiTokenCandidate) => void;
  privateStatusesUnavailable: boolean;
}) {
  const { locale, t } = useProductLocale();
  const lifecycle = resolveTokenLifecycle({ candidate, followUp, followUpStatus });
  return (
    <article className="product-candidate-card observation token-card-compact">
      <header className="product-candidate-topline">
        <div>
          <span className="candidate-results-eyebrow">{lifecycleStageLabel(lifecycle.current_stage, locale)}</span>
          <h4>{candidate.symbol} <small>{candidate.name}</small></h4>
          <p>{formatChain(candidate.chain, t("radar.networkMissing"))} · {candidate.dex || t("radar.dexMissing")} · {formatProductSourceLabel(candidate.source)}</p>
          <CopyableAddress
            value={candidate.contractAddress}
            displayValue={shortenAddress(candidate.contractAddress, t("radar.missingData"))}
            copyLabel={t("radar.copyContract", { symbol: candidate.symbol })}
            copiedLabel={t("app.copied")}
            buttonLabel={t("radar.copy")}
            className="contract-line"
          />
        </div>
      </header>

      <TokenLifecycleFlow model={lifecycle} compact />
      <TokenLifecycleCardSummary model={lifecycle} />
      {followUp && (
        <div className="token-tracking-facts">
          <Metric label={t("followUp.firstSeen")} value={formatProductDateTime(followUp.first_seen_at, locale)} />
          <Metric label={t("followUp.nextCheckpoint")} value={followUp.next_check_at ? formatProductDateTime(followUp.next_check_at, locale) : t("followUp.noAutomaticCheck")} />
        </div>
      )}

      <div className="product-metrics-grid">
        <Metric label={t("radar.pairAge")} value={formatProductPairAge(candidate.pairAgeDays, locale, t("radar.missingData"), { pairCreatedAt: candidate.pairCreatedAt })} />
        <Metric label={t("radar.price")} value={formatPrice(candidate.priceUsd, t("radar.missingData"))} />
        <Metric label={candidate.marketCap == null ? "FDV" : t("radar.marketCap")} value={formatProductUsd(candidate.marketCap ?? candidate.fdvUsd, locale, t("radar.missingData"))} />
        <Metric label={t("radar.liquidity")} value={formatProductUsd(candidate.liquidity, locale, t("radar.missingData"))} />
        <Metric label={t("radar.volume24h")} value={formatProductUsd(candidate.volume24h, locale, t("radar.missingData"))} />
        <Metric label={t("radar.ratio")} value={formatRatio(candidate.volumeMarketCapRatio, t("radar.missingData"))} />
        <Metric label={t("radar.basicFilters")} value={candidate.basicFilterStatus === "passed_basic_filter" ? t("radar.conditionsMet") : t("radar.conditionsRejected")} tone={candidate.basicFilterStatus === "passed_basic_filter" ? "ready" : "warning"} />
        <Metric label={t("radar.security")} value={presentRadarSecurityState(resolveProductSecurityState(candidate).state, locale)} tone={getSecurityStateTone(resolveProductSecurityState(candidate).state)} />
      </div>

      <TechnicalDetails label={t("app.technicalDetails")} className="token-card-technical">
        <code>observation_only={String(candidate.observationOnly)} · established_eligible={String(candidate.establishedEligible)}</code>
      </TechnicalDetails>

      <AIResearchRadarStatus
        chain={candidate.chain}
        contractAddress={candidate.contractAddress}
        onOpen={onOpenCandidate ? () => onOpenCandidate(candidate.id) : undefined}
      />
      <footer className="product-candidate-footer">
        <div>
          <span>{t("radar.sourceAndCheck")}</span>
          <strong>{formatProductSourceLabel(candidate.source)}</strong>
          <small>{formatProductDateTime(candidate.lastCheckedAt, locale)}</small>
        </div>
        <p>{t("radar.newBoundary")}</p>
        <PersonalRadarPanel chain={candidate.chain} contractAddress={candidate.contractAddress} unavailable={privateStatusesUnavailable} />
        <CandidateActions candidate={candidate} onOpenCandidate={onOpenCandidate} onOpenExternalChecks={onOpenExternalChecks} />
      </footer>
    </article>
  );
}

export function EstablishedBasket({
  candidates,
  metadata,
  readiness,
  universeStatus,
  followUpEntries = [],
  onOpenCandidate,
  onOpenFollowUp,
  onOpenExternalChecks,
}: {
  candidates: UiTokenCandidate[];
  metadata?: ScannerDiscoveryMetadata | null;
  readiness?: ProductReadinessOutput | null;
  universeStatus?: EstablishedUniverseStatus | null;
  followUpEntries?: FollowUpPublicEntry[];
  onOpenCandidate?: (candidateId: string) => void;
  onOpenFollowUp?: (entryId: string) => void;
  onOpenExternalChecks?: (candidate: UiTokenCandidate) => void;
}) {
  const { locale, t } = useProductLocale();
  const state = getEstablishedState(metadata, readiness, candidates, universeStatus);
  if (state === "empty") {
    const universe = metadata?.established;
    return (
      <section className="established-empty" aria-label={t("radar.establishedEmptyTitle")}>
        <span className="candidate-results-eyebrow">{t("radar.establishedEmptyEyebrow")}</span>
        <h3>{t("radar.establishedEmptyTitle")}</h3>
        <p>{t("radar.establishedEmptyDetail")}</p>
        <div className="empty-state-facts">
          <div className="product-metric warning">
            <span>{t("radar.state")}</span>
            <strong>{t("radar.establishedEmptyEyebrow")}</strong>
            <TechnicalDetails label={t("app.technicalDetails")}><code>ESTABLISHED_UNIVERSE_EMPTY</code></TechnicalDetails>
          </div>
          <Metric label={t("radar.universeVersion")} value={universeStatus?.universe_version ?? universe?.universe_version ?? "established_address_universe_v1"} />
          <Metric label={t("radar.activeEntries")} value="0" />
        </div>
        <div className="empty-state-next-step">
          <span>{t("radar.operationalInstruction")}</span>
          <strong>{t("radar.populateUniverse")}</strong>
          <small>{t("radar.noEditor")}</small>
        </div>
      </section>
    );
  }

  if (state === "unavailable") {
    return (
      <BasketUnavailable
        title={t("radar.establishedUnavailableTitle")}
        reasonCode={readiness?.discovery.established.reason_code ?? "ESTABLISHED_UNAVAILABLE"}
        detail={t("radar.establishedUnavailableDetail")}
      />
    );
  }

  return (
    <section className="basket-content" aria-label={t("radar.establishedBasket")}>
      <header className="basket-heading">
        <div>
          <span>Established</span>
          <h3>{t("radar.establishedHeading")}</h3>
          <p>{t("radar.establishedHeadingDetail")}</p>
        </div>
        <StatusBadge tone="accent" className="basket-status established">{t("radar.mainRadar")}</StatusBadge>
      </header>
      <div className="product-metrics-grid established">
        <Metric label={t("radar.activeEntries")} value={String(universeStatus?.entries_enabled ?? metadata?.established?.entries_enabled ?? candidates.length)} />
        <Metric label={t("radar.universeVersion")} value={universeStatus?.universe_version ?? metadata?.established?.universe_version ?? t("radar.none")} />
        <Metric label={t("radar.establishedAfterFilters")} value={String(metadata?.established?.candidates_after_filters ?? candidates.length)} />
        <Metric label={t("radar.validationStatus")} value={metadata?.established?.validation_status ?? "valid"} />
      </div>
      <div className="product-candidate-list">
        {candidates.map((candidate) => (
          <EstablishedCandidateCard
            key={candidate.id}
            candidate={candidate}
            onOpenCandidate={onOpenCandidate}
            onOpenExternalChecks={onOpenExternalChecks}
          />
        ))}
        {followUpEntries.filter((entry) => !candidates.some((candidate) => (
          findFollowUpByIdentity([entry], candidate) !== null
        ))).map((entry) => (
          <article className="product-candidate-card ready established-follow-up-card" key={entry.entry_id}>
            <header className="product-candidate-topline">
              <div>
                <span className="candidate-results-eyebrow">Established · {entry.chain.toUpperCase()}</span>
                <h4>{entry.symbol ?? t("radar.missingData")} <small>{entry.display_name ?? ""}</small></h4>
                <CopyableAddress value={entry.contract_address} displayValue={shortenAddress(entry.contract_address, t("radar.missingData"))} copyLabel={t("verification.copyContract")} copiedLabel={t("app.copied")} className="contract-line" />
              </div>
              <StatusBadge tone="ready">{t("radar.mainRadar")}</StatusBadge>
            </header>
            <div className="product-metrics-grid established">
              <Metric label={t("radar.marketCap")} value={formatProductUsd(entry.market_metrics.market_cap_usd, locale, t("radar.missingData"))} />
              <Metric label={t("radar.liquidity")} value={formatProductUsd(entry.market_metrics.liquidity_usd, locale, t("radar.missingData"))} />
              <Metric label={t("followUp.lastChecked")} value={entry.last_checked_at ? formatProductDateTime(entry.last_checked_at, locale) : t("app.noData")} />
            </div>
            {onOpenFollowUp && <footer className="product-candidate-footer"><ActionButton variant="primary" onClick={() => onOpenFollowUp(entry.entry_id)}>{t("radar.openDetails")}</ActionButton></footer>}
          </article>
        ))}
      </div>
    </section>
  );
}

function EstablishedCandidateCard({
  candidate,
  onOpenCandidate,
  onOpenExternalChecks,
}: {
  candidate: UiTokenCandidate;
  onOpenCandidate?: (candidateId: string) => void;
  onOpenExternalChecks?: (candidate: UiTokenCandidate) => void;
}) {
  const { locale, t } = useProductLocale();
  const status = getEstablishedCandidateStatus(candidate, locale);
  const lifecycle = resolveTokenLifecycle({ candidate, establishedMembership: true });
  const securityResolution = resolveProductSecurityState(candidate);
  const riskFlags = candidate.riskFlags.slice(0, 3);
  const riskItems = securityResolution.state === "not_invoked"
    ? [t("detail.riskFlagsNotAssessed")]
    : securityResolution.state === "unavailable"
      ? [t("detail.securityUnavailableDetail")]
      : securityResolution.state === "partial"
        ? [t("detail.securityPartialDetail")]
        : riskFlags.length > 0
          ? riskFlags.map((reason) => presentProductSecurityReason(reason, locale))
          : candidate.missingData.slice(0, 3).map((reason) => presentProductSecurityReason(reason, locale));
  const checkSource = (securityResolution.state === "not_invoked"
    ? [candidate.source]
    : securityResolution.sources.length > 0 ? securityResolution.sources : [candidate.source])
    .map(formatProductSourceLabel)
    .join(", ");
  return (
    <article className={`product-candidate-card ${status.tone}`}>
      <header className="product-candidate-topline">
        <div>
          <span className="candidate-results-eyebrow">Established · {formatChain(candidate.chain, t("radar.networkMissing"))}</span>
          <h4>{candidate.symbol} <small>{candidate.name}</small></h4>
          <CopyableAddress
            value={candidate.contractAddress}
            displayValue={shortenAddress(candidate.contractAddress, t("radar.missingData"))}
            copyLabel={t("radar.copyContract", { symbol: candidate.symbol })}
            copiedLabel={t("app.copied")}
            buttonLabel={t("radar.copy")}
            className="contract-line"
          />
        </div>
        <div className="candidate-status-stack">
          <StatusBadge tone={status.tone === "critical" ? "critical" : status.tone === "warning" ? "warning" : status.tone === "ready" ? "ready" : "neutral"} className={`basket-status ${status.tone}`}>{status.label}</StatusBadge>
          {candidate.finalLabel === "WATCHLIST" && <small>{t("radar.manualReviewOnly")}</small>}
        </div>
      </header>

      <TokenLifecycleFlow model={lifecycle} compact />
      <TokenLifecycleCardSummary model={lifecycle} />

      <div className="product-metrics-grid established">
        <Metric label={t("radar.addressIdentity")} value={candidate.addressIdentityVerified ? t("radar.verified") : t("radar.needsVerification")} tone={candidate.addressIdentityVerified ? "ready" : "warning"} />
        <Metric label={t("radar.marketCap")} value={formatProductUsd(candidate.marketCap ?? candidate.fdvUsd, locale, t("radar.missingData"))} />
        <Metric label={t("radar.liquidity")} value={formatProductUsd(candidate.liquidity, locale, t("radar.missingData"))} />
        <Metric label={t("radar.volume24h")} value={formatProductUsd(candidate.volume24h, locale, t("radar.missingData"))} />
        <Metric label={t("radar.ratio")} value={formatRatio(candidate.volumeMarketCapRatio, t("radar.missingData"))} />
        <Metric label={t("radar.pairAge")} value={formatProductPairAge(candidate.pairAgeDays, locale, t("radar.missingData"), { pairCreatedAt: candidate.pairCreatedAt })} />
        <Metric label={t("radar.basicFilters")} value={candidate.basicFilterStatus === "passed_basic_filter" ? t("radar.conditionsMet") : t("radar.conditionsRejected")} tone={candidate.basicFilterStatus === "passed_basic_filter" ? "ready" : "warning"} />
        <Metric label={t("radar.security")} value={presentRadarSecurityState(securityResolution.state, locale)} tone={getSecurityStateTone(securityResolution.state)} />
      </div>

      <div className="product-reason-panel">
        <span>{t("radar.risksAndGaps")}</span>
        <div className="candidate-risk-chips">
          {riskItems.map((flag) => (
            <small key={flag}>{flag}</small>
          ))}
          {riskItems.length === 0 && securityResolution.state === "checked" && <small>{t("radar.noReportedFlags")}</small>}
          {riskItems.length === 0 && securityResolution.state !== "checked" && <small>{t("detail.riskFlagsRequireReview")}</small>}
        </div>
      </div>

      <AIResearchRadarStatus
        chain={candidate.chain}
        contractAddress={candidate.contractAddress}
        onOpen={onOpenCandidate ? () => onOpenCandidate(candidate.id) : undefined}
      />

      <footer className="product-candidate-footer">
        <div>
          <span>{t("radar.lastCheck")}</span>
          <strong>{formatProductDateTime(candidate.lastCheckedAt, locale)}</strong>
          <small>{checkSource}</small>
        </div>
        <p>Universe: {candidate.universeVersion ?? t("radar.none")} · {t("radar.activeEntries")}: {candidate.universeEntryIndex ?? t("radar.none")}</p>
        <CandidateActions candidate={candidate} onOpenCandidate={onOpenCandidate} onOpenExternalChecks={onOpenExternalChecks} />
      </footer>
    </article>
  );
}

function CandidateActions({
  candidate,
  onOpenCandidate,
  onOpenExternalChecks,
}: {
  candidate: UiTokenCandidate;
  onOpenCandidate?: (candidateId: string) => void;
  onOpenExternalChecks?: (candidate: UiTokenCandidate) => void;
}) {
  const { t } = useProductLocale();
  return (
    <div className="product-card-actions">
      {onOpenCandidate && (
        <ActionButton variant="primary" icon="arrow" iconPosition="end" onClick={() => onOpenCandidate(candidate.id)}>
          {t("radar.openDetails")}
        </ActionButton>
      )}
      {onOpenExternalChecks && (
        <ActionButton
          variant="secondary"
          icon="arrow"
          iconPosition="end"
          className="candidate-source-verification-action"
          onClick={() => onOpenExternalChecks(candidate)}
        >
          {t("radar.sourceVerification")}
        </ActionButton>
      )}
    </div>
  );
}

function SummaryCard({ label, value, detail, tone = "neutral" }: { label: string; value: string; detail: string; tone?: Tone }) {
  return <ReadOnlyCard className={`product-summary-card ${tone}`}><span>{label}</span><strong>{value}</strong><p>{detail}</p></ReadOnlyCard>;
}

function Metric({ label, value, tone = "neutral" }: { label: string; value: string; tone?: Tone }) {
  return <div className={`product-metric ${tone}`} data-interaction="read-only"><span>{label}</span><strong>{value}</strong></div>;
}

function Explanation({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><p>{value}</p></div>;
}

function BasketUnavailable({ title, reasonCode, detail }: { title: string; reasonCode: string; detail: string }) {
  const { locale, t } = useProductLocale();
  return (
    <section className="basket-state unavailable" role="status">
      <span>{t("status.unavailable")}</span>
      <h3>{title}</h3>
      <p>{formatStatusReason(reasonCode, locale)}</p>
      <p>{detail}</p>
      <TechnicalDetails label={t("app.technicalDetails")}>
        <code>{reasonCode}</code>
      </TechnicalDetails>
    </section>
  );
}

function BasketEmpty({ title, detail, code }: { title: string; detail: string; code: string }) {
  const { t } = useProductLocale();
  return (
    <section className="basket-state empty" role="status">
      <span>{t("radar.emptyResult")}</span>
      <h3>{title}</h3>
      <p>{detail}</p>
      <TechnicalDetails label={t("app.technicalDetails")}>
        <code>{code}</code>
      </TechnicalDetails>
    </section>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- Pure resolver is exported for product contract tests.
export function resolveInitialBasket(
  candidates: UiTokenCandidate[],
  followUpEntries: FollowUpPublicEntry[] = [],
  scannerUnavailable = false,
): BasketId {
  if (followUpEntries.some((entry) => entry.lifecycle_status === "ESTABLISHED" || entry.established_membership)) {
    return "established";
  }
  if (scannerUnavailable && followUpEntries.length > 0) return "maturing";
  return candidates.some((candidate) => candidate.discoveryBasket === "established")
    ? "established"
    : "new_emerging";
}

// eslint-disable-next-line react-refresh/only-export-components -- Pure resolver is exported for product contract tests.
export function getEstablishedState(
  metadata: ScannerDiscoveryMetadata | null | undefined,
  readiness: ProductReadinessOutput | null | undefined,
  candidates: UiTokenCandidate[],
  universeStatus?: EstablishedUniverseStatus | null,
): "ready" | "empty" | "unavailable" {
  if (universeStatus?.validation_status === "invalid" || universeStatus?.validation_status === "unavailable") {
    return "unavailable";
  }
  if (universeStatus?.validation_status === "valid") {
    return universeStatus.entries_enabled === 0 ? "empty" : "ready";
  }
  if (
    metadata?.established?.universe_status === "ESTABLISHED_UNIVERSE_INVALID"
    || metadata?.established?.universe_status === "ESTABLISHED_UNIVERSE_UNAVAILABLE"
  ) return "unavailable";
  if (
    readiness?.discovery.established.status === "empty_configured"
    || metadata?.established?.universe_status === "ESTABLISHED_UNIVERSE_EMPTY"
  ) return "empty";
  if (readiness && readiness.discovery.established.status === "unavailable") return "unavailable";
  if (candidates.length === 0 && metadata?.established?.entries_enabled === 0) return "empty";
  return "ready";
}

function getEstablishedTabStatus(
  metadata: ScannerDiscoveryMetadata | null | undefined,
  readiness: ProductReadinessOutput | null | undefined,
  locale: ProductLocale,
  universeStatus?: EstablishedUniverseStatus | null,
): string {
  const t = (key: keyof typeof PRODUCT_TRANSLATIONS.en) => importTranslation(locale, key);
  if (universeStatus?.validation_status === "invalid" || universeStatus?.validation_status === "unavailable") {
    return t("radar.establishedTabUnavailable");
  }
  if (universeStatus?.validation_status === "valid") {
    return universeStatus.entries_enabled === 0 ? t("radar.establishedTabEmpty") : t("radar.establishedTabReady");
  }
  if (
    metadata?.established?.universe_status === "ESTABLISHED_UNIVERSE_INVALID"
    || metadata?.established?.universe_status === "ESTABLISHED_UNIVERSE_UNAVAILABLE"
  ) return t("radar.establishedTabUnavailable");
  if (readiness?.discovery.established.status === "empty_configured" || metadata?.established?.universe_status === "ESTABLISHED_UNIVERSE_EMPTY") {
    return t("radar.establishedTabEmpty");
  }
  if (readiness?.discovery.established.status === "unavailable") return t("radar.establishedTabUnavailable");
  return t("radar.establishedTabReady");
}

function getEstablishedCandidateStatus(candidate: UiTokenCandidate, locale: ProductLocale): { label: string; tone: Tone } {
  if (candidate.finalLabel === "CRITICAL_RISK") return { label: importTranslation(locale, "radar.criticalRisk"), tone: "critical" };
  if (candidate.basicFilterStatus === "rejected_basic_filter" || candidate.finalLabel === "REJECT") {
    return { label: importTranslation(locale, "radar.rejectedByFilters"), tone: "warning" };
  }
  if (!isCompletedProductSecurityState(resolveProductSecurityState(candidate).state) || candidate.finalLabel === "NEEDS_MANUAL_VERIFICATION") {
    return { label: importTranslation(locale, "radar.needsVerification"), tone: "warning" };
  }
  return { label: importTranslation(locale, "radar.candidateManualReview"), tone: "accent" };
}

function getFreshness(
  ageSeconds: number | null,
  freshnessStatus: "FRESH" | "STALE" | null,
  locale: ProductLocale,
): { value: string; detail: string; tone: Tone } {
  if (ageSeconds == null) return { value: importTranslation(locale, "status.unavailable"), detail: importTranslation(locale, "status.noTimestamp"), tone: "warning" };
  if (freshnessStatus === "STALE" || ageSeconds > 1800) {
    return { value: importTranslation(locale, "status.delayed"), detail: importTranslation(locale, "status.waiting"), tone: "warning" };
  }
  return { value: importTranslation(locale, "status.current"), detail: formatProductAge(ageSeconds, locale), tone: "ready" };
}

function presentRadarSecurityState(state: ProductSecurityState, locale: ProductLocale): string {
  if (state === "not_invoked") return importTranslation(locale, "radar.securityNotRun");
  if (state === "unavailable") return importTranslation(locale, "verification.securityStateUnavailable");
  if (state === "partial") return importTranslation(locale, "verification.securityStatePartial");
  if (state === "checked_critical") return importTranslation(locale, "radar.criticalRisk");
  if (state === "checked_needs_manual_review") return importTranslation(locale, "radar.needsVerification");
  return importTranslation(locale, "radar.securityCheckedManual");
}

function getSecurityStateTone(state: ProductSecurityState): Tone {
  if (state === "checked_critical") return "critical";
  if (state === "checked") return "ready";
  return "warning";
}

function presentProductSecurityReason(reason: string, locale: ProductLocale): string {
  const code = reason.trim().toUpperCase().replaceAll(" ", "_");
  if (code === "SECURITY_DATA_UNAVAILABLE") return importTranslation(locale, "detail.securityUnavailableDetail");
  if (code === "PARTIAL_SECURITY_COVERAGE") return importTranslation(locale, "detail.securityPartialDetail");
  if (code === "NOT_CHECKED" || code === "UNKNOWN") return importTranslation(locale, "detail.riskFlagsNotAssessed");
  return humanizeReason(reason);
}

function importTranslation(locale: ProductLocale, key: keyof typeof PRODUCT_TRANSLATIONS.en): string {
  return PRODUCT_TRANSLATIONS[locale][key];
}

function formatChain(value: string, missing: string): string {
  return value ? value.toUpperCase() : missing;
}

function formatPrice(value: number | null, missing: string): string {
  return value == null ? missing : `$${value.toLocaleString("en-US", { maximumSignificantDigits: 6 })}`;
}

function formatRatio(value: number | null, missing: string): string {
  return value == null ? missing : value.toFixed(4);
}

function formatFollowUpFilter(value: FollowUpPublicEntry["filter_status"], locale: ProductLocale): string {
  if (value === "passed_basic_filter") return locale === "pl" ? "Filtry spełnione" : "Filters passed";
  if (value === "rejected_basic_filter") return locale === "pl" ? "Filtry niespełnione" : "Filters not met";
  return locale === "pl" ? "Nie sprawdzono" : "Not checked";
}

function formatFollowUpSecurity(value: string, locale: ProductLocale): string {
  if (value === "CHECKED") return locale === "pl" ? "Sprawdzono; nadal wymaga oceny" : "Checked; still requires review";
  if (value === "CRITICAL_RISK") return locale === "pl" ? "Ryzyko krytyczne" : "Critical risk";
  if (value === "PARTIAL") return locale === "pl" ? "Częściowe dane; wymagana weryfikacja" : "Partial data; verification required";
  if (value === "UNAVAILABLE") return locale === "pl" ? "Dane niedostępne; wymagana weryfikacja" : "Data unavailable; verification required";
  return locale === "pl" ? "Wymagana ręczna weryfikacja" : "Manual verification required";
}

function formatFollowUpNextStep(value: FollowUpPublicEntry["next_review_step"], locale: ProductLocale): string {
  if (value === "OWNER_DECISION_REQUIRED") return locale === "pl" ? "Decyzja właściciela" : "Owner decision required";
  if (value === "ESTABLISHED_MONITORING") return locale === "pl" ? "Monitoring w Established" : "Established monitoring";
  if (value === "FOLLOW_UP_COMPLETE") return locale === "pl" ? "Plan Follow-up zakończony" : "Follow-up plan complete";
  return locale === "pl" ? "Poczekaj na następny checkpoint" : "Wait for the next checkpoint";
}

function formatFollowUpMissingData(values: string[], locale: ProductLocale, empty: string): string {
  if (values.length === 0) return empty;
  const normalized = new Set(values.map((value) => value.trim().toLowerCase()));
  const labels: string[] = [];
  if ([...normalized].some((value) => value.includes("security"))) {
    labels.push(locale === "pl" ? "Brakuje części danych bezpieczeństwa" : "Some security data is unavailable");
  }
  if ([...normalized].some((value) => value.includes("market") || value.includes("liquidity") || value.includes("volume"))) {
    labels.push(locale === "pl" ? "Brakuje części danych rynkowych" : "Some market data is unavailable");
  }
  if (labels.length === 0) {
    labels.push(locale === "pl" ? "Część danych checkpointu jest niedostępna" : "Some checkpoint data is unavailable");
  }
  return labels.join(" · ");
}

function shortenAddress(value: string, missing: string): string {
  if (!value) return missing;
  if (value.length <= 20) return value;
  return `${value.slice(0, 10)}…${value.slice(-8)}`;
}

function humanizeReason(value: string): string {
  const normalized = value.replaceAll("_", " ").trim();
  return normalized.length === 0 ? value : normalized.charAt(0).toUpperCase() + normalized.slice(1);
}
