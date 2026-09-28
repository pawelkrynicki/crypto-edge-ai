import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CRYPTO_EDGE_EQUITY_PLAN_SCHEMA_VERSION,
  planEquity,
  type EquityPlanAccount,
  type EquityPlanInput,
  type EquityPlanSignal,
} from "../src/trading/equityPlanner.js";

describe("planEquity", () => {
  it("scales planned notional 10x between a 10,000 USD and a 1,000 USD account with identical signal and risk pct when no cap binds", () => {
    const bigAccount = ownerAccount({ equity_usd: 10_000, max_leverage: 20 });
    const smallAccount = ownerAccount({ equity_usd: 1_000, max_leverage: 20 });
    const signal = buySignal();

    const bigPlan = planEquity({ account: bigAccount, signal });
    const smallPlan = planEquity({ account: smallAccount, signal });

    assert.equal(bigPlan.status, "READY");
    assert.equal(smallPlan.status, "READY");
    assert.equal(bigPlan.planned_notional_usd, smallPlan.planned_notional_usd * 10);
    assert.equal(bigPlan.planned_risk_usd, smallPlan.planned_risk_usd * 10);
    assert.equal(bigPlan.effective_leverage, smallPlan.effective_leverage);
  });

  it("plans a READY BUY position sized from risk percent and stop distance", () => {
    const plan = planEquity({ account: ownerAccount(), signal: buySignal() });

    assert.equal(plan.status, "READY");
    assert.deepEqual(plan.reason_codes, []);
    assert.equal(plan.requested_risk_usd, 100);
    assert.equal(plan.stop_distance_pct, 0.05);
    assert.equal(plan.risk_based_notional_usd, 2_000);
    assert.equal(plan.planned_notional_usd, 2_000);
    assert.equal(plan.planned_risk_usd, 100);
    assert.equal(plan.risk_utilization_pct, 100);
    assert.equal(plan.required_margin_usd, plan.planned_notional_usd / 20);
  });

  it("plans a READY SELL position with the inverted geometry", () => {
    const signal: EquityPlanSignal = { side: "SELL", entry_price: 100, stop_loss: 105, take_profit: 90 };
    const plan = planEquity({ account: ownerAccount(), signal });

    assert.equal(plan.status, "READY");
    assert.equal(plan.stop_distance_pct, 0.05);
    assert.equal(plan.planned_notional_usd, 2_000);
    assert.equal(plan.signal.side, "SELL");
  });

  it("produces a smaller notional for a wider stop distance at the same risk", () => {
    const tightStop = planEquity({ account: ownerAccount(), signal: buySignal({ stop_loss: 95 }) });
    const wideStop = planEquity({ account: ownerAccount(), signal: buySignal({ stop_loss: 80 }) });

    assert.ok(wideStop.stop_distance_pct > tightStop.stop_distance_pct);
    assert.ok(wideStop.planned_notional_usd < tightStop.planned_notional_usd);
    assert.equal(tightStop.planned_risk_usd, wideStop.planned_risk_usd);
  });

  it("reduces the plan under an available-margin cap and reports AVAILABLE_MARGIN_CAP", () => {
    const account = ownerAccount({ equity_usd: 10_000, max_leverage: 20, available_margin_usd: 50 });
    const plan = planEquity({ account, signal: buySignal() });

    assert.equal(plan.status, "REDUCED_BY_LIMIT");
    assert.deepEqual(plan.reason_codes, ["AVAILABLE_MARGIN_CAP"]);
    assert.equal(plan.planned_notional_usd, 1_000);
    assert.ok(plan.planned_risk_usd < plan.requested_risk_usd);
    assert.ok(plan.risk_utilization_pct !== null && plan.risk_utilization_pct < 100);
  });

  it("reduces the plan under a max-risk cap and reports MAX_RISK_CAP", () => {
    const account = ownerAccount({ max_risk_usd: 40 });
    const plan = planEquity({ account, signal: buySignal() });

    assert.equal(plan.status, "REDUCED_BY_LIMIT");
    assert.deepEqual(plan.reason_codes, ["MAX_RISK_CAP"]);
    assert.equal(plan.effective_risk_cap_usd, 40);
    assert.equal(plan.risk_based_notional_usd, 800);
    assert.equal(plan.planned_notional_usd, 800);
    assert.equal(plan.planned_risk_usd, 40);
  });

  it("reduces the plan under a max-position-notional cap and reports MAX_POSITION_NOTIONAL_CAP", () => {
    const account = ownerAccount({ max_position_notional_usd: 500 });
    const plan = planEquity({ account, signal: buySignal() });

    assert.equal(plan.status, "REDUCED_BY_LIMIT");
    assert.deepEqual(plan.reason_codes, ["MAX_POSITION_NOTIONAL_CAP"]);
    assert.equal(plan.planned_notional_usd, 500);
    assert.equal(plan.planned_risk_usd, 25);
  });

  it("does not report a cap that does not bind below the risk-based notional", () => {
    const account = ownerAccount({ max_position_notional_usd: 1_000_000, max_leverage: 20 });
    const plan = planEquity({ account, signal: buySignal() });

    assert.equal(plan.status, "READY");
    assert.deepEqual(plan.reason_codes, []);
  });

  it("blocks on invalid BUY price geometry", () => {
    const plan = planEquity({ account: ownerAccount(), signal: { side: "BUY", entry_price: 100, stop_loss: 110, take_profit: 120 } });

    assert.equal(plan.status, "BLOCKED");
    assert.deepEqual(plan.reason_codes, ["INVALID_PRICE_GEOMETRY"]);
    assert.equal(plan.planned_notional_usd, 0);
  });

  it("blocks on invalid SELL price geometry", () => {
    const plan = planEquity({ account: ownerAccount(), signal: { side: "SELL", entry_price: 100, stop_loss: 90, take_profit: 80 } });

    assert.equal(plan.status, "BLOCKED");
    assert.deepEqual(plan.reason_codes, ["INVALID_PRICE_GEOMETRY"]);
  });

  it("blocks on zero stop distance when entry equals stop loss", () => {
    const plan = planEquity({ account: ownerAccount(), signal: { side: "BUY", entry_price: 100, stop_loss: 100, take_profit: 120 } });

    assert.equal(plan.status, "BLOCKED");
    assert.deepEqual(plan.reason_codes, ["ZERO_STOP_DISTANCE"]);
    assert.equal(plan.planned_notional_usd, 0);
  });

  it("blocks with a zero position when available margin is zero", () => {
    const account = ownerAccount({ available_margin_usd: 0 });
    const plan = planEquity({ account, signal: buySignal() });

    assert.equal(plan.status, "BLOCKED");
    assert.ok(plan.reason_codes.includes("ZERO_PLANNED_NOTIONAL"));
    assert.equal(plan.planned_notional_usd, 0);
  });

  it("blocks on non-finite and non-positive account inputs", () => {
    assert.equal(planEquity({ account: ownerAccount({ equity_usd: 0 }), signal: buySignal() }).status, "BLOCKED");
    assert.equal(planEquity({ account: ownerAccount({ equity_usd: -10 }), signal: buySignal() }).status, "BLOCKED");
    assert.equal(planEquity({ account: ownerAccount({ equity_usd: NaN }), signal: buySignal() }).status, "BLOCKED");
    assert.equal(planEquity({ account: ownerAccount({ equity_usd: Infinity }), signal: buySignal() }).status, "BLOCKED");
    assert.equal(planEquity({ account: ownerAccount({ risk_pct_per_trade: 0 }), signal: buySignal() }).status, "BLOCKED");
    assert.equal(planEquity({ account: ownerAccount({ max_leverage: 0.5 }), signal: buySignal() }).status, "BLOCKED");
    assert.deepEqual(
      planEquity({ account: ownerAccount({ equity_usd: 0 }), signal: buySignal() }).reason_codes,
      ["INVALID_EQUITY_USD"],
    );
  });

  it("handles a tiny account without inventing an exchange minimum size", () => {
    const account = ownerAccount({ equity_usd: 1, max_leverage: 3 });
    const plan = planEquity({ account, signal: buySignal() });

    assert.equal(plan.status, "READY");
    assert.ok(plan.planned_notional_usd > 0);
    assert.ok(Number.isFinite(plan.planned_notional_usd));
  });

  it("never returns NaN or Infinity across a sweep of valid and invalid inputs", () => {
    const scenarios: EquityPlanInput[] = [
      { account: ownerAccount(), signal: buySignal() },
      { account: ownerAccount({ equity_usd: -1 }), signal: buySignal() },
      { account: ownerAccount({ available_margin_usd: 0 }), signal: buySignal() },
      { account: ownerAccount({ max_risk_usd: 1 }), signal: buySignal() },
      { account: ownerAccount(), signal: { side: "BUY", entry_price: 100, stop_loss: 100, take_profit: 100 } },
      { account: ownerAccount({ equity_usd: 0.0001 }), signal: buySignal() },
    ];

    for (const scenario of scenarios) {
      const plan = planEquity(scenario);
      for (const [key, value] of Object.entries(plan)) {
        if (typeof value === "number") {
          assert.ok(Number.isFinite(value), `${key} was not finite: ${value}`);
        }
      }
    }
  });

  it("does not mutate the account or signal input", () => {
    const account = ownerAccount();
    const signal = buySignal();
    const accountBefore = structuredClone(account);
    const signalBefore = structuredClone(signal);

    planEquity({ account, signal });

    assert.deepEqual(account, accountBefore);
    assert.deepEqual(signal, signalBefore);
  });

  it("is deterministic for the same input", () => {
    const account = ownerAccount();
    const signal = buySignal();

    assert.deepEqual(planEquity({ account, signal }), planEquity({ account, signal }));
  });

  it("uses the explicit equity plan schema version", () => {
    const plan = planEquity({ account: ownerAccount(), signal: buySignal() });

    assert.equal(plan.schema_version, CRYPTO_EDGE_EQUITY_PLAN_SCHEMA_VERSION);
  });

  it("echoes account mode and does not compute a Kraken order quantity", () => {
    const simulated = planEquity({ account: ownerAccount({ account_mode: "SIMULATED" }), signal: buySignal() });
    const live = planEquity({ account: ownerAccount({ account_mode: "KRAKEN_LIVE" }), signal: buySignal() });

    assert.equal(simulated.account_mode, "SIMULATED");
    assert.equal(live.account_mode, "KRAKEN_LIVE");
    assert.equal("kraken_order_quantity" in simulated, false);
    assert.equal("order_quantity" in simulated, false);
  });
});

function ownerAccount(overrides: Partial<EquityPlanAccount> = {}): EquityPlanAccount {
  return {
    account_mode: "SIMULATED",
    equity_usd: 10_000,
    available_margin_usd: null,
    risk_pct_per_trade: 1,
    max_leverage: 20,
    ...overrides,
  };
}

function buySignal(overrides: Partial<EquityPlanSignal> = {}): EquityPlanSignal {
  return {
    side: "BUY",
    entry_price: 100,
    stop_loss: 95,
    take_profit: 120,
    ...overrides,
  };
}
