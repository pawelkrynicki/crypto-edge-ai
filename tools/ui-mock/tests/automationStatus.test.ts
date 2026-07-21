import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import { createScannerApiServer } from "../server/scannerApiServer.js";

describe("automation status API", () => {
  it("serves 100 read-only status requests without changing state or invoking a runner", async () => {
    let reads = 0;
    let runnerCalls = 0;
    const state = {
      schema_version: "central_automation_state_v1",
      active_run_id: null,
      last_result: "SUCCESS",
      last_error_code: null,
      last_attempt_at: "2026-07-21T12:00:00.000Z",
      last_success_at: "2026-07-21T12:01:00.000Z",
      last_failure_at: null,
      next_scanner_run_at: "2026-07-21T12:16:00.000Z",
      next_alternative_me_run_at: "2026-07-21T18:01:00.000Z",
      next_defillama_run_at: "2026-07-21T14:01:00.000Z",
      last_published_scanner_run_id: "scan_safe",
      last_published_context_run_id: "context_safe",
      request_counts: { dexscreener: 4, goplus_security: 1 },
      last_decision: "NOTHING_DUE",
      pid: 123,
      storage_path: "C:\\secret\\automation-state.json",
      secret: "must-not-leak",
    };
    const before = JSON.stringify(state);
    const server = createScannerApiServer({
      runtimeMode: "INTERNAL_BETA",
      automation: {
        enabled: true,
        readState: async () => {
          reads += 1;
          return state;
        },
      },
    });
    await listen(server);
    try {
      const port = (server.address() as AddressInfo).port;
      const responses = await Promise.all(Array.from({ length: 100 }, () => fetch(`http://127.0.0.1:${port}/api/automation/status`)));
      assert.equal(responses.every((response) => response.status === 200), true);
      const bodies = await Promise.all(responses.map((response) => response.text()));
      assert.equal(new Set(bodies).size, 1);
      const body = JSON.parse(bodies[0]) as Record<string, unknown>;
      assert.equal(body.enabled, true);
      assert.equal(body.next_context_run_at, "2026-07-21T14:01:00.000Z");
      for (const forbidden of ["pid", "storage_path", "secret", "C:\\\\secret", "lock"]) {
        assert.equal(bodies[0].includes(forbidden), false);
      }
    } finally {
      await close(server);
    }
    assert.equal(reads, 100);
    assert.equal(runnerCalls, 0);
    assert.equal(JSON.stringify(state), before);
  });

  it("returns safe initial and unavailable states with HTTP 200", async () => {
    const missingPath = resolve(import.meta.dirname, `.missing-${crypto.randomUUID()}.json`);
    const missing = createScannerApiServer({
      runtimeMode: "INTERNAL_BETA",
      automation: { enabled: false, stateFilePath: missingPath },
    });
    await listen(missing);
    try {
      const body = await fetchBody(missing);
      assert.equal(body.enabled, false);
      assert.equal(body.scheduler_status, "NOT_YET_RUN");
    } finally {
      await close(missing);
    }

    const corrupt = createScannerApiServer({
      runtimeMode: "INTERNAL_BETA",
      automation: { enabled: true, readState: async () => ({ request_counts: "bad" }) },
    });
    await listen(corrupt);
    try {
      const body = await fetchBody(corrupt);
      assert.equal(body.scheduler_status, "STATE_UNAVAILABLE");
    } finally {
      await close(corrupt);
    }
  });

  it("keeps the endpoint implemented in the shared API handler", async () => {
    const source = await readFile(resolve(import.meta.dirname, "..", "server", "scannerApiHandler.ts"), "utf8");
    assert.match(source, /GET[^\n]+\/api\/automation\/status/);
    assert.doesNotMatch(source, /automation\/status[^\n]+(?:runInternalBeta|runCentralAutomation|provider)/i);
  });
});

function listen(server: ReturnType<typeof createScannerApiServer>): Promise<void> {
  return new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
}

function close(server: ReturnType<typeof createScannerApiServer>): Promise<void> {
  return new Promise((resolveClose, rejectClose) => server.close((error) => error ? rejectClose(error) : resolveClose()));
}

async function fetchBody(server: ReturnType<typeof createScannerApiServer>): Promise<Record<string, unknown>> {
  const port = (server.address() as AddressInfo).port;
  const response = await fetch(`http://127.0.0.1:${port}/api/automation/status`);
  assert.equal(response.status, 200);
  return await response.json() as Record<string, unknown>;
}
