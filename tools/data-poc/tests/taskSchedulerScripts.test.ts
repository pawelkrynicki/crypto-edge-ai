import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
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

  it("uses explicit operation-specific flags and contains no secret, Cloudflare or legacy-port arguments", async () => {
    const names = [
      "register-central-automation-task.cmd", "register-central-automation-task.ps1",
      "unregister-central-automation-task.cmd", "preview-central-automation-task.cmd",
      "status-central-automation-task.cmd", "last-result-central-automation-task.cmd",
      "start-central-automation-task.cmd", "disable-central-automation-task.cmd",
      "rollback-central-automation-task-config.cmd", "rollback-central-automation-task-config.ps1",
    ];
    const joined = (await Promise.all(names.map(source))).join("\n");
    for (const flag of ["--install", "--uninstall", "--run-task", "--disable", "--rollback-config"]) {
      assert.match(joined, new RegExp(flag));
    }
    assert.doesNotMatch(joined, /--apply/);
    assert.doesNotMatch(joined, /cloudflared|4173|api[_-]?key|token=|password/i);
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
