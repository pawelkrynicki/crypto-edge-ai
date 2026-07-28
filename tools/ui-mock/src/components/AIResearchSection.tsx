import React, { useEffect, useMemo, useRef, useState } from "react";
import { useProductLocale } from "../productI18n";
import {
  AIResearchDataSourceError,
  generateAIResearchBrief,
  loadAIResearchBrief,
  loadAIResearchReviewMetrics,
} from "../services/aiResearchDataSource";
import type { AIResearchBriefLookup, AIResearchReviewMetrics } from "../types/aiResearchTypes";
import { resolveTokenIdentity } from "../tokenLifecycle";
import { AIResearchBriefCanvas } from "./AIResearchBriefCanvas";
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
  const [generating, setGenerating] = useState(false);
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

  const generate = async () => {
    if (identity.status !== "valid" || generating) return;
    setGenerating(true);
    setErrorCode(null);
    setRetryAfter(null);
    try {
      const result = await generateAIResearchBrief({ chain: identity.chain, contract_address: identity.contract_address, locale });
      setLookup(result);
      setExpanded(true);
    } catch (error) {
      const code = error instanceof AIResearchDataSourceError ? error.code : "AI_RESEARCH_UNAVAILABLE";
      const retry = error instanceof AIResearchDataSourceError ? error.retryAfterSeconds : null;
      setErrorCode(code);
      setRetryAfter(retry);
      setLookup((previous) => applyAIResearchGenerationFailure(previous, error));
    } finally {
      setGenerating(false);
    }
  };

  const availability = generating ? "GENERATING" : lookup?.availability ?? (loading ? "GENERATING" : "ERROR");
  const brief = lookup?.brief ?? null;
  const blockedReason = lookup?.generation_blocked_reason ?? (errorCode === "LIVE_CALL_BUDGET_EXHAUSTED" ? errorCode : null);
  const effectiveError = errorCode ?? lookup?.error_code ?? blockedReason;
  const canGenerate = identity.status === "valid"
    && availability !== "PROVIDER_DISABLED"
    && availability !== "INSUFFICIENT_DATA"
    && blockedReason === null;
  return (
    <section className="product-detail-section ai-research-section" aria-labelledby="ai-research-section-heading" aria-live="polite">
      <header className="ai-research-section-heading">
        <div><span className="candidate-detail-section-index">AI</span><div><h3 id="ai-research-section-heading">{ui.title}</h3><p>{ui.intro}</p></div></div>
        <StatusBadge tone={availabilityTone(availability)}>{availabilityLabel(availability, locale)}</StatusBadge>
      </header>
      <div className="ai-research-section-summary">
        <div>
          <strong>{stateTitle(availability, locale)}</strong>
          <p>{stateDetail(availability, effectiveError, retryAfter, locale)}</p>
          {brief && !brief.render_preview && lookup?.provider_mode === "OPENAI" && (
            <span className="ai-openai-generated-status">{ui.openaiGenerated}</span>
          )}
        </div>
        <div className="ai-research-section-actions">
          {(availability === "ABSENT" || availability === "ERROR" || availability === "STALE" || availability === "RATE_LIMITED") && (
            <ActionButton
              variant={availability === "STALE" ? "primary" : brief ? "secondary" : "primary"}
              loading={generating}
              loadingLabel={ui.generating}
              disabled={!canGenerate}
              onClick={() => void generate()}
            >
              {availability === "STALE" ? ui.update : ui.generate}
            </ActionButton>
          )}
          {brief && (availability === "READY" || availability === "STALE") && (
            <ActionButton variant={availability === "STALE" ? "secondary" : "primary"} onClick={() => setExpanded((value) => !value)}>
              {expanded ? ui.close : ui.open}
            </ActionButton>
          )}
        </div>
      </div>
      <span className="sr-only" role="status" aria-live="polite">{generating ? ui.generatingStatus : ""}</span>
      {brief && expanded && <AIResearchBriefCanvas brief={brief} symbol={symbol} name={name} reviewMetrics={reviewMetrics} />}
    </section>
  );
}

export function applyAIResearchGenerationFailure(
  previous: AIResearchBriefLookup | null,
  error: unknown,
): AIResearchBriefLookup {
  const knownError = error instanceof AIResearchDataSourceError ? error : null;
  const errorCode = knownError?.code ?? "AI_RESEARCH_UNAVAILABLE";
  const cachedBrief = knownError?.cachedBrief ?? previous?.brief ?? null;
  return {
    schema_version: "ai_research_lookup_v1",
    availability: cachedBrief ? "STALE" : "ERROR",
    provider_mode: previous?.provider_mode ?? "OPENAI",
    brief: cachedBrief,
    retry_after_seconds: knownError?.retryAfterSeconds ?? null,
    error_code: errorCode,
    generation_blocked_reason: errorCode === "LIVE_CALL_BUDGET_EXHAUSTED" ? "LIVE_CALL_BUDGET_EXHAUSTED" : null,
  };
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
  useEffect(() => {
    const identity = resolveTokenIdentity(chain, contractAddress);
    if (identity.status !== "valid") { setState("ERROR"); return; }
    let cancelled = false;
    void loadAIResearchBrief(identity.chain, identity.contract_address, locale)
      .then((value) => { if (!cancelled) setState(value.availability); })
      .catch(() => { if (!cancelled) setState("ERROR"); });
    return () => { cancelled = true; };
  }, [chain, contractAddress, locale]);
  const ready = state === "READY" || state === "STALE";
  return (
    <div className="ai-radar-status" data-ai-status={state}>
      <span>{ui.radarLabel}</span>
      <StatusBadge tone={availabilityTone(state)}>{availabilityLabel(state, locale)}</StatusBadge>
      {onOpen && <ActionButton variant="tertiary" onClick={onOpen}>{ready ? ui.radarOpen : ui.radarDetails}</ActionButton>}
    </div>
  );
}

