import { getSourcePolicyDecision } from "./sourcePolicy.js";

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const sourceId = args.source;
  const action = args.action;

  if (!sourceId || !action) {
    throw new Error("Usage: npm run sources:check -- --source <source_id> --environment <environment> --action <action>");
  }

  const decision = getSourcePolicyDecision({
    sourceId,
    environment: args.environment,
    action
  });

  console.log(JSON.stringify({ source: "data-source-policy", decision }, null, 2));
  if (!decision.allowed) {
    process.exitCode = 1;
  }
}

function parseArgs(args: string[]): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = args[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = "true";
      continue;
    }
    parsed[key] = next;
    index += 1;
  }
  return parsed;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify({ source: "data-source-policy", error: message }, null, 2));
  process.exit(1);
});
