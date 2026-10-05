import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import {
  createEnvironmentKrakenFuturesCredentialSource,
  createKrakenFuturesAuthent,
  type KrakenAccountSnapshot,
} from "../server/krakenAccount.js";
import {
  createKrakenExecutionLedger,
} from "../server/krakenExecutionLedger.js";
import {
  evaluateKrakenLivePilotGate,
  HARD_MAX_KRAKEN_LIVE_PILOT_NOTIONAL_USD,
} from "../server/krakenLiveExecutionGate.js";
import {
  createKrakenLiveExecutionService,
} from "../server/krakenLiveExecutionService.js";
import {
  createKrakenLiveOrderTransport,
  encodeKrakenSendOrderPostData,
  KRAKEN_FUTURES_SEND_ORDER_PATH,
  KRAKEN_FUTURES_SEND_ORDER_URL,
  type KrakenLiveOrderTransport,
} from "../server/krakenLiveOrderTransport.js";
import {
  buildKrakenLivePilotEntryPlan,
  buildKrakenProtectiveExitPlan,
} from "../server/krakenLiveRequestBuilder.js";
import type { KrakenOrderIntent } from "../server/krakenOrderIntent.js";

describe("Kraken live pilot execution gate", () => {
  it("fails closed by default and requires OWNER, both flags, live mode, FULL_ACCESS, exact intent/symbol, and explicit cap", () => {
    const intent = readyIntent();

    const blocked = evaluateKrakenLivePilotGate({
      env: {},
      role: "OWNER",
      account: fullAccessAccount(),
      intent,
    });
    assert.equal(blocked.allowed, false);
    assert.ok(blocked.reasons.includes("EXECUTION_FLAG_OFF"));
    assert.ok(blocked.reasons.includes("PILOT_FLAG_OFF"));
    assert.ok(blocked.reasons.includes("KRAKEN_MODE_NOT_LIVE"));
    assert.ok(blocked.reasons.includes("APPROVED_INTENT_MISSING"));
    assert.ok(blocked.reasons.includes("PILOT_SYMBOL_MISSING"));
    assert.ok(blocked.reasons.includes("PILOT_MAX_NOTIONAL_INVALID"));

    const allowed = evaluateKrakenLivePilotGate({
      env: approvedEnv(intent),
      role: "OWNER",
      account: fullAccessAccount(),
      intent,
    });
    assert.equal(allowed.allowed, true);
    assert.deepEqual(allowed.reasons, []);
  });

  it("rejects ADMIN, read-only account, wrong intent, wrong symbol, and cap above hard maximum", () => {
    const intent = readyIntent();

    assert.ok(evaluateKrakenLivePilotGate({
      env: approvedEnv(intent),
      role: "ADMIN",
      account: fullAccessAccount(),
      intent,
    }).reasons.includes("NOT_OWNER"));

    assert.ok(evaluateKrakenLivePilotGate({
      env: approvedEnv(intent),
      role: "OWNER",
      account: readOnlyAccount(),
      intent,
    }).reasons.includes("ACCOUNT_NOT_FULL_ACCESS"));

    assert.ok(evaluateKrakenLivePilotGate({
      env: { ...approvedEnv(intent), CRYPTO_EDGE_KRAKEN_LIVE_PILOT_INTENT_ID: "other" },
      role: "OWNER",
      account: fullAccessAccount(),
      intent,
    }).reasons.includes("INTENT_NOT_APPROVED"));

    assert.ok(evaluateKrakenLivePilotGate({
      env: { ...approvedEnv(intent), CRYPTO_EDGE_KRAKEN_LIVE_PILOT_SYMBOL: "PF_XBTUSD" },
      role: "OWNER",
      account: fullAccessAccount(),
      intent,
    }).reasons.includes("SYMBOL_NOT_APPROVED"));

    assert.ok(evaluateKrakenLivePilotGate({
      env: {
        ...approvedEnv(intent),
        CRYPTO_EDGE_KRAKEN_LIVE_PILOT_MAX_NOTIONAL_USD: String(HARD_MAX_KRAKEN_LIVE_PILOT_NOTIONAL_USD + 0.01),
      },
      role: "OWNER",
      account: fullAccessAccount(),
      intent,
    }).reasons.includes("PILOT_MAX_NOTIONAL_ABOVE_HARD_CAP"));
  });
});

