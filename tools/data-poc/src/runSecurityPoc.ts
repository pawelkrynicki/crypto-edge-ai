import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchGoPlusTokenSecurity } from "./goplusClient.js";
import { fetchHoneypotToken } from "./honeypotClient.js";
import { normalizeDexScreenerPairs } from "./normalizeDexScreener.js";
import { normalizeSecurity } from "./normalizeSecurity.js";
import type {
  CryptoEdgeCandidate,
  DexScreenerSearchResponse,
  GoPlusTokenSecurityResponse,
  HoneypotTokenResponse,
  SecurityCandidate,
  SecurityPocMode
} from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = resolve(__dirname, "../../fixtures");

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const mode = (args.mode ?? "fixture") as SecurityPocMode;
  const now = new Date();
  const candidate =
    args["candidate-from-dex-fixture"] === "true"
      ? await loadFirstPassedDexCandidate(now)
      : mode === "live"
        ? candidateFromArgs(args)
        : await readJson<SecurityCandidate>(resolve(FIXTURES_DIR, "security_candidate_sample.json"));

  const goplusRaw =
    mode === "live"
      ? await safeFetch(() => fetchGoPlusTokenSecurity(candidate.chain, candidate.contract_address ?? ""))
      : await readJson<GoPlusTokenSecurityResponse>(resolve(FIXTURES_DIR, "goplus_token_security_sample.json"));
  const honeypotRaw =
    mode === "live"
      ? await safeFetch(() => fetchHoneypotToken(candidate.chain, candidate.contract_address ?? ""))
      : await readJson<HoneypotTokenResponse>(resolve(FIXTURES_DIR, "honeypot_token_sample.json"));

  const output = normalizeSecurity({
    candidate,
    goplusRaw,
    honeypotRaw,
    mode,
    now
  });

  console.log(JSON.stringify(output, null, 2));
}

async function loadFirstPassedDexCandidate(now: Date): Promise<SecurityCandidate> {
  const fixture = await readJson<DexScreenerSearchResponse>(resolve(FIXTURES_DIR, "dexscreener_pair_sample.json"));
  const candidates = normalizeDexScreenerPairs(fixture.pairs ?? [], now);
  const firstPassed = candidates.find((candidate) => candidate.status === "passed_basic_filter") ?? candidates[0];
  if (!firstPassed) {
    throw new Error("DexScreener fixture has no candidates");
  }
  return toSecurityCandidate(firstPassed);
}

function toSecurityCandidate(candidate: CryptoEdgeCandidate): SecurityCandidate {
  return {
    symbol: candidate.symbol,
    chain: candidate.chain,
    contract_address: candidate.contract_address
  };
}

function candidateFromArgs(args: Record<string, string>): SecurityCandidate {
  const chain = args.chain;
  const address = args.address;
  if (!chain || !address) {
    throw new Error("Live security mode requires --chain and --address");
  }
  return {
    symbol: args.symbol ?? "UNKNOWN",
    chain,
    contract_address: address
  };
}

async function safeFetch<T>(fetcher: () => Promise<T | null>): Promise<T | null> {
  try {
    return await fetcher();
  } catch {
    return null;
  }
}

async function readJson<T>(path: string): Promise<T> {
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw) as T;
}

function parseArgs(args: string[]): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) continue;
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
  console.error(JSON.stringify({ source: "security-poc", error: message }, null, 2));
  process.exit(1);
});
