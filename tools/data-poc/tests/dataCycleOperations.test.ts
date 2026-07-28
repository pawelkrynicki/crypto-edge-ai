import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, it } from "node:test";
import {
  createDataCycleBackup,
  rollbackDataCycleBackup,
  type DataCycleCanonicalPaths,
} from "../src/automation/dataCycleOperations.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("DATA.1 backup and rollback", () => {
  it("records size/hash/mtime, restores canonical state and preserves post-backup files", async () => {
    const paths = await fixturePaths();
    await write(paths.automation_state, "state-before\n");
    await write(paths.follow_up_store, "follow-up-before\n");
    await write(paths.follow_up_backup, "follow-up-backup-before\n");
    await write(paths.scanner_snapshot!, "scanner-before\n");
    await write(paths.context_snapshot!, "context-before\n");
    await write(paths.established_universe, "established-protected\n");

    const backup = await createDataCycleBackup(new Date("2026-07-28T10:00:00.000Z"), paths);
    assert.match(backup.manifest.backup_id, /^backup_20260728100000_[0-9a-f]{8}$/);
    assert.equal(backup.manifest.files.every((entry) => entry.existed ? Boolean(entry.sha256 && entry.size !== null && entry.mtime) : true), true);

    await write(paths.automation_state, "state-after\n");
    await write(paths.follow_up_store, "follow-up-after\n");
    await write(paths.scanner_snapshot!, "scanner-after\n");
    await write(paths.run_once_receipt, "receipt-after\n");
    const rolledBack = await rollbackDataCycleBackup(backup.manifest.backup_id, paths);

    assert.equal(await readFile(paths.automation_state, "utf8"), "state-before\n");
    assert.equal(await readFile(paths.follow_up_store, "utf8"), "follow-up-before\n");
    assert.equal(await readFile(paths.scanner_snapshot!, "utf8"), "scanner-before\n");
    assert.equal(await readFile(paths.established_universe, "utf8"), "established-protected\n");
    assert.ok(rolledBack.preserved_post_rollback_files.includes("tools/data-poc/.local/data-cycle/last-run-once.json"));
    assert.equal(
      await readFile(resolve(backup.backup_directory, "post-rollback", "tools", "data-poc", ".local", "data-cycle", "last-run-once.json"), "utf8"),
      "receipt-after\n",
    );
  });

  it("fails rollback if the protected Established Universe changed", async () => {
    const paths = await fixturePaths();
    await write(paths.automation_state, "state-before\n");
    await write(paths.established_universe, "established-before\n");
    const backup = await createDataCycleBackup(new Date("2026-07-28T10:00:00.000Z"), paths);
    await write(paths.established_universe, "established-after\n");
    await assert.rejects(
      rollbackDataCycleBackup(backup.manifest.backup_id, paths),
      /ESTABLISHED_UNIVERSE_CHANGED_ROLLBACK_ABORTED/,
    );
  });
});

async function fixturePaths(): Promise<DataCycleCanonicalPaths> {
  const repoRoot = await mkdtemp(resolve(tmpdir(), "crypto-edge-data-cycle-"));
  roots.push(repoRoot);
  return {
    repo_root: repoRoot,
    automation_state: resolve(repoRoot, "tools", "data-poc", ".local", "automation", "automation-state.json"),
    follow_up_store: resolve(repoRoot, "tools", "data-poc", ".local", "follow-up", "store.json"),
    follow_up_backup: resolve(repoRoot, "tools", "data-poc", ".local", "follow-up", "store.json.bak"),
    scanner_snapshot: resolve(repoRoot, "tools", "data-poc", "output", "scan_previous", "full_output.json"),
    context_snapshot: resolve(repoRoot, "tools", "data-poc", "output", "context_previous", "approved_sources_output.json"),
    established_universe: resolve(repoRoot, "config", "established_address_universe_v1.json"),
    run_once_receipt: resolve(repoRoot, "tools", "data-poc", ".local", "data-cycle", "last-run-once.json"),
    backups_directory: resolve(repoRoot, "tools", "data-poc", ".local", "data-cycle", "backups"),
  };
}

async function write(path: string, value: string): Promise<void> {
  await mkdir(resolve(path, ".."), { recursive: true });
  await writeFile(path, value, "utf8");
}
