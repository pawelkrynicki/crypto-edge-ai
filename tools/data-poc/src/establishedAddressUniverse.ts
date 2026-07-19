import { readFileSync } from "node:fs";
import { resolveRepoFile } from "./sourceRegistryValidator.js";

export const ESTABLISHED_ADDRESS_UNIVERSE_VERSION = "established_address_universe_v1";
export const ESTABLISHED_ADDRESS_UNIVERSE_CONFIG_PATH = "config/established_address_universe_v1.json";
export const ESTABLISHED_ADDRESS_UNIVERSE_MAX_ENTRIES = 100;
export const ESTABLISHED_UNIVERSE_EMPTY = "ESTABLISHED_UNIVERSE_EMPTY";
export const SUPPORTED_ESTABLISHED_CHAINS = [
  "ethereum",
  "bsc",
  "base",
  "arbitrum",
  "polygon",
  "avalanche",
  "solana",
] as const;

export type SupportedEstablishedChain = (typeof SUPPORTED_ESTABLISHED_CHAINS)[number];

export type EstablishedAddressUniverseEntry = {
  chain: SupportedEstablishedChain;
  contract_address: string;
  enabled: boolean;
  display_label?: string;
  added_at: string;
  added_by: string;
  notes?: string;
};

export type EstablishedAddressUniverse = {
  universe_version: typeof ESTABLISHED_ADDRESS_UNIVERSE_VERSION;
  status: "OWNER_MAINTAINED";
  production_enabled: boolean;
  provider: "dexscreener";
  identity_method: "CHAIN_AND_CONTRACT_ADDRESS";
  max_entries: typeof ESTABLISHED_ADDRESS_UNIVERSE_MAX_ENTRIES;
  entries: EstablishedAddressUniverseEntry[];
};

const TOP_LEVEL_FIELDS = new Set([
  "universe_version",
  "status",
  "production_enabled",
  "provider",
  "identity_method",
  "max_entries",
  "entries",
]);
const ENTRY_FIELDS = new Set([
  "chain",
  "contract_address",
  "enabled",
  "display_label",
  "added_at",
  "added_by",
  "notes",
]);
const EVM_CHAINS = new Set<SupportedEstablishedChain>([
  "ethereum",
  "bsc",
  "base",
  "arbitrum",
  "polygon",
  "avalanche",
]);
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function loadEstablishedAddressUniverse(
  path = resolveRepoFile(ESTABLISHED_ADDRESS_UNIVERSE_CONFIG_PATH),
): EstablishedAddressUniverse {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch (error: unknown) {
    throw new Error("ESTABLISHED_UNIVERSE_CONFIG_LOAD_FAILED", { cause: error });
  }
  return validateEstablishedAddressUniverse(parsed);
}

export function validateEstablishedAddressUniverse(value: unknown): EstablishedAddressUniverse {
  if (!isRecord(value)) fail("ESTABLISHED_UNIVERSE_CONFIG_NOT_OBJECT");
  assertExactFields(value, TOP_LEVEL_FIELDS, "ESTABLISHED_UNIVERSE_CONFIG_UNKNOWN_FIELD");
  if (value.universe_version !== ESTABLISHED_ADDRESS_UNIVERSE_VERSION) {
    fail("ESTABLISHED_UNIVERSE_VERSION_UNSUPPORTED");
  }
  if (value.status !== "OWNER_MAINTAINED") fail("ESTABLISHED_UNIVERSE_STATUS_INVALID");
  if (typeof value.production_enabled !== "boolean") fail("ESTABLISHED_UNIVERSE_PRODUCTION_FLAG_INVALID");
  if (value.provider !== "dexscreener") fail("ESTABLISHED_UNIVERSE_PROVIDER_INVALID");
  if (value.identity_method !== "CHAIN_AND_CONTRACT_ADDRESS") fail("ESTABLISHED_UNIVERSE_IDENTITY_METHOD_INVALID");
  if (value.max_entries !== ESTABLISHED_ADDRESS_UNIVERSE_MAX_ENTRIES) {
    fail("ESTABLISHED_UNIVERSE_MAX_ENTRIES_INVALID");
  }
  if (!Array.isArray(value.entries)) fail("ESTABLISHED_UNIVERSE_ENTRIES_INVALID");
  if (value.entries.length > ESTABLISHED_ADDRESS_UNIVERSE_MAX_ENTRIES) {
    fail("ESTABLISHED_UNIVERSE_TOO_MANY_ENTRIES");
  }

  const entries = value.entries.map((entry, index) => validateEntry(entry, index));
  const seen = new Set<string>();
  for (const entry of entries) {
    const key = universeIdentityKey(entry.chain, entry.contract_address);
    if (seen.has(key)) fail("ESTABLISHED_UNIVERSE_DUPLICATE_IDENTITY");
    seen.add(key);
  }

  return { ...value, entries } as EstablishedAddressUniverse;
}

