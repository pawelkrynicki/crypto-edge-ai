import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import {
  PRODUCT_RECOVERY_DRILL_SCENARIOS,
  previewProductRecoveryDrills,
  runProductRecoveryDrills,
} from "../server/backupRestoreRollbackDrills.js";
import {
  PRODUCT_BACKUP_SCHEMA_VERSION,
  PRODUCT_RECOVERY_OPERATION_SCHEMA_VERSION,
  assertRecoveryTextSafe,
} from "../server/productRecovery.js";
import { createIsolatedRecoveryPaths, seedIsolatedProductState } from "./productRecoveryFixtures.js";

const execFileAsync = promisify(execFile);

test("STAB.2 preview is mutation-free and lists all required recovery scenarios", () => {
  const preview = previewProductRecoveryDrills();
  assert.equal(preview.scenarios.length, 25);
  assert.deepEqual(preview.scenarios, PRODUCT_RECOVERY_DRILL_SCENARIOS);
  assert.equal(preview.stores_created, false);
  assert.equal(preview.mutations, 0);
  assert.equal(preview.openai_calls, 0);
  assert.equal(preview.live_provider_calls, 0);
  assert.equal(preview.central_live_cycles, 0);
  assert.equal(preview.task_scheduler_mutations, 0);
});

test("STAB.2 Windows launcher is preview-first and returns exactly one review URL", async () => {
  const repositoryRoot = resolve(import.meta.dirname, "..", "..", "..");
  const result = await execFileAsync("cmd.exe", ["/d", "/c", "scripts\\win\\start-backup-restore-rollback-review.cmd"], {
    cwd: repositoryRoot,
    env: { ...process.env, CRYPTO_EDGE_RECOVERY_REVIEW_PLAN_ONLY: "1" },
    windowsHide: true,
  });
  assert.equal((result.stdout.match(/^OPEN_URL=/gm) ?? []).length, 1);
  assert.match(result.stdout, /Mode: --preview/);
  assert.match(result.stdout, /Workers started: 0/);
  assert.match(result.stdout, /Canonical mutations: 0/);
  assert.match(result.stdout, /Task Scheduler mutations: 0/);
  assert.match(result.stdout, /OpenAI calls: 0/);
  assert.match(result.stdout, /Live provider calls: 0/);
  assert.match(result.stdout, /Central live cycles: 0/);
});

test("STAB.2 permits public registry contacts without weakening the secret boundary", () => {
  assert.doesNotThrow(() => assertRecoveryTextSafe(
    "Contact the documented vendor at security@example.vendor",
    "data_source_registry",
  ));
  assert.throws(
    () => assertRecoveryTextSafe("User contact: person@example.test", "follow_up_store"),
    /PERSONAL_EMAIL_DETECTED/,
  );
  assert.throws(
    () => assertRecoveryTextSafe("OPENAI_API_KEY=sk-example0123456789", "data_source_registry"),
    /OPENAI_KEY_DETECTED/,
  );
});

test("STAB.2 isolated recovery drill", async (t) => {
  const sentinelRoot = await mkdtemp(resolve(tmpdir(), "crypto-edge-stab2-canonical-sentinel-"));
  t.after(async () => {
    await rm(sentinelRoot, { recursive: true, force: true });
  });
  const canonicalSentinel = createIsolatedRecoveryPaths(sentinelRoot);
  await seedIsolatedProductState(canonicalSentinel);
  const result = await runProductRecoveryDrills({
    schedulerHostStatus: "NOT_OBSERVED",
    canonicalPaths: canonicalSentinel,
  });
  assert.notEqual(result.manifest.isolated_root, sentinelRoot);

  for (const expected of PRODUCT_RECOVERY_DRILL_SCENARIOS) {
    await t.test(expected, () => {
      const scenario = result.manifest.scenarios.find((entry) => entry.name === expected);
      assert.ok(scenario);
      assert.equal(scenario.status, "PASS", scenario.code);
    });
  }

  await t.test("publishes versioned, secret-free audit artifacts", async () => {
    assert.equal(result.manifest.status, "PASS");
    assert.equal(result.manifest.schema_version, "product_recovery_drill_run_v1");
    assert.equal(result.manifest.scenarios.length, 25);
    assert.equal(result.manifest.canonical_mutations, 0);
    assert.equal(result.manifest.task_scheduler_mutations, 0);
    assert.equal(result.manifest.openai_calls, 0);
    assert.equal(result.manifest.live_provider_calls, 0);
    assert.equal(result.manifest.central_live_cycles, 0);
    const backup = JSON.parse(await readFile(result.manifest.final_backup_manifest, "utf8")) as Record<string, unknown>;
    assert.equal(backup.schema_version, PRODUCT_BACKUP_SCHEMA_VERSION);
    const operationPath = result.manifest.final_operation_report.replace(/operation\.md$/, "operation.json");
    const operation = JSON.parse(await readFile(operationPath, "utf8")) as Record<string, unknown>;
    assert.equal(operation.schema_version, PRODUCT_RECOVERY_OPERATION_SCHEMA_VERSION);
    assert.doesNotMatch(JSON.stringify({ backup, operation }), /sk-[A-Za-z0-9_-]{16,}|OPENAI_API_KEY\s*[:=]/i);
  });
});
