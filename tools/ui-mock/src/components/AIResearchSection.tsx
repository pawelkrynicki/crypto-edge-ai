import React, { useEffect, useMemo, useRef, useState } from "react";
import { useProductLocale } from "../productI18n";
import {
  AIResearchDataSourceError,
  loadAIResearchBrief,
  loadAIResearchReviewMetrics,
  requestAIResearchBrief,
} from "../services/aiResearchDataSource";
import type { AIResearchBriefLookup, AIResearchReviewMetrics } from "../types/aiResearchTypes";
import { resolveTokenIdentity } from "../tokenLifecycle";
import { AIResearchBriefCanvas } from "./AIResearchBriefCanvas";
import { applyAIResearchGenerationFailure } from "./aiResearchState";
import { ActionButton, StatusBadge } from "./ProductUi";

void React;

export function AIResearchSection({
  chain,
  contractAddress,
  symbol,
  name,
  initialLookup,
}: {
  chain: string;
  contractAddress: string;
  symbol: string;
  name: string;
  initialLookup?: AIResearchBriefLookup | null;
}) {
  const { locale } = useProductLocale();
  const ui = COPY[locale];
  const identity = useMemo(() => resolveTokenIdentity(chain, contractAddress), [chain, contractAddress]);
  const [lookup, setLookup] = useState<AIResearchBriefLookup | null>(initialLookup ?? null);
  const [loading, setLoading] = useState(initialLookup === undefined);
  const [requesting, setRequesting] = useState(false);
  const [expanded, setExpanded] = useState(Boolean(initialLookup?.brief?.render_preview));
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [retryAfter, setRetryAfter] = useState<number | null>(null);
  const [reviewMetrics, setReviewMetrics] = useState<AIResearchReviewMetrics | null>(null);
  const requestRevision = useRef(0);

  useEffect(() => {
    if (initialLookup !== undefined || identity.status !== "valid") return;
    const revision = ++requestRevision.current;
    setLoading(true);
    setErrorCode(null);
    void loadAIResearchBrief(identity.chain, identity.contract_address, locale)
      .then((value) => {
        if (revision !== requestRevision.current) return;
        const resolved = applyRenderReviewOverride(value);
        setLookup(resolved);
        setExpanded(Boolean(resolved.brief?.render_preview && resolved.availability === "READY"));
      })
      .catch((error) => {
        if (revision !== requestRevision.current) return;
        setErrorCode(error instanceof AIResearchDataSourceError ? error.code : "AI_RESEARCH_UNAVAILABLE");
      })
      .finally(() => { if (revision === requestRevision.current) setLoading(false); });
  }, [identity, initialLookup, locale]);

  useEffect(() => {
    const analysisId = lookup?.brief?.render_preview ? null : lookup?.brief?.analysis_id;
    if (!analysisId) { setReviewMetrics(null); return; }
    let cancelled = false;
    void loadAIResearchReviewMetrics(analysisId)
      .then((value) => { if (!cancelled) setReviewMetrics(value); })
      .catch(() => { if (!cancelled) setReviewMetrics(null); });
    return () => { cancelled = true; };
  }, [lookup?.brief?.analysis_id, lookup?.brief?.render_preview]);

  const requestPreparation = async () => {
    if (identity.status !== "valid" || requesting) return;
    setRequesting(true);
    setErrorCode(null);
    setRetryAfter(null);
    try {
      const result = await requestAIResearchBrief({ chain: identity.chain, contract_address: identity.contract_address, locale });
      setLookup(result);
      if (result.brief) setExpanded(true);
    } catch (error) {
      const code = error instanceof AIResearchDataSourceError ? error.code : "AI_RESEARCH_UNAVAILABLE";
      const retry = error instanceof AIResearchDataSourceError ? error.retryAfterSeconds : null;
      setErrorCode(code);
      setRetryAfter(retry);
      setLookup((previous) => applyAIResearchGenerationFailure(previous, error));
    } finally {
      setRequesting(false);
    }
  };

  const availability: AIResearchBriefLookup["availability"] = lookup?.availability ?? (loading ? "PROCESSING" : "ERROR");
  const brief = lookup?.brief ?? null;
  const effectiveError = errorCode ?? lookup?.error_code ?? null;
  const canRequest = identity.status === "valid"
    && !["QUEUED", "PROCESSING", "READY", "PROVIDER_DISABLED", "INSUFFICIENT_DATA", "SUSPENDED"].includes(availability);
  const showRequest = ["ABSENT", "STALE", "FAILED", "COOLDOWN", "RATE_LIMITED", "ERROR"].includes(availability);

  return (
    <section className="product-detail-section ai-research-section" aria-labelledby="ai-research-section-heading" aria-live="polite">
      <header className="ai-research-section-heading">
        <div><span className="candidate-detail-section-index">AI</span><div><h3 id="ai-research-section-heading">{ui.title}</h3><p>{ui.intro}</p></div></div>
        <StatusBadge tone={availabilityTone(availability)}>{availabilityLabel(availability, locale)}</StatusBadge>
      </header>
      <div className="ai-research-section-summary">
        <div>
          <strong>{stateTitle(availability, locale)}</strong>
          <p>{stateDetail(availability, effectiveError, retryAfter, locale, Boolean(brief))}</p>
          <p className="ai-shared-queue-note">{ui.sharedQueue}</p>
          {brief && !brief.render_preview && lookup?.provider_mode === "OPENAI" && (
            <span className="ai-openai-generated-status">{ui.openaiGenerated}</span>
          )}
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
              {ui.request}
            </ActionButton>
          )}
          {brief && (
            <ActionButton variant="primary" onClick={() => setExpanded((value) => !value)}>
              {expanded ? ui.close : ui.open}
            </ActionButton>
          )}
        </div>
      </div>
      <span className="sr-only" role="status" aria-live="polite">{requesting ? ui.requestingStatus : ""}</span>
      {brief && expanded && <AIResearchBriefCanvas brief={brief} symbol={symbol} name={name} reviewMetrics={reviewMetrics} />}
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
      .then((value) => { if (!cancelled) setState(value.availability); })
      .catch(() => { if (!cancelled) setState("ERROR"); });
    return () => { cancelled = true; };
  }, [identity, locale]);
  const visibleState = identity.status === "valid" ? state : "ERROR";
  const ready = visibleState === "READY" || visibleState === "STALE";
  return (
    <div className="ai-radar-status" data-ai-status={visibleState}>
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
  if (value === "READY") return pl ? "Analiza dostępna" : "Analysis available";
  if (value === "QUEUED") return pl ? "Analiza oczekuje w kolejce" : "Analysis is waiting in the queue";
  if (value === "PROCESSING") return pl ? "Analiza jest przygotowywana" : "Analysis is being prepared";
  if (value === "STALE") return pl ? "Ostatnia analiza dostępna" : "Last analysis available";
  if (value === "FAILED" || value === "ERROR" || value === "PROVIDER_DISABLED") return pl ? "Analiza chwilowo niedostępna" : "Analysis temporarily unavailable";
  if (value === "SUSPENDED") return pl ? "Przygotowanie analizy zostało wstrzymane" : "Analysis preparation has been suspended";
  if (value === "COOLDOWN" || value === "RATE_LIMITED") return pl ? "Zgłoszenie jest chwilowo ograniczone" : "Requests are temporarily limited";
  if (value === "INSUFFICIENT_DATA") return pl ? "Za mało danych do analizy" : "Not enough data for analysis";
  return pl ? "Analiza nie została jeszcze przygotowana" : "Analysis has not been prepared yet";
}

