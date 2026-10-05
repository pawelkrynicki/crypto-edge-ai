import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { createServer } from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import type { EquityPlan } from "../../data-poc/src/trading/equityPlanner.js";
import type { AxiCryptoSignal } from "../server/axiCryptoSignalContract.js";
import { createAxiSignalRepository } from "../server/axiSignalRepository.js";
import type { KrakenAccountSnapshot } from "../server/krakenAccount.js";
import { createKrakenCopyProfileRepository } from "../server/krakenCopyProfileRepository.js";
import {
  createKrakenPublicInstrumentSource,
  createStaticKrakenInstrumentSource,
  KrakenInstrumentError,
  mapSourceSymbolToKrakenFlexibleFutures,
  quantityStepFromPrecision,
  type KrakenInstrumentFacts,
} from "../server/krakenInstrumentAdapter.js";
import {
  alignDown,
  alignNearest,
  alignUp,
  buildKrakenOrderIntent,
  roundDownToStep,
} from "../server/krakenOrderIntent.js";
import { createScannerApiHandler } from "../server/scannerApiHandler.js";

const TOKEN = "kraken-executor-dry-run-token";
const OBSERVED_AT = "2026-09-30T15:00:01.000Z";

describe("Kraken instrument adapter", () => {
  it("maps the current Engine symbols to Kraken flexible futures", () => {
    assert.equal(mapSourceSymbolToKrakenFlexibleFutures("BTCUSD"), "PF_XBTUSD");
    assert.equal(mapSourceSymbolToKrakenFlexibleFutures("ETHUSD"), "PF_ETHUSD");
    assert.equal(mapSourceSymbolToKrakenFlexibleFutures("SOL-USD"), "PF_SOLUSD");
  });

  it("rejects unsupported symbols instead of guessing", () => {
    assert.throws(
      () => mapSourceSymbolToKrakenFlexibleFutures("DOGEUSD"),
      (error) => error instanceof KrakenInstrumentError
        && error.code === "KRAKEN_INSTRUMENT_SOURCE_SYMBOL_UNSUPPORTED",
    );
  });

  it("derives the quantity step from Kraken trade precision", () => {
    assert.equal(quantityStepFromPrecision(4), 0.0001);
    assert.equal(quantityStepFromPrecision(3), 0.001);
    assert.equal(quantityStepFromPrecision(2), 0.01);
  });

  it("normalizes public flexible-futures instrument facts", async () => {
    const source = createKrakenPublicInstrumentSource({
      fetchImpl: async () => new Response(JSON.stringify({
        instruments: [{
          symbol: "PF_ETHUSD",
          type: "flexible_futures",
          tradeable: true,
          base: "ETH",
          quote: "USD",
          tickSize: 0.1,
          contractSize: 1,
          contractValueTradePrecision: 3,
          maxPositionSize: 21000,
        }],
      }), { status: 200 }),
    });
    assert.deepEqual(await source.getInstrument("ETHUSD"), ethInstrument());
  });

  it("fails closed on malformed instrument data and wrong product type", async () => {
    const malformed = createKrakenPublicInstrumentSource({
      fetchImpl: async () => new Response(JSON.stringify({
        instruments: [{ symbol: "PF_ETHUSD", type: "flexible_futures" }],
      }), { status: 200 }),
    });
    await assert.rejects(
      () => malformed.getInstrument("ETHUSD"),
      (error) => error instanceof KrakenInstrumentError
        && error.code === "KRAKEN_INSTRUMENT_RESPONSE_INVALID",
    );

    const wrongType = createKrakenPublicInstrumentSource({
      fetchImpl: async () => new Response(JSON.stringify({
        instruments: [{
          symbol: "PF_ETHUSD",
          type: "futures_inverse",
          tradeable: true,
          base: "ETH",
          quote: "USD",
          tickSize: 0.1,
          contractSize: 1,
          contractValueTradePrecision: 3,
        }],
      }), { status: 200 }),
    });
    await assert.rejects(
      () => wrongType.getInstrument("ETHUSD"),
      (error) => error instanceof KrakenInstrumentError
        && error.code === "KRAKEN_INSTRUMENT_NOT_FLEXIBLE_FUTURES",
    );
  });
});

