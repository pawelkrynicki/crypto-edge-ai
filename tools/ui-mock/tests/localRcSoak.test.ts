import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import {
  LOCAL_RC_SOAK_SCHEMA_VERSION,
  LOCAL_RC_TASK_NAME,
  MINIMUM_SOAK_MS,
  MINIMUM_WAKEUPS,
  mergeCentralCycles,
  previewLocalRcSoak,
  validateCadence,
  validateProviderBudgets,
} from "../server/localRcSoak.js";
import type { LocalRcSoakWakeupEvent } from "../../data-poc/src/automation/runLocalRcSoakWakeup.js";

const repoRoot = resolve(import.meta.dirname, "..", "..", "..");

describe("RC.1 local release candidate soak", () => {
  it("is preview-only by default with no calls or mutations", async () => {
    const preview = previewLocalRcSoak();
    assert.equal(preview.schema_version, LOCAL_RC_SOAK_SCHEMA_VERSION);
    assert.equal(preview.mode, "PREVIEW");
    assert.equal(preview.minimum_real_minutes, 60);
    assert.equal(preview.minimum_wakeups, 12);
    assert.equal(preview.task_name, LOCAL_RC_TASK_NAME);
    assert.equal(preview.provider_calls, 0);
    assert.equal(preview.openai_calls, 0);
    assert.equal(preview.canonical_mutations, 0);
    assert.equal(preview.task_scheduler_mutations, 0);
    assert.equal(MINIMUM_SOAK_MS, 3_600_000);
    assert.equal(MINIMUM_WAKEUPS, 12);

    const launcher = await readFile(resolve(repoRoot, "scripts", "win", "start-local-rc-soak-review.cmd"), "utf8");
    assert.match(launcher, /set "MODE=PREVIEW"/);
    assert.match(launcher, /--run-live-local/);
    assert.match(launcher, /set "OPENAI_API_KEY="/);
    assert.match(launcher, /set "ALLOW_LIVE_PROVIDER_CALLS=0"/);
    assert.match(launcher, /set "RUN_EXIT=1"/);
    assert.match(launcher, /if "%%A"=="RC1_EXIT_CODE" set "RUN_EXIT=%%B"/);
    assert.equal((launcher.match(/start "" "!REVIEW_URL!"/g) ?? []).length, 1);
  });

  it("creates only the named five-minute temporary task without overwrite", async () => {
    const register = await readFile(resolve(repoRoot, "scripts", "win", "register-local-rc-soak-task.ps1"), "utf8");
    assert.match(register, /Get-ScheduledTask -TaskName \$TaskName/);
    assert.match(register, /RC1_TEMPORARY_TASK_ALREADY_EXISTS/);
    assert.match(register, /AddMinutes\(5\)/);
    assert.match(register, /New-TimeSpan -Minutes 5/);
    assert.match(register, /MultipleInstances IgnoreNew/);
    assert.match(register, /LogonType Interactive/);
    assert.doesNotMatch(register, /Crypto Edge AI Central Automation/);
    assert.doesNotMatch(register, /Register-ScheduledTask[^\n]*-Force/);
  });

  it("uses one forced full cycle and then the canonical scheduler", async () => {
    const wakeup = await readFile(resolve(repoRoot, "tools", "data-poc", "src", "automation", "runLocalRcSoakWakeup.ts"), "utf8");
    assert.match(wakeup, /runCentralLiveCycleOnce/);
    assert.match(wakeup, /runCentralSchedulerOnce\(\{ enabled: true, stateStore \}\)/);
    assert.match(wakeup, /claimInitialFullCycle/);
    assert.match(wakeup, /RC1_OPENAI_NOT_DISABLED/);
    assert.match(wakeup, /resolveDataPocRoot/);
    assert.match(wakeup, /validateDisplayEligibleScannerSnapshot/);
    assert.match(wakeup, /while \(args\[0\] === "--"\) args\.shift\(\)/);
    assert.doesNotMatch(wakeup, /honeypot/i);

    const runner = await readFile(resolve(repoRoot, "tools", "ui-mock", "scripts", "runLocalRcSoak.ts"), "utf8");
    assert.match(runner, /stripArgumentSeparators/);

    const initial = event({
      initial_full_cycle: true,
      decision: "RUN_SCANNER_AND_CONTEXT",
      run_mode: "scanner_and_context",
    });
    const notDue = event({
      event_id: "wake_20260801T100500Z_aaaaaaaa",
      started_at: "2026-08-01T10:05:00.000Z",
      finished_at: "2026-08-01T10:05:01.000Z",
      initial_full_cycle: false,
      decision: "NOTHING_DUE",
      run_mode: null,
      run_status: null,
      central_run_id: null,
    });
    const due = event({
      event_id: "wake_20260801T101500Z_bbbbbbbb",
      started_at: "2026-08-01T10:15:00.000Z",
      finished_at: "2026-08-01T10:15:01.000Z",
      initial_full_cycle: false,
      decision: "RUN_SCANNER_AND_CONTEXT",
      run_mode: "scanner_and_context",
      before: {
        ...initial.before,
        next_scanner_run_at: "2026-08-01T10:15:00.000Z",
      },
    });
    assert.equal(validateCadence([initial, notDue, due]), true);
    assert.equal(validateCadence([initial, { ...due, started_at: "2026-08-01T10:14:59.999Z" }]), false);
  });

  it("rejects non-allowlisted providers and per-cycle budget overruns", () => {
    const limits = {
      dexscreener: 33,
      goplus_security: 13,
      alternative_me_fng: 2,
      defillama_api: 2,
      honeypot_is: 0,
    };
    assert.equal(validateProviderBudgets([event({ request_counts: { dexscreener: 20, goplus_security: 3 } })], limits), true);
    assert.equal(validateProviderBudgets([event({ request_counts: { dexscreener: 34 } })], limits), false);
    assert.equal(validateProviderBudgets([event({ request_counts: { honeypot_is: 1 } })], limits), false);
    assert.equal(validateProviderBudgets([event({ request_counts: { unknown_provider: 1 } })], limits), false);
  });

  it("merges production and temporary central cycles without double-counting", () => {
    const sharedRunId = "automation_20260801100000_12345678";
    const productionOnlyRunId = "automation_20260801101500_87654321";
    const observed = new Map([
      [sharedRunId, observedCycle(sharedRunId)],
      [productionOnlyRunId, observedCycle(productionOnlyRunId, "2026-08-01T10:15:00.000Z")],
    ]);
    const temporary = event({
      central_run_id: sharedRunId,
      run_status: "SUCCESS",
      decision: "RUN_SCANNER_AND_CONTEXT",
      run_mode: "scanner_and_context",
    });

    const merged = mergeCentralCycles([temporary], observed);

    assert.equal(merged.length, 2);
    assert.equal(merged[0]?.central_run_id, sharedRunId);
    assert.equal(merged[0]?.trigger, "TEMPORARY_TASK");
    assert.equal(merged[0]?.wake_event_id, temporary.event_id);
    assert.equal(merged[1]?.central_run_id, productionOnlyRunId);
    assert.equal(merged[1]?.trigger, "PRODUCTION_TASK");
  });

  it("publishes report before the final manifest and reuses STAB.2 backup", async () => {
    const source = await readFile(resolve(repoRoot, "tools", "ui-mock", "server", "localRcSoak.ts"), "utf8");
    assert.ok((source.match(/createProductBackup/g) ?? []).length >= 3);
    assert.ok((source.match(/validateBackupBundle/g) ?? []).length >= 3);
    const reportWrite = source.lastIndexOf("await writeTextAtomic(reportPath");
    const manifestWrite = source.lastIndexOf("await writeJsonAtomic(manifestPath");
    assert.ok(reportWrite > 0);
    assert.ok(manifestWrite > reportWrite);
    assert.match(source, /schema_version: LOCAL_RC_SOAK_SCHEMA_VERSION/);
    assert.match(source, /unexpected_mutations/);
    assert.match(source, /final_temporary_task_absent/);
    assert.match(source, /resumeAutomationState\(\{ ownerConfirmed: true/);
    assert.match(source, /events\.length > 0 && now - lastApiProbeAt/);
    assert.match(source, /withCollectorQuiescence\("prebackup"/);
    assert.match(source, /withCollectorQuiescence\("postbackup"/);
    assert.match(source, /captureObservedCycle/);
  });
});

function observedCycle(centralRunId: string, startedAt = "2026-08-01T10:00:00.000Z") {
  return {
    trigger: "PRODUCTION_TASK" as const,
    wake_event_id: null,
    central_run_id: centralRunId,
    started_at: startedAt,
    finished_at: new Date(Date.parse(startedAt) + 1_000).toISOString(),
    mode: "scanner_and_context",
    status: "SUCCESS" as const,
    source_statuses: { dexscreener: "READY" },
    request_counts: { dexscreener: 1 },
    error_code: null,
    scanner_run_id: `scanner_${centralRunId}`,
    context_run_id: `context_${centralRunId}`,
    scanner_valid: true,
    context_valid: true,
    follow_up_ingested: 0,
  };
}

function event(overrides: Partial<LocalRcSoakWakeupEvent> = {}): LocalRcSoakWakeupEvent {
  return {
    schema_version: "local_rc_soak_wakeup_v1",
    event_id: "wake_20260801T100000Z_12345678",
    run_id: "rc1_20260801T100000Z_12345678",
    started_at: "2026-08-01T10:00:00.000Z",
    finished_at: "2026-08-01T10:00:01.000Z",
    duration_ms: 1_000,
    initial_full_cycle: false,
    decision: "NOTHING_DUE",
    run_mode: null,
    run_status: "SUCCESS",
    central_run_id: "automation_20260801100000_12345678",
    active_run_id: null,
    error_code: null,
    request_counts: {},
    source_statuses: {},
    before: {
      scanner_run_id: "scan_before",
      context_run_id: "context_before",
      cycle_status: "SUCCESS",
      last_result: "SUCCESS",
      last_scanner_success_at: "2026-08-01T10:00:00.000Z",
      last_context_success_at: "2026-08-01T10:00:00.000Z",
      next_scanner_run_at: "2026-08-01T10:15:00.000Z",
      next_alternative_me_run_at: "2026-08-01T16:00:00.000Z",
      next_defillama_run_at: "2026-08-01T12:00:00.000Z",
    },
    after: {
      scanner_run_id: "scan_after",
      context_run_id: "context_after",
      cycle_status: "SUCCESS",
      last_result: "SUCCESS",
      last_scanner_success_at: "2026-08-01T10:00:01.000Z",
      last_context_success_at: "2026-08-01T10:00:01.000Z",
      next_scanner_run_at: "2026-08-01T10:15:01.000Z",
      next_alternative_me_run_at: "2026-08-01T16:00:01.000Z",
      next_defillama_run_at: "2026-08-01T12:00:01.000Z",
    },
    scanner_snapshot_valid: true,
    context_snapshot_valid: true,
    follow_up: {
      entries_before: 2,
      entries_after: 2,
      audit_before: 2,
      audit_after: 2,
      duplicate_identities: 0,
      ingested: 0,
    },
    lock: { active_before: null, active_after: null },
    ...overrides,
  };
}
