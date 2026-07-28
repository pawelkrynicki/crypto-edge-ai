import { createHash, randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { getDefaultFollowUpStorePath } from "../followUpBasket.js";
import { createAutomationStateStore } from "./automationState.js";
import { getDefaultAutomationDirectory } from "./automationPaths.js";

export const DATA_CYCLE_BACKUP_SCHEMA_VERSION = "data_cycle_backup_v1";
export const DATA_CYCLE_RECEIPT_SCHEMA_VERSION = "data_cycle_run_once_receipt_v1";

export type DataCycleCanonicalPaths = {
  repo_root: string;
  automation_state: string;
  follow_up_store: string;
  follow_up_backup: string;
  scanner_snapshot: string | null;
  context_snapshot: string | null;
  established_universe: string;
  run_once_receipt: string;
  backups_directory: string;
};

export type DataCycleBackupEntry = {
  relative_path: string;
  existed: boolean;
  size: number | null;
  sha256: string | null;
  mtime: string | null;
};

export type DataCycleBackupManifest = {
  schema_version: typeof DATA_CYCLE_BACKUP_SCHEMA_VERSION;
  backup_id: string;
  created_at: string;
  files: DataCycleBackupEntry[];
  protected_established_sha256: string | null;
};

export async function resolveCanonicalDataPaths(): Promise<DataCycleCanonicalPaths> {
  const paths = resolveStaticDataPaths();
  const state = await createAutomationStateStore(dirname(paths.automation_state)).read();
  const dataPocRoot = resolve(dirname(paths.automation_state), "..", "..");
  return {
    ...paths,
    scanner_snapshot: state.last_published_scanner_run_id
      ? resolve(dataPocRoot, "output", state.last_published_scanner_run_id, "full_output.json")
      : null,
    context_snapshot: state.last_published_context_run_id
      ? resolve(dataPocRoot, "output", state.last_published_context_run_id, "approved_sources_output.json")
      : null,
  };
}

function resolveStaticDataPaths(): DataCycleCanonicalPaths {
  const automationDirectory = getDefaultAutomationDirectory();
  const dataPocRoot = resolve(automationDirectory, "..", "..");
  const repoRoot = resolve(dataPocRoot, "..", "..");
  return {
    repo_root: repoRoot,
    automation_state: resolve(automationDirectory, "automation-state.json"),
    follow_up_store: getDefaultFollowUpStorePath(),
    follow_up_backup: `${getDefaultFollowUpStorePath()}.bak`,
    scanner_snapshot: null,
    context_snapshot: null,
    established_universe: resolve(repoRoot, "config", "established_address_universe_v1.json"),
    run_once_receipt: resolve(dataPocRoot, ".local", "data-cycle", "last-run-once.json"),
    backups_directory: resolve(dataPocRoot, ".local", "data-cycle", "backups"),
  };
}

export async function createDataCycleBackup(now = new Date(), injectedPaths?: DataCycleCanonicalPaths): Promise<{
  backup_directory: string;
  manifest_path: string;
  manifest: DataCycleBackupManifest;
}> {
  const paths = injectedPaths ?? await resolveCanonicalDataPaths();
  const backupId = `backup_${formatTimestamp(now)}_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
  const backupDirectory = resolve(paths.backups_directory, backupId);
  await mkdir(resolve(backupDirectory, "files"), { recursive: true });
  const targets = [
    paths.automation_state,
    paths.follow_up_store,
    paths.follow_up_backup,
    paths.scanner_snapshot,
    paths.context_snapshot,
    paths.run_once_receipt,
  ].filter((value): value is string => value !== null);
  const entries: DataCycleBackupEntry[] = [];
  for (const target of targets) {
    assertContained(paths.repo_root, target);
    const entry = await inspectFile(paths.repo_root, target);
    entries.push(entry);
    if (!entry.existed) continue;
    const destination = resolve(backupDirectory, "files", entry.relative_path);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(target, destination);
  }
  const established = await inspectFile(paths.repo_root, paths.established_universe);
  const manifest: DataCycleBackupManifest = {
    schema_version: DATA_CYCLE_BACKUP_SCHEMA_VERSION,
    backup_id: backupId,
    created_at: now.toISOString(),
    files: entries,
    protected_established_sha256: established.sha256,
  };
  const manifestPath = resolve(backupDirectory, "manifest.json");
  await writeJsonAtomic(manifestPath, manifest);
  return { backup_directory: backupDirectory, manifest_path: manifestPath, manifest };
}

export async function rollbackDataCycleBackup(backupId: string, injectedPaths?: DataCycleCanonicalPaths): Promise<{
  backup_id: string;
  restored_files: string[];
  preserved_post_rollback_files: string[];
}> {
  assertBackupId(backupId);
  const paths = injectedPaths ?? resolveStaticDataPaths();
  const backupDirectory = resolve(paths.backups_directory, backupId);
  const manifest = validateBackupManifest(JSON.parse(await readFile(resolve(backupDirectory, "manifest.json"), "utf8")) as unknown);
  if (manifest.backup_id !== backupId) throw new Error("DATA_CYCLE_BACKUP_ID_MISMATCH");
  const establishedBefore = await inspectFile(paths.repo_root, paths.established_universe);
  if (establishedBefore.sha256 !== manifest.protected_established_sha256) {
    throw new Error("ESTABLISHED_UNIVERSE_CHANGED_ROLLBACK_ABORTED");
  }
  const restored: string[] = [];
  const preserved: string[] = [];
  for (const entry of manifest.files) {
    const target = resolve(paths.repo_root, entry.relative_path);
    assertContained(paths.repo_root, target);
    if (entry.existed) {
      const source = resolve(backupDirectory, "files", entry.relative_path);
      const sourceHash = await sha256File(source);
      if (sourceHash !== entry.sha256) throw new Error("DATA_CYCLE_BACKUP_HASH_MISMATCH");
      await restoreFileAtomic(source, target);
      restored.push(entry.relative_path);
      continue;
    }
    if (await fileExists(target)) {
      const preservedPath = resolve(backupDirectory, "post-rollback", entry.relative_path);
      await mkdir(dirname(preservedPath), { recursive: true });
      await rename(target, preservedPath);
      preserved.push(entry.relative_path);
    }
  }
  return { backup_id: backupId, restored_files: restored, preserved_post_rollback_files: preserved };
}

export async function writeRunOnceReceipt(value: Record<string, unknown>, injectedPaths?: DataCycleCanonicalPaths): Promise<string> {
  const paths = injectedPaths ?? resolveStaticDataPaths();
  await writeJsonAtomic(paths.run_once_receipt, {
    schema_version: DATA_CYCLE_RECEIPT_SCHEMA_VERSION,
    ...value,
  });
  return paths.run_once_receipt;
}

export function toRepoRelative(paths: DataCycleCanonicalPaths, target: string | null): string | null {
  return target === null ? null : normalizeRelative(relative(paths.repo_root, target));
}

function validateBackupManifest(value: unknown): DataCycleBackupManifest {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("DATA_CYCLE_BACKUP_INVALID");
  const manifest = value as DataCycleBackupManifest;
  if (
    manifest.schema_version !== DATA_CYCLE_BACKUP_SCHEMA_VERSION
    || typeof manifest.backup_id !== "string"
    || !Array.isArray(manifest.files)
  ) throw new Error("DATA_CYCLE_BACKUP_INVALID");
  for (const entry of manifest.files) {
    if (!entry || typeof entry.relative_path !== "string" || entry.relative_path.includes("..")) {
      throw new Error("DATA_CYCLE_BACKUP_INVALID");
    }
  }
  return manifest;
}

async function inspectFile(repoRoot: string, path: string): Promise<DataCycleBackupEntry> {
  try {
    const metadata = await stat(path);
    if (!metadata.isFile()) throw new Error("DATA_CYCLE_CANONICAL_PATH_NOT_FILE");
    return {
      relative_path: normalizeRelative(relative(repoRoot, path)),
      existed: true,
      size: metadata.size,
      sha256: await sha256File(path),
      mtime: metadata.mtime.toISOString(),
    };
  } catch (error) {
    if (isErrorCode(error, "ENOENT")) {
      return {
        relative_path: normalizeRelative(relative(repoRoot, path)),
        existed: false,
        size: null,
        sha256: null,
        mtime: null,
      };
    }
    throw error;
  }
}

async function restoreFileAtomic(source: string, target: string): Promise<void> {
  await mkdir(dirname(target), { recursive: true });
  const temporary = `${target}.${randomUUID()}.rollback.tmp`;
  await copyFile(source, temporary);
  await rename(temporary, target);
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  await rename(temporary, path);
}

async function sha256File(path: string): Promise<string> {
  return `sha256:${createHash("sha256").update(await readFile(path)).digest("hex")}`;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (isErrorCode(error, "ENOENT")) return false;
    throw error;
  }
}

function assertContained(root: string, path: string): void {
  const normalizedRoot = resolve(root);
  const normalizedPath = resolve(path);
  const rootCompare = process.platform === "win32" ? normalizedRoot.toLowerCase() : normalizedRoot;
  const pathCompare = process.platform === "win32" ? normalizedPath.toLowerCase() : normalizedPath;
  if (pathCompare !== rootCompare && !pathCompare.startsWith(`${rootCompare}${sep}`)) {
    throw new Error("DATA_CYCLE_PATH_OUTSIDE_REPOSITORY");
  }
}

function normalizeRelative(value: string): string {
  if (!value || value.startsWith("..")) throw new Error("DATA_CYCLE_PATH_OUTSIDE_REPOSITORY");
  return value.replaceAll("\\", "/");
}

function assertBackupId(value: string): void {
  if (!/^backup_\d{14}_[0-9a-f]{8}$/.test(value)) throw new Error("DATA_CYCLE_BACKUP_ID_INVALID");
}

function formatTimestamp(value: Date): string {
  if (!Number.isFinite(value.getTime())) throw new Error("DATA_CYCLE_TIMESTAMP_INVALID");
  return value.toISOString().replace(/[^0-9]/g, "").slice(0, 14);
}

function isErrorCode(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === code);
}
