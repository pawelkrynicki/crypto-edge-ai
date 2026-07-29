import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { describe, it } from "node:test";

const execFileAsync = promisify(execFile);
const repoRoot = resolve(import.meta.dirname, "..", "..", "..", "..");
const scriptsRoot = resolve(repoRoot, "scripts", "win");
const taskName = "Crypto Edge AI Central Automation";

describe("Windows Task Scheduler scripts", () => {
  it("keeps register and unregister dry-run by default", async () => {
    const register = await runCmd("register-central-automation-task.cmd");
    const unregister = await runCmd("unregister-central-automation-task.cmd");
    assert.match(register, /Mode: PREVIEW/);
    assert.match(unregister, /Mode: DRY-RUN/);
    assert.match(register, new RegExp(taskName));
    assert.match(unregister, new RegExp(taskName));
  });

  it("pins the canonical wrapper, configurable accepted cadence and IgnoreNew", async () => {
    const registerCmd = await source("register-central-automation-task.cmd");
    const registerPs1 = await source("register-central-automation-task.ps1");
    assert.match(registerCmd, /scripts\\win\\run-central-automation\.cmd/);
    assert.match(registerCmd, /every %INTERVAL_MINUTES% minutes/);
    assert.match(registerCmd, /MultipleInstances: IgnoreNew/);
    assert.match(registerCmd, /INTERVAL_MINUTES=5/);
    assert.match(registerCmd, /--interval-minutes/);
    assert.match(registerPs1, /New-TimeSpan -Minutes \$IntervalMinutes/);
    assert.match(registerPs1, /MultipleInstances IgnoreNew/);
    assert.match(registerPs1, /New-ScheduledTaskTrigger -AtStartup/);
    assert.match(registerPs1, /-WorkingDirectory \$RepoRoot/);
  });

  it("captures the script directory before shifts and never resolves it from shifted arguments", async () => {
    const registerCmd = await source("register-central-automation-task.cmd");
    const directoryCapture = registerCmd.indexOf('set "SCRIPT_DIR=%~dp0"');
    const firstShift = registerCmd.indexOf("shift");

    assert.ok(directoryCapture >= 0);
    assert.ok(firstShift > directoryCapture);
    assert.doesNotMatch(registerCmd.slice(firstShift), /%~dp0/i);
    assert.match(
      registerCmd,
      /-File "%SCRIPT_DIR%register-central-automation-task\.ps1"/,
    );
  });

  it("keeps preview non-mutating without invoking the PowerShell installer", async (context) => {
    const fixture = await createInstallerFixture(context, true);
    const result = await runCmdAt(fixture.cmdPath);

    assert.equal(result.exitCode, 0);
    assert.match(result.output, /Mode: PREVIEW/);
    await assert.rejects(access(fixture.markerPath));
  });

  it("resolves the installer beside the CMD in a spaced path and preserves PowerShell exit codes", async (context) => {
    const fixture = await createInstallerFixture(context, true);
    const success = await runCmdAt(fixture.cmdPath, ["--install", "--interval-minutes", "5"]);

    assert.equal(success.exitCode, 0);
    assert.match(success.output, /Mode: INSTALL/);
    assert.match(success.output, /Cadence: every 5 minutes/);
    assert.match(success.output, /Secrets in command line: none/);
    assert.match(success.output, new RegExp(`STUB_SCRIPT_PATH=${escapeRegExp(fixture.ps1Path)}`, "i"));
    assert.match(success.output, /STUB_INTERVAL_MINUTES=5/);
    assert.doesNotMatch(success.output, /api[_-]?key|token=|password/i);

    const failure = await runCmdAt(
      fixture.cmdPath,
      ["--install", "--interval-minutes", "5"],
      { CRYPTO_EDGE_INSTALLER_STUB_EXIT_CODE: "37" },
    );
    assert.equal(failure.exitCode, 37);
  });

  it("returns non-zero when the PowerShell installer path is invalid", async (context) => {
    const fixture = await createInstallerFixture(context, false);
    const result = await runCmdAt(fixture.cmdPath, ["--install", "--interval-minutes", "5"]);

    assert.notEqual(result.exitCode, 0);
    assert.match(result.output, /register-central-automation-task\.ps1/i);
  });

  it("uses explicit operation-specific flags and contains no secret, Cloudflare or legacy-port arguments", async () => {
    const names = [
      "register-central-automation-task.cmd", "register-central-automation-task.ps1",
      "unregister-central-automation-task.cmd", "preview-central-automation-task.cmd",
      "status-central-automation-task.cmd", "last-result-central-automation-task.cmd",
      "start-central-automation-task.cmd", "disable-central-automation-task.cmd",
      "resume-central-automation-state.cmd",
      "rollback-central-automation-task-config.cmd", "rollback-central-automation-task-config.ps1",
    ];
    const joined = (await Promise.all(names.map(source))).join("\n");
    for (const flag of ["--install", "--uninstall", "--run-task", "--disable", "--rollback-config"]) {
      assert.match(joined, new RegExp(flag));
    }
    assert.doesNotMatch(joined, /--apply/);
    assert.doesNotMatch(joined, /cloudflared|4173|api[_-]?key|token=|password/i);
    const resume = await source("resume-central-automation-state.cmd");
    assert.match(resume, /Mode: PREVIEW/);
    assert.match(resume, /--confirm-owner-resume/);
    assert.doesNotMatch(resume, /Enable-ScheduledTask|Start-ScheduledTask|--apply/i);
    const wrapper = await source("run-central-automation.cmd");
    assert.match(wrapper, /CRYPTO_EDGE_DATA_ENV=INTERNAL_BETA/);
    assert.match(wrapper, /CRYPTO_EDGE_AUTOMATION_ENABLED=1/);
    assert.match(wrapper, /ALLOW_LIVE_PROVIDER_CALLS=1/);
    assert.match(wrapper, /\.local\\automation\\logs/);
  });

  it("keeps the one-live-cycle launcher explicit, backed up, rollbackable and OpenAI-disabled", async () => {
    const launcher = await source("run-central-data-cycle.cmd");
    assert.match(launcher, /--run-once-live/);
    assert.match(launcher, /--rollback/);
    assert.match(launcher, /CRYPTO_EDGE_AI_RESEARCH_PROVIDER=DISABLED/);
    assert.match(launcher, /OPENAI_API_KEY=/);
    const operationSource = await readFile(resolve(repoRoot, "tools", "data-poc", "src", "automation", "runDataCycleOperations.ts"), "utf8");
    assert.match(operationSource, /rawArgs\[0\] === "--"/);
    assert.doesNotMatch(launcher, /--apply|cloudflared|schtasks|Register-ScheduledTask/i);
  });
});

