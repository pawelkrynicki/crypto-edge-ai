import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const DATA_POC_RUNTIME_ROOT_ENV = "CRYPTO_EDGE_DATA_POC_ROOT";
export const DATA_POC_PACKAGE_NAME = "@crypto-edge-ai/data-poc";

/**
 * Resolves the package root independently of whether this module is running
 * through tsx from src/ or through Node from dist/. The default walks upward
 * from this module until it finds the data-poc package manifest.
 */
export function getDataPocRuntimeRoot(
  env: NodeJS.ProcessEnv = process.env,
  anchorPath = fileURLToPath(import.meta.url),
): string {
  const configured = env[DATA_POC_RUNTIME_ROOT_ENV]?.trim();
  if (configured) return assertDataPocRuntimeRoot(resolve(configured), "DATA_POC_RUNTIME_ROOT_INVALID");

  let current = resolve(dirname(anchorPath));
  while (true) {
    if (isDataPocRuntimeRoot(current)) return current;
    const parent = resolve(current, "..");
    if (parent === current) break;
    current = parent;
  }
  throw new Error("DATA_POC_RUNTIME_ROOT_UNAVAILABLE");
}

function assertDataPocRuntimeRoot(path: string, errorCode: string): string {
  if (!isDataPocRuntimeRoot(path)) throw new Error(errorCode);
  return path;
}

function isDataPocRuntimeRoot(path: string): boolean {
  const manifestPath = resolve(path, "package.json");
  if (!existsSync(manifestPath)) return false;
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { name?: unknown };
    return manifest.name === DATA_POC_PACKAGE_NAME;
  } catch {
    return false;
  }
}
