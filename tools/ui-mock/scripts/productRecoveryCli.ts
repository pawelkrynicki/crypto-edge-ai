import { resolve } from "node:path";
import {
  createProductBackup,
  restoreProductBackup,
  validateBackupBundle,
} from "../server/productRecovery.js";

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.command === "backup") {
    const result = await createProductBackup();
    console.log(JSON.stringify({
      status: result.operation.status,
      backup_id: result.manifest.backup_id,
      manifest_path: result.manifestPath,
      report_path: result.operation.report_location,
    }, null, 2));
    return;
  }
  if (args.command === "validate") {
    const bundle = required(args.values, "bundle");
    const manifest = await validateBackupBundle(resolve(bundle));
    console.log(JSON.stringify({ status: "BACKUP_READY", backup_id: manifest.backup_id }, null, 2));
    return;
  }
  if (args.command === "restore") {
    const bundle = required(args.values, "bundle");
    const backupId = required(args.values, "backup-id");
    const result = await restoreProductBackup({
      bundleDirectory: resolve(bundle),
      backupId,
      apply: args.flags.has("apply"),
    });
    console.log(JSON.stringify({
      status: result.operation.status,
      mode: result.operation.mode,
      backup_id: result.operation.backup_id,
      report_path: result.reportPath,
      rollback: result.operation.rollback,
    }, null, 2));
    process.exitCode = result.operation.status === "ROLLBACK_FAILED" ? 1 : 0;
    return;
  }
  throw new Error(
    "Usage: productRecoveryCli.ts backup | validate --bundle <path> | restore --bundle <path> --backup-id <id> [--apply]",
  );
}

function parseArgs(args: string[]): {
  command: string;
  values: Map<string, string>;
  flags: Set<string>;
} {
  const command = args[0] ?? "";
  const values = new Map<string, string>();
  const flags = new Set<string>();
  for (let index = 1; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument.startsWith("--")) throw new Error("RECOVERY_ARGUMENT_INVALID");
    const key = argument.slice(2);
    if (key === "apply") {
      flags.add(key);
      continue;
    }
    const value = args[++index];
    if (!value || value.startsWith("--")) throw new Error(`RECOVERY_ARGUMENT_VALUE_REQUIRED_${key}`);
    values.set(key, value);
  }
  return { command, values, flags };
}

function required(values: Map<string, string>, key: string): string {
  const value = values.get(key);
  if (!value) throw new Error(`RECOVERY_ARGUMENT_REQUIRED_${key}`);
  return value;
}

await main();
