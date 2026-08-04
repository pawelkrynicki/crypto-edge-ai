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
  last_change_summary: Record<"added" | "updated" | "promoted_to_follow_up" | "promoted_to_main_radar" | "archived" | "rejected" | "duplicate_noop", number>;
};
