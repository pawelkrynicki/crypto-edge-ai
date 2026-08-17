import { createHash, randomUUID } from "node:crypto";
import { copyFile, lstat, mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { getDefaultNewRecheckStorePath } from "../../data-poc/src/newRecheckStore.js";
import { resolveProductRecoveryPaths, type ProductRecoveryPaths } from "./productRecovery.js";

export const DISC2B_REMEDIATION_BACKUP_SCHEMA_VERSION = "disc2b_legacy_followup_backup_v1";

type BackupStoreType = "json" | "sqlite" | "config";
type BackupPresence = "PRESENT" | "ABSENT";

export type Disc2bRemediationBackupEntry = {
  logical_store_id: string;
  store_type: BackupStoreType;
  presence: BackupPresence;
  relative_path: string | null;
  size: number | null;
  sha256: string | null;
};

export type Disc2bRemediationBackupManifest = {
  schema_version: typeof DISC2B_REMEDIATION_BACKUP_SCHEMA_VERSION;
  backup_id: string;
  remediation_id: string;
  reason: "LEGACY_ADMISSION_REMEDIATION";
  created_at: string;
  commit_sha: string;
  state: "BACKUP_READY";
  restore_verification: { status: "PASS"; verified_at: string; isolated: true };
  entries: Disc2bRemediationBackupEntry[];
};

export type Disc2bRemediationBackupResult = {
  backup_id: string;
  backup_path: string;
  manifest_path: string;
  manifest: Disc2bRemediationBackupManifest;
};

type SourceEntry = {
  logicalStoreId: string;
  storeType: BackupStoreType;
  sourcePath: string;
  payloadPath: string;
};

/**
 * Captures the exact DISC.2B migration scope without creating missing runtime
 * stores. Missing audit/journal files are recorded as ABSENT and remain absent
 * when the bundle is restored to an isolated location.
 */
export async function createDisc2bRemediationBackup(options: {
  remediationId: string;
  commitSha: string;
  now?: Date;
  paths?: ProductRecoveryPaths;
  backupsRoot?: string;
}): Promise<Disc2bRemediationBackupResult> {
  assertRemediationId(options.remediationId);
  if (!/^[0-9a-f]{40}$/.test(options.commitSha)) throw new Error("DISC2B_BACKUP_COMMIT_INVALID");
  const now = validDate(options.now ?? new Date());
  const paths = options.paths ?? await resolveProductRecoveryPaths();
  const backupId = `disc2b_backup_${timestamp(now)}_${randomUUID().replaceAll("-", "").slice(0, 8)}`;
  const root = resolve(options.backupsRoot ?? resolve(paths.recoveryRoot, "disc2b-legacy-followup"));
  const finalPath = resolve(root, backupId);
  const stagingPath = resolve(root, `.staging-${backupId}`);
  const verifyPath = resolve(root, `.verify-${backupId}`);
  assertContained(root, finalPath);
  assertContained(root, stagingPath);
  assertContained(root, verifyPath);

  await mkdir(root, { recursive: true });
  if (await exists(finalPath)) throw new Error("DISC2B_BACKUP_ALREADY_EXISTS");
  await rm(stagingPath, { recursive: true, force: true });
  await rm(verifyPath, { recursive: true, force: true });
  try {
    await mkdir(resolve(stagingPath, "payload"), { recursive: true });
    const entries: Disc2bRemediationBackupEntry[] = [];
    for (const source of buildScope(paths)) {
      entries.push(...await snapshotSource(stagingPath, source));
    }
    entries.sort((left, right) => left.logical_store_id.localeCompare(right.logical_store_id));
    const manifest: Disc2bRemediationBackupManifest = {
      schema_version: DISC2B_REMEDIATION_BACKUP_SCHEMA_VERSION,
      backup_id: backupId,
      remediation_id: options.remediationId,
      reason: "LEGACY_ADMISSION_REMEDIATION",
      created_at: now.toISOString(),
      commit_sha: options.commitSha,
      state: "BACKUP_READY",
      restore_verification: { status: "PASS", verified_at: now.toISOString(), isolated: true },
      entries,
    };
    await writeJsonAtomic(resolve(stagingPath, "manifest.json"), manifest);
    await verifyDisc2bRemediationBackup(stagingPath, verifyPath);
    await rename(stagingPath, finalPath);
    return { backup_id: backupId, backup_path: finalPath, manifest_path: resolve(finalPath, "manifest.json"), manifest };
  } catch (error) {
    await rm(stagingPath, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  } finally {
    await rm(verifyPath, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** Restores only into the supplied isolated directory and proves every hash. */
export async function verifyDisc2bRemediationBackup(bundlePath: string, isolatedRestorePath: string): Promise<Disc2bRemediationBackupManifest> {
  const root = resolve(bundlePath);
  const manifest = validateManifest(JSON.parse(await readFile(resolve(root, "manifest.json"), "utf8")) as unknown);
  const target = resolve(isolatedRestorePath);
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  try {
    for (const entry of manifest.entries) {
      if (entry.presence === "ABSENT") {
        if (entry.relative_path !== null || entry.sha256 !== null || entry.size !== null) throw new Error("DISC2B_BACKUP_ABSENCE_INVALID");
        continue;
      }
      if (!entry.relative_path || entry.sha256 === null || entry.size === null) throw new Error("DISC2B_BACKUP_ENTRY_INVALID");
      const source = payloadPath(root, entry.relative_path);
      const destination = payloadPath(target, entry.relative_path);
      const sourceInfo = await lstat(source).catch(() => null);
      if (!sourceInfo?.isFile() || sourceInfo.isSymbolicLink() || sourceInfo.size !== entry.size || await sha256File(source) !== entry.sha256) {
        throw new Error("DISC2B_BACKUP_PAYLOAD_INVALID");
      }
      await mkdir(dirname(destination), { recursive: true });
      await copyFile(source, destination);
      if (await sha256File(destination) !== entry.sha256) throw new Error("DISC2B_BACKUP_RESTORE_HASH_MISMATCH");
    }
    for (const entry of manifest.entries.filter((item) => item.presence === "PRESENT" && item.store_type === "sqlite" && item.relative_path?.endsWith(".sqlite"))) {
      await assertSqliteIntegrity(payloadPath(target, entry.relative_path!));
    }
    return manifest;
  } finally {
    await rm(target, { recursive: true, force: true }).catch(() => undefined);
  }
}

function buildScope(paths: ProductRecoveryPaths): SourceEntry[] {
  const entries: SourceEntry[] = [
    source("follow_up_store", "json", paths.followUpStore, "stores/follow-up/store.json"),
    source("follow_up_backup", "json", paths.followUpBackup, "stores/follow-up/store.json.bak"),
    source("new_inbox_store", "json", paths.newInboxStore, "stores/lifecycle/new-inbox.json"),
    source("new_recheck_store", "json", paths.newRecheckStore ?? getDefaultNewRecheckStorePath(), "stores/new-recheck/store.json"),
    source("lifecycle_audit_store", "json", paths.lifecycleAuditStore, "stores/lifecycle/audit.json"),
    source("lifecycle_operation_journal", "json", paths.lifecycleOperationJournal, "stores/lifecycle/operation-journal.json"),
    source("lifecycle_cycle_receipt", "json", paths.lifecycleCycleReceipt, "stores/lifecycle/cycle-receipts.json"),
    source("established_universe_store", "json", paths.establishedStore, "stores/established/store.json"),
    source("established_address_config", "config", paths.establishedConfig, "config/established_address_universe_v1.json"),
    source("central_automation_state", "json", paths.automationState, "stores/automation/automation-state.json"),
    source("central_run_once_receipt", "json", paths.runOnceReceipt, "stores/automation/last-run-once.json"),
    source("disc2a_population_manifest", "json", paths.disc2aPopulationManifest ?? resolve(paths.outputRoot, "..", ".local", "diagnostics", "disc2a-population-manifest.json"), "stores/diagnostics/disc2a-population-manifest.json"),
    source("disc2a_revalidation", "json", paths.disc2aRevalidation ?? resolve(paths.outputRoot, "..", ".local", "diagnostics", "disc2a-revalidation.json"), "stores/diagnostics/disc2a-revalidation.json"),
    source("tester_feedback_sqlite", "sqlite", paths.feedbackSqlite, "stores/private/tester-feedback.sqlite"),
    source("ai_queue_sqlite", "sqlite", paths.aiQueueSqlite, "stores/private/ai-analysis-queue.sqlite"),
    source("user_workspace_sqlite", "sqlite", paths.userWorkspaceSqlite, "stores/private/user-workspace.sqlite"),
    source("research_evidence_sqlite", "sqlite", paths.researchEvidenceSqlite, "stores/private/research-evidence.sqlite"),
  ];
  for (const config of paths.safeConfigFiles) entries.push(source(config.logicalStoreId, "config", config.path, `config/${config.logicalStoreId}.json`));
  return entries;
}

function source(logicalStoreId: string, storeType: BackupStoreType, sourcePath: string, payloadPathValue: string): SourceEntry {
  return { logicalStoreId, storeType, sourcePath: resolve(sourcePath), payloadPath: payloadPathValue };
}

async function snapshotSource(bundlePath: string, sourceEntry: SourceEntry): Promise<Disc2bRemediationBackupEntry[]> {
  const info = await lstat(sourceEntry.sourcePath).catch(() => null);
  if (!info) return [{ logical_store_id: sourceEntry.logicalStoreId, store_type: sourceEntry.storeType, presence: "ABSENT", relative_path: null, size: null, sha256: null }];
  if (!info.isFile() || info.isSymbolicLink()) throw new Error("DISC2B_BACKUP_SOURCE_UNSAFE");
  const target = payloadPath(bundlePath, sourceEntry.payloadPath);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(sourceEntry.sourcePath, target);
  const copied = await lstat(target);
  if (!copied.isFile() || copied.isSymbolicLink()) throw new Error("DISC2B_BACKUP_COPY_UNSAFE");
  const entries: Disc2bRemediationBackupEntry[] = [{
    logical_store_id: sourceEntry.logicalStoreId,
    store_type: sourceEntry.storeType,
    presence: "PRESENT",
    relative_path: sourceEntry.payloadPath,
    size: copied.size,
    sha256: await sha256File(target),
  }];
  if (sourceEntry.storeType === "sqlite") {
    for (const suffix of ["-wal", "-shm"]) {
      const sidecar = `${sourceEntry.sourcePath}${suffix}`;
      const sidecarInfo = await lstat(sidecar).catch(() => null);
      if (!sidecarInfo) continue;
      if (!sidecarInfo.isFile() || sidecarInfo.isSymbolicLink()) throw new Error("DISC2B_BACKUP_SQLITE_SIDECAR_UNSAFE");
      const sidecarPayload = `${sourceEntry.payloadPath}${suffix}`;
      const sidecarTarget = payloadPath(bundlePath, sidecarPayload);
      await copyFile(sidecar, sidecarTarget);
      const copiedSidecar = await lstat(sidecarTarget);
      if (!copiedSidecar.isFile() || copiedSidecar.isSymbolicLink()) throw new Error("DISC2B_BACKUP_COPY_UNSAFE");
      entries.push({
        logical_store_id: `${sourceEntry.logicalStoreId}_${suffix.slice(1)}`,
        store_type: "sqlite",
        presence: "PRESENT",
        relative_path: sidecarPayload,
        size: copiedSidecar.size,
        sha256: await sha256File(sidecarTarget),
      });
    }
  }
  return entries;
}

function validateManifest(value: unknown): Disc2bRemediationBackupManifest {
  if (!record(value) || value.schema_version !== DISC2B_REMEDIATION_BACKUP_SCHEMA_VERSION || typeof value.backup_id !== "string" || typeof value.remediation_id !== "string" || value.reason !== "LEGACY_ADMISSION_REMEDIATION" || value.state !== "BACKUP_READY" || !Array.isArray(value.entries) || !record(value.restore_verification) || value.restore_verification.status !== "PASS" || value.restore_verification.isolated !== true) throw new Error("DISC2B_BACKUP_MANIFEST_INVALID");
  if (new Set(value.entries.map((entry) => record(entry) ? entry.logical_store_id : null)).size !== value.entries.length) throw new Error("DISC2B_BACKUP_DUPLICATE_ENTRY");
  return value as unknown as Disc2bRemediationBackupManifest;
}

async function assertSqliteIntegrity(path: string): Promise<void> {
  const moduleValue = await import("node:sqlite");
  const database = new moduleValue.DatabaseSync(path);
  try {
    database.exec("PRAGMA query_only = ON");
    const row = database.prepare("PRAGMA integrity_check").get() as Record<string, unknown>;
    if (Object.values(row)[0] !== "ok") throw new Error("DISC2B_BACKUP_SQLITE_INTEGRITY_FAILED");
  } finally {
    database.close();
  }
}

function payloadPath(root: string, relativePath: string): string {
  if (!/^[A-Za-z0-9._/-]+$/.test(relativePath) || relativePath.split("/").includes("..")) throw new Error("DISC2B_BACKUP_PATH_INVALID");
  const selected = resolve(root, "payload", ...relativePath.split("/"));
  assertContained(resolve(root, "payload"), selected);
  return selected;
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  const temporary = `${path}.${randomUUID()}.tmp`;
  await mkdir(dirname(path), { recursive: true });
  const handle = await open(temporary, "wx");
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporary, path);
}

async function sha256File(path: string): Promise<string> {
  return `sha256:${createHash("sha256").update(await readFile(path)).digest("hex")}`;
}

function assertContained(root: string, path: string): void {
  const normalizedRoot = resolve(root);
  const normalizedPath = resolve(path);
  const expected = process.platform === "win32" ? normalizedRoot.toLowerCase() : normalizedRoot;
  const actual = process.platform === "win32" ? normalizedPath.toLowerCase() : normalizedPath;
  if (actual !== expected && !actual.startsWith(`${expected}${sep}`)) throw new Error("DISC2B_BACKUP_PATH_OUTSIDE_ROOT");
}

function timestamp(date: Date): string { return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z"); }
function validDate(date: Date): Date { if (!Number.isFinite(date.getTime())) throw new Error("DISC2B_BACKUP_DATE_INVALID"); return date; }
function assertRemediationId(value: string): void { if (!/^legacy_followup_remediation_[A-Za-z0-9_-]{8,100}$/.test(value)) throw new Error("DISC2B_BACKUP_REMEDIATION_ID_INVALID"); }
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
async function exists(path: string): Promise<boolean> { try { await lstat(path); return true; } catch { return false; } }
