import React, { useEffect, useState } from "react";
import { loadLifecycleToken, savePrivateLifecycleStatus } from "../services/lifecycleDataSource";
import { lifecycleCopy, lifecycleStatusLabel, presentLifecycleConditions } from "../lifecyclePresentation";
import { useProductLocale } from "../productI18n";
import type { LifecycleTokenView, SystemLifecycleStatus } from "../types/lifecycleTypes";
import { ActionButton, StatusBadge, TechnicalDetails } from "./ProductUi";

void React;

export function PersonalRadarPanel({
  chain,
  contractAddress,
  onChanged,
  initialView,
  unavailable = false,
  placement = "card",
  trailingAction,
}: {
  chain: string;
  contractAddress: string;
  onChanged?: (view: LifecycleTokenView) => void | Promise<void>;
  initialView?: LifecycleTokenView | null;
  unavailable?: boolean;
  placement?: "card" | "detail";
  trailingAction?: React.ReactNode;
}) {
  const { locale } = useProductLocale();
  const copy = lifecycleCopy(locale);
  const [view, setView] = useState<LifecycleTokenView | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (unavailable || initialView) return;
    let active = true;
    void loadLifecycleToken(chain, contractAddress).then((next) => { if (active) setView(next); });
    return () => { active = false; };
  }, [chain, contractAddress, initialView, unavailable]);

  if (unavailable) return null;
  const resolvedView = view ?? initialView;
  if (!resolvedView) return null;
  const canWrite = resolvedView.actor.capabilities.includes("CAMP_USER_WORKSPACE_WRITE");
  const target = nextStatus(resolvedView.user_status);
  const needsReason = resolvedView.conditions.readiness !== "CONDITIONS_MET";
  const actionLabel = target === "FOLLOW_UP" ? copy.nextFollowUp : copy.nextMain;

  const save = async () => {
    if (!target || !canWrite || !confirmed || (needsReason && reason.trim().length < 3)) return;
    setSaving(true);
    setError(null);
    const next = await savePrivateLifecycleStatus({
      chain,
      contractAddress,
      targetStatus: target,
      overrideReason: needsReason ? reason.trim() : null,
    });
    if (next) {
      setView(next);
      setReason("");
      setConfirmed(false);
      setReviewOpen(false);
      void onChanged?.(next);
    } else {
      setError(copy.saveFailed);
    }
    setSaving(false);
  };

  return (
    <div className={`personal-radar-inline ${placement}`} data-personal-radar="inline">
      <div className="personal-radar-statuses">
        <StatusBadge tone="neutral">{copy.system}: {lifecycleStatusLabel(resolvedView.system_status, locale)}</StatusBadge>
        <StatusBadge tone={resolvedView.user_status_is_override ? "accent" : "neutral"}>{copy.yours}: {lifecycleStatusLabel(resolvedView.user_status, locale)}</StatusBadge>
        {resolvedView.system_status !== resolvedView.user_status && <small className="personal-radar-private-note">{locale === "pl" ? "Przeniesiony wczeĹ›niej w Twoim prywatnym Radarze." : "Moved earlier in your private Radar."}</small>}
      </div>
      {target && canWrite && (
        <ActionButton variant="secondary" onClick={() => setReviewOpen((open) => !open)} aria-expanded={reviewOpen}>
          {actionLabel}
        </ActionButton>
      )}
      {trailingAction}
      {reviewOpen && target && canWrite && (
        <TechnicalDetails label={copy.confirmAction} className="personal-radar-confirmation" initialOpen>
          {needsReason && <p>{copy.needsReason}</p>}
          {presentLifecycleConditions(resolvedView.conditions, locale).map((entry) => (
            <p key={entry.label}><strong>{entry.label}:</strong> {entry.values.length > 0 ? entry.values.join(", ") : "—"}</p>
          ))}
          {needsReason && <label>{copy.reason}<textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} /></label>}
          <label><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /> {copy.confirm}</label>
          {error && <p role="alert" className="product-inline-error">{error}</p>}
          <ActionButton variant="primary" onClick={() => void save()} loading={saving} disabled={!confirmed || (needsReason && reason.trim().length < 3)}>
            {actionLabel}
          </ActionButton>
        </TechnicalDetails>
      )}
    </div>
  );
}

function nextStatus(value: SystemLifecycleStatus): Exclude<SystemLifecycleStatus, "NEW"> | null {
  return value === "NEW" ? "FOLLOW_UP" : value === "FOLLOW_UP" ? "MAIN_RADAR" : null;
}
