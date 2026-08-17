import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, it } from "node:test";
import { BoundedHttpClient, type FetchLike } from "../src/boundedHttpClient.js";
import { isSupportedNewRecheckIdentity, runCentralNewRechecks, validateNewRecheckObservation } from "../src/newRecheckEngine.js";
import { finalizeNewRecheckStore, readNewRecheckStore, updateNewRecheckStore, type NewRecheckCheckpointDay } from "../src/newRecheckStore.js";
import { readFollowUpStore } from "../src/followUpBasket.js";
import { applySystemLifecycle, readLifecycleAuditStore } from "../src/systemLifecycle.js";
import type { PersistableCandidate, PersistableScannerOutput } from "../src/persistableScannerModel.js";

const roots: string[] = [];
const FIRST = new Date("2026-08-01T00:00:00.000Z");
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe("central New incubation rechecks", () => {
  it("does not call the provider before the first checkpoint, then batches eligible identities and promotes only a current baseline pass", async () => {
    const paths = await isolatedPaths();
    const addresses = Array.from({ length: 31 }, (_, index) => address(index + 1));
    await seedNew(paths, addresses, FIRST);
    let calls = 0;
    const before = await run(paths, new Date("2026-08-01T12:00:00.000Z"), async () => { calls += 1; return Response.json([]); }, 2);
    assert.equal(calls, 0);
    assert.equal(before.records_selected, 0);
    const result = await run(paths, new Date("2026-08-02T00:00:00.000Z"), async (input) => {
      calls += 1;
      const requested = decodeURIComponent(String(input).split("/").at(-1) ?? "").split(",");
      return Response.json(requested.map((item) => pair(item, 60_000)));
    }, 2);
    assert.equal(calls, 2, "31 identities are split into batches of at most 30");
    assert.equal(result.records_rechecked, 31);
    assert.equal(result.promoted_to_follow_up, 31);
    assert.equal((await readFollowUpStore(paths.followUp)).entries.length, 31);
    const store = await readNewRecheckStore(paths.recheck);
    assert.equal(store.entries.every((entry) => entry.completed_checkpoints.includes(1)), true);
    const audit = await readLifecycleAuditStore(paths.audit);
    assert.equal(audit.entries.every((entry) => entry.recheck_id === result.recheck_id), true);
  });

  it("preserves a valid last-known-good observation and leaves a later failed checkpoint incomplete", async () => {
    const paths = await isolatedPaths();
    const target = address(91);
    await seedNew(paths, [target], FIRST);
    await run(paths, new Date("2026-08-02T00:00:00.000Z"), async (input) => Response.json([pair(decodeURIComponent(String(input).split("/").at(-1) ?? ""), 1)]));
    const first = (await readNewRecheckStore(paths.recheck)).entries[0]!;
    assert.equal(first.latest_normalized_candidate?.liquidity_usd, 1);
    await run(paths, new Date("2026-08-04T00:00:00.000Z"), async () => new Response("failure", { status: 500 }));
    const after = (await readNewRecheckStore(paths.recheck)).entries[0]!;
    assert.equal(after.latest_normalized_candidate?.liquidity_usd, 1);
    assert.deepEqual(after.completed_checkpoints, [1]);
    assert.equal(after.last_error_code?.startsWith("NEW_RECHECK_BATCH_"), true);
  });

  it("keeps a Day-0 age failure in New and promotes that same identity only after the Day-8 baseline pass", async () => {
    const paths = await isolatedPaths();
    const target = address(201);
    await seedNew(paths, [target], FIRST);
    const dayOne = await run(paths, new Date("2026-08-02T00:00:00.000Z"), async (input) => Response.json([pair(decodeURIComponent(String(input).split("/").at(-1) ?? ""), 60_000, FIRST)]));
    assert.equal(dayOne.promoted_to_follow_up, 0);
    assert.equal((await readNewRecheckStore(paths.recheck)).entries[0]?.latest_filter_result?.reasons.includes("pair_age_not_above_7_days"), true);
    await run(paths, new Date("2026-08-04T00:00:00.000Z"), async (input) => Response.json([pair(decodeURIComponent(String(input).split("/").at(-1) ?? ""), 60_000, FIRST)]));
    const dayEight = await run(paths, new Date("2026-08-09T00:00:00.000Z"), async (input) => Response.json([pair(decodeURIComponent(String(input).split("/").at(-1) ?? ""), 60_000, FIRST)]));
    assert.equal(dayEight.promoted_to_follow_up, 1);
    assert.equal((await readFollowUpStore(paths.followUp)).entries.length, 1);
    const duplicate = await run(paths, new Date("2026-08-09T00:15:00.000Z"), async () => { throw new Error("DUPLICATE_CHECKPOINT_FETCHED"); });
    assert.equal(duplicate.provider_request_count, 0);
  });

  it("keeps baseline market-cap and liquidity failures in New at the Day-8 checkpoint", async () => {
    for (const fixture of [{ marketCap: 100_000, liquidity: 60_000 }, { marketCap: 1_000_000, liquidity: 1 }]) {
      const paths = await isolatedPaths();
      const target = address(fixture.marketCap === 100_000 ? 301 : 302);
      await seedNew(paths, [target], FIRST);
      await run(paths, new Date("2026-08-01T12:00:00.000Z"), async () => Response.json([]));
      await setNextCheckpoint(paths.recheck, 8);
      const result = await run(paths, new Date("2026-08-09T00:00:00.000Z"), async (input) => Response.json([pair(decodeURIComponent(String(input).split("/").at(-1) ?? ""), fixture.liquidity, new Date("2026-07-01T00:00:00.000Z"), fixture.marketCap)]));
      assert.equal(result.promoted_to_follow_up, 0);
      assert.equal((await readFollowUpStore(paths.followUp)).entries.length, 0);
    }
  });

  it("fails closed for a wrong or incomplete provider result while retaining the previous observation", async () => {
    const paths = await isolatedPaths();
    const target = address(401);
    await seedNew(paths, [target], FIRST);
    await run(paths, new Date("2026-08-02T00:00:00.000Z"), async (input) => Response.json([pair(decodeURIComponent(String(input).split("/").at(-1) ?? ""), 1)]));
    const knownGood = (await readNewRecheckStore(paths.recheck)).entries[0]?.latest_normalized_candidate;
    await setNextCheckpoint(paths.recheck, 3);
    await run(paths, new Date("2026-08-04T00:00:00.000Z"), async () => Response.json([pair(address(402), 60_000)]));
    const wrong = (await readNewRecheckStore(paths.recheck)).entries[0]!;
    assert.deepEqual(wrong.latest_normalized_candidate, knownGood);
    assert.equal(wrong.completed_checkpoints.includes(3), false);
    assert.equal(wrong.checkpoint_states.find((state) => state.checkpoint === 3)?.outcome, "RETRY_WAIT");
    await run(paths, new Date("2026-08-04T00:15:00.000Z"), async (input) => Response.json([{ ...pair(decodeURIComponent(String(input).split("/").at(-1) ?? ""), 60_000), marketCap: undefined, fdv: undefined }]));
    const incomplete = (await readNewRecheckStore(paths.recheck)).entries[0]!;
    assert.deepEqual(incomplete.latest_normalized_candidate, knownGood);
    assert.equal(incomplete.completed_checkpoints.includes(3), false);
    assert.equal(incomplete.checkpoint_states.find((state) => state.checkpoint === 3)?.attempt_count, 1, "a retry-wait checkpoint is not immediately re-attempted");
  });

  it("persists bounded retry state across runs and lets an exhausted Day-1 checkpoint yield to Day 3", async () => {
    const paths = await isolatedPaths();
    const target = address(451);
    await seedNew(paths, [target], FIRST);
    let calls = 0;
    const failure = async () => { calls += 1; return new Response("failure", { status: 500 }); };
    await run(paths, new Date("2026-08-02T00:00:00.000Z"), failure);
    let entry = (await readNewRecheckStore(paths.recheck)).entries[0]!;
    assert.deepEqual(entry.checkpoint_states.find((state) => state.checkpoint === 1), { checkpoint: 1, attempt_count: 1, last_attempt_at: "2026-08-02T00:00:00.000Z", last_error_code: "NEW_RECHECK_BATCH_FAILED", retry_not_before: "2026-08-02T01:00:00.000Z", outcome: "RETRY_WAIT" });

    const waiting = await run(paths, new Date("2026-08-02T00:30:00.000Z"), async () => { throw new Error("RETRY_CALLED_TOO_EARLY"); });
    assert.equal(waiting.provider_request_count, 0);
    await run(paths, new Date("2026-08-02T01:00:00.000Z"), failure);
    await run(paths, new Date("2026-08-02T07:00:00.000Z"), failure);
    await run(paths, new Date("2026-08-03T07:00:00.000Z"), failure);
    entry = (await readNewRecheckStore(paths.recheck)).entries[0]!;
    assert.deepEqual(entry.checkpoint_states.find((state) => state.checkpoint === 1), { checkpoint: 1, attempt_count: 4, last_attempt_at: "2026-08-03T07:00:00.000Z", last_error_code: "NEW_RECHECK_BATCH_FAILED", retry_not_before: null, outcome: "EXHAUSTED" });

    const dayThree = await run(paths, new Date("2026-08-04T00:00:00.000Z"), async (input) => {
      calls += 1;
      return Response.json([pair(decodeURIComponent(String(input).split("/").at(-1) ?? ""), 1)]);
    });
    assert.equal(dayThree.records_rechecked, 1);
    entry = (await readNewRecheckStore(paths.recheck)).entries[0]!;
    assert.equal(entry.checkpoint_states.find((state) => state.checkpoint === 1)?.outcome, "EXHAUSTED");
    assert.equal(entry.checkpoint_states.find((state) => state.checkpoint === 3)?.outcome, "SUCCESS");
    assert.equal(calls, 5);
  });

  it("returns a safe validation diagnostic for a malformed candidate preflight without touching the store", async () => {
    const paths = await isolatedPaths();
    const target = address(475);
    await seedNew(paths, [target], FIRST);
    await run(paths, new Date("2026-08-01T12:00:00.000Z"), async () => Response.json([]));
    const entry = (await readNewRecheckStore(paths.recheck)).entries[0]!;
    const malformed = { ...candidate(target, "rejected_basic_filter"), filter_reasons: [""] };
    assert.deepEqual(
      validateNewRecheckObservation(entry, 1, malformed, new Date("2026-08-02T00:00:00.000Z")),
      { valid: false, code: "NEW_RECHECK_STORE_INVALID_FILTER_RESULT", field: "latest_filter_result.reasons" },
    );
    assert.deepEqual((await readNewRecheckStore(paths.recheck)).entries[0], entry);
  });

  it("batches chains independently and keeps a partial batch's unmatched identity unchanged", async () => {
    const paths = await isolatedPaths();
    const baseA = address(501);
    const baseB = address(502);
    const solana = "So11111111111111111111111111111111111111112";
    await applySystemLifecycle(snapshot([candidate(baseA, "rejected_basic_filter"), candidate(baseB, "rejected_basic_filter"), { ...candidate(solana, "rejected_basic_filter"), chain: "solana", contract_address: solana }], FIRST), { newInboxStorePath: paths.inbox, auditStorePath: paths.audit, followUpStorePath: paths.followUp, establishedStorePath: paths.established, centralCycleId: "cycle_multichain", now: FIRST });
    let calls = 0;
    const result = await run(paths, new Date("2026-08-02T00:00:00.000Z"), async (input) => {
      calls += 1;
      const url = String(input);
      return Response.json(url.includes("/solana/") ? [pair(solana, 1, new Date("2026-01-01T00:00:00.000Z"), 1_000_000, "solana")] : [pair(baseA, 1)]);
    }, 2);
    assert.equal(calls, 2);
    assert.equal(result.records_rechecked, 2);
    assert.equal(result.records_failed, 1);
    const entries = new Map((await readNewRecheckStore(paths.recheck)).entries.map((entry) => [entry.identity, entry]));
    assert.notEqual(entries.get(`base:${baseA}`)?.latest_normalized_candidate, null);
    assert.equal(entries.get(`base:${baseB}`)?.latest_normalized_candidate, null);
    assert.notEqual(entries.get(`solana:${solana}`)?.latest_normalized_candidate, null);
    assert.equal(entries.get(`base:${baseB}`)?.checkpoint_states.find((state) => state.checkpoint === 1)?.outcome, "RETRY_WAIT", "an unmatched identity gets its own retry state without aborting valid identities");
    assert.equal(entries.get(`base:${baseA}`)?.checkpoint_states.find((state) => state.checkpoint === 1)?.outcome, "SUCCESS");
  });

  it("accepts only exact supported chain + contract identities", () => {
    const valid = address(7);
    assert.equal(isSupportedNewRecheckIdentity("base", valid, `base:${valid.toLowerCase()}`), true);
    assert.equal(isSupportedNewRecheckIdentity("bitcoin", valid, `bitcoin:${valid.toLowerCase()}`), false);
    assert.equal(isSupportedNewRecheckIdentity("base", valid, `base:${address(8).toLowerCase()}`), false);
  });
});

