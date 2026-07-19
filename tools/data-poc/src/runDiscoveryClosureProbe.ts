import { BoundedHttpClient } from "./boundedHttpClient.js";
import { collectEstablishedAddressUniverse } from "./establishedAddressDiscovery.js";
import { loadEstablishedAddressUniverse } from "./establishedAddressUniverse.js";
import { fetchGoPlusSecurityResult, GOPLUS_ATTRIBUTION_PROVIDER } from "./goplusClient.js";
import { normalizeSecurity } from "./normalizeSecurity.js";

async function main(): Promise<void> {
  const file = requireFileArg(process.argv.slice(2));
  const universe = loadEstablishedAddressUniverse(file);
  const enabled = universe.entries.filter((entry) => entry.enabled);
  if (enabled.length !== 2) throw new Error("DISCOVERY_CLOSURE_PROBE_REQUIRES_TWO_ENABLED_ENTRIES");

  const dexscreener = new BoundedHttpClient({
    sourceId: "dexscreener",
    maxRequests: 4,
    maxRetries: 1,
    concurrency: 2,
  });
  const securityEntry = enabled[0];
  const goplus = new BoundedHttpClient({
    sourceId: "goplus_security",
    maxRequests: 2,
    maxRetries: 1,
    concurrency: 1,
  });
  const [discoveryAttempt, securityAttempt] = await Promise.allSettled([
    collectEstablishedAddressUniverse({
      env: process.env,
      universe,
      client: dexscreener,
    }),
    fetchGoPlusSecurityResult(
      securityEntry.chain,
      securityEntry.contract_address,
      { environment: "INTERNAL_BETA", client: goplus, apiToken: process.env.GOPLUS_API_TOKEN },
    ),
  ]);
  const discovery = discoveryAttempt.status === "fulfilled" ? discoveryAttempt.value : null;
  const securityResult = securityAttempt.status === "fulfilled" ? securityAttempt.value : null;
  const normalizedSecurity = normalizeSecurity({
    candidate: {
      symbol: discovery?.candidates.find((candidate) => (
        candidate.contract_address?.toLowerCase() === securityEntry.contract_address.toLowerCase()
      ))?.symbol ?? "TECHNICAL_PROBE",
      chain: securityEntry.chain,
      contract_address: securityEntry.contract_address,
    },
    goplusRaw: securityResult?.raw ?? null,
    honeypotRaw: null,
    mode: "live",
  });

  console.log(JSON.stringify({
    technical_probe_only: true,
    published: false,
    raw_payloads_stored: false,
    fixture_used: false,
    environment: "INTERNAL_BETA",
    discovery: discovery?.metadata ?? {
      status: "PROVIDER_FAILURE",
      reason_code: errorCode(discoveryAttempt.status === "rejected" ? discoveryAttempt.reason : null, "DEXSCREENER_PROBE_FAILED"),
    },
    candidates: discovery?.candidates ?? [],
    goplus_probe: {
      technical_probe_only: true,
      chain: securityEntry.chain,
      contract_address: securityEntry.contract_address,
      availability: securityResult?.availability ?? "unavailable",
      reason_code: securityResult?.reason_code
        ?? errorCode(securityAttempt.status === "rejected" ? securityAttempt.reason : null, "GOPLUS_PROBE_FAILED"),
      attribution: { provider: GOPLUS_ATTRIBUTION_PROVIDER },
      security: normalizedSecurity.security,
      decision: normalizedSecurity.decision,
    },
    request_counts: {
      dexscreener: dexscreener.getStats(),
      goplus_security: goplus.getStats(),
      honeypot_is: 0,
      alternative_me_fng: 0,
      defillama_api: 0,
    },
  }, null, 2));
  if (!discovery || !securityResult) process.exitCode = 1;
}

function requireFileArg(args: string[]): string {
  if (args.length !== 2 || args[0] !== "--file" || !args[1]) {
    throw new Error("DISCOVERY_CLOSURE_PROBE_FILE_REQUIRED");
  }
  return args[1];
}

function errorCode(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "code" in error) {
    return "sourceId" in error && typeof error.sourceId === "string"
      ? `${error.sourceId.toUpperCase()}_${String(error.code)}`
      : String(error.code);
  }
  return error instanceof Error ? error.message : fallback;
}

main().catch((error: unknown) => {
  const code = error && typeof error === "object" && "code" in error
    ? "sourceId" in error && typeof error.sourceId === "string"
      ? `${error.sourceId.toUpperCase()}_${String(error.code)}`
      : String(error.code)
    : error instanceof Error
      ? error.message
      : "DISCOVERY_CLOSURE_PROBE_FAILED";
  console.error(JSON.stringify({ error: code }));
  process.exit(1);
});
