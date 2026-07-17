import { BoundedHttpClient } from "./boundedHttpClient.js";
import type { DexScreenerPair, DexScreenerSearchResponse, DexScreenerTokenProfile } from "./types.js";
import { assertSourceActionAllowed } from "./sourcePolicy.js";

const DEXSCREENER_SEARCH_URL = "https://api.dexscreener.com/latest/dex/search";
export const DEXSCREENER_TOKEN_PROFILES_URL = "https://api.dexscreener.com/token-profiles/latest/v1";
export const DEXSCREENER_TOKEN_PAIRS_BASE_URL = "https://api.dexscreener.com/token-pairs/v1";

export type DexScreenerClientOptions = {
  environment?: string | null;
  client?: BoundedHttpClient;
};

export async function searchDexScreenerPairs(
  query: string,
  options: DexScreenerClientOptions = {}
): Promise<DexScreenerPair[]> {
  assertSourceActionAllowed({
    sourceId: "dexscreener",
    environment: options.environment,
    action: "live_fetch"
  });

  const url = new URL(DEXSCREENER_SEARCH_URL);
  url.searchParams.set("q", query);

  const client = options.client ?? new BoundedHttpClient({ sourceId: "dexscreener", maxRequests: 2 });
  const payload = await client.requestJson<DexScreenerSearchResponse>(url);
  return Array.isArray(payload.pairs) ? payload.pairs : [];
}

export async function fetchLatestDexScreenerTokenProfiles(
  options: DexScreenerClientOptions = {},
): Promise<DexScreenerTokenProfile[]> {
  assertDexScreenerFetchAllowed(options.environment);
  const client = options.client ?? new BoundedHttpClient({ sourceId: "dexscreener", maxRequests: 2 });
  const payload = await client.requestJson<unknown>(DEXSCREENER_TOKEN_PROFILES_URL);
  return Array.isArray(payload) ? payload as DexScreenerTokenProfile[] : [];
}

export async function fetchDexScreenerTokenPairs(
  chainId: string,
  tokenAddress: string,
  options: DexScreenerClientOptions = {},
): Promise<DexScreenerPair[]> {
  assertDexScreenerFetchAllowed(options.environment);
  const client = options.client ?? new BoundedHttpClient({ sourceId: "dexscreener", maxRequests: 2 });
  const url = `${DEXSCREENER_TOKEN_PAIRS_BASE_URL}/${encodeURIComponent(chainId)}/${encodeURIComponent(tokenAddress)}`;
  const payload = await client.requestJson<unknown>(url);
  return Array.isArray(payload) ? payload as DexScreenerPair[] : [];
}

function assertDexScreenerFetchAllowed(environment?: string | null): void {
  assertSourceActionAllowed({
    sourceId: "dexscreener",
    environment,
    action: "live_fetch",
  });
}
