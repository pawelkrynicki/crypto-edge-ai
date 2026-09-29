import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { createServer } from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import { planEquity } from "../../data-poc/src/trading/equityPlanner.js";
import { createAxiSignalRepository } from "../server/axiSignalRepository.js";
import { createKrakenCopyProfileRepository } from "../server/krakenCopyProfileRepository.js";
import type { KrakenAccountSnapshot } from "../server/krakenAccount.js";
import { createScannerApiHandler } from "../server/scannerApiHandler.js";
import type { AxiCryptoSignal } from "../server/axiCryptoSignalContract.js";

const TOKEN = "kraken-copy-profile-test-token";
const OBSERVED_AT = "2026-09-28T12:00:00.000Z";

describe("01E-C per-user Kraken Copy profile and equity plans", () => {
  it("returns safe first defaults, persists atomically per session actor, and rejects injected or invalid profile fields", async () => {
    const api = await startApi();
    try {
      const first = await profileGet(api.base);
      assert.equal(first.response.status, 200);
      assert.deepEqual(profileValues(first.body), {
        simulated_equity_usd: 10_000,
        risk_pct_per_trade: 0.5,
        max_leverage: 1,
        max_position_notional_usd: null,
      });
      assert.ok(!JSON.stringify(first.body).includes("actor_id"));
      assert.ok(!JSON.stringify(first.body).match(/secret|api.?key/i));

      const ownerCookie = first.cookie;
      const saved = await profilePut(api.base, ownerCookie, profileWrite(10_000));
      assert.equal(saved.status, 200);

      assert.equal(profileValues((await profileGet(api.base, ownerCookie)).body).simulated_equity_usd, 10_000);
      assert.equal(profileValues((await profileGet(api.base, ownerCookie)).body).risk_pct_per_trade, 0.5);

      for (const invalid of [
        { ...profileWrite(1_000), actor_id: "pc1-owner" },
        { ...profileWrite(1_000), source: "KRAKEN_LIVE" },
        { ...profileWrite(1_000), api_key: "never" },
        { ...profileWrite(1_000), simulated_equity_usd: 0 },
        { ...profileWrite(1_000), risk_pct_per_trade: -1 },
        { ...profileWrite(1_000), max_leverage: 0 },
        { ...profileWrite(1_000), max_position_notional_usd: "NaN" },
      ]) {
        const response = await profilePut(api.base, ownerCookie, invalid);
        assert.equal(response.status, 400);
      }
    } finally { await api.close(); }
  });

  it("allows OWNER and ADMIN profile access and denies CAMP_USER and TRUSTED_TESTER", async () => {
    for (const role of ["OWNER", "ADMIN"] as const) {
      const allowed = await startApi({ role });
      try {
        assert.equal((await profileGet(allowed.base)).response.status, 200);
      } finally {
        await allowed.close();
      }
    }

    for (const role of ["CAMP_USER", "TRUSTED_TESTER"] as const) {
      const denied = await startApi({ role });
      try {
        const forbidden = await fetch(`${denied.base}/api/v1/trading/kraken/profile`);
        assert.equal(forbidden.status, 403);
        assert.equal((await forbidden.json() as { error: string }).error, "kraken_copy_forbidden");
      } finally {
        await denied.close();
      }
    }
  });

  it("composes simulated account values from the actor profile and leaves a live Kraken snapshot unchanged", async () => {
    const simulated = await startApi();
    try {
      const session = await profileGet(simulated.base);
      await profilePut(simulated.base, session.cookie, profileWrite(1_000));
      const account = await fetch(`${simulated.base}/api/v1/trading/kraken/account`, { headers: { cookie: session.cookie } });
      assert.equal(account.status, 200);
      const body = await account.json() as KrakenAccountSnapshot;
      assert.equal(body.source, "CRYPTO_EDGE_SIMULATION");
      assert.equal(body.equity_usd, 1_000);
      assert.equal(body.available_margin_usd, 1_000);
    } finally { await simulated.close(); }

    const liveSnapshot = krakenLiveSnapshot(2_500, 1_750);
    const live = await startApi({
      role: "OWNER",
      accountSource: { mode: "KRAKEN_LIVE", getSnapshot: async () => liveSnapshot },
    });
    try {
      const session = await profileGet(live.base);
      await profilePut(live.base, session.cookie, profileWrite(100));
      const account = await fetch(`${live.base}/api/v1/trading/kraken/account`, { headers: { cookie: session.cookie } });
      assert.deepEqual(await account.json(), liveSnapshot);
    } finally { await live.close(); }
  });

  it("uses Claude's canonical planner for BUY and SELL records, personalizes no-cap plans by equity, and never emits a quantity", async () => {
    const api = await startApi();
    try {
      await ingest(api.base, buySignal());
      await ingest(api.base, sellSignal());
      const first = await profileGet(api.base);
      await profilePut(api.base, first.cookie, profileWrite(10_000));
      const buy10k = await planGet(api.base, first.cookie, "buy-plan-0001");
      assert.equal(buy10k.response.status, 200);
      assert.equal(buy10k.body.plan.signal.side, "BUY");
      assert.deepEqual(buy10k.body.plan, planEquity({
        account: {
          account_mode: "SIMULATED",
          equity_usd: 10_000,
          available_margin_usd: 10_000,
          risk_pct_per_trade: 0.5,
          max_leverage: 1,
          max_position_notional_usd: null,
        },
        signal: { side: "BUY", entry_price: 100, stop_loss: 90, take_profit: 120 },
      }));

      const second = await profileGet(api.base);
      await profilePut(api.base, second.cookie, profileWrite(1_000));
      const buy1k = await planGet(api.base, second.cookie, "buy-plan-0001");
      assert.equal(buy1k.body.plan.planned_notional_usd * 10, buy10k.body.plan.planned_notional_usd);

      const sell = await planGet(api.base, first.cookie, "sell-plan-0001");
      assert.equal(sell.response.status, 200);
      assert.equal(sell.body.plan.signal.side, "SELL");
      assert.doesNotMatch(JSON.stringify([buy10k.body, buy1k.body, sell.body]), /(?:order|kraken)_quantity/i);

      const missing = await planGet(api.base, first.cookie, "missing-plan-0001");
      assert.equal(missing.response.status, 404);
    } finally { await api.close(); }
  });

  it("uses live Kraken equity rather than a simulated profile and returns a deterministic conflict for unusable live equity", async () => {
    const usable = await startApi({
      role: "OWNER",
      accountSource: { mode: "KRAKEN_LIVE", getSnapshot: async () => krakenLiveSnapshot(2_500, 1_750) },
    });
    try {
      await ingest(usable.base, buySignal());
      const session = await profileGet(usable.base);
      await profilePut(usable.base, session.cookie, profileWrite(100));
      const plan = await planGet(usable.base, session.cookie, "buy-plan-0001");
      assert.equal(plan.response.status, 200);
      assert.equal(plan.body.account_source, "KRAKEN_FUTURES");
      assert.equal(plan.body.plan.account_mode, "KRAKEN_LIVE");
      assert.equal(plan.body.plan.equity_usd, 2_500);
      assert.equal(plan.body.plan.required_margin_usd <= 1_750, true);
    } finally { await usable.close(); }

    const unavailable = await startApi({
      role: "OWNER",
      accountSource: { mode: "KRAKEN_LIVE", getSnapshot: async () => krakenLiveSnapshot(null, null) },
    });
    try {
      await ingest(unavailable.base, buySignal());
      const session = await profileGet(unavailable.base);
      const plan = await planGet(unavailable.base, session.cookie, "buy-plan-0001");
      assert.equal(plan.response.status, 409);
      assert.equal(plan.body.error, "KRAKEN_LIVE_EQUITY_UNAVAILABLE");
    } finally { await unavailable.close(); }
  });
});

