import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { createServer } from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import { planEquity } from "../../data-poc/src/trading/equityPlanner.js";
import type { AxiCryptoSignal } from "../server/axiCryptoSignalContract.js";
import { createAxiSignalRepository } from "../server/axiSignalRepository.js";
import type { KrakenAccountSnapshot } from "../server/krakenAccount.js";
import { createKrakenCopyProfileRepository } from "../server/krakenCopyProfileRepository.js";
import {
  createStaticKrakenInstrumentSource,
  type KrakenInstrumentFacts,
} from "../server/krakenInstrumentAdapter.js";
import { buildKrakenOrderIntent } from "../server/krakenOrderIntent.js";
import { createScannerApiHandler } from "../server/scannerApiHandler.js";

const TOKEN = "kraken-live-preflight-token";
const EXPECTED_INTENT_ID = expectedIntentId();

describe("Kraken live pilot preflight API", () => {
  it("is read-only, OWNER-only, computes capped pilot request, and remains blocked while execution flag is OFF", async () => {
    const api = await startApi({ role: "OWNER" });
    try {
      await ingest(api.base, realEthSignal());

      const response = await fetch(
        api.base + "/api/v1/trading/signals/acc1246441380-j-1790928000-BUY-MARKET/kraken-live-pilot-plan",
      );
      assert.equal(response.status, 200);
      const body = await response.json() as any;

      assert.equal(body.schema_version, "crypto_edge_kraken_live_pilot_preflight_v1");
      assert.equal(body.mode, "PREFLIGHT_ONLY");
      assert.equal(body.order_intent.intent_id, EXPECTED_INTENT_ID);
      assert.equal(body.order_intent.status, "READY");
      assert.equal(body.live_gate.allowed, false);
      assert.deepEqual(body.live_gate.reasons, ["EXECUTION_FLAG_OFF"]);
      assert.equal(body.pilot_plan.pilot_max_notional_usd, 10);
      assert.equal(body.pilot_plan.pilot_quantity, 0.003);
      assert.ok(body.pilot_plan.estimated_pilot_notional_usd <= 10);
      assert.equal(body.pilot_plan.request.symbol, "PF_ETHUSD");
      assert.equal(body.pilot_plan.request.side, "buy");
      assert.equal(body.pilot_plan.request.orderType, "mkt");
      assert.equal(body.submission_route_exposed, false);
      assert.equal(body.execution_submitted, false);

      const post = await fetch(
        api.base + "/api/v1/trading/signals/acc1246441380-j-1790928000-BUY-MARKET/kraken-live-pilot-plan",
        { method: "POST" },
      );
      assert.equal(post.status, 405);
    } finally {
      await api.close();
    }
  });

  it("denies ADMIN even though normal Kraken Copy read surfaces allow ADMIN", async () => {
    const api = await startApi({ role: "ADMIN" });
    try {
      await ingest(api.base, realEthSignal());
      const response = await fetch(
        api.base + "/api/v1/trading/signals/acc1246441380-j-1790928000-BUY-MARKET/kraken-live-pilot-plan",
      );
      assert.equal(response.status, 403);
      assert.equal((await response.json() as any).error, "kraken_live_pilot_forbidden");
    } finally {
      await api.close();
    }
  });
});

type Api = { base: string; close: () => Promise<void> };

