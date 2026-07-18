import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildFilterCalibrationReport, type CalibrationCandidate } from "./filterCalibration.js";
import type { PersistableCandidate, PersistableScannerOutput } from "./persistableScannerModel.js";

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const snapshotPath = args.snapshot;
  if (!snapshotPath) throw new Error("FILTER_CALIBRATION_SNAPSHOT_REQUIRED");

  const absolutePath = resolve(process.cwd(), snapshotPath);
  const snapshot = parseSnapshot(await readFile(absolutePath, "utf8"));
  const report = buildFilterCalibrationReport(
    snapshot.candidates.map(toCalibrationCandidate),
    { snapshot_path: snapshotPath.replace(/\\/g, "/"), run_id: snapshot.scan_run.run_id },
  );
  console.log(JSON.stringify(report, null, 2));
}

function parseSnapshot(serialized: string): PersistableScannerOutput {
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    throw new Error("FILTER_CALIBRATION_SNAPSHOT_INVALID_JSON");
  }
  if (!isRecord(value) || !isRecord(value.scan_run) || !Array.isArray(value.candidates)) {
    throw new Error("FILTER_CALIBRATION_SNAPSHOT_SCHEMA_INVALID");
  }
  if (value.candidates.some((candidate) => !isCalibrationCandidate(candidate))) {
    throw new Error("FILTER_CALIBRATION_CANDIDATE_SCHEMA_INVALID");
  }
  return value as unknown as PersistableScannerOutput;
}

function toCalibrationCandidate(candidate: PersistableCandidate): CalibrationCandidate {
  return {
    candidate_id: candidate.candidate_id,
    symbol: candidate.symbol,
    name: candidate.name,
    chain: candidate.chain,
    contract_address: candidate.contract_address,
    pair_address: candidate.pair_address,
    dex: candidate.dex,
    source_url: candidate.source_url,
    price_usd: candidate.price_usd,
    market_cap_usd: candidate.market_cap_usd,
    fdv_usd: candidate.fdv_usd,
    liquidity_usd: candidate.liquidity_usd,
    volume_24h_usd: candidate.volume_24h_usd,
    volume_market_cap_ratio: candidate.volume_market_cap_ratio,
    pair_created_at: candidate.pair_created_at,
    pair_age_days: candidate.pair_age_days,
    status: candidate.basic_filter_status,
    filter_reasons: [...candidate.filter_reasons],
  };
}

function isCalibrationCandidate(value: unknown): value is PersistableCandidate {
  return isRecord(value)
    && typeof value.candidate_id === "string"
    && typeof value.symbol === "string"
    && typeof value.chain === "string"
    && Array.isArray(value.filter_reasons)
    && value.filter_reasons.every((reason) => typeof reason === "string");
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

main().catch((error: unknown) => {
  console.error(JSON.stringify({
    error: error instanceof Error ? error.message : "FILTER_CALIBRATION_FAILED",
  }));
  process.exit(1);
});
