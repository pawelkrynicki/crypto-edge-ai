import React, { useEffect, useMemo, useRef, useState } from "react";
import { useProductLocale } from "../productI18n";
import { isAIResearchRenderPreviewMode } from "../runtimeMode";
import {
  AIResearchDataSourceError,
  loadAIResearchBrief,
  loadAIResearchReviewMetrics,
  requestAIResearchBrief,
} from "../services/aiResearchDataSource";
import type { AIResearchBriefLookup, AIResearchReviewMetrics } from "../types/aiResearchTypes";
import type { AIProductionAnalysisLookup, AIProductionAnalysisStatus } from "../types/aiProductionTypes";
import { resolveTokenIdentity } from "../tokenLifecycle";
import { AIResearchBriefCanvas } from "./AIResearchBriefCanvas";
import { AIProductionAnalysisCanvas } from "./AIProductionAnalysisCanvas";
import { applyAIResearchGenerationFailure } from "./aiResearchState";
import { ActionButton, StatusBadge } from "./ProductUi";

void React;

type Lookup = AIResearchBriefLookup | AIProductionAnalysisLookup;

function isLegacyLookup(value: Lookup | null | undefined): value is AIResearchBriefLookup {
  return Boolean(value && value.schema_version === "ai_research_lookup_v1");
}

function isProductionLookup(value: Lookup | null | undefined): value is AIProductionAnalysisLookup {
  return Boolean(value && value.schema_version === "ai_production_analysis_lookup_v1");
}

function hasAnalysis(value: Lookup | null | undefined): boolean {
  return isLegacyLookup(value) ? Boolean(value.brief) : isProductionLookup(value) ? Boolean(value.analysis) : false;
}

function availabilityOf(value: Lookup | null | undefined): AIResearchBriefLookup["availability"] | null {
  if (isLegacyLookup(value)) return value.availability;
  if (!isProductionLookup(value)) return null;
  const map: Record<AIProductionAnalysisStatus, AIResearchBriefLookup["availability"]> = {
    NO_ANALYSIS: "ABSENT",
    QUEUED: "QUEUED",
    PROCESSING: "PROCESSING",
    READY: "READY",
    STALE: "STALE",
    ERROR: "ERROR",
    LIMIT: "RATE_LIMITED",
    DISABLED: "PROVIDER_DISABLED",
  };
  return map[value.status];
}