describe("Kraken order intent DRY-RUN", () => {
  it("builds a deterministic intent for the real J/ETHUSD source geometry", () => {
    const plan = equityPlanForRealSignal();
    const intent = buildKrakenOrderIntent({
      signal: realEthSignal(),
      plan,
      instrument: ethInstrument(),
    });

    assert.equal(intent.mode, "DRY_RUN");
    assert.equal(intent.status, "READY");
    assert.equal(intent.signal_id, "real-j-ethusd-0001");
    assert.equal(intent.kraken_symbol, "PF_ETHUSD");
    assert.equal(intent.side, "buy");
    assert.equal(intent.order_type, "mkt");
    assert.equal(intent.quantity_step, 0.001);
    assert.ok(intent.quantity > 0);
    assert.ok(intent.estimated_notional_usd <= plan.planned_notional_usd);
    assert.equal(intent.stop_loss_price, 2652.2);
    assert.equal(intent.take_profit_price, 3047.7);
    assert.match(intent.intent_id, /^ki_[0-9a-f]{32}$/);
  });

  it("returns the same intent id for the same logical order", () => {
    const input = {
      signal: realEthSignal(),
      plan: equityPlanForRealSignal(),
      instrument: ethInstrument(),
    };
    assert.equal(buildKrakenOrderIntent(input).intent_id, buildKrakenOrderIntent(input).intent_id);
  });

  it("changes intent id when planned position size changes", () => {
    const signal = realEthSignal();
    const instrument = ethInstrument();
    const first = buildKrakenOrderIntent({
      signal,
      instrument,
      plan: equityPlanForRealSignal({ planned_notional_usd: 1000 }),
    });
    const second = buildKrakenOrderIntent({
      signal,
      instrument,
      plan: equityPlanForRealSignal({ planned_notional_usd: 2000 }),
    });
    assert.notEqual(first.intent_id, second.intent_id);
  });

  it("blocks a blocked Equity Plan", () => {
    const intent = buildKrakenOrderIntent({
      signal: realEthSignal(),
      instrument: ethInstrument(),
      plan: equityPlanForRealSignal({ status: "BLOCKED", planned_notional_usd: 0 }),
    });
    assert.equal(intent.status, "BLOCKED");
    assert.deepEqual(intent.reason_codes, ["EQUITY_PLAN_BLOCKED"]);
  });

  it("blocks untradeable, mismatched, zero-rounded, and max-position cases", () => {
    const signal = realEthSignal();
    const plan = equityPlanForRealSignal();

    assert.deepEqual(
      buildKrakenOrderIntent({ signal, plan, instrument: ethInstrument({ tradeable: false }) }).reason_codes,
      ["KRAKEN_INSTRUMENT_NOT_TRADEABLE"],
    );
    assert.deepEqual(
      buildKrakenOrderIntent({ signal, plan, instrument: ethInstrument({ source_symbol: "BTCUSD" }) }).reason_codes,
      ["KRAKEN_INSTRUMENT_SYMBOL_MISMATCH"],
    );
    assert.deepEqual(
      buildKrakenOrderIntent({
        signal,
        plan: equityPlanForRealSignal({ planned_notional_usd: 0.1 }),
        instrument: ethInstrument(),
      }).reason_codes,
      ["KRAKEN_QUANTITY_ROUNDED_TO_ZERO"],
    );
    assert.deepEqual(
      buildKrakenOrderIntent({
        signal,
        plan,
        instrument: ethInstrument({ max_position_size: 0.01 }),
      }).reason_codes,
      ["KRAKEN_MAX_POSITION_SIZE_EXCEEDED"],
    );
  });

  it("uses directional tick alignment that never worsens source risk", () => {
    assert.equal(alignUp(2652.118, 0.1), 2652.2);
    assert.equal(alignDown(3047.702, 0.1), 3047.7);
    assert.equal(alignNearest(2731.235, 0.1), 2731.2);
    assert.equal(roundDownToStep(0.63299, 0.001), 0.632);
  });
});

