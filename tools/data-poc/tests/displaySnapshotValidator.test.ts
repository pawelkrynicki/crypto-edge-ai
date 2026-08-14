import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, it } from "node:test";
import { publishAtomicJson } from "../src/atomicPublish.js";
import { validateDisplayEligibleScannerSnapshot } from "../src/displaySnapshotValidator.js";
import {
  ESTABLISHED_UNIVERSE_SCHEMA_VERSION,
  calculateUniverseChecksum,
  type EstablishedAddressUniverseEntry,
} from "../src/establishedAddressUniverse.js";
import { runInternalBetaCollector } from "../src/internalBetaCollector.js";
import type { PersistableScannerOutput, PersistableSocialLink } from "../src/persistableScannerModel.js";

const NOW = new Date("2026-08-14T12:00:00.000Z");
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("display snapshot social_links contract", () => {
  it("accepts a current snapshot with an empty social_links array", async () => {
    const snapshot = await currentSnapshot();
    assert.deepEqual(snapshot.candidates[0]?.social_links, []);
    assert.doesNotThrow(() => validateDisplayEligibleScannerSnapshot(snapshot));
  });

  it("accepts canonical X, Telegram, Discord, and public website links", async () => {
    const snapshot = await currentSnapshot();
    setSocialLinks(snapshot, [
      socialLink("twitter", "https://x.com/project"),
      socialLink("telegram", "https://t.me/project"),
      socialLink("discord", "https://discord.gg/project"),
      socialLink("website", "https://project.example/"),
    ]);
    assert.doesNotThrow(() => validateDisplayEligibleScannerSnapshot(snapshot));
  });

  it("keeps rejecting unknown candidate fields", async () => {
    const snapshot = await currentSnapshot();
    (snapshot.candidates[0] as typeof snapshot.candidates[number] & Record<string, unknown>).unexpected = true;
    assert.throws(() => validateDisplayEligibleScannerSnapshot(snapshot), /SCANNER_UNKNOWN_FIELD/);
  });

  it("fails closed for unknown nested social link fields", async () => {
    const snapshot = await currentSnapshot();
    setSocialLinks(snapshot, [{ ...socialLink("twitter", "https://x.com/project"), unexpected: true } as PersistableSocialLink]);
    assert.throws(() => validateDisplayEligibleScannerSnapshot(snapshot), /SCANNER_UNKNOWN_FIELD/);
  });

  it("fails closed for unsupported categories, unexpected source, unsafe URL, and invalid lineage", async () => {
    const cases: Array<{ name: string; link: PersistableSocialLink }> = [
      { name: "unsupported category", link: { ...socialLink("twitter", "https://x.com/project"), category: "reddit" } as unknown as PersistableSocialLink },
      { name: "unexpected source", link: { ...socialLink("twitter", "https://x.com/project"), source: "Other" } as unknown as PersistableSocialLink },
      { name: "unsafe URL", link: socialLink("website", "https://127.0.0.1/private") },
      { name: "wrong snapshot lineage", link: { ...socialLink("twitter", "https://x.com/project"), snapshot_at: "2026-08-14T11:59:59.000Z" } },
    ];
    for (const { name, link } of cases) {
      const snapshot = await currentSnapshot();
      setSocialLinks(snapshot, [link]);
      assert.throws(() => validateDisplayEligibleScannerSnapshot(snapshot), /SCANNER_SOCIAL_LINK_INVALID/, name);
    }
  });

  it("preserves legacy snapshots that legitimately predate social_links", async () => {
    const snapshot = await currentSnapshot();
    assert.ok(snapshot.provenance?.metadata);
    snapshot.provenance.schema_version = "scanner_snapshot_v1";
    snapshot.provenance.generator_version = "data_poc_persistable_scanner_v1";
    delete snapshot.provenance.metadata.context_provenance;
    for (const candidate of snapshot.candidates) delete candidate.social_links;
    assert.doesNotThrow(() => validateDisplayEligibleScannerSnapshot(snapshot));
  });

  it("does not replace the previous LKG when a new snapshot has an invalid social link", async () => {
    const root = await tempRoot();
    const previous = await currentSnapshot();
    const published = await publishAtomicJson({
      output: previous,
      baseOutputDir: root,
      runId: "scan_previous_lkg",
      fileName: "full_output.json",
      validate: validateDisplayEligibleScannerSnapshot,
    });
    const invalid = structuredClone(previous);
    setSocialLinks(invalid, [socialLink("website", "https://127.0.0.1/private")]);

    await assert.rejects(() => publishAtomicJson({
      output: invalid,
      baseOutputDir: root,
      runId: "scan_invalid_social_link",
      fileName: "full_output.json",
      validate: validateDisplayEligibleScannerSnapshot,
    }), /SCANNER_SOCIAL_LINK_INVALID/);

    assert.deepEqual(JSON.parse(await readFile(published.output_file, "utf8")), previous);
    assert.deepEqual(await readdir(root), ["scan_previous_lkg"]);
  });
});

