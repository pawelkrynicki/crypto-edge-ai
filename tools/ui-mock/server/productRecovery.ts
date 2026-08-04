import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import {
  access,
  copyFile,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  statfs,
} from "node:fs/promises";
import { promisify } from "node:util";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import type { PersistableScannerOutput } from "../../data-poc/src/persistableScannerModel.js";
import type { ApprovedSourcesRunOutput } from "../../data-poc/src/sources/sourceAdapterTypes.js";
import { validatePersistableScannerOutput } from "../../data-poc/src/storageValidator.js";
import { validateDisplayEligibleScannerSnapshot } from "../../data-poc/src/displaySnapshotValidator.js";
import { validateDisplayEligibleContextSnapshot } from "../../data-poc/src/contextSnapshotValidator.js";
import {
  getDefaultFollowUpStorePath,
  validateFollowUpStore,
} from "../../data-poc/src/followUpBasket.js";
import {
  getDefaultLifecycleAuditStorePath,
  getDefaultLifecycleOperationJournalPath,
  getDefaultNewInboxStorePath,
  validateLifecycleAuditStore,
  validateLifecycleOperationJournalStore,
  validateNewInboxStore,
} from "../../data-poc/src/systemLifecycle.js";
import {
  getDefaultEstablishedUniverseStorePath,
  validateEstablishedAddressUniverse,
} from "../../data-poc/src/establishedAddressUniverse.js";
import { validateEstablishedUniverseStore } from "../../data-poc/src/establishedUniverseManager.js";
import { getDefaultAutomationDirectory } from "../../data-poc/src/automation/automationPaths.js";
import { normalizeAutomationState } from "../../data-poc/src/automation/automationState.js";
import { resolveCanonicalDataPaths } from "../../data-poc/src/automation/dataCycleOperations.js";
import { resolveRepoFile } from "../../data-poc/src/sourceRegistryValidator.js";
import { resolveFeedbackDatabasePath } from "./feedbackStore.js";
import { resolveAIAnalysisQueueDatabasePath } from "./aiResearchQueueStore.js";
import { getDefaultUserWorkspaceDatabasePath } from "./userWorkspaceRepository.js";
import { buildReportsLibraryIndex, getDefaultReportsRootPath } from "./reportsLibrary.js";

export const PRODUCT_BACKUP_SCHEMA_VERSION = "product_backup_bundle_v1";
export const PRODUCT_RECOVERY_OPERATION_SCHEMA_VERSION = "product_recovery_operation_v1";
export const PRODUCT_RECOVERY_GENERATOR_VERSION = "stab2_product_recovery_v1";

export type ProductRecoveryStatus =
  | "PREVIEW"
  | "BACKUP_READY"
  | "RESTORE_READY"
  | "RESTORE_SUCCEEDED"
  | "RESTORE_FAILED_ROLLED_BACK"
  | "ROLLBACK_SUCCEEDED"
  | "ROLLBACK_FAILED"
  | "VALIDATION_FAILED";

export type ProductRecoveryPaths = {
  repoRoot: string;
  outputRoot: string;
  followUpStore: string;
  followUpBackup: string;
  newInboxStore: string;
  lifecycleAuditStore: string;
  lifecycleOperationJournal: string;
  establishedStore: string;
  establishedConfig: string;
  feedbackSqlite: string;
  aiQueueSqlite: string;
  userWorkspaceSqlite: string;
  automationState: string;
  runOnceReceipt: string;
  reportsRoot: string;
  safeConfigFiles: Array<{ logicalStoreId: string; path: string; payloadPath: string }>;
  recoveryRoot: string;
  backupsRoot: string;
  operationsRoot: string;
  ownerLockPath: string;
  maintenanceStatePath: string;
};

export type ProductBackupFile = {
  logical_store_id: string;
  relative_path: string;
  size: number;
  sha256: string;
  store_type: "json" | "sqlite" | "report" | "config";
  dependencies: string[];
  source_validation: "VALID";
};

export type ProductBackupManifest = {
  schema_version: typeof PRODUCT_BACKUP_SCHEMA_VERSION;
  generator_version: typeof PRODUCT_RECOVERY_GENERATOR_VERSION;
  backup_id: string;
  created_at: string;
  commit_sha: string;
  runtime_mode: string;
  state: "BACKUP_READY";
  files: ProductBackupFile[];
  logical_stores: Array<{
    logical_store_id: string;
    store_type: ProductBackupFile["store_type"];
    required: boolean;
    file_count: number;
    validation: "VALID";
  }>;
  excluded_items: string[];
  secret_scan: "PASS";
};

export type RecoveryValidation = {
  logical_store_id: string;
  status: "VALID" | "INVALID";
  code: string;
  sha256?: string;
  sqlite_integrity?: "ok";
};

export type ProductRecoveryOperation = {
  schema_version: typeof PRODUCT_RECOVERY_OPERATION_SCHEMA_VERSION;
  operation_id: string;
  operation: "BACKUP" | "RESTORE" | "ROLLBACK" | "RECOVERY_DRILL";
  backup_id: string | null;
  mode: "PREVIEW" | "APPLY";
  started_at: string;
  finished_at: string | null;
  status: ProductRecoveryStatus;
  before: Record<string, string>;
  after: Record<string, string>;
  preflight_steps: Array<{ step: string; status: "PASS" | "FAIL"; code: string }>;
  store_validations: RecoveryValidation[];
  sqlite_integrity: Record<string, "ok">;
  pointer_validation: "PASS" | "FAIL";
  changed_store_count: number;
  rollback: { attempted: boolean; status: "NOT_REQUIRED" | "SUCCEEDED" | "FAILED"; code: string | null };
  error_codes: string[];
  backup_location: string | null;
  report_location: string;
  commit_sha: string;
  no_secrets: boolean;
  openai_calls: 0;
  live_provider_calls: 0;
  central_live_cycles: 0;
  task_scheduler_mutations: 0;
  publication_log: Array<{
    logical_store_id: string;
    target_existed: boolean;
    published: boolean;
    rolled_back: boolean;
  }>;
  safety_backup_id: string | null;
};

export type ProductBackupResult = {
  backupDirectory: string;
  manifestPath: string;
  manifest: ProductBackupManifest;
  operation: ProductRecoveryOperation;
};

export type RestoreResult = {
  operation: ProductRecoveryOperation;
  operationDirectory: string;
  reportPath: string;
};

export type RecoveryFaults = {
  interruptBackupBeforeManifest?: boolean;
  failRestoreAfterPublishes?: number;
  failRollback?: boolean;
  simulateProcessExitAfterPublishes?: number;
  availableSpaceBytes?: number;
  forceReparseRelativePath?: string;
};

type StoreDescriptor = {
  logicalStoreId: string;
  sourcePath: string;
  payloadPath: string;
  storeType: ProductBackupFile["store_type"];
  required: boolean;
  dependencies: string[];
  generatedContent?: string;
};

type RecoveryLock = { release: () => Promise<void> };
type SqliteStatement = { all(...params: unknown[]): unknown[]; get(...params: unknown[]): unknown };
type SqliteDatabase = { exec(sql: string): void; prepare(sql: string): SqliteStatement; close(): void };
type SqliteModule = { DatabaseSync: new (filename: string) => SqliteDatabase };