export function AIResearchSection({
  chain,
  contractAddress,
  symbol,
  name,
  initialLookup,
  mode = "detail",
  active = false,
  onOpen,
  onOpenControlCenter,
}: {
  chain: string;
  contractAddress: string;
  symbol: string;
  name: string;
  initialLookup?: AIResearchBriefLookup | AIProductionAnalysisLookup | null;
  mode?: "summary" | "detail";
  active?: boolean;
  onOpen?: () => void;
  onOpenControlCenter?: () => void;
}) {
  const { locale } = useProductLocale();
  const ui = COPY[locale];
  const identity = useMemo(() => resolveTokenIdentity(chain, contractAddress), [chain, contractAddress]);
  const renderPreviewMode = isAIResearchRenderPreviewMode();
  const initialNeedsPreview = renderPreviewMode && (!isLegacyLookup(initialLookup) || initialLookup.brief?.render_preview !== true);
  const [lookup, setLookup] = useState<Lookup | null>(initialLookup ?? null);
  const [loading, setLoading] = useState(initialLookup === undefined || initialNeedsPreview);
  const [requesting, setRequesting] = useState(false);
  const [expanded, setExpanded] = useState(mode === "detail" && hasAnalysis(initialLookup));
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [retryAfter, setRetryAfter] = useState<number | null>(null);
  const [reviewMetrics, setReviewMetrics] = useState<AIResearchReviewMetrics | null>(null);
  const requestRevision = useRef(0);

  useEffect(() => {
    const revision = ++requestRevision.current;
    setLookup(initialLookup ?? null);
    setExpanded(mode === "detail" && hasAnalysis(initialLookup));

    const transientInitialLookup = availabilityOf(initialLookup) === "PROCESSING" && !hasAnalysis(initialLookup);
    const shouldLoad = initialLookup === undefined || transientInitialLookup || initialNeedsPreview;
    if (!shouldLoad) {
      setLoading(false);
      setErrorCode(null);
      return;
    }
    if (identity.status !== "valid") {
      setLoading(false);
      setErrorCode("INVALID_TOKEN_IDENTITY");
      return;
    }

    setLoading(true);
    setErrorCode(null);
    void loadAIResearchBrief(identity.chain, identity.contract_address, locale)
      .then((value) => {
        if (revision !== requestRevision.current) return;
        setLookup(value);
        setExpanded(mode === "detail" && hasAnalysis(value));
      })
      .catch((error) => {
        if (revision !== requestRevision.current) return;
        setErrorCode(error instanceof AIResearchDataSourceError ? error.code : "AI_RESEARCH_UNAVAILABLE");
      })
      .finally(() => { if (revision === requestRevision.current) setLoading(false); });
  }, [identity, initialLookup, initialNeedsPreview, locale, mode]);

  const displayLookup = lookup === null ? null : isLegacyLookup(lookup) ? applyRenderReviewOverride(lookup) : lookup;
  const reviewAnalysisId = isLegacyLookup(displayLookup) && !displayLookup.brief?.render_preview
    ? displayLookup.brief?.analysis_id ?? null
    : null;

  useEffect(() => {
    if (!reviewAnalysisId) { setReviewMetrics(null); return; }
    let cancelled = false;
    void loadAIResearchReviewMetrics(reviewAnalysisId)
      .then((value) => { if (!cancelled) setReviewMetrics(value); })
      .catch(() => { if (!cancelled) setReviewMetrics(null); });
    return () => { cancelled = true; };
  }, [reviewAnalysisId]);

  const requestPreparation = async () => {
    if (identity.status !== "valid" || requesting) return;
    setRequesting(true);
    setErrorCode(null);
    setRetryAfter(null);
    try {
      const result = await requestAIResearchBrief({ chain: identity.chain, contract_address: identity.contract_address, locale });
      setLookup(result);
      if (hasAnalysis(result) && mode === "detail") setExpanded(true);
    } catch (error) {
      const code = error instanceof AIResearchDataSourceError ? error.code : "AI_RESEARCH_UNAVAILABLE";
      const retry = error instanceof AIResearchDataSourceError ? error.retryAfterSeconds : null;
      setErrorCode(code);
      setRetryAfter(retry);
      setLookup((previous) => isLegacyLookup(previous) ? applyAIResearchGenerationFailure(previous, error) : previous);
    } finally {
      setRequesting(false);
    }
  };

  const availability: AIResearchBriefLookup["availability"] = availabilityOf(displayLookup) ?? (loading ? "PROCESSING" : "ERROR");
  const brief = isLegacyLookup(displayLookup) ? displayLookup.brief : null;
  const analysis = isProductionLookup(displayLookup) ? displayLookup.analysis : null;
  const effectiveError = errorCode ?? (isLegacyLookup(displayLookup) ? displayLookup.error_code : null);
  const effectiveRetryAfter = retryAfter ?? displayLookup?.retry_after_seconds ?? null;
  const waitingToRetry = availability === "COOLDOWN" || availability === "RATE_LIMITED";
  const canRequest = identity.status === "valid"
    && !["QUEUED", "PROCESSING", "READY", "PROVIDER_DISABLED", "INSUFFICIENT_DATA", "SUSPENDED", "COOLDOWN", "RATE_LIMITED"].includes(availability);
  const showRequest = ["ABSENT", "STALE", "FAILED", "ERROR"].includes(availability);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.setInterval !== "function" || typeof window.clearInterval !== "function"
      || mode !== "detail" || !active || identity.status !== "valid" || !["QUEUED", "PROCESSING"].includes(availability)) return;
    let cancelled = false;
    const refresh = () => {
      void loadAIResearchBrief(identity.chain, identity.contract_address, locale)
        .then((value) => { if (!cancelled) setLookup(value); })
        .catch(() => { /* Preserve the last public state; never refresh the full Radar here. */ });
    };
    const timer = window.setInterval(refresh, 5_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [active, availability, identity, locale, mode]);

  if (mode === "summary") {
    return (
      <button
        type="button"
        className={`ai-summary-card ${active ? "active" : ""}`}
        aria-pressed={active}
        aria-label={`${locale === "pl" ? "Otwórz" : "Open"}: ${ui.title}`}
        data-detail-module="ai"
        data-ai-status={publicAvailabilityMarker(availability)}
        onClick={onOpen}
      >
        <span>{ui.title}</span>
        <StatusBadge tone={availabilityTone(availability)}>{availabilityLabel(availability, locale)}</StatusBadge>
        <strong>{stateTitle(availability, locale)}</strong>
        <p>{stateDetail(availability, effectiveError, effectiveRetryAfter, locale, Boolean(brief))}</p>
        <small>{ui.summaryNextStep}</small>
        <i aria-hidden="true">→</i>
      </button>
    );
  }

  return (
    <section className="product-detail-section ai-research-section" aria-labelledby="ai-research-section-heading" aria-live="polite">
      <header className="ai-research-section-heading">
        <div><span className="candidate-detail-section-index">AI</span><div><h3 id="ai-research-section-heading">{ui.title}</h3><p>{ui.intro}</p></div></div>
        <StatusBadge tone={availabilityTone(availability)}>{availabilityLabel(availability, locale)}</StatusBadge>
      </header>
      <div className="ai-research-section-summary">
        <div>
          <strong>{stateTitle(availability, locale)}</strong>
          <p>{stateDetail(availability, effectiveError, effectiveRetryAfter, locale, Boolean(brief))}</p>
          {(brief || analysis) && (!brief || !brief.render_preview) && <span className="ai-prepared-status">{ui.analysisPrepared}</span>}
        </div>
        <div className="ai-research-section-actions">
          {showRequest && (
            <ActionButton
              variant={brief ? "secondary" : "primary"}
              loading={requesting}
              loadingLabel={ui.requesting}
              disabled={!canRequest}
              onClick={() => void requestPreparation()}
            >
              {availability === "FAILED" || availability === "ERROR" ? ui.retry : ui.request}
            </ActionButton>
          )}
          {availability === "PROVIDER_DISABLED" && onOpenControlCenter && (
            <ActionButton variant="secondary" onClick={onOpenControlCenter}>{ui.openControlCenter}</ActionButton>
          )}
          {waitingToRetry && (
            <ActionButton variant="secondary" disabled>
              {effectiveRetryAfter === null ? ui.tryAgainLater : ui.tryAgainIn(effectiveRetryAfter)}
            </ActionButton>
          )}
          {(brief || analysis) && (
            <ActionButton variant="primary" onClick={() => setExpanded((value) => !value)}>
              {expanded ? ui.close : ui.open}
            </ActionButton>
          )}
        </div>
      </div>
      <span className="sr-only" role="status" aria-live="polite">{requesting ? ui.requestingStatus : ""}</span>
      {brief && expanded && <AIResearchBriefCanvas brief={brief} symbol={symbol} name={name} reviewMetrics={reviewMetrics} />}
      {analysis && expanded && <AIProductionAnalysisCanvas analysis={analysis} />}
    </section>
  );
}

