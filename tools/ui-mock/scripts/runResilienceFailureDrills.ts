import { fileURLToPath, pathToFileURL } from "node:url";
import {
  previewProductFailureDrills,
  runProductFailureDrills,
} from "../server/resilienceFailureDrills.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const schedulerHostStatus = process.env.CRYPTO_EDGE_FAILURE_DRILL_SCHEDULER_HOST_STATUS;
  if (args.length === 0 || (args.length === 1 && args[0] === "--preview")) {
    const preview = previewProductFailureDrills({ schedulerHostStatus });
    console.log("");
    console.log("=== Crypto Edge AI: STAB.1 resilience failure drills preview ===");
    console.log(`Run ID: ${preview.run_id}`);
    console.log("Scenarios:");
    preview.scenarios.forEach((scenario, index) => console.log(`  ${index + 1}. ${scenario}`));
    console.log("Isolated locations (not created in preview):");
    console.log(`  Root: ${preview.isolated_locations.root}`);
    console.log(`  Snapshots: ${preview.isolated_locations.snapshots}`);
    console.log(`  Automation: ${preview.isolated_locations.automation}`);
    console.log(`  Follow-up: ${preview.isolated_locations.follow_up}`);
    console.log(`  Established: ${preview.isolated_locations.established}`);
    console.log(`  AI: ${preview.isolated_locations.ai}`);
    console.log(`  Feedback: ${preview.isolated_locations.feedback}`);
    console.log(`  Reports: ${preview.isolated_locations.reports}`);
    console.log("Stores created: no");
    console.log("Failures executed: no");
    console.log("Worker started: no");
    console.log(`Task Scheduler mutations: ${preview.scheduler_mutations}`);
    console.log(`Task Scheduler host status: ${preview.scheduler_host_status}`);
    console.log(`OpenAI calls: ${preview.openai_calls}`);
    console.log(`Live data-provider calls: ${preview.live_provider_calls}`);
    console.log(`REVIEW_URL=${pathToFileURL(fileURLToPath(new URL("../../../docs/resilience_failure_drills.md", import.meta.url))).href}`);
    return;
  }

  if (args.length === 1 && args[0] === "--run-isolated") {
    const result = await runProductFailureDrills({ schedulerHostStatus });
    console.log("");
    console.log(`STAB.1 result: ${result.manifest.status}`);
    console.log(`Run ID: ${result.manifest.run_id}`);
    console.log(`Scenarios: ${result.manifest.scenarios.length}`);
    console.log(`Manifest: ${result.manifestPath}`);
    console.log(`Report: ${result.reportPath}`);
    console.log(`Canonical mutations: ${result.manifest.canonical_mutations}`);
    console.log(`Task Scheduler mutations: ${result.manifest.scheduler_mutations}`);
    console.log(`Task Scheduler host status: ${result.manifest.scheduler_host_status}`);
    console.log(`OpenAI calls: ${result.manifest.openai_calls}`);
    console.log(`Live data-provider calls: ${result.manifest.live_provider_calls}`);
    console.log(`REVIEW_URL=${pathToFileURL(result.reportPath).href}`);
    process.exitCode = result.manifest.status === "PASS" ? 0 : 1;
    return;
  }

  throw new Error("Usage: runResilienceFailureDrills.ts [--preview|--run-isolated]");
}

await main();
