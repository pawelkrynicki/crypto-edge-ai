import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import TestRenderer from "react-test-renderer";
import { getProductNavItemsForRole } from "../src/ProductApp.js";
import { LiveSignals } from "../src/components/LiveSignals.js";
import { ProductWorkspaceShell, type ProductNavItem } from "../src/components/ProductWorkspaceShell.js";
import { ProductLocaleProvider } from "../src/productI18n.js";
import {
  AxiSignalsDataSourceError,
  loadAxiSignalDetail,
  loadAxiSignals,
  type AxiSignalRecord,
} from "../src/services/axiSignalsDataSource.js";

void React;

const { act, create } = TestRenderer;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("01D Live Signals UI", () => {
  it("places Live Signals as the first Trading navigation item without changing existing sections", () => {
    const navItems: ProductNavItem[] = [
      { id: "candidate-results", label: "Radar", icon: "R", description: "Radar", groupLabel: "Product Flow" },
      { id: "candidate-detail", label: "Details", icon: "D", description: "Details", groupLabel: "Product Flow" },
      { id: "external-checks", label: "Verification", icon: "V", description: "Verification", groupLabel: "Research / verification" },
      { id: "live-signals", label: "Live Signals", icon: "L", description: "AXI feed", groupLabel: "Trading", groupDescription: "Read-only source signals" },
      { id: "methodology", label: "Methodology", icon: "M", description: "Methodology", groupLabel: "Status" },
      { id: "control-center", label: "Control Center", icon: "C", description: "Control", groupLabel: "Status" },
    ];
    const visible = getProductNavItemsForRole(navItems, "CAMP_USER");
    assert.deepEqual(visible.map((item) => item.id), ["candidate-results", "candidate-detail", "external-checks", "live-signals"]);

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
      return jsonResponse({ schema_version: "axi_signal_list_v1", signals: [marketSignal()] });
    });

    assert.equal(records.length, 1);
    assert.deepEqual(request, {
      url: "/api/v1/trading/signals?limit=50",
      init: { method: "GET", credentials: "same-origin", headers: { accept: "application/json" } },
    });

    let detailRequest: { url: string; init: RequestInit | undefined } | null = null;
    const detail = await loadAxiSignalDetail("market-0001", async (url, init) => {
      detailRequest = { url: String(url), init };
      return jsonResponse({ schema_version: "axi_signal_detail_v1", ...marketSignal() });
    });
    assert.equal(detail.signal.signal_id, "market-0001");
    assert.deepEqual(detailRequest, {
      url: "/api/v1/trading/signals/market-0001",
      init: { method: "GET", credentials: "same-origin", headers: { accept: "application/json" } },
    });
  });

  it("renders loaded BUY and LIMIT source fields, truthful loaded-only counts, PL copy, and a source-detail panel", async () => {
    const market = marketSignal({ received_at: "2026-09-28T12:00:00.000Z" });
    const limit = limitSignal({ received_at: "2026-09-28T12:01:00.000Z" });
    const detail = { ...limit, signal: { ...limit.signal, source: { ...limit.signal.source, terminal_id: "axi-mt4-primary" } } };
    const renderer = await renderLive({
      loadSignals: async () => [market, limit],
      loadSignalDetail: async () => detail,
    });
    try {
      const loaded = markup(renderer!);
      assert.match(loaded, /Source signals only.*not executed trades/);
      assert.match(loaded, /Loaded/);
      assert.match(loaded, /"children":\["2"\]/);
      assert.match(loaded, /BTCUSD/);
      assert.match(loaded, /ETHUSD/);
      assert.match(loaded, /BUY/);
      assert.match(loaded, /SELL/);
      assert.match(loaded, /MARKET/);
      assert.match(loaded, /LIMIT/);
      assert.match(loaded, /Source signal time/);
      assert.match(loaded, /Entry/);
      assert.match(loaded, /Stop loss/);
      assert.match(loaded, /Take profit/);
      assert.match(loaded, /RR/);
      assert.match(loaded, /Max hold/);
      assert.match(loaded, /Cancel price/);
      assert.match(loaded, /Valid for/);
      assert.match(loaded, /ALLinCrypto Engine/);
      assert.match(loaded, /Strategy version/);
      assert.match(loaded, /2026\.09/);
      assert.match(loaded, /Received/);
      assert.ok(loaded.indexOf("mean-revert-x") < loaded.indexOf("trend-reclaim-v9"), "newest received record is first");

      const openDetail = renderer!.root.findAll((node) => node.type === "button" && node.children.join("") === "View source details")[0]!;
      await act(async () => {
        openDetail.props.onClick();
        await flushPromises();
      });
      const detailMarkup = markup(renderer!);
      assert.match(detailMarkup, /Source record details/);
      assert.match(detailMarkup, /Source terminal/);
      assert.match(detailMarkup, /axi-mt4-primary/);
      assert.match(detailMarkup, /does not indicate an order, position, fill, or execution result/);
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
}: {
  locale?: "en" | "pl";
  loadSignals: (limit?: number) => Promise<AxiSignalRecord[]>;
  loadSignalDetail?: (signalId: string) => Promise<AxiSignalRecord>;
}): Promise<TestRenderer.ReactTestRenderer> {
  let renderer: TestRenderer.ReactTestRenderer | undefined;
  await act(async () => {
    renderer = create(
      <ProductLocaleProvider initialLocale={locale}>
        <LiveSignals loadSignals={loadSignals} loadSignalDetail={loadSignalDetail} />
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
    ...overrides,
  };
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
}
