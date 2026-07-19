import { loadEstablishedAddressUniverse } from "./establishedAddressUniverse.js";

function main(): void {
  const command = process.argv[2];
  if (!command || process.argv.length !== 3 || !["validate", "list"].includes(command)) {
    throw new Error("UNIVERSE_COMMAND_INVALID");
  }
  const universe = loadEstablishedAddressUniverse();
  if (command === "validate") {
    console.log(JSON.stringify({
      valid: true,
      universe_version: universe.universe_version,
      production_enabled: universe.production_enabled,
      entries_total: universe.entries.length,
      entries_enabled: universe.entries.filter((entry) => entry.enabled).length,
    }, null, 2));
    return;
  }
  console.log(JSON.stringify({
    universe_version: universe.universe_version,
    status: universe.status,
    entries: universe.entries.map((entry, universe_entry_index) => ({
      universe_entry_index,
      chain: entry.chain,
      contract_address: entry.contract_address,
      enabled: entry.enabled,
      ...(entry.display_label ? { display_label: entry.display_label } : {}),
      added_at: entry.added_at,
      added_by: entry.added_by,
      ...(entry.notes ? { notes: entry.notes } : {}),
    })),
  }, null, 2));
}

try {
  main();
} catch (error: unknown) {
  console.error(JSON.stringify({ error: error instanceof Error ? error.message : "UNIVERSE_COMMAND_FAILED" }));
  process.exit(1);
}
