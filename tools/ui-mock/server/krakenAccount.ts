import { createHash, createHmac } from "node:crypto";

export const KRAKEN_ACCOUNT_SNAPSHOT_SCHEMA_VERSION = "crypto_edge_kraken_account_snapshot_v1" as const;
export const KRAKEN_FUTURES_REST_BASE = "https://futures.kraken.com/derivatives/api/v3" as const;
export const KRAKEN_FUTURES_API_KEY_CHECK_URL = "https://futures.kraken.com/api/auth/v1/api-keys/v3/check" as const;
// The public URL has the /derivatives deployment prefix, while Kraken's
// documented Authent endpointPath for Futures v3 is the API path below.
export const KRAKEN_FUTURES_ACCOUNTS_PATH = "/api/v3/accounts" as const;
export const KRAKEN_FUTURES_API_KEY_CHECK_PATH = "/api/auth/v1/api-keys/v3/check" as const;
export const DEFAULT_KRAKEN_ACCOUNT_TIMEOUT_MS = 5_000;

export type KrakenAccountMode = "SIMULATED" | "KRAKEN_LIVE";
export type KrakenAccountConnectionStatus =
  | "SIMULATED"
  | "CONNECTED_READ_ONLY"
  | "CONNECTED_FULL_ACCESS"
  | "NOT_CONFIGURED"
  | "AUTH_FAILED"
  | "UNAVAILABLE"
  | "INVALID_RESPONSE";
export type KrakenPermission = "NO_ACCESS" | "READ_ONLY" | "FULL_ACCESS";

export type KrakenAccountSnapshot = {
  schema_version: typeof KRAKEN_ACCOUNT_SNAPSHOT_SCHEMA_VERSION;
  mode: KrakenAccountMode;
  connection_status: KrakenAccountConnectionStatus;
  equity_usd: number | null;
  available_margin_usd: number | null;
  portfolio_value_usd: number | null;
  collateral_value_usd: number | null;
  initial_margin_usd: number | null;
  maintenance_margin_usd: number | null;
  pnl_usd: number | null;
  total_unrealized_usd: number | null;
  permissions: { general: KrakenPermission; transfer: KrakenPermission } | null;
  server_time: string | null;
  observed_at: string;
  source: "CRYPTO_EDGE_SIMULATION" | "KRAKEN_FUTURES";
  execution_enabled: false;
};

export type KrakenFuturesCredentials = {
  apiKey: string;
  apiSecret: string;
};

/**
 * Credential sources are intentionally server-only. Environment credentials
 * are the initial owner-pilot implementation; a per-user encrypted source can
 * implement this interface later without changing the account reader.
 */
export type KrakenFuturesCredentialSource = {
  getCredentials(): KrakenFuturesCredentials | null;
};

export type KrakenAccountSource = {
  /** This exposes no credentials; it only supports the owner-pilot route guard. */
  readonly mode: KrakenAccountMode;
  getSnapshot(): Promise<KrakenAccountSnapshot>;
};

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export function createEnvironmentKrakenFuturesCredentialSource(
  env: Readonly<Record<string, string | undefined>> = process.env,
): KrakenFuturesCredentialSource {
  return {
    getCredentials(): KrakenFuturesCredentials | null {
      const apiKey = env.CRYPTO_EDGE_KRAKEN_FUTURES_API_KEY?.trim();
      const apiSecret = env.CRYPTO_EDGE_KRAKEN_FUTURES_API_SECRET?.trim();
      return apiKey && apiSecret ? { apiKey, apiSecret } : null;
    },
  };
}

export function resolveKrakenAccountMode(
  env: Readonly<Record<string, string | undefined>> = process.env,
): KrakenAccountMode {
  return env.CRYPTO_EDGE_KRAKEN_MODE?.trim() === "KRAKEN_LIVE" ? "KRAKEN_LIVE" : "SIMULATED";
}

export function createKrakenAccountSource(options: {
  env?: Readonly<Record<string, string | undefined>>;
  mode?: KrakenAccountMode;
  credentialSource?: KrakenFuturesCredentialSource;
  fetchImpl?: FetchLike;
  now?: () => Date;
  timeoutMs?: number;
} = {}): KrakenAccountSource {
  const env = options.env ?? process.env;
  const mode = options.mode ?? resolveKrakenAccountMode(env);
  const credentialSource = options.credentialSource ?? createEnvironmentKrakenFuturesCredentialSource(env);
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => new Date());
  const timeoutMs = sanitizeTimeout(options.timeoutMs ?? DEFAULT_KRAKEN_ACCOUNT_TIMEOUT_MS);

  return {
    mode,
    async getSnapshot(): Promise<KrakenAccountSnapshot> {
      const observedAt = validIso(now()) ?? new Date().toISOString();
      if (mode === "SIMULATED") return createSimulatedSnapshot(env, observedAt);
      return readLiveSnapshot({ credentialSource, fetchImpl, observedAt, timeoutMs });
    },
  };
}