describe("Kraken Executor DRY-RUN API", () => {
  it("chains stored Engine signal -> Equity Planner -> instrument -> order intent with no submission", async () => {
    const api = await startApi();
    try {
      await ingest(api.base, realEthSignal());
      const session = await profileGet(api.base);
      const first = await intentGet(api.base, session.cookie, "real-j-ethusd-0001");

      assert.equal(first.response.status, 200);
      assert.equal(first.body.schema_version, "crypto_edge_kraken_executor_dry_run_v1");
      assert.equal(first.body.mode, "DRY_RUN");
      assert.equal(first.body.signal_id, "real-j-ethusd-0001");
      assert.equal(first.body.instrument.kraken_symbol, "PF_ETHUSD");
      assert.equal(first.body.order_intent.status, "READY");
      assert.equal(first.body.order_intent.kraken_symbol, "PF_ETHUSD");
      assert.equal(first.body.order_intent.side, "buy");
      assert.equal(first.body.execution_submitted, false);
      assert.equal(first.body.execution_boundary, "NO_KRAKEN_ORDER_SUBMISSION");

      const second = await intentGet(api.base, session.cookie, "real-j-ethusd-0001");
      assert.equal(second.body.order_intent.intent_id, first.body.order_intent.intent_id);
      assert.equal(second.body.order_intent.quantity, first.body.order_intent.quantity);
    } finally {
      await api.close();
    }
  });

  it("is OWNER/ADMIN only and GET only", async () => {
    for (const role of ["OWNER", "ADMIN"] as const) {
      const api = await startApi({ role });
      try {
        await ingest(api.base, realEthSignal());
        const session = await profileGet(api.base);
        assert.equal((await intentGet(api.base, session.cookie, "real-j-ethusd-0001")).response.status, 200);
      } finally { await api.close(); }
    }

    for (const role of ["CAMP_USER", "TRUSTED_TESTER"] as const) {
      const api = await startApi({ role });
      try {
        await ingest(api.base, realEthSignal());
        const response = await fetch(api.base + "/api/v1/trading/signals/real-j-ethusd-0001/kraken-order-intent");
        assert.equal(response.status, 403);
      } finally { await api.close(); }
    }

    const api = await startApi();
    try {
      await ingest(api.base, realEthSignal());
      const session = await profileGet(api.base);
      const response = await fetch(
        api.base + "/api/v1/trading/signals/real-j-ethusd-0001/kraken-order-intent",
        { method: "POST", headers: { cookie: session.cookie } },
      );
      assert.equal(response.status, 405);
    } finally { await api.close(); }
  });

  it("fails closed for unsupported source symbols", async () => {
    const api = await startApi();
    try {
      await ingest(api.base, {
        ...realEthSignal(),
        signal_id: "unsupported-doge-0001",
        trade: { ...realEthSignal().trade, symbol: "DOGEUSD" },
      });
      const session = await profileGet(api.base);
      const result = await intentGet(api.base, session.cookie, "unsupported-doge-0001");
      assert.equal(result.response.status, 422);
      assert.equal(result.body.error, "KRAKEN_INSTRUMENT_SOURCE_SYMBOL_UNSUPPORTED");
    } finally { await api.close(); }
  });
});

type Api = { base: string; close: () => Promise<void> };

