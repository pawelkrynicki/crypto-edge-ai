import { fileURLToPath, pathToFileURL } from "node:url";
import {
  previewProductRecoveryDrills,
  runProductRecoveryDrills,
} from "../server/backupRestoreRollbackDrills.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0 || (args.length === 1 && args[0] === "--preview")) {
    const preview = previewProductRecoveryDrills();
    console.log("");
    console.log("=== Crypto Edge AI: STAB.2 backup, restore and rollback preview ===");
    console.log(`Run ID: ${preview.run_id}`);
    console.log("Scenarios:");
    preview.scenarios.forEach((scenario, index) => console.log(`  ${index + 1}. ${scenario}`));
    console.log(`Isolated root (not created): ${preview.isolated_root}`);
    console.log("Stores created: no");
    console.log("Workers started: 0");
    console.log(`Canonical mutations: ${preview.mutations}`);
    console.log(`Task Scheduler mutations: ${preview.task_scheduler_mutations}`);
    console.log(`OpenAI calls: ${preview.openai_calls}`);
    console.log(`Live provider calls: ${preview.live_provider_calls}`);
    console.log(`Central live cycles: ${preview.central_live_cycles}`);
    console.log(`REVIEW_URL=${pathToFileURL(fileURLToPath(new URL("../../../docs/backup_restore_rollback.md", import.meta.url))).href}`);
    return;
  }

  if (args.length === 1 && args[0] === "--run-isolated") {
    const result = await runProductRecoveryDrills({
      schedulerHostStatus: process.env.CRYPTO_EDGE_RECOVERY_SCHEDULER_HOST_STATUS,
    });
    console.log("");
    console.log(`STAB.2 result: ${result.manifest.status}`);
    console.log(`Run ID: ${result.manifest.run_id}`);
    console.log(`Scenarios: ${result.manifest.scenarios.length}`);
    console.log(`Manifest: ${result.manifestPath}`);
    console.log(`Report: ${result.reportPath}`);
    console.log(`Canonical mutations: ${result.manifest.canonical_mutations}`);
    console.log(`Task Scheduler mutations: ${result.manifest.task_scheduler_mutations}`);
    console.log(`OpenAI calls: ${result.manifest.openai_calls}`);
    console.log(`Live provider calls: ${result.manifest.live_provider_calls}`);
    console.log(`Central live cycles: ${result.manifest.central_live_cycles}`);
    console.log(`REVIEW_URL=${pathToFileURL(result.reportPath).href}`);
    process.exitCode = result.manifest.status === "PASS" ? 0 : 1;
    return;
  }

  throw new Error("Usage: runBackupRestoreRollback.ts [--preview|--run-isolated]");
}

await main();
