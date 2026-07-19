import { readFileSync } from "node:fs";
import { resolveRepoFile } from "./sourceRegistryValidator.js";

export const ESTABLISHED_DISCOVERY_PLAN_VERSION = "established_basket_v1";
export const ESTABLISHED_DISCOVERY_QUERY_LIMIT = 5;
export const ESTABLISHED_DISCOVERY_APPROVED_QUERIES = ["USDC", "USDT", "WETH", "WBNB", "SOL"] as const;
export const ESTABLISHED_DISCOVERY_CONFIG_PATH = "config/established_discovery_query_plan_v1.json";
export const ESTABLISHED_ANCHOR_IDENTITY_CONFIDENCE = "SYMBOL_EXACT_DIAGNOSTIC_ONLY";

export type EstablishedDiscoveryQueryPlan = {
  plan_version: typeof ESTABLISHED_DISCOVERY_PLAN_VERSION;
  status: "NO_GO_QUERY_PLAN";
  production_enabled: false;
  provider: "dexscreener";
  endpoint_type: "search";
  query_limit: typeof ESTABLISHED_DISCOVERY_QUERY_LIMIT;
  queries: string[];
  anchor_aliases: Record<string, string[]>;
  supported_chains: string[];
  explicitly_unsupported_chains: string[];
  identity_confidence: typeof ESTABLISHED_ANCHOR_IDENTITY_CONFIDENCE;
  owner_acceptance_required_before_production_integration: true;
};

export function loadEstablishedDiscoveryQueryPlan(
  path = resolveRepoFile(ESTABLISHED_DISCOVERY_CONFIG_PATH),
): EstablishedDiscoveryQueryPlan {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch (error: unknown) {
    throw new Error("ESTABLISHED_DISCOVERY_CONFIG_LOAD_FAILED", { cause: error });
  }
  return validateEstablishedDiscoveryQueryPlan(parsed);
}

export function validateEstablishedDiscoveryQueryPlan(value: unknown): EstablishedDiscoveryQueryPlan {
  if (!isRecord(value)) throw new Error("ESTABLISHED_DISCOVERY_CONFIG_NOT_OBJECT");
  if (value.plan_version !== ESTABLISHED_DISCOVERY_PLAN_VERSION) {
    throw new Error("ESTABLISHED_DISCOVERY_CONFIG_VERSION_UNSUPPORTED");
  }
  if (value.status !== "NO_GO_QUERY_PLAN") {
    throw new Error("ESTABLISHED_DISCOVERY_CONFIG_STATUS_INVALID");
  }
  if (value.production_enabled !== false) throw new Error("ESTABLISHED_DISCOVERY_CONFIG_PRODUCTION_MUST_BE_DISABLED");
  if (value.provider !== "dexscreener" || value.endpoint_type !== "search") {
    throw new Error("ESTABLISHED_DISCOVERY_CONFIG_ENDPOINT_INVALID");
  }
  if (value.query_limit !== ESTABLISHED_DISCOVERY_QUERY_LIMIT) {
    throw new Error("ESTABLISHED_DISCOVERY_CONFIG_QUERY_LIMIT_INVALID");
  }
  if (!Array.isArray(value.queries) || value.queries.length > ESTABLISHED_DISCOVERY_QUERY_LIMIT) {
    throw new Error("ESTABLISHED_DISCOVERY_CONFIG_TOO_MANY_QUERIES");
  }
  if (value.queries.length !== ESTABLISHED_DISCOVERY_APPROVED_QUERIES.length) {
    throw new Error("ESTABLISHED_DISCOVERY_CONFIG_QUERY_SET_INVALID");
  }
  for (let index = 0; index < value.queries.length; index += 1) {
    if (value.queries[index] !== ESTABLISHED_DISCOVERY_APPROVED_QUERIES[index]) {
      throw new Error("ESTABLISHED_DISCOVERY_CONFIG_QUERY_NOT_APPROVED");
    }
  }

  const anchorAliases = requireStringArrayRecord(value.anchor_aliases, "ESTABLISHED_DISCOVERY_CONFIG_ANCHOR_ALIASES_INVALID");
  const expectedAliases: Record<string, string[]> = {
    USDC: ["USDC"],
    USDT: ["USDT"],
    WETH: ["WETH"],
    WBNB: ["WBNB"],
    SOL: ["SOL", "WSOL"],
  };
  if (JSON.stringify(anchorAliases) !== JSON.stringify(expectedAliases)) {
    throw new Error("ESTABLISHED_DISCOVERY_CONFIG_ANCHOR_ALIASES_INVALID");
  }

  const supportedChains = requireStringArray(value.supported_chains, "ESTABLISHED_DISCOVERY_CONFIG_SUPPORTED_CHAINS_INVALID");
  if (JSON.stringify(supportedChains) !== JSON.stringify([
    "ethereum", "bsc", "base", "arbitrum", "polygon", "avalanche", "solana",
  ])) {
    throw new Error("ESTABLISHED_DISCOVERY_CONFIG_SUPPORTED_CHAINS_INVALID");
  }
  const unsupportedChains = requireStringArray(
    value.explicitly_unsupported_chains,
    "ESTABLISHED_DISCOVERY_CONFIG_UNSUPPORTED_CHAINS_INVALID",
  );
  if (JSON.stringify(unsupportedChains) !== JSON.stringify(["robinhood"])) {
    throw new Error("ESTABLISHED_DISCOVERY_CONFIG_UNSUPPORTED_CHAINS_INVALID");
  }
  if (value.identity_confidence !== ESTABLISHED_ANCHOR_IDENTITY_CONFIDENCE) {
    throw new Error("ESTABLISHED_DISCOVERY_CONFIG_IDENTITY_CONFIDENCE_INVALID");
  }
  if (value.owner_acceptance_required_before_production_integration !== true) {
    throw new Error("ESTABLISHED_DISCOVERY_CONFIG_OWNER_ACCEPTANCE_REQUIRED");
  }
  return value as EstablishedDiscoveryQueryPlan;
}

function requireStringArray(value: unknown, code: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || entry.trim() === "")) {
    throw new Error(code);
  }
  return value as string[];
}

function requireStringArrayRecord(value: unknown, code: string): Record<string, string[]> {
  if (!isRecord(value)) throw new Error(code);
  for (const entries of Object.values(value)) requireStringArray(entries, code);
  return value as Record<string, string[]>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
