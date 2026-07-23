import React, { useEffect, useMemo, useState } from "react";
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
import { formatFilterReason, formatStatusReason } from "../productPresentation";
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
import type {
  ProductReadinessOutput,
  ScannerDiscoveryMetadata,
  UiTokenCandidate,
} from "../types/scannerTypes";
import type { FollowUpPublicEntry, FollowUpPublicStatus } from "../types/followUpTypes";

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
  followUpEntries?: FollowUpPublicEntry[];
  onOpenCandidate?: (candidateId: string) => void;
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
  followUpEntries = [],
  onOpenCandidate,
  onOpenExternalChecks,
}) => {
  const { locale, t } = useProductLocale();
  const newCandidates = useMemo(
    () => candidates.filter((candidate) => candidate.discoveryBasket === "new_emerging"),
    [candidates],
  );
  const establishedCandidates = useMemo(
    () => candidates.filter((candidate) => candidate.discoveryBasket === "established"),
    [candidates],
  );
  const followUpLayerEntries = useMemo(
    () => followUpEntries.filter((entry) => entry.lifecycle_status !== "ESTABLISHED" && entry.lifecycle_status !== "ARCHIVED"),
    [followUpEntries],
  );
  const [activeBasket, setActiveBasket] = useState<BasketId>(() => resolveInitialBasket(candidates));

  useEffect(() => {
    setActiveBasket(resolveInitialBasket(candidates));
  }, [candidates]);

  const establishedEntries = metadata?.established?.entries_enabled ?? establishedCandidates.length;
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
        <div className={`product-freshness ${freshness.tone}`}>
          <span>{t("radar.data")}</span>
          <strong>{freshness.value}</strong>
          <small>{freshness.detail}</small>
        </div>
      </section>

      <section className="product-summary-grid" aria-label={t("radar.summary")}>
        <SummaryCard label={t("radar.newProjects")} value={String(newCandidates.length)} detail={t("radar.observationOnly")} />
        <SummaryCard label={t("followUp.maturingCount")} value={String(followUpStatus?.maturing_count ?? 0)} detail={t("followUp.maturingCountDetail")} />
        <SummaryCard label={t("followUp.candidateCount")} value={String(followUpStatus?.candidate_count ?? 0)} detail={t("followUp.candidateCountDetail")} tone="accent" />
        <SummaryCard label={t("radar.establishedEntries")} value={String(establishedEntries)} detail={t("radar.activeUniverseAddresses")} />
        <SummaryCard label={t("radar.establishedAfterFilters")} value={String(establishedAfterFilters)} detail={t("radar.candidatesForReview")} />
        <SummaryCard label={t("radar.securityChecked")} value={String(securityChecked)} detail={t("radar.goPlusAfterFilters")} />
        <SummaryCard
          label={t("app.generated")}
          value={generatedAt ? formatProductDateTime(generatedAt, locale) : t("status.noTimestamp")}
          detail={`${t("detail.status")}: ${freshness.value}`}
          tone={freshness.tone}
        />
        <SummaryCard label={t("radar.sourceState")} value={sourceState.value} detail={sourceState.detail} tone={sourceState.tone} />
      </section>

      <section className="basket-switcher" aria-label={t("radar.basketSelection")}>
        <button
          type="button"
          className={activeBasket === "new_emerging" ? "active" : ""}
          onClick={() => setActiveBasket("new_emerging")}
          aria-pressed={activeBasket === "new_emerging"}
        >
          <span>{t("radar.newBasket")}</span>
          <strong>{newCandidates.length}</strong>
          <small>{t("radar.newBasketDescription")}</small>
        </button>
        <button
          type="button"
          className={activeBasket === "maturing" ? "active" : ""}
          onClick={() => setActiveBasket("maturing")}
          aria-pressed={activeBasket === "maturing"}
        >
          <span>{t("followUp.basket")}</span>
          <strong>{followUpLayerEntries.length}</strong>
          <small>{t("followUp.basketDescription")}</small>
        </button>
        <button
          type="button"
          className={activeBasket === "established" ? "active" : ""}
          onClick={() => setActiveBasket("established")}
          aria-pressed={activeBasket === "established"}
        >
          <span>{t("radar.establishedBasket")}</span>
          <strong>{establishedCandidates.length}</strong>
          <small>{getEstablishedTabStatus(metadata, readiness, locale)}</small>
        </button>
      </section>

      {scannerUnavailableReasonCode ? (
        <BasketUnavailable
          title={t("radar.unavailableTitle")}
          reasonCode={scannerUnavailableReasonCode}
          detail={t("radar.unavailableDetail")}
        />
      ) : activeBasket === "new_emerging" ? (
        <NewEmergingBasket
          candidates={newCandidates}
          metadata={metadata?.new_emerging}
          readiness={readiness}
          onOpenCandidate={onOpenCandidate}
          onOpenExternalChecks={onOpenExternalChecks}
        />
      ) : activeBasket === "maturing" ? (
        <MaturingFollowUpBasket entries={followUpLayerEntries} status={followUpStatus} />
      ) : (
        <EstablishedBasket
          candidates={establishedCandidates}
          metadata={metadata}
          readiness={readiness}
          onOpenCandidate={onOpenCandidate}
          onOpenExternalChecks={onOpenExternalChecks}
        />
      )}
    </div>
  );
};

