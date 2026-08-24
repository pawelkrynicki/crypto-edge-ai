import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, it } from "node:test";
import { validateOwnerLiveSmokeEnvironment } from "../server/runOwnerAIResearchLiveSmoke.js";

const uiRoot = resolve(process.cwd());

describe("owner-only live AI smoke preflight", () => {
  it("fails closed before the worker when the owner marker, API key, or one-call budget is absent", () => {
    assert.deepEqual(validateOwnerLiveSmokeEnvironment({}), { allowed: false, code: "OWNER_LIVE_SMOKE_NOT_CONFIRMED" });
    assert.deepEqual(validateOwnerLiveSmokeEnvironment(ownerEnvironment({ OPENAI_API_KEY: "" })), { allowed: false, code: "OWNER_LIVE_SMOKE_API_KEY_MISSING" });
    assert.deepEqual(validateOwnerLiveSmokeEnvironment(ownerEnvironment({ CRYPTO_EDGE_AI_RESEARCH_LIVE_CALL_BUDGET: "2" })), { allowed: false, code: "OWNER_LIVE_SMOKE_BUDGET_INVALID" });
  });

  it("accepts only the frozen central-worker configuration without executing a provider call", () => {
    assert.deepEqual(validateOwnerLiveSmokeEnvironment(ownerEnvironment()), { allowed: true });
  });

  it("uses one central worker cycle and does not expose the API key in its owner launcher", async () => {
    const [runner, launcher] = await Promise.all([
      readFile(resolve(uiRoot, "server", "runOwnerAIResearchLiveSmoke.ts"), "utf8"),
      readFile(resolve(uiRoot, "..", "..", "scripts", "win", "run-owner-ai-live-smoke.cmd"), "utf8"),
    ]);
    assert.match(runner, /maxConcurrency: 1, maxAnalysesPerCycle: 1, maxAttempts: 1/);
    assert.match(runner, /cycle\.provider_calls > 1/);
    assert.match(launcher, /CRYPTO_EDGE_OWNER_LIVE_AI_SMOKE=1/);
    assert.match(launcher, /CRYPTO_EDGE_AI_RESEARCH_LIVE_CALL_BUDGET=1/);
    assert.match(launcher, /CRYPTO_EDGE_AI_RESEARCH_MODEL=gpt-5-mini/);
    assert.match(launcher, /if not defined OPENAI_API_KEY/i);
    assert.doesNotMatch(launcher, /if "%OPENAI_API_KEY%"==""/i);
    assert.match(launcher, /echo OPENAI_API_KEY: PRESENT/i);
    assert.match(launcher, /echo OPENAI_API_KEY: MISSING/i);
  });

  it("uses a CMD variable-name guard without leaking a dummy key or reaching a provider", async () => {
    const root = await mkdtemp(join(tmpdir(), "crypto-edge-owner-ai-key-guard-"));
    const launcherPath = join(root, "scripts", "win", "run-owner-ai-live-smoke.cmd");
    const fakeTsxPath = join(root, "tools", "ui-mock", "node_modules", ".bin", "tsx.cmd");
    const dummyKey = "TEST_SECRET_DO_NOT_CALL";
    try {
      await mkdir(join(root, "scripts", "win"), { recursive: true });
      await mkdir(join(root, "tools", "ui-mock", "node_modules", ".bin"), { recursive: true });
      await writeFile(launcherPath, await readFile(resolve(uiRoot, "..", "..", "scripts", "win", "run-owner-ai-live-smoke.cmd"), "utf8"), "utf8");
      await writeFile(fakeTsxPath, [
        "@echo off",
        "if not defined OPENAI_API_KEY (",
        "  echo FAKE_PROVIDER_GUARD_FAILED",
        "  exit /b 21",
        ")",
        "echo FAKE_PROVIDER_BLOCKED",
        "exit /b 0",
        "",
      ].join("\r\n"), "utf8");

      const presentRunner = join(root, "run-present.cmd");
      await writeFile(presentRunner, [
        "@echo off",
        `set "OPENAI_API_KEY=${dummyKey}"`,
        "call scripts\\win\\run-owner-ai-live-smoke.cmd",
        "",
      ].join("\r\n"), "utf8");
      const present = await runCmd("run-present.cmd", root);
      assert.equal(present.exitCode, 0, redactCommandResult(present, dummyKey));
      assert.match(present.stdout, /OPENAI_API_KEY: PRESENT/);
      assert.match(present.stdout, /FAKE_PROVIDER_BLOCKED/);
      assert.equal(present.stderr, "");
      assert.doesNotMatch(`${present.stdout}${present.stderr}`, new RegExp(dummyKey));

      const missingRunner = join(root, "run-missing.cmd");
      await writeFile(missingRunner, [
        "@echo off",
        "set \"OPENAI_API_KEY=\"",
        "call scripts\\win\\run-owner-ai-live-smoke.cmd",
        "",
      ].join("\r\n"), "utf8");
      const missing = await runCmd("run-missing.cmd", root);
      assert.equal(missing.exitCode, 1, redactCommandResult(missing, dummyKey));
      assert.match(missing.stdout, /^OPENAI_API_KEY: MISSING\r?\n$/);
      assert.equal(missing.stderr, "");
      assert.doesNotMatch(`${missing.stdout}${missing.stderr}`, new RegExp(dummyKey));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

function runCmd(batchFile: string, cwd: string): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.env.ComSpec ?? "cmd.exe", ["/d", "/c", `call ${batchFile}`], {
      cwd,
      env: process.env,
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.on("data", (chunk: string) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (exitCode) => resolveRun({ exitCode, stdout, stderr }));
  });
}

function redactCommandResult(result: { exitCode: number | null; stdout: string; stderr: string }, secret: string): string {
  return JSON.stringify({
    exitCode: result.exitCode,
    stdout: result.stdout.split(secret).join("[REDACTED]"),
    stderr: result.stderr.split(secret).join("[REDACTED]"),
  });
}

function ownerEnvironment(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    CRYPTO_EDGE_OWNER_LIVE_AI_SMOKE: "1",
    CRYPTO_EDGE_RUNTIME_MODE: "INTERNAL_BETA",
    CRYPTO_EDGE_PC1_REVIEW_DEFAULT_ACTOR: "OWNER",
    CRYPTO_EDGE_AI_WORKER_ENABLED: "1",
    ALLOW_LIVE_PROVIDER_CALLS: "1",
    CRYPTO_EDGE_AI_RESEARCH_PROVIDER: "OPENAI",
    CRYPTO_EDGE_AI_RESEARCH_MODEL: "gpt-5-mini",
    CRYPTO_EDGE_AI_RESEARCH_LIVE_CALL_BUDGET: "1",
    OPENAI_API_KEY: "test-key-not-used",
    ...overrides,
  };
}
