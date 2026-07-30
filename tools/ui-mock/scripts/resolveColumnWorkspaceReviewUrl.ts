import { mapPersistableScannerOutputToUiCandidates } from "../src/adapters/scannerOutputAdapter.js";
import { resolveTokenIdentity } from "../src/tokenLifecycle.js";
import type { ScannerApiOutput } from "../src/types/scannerTypes.js";

const API_URL = "http://127.0.0.1:5177/api/scanner/latest";
const DEADLINE_MS = 20_000;

async function main() {
  const output = await waitForCurrentSnapshot();
  const candidate = mapPersistableScannerOutputToUiCandidates(output).find((entry) => (
    resolveTokenIdentity(entry.chain, entry.contractAddress).status === "valid"
  ));
  if (!candidate) throw new Error("No supported chain + contract_address identity exists in the current validated snapshot.");

  const url = new URL("http://127.0.0.1:5173/");
  url.searchParams.set("chain", candidate.chain);
  url.searchParams.set("contract", candidate.contractAddress);
  url.hash = "candidate-detail";
  process.stdout.write(url.toString());
}

async function waitForCurrentSnapshot(): Promise<ScannerApiOutput> {
  const deadline = Date.now() + DEADLINE_MS;
  let lastError: unknown = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(API_URL, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(3_000),
      });
      if (response.ok) return await response.json() as ScannerApiOutput;
      lastError = new Error(`Scanner API returned HTTP ${response.status}.`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
  throw lastError instanceof Error ? lastError : new Error("Scanner API did not expose a validated current snapshot.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
