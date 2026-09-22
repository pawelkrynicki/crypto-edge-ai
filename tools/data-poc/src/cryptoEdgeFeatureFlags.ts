import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const CRYPTO_EDGE_FEATURE_FLAGS_SCHEMA_VERSION = "crypto_edge_feature_flags_v1" as const;
export const CRYPTO_EDGE_FEATURE_FLAGS_MANIFEST_RELATIVE_PATH = "config/crypto_edge_feature_flags_v1.json" as const;

export const CRYPTO_EDGE_FEATURE_FLAGS = [
  "CRYPTO_EDGE_INVESTMENT_V2",
  "CRYPTO_EDGE_VISUAL_V2",
  "CRYPTO_EDGE_MULTI_SOURCE_DISCOVERY",
  "CRYPTO_EDGE_SOURCE_INTELLIGENCE",
  "CRYPTO_EDGE_FUTURES_SIGNALS",
  "CRYPTO_EDGE_RISK_ENGINE",
  "CRYPTO_EDGE_EXECUTION",
  "CRYPTO_EDGE_KRAKEN",
] as const;

export type CryptoEdgeFeatureFlag = (typeof CRYPTO_EDGE_FEATURE_FLAGS)[number];
export type CryptoEdgeFeatureFlagValues = Readonly<Record<CryptoEdgeFeatureFlag, boolean>>;
export type CryptoEdgeFeatureFlagEnvironment = Readonly<Record<string, string | undefined>>;

export type CryptoEdgeFeatureFlagsManifest = {
  schema_version: typeof CRYPTO_EDGE_FEATURE_FLAGS_SCHEMA_VERSION;
  defaults: CryptoEdgeFeatureFlagValues;
};

export type ResolvedCryptoEdgeFeatureFlags = {
  schema_version: typeof CRYPTO_EDGE_FEATURE_FLAGS_SCHEMA_VERSION;
  flags: CryptoEdgeFeatureFlagValues;
  invalid_overrides: CryptoEdgeFeatureFlag[];
};

let manifestCache: CryptoEdgeFeatureFlagsManifest | null = null;
const MAX_MANIFEST_SEARCH_DIRECTORIES = 5;

/**
 * Returns the repository-owned defaults manifest. Current runtimes do not
 * import this module; future server-side consumers must resolve flags here
 * rather than expose independent client-side enablement.
 */
export function getCryptoEdgeFeatureFlagsManifestPath(anchorPath = fileURLToPath(import.meta.url)): string {
  let searchDirectory = resolve(dirname(anchorPath));

  for (let directoryCount = 0; directoryCount < MAX_MANIFEST_SEARCH_DIRECTORIES; directoryCount += 1) {
    const manifestPath = resolve(searchDirectory, CRYPTO_EDGE_FEATURE_FLAGS_MANIFEST_RELATIVE_PATH);
    if (existsSync(manifestPath)) return manifestPath;

    const parentDirectory = dirname(searchDirectory);
    if (parentDirectory === searchDirectory) break;
    searchDirectory = parentDirectory;
  }

  throw new Error("CRYPTO_EDGE_FEATURE_FLAGS_MANIFEST_UNAVAILABLE");
}

export function loadCryptoEdgeFeatureFlagsManifest(): CryptoEdgeFeatureFlagsManifest {
  if (manifestCache) return manifestCache;
  const raw = JSON.parse(readFileSync(getCryptoEdgeFeatureFlagsManifestPath(), "utf8")) as unknown;
  manifestCache = validateCryptoEdgeFeatureFlagsManifest(raw);
  return manifestCache;
}

export function validateCryptoEdgeFeatureFlagsManifest(value: unknown): CryptoEdgeFeatureFlagsManifest {
  if (!isRecord(value) || value.schema_version !== CRYPTO_EDGE_FEATURE_FLAGS_SCHEMA_VERSION || !isRecord(value.defaults)) {
    throw new Error("CRYPTO_EDGE_FEATURE_FLAGS_MANIFEST_INVALID");
  }

  const defaultNames = Object.keys(value.defaults).sort();
  const canonicalNames = [...CRYPTO_EDGE_FEATURE_FLAGS].sort();
  if (defaultNames.length !== canonicalNames.length || defaultNames.some((name, index) => name !== canonicalNames[index])) {
    throw new Error("CRYPTO_EDGE_FEATURE_FLAGS_MANIFEST_INVALID");
  }

  const defaults = {} as Record<CryptoEdgeFeatureFlag, boolean>;
  for (const flag of CRYPTO_EDGE_FEATURE_FLAGS) {
    if (value.defaults[flag] !== false) throw new Error("CRYPTO_EDGE_FEATURE_FLAGS_MANIFEST_INVALID");
    defaults[flag] = false;
  }

  return {
    schema_version: CRYPTO_EDGE_FEATURE_FLAGS_SCHEMA_VERSION,
    defaults,
  };
}

export function resolveCryptoEdgeFeatureFlags(
  env: CryptoEdgeFeatureFlagEnvironment = process.env,
  manifest: CryptoEdgeFeatureFlagsManifest = loadCryptoEdgeFeatureFlagsManifest(),
): ResolvedCryptoEdgeFeatureFlags {
  const flags = {} as Record<CryptoEdgeFeatureFlag, boolean>;
  const invalidOverrides: CryptoEdgeFeatureFlag[] = [];

  for (const flag of CRYPTO_EDGE_FEATURE_FLAGS) {
    const override = parseCryptoEdgeFeatureFlagOverride(env[flag]);
    if (override === "invalid") invalidOverrides.push(flag);
    flags[flag] = typeof override === "boolean" ? override : manifest.defaults[flag];
  }

  return {
    schema_version: manifest.schema_version,
    flags,
    invalid_overrides: invalidOverrides,
  };
}

/** Pure parser for injected environment values; invalid input always fails closed. */
export function parseCryptoEdgeFeatureFlagOverride(value: string | undefined): boolean | "invalid" | null {
  if (value === undefined) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "1" || normalized === "true") return true;
  if (normalized === "0" || normalized === "false") return false;
  return "invalid";
}

export function resetCryptoEdgeFeatureFlagsManifestCacheForTests(): void {
  manifestCache = null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
