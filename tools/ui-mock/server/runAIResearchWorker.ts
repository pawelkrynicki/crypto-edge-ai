import { AI_RESEARCH_TARGET_MODEL } from "../src/types/aiResearchTypes.js";

const enabled = process.env.CRYPTO_EDGE_AI_WORKER_ENABLED === "1";
const liveCallsAllowed = process.env.ALLOW_LIVE_PROVIDER_CALLS === "1";
const providerMode = process.env.CRYPTO_EDGE_AI_RESEARCH_PROVIDER?.trim().toUpperCase();
const model = process.env.CRYPTO_EDGE_AI_RESEARCH_MODEL?.trim();

if (!enabled || !liveCallsAllowed || providerMode !== "OPENAI" || model !== AI_RESEARCH_TARGET_MODEL) {
  console.error("AI_WORKER_DISABLED: require CRYPTO_EDGE_AI_WORKER_ENABLED=1, ALLOW_LIVE_PROVIDER_CALLS=1, provider OPENAI and model gpt-5-mini.");
  process.exitCode = 1;
} else {
  const { createAIResearchWorker } = await import("./aiResearchWorker.js");
  const worker = createAIResearchWorker();
  const intervalMs = boundedInterval(process.env.CRYPTO_EDGE_AI_WORKER_INTERVAL_MS);
  const once = process.argv.slice(2).includes("--once");
  if (process.argv.slice(2).some((value) => value !== "--once")) {
    console.error("AI_WORKER_ARGUMENT_INVALID");
    process.exitCode = 1;
  } else if (once) {
    console.log(JSON.stringify(await worker.runCycle()));
  } else {
    let stopping = false;
    const stop = () => { stopping = true; };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    while (!stopping) {
      console.log(JSON.stringify(await worker.runCycle()));
      await wait(intervalMs);
    }
  }
}

function boundedInterval(value: string | undefined): number {
  if (!value || !/^\d+$/.test(value.trim())) return 60_000;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 5_000 && parsed <= 60 * 60_000 ? parsed : 60_000;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
