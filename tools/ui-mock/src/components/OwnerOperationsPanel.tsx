import React, { useEffect, useState } from "react";

void React; // Required by the Node TSX test runtime's classic JSX transform.
import { formatProductDateTime, useProductLocale, type ProductLocale } from "../productI18n";
import { formatProductSourceLabel } from "../productPresentation";
import {
  loadOwnerOperationsStatus,
  loadOwnerRefreshPreview,
  runOwnerRefresh,
  type OwnerOperationsStatus,
  type OwnerRefreshPreview,
  type OwnerRefreshResult,
} from "../services/ownerOperationsDataSource";
import { ActionButton } from "./ProductUi";

const COPY = {
  en: {
    eyebrow: "Owner operations",
    title: "One-time data refresh",
    intro: "Review the current cadence plan before starting one controlled refresh cycle.",
    browserBoundary: "The browser does not connect directly to data providers.",
    currentStatus: "Current status",
    mode: "Owner operations mode",
    scannerDue: "Scanner due",
    contextDue: "Context due",
    scope: "Planned scope",
    lock: "Global refresh lock",
    available: "Available",
    busy: "In use",
    yes: "Yes",
    no: "No",
    reviewOnly: "Review-safe mode: the real refresh remains blocked.",
    previewFirst: "Preview the current refresh plan before confirming this action.",
    confirmFirst: "Confirm the cadence-controlled cycle to enable this action.",
    preview: "Preview refresh plan",
    previewUnavailable: "The refresh plan could not be loaded.",
    mayCall: "Sources that may be contacted",
    willNotCall: "Sources that will not be contacted",
    expires: "Preflight valid until",
    noAction: "No refresh is due under the current cadence.",
    confirm: "I confirm this is one cadence-controlled refresh cycle.",
    run: "Run one-time refresh",
    dialog: "Start one controlled refresh cycle using this current preflight plan?",
    success: "The one-time refresh completed successfully.",
    partial: "The refresh completed with partial source data. Last-known-good data was preserved.",
    noActionResult: "No action was needed. No provider was contacted.",
    failed: "The refresh failed. The last-known-good snapshot was preserved.",
    inProgress: "Refresh already in progress.",
    preserved: "Last-known-good preserved.",
    scannerAndContext: "Scanner and context",
    contextOnly: "Context only",
    none: "No action",
    lastAction: "Last action",
    snapshotScanner: "Current scanner snapshot",
    snapshotContext: "Current context snapshot",
    automation: "Automation enabled",
    lastKnownGood: "Last-known-good available",
    missing: "Not available",
  },
  pl: {
    eyebrow: "Operacje właściciela",
    title: "Jednorazowe odświeżenie danych",
    intro: "Przed uruchomieniem jednego kontrolowanego cyklu sprawdź aktualny harmonogram.",
    browserBoundary: "Przeglądarka nie łączy się bezpośrednio ze źródłami danych.",
    currentStatus: "Bieżący status",
    mode: "Tryb operacji właściciela",
    scannerDue: "Skaner do odświeżenia",
    contextDue: "Kontekst do odświeżenia",
    scope: "Planowany zakres",
    lock: "Globalna blokada odświeżenia",
    available: "Dostępna",
    busy: "Zajęta",
    yes: "Tak",
    no: "Nie",
    reviewOnly: "Tryb bezpiecznego przeglądu: prawdziwe odświeżenie pozostaje zablokowane.",
    previewFirst: "Najpierw sprawdź bieżący plan odświeżenia.",
    confirmFirst: "Potwierdź cykl zgodny z harmonogramem, aby aktywować tę akcję.",
    preview: "Sprawdź plan odświeżenia",
    previewUnavailable: "Nie udało się pobrać planu odświeżenia.",
    mayCall: "Źródła, które mogą zostać wywołane",
    willNotCall: "Źródła, które nie zostaną wywołane",
    expires: "Plan ważny do",
    noAction: "Zgodnie z aktualnym harmonogramem nic nie wymaga odświeżenia.",
    confirm: "Potwierdzam jeden cykl odświeżenia zgodny z harmonogramem.",
    run: "Uruchom jednorazowe odświeżenie",
    dialog: "Uruchomić jeden kontrolowany cykl odświeżenia według aktualnego planu?",
    success: "Jednorazowe odświeżenie zakończyło się powodzeniem.",
    partial: "Odświeżenie zakończyło się z częściowymi danymi źródłowymi. Zachowano ostatnie prawidłowe dane.",
    noActionResult: "Nie było nic do zrobienia. Nie wywołano żadnego źródła danych.",
    failed: "Odświeżenie nie powiodło się. Zachowano ostatnią prawidłową migawkę.",
    inProgress: "Odświeżenie już trwa.",
    preserved: "Zachowano ostatnią prawidłową migawkę.",
    scannerAndContext: "Skaner i kontekst",
    contextOnly: "Tylko kontekst",
    none: "Brak działania",
    lastAction: "Ostatnie działanie",
    snapshotScanner: "Bieżąca migawka skanera",
    snapshotContext: "Bieżąca migawka kontekstu",
    automation: "Automatyzacja włączona",
    lastKnownGood: "Ostatnia prawidłowa migawka dostępna",
    missing: "Niedostępne",
  },
} as const;

