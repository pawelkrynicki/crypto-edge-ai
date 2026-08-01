import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import { promisify } from "node:util";
import {
  OWNER_ACCEPTANCE_POINTS,
  OWNER_ACCEPTANCE_SCHEMA_VERSION,
  createOwnerAcceptanceManifest,
  createOwnerAcceptancePreview,
  createSafeOwnerAcceptanceEnvironment,
  runOwnerAcceptanceSession,
  validateOwnerAcceptanceManifest,
  type OwnerAcceptanceInput,
  type OwnerAcceptanceManifest,
} from "../server/ownerAcceptance.js";

const execFileAsync = promisify(execFile);
const repoRoot = resolve(import.meta.dirname, "..", "..", "..");

describe("OA.1 Local Owner Acceptance", () => {
  it("keeps the launcher preview-safe and opens exactly one planned tab", async () => {
    const preview = createOwnerAcceptancePreview();
    assert.equal(preview.schema_version, OWNER_ACCEPTANCE_SCHEMA_VERSION);
    assert.equal(preview.runtime_started, false);
    assert.equal(preview.openai_calls, 0);
    assert.equal(preview.provider_calls, 0);
    assert.equal(preview.task_scheduler_changes, 0);
    assert.equal(preview.browser_tabs_opened, 1);

    const launcherPath = resolve(repoRoot, "scripts", "win", "start-owner-acceptance-review.cmd");
    const launcher = await readFile(launcherPath, "utf8");
    assert.match(launcher, /set "MODE=PREVIEW"/);
    assert.match(launcher, /--run-local/);
    assert.match(launcher, /set "ALLOW_LIVE_PROVIDER_CALLS=0"/);
    assert.match(launcher, /set "CRYPTO_EDGE_AI_RESEARCH_PROVIDER=DISABLED"/);
    assert.match(launcher, /set "OPENAI_API_KEY="/);
    assert.doesNotMatch(launcher, /schtasks|Register-ScheduledTask/i);

    if (process.platform === "win32") {
      const result = await execFileAsync("cmd.exe", ["/d", "/c", launcherPath], {
        cwd: repoRoot,
        env: { ...process.env, CRYPTO_EDGE_OA1_PLAN_ONLY: "1" },
      });
      assert.equal((result.stdout.match(/OPEN_URL=/g) ?? []).length, 1);
      assert.match(result.stdout, /Runtime started: 0/);
    }
  });

  it("validates manifest persistence and requires a manual final verdict", () => {
    const manifest = validManifest();
    validateOwnerAcceptanceManifest(manifest);

    const withoutVerdict = { ...manifest, final_verdict: undefined };
    assert.throws(() => validateOwnerAcceptanceManifest(withoutVerdict), /FINAL_VERDICT_REQUIRED/);
    const automaticVerdict = { ...manifest, final_verdict_source: "AUTOMATIC" };
    assert.throws(() => validateOwnerAcceptanceManifest(automaticVerdict), /FINAL_VERDICT_MUST_BE_MANUAL/);
    const blockedAcceptance = {
      ...manifest,
      detected_p0_p1: [{ severity: "P1", note: "Radar is blocked." }],
      final_verdict: "ACCEPT",
    };
    assert.throws(() => validateOwnerAcceptanceManifest(blockedAcceptance), /P0_P1_BLOCKS_ACCEPTANCE/);
  });

  it("forces zero provider/OpenAI opt-ins", () => {
    const environment = createSafeOwnerAcceptanceEnvironment({
      ALLOW_LIVE_PROVIDER_CALLS: "1",
      CRYPTO_EDGE_AI_RESEARCH_PROVIDER: "OPENAI",
      CRYPTO_EDGE_AI_WORKER_ENABLED: "1",
      OPENAI_API_KEY: "secret",
    });
    assert.equal(environment.ALLOW_LIVE_PROVIDER_CALLS, "0");
    assert.equal(environment.CRYPTO_EDGE_ALLOW_LIVE_SOURCE_CHECK, "0");
    assert.equal(environment.CRYPTO_EDGE_AI_RESEARCH_PROVIDER, "DISABLED");
    assert.equal(environment.CRYPTO_EDGE_AI_WORKER_ENABLED, "0");
    assert.equal(environment.OPENAI_API_KEY, "");
    assert.equal(environment.CRYPTO_EDGE_AUTOMATION_ENABLED, "0");
  });

  it("opens exactly one tab, persists both artifacts, and cleans up its runtime", async () => {
    const outputRoot = await mkdtemp(resolve(tmpdir(), "crypto-edge-oa1-test-"));
    let opened = 0;
    let stopped = 0;
    const result = await runOwnerAcceptanceSession({
      commitSha: "154fffe42ced503ebb3cefbbe85443dc0d0c3907",
      sessionId: "oa1_20260801T200000Z_1234abcd",
      outputRoot,
      now: sequenceDates("2026-08-01T20:00:00.000Z", "2026-08-01T20:10:00.000Z"),
      startRuntime: async () => ({
        url: "http://127.0.0.1:4182/#candidate-results",
        stop: async () => { stopped += 1; },
      }),
      openBrowserTab: async () => { opened += 1; },
      collectOwnerInput: async () => validOwnerInput(),
    });

    assert.equal(opened, 1);
    assert.equal(stopped, 1);
    assert.equal(result.manifest.safety_confirmations.local_process_stopped, true);
    const savedManifest = JSON.parse(await readFile(result.artifacts.manifestPath, "utf8")) as unknown;
    validateOwnerAcceptanceManifest(savedManifest);
    assert.match(await readFile(result.artifacts.reportPath, "utf8"), /Manual owner verdict: \*\*ACCEPT_WITH_NOTES\*\*/);
  });

  it("cleans up the runtime when manual collection is interrupted", async () => {
    let stopped = 0;
    await assert.rejects(() => runOwnerAcceptanceSession({
      commitSha: "154fffe42ced503ebb3cefbbe85443dc0d0c3907",
      sessionId: "oa1_20260801T200000Z_8765dcba",
      startRuntime: async () => ({
        url: "http://127.0.0.1:4182/#candidate-results",
        stop: async () => { stopped += 1; },
      }),
      openBrowserTab: async () => undefined,
      collectOwnerInput: async () => { throw new Error("OWNER_CANCELLED"); },
    }), /OWNER_CANCELLED/);
    assert.equal(stopped, 1);
  });
});

function validOwnerInput(): OwnerAcceptanceInput {
  return {
    acceptancePoints: OWNER_ACCEPTANCE_POINTS.map((point) => ({
      ...point,
      status: "PASS",
      owner_note: "Owner verified the point manually.",
    })),
    detectedP0P1: [],
    deferredP2P3: [{ severity: "P3", note: "Minor copy improvement deferred." }],
    finalVerdict: "ACCEPT_WITH_NOTES",
  };
}

function validManifest(): OwnerAcceptanceManifest {
  return createOwnerAcceptanceManifest({
    sessionId: "oa1_20260801T200000Z_1234abcd",
    commitSha: "154fffe42ced503ebb3cefbbe85443dc0d0c3907",
    startedAt: "2026-08-01T20:00:00.000Z",
    finishedAt: "2026-08-01T20:10:00.000Z",
    ownerInput: validOwnerInput(),
    runtimeStopped: true,
  });
}

function sequenceDates(...values: string[]): () => Date {
  let index = 0;
  return () => new Date(values[Math.min(index++, values.length - 1)] as string);
}
