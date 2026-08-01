import { fileURLToPath, pathToFileURL } from "node:url";
import { previewLocalRcSoak, reportUrl, runLocalRcSoak } from "../server/localRcSoak.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0 || (args.length === 1 && args[0] === "--preview")) {
    const preview = previewLocalRcSoak();
    console.log(JSON.stringify(preview, null, 2));
    console.log(`REVIEW_URL=${pathToFileURL(fileURLToPath(new URL("../../../docs/local_release_candidate_soak.md", import.meta.url))).href}`);
    return;
  }
  if (args.length === 1 && args[0] === "--run-live-local") {
    const result = await runLocalRcSoak();
    console.log(`RC.1 result: ${result.manifest.final_verdict}`);
    console.log(`Run ID: ${result.manifest.run_id}`);
    console.log(`Real elapsed minutes: ${result.manifest.real_elapsed_minutes}`);
    console.log(`Wake-ups: ${result.manifest.wake_up_count}`);
    console.log(`Cycles: ${result.manifest.cycle_count}`);
    console.log(`Manifest: ${result.manifestPath}`);
    console.log(`Report: ${result.reportPath}`);
    console.log(`REVIEW_URL=${reportUrl(result.reportPath)}`);
    process.exitCode = result.manifest.final_verdict === "PASS" ? 0 : 1;
    return;
  }
  throw new Error("Usage: runLocalRcSoak.ts [--preview|--run-live-local]");
}

await main();
