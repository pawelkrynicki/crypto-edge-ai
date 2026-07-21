import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const UNIVERSE_SCHEMA_VERSION = "established_universe_schema_v1";
const STORE_SCHEMA_VERSION = "established_universe_store_v1";
const DEFAULT_STORE_PATH = fileURLToPath(new URL("../../data-poc/.local/established-universe/store.json", import.meta.url));
const DEFAULT_TEMPLATE_PATH = fileURLToPath(new URL("../../../config/established_address_universe_v1.json", import.meta.url));

export type EstablishedUniverseStatus = {
  universe_version: string | null;
  generated_at: string | null;
  entries_total: number;
  entries_enabled: number;
  validation_status: "valid" | "invalid" | "unavailable";
  last_change_at: string | null;
};

export type EstablishedUniverseStatusOptions = {
  storeFilePath?: string;
  templateFilePath?: string;
  readText?: (path: string) => Promise<string>;
};

export async function readEstablishedUniverseStatus(
  options: EstablishedUniverseStatusOptions = {},
): Promise<EstablishedUniverseStatus> {
  const readText = options.readText ?? ((path: string) => readFile(path, "utf8"));
  const configuredStorePath = process.env.CRYPTO_EDGE_ESTABLISHED_UNIVERSE_STORE_PATH?.trim();
  const storePath = resolve(options.storeFilePath ?? (configuredStorePath || DEFAULT_STORE_PATH));
  const templatePath = resolve(options.templateFilePath ?? DEFAULT_TEMPLATE_PATH);
  let raw: unknown;
  let lastChangeAt: string | null = null;

  try {
    raw = JSON.parse(await readText(storePath)) as unknown;
  } catch (error) {
    if (!isErrorCode(error, "ENOENT")) return unavailableOrInvalid(error);
    try {
      raw = JSON.parse(await readText(templatePath)) as unknown;
    } catch (templateError) {
      return unavailableOrInvalid(templateError);
    }
  }

  try {
    if (isRecord(raw) && raw.schema_version === STORE_SCHEMA_VERSION) {
      if (!Array.isArray(raw.audit_log)) throw new Error("INVALID_STORE");
      const latestAudit = raw.audit_log[0];
      if (isRecord(latestAudit) && isIsoTimestamp(latestAudit.changed_at)) lastChangeAt = latestAudit.changed_at;
      raw = raw.current;
    }
    const universe = validatePublicUniverse(raw);
    return {
      universe_version: universe.universe_version,
      generated_at: universe.generated_at,
      entries_total: universe.entries.length,
      entries_enabled: universe.entries.filter((entry) => entry.enabled).length,
      validation_status: "valid",
      last_change_at: lastChangeAt ?? universe.generated_at,
    };
  } catch {
    return emptyStatus("invalid");
  }
}

function validatePublicUniverse(value: unknown): {
  universe_version: string;
  generated_at: string;
  entries: Array<{ enabled: boolean }>;
} {
  if (!isRecord(value) || value.schema_version !== UNIVERSE_SCHEMA_VERSION) throw new Error("INVALID_UNIVERSE");
  if (typeof value.universe_version !== "string" || !/^established-universe-v\d{6}$/.test(value.universe_version)) {
    throw new Error("INVALID_UNIVERSE");
  }
  if (!isIsoTimestamp(value.generated_at) || !Array.isArray(value.entries) || value.entries.length > 100) {
    throw new Error("INVALID_UNIVERSE");
  }
  if (value.entries.some((entry) => !isRecord(entry) || typeof entry.enabled !== "boolean")) {
    throw new Error("INVALID_UNIVERSE");
  }
  const expectedChecksum = calculateChecksum({ schema_version: value.schema_version, entries: value.entries });
  if (value.checksum !== expectedChecksum) throw new Error("INVALID_UNIVERSE");
  return value as {
    universe_version: string;
    generated_at: string;
    entries: Array<{ enabled: boolean }>;
  };
}

function calculateChecksum(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalJson(value), "utf8").digest("hex")}`;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function unavailableOrInvalid(error: unknown): EstablishedUniverseStatus {
  return emptyStatus(error instanceof SyntaxError ? "invalid" : "unavailable");
}

function emptyStatus(validationStatus: "invalid" | "unavailable"): EstablishedUniverseStatus {
  return {
    universe_version: null,
    generated_at: null,
    entries_total: 0,
    entries_enabled: 0,
    validation_status: validationStatus,
    last_change_at: null,
  };
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isErrorCode(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === code);
}
