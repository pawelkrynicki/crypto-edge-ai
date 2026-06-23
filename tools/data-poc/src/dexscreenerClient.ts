import type { DexScreenerPair, DexScreenerSearchResponse } from "./types.js";
import { assertSourceActionAllowed } from "./sourcePolicy.js";

const DEXSCREENER_SEARCH_URL = "https://api.dexscreener.com/latest/dex/search";

export async function searchDexScreenerPairs(
  query: string,
  options: { environment?: string | null } = {}
): Promise<DexScreenerPair[]> {
  assertSourceActionAllowed({
    sourceId: "dexscreener",
    environment: options.environment,
    action: "live_fetch"
  });

  const url = new URL(DEXSCREENER_SEARCH_URL);
  url.searchParams.set("q", query);

  const response = await fetch(url, {
    headers: {
      accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`DexScreener request failed with HTTP ${response.status}`);
  }

  const payload = (await response.json()) as DexScreenerSearchResponse;
  return Array.isArray(payload.pairs) ? payload.pairs : [];
}
