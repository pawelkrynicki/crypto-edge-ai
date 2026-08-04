import React, { useEffect, useState } from "react";
import { loadLifecycleToken, savePrivateLifecycleStatus } from "../services/lifecycleDataSource";
import { lifecycleCopy, lifecycleStatusLabel, presentLifecycleConditions } from "../lifecyclePresentation";
import { useProductLocale } from "../productI18n";
import type { LifecycleTokenView, SystemLifecycleStatus } from "../types/lifecycleTypes";
import { ActionButton, StatusBadge } from "./ProductUi";

void React;

export function PersonalRadarPanel({ chain, contractAddress, onChanged, initialView, compact = false, unavailable = false }: { chain: string; contractAddress: string; onChanged?: () => void; initialView?: LifecycleTokenView | null; compact?: boolean; unavailable?: boolean }) {
  const { locale } = useProductLocale();
  const copy = lifecycleCopy(locale);
  const [view, setView] = useState<LifecycleTokenView | null>(null);
  const [open, setOpen] = useState(!compact);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (unavailable) return;
    if (initialView) return;
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
  const save = async () => {
    if (!target || !canWrite || !confirmed || (needsReason && reason.trim().length < 3)) return;
    setSaving(true); setError(null);
    const next = await savePrivateLifecycleStatus({ chain, contractAddress, targetStatus: target, overrideReason: needsReason ? reason.trim() : null });
    if (next) { setView(next); setReason(""); setConfirmed(false); setOpen(false); onChanged?.(); } else setError(copy.saveFailed);
    setSaving(false);
  };
  return <section className={`personal-radar-panel ${compact ? "compact" : ""}`} aria-label={copy.radar}>
    <header><span>{copy.radar}</span><div><StatusBadge tone="neutral">{copy.system}: {lifecycleStatusLabel(resolvedView.system_status, locale)}</StatusBadge><StatusBadge tone={resolvedView.user_status_is_override ? "accent" : "neutral"}>{copy.yours}: {lifecycleStatusLabel(resolvedView.user_status, locale)}</StatusBadge></div></header>
    {target && canWrite && compact && !open && <ActionButton variant="secondary" onClick={() => setOpen(true)}>{target === "FOLLOW_UP" ? copy.nextFollowUp : copy.nextMain}</ActionButton>}
    {target && canWrite && open && <div className="personal-radar-confirmation" role="dialog" aria-label={copy.confirmAction}>
      <p>{needsReason ? copy.needsReason : copy.met}</p>
      {presentLifecycleConditions(resolvedView.conditions, locale).map((entry) => <p key={entry.label}><strong>{entry.label}:</strong> {entry.values.join(", ")}</p>)}
      {needsReason && <label>{copy.reason}<textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} /></label>}
      <label><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /> {copy.confirm}</label>
      {error && <p role="alert" className="product-inline-error">{error}</p>}
      <ActionButton variant="primary" onClick={() => void save()} loading={saving} disabled={!confirmed || (needsReason && reason.trim().length < 3)}>{target === "FOLLOW_UP" ? copy.nextFollowUp : copy.nextMain}</ActionButton>
    </div>}
    {!canWrite && <p>{copy.readonly}</p>}
  </section>;
}
function nextStatus(value: SystemLifecycleStatus): Exclude<SystemLifecycleStatus, "NEW"> | null { return value === "NEW" ? "FOLLOW_UP" : value === "FOLLOW_UP" ? "MAIN_RADAR" : null; }
