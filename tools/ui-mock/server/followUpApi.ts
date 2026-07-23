import type { EstablishedAddressUniverse } from "../../data-poc/src/establishedAddressUniverse.js";
import {
  FOLLOW_UP_LIST_LIMIT,
  dueFollowUpCount,
  followUpIdentity,
  inspectFollowUpStore,
  loadEnabledEstablishedUniverse,
  resolveFollowUpStatusAt,
  type FollowUpEntry,
  type FollowUpLifecycleStatus,
  type FollowUpStore,
} from "../../data-poc/src/followUpBasket.js";

export type FollowUpApiOptions = {
  storePath?: string;
  establishedUniversePath?: string;
  establishedUniverse?: EstablishedAddressUniverse | null;
  now?: () => Date;
};

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

export async function readFollowUpStatus(options: FollowUpApiOptions = {}): Promise<FollowUpPublicStatus> {
  const now = options.now?.() ?? new Date();
  const diagnostics = await inspectFollowUpStore(options.storePath);
  if (!diagnostics.store_available) return unavailableStatus(diagnostics.validation_status);
  const universe = resolveUniverse(options);
  const entries = diagnostics.store.entries.map((entry) => publicEntry(entry, now, universe));
  return {
    schema_version: "follow_up_status_v1",
    store_available: true,
    validation_status: diagnostics.validation_status,
    entries_total: entries.length,
    new_count: count(entries, "NEW"),
    maturing_count: count(entries, "MATURING"),
    candidate_count: count(entries, "CANDIDATE_FOR_ESTABLISHED"),
    established_count: count(entries, "ESTABLISHED"),
    archived_count: count(entries, "ARCHIVED"),
    due_count: dueFollowUpCount(diagnostics.store, now),
    next_due_at: earliestDue(diagnostics.store),
    last_updated_at: diagnostics.store.generated_at === new Date(0).toISOString()
      ? null
      : diagnostics.store.generated_at,
  };
}

export async function readFollowUpList(options: FollowUpApiOptions = {}): Promise<{
  schema_version: "follow_up_list_v1";
  validation_status: FollowUpPublicStatus["validation_status"];
  entries: FollowUpPublicEntry[];
}> {
  const now = options.now?.() ?? new Date();
  const diagnostics = await inspectFollowUpStore(options.storePath);
  if (!diagnostics.store_available) {
    return { schema_version: "follow_up_list_v1", validation_status: diagnostics.validation_status, entries: [] };
  }
  const universe = resolveUniverse(options);
  const entries = diagnostics.store.entries
    .map((entry) => publicEntry(entry, now, universe))
    .filter((entry) => entry.lifecycle_status !== "ARCHIVED")
    .sort((left, right) => comparePublicEntries(left, right, now))
    .slice(0, FOLLOW_UP_LIST_LIMIT);
  return { schema_version: "follow_up_list_v1", validation_status: diagnostics.validation_status, entries };
}

export async function readFollowUpDetail(
  entryId: string,
  options: FollowUpApiOptions = {},
): Promise<FollowUpPublicEntry | null> {
  if (!/^fup_[0-9a-f]{16}$/.test(entryId)) return null;
  const diagnostics = await inspectFollowUpStore(options.storePath);
  if (!diagnostics.store_available) return null;
  const entry = diagnostics.store.entries.find((candidate) => candidate.entry_id === entryId);
  return entry ? publicEntry(entry, options.now?.() ?? new Date(), resolveUniverse(options)) : null;
}

