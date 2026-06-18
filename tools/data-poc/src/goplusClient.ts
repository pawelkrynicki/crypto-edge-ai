import type { GoPlusTokenSecurityResponse } from "./types.js";

const GOPLUS_BASE_URL = "https://api.gopluslabs.io/api/v1/token_security";

const GOPLUS_CHAIN_IDS: Record<string, string> = {
  eth: "1",
  ethereum: "1",
  bsc: "56",
  base: "8453",
  arbitrum: "42161",
  polygon: "137",
  avalanche: "43114"
};

export async function fetchGoPlusTokenSecurity(chain: string, address: string): Promise<GoPlusTokenSecurityResponse | null> {
  const chainId = toGoPlusChainId(chain);
  if (!chainId) {
    return null;
  }

  const url = new URL(`${GOPLUS_BASE_URL}/${chainId}`);
  url.searchParams.set("contract_addresses", address);

  const response = await fetch(url, {
    headers: {
      accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`GoPlus request failed with HTTP ${response.status}`);
  }

  return (await response.json()) as GoPlusTokenSecurityResponse;
}

export function toGoPlusChainId(chain: string): string | null {
  const normalized = chain.toLowerCase();
  return GOPLUS_CHAIN_IDS[normalized] ?? (/^\d+$/.test(chain) ? chain : null);
}