function socialLink(category: PersistableSocialLink["category"], url: string): PersistableSocialLink {
  return { category, url, source: "DexScreener", snapshot_at: NOW.toISOString() };
}

function setSocialLinks(snapshot: PersistableScannerOutput, links: PersistableSocialLink[]): void {
  const candidate = snapshot.candidates[0];
  assert.ok(candidate);
  assert.equal(candidate.created_at, NOW.toISOString());
  candidate.social_links = links;
}

async function currentSnapshot(): Promise<PersistableScannerOutput> {
  const root = await tempRoot();
  const result = await runInternalBetaCollector({
    env: {
      CRYPTO_EDGE_DATA_ENV: "INTERNAL_BETA",
      CRYPTO_EDGE_RUNTIME_MODE: "INTERNAL_BETA",
      ALLOW_LIVE_PROVIDER_CALLS: "1",
    },
    outputDir: root,
    seedLimit: 3,
    securityCandidateLimit: 1,
    now: NOW,
    establishedUniverse: emptyEstablishedUniverse(),
    fetchImpl: async (input) => {
      const url = String(input);
      if (url.endsWith("/token-profiles/latest/v1")) {
        return Response.json([
          { chainId: "base", tokenAddress: "0xcurrent1" },
          { chainId: "base", tokenAddress: "0xcurrent2" },
          { chainId: "base", tokenAddress: "0xcurrent3" },
        ]);
      }
      if (url.includes("/token-pairs/v1/base/0xcurrent")) {
        const address = decodeURIComponent(url.split("/").at(-1) ?? "");
        return Response.json([pair(address, `pair-${address}`)]);
      }
      if (url === "https://api.alternative.me/fng/?limit=1") {
        return Response.json({ data: [{ value: "40", value_classification: "Fear", timestamp: "1784203200", time_until_update: "3600" }] });
      }
      if (url === "https://api.llama.fi/protocols") {
        return Response.json([{ name: "Lido", chain: "Ethereum", tvl: 1_000_000, change_1d: 1, change_7d: 2, url: "https://lido.fi" }]);
      }
      throw new Error(`unexpected URL ${url}`);
    },
  });
  return structuredClone(result.scanner);
}

function emptyEstablishedUniverse() {
  const base = {
    schema_version: ESTABLISHED_UNIVERSE_SCHEMA_VERSION,
    universe_version: "established-universe-v000001",
    generated_at: "2026-08-01T00:00:00.000Z",
    entries: [] as EstablishedAddressUniverseEntry[],
  } as const;
  return { ...base, checksum: calculateUniverseChecksum(base) };
}

function pair(address: string, pairAddress: string) {
  return {
    chainId: "base",
    dexId: "uniswap",
    url: `https://dexscreener.com/base/${pairAddress}`,
    pairAddress,
    baseToken: { address, symbol: "CURRENT", name: "Current Token" },
    priceUsd: "1.25",
    marketCap: 1_000_000,
    fdv: 1_000_000,
    liquidity: { usd: 60_000 },
    volume: { h24: 100_000 },
    pairCreatedAt: Date.parse("2026-07-01T00:00:00.000Z"),
  };
}

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(resolve(tmpdir(), "crypto-edge-display-validator-"));
  roots.push(root);
  return root;
}
