/* eslint-disable react-refresh/only-export-components -- Formatting helpers are intentionally exported for contract tests. */
import React, { useEffect, useState } from "react";

void React;
import { formatProductDateTime, useProductLocale, type ProductLocale } from "../productI18n";
import {
  addToEstablished,
  loadEstablishedPromotionPreview,
  loadEstablishedPromotionStatus,
  type EstablishedPromotionPreview,
  type EstablishedPromotionResult,
  type EstablishedPromotionStatus,
} from "../services/establishedPromotionDataSource";
import { ActionButton } from "./ProductUi";

const COPY = {
  en: {
    eyebrow: "Owner decision",
    title: "Main Radar decision",
    candidateBoundary: (lifecycle: string) => `Review readiness for the Main Radar. The current observation status is ${lifecycle}; the owner makes the final decision.`,
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
    actionPlan: "Addition plan",
    reasons: "Reasons",
    conditionsMet: "Conditions met",
    conditionsUnmet: "Conditions unmet",
    overrideHelp: "Some readiness conditions are not met. The owner may make the final decision with an explicit reason.",
    reasonLabel: "Owner decision reason",
    identityLabel: (identity: string) => `Enter exactly ${identity}`,
    currentVersion: "Current Established version",
    plannedVersion: "Planned Established version",
    addressValidation: "Address validation",
    duplicate: "Duplicate check",
    entries: "Entries total",
    enabledEntries: "Enabled entries",
    expires: "Plan valid until",
    preview: "Preview addition plan",
    previewLoading: "Loading the read-only addition plan…",
    previewUnavailable: "The addition plan is unavailable.",
    reviewSafe: "Review-safe mode: adding to Established remains blocked.",
    previewFirst: "Check the addition plan before confirming this action.",
    confirmFirst: "Confirm the exact chain and contract address to enable this action.",
    additionUnavailable: "Adding is unavailable because the token does not meet the eligibility requirements.",
    confirm: "I confirm this exact chain and contract address and understand that a new universe version will be created.",
    add: "Move to Main Radar",
    added: "Added. A new universe version, history snapshot and audit entry were created.",
    noAction: "No change was made because the token is already active in Established.",
    failed: "The controlled addition was rejected. Refresh the plan before trying again.",
    unavailable: "Not available",
    none: "None",
  },
  pl: {
    eyebrow: "Decyzja ownera",
    title: "Decyzja o Głównym Radarze",
    candidateBoundary: (lifecycle: string) => `Sprawdź gotowość do Głównego Radaru. Bieżący status obserwacji to ${lifecycle}; ostateczną decyzję podejmuje właściciel.`,
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
    actionPlan: "Plan dodania",
    reasons: "Powody",
    conditionsMet: "Warunki spełnione",
    conditionsUnmet: "Warunki niespełnione",
    overrideHelp: "Nie wszystkie warunki gotowości są spełnione. Właściciel może podjąć ostateczną decyzję z jawnym uzasadnieniem.",
    reasonLabel: "Uzasadnienie decyzji właściciela",
    identityLabel: (identity: string) => `Wpisz dokładnie ${identity}`,
    currentVersion: "Bieżąca wersja Established",
    plannedVersion: "Planowana wersja Established",
    addressValidation: "Walidacja adresu",
    duplicate: "Kontrola duplikatu",
    entries: "Liczba wpisów",
    enabledEntries: "Aktywne wpisy",
    expires: "Plan ważny do",
    preview: "Sprawdź plan dodania",
    previewLoading: "Wczytywanie planu dodania tylko do odczytu…",
    previewUnavailable: "Plan dodania jest niedostępny.",
    reviewSafe: "Tryb bezpiecznego przeglądu: dodanie do Established pozostaje zablokowane.",
    previewFirst: "Najpierw sprawdź plan dodania, aby potwierdzić tę akcję.",
    confirmFirst: "Potwierdź dokładną sieć i adres kontraktu, aby aktywować tę akcję.",
    additionUnavailable: "Dodanie jest niedostępne, ponieważ token nie spełnia warunków kwalifikacji.",
    confirm: "Potwierdzam dokładny chain i contract address oraz utworzenie nowej wersji Established.",
    add: "Przenieś do Głównego Radaru",
    added: "Dodano. Powstała nowa wersja Established, wpis historii i audytu.",
    noAction: "Nie wprowadzono zmiany, ponieważ token jest już aktywny w Established.",
    failed: "Kontrolowane dodanie zostało odrzucone. Odśwież plan przed kolejną próbą.",
    unavailable: "Niedostępne",
    none: "Brak",
  },
} as const;

