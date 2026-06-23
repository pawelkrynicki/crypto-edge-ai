import { validateDefaultSourceRegistry } from "./sourceRegistryValidator.js";

async function main(): Promise<void> {
  const result = validateDefaultSourceRegistry();
  console.log(JSON.stringify({ source: "data-source-registry", ...result }, null, 2));
  if (!result.valid) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify({ source: "data-source-registry", valid: false, error: message }, null, 2));
  process.exit(1);
});
