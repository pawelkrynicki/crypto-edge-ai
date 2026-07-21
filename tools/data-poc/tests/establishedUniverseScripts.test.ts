import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, it } from "node:test";

const SCRIPT_NAMES = [
  "established-universe-list.cmd",
  "established-universe-validate.cmd",
  "established-universe-add.cmd",
  "established-universe-disable.cmd",
  "established-universe-enable.cmd",
  "established-universe-remove.cmd",
  "established-universe-history.cmd",
];

describe("established universe Windows helpers", () => {
  it("keeps every helper offline and routes it through the canonical CLI", async () => {
    for (const name of SCRIPT_NAMES) {
      const source = await readScript(name);
      assert.match(source, /ALLOW_LIVE_PROVIDER_CALLS=0/i, name);
      assert.match(source, /universe:manage/i, name);
      assert.doesNotMatch(source, /cloudflare|schtasks|register-scheduledtask|collect:internal-beta/i, name);
    }
  });

  it("makes mutating helpers visibly dry-run-first", async () => {
    for (const action of ["add", "disable", "enable", "remove"]) {
      const source = await readScript(`established-universe-${action}.cmd`);
      assert.match(source, /Without --apply this is a dry-run/i);
      assert.match(source, new RegExp(`universe:manage -- ${action}`, "i"));
    }
  });

  it("keeps the aggregate check explicitly offline", async () => {
    const source = await readScript("check-established-universe.cmd");
    assert.match(source, /ALLOW_LIVE_PROVIDER_CALLS=0/i);
    assert.match(source, /universe:preview/i);
    assert.match(source, /NO PROVIDER CALLS/i);
    assert.doesNotMatch(source, /universe:live-validate|collect:internal-beta|schtasks/i);
  });
});

function readScript(name: string): Promise<string> {
  return readFile(resolve(import.meta.dirname, "..", "..", "..", "..", "scripts", "win", name), "utf8");
}
