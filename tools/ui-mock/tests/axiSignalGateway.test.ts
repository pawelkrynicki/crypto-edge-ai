import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { after, describe, it } from "node:test";
import type { AxiCryptoSignal } from "../server/axiCryptoSignalContract.js";
import {
  createAxiSignalRepository,
  getDefaultAxiSignalDatabasePath,
  type AxiSignalRepository,
} from "../server/axiSignalRepository.js";
import { createScannerApiHandler, type ScannerApiHandlerOptions } from "../server/scannerApiHandler.js";

const roots: string[] = [];
const TOKEN = "axi-gateway-test-token";
const AIKINTEL_SSO_SECRET = "aikintel-sso-test-secret-012345678901234567890123";
const AIKINTEL_ACTOR_KEY = "aikintel-actor-test-key-012345678901234567890123";

after(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

describe("AXI signal gateway v1", () => {
  it("does not expose the gateway while its canonical feature flag is off", async () => {
    const root = await tempRoot();
    const api = await startApi(root, { featureFlagEnvironment: {} });
    try {
      const response = await post(api.base, marketSignal(), TOKEN);
      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), { error: "not_found", message: "Route not found" });
    } finally {
      await api.close();
    }
  });

  it("fails closed when the AXI feature-flag override is invalid", async () => {
    const root = await tempRoot();
    const api = await startApi(root, { featureFlagEnvironment: { CRYPTO_EDGE_AXI_SIGNALS: "enabled" } });
    try {
      const response = await post(api.base, marketSignal(), TOKEN);
      assert.equal(response.status, 404);
    } finally {
      await api.close();
    }
  });

  it("requires machine Bearer authentication and an application/json body", async () => {
    const root = await tempRoot();
    const api = await startApi(root);
    try {
      const missing = await fetch(`${api.base}/api/v1/trading/signals/axi`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(marketSignal()),
      });
      assert.equal(missing.status, 401);
      assert.equal((await missing.json() as { error: string }).error, "AXI_SIGNAL_AUTH_INVALID");

      const wrong = await post(api.base, marketSignal(), "not-the-token");
      assert.equal(wrong.status, 401);
      assert.equal((await wrong.json() as { error: string }).error, "AXI_SIGNAL_AUTH_INVALID");

      const wrongType = await fetch(`${api.base}/api/v1/trading/signals/axi`, {
        method: "POST",
        headers: { authorization: `Bearer ${TOKEN}`, "content-type": "text/plain" },
        body: JSON.stringify(marketSignal()),
      });
      assert.equal(wrongType.status, 400);
      assert.equal((await wrongType.json() as { error: string }).error, "AXI_SIGNAL_CONTENT_TYPE_INVALID");

      const tooLarge = await fetch(`${api.base}/api/v1/trading/signals/axi`, {
        method: "POST",
        headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
        body: `${JSON.stringify(marketSignal())}${" ".repeat(17_000)}`,
      });
      assert.equal(tooLarge.status, 413);
      assert.equal((await tooLarge.json() as { error: string }).error, "AXI_SIGNAL_BODY_TOO_LARGE");
    } finally {
      await api.close();
    }
  });

  it("accepts valid MARKET and LIMIT source signals without a setup allow-list", async () => {
    const root = await tempRoot();
    const api = await startApi(root);
    try {
      const market = await post(api.base, marketSignal({ signal_id: "gateway-market-0001", setup: { setup_id: "trend-reclaim-v9", setup_name: "Trend reclaim v9", timeframe: "M15", family: "custom-trend", max_hold_seconds: 7200 } }), TOKEN);
      assert.equal(market.status, 201);
      assert.deepEqual(await market.json(), {
        schema_version: "axi_signal_ingest_receipt_v1",
        status: "CREATED",
        signal_id: "gateway-market-0001",
        received_at: "2026-09-28T12:00:00.000Z",
      });

      const limit = await post(api.base, limitSignal({ signal_id: "gateway-limit-0001", setup: { setup_id: "mean-revert-x", setup_name: "Mean Revert X", timeframe: "H1", family: "independent-family", max_hold_seconds: null } }), TOKEN);
      assert.equal(limit.status, 201);
      assert.equal((await limit.json() as { status: string }).status, "CREATED");
      assert.equal(api.repository.list(10).length, 2);
    } finally {
      await api.close();
    }
  });

  it("returns deterministic validation errors for malformed trade data", async () => {
    const root = await tempRoot();
    const api = await startApi(root);
    try {
      const invalidSide = marketSignal({ signal_id: "invalid-side-0001", trade: { ...marketSignal().trade, side: "LONG" as never } });
      const invalidSideResponse = await post(api.base, invalidSide, TOKEN);
      assert.equal(invalidSideResponse.status, 400);
      assert.equal((await invalidSideResponse.json() as { error: string }).error, "AXI_SIGNAL_SIDE_INVALID");

      const invalidGeometry = marketSignal({ signal_id: "invalid-geometry-0001", trade: { ...marketSignal().trade, stop_loss: 110 } });
      const invalidGeometryResponse = await post(api.base, invalidGeometry, TOKEN);
      assert.equal(invalidGeometryResponse.status, 400);
      assert.equal((await invalidGeometryResponse.json() as { error: string }).error, "AXI_SIGNAL_PRICE_GEOMETRY_INVALID");

      const invalidRr = marketSignal({ signal_id: "invalid-rr-0001", trade: { ...marketSignal().trade, rr: Number.POSITIVE_INFINITY } });
      const invalidRrResponse = await post(api.base, invalidRr, TOKEN);
      assert.equal(invalidRrResponse.status, 400);
      assert.equal((await invalidRrResponse.json() as { error: string }).error, "AXI_SIGNAL_RR_INVALID");

      const unexpectedField = { ...marketSignal({ signal_id: "invalid-fields-0001" }), unsafe_setup_metadata: "rejected" };
      const unexpectedFieldResponse = await post(api.base, unexpectedField as AxiCryptoSignal, TOKEN);
      assert.equal(unexpectedFieldResponse.status, 400);
      assert.equal((await unexpectedFieldResponse.json() as { error: string }).error, "AXI_SIGNAL_PAYLOAD_FIELDS_INVALID");
    } finally {
      await api.close();
    }
  });

  it("makes retries idempotent and rejects a conflicting payload for the same signal_id", async () => {
    const root = await tempRoot();
    const api = await startApi(root);
    try {
      const firstSignal = marketSignal({ signal_id: "idempotent-0001" });
      assert.equal((await post(api.base, firstSignal, TOKEN)).status, 201);
      const retry = await post(api.base, structuredClone(firstSignal), TOKEN);
      assert.equal(retry.status, 200);
      assert.equal((await retry.json() as { status: string }).status, "DUPLICATE");
      assert.equal(api.repository.list(10).length, 1);

      const conflicting = marketSignal({ signal_id: "idempotent-0001", trade: { ...firstSignal.trade, take_profit: 130, rr: 3 } });
      const conflict = await post(api.base, conflicting, TOKEN);
      assert.equal(conflict.status, 409);
      assert.equal((await conflict.json() as { error: string }).error, "AXI_SIGNAL_ID_CONFLICT");
      assert.equal(api.repository.list(10).length, 1);
    } finally {
      await api.close();
    }
  });

  it("persists the original validated source signal across repository reload", async () => {
    const root = await tempRoot();
    const databaseFilePath = resolve(root, "axi-signals.sqlite");
    const first = await startApi(root, { databaseFilePath });
    try {
      assert.equal((await post(first.base, limitSignal({ signal_id: "reload-0001" }), TOKEN)).status, 201);
    } finally {
      await first.close();
    }

    const repository = await createAxiSignalRepository({ databaseFilePath });
    try {
      const stored = repository.get("reload-0001");
      assert.ok(stored);
      assert.equal(stored.signal.trade.order_type, "LIMIT");
      assert.equal(stored.signal.trade.cancel_price, 115);
      assert.equal(stored.received_at, "2026-09-28T12:00:00.000Z");
    } finally {
      repository.close();
    }
  });

  it("uses the explicit AXI SQLite path override", async () => {
    const root = await tempRoot();
    const databaseFilePath = resolve(root, "configured", "axi.sqlite");
    assert.equal(
      getDefaultAxiSignalDatabasePath({ CRYPTO_EDGE_AXI_SIGNAL_SQLITE_PATH: databaseFilePath }),
      databaseFilePath,
    );
  });

  it("serves list and detail records to CAMP_USER, OWNER, and ADMIN, but not TRUSTED_TESTER", async () => {
    const root = await tempRoot();
    const api = await startApi(root, { defaultSessionRole: "OWNER" });
    try {
      assert.equal((await post(api.base, marketSignal({ signal_id: "read-market-0001" }), TOKEN)).status, 201);
      assert.equal((await post(api.base, limitSignal({ signal_id: "read-limit-0001" }), TOKEN)).status, 201);

      const session = await fetch(`${api.base}/api/lifecycle/session`);
      const cookie = session.headers.get("set-cookie")?.split(";", 1)[0];
      assert.equal(session.status, 200);
      assert.ok(cookie);

      const list = await fetch(`${api.base}/api/v1/trading/signals?limit=1`, { headers: { cookie: cookie! } });
      assert.equal(list.status, 200);
      const listBody = await list.json() as { schema_version: string; signals: Array<{ signal: AxiCryptoSignal }> };
      assert.equal(listBody.schema_version, "axi_signal_list_v1");
      assert.equal(listBody.signals.length, 1);
      assert.equal(listBody.signals[0]?.signal.signal_id, "read-limit-0001");

      const detail = await fetch(`${api.base}/api/v1/trading/signals/read-market-0001`, { headers: { cookie: cookie! } });
      assert.equal(detail.status, 200);
      const detailBody = await detail.json() as { schema_version: string; signal: AxiCryptoSignal };
      assert.equal(detailBody.schema_version, "axi_signal_detail_v1");
      assert.equal(detailBody.signal.setup.setup_id, "independent-setup");
    } finally {
      await api.close();
    }

    const camp = await startApi(root, { defaultSessionRole: "CAMP_USER" });
    try {
      assert.equal((await fetch(`${camp.base}/api/v1/trading/signals`)).status, 200);
      assert.equal((await fetch(`${camp.base}/api/v1/trading/signals/read-market-0001`)).status, 200);
    } finally { await camp.close(); }

    const denied = await startApi(root, { defaultSessionRole: "TRUSTED_TESTER" });
    try {
      const response = await fetch(`${denied.base}/api/v1/trading/signals`);
      assert.equal(response.status, 403);
      assert.equal((await response.json() as { error: string }).error, "axi_signals_forbidden");
    } finally { await denied.close(); }
  });

  it("accepts machine ingress before AIKINTEL browser-session authentication", async () => {
    const root = await tempRoot();
    const api = await startApi(root, {
      authMode: "AIKINTEL",
      aikintelAuth: {
        ssoSecret: AIKINTEL_SSO_SECRET,
        actorKey: AIKINTEL_ACTOR_KEY,
        statePath: resolve(root, "aikintel-auth.json"),
      },
    });
    try {
      const ingress = await post(api.base, marketSignal({ signal_id: "no-browser-session-0001" }), TOKEN);
      assert.equal(ingress.status, 201);
      assert.equal((await ingress.json() as { status: string }).status, "CREATED");

      const readWithoutSession = await fetch(`${api.base}/api/v1/trading/signals`);
      assert.equal(readWithoutSession.status, 401);
    } finally {
      await api.close();
    }
  });
});