async function isolatedPaths() {
  const root = await mkdtemp(resolve(tmpdir(), "new-recheck-")); roots.push(root);
  return { inbox: resolve(root, "lifecycle", "new-inbox.json"), audit: resolve(root, "lifecycle", "audit.json"), followUp: resolve(root, "follow-up", "store.json"), established: resolve(root, "established", "store.json"), recheck: resolve(root, "new-recheck", "store.json") };
}

async function seedNew(paths: Awaited<ReturnType<typeof isolatedPaths>>, addresses: string[], now: Date) {
  await applySystemLifecycle(snapshot(addresses.map((item) => candidate(item, "rejected_basic_filter")), now), { newInboxStorePath: paths.inbox, auditStorePath: paths.audit, followUpStorePath: paths.followUp, establishedStorePath: paths.established, centralCycleId: "cycle_seed", now });
}

async function run(paths: Awaited<ReturnType<typeof isolatedPaths>>, now: Date, fetchImpl: FetchLike, maxRequests = 1) {
  return runCentralNewRechecks({ client: new BoundedHttpClient({ sourceId: "dexscreener", maxRequests, fetchImpl }), now, newInboxStorePath: paths.inbox, auditStorePath: paths.audit, followUpStorePath: paths.followUp, establishedStorePath: paths.established, recheckStorePath: paths.recheck, centralCycleId: `cycle_${now.getTime()}`, recheckId: `newrecheck_${now.getTime()}` });
}

