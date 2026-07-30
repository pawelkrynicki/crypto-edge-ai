import { fileURLToPath, pathToFileURL } from "node:url";
import {
  cleanupProductE2ERun,
  previewFullProductE2E,
  runFullProductE2E,
} from "../server/productE2E.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const schedulerHostStatus = process.env.CRYPTO_EDGE_PRODUCT_E2E_SCHEDULER_HOST_STATUS;
  if (args.length === 0 || (args.length === 1 && args[0] === "--preview")) {
    const preview = await previewFullProductE2E({ schedulerHostStatus });
    console.log("");
    console.log("=== Crypto Edge AI: E2E.1 preview ===");
    console.log(`Snapshot: ${preview.source_snapshot_id}`);
    console.log(`Identity: ${preview.chain}:${preview.contract_address} (${preview.symbol})`);
    console.log("Plan:");
    preview.plan.forEach((view, index) => console.log(`  ${index + 1}. ${view}`));
    console.log("Isolated stores (not created in preview):");
    console.log(`  Follow-up: ${preview.isolated_stores.follow_up}`);
    console.log(`  Established: ${preview.isolated_stores.established}`);
    console.log(`  AI queue: ${preview.isolated_stores.ai_queue}`);
    console.log(`  Feedback: ${preview.isolated_stores.feedback}`);
    console.log(`  Reports: ${preview.isolated_stores.reports}`);
    console.log("Mutations performed: 0");
    console.log("Mock worker started: no");
    console.log("OpenAI calls: 0");
    console.log("Live data-provider calls: 0");
    console.log(`Task Scheduler mutations: ${preview.scheduler_mutations}`);
    console.log(`Task Scheduler host status: ${preview.scheduler_host_status}`);
    console.log(`REVIEW_URL=${pathToFileURL(fileURLToPath(new URL("../../../docs/full_product_e2e.md", import.meta.url))).href}`);
    return;
  }

  if (args.length === 1 && args[0] === "--run-isolated") {
    const result = await runFullProductE2E({ schedulerHostStatus });
    console.log("");
    console.log(`E2E.1 result: ${result.manifest.status}`);
    console.log(`Run ID: ${result.manifest.run_id}`);
    console.log(`Identity: ${result.manifest.chain}:${result.manifest.contract_address}`);
    console.log(`Manifest: ${result.manifestPath}`);
    console.log(`Report: ${result.reportPath}`);
    console.log(`OpenAI calls: ${result.manifest.live_openai_calls}`);
    console.log(`Live data-provider calls: ${result.manifest.live_data_provider_calls}`);
    console.log(`Canonical mutations: ${result.manifest.canonical_store_mutations}`);
    console.log(`Task Scheduler mutations: ${result.manifest.scheduler_mutations}`);
    console.log(`Task Scheduler host status: ${result.manifest.scheduler_host_status}`);
    console.log(`REVIEW_URL=${pathToFileURL(result.reportPath).href}`);
    process.exitCode = result.manifest.status === "PASS" ? 0 : 1;
    return;
  }

  if (args.length === 2 && args[0] === "--cleanup") {
    await cleanupProductE2ERun(args[1]!);
    console.log(`Removed isolated E2E run: ${args[1]}`);
    return;
  }

  throw new Error("Usage: runFullProductE2E.ts [--preview|--run-isolated|--cleanup <run_id>]");
}

await main();