export function OwnerOperationsPanel({ initialStatus }: { initialStatus: OwnerOperationsStatus }) {
  const { locale } = useProductLocale();
  const copy = COPY[locale];
  const [status, setStatus] = useState(initialStatus);
  const [preview, setPreview] = useState<OwnerRefreshPreview | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<OwnerRefreshResult | "ERROR" | null>(null);
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  useEffect(() => {
    if (!preview) return;
    const delay = Math.max(0, Date.parse(preview.expires_at) - Date.now() + 25);
    const timer = window.setTimeout(() => setCurrentTime(Date.now()), delay);
    return () => window.clearTimeout(timer);
  }, [preview]);

  if (!status.owner_controls_visible) return null;

  const previewFresh = preview !== null && Date.parse(preview.expires_at) > currentTime;
  const canRun = status.mode === "ENABLED"
    && status.owner_actions_enabled
    && previewFresh
    && preview.planned_mode !== "no_action"
    && preview.lock_available
    && !status.action_in_progress
    && confirmed
    && !running;
  const disabledReason = status.mode === "REVIEW_SAFE"
    ? copy.reviewOnly
    : !previewFresh
      ? copy.previewFirst
      : !confirmed
        ? copy.confirmFirst
        : copy.noAction;

  const checkPlan = async () => {
    setLoadingPreview(true);
    setCurrentTime(Date.now());
    setPreviewError(false);
    setConfirmed(false);
    setResult(null);
    const nextPreview = await loadOwnerRefreshPreview();
    setPreview(nextPreview);
    setPreviewError(nextPreview === null);
    setLoadingPreview(false);
  };

  const startRefresh = async () => {
    if (!canRun || !preview || !window.confirm(copy.dialog)) return;
    setRunning(true);
    setResult(null);
    try {
      setResult(await runOwnerRefresh(preview));
      const nextStatus = await loadOwnerOperationsStatus();
      if (nextStatus?.owner_controls_visible) setStatus(nextStatus);
      setPreview(null);
      setConfirmed(false);
    } catch {
      setResult("ERROR");
    } finally {
      setRunning(false);
    }
  };

  return (
    <section className="control-section owner-operations-panel" aria-labelledby="owner-operations-title">
      <header className="control-section-header">
        <span className="section-label">{copy.eyebrow}</span>
        <h3 id="owner-operations-title">{copy.title}</h3>
        <p>{copy.intro}</p>
        <p className="control-center-research-note">{copy.browserBoundary}</p>
      </header>

      {status.mode === "REVIEW_SAFE" && <p className="owner-review-safe" id="owner-refresh-mode-help" role="status">{copy.reviewOnly}</p>}

      <div className="owner-operations-summary" aria-label={copy.currentStatus}>
        <OwnerFact label={copy.mode} value={ownerModeLabel(status.mode, locale)} />
        <OwnerFact label={copy.scannerDue} value={yesNo(status.scanner_due, copy)} />
        <OwnerFact label={copy.contextDue} value={yesNo(status.context_due, copy)} />
        <OwnerFact label={copy.lock} value={status.action_in_progress ? copy.busy : copy.available} />
        <OwnerFact label={copy.snapshotScanner} value={dateValue(status.current_scanner_snapshot_timestamp, locale, copy.missing)} />
        <OwnerFact label={copy.snapshotContext} value={dateValue(status.current_context_snapshot_timestamp, locale, copy.missing)} />
        <OwnerFact label={copy.automation} value={yesNo(status.automation_enabled, copy)} />
        <OwnerFact label={copy.lastKnownGood} value={yesNo(status.last_known_good_available, copy)} />
        <OwnerFact label={copy.lastAction} value={status.last_action_status ? resultStatusLabel(status.last_action_status, locale) : copy.missing} />
      </div>

      <ActionButton variant="secondary" className="secondary-button owner-preview-button" onClick={() => void checkPlan()} loading={loadingPreview} loadingLabel={`${copy.preview}…`}>
        {copy.preview}
      </ActionButton>

      {loadingPreview && <p role="status">{copy.preview}…</p>}
      {!loadingPreview && previewError && <p role="alert">{copy.previewUnavailable}</p>}

      {preview && (
        <div className="owner-preflight-summary" data-owner-preflight="visible">
          <OwnerFact label={copy.scope} value={planLabel(preview, copy)} />
          <OwnerFact label={copy.scannerDue} value={yesNo(preview.scanner_due, copy)} />
          <OwnerFact label={copy.contextDue} value={yesNo(preview.context_due, copy)} />
          <OwnerFact label={copy.lock} value={preview.lock_available ? copy.available : copy.busy} />
          <OwnerFact label={copy.mayCall} value={sourceList(preview.sources_may_be_called, copy.none)} />
          <OwnerFact label={copy.willNotCall} value={sourceList(preview.sources_not_called, copy.none)} />
          <OwnerFact label={copy.expires} value={dateValue(preview.expires_at, locale, copy.missing)} />
          {preview.planned_mode === "no_action" && <p className="owner-no-action">{copy.noAction}</p>}
        </div>
      )}

      <label className="owner-confirmation">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
          disabled={status.mode !== "ENABLED" || !previewFresh || preview?.planned_mode === "no_action" || running}
        />
        <span>{copy.confirm}</span>
      </label>

      {!canRun && status.mode !== "REVIEW_SAFE" && <p className="owner-disabled-reason" id="owner-refresh-disabled-help">{disabledReason}</p>}
      <ActionButton
        variant="primary"
        icon="refresh"
        className="primary-button owner-refresh-button"
        onClick={() => void startRefresh()}
        loading={running}
        disabled={!canRun}
        aria-describedby={!canRun ? (status.mode === "REVIEW_SAFE" ? "owner-refresh-mode-help" : "owner-refresh-disabled-help") : undefined}
      >
        {copy.run}
      </ActionButton>

      {result && <OwnerResult result={result} copy={copy} />}
    </section>
  );
}

