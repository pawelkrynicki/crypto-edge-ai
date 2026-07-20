import React, { useEffect, useMemo, useState } from "react";
import {
  formatProductAge,
  formatProductDateTime,
  formatProductTime,
  formatProductUsd,
  PRODUCT_TRANSLATIONS,
  useProductLocale,
  type ProductLocale,
} from "../productI18n";
import { formatFilterReason, formatStatusReason } from "../productPresentation";
import type {
  ProductReadinessOutput,
  ScannerDiscoveryMetadata,
  UiTokenCandidate,
} from "../types/scannerTypes";

type BasketId = "new_emerging" | "established";
type Tone = "neutral" | "accent" | "warning" | "critical" | "ready";

interface CandidateResultsViewProps {
  candidates: UiTokenCandidate[];
  metadata?: ScannerDiscoveryMetadata | null;
  readiness?: ProductReadinessOutput | null;
  generatedAt?: string | null;
  ageSeconds?: number | null;
  freshnessStatus?: "FRESH" | "STALE" | null;
  sourceIds?: string[];
  scannerUnavailableReasonCode?: string | null;
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
  scannerUnavailableReasonCode = null,
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
  const [activeBasket, setActiveBasket] = useState<BasketId>(() => resolveInitialBasket(candidates));

  useEffect(() => {
    setActiveBasket(resolveInitialBasket(candidates));
  }, [candidates]);

  const establishedEntries = metadata?.established?.entries_enabled ?? establishedCandidates.length;
  const establishedAfterFilters = metadata?.established?.candidates_after_filters
    ?? establishedCandidates.filter((candidate) => candidate.basicFilterStatus === "passed_basic_filter").length;
  const securityChecked = establishedCandidates.filter((candidate) => candidate.security !== null).length;
  const freshness = getFreshness(ageSeconds, freshnessStatus, locale);
  const sourceState = getSourceState(metadata, sourceIds, locale);
  const stale = freshnessStatus === "STALE" || (ageSeconds !== null && ageSeconds > 1800);

  return (
    <div className="candidate-results-view product-radar">
      {stale && generatedAt && (
        <section className="product-stale-warning" role="status">
          <strong>{t("status.delayed")}</strong>
          <p>{t("radar.staleWarning", { time: formatProductTime(generatedAt, locale) })}</p>
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
        <SummaryCard label={t("radar.establishedEntries")} value={String(establishedEntries)} detail={t("radar.activeUniverseAddresses")} />
        <SummaryCard label={t("radar.establishedAfterFilters")} value={String(establishedAfterFilters)} detail={t("radar.candidatesForReview")} />
        <SummaryCard label={t("radar.securityChecked")} value={String(securityChecked)} detail={t("radar.goPlusAfterFilters")} />
        <SummaryCard
          label={t("app.generated")}
          value={freshness.value}
          detail={generatedAt ? formatProductDateTime(generatedAt, locale) : freshness.detail}
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
        <Metric label={t("radar.pairAge")} value={formatDays(candidate.pairAgeDays, locale, t("radar.missingData"))} />
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
  const riskFlags = candidate.riskFlags.slice(0, 3);
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
        <Metric label={t("radar.pairAge")} value={formatDays(candidate.pairAgeDays, locale, t("radar.missingData"))} />
        <Metric label={t("radar.basicFilters")} value={candidate.basicFilterStatus === "passed_basic_filter" ? t("radar.conditionsMet") : t("radar.conditionsRejected")} tone={candidate.basicFilterStatus === "passed_basic_filter" ? "ready" : "warning"} />
        <Metric label={t("radar.security")} value={formatSecurityLabel(candidate.securityLabel, candidate.security !== null, locale)} tone={candidate.security ? status.tone : "warning"} />
      </div>

      <div className="product-reason-panel">
        <span>{t("radar.risksAndGaps")}</span>
        <div className="candidate-risk-chips">
          {(riskFlags.length > 0 ? riskFlags : candidate.missingData.slice(0, 3)).map((flag) => (
            <small key={flag}>{humanizeReason(flag)}</small>
          ))}
          {riskFlags.length === 0 && candidate.missingData.length === 0 && <small>{t("radar.noReportedFlags")}</small>}
        </div>
      </div>

      <footer className="product-candidate-footer">
        <div>
          <span>{t("radar.lastCheck")}</span>
          <strong>{formatProductDateTime(candidate.lastCheckedAt, locale)}</strong>
          <small>{candidate.security?.sources.join(", ") || candidate.source}</small>
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
  if (!candidate.security || candidate.finalLabel === "NEEDS_MANUAL_VERIFICATION") {
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

function getSourceState(
  metadata: ScannerDiscoveryMetadata | null | undefined,
  sourceIds: string[],
  locale: ProductLocale,
): { value: string; detail: string; tone: Tone } {
  const health = Object.entries(metadata?.source_health ?? {});
  const degraded = health.filter(([, state]) => state === "DEGRADED" || state === "UNAVAILABLE");
  if (degraded.length > 0) {
    return {
      value: importTranslation(locale, "status.partial"),
      detail: degraded.map(([id]) => id).join(", "),
      tone: "warning",
    };
  }
  if (sourceIds.length === 0) {
    return { value: importTranslation(locale, "status.unavailable"), detail: importTranslation(locale, "status.noTimestamp"), tone: "warning" };
  }
  return { value: importTranslation(locale, "status.available"), detail: sourceIds.join(", "), tone: "ready" };
}

function formatSecurityLabel(label: string, invoked: boolean, locale: ProductLocale): string {
  if (!invoked || label === "NOT_CHECKED") return importTranslation(locale, "radar.securityNotRun");
  if (label === "SECURITY_PASSED") return importTranslation(locale, "radar.securityCheckedManual");
  if (label.includes("CRITICAL")) return importTranslation(locale, "radar.criticalRisk");
  return importTranslation(locale, "radar.needsVerification");
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

function formatDays(value: number | null, locale: ProductLocale, missing: string): string {
  if (value == null) return missing;
  const formatted = value.toLocaleString(locale === "pl" ? "pl-PL" : "en-US", { maximumFractionDigits: value < 10 ? 1 : 0 });
  return locale === "pl" ? `${formatted} dni` : `${formatted} days`;
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