function stateDetail(
  value: AIResearchBriefLookup["availability"],
  error: string | null,
  retry: number | null,
  locale: "pl" | "en",
  hasBrief: boolean,
) {
  const pl = locale === "pl";
  if (value === "READY") return pl ? "Otwórz wspólny, zwalidowany Canvas z ryzykami, brakami i kolejnym krokiem badawczym." : "Open the shared validated Canvas with risks, gaps and the next research step.";
  if (value === "QUEUED") return pl ? "Zgłoszenie zostało zapisane. Centralny worker podejmie je zgodnie z kolejnością i limitami." : "The request was recorded. The central worker will pick it up according to queue order and limits.";
  if (value === "PROCESSING") return pl ? "Centralny worker przygotowuje jeden wspólny wynik dla tego stanu danych." : "The central worker is preparing one shared result for this data state.";
  if (value === "STALE") return pl ? "Dane zmieniły się, a aktualizacja jest przygotowywana. Poprzedni prawidłowy wynik pozostaje dostępny." : "Data changed and an update is being prepared. The previous valid result remains available.";
  if (value === "FAILED" && hasBrief) return pl ? "Aktualizacja nie powiodła się. Poprzedni prawidłowy wynik nie został usunięty." : "The update failed. The previous valid result was not removed.";
  if (value === "FAILED") return pl ? "Worker nie opublikował niezwalidowanego wyniku. Ponowne zgłoszenie będzie możliwe po cooldownie." : "The worker did not publish an unvalidated result. A new request will be possible after cooldown.";
  if (value === "SUSPENDED") return pl ? "Circuit breaker zatrzymał płatne wywołania do czasu jawnego wznowienia przez ownera." : "The circuit breaker stopped paid calls until the owner explicitly resumes them.";
  if (value === "COOLDOWN" || value === "RATE_LIMITED") return pl
    ? `Ponowne zgłoszenie będzie możliwe${retry ? ` za ${retry} s` : " później"}. Nie utworzono drugiej analizy.`
    : `Another request will be possible${retry ? ` in ${retry} sec` : " later"}. No duplicate analysis was created.`;
  if (value === "PROVIDER_DISABLED") return pl ? "Centralny worker providera jest wyłączony. Przeglądarka nie wykonuje wywołań OpenAI." : "The central provider worker is disabled. The browser does not call OpenAI.";
  if (value === "INSUFFICIENT_DATA") return pl ? "Serwer nie posiada zwalidowanych danych pozwalających przygotować wiarygodny brief." : "The server has no validated data that can prepare a reliable brief.";
  if (value === "ERROR") return pl ? `Nie udało się odczytać stanu analizy${error ? ` (${safeErrorLabel(error, locale)})` : ""}.` : `The analysis state could not be read${error ? ` (${safeErrorLabel(error, locale)})` : ""}.`;
  return pl ? "Możesz zgłosić potrzebę przygotowania wspólnej analizy." : "You can request preparation of the shared analysis.";
}

