import { randomUUID } from "node:crypto";
import { open, mkdir, readFile, rename, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { getDefaultAutomationDirectory } from "./automationPaths.js";

export const COLLECTOR_LOCK_SCHEMA_VERSION = "central_collector_lock_v1";
export const DEFAULT_COLLECTOR_LOCK_TTL_MS = 60_000;

export type CollectorLockMetadata = {
  schema_version: typeof COLLECTOR_LOCK_SCHEMA_VERSION;
  run_id: string;
  pid: number;
  started_at: string;
  heartbeat_at: string;
  expires_at: string;
};

export type GlobalCollectorLockOptions = {
  directoryPath?: string;
  ttlMs?: number;
  pid?: number;
  now?: () => Date;
  isProcessAlive?: (pid: number) => boolean | Promise<boolean>;
};

export type AcquiredCollectorLock = {
  status: "ACQUIRED";
  run_id: string;
  metadata: CollectorLockMetadata;
  heartbeat: () => Promise<CollectorLockMetadata>;
  release: () => Promise<void>;
};

export type CollectorLockBusy = {
  status: "RUN_ALREADY_IN_PROGRESS";
  active_run_id: string;
  metadata: CollectorLockMetadata;
};

export type CollectorLockResult = AcquiredCollectorLock | CollectorLockBusy;

export class CollectorLockError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "CollectorLockError";
    this.code = code;
  }
}

export async function acquireGlobalCollectorLock(
  runId: string,
  options: GlobalCollectorLockOptions = {},
): Promise<CollectorLockResult> {
  assertRunId(runId);
  const directoryPath = resolve(options.directoryPath ?? getDefaultAutomationDirectory());
  const lockPath = resolve(directoryPath, "collector.lock.json");
  const now = options.now ?? (() => new Date());
  const ttlMs = normalizeTtl(options.ttlMs);
  const pid = options.pid ?? process.pid;
  const isProcessAlive = options.isProcessAlive ?? defaultIsProcessAlive;

  try {
    await mkdir(directoryPath, { recursive: true });
  } catch {
    throw new CollectorLockError("COLLECTOR_LOCK_DIRECTORY_UNAVAILABLE");
  }

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const startedAt = now();
    const metadata = createMetadata(runId, pid, startedAt, ttlMs);
    const created = await tryCreateLock(lockPath, metadata);
    if (created) return createAcquiredLock(lockPath, metadata, now, ttlMs);

    const active = await readLockMetadataWithRetry(lockPath);
    if (!active) continue;

    const alive = await safelyCheckProcess(isProcessAlive, active.pid);
    const expired = Date.parse(active.expires_at) <= now().getTime();
    if (alive || !expired) {
      return {
        status: "RUN_ALREADY_IN_PROGRESS",
        active_run_id: active.run_id,
        metadata: active,
      };
    }

    await recoverStaleLock(lockPath, active, now, isProcessAlive);
  }

  throw new CollectorLockError("COLLECTOR_LOCK_ACQUIRE_FAILED");
}

export async function inspectActiveGlobalCollectorLock(
  options: GlobalCollectorLockOptions = {},
): Promise<string | null> {
  const directoryPath = resolve(options.directoryPath ?? getDefaultAutomationDirectory());
  const metadata = await readLockMetadataWithRetry(resolve(directoryPath, "collector.lock.json"));
  if (!metadata) return null;
  const now = options.now ?? (() => new Date());
  const isProcessAlive = options.isProcessAlive ?? defaultIsProcessAlive;
  const alive = await safelyCheckProcess(isProcessAlive, metadata.pid);
  const expired = Date.parse(metadata.expires_at) <= now().getTime();
  return alive || !expired ? metadata.run_id : null;
}