async function source(name: string): Promise<string> {
  return readFile(resolve(scriptsRoot, name), "utf8");
}

async function runCmd(name: string): Promise<string> {
  const result = await execFileAsync("cmd.exe", ["/d", "/c", resolve(scriptsRoot, name)], {
    cwd: repoRoot,
    windowsHide: true,
  });
  return `${result.stdout}${result.stderr}`;
}

interface InstallerFixture {
  cmdPath: string;
  markerPath: string;
  ps1Path: string;
}

interface CmdResult {
  exitCode: number;
  output: string;
}

async function createInstallerFixture(
  context: { after(callback: () => Promise<void>): void },
  includePowerShellStub: boolean,
): Promise<InstallerFixture> {
  const tempRoot = await mkdtemp(join(tmpdir(), "crypto edge installer "));
  const fixtureRoot = join(tempRoot, "repo with spaces", "scripts", "win");
  const cmdPath = join(fixtureRoot, "register-central-automation-task.cmd");
  const ps1Path = join(fixtureRoot, "register-central-automation-task.ps1");
  const markerPath = join(tempRoot, "powershell-stub-ran.txt");
  context.after(() => rm(tempRoot, { recursive: true, force: true }));

  await mkdir(fixtureRoot, { recursive: true });
  await copyFile(resolve(scriptsRoot, "register-central-automation-task.cmd"), cmdPath);
  if (includePowerShellStub) {
    await writeFile(ps1Path, powerShellStub(markerPath), "utf8");
  }
  return { cmdPath, markerPath, ps1Path };
}

async function runCmdAt(
  cmdPath: string,
  args: string[] = [],
  environment: Record<string, string> = {},
): Promise<CmdResult> {
  try {
    const result = await execFileAsync("cmd.exe", ["/d", "/c", "call", cmdPath, ...args], {
      cwd: repoRoot,
      env: { ...process.env, ...environment },
      windowsHide: true,
    });
    return { exitCode: 0, output: `${result.stdout}${result.stderr}` };
  } catch (error) {
    const failure = error as Error & { code?: number; stdout?: string; stderr?: string };
    if (typeof failure.code !== "number") {
      throw error;
    }
    return {
      exitCode: failure.code,
      output: `${failure.stdout ?? ""}${failure.stderr ?? ""}`,
    };
  }
}

function powerShellStub(markerPath: string): string {
  const safeMarkerPath = markerPath.replaceAll("'", "''");
  return `param(
  [string]$TaskName,
  [string]$TaskUser,
  [string]$RepoRoot,
  [string]$RunnerPath,
  [int]$IntervalMinutes,
  [string]$BackupDirectory
)
Set-Content -LiteralPath '${safeMarkerPath}' -Value 'stub-only' -Encoding UTF8
Write-Output "STUB_SCRIPT_PATH=$PSCommandPath"
Write-Output "STUB_INTERVAL_MINUTES=$IntervalMinutes"
$exitCode = 0
if ($env:CRYPTO_EDGE_INSTALLER_STUB_EXIT_CODE) {
  $exitCode = [int]$env:CRYPTO_EDGE_INSTALLER_STUB_EXIT_CODE
}
exit $exitCode
`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
