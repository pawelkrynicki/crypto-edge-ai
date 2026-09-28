import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import TestRenderer from "react-test-renderer";
import { getProductNavItemsForRole } from "../src/ProductApp.js";
import { KrakenCopy } from "../src/components/KrakenCopy.js";
import { ProductWorkspaceShell, type ProductNavItem } from "../src/components/ProductWorkspaceShell.js";
import { ProductLocaleProvider } from "../src/productI18n.js";
import {
  loadKrakenAccount,
  type KrakenAccountSnapshot,
} from "../src/services/krakenAccountDataSource.js";
import {
  loadKrakenCopyProfile,
  saveKrakenCopyProfile,
  type KrakenCopyProfile,
  type KrakenCopyProfileWrite,
} from "../src/services/krakenCopyProfileDataSource.js";

void React;

const { act, create } = TestRenderer;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("01E-B Kraken Copy UI", () => {
  it("reads the same-origin account endpoint and validates its browser-safe contract", async () => {
    let request: { url: string; init: RequestInit | undefined } | null = null;
    const snapshot = await loadKrakenAccount(async (url, init) => {
      request = { url: String(url), init };
      return jsonResponse(simulatedSnapshot());
    });

    assert.equal(snapshot.equity_usd, 10_000);
    assert.deepEqual(request, {
      url: "/api/v1/trading/kraken/account",
      init: { method: "GET", credentials: "same-origin", headers: { accept: "application/json" } },
    });
  });

  it("renders simulated and live read-only readiness with an explicit execution boundary in English and Polish", async () => {
    const simulated = await renderKraken({ locale: "en", snapshot: simulatedSnapshot() });
    try {
      const text = markup(simulated);
      assert.match(text, /Kraken Copy/);
      assert.match(text, /SIMULATION/);
      assert.match(text, /Crypto Edge simulation/);
      assert.match(text, /not Kraken demo/);
      assert.match(text, /COPY \/ EXECUTION IS NOT ACTIVE YET/);
      assert.match(text, /\$10,000/);
      assert.match(text, /Position sizing is calculated separately/);
      assert.deepEqual(
        simulated.root.findAll((node) => node.type === "button").map((node) => node.children.join("")),
        ["Save risk settings"],
        "Kraken Copy exposes risk-profile saving only, not an order CTA",
      );
    } finally {
      await act(async () => { simulated.unmount(); });
    }

    const live = await renderKraken({ locale: "en", snapshot: liveSnapshot() });
    try {
      const text = markup(live);
      assert.match(text, /KRAKEN LIVE/);
      assert.match(text, /Connected.*read-only/);
      assert.match(text, /API permission status/);
      assert.match(text, /READ_ONLY/);
      assert.match(text, /NO_ACCESS/);
      assert.match(text, /COPY \/ EXECUTION IS NOT ACTIVE YET/);
    } finally {
      await act(async () => { live.unmount(); });
    }

    const polish = await renderKraken({ locale: "pl", snapshot: simulatedSnapshot() });
    try {
      const text = markup(polish);
      assert.match(text, /SYMULACJA/);
      assert.match(text, /KOPIOWANIE \/ WYKONANIE NIE JEST JESZCZE AKTYWNE/);
      assert.match(text, /Symulacja Crypto Edge/);
      assert.match(text, /Twoje ustawienia ryzyka/);
    } finally {
      await act(async () => { polish.unmount(); });
    }
  });

  it("uses the session-protected profile GET and PUT endpoints without browser-side account credentials", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
    const fetchProfile = async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), init });
      return jsonResponse(profile());
    };
    assert.equal((await loadKrakenCopyProfile(fetchProfile)).simulated_equity_usd, 10_000);
    const write: KrakenCopyProfileWrite = {
      simulated_equity_usd: 10_000,
      risk_pct_per_trade: 0.5,
      max_leverage: 1,
      max_position_notional_usd: null,
    };
    await saveKrakenCopyProfile(write, fetchProfile);
    assert.deepEqual(requests[0], {
      url: "/api/v1/trading/kraken/profile",
      init: { method: "GET", credentials: "same-origin", headers: { accept: "application/json" } },
    });
    assert.equal(requests[1]?.url, "/api/v1/trading/kraken/profile");
    assert.equal(requests[1]?.init?.method, "PUT");
    assert.match(String(requests[1]?.init?.body), /"simulated_equity_usd":10000/);
    assert.doesNotMatch(String(requests[1]?.init?.body), /actor_id|secret|api.?key/i);
  });

  it("saves a per-user simulated profile and keeps account-size editing hidden in live mode", async () => {
    let saved: KrakenCopyProfileWrite | null = null;
    const simulated = await renderKraken({
      locale: "en",
      snapshot: simulatedSnapshot(),
      saveProfile: async (write) => {
        saved = write;
        return { ...profile(), ...write };
      },
    });
    try {
      const inputs = simulated.root.findAll((node) => node.type === "input");
      assert.equal(inputs.length, 4);
      await act(async () => {
        inputs[0]!.props.onChange({ target: { value: "1000" } });
      });
      const save = simulated.root.findAll((node) => node.type === "button" && node.children.join("") === "Save risk settings")[0]!;
      await act(async () => {
        save.props.onClick();
        await flushPromises();
      });
      assert.equal(saved?.simulated_equity_usd, 1_000);
      assert.equal(saved?.risk_pct_per_trade, 0.5);
      assert.doesNotMatch(markup(simulated), /order.*CTA/i);
    } finally { await act(async () => { simulated.unmount(); }); }

    const live = await renderKraken({ locale: "en", snapshot: liveSnapshot() });
    try {
      assert.equal(live.root.findAll((node) => node.type === "input").length, 3);
      assert.doesNotMatch(markup(live), /Account size \/ Equity USD/);
      assert.match(markup(live), /read-only/);
    } finally { await act(async () => { live.unmount(); }); }
  });

  it("keeps Live Signals first and Kraken Copy second inside Trading without changing other groups", () => {
    const navItems: ProductNavItem[] = [
      { id: "candidate-results", label: "Radar", icon: "R", description: "Radar", groupLabel: "Product Flow" },
      { id: "candidate-detail", label: "Details", icon: "D", description: "Details", groupLabel: "Product Flow" },
      { id: "external-checks", label: "Verification", icon: "V", description: "Verification", groupLabel: "Research / verification" },
      { id: "live-signals", label: "Live Signals", icon: "L", description: "AXI feed", groupLabel: "Trading", groupDescription: "Read-only source signals" },
      { id: "kraken-copy", label: "Kraken Copy", icon: "K", description: "Account readiness", groupLabel: "Trading", groupDescription: "Read-only source signals" },
      { id: "methodology", label: "Methodology", icon: "M", description: "Methodology", groupLabel: "Status" },
      { id: "control-center", label: "Control Center", icon: "C", description: "Control", groupLabel: "Status" },
    ];
    const visible = getProductNavItemsForRole(navItems, "CAMP_USER");
    assert.deepEqual(visible.map((item) => item.id), ["candidate-results", "candidate-detail", "external-checks", "live-signals", "kraken-copy"]);

    const markup = renderToStaticMarkup(
      <ProductLocaleProvider initialLocale="en">
        <ProductWorkspaceShell
          navItems={visible}
          activeSection="kraken-copy"
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
    assert.match(markup, /<section class="workspace-nav-group" aria-label="Trading">[\s\S]*?Live Signals[\s\S]*?Kraken Copy/);
  });
});

