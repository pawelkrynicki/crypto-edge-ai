import React, { useEffect, useState } from "react";
import { clearPrivateLifecycleStatus, loadLifecycleToken, savePrivateLifecycleStatus } from "../services/lifecycleDataSource";
import { lifecycleCopy, lifecycleStatusLabel } from "../lifecyclePresentation";
import { useProductLocale } from "../productI18n";
import type { LifecycleTokenView, SystemLifecycleStatus } from "../types/lifecycleTypes";
import { ActionButton, StatusBadge } from "./ProductUi";

void React;

/** One private-workspace control shared by Radar cards and Candidate Detail.
 * It deliberately has no eligibility gate: this organizes only the actor's
 * own Radar and never changes the product lifecycle. */
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
  const [confirming, setConfirming] = useState<"set" | "clear" | null>(null);
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
  const target = nextPrivateStatus(resolvedView.user_status);
  const actionLabel = target === "MAIN_RADAR" ? copy.nextMain : copy.nextFollowUp;

  const publish = async (next: LifecycleTokenView | null) => {
    if (!next) { setError(copy.saveFailed); return; }
    setView(next); setConfirming(null); setError(null); void onChanged?.(next);
  };
  const save = async () => {
    if (!canWrite) return;
    setSaving(true);
    await publish(await savePrivateLifecycleStatus({ chain, contractAddress, targetStatus: target, overrideReason: null }));
    setSaving(false);
  };
  const clear = async () => {
    if (!canWrite) return;
    setSaving(true);
    await publish(await clearPrivateLifecycleStatus({ chain, contractAddress }));
    setSaving(false);
  };

  return <div className={`personal-radar-inline ${placement}`} data-personal-radar="inline">
    <div className="personal-radar-statuses" aria-label={locale === "pl" ? "Status Radaru produktu i Twojego Radaru" : "Product Radar and Your Radar status"}>
      <StatusBadge tone={radarTone(resolvedView.system_status)} className="personal-radar-active" aria-label={`${copy.system}: ${lifecycleStatusLabel(resolvedView.system_status, locale)}; ${locale === "pl" ? "aktywny status" : "active status"}`}>{copy.system}: {lifecycleStatusLabel(resolvedView.system_status, locale)}</StatusBadge>
      <StatusBadge tone={radarTone(resolvedView.user_status)} className="personal-radar-active" aria-label={`${copy.yours}: ${lifecycleStatusLabel(resolvedView.user_status, locale)}; ${locale === "pl" ? "aktywny status" : "active status"}`}>{copy.yours}: {lifecycleStatusLabel(resolvedView.user_status, locale)}</StatusBadge>
      {resolvedView.user_status_is_override && <small className="personal-radar-private-note">{locale === "pl" ? "To jest prywatna organizacja. Radar produktu pozostaje bez zmian." : "This is private organization. Product Radar stays unchanged."}</small>}
    </div>
    {canWrite && !confirming && <div className="personal-radar-actions">
      <ActionButton variant="secondary" onClick={() => setConfirming("set")} aria-expanded={confirming === "set"}>{actionLabel}</ActionButton>
      {resolvedView.user_status_is_override && <ActionButton variant="tertiary" onClick={() => setConfirming("clear")} aria-expanded={confirming === "clear"}>{copy.remove}</ActionButton>}
    </div>}
    {trailingAction}
    {confirming && <div className="personal-radar-confirmation" role="status">
      <p>{copy.privateOnly}</p>
      <div>{error && <p role="alert" className="product-inline-error">{error}</p>}<ActionButton variant={confirming === "clear" ? "tertiary" : "primary"} loading={saving} onClick={() => void (confirming === "clear" ? clear() : save())}>{confirming === "clear" ? copy.remove : actionLabel}</ActionButton><ActionButton variant="tertiary" disabled={saving} onClick={() => setConfirming(null)}>{copy.cancel}</ActionButton></div>
    </div>}
  </div>;
}

function nextPrivateStatus(value: SystemLifecycleStatus): Exclude<SystemLifecycleStatus, "NEW"> {
  if (value === "NEW" || value === "MAIN_RADAR") return "FOLLOW_UP";
  return "MAIN_RADAR";
}

function radarTone(status: SystemLifecycleStatus): "accent" | "ready" | "neutral" {
  if (status === "MAIN_RADAR") return "ready";
  if (status === "FOLLOW_UP") return "accent";
  return "neutral";
}
