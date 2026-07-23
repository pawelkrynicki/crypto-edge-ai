import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BoundedHttpClient } from "../src/boundedHttpClient.js";
import { collectDueFollowUpRechecks } from "../src/followUpCollector.js";
import {
  createEmptyFollowUpStore,
  ingestFollowUpObservations,
  selectDueFollowUpEntries,
  type FollowUpObservationCandidate,
} from "../src/followUpBasket.js";

const START = "2026-06-01T00:00:00.000Z";

describe("Follow-up due collection", () => {
  it("makes zero provider calls when nothing is due", async () => {
    let calls = 0;
    const batch = await collectDueFollowUpRechecks({
      dueEntries: [],
      client: client(async () => { calls += 1; return response([]); }),
      now: new Date(START),
      sourceRunId: "scan_none",
    });
    assert.equal(calls, 0);
    assert.equal(batch.records_selected, 0);
  });

  it("uses one token-pairs call for several overdue checkpoints and marks no failure loop", async () => {
    const store = seed("0x1111111111111111111111111111111111111111");
    const due = selectDueFollowUpEntries(store, new Date("2026-06-15T00:00:00.000Z"), 5);
    let calls = 0;
    const batch = await collectDueFollowUpRechecks({
      dueEntries: due,
      client: client(async () => { calls += 1; return response([pair(due[0]!.contract_address, 50_000)]); }),
      now: new Date("2026-06-15T00:00:00.000Z"),
      sourceRunId: "scan_due",
    });
    assert.equal(calls, 1);
    assert.equal(batch.successes.length, 1);
  });

  it("preserves last-known-good state and leaves the checkpoint incomplete on provider error", async () => {
    const store = seed("0x1111111111111111111111111111111111111111");
    const before = structuredClone(store);
    const batch = await collectDueFollowUpRechecks({
      dueEntries: selectDueFollowUpEntries(store, new Date("2026-06-02T00:00:00.000Z"), 5),
      client: client(async () => new Response("failure", { status: 500 })),
      now: new Date("2026-06-02T00:00:00.000Z"),
      sourceRunId: "scan_failed",
    });
    assert.equal(batch.successes.length, 0);
    assert.equal(batch.failed_entry_ids.length, 1);
    assert.deepEqual(store, before);
    assert.deepEqual(store.entries[0]?.completed_checkpoints, []);
  });

  it("scopes the injected security provider to basic-filter passes and never calls Honeypot.is", async () => {
    let store = seed("0x1111111111111111111111111111111111111111");
    store = ingestFollowUpObservations(store, [observation("0x2222222222222222222222222222222222222222")], START, "scan_second");
    const due = selectDueFollowUpEntries(store, new Date("2026-06-02T00:00:00.000Z"), 5);
    let securityCalls = 0;
    let honeypotCalls = 0;
    const batch = await collectDueFollowUpRechecks({
      dueEntries: due,
      client: client(async (input) => {
        const address = String(input).includes("222222") ? due.find((entry) => entry.contract_address.includes("222222"))!.contract_address : due[0]!.contract_address;
        const liquidity = address.includes("222222") ? 50_000 : 10_000;
        return response([pair(address, liquidity)]);
      }),
      now: new Date("2026-06-02T00:00:00.000Z"),
      sourceRunId: "scan_security",
      securityProvider: async () => {
        securityCalls += 1;
        return { status: "MANUAL_VERIFICATION_REQUIRED", source: null, checked_at: null, missing_data: ["security_not_checked"], risk_flags: [] };
      },
    });
    assert.equal(batch.successes.length, 2);
    assert.equal(securityCalls, 1);
    assert.equal(honeypotCalls, 0);
    void honeypotCalls;
  });
});

function seed(address: string) {
  return ingestFollowUpObservations(createEmptyFollowUpStore(), [observation(address)], START, "scan_seed");
}

function observation(address: string): FollowUpObservationCandidate {
  return {
    candidate_id: address,
    symbol: "TOK",
    name: "Token",
    chain: "base",
    contract_address: address,
    pair_address: "0x3333333333333333333333333333333333333333",
    pair_created_at: "2026-05-01T00:00:00.000Z",
    price_usd: 1,
    market_cap_usd: 1_000_000,
    fdv_usd: 1_000_000,
    liquidity_usd: 10_000,
    volume_24h_usd: 100_000,
    volume_market_cap_ratio: 0.1,
    pair_age_days: 31,
    basic_filter_status: "rejected_basic_filter",
    filter_reasons: ["liquidity_below_30000"],
    discovery_basket: "new_emerging",
    observation_only: true,
  };
}

function client(fetchImpl: (input: string | URL | Request) => Promise<Response>): BoundedHttpClient {
  return new BoundedHttpClient({ sourceId: "dexscreener", fetchImpl, maxRequests: 10, maxRetries: 0 });
}

function response(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
}

function pair(address: string, liquidity: number) {
  return {
    chainId: "base",
    dexId: "uniswap",
    url: "https://dexscreener.com/base/pair",
    pairAddress: "0x3333333333333333333333333333333333333333",
    baseToken: { address, name: "Token", symbol: "TOK" },
    quoteToken: { address: "0x4444444444444444444444444444444444444444", name: "USD", symbol: "USD" },
    priceUsd: "1",
    volume: { h24: 100_000 },
    liquidity: { usd: liquidity },
    marketCap: 1_000_000,
    fdv: 1_000_000,
    pairCreatedAt: Date.parse("2026-05-01T00:00:00.000Z"),
  };
}