const execFileAsync = promisify(execFile);
const importModule = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<unknown>;
const BACKUP_ID_PATTERN = /^(?:backup|safety)_\d{8}T\d{6}Z_[0-9a-f]{8}$/;
const OPERATION_ID_PATTERN = /^(?:backup|restore|rollback|recovery)_\d{8}T\d{6}Z_[0-9a-f]{8}$/;
const SAFE_RELATIVE_PATH = /^(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._/-]+$/;
const SECRET_PATTERNS: Array<{ code: string; pattern: RegExp }> = [
  { code: "OPENAI_KEY_DETECTED", pattern: /\bsk-[A-Za-z0-9_-]{16,}\b|OPENAI_API_KEY\s*[:=]/i },
  { code: "AUTHORIZATION_HEADER_DETECTED", pattern: /authorization\s*[:=]\s*(?:bearer|basic)\s+\S+/i },
  { code: "ACCESS_TOKEN_DETECTED", pattern: /(?:access|refresh)[_-]?token\s*[:=]\s*["']?[A-Za-z0-9._-]{12,}/i },
  { code: "PASSWORD_DETECTED", pattern: /password\s*[:=]\s*["']?\S{4,}/i },
  { code: "COOKIE_DETECTED", pattern: /(?:set-cookie|cookie)\s*:\s*\S+/i },
  { code: "PERSONAL_EMAIL_DETECTED", pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i },
];
const INTERNAL_OWNER_LOCK_REUSE = Symbol("internal-owner-lock-reuse");
const EXCLUDED_ITEMS = [
  ".env and environment files",
  "credentials, API keys, authorization headers, cookies and access tokens",
  "user session stores and full prompts",
  "node_modules, .git, build caches and temporary files",
  "nonessential logs, personal data and other-project data",
];

export class ProductRecoveryError extends Error {
  readonly code: string;

  constructor(code: string, cause?: unknown) {
    super(code, cause === undefined ? undefined : { cause });
    this.name = "ProductRecoveryError";
    this.code = code;
  }
}

export async function resolveProductRecoveryPaths(
  env: NodeJS.ProcessEnv = process.env,
): Promise<ProductRecoveryPaths> {
  const canonical = await resolveCanonicalDataPaths();
  const repoRoot = resolve(canonical.repo_root);
  const dataPocRoot = resolve(getDefaultAutomationDirectory(), "..", "..");
  const recoveryRoot = resolve(env.CRYPTO_EDGE_RECOVERY_ROOT?.trim() || resolve(dataPocRoot, ".local", "product-recovery"));
  return {
    repoRoot,
    outputRoot: resolve(dataPocRoot, "output"),
    followUpStore: getDefaultFollowUpStorePath(env),
    followUpBackup: `${getDefaultFollowUpStorePath(env)}.bak`,
    newInboxStore: getDefaultNewInboxStorePath(env),
    lifecycleAuditStore: getDefaultLifecycleAuditStorePath(env),
    lifecycleOperationJournal: getDefaultLifecycleOperationJournalPath(env),
    establishedStore: getDefaultEstablishedUniverseStorePath(env),
    establishedConfig: resolveRepoFile("config/established_address_universe_v1.json"),
    feedbackSqlite: resolveFeedbackDatabasePath(env.CRYPTO_EDGE_FEEDBACK_SQLITE_PATH),
    aiQueueSqlite: resolveAIAnalysisQueueDatabasePath(env.CRYPTO_EDGE_AI_QUEUE_SQLITE_PATH),
    userWorkspaceSqlite: getDefaultUserWorkspaceDatabasePath(env),
    automationState: canonical.automation_state,
    runOnceReceipt: canonical.run_once_receipt,
    reportsRoot: getDefaultReportsRootPath(),
    safeConfigFiles: [
      {
        logicalStoreId: "runtime_policy_config",
        path: resolveRepoFile("config/data_source_runtime_policy.json"),
        payloadPath: "config/data_source_runtime_policy.json",
      },
      {
        logicalStoreId: "established_discovery_query_plan",
        path: resolveRepoFile("config/established_discovery_query_plan_v1.json"),
        payloadPath: "config/established_discovery_query_plan_v1.json",
      },
      {
        logicalStoreId: "data_source_registry",
        path: resolveRepoFile("docs/compliance/data_source_registry_v1.json"),
        payloadPath: "config/data_source_registry_v1.json",
      },
    ],
    recoveryRoot,
    backupsRoot: resolve(recoveryRoot, "backups"),
    operationsRoot: resolve(recoveryRoot, "operations"),
    ownerLockPath: resolve(recoveryRoot, "owner-operation.lock.json"),
    maintenanceStatePath: resolve(recoveryRoot, "maintenance-state.json"),
  };
}

export async function createProductBackup(options: {
  paths?: ProductRecoveryPaths;
  now?: Date;
  runtimeMode?: string;
  commitSha?: string;
  backupId?: string;
  backupsRoot?: string;
  internalLockToken?: symbol;
  allowMissingSources?: boolean;
  faults?: RecoveryFaults;
} = {}): Promise<ProductBackupResult> {
  const paths = options.paths ?? await resolveProductRecoveryPaths();
  await assertMaintenanceOpen(paths);
  const now = validDate(options.now ?? new Date());
  const backupId = options.backupId ?? makeId("backup", now);
  assertBackupId(backupId);
  const backupsRoot = resolve(options.backupsRoot ?? paths.backupsRoot);
  const finalDirectory = resolve(backupsRoot, backupId);
  const stagingDirectory = resolve(backupsRoot, `.staging-${backupId}`);
  assertContained(backupsRoot, finalDirectory);
  assertContained(backupsRoot, stagingDirectory);
  const operationId = makeId("backup", now);
  const commitSha = options.commitSha ?? await resolveCommitSha(paths.repoRoot);
  const operationDirectory = resolve(paths.operationsRoot, operationId);
  const operation = initialOperation({
    operationId,
    operation: "BACKUP",
    backupId,
    mode: "APPLY",
    now,
    commitSha,
    reportLocation: normalizePath(resolve(operationDirectory, "operation.md")),
  });
  const reusingOwnerLock = options.internalLockToken === INTERNAL_OWNER_LOCK_REUSE;
  let lock: RecoveryLock | undefined;
  try {
    if (!reusingOwnerLock) lock = await acquireOwnerOperationLock(paths, operationId, "BACKUP");
    operation.preflight_steps.push(pass("OWNER_OPERATION_LOCK", "OWNER_LOCK_ACQUIRED"));
    await ensureAbsent(finalDirectory, "BACKUP_ALREADY_EXISTS");
    await rm(stagingDirectory, { recursive: true, force: true });
    await mkdir(resolve(stagingDirectory, "payload"), { recursive: true });
    const descriptors = await buildStoreInventory(paths, { allowMissing: options.allowMissingSources });
    const validation = await validateSourceState(paths, descriptors, options.allowMissingSources);
    operation.store_validations = validation.validations;
    operation.sqlite_integrity = validation.sqliteIntegrity;
    operation.pointer_validation = "PASS";
    operation.before = await hashLogicalState(descriptors);
    operation.preflight_steps.push(pass("SOURCE_VALIDATION", "SOURCE_STATE_VALID"));

    const files: ProductBackupFile[] = [];
    for (const descriptor of descriptors) {
      const destination = safePayloadPath(stagingDirectory, descriptor.payloadPath);
      await mkdir(dirname(destination), { recursive: true });
      if (descriptor.storeType === "sqlite") {
        await backupSqliteDatabase(descriptor.sourcePath, destination);
      } else if (descriptor.generatedContent !== undefined) {
        await writeTextDurable(destination, descriptor.generatedContent);
      } else {
        await copyRegularFile(descriptor.sourcePath, destination);
      }
      await scanPayloadFile(destination, descriptor.storeType, descriptor.logicalStoreId);
      const metadata = await stat(destination);
      files.push({
        logical_store_id: descriptor.logicalStoreId,
        relative_path: normalizePayloadRelative(descriptor.payloadPath),
        size: metadata.size,
        sha256: await sha256File(destination),
        store_type: descriptor.storeType,
        dependencies: [...descriptor.dependencies],
        source_validation: "VALID",
      });
    }
    files.sort((left, right) => left.relative_path.localeCompare(right.relative_path));
    const logicalStores = summarizeLogicalStores(
      descriptors,
      files,
      !options.allowMissingSources || await exists(paths.reportsRoot),
    );
    const manifest: ProductBackupManifest = {
      schema_version: PRODUCT_BACKUP_SCHEMA_VERSION,
      generator_version: PRODUCT_RECOVERY_GENERATOR_VERSION,
      backup_id: backupId,
      created_at: now.toISOString(),
      commit_sha: commitSha,
      runtime_mode: safeRuntimeMode(options.runtimeMode ?? process.env.CRYPTO_EDGE_RUNTIME_MODE ?? "OWNER_LOCAL"),
      state: "BACKUP_READY",
      files,
      logical_stores: logicalStores,
      excluded_items: [...EXCLUDED_ITEMS],
      secret_scan: "PASS",
    };
    await validateBackupPayloadAgainstManifest(stagingDirectory, manifest, options.faults);
    if (options.faults?.interruptBackupBeforeManifest) throw new ProductRecoveryError("BACKUP_INTERRUPTED_BEFORE_MANIFEST");
    await writeJsonDurable(resolve(stagingDirectory, "manifest.json"), manifest);
    await validateBackupBundle(stagingDirectory, { faults: options.faults });
    await mkdir(backupsRoot, { recursive: true });
    await rename(stagingDirectory, finalDirectory);
    const publishedManifest = await validateBackupBundle(finalDirectory);
    operation.status = "BACKUP_READY";
    operation.finished_at = new Date().toISOString();
    operation.after = { ...operation.before };
    operation.backup_location = normalizePath(finalDirectory);
    await writeOperationReport(paths, operation);
    return {
      backupDirectory: finalDirectory,
      manifestPath: resolve(finalDirectory, "manifest.json"),
      manifest: publishedManifest,
      operation,
    };
  } catch (error) {
    await rm(stagingDirectory, { recursive: true, force: true }).catch(() => undefined);
    operation.status = "VALIDATION_FAILED";
    operation.finished_at = new Date().toISOString();
    operation.error_codes.push(errorCode(error));
    await writeOperationReport(paths, operation).catch(() => undefined);
    throw normalizeRecoveryError(error);
  } finally {
    if (!reusingOwnerLock) await lock?.release().catch(() => undefined);
  }
}

export async function validateBackupBundle(
  bundleDirectory: string,
  options: { faults?: RecoveryFaults } = {},
): Promise<ProductBackupManifest> {
  const root = resolve(bundleDirectory);
  const rootInfo = await lstat(root).catch(() => null);
  if (!rootInfo?.isDirectory() || rootInfo.isSymbolicLink()) throw new ProductRecoveryError("BACKUP_BUNDLE_INVALID");
  const manifestPath = resolve(root, "manifest.json");
  const manifestInfo = await lstat(manifestPath).catch(() => null);
  if (!manifestInfo?.isFile() || manifestInfo.isSymbolicLink()) throw new ProductRecoveryError("BACKUP_MANIFEST_MISSING");
  const manifestRaw = await readFile(manifestPath, "utf8");
  assertRecoveryTextSafe(manifestRaw);
  const manifest = parseManifest(JSON.parse(manifestRaw) as unknown);
  const expected = new Set<string>();
  const logicalIds = new Set(manifest.logical_stores.map((store) => store.logical_store_id));
  for (const entry of manifest.files) {
    validateManifestEntry(entry, logicalIds);
    if (expected.has(entry.relative_path)) throw new ProductRecoveryError("BACKUP_DUPLICATE_PATH");
    expected.add(entry.relative_path);
    const payloadPath = safePayloadPath(root, entry.relative_path);
    const info = await lstat(payloadPath).catch(() => null);
    const forced = options.faults?.forceReparseRelativePath === entry.relative_path;
    if (!info?.isFile()) throw new ProductRecoveryError("BACKUP_PAYLOAD_MISSING");
    if (info.isSymbolicLink() || forced) throw new ProductRecoveryError("BACKUP_REPARSE_POINT_FORBIDDEN");
    if (info.size !== entry.size) throw new ProductRecoveryError("BACKUP_SIZE_MISMATCH");
    if (await sha256File(payloadPath) !== entry.sha256) throw new ProductRecoveryError("BACKUP_HASH_MISMATCH");
    await scanPayloadFile(payloadPath, entry.store_type, entry.logical_store_id);
    if (entry.store_type === "sqlite") {
      await assertSqliteIntegrity(payloadPath);
      await assertSqliteLogicalSchema(payloadPath, entry.logical_store_id);
    } else {
      await validateBackupEntryContent(payloadPath, entry.logical_store_id);
    }
  }
  const actual = new Set(await listRelativeFiles(resolve(root, "payload")));
  if (actual.size !== expected.size || [...actual].some((path) => !expected.has(path))) {
    throw new ProductRecoveryError("BACKUP_PAYLOAD_FILE_SET_MISMATCH", {
      actual: [...actual],
      expected: [...expected],
    });
  }
  const reportJsonCount = manifest.files.filter((entry) => entry.logical_store_id === "reports_library" && entry.relative_path.endsWith(".json")).length;
  if (reportJsonCount > 0) {
    const reports = await buildReportsLibraryIndex({ reportsRootPath: resolve(root, "payload", "stores", "reports"), now: new Date(0) });
    if (!reports.status.library_available || reports.status.skipped_report_count !== 0 || reports.status.valid_report_count !== reportJsonCount) {
      throw new ProductRecoveryError("REPORTS_LIBRARY_INVALID");
    }
  }
  return manifest;
}

export async function restoreProductBackup(options: {
  bundleDirectory: string;
  backupId: string;
  apply?: boolean;
  paths?: ProductRecoveryPaths;
  now?: Date;
  commitSha?: string;
  faults?: RecoveryFaults;
}): Promise<RestoreResult> {
  const paths = options.paths ?? await resolveProductRecoveryPaths();
  await assertMaintenanceOpen(paths);
  assertBackupId(options.backupId);
  const manifest = await validateBackupBundle(options.bundleDirectory, { faults: options.faults });
  await assertRestoreManifestComplete(options.bundleDirectory, manifest);
  if (manifest.backup_id !== options.backupId) throw new ProductRecoveryError("BACKUP_ID_MISMATCH");
  const now = validDate(options.now ?? new Date());
  const operationId = makeId("restore", now);
  const operationDirectory = resolve(paths.operationsRoot, operationId);
  const commitSha = options.commitSha ?? await resolveCommitSha(paths.repoRoot);
  const operation = initialOperation({
    operationId,
    operation: "RESTORE",
    backupId: manifest.backup_id,
    mode: options.apply ? "APPLY" : "PREVIEW",
    now,
    commitSha,
    reportLocation: normalizePath(resolve(operationDirectory, "operation.md")),
  });
  operation.backup_location = normalizePath(resolve(options.bundleDirectory));
  operation.preflight_steps.push(pass("MANIFEST", "BACKUP_MANIFEST_VALID"));
  operation.preflight_steps.push(pass("PAYLOAD_HASHES", "BACKUP_PAYLOAD_VALID"));
  operation.preflight_steps.push(pass("PATH_SAFETY", "BACKUP_PATHS_SAFE"));
  const requiredBytes = manifest.files.reduce((sum, entry) => sum + entry.size, 0) * 3;
  await assertFreeSpace(paths.recoveryRoot, requiredBytes, options.faults?.availableSpaceBytes);
  operation.preflight_steps.push(pass("FREE_SPACE", "FREE_SPACE_AVAILABLE"));
  const mapping = await mapManifestToTargets(manifest, paths);
  operation.store_validations = await validateMappedBundle(options.bundleDirectory, manifest, mapping);
  operation.pointer_validation = "PASS";
  operation.sqlite_integrity = Object.fromEntries(
    manifest.files.filter((entry) => entry.store_type === "sqlite").map((entry) => [entry.logical_store_id, "ok" as const]),
  );
  if (!options.apply) {
    operation.status = "PREVIEW";
    operation.finished_at = new Date().toISOString();
    const reportPath = await writeOperationReport(paths, operation);
    return { operation, operationDirectory, reportPath };
  }

  let lock: RecoveryLock | undefined;
  let safetyBackupDirectory: string | null = null;
  try {
    lock = await acquireOwnerOperationLock(paths, operationId, "RESTORE");
    operation.preflight_steps.push(pass("MAINTENANCE_LOCK", "OWNER_MAINTENANCE_LOCK_ACQUIRED"));
    const currentDescriptors = await buildStoreInventory(paths, { allowMissing: true });
    const safety = await createProductBackup({
      paths,
      backupId: makeId("safety", new Date()),
      backupsRoot: resolve(paths.recoveryRoot, "safety-backups"),
      internalLockToken: INTERNAL_OWNER_LOCK_REUSE,
      allowMissingSources: true,
      commitSha,
      runtimeMode: manifest.runtime_mode,
    });
    operation.safety_backup_id = safety.manifest.backup_id;
    safetyBackupDirectory = safety.backupDirectory;
    operation.before = await hashLogicalState(currentDescriptors, true);
    operation.preflight_steps.push(pass("SAFETY_BACKUP", "PRE_RESTORE_SAFETY_BACKUP_READY"));
    const workRoot = resolve(operationDirectory, "restore-work");
    const stagedRoot = resolve(workRoot, "staged");
    const previousRoot = resolve(workRoot, "previous");
    await stageRestorePayload(options.bundleDirectory, mapping, stagedRoot);
    const groups = groupTargetMappings(mapping, stagedRoot, previousRoot, paths.reportsRoot, manifest);
    await writeTargetMap(operationDirectory, groups);
    await writeOperationReport(paths, operation);
    for (let index = 0; index < groups.length; index += 1) {
      await publishGroup(groups[index], operation);
      await writeOperationReport(paths, operation);
      const published = index + 1;
      if (options.faults?.simulateProcessExitAfterPublishes === published) {
        throw new ProductRecoveryError("SIMULATED_PROCESS_EXIT");
      }
      if (options.faults?.failRestoreAfterPublishes === published) {
        throw new ProductRecoveryError("RESTORE_PUBLICATION_FAILED");
      }
    }
    const afterDescriptors = await buildStoreInventory(paths);
    const afterValidation = await validateSourceState(paths, afterDescriptors);
    operation.store_validations = afterValidation.validations;
    operation.after = await hashLogicalState(afterDescriptors);
    operation.changed_store_count = countChanged(operation.before, operation.after);
    operation.status = "RESTORE_SUCCEEDED";
    operation.finished_at = new Date().toISOString();
    const reportPath = await writeOperationReport(paths, operation);
    return { operation, operationDirectory, reportPath };
  } catch (error) {
    if (errorCode(error) === "SIMULATED_PROCESS_EXIT") {
      operation.error_codes.push("RESTORE_INTERRUPTED");
      await writeOperationReport(paths, operation);
      throw normalizeRecoveryError(error);
    }
    operation.error_codes.push(errorCode(error));
    operation.rollback.attempted = true;
    try {
      if (options.faults?.failRollback) throw new ProductRecoveryError("ROLLBACK_INJECTED_FAILURE");
      if (!safetyBackupDirectory) throw new ProductRecoveryError("SAFETY_BACKUP_UNAVAILABLE");
      await validateBackupBundle(safetyBackupDirectory);
      await rollbackPublication(operationDirectory, operation);
      await restoreMissingFromSafetyBundle(safetyBackupDirectory, paths);
      const restored = await buildStoreInventory(paths, { allowMissing: true });
      const validation = await validateSourceState(paths, restored, true);
      operation.store_validations = validation.validations;
      operation.after = await hashLogicalState(restored);
      if (!sameHashes(operation.before, operation.after)) throw new ProductRecoveryError("ROLLBACK_BYTE_IDENTITY_FAILED");
      operation.rollback = { attempted: true, status: "SUCCEEDED", code: "ROLLBACK_SUCCEEDED" };
      operation.status = "RESTORE_FAILED_ROLLED_BACK";
    } catch (rollbackError) {
      operation.rollback = { attempted: true, status: "FAILED", code: errorCode(rollbackError) };
      operation.error_codes.push(errorCode(rollbackError));
      operation.status = "ROLLBACK_FAILED";
      await writeMaintenanceState(paths, operation, errorCode(rollbackError));
    }
    operation.finished_at = new Date().toISOString();
    const reportPath = await writeOperationReport(paths, operation);
    return { operation, operationDirectory, reportPath };
  } finally {
    await lock?.release().catch(() => undefined);
  }
}

export async function recoverInterruptedRestore(
  operationDirectory: string,
  paths: ProductRecoveryPaths,
): Promise<RestoreResult> {
  await assertMaintenanceOpen(paths);
  const journalPath = resolve(operationDirectory, "operation.json");
  const operation = parseOperation(JSON.parse(await readFile(journalPath, "utf8")) as unknown);
  if (operation.operation !== "RESTORE" || operation.finished_at !== null || operation.publication_log.length === 0) {
    throw new ProductRecoveryError("RESTORE_JOURNAL_NOT_RECOVERABLE");
  }
  const lock = await acquireOwnerOperationLock(paths, operation.operation_id, "ROLLBACK");
  try {
    operation.rollback.attempted = true;
    if (!operation.safety_backup_id) throw new ProductRecoveryError("SAFETY_BACKUP_UNAVAILABLE");
    const safetyBackupDirectory = resolve(paths.recoveryRoot, "safety-backups", operation.safety_backup_id);
    await validateBackupBundle(safetyBackupDirectory);
    await rollbackPublication(operationDirectory, operation);
    await restoreMissingFromSafetyBundle(safetyBackupDirectory, paths);
    const restored = await buildStoreInventory(paths, { allowMissing: true });
    await validateSourceState(paths, restored, true);
    operation.after = await hashLogicalState(restored);
    if (!sameHashes(operation.before, operation.after)) throw new ProductRecoveryError("ROLLBACK_BYTE_IDENTITY_FAILED");
    operation.rollback = { attempted: true, status: "SUCCEEDED", code: "ROLLBACK_SUCCEEDED" };
    operation.status = "RESTORE_FAILED_ROLLED_BACK";
    operation.finished_at = new Date().toISOString();
    const reportPath = await writeOperationReport(paths, operation);
    return { operation, operationDirectory: resolve(operationDirectory), reportPath };
  } catch (error) {
    operation.rollback = { attempted: true, status: "FAILED", code: errorCode(error) };
    operation.status = "ROLLBACK_FAILED";
    operation.finished_at = new Date().toISOString();
    operation.error_codes.push(errorCode(error));
    await writeMaintenanceState(paths, operation, errorCode(error));
    const reportPath = await writeOperationReport(paths, operation);
    return { operation, operationDirectory: resolve(operationDirectory), reportPath };
  } finally {
    await lock.release().catch(() => undefined);
  }
}

export async function hashCanonicalProductState(paths?: ProductRecoveryPaths): Promise<Record<string, string>> {
  const resolvedPaths = paths ?? await resolveProductRecoveryPaths();
  const descriptors = await buildStoreInventory(resolvedPaths, { allowMissing: true, skipValidation: true });
  return hashLogicalState(descriptors, true);
}

export async function acquireOwnerOperationLockForTest(
  paths: ProductRecoveryPaths,
  operationId = makeId("recovery", new Date()),
): Promise<RecoveryLock> {
  return acquireOwnerOperationLock(paths, operationId, "RECOVERY_DRILL");
}

async function buildStoreInventory(
  paths: ProductRecoveryPaths,
  options: { allowMissing?: boolean; skipValidation?: boolean } = {},
): Promise<StoreDescriptor[]> {
  const corePaths = [
    paths.followUpStore,
    paths.followUpBackup,
    paths.newInboxStore,
    paths.lifecycleAuditStore,
    paths.lifecycleOperationJournal,
    paths.establishedStore,
    paths.establishedConfig,
    paths.feedbackSqlite,
    paths.aiQueueSqlite,
    paths.userWorkspaceSqlite,
    paths.automationState,
    paths.reportsRoot,
  ];
  let anyCoreState = false;
  for (const path of corePaths) if (await exists(path)) anyCoreState = true;
  const allowEmptyState = Boolean(options.allowMissing && !anyCoreState);
  const automationRaw = await readRequiredJson(paths.automationState, "AUTOMATION_STATE_MISSING", allowEmptyState);
  const automation = automationRaw === null ? null : normalizeAutomationState(automationRaw);
  const establishedStoreDescriptor = descriptor(
    "established_universe_store",
    paths.establishedStore,
    "stores/established/store.json",
    "json",
    true,
  );
  if (!await exists(paths.establishedStore) && await exists(paths.establishedConfig)) {
    const current = validateEstablishedAddressUniverse(
      JSON.parse(await readFile(paths.establishedConfig, "utf8")) as unknown,
    );
    establishedStoreDescriptor.generatedContent = `${JSON.stringify({
      schema_version: "established_universe_store_v1",
      current,
      history: [],
      audit_log: [],
    }, null, 2)}\n`;
  }
  const descriptors: StoreDescriptor[] = [
    descriptor("follow_up_store", paths.followUpStore, "stores/follow-up/store.json", "json", true),
    descriptor("follow_up_backup", paths.followUpBackup, "stores/follow-up/store.json.bak", "json", true, ["follow_up_store"]),
    descriptor("new_inbox_store", paths.newInboxStore, "stores/lifecycle/new-inbox.json", "json", true),
    descriptor("lifecycle_audit_store", paths.lifecycleAuditStore, "stores/lifecycle/audit.json", "json", true, ["new_inbox_store"]),
    descriptor("lifecycle_operation_journal", paths.lifecycleOperationJournal, "stores/lifecycle/operation-journal.json", "json", true, ["new_inbox_store", "lifecycle_audit_store"]),
    establishedStoreDescriptor,
    descriptor("established_address_config", paths.establishedConfig, "config/established_address_universe_v1.json", "config", true),
    descriptor("feedback_sqlite", paths.feedbackSqlite, "stores/sqlite/tester-feedback.sqlite", "sqlite", true),
    descriptor("ai_queue_cache_sqlite", paths.aiQueueSqlite, "stores/sqlite/ai-analysis-queue.sqlite", "sqlite", true),
    descriptor("user_workspace_sqlite", paths.userWorkspaceSqlite, "stores/sqlite/user-workspace.sqlite", "sqlite", true),
    descriptor("central_automation_state", paths.automationState, "stores/automation/automation-state.json", "json", true),
  ];
  for (const config of paths.safeConfigFiles) {
    descriptors.push(descriptor(config.logicalStoreId, config.path, config.payloadPath, "config", true));
  }
  if (await exists(paths.runOnceReceipt)) {
    descriptors.push(descriptor("central_run_once_receipt", paths.runOnceReceipt, "stores/automation/last-run-once.json", "json", false));
  }
  if (automation?.last_published_scanner_run_id) {
    const runId = automation.last_published_scanner_run_id;
    const path = resolve(paths.outputRoot, runId, "full_output.json");
    assertContained(paths.outputRoot, path);
    descriptors.push(descriptor("active_scanner_snapshot", path, `snapshots/scanner/${runId}/full_output.json`, "json", true, ["central_automation_state"]));
  }
  if (automation?.last_published_context_run_id) {
    const runId = automation.last_published_context_run_id;
    const path = resolve(paths.outputRoot, runId, "approved_sources_output.json");
    assertContained(paths.outputRoot, path);
    descriptors.push(descriptor("active_context_snapshot", path, `snapshots/context/${runId}/approved_sources_output.json`, "json", true, ["central_automation_state"]));
  }
  const reportsInfo = await lstat(paths.reportsRoot).catch(() => null);
  if (!reportsInfo?.isDirectory() || reportsInfo.isSymbolicLink()) {
    if (!allowEmptyState) throw new ProductRecoveryError("REPORTS_LIBRARY_MISSING");
  } else {
    const entries = await readdir(paths.reportsRoot, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name === ".gitkeep" || /^\.analyst-report-.*\.tmp$/.test(entry.name)) continue;
      if (!entry.isFile() || (!/^analyst-report-[A-Za-z0-9_-]+\.json$/.test(entry.name) && !/^analyst-report-[A-Za-z0-9_-]+\.md$/.test(entry.name))) {
        throw new ProductRecoveryError("REPORTS_LIBRARY_UNSAFE_ARTIFACT");
      }
      descriptors.push(descriptor(
        "reports_library",
        resolve(paths.reportsRoot, entry.name),
        `stores/reports/${entry.name}`,
        "report",
        false,
      ));
    }
  }
  if (allowEmptyState) {
    const filtered: StoreDescriptor[] = [];
    for (const item of descriptors) if (item.generatedContent !== undefined || await exists(item.sourcePath)) filtered.push(item);
    return filtered;
  }
  if (!options.skipValidation) {
    for (const item of descriptors) {
      if (item.generatedContent === undefined) await assertRegularSource(item.sourcePath, item.logicalStoreId);
    }
  }
  return descriptors;
}

async function validateSourceState(
  paths: ProductRecoveryPaths,
  descriptors: StoreDescriptor[],
  allowMissing = false,
): Promise<{ validations: RecoveryValidation[]; sqliteIntegrity: Record<string, "ok"> }> {
  const validations: RecoveryValidation[] = [];
  const sqliteIntegrity: Record<string, "ok"> = {};
  const byId = new Map<string, StoreDescriptor[]>();
  for (const item of descriptors) byId.set(item.logicalStoreId, [...(byId.get(item.logicalStoreId) ?? []), item]);
  for (const item of descriptors) {
    if (item.storeType === "sqlite") {
      await assertSqliteIntegrity(item.sourcePath);
      await assertSqliteLogicalSchema(item.sourcePath, item.logicalStoreId);
      await scanSqliteValues(item.sourcePath);
      sqliteIntegrity[item.logicalStoreId] = "ok";
      validations.push({ logical_store_id: item.logicalStoreId, status: "VALID", code: "SQLITE_INTEGRITY_OK", sqlite_integrity: "ok", sha256: await sha256File(item.sourcePath) });
      continue;
    }
    const raw = item.generatedContent ?? await readFile(item.sourcePath, "utf8");
    assertRecoveryTextSafe(raw, item.logicalStoreId);
    if (item.logicalStoreId === "follow_up_store" || item.logicalStoreId === "follow_up_backup") {
      validateFollowUpStore(JSON.parse(raw) as unknown);
    } else if (item.logicalStoreId === "new_inbox_store") {
      validateNewInboxStore(JSON.parse(raw) as unknown);
    } else if (item.logicalStoreId === "lifecycle_audit_store") {
      validateLifecycleAuditStore(JSON.parse(raw) as unknown);
    } else if (item.logicalStoreId === "lifecycle_operation_journal") {
      validateLifecycleOperationJournalStore(JSON.parse(raw) as unknown);
    } else if (item.logicalStoreId === "established_universe_store") {
      validateEstablishedUniverseStore(JSON.parse(raw) as unknown);
    } else if (item.logicalStoreId === "established_address_config") {
      validateEstablishedAddressUniverse(JSON.parse(raw) as unknown);
    } else if (item.logicalStoreId === "central_automation_state") {
      normalizeAutomationState(JSON.parse(raw) as unknown);
    } else if (item.logicalStoreId === "active_scanner_snapshot") {
      const output = JSON.parse(raw) as PersistableScannerOutput;
      validateRecoveryScannerSnapshot(output);
      const pointer = normalizeAutomationState(JSON.parse(await readFile(paths.automationState, "utf8")) as unknown).last_published_scanner_run_id;
      if (!pointer || output.scan_run?.run_id !== pointer) throw new ProductRecoveryError("SCANNER_POINTER_INCONSISTENT");
    } else if (item.logicalStoreId === "active_context_snapshot") {
      const output = JSON.parse(raw) as ApprovedSourcesRunOutput;
      validateDisplayEligibleContextSnapshot(output);
      const pointer = normalizeAutomationState(JSON.parse(await readFile(paths.automationState, "utf8")) as unknown).last_published_context_run_id;
      if (!pointer || output.run_id !== pointer) throw new ProductRecoveryError("CONTEXT_POINTER_INCONSISTENT");
    }
    validations.push({
      logical_store_id: item.logicalStoreId,
      status: "VALID",
      code: item.generatedContent === undefined ? "SOURCE_VALID" : "SOURCE_FALLBACK_VALID",
      sha256: item.generatedContent === undefined ? await sha256File(item.sourcePath) : sha256Text(item.generatedContent),
    });
  }
  const reportsRootExists = await exists(paths.reportsRoot);
  if (reportsRootExists) {
    const reports = await buildReportsLibraryIndex({ reportsRootPath: paths.reportsRoot, now: new Date(0) });
    if (!reports.status.library_available || reports.status.skipped_report_count !== 0) {
      throw new ProductRecoveryError("REPORTS_LIBRARY_INVALID");
    }
    if (!byId.has("reports_library")) {
      validations.push({ logical_store_id: "reports_library", status: "VALID", code: "REPORTS_LIBRARY_EMPTY" });
    }
  } else if (!allowMissing) {
    throw new ProductRecoveryError("REPORTS_LIBRARY_MISSING");
  }
  return { validations: uniqueValidations(validations), sqliteIntegrity };
}

async function validateMappedBundle(
  bundleDirectory: string,
  manifest: ProductBackupManifest,
  mapping: TargetMapping[],
): Promise<RecoveryValidation[]> {
  const validations: RecoveryValidation[] = [];
  for (const entry of manifest.files) {
    const mapped = mapping.find((candidate) => candidate.entry.relative_path === entry.relative_path);
    if (!mapped) throw new ProductRecoveryError("LOGICAL_STORE_ID_MISMATCH");
    const payloadPath = safePayloadPath(bundleDirectory, entry.relative_path);
    if (entry.store_type === "sqlite") await assertSqliteIntegrity(payloadPath);
    validations.push({
      logical_store_id: entry.logical_store_id,
      status: "VALID",
      code: entry.store_type === "sqlite" ? "SQLITE_INTEGRITY_OK" : "BACKUP_PAYLOAD_VALID",
      sha256: entry.sha256,
      ...(entry.store_type === "sqlite" ? { sqlite_integrity: "ok" as const } : {}),
    });
  }
  return uniqueValidations(validations);
}

async function assertRestoreManifestComplete(
  bundleDirectory: string,
  manifest: ProductBackupManifest,
): Promise<void> {
  const ids = new Set(manifest.logical_stores.map((store) => store.logical_store_id));
  const required = [
    "follow_up_store",
    "follow_up_backup",
    "new_inbox_store",
    "lifecycle_audit_store",
    "lifecycle_operation_journal",
    "established_universe_store",
    "established_address_config",
    "feedback_sqlite",
    "ai_queue_cache_sqlite",
    "user_workspace_sqlite",
    "central_automation_state",
    "runtime_policy_config",
    "established_discovery_query_plan",
    "data_source_registry",
    "reports_library",
  ];
  if (required.some((id) => !ids.has(id))) throw new ProductRecoveryError("REQUIRED_LOGICAL_STORE_MISSING");
  for (const store of manifest.logical_stores) {
    const count = manifest.files.filter((entry) => entry.logical_store_id === store.logical_store_id).length;
    if (count !== store.file_count) throw new ProductRecoveryError("LOGICAL_STORE_FILE_COUNT_MISMATCH");
    if (store.required && count === 0) throw new ProductRecoveryError("REQUIRED_LOGICAL_STORE_MISSING");
  }
  const automationEntry = manifest.files.find((entry) => entry.logical_store_id === "central_automation_state");
  if (!automationEntry) throw new ProductRecoveryError("REQUIRED_LOGICAL_STORE_MISSING");
  const automation = normalizeAutomationState(JSON.parse(
    await readFile(safePayloadPath(bundleDirectory, automationEntry.relative_path), "utf8"),
  ) as unknown);
  if (automation.last_published_scanner_run_id) {
    const scanner = manifest.files.find((entry) => entry.logical_store_id === "active_scanner_snapshot");
    const expected = `snapshots/scanner/${automation.last_published_scanner_run_id}/full_output.json`;
    if (!scanner || scanner.relative_path !== expected) throw new ProductRecoveryError("SCANNER_POINTER_INCONSISTENT");
  }
  if (automation.last_published_context_run_id) {
    const context = manifest.files.find((entry) => entry.logical_store_id === "active_context_snapshot");
    const expected = `snapshots/context/${automation.last_published_context_run_id}/approved_sources_output.json`;
    if (!context || context.relative_path !== expected) throw new ProductRecoveryError("CONTEXT_POINTER_INCONSISTENT");
  }
}

async function validateBackupEntryContent(path: string, logicalStoreId: string): Promise<void> {
  const raw = await readFile(path, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (error) {
    if (logicalStoreId === "reports_library" && path.endsWith(".md")) return;
    throw new ProductRecoveryError("BACKUP_JSON_INVALID", error);
  }
  if (logicalStoreId === "follow_up_store" || logicalStoreId === "follow_up_backup") {
    validateFollowUpStore(parsed);
  } else if (logicalStoreId === "established_universe_store") {
    validateEstablishedUniverseStore(parsed);
  } else if (logicalStoreId === "established_address_config") {
    validateEstablishedAddressUniverse(parsed);
  } else if (logicalStoreId === "central_automation_state") {
    normalizeAutomationState(parsed);
  } else if (logicalStoreId === "active_scanner_snapshot") {
    validateRecoveryScannerSnapshot(parsed as PersistableScannerOutput);
  } else if (logicalStoreId === "active_context_snapshot") {
    validateDisplayEligibleContextSnapshot(parsed as ApprovedSourcesRunOutput);
  }
}

type TargetMapping = { entry: ProductBackupFile; targetPath: string; groupId: string };

async function mapManifestToTargets(manifest: ProductBackupManifest, paths: ProductRecoveryPaths): Promise<TargetMapping[]> {
  const staticTargets: Record<string, string> = {
    follow_up_store: paths.followUpStore,
    follow_up_backup: paths.followUpBackup,
    new_inbox_store: paths.newInboxStore,
    lifecycle_audit_store: paths.lifecycleAuditStore,
    lifecycle_operation_journal: paths.lifecycleOperationJournal,
    established_universe_store: paths.establishedStore,
    established_address_config: paths.establishedConfig,
    feedback_sqlite: paths.feedbackSqlite,
    ai_queue_cache_sqlite: paths.aiQueueSqlite,
    user_workspace_sqlite: paths.userWorkspaceSqlite,
    central_automation_state: paths.automationState,
    central_run_once_receipt: paths.runOnceReceipt,
  };
  for (const config of paths.safeConfigFiles) staticTargets[config.logicalStoreId] = config.path;
  return manifest.files.map((entry) => {
    let targetPath = staticTargets[entry.logical_store_id];
    let groupId = entry.logical_store_id;
    if (entry.logical_store_id === "reports_library") {
      targetPath = resolve(paths.reportsRoot, basename(entry.relative_path));
      groupId = "reports_library";
    } else if (entry.logical_store_id === "active_scanner_snapshot") {
      const match = /^snapshots\/scanner\/([^/]+)\/full_output\.json$/.exec(entry.relative_path);
      if (!match) throw new ProductRecoveryError("LOGICAL_STORE_PATH_INVALID");
      targetPath = resolve(paths.outputRoot, match[1], "full_output.json");
    } else if (entry.logical_store_id === "active_context_snapshot") {
      const match = /^snapshots\/context\/([^/]+)\/approved_sources_output\.json$/.exec(entry.relative_path);
      if (!match) throw new ProductRecoveryError("LOGICAL_STORE_PATH_INVALID");
      targetPath = resolve(paths.outputRoot, match[1], "approved_sources_output.json");
    }
    if (!targetPath) throw new ProductRecoveryError("UNKNOWN_LOGICAL_STORE_ID");
    return { entry, targetPath: resolve(targetPath), groupId };
  });
}

async function stageRestorePayload(bundleDirectory: string, mapping: TargetMapping[], stagedRoot: string): Promise<void> {
  await rm(stagedRoot, { recursive: true, force: true });
  await mkdir(resolve(stagedRoot, "stores", "reports"), { recursive: true });
  for (const mapped of mapping) {
    const staged = resolve(stagedRoot, mapped.entry.relative_path);
    assertContained(stagedRoot, staged);
    await mkdir(dirname(staged), { recursive: true });
    await copyRegularFile(safePayloadPath(bundleDirectory, mapped.entry.relative_path), staged);
    if (await sha256File(staged) !== mapped.entry.sha256) throw new ProductRecoveryError("RESTORE_STAGING_HASH_MISMATCH");
  }
}

async function restoreMissingFromSafetyBundle(
  safetyBundleDirectory: string,
  paths: ProductRecoveryPaths,
): Promise<void> {
  const manifest = await validateBackupBundle(safetyBundleDirectory);
  const mapping = await mapManifestToTargets(manifest, paths);
  for (const mapped of mapping) {
    if (await exists(mapped.targetPath)) continue;
    await mkdir(dirname(mapped.targetPath), { recursive: true });
    await copyRegularFile(
      safePayloadPath(safetyBundleDirectory, mapped.entry.relative_path),
      mapped.targetPath,
    );
  }
  if (
    manifest.logical_stores.some((store) => store.logical_store_id === "reports_library")
    && !await exists(paths.reportsRoot)
  ) await mkdir(paths.reportsRoot, { recursive: true });
}

type PublishGroup = {
  logicalStoreId: string;
  files: Array<{ stagedPath: string; targetPath: string; previousPath: string }>;
};

function groupTargetMappings(
  mapping: TargetMapping[],
  stagedRoot: string,
  previousRoot: string,
  reportsRoot: string,
  manifest: ProductBackupManifest,
): PublishGroup[] {
  const groups = new Map<string, PublishGroup>();
  for (const mapped of mapping) {
    if (mapped.groupId === "reports_library") continue;
    const group = groups.get(mapped.groupId) ?? { logicalStoreId: mapped.groupId, files: [] };
    group.files.push({
      stagedPath: resolve(stagedRoot, mapped.entry.relative_path),
      targetPath: mapped.targetPath,
      previousPath: resolve(previousRoot, mapped.entry.relative_path),
    });
    groups.set(mapped.groupId, group);
  }
  if (manifest.logical_stores.some((store) => store.logical_store_id === "reports_library")) {
    groups.set("reports_library", {
      logicalStoreId: "reports_library",
      files: [{
        stagedPath: resolve(stagedRoot, "stores", "reports"),
        targetPath: resolve(reportsRoot),
        previousPath: resolve(previousRoot, "stores", "reports"),
      }],
    });
  }
  const priority = [
    "active_scanner_snapshot", "active_context_snapshot", "follow_up_store", "follow_up_backup",
    "established_universe_store", "established_address_config", "feedback_sqlite",
    "ai_queue_cache_sqlite", "user_workspace_sqlite", "new_inbox_store", "lifecycle_audit_store", "lifecycle_operation_journal", "reports_library", "runtime_policy_config",
    "established_discovery_query_plan", "data_source_registry", "central_run_once_receipt",
    "central_automation_state",
  ];
  return [...groups.values()].sort((left, right) => priority.indexOf(left.logicalStoreId) - priority.indexOf(right.logicalStoreId));
}

async function publishGroup(group: PublishGroup, operation: ProductRecoveryOperation): Promise<void> {
  let existing = false;
  for (const file of group.files) if (await exists(file.targetPath)) existing = true;
  const log = { logical_store_id: group.logicalStoreId, target_existed: existing, published: false, rolled_back: false };
  operation.publication_log.push(log);
  if (group.logicalStoreId === "feedback_sqlite" || group.logicalStoreId === "ai_queue_cache_sqlite" || group.logicalStoreId === "user_workspace_sqlite") {
    for (const file of group.files) await quiesceAndPreserveSqliteSidecars(file.targetPath, file.previousPath);
  }
  for (const file of group.files) {
    await mkdir(dirname(file.targetPath), { recursive: true });
    if (await exists(file.targetPath)) {
      await mkdir(dirname(file.previousPath), { recursive: true });
      await rename(file.targetPath, file.previousPath);
    }
    await rename(file.stagedPath, file.targetPath);
  }
  log.published = true;
}

async function quiesceAndPreserveSqliteSidecars(targetPath: string, previousPath: string): Promise<void> {
  if (await exists(targetPath)) {
    const sqlite = await loadNodeSqlite();
    const database = new sqlite.DatabaseSync(targetPath);
    try {
      database.exec("PRAGMA busy_timeout = 5000");
      database.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    } catch (error) {
      throw new ProductRecoveryError("SQLITE_MAINTENANCE_CHECKPOINT_FAILED", error);
    } finally {
      database.close();
    }
  }
  for (const suffix of ["-wal", "-shm"]) {
    const sidecar = `${targetPath}${suffix}`;
    if (!await exists(sidecar)) continue;
    const preserved = `${previousPath}${suffix}`;
    await mkdir(dirname(preserved), { recursive: true });
    await rename(sidecar, preserved);
  }
}

async function rollbackPublication(operationDirectory: string, operation: ProductRecoveryOperation): Promise<void> {
  const workRoot = resolve(operationDirectory, "restore-work");
  const previousRoot = resolve(workRoot, "previous");
  const stagedRoot = resolve(workRoot, "staged");
  for (const entry of [...operation.publication_log].reverse()) {
    if (!entry.published) continue;
    const mappings = await findPublishedFilesForGroup(entry.logical_store_id, previousRoot, stagedRoot, operationDirectory);
    for (const file of mappings.reverse()) {
      if (await exists(file.targetPath)) {
        await mkdir(dirname(file.failedPath), { recursive: true });
        await rename(file.targetPath, file.failedPath);
      }
      if (await exists(file.previousPath)) {
        await mkdir(dirname(file.targetPath), { recursive: true });
        await rename(file.previousPath, file.targetPath);
      }
    }
    entry.rolled_back = true;
  }
}

async function findPublishedFilesForGroup(
  logicalStoreId: string,
  previousRoot: string,
  stagedRoot: string,
  operationDirectory: string,
): Promise<Array<{ targetPath: string; previousPath: string; failedPath: string }>> {
  const journal = parseOperation(JSON.parse(await readFile(resolve(operationDirectory, "operation.json"), "utf8")) as unknown);
  const mappingPath = resolve(operationDirectory, "target-map.json");
  const mappingRaw = await readFile(mappingPath, "utf8").catch(() => null);
  if (!mappingRaw) throw new ProductRecoveryError("RESTORE_TARGET_MAP_MISSING");
  const mappings = JSON.parse(mappingRaw) as Array<{ logical_store_id: string; target_path: string; relative_path: string }>;
  void journal;
  return mappings.filter((entry) => entry.logical_store_id === logicalStoreId).map((entry) => ({
    targetPath: entry.target_path,
    previousPath: resolve(previousRoot, entry.relative_path),
    failedPath: resolve(stagedRoot, ".failed", entry.relative_path),
  }));
}

async function writeTargetMap(operationDirectory: string, groups: PublishGroup[]): Promise<void> {
  await writeJsonDurable(resolve(operationDirectory, "target-map.json"), groups.flatMap((group) => group.files.map((entry) => ({
    logical_store_id: group.logicalStoreId,
    target_path: entry.targetPath,
    relative_path: normalizePayloadRelative(relative(resolve(operationDirectory, "restore-work", "previous"), entry.previousPath)),
  }))));
}

async function validateBackupPayloadAgainstManifest(
  stagingDirectory: string,
  manifest: ProductBackupManifest,
  faults?: RecoveryFaults,
): Promise<void> {
  const logicalIds = new Set(manifest.logical_stores.map((store) => store.logical_store_id));
  for (const entry of manifest.files) {
    validateManifestEntry(entry, logicalIds);
    const path = safePayloadPath(stagingDirectory, entry.relative_path);
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink() || faults?.forceReparseRelativePath === entry.relative_path) {
      throw new ProductRecoveryError("BACKUP_REPARSE_POINT_FORBIDDEN");
    }
    if (info.size !== entry.size || await sha256File(path) !== entry.sha256) {
      throw new ProductRecoveryError("BACKUP_HASH_MISMATCH");
    }
  }
}

async function backupSqliteDatabase(sourcePath: string, destinationPath: string): Promise<void> {
  await assertSqliteIntegrity(sourcePath);
  const sqlite = await loadNodeSqlite();
  const source = new sqlite.DatabaseSync(sourcePath);
  try {
    source.exec("PRAGMA busy_timeout = 5000");
    source.exec("PRAGMA wal_checkpoint(PASSIVE)");
    source.exec(`VACUUM INTO '${destinationPath.replaceAll("'", "''")}'`);
  } catch (error) {
    throw new ProductRecoveryError("SQLITE_BACKUP_FAILED", error);
  } finally {
    source.close();
  }
  const snapshot = new sqlite.DatabaseSync(destinationPath);
  try {
    snapshot.exec("PRAGMA journal_mode = DELETE");
    snapshot.exec("PRAGMA synchronous = FULL");
  } finally {
    snapshot.close();
  }
  await assertSqliteIntegrity(destinationPath);
}

async function assertSqliteIntegrity(path: string): Promise<void> {
  const sqlite = await loadNodeSqlite();
  let database: SqliteDatabase | null = null;
  try {
    database = new sqlite.DatabaseSync(path);
    database.exec("PRAGMA query_only = ON");
    const row = database.prepare("PRAGMA integrity_check").get();
    const value = isRecord(row) ? Object.values(row)[0] : null;
    if (value !== "ok") throw new ProductRecoveryError("SQLITE_INTEGRITY_FAILED");
  } catch (error) {
    throw error instanceof ProductRecoveryError ? error : new ProductRecoveryError("SQLITE_INTEGRITY_FAILED", error);
  } finally {
    database?.close();
  }
}

async function assertSqliteLogicalSchema(path: string, logicalStoreId: string): Promise<void> {
  const sqlite = await loadNodeSqlite();
  const database = new sqlite.DatabaseSync(path);
  try {
    database.exec("PRAGMA query_only = ON");
    const tables = new Set(database.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()
      .flatMap((row) => isRecord(row) && typeof row.name === "string" ? [row.name] : []));
    if (logicalStoreId === "feedback_sqlite" && !tables.has("tester_feedback")) {
      throw new ProductRecoveryError("FEEDBACK_SQLITE_SCHEMA_INVALID");
    }
    if (logicalStoreId === "ai_queue_cache_sqlite" && (
      !tables.has("crypto_ai_analysis_queue")
      || !tables.has("crypto_ai_analysis_request_log")
      || !tables.has("crypto_ai_worker_state")
    )) throw new ProductRecoveryError("AI_QUEUE_SQLITE_SCHEMA_INVALID");
    if (logicalStoreId === "user_workspace_sqlite" && (
      !tables.has("user_workspace_status")
      || !tables.has("user_workspace_audit")
      || !tables.has("user_workspace_meta")
    )) throw new ProductRecoveryError("USER_WORKSPACE_SQLITE_SCHEMA_INVALID");
  } finally {
    database.close();
  }
}

async function scanSqliteValues(path: string): Promise<void> {
  const sqlite = await loadNodeSqlite();
  const database = new sqlite.DatabaseSync(path);
  try {
    database.exec("PRAGMA query_only = ON");
    const tables = database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
    for (const row of tables) {
      if (!isRecord(row) || typeof row.name !== "string" || !/^[A-Za-z0-9_]+$/.test(row.name)) continue;
      const values = database.prepare(`SELECT * FROM ${row.name}`).all();
      for (const value of values) {
        if (!isRecord(value)) continue;
        for (const field of Object.values(value)) if (typeof field === "string") assertRecoveryTextSafe(field);
      }
    }
  } finally {
    database.close();
  }
}

async function loadNodeSqlite(): Promise<SqliteModule> {
  const moduleValue = await importModule("node:sqlite");
  if (!isRecord(moduleValue) || typeof moduleValue.DatabaseSync !== "function") {
    throw new ProductRecoveryError("SQLITE_RUNTIME_UNAVAILABLE");
  }
  return { DatabaseSync: moduleValue.DatabaseSync as SqliteModule["DatabaseSync"] };
}

async function scanPayloadFile(
  path: string,
  type: ProductBackupFile["store_type"],
  logicalStoreId?: string,
): Promise<void> {
  if (type === "sqlite") return scanSqliteValues(path);
  assertRecoveryTextSafe(await readFile(path, "utf8"), logicalStoreId);
}

export function assertRecoveryTextSafe(value: string, logicalStoreId?: string): void {
  for (const matcher of SECRET_PATTERNS) {
    const publicRegistryContact = matcher.code === "PERSONAL_EMAIL_DETECTED"
      && logicalStoreId === "data_source_registry";
    if (!publicRegistryContact && matcher.pattern.test(value)) throw new ProductRecoveryError(matcher.code);
  }
}

export function validateRecoveryScannerSnapshot(output: PersistableScannerOutput): void {
  try {
    validateDisplayEligibleScannerSnapshot(output);
    return;
  } catch {
    const storageValidation = validatePersistableScannerOutput(output);
    if (!storageValidation.valid) throw new ProductRecoveryError("SCANNER_SNAPSHOT_INVALID");
  }
}

async function acquireOwnerOperationLock(
  paths: ProductRecoveryPaths,
  operationId: string,
  operation: ProductRecoveryOperation["operation"],
): Promise<RecoveryLock> {
  if (!OPERATION_ID_PATTERN.test(operationId)) throw new ProductRecoveryError("OPERATION_ID_INVALID");
  await assertMaintenanceOpen(paths);
  await mkdir(dirname(paths.ownerLockPath), { recursive: true });
  let handle;
  try {
    handle = await open(paths.ownerLockPath, "wx");
    await handle.writeFile(`${JSON.stringify({
      schema_version: PRODUCT_RECOVERY_OPERATION_SCHEMA_VERSION,
      operation_id: operationId,
      operation,
      pid: process.pid,
      acquired_at: new Date().toISOString(),
    }, null, 2)}\n`, "utf8");
    await handle.sync();
    await handle.close();
  } catch (error) {
    await handle?.close().catch(() => undefined);
    if (isErrorCode(error, "EEXIST")) throw new ProductRecoveryError("OWNER_OPERATION_ALREADY_IN_PROGRESS");
    throw new ProductRecoveryError("OWNER_OPERATION_LOCK_FAILED", error);
  }
  let released = false;
  return {
    release: async () => {
      if (released) return;
      released = true;
      await rm(paths.ownerLockPath, { force: true });
    },
  };
}

async function assertMaintenanceOpen(paths: ProductRecoveryPaths): Promise<void> {
  if (await exists(paths.maintenanceStatePath)) throw new ProductRecoveryError("RECOVERY_MAINTENANCE_STATE_ACTIVE");
}

async function writeMaintenanceState(
  paths: ProductRecoveryPaths,
  operation: ProductRecoveryOperation,
  code: string,
): Promise<void> {
  await writeJsonDurable(paths.maintenanceStatePath, {
    schema_version: PRODUCT_RECOVERY_OPERATION_SCHEMA_VERSION,
    state: "FAIL_CLOSED_MAINTENANCE",
    operation_id: operation.operation_id,
    backup_id: operation.backup_id,
    error_code: safeErrorCode(code),
    entered_at: new Date().toISOString(),
  });
}

async function writeOperationReport(paths: ProductRecoveryPaths, operation: ProductRecoveryOperation): Promise<string> {
  const directory = resolve(paths.operationsRoot, operation.operation_id);
  await mkdir(directory, { recursive: true });
  const reportPath = resolve(directory, "operation.md");
  operation.report_location = normalizePath(reportPath);
  await writeJsonAtomic(resolve(directory, "operation.json"), operation);
  await writeTextAtomic(reportPath, renderOperationMarkdown(operation));
  return reportPath;
}

function renderOperationMarkdown(operation: ProductRecoveryOperation): string {
  const validationLines = operation.store_validations.length === 0
    ? "- No store validations recorded."
    : operation.store_validations.map((item) => `- ${item.logical_store_id}: ${item.status} (${item.code})`).join("\n");
  return `# Crypto Edge AI recovery operation\n\n` +
    `- Schema: \`${operation.schema_version}\`\n` +
    `- Operation ID: \`${operation.operation_id}\`\n` +
    `- Operation: ${operation.operation}\n` +
    `- Mode: ${operation.mode}\n` +
    `- Status: ${operation.status}\n` +
    `- Backup ID: ${operation.backup_id ?? "none"}\n` +
    `- Started: ${operation.started_at}\n` +
    `- Finished: ${operation.finished_at ?? "in progress"}\n` +
    `- Changed stores: ${operation.changed_store_count}\n` +
    `- Rollback: ${operation.rollback.status}\n` +
    `- Secrets: ${operation.no_secrets ? "none detected" : "validation failed"}\n` +
    `- OpenAI calls: ${operation.openai_calls}\n` +
    `- Live provider calls: ${operation.live_provider_calls}\n` +
    `- Central live cycles: ${operation.central_live_cycles}\n` +
    `- Task Scheduler mutations: ${operation.task_scheduler_mutations}\n\n` +
    `## Store validation\n\n${validationLines}\n`;
}

function initialOperation(input: {
  operationId: string;
  operation: ProductRecoveryOperation["operation"];
  backupId: string | null;
  mode: ProductRecoveryOperation["mode"];
  now: Date;
  commitSha: string;
  reportLocation: string;
}): ProductRecoveryOperation {
  return {
    schema_version: PRODUCT_RECOVERY_OPERATION_SCHEMA_VERSION,
    operation_id: input.operationId,
    operation: input.operation,
    backup_id: input.backupId,
    mode: input.mode,
    started_at: input.now.toISOString(),
    finished_at: null,
    status: input.mode === "PREVIEW" ? "PREVIEW" : "RESTORE_READY",
    before: {},
    after: {},
    preflight_steps: [],
    store_validations: [],
    sqlite_integrity: {},
    pointer_validation: "FAIL",
    changed_store_count: 0,
    rollback: { attempted: false, status: "NOT_REQUIRED", code: null },
    error_codes: [],
    backup_location: null,
    report_location: input.reportLocation,
    commit_sha: input.commitSha,
    no_secrets: true,
    openai_calls: 0,
    live_provider_calls: 0,
    central_live_cycles: 0,
    task_scheduler_mutations: 0,
    publication_log: [],
    safety_backup_id: null,
  };
}

function parseManifest(value: unknown): ProductBackupManifest {
  if (!isRecord(value)) throw new ProductRecoveryError("BACKUP_MANIFEST_INVALID");
  const allowed = new Set([
    "schema_version", "generator_version", "backup_id", "created_at", "commit_sha", "runtime_mode",
    "state", "files", "logical_stores", "excluded_items", "secret_scan",
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key))) throw new ProductRecoveryError("BACKUP_MANIFEST_UNKNOWN_FIELD");
  if (value.schema_version !== PRODUCT_BACKUP_SCHEMA_VERSION) throw new ProductRecoveryError("BACKUP_SCHEMA_UNSUPPORTED");
  if (
    value.generator_version !== PRODUCT_RECOVERY_GENERATOR_VERSION
    || typeof value.backup_id !== "string"
    || !BACKUP_ID_PATTERN.test(value.backup_id)
    || typeof value.created_at !== "string"
    || new Date(value.created_at).toISOString() !== value.created_at
    || typeof value.commit_sha !== "string"
    || !/^(?:[0-9a-f]{40}|unknown)$/.test(value.commit_sha)
    || typeof value.runtime_mode !== "string"
    || value.state !== "BACKUP_READY"
    || value.secret_scan !== "PASS"
    || !Array.isArray(value.files)
    || !Array.isArray(value.logical_stores)
    || !Array.isArray(value.excluded_items)
  ) throw new ProductRecoveryError("BACKUP_MANIFEST_INVALID");
  const logicalStoreIds = new Set<string>();
  for (const store of value.logical_stores) {
    if (!isRecord(store)) throw new ProductRecoveryError("BACKUP_LOGICAL_STORE_INVALID");
    const fields = new Set(["logical_store_id", "store_type", "required", "file_count", "validation"]);
    if (
      Object.keys(store).some((key) => !fields.has(key))
      || typeof store.logical_store_id !== "string"
      || !/^[a-z0-9_]{1,64}$/.test(store.logical_store_id)
      || !["json", "sqlite", "report", "config"].includes(String(store.store_type))
      || typeof store.required !== "boolean"
      || !Number.isSafeInteger(store.file_count)
      || Number(store.file_count) < 0
      || store.validation !== "VALID"
    ) throw new ProductRecoveryError("BACKUP_LOGICAL_STORE_INVALID");
    if (logicalStoreIds.has(store.logical_store_id)) throw new ProductRecoveryError("BACKUP_LOGICAL_STORE_DUPLICATE");
    logicalStoreIds.add(store.logical_store_id);
  }
  return value as ProductBackupManifest;
}

function parseOperation(value: unknown): ProductRecoveryOperation {
  if (!isRecord(value) || value.schema_version !== PRODUCT_RECOVERY_OPERATION_SCHEMA_VERSION) {
    throw new ProductRecoveryError("RESTORE_JOURNAL_INVALID");
  }
  if (
    typeof value.operation_id !== "string"
    || !OPERATION_ID_PATTERN.test(value.operation_id)
    || !Array.isArray(value.publication_log)
  ) throw new ProductRecoveryError("RESTORE_JOURNAL_INVALID");
  return value as ProductRecoveryOperation;
}

function validateManifestEntry(entry: ProductBackupFile, logicalIds: Set<string>): void {
  if (
    !isRecord(entry)
    || Object.keys(entry).some((key) => !new Set([
      "logical_store_id", "relative_path", "size", "sha256", "store_type", "dependencies", "source_validation",
    ]).has(key))
    || typeof entry.logical_store_id !== "string"
    || !logicalIds.has(entry.logical_store_id)
    || typeof entry.relative_path !== "string"
    || !SAFE_RELATIVE_PATH.test(entry.relative_path)
    || entry.relative_path.includes("\\")
    || isAbsolute(entry.relative_path)
    || entry.relative_path.startsWith("/")
    || !Number.isSafeInteger(entry.size)
    || entry.size < 0
    || typeof entry.sha256 !== "string"
    || !/^sha256:[0-9a-f]{64}$/.test(entry.sha256)
    || !["json", "sqlite", "report", "config"].includes(entry.store_type)
    || entry.source_validation !== "VALID"
    || !Array.isArray(entry.dependencies)
    || entry.dependencies.some((dependency) => typeof dependency !== "string" || !logicalIds.has(dependency))
  ) throw new ProductRecoveryError("BACKUP_MANIFEST_ENTRY_INVALID");
}

function summarizeLogicalStores(
  descriptors: StoreDescriptor[],
  files: ProductBackupFile[],
  includeEmptyReports: boolean,
): ProductBackupManifest["logical_stores"] {
  const ids = new Set(descriptors.map((item) => item.logicalStoreId));
  if (includeEmptyReports) ids.add("reports_library");
  return [...ids].sort().map((id) => {
    const descriptorValue = descriptors.find((item) => item.logicalStoreId === id);
    const entries = files.filter((entry) => entry.logical_store_id === id);
    return {
      logical_store_id: id,
      store_type: descriptorValue?.storeType ?? "report",
      required: descriptorValue?.required ?? false,
      file_count: entries.length,
      validation: "VALID",
    };
  });
}

function descriptor(
  logicalStoreId: string,
  sourcePath: string,
  payloadPath: string,
  storeType: ProductBackupFile["store_type"],
  required: boolean,
  dependencies: string[] = [],
): StoreDescriptor {
  return { logicalStoreId, sourcePath: resolve(sourcePath), payloadPath: normalizePayloadRelative(payloadPath), storeType, required, dependencies };
}

function safePayloadPath(bundleDirectory: string, relativePath: string): string {
  const normalized = normalizePayloadRelative(relativePath);
  const payloadRoot = resolve(bundleDirectory, "payload");
  const selected = resolve(payloadRoot, ...normalized.split("/"));
  assertContained(payloadRoot, selected);
  return selected;
}

function normalizePayloadRelative(value: string): string {
  const normalized = value.replaceAll("\\", "/");
  if (!SAFE_RELATIVE_PATH.test(normalized) || isAbsolute(normalized) || normalized.startsWith("/")) {
    throw new ProductRecoveryError("BACKUP_PATH_INVALID");
  }
  return normalized;
}

async function listRelativeFiles(root: string): Promise<string[]> {
  const rootInfo = await lstat(root).catch(() => null);
  if (!rootInfo?.isDirectory() || rootInfo.isSymbolicLink()) throw new ProductRecoveryError("BACKUP_PAYLOAD_MISSING");
  const output: string[] = [];
  async function walk(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const selected = resolve(directory, entry.name);
      const info = await lstat(selected);
      if (info.isSymbolicLink()) throw new ProductRecoveryError("BACKUP_REPARSE_POINT_FORBIDDEN");
      if (info.isDirectory()) await walk(selected);
      else if (info.isFile()) output.push(relative(root, selected).replaceAll("\\", "/"));
      else throw new ProductRecoveryError("BACKUP_PAYLOAD_UNSAFE_TYPE");
    }
  }
  await walk(root);
  return output.sort();
}

async function assertRegularSource(path: string, logicalStoreId: string): Promise<void> {
  const info = await lstat(path).catch(() => null);
  if (!info) throw new ProductRecoveryError(`REQUIRED_STORE_MISSING_${safeErrorCode(logicalStoreId)}`);
  if (!info.isFile() || info.isSymbolicLink()) throw new ProductRecoveryError("SOURCE_REPARSE_POINT_FORBIDDEN");
}

async function copyRegularFile(source: string, destination: string): Promise<void> {
  const info = await lstat(source);
  if (!info.isFile() || info.isSymbolicLink()) throw new ProductRecoveryError("SOURCE_REPARSE_POINT_FORBIDDEN");
  await copyFile(source, destination);
  const handle = await open(destination, "r+");
  try { await handle.sync(); } finally { await handle.close(); }
}

async function hashLogicalState(descriptors: StoreDescriptor[], allowMissing = false): Promise<Record<string, string>> {
  const grouped = new Map<string, string[]>();
  for (const item of descriptors) {
    if (item.generatedContent === undefined && !await exists(item.sourcePath)) {
      if (allowMissing) continue;
      throw new ProductRecoveryError("REQUIRED_STORE_MISSING");
    }
    const hash = item.generatedContent === undefined ? await sha256File(item.sourcePath) : sha256Text(item.generatedContent);
    grouped.set(item.logicalStoreId, [...(grouped.get(item.logicalStoreId) ?? []), `${item.payloadPath}:${hash}`]);
  }
  const result: Record<string, string> = {};
  for (const [id, hashes] of grouped) result[id] = sha256Text(hashes.sort().join("\n"));
  if (!grouped.has("reports_library")) result.reports_library = sha256Text("");
  return result;
}

async function sha256File(path: string): Promise<string> {
  return sha256Buffer(await readFile(path));
}

function sha256Buffer(value: Uint8Array): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function sha256Text(value: string): string {
  return sha256Buffer(Buffer.from(value, "utf8"));
}

async function resolveCommitSha(repoRoot: string): Promise<string> {
  const configured = process.env.CRYPTO_EDGE_BUILD_SHA?.trim();
  if (configured && /^[0-9a-f]{40}$/.test(configured)) return configured;
  try {
    const result = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, windowsHide: true });
    const sha = result.stdout.trim();
    return /^[0-9a-f]{40}$/.test(sha) ? sha : "unknown";
  } catch {
    return "unknown";
  }
}