async function setNextCheckpoint(path: string, checkpoint: 3 | 8) {
  const completed = (checkpoint === 3 ? [1] : [1, 3]) as NewRecheckCheckpointDay[];
  await updateNewRecheckStore((store) => finalizeNewRecheckStore({
    ...store,
    entries: store.entries.map((entry) => ({
      ...entry,
      completed_checkpoints: completed,
      checkpoint_states: entry.checkpoint_states.map((state) => completed.includes(state.checkpoint)
        ? { ...state, attempt_count: 1, last_attempt_at: FIRST.toISOString(), last_error_code: null, retry_not_before: null, outcome: "SUCCESS" as const }
        : { ...state, attempt_count: 0, last_attempt_at: null, last_error_code: null, retry_not_before: null, outcome: "PENDING" as const }),
      last_checkpoint: checkpoint === 3 ? 1 : 3,
      next_checkpoint: checkpoint,
    })),
  }, new Date("2026-08-01T12:00:00.000Z")), path);
}

function snapshot(candidates: PersistableCandidate[], now: Date): PersistableScannerOutput {
  const timestamp = now.toISOString();
  return { provenance: { contract_version: "test", fixture_used: false } as unknown as PersistableScannerOutput["provenance"], scan_run: { run_id: "scan_seed", source: "combined-scanner-poc", mode: "live", query: "new-recheck-test", filters: {}, limits: {}, started_at: timestamp, finished_at: timestamp, total_raw: candidates.length, passed_basic_filter: 0, rejected_basic_filter: candidates.length, security_checked: 0, security_passed: 0, needs_manual_verification: 0, critical_risk: 0, watchlist_candidates: 0, errors: [] }, candidates: candidates.map((item) => ({ ...item, created_at: timestamp })), security_checks: [], scorecards: [] };
}

