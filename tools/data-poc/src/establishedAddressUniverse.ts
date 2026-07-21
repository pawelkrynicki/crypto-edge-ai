import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveRepoFile } from "./sourceRegistryValidator.js";

export const ESTABLISHED_UNIVERSE_SCHEMA_VERSION = "established_universe_schema_v1";
export const ESTABLISHED_UNIVERSE_STORE_SCHEMA_VERSION = "established_universe_store_v1";
export const ESTABLISHED_ADDRESS_UNIVERSE_CONFIG_PATH = "config/established_address_universe_v1.json";
export const ESTABLISHED_ADDRESS_UNIVERSE_MAX_ENTRIES = 100;
export const ESTABLISHED_UNIVERSE_EMPTY = "ESTABLISHED_UNIVERSE_EMPTY";
export const ESTABLISHED_UNIVERSE_INVALID = "ESTABLISHED_UNIVERSE_INVALID";
export const ESTABLISHED_UNIVERSE_UNAVAILABLE = "ESTABLISHED_UNIVERSE_UNAVAILABLE";
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
  display_name?: string;
  symbol_hint?: string;
  owner_note?: string;
  added_at: string;
  updated_at: string;
  added_by: string;
  entry_id: string;
};

export type EstablishedAddressUniverse = {
  schema_version: typeof ESTABLISHED_UNIVERSE_SCHEMA_VERSION;
  universe_version: string;
  generated_at: string;
  entries: EstablishedAddressUniverseEntry[];
  checksum: string;
};

export type EstablishedUniverseStoreFile = {
  schema_version: typeof ESTABLISHED_UNIVERSE_STORE_SCHEMA_VERSION;
  current: EstablishedAddressUniverse;
  history: EstablishedAddressUniverse[];
  audit_log: unknown[];
};

const TOP_LEVEL_FIELDS = new Set(["schema_version", "universe_version", "generated_at", "entries", "checksum"]);
const STORE_FIELDS = new Set(["schema_version", "current", "history", "audit_log"]);
const ENTRY_FIELDS = new Set([
  "chain",
  "contract_address",
  "enabled",
  "display_name",
  "symbol_hint",
  "owner_note",
  "added_at",
  "updated_at",
  "added_by",
  "entry_id",
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
const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_LOCAL_STORE_PATH = resolve(__dirname, "../../.local/established-universe/store.json");

export function getDefaultEstablishedUniverseStorePath(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.CRYPTO_EDGE_ESTABLISHED_UNIVERSE_STORE_PATH?.trim();
  return resolve(configured || DEFAULT_LOCAL_STORE_PATH);
}

export function loadEstablishedAddressUniverse(path?: string): EstablishedAddressUniverse {
  const selectedPath = path
    ? resolve(path)
    : existsSync(getDefaultEstablishedUniverseStorePath())
      ? getDefaultEstablishedUniverseStorePath()
      : resolveRepoFile(ESTABLISHED_ADDRESS_UNIVERSE_CONFIG_PATH);
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(selectedPath, "utf8")) as unknown;
  } catch (error: unknown) {
    throw new Error("ESTABLISHED_UNIVERSE_CONFIG_LOAD_FAILED", { cause: error });
  }
  if (isRecord(parsed) && parsed.schema_version === ESTABLISHED_UNIVERSE_STORE_SCHEMA_VERSION) {
    assertExactFields(parsed, STORE_FIELDS, "ESTABLISHED_UNIVERSE_STORE_UNKNOWN_FIELD");
    if (!Array.isArray(parsed.history) || parsed.history.length > 20 || !Array.isArray(parsed.audit_log) || parsed.audit_log.length > 200) {
      fail("ESTABLISHED_UNIVERSE_STORE_INVALID");
    }
    const current = validateEstablishedAddressUniverse(parsed.current);
    const historicalVersions = new Set([current.universe_version]);
    for (const snapshot of parsed.history) {
      const historical = validateEstablishedAddressUniverse(snapshot);
      if (historicalVersions.has(historical.universe_version)) fail("ESTABLISHED_UNIVERSE_HISTORY_DUPLICATE_VERSION");
      historicalVersions.add(historical.universe_version);
    }
    return current;
  }
  return validateEstablishedAddressUniverse(parsed);
}

