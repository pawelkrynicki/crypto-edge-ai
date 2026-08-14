import { resolve } from "node:path";
import { getDataPocRuntimeRoot } from "../dataPocRuntimeRoot.js";

export function getDefaultAutomationDirectory(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.CRYPTO_EDGE_AUTOMATION_DIRECTORY_PATH?.trim();
  if (configured) return resolve(configured);
  return resolve(getDataPocRuntimeRoot(env), ".local", "automation");
}