function marketSignal(overrides: Partial<AxiCryptoSignal> = {}): AxiCryptoSignal {
  const signal: AxiCryptoSignal = {
    schema_version: "axi_crypto_signal_v1",
    event_type: "SIGNAL_CREATED",
    signal_id: "market-0001",
    source: {
      provider: "AXI",
      engine: "ALLinCrypto Engine",
      engine_version: "1.2.3",
      strategy_version: "2026.09",
      terminal_id: "axi-mt4-primary",
    },
    setup: {
      setup_id: "independent-setup",
      setup_name: "Independent setup",
      timeframe: "M5",
      family: "unbounded-family",
      max_hold_seconds: null,
    },
    trade: {
      symbol: "BTCUSD",
      side: "BUY",
      order_type: "MARKET",
      source_signal_time: "2026-09-28T11:59:59.000Z",
      source_time_basis: "AXI_SERVER",
      entry_price: 100,
      stop_loss: 90,
      take_profit: 120,
      rr: 2,
      cancel_price: null,
      valid_for_seconds: null,
    },
  };
  return { ...signal, ...overrides };
}

function limitSignal(overrides: Partial<AxiCryptoSignal> = {}): AxiCryptoSignal {
  const signal = marketSignal({
    signal_id: "limit-0001",
    trade: {
      symbol: "ETHUSD",
      side: "SELL",
      order_type: "LIMIT",
      source_signal_time: "2026-09-28T11:58:59.000Z",
      source_time_basis: "AXI_SERVER",
      entry_price: 100,
      stop_loss: 110,
      take_profit: 80,
      rr: 2,
      cancel_price: 115,
      valid_for_seconds: 900,
    },
  });
  return { ...signal, ...overrides };
}

