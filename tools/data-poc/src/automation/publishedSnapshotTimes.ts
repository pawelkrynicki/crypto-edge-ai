import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { AutomationState } from "./automationState.js";
import type { PublishedSnapshotTimes } from "./schedulerDecision.js";

const DEFAULT_OUTPUT_DIRECTORY = resolve(dirname(fileURLToPath(import.meta.url)), "../../output");

export async function readPublishedSnapshotTimes(
  state: AutomationState,
  outputDirectoryPath = DEFAULT_OUTPUT_DIRECTORY,
): Promise<PublishedSnapshotTimes> {
  const [scanner, context] = await Promise.all([
    readGeneratedAt(outputDirectoryPath, state.last_published_scanner_run_id, "full_output.json"),
    readContextTimes(outputDirectoryPath, state.last_published_context_run_id),
  ]);
  return {
    scanner_published_at: scanner,
    context_published_at: context.generated_at,
    alternative_me_published_at: context.alternative_me_fetched_at,
    defillama_published_at: context.defillama_fetched_at,
  };
}

async function readContextTimes(outputDirectoryPath: string, runId: string | null): Promise<{
  generated_at: string | null;
  alternative_me_fetched_at: string | null;
  defillama_fetched_at: string | null;
}> {
  const empty = { generated_at: null, alternative_me_fetched_at: null, defillama_fetched_at: null };
  if (!runId) return empty;
  try {
    const parsed = JSON.parse(await readFile(resolve(
      outputDirectoryPath,
      runId,
      "approved_sources_output.json",
    ), "utf8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return empty;
    const record = parsed as Record<string, unknown>;
    const sources = Array.isArray(record.sources) ? record.sources : [];
    const fetchedAt = (sourceId: string) => {
      const source = sources.find((candidate) => candidate && typeof candidate === "object"
        && !Array.isArray(candidate)
        && (candidate as Record<string, unknown>).source_id === sourceId) as Record<string, unknown> | undefined;
      return safeIso(source?.fetched_at);
    };
    return {
      generated_at: safeIso(record.generated_at),
      alternative_me_fetched_at: fetchedAt("alternative_me_fng"),
      defillama_fetched_at: fetchedAt("defillama_api"),
    };
  } catch {
    return empty;
  }
}

async function readGeneratedAt(
  outputDirectoryPath: string,
  runId: string | null,
  fileName: string,
): Promise<string | null> {
  if (!runId) return null;
  try {
    const parsed = JSON.parse(await readFile(resolve(outputDirectoryPath, runId, fileName), "utf8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    const provenance = record.provenance;
    const generatedAt = provenance && typeof provenance === "object" && !Array.isArray(provenance)
      ? (provenance as Record<string, unknown>).generated_at
      : record.generated_at;
    return typeof generatedAt === "string" && Number.isFinite(Date.parse(generatedAt)) ? generatedAt : null;
  } catch {
    return null;
  }
}

function safeIso(value: unknown): string | null {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
}