export function AIResearchRadarStatus({
  chain,
  contractAddress,
  onOpen,
}: {
  chain: string;
  contractAddress: string;
  onOpen?: () => void;
}) {
  const { locale } = useProductLocale();
  const ui = COPY[locale];
  const [state, setState] = useState<AIResearchBriefLookup["availability"]>("ABSENT");
  const identity = useMemo(() => resolveTokenIdentity(chain, contractAddress), [chain, contractAddress]);
  useEffect(() => {
    if (identity.status !== "valid") return;
    let cancelled = false;
    void loadAIResearchBrief(identity.chain, identity.contract_address, locale)
      .then((value) => { if (!cancelled) setState(availabilityOf(value) ?? "ERROR"); })
      .catch(() => { if (!cancelled) setState("ERROR"); });
    return () => { cancelled = true; };
  }, [identity, locale]);
  const visibleState = identity.status === "valid" ? state : "ERROR";
  const ready = visibleState === "READY" || visibleState === "STALE";
  return (
    <div className="ai-radar-status" data-ai-status={publicAvailabilityMarker(visibleState)}>
      <span>{ui.radarLabel}</span>
      <StatusBadge tone={availabilityTone(visibleState)}>{availabilityLabel(visibleState, locale)}</StatusBadge>
      {onOpen && <ActionButton variant="tertiary" onClick={onOpen}>{ready ? ui.radarOpen : ui.radarDetails}</ActionButton>}
    </div>
  );
}

