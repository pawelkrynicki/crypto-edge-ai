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
import { createKrakenExecutionLedger } from "../server/krakenExecutionLedger.js";
import { createKrakenLiveExecutionService } from "../server/krakenLiveExecutionService.js";
import type { KrakenLiveOrderTransport } from "../server/krakenLiveOrderTransport.js";
import {
  createKrakenOrderReconciliationTransport,
  encodeCliOrdIdStatusPostData,
  KRAKEN_FUTURES_ORDER_STATUS_PATH,
  KRAKEN_FUTURES_ORDER_STATUS_URL,
} from "../server/krakenOrderReconciliation.js";
import type { KrakenOrderIntent } from "../server/krakenOrderIntent.js";

describe("Kraken order reconciliation transport", () => {
  it("queries orders/status by exact cliOrdId and signs the exact encoded body", async () => {
    const secret = Buffer.from("reconciliation-secret").toString("base64");
    const credentialSource = createEnvironmentKrakenFuturesCredentialSource({
      CRYPTO_EDGE_KRAKEN_FUTURES_API_KEY: "reconciliation-key",
      CRYPTO_EDGE_KRAKEN_FUTURES_API_SECRET: secret,
    });

    let seenUrl = "";
    let seenInit: RequestInit | undefined;

    const transport = createKrakenOrderReconciliationTransport({
      credentialSource,
      fetchImpl: async (input, init) => {
        seenUrl = String(input);
        seenInit = init;
        return new Response(JSON.stringify({
          result: "success",
          serverTime: "2026-10-05T08:00:01.000Z",
          orders: [{
            order: {
              orderId: "11111111-2222-3333-4444-555555555555",
              cliOrdId: "ce-entry-abc123",
              symbol: "PF_ETHUSD",
              side: "buy",
              quantity: 0.003,
              filled: 0.003,
              reduceOnly: false,
            },
            status: "FILLED",
            error: null,
          }],
        }), { status: 200 });
      },
    });

    const result = await transport.queryByCliOrdId("ce-entry-abc123");
    const body = encodeCliOrdIdStatusPostData("ce-entry-abc123");

    assert.equal(seenUrl, KRAKEN_FUTURES_ORDER_STATUS_URL);
    assert.equal(seenInit?.method, "POST");
    assert.equal(seenInit?.body, body);

    const headers = seenInit?.headers as Record<string, string>;
    assert.equal(headers.APIKey, "reconciliation-key");
    assert.equal(
      headers.Authent,
      createKrakenFuturesAuthent(secret, KRAKEN_FUTURES_ORDER_STATUS_PATH, body),
    );

    assert.equal(result.status, "FOUND");
    if (result.status !== "FOUND") throw new Error("expected FOUND");
    assert.equal(result.cli_ord_id, "ce-entry-abc123");
    assert.equal(result.order_id, "11111111-2222-3333-4444-555555555555");
    assert.equal(result.provider_status, "FILLED");
    assert.equal(result.quantity, 0.003);
    assert.equal(result.filled, 0.003);
    assert.equal(result.symbol, "PF_ETHUSD");
    assert.equal(result.side, "buy");
  });

  it("returns NOT_FOUND without pretending that absence is proof that retry is safe", async () => {
    const credentialSource = createEnvironmentKrakenFuturesCredentialSource({
      CRYPTO_EDGE_KRAKEN_FUTURES_API_KEY: "key",
      CRYPTO_EDGE_KRAKEN_FUTURES_API_SECRET: Buffer.from("secret").toString("base64"),
    });
    const transport = createKrakenOrderReconciliationTransport({
      credentialSource,
      fetchImpl: async () => new Response(JSON.stringify({
        result: "success",
        serverTime: "2026-10-05T08:00:01.000Z",
        orders: [],
      }), { status: 200 }),
    });

    const result = await transport.queryByCliOrdId("ce-entry-missing");
    assert.equal(result.status, "NOT_FOUND");
  });
});

describe("Kraken execution service reconciliation", () => {
  it("keeps transport timeout non-retryable and can reconcile the reserved cliOrdId separately", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "kraken-reconcile-"));
    const ledger = await createKrakenExecutionLedger({ databaseFilePath: resolve(root, "ledger.sqlite") });
    const intent = readyIntent();
    let submitCalls = 0;
    let reconcileCalls = 0;

    const orderTransport: KrakenLiveOrderTransport = {
      async submit() {
        submitCalls += 1;
        return {
          status: "TRANSPORT_ERROR",
          provider_status: null,
          order_id: null,
          server_time: null,
          error_code: "KRAKEN_LIVE_TRANSPORT_ERROR",
        };
      },
    };

    const service = createKrakenLiveExecutionService({
      env: approvedEnv(intent),
      ledger,
      transport: orderTransport,
      reconciliationTransport: {
        async queryByCliOrdId(cliOrdId) {
          reconcileCalls += 1;
          return {
            status: "FOUND",
            cli_ord_id: cliOrdId,
            order_id: "11111111-2222-3333-4444-555555555555",
            provider_status: "FILLED",
            quantity: 0.003,
            filled: 0.003,
            symbol: "PF_ETHUSD",
            side: "buy",
            reduce_only: false,
            error: null,
            server_time: "2026-10-05T08:00:01.000Z",
          };
        },
      },
    });

    try {
      const first = await service.execute({
        role: "OWNER",
        account: fullAccessAccount(),
        intent,
      });
      assert.equal(first.status, "FAILED");
      assert.equal(first.reconciliation_required, true);
      assert.equal(submitCalls, 1);

      const reconciliation = await service.reconcile(intent.intent_id);
      assert.equal(reconcileCalls, 1);
      assert.equal(reconciliation.ledger?.status, "TRANSPORT_ERROR");
      assert.equal(reconciliation.reconciliation?.status, "FOUND");

      const second = await service.execute({
        role: "OWNER",
        account: fullAccessAccount(),
        intent,
      });
      assert.equal(second.status, "DUPLICATE");
      assert.equal(submitCalls, 1);
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