async function startApi(
  root: string,
  options: {
    featureFlagEnvironment?: Record<string, string | undefined>;
    databaseFilePath?: string;
    defaultSessionRole?: "TRUSTED_TESTER" | "CAMP_USER" | "OWNER" | "ADMIN";
    authMode?: ScannerApiHandlerOptions["authMode"];
    aikintelAuth?: ScannerApiHandlerOptions["aikintelAuth"];
  } = {},
): Promise<{ base: string; repository: AxiSignalRepository; close: () => Promise<void> }> {
  const repository = await createAxiSignalRepository({ databaseFilePath: options.databaseFilePath ?? resolve(root, "axi-signals.sqlite") });
  const server = createServer(createScannerApiHandler({
    runtimeMode: "DEVELOPMENT_DEMO",
    authMode: options.authMode,
    aikintelAuth: options.aikintelAuth,
    lifecycle: {
      defaultSessionRole: options.defaultSessionRole,
      campIdentityRegistryPath: resolve(root, "camp-identities.json"),
    },
    axiSignals: {
      repository,
      token: TOKEN,
      featureFlagEnvironment: options.featureFlagEnvironment ?? { CRYPTO_EDGE_AXI_SIGNALS: "1" },
      now: () => new Date("2026-09-28T12:00:00.000Z"),
    },
  }));
  await listen(server);
  return {
    base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    repository,
    close: async () => {
      await close(server);
      repository.close();
    },
  };
}

function post(base: string, signal: AxiCryptoSignal, token: string): Promise<Response> {
  return fetch(`${base}/api/v1/trading/signals/axi`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(signal),
  });
}

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(resolve(tmpdir(), "crypto-edge-axi-signal-"));
  roots.push(root);
  return root;
}

function listen(server: Server): Promise<void> {
  return new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolveListen();
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
}
