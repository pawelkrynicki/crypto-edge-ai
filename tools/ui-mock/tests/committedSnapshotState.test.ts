import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { after, before, describe, it } from "node:test";
import { readCommittedSnapshotState } from "../server/committedSnapshotState.js";

let tempRoot = "";

before(async () => {
  tempRoot = await mkdtemp(resolve(tmpdir(), "crypto-edge-committed-state-"));
});

after(async () => {
  await rm(tempRoot, { recursive: true, force: true });
});

describe("committed snapshot state", () => {
  for (const schemaVersion of ["central_automation_state_v1", "central_automation_state_v2"]) {
    it(`reads scanner and context run IDs from ${schemaVersion}`, async () => {
      const statePath = await writeState({
        schema_version: schemaVersion,
        last_published_scanner_run_id: "scan_20260729120000",
        last_published_context_run_id: "approved_sources_20260729120000",
      });

      assert.deepEqual(await readCommittedSnapshotState(statePath), {
        scanner_run_id: "scan_20260729120000",
        context_run_id: "approved_sources_20260729120000",
      });
    });
  }

  it("rejects an unknown automation state schema version", async () => {
    const statePath = await writeState({
      schema_version: "central_automation_state_v3",
      last_published_scanner_run_id: "scan_20260729120000",
      last_published_context_run_id: "approved_sources_20260729120000",
    });

    await assert.rejects(() => readCommittedSnapshotState(statePath), /AUTOMATION_STATE_INVALID/);
  });

  it("rejects an invalid run ID without loosening validation", async () => {
    const statePath = await writeState({
      schema_version: "central_automation_state_v2",
      last_published_scanner_run_id: "scan id with spaces",
      last_published_context_run_id: "approved_sources_20260729120000",
    });

    await assert.rejects(() => readCommittedSnapshotState(statePath), /AUTOMATION_STATE_INVALID/);
  });
});

async function writeState(state: Record<string, unknown>): Promise<string> {
  const statePath = resolve(tempRoot, `automation-state-${crypto.randomUUID()}.json`);
  await writeFile(statePath, JSON.stringify(state), "utf8");
  return statePath;
}
