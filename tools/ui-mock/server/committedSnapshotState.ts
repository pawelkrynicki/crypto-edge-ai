import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export type CommittedSnapshotState = {
  scanner_run_id: string | null;
  context_run_id: string | null;
};

export async function readCommittedSnapshotState(
  statePath = getDefaultCommittedStatePath(),
): Promise<CommittedSnapshotState> {
  const parsed = JSON.parse(await readFile(statePath, "utf8")) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("AUTOMATION_STATE_INVALID");
  const state = parsed as Record<string, unknown>;
  if (state.schema_version !== "central_automation_state_v1") throw new Error("AUTOMATION_STATE_INVALID");
  return {
    scanner_run_id: nullableRunId(state.last_published_scanner_run_id),
    context_run_id: nullableRunId(state.last_published_context_run_id),
  };
}

export function getDefaultCommittedStatePath(): string {
  const modulePath = fileURLToPath(import.meta.url);
  const marker = `${sep}tools${sep}ui-mock${sep}`;
  const index = modulePath.toLowerCase().indexOf(marker.toLowerCase());
  if (index < 0) throw new Error("AUTOMATION_STATE_PATH_UNAVAILABLE");
  return resolve(
    modulePath.slice(0, index),
    "tools",
    "data-poc",
    ".local",
    "automation",
    "automation-state.json",
  );
}

function nullableRunId(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)) return value;
  throw new Error("AUTOMATION_STATE_INVALID");
}