describe("Kraken live pilot request construction", () => {
  it("caps the real-sized ETH intent to the pilot notional and keeps deterministic cliOrdId", () => {
    const intent = readyIntent();
    const plan = buildKrakenLivePilotEntryPlan(intent, 10);

    assert.equal(plan.request.symbol, "PF_ETHUSD");
    assert.equal(plan.request.side, "buy");
    assert.equal(plan.request.orderType, "mkt");
    assert.equal(plan.request.reduceOnly, false);
    assert.equal(plan.pilot_quantity, 0.003);
    assert.ok(plan.estimated_pilot_notional_usd <= 10);
    assert.ok(plan.source_quantity > plan.pilot_quantity);

    const again = buildKrakenLivePilotEntryPlan(intent, 10);
    assert.equal(again.request.cliOrdId, plan.request.cliOrdId);
    assert.match(plan.request.cliOrdId, /^ce-entry-[0-9a-f]{24}$/);
  });

  it("builds reduce-only mark-triggered SL and TP only for actually filled quantity", () => {
    const exits = buildKrakenProtectiveExitPlan(readyIntent(), 0.0037);

    assert.equal(exits.filled_quantity, 0.003);
    assert.equal(exits.stop_loss.side, "sell");
    assert.equal(exits.stop_loss.orderType, "stp");
    assert.equal(exits.stop_loss.stopPrice, 2667.2);
    assert.equal(exits.stop_loss.triggerSignal, "mark");
    assert.equal(exits.stop_loss.reduceOnly, true);

    assert.equal(exits.take_profit.side, "sell");
    assert.equal(exits.take_profit.orderType, "take_profit");
    assert.equal(exits.take_profit.stopPrice, 3044.5);
    assert.equal(exits.take_profit.triggerSignal, "mark");
    assert.equal(exits.take_profit.reduceOnly, true);
    assert.equal(exits.peer_cancel_required_after_first_fill, true);
  });
});

describe("Kraken private sendorder transport", () => {
  it("POSTs exactly URL-encoded body, signs that exact encoded body, and normalizes placed response", async () => {
    const secret = Buffer.from("test-secret-key-material").toString("base64");
    const credentialSource = createEnvironmentKrakenFuturesCredentialSource({
      CRYPTO_EDGE_KRAKEN_FUTURES_API_KEY: "test-public-key",
      CRYPTO_EDGE_KRAKEN_FUTURES_API_SECRET: secret,
    });

    let seenUrl = "";
    let seenInit: RequestInit | undefined;

    const transport = createKrakenLiveOrderTransport({
      credentialSource,
      now: () => new Date("2026-10-05T08:00:00.000Z"),
      processBeforeMs: 5_000,
      fetchImpl: async (input, init) => {
        seenUrl = String(input);
        seenInit = init;
        return new Response(JSON.stringify({
          result: "success",
          serverTime: "2026-10-05T08:00:00.100Z",
          sendStatus: {
            status: "placed",
            order_id: "11111111-2222-3333-4444-555555555555",
          },
        }), { status: 200, headers: { "content-type": "application/json" } });
      },
    });

    const request = buildKrakenLivePilotEntryPlan(readyIntent(), 10).request;
    const result = await transport.submit(request);

    assert.equal(seenUrl, KRAKEN_FUTURES_SEND_ORDER_URL);
    assert.equal(seenInit?.method, "POST");

    const expectedBody = encodeKrakenSendOrderPostData({
      ...request,
      processBefore: "2026-10-05T08:00:05.000Z",
    });
    assert.equal(seenInit?.body, expectedBody);

    const headers = seenInit?.headers as Record<string, string>;
    assert.equal(headers.APIKey, "test-public-key");
    assert.equal(
      headers.Authent,
      createKrakenFuturesAuthent(secret, KRAKEN_FUTURES_SEND_ORDER_PATH, expectedBody),
    );
    assert.equal(result.status, "PLACED");
    assert.equal(result.provider_status, "placed");
    assert.equal(result.order_id, "11111111-2222-3333-4444-555555555555");
  });

  it("treats Kraken result=success with non-placed sendStatus as rejected", async () => {
    const credentialSource = createEnvironmentKrakenFuturesCredentialSource({
      CRYPTO_EDGE_KRAKEN_FUTURES_API_KEY: "key",
      CRYPTO_EDGE_KRAKEN_FUTURES_API_SECRET: Buffer.from("secret").toString("base64"),
    });
    const transport = createKrakenLiveOrderTransport({
      credentialSource,
      fetchImpl: async () => new Response(JSON.stringify({
        result: "success",
        serverTime: "2026-10-05T08:00:00.100Z",
        sendStatus: { status: "insufficientAvailableFunds" },
      }), { status: 200 }),
    });

    const result = await transport.submit(buildKrakenLivePilotEntryPlan(readyIntent(), 10).request);
    assert.equal(result.status, "PROVIDER_REJECTED");
    assert.equal(result.provider_status, "insufficientAvailableFunds");
  });
});

