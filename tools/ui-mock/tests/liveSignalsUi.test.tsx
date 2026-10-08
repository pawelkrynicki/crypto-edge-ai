import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import TestRenderer from "react-test-renderer";
import { getProductNavItemsForRole } from "../src/ProductApp.js";
import { LIVE_SIGNALS_POLL_INTERVAL_MS, LiveSignals } from "../src/components/LiveSignals.js";
import { ProductWorkspaceShell, type ProductNavItem } from "../src/components/ProductWorkspaceShell.js";
import { ProductLocaleProvider } from "../src/productI18n.js";
import {
  AxiSignalsDataSourceError,
  loadAxiSignalDetail,
  loadAxiSignals,
  type AxiSignalDetailRecord,
  type AxiSignalRecord,
} from "../src/services/axiSignalsDataSource.js";
import {
  loadSignalEquityPlan,
  type SignalEquityPlanResponse,
} from "../src/services/signalEquityPlanDataSource.js";
import type { AxiReferenceEquityCurve } from "../src/services/axiReferenceEquityDataSource.js";

void React;

const { act, create } = TestRenderer;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("01D Live Signals UI", () => {
  it("uses a two-second live poll so MARKET signals do not wait for the 15-minute product snapshot", () => {
    assert.equal(LIVE_SIGNALS_POLL_INTERVAL_MS, 2_000);
  });

  it("background polling refreshes signals and reference equity without a manual page refresh", async () => {
    let signalReads = 0;
    let equityReads = 0;
    const renderer = await renderLive({
      pollIntervalMs: 10,
      loadSignals: async () => {
        signalReads += 1;
        return [marketSignal()];
      },
      loadReferenceEquity: async () => {
        equityReads += 1;
        return referenceEquity();
      },
    });
    try {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 35));
      });
      assert.ok(signalReads >= 2, "signal feed should refresh in the background");
      assert.ok(equityReads >= 2, "reference equity should refresh in the background");
    } finally {
      await act(async () => { renderer.unmount(); });
    }
  });

  it("places Live Signals as the first Trading navigation item without changing existing sections", () => {
    const navItems: ProductNavItem[] = [
      { id: "candidate-results", label: "Radar", icon: "R", description: "Radar", groupLabel: "Product Flow" },
      { id: "candidate-detail", label: "Details", icon: "D", description: "Details", groupLabel: "Product Flow" },
      { id: "external-checks", label: "Verification", icon: "V", description: "Verification", groupLabel: "Research / verification" },
      { id: "live-signals", label: "Live Signals", icon: "L", description: "AXI feed", groupLabel: "Trading", groupDescription: "Read-only source signals" },
      { id: "methodology", label: "Methodology", icon: "M", description: "Methodology", groupLabel: "Status" },
      { id: "control-center", label: "Control Center", icon: "C", description: "Control", groupLabel: "Status" },
    ];
    const campVisible = getProductNavItemsForRole(navItems, "CAMP_USER");
    assert.deepEqual(campVisible.map((item) => item.id), ["candidate-results", "candidate-detail", "external-checks"]);

    const visible = getProductNavItemsForRole(navItems, "OWNER");
    assert.ok(visible.some((item) => item.id === "live-signals"));

    const markup = renderToStaticMarkup(
      <ProductLocaleProvider initialLocale="en">
        <ProductWorkspaceShell
          navItems={visible}
          activeSection="live-signals"
          onSectionChange={() => undefined}
          loading={false}
          runtimeMode="INTERNAL_BETA"
          resolvedSource="unavailable"
          runId={null}
          generatedAt={null}
          ageSeconds={null}
          freshnessStatus={null}
          viewRefreshedAt={null}
          sourceIds={[]}
          sourceHealth={{ status: "unavailable", detailSourceIds: [], basis: "unavailable" }}
          readiness={null}
          onRefresh={() => undefined}
        ><div /></ProductWorkspaceShell>
      </ProductLocaleProvider>,
    );
    assert.match(markup, /<section class="workspace-nav-group" aria-label="Trading">[\s\S]*?Live Signals/);
  });

  it("uses authenticated same-origin list and detail endpoints and validates source responses", async () => {
    let request: { url: string; init: RequestInit | undefined } | null = null;
    const records = await loadAxiSignals(50, async (url, init) => {
      request = { url: String(url), init };
      return jsonResponse({ schema_version: "axi_signal_list_v2", signals: [marketSignal()] });
    });

    assert.equal(records.length, 1);
    assert.deepEqual(request, {
      url: "/api/v1/trading/signals?limit=50",
      init: { method: "GET", credentials: "same-origin", headers: { accept: "application/json" } },
    });

    let detailRequest: { url: string; init: RequestInit | undefined } | null = null;
    const detail = await loadAxiSignalDetail("market-0001", async (url, init) => {
      detailRequest = { url: String(url), init };
      return jsonResponse({ schema_version: "axi_signal_detail_v2", ...marketDetail() });
    });
    assert.equal(detail.signal.signal_id, "market-0001");
    assert.deepEqual(detailRequest, {
      url: "/api/v1/trading/signals/market-0001",
      init: { method: "GET", credentials: "same-origin", headers: { accept: "application/json" } },
    });

    let planRequest: { url: string; init: RequestInit | undefined } | null = null;
    await loadSignalEquityPlan("market-0001", async (url, init) => {
      planRequest = { url: String(url), init };
      return jsonResponse(equityPlan());
    });
    assert.deepEqual(planRequest, {
      url: "/api/v1/trading/signals/market-0001/equity-plan",
      init: { method: "GET", credentials: "same-origin", headers: { accept: "application/json" } },
    });
  });

  it("shows a personalized sizing plan separately from the source record and leaves that record visible when the plan fails", async () => {
    const record = marketSignal();
    const ready = await renderLive({
      loadSignals: async () => [record],
      loadSignalDetail: async () => asDetail(record),
      loadEquityPlan: async () => equityPlan(),
    });
    try {
      const openDetail = ready.root.findAll((node) => node.type === "button" && node.children.join("") === "View source details")[0]!;
      await act(async () => { openDetail.props.onClick(); await flushPromises(); });
      const rendered = markup(ready);
      assert.match(rendered, /Your position plan/);
      assert.match(rendered, /Crypto Edge per-user simulation/);
      assert.match(rendered, /Requested risk USD/);
      assert.match(rendered, /Planned position notional USD/);
      assert.match(rendered, /This is a sizing plan, not an executed order/);
      assert.doesNotMatch(rendered, /kraken_quantity|order_quantity/i);
    } finally { await act(async () => { ready.unmount(); }); }

    const failure = await renderLive({
      locale: "pl",
      loadSignals: async () => [record],
      loadSignalDetail: async () => asDetail(record),
      loadEquityPlan: async () => { throw new Error("plan unavailable"); },
    });
    try {
      const openDetail = failure.root.findAll((node) => node.type === "button" && node.children.join("") === "Pokaż szczegóły źródła")[0]!;
      await act(async () => { openDetail.props.onClick(); await flushPromises(); });
      const rendered = markup(failure);
      assert.match(rendered, /Szczegóły rekordu źródłowego/);
      assert.match(rendered, /Twój plan pozycji jest niedostępny/);
      assert.match(rendered, /BTCUSD/);
    } finally { await act(async () => { failure.unmount(); }); }
  });

  it("renders loaded BUY and LIMIT source fields, truthful loaded-only counts, PL copy, and a source-detail panel", async () => {
    const market = marketSignal({ received_at: "2026-09-28T12:00:00.000Z" });
    const limit = limitSignal({ received_at: "2026-09-28T12:01:00.000Z" });
    const detail = { ...limit, signal: { ...limit.signal, source: { ...limit.signal.source, terminal_id: "axi-mt4-primary" } } };
    const renderer = await renderLive({
      loadSignals: async () => [market, limit],
      loadSignalDetail: async () => asDetail(detail),
    });
    try {
      const loaded = markup(renderer!);
      assert.match(loaded, /AXI source \+ Engine lifecycle.*not Kraken execution/);
      assert.match(loaded, /Loaded/);
      assert.match(loaded, /"children":\["2"\]/);
      assert.match(loaded, /BTCUSD/);
      assert.match(loaded, /ETHUSD/);
      assert.match(loaded, /BUY/);
      assert.match(loaded, /SELL/);
      assert.match(loaded, /MARKET/);
      assert.match(loaded, /LIMIT/);
      assert.match(loaded, /SIGNAL/);
      assert.doesNotMatch(loaded, /STATUS UNCONFIRMED|No lifecycle event has been received from Engine/);
      assert.match(loaded, /Source signal time/);
      assert.match(loaded, /Signal entry/);
      assert.match(loaded, /Stop loss/);
      assert.match(loaded, /Take profit/);
      assert.match(loaded, /RR/);
      assert.match(loaded, /Max hold/);
      assert.match(loaded, /Cancel price/);
      assert.match(loaded, /Valid for/);
      assert.match(loaded, /ALLinCrypto Engine/);
      assert.match(loaded, /Reference equity · \$10,000/);
      assert.match(loaded, /risk \/ trade/);
      assert.match(loaded, /Closed trades/);
      assert.match(loaded, /Max DD/);
      assert.match(loaded, /Received/);
      assert.ok(loaded.indexOf("ETHUSD") < loaded.indexOf("BTCUSD"), "newest received record is first");
      assert.doesNotMatch(loaded, /trend-reclaim-v9|Trend reclaim v9|mean-revert-x|Mean Revert X|custom-trend|mean-reversion|Strategy version|2026\.09/);

      const openDetail = renderer!.root.findAll((node) => node.type === "button" && node.children.join("") === "View source details")[0]!;
      await act(async () => {
        openDetail.props.onClick();
        await flushPromises();
      });
      const detailMarkup = markup(renderer!);
      assert.match(detailMarkup, /Source record details/);
      assert.match(detailMarkup, /ETHUSD/);
      assert.match(detailMarkup, /SELL/);
      assert.match(detailMarkup, /ALLinCrypto Engine/);
      assert.match(detailMarkup, /Lifecycle reflects the AXI ALLinCrypto Engine execution/);
      assert.doesNotMatch(detailMarkup, /limit-0001|axi-mt4-primary|AXI_SERVER|mean-revert-x|Mean Revert X|mean-reversion|Strategy version|2026\.09|Setup family|Source terminal|Source time basis/);
    } finally {
      if (renderer) await act(async () => { renderer.unmount(); });
    }

    const polish = await renderLive({ locale: "pl", loadSignals: async () => [] });
    try {
      assert.match(markup(polish!), /Sygnały na żywo/);
      assert.match(markup(polish!), /Brak odebranych sygnałów źródłowych/);
    } finally {
      if (polish) await act(async () => { polish.unmount(); });
    }
  });

  it("renders loading, unavailable, forbidden, generic-error, empty, and missing-detail states without breaking the feed", async () => {
    let resolveList: ((records: AxiSignalRecord[]) => void) | undefined;
    const pending = new Promise<AxiSignalRecord[]>((resolve) => { resolveList = resolve; });
    const loading = await renderLive({ loadSignals: async () => pending });
    try {
      assert.match(markup(loading!), /"data-live-signals-state":"loading"/);
      resolveList!([]);
      await act(async () => { await flushPromises(); });
      assert.match(markup(loading!), /No source signals received/);
    } finally {
      if (loading) await act(async () => { loading.unmount(); });
    }

    for (const [status, expected] of [[404, "Live Signals are unavailable"], [403, "Live Signals access is restricted"], [503, "Could not load Live Signals"]] as const) {
      const renderer = await renderLive({
        loadSignals: async () => { throw new AxiSignalsDataSourceError(status, "TEST_ERROR"); },
      });
      try {
        assert.match(markup(renderer!), new RegExp(expected));
      } finally {
        if (renderer) await act(async () => { renderer.unmount(); });
      }
    }

    const record = marketSignal();
    const detailNotFound = await renderLive({
      loadSignals: async () => [record],
      loadSignalDetail: async () => { throw new AxiSignalsDataSourceError(404, "AXI_SIGNAL_NOT_FOUND"); },
    });
    try {
      const openDetail = detailNotFound!.root.findAll((node) => node.type === "button" && node.children.join("") === "View source details")[0]!;
      await act(async () => {
        openDetail.props.onClick();
        await flushPromises();
      });
      assert.match(markup(detailNotFound!), /"data-live-signals-detail-state":"not-found"/);
      assert.match(markup(detailNotFound!), /Source signal not found/);
      assert.match(markup(detailNotFound!), /BTCUSD/);
    } finally {
      if (detailNotFound) await act(async () => { detailNotFound.unmount(); });
    }
  });
});

