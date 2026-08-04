import type { LifecycleRadarView, LifecycleSummary, LifecycleTokenView, SystemLifecycleStatus } from "../types/lifecycleTypes";

export async function loadLifecycleSummary(): Promise<LifecycleSummary | null> { return get("/api/lifecycle/summary", isSummary); }
export async function loadLifecycleToken(chain: string, contractAddress: string): Promise<LifecycleTokenView | null> {
  return get(`/api/lifecycle/token?chain=${encodeURIComponent(chain)}&contract_address=${encodeURIComponent(contractAddress)}`, isToken);
}
export async function loadLifecycleRadar(cursor?: string): Promise<LifecycleRadarView | null> {
  return get(`/api/lifecycle/radar?limit=24${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, isRadar);
}
export async function savePrivateLifecycleStatus(input: { chain: string; contractAddress: string; targetStatus: Exclude<SystemLifecycleStatus, "NEW">; overrideReason: string | null }): Promise<LifecycleTokenView | null> {
  try {
    const response = await fetch("/api/lifecycle/token/status", { method: "POST", credentials: "same-origin", headers: { accept: "application/json", "content-type": "application/json" }, body: JSON.stringify({ chain: input.chain, contract_address: input.contractAddress, target_status: input.targetStatus, override_reason: input.overrideReason, confirmation: true }) });
    const value = await response.json() as unknown;
    return response.ok && isToken(value) ? value : null;
  } catch { return null; }
}
export async function setLifecycleReviewRole(role: "CAMP_USER" | "OWNER"): Promise<boolean> {
  try {
    const suffix = role === "CAMP_USER" ? "camp-user" : "owner";
    const response = await fetch(`/api/lifecycle/review-session/${suffix}`, {
      method: "POST",
      credentials: "same-origin",
      headers: { accept: "application/json" },
    });
    return response.ok;
  } catch { return false; }
}
async function get<T>(path: string, validate: (value: unknown) => value is T): Promise<T | null> { try { const response = await fetch(path, { credentials: "same-origin", headers: { accept: "application/json" } }); const value = await response.json() as unknown; return response.ok && validate(value) ? value : null; } catch { return null; } }
function isToken(value: unknown): value is LifecycleTokenView { return record(value) && status(value.system_status) && status(value.user_status) && typeof value.user_status_is_override === "boolean" && record(value.conditions) && Array.isArray(value.conditions.conditions_met) && Array.isArray(value.conditions.conditions_unmet) && Array.isArray(value.conditions.missing_data) && Array.isArray(value.conditions.risks) && (value.conditions.readiness === "CONDITIONS_MET" || value.conditions.readiness === "CONDITIONS_UNMET") && record(value.actor) && Array.isArray(value.actor.capabilities); }
function isSummary(value: unknown): value is LifecycleSummary { return record(value) && value.schema_version === "lifecycle_summary_v1" && ["system_new_total", "system_follow_up_total", "system_main_radar_total", "follow_up_action_due", "follow_up_candidates_ready", "follow_up_displayed"].every((key) => Number.isSafeInteger(value[key])) && (value.delta_source === "CENTRAL_CYCLE" || value.delta_source === "NONE"); }
function isGroup(value: unknown): boolean { return record(value) && Number.isSafeInteger(value.total) && Number.isSafeInteger(value.displayed) && Number.isSafeInteger(value.limit) && Array.isArray(value.cards) && (value.next_cursor === null || typeof value.next_cursor === "string"); }
function isRadar(value: unknown): value is LifecycleRadarView { return record(value) && value.schema_version === "lifecycle_radar_view_v1" && isSummary(value.summary) && record(value.actor) && isGroup(value.new_inbox) && record(value.follow_up) && isGroup(value.follow_up.action_due) && isGroup(value.follow_up.candidates_ready) && isGroup(value.follow_up.observed) && record(value.main_radar) && Number.isSafeInteger(value.main_radar.total); }
function status(value: unknown): value is SystemLifecycleStatus { return value === "NEW" || value === "FOLLOW_UP" || value === "MAIN_RADAR"; }
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