function createAcquiredLock(
  lockPath: string,
  initialMetadata: CollectorLockMetadata,
  now: () => Date,
  ttlMs: number,
): AcquiredCollectorLock {
  let metadata = initialMetadata;
  let released = false;

  return {
    status: "ACQUIRED",
    run_id: initialMetadata.run_id,
    metadata: initialMetadata,
    heartbeat: async () => {
      if (released) throw new CollectorLockError("COLLECTOR_LOCK_ALREADY_RELEASED");
      const existing = await requireOwnedLock(lockPath, initialMetadata.run_id);
      const heartbeatAt = now();
      metadata = {
        ...existing,
        heartbeat_at: heartbeatAt.toISOString(),
        expires_at: new Date(heartbeatAt.getTime() + ttlMs).toISOString(),
      };
      await replaceOwnedLockMetadata(lockPath, metadata);
      return metadata;
    },
    release: async () => {
      if (released) return;
      await removeOwnedLock(lockPath, initialMetadata.run_id);
      released = true;
    },
  };
}

async function tryCreateLock(lockPath: string, metadata: CollectorLockMetadata): Promise<boolean> {
  let handle;
  try {
    handle = await open(lockPath, "wx");
    await handle.writeFile(serializeMetadata(metadata), "utf8");
    await handle.sync();
    return true;
  } catch (error) {
    if (isErrorCode(error, "EEXIST")) return false;
    if (handle) {
      await handle.close().catch(() => undefined);
      handle = undefined;
      await rm(lockPath, { force: true }).catch(() => undefined);
    }
    throw new CollectorLockError("COLLECTOR_LOCK_CREATE_FAILED");
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function recoverStaleLock(
  lockPath: string,
  expected: CollectorLockMetadata,
  now: () => Date,
  isProcessAlive: (pid: number) => boolean | Promise<boolean>,
): Promise<void> {
  const stalePath = `${lockPath}.${randomUUID()}.stale`;
  try {
    await rename(lockPath, stalePath);
  } catch (error) {
    if (isErrorCode(error, "ENOENT")) return;
    throw new CollectorLockError("COLLECTOR_STALE_LOCK_RECOVERY_FAILED");
  }

  try {
    const moved = await readLockMetadata(stalePath);
    const unchanged = moved.run_id === expected.run_id
      && moved.pid === expected.pid
      && moved.started_at === expected.started_at;
    const expired = Date.parse(moved.expires_at) <= now().getTime();
    const alive = await safelyCheckProcess(isProcessAlive, moved.pid);
    if (!unchanged || !expired || alive) {
      await restoreMovedLock(stalePath, lockPath);
      throw new CollectorLockError("COLLECTOR_STALE_LOCK_RECOVERY_REJECTED");
    }
    await rm(stalePath);
  } catch (error) {
    if (error instanceof CollectorLockError) throw error;
    await restoreMovedLock(stalePath, lockPath).catch(() => undefined);
    throw new CollectorLockError("COLLECTOR_STALE_LOCK_RECOVERY_FAILED");
  }
}

async function restoreMovedLock(stalePath: string, lockPath: string): Promise<void> {
  try {
    await rename(stalePath, lockPath);
  } catch {
    throw new CollectorLockError("COLLECTOR_LOCK_RESTORE_FAILED");
  }
}

async function replaceOwnedLockMetadata(lockPath: string, metadata: CollectorLockMetadata): Promise<void> {
  let handle;
  try {
    handle = await open(lockPath, "r+");
    await handle.truncate(0);
    await handle.writeFile(serializeMetadata(metadata), "utf8");
    await handle.sync();
  } catch {
    throw new CollectorLockError("COLLECTOR_LOCK_HEARTBEAT_FAILED");
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function removeOwnedLock(lockPath: string, runId: string): Promise<void> {
  await requireOwnedLock(lockPath, runId);
  const releasedPath = `${lockPath}.${randomUUID()}.released`;
  try {
    await rename(lockPath, releasedPath);
    const moved = await readLockMetadata(releasedPath);
    if (moved.run_id !== runId) {
      await restoreMovedLock(releasedPath, lockPath);
      throw new CollectorLockError("COLLECTOR_LOCK_OWNERSHIP_LOST");
    }
    await rm(releasedPath);
  } catch (error) {
    if (error instanceof CollectorLockError) throw error;
    throw new CollectorLockError("COLLECTOR_LOCK_RELEASE_FAILED");
  }
}

async function requireOwnedLock(lockPath: string, runId: string): Promise<CollectorLockMetadata> {
  const metadata = await readLockMetadataWithRetry(lockPath);
  if (!metadata || metadata.run_id !== runId) {
    throw new CollectorLockError("COLLECTOR_LOCK_OWNERSHIP_LOST");
  }
  return metadata;
}

async function readLockMetadataWithRetry(lockPath: string): Promise<CollectorLockMetadata | null> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await readLockMetadata(lockPath);
    } catch (error) {
      if (isErrorCode(error, "ENOENT")) return null;
      if (attempt < 3) {
        await new Promise<void>((resolveWait) => setTimeout(resolveWait, 5));
        continue;
      }
      if (error instanceof CollectorLockError) throw error;
      throw new CollectorLockError("COLLECTOR_LOCK_READ_FAILED");
    }
  }
  throw new CollectorLockError("COLLECTOR_LOCK_READ_FAILED");
}

async function readLockMetadata(lockPath: string): Promise<CollectorLockMetadata> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(lockPath, "utf8")) as unknown;
  } catch (error) {
    if (isErrorCode(error, "ENOENT")) throw error;
    throw new CollectorLockError("COLLECTOR_LOCK_READ_FAILED");
  }
  if (!isCollectorLockMetadata(parsed)) {
    throw new CollectorLockError("COLLECTOR_LOCK_METADATA_INVALID");
  }
  return parsed;
}

