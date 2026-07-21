import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, it } from "node:test";
import { previewEstablishedAddressUniverse } from "../src/establishedAddressDiscovery.js";
import {
  calculateUniverseChecksum,
  normalizeEstablishedAddress,
  normalizeEstablishedChain,
  type EstablishedAddressUniverse,
} from "../src/establishedAddressUniverse.js";
import {
  diffEstablishedUniverses,
  mutateEstablishedUniverse,
  readEstablishedUniverseStore,
} from "../src/establishedUniverseManager.js";

const ADDRESS_A = "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const ADDRESS_B = "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";
const SOLANA_ADDRESS = "So11111111111111111111111111111111111111112";
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("established universe owner management", () => {
  it("normalizes supported chains and addresses and rejects unknown networks", () => {
    assert.equal(normalizeEstablishedChain(" Base "), "base");
    assert.equal(normalizeEstablishedAddress("base", ADDRESS_A), ADDRESS_A.toLowerCase());
    assert.equal(normalizeEstablishedAddress("solana", SOLANA_ADDRESS), SOLANA_ADDRESS);
    assert.throws(() => normalizeEstablishedChain("unknown"), /UNSUPPORTED_CHAIN/);
    assert.throws(() => normalizeEstablishedAddress("base", "0x123"), /INVALID_CONTRACT_ADDRESS/);
  });

  it("keeps dry-run read-only and exposes the complete change plan", async () => {
    const storePath = await newStorePath();
    const result = await mutateEstablishedUniverse({
      operation: "add",
      chain: " Base ",
      contract_address: ADDRESS_A,
      display_name: "Project A",
    }, { storePath, apply: false, now: fixedNow(1) });
    assert.equal(result.applied, false);
    assert.equal(result.from_version, "established-universe-v000000");
    assert.equal(result.to_version, "established-universe-v000001");
    assert.equal(result.identity, `base:${ADDRESS_A.toLowerCase()}`);
    await assert.rejects(stat(storePath), (error: unknown) => isErrorCode(error, "ENOENT"));
  });

  it("versions add, update, disable, enable and remove while retaining audit history", async () => {
    const storePath = await newStorePath();
    const addA = await mutateEstablishedUniverse({
      operation: "add",
      chain: "base",
      contract_address: ADDRESS_A,
      symbol_hint: "SAME",
    }, { storePath, apply: true, now: fixedNow(1) });
    const addB = await mutateEstablishedUniverse({
      operation: "add",
      chain: "base",
      contract_address: ADDRESS_B,
      symbol_hint: "SAME",
    }, { storePath, apply: true, now: fixedNow(2) });
    await mutateEstablishedUniverse({
      operation: "update",
      chain: "base",
      contract_address: ADDRESS_A,
      changes: { display_name: "Renamed" },
    }, { storePath, apply: true, now: fixedNow(3) });
    await mutateEstablishedUniverse({ operation: "disable", chain: "base", contract_address: ADDRESS_A }, {
      storePath, apply: true, now: fixedNow(4),
    });
    await mutateEstablishedUniverse({ operation: "enable", chain: "base", contract_address: ADDRESS_A }, {
      storePath, apply: true, now: fixedNow(5),
    });
    const removed = await mutateEstablishedUniverse({ operation: "remove", chain: "base", contract_address: ADDRESS_B }, {
      storePath, apply: true, now: fixedNow(6),
    });

    const store = await readEstablishedUniverseStore(storePath);
    assert.equal(addA.to_version, "established-universe-v000001");
    assert.equal(addB.to_version, "established-universe-v000002");
    assert.equal(removed.to_version, "established-universe-v000006");
    assert.equal(store.current.entries.length, 1);
    assert.equal(store.current.entries[0].display_name, "Renamed");
    assert.equal(store.current.entries[0].enabled, true);
    assert.equal(store.history.length, 6);
    assert.equal(store.audit_log.length, 6);
    assert.deepEqual(store.audit_log.map((entry) => entry.operation), ["remove", "enable", "disable", "update", "add", "add"]);
    assert.equal(store.audit_log.some((entry) => entry.identity.endsWith(ADDRESS_B.toLowerCase())), true);
    assert.notEqual(store.current.entries[0].entry_id, addB.entry_id);
  });

  it("uses chain and contract as identity instead of symbol hints", async () => {
    const storePath = await newStorePath();
    await mutateEstablishedUniverse({ operation: "add", chain: "base", contract_address: ADDRESS_A, symbol_hint: "DUP" }, {
      storePath, apply: true, now: fixedNow(1),
    });
    await mutateEstablishedUniverse({ operation: "add", chain: "base", contract_address: ADDRESS_B, symbol_hint: "DUP" }, {
      storePath, apply: true, now: fixedNow(2),
    });
    await assert.rejects(
      mutateEstablishedUniverse({ operation: "add", chain: "BASE", contract_address: ADDRESS_A }, {
        storePath, apply: true, now: fixedNow(3),
      }),
      /ESTABLISHED_UNIVERSE_DUPLICATE_IDENTITY/,
    );
    assert.equal((await readEstablishedUniverseStore(storePath)).current.entries.length, 2);
  });

  it("accepts a valid Solana entry on the explicit supported-chain list", async () => {
    const storePath = await newStorePath();
    await mutateEstablishedUniverse({ operation: "add", chain: "solana", contract_address: SOLANA_ADDRESS }, {
      storePath, apply: true, now: fixedNow(1),
    });
    assert.equal((await readEstablishedUniverseStore(storePath)).current.entries[0].contract_address, SOLANA_ADDRESS);
  });

  it("keeps checksums deterministic and produces version diffs", async () => {
    const storePath = await newStorePath();
    await mutateEstablishedUniverse({ operation: "add", chain: "base", contract_address: ADDRESS_A }, {
      storePath, apply: true, now: fixedNow(1),
    });
    const before = (await readEstablishedUniverseStore(storePath)).current;
    await mutateEstablishedUniverse({ operation: "disable", chain: "base", contract_address: ADDRESS_A }, {
      storePath, apply: true, now: fixedNow(2),
    });
    const after = (await readEstablishedUniverseStore(storePath)).current;
    const equivalent: EstablishedAddressUniverse = {
      ...after,
      universe_version: "established-universe-v999999",
      generated_at: "2030-01-01T00:00:00.000Z",
    };
    assert.equal(calculateUniverseChecksum(after), calculateUniverseChecksum(equivalent));
    const diff = diffEstablishedUniverses(before, after);
    assert.equal(diff.changed.length, 1);
    assert.deepEqual(diff.changed[0].changed_fields, ["enabled"]);
  });

  it("does not corrupt the previous version when an atomic write fails", async () => {
    const storePath = await newStorePath();
    await mutateEstablishedUniverse({ operation: "add", chain: "base", contract_address: ADDRESS_A }, {
      storePath, apply: true, now: fixedNow(1),
    });
    const before = await readFile(storePath, "utf8");
    await assert.rejects(
      mutateEstablishedUniverse({ operation: "disable", chain: "base", contract_address: ADDRESS_A }, {
        storePath,
        apply: true,
        now: fixedNow(2),
        atomicWrite: async () => { throw new Error("simulated write failure"); },
      }),
      /simulated write failure/,
    );
    assert.equal(await readFile(storePath, "utf8"), before);
  });

  it("previews only enabled inputs without providers, publishing or automation changes", async () => {
    const storePath = await newStorePath();
    await mutateEstablishedUniverse({ operation: "add", chain: "base", contract_address: ADDRESS_A }, {
      storePath, apply: true, now: fixedNow(1),
    });
    await mutateEstablishedUniverse({ operation: "add", chain: "base", contract_address: ADDRESS_B, enabled: false }, {
      storePath, apply: true, now: fixedNow(2),
    });
    const store = await readEstablishedUniverseStore(storePath);
    const before = await readFile(storePath, "utf8");
    const preview = previewEstablishedAddressUniverse({ universe: store.current });
    assert.equal(preview.provider_calls, 0);
    assert.equal(preview.snapshot_published, false);
    assert.equal(preview.automation_state_changed, false);
    assert.equal(preview.entries_enabled, 1);
    assert.deepEqual(preview.selected_entries.map((entry) => entry.contract_address), [ADDRESS_A.toLowerCase()]);
    assert.equal(await readFile(storePath, "utf8"), before);
  });
});

async function newStorePath(): Promise<string> {
  const root = await mkdtemp(resolve(tmpdir(), "crypto-edge-established-universe-"));
  roots.push(root);
  return resolve(root, "established-universe", "store.json");
}

function fixedNow(offset: number): () => Date {
  return () => new Date(`2026-07-21T00:00:${String(offset).padStart(2, "0")}.000Z`);
}

function isErrorCode(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === code);
}