export function validateEstablishedAddressUniverse(value: unknown): EstablishedAddressUniverse {
  if (!isRecord(value)) fail("ESTABLISHED_UNIVERSE_CONFIG_NOT_OBJECT");
  assertExactFields(value, TOP_LEVEL_FIELDS, "ESTABLISHED_UNIVERSE_CONFIG_UNKNOWN_FIELD");
  if (value.schema_version !== ESTABLISHED_UNIVERSE_SCHEMA_VERSION) {
    fail("ESTABLISHED_UNIVERSE_SCHEMA_UNSUPPORTED");
  }
  if (typeof value.universe_version !== "string" || !/^established-universe-v\d{6}$/.test(value.universe_version)) {
    fail("ESTABLISHED_UNIVERSE_VERSION_INVALID");
  }
  if (!isIsoTimestamp(value.generated_at)) fail("ESTABLISHED_UNIVERSE_GENERATED_AT_INVALID");
  if (!Array.isArray(value.entries)) fail("ESTABLISHED_UNIVERSE_ENTRIES_INVALID");
  if (value.entries.length > ESTABLISHED_ADDRESS_UNIVERSE_MAX_ENTRIES) {
    fail("ESTABLISHED_UNIVERSE_TOO_MANY_ENTRIES");
  }

  const entries = value.entries.map((entry, index) => validateEntry(entry, index));
  const identities = new Set<string>();
  const entryIds = new Set<string>();
  for (const entry of entries) {
    const key = universeIdentityKey(entry.chain, entry.contract_address);
    if (identities.has(key)) fail("ESTABLISHED_UNIVERSE_DUPLICATE_IDENTITY");
    if (entryIds.has(entry.entry_id)) fail("ESTABLISHED_UNIVERSE_DUPLICATE_ENTRY_ID");
    identities.add(key);
    entryIds.add(entry.entry_id);
  }

  const normalized = { ...value, entries } as EstablishedAddressUniverse;
  if (typeof normalized.checksum !== "string" || normalized.checksum !== calculateUniverseChecksum(normalized)) {
    fail("ESTABLISHED_UNIVERSE_CHECKSUM_INVALID");
  }
  return normalized;
}

export function calculateUniverseChecksum(
  universe: Pick<EstablishedAddressUniverse, "schema_version" | "entries">,
): string {
  const content = canonicalJson({ schema_version: universe.schema_version, entries: universe.entries });
  return `sha256:${createHash("sha256").update(content, "utf8").digest("hex")}`;
}

export function normalizeEstablishedChain(value: string): SupportedEstablishedChain {
  const normalized = value.trim().toLowerCase();
  if (!SUPPORTED_ESTABLISHED_CHAINS.includes(normalized as SupportedEstablishedChain)) {
    throw new Error("UNSUPPORTED_CHAIN");
  }
  return normalized as SupportedEstablishedChain;
}

export function normalizeEstablishedAddress(chain: SupportedEstablishedChain, value: string): string {
  const trimmed = value.trim();
  if (EVM_CHAINS.has(chain)) {
    if (!/^0x[0-9a-fA-F]{40}$/.test(trimmed)) throw new Error("INVALID_CONTRACT_ADDRESS");
    return trimmed.toLowerCase();
  }
  if (chain === "solana" && !isValidSolanaAddress(trimmed)) throw new Error("INVALID_CONTRACT_ADDRESS");
  return trimmed;
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
  let chain: SupportedEstablishedChain;
  try {
    chain = normalizeEstablishedChain(String(value.chain ?? ""));
  } catch {
    fail("UNSUPPORTED_CHAIN");
  }
  if (value.chain !== chain) fail(`ESTABLISHED_UNIVERSE_CHAIN_NOT_NORMALIZED:${index}`);
  if (typeof value.contract_address !== "string") fail(`ESTABLISHED_UNIVERSE_ADDRESS_INVALID:${index}`);
  let address: string;
  try {
    address = normalizeEstablishedAddress(chain, value.contract_address);
  } catch {
    fail(`ESTABLISHED_UNIVERSE_ADDRESS_INVALID:${index}`);
  }
  if (address !== value.contract_address) fail(`ESTABLISHED_UNIVERSE_ADDRESS_NOT_NORMALIZED:${index}`);
  if (typeof value.enabled !== "boolean") fail(`ESTABLISHED_UNIVERSE_ENABLED_INVALID:${index}`);
  if (!isNeutralOwnerId(value.added_by)) fail(`ESTABLISHED_UNIVERSE_ADDED_BY_INVALID:${index}`);
  if (!isIsoTimestamp(value.added_at)) fail(`ESTABLISHED_UNIVERSE_ADDED_AT_INVALID:${index}`);
  if (!isIsoTimestamp(value.updated_at) || Date.parse(value.updated_at) < Date.parse(value.added_at)) {
    fail(`ESTABLISHED_UNIVERSE_UPDATED_AT_INVALID:${index}`);
  }
  if (typeof value.entry_id !== "string" || !/^est_[0-9a-f]{16}$/.test(value.entry_id)) {
    fail(`ESTABLISHED_UNIVERSE_ENTRY_ID_INVALID:${index}`);
  }
  for (const field of ["display_name", "symbol_hint", "owner_note"] as const) {
    if (value[field] !== undefined && !isBoundedNonEmptyString(value[field], field === "owner_note" ? 500 : 120)) {
      fail(`ESTABLISHED_UNIVERSE_${field.toUpperCase()}_INVALID:${index}`);
    }
  }
  return { ...value, chain, contract_address: address } as EstablishedAddressUniverseEntry;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
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

function isNeutralOwnerId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9][a-z0-9._-]{0,63}$/.test(value);
}

function isBoundedNonEmptyString(value: unknown, maximumLength: number): value is string {
  return typeof value === "string"
    && value.length <= maximumLength
    && value.trim().length > 0
    && value.trim() === value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(code: string): never {
  throw new Error(code);
}