describe("Kraken live execution service idempotency", () => {
  it("never touches transport while execution flag is OFF", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "kraken-live-off-"));
    const ledger = await createKrakenExecutionLedger({ databaseFilePath: resolve(root, "ledger.sqlite") });
    let calls = 0;
    const transport: KrakenLiveOrderTransport = {
      async submit() {
        calls += 1;
        return placedTransportResult();
      },
    };

    try {
      const service = createKrakenLiveExecutionService({
        env: {
          ...approvedEnv(readyIntent()),
          CRYPTO_EDGE_EXECUTION: "0",
        },
        ledger,
        transport,
      });

      const result = await service.execute({
        role: "OWNER",
        account: fullAccessAccount(),
        intent: readyIntent(),
      });

      assert.equal(result.status, "BLOCKED");
      assert.equal(calls, 0);
      assert.equal(ledger.get(readyIntent().intent_id), null);
    } finally {
      ledger.close();
    }
  });

  it("submits at most once for an approved intent and blocks duplicate retries persistently", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "kraken-live-once-"));
    const path = resolve(root, "ledger.sqlite");
    const ledger = await createKrakenExecutionLedger({ databaseFilePath: path });
    let calls = 0;
    const transport: KrakenLiveOrderTransport = {
      async submit() {
        calls += 1;
        return placedTransportResult();
      },
    };

    const intent = readyIntent();
    try {
      const service = createKrakenLiveExecutionService({
        env: approvedEnv(intent),
        ledger,
        transport,
      });

      const first = await service.execute({
        role: "OWNER",
        account: fullAccessAccount(),
        intent,
      });
      assert.equal(first.status, "PLACED");
      assert.equal(calls, 1);
      if (first.status !== "PLACED") throw new Error("expected placed");
      assert.equal(first.ledger.status, "PLACED");

      const second = await service.execute({
        role: "OWNER",
        account: fullAccessAccount(),
        intent,
      });
      assert.equal(second.status, "DUPLICATE");
      assert.equal(calls, 1);
    } finally {
      ledger.close();
    }

    const reopened = await createKrakenExecutionLedger({ databaseFilePath: path });
    try {
      assert.equal(reopened.get(intent.intent_id)?.status, "PLACED");
    } finally {
      reopened.close();
    }
  });

  it("does not retry automatically after transport ambiguity and requires reconciliation", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "kraken-live-timeout-"));
    const ledger = await createKrakenExecutionLedger({ databaseFilePath: resolve(root, "ledger.sqlite") });
    let calls = 0;
    const transport: KrakenLiveOrderTransport = {
      async submit() {
        calls += 1;
        return {
          status: "TRANSPORT_ERROR",
          provider_status: null,
          order_id: null,
          server_time: null,
          error_code: "KRAKEN_LIVE_TRANSPORT_ERROR",
        };
      },
    };

    const intent = readyIntent();
    try {
      const service = createKrakenLiveExecutionService({
        env: approvedEnv(intent),
        ledger,
        transport,
      });

      const first = await service.execute({
        role: "OWNER",
        account: fullAccessAccount(),
        intent,
      });
      assert.equal(first.status, "FAILED");
      assert.equal(first.reconciliation_required, true);
      assert.equal(calls, 1);

      const second = await service.execute({
        role: "OWNER",
        account: fullAccessAccount(),
        intent,
      });
      assert.equal(second.status, "DUPLICATE");
      assert.equal(second.reconciliation_required, true);
      assert.equal(calls, 1);
    } finally {
      ledger.close();
    }
  });
});

