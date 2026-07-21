export type CollectorEnvironment = {
  CRYPTO_EDGE_DATA_ENV?: string;
  CRYPTO_EDGE_RUNTIME_MODE?: string;
  ALLOW_LIVE_PROVIDER_CALLS?: string;
};

export function assertInternalBetaCollectorEnvironment(env: CollectorEnvironment): void {
  if (env.CRYPTO_EDGE_DATA_ENV !== "INTERNAL_BETA") {
    throw new Error("COLLECTOR_DATA_ENV_INVALID");
  }
  if (env.CRYPTO_EDGE_RUNTIME_MODE !== "INTERNAL_BETA") {
    throw new Error("COLLECTOR_RUNTIME_MODE_INVALID");
  }
  if (env.ALLOW_LIVE_PROVIDER_CALLS !== "1") {
    throw new Error("LIVE_PROVIDER_CALLS_NOT_ALLOWED");
  }
}