async function renderLive({
  locale = "en",
  loadSignals,
  loadSignalDetail,
  loadEquityPlan,
  loadReferenceEquity = async () => referenceEquity(),
  pollIntervalMs = 0,
}: {
  locale?: "en" | "pl";
  loadSignals: (limit?: number) => Promise<AxiSignalRecord[]>;
  loadSignalDetail?: (signalId: string) => Promise<AxiSignalDetailRecord>;
  loadEquityPlan?: (signalId: string) => Promise<SignalEquityPlanResponse>;
  loadReferenceEquity?: () => Promise<AxiReferenceEquityCurve>;
  pollIntervalMs?: number;
}): Promise<TestRenderer.ReactTestRenderer> {
  let renderer: TestRenderer.ReactTestRenderer | undefined;
  await act(async () => {
    renderer = create(
      <ProductLocaleProvider initialLocale={locale}>
        <LiveSignals
          loadSignals={loadSignals}
          loadSignalDetail={loadSignalDetail}
          loadEquityPlan={loadEquityPlan}
          loadReferenceEquity={loadReferenceEquity}
          pollIntervalMs={pollIntervalMs}
        />
      </ProductLocaleProvider>,
    );
    await flushPromises();
  });
  return renderer!;
}

function markup(renderer: TestRenderer.ReactTestRenderer): string {
  return JSON.stringify(renderer.toJSON());
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function marketSignal(overrides: Partial<AxiSignalRecord> = {}): AxiSignalRecord {
  const record: AxiSignalRecord = {
    signal: {
      schema_version: "axi_crypto_signal_v1",
      event_type: "SIGNAL_CREATED",
      signal_id: "market-0001",
      source: { provider: "AXI", engine: "ALLinCrypto Engine", engine_version: "1.2.3", strategy_version: "2026.09", terminal_id: "axi-mt4-primary" },
      setup: { setup_id: "trend-reclaim-v9", setup_name: "Trend reclaim v9", timeframe: "M15", family: "custom-trend", max_hold_seconds: 7200 },
      trade: {
        symbol: "BTCUSD", side: "BUY", order_type: "MARKET", source_signal_time: "2026-09-28T11:59:59.000Z", source_time_basis: "AXI_SERVER",
        entry_price: 100, stop_loss: 90, take_profit: 120, rr: 2, cancel_price: null, valid_for_seconds: null,
      },
    },
    received_at: "2026-09-28T12:00:00.000Z",
    lifecycle_event_count: 1,
    lifecycle: {
      signal_id: "market-0001",
      status: "ACTIVE",
      entry_price: 100,
      filled_at: "2026-09-28T12:00:00.000Z",
      closed_at: null,
      close_price: null,
      close_reason: null,
      result_r: null,
      last_event_time: "2026-09-28T12:00:00.000Z",
    },
  };
  return { ...record, ...overrides };
}

function limitSignal(overrides: Partial<AxiSignalRecord> = {}): AxiSignalRecord {
  return {
    ...marketSignal(),
    signal: {
      ...marketSignal().signal,
      signal_id: "limit-0001",
      setup: { setup_id: "mean-revert-x", setup_name: "Mean Revert X", timeframe: "H1", family: "mean-reversion", max_hold_seconds: null },
      trade: {
        symbol: "ETHUSD", side: "SELL", order_type: "LIMIT", source_signal_time: "2026-09-28T11:58:59.000Z", source_time_basis: "AXI_SERVER",
        entry_price: 100, stop_loss: 110, take_profit: 80, rr: 2, cancel_price: 115, valid_for_seconds: 900,
      },
    },
    received_at: "2026-09-28T12:01:00.000Z",
    lifecycle_event_count: 0,
    lifecycle: {
      signal_id: "limit-0001",
      status: "PENDING",
      entry_price: null,
      filled_at: null,
      closed_at: null,
      close_price: null,
      close_reason: null,
      result_r: null,
      last_event_time: "2026-09-28T11:58:59.000Z",
    },
    ...overrides,
  };
}


function asDetail(record: AxiSignalRecord): AxiSignalDetailRecord {
  return { ...record, lifecycle_events: [] };
}

function marketDetail(): AxiSignalDetailRecord {
  return asDetail(marketSignal());
}

function referenceEquity(): AxiReferenceEquityCurve {
  return {
    schema_version: "axi_reference_equity_curve_v1",
    basis: "ENGINE_LIFECYCLE",
    starting_equity_usd: 10_000,
    risk_pct_per_trade: 1,
    closed_trade_count: 3,
    win_count: 2,
    loss_count: 1,
    flat_count: 0,
    win_rate_pct: 66.67,
    ending_equity_usd: 10_198.98,
    net_pnl_usd: 198.98,
    net_return_pct: 1.9898,
    max_drawdown_pct: 1,
    total_r: 2,
    points: [
      {
        signal_id: "eq-1",
        setup_id: "A",
        symbol: "BTCUSD",
        side: "BUY",
        closed_at: "2026-10-01T11:00:00.000Z",
        close_reason: "TP",
        result_r: 2,
        equity_before_usd: 10_000,
        pnl_usd: 200,
        equity_after_usd: 10_200,
        drawdown_pct: 0,
      },
      {
        signal_id: "eq-2",
        setup_id: "B",
        symbol: "BTCUSD",
        side: "BUY",
        closed_at: "2026-10-02T11:00:00.000Z",
        close_reason: "SL",
        result_r: -1,
        equity_before_usd: 10_200,
        pnl_usd: -102,
        equity_after_usd: 10_098,
        drawdown_pct: 1,
      },
      {
        signal_id: "eq-3",
        setup_id: "C",
        symbol: "BTCUSD",
        side: "BUY",
        closed_at: "2026-10-03T11:00:00.000Z",
        close_reason: "OTHER",
        result_r: 1,
        equity_before_usd: 10_098,
        pnl_usd: 100.98,
        equity_after_usd: 10_198.98,
        drawdown_pct: 0.0098,
      },
    ],
  };
}

function equityPlan(): SignalEquityPlanResponse {
  return {
    schema_version: "crypto_edge_signal_equity_plan_v1",
    signal_id: "market-0001",
    account_source: "CRYPTO_EDGE_SIMULATION",
    account_observed_at: "2026-09-28T12:00:00.000Z",
    profile_updated_at: "2026-09-28T12:00:00.000Z",
    plan: {
      schema_version: "crypto_edge_equity_plan_v1",
      status: "READY",
      reason_codes: [],
      account_mode: "SIMULATED",
      equity_usd: 10_000,
      risk_pct_per_trade: 0.5,
      requested_risk_usd: 50,
      effective_risk_cap_usd: 50,
      stop_distance_pct: 0.1,
      risk_based_notional_usd: 500,
      planned_notional_usd: 500,
      planned_risk_usd: 50,
      effective_leverage: 0.05,
      required_margin_usd: 500,
      risk_utilization_pct: 100,
      signal: { side: "BUY", entry_price: 100, stop_loss: 90, take_profit: 120 },
    },
  };
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
}