function applyRenderReviewOverride(value: AIResearchBriefLookup): AIResearchBriefLookup {
  if (!value.brief?.render_preview || typeof window === "undefined") return value;
  const reviewState = new URLSearchParams(window.location.search).get("ai_review_state");
  if (reviewState === "absent") return { ...value, availability: "ABSENT", queue_status: "ABSENT", brief: null };
  if (reviewState === "queued") return { ...value, availability: "QUEUED", queue_status: "QUEUED", brief: null };
  if (reviewState === "processing") return { ...value, availability: "PROCESSING", queue_status: "PROCESSING", brief: null };
  if (reviewState === "stale") return { ...value, availability: "STALE", queue_status: "QUEUED", is_last_known_good: true };
  if (reviewState === "failed") return { ...value, availability: "FAILED", queue_status: "FAILED", error_code: "PROVIDER_ERROR", is_last_known_good: true };
  if (reviewState === "suspended") return { ...value, availability: "SUSPENDED", queue_status: "SUSPENDED", error_code: "WORKER_SUSPENDED", brief: null };
  if (reviewState === "cooldown") return { ...value, availability: "COOLDOWN", queue_status: "FAILED", request_outcome: "COOLDOWN", retry_after_seconds: 60, brief: null };
  return value;
}

function availabilityLabel(value: AIResearchBriefLookup["availability"], locale: "pl" | "en") {
  const labels: Record<AIResearchBriefLookup["availability"], [string, string]> = {
    ABSENT: ["Not available", "Brak analizy"],
    QUEUED: ["Queued", "W kolejce"],
    PROCESSING: ["Preparing", "Przygotowywana"],
    READY: ["Available", "Dostępna"],
    STALE: ["Last analysis", "Ostatnia analiza"],
    FAILED: ["Temporarily unavailable", "Chwilowo niedostępna"],
    SUSPENDED: ["Suspended", "Wstrzymana"],
    COOLDOWN: ["Cooldown", "Czas oczekiwania"],
    PROVIDER_DISABLED: ["Unavailable", "Niedostępna"],
    INSUFFICIENT_DATA: ["Insufficient data", "Niewystarczające dane"],
    RATE_LIMITED: ["Temporarily limited", "Limit czasowy"],
    ERROR: ["Unavailable", "Niedostępna"],
  };
  return labels[value][locale === "pl" ? 1 : 0];
}

function publicAvailabilityMarker(value: AIResearchBriefLookup["availability"]): string {
  if (value === "PROVIDER_DISABLED" || value === "ERROR") return "unavailable";
  return value.toLowerCase();
}

function availabilityTone(value: AIResearchBriefLookup["availability"]): "neutral" | "accent" | "ready" | "partial" | "warning" | "not-ready" {
  if (value === "READY") return "ready";
  if (value === "QUEUED" || value === "PROCESSING") return "accent";
  if (["STALE", "COOLDOWN", "RATE_LIMITED", "INSUFFICIENT_DATA"].includes(value)) return "warning";
  if (value === "FAILED" || value === "ERROR") return "not-ready";
  if (value === "SUSPENDED" || value === "PROVIDER_DISABLED") return "partial";
  return "neutral";
}

function stateTitle(value: AIResearchBriefLookup["availability"], locale: "pl" | "en") {
  const pl = locale === "pl";
  if (value === "READY") return pl ? "Analiza gotowa" : "Analysis ready";
  if (value === "QUEUED") return pl ? "Analiza jest przygotowywana" : "Analysis is being prepared";
  if (value === "PROCESSING") return pl ? "Analiza jest przygotowywana" : "Analysis is being prepared";
  if (value === "STALE") return pl ? "Ostatnia analiza dostępna" : "Last analysis available";
  if (value === "PROVIDER_DISABLED") return pl ? "Analiza AI jest obecnie niedostępna." : "AI analysis is currently unavailable.";
  if (value === "SUSPENDED") return pl ? "Przygotowanie analizy jest wstrzymane" : "Analysis preparation is paused";
  if (["FAILED", "ERROR"].includes(value)) {
    return pl ? "Analiza nie mogła zostać teraz przygotowana." : "The analysis could not be prepared right now.";
  }
  if (value === "COOLDOWN" || value === "RATE_LIMITED") return pl ? "Spróbuj ponownie później." : "Try again later.";
  if (value === "INSUFFICIENT_DATA") return pl ? "Za mało danych do analizy" : "Not enough data for analysis";
  return pl ? "Analiza nie została jeszcze przygotowana" : "Analysis has not been prepared yet";
}