function createMetadata(runId: string, pid: number, startedAt: Date, ttlMs: number): CollectorLockMetadata {
  if (!Number.isInteger(pid) || pid <= 0) throw new CollectorLockError("COLLECTOR_LOCK_PID_INVALID");
  const started = startedAt.toISOString();
  return {
    schema_version: COLLECTOR_LOCK_SCHEMA_VERSION,
    run_id: runId,
    pid,
    started_at: started,
    heartbeat_at: started,
    expires_at: new Date(startedAt.getTime() + ttlMs).toISOString(),
  };
}

function isCollectorLockMetadata(value: unknown): value is CollectorLockMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return record.schema_version === COLLECTOR_LOCK_SCHEMA_VERSION
    && typeof record.run_id === "string"
    && isSafeRunId(record.run_id)
    && Number.isInteger(record.pid)
    && Number(record.pid) > 0
    && isIsoDate(record.started_at)
    && isIsoDate(record.heartbeat_at)
    && isIsoDate(record.expires_at);
}

function serializeMetadata(metadata: CollectorLockMetadata): string {
  return `${JSON.stringify(metadata, null, 2)}\n`;
}

function normalizeTtl(value: number | undefined): number {
  const ttlMs = value ?? DEFAULT_COLLECTOR_LOCK_TTL_MS;
  if (!Number.isSafeInteger(ttlMs) || ttlMs < 100) {
    throw new CollectorLockError("COLLECTOR_LOCK_TTL_INVALID");
  }
  return ttlMs;
}

function assertRunId(runId: string): void {
  if (!isSafeRunId(runId)) throw new CollectorLockError("COLLECTOR_RUN_ID_INVALID");
}

function isSafeRunId(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value);
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

async function safelyCheckProcess(
  checker: (pid: number) => boolean | Promise<boolean>,
  pid: number,
): Promise<boolean> {
  try {
    return await checker(pid);
  } catch {
    throw new CollectorLockError("COLLECTOR_PROCESS_CHECK_FAILED");
  }
}

function defaultIsProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return !isErrorCode(error, "ESRCH");
  }
}

function isErrorCode(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === code);
}
