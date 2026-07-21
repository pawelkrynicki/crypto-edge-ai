import { open } from "node:fs/promises";
import { resolve } from "node:path";
import { acquireGlobalCollectorLock } from "../../src/automation/globalCollectorLock.js";

const [directoryPath, runId, startAtRaw] = process.argv.slice(2);
const startAt = Number(startAtRaw);

async function main(): Promise<void> {
  if (!directoryPath || !runId || !Number.isFinite(startAt)) throw new Error("WORKER_ARGUMENTS_INVALID");
  const waitMs = Math.max(0, startAt - Date.now());
  await new Promise<void>((resolveWait) => setTimeout(resolveWait, waitMs));
  const lock = await acquireGlobalCollectorLock(runId, { directoryPath, ttlMs: 5_000 });
  if (lock.status === "RUN_ALREADY_IN_PROGRESS") {
    console.log(JSON.stringify({ status: lock.status, active_run_id: lock.active_run_id }));
    return;
  }

  const marker = await open(resolve(directoryPath, "interprocess-runner.marker"), "wx");
  await marker.writeFile(`${runId}\n`, "utf8");
  await marker.close();
  await new Promise<void>((resolveWait) => setTimeout(resolveWait, 1_000));
  await lock.release();
  console.log(JSON.stringify({ status: "SUCCESS", run_id: runId }));
}

main().catch((error: unknown) => {
  console.error(JSON.stringify({ error: error instanceof Error ? error.message : "WORKER_FAILED" }));
  process.exitCode = 1;
});