async function startApi(options: {
  role?: "TRUSTED_TESTER" | "CAMP_USER" | "OWNER" | "ADMIN";
} = {}): Promise<Api> {
  const root = await mkdtemp(resolve(tmpdir(), "crypto-edge-kraken-executor-"));
  const axiRepository = await createAxiSignalRepository({ databaseFilePath: resolve(root, "axi.sqlite") });
  const profileRepository = await createKrakenCopyProfileRepository({
    databaseFilePath: resolve(root, "profiles.sqlite"),
    now: () => new Date(OBSERVED_AT),
  });

  const instrumentSource = createStaticKrakenInstrumentSource([
    ethInstrument(),
    btcInstrument(),
    solInstrument(),
  ]);

  const server = createServer(createScannerApiHandler({
    runtimeMode: "DEVELOPMENT_DEMO",
    lifecycle: {
      defaultSessionRole: options.role ?? "OWNER",
      campIdentityRegistryPath: resolve(root, "camp-identities.json"),
    },
    axiSignals: {
      repository: axiRepository,
      token: TOKEN,
      featureFlagEnvironment: { CRYPTO_EDGE_AXI_SIGNALS: "1" },
    },
    krakenCopy: {
      accountSource: { mode: "SIMULATED", getSnapshot: async () => simulatedSnapshot() },
      instrumentSource,
      profileRepository,
      featureFlagEnvironment: { CRYPTO_EDGE_KRAKEN: "1" },
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

async function profileGet(base: string): Promise<{ cookie: string }> {
  const response = await fetch(base + "/api/v1/trading/kraken/profile");
  assert.equal(response.status, 200);
  const cookie = response.headers.get("set-cookie")?.split(";", 1)[0];
  assert.ok(cookie);
  return { cookie };
}

async function intentGet(base: string, cookie: string, signalId: string): Promise<{
  response: Response;
  body: any;
}> {
  const response = await fetch(
    base + "/api/v1/trading/signals/" + encodeURIComponent(signalId) + "/kraken-order-intent",
    { headers: { cookie } },
  );
  return { response, body: await response.json() };
}

function realEthSignal(): AxiCryptoSignal {
  return {
    schema_version: "axi_crypto_signal_v1",
    event_type: "SIGNAL_CREATED",
    signal_id: "real-j-ethusd-0001",
    source: {
      provider: "AXI",
      engine: "ALLinCrypto Engine",
      engine_version: "1.00",
      strategy_version: "1.00",
      terminal_id: "ACC1",
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
      source_signal_time: "2026-09-30T15:00:00.000Z",
      source_time_basis: "AXI_SERVER",
      entry_price: 2731.235,
      stop_loss: 2652.118,
      take_profit: 3047.702,
      rr: 4,
      cancel_price: null,
      valid_for_seconds: null,
    },
  };
}

function equityPlanForRealSignal(overrides: Partial<EquityPlan> = {}): EquityPlan {
  const equity = 10_000;
  const riskPct = 0.5;
  const entry = 2731.235;
  const stop = 2652.118;
  const stopPct = (entry - stop) / entry;
  const requestedRisk = equity * riskPct / 100;
  const notional = requestedRisk / stopPct;

  return {
    schema_version: "crypto_edge_equity_plan_v1",
    status: "READY",
    reason_codes: [],
    account_mode: "SIMULATED",
    equity_usd: equity,
    risk_pct_per_trade: riskPct,
    requested_risk_usd: requestedRisk,
    effective_risk_cap_usd: requestedRisk,
    stop_distance_pct: stopPct,
    risk_based_notional_usd: notional,
    planned_notional_usd: notional,
    planned_risk_usd: requestedRisk,
    effective_leverage: notional / equity,
    required_margin_usd: notional,
    risk_utilization_pct: 100,
    signal: {
      side: "BUY",
      entry_price: entry,
      stop_loss: stop,
      take_profit: 3047.702,
    },
    ...overrides,
  };
}

function simulatedSnapshot(): KrakenAccountSnapshot {
  return {
    schema_version: "crypto_edge_kraken_account_snapshot_v1",
    mode: "SIMULATED",
    connection_status: "SIMULATED",
    equity_usd: 10_000,
    available_margin_usd: 10_000,
    portfolio_value_usd: null,
    collateral_value_usd: null,
    initial_margin_usd: null,
    maintenance_margin_usd: null,
    pnl_usd: null,
    total_unrealized_usd: null,
    permissions: null,
    server_time: null,
    observed_at: OBSERVED_AT,
    source: "CRYPTO_EDGE_SIMULATION",
    execution_enabled: false,
  };
}

function ethInstrument(overrides: Partial<KrakenInstrumentFacts> = {}): KrakenInstrumentFacts {
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
    ...overrides,
  };
}

function btcInstrument(): KrakenInstrumentFacts {
  return {
    source_symbol: "BTCUSD",
    kraken_symbol: "PF_XBTUSD",
    type: "flexible_futures",
    tradeable: true,
    base: "BTC",
    quote: "USD",
    tick_size: 1,
    contract_size: 1,
    contract_value_trade_precision: 4,
    quantity_step: 0.0001,
    max_position_size: 1200,
  };
}

function solInstrument(): KrakenInstrumentFacts {
  return {
    source_symbol: "SOL-USD",
    kraken_symbol: "PF_SOLUSD",
    type: "flexible_futures",
    tradeable: true,
    base: "SOL",
    quote: "USD",
    tick_size: 0.01,
    contract_size: 1,
    contract_value_trade_precision: 2,
    quantity_step: 0.01,
    max_position_size: 280_000,
  };
}