type PromotionValueGroup =
  | "lifecycle"
  | "basicFilter"
  | "security"
  | "membership"
  | "mode"
  | "eligibility"
  | "actionPlan"
  | "addressValidation"
  | "duplicate";

const PRESENTATION_LABELS: Record<ProductLocale, Record<PromotionValueGroup, Record<string, string>>> = {
  en: {
    lifecycle: {
      NEW: "New",
      MATURING: "Continued observation",
      CANDIDATE_FOR_ESTABLISHED: "Candidate for Established",
      ESTABLISHED: "Established",
      ARCHIVED: "Archived",
    },
    basicFilter: {
      passed_basic_filter: "Filters passed",
      rejected_basic_filter: "Filters not passed",
      not_checked: "Not checked",
    },
    security: {
      PARTIAL: "Partial data",
      AVAILABLE: "Available",
      COMPLETE: "Available",
      CHECKED: "Checked data",
      UNAVAILABLE: "Unavailable",
      MANUAL_VERIFICATION_REQUIRED: "Manual verification required",
      CRITICAL_RISK: "Critical risk",
    },
    membership: {
      NOT_ESTABLISHED: "Not in Established",
      ACTIVE: "Active Established entry",
      DISABLED: "Inactive Established entry",
    },
    mode: {
      REVIEW_SAFE: "Review-safe mode",
      DISABLED: "Disabled",
      ENABLED: "Enabled",
    },
    eligibility: {
      ELIGIBLE: "Eligible",
      OVERRIDE_REQUIRED: "Owner decision required",
      BLOCKED: "Blocked",
      NO_ACTION: "No action",
    },
    actionPlan: {
      ADD: "Ready to add",
      BLOCKED: "Blocked",
      NO_ACTION: "No action",
    },
    addressValidation: {
      VALID: "Valid",
      INVALID: "Invalid",
    },
    duplicate: {
      NONE: "No duplicate detected",
      ACTIVE_ENTRY_EXISTS: "Active Established entry already exists",
      DISABLED_ENTRY_EXISTS: "Inactive Established entry already exists",
    },
  },
  pl: {
    lifecycle: {
      NEW: "Nowe",
      MATURING: "Dalsza obserwacja",
      CANDIDATE_FOR_ESTABLISHED: "Kandydat do Established",
      ESTABLISHED: "Established",
      ARCHIVED: "Archiwalne",
    },
    basicFilter: {
      passed_basic_filter: "Filtry spełnione",
      rejected_basic_filter: "Filtry niespełnione",
      not_checked: "Nie sprawdzono",
    },
    security: {
      PARTIAL: "Częściowe dane",
      AVAILABLE: "Dostępne",
      COMPLETE: "Dostępne",
      CHECKED: "Dane sprawdzone",
      UNAVAILABLE: "Niedostępne",
      MANUAL_VERIFICATION_REQUIRED: "Wymagana ręczna weryfikacja",
      CRITICAL_RISK: "Ryzyko krytyczne",
    },
    membership: {
      NOT_ESTABLISHED: "Nie znajduje się w Established",
      ACTIVE: "Aktywny wpis Established",
      DISABLED: "Nieaktywny wpis Established",
    },
    mode: {
      REVIEW_SAFE: "Bezpieczny tryb przeglądu",
      DISABLED: "Wyłączone",
      ENABLED: "Włączone",
    },
    eligibility: {
      ELIGIBLE: "Spełnia warunki",
      OVERRIDE_REQUIRED: "Wymagana decyzja właściciela",
      BLOCKED: "Zablokowane",
      NO_ACTION: "Brak działania",
    },
    actionPlan: {
      ADD: "Gotowe do dodania",
      BLOCKED: "Zablokowane",
      NO_ACTION: "Brak działania",
    },
    addressValidation: {
      VALID: "Prawidłowy",
      INVALID: "Nieprawidłowy",
    },
    duplicate: {
      NONE: "Nie wykryto duplikatu",
      ACTIVE_ENTRY_EXISTS: "Aktywny wpis Established już istnieje",
      DISABLED_ENTRY_EXISTS: "Nieaktywny wpis Established już istnieje",
    },
  },
};

