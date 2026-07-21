import { runCentralAutomation } from "./centralAutomationCoordinator.js";

async function main(): Promise<void> {
  assertExplicitLiveAutomationOptIn(process.env);

  const { runInternalBetaCollector } = await import("../internalBetaCollector.js");
  const coordinated = await runCentralAutomation({
    runner: async () => {
      const result = await runInternalBetaCollector();
      return {
        request_counts: result.request_counts,
        scanner_run_id: result.run_id,
        context_run_id: result.context_run_id,
      };
    },
  });

  console.log(JSON.stringify(coordinated, null, 2));
  if (coordinated.status === "FAILED") process.exitCode = 1;
}

export function assertExplicitLiveAutomationOptIn(env: NodeJS.ProcessEnv): void {
  if (env.CRYPTO_EDGE_AUTOMATION_ENABLED !== "1" || env.ALLOW_LIVE_PROVIDER_CALLS !== "1") {
    throw new Error("LIVE_AUTOMATION_DOUBLE_OPT_IN_REQUIRED");
  }
}

main().catch((error: unknown) => {
  const code = error && typeof error === "object" && "code" in error
    ? String(error.code)
    : error instanceof Error
      ? error.message
      : "CENTRAL_AUTOMATION_FAILED";
  console.error(JSON.stringify({ error: code }));
  process.exitCode = 1;
});
