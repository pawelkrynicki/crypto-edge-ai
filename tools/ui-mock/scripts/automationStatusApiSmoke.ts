import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { createProductVpsServer } from "../server/productVpsServer.js";

const tempRoot = await mkdtemp(resolve(tmpdir(), "crypto-edge-status-smoke-"));
const distPath = resolve(tempRoot, "dist");
await mkdir(distPath, { recursive: true });
await writeFile(resolve(distPath, "index.html"), "<!doctype html><title>offline smoke</title>", "utf8");
let stateReads = 0;
let runnerCalls = 0;
const state = {
  schema_version: "central_automation_state_v1",
  active_run_id: null,
  last_result: "SUCCESS",
  last_error_code: null,
  last_attempt_at: "2026-07-21T14:08:00.000Z",
  last_success_at: "2026-07-21T14:08:00.000Z",
  last_failure_at: null,
  next_scanner_run_at: "2026-07-21T14:23:00.000Z",
  next_alternative_me_run_at: "2026-07-21T20:08:00.000Z",
  next_defillama_run_at: "2026-07-21T16:08:00.000Z",
  last_published_scanner_run_id: "scan_manual_success",
  last_published_context_run_id: "context_manual_success",
  request_counts: { dexscreener: 4, goplus_security: 1, alternative_me_fng: 1, defillama_api: 2 },
  last_decision: "NOTHING_DUE",
};
const before = JSON.stringify(state);
const server = createProductVpsServer({
  runtimeMode: "INTERNAL_BETA",
  distPath,
  automation: {
    enabled: false,
    readState: async () => {
      stateReads += 1;
      return state;
    },
  },
});

try {
  await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const port = (server.address() as AddressInfo).port;
  const responses = await Promise.all(Array.from({ length: 100 }, () => fetch(`http://127.0.0.1:${port}/api/automation/status`)));
  assert.equal(responses.every((response) => response.status === 200), true);
  const bodies = await Promise.all(responses.map((response) => response.json() as Promise<Record<string, unknown>>));
  assert.equal(bodies.every((body) => (
    body.enabled === false
    && body.last_result === "SUCCESS"
    && body.next_run_at === null
    && body.next_due_at === "2026-07-21T14:23:00.000Z"
    && body.scheduler_status === "NOTHING_DUE"
  )), true);
  assert.equal(stateReads, 100);
  assert.equal(runnerCalls, 0);
  assert.equal(JSON.stringify(state), before);
  console.log("AUTOMATION STATUS API CHECK OK: random same-origin port, 100 read-only requests, 0 runner/provider calls.");
} finally {
  await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
  await rm(tempRoot, { recursive: true, force: true });
}
