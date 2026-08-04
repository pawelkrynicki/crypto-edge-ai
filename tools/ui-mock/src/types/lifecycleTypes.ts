export type SystemLifecycleStatus = "NEW" | "FOLLOW_UP" | "MAIN_RADAR";
export type LifecycleConditions = {
  conditions_met: string[];
  conditions_unmet: string[];
  missing_data: string[];
  risks: string[];
  readiness: "CONDITIONS_MET" | "CONDITIONS_UNMET";
  security_state: string;
  verification_state: string;
};
export type LifecycleTokenView = {
  identity: string;
  system_status: SystemLifecycleStatus;
  user_status: SystemLifecycleStatus;
  user_status_is_override: boolean;
  conditions: LifecycleConditions;
  actor: { role: "TRUSTED_TESTER" | "CAMP_USER" | "OWNER" | "ADMIN"; capabilities: string[] };
};
export type LifecycleSummary = {
  schema_version: "lifecycle_summary_v1";
  system_new_total: number;
  system_follow_up_total: number;
  system_main_radar_total: number;
  follow_up_action_due: number;
  follow_up_candidates_ready: number;
  follow_up_displayed: number;
  follow_up_store_version: string;
  last_lifecycle_change_at: string | null;
  last_central_cycle_id: string | null;
  summary_as_of: string | null;
  last_completed_cycle_id: string | null;
  last_completed_cycle_at: string | null;
  delta_source: "CENTRAL_CYCLE" | "NONE";
  last_change_summary: Record<"added" | "updated" | "promoted_to_follow_up" | "promoted_to_main_radar" | "archived" | "rejected" | "duplicate_noop", number>;
};

export type LifecycleRadarCard = LifecycleTokenView & {
  chain: string;
  contract_address: string;
  display_name: string | null;
  symbol: string | null;
  first_seen_at: string;
  last_seen_at: string;
  snapshot_present: boolean;
  snapshot_absence_notice: boolean;
  market: { price_usd: number | null; market_cap_usd: number | null; liquidity_usd: number | null; volume_24h_usd: number | null } | null;
  follow_up: { lifecycle_status: string; next_check_at: string | null; last_checked_at: string | null; missing_data: string[]; risk_flags: string[] } | null;
};
export type LifecycleRadarGroup = { total: number; displayed: number; limit: number; next_cursor: string | null; cards: LifecycleRadarCard[] };
export type LifecycleRadarView = {
  schema_version: "lifecycle_radar_view_v1";
  summary: LifecycleSummary;
  actor: LifecycleTokenView["actor"];
  new_inbox: LifecycleRadarGroup;
  follow_up: { action_due: LifecycleRadarGroup; candidates_ready: LifecycleRadarGroup; observed: LifecycleRadarGroup };
  main_radar: { total: number };
};