function applyRenderReviewOverride(value: AIResearchBriefLookup): AIResearchBriefLookup {
  if (!value.brief?.render_preview || typeof window === "undefined") return value;
  const reviewState = new URLSearchParams(window.location.search).get("ai_review_state");
  if (reviewState === "absent") return { ...value, availability: "ABSENT", brief: null };
  if (reviewState === "generating") return { ...value, availability: "GENERATING", brief: null };
  if (reviewState === "stale") return { ...value, availability: "STALE" };
  if (reviewState === "provider-disabled") return { ...value, availability: "PROVIDER_DISABLED", brief: null };
  if (reviewState === "error") return { ...value, availability: "ERROR", brief: null, error_code: "VALIDATION_FAILURE" };
  return value;
}

function availabilityLabel(value: AIResearchBriefLookup["availability"], locale: "pl" | "en") {
  const labels: Record<AIResearchBriefLookup["availability"], [string, string]> = {
    ABSENT: ["No analysis", "Brak analizy"], GENERATING: ["Generating", "Generowanie"], READY: ["Ready", "Gotowa"], STALE: ["Stale", "Nieaktualna"], PROVIDER_DISABLED: ["Unavailable", "Niedostępna"], INSUFFICIENT_DATA: ["Insufficient data", "Niewystarczające dane"], RATE_LIMITED: ["Temporarily limited", "Limit czasowy"], ERROR: ["Error", "Błąd"],
  };
  return labels[value][locale === "pl" ? 1 : 0];
}

function availabilityTone(value: AIResearchBriefLookup["availability"]): "neutral" | "accent" | "ready" | "partial" | "warning" | "not-ready" {
  if (value === "READY") return "ready";
  if (value === "GENERATING") return "accent";
  if (value === "STALE" || value === "RATE_LIMITED" || value === "INSUFFICIENT_DATA") return "warning";
  if (value === "ERROR") return "not-ready";
  if (value === "PROVIDER_DISABLED") return "partial";
  return "neutral";
}

function stateTitle(value: AIResearchBriefLookup["availability"], locale: "pl" | "en") {
  const pl = locale === "pl";
  if (value === "READY") return pl ? "Brief badawczy jest gotowy" : "Research brief is ready";
  if (value === "STALE") return pl ? "Dane zmieniły się od ostatniej analizy" : "Data changed since the last analysis";
  if (value === "GENERATING") return pl ? "Trwa porządkowanie danych" : "Organizing available data";
  if (value === "PROVIDER_DISABLED") return pl ? "AI provider niedostępny" : "AI provider unavailable";
  if (value === "INSUFFICIENT_DATA") return pl ? "Za mało danych do briefu" : "Not enough data for a brief";
  if (value === "RATE_LIMITED") return pl ? "Generowanie jest chwilowo ograniczone" : "Generation is temporarily limited";
  if (value === "ERROR") return pl ? "Nie udało się przygotować briefu" : "The brief could not be prepared";
  return pl ? "Analiza nie została jeszcze wygenerowana" : "Analysis has not been generated yet";
}

