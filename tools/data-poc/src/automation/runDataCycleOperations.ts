import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  createDataCycleBackup,
  resolveCanonicalDataPaths,
  rollbackDataCycleBackup,
  toRepoRelative,
  writeRunOnceReceipt,
} from "./dataCycleOperations.js";
import { acquireGlobalCollectorLock } from "./globalCollectorLock.js";
import {
  assertExplicitLiveAutomationOptIn,
  runCentralLiveCycleOnce,
} from "./runCentralAutomation.js";

async function main(): Promise<void> {
  const rawArgs = process.argv.slice(2);
  const args = rawArgs[0] === "--" ? rawArgs.slice(1) : rawArgs;
  if (args.length === 0) {
    console.log(JSON.stringify(await preview(), null, 2));
    return;
  }
  if (args.length === 1 && args[0] === "--run-once-live") {
    await runOnceLive();
    return;
  }
  if (args.length === 2 && args[0] === "--rollback") {
    await rollback(args[1]!);
    return;
  }
  throw new Error("DATA_CYCLE_ARGUMENTS_INVALID");
}

async function preview(): Promise<Record<string, unknown>> {
  const paths = await resolveCanonicalDataPaths();
  return {
    mode: "PREVIEW",
    mutation_requires: "--run-once-live",
    canonical_files_may_change: [
      toRepoRelative(paths, paths.automation_state),
      toRepoRelative(paths, paths.follow_up_store),
      toRepoRelative(paths, paths.follow_up_backup),
      "tools/data-poc/output/scan_<run-id>/full_output.json",
      "tools/data-poc/output/approved_sources_<run-id>/approved_sources_output.json",
      toRepoRelative(paths, paths.run_once_receipt),
    ],
    last_known_good: {
      scanner: toRepoRelative(paths, paths.scanner_snapshot),
      context: toRepoRelative(paths, paths.context_snapshot),
    },
    backup_directory: toRepoRelative(paths, paths.backups_directory),
    explicitly_not_modified: [
      toRepoRelative(paths, paths.established_universe),
      "tools/ui-mock/.local/tester-feedback.sqlite*",
      "VPS",
      "Cloudflare",
      "Task Scheduler",
    ],
    openai_calls_allowed: false,
    full_cycle_retries: 0,
  };
}

async function runOnceLive(): Promise<void> {
  assertExplicitLiveAutomationOptIn(process.env);
  if (process.env.CRYPTO_EDGE_AI_RESEARCH_PROVIDER !== "DISABLED") {
    throw new Error("OPENAI_PROVIDER_MUST_BE_DISABLED");
  }
  const before = await resolveCanonicalDataPaths();
  const establishedBefore = await sha256(before.established_universe);
  const backups: Array<Awaited<ReturnType<typeof createDataCycleBackup>>> = [];
  const result = await runCentralLiveCycleOnce({
    beforeRun: async () => {
      const backup = await createDataCycleBackup();
      backups.push(backup);
      console.log(JSON.stringify({
        event: "BACKUP_CREATED",
        backup_id: backup.manifest.backup_id,
        backup_directory: toRepoRelative(before, backup.backup_directory),
        files: backup.manifest.files,
      }, null, 2));
    },
  });
  const backup = backups[0];
  if (!backup) throw new Error("DATA_CYCLE_BACKUP_NOT_CREATED");
  const establishedAfter = await sha256(before.established_universe);
  if (establishedBefore !== establishedAfter) throw new Error("ESTABLISHED_UNIVERSE_CHANGED");
  const receiptPath = await writeRunOnceReceipt({
    created_at: new Date().toISOString(),
    backup_id: backup.manifest.backup_id,
    result,
    openai_calls: 0,
    established_universe_changed: false,
    scheduler_installed_by_launcher: false,
    rollback_command: `scripts\\win\\run-central-data-cycle.cmd --rollback ${backup.manifest.backup_id}`,
  });
  console.log(JSON.stringify({
    event: "DATA_CYCLE_FINISHED",
    ...result,
    backup_id: backup.manifest.backup_id,
    receipt: toRepoRelative(before, receiptPath),
    rollback_command: `scripts\\win\\run-central-data-cycle.cmd --rollback ${backup.manifest.backup_id}`,
    openai_calls: 0,
    established_universe_changed: false,
  }, null, 2));
  if (result.run_status === "FAILED") process.exitCode = 1;
  else if (result.run_status === "PARTIAL") process.exitCode = 2;
}

async function rollback(backupId: string): Promise<void> {
  const lock = await acquireGlobalCollectorLock(`rollback_${Date.now()}`);
  if (lock.status === "RUN_ALREADY_IN_PROGRESS") {
    throw Object.assign(new Error("RUN_ALREADY_IN_PROGRESS"), { code: "RUN_ALREADY_IN_PROGRESS" });
  }
  try {
    console.log(JSON.stringify(await rollbackDataCycleBackup(backupId), null, 2));
  } finally {
    await lock.release();
  }
}

async function sha256(path: string): Promise<string> {
  return `sha256:${createHash("sha256").update(await readFile(path)).digest("hex")}`;
}

function safeCode(error: unknown): string {
  const candidate = error && typeof error === "object" && "code" in error
    ? String(error.code)
    : error instanceof Error ? error.message : "DATA_CYCLE_OPERATION_FAILED";
  const normalized = candidate.toUpperCase().replace(/[^A-Z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 96);
  return normalized || "DATA_CYCLE_OPERATION_FAILED";
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(JSON.stringify({ error: safeCode(error) }));
    process.exitCode = 1;
  });
}
