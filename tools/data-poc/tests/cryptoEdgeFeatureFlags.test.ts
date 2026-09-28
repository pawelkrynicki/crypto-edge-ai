import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { describe, it } from "node:test";
import {
  CRYPTO_EDGE_FEATURE_FLAGS,
  CRYPTO_EDGE_FEATURE_FLAGS_MANIFEST_RELATIVE_PATH,
  CRYPTO_EDGE_FEATURE_FLAGS_SCHEMA_VERSION,
  getCryptoEdgeFeatureFlagsManifestPath,
  loadCryptoEdgeFeatureFlagsManifest,
  resolveCryptoEdgeFeatureFlags,
  validateCryptoEdgeFeatureFlagsManifest,
} from "../src/cryptoEdgeFeatureFlags.js";

const ALL_FALSE = Object.fromEntries(CRYPTO_EDGE_FEATURE_FLAGS.map((flag) => [flag, false]));

describe("Crypto Edge Next feature flags", () => {
  it("keeps the versioned manifest to exactly the canonical disabled flags", () => {
    const manifest = loadCryptoEdgeFeatureFlagsManifest();

    assert.equal(manifest.schema_version, CRYPTO_EDGE_FEATURE_FLAGS_SCHEMA_VERSION);
    assert.deepEqual(Object.keys(manifest.defaults).sort(), [...CRYPTO_EDGE_FEATURE_FLAGS].sort());
    assert.deepEqual(manifest.defaults, ALL_FALSE);
  });

  it("resolves an empty environment to all defaults", () => {
    const resolved = resolveCryptoEdgeFeatureFlags({});

    assert.equal(resolved.schema_version, CRYPTO_EDGE_FEATURE_FLAGS_SCHEMA_VERSION);
    assert.deepEqual(resolved.flags, ALL_FALSE);
    assert.deepEqual(resolved.invalid_overrides, []);
  });

  it("resolves src and dist module anchors to the current release manifest", () => {
    const expectedManifestPath = getCryptoEdgeFeatureFlagsManifestPath();
    const releaseRoot = resolve(expectedManifestPath, "..", "..");
    const sourceAnchor = join(releaseRoot, "tools", "data-poc", "src", "cryptoEdgeFeatureFlags.ts");
    const distAnchor = join(releaseRoot, "tools", "data-poc", "dist", "src", "cryptoEdgeFeatureFlags.js");

    assert.equal(getCryptoEdgeFeatureFlagsManifestPath(sourceAnchor), expectedManifestPath);
    assert.equal(getCryptoEdgeFeatureFlagsManifestPath(distAnchor), expectedManifestPath);
  });

  it("binds manifest resolution to the code release rather than a data-poc root", async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), "crypto-edge-feature-flags-"));
    const releaseA = join(fixtureRoot, "release-a");
    const releaseB = join(fixtureRoot, "release-b");
    const manifestA = join(releaseA, CRYPTO_EDGE_FEATURE_FLAGS_MANIFEST_RELATIVE_PATH);
    const manifestB = join(releaseB, CRYPTO_EDGE_FEATURE_FLAGS_MANIFEST_RELATIVE_PATH);
    const sourceAnchor = join(releaseA, "tools", "data-poc", "src", "cryptoEdgeFeatureFlags.ts");

    try {
      await Promise.all([
        mkdir(dirname(manifestA), { recursive: true }),
        mkdir(dirname(manifestB), { recursive: true }),
        mkdir(dirname(sourceAnchor), { recursive: true }),
      ]);
      await Promise.all([
        writeFile(manifestA, JSON.stringify({ schema_version: CRYPTO_EDGE_FEATURE_FLAGS_SCHEMA_VERSION, defaults: ALL_FALSE })),
        writeFile(manifestB, JSON.stringify({ schema_version: CRYPTO_EDGE_FEATURE_FLAGS_SCHEMA_VERSION, defaults: ALL_FALSE })),
        writeFile(sourceAnchor, "export {};\n"),
      ]);

      const resolvedManifestPath = getCryptoEdgeFeatureFlagsManifestPath(sourceAnchor);
      const manifest = validateCryptoEdgeFeatureFlagsManifest(JSON.parse(await readFile(resolvedManifestPath, "utf8")));
      const resolved = resolveCryptoEdgeFeatureFlags(
        { CRYPTO_EDGE_DATA_POC_ROOT: join(releaseB, "tools", "data-poc") },
        manifest,
      );

      assert.equal(resolvedManifestPath, manifestA);
      assert.notEqual(resolvedManifestPath, manifestB);
      assert.deepEqual(resolved.flags, ALL_FALSE);
      assert.deepEqual(resolved.invalid_overrides, []);
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });

  it("throws the canonical error when the code release has no manifest", async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), "crypto-edge-feature-flags-"));
    const sourceAnchor = join(fixtureRoot, "release-without-manifest", "tools", "data-poc", "src", "cryptoEdgeFeatureFlags.ts");

    try {
      await mkdir(dirname(sourceAnchor), { recursive: true });
      await writeFile(sourceAnchor, "export {};\n");

      assert.throws(
        () => getCryptoEdgeFeatureFlagsManifestPath(sourceAnchor),
        /CRYPTO_EDGE_FEATURE_FLAGS_MANIFEST_UNAVAILABLE/,
      );
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });

  for (const flag of CRYPTO_EDGE_FEATURE_FLAGS) {
    it(`enables only ${flag} for accepted enabled values`, () => {
      for (const value of ["1", "true", "TRUE", " True "]) {
        const resolved = resolveCryptoEdgeFeatureFlags({ [flag]: value });
        assert.equal(resolved.flags[flag], true, value);
        assert.deepEqual(
          Object.fromEntries(CRYPTO_EDGE_FEATURE_FLAGS.filter((other) => other !== flag).map((other) => [other, resolved.flags[other]])),
          Object.fromEntries(CRYPTO_EDGE_FEATURE_FLAGS.filter((other) => other !== flag).map((other) => [other, false])),
        );
      }
    });

    it(`keeps ${flag} disabled for accepted disabled values`, () => {
      for (const value of ["0", "false", "FALSE", " False "]) {
        const resolved = resolveCryptoEdgeFeatureFlags({ [flag]: value });
        assert.equal(resolved.flags[flag], false, value);
        assert.deepEqual(resolved.invalid_overrides, []);
      }
    });

    it(`fails closed for invalid ${flag} overrides`, () => {
      for (const value of ["yes", "enabled", "2", "banana"]) {
        const resolved = resolveCryptoEdgeFeatureFlags({ [flag]: value });
        assert.equal(resolved.flags[flag], false, value);
        assert.deepEqual(resolved.invalid_overrides, [flag]);
      }
    });
  }

  it("does not mutate the supplied environment", () => {
    const env = Object.freeze({
      CRYPTO_EDGE_INVESTMENT_V2: "true",
      CRYPTO_EDGE_KRAKEN: "banana",
    });
    const before = { ...env };

    const resolved = resolveCryptoEdgeFeatureFlags(env);

    assert.equal(resolved.flags.CRYPTO_EDGE_INVESTMENT_V2, true);
    assert.equal(resolved.flags.CRYPTO_EDGE_KRAKEN, false);
    assert.deepEqual(env, before);
  });
});