const PROMOTION_REASON_COPY: Record<ProductLocale, Record<string, string>> = {
  en: {
    ALREADY_ESTABLISHED: "The token is already an active Established entry.",
    UNIVERSE_NOT_VALID: "The current Established Universe is unavailable or invalid.",
    DISABLED_ENTRY_EXISTS: "An inactive Established entry already exists and cannot be enabled by this action.",
    LIFECYCLE_NEW: "The token remains in the New layer and is not yet a candidate for Established.",
    LIFECYCLE_MATURING: "The token remains under continued observation and is not yet a candidate for Established.",
    LIFECYCLE_CANDIDATE_FOR_ESTABLISHED: "The token candidate status does not permit this action in the current state.",
    LIFECYCLE_ESTABLISHED: "The token is already in Established.",
    LIFECYCLE_ARCHIVED: "Archived tokens cannot be added to Established through this action.",
    BASIC_FILTER_NOT_PASSED: "The token did not pass the Radar basic filters.",
    FOLLOW_UP_ENTRY_REQUIRED: "The token must first be added to continued observation.",
    MANUAL_VERIFICATION_MISSING: "A saved manual verification decision is missing.",
    CRITICAL_RISK_REPORTED: "A critical risk is recorded and requires an explicit owner decision.",
    PROMOTION_ALREADY_IN_PROGRESS: "Another Established Universe operation is currently in progress.",
  },
  pl: {
    ALREADY_ESTABLISHED: "Token jest już aktywnym wpisem Established.",
    UNIVERSE_NOT_VALID: "Bieżący Established Universe jest niedostępny albo nieprawidłowy.",
    DISABLED_ENTRY_EXISTS: "Nieaktywny wpis Established już istnieje i nie może zostać włączony przez tę operację.",
    LIFECYCLE_NEW: "Token pozostaje w warstwie Nowe i nie jest jeszcze kandydatem do Established.",
    LIFECYCLE_MATURING: "Token pozostaje w dalszej obserwacji i nie jest jeszcze kandydatem do Established.",
    LIFECYCLE_CANDIDATE_FOR_ESTABLISHED: "Status kandydata nie pozwala na tę operację w bieżącym stanie.",
    LIFECYCLE_ESTABLISHED: "Token znajduje się już w Established.",
    LIFECYCLE_ARCHIVED: "Archiwalnego tokena nie można dodać do Established przez tę operację.",
    BASIC_FILTER_NOT_PASSED: "Token nie przeszedł podstawowych filtrów Radaru.",
    FOLLOW_UP_ENTRY_REQUIRED: "Token trzeba najpierw dodać do dalszej obserwacji.",
    MANUAL_VERIFICATION_MISSING: "Brakuje zapisanej decyzji ręcznej weryfikacji.",
    CRITICAL_RISK_REPORTED: "Zapisano ryzyko krytyczne wymagające jawnej decyzji właściciela.",
    PROMOTION_ALREADY_IN_PROGRESS: "Inna operacja na Established Universe jest obecnie wykonywana.",
  },
};

const UNKNOWN_REASON_COPY: Record<ProductLocale, string> = {
  en: "The action does not meet the current requirements.",
  pl: "Operacja nie spełnia aktualnych warunków.",
};

