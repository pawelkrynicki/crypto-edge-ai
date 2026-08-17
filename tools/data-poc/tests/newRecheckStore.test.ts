import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import {
  LEGACY_NEW_RECHECK_STORE_SCHEMA_VERSION,
  NEW_RECHECK_STORE_SCHEMA_VERSION,
  canonicalizeNewRecheckFilterReasons,
  createNewRecheckCheckpointStates,
  finalizeNewRecheckStore,
  isNewRecheckCheckpointDue,
  updateCheckpointAfterFailure,
  updateCheckpointAfterSuccess,
  validateNewRecheckStore,
  type NewRecheckCheckpointState,
  type NewRecheckEntry,
} from "../src/newRecheckStore.js";
import type { PersistableCandidate } from "../src/persistableScannerModel.js";

const NOW = new Date("2026-08-17T12:14:09.496Z");
const NOW_TEXT = NOW.toISOString();
// Safe normalized values captured in the DISC.1C diagnostic; this test is self-contained.
const SAFE_ADDRESS = "0x1db0334cb2b5d2f723980968b2bca4a3b8217777";
const SAFE_REASONS = [
  "market_cap_below_300000",
  "volume_24h_below_30000",
  "liquidity_below_30000",
  "volume_market_cap_ratio_outside_sweet_spot_5_30_percent",
  "pair_age_not_above_7_days",
  "pair_age_outside_preferred_14_90_days",
];

describe("New recheck v2 persistence", () => {
  it("canonicalizes only the persisted filter result before generating and validating its checksum", () => {
    const entry = safeEntry();
    entry.latest_filter_result!.reasons.push(SAFE_REASONS[0]!);
    const originalCandidateReasons = [...entry.latest_normalized_candidate!.filter_reasons];
    const store = finalizeNewRecheckStore({ schema_version: NEW_RECHECK_STORE_SCHEMA_VERSION, generated_at: NOW_TEXT, entries: [entry], last_receipt: null }, NOW);
    const expectedReasons = canonicalizeNewRecheckFilterReasons(SAFE_REASONS);

    assert.deepEqual(store.entries[0]?.latest_filter_result?.reasons, expectedReasons);
    assert.deepEqual(store.entries[0]?.latest_normalized_candidate?.filter_reasons, originalCandidateReasons, "upstream candidate order is untouched");
    assert.equal(stateFor(store.entries[0]!, 1).outcome, "SUCCESS", "a valid multi-reason baseline reject is a successful technical refresh");
    assert.deepEqual(validateNewRecheckStore(store), store, "the exact checksummed object is accepted by the validator");
  });

  it("migrates a valid v1 record with unsorted filter reasons and preserves successful history", () => {
    const entry = safeEntry();
    const legacyEntry = {
      ...entry,
      checkpoint_states: undefined,
    };
    delete (legacyEntry as { checkpoint_states?: unknown }).checkpoint_states;
    const base = {
      schema_version: LEGACY_NEW_RECHECK_STORE_SCHEMA_VERSION,
      generated_at: NOW_TEXT,
      entries: [legacyEntry],
      last_receipt: null,
    };
    const legacy = { ...base, checksum: legacyChecksum(base) };

    const migrated = validateNewRecheckStore(legacy);
    assert.equal(migrated.schema_version, NEW_RECHECK_STORE_SCHEMA_VERSION);
    assert.equal(migrated.entries[0]?.identity, `bsc:${SAFE_ADDRESS}`);
    assert.equal(migrated.entries[0]?.first_seen_at, "2026-08-16T09:47:11.403Z");
    assert.equal(stateFor(migrated.entries[0]!, 1).outcome, "SUCCESS");
    assert.equal(stateFor(migrated.entries[0]!, 3).outcome, "PENDING");
    assert.deepEqual(migrated.entries[0]?.latest_filter_result?.reasons, canonicalizeNewRecheckFilterReasons(SAFE_REASONS));
  });

  it("rejects malformed filter, candidate, and checkpoint shapes before checksum acceptance", () => {
    const store = finalizeNewRecheckStore({ schema_version: NEW_RECHECK_STORE_SCHEMA_VERSION, generated_at: NOW_TEXT, entries: [safeEntry()], last_receipt: null }, NOW);
    const malformedFilter = structuredClone(store);
    (malformedFilter.entries[0]!.latest_filter_result as Record<string, unknown>).unexpected = true;
    assert.throws(() => validateNewRecheckStore(malformedFilter), /NEW_RECHECK_STORE_UNKNOWN_FIELD/);

    const malformedCandidate = structuredClone(store);
    malformedCandidate.entries[0]!.latest_normalized_candidate!.contract_address = "0xdeadbeef";
    assert.throws(() => validateNewRecheckStore(malformedCandidate), /NEW_RECHECK_STORE_INVALID_CANDIDATE/);

    const malformedCheckpoint = structuredClone(store);
    malformedCheckpoint.entries[0]!.checkpoint_states[0] = { ...malformedCheckpoint.entries[0]!.checkpoint_states[0]!, outcome: "SUCCESS", attempt_count: 0 };
    assert.throws(() => validateNewRecheckStore(malformedCheckpoint), /NEW_RECHECK_STORE_INVALID_CHECKPOINT_STATE/);

    const invalidReason = structuredClone(store);
    invalidReason.entries[0]!.latest_filter_result!.reasons = [""];
    assert.throws(() => validateNewRecheckStore(invalidReason), /NEW_RECHECK_STORE_INVALID_FILTER_RESULT/);

    const tamperedChecksum = { ...store, checksum: "sha256:0000000000000000000000000000000000000000000000000000000000000000" };
    assert.throws(() => validateNewRecheckStore(tamperedChecksum), /NEW_RECHECK_STORE_CHECKSUM_MISMATCH/);
  });

  it("uses the required one-hour, six-hour, and twenty-four-hour bounded retry schedule", () => {
    const entry: NewRecheckEntry = { ...safeEntry(), first_seen_at: "2026-08-01T00:00:00.000Z", completed_checkpoints: [], checkpoint_states: createNewRecheckCheckpointStates(), last_attempt_at: null, last_success_at: null, last_checkpoint: null, next_checkpoint: 1 };
    let state = stateFor(entry, 1);
    state = updateCheckpointAfterFailure(state, "FIRST_FAILURE", NOW);
    assert.deepEqual(persistedRetry(state), { attempt_count: 1, outcome: "RETRY_WAIT", retry_not_before: "2026-08-17T13:14:09.496Z" });
    assert.equal(isNewRecheckCheckpointDue({ ...entry, checkpoint_states: replaceState(entry, state) }, 1, new Date("2026-08-17T13:14:09.495Z")), false);
    assert.equal(isNewRecheckCheckpointDue({ ...entry, checkpoint_states: replaceState(entry, state) }, 1, new Date("2026-08-17T13:14:09.496Z")), true);

    state = updateCheckpointAfterFailure(state, "SECOND_FAILURE", new Date("2026-08-17T13:14:09.496Z"));
    assert.deepEqual(persistedRetry(state), { attempt_count: 2, outcome: "RETRY_WAIT", retry_not_before: "2026-08-17T19:14:09.496Z" });
    state = updateCheckpointAfterFailure(state, "THIRD_FAILURE", new Date("2026-08-17T19:14:09.496Z"));
    assert.deepEqual(persistedRetry(state), { attempt_count: 3, outcome: "RETRY_WAIT", retry_not_before: "2026-08-18T19:14:09.496Z" });
    state = updateCheckpointAfterFailure(state, "FOURTH_FAILURE", new Date("2026-08-18T19:14:09.496Z"));
    assert.deepEqual(persistedRetry(state), { attempt_count: 4, outcome: "EXHAUSTED", retry_not_before: null });

    const success = updateCheckpointAfterSuccess(updateCheckpointAfterFailure(stateFor(entry, 3), "TEMPORARY", NOW), NOW);
    assert.equal(success.outcome, "SUCCESS");
    assert.equal(success.last_error_code, null);
    assert.equal(success.retry_not_before, null);
  });
});

