export type FollowUpLifecycleStatus =
  | "NEW"
  | "MATURING"
  | "CANDIDATE_FOR_ESTABLISHED"
  | "ESTABLISHED"
  | "ARCHIVED";

export type FollowUpPublicStatus = {
  schema_version: "follow_up_status_v1";
  store_available: boolean;
  validation_status: "valid" | "recovered" | "invalid" | "unavailable";
  entries_total: number;
  new_count: number;
  maturing_count: number;
  candidate_count: number;
  established_count: number;
  archived_count: number;
  due_count: number;
  next_due_at: string | null;
  last_updated_at: string | null;
};

export type FollowUpPublicEntry = {
  entry_id: string;
  chain: string;
  contract_address: string;
  display_name: string | null;
  symbol: string | null;
  lifecycle_status: FollowUpLifecycleStatus;
  pair_age: number | null;
  first_seen_at: string;
  last_seen_at: string;
  last_checked_at: string | null;
  next_check_at: string | null;
  completed_checkpoints: number[];
  market_metrics: {
    price_usd: number | null;
    market_cap_usd: number | null;
    fdv_usd: number | null;
    liquidity_usd: number | null;
    volume_24h_usd: number | null;
    volume_market_cap_ratio: number | null;
  };
  filter_status: "passed_basic_filter" | "rejected_basic_filter" | "not_checked";
  filter_reasons: string[];
  security_status: string;
  missing_data: string[];
  established_membership: boolean;
  next_review_step:
    | "WAIT_FOR_NEXT_CHECKPOINT"
    | "OWNER_DECISION_REQUIRED"
    | "ESTABLISHED_MONITORING"
    | "FOLLOW_UP_COMPLETE";
};

export type FollowUpPublicList = {
  schema_version: "follow_up_list_v1";
  validation_status: FollowUpPublicStatus["validation_status"];
  entries: FollowUpPublicEntry[];
};
