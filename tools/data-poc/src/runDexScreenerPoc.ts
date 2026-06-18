import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { searchDexScreenerPairs } from "./dexscreenerClient.js";
import { normalizeDexScreenerPairs } from "./normalizeDexScreener.js";
import type { DexScreenerPair, DexScreenerPocMode, DexScreenerSearchResponse, PocOutput } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_FIXTURE_PATH = resolve(__dirname, "../../fixtures/dexscreener_pair_sample.json");

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const mode = (args.mode ?? "fixture") as DexScreenerPocMode;
  const query = args.query ?? (mode === "live" ? "SOL" : "fixture");
  const now = new Date();
  const pairs = mode === "live" ? await searchDexScreenerPairs(query) : await loadFixturePairs(DEFAULT_FIXTURE_PATH);
  const candidates = normalizeDexScreenerPairs(pairs, now);
  const output: PocOutput = {
    source: "dexscreener",
    mode,
    query,
    generated_at: now.toISOString(),
    total_raw: pairs.length,
    total_passed: candidates.filter((candidate) => candidate.status === "passed_basic_filter").length,
    total_rejected: candidates.filter((candidate) => candidate.status === "rejected_basic_filter").length,
    candidates
  };

  console.log(JSON.stringify(output, null, 2));
}

async function loadFixturePairs(path: string): Promise<DexScreenerPair[]> {
  const raw = await readFile(path, "utf8");
  const parsed = JSON.parse(raw) as DexScreenerSearchResponse;
  return Array.isArray(parsed.pairs) ? parsed.pairs : [];
}

function parseArgs(args: string[]): Record<string, string> {
  const parsed: Record<string, string> = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) {
      continue;
    }

    const key = arg.slice(2);
    const next = args[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = "true";
      continue;
    }

    parsed[key] = next;
    index += 1;
  }

  return parsed;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify({ source: "dexscreener", error: message }, null, 2));
  process.exit(1);
});
