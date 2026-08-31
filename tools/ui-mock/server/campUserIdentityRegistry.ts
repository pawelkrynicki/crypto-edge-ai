import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const CAMP_USER_IDENTITY_REGISTRY_SCHEMA_VERSION = "camp_user_identity_registry_v1";

export type CampUserIdentityRegistry = {
  databaseFilePath: string;
  resolveActorId: (cookieToken: string) => string | null;
  registerCookieToken: (cookieToken: string) => string;
  integrity: () => { ok: true; schema_version: typeof CAMP_USER_IDENTITY_REGISTRY_SCHEMA_VERSION; identities: number };
};

type RegistryEntry = {
  actor_id: string;
  created_at: string;
};

type RegistryState = {
  schema_version: typeof CAMP_USER_IDENTITY_REGISTRY_SCHEMA_VERSION;
  identities: Record<string, RegistryEntry>;
};

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_PATH = resolve(ROOT, ".local", "camp-user-identities.json");

export class CampUserIdentityRegistryError extends Error {
  readonly code: "CAMP_IDENTITY_REGISTRY_UNAVAILABLE" | "CAMP_IDENTITY_REGISTRY_INVALID";

  constructor(code: CampUserIdentityRegistryError["code"]) {
    super(code);
    this.name = "CampUserIdentityRegistryError";
    this.code = code;
  }
}

/**
 * The identity file intentionally stores only SHA-256 cookie-token digests.
 * A copied database therefore cannot be used as a browser credential.
 */
export function getDefaultCampUserIdentityRegistryPath(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.CRYPTO_EDGE_CAMP_IDENTITY_REGISTRY_PATH?.trim();
  if (!configured) return DEFAULT_PATH;
  return isAbsolute(configured) ? resolve(configured) : resolve(ROOT, configured);
}

export function createCampUserIdentityRegistry(options: { databaseFilePath?: string } = {}): CampUserIdentityRegistry {
  const databaseFilePath = resolve(options.databaseFilePath ?? getDefaultCampUserIdentityRegistryPath());

  return {
    databaseFilePath,

    resolveActorId(cookieToken: string): string | null {
      const state = readState(databaseFilePath);
      const entry = state.identities[tokenHash(cookieToken)];
      return entry ? requireActorId(entry.actor_id) : null;
    },

    registerCookieToken(cookieToken: string): string {
      const state = readState(databaseFilePath);
      const hash = tokenHash(cookieToken);
      const existing = state.identities[hash];
      if (existing) return requireActorId(existing.actor_id);
      const actorId = `camp-user-${randomUUID().replace(/-/g, "")}`;
      state.identities[hash] = { actor_id: actorId, created_at: new Date().toISOString() };
      writeStateAtomic(databaseFilePath, state);
      return actorId;
    },

    integrity(): { ok: true; schema_version: typeof CAMP_USER_IDENTITY_REGISTRY_SCHEMA_VERSION; identities: number } {
      const state = readState(databaseFilePath);
      return {
        ok: true,
        schema_version: CAMP_USER_IDENTITY_REGISTRY_SCHEMA_VERSION,
        identities: Object.keys(state.identities).length,
      };
    },
  };
}

function readState(path: string): RegistryState {
  let source: string;
  try {
    source = readFileSync(path, "utf8");
  } catch (error) {
    if (isMissing(error)) return emptyState();
    throw new CampUserIdentityRegistryError("CAMP_IDENTITY_REGISTRY_UNAVAILABLE");
  }
  try {
    return normalizeState(JSON.parse(source) as unknown);
  } catch (error) {
    if (error instanceof CampUserIdentityRegistryError) throw error;
    throw new CampUserIdentityRegistryError("CAMP_IDENTITY_REGISTRY_INVALID");
  }
}

function writeStateAtomic(path: string, state: RegistryState): void {
  const normalized = normalizeState(state);
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(temporary, `${JSON.stringify(normalized, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    renameSync(temporary, path);
  } catch {
    try { rmSync(temporary, { force: true }); } catch { /* preserve the storage error */ }
    throw new CampUserIdentityRegistryError("CAMP_IDENTITY_REGISTRY_UNAVAILABLE");
  }
}

function normalizeState(value: unknown): RegistryState {
  if (!isRecord(value) || value.schema_version !== CAMP_USER_IDENTITY_REGISTRY_SCHEMA_VERSION || !isRecord(value.identities)) {
    throw new CampUserIdentityRegistryError("CAMP_IDENTITY_REGISTRY_INVALID");
  }
  const identities: Record<string, RegistryEntry> = {};
  for (const [hash, entry] of Object.entries(value.identities)) {
    if (!/^sha256:[a-f0-9]{64}$/.test(hash) || !isRecord(entry)) {
      throw new CampUserIdentityRegistryError("CAMP_IDENTITY_REGISTRY_INVALID");
    }
    const actorId = requireActorId(entry.actor_id);
    if (typeof entry.created_at !== "string" || !Number.isFinite(Date.parse(entry.created_at))) {
      throw new CampUserIdentityRegistryError("CAMP_IDENTITY_REGISTRY_INVALID");
    }
    identities[hash] = { actor_id: actorId, created_at: new Date(entry.created_at).toISOString() };
  }
  return { schema_version: CAMP_USER_IDENTITY_REGISTRY_SCHEMA_VERSION, identities };
}

function emptyState(): RegistryState {
  return { schema_version: CAMP_USER_IDENTITY_REGISTRY_SCHEMA_VERSION, identities: {} };
}

function tokenHash(value: string): string {
  if (!/^[A-Za-z0-9_-]{20,128}$/.test(value)) {
    throw new CampUserIdentityRegistryError("CAMP_IDENTITY_REGISTRY_INVALID");
  }
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function requireActorId(value: unknown): string {
  if (typeof value !== "string" || !/^camp-user-[a-f0-9]{32}$/.test(value)) {
    throw new CampUserIdentityRegistryError("CAMP_IDENTITY_REGISTRY_INVALID");
  }
  return value;
}

function isMissing(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
