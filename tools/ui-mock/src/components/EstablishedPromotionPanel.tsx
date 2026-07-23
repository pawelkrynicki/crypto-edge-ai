import React, { useEffect, useState } from "react";

void React;
import { formatProductDateTime, useProductLocale } from "../productI18n";
import {
  addToEstablished,
  loadEstablishedPromotionPreview,
  loadEstablishedPromotionStatus,
  type EstablishedPromotionPreview,
  type EstablishedPromotionResult,
  type EstablishedPromotionStatus,
} from "../services/establishedPromotionDataSource";

const COPY = {
  en: {
    eyebrow: "Owner decision",
    title: "Consider for Established",
    candidateBoundary: "Candidate for Established means only that the token is ready for an owner decision.",
    createsVersion: "Adding it creates a new Established Universe version and audit entry.",
    noSafety: "This action does not verify token safety and is not an investment recommendation.",
    missingSecurity: "Missing security data requires manual verification.",
    noAutomatic: "There is no automatic addition to Established.",
    lifecycle: "Lifecycle status",
    chain: "Chain",
    address: "Contract address",
    filters: "Basic filters",
    security: "Security status",
    membership: "Established membership",
    mode: "Owner operations mode",
    eligibility: "Eligibility",
    reasons: "Reason codes",
    currentVersion: "Current universe version",
    plannedVersion: "Planned universe version",
    addressValidation: "Address validation",
    duplicate: "Duplicate check",
    entries: "Entries total",
    enabledEntries: "Enabled entries",
    expires: "Plan valid until",
    preview: "Preview addition plan",
    previewLoading: "Loading the read-only addition plan…",
    previewUnavailable: "The addition plan is unavailable.",
    reviewSafe: "Review-safe mode: adding to Established remains blocked.",
    confirm: "I confirm this exact chain and contract address and understand that a new universe version will be created.",
    add: "Add to Established",
    dialog: "Add this exact chain and contract address to a new Established Universe version?",
    added: "Added. A new universe version, history snapshot and audit entry were created.",
    noAction: "No change was made because the token is already active in Established.",
    failed: "The controlled addition was rejected. Refresh the plan before trying again.",
    unavailable: "Not available",
    none: "None",
  },
  pl: {
    eyebrow: "Decyzja ownera",
    title: "Rozważ do Established",
    candidateBoundary: "Status Candidate for Established oznacza wyłącznie kandydata do ręcznej decyzji ownera.",
    createsVersion: "Dodanie tworzy nową wersję Established Universe i wpis audytu.",
    noSafety: "Operacja nie potwierdza bezpieczeństwa tokena ani nie stanowi rekomendacji inwestycyjnej.",
    missingSecurity: "Brakujące dane bezpieczeństwa wymagają ręcznej weryfikacji.",
    noAutomatic: "Nie ma automatycznego dodania do Established.",
    lifecycle: "Status lifecycle",
    chain: "Chain",
    address: "Contract address",
    filters: "Filtry podstawowe",
    security: "Status bezpieczeństwa",
    membership: "Wpis Established",
    mode: "Tryb operacji ownera",
    eligibility: "Kwalifikacja",
    reasons: "Kody powodów",
    currentVersion: "Bieżąca wersja universe",
    plannedVersion: "Planowana wersja universe",
    addressValidation: "Walidacja adresu",
    duplicate: "Kontrola duplikatu",
    entries: "Liczba wpisów",
    enabledEntries: "Aktywne wpisy",
    expires: "Plan ważny do",
    preview: "Sprawdź plan dodania",
    previewLoading: "Wczytywanie planu dodania tylko do odczytu…",
    previewUnavailable: "Plan dodania jest niedostępny.",
    reviewSafe: "Tryb bezpiecznego przeglądu: dodanie do Established pozostaje zablokowane.",
    confirm: "Potwierdzam dokładny chain i contract address oraz utworzenie nowej wersji universe.",
    add: "Dodaj do Established",
    dialog: "Dodać ten dokładny chain i contract address do nowej wersji Established Universe?",
    added: "Dodano. Powstała nowa wersja universe, wpis historii i audytu.",
    noAction: "Nie wprowadzono zmiany, ponieważ token jest już aktywny w Established.",
    failed: "Kontrolowane dodanie zostało odrzucone. Odśwież plan przed kolejną próbą.",
    unavailable: "Niedostępne",
    none: "Brak",
  },
} as const;