async function renderKraken({
  locale,
  snapshot,
  profile: suppliedProfile = profile(),
  saveProfile = async (write) => ({ ...suppliedProfile, ...write }),
}: {
  locale: "en" | "pl";
  snapshot: KrakenAccountSnapshot;
  profile?: KrakenCopyProfile;
  saveProfile?: (write: KrakenCopyProfileWrite) => Promise<KrakenCopyProfile>;
}): Promise<TestRenderer.ReactTestRenderer> {
  let renderer: TestRenderer.ReactTestRenderer | undefined;
  await act(async () => {
    renderer = create(
      <ProductLocaleProvider initialLocale={locale}>
        <KrakenCopy loadAccount={async () => snapshot} loadProfile={async () => suppliedProfile} saveProfile={saveProfile} />
      </ProductLocaleProvider>,
    );
    await flushPromises();
  });
  return renderer!;
}

function profile(): KrakenCopyProfile {
  return {
    schema_version: "crypto_edge_kraken_copy_profile_v1",
    simulated_equity_usd: 10_000,
    risk_pct_per_trade: 0.5,
    max_leverage: 1,
    max_position_notional_usd: null,
    updated_at: "2026-09-28T12:00:00.000Z",
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
    observed_at: "2026-09-28T12:00:00.000Z",
    source: "CRYPTO_EDGE_SIMULATION",
    execution_enabled: false,
  };
}

function liveSnapshot(): KrakenAccountSnapshot {
  return {
    ...simulatedSnapshot(),
    mode: "KRAKEN_LIVE",
    connection_status: "CONNECTED_READ_ONLY",
    equity_usd: 2_500,
    available_margin_usd: 1_750,
    permissions: { general: "READ_ONLY", transfer: "NO_ACCESS" },
    source: "KRAKEN_FUTURES",
  };
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
}

function markup(renderer: TestRenderer.ReactTestRenderer): string {
  return JSON.stringify(renderer.toJSON());
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