type Api = { base: string; close: () => Promise<void> };

async function startApi(options: {
  role?: "TRUSTED_TESTER" | "CAMP_USER" | "OWNER" | "ADMIN";
  accountSource?: { mode: "SIMULATED" | "KRAKEN_LIVE"; getSnapshot: () => Promise<KrakenAccountSnapshot> };
} = {}): Promise<Api> {
  const root = await mkdtemp(resolve(tmpdir(), "crypto-edge-kraken-copy-"));
  const axiRepository = await createAxiSignalRepository({ databaseFilePath: resolve(root, "axi.sqlite") });
  const profileRepository = await createKrakenCopyProfileRepository({
    databaseFilePath: resolve(root, "profiles.sqlite"),
    now: () => new Date(OBSERVED_AT),
  });
  const server = createServer(createScannerApiHandler({
    runtimeMode: "DEVELOPMENT_DEMO",
    lifecycle: { defaultSessionRole: options.role ?? "OWNER", campIdentityRegistryPath: resolve(root, "camp-identities.json") },
    axiSignals: { repository: axiRepository, token: TOKEN, featureFlagEnvironment: { CRYPTO_EDGE_AXI_SIGNALS: "1" } },
    krakenCopy: {
      accountSource: options.accountSource ?? { mode: "SIMULATED", getSnapshot: async () => simulatedSnapshot() },
      profileRepository,
      featureFlagEnvironment: { CRYPTO_EDGE_KRAKEN: "1" },
    },
  }));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return {
    base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: async () => {
      await new Promise<void>((resolveClose, rejectClose) => server.close((error) => error ? rejectClose(error) : resolveClose()));
      axiRepository.close();
      profileRepository.close();
    },
  };
}

