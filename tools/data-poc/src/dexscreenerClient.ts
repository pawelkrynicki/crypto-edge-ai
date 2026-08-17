import { BoundedHttpClient } from "./boundedHttpClient.js";
import type { DexScreenerPair, DexScreenerSearchResponse, DexScreenerTokenProfile } from "./types.js";
import { assertSourceActionAllowed } from "./sourcePolicy.js";

export const DEXSCREENER_SEARCH_URL = "https://api.dexscreener.com/latest/dex/search";
export const DEXSCREENER_TOKEN_PROFILES_URL = "https://api.dexscreener.com/token-profiles/latest/v1";
export const DEXSCREENER_TOKEN_PAIRS_BASE_URL = "https://api.dexscreener.com/token-pairs/v1";
export const DEXSCREENER_TOKENS_BASE_URL = "https://api.dexscreener.com/tokens/v1";
export const MAX_DEXSCREENER_TOKEN_ADDRESSES_PER_BATCH = 30;

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

/**
 * Fetches up to thirty configured token addresses on one chain.  Callers must
 * still bind each returned pair back to its requested chain + contract; the
 * provider response is not an identity assertion.
 */
export async function fetchDexScreenerTokenBatch(
  chainId: string,
  tokenAddresses: readonly string[],
  options: DexScreenerClientOptions = {},
): Promise<DexScreenerPair[]> {
  assertDexScreenerFetchAllowed(options.environment);
  const addresses = [...new Set(tokenAddresses.map((address) => address.trim()).filter(Boolean))];
  if (!chainId.trim() || addresses.length === 0 || addresses.length > MAX_DEXSCREENER_TOKEN_ADDRESSES_PER_BATCH) {
    throw new Error("DEXSCREENER_TOKEN_BATCH_INVALID");
  }
  const client = options.client ?? new BoundedHttpClient({ sourceId: "dexscreener", maxRequests: 2 });
  const url = `${DEXSCREENER_TOKENS_BASE_URL}/${encodeURIComponent(chainId)}/${addresses.map(encodeURIComponent).join(",")}`;
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
