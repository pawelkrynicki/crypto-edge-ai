import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export function getDefaultAutomationDirectory(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.CRYPTO_EDGE_AUTOMATION_DIRECTORY_PATH?.trim();
  if (configured) return resolve(configured);
  const modulePath = fileURLToPath(import.meta.url);
  const marker = `${sep}tools${sep}data-poc${sep}`;
  const markerIndex = modulePath.toLowerCase().indexOf(marker.toLowerCase());
  if (markerIndex >= 0) {
    const dataPocRoot = modulePath.slice(0, markerIndex + marker.length - 1);
    return resolve(dataPocRoot, ".local", "automation");
  }
  return resolve(dirname(modulePath), "..", "..", ".local", "automation");
}
