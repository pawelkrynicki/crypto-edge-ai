import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { after, before, describe, it } from "node:test";
import {
  PRODUCT_FAILURE_DRILL_SCHEMA_VERSION,
  PRODUCT_FAILURE_DRILL_SCENARIOS,
  captureProtectedProductState,
  previewProductFailureDrills,
  runProductFailureDrills,
  type ProductFailureDrillManifest,
  type ProductFailureDrillRunResult,
  type ProductFailureDrillScenarioId,
} from "../server/resilienceFailureDrills.js";

const execFileAsync = promisify(execFile);
const runId = "failure-drill-20260730T120000Z-deadbeef";
const testBase = resolve(tmpdir(), "crypto-edge-resilience-failure-drill-tests");
const isolatedRoot = resolve(testBase, runId);
const launcherPath = resolve(import.meta.dirname, "..", "..", "..", "scripts", "win", "start-resilience-failure-drills-review.cmd");

let result: ProductFailureDrillRunResult;
let manifest: ProductFailureDrillManifest;

before(async () => {
  await rm(testBase, { recursive: true, force: true });
  result = await runProductFailureDrills({
    runId,
    isolatedRoot,
    schedulerHostStatus: "READY",
    now: () => new Date("2026-07-30T12:00:00.000Z"),
  });
  manifest = result.manifest;
  assert.equal(manifest.status, "PASS", JSON.stringify(manifest.scenarios.filter((scenario) => scenario.status !== "PASS"), null, 2));
});

after(async () => {
  await rm(testBase, { recursive: true, force: true });
});

