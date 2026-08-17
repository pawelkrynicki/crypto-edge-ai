import { BoundedHttpClient } from "./boundedHttpClient.js";
import { configureCollectorNetwork } from "./collectorNetworkBootstrap.js";
import { assertInternalBetaCollectorEnvironment } from "./collectorEnvironment.js";
import { MAX_NEW_RECHECK_BATCHES_PER_CYCLE, runCentralNewRechecks } from "./newRecheckEngine.js";

async function main(): Promise<void> {
  if (!process.argv.includes("--live")) throw new Error("NEW_RECHECK_LIVE_OPT_IN_REQUIRED");
  assertInternalBetaCollectorEnvironment(process.env);
  configureCollectorNetwork();
  const client = new BoundedHttpClient({ sourceId: "dexscreener", maxRequests: MAX_NEW_RECHECK_BATCHES_PER_CYCLE });
  const result = await runCentralNewRechecks({ client, environment: "INTERNAL_BETA" });
  console.log(JSON.stringify(result, null, 2));
  if (result.status === "FAILED") process.exitCode = 2;
}

main().catch((error: unknown) => {
  const code = error instanceof Error ? error.message : "NEW_RECHECK_FAILED";
  console.error(JSON.stringify({ error: code }));
  process.exitCode = 1;
});