async function profileGet(base: string, cookie?: string): Promise<{ response: Response; body: ProfileBody; cookie: string }> {
  const response = await fetch(`${base}/api/v1/trading/kraken/profile`, { headers: cookie ? { cookie } : undefined });
  const body = await response.json() as ProfileBody;
  const receivedCookie = response.headers.get("set-cookie")?.split(";", 1)[0] ?? cookie;
  assert.ok(receivedCookie, "a session cookie is required for the test actor");
  return { response, body, cookie: receivedCookie };
}

async function profilePut(base: string, cookie: string, body: unknown): Promise<Response> {
  return fetch(`${base}/api/v1/trading/kraken/profile`, {
    method: "PUT",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function planGet(base: string, cookie: string, signalId: string): Promise<{ response: Response; body: PlanBody }> {
  const response = await fetch(`${base}/api/v1/trading/signals/${signalId}/equity-plan`, { headers: { cookie } });
  return { response, body: await response.json() as PlanBody };
}

async function ingest(base: string, signal: AxiCryptoSignal): Promise<void> {
  const response = await fetch(`${base}/api/v1/trading/signals/axi`, {
    method: "POST",
    headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify(signal),
  });
  assert.equal(response.status, 201);
}

function profileWrite(equity: number) {
  return { simulated_equity_usd: equity, risk_pct_per_trade: 0.5, max_leverage: 1, max_position_notional_usd: null };
}

function profileValues(profile: ProfileBody) {
  return {
    simulated_equity_usd: profile.simulated_equity_usd,
    risk_pct_per_trade: profile.risk_pct_per_trade,
    max_leverage: profile.max_leverage,
    max_position_notional_usd: profile.max_position_notional_usd,
  };
}

function simulatedSnapshot(): KrakenAccountSnapshot {
  return {
    schema_version: "crypto_edge_kraken_account_snapshot_v1", mode: "SIMULATED", connection_status: "SIMULATED",
    equity_usd: 10_000, available_margin_usd: 10_000, portfolio_value_usd: null, collateral_value_usd: null,
    initial_margin_usd: null, maintenance_margin_usd: null, pnl_usd: null, total_unrealized_usd: null,
    permissions: null, server_time: null, observed_at: OBSERVED_AT, source: "CRYPTO_EDGE_SIMULATION", execution_enabled: false,
  };
}

function krakenLiveSnapshot(equity: number | null, margin: number | null): KrakenAccountSnapshot {
  return {
    ...simulatedSnapshot(), mode: "KRAKEN_LIVE", connection_status: equity === null ? "UNAVAILABLE" : "CONNECTED_READ_ONLY",
    equity_usd: equity, available_margin_usd: margin, source: "KRAKEN_FUTURES", permissions: { general: "READ_ONLY", transfer: "NO_ACCESS" },
  };
}

function buySignal(): AxiCryptoSignal {
  return signal("buy-plan-0001", "BUY", 100, 90, 120);
}

function sellSignal(): AxiCryptoSignal {
  return signal("sell-plan-0001", "SELL", 100, 110, 80);
}

function signal(signalId: string, side: "BUY" | "SELL", entry: number, stop: number, takeProfit: number): AxiCryptoSignal {
  return {
    schema_version: "axi_crypto_signal_v1", event_type: "SIGNAL_CREATED", signal_id: signalId,
    source: { provider: "AXI", engine: "ALLinCrypto Engine", engine_version: "1", strategy_version: "1", terminal_id: "axi-test" },
    setup: { setup_id: "test-setup", setup_name: "Test setup", timeframe: "M5", family: "test", max_hold_seconds: null },
    trade: {
      symbol: "BTCUSD", side, order_type: "MARKET", source_signal_time: "2026-09-28T11:59:59.000Z", source_time_basis: "AXI_SERVER",
      entry_price: entry, stop_loss: stop, take_profit: takeProfit, rr: 2, cancel_price: null, valid_for_seconds: null,
    },
  };
}

type ProfileBody = {
  schema_version: string;
  simulated_equity_usd: number;
  risk_pct_per_trade: number;
  max_leverage: number;
  max_position_notional_usd: number | null;
  updated_at: string;
};

type PlanBody = { error?: string; account_source?: string; plan: { signal: { side: string }; account_mode: string; equity_usd: number; planned_notional_usd: number; required_margin_usd: number } };
