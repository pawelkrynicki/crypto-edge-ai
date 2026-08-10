import { randomUUID } from "node:crypto";
import {
  cp,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import {
  acquireOwnerOperationLockForTest,
  createProductBackup,
  hashCanonicalProductState,
  recoverInterruptedRestore,
  restoreProductBackup,
  validateBackupBundle,
  type ProductBackupManifest,
  type ProductRecoveryPaths,
} from "./productRecovery.js";
import {
  createIsolatedRecoveryPaths,
  seedIsolatedProductState,
  FIXTURE_COMMIT_SHA,
} from "../tests/productRecoveryFixtures.js";

export const PRODUCT_RECOVERY_DRILL_SCHEMA_VERSION = "product_recovery_drill_run_v1";

export const PRODUCT_RECOVERY_DRILL_SCENARIOS = [
  "Complete backup of every canonical store",
  "Revalidate a correct backup",
  "Reject backup with a missing required store",
  "Reject backup with an inconsistent snapshot pointer",
  "Reject backup with corrupt SQLite",
  "Remove staging after interruption before manifest publication",
  "Block a parallel backup with the owner-operation lock",
  "Restore a correct bundle to an empty isolated target",
  "Restore over an existing isolated state",
  "Restore the same bundle without duplicates",
  "Reject a modified payload file",
  "Reject a missing payload file",
  "Reject an extra payload file",
  "Reject an unknown manifest version",
  "Reject path traversal",
  "Reject an absolute payload path",
  "Reject a symlink or Windows reparse point",
  "Reject simulated insufficient free space",
  "Fail safely during restore publication",
  "Run automatic rollback after restore failure",
  "Validate byte-identical state after rollback",
  "Fail closed when rollback itself fails",
  "Resume safely from the restore journal after restart",
  "Reject a backup source containing a secret",
  "Leave all canonical product data unchanged",
] as const;

export type ProductRecoveryDrillScenario = {
  number: number;
  name: string;
  status: "PASS" | "FAIL";
  code: string;
};

export type ProductRecoveryDrillManifest = {
  schema_version: typeof PRODUCT_RECOVERY_DRILL_SCHEMA_VERSION;
  run_id: string;
  started_at: string;
  finished_at: string;
  status: "PASS" | "FAIL";
  isolated_root: string;
  scenarios: ProductRecoveryDrillScenario[];
  canonical_before: Record<string, string>;
  canonical_after: Record<string, string>;
  canonical_mutations: number;
  task_scheduler_mutations: 0;
  openai_calls: 0;
  live_provider_calls: 0;
  central_live_cycles: 0;
  worker_processes_started: 0;
  scheduler_host_status: string;
  final_backup_manifest: string;
  final_operation_report: string;
};

export type ProductRecoveryDrillResult = {
  manifest: ProductRecoveryDrillManifest;
  manifestPath: string;
  reportPath: string;
};

export function previewProductRecoveryDrills(): {
  run_id: string;
  isolated_root: string;
  scenarios: readonly string[];
  stores_created: false;
  mutations: 0;
  openai_calls: 0;
  live_provider_calls: 0;
  central_live_cycles: 0;
  task_scheduler_mutations: 0;
} {
  const runId = makeRunId();
  return {
    run_id: runId,
    isolated_root: resolve(tmpdir(), "crypto-edge-backup-restore-rollback", runId),
    scenarios: PRODUCT_RECOVERY_DRILL_SCENARIOS,
    stores_created: false,
    mutations: 0,
    openai_calls: 0,
    live_provider_calls: 0,
    central_live_cycles: 0,
    task_scheduler_mutations: 0,
  };
}

export async function runProductRecoveryDrills(options: {
  schedulerHostStatus?: string;
  runId?: string;
  canonicalPaths?: ProductRecoveryPaths;
} = {}): Promise<ProductRecoveryDrillResult> {
  const started = new Date();
  const runId = options.runId ?? makeRunId(started);
  if (!/^recovery-drill-\d{8}T\d{6}Z-[0-9a-f]{8}$/.test(runId)) throw new Error("RECOVERY_DRILL_RUN_ID_INVALID");
  const root = resolve(tmpdir(), "crypto-edge-backup-restore-rollback", runId);
  await rm(root, { recursive: true, force: true });
  await mkdir(root, { recursive: true });
  const canonicalBefore = await hashCanonicalProductState(options.canonicalPaths);
  const scenarios: ProductRecoveryDrillScenario[] = [];
  const record = async (name: string, action: () => Promise<string>): Promise<void> => {
    const number = scenarios.length + 1;
    try {
      const code = await action();
      scenarios.push({ number, name, status: "PASS", code });
    } catch (error) {
      scenarios.push({ number, name, status: "FAIL", code: safeCode(error) });
    }
  };

  const sourcePaths = createIsolatedRecoveryPaths(resolve(root, "source"));
  await seedIsolatedProductState(sourcePaths);
  // The product reads the versioned Established config until its first dynamic store is published.
  // Exercise that canonical initial-state fallback in every complete-bundle assertion.
  await rm(sourcePaths.establishedStore, { force: true });
  let baseBackup = await createProductBackup({ paths: sourcePaths, commitSha: FIXTURE_COMMIT_SHA });

  await record(PRODUCT_RECOVERY_DRILL_SCENARIOS[0], async () => {
    const required = new Set(baseBackup.manifest.logical_stores.map((store) => store.logical_store_id));
    for (const id of [
      "follow_up_store", "follow_up_backup", "established_universe_store", "established_address_config",
      "new_inbox_store", "lifecycle_audit_store", "lifecycle_cycle_receipt", "lifecycle_operation_journal", "user_workspace_sqlite", "feedback_sqlite", "ai_queue_cache_sqlite", "central_automation_state", "active_scanner_snapshot",
      "active_context_snapshot", "reports_library", "runtime_policy_config",
    ]) if (!required.has(id)) throw new Error(`STORE_NOT_BACKED_UP_${id}`);
    return "BACKUP_READY";
  });

  await record(PRODUCT_RECOVERY_DRILL_SCENARIOS[1], async () => {
    const validated = await validateBackupBundle(baseBackup.backupDirectory);
    return validated.state;
  });

  await record(PRODUCT_RECOVERY_DRILL_SCENARIOS[2], async () => {
    const paths = await seededPaths(root, "missing-store");
    await rm(paths.followUpBackup, { force: true });
    return expectFailure(() => createProductBackup({ paths, commitSha: FIXTURE_COMMIT_SHA }), "REQUIRED_STORE_MISSING");
  });

  await record(PRODUCT_RECOVERY_DRILL_SCENARIOS[3], async () => {
    const paths = await seededPaths(root, "bad-pointer");
    const state = JSON.parse(await readFile(paths.automationState, "utf8")) as Record<string, unknown>;
    state.last_published_scanner_run_id = "scan_missing_snapshot";
    await writeJson(paths.automationState, state);
    return expectFailure(() => createProductBackup({ paths, commitSha: FIXTURE_COMMIT_SHA }), "REQUIRED_STORE_MISSING");
  });

  await record(PRODUCT_RECOVERY_DRILL_SCENARIOS[4], async () => {
    const paths = await seededPaths(root, "corrupt-sqlite");
    await writeFile(paths.feedbackSqlite, "not a sqlite database", "utf8");
    return expectFailure(() => createProductBackup({ paths, commitSha: FIXTURE_COMMIT_SHA }), "SQLITE_INTEGRITY_FAILED");
  });

  await record(PRODUCT_RECOVERY_DRILL_SCENARIOS[5], async () => {
    const paths = await seededPaths(root, "interrupted-backup");
    await expectFailure(
      () => createProductBackup({ paths, commitSha: FIXTURE_COMMIT_SHA, faults: { interruptBackupBeforeManifest: true } }),
      "BACKUP_INTERRUPTED_BEFORE_MANIFEST",
    );
    const entries = await readdir(paths.backupsRoot).catch(() => []);
    if (entries.some((entry) => entry.startsWith(".staging-") || entry.startsWith("backup_"))) throw new Error("PARTIAL_BACKUP_PUBLISHED");
    return "STAGING_REMOVED";
  });

  await record(PRODUCT_RECOVERY_DRILL_SCENARIOS[6], async () => {
    const paths = await seededPaths(root, "parallel-lock");
    const lock = await acquireOwnerOperationLockForTest(paths);
    try {
      return await expectFailure(() => createProductBackup({ paths, commitSha: FIXTURE_COMMIT_SHA }), "OWNER_OPERATION_ALREADY_IN_PROGRESS");
    } finally {
      await lock.release();
    }
  });

  const emptyTarget = createIsolatedRecoveryPaths(resolve(root, "restore-empty"));
  await record(PRODUCT_RECOVERY_DRILL_SCENARIOS[7], async () => {
    const result = await restoreProductBackup({
      bundleDirectory: baseBackup.backupDirectory,
      backupId: baseBackup.manifest.backup_id,
      paths: emptyTarget,
      commitSha: FIXTURE_COMMIT_SHA,
      apply: true,
    });
    if (result.operation.status !== "RESTORE_SUCCEEDED") throw new Error(result.operation.status);
    return result.operation.status;
  });

  const existingTarget = await seededPaths(root, "restore-existing");
  await writeJson(existingTarget.runOnceReceipt, { schema_version: "data_cycle_run_once_receipt_v1", run_id: "different" });
  await record(PRODUCT_RECOVERY_DRILL_SCENARIOS[8], async () => {
    const result = await restoreProductBackup({
      bundleDirectory: baseBackup.backupDirectory,
      backupId: baseBackup.manifest.backup_id,
      paths: existingTarget,
      commitSha: FIXTURE_COMMIT_SHA,
      apply: true,
    });
    if (result.operation.status !== "RESTORE_SUCCEEDED") throw new Error(result.operation.status);
    return result.operation.status;
  });

  await record(PRODUCT_RECOVERY_DRILL_SCENARIOS[9], async () => {
    const first = await hashCanonicalProductState(existingTarget);
    const result = await restoreProductBackup({
      bundleDirectory: baseBackup.backupDirectory,
      backupId: baseBackup.manifest.backup_id,
      paths: existingTarget,
      commitSha: FIXTURE_COMMIT_SHA,
      apply: true,
    });
    const second = await hashCanonicalProductState(existingTarget);
    if (!sameHashes(first, second) || result.operation.changed_store_count !== 0) throw new Error("RESTORE_NOT_IDEMPOTENT");
    return "IDEMPOTENT";
  });

  await record(PRODUCT_RECOVERY_DRILL_SCENARIOS[10], async () => {
    const clone = await clonedBundle(root, baseBackup.backupDirectory, "modified-payload");
    const manifest = await readManifest(clone);
    const selected = manifest.files.find((entry) => entry.store_type === "config");
    if (!selected) throw new Error("CONFIG_PAYLOAD_MISSING");
    await writeFile(resolve(clone, "payload", ...selected.relative_path.split("/")), "{}\n", "utf8");
    return expectFailure(() => validateBackupBundle(clone), "BACKUP_SIZE_MISMATCH");
  });

  await record(PRODUCT_RECOVERY_DRILL_SCENARIOS[11], async () => {
    const clone = await clonedBundle(root, baseBackup.backupDirectory, "missing-payload");
    const manifest = await readManifest(clone);
    await rm(resolve(clone, "payload", ...manifest.files[0].relative_path.split("/")));
    return expectFailure(() => validateBackupBundle(clone), "BACKUP_PAYLOAD_MISSING");
  });

  await record(PRODUCT_RECOVERY_DRILL_SCENARIOS[12], async () => {
    const clone = await clonedBundle(root, baseBackup.backupDirectory, "extra-payload");
    await writeJson(resolve(clone, "payload", "stores", "extra.json"), { unexpected: true });
    return expectFailure(() => validateBackupBundle(clone), "BACKUP_PAYLOAD_FILE_SET_MISMATCH");
  });

  await record(PRODUCT_RECOVERY_DRILL_SCENARIOS[13], async () => {
    const clone = await clonedBundle(root, baseBackup.backupDirectory, "unknown-version");
    const manifest = await readManifest(clone) as unknown as Record<string, unknown>;
    manifest.schema_version = "product_backup_bundle_v999";
    await writeJson(resolve(clone, "manifest.json"), manifest);
    return expectFailure(() => validateBackupBundle(clone), "BACKUP_SCHEMA_UNSUPPORTED");
  });

  await record(PRODUCT_RECOVERY_DRILL_SCENARIOS[14], async () => {
    const clone = await clonedBundle(root, baseBackup.backupDirectory, "path-traversal");
    const manifest = await readManifest(clone);
    manifest.files[0].relative_path = "../escape.json";
    await writeJson(resolve(clone, "manifest.json"), manifest);
    return expectFailure(() => validateBackupBundle(clone), "BACKUP_MANIFEST_ENTRY_INVALID");
  });

  await record(PRODUCT_RECOVERY_DRILL_SCENARIOS[15], async () => {
    const clone = await clonedBundle(root, baseBackup.backupDirectory, "absolute-path");
    const manifest = await readManifest(clone);
    manifest.files[0].relative_path = "C:/escape.json";
    await writeJson(resolve(clone, "manifest.json"), manifest);
    return expectFailure(() => validateBackupBundle(clone), "BACKUP_MANIFEST_ENTRY_INVALID");
  });

  await record(PRODUCT_RECOVERY_DRILL_SCENARIOS[16], async () => {
    const relativePath = baseBackup.manifest.files[0].relative_path;
    return expectFailure(
      () => validateBackupBundle(baseBackup.backupDirectory, { faults: { forceReparseRelativePath: relativePath } }),
      "BACKUP_REPARSE_POINT_FORBIDDEN",
    );
  });

  await record(PRODUCT_RECOVERY_DRILL_SCENARIOS[17], async () => {
    const target = createIsolatedRecoveryPaths(resolve(root, "no-space"));
    return expectFailure(() => restoreProductBackup({
      bundleDirectory: baseBackup.backupDirectory,
      backupId: baseBackup.manifest.backup_id,
      paths: target,
      commitSha: FIXTURE_COMMIT_SHA,
      faults: { availableSpaceBytes: 0 },
    }), "INSUFFICIENT_FREE_SPACE");
  });

  const rollbackTarget = await seededPaths(root, "rollback-target");
  const rollbackBefore = await hashCanonicalProductState(rollbackTarget);
  let failedRestoreStatus = "";
  await record(PRODUCT_RECOVERY_DRILL_SCENARIOS[18], async () => {
    const result = await restoreProductBackup({
      bundleDirectory: baseBackup.backupDirectory,
      backupId: baseBackup.manifest.backup_id,
      paths: rollbackTarget,
      commitSha: FIXTURE_COMMIT_SHA,
      apply: true,
      faults: { failRestoreAfterPublishes: 3 },
    });
    failedRestoreStatus = result.operation.status;
    if (result.operation.status !== "RESTORE_FAILED_ROLLED_BACK") throw new Error(result.operation.status);
    return "RESTORE_PUBLICATION_FAILED";
  });

  await record(PRODUCT_RECOVERY_DRILL_SCENARIOS[19], async () => {
    if (failedRestoreStatus !== "RESTORE_FAILED_ROLLED_BACK") throw new Error("AUTOMATIC_ROLLBACK_NOT_RUN");
    return "ROLLBACK_SUCCEEDED";
  });

  await record(PRODUCT_RECOVERY_DRILL_SCENARIOS[20], async () => {
    const after = await hashCanonicalProductState(rollbackTarget);
    if (!sameHashes(rollbackBefore, after)) throw new Error("ROLLBACK_NOT_BYTE_IDENTICAL");
    return "BYTE_IDENTICAL";
  });

  await record(PRODUCT_RECOVERY_DRILL_SCENARIOS[21], async () => {
    const target = await seededPaths(root, "rollback-failure");
    const result = await restoreProductBackup({
      bundleDirectory: baseBackup.backupDirectory,
      backupId: baseBackup.manifest.backup_id,
      paths: target,
      commitSha: FIXTURE_COMMIT_SHA,
      apply: true,
      faults: { failRestoreAfterPublishes: 2, failRollback: true },
    });
    if (result.operation.status !== "ROLLBACK_FAILED") throw new Error(result.operation.status);
    if (!await fileExists(target.maintenanceStatePath)) throw new Error("MAINTENANCE_STATE_NOT_SET");
    return "FAIL_CLOSED_MAINTENANCE";
  });

  await record(PRODUCT_RECOVERY_DRILL_SCENARIOS[22], async () => {
    const target = await seededPaths(root, "restart-journal");
    await expectFailure(() => restoreProductBackup({
      bundleDirectory: baseBackup.backupDirectory,
      backupId: baseBackup.manifest.backup_id,
      paths: target,
      commitSha: FIXTURE_COMMIT_SHA,
      apply: true,
      faults: { simulateProcessExitAfterPublishes: 2 },
    }), "SIMULATED_PROCESS_EXIT");
    const entries = await readdir(target.operationsRoot);
    const operationId = entries.find((entry) => entry.startsWith("restore_"));
    if (!operationId) throw new Error("RESTORE_JOURNAL_MISSING");
    const result = await recoverInterruptedRestore(resolve(target.operationsRoot, operationId), target);
    if (result.operation.status !== "RESTORE_FAILED_ROLLED_BACK") throw new Error(result.operation.status);
    return "JOURNAL_RECOVERY_SUCCEEDED";
  });

  await record(PRODUCT_RECOVERY_DRILL_SCENARIOS[23], async () => {
    const paths = await seededPaths(root, "secret-source");
    await writeFile(paths.safeConfigFiles[0].path, "OPENAI_API_KEY=sk-1234567890abcdefghij\n", "utf8");
    return expectFailure(() => createProductBackup({ paths, commitSha: FIXTURE_COMMIT_SHA }), "OPENAI_KEY_DETECTED");
  });

  const canonicalAfter = await hashCanonicalProductState(options.canonicalPaths);
  await record(PRODUCT_RECOVERY_DRILL_SCENARIOS[24], async () => {
    if (!sameHashes(canonicalBefore, canonicalAfter)) throw new Error("CANONICAL_STATE_CHANGED");
    return "CANONICAL_MUTATIONS_0";
  });

  const finalResult = await createProductBackup({
    paths: sourcePaths,
    commitSha: FIXTURE_COMMIT_SHA,
  });
  baseBackup = finalResult;
  const finished = new Date();
  const status = scenarios.every((scenario) => scenario.status === "PASS") ? "PASS" : "FAIL";
  const manifestPath = resolve(root, "manifest.json");
  const reportPath = resolve(root, "report.md");
  const manifest: ProductRecoveryDrillManifest = {
    schema_version: PRODUCT_RECOVERY_DRILL_SCHEMA_VERSION,
    run_id: runId,
    started_at: started.toISOString(),
    finished_at: finished.toISOString(),
    status,
    isolated_root: root,
    scenarios,
    canonical_before: canonicalBefore,
    canonical_after: canonicalAfter,
    canonical_mutations: sameHashes(canonicalBefore, canonicalAfter) ? 0 : 1,
    task_scheduler_mutations: 0,
    openai_calls: 0,
    live_provider_calls: 0,
    central_live_cycles: 0,
    worker_processes_started: 0,
    scheduler_host_status: safeSchedulerStatus(options.schedulerHostStatus),
    final_backup_manifest: finalResult.manifestPath,
    final_operation_report: finalResult.operation.report_location,
  };
  await writeAtomic(reportPath, renderDrillReport(manifest));
  await writeAtomic(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return { manifest, manifestPath, reportPath };
}

async function seededPaths(root: string, name: string): Promise<ProductRecoveryPaths> {
  const paths = createIsolatedRecoveryPaths(resolve(root, name));
  await seedIsolatedProductState(paths);
  return paths;
}

async function clonedBundle(root: string, source: string, name: string): Promise<string> {
  const destination = resolve(root, "tampered", name);
  await mkdir(resolve(destination, ".."), { recursive: true });
  await cp(source, destination, { recursive: true, errorOnExist: true });
  return destination;
}

async function readManifest(bundle: string): Promise<ProductBackupManifest> {
  return JSON.parse(await readFile(resolve(bundle, "manifest.json"), "utf8")) as ProductBackupManifest;
}

async function expectFailure(action: () => Promise<unknown>, expectedPrefix: string): Promise<string> {
  try {
    await action();
  } catch (error) {
    const code = safeCode(error);
    if (code.startsWith(expectedPrefix)) return code;
    throw error;
  }
  throw new Error(`EXPECTED_FAILURE_${expectedPrefix}`);
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(resolve(path, ".."), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeAtomic(path: string, value: string): Promise<void> {
  await mkdir(resolve(path, ".."), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, value, { encoding: "utf8", flag: "wx" });
  await rename(temporary, path);
}

function renderDrillReport(manifest: ProductRecoveryDrillManifest): string {
  const scenarios = manifest.scenarios.map((scenario) => (
    `${scenario.number}. ${scenario.status} — ${scenario.name} (\`${scenario.code}\`)`
  )).join("\n");
  return `# STAB.2 backup, restore and rollback recovery drill\n\n` +
    `- Run ID: \`${manifest.run_id}\`\n` +
    `- Status: **${manifest.status}**\n` +
    `- Canonical mutations: ${manifest.canonical_mutations}\n` +
    `- Task Scheduler mutations: ${manifest.task_scheduler_mutations}\n` +
    `- OpenAI calls: ${manifest.openai_calls}\n` +
    `- Live provider calls: ${manifest.live_provider_calls}\n` +
    `- Central live cycles: ${manifest.central_live_cycles}\n` +
    `- Worker processes started: ${manifest.worker_processes_started}\n\n` +
    `## Scenarios\n\n${scenarios}\n`;
}

function makeRunId(now = new Date()): string {
  const timestamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return `recovery-drill-${timestamp}-${randomUUID().replaceAll("-", "").slice(0, 8)}`;
}

function safeCode(error: unknown): string {
  const value = error instanceof Error ? error.message : String(error);
  return value.toUpperCase().replace(/[^A-Z0-9_]/g, "_").slice(0, 160) || "RECOVERY_DRILL_ERROR";
}

function sameHashes(left: Record<string, string>, right: Record<string, string>): boolean {
  return JSON.stringify(Object.entries(left).sort()) === JSON.stringify(Object.entries(right).sort());
}

function safeSchedulerStatus(value: string | undefined): string {
  const normalized = value?.trim().toUpperCase() || "NOT_OBSERVED";
  return /^[A-Z0-9_-]{1,64}$/.test(normalized) ? normalized : "INVALID_HOST_STATUS_IGNORED";
}

async function fileExists(path: string): Promise<boolean> {
  try { await readFile(path); return true; } catch { return false; }
}
