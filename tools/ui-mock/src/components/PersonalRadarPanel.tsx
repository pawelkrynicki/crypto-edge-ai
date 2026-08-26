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
}: {
  chain: string;
  contractAddress: string;
  onChanged?: (view: LifecycleTokenView) => void | Promise<void>;
  initialView?: LifecycleTokenView | null;
  unavailable?: boolean;
  placement?: "card" | "detail";
}) {
  const { locale } = useProductLocale();
  const copy = lifecycleCopy(locale);
  const [view, setView] = useState<LifecycleTokenView | null>(null);
  const [expanded, setExpanded] = useState(false);
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
  const privateStatus = resolvedView.user_status_is_override ? resolvedView.user_status : null;

  const publish = async (next: LifecycleTokenView | null) => {
    if (!next) { setError(copy.saveFailed); return; }
    setView(next); setExpanded(false); setError(null); void onChanged?.(next);
  };
  const save = async (targetStatus: Exclude<SystemLifecycleStatus, "NEW">) => {
    if (!canWrite) return;
    setSaving(true);
    await publish(await savePrivateLifecycleStatus({ chain, contractAddress, targetStatus, overrideReason: null }));
    setSaving(false);
  };
  const clear = async () => {
    if (!canWrite) return;
    setSaving(true);
    await publish(await clearPrivateLifecycleStatus({ chain, contractAddress }));
    setSaving(false);
  };

  const managementId = `personal-radar-management-${resolvedView.identity.replace(/[^a-z0-9_-]/gi, "-")}`;
  const manageLabel = locale === "pl" ? "Zarządzaj moim Radarem" : "Manage my Radar";
  const actions: Array<{ status: Exclude<SystemLifecycleStatus, "NEW">; label: string }> = privateStatus === "MAIN_RADAR"
    ? [{ status: "FOLLOW_UP", label: copy.nextFollowUp }]
    : privateStatus === "FOLLOW_UP"
      ? [{ status: "MAIN_RADAR", label: copy.nextMain }]
      : [{ status: "FOLLOW_UP", label: copy.nextFollowUp }, { status: "MAIN_RADAR", label: copy.nextMain }];

  return <div className={`personal-radar-inline ${placement}`} data-personal-radar="inline">
    <div className="personal-radar-statuses" aria-label={locale === "pl" ? "Status Radaru produktu i Twojego Radaru" : "Product Radar and Your Radar status"}>
      <StatusBadge tone={radarTone(resolvedView.system_status)} className="personal-radar-active" activeState aria-label={`${copy.system}: ${lifecycleStatusLabel(resolvedView.system_status, locale)}; ${locale === "pl" ? "aktywny status" : "active status"}`}>{copy.system}: {lifecycleStatusLabel(resolvedView.system_status, locale)}</StatusBadge>
      <StatusBadge tone={privateStatus ? radarTone(privateStatus) : "manual"} className="personal-radar-active" activeState={Boolean(privateStatus)} aria-label={`${copy.yours}: ${privateStatus ? lifecycleStatusLabel(privateStatus, locale) : copy.unassigned}; ${privateStatus ? (locale === "pl" ? "aktualny status prywatny" : "current private status") : (locale === "pl" ? "brak prywatnego przypisania" : "no private assignment")}`}>{copy.yours}: {privateStatus ? lifecycleStatusLabel(privateStatus, locale) : copy.unassigned}</StatusBadge>
      {resolvedView.user_status_is_override && <small className="personal-radar-private-note">{locale === "pl" ? "To jest prywatna organizacja. Radar produktu pozostaje bez zmian." : "This is private organization. Product Radar stays unchanged."}</small>}
    </div>
    {canWrite && <div className="personal-radar-actions">
      <ActionButton
        variant="secondary"
        className="personal-radar-manage-trigger"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        aria-controls={managementId}
      >{manageLabel}</ActionButton>
    </div>}
    {expanded && <div id={managementId} className="personal-radar-confirmation" data-personal-radar-management role="group" aria-label={manageLabel}>
      <p>{copy.privateOnly}</p>
      <div className="personal-radar-management-actions">
        {error && <p role="alert" className="product-inline-error">{error}</p>}
        {actions.map((action) => <ActionButton key={action.status} variant="primary" loading={saving} onClick={() => void save(action.status)}>{action.label}</ActionButton>)}
        {privateStatus && <ActionButton variant="tertiary" loading={saving} onClick={() => void clear()}>{copy.remove}</ActionButton>}
        <ActionButton variant="tertiary" disabled={saving} onClick={() => setExpanded(false)}>{copy.cancel}</ActionButton>
      </div>
    </div>}
  </div>;
}

function radarTone(status: SystemLifecycleStatus): "accent" | "ready" | "neutral" {
  if (status === "MAIN_RADAR") return "ready";
  return "accent";
}
