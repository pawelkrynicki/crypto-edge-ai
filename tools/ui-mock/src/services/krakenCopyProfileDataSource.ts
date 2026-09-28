export const KRAKEN_COPY_PROFILE_SCHEMA_VERSION = "crypto_edge_kraken_copy_profile_v1" as const;

export type KrakenCopyProfile = {
  schema_version: typeof KRAKEN_COPY_PROFILE_SCHEMA_VERSION;
  simulated_equity_usd: number;
  risk_pct_per_trade: number;
  max_leverage: number;
  max_position_notional_usd: number | null;
  updated_at: string;
};

export type KrakenCopyProfileWrite = Pick<
  KrakenCopyProfile,
  "simulated_equity_usd" | "risk_pct_per_trade" | "max_leverage" | "max_position_notional_usd"
>;

export class KrakenCopyProfileDataSourceError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(code);
    this.name = "KrakenCopyProfileDataSourceError";
    this.status = status;
    this.code = code;
  }
}

export async function loadKrakenCopyProfile(fetchImpl: typeof fetch = fetch): Promise<KrakenCopyProfile> {
  const response = await fetchImpl("/api/v1/trading/kraken/profile", {
    method: "GET",
    credentials: "same-origin",
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw await parseError(response);
  return parseProfile(await response.json());
}

export async function saveKrakenCopyProfile(
  profile: KrakenCopyProfileWrite,
  fetchImpl: typeof fetch = fetch,
): Promise<KrakenCopyProfile> {
  const response = await fetchImpl("/api/v1/trading/kraken/profile", {
    method: "PUT",
    credentials: "same-origin",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(profile),
  });
  if (!response.ok) throw await parseError(response);
  return parseProfile(await response.json());
}

async function parseError(response: Response): Promise<KrakenCopyProfileDataSourceError> {
  let value: unknown = null;
  try { value = await response.json(); } catch { /* Server errors are intentionally compact. */ }
  return new KrakenCopyProfileDataSourceError(
    response.status,
    isRecord(value) && typeof value.error === "string" ? value.error : "KRAKEN_COPY_PROFILE_UNAVAILABLE",
  );
}

function parseProfile(value: unknown): KrakenCopyProfile {
  if (!isRecord(value)
    || value.schema_version !== KRAKEN_COPY_PROFILE_SCHEMA_VERSION
    || !isPositiveFinite(value.simulated_equity_usd)
    || !isPositiveFinite(value.risk_pct_per_trade)
    || !isFiniteNumber(value.max_leverage) || value.max_leverage < 1
    || (value.max_position_notional_usd !== null && !isPositiveFinite(value.max_position_notional_usd))
    || !isTimestamp(value.updated_at)) {
    throw new KrakenCopyProfileDataSourceError(502, "KRAKEN_COPY_PROFILE_RESPONSE_INVALID");
  }
  return {
    schema_version: KRAKEN_COPY_PROFILE_SCHEMA_VERSION,
    simulated_equity_usd: value.simulated_equity_usd,
    risk_pct_per_trade: value.risk_pct_per_trade,
    max_leverage: value.max_leverage,
    max_position_notional_usd: value.max_position_notional_usd,
    updated_at: value.updated_at,
  };
}

function isPositiveFinite(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