function publicEntry(
  entry: FollowUpEntry,
  now: Date,
  universe: EstablishedAddressUniverse | null,
): FollowUpPublicEntry {
  const identity = followUpIdentity(entry.chain, entry.contract_address).identity;
  const enabled = new Set((universe?.entries ?? []).filter((candidate) => candidate.enabled).map((candidate) => (
    followUpIdentity(candidate.chain, candidate.contract_address).identity
  )));
  const establishedMembership = enabled.has(identity);
  const lifecycle = establishedMembership ? "ESTABLISHED" : resolveFollowUpStatusAt(entry, now.toISOString());
  const market = entry.last_valid_market_snapshot;
  const missing = [
    ...(entry.latest_filter_result?.reasons.filter((reason) => reason.includes("missing")) ?? []),
    ...entry.latest_security_status.missing_data,
  ];
  return {
    entry_id: entry.entry_id,
    chain: entry.chain,
    contract_address: entry.contract_address,
    display_name: entry.display_name,
    symbol: entry.symbol_hint,
    lifecycle_status: lifecycle,
    pair_age: market?.pair_age_days ?? null,
    first_seen_at: entry.first_seen_at,
    last_seen_at: entry.last_seen_at,
    last_checked_at: entry.last_checked_at,
    next_check_at: lifecycle === "ESTABLISHED" ? null : entry.next_check_at,
    completed_checkpoints: [...entry.completed_checkpoints],
    market_metrics: {
      price_usd: market?.price_usd ?? null,
      market_cap_usd: market?.market_cap_usd ?? null,
      fdv_usd: market?.fdv_usd ?? null,
      liquidity_usd: market?.liquidity_usd ?? null,
      volume_24h_usd: market?.volume_24h_usd ?? null,
      volume_market_cap_ratio: market?.volume_market_cap_ratio ?? null,
    },
    filter_status: entry.latest_filter_result?.status ?? "not_checked",
    filter_reasons: [...(entry.latest_filter_result?.reasons ?? [])],
    security_status: entry.latest_security_status.status,
    missing_data: [...new Set(missing)].sort(),
    established_membership: establishedMembership,
    next_review_step: lifecycle === "CANDIDATE_FOR_ESTABLISHED"
      ? "OWNER_DECISION_REQUIRED"
      : lifecycle === "ESTABLISHED"
        ? "ESTABLISHED_MONITORING"
        : lifecycle === "ARCHIVED" ? "FOLLOW_UP_COMPLETE" : "WAIT_FOR_NEXT_CHECKPOINT",
  };
}

function comparePublicEntries(left: FollowUpPublicEntry, right: FollowUpPublicEntry, now: Date): number {
  const rank = (entry: FollowUpPublicEntry): number => {
    if (entry.lifecycle_status === "CANDIDATE_FOR_ESTABLISHED") return 0;
    if (entry.lifecycle_status === "MATURING" && entry.next_check_at && Date.parse(entry.next_check_at) <= now.getTime()) return 1;
    if (entry.lifecycle_status === "MATURING") return 2;
    if (entry.lifecycle_status === "NEW") return 3;
    if (entry.lifecycle_status === "ESTABLISHED") return 4;
    return 5;
  };
  return rank(left) - rank(right)
    || Date.parse(left.next_check_at ?? "9999-12-31T00:00:00.000Z") - Date.parse(right.next_check_at ?? "9999-12-31T00:00:00.000Z")
    || left.entry_id.localeCompare(right.entry_id);
}

function resolveUniverse(options: FollowUpApiOptions): EstablishedAddressUniverse | null {
  return options.establishedUniverse === undefined
    ? loadEnabledEstablishedUniverse(options.establishedUniversePath)
    : options.establishedUniverse;
}

function earliestDue(store: FollowUpStore): string | null {
  return store.entries
    .filter((entry) => entry.lifecycle_status === "NEW" || entry.lifecycle_status === "MATURING")
    .map((entry) => entry.next_check_at)
    .filter((value): value is string => value !== null)
    .sort((left, right) => Date.parse(left) - Date.parse(right))[0] ?? null;
}

function count(entries: FollowUpPublicEntry[], status: FollowUpLifecycleStatus): number {
  return entries.filter((entry) => entry.lifecycle_status === status).length;
}

function unavailableStatus(validationStatus: "invalid" | "unavailable"): FollowUpPublicStatus {
  return {
    schema_version: "follow_up_status_v1",
    store_available: false,
    validation_status: validationStatus,
    entries_total: 0,
    new_count: 0,
    maturing_count: 0,
    candidate_count: 0,
    established_count: 0,
    archived_count: 0,
    due_count: 0,
    next_due_at: null,
    last_updated_at: null,
  };
}