function OwnerFact({ label, value }: { label: string; value: string }) {
  return <div className="owner-operation-fact"><strong>{label}</strong><span>{value}</span></div>;
}

function OwnerResult({
  result,
  copy,
}: {
  result: OwnerRefreshResult | "ERROR";
  copy: typeof COPY.en | typeof COPY.pl;
}) {
  if (result === "ERROR") return <p className="owner-operation-result failed" role="alert">{copy.failed}</p>;
  if (result.status === "SUCCESS") return <p className="owner-operation-result success" role="status">{copy.success}</p>;
  if (result.status === "PARTIAL") return <p className="owner-operation-result" role="status">{copy.partial}</p>;
  if (result.status === "NO_ACTION") return <p className="owner-operation-result" role="status">{copy.noActionResult}</p>;
  if (result.status === "RUN_ALREADY_IN_PROGRESS") return <p className="owner-operation-result" role="status">{copy.inProgress}</p>;
  return <p className="owner-operation-result failed" role="alert">{copy.failed} {result.last_known_good_preserved ? copy.preserved : ""}</p>;
}

function yesNo(value: boolean, copy: typeof COPY.en | typeof COPY.pl): string {
  return value ? copy.yes : copy.no;
}

function dateValue(value: string | null, locale: ProductLocale, missing: string): string {
  return value ? formatProductDateTime(value, locale) : missing;
}

function planLabel(preview: OwnerRefreshPreview, copy: typeof COPY.en | typeof COPY.pl): string {
  if (preview.planned_mode === "scanner_and_context") return copy.scannerAndContext;
  if (preview.planned_mode === "context_only") return copy.contextOnly;
  return copy.none;
}

function sourceList(values: string[], empty: string): string {
  return values.map(formatProductSourceLabel).join(", ") || empty;
}

function ownerModeLabel(mode: OwnerOperationsStatus["mode"], locale: ProductLocale): string {
  if (mode === "REVIEW_SAFE") return locale === "pl" ? "Bezpieczny przegląd" : "Review safe";
  if (mode === "ENABLED") return locale === "pl" ? "Włączony" : "Enabled";
  return locale === "pl" ? "Wyłączony" : "Disabled";
}

function resultStatusLabel(value: string, locale: ProductLocale): string {
  if (value === "SUCCESS") return locale === "pl" ? "Powodzenie" : "Success";
  if (value === "NO_ACTION") return locale === "pl" ? "Bez działania" : "No action";
  if (value === "RUN_ALREADY_IN_PROGRESS") return locale === "pl" ? "Odświeżenie już trwa" : "Refresh in progress";
  return locale === "pl" ? "Niepowodzenie" : "Failed";
}
