import React, { useEffect, useState } from "react";

void React;
import { useProductLocale } from "../productI18n";
import {
  addToFollowUp,
  loadFollowUpOwnerActionPreview,
  loadFollowUpOwnerActionStatus,
  type FollowUpOwnerActionPreview,
  type FollowUpOwnerActionResult,
  type FollowUpOwnerActionStatus,
} from "../services/manualOwnerActionsDataSource";
import type { UiTokenCandidate } from "../types/scannerTypes";
import { ActionButton } from "./ProductUi";

export function OwnerFollowUpActionPanel({
  candidate,
  onLifecycleChanged,
}: {
  candidate: UiTokenCandidate;
  onLifecycleChanged?: () => void | Promise<void>;
}) {
  const { locale } = useProductLocale();
  const pl = locale === "pl";
  const [status, setStatus] = useState<FollowUpOwnerActionStatus | null>(null);
  const [preview, setPreview] = useState<FollowUpOwnerActionPreview | null>(null);
  const [identity, setIdentity] = useState("");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<FollowUpOwnerActionResult | "ERROR" | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadFollowUpOwnerActionStatus(candidate.chain, candidate.contractAddress).then((value) => {
      if (!cancelled) setStatus(value);
    });
    return () => { cancelled = true; };
  }, [candidate.chain, candidate.contractAddress]);

  if (!status || status.target_exists) return null;
  const expectedIdentity = `${status.chain}:${status.contract_address}`;
  const override = preview?.override_required === true;
  const canSubmit = preview?.action_plan === "ADD"
    && status.mode === "ENABLED"
    && status.owner_actions_enabled
    && identity === expectedIdentity
    && confirmed
    && (!override || reason.trim().length >= 3)
    && !submitting;

  const prepare = async () => {
    setLoading(true);
    setResult(null);
    setConfirmed(false);
    setPreview(await loadFollowUpOwnerActionPreview(status.chain, status.contract_address));
    setLoading(false);
  };

  const submit = async () => {
    if (!preview || !canSubmit) return;
    setSubmitting(true);
    setResult(null);
    try {
      const next = await addToFollowUp(preview, {
        identityConfirmation: identity,
        ownerReason: override ? reason.trim() : null,
      });
      setResult(next);
      await onLifecycleChanged?.();
    } catch {
      setResult("ERROR");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="product-detail-section owner-follow-up-panel" aria-labelledby="owner-follow-up-heading">
      <header className="promotion-panel-header">
        <span className="candidate-detail-eyebrow">{pl ? "Decyzja właściciela" : "Owner decision"}</span>
        <h3 id="owner-follow-up-heading">{pl ? "Dalsza obserwacja" : "Continued observation"}</h3>
        <p>{pl ? "Token nie zostanie przeniesiony automatycznie. Ostateczną decyzję podejmuje właściciel." : "The token will not move automatically. The owner makes the final decision."}</p>
      </header>

      <ReadinessLists status={preview ?? status} locale={locale} />

      {!preview && (
        <ActionButton variant="primary" onClick={() => void prepare()} loading={loading}>
          {pl ? "Dodaj do dalszej obserwacji" : "Add to continued observation"}
        </ActionButton>
      )}
      {preview && preview.action_plan === "ADD" && (
        <div className="owner-decision-confirmation">
          {override && <p className="warning">{pl ? "Warunki nie są kompletne. Możesz podjąć decyzję z ręcznym nadpisaniem, podając uzasadnienie." : "Conditions are incomplete. You may decide with a manual override and a reason."}</p>}
          <label>
            <span>{pl ? `Wpisz dokładnie ${expectedIdentity}` : `Enter exactly ${expectedIdentity}`}</span>
            <input value={identity} onChange={(event) => setIdentity(event.target.value)} autoComplete="off" />
          </label>
          {override && (
            <label>
              <span>{pl ? "Uzasadnienie decyzji" : "Decision reason"}</span>
              <textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} />
            </label>
          )}
          <label className="owner-confirmation">
            <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
            <span>{pl ? "Potwierdzam tożsamość tokena i świadomą decyzję właściciela." : "I confirm the token identity and the deliberate owner decision."}</span>
          </label>
          <ActionButton variant="primary" onClick={() => void submit()} loading={submitting} disabled={!canSubmit}>
            {pl ? "Dodaj do dalszej obserwacji" : "Add to continued observation"}
          </ActionButton>
        </div>
      )}
      {preview?.action_plan === "BLOCKED" && <p role="alert">{pl ? "Operacja jest obecnie niedostępna." : "The operation is currently unavailable."}</p>}
      {result === "ERROR" && <p role="alert">{pl ? "Nie zapisano decyzji. Odśwież plan i spróbuj ponownie." : "The decision was not saved. Refresh the plan and try again."}</p>}
      {result && result !== "ERROR" && <p role="status">{pl ? "Token dodano do dalszej obserwacji." : "The token was added to continued observation."}</p>}
    </section>
  );
}

