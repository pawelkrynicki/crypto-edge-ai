import type { KrakenAccountSnapshot } from "./krakenAccount.js";
import type { KrakenOrderIntent } from "./krakenOrderIntent.js";

export const HARD_MAX_KRAKEN_LIVE_PILOT_NOTIONAL_USD = 25 as const;

export type KrakenLivePilotGateReason =
  | "NOT_OWNER"
  | "EXECUTION_FLAG_OFF"
  | "PILOT_FLAG_OFF"
  | "KRAKEN_MODE_NOT_LIVE"
  | "ACCOUNT_NOT_LIVE"
  | "ACCOUNT_NOT_FULL_ACCESS"
  | "APPROVED_INTENT_MISSING"
  | "INTENT_NOT_APPROVED"
  | "PILOT_SYMBOL_MISSING"
  | "SYMBOL_NOT_APPROVED"
  | "PILOT_MAX_NOTIONAL_INVALID"
  | "PILOT_MAX_NOTIONAL_ABOVE_HARD_CAP"
  | "ORDER_INTENT_NOT_READY";

export type KrakenLivePilotConfig = {
  execution_enabled: boolean;
  pilot_enabled: boolean;
  approved_intent_id: string | null;
  approved_symbol: string | null;
  configured_max_notional_usd: number | null;
  hard_max_notional_usd: typeof HARD_MAX_KRAKEN_LIVE_PILOT_NOTIONAL_USD;
};

export type KrakenLivePilotGateDecision = {
  allowed: boolean;
  reasons: KrakenLivePilotGateReason[];
  config: KrakenLivePilotConfig;
};

export function evaluateKrakenLivePilotGate(input: {
  env?: Readonly<Record<string, string | undefined>>;
  role: string;
  account: KrakenAccountSnapshot;
  intent: KrakenOrderIntent;
}): KrakenLivePilotGateDecision {
  const env = input.env ?? process.env;
  const executionEnabled = parseStrictBoolean(env.CRYPTO_EDGE_EXECUTION) === true;
  const pilotEnabled = parseStrictBoolean(env.CRYPTO_EDGE_KRAKEN_LIVE_PILOT) === true;
  const approvedIntentId = nonEmpty(env.CRYPTO_EDGE_KRAKEN_LIVE_PILOT_INTENT_ID);
  const approvedSymbol = nonEmpty(env.CRYPTO_EDGE_KRAKEN_LIVE_PILOT_SYMBOL);
  const configuredMax = positiveFinite(env.CRYPTO_EDGE_KRAKEN_LIVE_PILOT_MAX_NOTIONAL_USD);

  const config: KrakenLivePilotConfig = {
    execution_enabled: executionEnabled,
    pilot_enabled: pilotEnabled,
    approved_intent_id: approvedIntentId,
    approved_symbol: approvedSymbol,
    configured_max_notional_usd: configuredMax,
    hard_max_notional_usd: HARD_MAX_KRAKEN_LIVE_PILOT_NOTIONAL_USD,
  };

  const reasons: KrakenLivePilotGateReason[] = [];

  if (input.role !== "OWNER") reasons.push("NOT_OWNER");
  if (!executionEnabled) reasons.push("EXECUTION_FLAG_OFF");
  if (!pilotEnabled) reasons.push("PILOT_FLAG_OFF");
  if (env.CRYPTO_EDGE_KRAKEN_MODE?.trim() !== "KRAKEN_LIVE") reasons.push("KRAKEN_MODE_NOT_LIVE");
  if (input.account.mode !== "KRAKEN_LIVE") reasons.push("ACCOUNT_NOT_LIVE");
  if (
    input.account.connection_status !== "CONNECTED_FULL_ACCESS"
    || input.account.permissions?.general !== "FULL_ACCESS"
  ) reasons.push("ACCOUNT_NOT_FULL_ACCESS");
  if (!approvedIntentId) reasons.push("APPROVED_INTENT_MISSING");
  else if (approvedIntentId !== input.intent.intent_id) reasons.push("INTENT_NOT_APPROVED");
  if (!approvedSymbol) reasons.push("PILOT_SYMBOL_MISSING");
  else if (approvedSymbol !== input.intent.kraken_symbol) reasons.push("SYMBOL_NOT_APPROVED");
  if (configuredMax === null) reasons.push("PILOT_MAX_NOTIONAL_INVALID");
  else if (configuredMax > HARD_MAX_KRAKEN_LIVE_PILOT_NOTIONAL_USD) {
    reasons.push("PILOT_MAX_NOTIONAL_ABOVE_HARD_CAP");
  }
  if (input.intent.status !== "READY") reasons.push("ORDER_INTENT_NOT_READY");

  return { allowed: reasons.length === 0, reasons, config };
}

function parseStrictBoolean(value: string | undefined): boolean | null {
  if (value === undefined) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "1" || normalized === "true") return true;
  if (normalized === "0" || normalized === "false") return false;
  return null;
}

function nonEmpty(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function positiveFinite(value: string | undefined): number | null {
  if (!value?.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