async function assertFreeSpace(path: string, requiredBytes: number, injected?: number): Promise<void> {
  await mkdir(path, { recursive: true });
  const fileSystem = injected === undefined ? await statfs(path) : null;
  const available = injected ?? Number(fileSystem?.bavail) * Number(fileSystem?.bsize);
  if (!Number.isFinite(available) || available < requiredBytes) throw new ProductRecoveryError("INSUFFICIENT_FREE_SPACE");
}

async function writeJsonDurable(path: string, value: unknown): Promise<void> {
  await writeTextDurable(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeTextDurable(path: string, value: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const handle = await open(path, "wx");
  try {
    await handle.writeFile(value, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  return writeTextAtomic(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeTextAtomic(path: string, value: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  const handle = await open(temporary, "wx");
  try {
    await handle.writeFile(value, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporary, path);
}

async function readRequiredJson(path: string, code: string, allowMissing?: boolean): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch (error) {
    if (allowMissing && isErrorCode(error, "ENOENT")) return null;
    throw new ProductRecoveryError(code, error);
  }
}

function pass(step: string, code: string): ProductRecoveryOperation["preflight_steps"][number] {
  return { step, status: "PASS", code };
}

function uniqueValidations(values: RecoveryValidation[]): RecoveryValidation[] {
  const result = new Map<string, RecoveryValidation>();
  for (const value of values) result.set(value.logical_store_id, value);
  return [...result.values()].sort((left, right) => left.logical_store_id.localeCompare(right.logical_store_id));
}

function countChanged(before: Record<string, string>, after: Record<string, string>): number {
  return new Set([...Object.keys(before), ...Object.keys(after)]).size
    - [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((key) => before[key] === after[key]).length;
}

function sameHashes(left: Record<string, string>, right: Record<string, string>): boolean {
  return JSON.stringify(Object.entries(left).sort()) === JSON.stringify(Object.entries(right).sort());
}

function assertBackupId(value: string): void {
  if (!BACKUP_ID_PATTERN.test(value)) throw new ProductRecoveryError("BACKUP_ID_INVALID");
}

function makeId(prefix: "backup" | "safety" | "restore" | "rollback" | "recovery", now: Date): string {
  const timestamp = validDate(now).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return `${prefix}_${timestamp}_${randomUUID().replaceAll("-", "").slice(0, 8)}`;
}

function validDate(value: Date): Date {
  if (!Number.isFinite(value.getTime())) throw new ProductRecoveryError("TIMESTAMP_INVALID");
  return value;
}

function safeRuntimeMode(value: string): string {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(normalized)) throw new ProductRecoveryError("RUNTIME_MODE_INVALID");
  return normalized;
}

function safeErrorCode(value: string): string {
  const normalized = value.toUpperCase().replace(/[^A-Z0-9_]/g, "_").slice(0, 120);
  return normalized || "RECOVERY_ERROR";
}

function errorCode(error: unknown): string {
  if (error instanceof ProductRecoveryError) return safeErrorCode(error.code);
  if (error instanceof Error) return safeErrorCode(error.message);
  return "RECOVERY_ERROR";
}

function normalizeRecoveryError(error: unknown): ProductRecoveryError {
  return error instanceof ProductRecoveryError ? error : new ProductRecoveryError(errorCode(error), error);
}

function assertContained(root: string, path: string): void {
  const normalizedRoot = resolve(root);
  const normalizedPath = resolve(path);
  const rootCompared = process.platform === "win32" ? normalizedRoot.toLowerCase() : normalizedRoot;
  const pathCompared = process.platform === "win32" ? normalizedPath.toLowerCase() : normalizedPath;
  if (pathCompared !== rootCompared && !pathCompared.startsWith(`${rootCompared}${sep}`)) {
    throw new ProductRecoveryError("PATH_OUTSIDE_ALLOWED_ROOT");
  }
}

async function ensureAbsent(path: string, code: string): Promise<void> {
  if (await exists(path)) throw new ProductRecoveryError(code);
}

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

function normalizePath(value: string): string {
  return resolve(value).replaceAll("\\", "/");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isErrorCode(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === code);
}
