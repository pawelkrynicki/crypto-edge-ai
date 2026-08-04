import React, { useEffect, useState } from "react";
import { loadLifecycleToken, savePrivateLifecycleStatus, setLifecycleReviewRole } from "../services/lifecycleDataSource";
import type { LifecycleTokenView, SystemLifecycleStatus } from "../types/lifecycleTypes";
import { ActionButton, StatusBadge } from "./ProductUi";

void React;

export function PersonalRadarPanel({ chain, contractAddress, onChanged }: { chain: string; contractAddress: string; onChanged?: () => void }) {
  const [view, setView] = useState<LifecycleTokenView | null>(null);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => { let active = true; void loadLifecycleToken(chain, contractAddress).then((next) => { if (active) setView(next); }); return () => { active = false; }; }, [chain, contractAddress]);
  if (!view) return null;
  const canWrite = view.actor.capabilities.includes("CAMP_USER_WORKSPACE_WRITE");
  const target = nextStatus(view.user_status);
  const needsReason = view.conditions.readiness !== "CONDITIONS_MET";
  const save = async () => {
    if (!target || !canWrite || !confirmed || (needsReason && reason.trim().length < 3)) return;
    setSaving(true);
    const next = await savePrivateLifecycleStatus({ chain, contractAddress, targetStatus: target, overrideReason: needsReason ? reason.trim() : null });
    if (next) { setView(next); setReason(""); setConfirmed(false); onChanged?.(); }
    setSaving(false);
  };
  return (
    <section className="personal-radar-panel" aria-label="Twój Radar">
      <header><span>Twój Radar</span><div><StatusBadge tone="neutral">Status systemowy: {label(view.system_status)}</StatusBadge><StatusBadge tone={view.user_status_is_override ? "accent" : "neutral"}>Twój status: {label(view.user_status)}</StatusBadge></div></header>
      {isReviewMode() && <div className="personal-radar-review-switch">
        <span>Tryb visual review: {view.actor.role}</span>
        {view.actor.role !== "CAMP_USER" && <button type="button" onClick={() => void switchReviewRole("CAMP_USER")}>Przełącz na CAMP_USER</button>}
        {view.actor.role !== "OWNER" && <button type="button" onClick={() => void switchReviewRole("OWNER")}>Przełącz na ownera</button>}
      </div>}
      {target && canWrite && <>
        <p>{view.conditions.readiness === "CONDITIONS_MET" ? "Warunki spełnione. Potwierdź prywatną decyzję." : "Możesz podjąć prywatną decyzję wcześniej; podaj krótki powód."}</p>
        {(view.conditions.conditions_met.length > 0 || view.conditions.conditions_unmet.length > 0 || view.conditions.missing_data.length > 0 || view.conditions.risks.length > 0) && <ul>{view.conditions.conditions_met.length > 0 && <li>Spełnione: {view.conditions.conditions_met.join(", ")}</li>}{view.conditions.conditions_unmet.length > 0 && <li>Niespełnione: {view.conditions.conditions_unmet.join(", ")}</li>}{view.conditions.missing_data.length > 0 && <li>Brak danych: {view.conditions.missing_data.join(", ")}</li>}{view.conditions.risks.length > 0 && <li>Ryzyka: {view.conditions.risks.join(", ")}</li>}</ul>}
        {needsReason && <label>Powód ręcznej decyzji<textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} /></label>}
        <label><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /> Potwierdzam prywatną decyzję.</label>
        <ActionButton variant="primary" onClick={() => void save()} loading={saving} disabled={!confirmed || (needsReason && reason.trim().length < 3)}>{target === "FOLLOW_UP" ? "Dodaj do dalszej obserwacji" : "Przenieś do mojego Głównego Radaru"}</ActionButton>
      </>}
      {!canWrite && <p>Ten tryb jest tylko do odczytu.</p>}
    </section>
  );
}
function isReviewMode(): boolean { return typeof window !== "undefined" && new URLSearchParams(window.location.search).get("pc1_review") === "1"; }
function switchReviewRole(role: "CAMP_USER" | "OWNER"): void { void setLifecycleReviewRole(role).then((changed) => { if (changed) window.location.reload(); }); }
function nextStatus(value: SystemLifecycleStatus): Exclude<SystemLifecycleStatus, "NEW"> | null { return value === "NEW" ? "FOLLOW_UP" : value === "FOLLOW_UP" ? "MAIN_RADAR" : null; }
function label(value: SystemLifecycleStatus): string { return value === "FOLLOW_UP" ? "Dalsza obserwacja" : value === "MAIN_RADAR" ? "Główny Radar" : "Nowe"; }
