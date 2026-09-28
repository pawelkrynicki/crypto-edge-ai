export const KRAKEN_ACCOUNT_SNAPSHOT_SCHEMA_VERSION = "crypto_edge_kraken_account_snapshot_v1" as const;

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

/**
 * Browser-safe projection of the server account contract. Deliberately, this
 * model has no credential fields and the browser performs no Kraken requests.
 */
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

export class KrakenAccountDataSourceError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(code);
    this.name = "KrakenAccountDataSourceError";
    this.status = status;
    this.code = code;
  }
}

/** Reads the session-protected Crypto Edge endpoint, never Kraken directly. */
export async function loadKrakenAccountSnapshot(
  fetchImpl: typeof fetch = fetch,
): Promise<KrakenAccountSnapshot> {
  const response = await fetchImpl("/api/v1/trading/kraken/account", {
    method: "GET",
    credentials: "same-origin",
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw await parseError(response);
  const value: unknown = await response.json();
  if (!isKrakenAccountSnapshot(value)) {
    throw new KrakenAccountDataSourceError(502, "KRAKEN_ACCOUNT_RESPONSE_INVALID");
  }
  return value;
}

/** Short application-facing name used by the Kraken Copy workspace. */
export const loadKrakenAccount = loadKrakenAccountSnapshot;

async function parseError(response: Response): Promise<KrakenAccountDataSourceError> {
  let value: unknown = null;
  try { value = await response.json(); } catch { /* The public error is intentionally generic. */ }
  const code = isRecord(value) && typeof value.error === "string"
    ? value.error
    : "KRAKEN_ACCOUNT_UNAVAILABLE";
  return new KrakenAccountDataSourceError(response.status, code);
}

function isKrakenAccountSnapshot(value: unknown): value is KrakenAccountSnapshot {
  if (!isRecord(value)
    || value.schema_version !== KRAKEN_ACCOUNT_SNAPSHOT_SCHEMA_VERSION
    || !isMode(value.mode)
    || !isConnectionStatus(value.connection_status)
    || !isNullableFiniteNumber(value.equity_usd)
    || !isNullableFiniteNumber(value.available_margin_usd)
    || !isNullableFiniteNumber(value.portfolio_value_usd)
    || !isNullableFiniteNumber(value.collateral_value_usd)
    || !isNullableFiniteNumber(value.initial_margin_usd)
    || !isNullableFiniteNumber(value.maintenance_margin_usd)
    || !isNullableFiniteNumber(value.pnl_usd)
    || !isNullableFiniteNumber(value.total_unrealized_usd)
    || !isNullablePermissions(value.permissions)
    || !isNullableTimestamp(value.server_time)
    || !isTimestamp(value.observed_at)
    || (value.source !== "CRYPTO_EDGE_SIMULATION" && value.source !== "KRAKEN_FUTURES")
    || value.execution_enabled !== false) return false;
  return value.mode === "SIMULATED"
    ? value.source === "CRYPTO_EDGE_SIMULATION" && value.connection_status === "SIMULATED" && value.permissions === null
    : value.source === "KRAKEN_FUTURES";
}

function isMode(value: unknown): value is KrakenAccountMode {
  return value === "SIMULATED" || value === "KRAKEN_LIVE";
}

function isConnectionStatus(value: unknown): value is KrakenAccountConnectionStatus {
  return value === "SIMULATED"
    || value === "CONNECTED_READ_ONLY"
    || value === "CONNECTED_FULL_ACCESS"
    || value === "NOT_CONFIGURED"
    || value === "AUTH_FAILED"
    || value === "UNAVAILABLE"
    || value === "INVALID_RESPONSE";
}

function isNullableFiniteNumber(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function isNullablePermissions(value: unknown): value is KrakenAccountSnapshot["permissions"] {
  return value === null || (isRecord(value) && isPermission(value.general) && isPermission(value.transfer));
}

function isPermission(value: unknown): value is KrakenPermission {
  return value === "NO_ACCESS" || value === "READ_ONLY" || value === "FULL_ACCESS";
}

function isNullableTimestamp(value: unknown): value is string | null {
  return value === null || isTimestamp(value);
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