export function MaturingFollowUpBasket({
  entries,
  status,
}: {
  entries: FollowUpPublicEntry[];
  status?: FollowUpPublicStatus | null;
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
        <strong className="basket-status observation">{t("followUp.readOnly")}</strong>
      </header>
      <div className="product-candidate-list">
        {entries.map((entry) => (
          <article className={`product-candidate-card follow-up ${entry.lifecycle_status.toLowerCase()}`} key={entry.entry_id}>
            <header className="product-candidate-topline">
              <div>
                <span className="candidate-results-eyebrow">{t("followUp.lifecycle")}</span>
                <h4>{entry.symbol ?? t("radar.missingData")} <small>{entry.display_name ?? ""}</small></h4>
                <p>{entry.chain.toUpperCase()} Â· {shortenAddress(entry.contract_address, t("radar.missingData"))}</p>
              </div>
              <strong className={`basket-status ${entry.lifecycle_status === "CANDIDATE_FOR_ESTABLISHED" ? "candidate" : "observation"}`}>
                {formatFollowUpLifecycleStatus(entry.lifecycle_status, locale)}
              </strong>
            </header>
            {entry.lifecycle_status === "CANDIDATE_FOR_ESTABLISHED" && (
              <p className="follow-up-candidate-boundary">{t("followUp.candidateBoundary")}</p>
            )}
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
              <Explanation label={t("detail.missingData")} value={entry.missing_data.length > 0 ? entry.missing_data.join(", ") : t("detail.noMissingData")} />
              <Explanation label={t("followUp.establishedMembership")} value={entry.established_membership ? t("control.value.yes") : t("control.value.no")} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function NewEmergingBasket({
  candidates,
  metadata,
  readiness,
  onOpenCandidate,
  onOpenExternalChecks,
}: {
  candidates: UiTokenCandidate[];
  metadata?: ScannerDiscoveryMetadata["new_emerging"];
  readiness?: ProductReadinessOutput | null;
  onOpenCandidate?: (candidateId: string) => void;
  onOpenExternalChecks?: (candidate: UiTokenCandidate) => void;
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
        <strong className="basket-status observation">{t("radar.observationLabel")}</strong>
      </header>
      <div className="product-candidate-list">
        {candidates.map((candidate) => (
          <NewCandidateCard
            key={candidate.id}
            candidate={candidate}
            onOpenCandidate={onOpenCandidate}
            onOpenExternalChecks={onOpenExternalChecks}
          />
        ))}
      </div>
    </section>
  );
}

function NewCandidateCard({
  candidate,
  onOpenCandidate,
  onOpenExternalChecks,
}: {
  candidate: UiTokenCandidate;
  onOpenCandidate?: (candidateId: string) => void;
  onOpenExternalChecks?: (candidate: UiTokenCandidate) => void;
}) {
  const { locale, t } = useProductLocale();
  const reasons = candidate.filterReasons.slice(0, 3);
  return (
    <article className="product-candidate-card observation">
      <header className="product-candidate-topline">
        <div>
          <span className="candidate-results-eyebrow">{t("radar.newProjectEyebrow")}</span>
          <h4>{candidate.symbol} <small>{candidate.name}</small></h4>
          <p>{formatChain(candidate.chain, t("radar.networkMissing"))} · {candidate.dex || t("radar.dexMissing")} · {candidate.source}</p>
        </div>
        <strong className="basket-status observation">{t("radar.observationLabel")}</strong>
      </header>

      <div className="product-metrics-grid">
        <Metric label={t("radar.pairAge")} value={formatProductPairAge(candidate.pairAgeDays, locale, t("radar.missingData"), { pairCreatedAt: candidate.pairCreatedAt })} />
        <Metric label={t("radar.price")} value={formatPrice(candidate.priceUsd, t("radar.missingData"))} />
        <Metric label={candidate.marketCap == null ? "FDV" : t("radar.marketCap")} value={formatProductUsd(candidate.marketCap ?? candidate.fdvUsd, locale, t("radar.missingData"))} />
        <Metric label={t("radar.liquidity")} value={formatProductUsd(candidate.liquidity, locale, t("radar.missingData"))} />
        <Metric label={t("radar.volume24h")} value={formatProductUsd(candidate.volume24h, locale, t("radar.missingData"))} />
        <Metric label={t("radar.ratio")} value={formatRatio(candidate.volumeMarketCapRatio, t("radar.missingData"))} />
      </div>

      <div className="candidate-explanation-grid">
        <Explanation label={t("radar.whyHere")} value={t("radar.whyHereDetail")} />
        <Explanation label={t("radar.whyNotEstablished")} value={t("radar.whyNotEstablishedDetail")} />
        <div>
          <span>{t("radar.operationalStatus")}</span>
          <p>{t("radar.observationOnly")}</p>
          <details>
            <summary>{t("app.technicalDetails")}</summary>
            <code>observation_only={String(candidate.observationOnly)} · established_eligible={String(candidate.establishedEligible)}</code>
          </details>
        </div>
      </div>

      {reasons.length > 0 && candidate.basicFilterStatus === "rejected_basic_filter" && (
        <div className="product-reason-panel warning">
          <span>{t("radar.filterRejectionReasons")}</span>
          <ul>{reasons.map((reason) => <li key={reason}><FilterReason reason={reason} /></li>)}</ul>
        </div>
      )}

      <footer className="product-candidate-footer">
        <div>
          <span>{t("radar.sourceAndCheck")}</span>
          <strong>{candidate.source}</strong>
          <small>{formatProductDateTime(candidate.lastCheckedAt, locale)}</small>
        </div>
        <p>{t("radar.newBoundary")}</p>
        <CandidateActions candidate={candidate} onOpenCandidate={onOpenCandidate} onOpenExternalChecks={onOpenExternalChecks} />
      </footer>
    </article>
  );
}

export function EstablishedBasket({
  candidates,
  metadata,
  readiness,
  onOpenCandidate,
  onOpenExternalChecks,
}: {
  candidates: UiTokenCandidate[];
  metadata?: ScannerDiscoveryMetadata | null;
  readiness?: ProductReadinessOutput | null;
  onOpenCandidate?: (candidateId: string) => void;
  onOpenExternalChecks?: (candidate: UiTokenCandidate) => void;
}) {
  const { t } = useProductLocale();
  const state = getEstablishedState(metadata, readiness, candidates);
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
            <details><summary>{t("app.technicalDetails")}</summary><code>ESTABLISHED_UNIVERSE_EMPTY</code></details>
          </div>
          <Metric label={t("radar.universeVersion")} value={universe?.universe_version ?? "established_address_universe_v1"} />
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
        <strong className="basket-status established">{t("radar.mainRadar")}</strong>
      </header>
      <div className="product-metrics-grid established">
        <Metric label={t("radar.activeEntries")} value={String(metadata?.established?.entries_enabled ?? candidates.length)} />
        <Metric label={t("radar.universeVersion")} value={metadata?.established?.universe_version ?? t("radar.none")} />
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
  const checkSource = securityResolution.state === "not_invoked"
    ? candidate.source
    : securityResolution.sources.join(", ") || candidate.source;
  return (
    <article className={`product-candidate-card ${status.tone}`}>
      <header className="product-candidate-topline">
        <div>
          <span className="candidate-results-eyebrow">Established · {formatChain(candidate.chain, t("radar.networkMissing"))}</span>
          <h4>{candidate.symbol} <small>{candidate.name}</small></h4>
          <div className="contract-line">
            <code title={candidate.contractAddress}>{shortenAddress(candidate.contractAddress, t("radar.missingData"))}</code>
            <button type="button" onClick={() => copyValue(candidate.contractAddress)} aria-label={t("radar.copyContract", { symbol: candidate.symbol })}>{t("radar.copy")}</button>
          </div>
        </div>
        <div className="candidate-status-stack">
          <strong className={`basket-status ${status.tone}`}>{status.label}</strong>
          {candidate.finalLabel === "WATCHLIST" && <small>{t("radar.manualReviewOnly")}</small>}
        </div>
      </header>

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
      {onOpenCandidate && <button type="button" onClick={() => onOpenCandidate(candidate.id)}>{t("radar.openDetails")}</button>}
      {onOpenExternalChecks && <button type="button" className="secondary" onClick={() => onOpenExternalChecks(candidate)}>{t("radar.sourceVerification")}</button>}
    </div>
  );
}

function FilterReason({ reason }: { reason: string }) {
  const { locale, t } = useProductLocale();
  const presentation = formatFilterReason(reason, locale);
  return (
    <span className="filter-reason-copy">
      {presentation.summary}
      {!presentation.known && (
        <details>
          <summary>{t("app.technicalDetails")}</summary>
          <code>{presentation.rawReason}</code>
        </details>
      )}
    </span>
  );
}

function SummaryCard({ label, value, detail, tone = "neutral" }: { label: string; value: string; detail: string; tone?: Tone }) {
  return <div className={`product-summary-card ${tone}`}><span>{label}</span><strong>{value}</strong><p>{detail}</p></div>;
}

function Metric({ label, value, tone = "neutral" }: { label: string; value: string; tone?: Tone }) {
  return <div className={`product-metric ${tone}`}><span>{label}</span><strong>{value}</strong></div>;
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
      <details>
        <summary>{t("app.technicalDetails")}</summary>
        <code>{reasonCode}</code>
      </details>
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
      <details>
        <summary>{t("app.technicalDetails")}</summary>
        <code>{code}</code>
      </details>
    </section>
  );
}

export function resolveInitialBasket(candidates: UiTokenCandidate[]): BasketId {
  return candidates.some((candidate) => candidate.discoveryBasket === "established")
    ? "established"
    : "new_emerging";
}

export function getEstablishedState(
  metadata: ScannerDiscoveryMetadata | null | undefined,
  readiness: ProductReadinessOutput | null | undefined,
  candidates: UiTokenCandidate[],
): "ready" | "empty" | "unavailable" {
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
): string {
  const t = (key: keyof typeof PRODUCT_TRANSLATIONS.en) => importTranslation(locale, key);
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
  if (value === "OWNER_DECISION_REQUIRED") return locale === "pl" ? "Ręczna decyzja ownera" : "Owner decision required";
  if (value === "ESTABLISHED_MONITORING") return locale === "pl" ? "Monitoring w Established" : "Established monitoring";
  if (value === "FOLLOW_UP_COMPLETE") return locale === "pl" ? "Plan Follow-up zakończony" : "Follow-up plan complete";
  return locale === "pl" ? "Poczekaj na następny checkpoint" : "Wait for the next checkpoint";
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

function copyValue(value: string): void {
  if (!value || typeof navigator === "undefined" || !navigator.clipboard) return;
  void navigator.clipboard.writeText(value);
}