/** The documented Kraken Futures Authent payload: SHA256(postData + nonce + endpointPath), then HMAC-SHA512. */
export function createKrakenFuturesAuthent(
  apiSecret: string,
  endpointPath: string,
  postData = "",
  nonce = "",
): string {
  const payloadHash = createHash("sha256")
    .update(`${postData}${nonce}${endpointPath}`, "utf8")
    .digest();
  return createHmac("sha512", Buffer.from(apiSecret, "base64"))
    .update(payloadHash)
    .digest("base64");
}

function createSimulatedSnapshot(
  env: Readonly<Record<string, string | undefined>>,
  observedAt: string,
): KrakenAccountSnapshot {
  const equity = parseConfiguredPositiveUsd(env.CRYPTO_EDGE_KRAKEN_SIMULATED_EQUITY_USD, 10_000);
  const availableMargin = parseConfiguredNonNegativeUsd(env.CRYPTO_EDGE_KRAKEN_SIMULATED_AVAILABLE_MARGIN_USD, equity);
  if (equity === null || availableMargin === null) {
    return createEmptySnapshot("SIMULATED", "UNAVAILABLE", "CRYPTO_EDGE_SIMULATION", observedAt);
  }
  return {
    ...createEmptySnapshot("SIMULATED", "SIMULATED", "CRYPTO_EDGE_SIMULATION", observedAt),
    equity_usd: equity,
    available_margin_usd: availableMargin,
  };
}

async function readLiveSnapshot({
  credentialSource,
  fetchImpl,
  observedAt,
  timeoutMs,
}: {
  credentialSource: KrakenFuturesCredentialSource;
  fetchImpl: FetchLike;
  observedAt: string;
  timeoutMs: number;
}): Promise<KrakenAccountSnapshot> {
  const credentials = credentialSource.getCredentials();
  if (!credentials) return createEmptySnapshot("KRAKEN_LIVE", "NOT_CONFIGURED", "KRAKEN_FUTURES", observedAt);

  try {
    const keyCheckResponse = await privateKrakenGet({
      fetchImpl,
      url: KRAKEN_FUTURES_API_KEY_CHECK_URL,
      endpointPath: KRAKEN_FUTURES_API_KEY_CHECK_PATH,
      credentials,
      timeoutMs,
    });
    if (isAuthenticationFailure(keyCheckResponse.status)) {
      return createEmptySnapshot("KRAKEN_LIVE", "AUTH_FAILED", "KRAKEN_FUTURES", observedAt);
    }
    if (!keyCheckResponse.ok) return createEmptySnapshot("KRAKEN_LIVE", "UNAVAILABLE", "KRAKEN_FUTURES", observedAt);
    const keyCheckPayload = await parseJson(keyCheckResponse);
    if (!keyCheckPayload.ok) {
      return createEmptySnapshot("KRAKEN_LIVE", "INVALID_RESPONSE", "KRAKEN_FUTURES", observedAt);
    }
    const permissions = normalizePermissions(keyCheckPayload.value);
    if (!permissions) return createEmptySnapshot("KRAKEN_LIVE", "INVALID_RESPONSE", "KRAKEN_FUTURES", observedAt);

    const accountsResponse = await privateKrakenGet({
      fetchImpl,
      url: `${KRAKEN_FUTURES_REST_BASE}/accounts`,
      endpointPath: KRAKEN_FUTURES_ACCOUNTS_PATH,
      credentials,
      timeoutMs,
    });
    if (isAuthenticationFailure(accountsResponse.status)) {
      return createEmptySnapshot("KRAKEN_LIVE", "AUTH_FAILED", "KRAKEN_FUTURES", observedAt, permissions);
    }
    if (!accountsResponse.ok) return createEmptySnapshot("KRAKEN_LIVE", "UNAVAILABLE", "KRAKEN_FUTURES", observedAt, permissions);

    const accountsPayload = await parseJson(accountsResponse);
    if (!accountsPayload.ok) {
      return createEmptySnapshot("KRAKEN_LIVE", "INVALID_RESPONSE", "KRAKEN_FUTURES", observedAt, permissions);
    }
    const normalizedAccount = normalizeFlexMarginAccount(accountsPayload.value);
    if (!normalizedAccount) {
      return createEmptySnapshot("KRAKEN_LIVE", "INVALID_RESPONSE", "KRAKEN_FUTURES", observedAt, permissions);
    }
    return {
      ...normalizedAccount,
      schema_version: KRAKEN_ACCOUNT_SNAPSHOT_SCHEMA_VERSION,
      mode: "KRAKEN_LIVE",
      connection_status: permissions.general === "FULL_ACCESS" ? "CONNECTED_FULL_ACCESS" : "CONNECTED_READ_ONLY",
      permissions,
      observed_at: observedAt,
      source: "KRAKEN_FUTURES",
      execution_enabled: false,
    };
  } catch {
    // Transport and timeout errors are deliberately collapsed into a
    // non-sensitive operational state. Never include credential-bearing errors.
    return createEmptySnapshot("KRAKEN_LIVE", "UNAVAILABLE", "KRAKEN_FUTURES", observedAt);
  }
}