export function formatEstablishedPromotionValue(
  group: PromotionValueGroup,
  value: string,
  locale: ProductLocale,
): string {
  return PRESENTATION_LABELS[locale][group][value] ?? value;
}

export function formatEstablishedPromotionReason(code: string, locale: ProductLocale): string {
  return PROMOTION_REASON_COPY[locale][code] ?? UNKNOWN_REASON_COPY[locale];
}

export function EstablishedPromotionPanel({
  initialStatus,
  initialPreview = null,
  onStatusChange,
  onLifecycleChanged,
}: {
  initialStatus: EstablishedPromotionStatus;
  initialPreview?: EstablishedPromotionPreview | null;
  onStatusChange?: (status: EstablishedPromotionStatus) => void;
  onLifecycleChanged?: () => void | Promise<void>;
}) {
  const { locale } = useProductLocale();
  const copy = COPY[locale];
  const [status, setStatus] = useState(initialStatus);
  const [preview, setPreview] = useState<EstablishedPromotionPreview | null>(initialPreview);
  const [confirmed, setConfirmed] = useState(false);
  const [identityConfirmation, setIdentityConfirmation] = useState("");
  const [ownerReason, setOwnerReason] = useState("");
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<EstablishedPromotionResult | "ERROR" | null>(null);
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  useEffect(() => {
    if (!preview) return;
    const delay = Math.max(0, Date.parse(preview.expires_at) - Date.now() + 25);
    const timer = window.setTimeout(() => setCurrentTime(Date.now()), delay);
    return () => window.clearTimeout(timer);
  }, [preview]);

  if (!status.owner_controls_visible) return null;
  const previewFresh = preview !== null && Date.parse(preview.expires_at) > currentTime;
  const canConfirm = status.mode === "ENABLED"
    && status.owner_actions_enabled
    && previewFresh
    && preview.action_plan === "ADD"
    && preview.eligibility_status !== "BLOCKED"
    && preview.lock_available
    && !submitting;
  const canAdd = canConfirm && confirmed;
  const expectedIdentity = `${status.chain}:${status.contract_address}`;
  const overrideRequired = preview?.manual_override_required === true;
  const decisionComplete = identityConfirmation === expectedIdentity
    && (!overrideRequired || ownerReason.trim().length >= 3);
  const disabledReason = status.mode === "REVIEW_SAFE"
    ? copy.reviewSafe
    : !previewFresh
      ? copy.previewFirst
      : !confirmed || !decisionComplete
        ? copy.confirmFirst
        : copy.additionUnavailable;
  const previewBlocked = preview !== null
    && (preview.action_plan !== "ADD" || preview.eligibility_status === "BLOCKED");
  const lifecycleLabel = formatEstablishedPromotionValue("lifecycle", status.lifecycle_status, locale);

  const checkPlan = async () => {
    setLoadingPreview(true);
    setPreviewError(false);
    setConfirmed(false);
    setIdentityConfirmation("");
    setOwnerReason("");
    setResult(null);
    setCurrentTime(Date.now());
    const next = await loadEstablishedPromotionPreview(status.chain, status.contract_address);
    setPreview(next);
    setPreviewError(next === null);
    setLoadingPreview(false);
  };

  const add = async () => {
    if (!canAdd || !decisionComplete || !preview) return;
    setSubmitting(true);
    setResult(null);
    try {
      const nextResult = await addToEstablished(preview, {
        identityConfirmation,
        ownerReason: overrideRequired ? ownerReason.trim() : null,
      });
      setResult(nextResult);
      const nextStatus = await loadEstablishedPromotionStatus(status.chain, status.contract_address);
      if (nextStatus?.owner_controls_visible) {
        setStatus(nextStatus);
        onStatusChange?.(nextStatus);
      }
      setPreview(null);
      setConfirmed(false);
      setIdentityConfirmation("");
      setOwnerReason("");
      await onLifecycleChanged?.();
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
        <p>{copy.candidateBoundary(lifecycleLabel)}</p>
      </header>

      {status.mode === "REVIEW_SAFE" && <p className="owner-review-safe" id="established-owner-mode-help" role="status">{copy.reviewSafe}</p>}

      <div className="owner-operations-summary">
        <PromotionFact label={copy.lifecycle} value={lifecycleLabel} />
        <PromotionFact label={copy.chain} value={status.chain} />
        <PromotionFact label={copy.address} value={status.contract_address} mono />
        <PromotionFact label={copy.filters} value={formatEstablishedPromotionValue("basicFilter", status.basic_filter_status, locale)} />
        <PromotionFact label={copy.security} value={formatEstablishedPromotionValue("security", status.security_status, locale)} />
        <PromotionFact label={copy.membership} value={formatEstablishedPromotionValue("membership", status.established_membership, locale)} />
      </div>

      <div className="promotion-boundary-copy">
        <p>{copy.noAutomatic}</p>
        <p>{copy.createsVersion}</p>
        <p>{copy.noSafety}</p>
        {(status.security_status === "MANUAL_VERIFICATION_REQUIRED"
          || status.security_status === "PARTIAL"
          || status.security_status === "UNAVAILABLE") && <p className="warning">{copy.missingSecurity}</p>}
      </div>

      <ActionButton variant="secondary" className="secondary-button owner-preview-button" onClick={() => void checkPlan()} loading={loadingPreview} loadingLabel={copy.previewLoading}>
        {copy.preview}
      </ActionButton>
      {loadingPreview && <p role="status">{copy.previewLoading}</p>}
      {!loadingPreview && previewError && <p role="alert">{copy.previewUnavailable}</p>}

      {preview && (
        <div className="owner-preflight-summary" data-established-promotion-preview="visible">
          <PromotionFact label={copy.eligibility} value={formatEstablishedPromotionValue("eligibility", preview.eligibility_status, locale)} />
          <PromotionFact label={copy.actionPlan} value={formatEstablishedPromotionValue("actionPlan", preview.action_plan, locale)} />
          {preview.reason_codes.length > 0 && (
            <div className="owner-operation-fact promotion-reasons">
              <strong>{copy.reasons}</strong>
              <ul>{preview.reason_codes.map((reason, index) => <li key={`${reason}-${index}`}>{formatEstablishedPromotionReason(reason, locale)}</li>)}</ul>
            </div>
          )}
          <div className="filter-condition-grid owner-readiness-conditions">
            <div className="condition-list ready"><strong>{copy.conditionsMet}</strong>{preview.conditions_met.length > 0 ? <ul>{preview.conditions_met.map((condition) => <li key={condition}>{formatOwnerCondition(condition, locale)}</li>)}</ul> : <p>{copy.none}</p>}</div>
            <div className="condition-list warning"><strong>{copy.conditionsUnmet}</strong>{preview.conditions_unmet.length > 0 ? <ul>{preview.conditions_unmet.map((condition) => <li key={condition}>{formatOwnerCondition(condition, locale)}</li>)}</ul> : <p>{copy.none}</p>}</div>
          </div>
          <PromotionFact label={copy.currentVersion} value={preview.current_universe_version ?? copy.unavailable} />
          {preview.action_plan === "ADD" && <PromotionFact label={copy.plannedVersion} value={preview.planned_universe_version ?? copy.unavailable} />}
          <PromotionFact label={copy.addressValidation} value={formatEstablishedPromotionValue("addressValidation", preview.address_validation_status, locale)} />
          <PromotionFact label={copy.duplicate} value={formatEstablishedPromotionValue("duplicate", preview.duplicate_status, locale)} />
          <PromotionFact label={copy.entries} value={changeValue(preview.current_entries_total, preview.planned_entries_total, preview.action_plan, copy.unavailable)} />
          <PromotionFact label={copy.enabledEntries} value={changeValue(preview.current_entries_enabled, preview.planned_entries_enabled, preview.action_plan, copy.unavailable)} />
          <PromotionFact label={copy.expires} value={formatProductDateTime(preview.expires_at, locale)} />
          <p>{copy.createsVersion}</p>
          {preview.manual_verification_required && <p className="warning">{copy.missingSecurity}</p>}
          {preview.manual_override_required && <p className="warning">{copy.overrideHelp}</p>}
          {previewBlocked && <p className="warning promotion-unavailable">{copy.additionUnavailable}</p>}
        </div>
      )}

      <label className="owner-confirmation">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
          disabled={!canConfirm}
        />
        <span>{copy.confirm}</span>
      </label>
      <label className="promotion-confirmed-identity">
        <span>{copy.identityLabel(expectedIdentity)}</span>
        <input value={identityConfirmation} onChange={(event) => setIdentityConfirmation(event.target.value)} disabled={!canConfirm} autoComplete="off" />
      </label>
      {overrideRequired && (
        <label className="owner-decision-reason">
          <span>{copy.reasonLabel}</span>
          <textarea value={ownerReason} onChange={(event) => setOwnerReason(event.target.value)} minLength={3} maxLength={500} disabled={!canConfirm} />
        </label>
      )}
      {(!canAdd || !decisionComplete) && status.mode !== "REVIEW_SAFE" && <p className="owner-disabled-reason" id="established-promotion-disabled-help">{disabledReason}</p>}
      <ActionButton
        variant="primary"
        className="primary-button owner-promotion-button"
        onClick={() => void add()}
        loading={submitting}
        disabled={!canAdd || !decisionComplete}
        aria-describedby={!canAdd ? (status.mode === "REVIEW_SAFE" ? "established-owner-mode-help" : "established-promotion-disabled-help") : undefined}
      >
        {copy.add}
      </ActionButton>

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

function formatOwnerCondition(value: string, locale: ProductLocale): string {
  const labels: Record<string, [string, string]> = {
    IDENTITY_VALID: ["Token identity is valid", "Tożsamość tokena jest prawidłowa"],
    PRODUCT_RECORD_AVAILABLE: ["Product record is available", "Rekord produktu jest dostępny"],
    UNIVERSE_VALID: ["Main Radar data is valid", "Dane Głównego Radaru są prawidłowe"],
    NO_ESTABLISHED_DUPLICATE: ["No duplicate exists in Main Radar", "W Głównym Radarze nie ma duplikatu"],
    FOLLOW_UP_ENTRY_AVAILABLE: ["Follow-up record is available", "Rekord dalszej obserwacji jest dostępny"],
    BASIC_FILTERS_PASSED: ["Basic filters passed", "Filtry podstawowe są spełnione"],
    BASIC_FILTER_NOT_PASSED: ["Basic filters are not met", "Filtry podstawowe nie są spełnione"],
    MANUAL_VERIFICATION_COMPLETED: ["Manual verification completed", "Ręczna weryfikacja jest zakończona"],
    MANUAL_VERIFICATION_REQUIRED: ["Manual verification is missing", "Brakuje ręcznej weryfikacji"],
    LIFECYCLE_CANDIDATE_FOR_ESTABLISHED: ["Candidate readiness reached", "Osiągnięto gotowość kandydata"],
    LIFECYCLE_READY: ["Observation readiness reached", "Osiągnięto gotowość obserwacji"],
    LIFECYCLE_NEW: ["Observation lifecycle is still New", "Cykl obserwacji pozostaje w warstwie Nowe"],
    LIFECYCLE_MATURING: ["Observation is still maturing", "Dalsza obserwacja nadal trwa"],
    SECURITY_CRITICAL_RISK: ["Critical security risk is recorded", "Zapisano krytyczne ryzyko bezpieczeństwa"],
    PROMOTION_LOCK_AVAILABLE: ["The owner action is available", "Operacja właściciela jest dostępna"],
    ALREADY_ESTABLISHED: ["The token is already in Main Radar", "Token znajduje się już w Głównym Radarze"],
  };
  return (labels[value] ?? [formatEstablishedPromotionReason(value, "en"), formatEstablishedPromotionReason(value, "pl")])[locale === "pl" ? 1 : 0];
}