async function startApi(options: {
  role: "OWNER" | "ADMIN";
}): Promise<Api> {
  const root = await mkdtemp(resolve(tmpdir(), "crypto-edge-live-preflight-"));
  const axiRepository = await createAxiSignalRepository({ databaseFilePath: resolve(root, "axi.sqlite") });
  const profileRepository = await createKrakenCopyProfileRepository({
    databaseFilePath: resolve(root, "profiles.sqlite"),
    now: () => new Date("2026-10-05T08:00:00.000Z"),
  });

  const accountSource = {
    mode: "KRAKEN_LIVE" as const,
    getSnapshot: async (): Promise<KrakenAccountSnapshot> => fullAccessAccount(),
  };

  const accountEnvironment = {
    CRYPTO_EDGE_EXECUTION: "0",
    CRYPTO_EDGE_KRAKEN_LIVE_PILOT: "1",
    CRYPTO_EDGE_KRAKEN_MODE: "KRAKEN_LIVE",
    CRYPTO_EDGE_KRAKEN_LIVE_PILOT_INTENT_ID: EXPECTED_INTENT_ID,
    CRYPTO_EDGE_KRAKEN_LIVE_PILOT_SYMBOL: "PF_ETHUSD",
    CRYPTO_EDGE_KRAKEN_LIVE_PILOT_MAX_NOTIONAL_USD: "10",
  };

  const server = createServer(createScannerApiHandler({
    runtimeMode: "DEVELOPMENT_DEMO",
    lifecycle: {
      defaultSessionRole: options.role,
      campIdentityRegistryPath: resolve(root, "camp-identities.json"),
    },
    axiSignals: {
      repository: axiRepository,
      token: TOKEN,
      featureFlagEnvironment: { CRYPTO_EDGE_AXI_SIGNALS: "1" },
    },
    krakenCopy: {
      accountSource,
      instrumentSource: createStaticKrakenInstrumentSource([ethInstrument()]),
      profileRepository,
      featureFlagEnvironment: { CRYPTO_EDGE_KRAKEN: "1" },
      accountEnvironment,
    },
  }));

  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  return {
    base: "http://127.0.0.1:" + (server.address() as AddressInfo).port,
    close: async () => {
      await new Promise<void>((resolveClose, rejectClose) =>
        server.close((error) => error ? rejectClose(error) : resolveClose()));
      axiRepository.close();
      profileRepository.close();
    },
  };
}

async function ingest(base: string, signal: AxiCryptoSignal): Promise<void> {
  const response = await fetch(base + "/api/v1/trading/signals/axi", {
    method: "POST",
    headers: { authorization: "Bearer " + TOKEN, "content-type": "application/json" },
    body: JSON.stringify(signal),
  });
  assert.equal(response.status, 201);
}

function realEthSignal(): AxiCryptoSignal {
  return {
    schema_version: "axi_crypto_signal_v1",
    event_type: "SIGNAL_CREATED",
    signal_id: "acc1246441380-j-1790928000-BUY-MARKET",
    source: {
      provider: "AXI",
      engine: "ALLinCrypto Engine",
      engine_version: "1.00",
      strategy_version: "1.00",
      terminal_id: "ACC1246441380",
    },
    setup: {
      setup_id: "J",
      setup_name: "Pullback EMA50",
      timeframe: "H4",
      family: "ENGINE",
      max_hold_seconds: 14 * 24 * 60 * 60,
    },
    trade: {
      symbol: "ETHUSD",
      side: "BUY",
      order_type: "MARKET",
      source_signal_time: "2026-10-02T15:00:00.000Z",
      source_time_basis: "AXI_SERVER",
      entry_price: 2742.645,
      stop_loss: 2667.171,
      take_profit: 3044.542,
      rr: 4,
      cancel_price: null,
      valid_for_seconds: null,
    },
  };
}

function ethInstrument(): KrakenInstrumentFacts {
  return {
    source_symbol: "ETHUSD",
    kraken_symbol: "PF_ETHUSD",
    type: "flexible_futures",
    tradeable: true,
    base: "ETH",
    quote: "USD",
    tick_size: 0.1,
    contract_size: 1,
    contract_value_trade_precision: 3,
    quantity_step: 0.001,
    max_position_size: 21_000,
  };
}

function expectedIntentId(): string {
  const signal = realEthSignal();
  const account = fullAccessAccount();
  const plan = planEquity({
    account: {
      account_mode: "KRAKEN_LIVE",
      equity_usd: account.equity_usd as number,
      available_margin_usd: account.available_margin_usd,
      risk_pct_per_trade: 0.5,
      max_leverage: 1,
      max_position_notional_usd: null,
    },
    signal: {
      side: signal.trade.side,
      entry_price: signal.trade.entry_price,
      stop_loss: signal.trade.stop_loss,
      take_profit: signal.trade.take_profit,
    },
  });
  return buildKrakenOrderIntent({ signal, plan, instrument: ethInstrument() }).intent_id;
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
