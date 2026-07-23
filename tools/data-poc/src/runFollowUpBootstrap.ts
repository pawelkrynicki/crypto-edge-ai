import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateDisplayEligibleScannerSnapshot } from "./displaySnapshotValidator.js";
import {
  ingestScannerSnapshot,
  inspectFollowUpStore,
  loadEnabledEstablishedUniverse,
  updateFollowUpStore,
  type FollowUpStore,
} from "./followUpBasket.js";
import type { PersistableScannerOutput } from "./persistableScannerModel.js";

export type FollowUpBootstrapPlan = {
  mode: "dry-run" | "apply";
  provider_calls: 0;
  snapshot_published: false;
  store_changed: boolean;
  source_run_id: string;
  candidates_considered: number;
  entries_to_add: Array<{ entry_id: string; chain: string; contract_address: string }>;
  entries_to_update: Array<{ entry_id: string; chain: string; contract_address: string }>;
  entries_total_after: number;
};

const DEFAULT_OUTPUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../output");

export function planFollowUpBootstrap(
  current: FollowUpStore,
  snapshot: PersistableScannerOutput,
): { plan: FollowUpBootstrapPlan; next: FollowUpStore } {
  validateDisplayEligibleScannerSnapshot(snapshot);
  const universe = loadEnabledEstablishedUniverse();
  const next = ingestScannerSnapshot(current, snapshot, universe, "BOOTSTRAP");
  const currentIds = new Set(current.entries.map((entry) => entry.entry_id));
  const nextById = new Map(next.entries.map((entry) => [entry.entry_id, entry]));
  const entriesToAdd = next.entries
    .filter((entry) => !currentIds.has(entry.entry_id))
    .map(publicIdentity);
  const entriesToUpdate = current.entries
    .filter((entry) => nextById.has(entry.entry_id) && JSON.stringify(entry) !== JSON.stringify(nextById.get(entry.entry_id)))
    .map(publicIdentity);
  return {
    plan: {
      mode: "dry-run",
      provider_calls: 0,
      snapshot_published: false,
      store_changed: false,
      source_run_id: snapshot.scan_run.run_id,
      candidates_considered: snapshot.candidates.filter((candidate) => candidate.discovery_basket === "new_emerging").length,
      entries_to_add: entriesToAdd,
      entries_to_update: entriesToUpdate,
      entries_total_after: next.entries.length,
    },
    next,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const snapshotPath = args.snapshotPath ?? await findLatestSnapshot(DEFAULT_OUTPUT_DIR);
  const snapshot = JSON.parse(await readFile(snapshotPath, "utf8")) as PersistableScannerOutput;
  const diagnostics = await inspectFollowUpStore(args.storePath);
  if (!diagnostics.store_available) throw new Error(diagnostics.reason_code);
  const { plan } = planFollowUpBootstrap(diagnostics.store, snapshot);
  if (!args.apply) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }
  const applied = await updateFollowUpStore(
    (current) => ingestScannerSnapshot(current, snapshot, loadEnabledEstablishedUniverse(), "BOOTSTRAP"),
    { storePath: args.storePath, now: new Date(snapshot.scan_run.finished_at) },
  );
  console.log(JSON.stringify({ ...plan, mode: "apply", store_changed: true, entries_total_after: applied.entries.length }, null, 2));
}

async function findLatestSnapshot(outputDir: string): Promise<string> {
  const directories = await readdir(outputDir, { withFileTypes: true }).catch(() => []);
  const candidates = await Promise.all(directories
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("scan_"))
    .map(async (entry) => {
      const path = resolve(outputDir, entry.name, "full_output.json");
      const metadata = await stat(path).catch(() => null);
      return metadata?.isFile() ? { path, modified: metadata.mtimeMs } : null;
    }));
  const latest = candidates.filter((entry): entry is { path: string; modified: number } => entry !== null)
    .sort((left, right) => right.modified - left.modified)[0];
  if (!latest) throw new Error("FOLLOW_UP_BOOTSTRAP_SNAPSHOT_UNAVAILABLE");
  return latest.path;
}

function parseArgs(args: string[]): { apply: boolean; snapshotPath?: string; storePath?: string } {
  let apply = false;
  let snapshotPath: string | undefined;
  let storePath: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--apply") apply = true;
    else if (argument === "--snapshot" && args[index + 1]) snapshotPath = resolve(args[++index] as string);
    else if (argument === "--store" && args[index + 1]) storePath = resolve(args[++index] as string);
    else throw new Error("FOLLOW_UP_BOOTSTRAP_ARGUMENT_INVALID");
  }
  return { apply, ...(snapshotPath ? { snapshotPath } : {}), ...(storePath ? { storePath } : {}) };
}

function publicIdentity(entry: FollowUpStore["entries"][number]): { entry_id: string; chain: string; contract_address: string } {
  return { entry_id: entry.entry_id, chain: entry.chain, contract_address: entry.contract_address };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(JSON.stringify({ error: error instanceof Error ? error.message : "FOLLOW_UP_BOOTSTRAP_FAILED" }));
    process.exitCode = 1;
  });
}
