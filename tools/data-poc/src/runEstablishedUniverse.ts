import {
  diffEstablishedUniverses,
  findUniverseVersion,
  mutateEstablishedUniverse,
  readEstablishedUniverseStore,
  type UniverseMutation,
} from "./establishedUniverseManager.js";
import { SUPPORTED_ESTABLISHED_CHAINS } from "./establishedAddressUniverse.js";

const COMMANDS = new Set(["list", "validate", "add", "update", "enable", "disable", "remove", "history", "diff"]);
const FLAG_OPTIONS = new Set(["apply", "json", "clear-display-name", "clear-symbol-hint", "clear-owner-note"]);
const VALUE_OPTIONS = new Set(["chain", "contract", "display-name", "symbol-hint", "owner-note", "enabled", "from", "to"]);

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv[0] === "--") argv.shift();
  const [command, ...rawArgs] = argv;
  if (!command || !COMMANDS.has(command)) throw new Error("UNIVERSE_COMMAND_INVALID");
  const args = parseArgs(rawArgs);
  assertAllowedOptions(command, args);
  const json = hasFlag(args, "json");
  const store = await readEstablishedUniverseStore();

  if (command === "list") {
    output({
      universe_version: store.current.universe_version,
      generated_at: store.current.generated_at,
      checksum: store.current.checksum,
      entries_total: store.current.entries.length,
      entries_enabled: store.current.entries.filter((entry) => entry.enabled).length,
      entries: store.current.entries,
    }, json);
    return;
  }

  if (command === "validate") {
    output({
      valid: true,
      validation_status: "valid",
      schema_version: store.current.schema_version,
      universe_version: store.current.universe_version,
      generated_at: store.current.generated_at,
      checksum: store.current.checksum,
      entries_total: store.current.entries.length,
      entries_enabled: store.current.entries.filter((entry) => entry.enabled).length,
      supported_chains: SUPPORTED_ESTABLISHED_CHAINS,
    }, json);
    return;
  }

  if (command === "history") {
    output({
      current_version: store.current.universe_version,
      versions: [store.current, ...store.history].map((universe, index) => ({
        universe_version: universe.universe_version,
        generated_at: universe.generated_at,
        checksum: universe.checksum,
        entries_total: universe.entries.length,
        entries_enabled: universe.entries.filter((entry) => entry.enabled).length,
        current: index === 0,
      })),
      audit_log: store.audit_log,
    }, json);
    return;
  }

  if (command === "diff") {
    const fromVersion = option(args, "from") ?? store.history[0]?.universe_version;
    const toVersion = option(args, "to") ?? store.current.universe_version;
    if (!fromVersion) throw new Error("ESTABLISHED_UNIVERSE_DIFF_BASE_REQUIRED");
    output(diffEstablishedUniverses(
      findUniverseVersion(store, fromVersion),
      findUniverseVersion(store, toVersion),
    ), json);
    return;
  }

  const mutation = buildMutation(command, args);
  const result = await mutateEstablishedUniverse(mutation, { apply: hasFlag(args, "apply") });
  output({
    ...result,
    mode: result.applied ? "applied" : "dry-run",
    message: result.applied
      ? "Universe updated atomically; history and audit entry were recorded."
      : "Plan only. No files, providers, snapshots, collector state, Cloudflare, VPS or Task Scheduler were changed.",
  }, json);
}

