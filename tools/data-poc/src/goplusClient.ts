import { BoundedHttpClient, BoundedHttpError } from "./boundedHttpClient.js";
import type { GoPlusTokenSecurityResponse } from "./types.js";
import { assertSourceActionAllowed } from "./sourcePolicy.js";

const GOPLUS_BASE_URL = "https://api.gopluslabs.io/api/v1/token_security";
export const GOPLUS_SOLANA_URL = "https://api.gopluslabs.io/api/v1/solana/token_security";
export const GOPLUS_ATTRIBUTION_PROVIDER = "GoPlus Security";

const GOPLUS_CHAIN_IDS: Record<string, string> = {
  eth: "1",
  ethereum: "1",
  bsc: "56",
  base: "8453",
  arbitrum: "42161",
  polygon: "137",
  avalanche: "43114"
};

export type GoPlusSecurityAvailability = "available" | "unavailable";

export type GoPlusSecurityResult = {
  raw: GoPlusTokenSecurityResponse | null;
  availability: GoPlusSecurityAvailability;
  reason_code: string | null;
  request_invoked: boolean;
  attribution: { provider: typeof GOPLUS_ATTRIBUTION_PROVIDER };
};

export type GoPlusClientOptions = {
  environment?: string | null;
  client?: BoundedHttpClient;
  apiToken?: string;
};

export async function fetchGoPlusTokenSecurity(
  chain: string,
  address: string,
  options: GoPlusClientOptions = {}
): Promise<GoPlusTokenSecurityResponse | null> {
  return (await fetchGoPlusSecurityResult(chain, address, options)).raw;
}

export async function fetchGoPlusSecurityResult(
  chain: string,
  address: string,
  options: GoPlusClientOptions = {},
): Promise<GoPlusSecurityResult> {
  assertSourceActionAllowed({
    sourceId: "goplus_security",
    environment: options.environment,
    action: "live_fetch"
  });

  const normalizedChain = chain.toLowerCase();
  const isSolana = normalizedChain === "solana" || normalizedChain === "sol";
  const chainId = toGoPlusChainId(chain);
  if (!chainId && !isSolana) {
    return unavailable("GOPLUS_UNSUPPORTED_CHAIN", false);
  }

  const apiToken = options.apiToken ?? process.env.GOPLUS_API_TOKEN;
  if (isSolana && !apiToken) {
    return unavailable("GOPLUS_AUTH_TOKEN_MISSING", false);
  }

  const url = new URL(isSolana ? GOPLUS_SOLANA_URL : `${GOPLUS_BASE_URL}/${chainId}`);
  url.searchParams.set("contract_addresses", address);
  const client = options.client ?? new BoundedHttpClient({ sourceId: "goplus_security", maxRequests: 2 });

  try {
    const raw = await client.requestJson<GoPlusTokenSecurityResponse>(url, {
      headers: isSolana && apiToken ? { authorization: `Bearer ${apiToken}` } : undefined,
    });
    const responseError = validateGoPlusResponse(raw, address);
    if (responseError) {
      return unavailable(responseError, true);
    }
    return {
      raw,
      availability: "available",
      reason_code: null,
      request_invoked: true,
      attribution: { provider: GOPLUS_ATTRIBUTION_PROVIDER },
    };
  } catch (error: unknown) {
    if (error instanceof BoundedHttpError && (error.status === 401 || error.status === 403)) {
      return unavailable("GOPLUS_AUTH_DENIED", true);
    }
    if (error instanceof BoundedHttpError) {
      return unavailable(`GOPLUS_${error.code}`, true);
    }
    return unavailable("GOPLUS_REQUEST_FAILED", true);
  }
}

export function toGoPlusChainId(chain: string): string | null {
  const normalized = chain.toLowerCase();
  return GOPLUS_CHAIN_IDS[normalized] ?? null;
}

function unavailable(reasonCode: string, requestInvoked: boolean): GoPlusSecurityResult {
  return {
    raw: null,
    availability: "unavailable",
    reason_code: reasonCode,
    request_invoked: requestInvoked,
    attribution: { provider: GOPLUS_ATTRIBUTION_PROVIDER },
  };
}

function validateGoPlusResponse(raw: GoPlusTokenSecurityResponse, address: string): string | null {
  const code = raw.code;
  if (code !== undefined && code !== 1 && code !== "1") {
    return "GOPLUS_PROVIDER_ERROR";
  }

  if (!isRecord(raw.result)) return "GOPLUS_RESULT_UNAVAILABLE";
  const normalizedAddress = address.toLowerCase();
  const token = Object.entries(raw.result).find(([key]) => key.toLowerCase() === normalizedAddress)?.[1];
  if (!isRecord(token) || Object.keys(token).length === 0) {
    return "GOPLUS_RESULT_UNAVAILABLE";
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
