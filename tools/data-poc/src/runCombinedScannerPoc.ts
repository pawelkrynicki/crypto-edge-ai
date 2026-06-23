import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCombinedScannerOutput } from "./combinedScanner.js";
import { searchDexScreenerPairs } from "./dexscreenerClient.js";
import { fetchGoPlusTokenSecurity } from "./goplusClient.js";
import { fetchHoneypotToken } from "./honeypotClient.js";
import { normalizeDexScreenerPairs } from "./normalizeDexScreener.js";
import { isSourcePolicyError } from "./sourcePolicy.js";
import type {
  CryptoEdgeCandidate,
  DexScreenerPocMode,
  DexScreenerSearchResponse,
  GoPlusTokenSecurityResponse,
  HoneypotTokenResponse
} from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = resolve(__dirname, "../../fixtures");
const DEFAULT_MAX_CANDIDATES = 3;

export type RunCombinedScannerPocOptions = {
  mode: DexScreenerPocMode;
  query?: string;
  maxCandidates?: number;
  now?: Date;
};

export async function runCombinedScannerPoc(options: RunCombinedScannerPocOptions) {
  const mode = options.mode;
  const query = options.query ?? (mode === "live" ? "SOL" : "fixture");
  const maxCandidates = sanitizeMaxCandidates(options.maxCandidates);
  const now = options.now ?? new Date();
  const pairs = mode === "live" ? await searchDexScreenerPairs(query) : (await readJson<DexScreenerSearchResponse>(resolve(FIXTURES_DIR, "dexscreener_pair_sample.json"))).pairs ?? [];
  const candidates = normalizeDexScreenerPairs(pairs, now);
  const fixtureSecurity = await loadFixtureSecurity();

  return buildCombinedScannerOutput({
    mode,
    query,
    candidates,
    maxCandidates,
    now,
    securityRawProvider:
      mode === "live"
        ? liveSecurityProvider
        : async () => ({
            goplusRaw: fixtureSecurity.goplusRaw,
            honeypotRaw: fixtureSecurity.honeypotRaw
          })
  });
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const output = await runCombinedScannerPoc({
    mode: (args.mode ?? "fixture") as DexScreenerPocMode,
    query: args.query,
    maxCandidates: Number(args["max-candidates"] ?? DEFAULT_MAX_CANDIDATES)
  });

  console.log(JSON.stringify(output, null, 2));
}

async function liveSecurityProvider(candidate: CryptoEdgeCandidate): Promise<{
  goplusRaw: GoPlusTokenSecurityResponse | null;
  honeypotRaw: HoneypotTokenResponse | null;
}> {
  if (!candidate.contract_address) {
    return { goplusRaw: null, honeypotRaw: null };
  }
  const goplusRaw = await safeFetch(() => fetchGoPlusTokenSecurity(candidate.chain, candidate.contract_address ?? ""));
  const honeypotRaw = await safeFetch(() => fetchHoneypotToken(candidate.chain, candidate.contract_address ?? ""));
  return { goplusRaw, honeypotRaw };
}

async function loadFixtureSecurity(): Promise<{
  goplusRaw: GoPlusTokenSecurityResponse;
  honeypotRaw: HoneypotTokenResponse;
}> {
  const [goplusRaw, honeypotRaw] = await Promise.all([
    readJson<GoPlusTokenSecurityResponse>(resolve(FIXTURES_DIR, "goplus_token_security_sample.json")),
    readJson<HoneypotTokenResponse>(resolve(FIXTURES_DIR, "honeypot_token_sample.json"))
  ]);
  return { goplusRaw, honeypotRaw };
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

function sanitizeMaxCandidates(value: number | undefined): number {
  return Math.max(1, Math.min(Number(value ?? DEFAULT_MAX_CANDIDATES), DEFAULT_MAX_CANDIDATES));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    const body = isSourcePolicyError(error)
      ? { source: "combined-scanner-poc", error: "source_policy_denied", decision: error.decision }
      : { source: "combined-scanner-poc", error: error instanceof Error ? error.message : String(error) };
    console.error(JSON.stringify(body, null, 2));
    process.exit(1);
  });
}