function ReadinessLists({ status, locale }: { status: FollowUpOwnerActionStatus; locale: "pl" | "en" }) {
  const pl = locale === "pl";
  return (
    <div className="owner-readiness-summary" data-readiness-status={status.readiness_status}>
      <strong>{status.readiness_status === "CONDITIONS_MET" ? (pl ? "Warunki spełnione" : "Conditions met") : (pl ? "Warunki niespełnione" : "Conditions unmet")}</strong>
      <div className="filter-condition-grid">
        <div className="condition-list ready"><strong>{pl ? "Spełnione" : "Met"}</strong><ul>{status.conditions_met.map((item) => <li key={item}>{conditionLabel(item, locale)}</li>)}</ul></div>
        <div className="condition-list warning"><strong>{pl ? "Niespełnione" : "Unmet"}</strong>{status.conditions_unmet.length > 0 ? <ul>{status.conditions_unmet.map((item) => <li key={item}>{conditionLabel(item, locale)}</li>)}</ul> : <p>{pl ? "Brak" : "None"}</p>}</div>
      </div>
    </div>
  );
}

function conditionLabel(code: string, locale: "pl" | "en"): string {
  const labels: Record<string, [string, string]> = {
    IDENTITY_VALID: ["Identity is valid", "Tożsamość tokena jest prawidłowa"],
    PRODUCT_RECORD_AVAILABLE: ["Product record is available", "Rekord produktu jest dostępny"],
    BASIC_FILTERS_PASSED: ["Basic filters passed", "Filtry podstawowe są spełnione"],
    BASIC_FILTERS_NOT_MET: ["Basic filters are not met", "Filtry podstawowe nie są spełnione"],
    LIQUIDITY_THRESHOLD_MET: ["Liquidity threshold met", "Próg płynności jest spełniony"],
    LIQUIDITY_MISSING: ["Liquidity data is missing", "Brakuje danych o płynności"],
    LIQUIDITY_TOO_LOW: ["Liquidity is below the threshold", "Płynność jest poniżej progu"],
    SECURITY_DATA_AVAILABLE: ["Security data is available", "Dane bezpieczeństwa są dostępne"],
    SECURITY_MISSING: ["Security data is missing", "Brakuje danych bezpieczeństwa"],
    REQUIRED_DATA_AVAILABLE: ["Required data is available", "Wymagane dane są dostępne"],
    REQUIRED_DATA_MISSING: ["Required data is incomplete", "Wymagane dane są niekompletne"],
    MANUAL_VERIFICATION_COMPLETED: ["Manual verification completed", "Ręczna weryfikacja jest zakończona"],
    MANUAL_VERIFICATION_MISSING: ["Manual verification is missing", "Brakuje ręcznej weryfikacji"],
  };
  return (labels[code] ?? [code, code])[locale === "pl" ? 1 : 0];
}
