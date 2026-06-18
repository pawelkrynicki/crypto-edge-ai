import { evaluateSecurity } from "./securityRules.js";
import type {
  GoPlusTokenSecurityResponse,
  HoneypotTokenResponse,
  NormalizedSecurity,
  SecurityCandidate,
  SecurityPocOutput
} from "./types.js";

type NormalizeSecurityInput = {
  candidate: SecurityCandidate;
  goplusRaw: GoPlusTokenSecurityResponse | null;
  honeypotRaw: HoneypotTokenResponse | null;
  mode: "fixture" | "live";
  now?: Date;
};

export function normalizeSecurity(input: NormalizeSecurityInput): SecurityPocOutput {
  const goplusToken = extractGoPlusToken(input.goplusRaw, input.candidate.contract_address);
  const missingData: string[] = [];
  const riskFlags: string[] = [];

  const goplusHoneypot = toBoolean(readFirst(goplusToken, ["is_honeypot", "honeypot"]));
  const honeypotIsHoneypot = toBoolean(readFirst(input.honeypotRaw, ["honeypotResult.isHoneypot", "isHoneypot", "honeypot"]));

  if (goplusHoneypot === true) riskFlags.push("goplus_honeypot_failed");
  if (goplusHoneypot === false) riskFlags.push("goplus_honeypot_passed");
  if (honeypotIsHoneypot === true) riskFlags.push("honeypot_is_failed");
  if (honeypotIsHoneypot === false) riskFlags.push("honeypot_is_passed");

  const security: NormalizedSecurity = {
    sources: [
      ...(input.goplusRaw ? (["goplus"] as const) : []),
      ...(input.honeypotRaw ? (["honeypot"] as const) : [])
    ],
    honeypot_status: mergeHoneypotStatus(goplusHoneypot, honeypotIsHoneypot),
    buy_tax: firstNumberAsPercent([
      readFirst(goplusToken, ["buy_tax"]),
      readFirst(input.honeypotRaw, ["simulationResult.buyTax", "summary.buyTax"])
    ]),
    sell_tax: firstNumberAsPercent([
      readFirst(goplusToken, ["sell_tax"]),
      readFirst(input.honeypotRaw, ["simulationResult.sellTax", "summary.sellTax"])
    ]),
    contract_verified: toBoolean(readFirst(goplusToken, ["is_open_source", "contract_verified"])),
    ownership_status: normalizeOwnershipStatus(goplusToken),
    liquidity_locked: toBoolean(readFirst(goplusToken, ["liquidity_locked", "lp_locked"])),
    liquidity_lock_days: toNumber(readFirst(goplusToken, ["liquidity_lock_days", "lp_lock_days"])),
    mint_risk: toBoolean(readFirst(goplusToken, ["is_mintable", "mint_risk"])),
    blacklist_risk: toBoolean(readFirst(goplusToken, ["is_blacklisted", "blacklist_risk"])),
    whitelist_risk: toBoolean(readFirst(goplusToken, ["is_whitelisted", "whitelist_risk"])),
    sell_restriction_risk: toBoolean(readFirst(goplusToken, ["cannot_sell_all", "sell_restriction_risk", "trading_cooldown"])),
    proxy_risk: toBoolean(readFirst(goplusToken, ["is_proxy", "proxy_risk"])),
    top_wallet_pct: firstNumberAsPercent([readFirst(goplusToken, ["top_wallet_pct", "creator_percent"])]),
    top_10_wallets_pct: firstNumberAsPercent([readFirst(goplusToken, ["top_10_wallets_pct", "holders_top10_percent"])]),
    risk_flags: riskFlags,
    missing_data: missingData,
    raw_sources_available: {
      goplus: Boolean(input.goplusRaw),
      honeypot: Boolean(input.honeypotRaw)
    }
  };

  collectMissingData(security);
  const decision = evaluateSecurity(security);

  return {
    source: "security-poc",
    mode: input.mode,
    generated_at: (input.now ?? new Date()).toISOString(),
    candidate: input.candidate,
    security,
    decision
  };
}

function collectMissingData(security: NormalizedSecurity): void {
  const fields: Array<keyof NormalizedSecurity> = [
    "honeypot_status",
    "buy_tax",
    "sell_tax",
    "contract_verified",
    "liquidity_locked",
    "top_wallet_pct",
    "top_10_wallets_pct"
  ];

  for (const field of fields) {
    if (security[field] === null || security[field] === "unknown") {
      security.missing_data.push(String(field));
    }
  }

  if (!security.raw_sources_available.goplus) {
    security.missing_data.push("goplus_source");
  }
  if (!security.raw_sources_available.honeypot) {
    security.missing_data.push("honeypot_source");
  }
}

function extractGoPlusToken(raw: GoPlusTokenSecurityResponse | null, contractAddress: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  const result = raw.result;
  if (!isRecord(result)) return raw;

  if (contractAddress) {
    const direct = result[contractAddress] ?? result[contractAddress.toLowerCase()];
    if (isRecord(direct)) return direct;
  }

  const firstValue = Object.values(result)[0];
  return isRecord(firstValue) ? firstValue : raw;
}

function mergeHoneypotStatus(goplus: boolean | null, honeypot: boolean | null): "passed" | "failed" | "unknown" {
  if (goplus === true || honeypot === true) return "failed";
  if (goplus === false || honeypot === false) return "passed";
  return "unknown";
}

function normalizeOwnershipStatus(raw: Record<string, unknown> | null): "renounced" | "active" | "unknown" {
  const owner = readFirst(raw, ["owner_address", "owner"]);
  const canTakeBackOwnership = toBoolean(readFirst(raw, ["can_take_back_ownership"]));
  const hiddenOwner = toBoolean(readFirst(raw, ["hidden_owner"]));

  if (canTakeBackOwnership === true || hiddenOwner === true) return "active";
  if (typeof owner === "string") {
    const normalized = owner.toLowerCase();
    if (normalized === "" || normalized === "0x0000000000000000000000000000000000000000") return "renounced";
    return "active";
  }
  return "unknown";
}

function firstNumberAsPercent(values: unknown[]): number | null {
  for (const value of values) {
    const parsed = toNumber(value);
    if (parsed === null) continue;
    return parsed > 0 && parsed <= 1 ? parsed * 100 : parsed;
  }
  return null;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  if (typeof value === "string") {
    const normalized = value.toLowerCase();
    if (["1", "true", "yes", "failed"].includes(normalized)) return true;
    if (["0", "false", "no", "passed"].includes(normalized)) return false;
  }
  return null;
}

function readFirst(raw: unknown, paths: string[]): unknown {
  for (const path of paths) {
    const value = readPath(raw, path);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return null;
}

function readPath(raw: unknown, path: string): unknown {
  if (!isRecord(raw)) return undefined;
  const parts = path.split(".");
  let current: unknown = raw;

  for (const part of parts) {
    if (!isRecord(current)) return undefined;
    current = current[part];
  }

  return current;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
