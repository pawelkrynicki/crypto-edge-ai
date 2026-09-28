import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { describe, it } from "node:test";
import type { AddressInfo } from "node:net";
import {
  createKrakenAccountSource,
  createKrakenFuturesAuthent,
  type KrakenAccountSnapshot,
} from "../server/krakenAccount.js";
import { createScannerApiHandler } from "../server/scannerApiHandler.js";

const OBSERVED_AT = "2026-09-28T12:00:00.000Z";
const API_KEY = "account-test-api-key";
const API_SECRET = "account-test-api-secret";

describe("01E-B Kraken account source", () => {
  it("uses the explicit 10,000 USD Crypto Edge simulated default without credentials or provider calls", async () => {
    let calls = 0;
    const source = createKrakenAccountSource({
      env: {},
      fetchImpl: async () => { calls += 1; throw new Error("must not call Kraken"); },
      now: () => new Date(OBSERVED_AT),
    });

    const snapshot = await source.getSnapshot();
    assert.equal(snapshot.mode, "SIMULATED");
    assert.equal(snapshot.connection_status, "SIMULATED");
    assert.equal(snapshot.source, "CRYPTO_EDGE_SIMULATION");
    assert.equal(snapshot.equity_usd, 10_000);
    assert.equal(snapshot.available_margin_usd, 10_000);
    assert.equal(snapshot.execution_enabled, false);
    assert.equal(calls, 0);
  });

  it("uses simulated equity and available-margin environment overrides", async () => {
    const source = createKrakenAccountSource({
      env: {
        CRYPTO_EDGE_KRAKEN_SIMULATED_EQUITY_USD: "2500.5",
        CRYPTO_EDGE_KRAKEN_SIMULATED_AVAILABLE_MARGIN_USD: "1750.25",
      },
      now: () => new Date(OBSERVED_AT),
    });
    const snapshot = await source.getSnapshot();
    assert.equal(snapshot.equity_usd, 2500.5);
    assert.equal(snapshot.available_margin_usd, 1750.25);
  });

  it("fails closed for non-positive simulated equity or negative available margin", async () => {
    const invalidEquity = createKrakenAccountSource({
      env: { CRYPTO_EDGE_KRAKEN_SIMULATED_EQUITY_USD: "0" },
      now: () => new Date(OBSERVED_AT),
    });
    assert.equal((await invalidEquity.getSnapshot()).connection_status, "UNAVAILABLE");

    const negativeMargin = createKrakenAccountSource({
      env: {
        CRYPTO_EDGE_KRAKEN_SIMULATED_EQUITY_USD: "1000",
        CRYPTO_EDGE_KRAKEN_SIMULATED_AVAILABLE_MARGIN_USD: "-1",
      },
      now: () => new Date(OBSERVED_AT),
    });
    assert.equal((await negativeMargin.getSnapshot()).connection_status, "UNAVAILABLE");
  });

  it("returns NOT_CONFIGURED for live mode without both server-side credentials", async () => {
    let calls = 0;
    const source = createKrakenAccountSource({
      env: { CRYPTO_EDGE_KRAKEN_MODE: "KRAKEN_LIVE", CRYPTO_EDGE_KRAKEN_FUTURES_API_KEY: API_KEY },
      fetchImpl: async () => { calls += 1; throw new Error("must not call Kraken"); },
      now: () => new Date(OBSERVED_AT),
    });
    const snapshot = await source.getSnapshot();
    assert.equal(snapshot.connection_status, "NOT_CONFIGURED");
    assert.equal(snapshot.equity_usd, null);
    assert.equal(calls, 0);
  });

  it("creates documented deterministic Authent signatures", () => {
    assert.equal(
      createKrakenFuturesAuthent(
        "a3Jha2VuLXRlc3Qtc2VjcmV0LXYx",
        "/api/v3/accounts",
        "nonce=42",
        "1700000000000",
      ),
      "4Ar753vTBxp2Esw5DeGHuWDnavv3SXi7CXLtoQfom7WNuCMfJ9FabMoHPGpBdP8aE/BT590EPSEIA+zLG9bvww==",
    );
  });

  it("normalizes read-only permissions and flex account fields without returning credentials", async () => {
    const requests: Array<{ url: string; headers: Headers }> = [];
    const source = createKrakenAccountSource({
      env: liveEnvironment(),
      fetchImpl: async (input, init) => {
        requests.push({ url: String(input), headers: new Headers(init?.headers) });
        if (requests.length === 1) return jsonResponse({ permissions: { general: "READ_ONLY", transfer: "NO_ACCESS" } });
        return jsonResponse({
          accounts: {
            flex: {
              type: "multiCollateralMarginAccount",
              marginEquity: "1234.56",
              availableMargin: 1010.25,
              portfolioValue: "1250",
              collateralValue: "1220",
              initialMargin: "50",
              maintenanceMargin: "20",
              pnl: "-5.5",
              totalUnrealized: "2.75",
            },
          },
        });
      },
      now: () => new Date(OBSERVED_AT),
    });

    const snapshot = await source.getSnapshot();
    assert.equal(snapshot.connection_status, "CONNECTED_READ_ONLY");
    assert.deepEqual(snapshot.permissions, { general: "READ_ONLY", transfer: "NO_ACCESS" });
    assert.equal(snapshot.equity_usd, 1234.56);
    assert.equal(snapshot.available_margin_usd, 1010.25);
    assert.equal(snapshot.pnl_usd, -5.5);
    assert.equal(snapshot.total_unrealized_usd, 2.75);
    assert.equal(requests.length, 2);
    assert.equal(requests[0]?.url, "https://futures.kraken.com/api/auth/v1/api-keys/v3/check");
    assert.equal(requests[1]?.url, "https://futures.kraken.com/derivatives/api/v3/accounts");
    assert.equal(requests[0]?.headers.get("APIKey"), API_KEY);
    assert.ok(requests[0]?.headers.get("Authent"));
    assert.equal(
      requests[1]?.headers.get("Authent"),
      createKrakenFuturesAuthent(API_SECRET, "/api/v3/accounts"),
    );
    assert.ok(!JSON.stringify(snapshot).includes(API_KEY));
    assert.ok(!JSON.stringify(snapshot).includes(API_SECRET));
  });

  it("fails closed on missing flex, authentication failures, network failures, and timeouts", async () => {
    const missingFlex = createKrakenAccountSource({
      env: liveEnvironment(),
      fetchImpl: async () => jsonResponse({ permissions: { general: "READ_ONLY", transfer: "NO_ACCESS" } }),
      now: () => new Date(OBSERVED_AT),
    });
    assert.equal((await missingFlex.getSnapshot()).connection_status, "INVALID_RESPONSE");

    const authFailure = createKrakenAccountSource({
      env: liveEnvironment(),
      fetchImpl: async () => new Response("denied", { status: 401 }),
      now: () => new Date(OBSERVED_AT),
    });
    assert.equal((await authFailure.getSnapshot()).connection_status, "AUTH_FAILED");

    const networkFailure = createKrakenAccountSource({
      env: liveEnvironment(),
      fetchImpl: async () => { throw new Error("network down"); },
      now: () => new Date(OBSERVED_AT),
    });
    assert.equal((await networkFailure.getSnapshot()).connection_status, "UNAVAILABLE");

    const timeout = createKrakenAccountSource({
      env: liveEnvironment(),
      timeoutMs: 100,
      fetchImpl: async (_input, init) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      }),
      now: () => new Date(OBSERVED_AT),
    });
    assert.equal((await timeout.getSnapshot()).connection_status, "UNAVAILABLE");
  });

  it("serves a session-protected secrets-free snapshot only when the canonical Kraken flag is enabled", async () => {
    const source = simulatedSource();
    const enabled = await startApi(source, { CRYPTO_EDGE_KRAKEN: "1" });
    try {
      const response = await fetch(`${enabled.base}/api/v1/trading/kraken/account`);
      assert.equal(response.status, 200);
      const raw = await response.text();
      assert.ok(!raw.includes(API_KEY));
      assert.ok(!raw.includes(API_SECRET));
      assert.deepEqual(JSON.parse(raw) as KrakenAccountSnapshot, await source.getSnapshot());
    } finally {
      await enabled.close();
    }

    const disabled = await startApi(source, {});
    try {
      const response = await fetch(`${disabled.base}/api/v1/trading/kraken/account`);
      assert.equal(response.status, 503);
      assert.equal((await response.json() as { error: string }).error, "KRAKEN_COPY_DISABLED");
    } finally {
      await disabled.close();
    }
  });

  it("keeps KRAKEN_LIVE account readiness limited to the owner pilot", async () => {
    const source = simulatedSource();
    const ownerPilotSource = { mode: "KRAKEN_LIVE" as const, getSnapshot: source.getSnapshot };
    const camp = await startApi(ownerPilotSource, { CRYPTO_EDGE_KRAKEN: "1" });
    try {
      assert.equal((await fetch(`${camp.base}/api/v1/trading/kraken/account`)).status, 403);
    } finally {
      await camp.close();
    }

    const owner = await startApi(ownerPilotSource, { CRYPTO_EDGE_KRAKEN: "1" }, "OWNER");
    try {
      assert.equal((await fetch(`${owner.base}/api/v1/trading/kraken/account`)).status, 200);
    } finally {
      await owner.close();
    }
  });
});

function liveEnvironment(): Record<string, string> {
  return {
    CRYPTO_EDGE_KRAKEN_MODE: "KRAKEN_LIVE",
    CRYPTO_EDGE_KRAKEN_FUTURES_API_KEY: API_KEY,
    CRYPTO_EDGE_KRAKEN_FUTURES_API_SECRET: API_SECRET,
  };
}

function simulatedSource() {
  return createKrakenAccountSource({ env: {}, now: () => new Date(OBSERVED_AT) });
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
}

async function startApi(
  accountSource: { mode: "SIMULATED" | "KRAKEN_LIVE"; getSnapshot: () => Promise<KrakenAccountSnapshot> },
  featureFlagEnvironment: Record<string, string | undefined>,
  defaultSessionRole: "CAMP_USER" | "OWNER" = "CAMP_USER",
) {
  const server = createServer(createScannerApiHandler({
    runtimeMode: "DEVELOPMENT_DEMO",
    lifecycle: { defaultSessionRole },
    krakenCopy: { accountSource, featureFlagEnvironment },
  }));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return {
    base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: () => close(server),
  };
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
