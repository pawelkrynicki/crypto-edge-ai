import type { HoneypotTokenResponse } from "./types.js";
import { assertSourceActionAllowed } from "./sourcePolicy.js";

const HONEYPOT_URL = "https://api.honeypot.is/v2/IsHoneypot";

const HONEYPOT_CHAIN_IDS: Record<string, string> = {
  eth: "1",
  ethereum: "1",
  bsc: "56",
  base: "8453",
  arbitrum: "42161",
  polygon: "137",
  avalanche: "43114"
};

export async function fetchHoneypotToken(
  chain: string,
  address: string,
  options: { environment?: string | null } = {}
): Promise<HoneypotTokenResponse | null> {
  assertSourceActionAllowed({
    sourceId: "honeypot_is",
    environment: options.environment,
    action: "live_fetch"
  });

  const chainId = toHoneypotChainId(chain);
  if (!chainId) {
    return null;
  }

  const url = new URL(HONEYPOT_URL);
  url.searchParams.set("address", address);
  url.searchParams.set("chainID", chainId);

  const response = await fetch(url, {
    headers: {
      accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`Honeypot.is request failed with HTTP ${response.status}`);
  }

  return (await response.json()) as HoneypotTokenResponse;
}

export function toHoneypotChainId(chain: string): string | null {
  const normalized = chain.toLowerCase();
  return HONEYPOT_CHAIN_IDS[normalized] ?? (/^\d+$/.test(chain) ? chain : null);
}
