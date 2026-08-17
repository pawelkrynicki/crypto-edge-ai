import { execFileSync } from "node:child_process";
import { createDisc2bRemediationBackup } from "../server/disc2bRemediationBackup.js";

const args = process.argv.slice(2);
const index = args.indexOf("--remediation-id");
const remediationId = index >= 0 ? args[index + 1] : undefined;
if (!remediationId || args.length !== 2 || index !== 0) {
  throw new Error("Usage: disc2bPreMigrationBackup.ts --remediation-id <legacy_followup_remediation_timestamp_id>");
}

const commitSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: process.cwd(), encoding: "utf8", windowsHide: true }).trim();
const result = await createDisc2bRemediationBackup({ remediationId, commitSha });
console.log(JSON.stringify({
  status: "BACKUP_READY",
  backup_id: result.backup_id,
  backup_path: result.backup_path,
  manifest_path: result.manifest_path,
  remediation_id: result.manifest.remediation_id,
  restore_verification: result.manifest.restore_verification.status,
}, null, 2));
