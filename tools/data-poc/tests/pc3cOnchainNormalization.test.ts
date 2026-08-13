import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import { normalizeSecurity } from "../src/normalizeSecurity.js";
import type { GoPlusTokenSecurityResponse } from "../src/types.js";

const ADDRESS = "0x1111111111111111111111111111111111111111";

test("PC.3C maps existing shared GoPlus snapshot fields centrally without a provider request", async () => {
  const fixture = JSON.parse(await readFile(resolve(process.cwd(), "fixtures", "goplus_token_security_sample.json"), "utf8")) as GoPlusTokenSecurityResponse;
  const output = normalizeSecurity({
    candidate: { symbol: "FIXTURE", chain: "base", contract_address: ADDRESS },
    goplusRaw: fixture,
    honeypotRaw: null,
    mode: "fixture",
    now: new Date("2026-08-13T12:00:00.000Z"),
  });

  assert.equal(output.security.top_wallet_pct, 8.5);
  assert.equal(output.security.top_10_wallets_pct, 34.2);
  assert.equal(output.security.liquidity_locked, true);
  assert.equal(output.security.liquidity_lock_days, 120);
  assert.equal(output.security.raw_sources_available.goplus, true);
  assert.equal(output.generated_at, "2026-08-13T12:00:00.000Z");
  assert.equal(output.security.missing_data.includes("holder_count"), false, "unavailable fields are not fabricated into the normalized model");
});