function stateDetail(
  value: AIResearchBriefLookup["availability"],
  _error: string | null,
  retry: number | null,
  locale: "pl" | "en",
  hasBrief: boolean,
) {
  const pl = locale === "pl";
  if (value === "READY") return pl ? "Poniżej znajdziesz najważniejsze wnioski, ryzyka, braki danych i kolejne kroki researchu." : "Below you will find the key findings, risks, data gaps and next research steps.";
  if (value === "QUEUED") return pl ? "Przygotowanie analizy rozpocznie się, gdy będzie dostępna." : "The analysis will be prepared when it becomes available.";
  if (value === "PROCESSING") return pl ? "Przygotowanie analizy trwa." : "The analysis is being prepared.";
  if (value === "STALE") return pl ? "Dane zmieniły się, a aktualizacja jest przygotowywana. Poprzedni prawidłowy wynik pozostaje dostępny." : "Data changed and an update is being prepared. The previous valid result remains available.";
  if (value === "FAILED" && hasBrief) return pl ? "Spróbuj ponownie później. Ostatni poprawny wynik pozostaje dostępny." : "Try again later. The last valid result remains available.";
  if (value === "FAILED") return pl ? "Spróbuj ponownie później." : "Try again later.";
  if (value === "SUSPENDED") return pl ? "Przygotowanie będzie możliwe, gdy analiza będzie dostępna." : "Preparation will be available when analysis becomes available.";
  if (value === "COOLDOWN" || value === "RATE_LIMITED") return pl
    ? `Spróbuj ponownie${retry ? ` za ${retry} s` : " później"}.`
    : `Try again${retry ? ` in ${retry} sec` : " later"}.`;
  if (value === "PROVIDER_DISABLED") return pl ? "Analiza AI jest obecnie niedostępna." : "AI analysis is currently unavailable.";
  if (value === "INSUFFICIENT_DATA") return pl ? "Serwer nie posiada zwalidowanych danych pozwalających przygotować wiarygodny brief." : "The server has no validated data that can prepare a reliable brief.";
  if (value === "ERROR") return pl ? "Spróbuj ponownie później." : "Try again later.";
  return pl ? "Możesz poprosić o przygotowanie analizy." : "You can request analysis preparation.";
}

const COPY = {
  pl: {
    title: "Analiza AI",
    intro: "Podsumowanie zweryfikowanych danych — bez sygnałów transakcyjnych.",
    request: "Zleć analizę AI",
    retry: "Ponów zlecenie analizy",
    openControlCenter: "Aktywuj analizę AI w Centrum sterowania",
    requesting: "Przygotowywanie analizy…",
    requestingStatus: "Trwa przygotowywanie analizy.",
    tryAgainLater: "Spróbuj ponownie później",
    tryAgainIn: (seconds: number) => `Spróbuj ponownie za ${seconds} s`,
    open: "Otwórz analizę AI",
    close: "Zamknij analizę AI",
    radarLabel: "Analiza AI",
    radarOpen: "Otwórz analizę AI",
    radarDetails: "Przejdź do szczegółów analizy",
    analysisPrepared: "Analiza została przygotowana na podstawie zweryfikowanych danych dostępnych w tej migawce.",
    summaryNextStep: "Otwórz zakładkę Analiza AI, aby zobaczyć pełne podsumowanie.",
  },
  en: {
    title: "AI analysis",
    intro: "A summary of verified data — without trading signals.",
    request: "Request analysis preparation",
    retry: "Retry analysis request",
    openControlCenter: "Enable AI analysis in Control Center",
    requesting: "Preparing analysis…",
    requestingStatus: "The analysis is being prepared.",
    tryAgainLater: "Try again later",
    tryAgainIn: (seconds: number) => `Try again in ${seconds} sec`,
    open: "Open AI analysis",
    close: "Close AI analysis",
    radarLabel: "AI analysis",
    radarOpen: "Open AI analysis",
    radarDetails: "Open analysis details",
    analysisPrepared: "The analysis was prepared from verified data available in this snapshot.",
    summaryNextStep: "Open the AI analysis tab to see the full summary.",
  },
} as const;
