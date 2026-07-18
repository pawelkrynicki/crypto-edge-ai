import { runEstablishedDiscoveryPrototype } from "./establishedDiscoveryPrototype.js";

async function main(): Promise<void> {
  const queries = parseQueries(process.argv.slice(2));
  const result = await runEstablishedDiscoveryPrototype({ queries });
  console.log(JSON.stringify(result, null, 2));
}

function parseQueries(args: string[]): string[] {
  const queries: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== "--query") continue;
    const value = args[index + 1];
    if (value && !value.startsWith("--")) {
      queries.push(value);
      index += 1;
    }
  }
  return queries;
}

main().catch((error: unknown) => {
  const code = error && typeof error === "object" && "code" in error
    ? "sourceId" in error && typeof error.sourceId === "string"
      ? `${error.sourceId.toUpperCase()}_${String(error.code)}`
      : String(error.code)
    : error instanceof Error
      ? error.message
      : "ESTABLISHED_DISCOVERY_PROTOTYPE_FAILED";
  console.error(JSON.stringify({ error: code }));
  process.exit(1);
});