function stateDetail(value: AIResearchBriefLookup["availability"], error: string | null, retry: number | null, locale: "pl" | "en") {
  const pl = locale === "pl";
  if (error === "LIVE_CALL_BUDGET_EXHAUSTED") return pl ? "Limit jednego płatnego wywołania został wykorzystany. Istniejący cache pozostaje dostępny." : "The one paid-call budget has been used. Existing cache remains available.";
  if (error === "LIVE_CALL_BUDGET_INVALID") return pl ? "Konfiguracja limitu live call jest nieprawidłowa; żaden request nie zostanie wykonany." : "The live-call budget is invalid; no request will be made.";
  if (error === "REVIEW_STORE_REQUIRED") return pl ? "Tryb live-one wymaga izolowanego store review; żaden request nie zostanie wykonany." : "Live-one requires the isolated review store; no request will be made.";
  if (value === "READY") return pl ? "Otwórz deterministyczny Canvas z ryzykami, brakami i kolejnym krokiem badawczym." : "Open the deterministic Canvas with risks, gaps and the next research step.";
  if (value === "STALE" && error) return pl ? `Nie udało się zaktualizować analizy (${safeErrorLabel(error, locale)}). Poprzedni brief pozostaje dostępny.` : `The analysis could not be updated (${safeErrorLabel(error, locale)}). The previous brief remains available.`;
  if (value === "STALE") return pl ? "Poprzedni brief pozostaje dostępny. Wygeneruj nowy dopiero na żądanie." : "The previous brief remains available. Generate a new one only on demand.";
  if (value === "GENERATING") return pl ? "Jedno żądanie pracuje dla tego fingerprintu; równoległe żądania współdzielą wynik." : "One request is running for this fingerprint; concurrent requests share the result.";
  if (value === "PROVIDER_DISABLED" && error === "MISSING_API_KEY") return pl ? "Brak OPENAI_API_KEY. Generowanie jest zablokowane i nie wykonano requestu." : "OPENAI_API_KEY is missing. Generation is blocked and no request was made.";
  if (value === "PROVIDER_DISABLED" && error === "MODEL_NOT_CONFIGURED") return pl ? "Brak CRYPTO_EDGE_AI_RESEARCH_MODEL. Generowanie jest zablokowane i nie wykonano requestu." : "CRYPTO_EDGE_AI_RESEARCH_MODEL is missing. Generation is blocked and no request was made.";
  if (value === "PROVIDER_DISABLED") return pl ? "Tryb domyślny to DISABLED. Konfiguracja lub osobna zgoda ownera jest wymagana przed prawdziwym wywołaniem." : "The default mode is DISABLED. Configuration or separate owner approval is required before a real call.";
  if (value === "INSUFFICIENT_DATA") return pl ? "Produkt nie posiada danych pozwalających przygotować wiarygodny brief dla tego obszaru." : "The product has no data that can prepare a reliable brief for this area.";
  if (value === "RATE_LIMITED") return pl ? `Spróbuj ponownie${retry ? ` za ${retry} s` : " później"}. Poprawny cache nie został usunięty.` : `Try again${retry ? ` in ${retry} sec` : " later"}. The valid cache was preserved.`;
  if (value === "ERROR") return pl ? `Żądanie zakończyło się bez zapisu${error ? ` (${safeErrorLabel(error, locale)})` : ""}.` : `The request ended without saving${error ? ` (${safeErrorLabel(error, locale)})` : ""}.`;
  return pl ? "Generowanie następuje wyłącznie po jawnym kliknięciu i nie zmienia lifecycle." : "Generation happens only after an explicit click and does not change lifecycle.";
}

function safeErrorLabel(value: string, locale: "pl" | "en") {
  if (value === "LIVE_CALL_BUDGET_EXHAUSTED") return locale === "pl" ? "limit jednego wywołania został wykorzystany" : "the one-call budget has been used";
  if (value === "LIVE_CALL_BUDGET_INVALID") return locale === "pl" ? "nieprawidłowy limit live call" : "invalid live-call budget";
  if (value === "REVIEW_STORE_REQUIRED") return locale === "pl" ? "wymagany izolowany store review" : "isolated review store required";
  if (value === "SAME_ORIGIN_REQUIRED") return locale === "pl" ? "żądanie odrzucone przez kontrolę bezpieczeństwa" : "request rejected by the origin security check";
  if (value === "PROVIDER_TIMEOUT") return locale === "pl" ? "przekroczono czas oczekiwania na provider" : "provider request timed out";
  if (value === "PROVIDER_ERROR") return locale === "pl" ? "provider jest chwilowo niedostępny" : "provider is temporarily unavailable";
  if (value === "MISSING_API_KEY") return locale === "pl" ? "brak konfiguracji klucza API" : "API key is not configured";
  if (value === "MODEL_NOT_CONFIGURED") return locale === "pl" ? "brak konfiguracji modelu" : "model is not configured";
  if (value === "VALIDATION_FAILURE") return locale === "pl" ? "wynik nie przeszedł walidacji" : "result failed validation";
  if (value === "STORE_UNAVAILABLE") return locale === "pl" ? "store niedostępny" : "store unavailable";
  return locale === "pl" ? "analiza niedostępna" : "analysis unavailable";
}

const COPY = {
  pl: { title: "Analiza badawcza AI", intro: "Uporządkowanie dostępnych danych i kolejnego kroku badawczego — bez sygnałów transakcyjnych.", generate: "Wygeneruj analizę AI", generating: "Generowanie…", generatingStatus: "Generowanie analizy AI trwa.", open: "Otwórz analizę AI", close: "Zamknij analizę AI", update: "Zaktualizuj analizę AI", radarLabel: "Analiza AI", radarOpen: "Otwórz analizę AI", radarDetails: "Przejdź do szczegółów, aby wygenerować", openaiGenerated: "Analiza wygenerowana przez OpenAI" },
  en: { title: "AI Research Brief", intro: "Organization of available data and the next research step — without trading signals.", generate: "Generate AI analysis", generating: "Generating…", generatingStatus: "AI analysis generation is in progress.", open: "Open AI analysis", close: "Close AI analysis", update: "Update AI analysis", radarLabel: "AI analysis", radarOpen: "Open AI analysis", radarDetails: "Go to details to generate", openaiGenerated: "Analysis generated by OpenAI" },
} as const;
