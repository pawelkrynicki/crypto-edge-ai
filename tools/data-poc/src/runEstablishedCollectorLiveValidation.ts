import { collectEstablishedAddressUniverse } from "./establishedAddressDiscovery.js";
import { loadEstablishedAddressUniverse } from "./establishedAddressUniverse.js";
import { acquireGlobalCollectorLock } from "./automation/globalCollectorLock.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args[0] === "--") args.shift();
  if (args.length !== 2 || args[0] !== "--limit" || !/^\d+$/.test(args[1])) {
    throw new Error("LIVE_VALIDATION_EXPLICIT_LIMIT_REQUIRED");
  }
  const limit = Number(args[1]);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error("ESTABLISHED_ENTRY_LIMIT_INVALID");
  if (process.env.ALLOW_LIVE_PROVIDER_CALLS !== "1") throw new Error("LIVE_PROVIDER_CALLS_NOT_ALLOWED");

  const universe = loadEstablishedAddressUniverse();
  const runId = `established_validation_${new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14)}`;
  const lock = await acquireGlobalCollectorLock(runId);
  if (lock.status !== "ACQUIRED") throw new Error(`RUN_ALREADY_IN_PROGRESS:${lock.active_run_id}`);
  try {
    const result = await collectEstablishedAddressUniverse({
      env: process.env,
      universe,
      entryLimit: limit,
    });
    console.log(JSON.stringify({
      mode: "controlled-live-validation",
      single_run: true,
      snapshot_published: false,
      universe_version: result.metadata.universe_version,
      entries_limit: limit,
      entries_used: result.metadata.entries_enabled,
      candidates_after_filters: result.metadata.candidates_after_filters,
    }, null, 2));
  } finally {
    await lock.release();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ error: error instanceof Error ? error.message : "ESTABLISHED_LIVE_VALIDATION_FAILED" }));
  process.exitCode = 1;
});
