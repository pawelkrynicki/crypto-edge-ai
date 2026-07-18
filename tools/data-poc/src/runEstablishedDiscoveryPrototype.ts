import { runEstablishedDiscoveryPrototype } from "./establishedDiscoveryPrototype.js";

async function main(): Promise<void> {
  if (process.argv.length > 2) throw new Error("ESTABLISHED_DISCOVERY_COMMAND_ARGUMENTS_NOT_ALLOWED");
  const result = await runEstablishedDiscoveryPrototype();
  console.log(JSON.stringify(result, null, 2));
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