function safeEntry(): NewRecheckEntry {
  const states = createNewRecheckCheckpointStates().map((state) => state.checkpoint === 1
    ? { ...state, attempt_count: 1, last_attempt_at: NOW_TEXT, outcome: "SUCCESS" as const }
    : state,
  );
  return {
    identity: `bsc:${SAFE_ADDRESS}`,
    chain: "bsc",
    contract_address: SAFE_ADDRESS,
    first_seen_at: "2026-08-16T09:47:11.403Z",
    completed_checkpoints: [1],
    checkpoint_states: states,
    last_attempt_at: NOW_TEXT,
    last_success_at: NOW_TEXT,
    last_checkpoint: 1,
    next_checkpoint: 3,
    latest_source_timestamp: NOW_TEXT,
    latest_normalized_candidate: safeCandidate(),
    latest_filter_result: { status: "rejected_basic_filter", reasons: [...SAFE_REASONS], evaluated_at: NOW_TEXT },
    last_error_code: null,
  };
}

function safeCandidate(): PersistableCandidate {
  return {
    run_id: "disc1c_live_capture",
    candidate_id: "301337621645de05a9ec92bff483322df4b76a1b374c5e85291d9aedcd196224",
    symbol: "MARSPIG",
    name: "火星猪",
    chain: "bsc",
    contract_address: SAFE_ADDRESS,
    pair_address: "0x59dca7bd2ad8ffb7307f3c40c8d805ec134a8164",
    dex: "flapsh",
    source: "dexscreener",
    source_url: "https://dexscreener.com/bsc/0x59dca7bd2ad8ffb7307f3c40c8d805ec134a8164",
    price_usd: 0.000004333,
    market_cap_usd: 4334,
    fdv_usd: 4334,
    liquidity_usd: 9586.82,
    volume_24h_usd: 116.92,
    volume_market_cap_ratio: 0.026977388094139364,
    pair_created_at: "2026-08-16T09:21:42.000Z",
    pair_age_days: 1,
    basic_filter_status: "rejected_basic_filter",
    filter_reasons: [...SAFE_REASONS],
    final_label: "REJECT",
    final_reasons: [...SAFE_REASONS],
    created_at: NOW_TEXT,
    discovery_basket: "new_emerging",
    observation_only: true,
  };
}

function stateFor(entry: NewRecheckEntry, checkpoint: number): NewRecheckCheckpointState {
  const state = entry.checkpoint_states.find((item) => item.checkpoint === checkpoint);
  if (!state) throw new Error("TEST_CHECKPOINT_MISSING");
  return state;
}

function replaceState(entry: NewRecheckEntry, replacement: NewRecheckCheckpointState) {
  return entry.checkpoint_states.map((state) => state.checkpoint === replacement.checkpoint ? replacement : state);
}

function persistedRetry(state: NewRecheckCheckpointState) {
  return { attempt_count: state.attempt_count, outcome: state.outcome, retry_not_before: state.retry_not_before };
}

function legacyChecksum(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonical(value), "utf8").digest("hex")}`;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object" && value !== null) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
