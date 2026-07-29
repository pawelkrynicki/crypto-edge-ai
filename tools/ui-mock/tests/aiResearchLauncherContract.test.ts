import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoRoot = resolve(import.meta.dirname, "..", "..", "..");
const launcherPath = resolve(repoRoot, "scripts", "win", "start-ai3-shared-queue-review.cmd");
const productLauncherPath = resolve(repoRoot, "scripts", "win", "start-product-radar-review.cmd");
const states = ["ready", "absent", "queued", "processing", "stale", "failed", "suspended", "cooldown"] as const;

describe("AI.3 Windows owner-review launcher contract", () => {
  it("opens exactly one canonical READY tab by default", { skip: process.platform !== "win32" }, async () => {
    const result = await plan();
    assert.equal(result.exitCode, 0);
    assert.deepEqual(openUrls(result.stdout), [reviewUrl("ready")]);
  });

  it("opens exactly one cooldown tab for --state cooldown", { skip: process.platform !== "win32" }, async () => {
    const result = await plan("--state", "cooldown");
    assert.equal(result.exitCode, 0);
    assert.deepEqual(openUrls(result.stdout), [reviewUrl("cooldown")]);
  });

  it("opens exactly one correct tab for every allowed --state value", { skip: process.platform !== "win32" }, async () => {
    for (const state of states) {
      const result = await plan("--state", state);
      assert.equal(result.exitCode, 0, state);
      assert.deepEqual(openUrls(result.stdout), [reviewUrl(state)], state);
    }
  });

  it("opens all eight states only with explicit --all-states", { skip: process.platform !== "win32" }, async () => {
    const result = await plan("--all-states");
    assert.equal(result.exitCode, 0);
    assert.deepEqual(openUrls(result.stdout), states.map(reviewUrl));
  });

  it("rejects an unknown parameter before starting the product", { skip: process.platform !== "win32" }, async () => {
    const result = await plan("--unknown");
    assert.notEqual(result.exitCode, 0);
    assert.match(result.stdout, /Nieznany parametr/);
    assert.match(result.stdout, /Uzycie:/);
    assert.deepEqual(openUrls(result.stdout), []);
    assert.doesNotMatch(result.stdout, /Product Radar owner review|Uruchamianie Scanner API/);
  });

  it("rejects an unknown state before starting the product", { skip: process.platform !== "win32" }, async () => {
    const result = await plan("--state", "unknown");
    assert.notEqual(result.exitCode, 0);
    assert.match(result.stdout, /Nieznany stan review/);
    assert.match(result.stdout, /Uzycie:/);
    assert.deepEqual(openUrls(result.stdout), []);
    assert.doesNotMatch(result.stdout, /Product Radar owner review|Uruchamianie Scanner API/);
  });

  it("keeps the launcher isolated, mock-only and free of live-call or secret activation", async () => {
    const [launcher, productLauncher] = await Promise.all([
      readFile(launcherPath, "utf8"),
      readFile(productLauncherPath, "utf8"),
    ]);
    assert.match(launcher, /CRYPTO_EDGE_AI_QUEUE_SQLITE_PATH=%TEMP%/);
    assert.match(launcher, /CRYPTO_EDGE_AI_REVIEW_PROVIDER=DETERMINISTIC_MOCK/);
    assert.match(launcher, /CRYPTO_EDGE_AI_RESEARCH_PROVIDER=DISABLED/);
    assert.match(launcher, /OPENAI_API_KEY=/);
    assert.match(launcher, /start-product-radar-review\.cmd" --candidate-detail --no-open/);
    assert.match(productLauncher, /if "%OPEN_BROWSER%"=="1" start/);
    assert.doesNotMatch(launcher, /ALLOW_LIVE_PROVIDER_CALLS=1|CRYPTO_EDGE_ALLOW_LIVE_SOURCE_CHECK=1|collect:internal-beta|scanner:persist:live|--live-one/i);
    assert.doesNotMatch(launcher, /[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9_-]{16,}/);
  });
});

async function plan(...args: string[]): Promise<{ exitCode: number; stdout: string }> {
  try {
    const result = await execFileAsync("cmd.exe", ["/d", "/c", launcherPath, ...args], {
      cwd: repoRoot,
      env: { ...process.env, CRYPTO_EDGE_AI3_REVIEW_PLAN_ONLY: "1" },
      windowsHide: true,
    });
    return { exitCode: 0, stdout: `${result.stdout}${result.stderr}` };
  } catch (error) {
    const result = error as { code?: number; stdout?: string; stderr?: string };
    return { exitCode: typeof result.code === "number" ? result.code : 1, stdout: `${result.stdout ?? ""}${result.stderr ?? ""}` };
  }
}

function openUrls(output: string): string[] {
  return output.split(/\r?\n/)
    .filter((line) => line.startsWith("OPEN_URL="))
    .map((line) => line.slice("OPEN_URL=".length));
}

function reviewUrl(state: typeof states[number]): string {
  return state === "ready"
    ? "http://127.0.0.1:5173/#candidate-detail"
    : `http://127.0.0.1:5173/?ai_review_state=${state}#candidate-detail`;
}