function candidate(contractAddress: string, status: "passed_basic_filter" | "rejected_basic_filter"): PersistableCandidate {
  return { run_id: "scan_seed", candidate_id: contractAddress, symbol: "NEW", name: "New Token", chain: "base", contract_address: contractAddress, pair_address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", dex: "uniswap", source: "dexscreener", source_url: "https://dexscreener.com/base/token", price_usd: 1, market_cap_usd: 1_000_000, fdv_usd: 1_000_000, liquidity_usd: 1, volume_24h_usd: 1, volume_market_cap_ratio: 0.001, pair_created_at: "2026-01-01T00:00:00.000Z", pair_age_days: 200, basic_filter_status: status, filter_reasons: ["liquidity_below_30000"], final_label: "REJECT", final_reasons: ["liquidity_below_30000"], created_at: FIRST.toISOString(), discovery_basket: "new_emerging", observation_only: true };
}

function pair(contractAddress: string, liquidity: number, createdAt = new Date("2026-01-01T00:00:00.000Z"), marketCap = 1_000_000, chain = "base") {
  return { chainId: chain, pairAddress: `0x${"b".repeat(40)}`, dexId: "uniswap", url: `https://dexscreener.com/${chain}/pair`, baseToken: { address: contractAddress, symbol: "NEW", name: "New Token" }, quoteToken: { address: "0xcccccccccccccccccccccccccccccccccccccccc", symbol: "USDC", name: "USD Coin" }, priceUsd: "1", marketCap, fdv: marketCap, liquidity: { usd: liquidity }, volume: { h24: 100_000 }, pairCreatedAt: createdAt.getTime() };
}

function address(index: number): string { return `0x${index.toString(16).padStart(40, "0")}`; }