describe("STAB.1 resilience and controlled failure drills", () => {
  it("1. timeout refresh zachowuje listę", () => {
    const value = scenario("scanner-refresh-timeout");
    assert.equal(value.evidence.candidates_preserved, true);
    assert.equal(value.evidence.selected_token_preserved, true);
    assert.equal(value.evidence.route_identity_preserved, true);
    assert.equal(value.evidence.active_tab_preserved, true);
  });

  it("2. błędny schemat zachowuje last-known-good", () => {
    const value = scenario("scanner-invalid-schema");
    assert.equal(value.evidence.invalid_response_rejected, true);
    assert.equal(value.evidence.pointer_mutations, 0);
  });

  it("3. stale snapshot pozostaje widoczny i oznaczony", () => {
    const value = scenario("scanner-stale-snapshot");
    assert.ok(Number(value.evidence.visible_candidates) > 0);
    assert.equal(value.evidence.freshness_status, "STALE");
    assert.equal(value.evidence.generated_at_truthful, true);
  });

  it("4. pierwszy błąd pokazuje pusty stan", () => {
    assert.equal(scenario("scanner-first-load-failure").evidence.first_state_empty, true);
  });

  it("5. następny sukces odzyskuje Radar", () => {
    assert.ok(Number(scenario("scanner-first-load-failure").evidence.recovered_candidates) > 0);
    assert.equal(scenario("scanner-refresh-timeout").evidence.next_success_applied, true);
  });

  it("6. nakładające się cykle nie uruchamiają drugiego collectora", () => {
    const value = scenario("central-overlapping-cycles");
    assert.equal(value.evidence.second_status, "RUN_ALREADY_IN_PROGRESS");
    assert.equal(value.evidence.collector_calls, 1);
    assert.equal(value.evidence.snapshots_created, 1);
  });

  it("7. PARTIAL nie czyści dostępnych danych", () => {
    const value = scenario("central-partial-source-failure");
    assert.equal(value.evidence.cycle_status, "PARTIAL");
    assert.equal(value.evidence.records_valid, 4);
    assert.equal(value.evidence.scanner_pointer, "scan_last_known_good");
  });

  it("8. awaria wszystkich źródeł nie przesuwa pointera", () => {
    const value = scenario("central-all-sources-failure");
    assert.equal(value.evidence.scanner_pointer, "scan_before_failure");
    assert.equal(value.evidence.context_pointer, "context_before_failure");
    assert.equal(value.evidence.runner_calls, 1);
  });

  it("9. odzyskanie źródła tworzy poprawny snapshot", () => {
    const value = scenario("central-source-recovery");
    assert.equal(value.evidence.cycle_status, "SUCCESS");
    assert.equal(value.evidence.scanner_pointer, "scan_after_recovery");
    assert.equal(value.evidence.failure_count, 0);
  });

  it("10. błąd Follow-up nie tworzy częściowego wpisu", () => {
    assert.equal(scenario("follow-up-write-failure").evidence.partial_entries, 0);
  });

  it("11. ponowny Follow-up nie tworzy duplikatu", () => {
    const value = scenario("follow-up-write-failure");
    assert.equal(value.evidence.records_after_retry, 1);
    assert.equal(value.evidence.duplicate_records, 0);
    assert.equal(value.evidence.identity_preserved, true);
  });

  it("12. błędny checkpoint nie zmienia lifecycle", () => {
    const value = scenario("follow-up-invalid-checkpoint");
    assert.equal(value.evidence.checkpoint_rejected, true);
    assert.equal(value.evidence.candidate_created, false);
  });

  it("13. niekompletna decyzja nie tworzy Established", () => {
    const value = scenario("established-owner-decision-failure");
    assert.equal(value.evidence.incomplete_decision_rejected, true);
    assert.equal(value.evidence.established_created, false);
    assert.equal(value.evidence.universe_unchanged, true);
  });

  it("14. restart Follow-up zachowuje stan", () => {
    const value = scenario("follow-up-restart");
    assert.equal(value.evidence.entries_before_restart, value.evidence.entries_after_restart);
    assert.equal(value.evidence.entries_after_retry, 1);
    assert.equal(value.evidence.checkpoints_preserved, true);
  });

  it("15. orphan AI job jest odzyskiwany", () => {
    const value = scenario("ai-orphan-recovery");
    assert.equal(value.evidence.recovered_same_analysis_id, true);
    assert.equal(value.evidence.parallel_claim_blocked, true);
    assert.equal(value.evidence.records, 1);
  });

  it("16. nieprawidłowy brief nie przechodzi do READY", () => {
    const value = scenario("ai-invalid-provider-response");
    assert.equal(value.evidence.invalid_job_status, "SUSPENDED");
    assert.equal(value.evidence.invalid_result_published, false);
    assert.equal(value.evidence.last_known_good_preserved, true);
  });

  it("17. limit prób kończy zadanie kontrolowanym stanem", () => {
    const value = scenario("ai-attempt-limit");
    assert.equal(value.evidence.maximum_attempts, 2);
    assert.equal(value.evidence.provider_calls, 2);
    assert.equal(value.evidence.final_status, "SUSPENDED");
  });

  it("18. cooldown nie tworzy duplikatu", () => {
    const value = scenario("ai-cooldown-rate-limit");
    assert.equal(value.evidence.outcome, "COOLDOWN");
    assert.equal(value.evidence.records, 1);
    assert.equal(value.evidence.provider_calls_from_cta, 0);
  });

  it("19. restart kolejki zachowuje shared cache", () => {
    const value = scenario("ai-queue-restart");
    assert.equal(value.evidence.restored_status, "QUEUED");
    assert.equal(value.evidence.fingerprint_preserved, true);
    assert.equal(value.evidence.cache_key_preserved, true);
  });

  it("20. błąd raportu nie publikuje uszkodzonego wpisu", () => {
    const value = scenario("report-write-failure");
    assert.equal(value.evidence.visible_after_failure, 0);
    assert.equal(value.evidence.temporary_files_after_failure, 0);
  });

  it("21. ponowna próba raportu nie tworzy duplikatu", () => {
    const value = scenario("report-write-failure");
    assert.equal(value.evidence.visible_after_retry, 1);
    assert.equal(value.evidence.duplicate_reports, 0);
  });

  it("22. błąd feedback nie zmienia lifecycle", () => {
    const value = scenario("feedback-write-failure");
    assert.equal(value.evidence.lifecycle_unchanged, true);
    assert.equal(value.evidence.follow_up_unchanged, true);
    assert.equal(value.evidence.established_unchanged, true);
    assert.equal(value.evidence.records_after_retry, 1);
  });

  it("23. komunikaty klienta są nietechniczne", () => {
    const messages = [...manifest.client_messages.pl, ...manifest.client_messages.en].join("\n");
    assert.doesNotMatch(messages, /stack|exception|sqlite|openai|gpt-|provider|lease|circuit|retry count|authorization|[A-Z]:\\|\/home\//i);
    assert.match(messages, /Spróbuj ponownie później/);
    assert.match(messages, /Try again later/);
  });

  it("24. PL i EN są kompletne", async () => {
    assert.equal(manifest.client_messages.pl.length, 5);
    assert.equal(manifest.client_messages.en.length, 5);
    assert.ok(manifest.client_messages.pl.every(Boolean));
    assert.ok(manifest.client_messages.en.every(Boolean));
    const shell = await readFile(resolve(import.meta.dirname, "..", "src", "components", "ProductWorkspaceShell.tsx"), "utf8");
    assert.match(shell, /Dane są nieaktualne\./);
    assert.match(shell, /The data is out of date\./);
  });

  it("25. manifest JSON jest kompletny", async () => {
    const parsed = JSON.parse(await readFile(result.manifestPath, "utf8")) as ProductFailureDrillManifest;
    assert.equal(parsed.schema_version, PRODUCT_FAILURE_DRILL_SCHEMA_VERSION);
    assert.equal(parsed.scenarios.length, PRODUCT_FAILURE_DRILL_SCENARIOS.length);
    for (const key of [
      "run_id", "started_at", "completed_at", "status", "protected_state_before", "protected_state_after",
      "canonical_mutations", "scheduler_mutations", "openai_calls", "live_provider_calls", "error_codes", "markdown_report_path",
    ] as const) assert.ok(Object.hasOwn(parsed, key), key);
    const serialized = JSON.stringify(parsed);
    assert.doesNotMatch(serialized, /authorization|cookie|api[_-]?key|raw_prompt|session_data|personal_data/i);
  });

  it("26. raport Markdown jest kompletny", async () => {
    const markdown = await readFile(result.reportPath, "utf8");
    for (const section of ["Simulated failures", "Protected canonical state", "Follow-up fixes", "Retry and circuit breaker", "Isolation"]) {
      assert.match(markdown, new RegExp(section));
    }
    assert.match(markdown, /Canonical mutations: \*\*0\*\*/);
    assert.match(markdown, /OpenAI calls: \*\*0\*\*/);
  });

  it("27. kanoniczne stany pozostają niezmienione", () => {
    assert.equal(manifest.canonical_mutations, 0);
    assert.deepEqual(manifest.protected_state_after, manifest.protected_state_before);
  });

  it("28. scheduler mutations = 0", () => {
    assert.equal(manifest.scheduler_mutations, 0);
    assert.equal(manifest.scheduler_host_status, "READY");
  });

  it("29. OpenAI calls = 0", () => {
    assert.equal(manifest.openai_calls, 0);
    assert.ok(manifest.mock_provider_calls > 0);
  });

  it("30. live provider calls = 0", () => {
    assert.equal(manifest.live_provider_calls, 0);
    assert.equal(manifest.central_live_cycles, 0);
  });

  it("31. preview nie wykonuje mutacji", async () => {
    const before = await captureProtectedProductState();
    const preview = previewProductFailureDrills({ runId: "failure-drill-20260730T130000Z-cafebabe" });
    const after = await captureProtectedProductState();
    assert.equal(preview.stores_created, false);
    assert.equal(preview.failures_executed, false);
    assert.equal(preview.worker_started, false);
    assert.deepEqual(after, before);
  });

  it("32. launcher otwiera dokładnie jedną kartę", async () => {
    const source = await readFile(launcherPath, "utf8");
    assert.equal((source.match(/start "" "!REVIEW_URL!"/g) ?? []).length, 1);
    const { stdout } = await execFileAsync("cmd.exe", ["/d", "/c", launcherPath], {
      cwd: resolve(import.meta.dirname, "..", "..", ".."),
      env: { ...process.env, CRYPTO_EDGE_FAILURE_DRILL_PLAN_ONLY: "1" },
      timeout: 30_000,
      windowsHide: true,
    });
    assert.equal((stdout.match(/^OPEN_URL=/gm) ?? []).length, 1);
    assert.match(stdout, /Stores created: no/);
    assert.match(stdout, /Failures executed: no/);
    await assert.rejects(stat(resolve(testBase, "failure-drill-20260730T130000Z-cafebabe")));
  });
});

function scenario(id: ProductFailureDrillScenarioId) {
  const found = manifest.scenarios.find((value) => value.id === id);
  assert.ok(found, id);
  assert.equal(found.status, "PASS", `${id}: ${found.actual_result}`);
  return found;
}
