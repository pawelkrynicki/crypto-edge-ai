import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import {
  DEFAULT_FOLLOW_UP_RECHECK_LIMIT,
  FOLLOW_UP_CHECKPOINT_DAYS,
  applyFollowUpRecheckSuccess,
  createEmptyFollowUpStore,
  elapsedCheckpointDays,
  followUpIdentity,
  ingestFollowUpObservations,
  inspectFollowUpStore,
  readFollowUpStore,
  resolveFollowUpStatusAt,
  selectDueFollowUpEntries,
  updateFollowUpStore,
  type FollowUpObservationCandidate,
} from "../src/followUpBasket.js";
import { calculateUniverseChecksum, type EstablishedAddressUniverse } from "../src/establishedAddressUniverse.js";

const ADDRESS_A = "0x1111111111111111111111111111111111111111";
const ADDRESS_B = "0x2222222222222222222222222222222222222222";
const START = "2026-06-01T00:00:00.000Z";

describe("Follow-up Basket model and store", () => {
  it("uses normalized chain + contract_address as the only identity and rejects invalid identities", () => {
    const left = followUpIdentity(" Base ", ADDRESS_A.toUpperCase().replace("0X", "0x"));
    const right = followUpIdentity("base", ADDRESS_A);
    assert.deepEqual(left, right);
    assert.throws(() => followUpIdentity("unsupported", ADDRESS_A), /UNSUPPORTED_CHAIN/);
    assert.throws(() => followUpIdentity("base", "0xinvalid"), /INVALID_CONTRACT_ADDRESS/);
  });

  it("deduplicates deterministically, preserves first_seen_at, updates newer last_seen_at, and ignores an older snapshot", () => {
    const first = ingestFollowUpObservations(createEmptyFollowUpStore(), [candidate({ liquidity_usd: 10 }), candidate({ candidate_id: "z", liquidity_usd: 20 })], START, "scan_first");
    assert.equal(first.entries.length, 1);
    assert.equal(first.entries[0]?.last_valid_market_snapshot?.liquidity_usd, 20);
    const newerAt = "2026-06-01T06:00:00.000Z";
    const newer = ingestFollowUpObservations(first, [candidate({ symbol: "NEWER", liquidity_usd: 30 })], newerAt, "scan_newer");
    assert.equal(newer.entries[0]?.first_seen_at, START);
    assert.equal(newer.entries[0]?.last_seen_at, newerAt);
    assert.equal(newer.entries[0]?.symbol_hint, "NEWER");
    const older = ingestFollowUpObservations(newer, [candidate({ symbol: "OLDER", liquidity_usd: 1 })], "2026-06-01T03:00:00.000Z", "scan_older");
    assert.deepEqual(older.entries, newer.entries);
  });

  it("resolves canonical 1, 3, 7, 14 and 30 day checkpoints and one overdue recheck", () => {
    assert.deepEqual(FOLLOW_UP_CHECKPOINT_DAYS, [1, 3, 7, 14, 30]);
    assert.deepEqual(elapsedCheckpointDays(START, "2026-06-15T00:00:00.000Z"), [1, 3, 7, 14]);
    const store = seededStore();
    assert.equal(selectDueFollowUpEntries(store, new Date("2026-06-15T00:00:00.000Z"), 5).length, 1);
    const checked = applyFollowUpRecheckSuccess(store, {
      entry_id: store.entries[0]!.entry_id,
      candidate: candidate({ basic_filter_status: "rejected_basic_filter", filter_reasons: ["liquidity_below_30000"] }),
      checked_at: "2026-06-15T00:00:00.000Z",
      source_run_id: "scan_recheck",
    });
    assert.deepEqual(checked.entries[0]?.completed_checkpoints, [1, 3, 7, 14]);
    assert.equal(checked.entries[0]?.next_check_at, "2026-07-01T00:00:00.000Z");
  });

  it("moves NEW to MATURING after 24 hours, candidate only after a successful check, and keeps missing security manual", () => {
    const store = seededStore({ basic_filter_status: "passed_basic_filter", filter_reasons: [] });
    assert.equal(resolveFollowUpStatusAt(store.entries[0]!, "2026-06-01T23:59:59.000Z"), "NEW");
    assert.equal(resolveFollowUpStatusAt(store.entries[0]!, "2026-06-02T00:00:00.000Z"), "MATURING");
    assert.equal(store.entries[0]?.lifecycle_status, "NEW");
    const checked = applyFollowUpRecheckSuccess(store, {
      entry_id: store.entries[0]!.entry_id,
      candidate: candidate({ basic_filter_status: "passed_basic_filter", filter_reasons: [] }),
      checked_at: "2026-06-02T00:00:00.000Z",
      source_run_id: "scan_candidate",
    });
    assert.equal(checked.entries[0]?.lifecycle_status, "CANDIDATE_FOR_ESTABLISHED");
    assert.equal(checked.entries[0]?.latest_security_status.status, "MANUAL_VERIFICATION_REQUIRED");
    assert.equal(checked.entries[0]?.candidate_since, "2026-06-02T00:00:00.000Z");
  });

  it("derives ESTABLISHED only from an enabled universe entry without mutating that universe", () => {
    const universe = enabledUniverse();
    const before = structuredClone(universe);
    const store = ingestFollowUpObservations(createEmptyFollowUpStore(), [candidate()], START, "scan_established", universe);
    assert.equal(store.entries[0]?.lifecycle_status, "ESTABLISHED");
    assert.deepEqual(universe, before);
  });

  it("archives a non-candidate after the successful 30-day checkpoint and never auto-promotes it", () => {
    const store = seededStore();
    const checked = applyFollowUpRecheckSuccess(store, {
      entry_id: store.entries[0]!.entry_id,
      candidate: candidate({ basic_filter_status: "rejected_basic_filter", filter_reasons: ["market_cap_missing"] }),
      checked_at: "2026-07-01T00:00:00.000Z",
      source_run_id: "scan_archive",
    });
    assert.equal(checked.entries[0]?.lifecycle_status, "ARCHIVED");
    assert.equal(checked.entries[0]?.archived_at, "2026-07-01T00:00:00.000Z");
    assert.equal(checked.entries[0]?.next_check_at, null);
  });

  it("keeps due selection bounded independently of user count", () => {
    let store = createEmptyFollowUpStore();
    for (let index = 1; index <= 8; index += 1) {
      const address = `0x${index.toString(16).padStart(40, "0")}`;
      store = ingestFollowUpObservations(store, [candidate({ candidate_id: `c${index}`, contract_address: address })], START, `scan_${index}`);
    }
    assert.equal(selectDueFollowUpEntries(store, new Date("2026-06-10T00:00:00.000Z"), 100).length, DEFAULT_FOLLOW_UP_RECHECK_LIMIT);
  });

  it("writes atomically, recovers from the bounded backup, and reports an invalid store without exposing data", async () => {
    const directory = await mkdtemp(resolve(tmpdir(), "follow-up-store-"));
    const storePath = resolve(directory, "store.json");
    try {
      await updateFollowUpStore(() => seededStore(), { storePath, now: new Date(START) });
      await updateFollowUpStore((store) => store, { storePath, now: new Date("2026-06-01T01:00:00.000Z") });
      await writeFile(storePath, "{broken", "utf8");
      const recovered = await inspectFollowUpStore(storePath);
      assert.equal(recovered.store_available, true);
      assert.equal(recovered.validation_status, "recovered");
      assert.equal((await readFollowUpStore(storePath)).entries.length, 1);
      await writeFile(`${storePath}.bak`, "{also-broken", "utf8");
      const invalid = await inspectFollowUpStore(storePath);
      assert.equal(invalid.store_available, false);
      assert.equal(invalid.validation_status, "invalid");
      assert.doesNotMatch(JSON.stringify(invalid), new RegExp(directory.replaceAll("\\", "\\\\")));
      assert.equal((await readFile(storePath, "utf8")), "{broken");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

function seededStore(overrides: Partial<FollowUpObservationCandidate> = {}) {
  return ingestFollowUpObservations(createEmptyFollowUpStore(), [candidate(overrides)], START, "scan_seed");
}

function candidate(overrides: Partial<FollowUpObservationCandidate> = {}): FollowUpObservationCandidate {
  return {
    candidate_id: "candidate-a",
    symbol: "TOK",
    name: "Token",
    chain: "base",
    contract_address: ADDRESS_A,
    pair_address: "0x3333333333333333333333333333333333333333",
    pair_created_at: "2026-05-01T00:00:00.000Z",
    price_usd: 1,
    market_cap_usd: 1_000_000,
    fdv_usd: 1_000_000,
    liquidity_usd: 20_000,
    volume_24h_usd: 100_000,
    volume_market_cap_ratio: 0.1,
    pair_age_days: 31,
    basic_filter_status: "rejected_basic_filter",
    filter_reasons: ["liquidity_below_30000"],
    discovery_basket: "new_emerging",
    observation_only: true,
    ...overrides,
  };
}

function enabledUniverse(): EstablishedAddressUniverse {
  const base = {
    schema_version: "established_universe_schema_v1" as const,
    universe_version: "established-universe-v000001",
    generated_at: START,
    entries: [{
      chain: "base" as const,
      contract_address: ADDRESS_A,
      enabled: true,
      added_at: START,
      updated_at: START,
      added_by: "owner",
      entry_id: "est_1111111111111111",
    }],
  };
  return { ...base, checksum: calculateUniverseChecksum(base) };
}
