import { runDiscoveryDiagnostic } from "./discoveryDiagnostic.js";

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const result = await runDiscoveryDiagnostic({
    seedLimit: toOptionalNumber(args["seed-limit"]),
  });
  console.log(JSON.stringify(result, null, 2));
}

function parseArgs(args: string[]): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) continue;
    const value = args[index + 1];
    if (value && !value.startsWith("--")) {
      parsed[arg.slice(2)] = value;
      index += 1;
    }
  }
  return parsed;
}

function toOptionalNumber(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

main().catch((error: unknown) => {
  const code = error && typeof error === "object" && "code" in error
    ? "sourceId" in error && typeof error.sourceId === "string"
      ? `${error.sourceId.toUpperCase()}_${String(error.code)}`
      : String(error.code)
    : error instanceof Error
      ? error.message
      : "DISCOVERY_DIAGNOSTIC_FAILED";
  console.error(JSON.stringify({ error: code }));
  process.exit(1);
});