async function privateKrakenGet({
  fetchImpl,
  url,
  endpointPath,
  credentials,
  timeoutMs,
}: {
  fetchImpl: FetchLike;
  url: string;
  endpointPath: string;
  credentials: KrakenFuturesCredentials;
  timeoutMs: number;
}): Promise<Response> {
  const authent = createKrakenFuturesAuthent(credentials.apiSecret, endpointPath);
  return fetchWithTimeout(fetchImpl, url, {
    method: "GET",
    headers: {
      accept: "application/json",
      APIKey: credentials.apiKey,
      Authent: authent,
    },
  }, timeoutMs);
}

async function fetchWithTimeout(
  fetchImpl: FetchLike,
  input: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function parseJson(response: Response): Promise<{ ok: true; value: unknown } | { ok: false }> {
  try {
    return { ok: true, value: await response.json() };
  } catch {
    return { ok: false };
  }
}

function normalizePermissions(value: unknown): KrakenAccountSnapshot["permissions"] {
  if (!isRecord(value) || !isRecord(value.permissions)) return null;
  const general = value.permissions.general;
  const transfer = value.permissions.transfer;
  return isKrakenPermission(general) && isKrakenPermission(transfer) ? { general, transfer } : null;
}

function normalizeFlexMarginAccount(value: unknown): Omit<
  KrakenAccountSnapshot,
  "schema_version" | "mode" | "connection_status" | "permissions" | "observed_at" | "source" | "execution_enabled"
> | null {
  if (!isRecord(value) || !isRecord(value.accounts) || !isRecord(value.accounts.flex)) return null;
  const flex = value.accounts.flex;
  if (flex.type !== "multiCollateralMarginAccount") return null;
  const equity = finiteNumber(flex.marginEquity);
  if (equity === null) return null;
  return {
    equity_usd: equity,
    available_margin_usd: finiteNumber(flex.availableMargin),
    portfolio_value_usd: finiteNumber(flex.portfolioValue),
    collateral_value_usd: finiteNumber(flex.collateralValue),
    initial_margin_usd: finiteNumber(flex.initialMargin),
    maintenance_margin_usd: finiteNumber(flex.maintenanceMargin),
    pnl_usd: finiteNumber(flex.pnl),
    total_unrealized_usd: finiteNumber(flex.totalUnrealized),
    server_time: nullableIso(value.serverTime) ?? nullableIso(value.server_time),
  };
}

function createEmptySnapshot(
  mode: KrakenAccountMode,
  connectionStatus: KrakenAccountConnectionStatus,
  source: KrakenAccountSnapshot["source"],
  observedAt: string,
  permissions: KrakenAccountSnapshot["permissions"] = null,
): KrakenAccountSnapshot {
  return {
    schema_version: KRAKEN_ACCOUNT_SNAPSHOT_SCHEMA_VERSION,
    mode,
    connection_status: connectionStatus,
    equity_usd: null,
    available_margin_usd: null,
    portfolio_value_usd: null,
    collateral_value_usd: null,
    initial_margin_usd: null,
    maintenance_margin_usd: null,
    pnl_usd: null,
    total_unrealized_usd: null,
    permissions,
    server_time: null,
    observed_at: observedAt,
    source,
    execution_enabled: false,
  };
}

function parseConfiguredPositiveUsd(value: string | undefined, fallback: number | null): number | null {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = finiteNumber(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

function parseConfiguredNonNegativeUsd(value: string | undefined, fallback: number | null): number | null {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = finiteNumber(value);
  return parsed !== null && parsed >= 0 ? parsed : null;
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function nullableIso(value: unknown): string | null {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
}

function validIso(value: Date): string | null {
  return Number.isFinite(value.getTime()) ? value.toISOString() : null;
}

function sanitizeTimeout(value: number): number {
  return Number.isSafeInteger(value) && value >= 100 && value <= 30_000 ? value : DEFAULT_KRAKEN_ACCOUNT_TIMEOUT_MS;
}

function isAuthenticationFailure(status: number): boolean {
  return status === 401 || status === 403;
}

function isKrakenPermission(value: unknown): value is KrakenPermission {
  return value === "NO_ACCESS" || value === "READ_ONLY" || value === "FULL_ACCESS";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