function safeErrorLabel(value: string, locale: "pl" | "en") {
  const pl = locale === "pl";
  if (value === "SAME_ORIGIN_REQUIRED") return pl ? "żądanie odrzucone przez kontrolę bezpieczeństwa" : "request rejected by origin security";
  if (value === "PROVIDER_TIMEOUT") return pl ? "przekroczono czas providera" : "provider timed out";
  if (value === "PROVIDER_ERROR") return pl ? "provider chwilowo niedostępny" : "provider temporarily unavailable";
  if (value === "VALIDATION_FAILURE") return pl ? "wynik nie przeszedł walidacji" : "result failed validation";
  if (value === "STORE_UNAVAILABLE") return pl ? "store niedostępny" : "store unavailable";
  return pl ? "analiza niedostępna" : "analysis unavailable";
}

const COPY = {
  pl: {
    title: "Analiza badawcza AI",
    intro: "Wspólna analiza zwalidowanych danych — bez sygnałów transakcyjnych.",
    request: "Zgłoś przygotowanie analizy",
    requesting: "Zapisywanie zgłoszenia…",
    requestingStatus: "Zgłoszenie trafia do wspólnej kolejki.",
    open: "Otwórz analizę AI",
    close: "Zamknij analizę AI",
    radarLabel: "Analiza AI",
    radarOpen: "Otwórz analizę AI",
    radarDetails: "Przejdź do szczegółów analizy",
    openaiGenerated: "Analiza przygotowana przez centralnego workera AI",
    sharedQueue: "Zgłoszenie nie uruchamia OpenAI natychmiast. Trafia do wspólnej kolejki; wszyscy użytkownicy otrzymają ten sam wynik, a ponowne zgłoszenie nie utworzy duplikatu.",
  },
  en: {
    title: "AI Research Brief",
    intro: "A shared analysis of validated data — without trading signals.",
    request: "Request analysis preparation",
    requesting: "Recording request…",
    requestingStatus: "The request is being added to the shared queue.",
    open: "Open AI analysis",
    close: "Close AI analysis",
    radarLabel: "AI analysis",
    radarOpen: "Open AI analysis",
    radarDetails: "Open analysis details",
    openaiGenerated: "Analysis prepared by the central AI worker",
    sharedQueue: "A request does not start OpenAI immediately. It enters the shared queue; all users receive the same result, and repeated requests do not create duplicates.",
  },
} as const;