export function EstablishedPromotionPanel({
  initialStatus,
}: {
  initialStatus: EstablishedPromotionStatus;
}) {
  const { locale } = useProductLocale();
  const copy = COPY[locale];
  const [status, setStatus] = useState(initialStatus);
  const [preview, setPreview] = useState<EstablishedPromotionPreview | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<EstablishedPromotionResult | "ERROR" | null>(null);
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  useEffect(() => setStatus(initialStatus), [initialStatus]);
  useEffect(() => {
    if (!preview) return;
    const delay = Math.max(0, Date.parse(preview.expires_at) - Date.now() + 25);
    const timer = window.setTimeout(() => setCurrentTime(Date.now()), delay);
    return () => window.clearTimeout(timer);
  }, [preview]);

  if (!status.owner_controls_visible) return null;
  const previewFresh = preview !== null && Date.parse(preview.expires_at) > currentTime;
  const canAdd = status.mode === "ENABLED"
    && status.owner_actions_enabled
    && previewFresh
    && preview.action_plan === "ADD"
    && preview.lock_available
    && confirmed
    && !submitting;

  const checkPlan = async () => {
    setLoadingPreview(true);
    setPreviewError(false);
    setConfirmed(false);
    setResult(null);
    setCurrentTime(Date.now());
    const next = await loadEstablishedPromotionPreview(status.chain, status.contract_address);
    setPreview(next);
    setPreviewError(next === null);
    setLoadingPreview(false);
  };

  const add = async () => {
    if (!canAdd || !preview || !window.confirm(copy.dialog)) return;
    setSubmitting(true);
    setResult(null);
    try {
      const nextResult = await addToEstablished(preview);
      setResult(nextResult);
      const nextStatus = await loadEstablishedPromotionStatus(status.chain, status.contract_address);
      if (nextStatus?.owner_controls_visible) setStatus(nextStatus);
      setPreview(null);
      setConfirmed(false);
    } catch {
      setResult("ERROR");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="product-detail-section established-promotion-panel" aria-labelledby="established-promotion-heading">
      <header className="promotion-panel-header">
        <span className="candidate-detail-eyebrow">{copy.eyebrow}</span>
        <h3 id="established-promotion-heading">{copy.title}</h3>
        <p>{copy.candidateBoundary}</p>
      </header>

      {status.mode === "REVIEW_SAFE" && <p className="owner-review-safe" role="status">{copy.reviewSafe}</p>}

      <div className="owner-operations-summary">
        <PromotionFact label={copy.lifecycle} value={status.lifecycle_status} />
        <PromotionFact label={copy.chain} value={status.chain} />
        <PromotionFact label={copy.address} value={status.contract_address} mono />
        <PromotionFact label={copy.filters} value={status.basic_filter_status} />
        <PromotionFact label={copy.security} value={status.security_status} />
        <PromotionFact label={copy.membership} value={status.established_membership} />
        <PromotionFact label={copy.mode} value={status.mode} />
      </div>

      <div className="promotion-boundary-copy">
        <p>{copy.noAutomatic}</p>
        <p>{copy.createsVersion}</p>
        <p>{copy.noSafety}</p>
        {(status.security_status === "MANUAL_VERIFICATION_REQUIRED"
          || status.security_status === "PARTIAL"
          || status.security_status === "UNAVAILABLE") && <p className="warning">{copy.missingSecurity}</p>}
      </div>

      <button type="button" className="secondary-button owner-preview-button" onClick={() => void checkPlan()} disabled={loadingPreview}>
        {copy.preview}
      </button>
      {loadingPreview && <p role="status">{copy.previewLoading}</p>}
      {!loadingPreview && previewError && <p role="alert">{copy.previewUnavailable}</p>}

      {preview && (
        <div className="owner-preflight-summary" data-established-promotion-preview="visible">
          <PromotionFact label={copy.eligibility} value={preview.eligibility_status} />
          <PromotionFact label={copy.reasons} value={preview.reason_codes.join(", ") || copy.none} />
          <PromotionFact label={copy.currentVersion} value={preview.current_universe_version ?? copy.unavailable} />
          {preview.action_plan === "ADD" && <PromotionFact label={copy.plannedVersion} value={preview.planned_universe_version ?? copy.unavailable} />}
          <PromotionFact label={copy.addressValidation} value={preview.address_validation_status} />
          <PromotionFact label={copy.duplicate} value={preview.duplicate_status} />
          <PromotionFact label={copy.entries} value={changeValue(preview.current_entries_total, preview.planned_entries_total, preview.action_plan, copy.unavailable)} />
          <PromotionFact label={copy.enabledEntries} value={changeValue(preview.current_entries_enabled, preview.planned_entries_enabled, preview.action_plan, copy.unavailable)} />
          <PromotionFact label={copy.expires} value={formatProductDateTime(preview.expires_at, locale)} />
          <p>{copy.createsVersion}</p>
          {preview.manual_verification_required && <p className="warning">{copy.missingSecurity}</p>}
        </div>
      )}

      <label className="owner-confirmation">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
          disabled={status.mode !== "ENABLED" || !previewFresh || preview?.action_plan !== "ADD" || !preview?.lock_available || submitting}
        />
        <span>{copy.confirm}</span>
      </label>
      <div className="promotion-confirmed-identity">
        <strong>{status.chain}</strong>
        <code>{status.contract_address}</code>
      </div>
      <button type="button" className="primary-button owner-promotion-button" onClick={() => void add()} disabled={!canAdd}>
        {copy.add}
      </button>

      {result === "ERROR" && <p className="owner-operation-result failed" role="alert">{copy.failed}</p>}
      {result && result !== "ERROR" && (
        <p className="owner-operation-result success" role="status">
          {result.status === "ADDED" ? copy.added : copy.noAction}
        </p>
      )}
    </section>
  );
}

function PromotionFact({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="owner-operation-fact"><strong>{label}</strong><span className={mono ? "mono" : undefined}>{value}</span></div>;
}

function changeValue(
  current: number | null,
  planned: number | null,
  action: EstablishedPromotionPreview["action_plan"],
  unavailable: string,
): string {
  if (current === null) return unavailable;
  return action === "ADD" && planned !== null ? `${current} → ${planned}` : String(current);
}