function buildMutation(command: string, args: Map<string, string | true>): UniverseMutation {
  const chain = requiredOption(args, "chain");
  const contract_address = requiredOption(args, "contract");
  if (command === "add") {
    const enabledValue = option(args, "enabled");
    if (enabledValue !== undefined && enabledValue !== "true" && enabledValue !== "false") {
      throw new Error("ENABLED_VALUE_INVALID");
    }
    return {
      operation: "add",
      chain,
      contract_address,
      ...(enabledValue !== undefined ? { enabled: enabledValue === "true" } : {}),
      ...(option(args, "display-name") ? { display_name: option(args, "display-name") } : {}),
      ...(option(args, "symbol-hint") ? { symbol_hint: option(args, "symbol-hint") } : {}),
      ...(option(args, "owner-note") ? { owner_note: option(args, "owner-note") } : {}),
    };
  }
  if (command === "update") {
    const changes: Extract<UniverseMutation, { operation: "update" }>["changes"] = {};
    assignUpdate(changes, "display_name", args, "display-name", "clear-display-name");
    assignUpdate(changes, "symbol_hint", args, "symbol-hint", "clear-symbol-hint");
    assignUpdate(changes, "owner_note", args, "owner-note", "clear-owner-note");
    if (Object.keys(changes).length === 0) throw new Error("UNIVERSE_UPDATE_FIELDS_REQUIRED");
    return { operation: "update", chain, contract_address, changes };
  }
  return { operation: command as "enable" | "disable" | "remove", chain, contract_address };
}

function assignUpdate(
  changes: Extract<UniverseMutation, { operation: "update" }>["changes"],
  field: "display_name" | "symbol_hint" | "owner_note",
  args: Map<string, string | true>,
  valueOption: string,
  clearOption: string,
): void {
  const value = option(args, valueOption);
  const clear = hasFlag(args, clearOption);
  if (value !== undefined && clear) throw new Error(`CONFLICTING_ARGUMENTS:${valueOption}`);
  if (value !== undefined) changes[field] = value;
  if (clear) changes[field] = null;
}

function parseArgs(args: string[]): Map<string, string | true> {
  const parsed = new Map<string, string | true>();
  for (let index = 0; index < args.length; index += 1) {
    const raw = args[index];
    if (!raw.startsWith("--")) throw new Error(`UNKNOWN_ARGUMENT:${raw}`);
    const name = raw.slice(2);
    if (parsed.has(name)) throw new Error(`DUPLICATE_ARGUMENT:${name}`);
    if (FLAG_OPTIONS.has(name)) {
      parsed.set(name, true);
      continue;
    }
    if (!VALUE_OPTIONS.has(name)) throw new Error(`UNKNOWN_ARGUMENT:${raw}`);
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`ARGUMENT_VALUE_REQUIRED:${name}`);
    parsed.set(name, value);
    index += 1;
  }
  return parsed;
}

function assertAllowedOptions(command: string, args: Map<string, string | true>): void {
  const common = new Set(["json"]);
  const allowed = command === "add"
    ? new Set([...common, "apply", "chain", "contract", "display-name", "symbol-hint", "owner-note", "enabled"])
    : command === "update"
      ? new Set([...common, "apply", "chain", "contract", "display-name", "symbol-hint", "owner-note", "clear-display-name", "clear-symbol-hint", "clear-owner-note"])
      : ["enable", "disable", "remove"].includes(command)
        ? new Set([...common, "apply", "chain", "contract"])
        : command === "diff"
          ? new Set([...common, "from", "to"])
          : common;
  for (const name of args.keys()) {
    if (!allowed.has(name)) throw new Error(`UNKNOWN_ARGUMENT:--${name}`);
  }
}

function requiredOption(args: Map<string, string | true>, name: string): string {
  const value = option(args, name);
  if (!value) throw new Error(`ARGUMENT_REQUIRED:${name}`);
  return value;
}

function option(args: Map<string, string | true>, name: string): string | undefined {
  const value = args.get(name);
  return typeof value === "string" ? value : undefined;
}

function hasFlag(args: Map<string, string | true>, name: string): boolean {
  return args.get(name) === true;
}

function output(value: unknown, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(value));
    return;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.operation === "string") {
    console.log(`${String(record.mode).toUpperCase()}: ${record.operation}`);
    console.log(`${record.from_version} -> ${record.to_version}`);
    console.log(`Identity: ${record.identity}`);
    console.log(`Entries: ${record.entries_total} total / ${record.entries_enabled} enabled`);
    console.log(String(record.message));
    return;
  }
  console.log(JSON.stringify(value, null, 2));
}

main().catch((error: unknown) => {
  console.error(JSON.stringify({ error: error instanceof Error ? error.message : "UNIVERSE_COMMAND_FAILED" }));
  process.exitCode = 1;
});