function readyIntent(): KrakenOrderIntent {
  return {
    schema_version: "crypto_edge_kraken_order_intent_v1",
    mode: "DRY_RUN",
    status: "READY",
    reason_codes: [],
    intent_id: "ki_a9f5c8e1e7ae895890fe09c3b9e69cc0",
    signal_id: "acc1246441380-j-1790928000-BUY-MARKET",
    source_symbol: "ETHUSD",
    kraken_symbol: "PF_ETHUSD",
    side: "buy",
    order_type: "mkt",
    quantity: 0.662,
    quantity_step: 0.001,
    reference_price: 2742.6,
    limit_price: null,
    stop_loss_price: 2667.2,
    take_profit_price: 3044.5,
    planned_notional_usd: 1816.9468956196797,
    estimated_notional_usd: 1815.6012,
    effective_leverage: 0.18169468956196797,
    reduce_only: false,
    valid_for_seconds: null,
    source_prices: {
      entry_price: 2742.645,
      stop_loss: 2667.171,
      take_profit: 3044.542,
    },
  };
}

function approvedEnv(intent: KrakenOrderIntent): Record<string, string> {
  return {
    CRYPTO_EDGE_EXECUTION: "1",
    CRYPTO_EDGE_KRAKEN_LIVE_PILOT: "1",
    CRYPTO_EDGE_KRAKEN_MODE: "KRAKEN_LIVE",
    CRYPTO_EDGE_KRAKEN_LIVE_PILOT_INTENT_ID: intent.intent_id,
    CRYPTO_EDGE_KRAKEN_LIVE_PILOT_SYMBOL: intent.kraken_symbol,
    CRYPTO_EDGE_KRAKEN_LIVE_PILOT_MAX_NOTIONAL_USD: "10",
  };
}

function fullAccessAccount(): KrakenAccountSnapshot {
  return {
    schema_version: "crypto_edge_kraken_account_snapshot_v1",
    mode: "KRAKEN_LIVE",
    connection_status: "CONNECTED_FULL_ACCESS",
    equity_usd: 10_000,
    available_margin_usd: 9_000,
    portfolio_value_usd: 10_000,
    collateral_value_usd: 10_000,
    initial_margin_usd: 0,
    maintenance_margin_usd: 0,
    pnl_usd: 0,
    total_unrealized_usd: 0,
    permissions: { general: "FULL_ACCESS", transfer: "NO_ACCESS" },
    server_time: "2026-10-05T08:00:00.000Z",
    observed_at: "2026-10-05T08:00:00.000Z",
    source: "KRAKEN_FUTURES",
    execution_enabled: false,
  };
}

function readOnlyAccount(): KrakenAccountSnapshot {
  return {
    ...fullAccessAccount(),
    connection_status: "CONNECTED_READ_ONLY",
    permissions: { general: "READ_ONLY", transfer: "NO_ACCESS" },
  };
}

function placedTransportResult() {
  return {
    status: "PLACED" as const,
    provider_status: "placed",
    order_id: "11111111-2222-3333-4444-555555555555",
    server_time: "2026-10-05T08:00:00.100Z",
    error_code: null,
  };
}