export function universeIdentityKey(chain: SupportedEstablishedChain, address: string): string {
  return `${chain}:${chain === "solana" ? address : address.toLowerCase()}`;
}

export function isSameContractAddress(
  chain: SupportedEstablishedChain,
  left: string | undefined,
  right: string,
): boolean {
  if (typeof left !== "string") return false;
  return chain === "solana" ? left === right : left.toLowerCase() === right.toLowerCase();
}

export function isValidSolanaAddress(value: string): boolean {
  if (value.length < 32 || value.length > 44) return false;
  let bytes: number[] = [0];
  for (const character of value) {
    const digit = BASE58_ALPHABET.indexOf(character);
    if (digit < 0) return false;
    let carry = digit;
    for (let index = 0; index < bytes.length; index += 1) {
      carry += bytes[index] * 58;
      bytes[index] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  let leadingZeros = 0;
  while (leadingZeros < value.length && value[leadingZeros] === "1") leadingZeros += 1;
  return bytes.length + leadingZeros === 32;
}

function validateEntry(value: unknown, index: number): EstablishedAddressUniverseEntry {
  if (!isRecord(value)) fail(`ESTABLISHED_UNIVERSE_ENTRY_NOT_OBJECT:${index}`);
  assertExactFields(value, ENTRY_FIELDS, `ESTABLISHED_UNIVERSE_ENTRY_UNKNOWN_FIELD:${index}`);
  if (!SUPPORTED_ESTABLISHED_CHAINS.includes(value.chain as SupportedEstablishedChain)) {
    fail(value.chain === "robinhood"
      ? `ESTABLISHED_UNIVERSE_ROBINHOOD_DENIED:${index}`
      : `ESTABLISHED_UNIVERSE_CHAIN_UNSUPPORTED:${index}`);
  }
  const chain = value.chain as SupportedEstablishedChain;
  if (typeof value.contract_address !== "string" || value.contract_address.trim() !== value.contract_address) {
    fail(`ESTABLISHED_UNIVERSE_ADDRESS_INVALID:${index}`);
  }
  if (EVM_CHAINS.has(chain) && !/^0x[0-9a-fA-F]{40}$/.test(value.contract_address)) {
    fail(`ESTABLISHED_UNIVERSE_EVM_ADDRESS_INVALID:${index}`);
  }
  if (chain === "solana" && !isValidSolanaAddress(value.contract_address)) {
    fail(`ESTABLISHED_UNIVERSE_SOLANA_ADDRESS_INVALID:${index}`);
  }
  if (typeof value.enabled !== "boolean") fail(`ESTABLISHED_UNIVERSE_ENABLED_INVALID:${index}`);
  if (!isNonEmptyString(value.added_by)) fail(`ESTABLISHED_UNIVERSE_ADDED_BY_INVALID:${index}`);
  if (!isIsoTimestamp(value.added_at)) fail(`ESTABLISHED_UNIVERSE_ADDED_AT_INVALID:${index}`);
  for (const field of ["display_label", "notes"] as const) {
    if (value[field] !== undefined && !isNonEmptyString(value[field])) {
      fail(`ESTABLISHED_UNIVERSE_${field.toUpperCase()}_INVALID:${index}`);
    }
  }
  return value as EstablishedAddressUniverseEntry;
}

function assertExactFields(value: Record<string, unknown>, allowed: Set<string>, code: string): void {
  if (Object.keys(value).some((key) => !allowed.has(key))) fail(code);
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && !Number.isNaN(Date.parse(value))
    && new Date(value).toISOString() === value;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.trim() === value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(code: string): never {
  throw new Error(code);
}
