import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeSecurity } from "../src/normalizeSecurity.js";
import type { GoPlusTokenSecurityResponse, HoneypotTokenResponse, SecurityCandidate } from "../src/types.js";

const candidate: SecurityCandidate = {
  symbol: "TEST",
  chain: "eth",
  contract_address: "0xabc"
};

describe("normalizeSecurity", () => {
  it("normalizes clean fixture to SECURITY_PASSED", () => {
    const output = normalizeSecurity({
      candidate,
      mode: "fixture",
      now: new Date("2026-06-18T00:00:00.000Z"),
      goplusRaw: {
        result: {
          "0xabc": {
            is_honeypot: "0",
            buy_tax: "0.03",
            sell_tax: "0.04",
            is_open_source: "1",
            owner_address: "0x0000000000000000000000000000000000000000",
            liquidity_locked: true,
            is_mintable: "0",
            is_blacklisted: "0",
            cannot_sell_all: "0",
            top_wallet_pct: 8,
            top_10_wallets_pct: 35
          }
        }
      } satisfies GoPlusTokenSecurityResponse,
      honeypotRaw: {
        honeypotResult: { isHoneypot: false },
        simulationResult: { buyTax: 3, sellTax: 4 }
      } satisfies HoneypotTokenResponse
    });

    assert.equal(output.security.honeypot_status, "passed");
    assert.equal(output.security.buy_tax, 3);
    assert.equal(output.security.sell_tax, 4);
    assert.equal(output.security.contract_verified, true);
    assert.equal(output.security.ownership_status, "renounced");
    assert.equal(output.decision.security_label, "SECURITY_PASSED");
  });

  it("does not invent unavailable holder fields", () => {
    const output = normalizeSecurity({
      candidate,
      mode: "fixture",
      goplusRaw: {
        result: {
          "0xabc": {
            is_honeypot: "0",
            buy_tax: "0.03",
            sell_tax: "0.04",
            is_open_source: "1"
          }
        }
      },
      honeypotRaw: {
        honeypotResult: { isHoneypot: false }
      }
    });

    assert.equal(output.security.top_wallet_pct, null);
    assert.equal(output.security.top_10_wallets_pct, null);
    assert.ok(output.security.missing_data.includes("top_wallet_pct"));
    assert.ok(output.security.missing_data.includes("top_10_wallets_pct"));
    assert.equal(output.decision.security_label, "NEEDS_MANUAL_VERIFICATION");
  });
});
