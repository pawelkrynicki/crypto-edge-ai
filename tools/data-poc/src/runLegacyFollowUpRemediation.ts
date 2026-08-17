import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { getDataPocRuntimeRoot } from "./dataPocRuntimeRoot.js";
import { applyLegacyFollowUpRemediation } from "./legacyFollowUpRemediation.js";

function defaultRemediationId(now = new Date()): string {
  const timestamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return `legacy_followup_remediation_${timestamp}_${randomUUID().replaceAll("-", "").slice(0, 8)}`;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const idIndex = args.indexOf("--remediation-id");
  const remediationId = idIndex >= 0 ? args[idIndex + 1] : defaultRemediationId();
  if (!apply || !remediationId || args.some((arg, index) => arg !== "--apply" && arg !== "--remediation-id" && index !== idIndex + 1)) {
    throw new Error("LEGACY_REMEDIATION_USAGE: --apply [--remediation-id <stable-id>]");
  }
  const root = getDataPocRuntimeRoot();
  const result = await applyLegacyFollowUpRemediation({
    remediationId,
    manifestPath: resolve(root, ".local", "diagnostics", "disc2a-population-manifest.json"),
    revalidationPath: resolve(root, ".local", "diagnostics", "disc2a-revalidation.json"),
  });
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1]?.endsWith("runLegacyFollowUpRemediation.js")) {
  main().catch((error: unknown) => {
    console.error(JSON.stringify({ error: error instanceof Error ? error.message : "LEGACY_REMEDIATION_FAILED" }));
    process.exitCode = 1;
  });
}
