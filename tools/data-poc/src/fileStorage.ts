import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { PersistableScannerOutput } from "./persistableScannerModel.js";

export type PersistableScannerFiles = {
  output_dir: string;
  files: string[];
};

export async function writePersistableScannerOutput(output: PersistableScannerOutput, baseOutputDir: string): Promise<PersistableScannerFiles> {
  const outputDir = resolve(baseOutputDir, output.scan_run.run_id);
  await mkdir(outputDir, { recursive: true });

  const files = [
    "scan_run.json",
    "candidates.jsonl",
    "security_checks.jsonl",
    "scorecards.jsonl",
    "full_output.json"
  ];

  await Promise.all([
    writeFile(resolve(outputDir, "scan_run.json"), `${JSON.stringify(output.scan_run, null, 2)}\n`, "utf8"),
    writeFile(resolve(outputDir, "candidates.jsonl"), toJsonl(output.candidates), "utf8"),
    writeFile(resolve(outputDir, "security_checks.jsonl"), toJsonl(output.security_checks), "utf8"),
    writeFile(resolve(outputDir, "scorecards.jsonl"), toJsonl(output.scorecards), "utf8"),
    writeFile(resolve(outputDir, "full_output.json"), `${JSON.stringify(output, null, 2)}\n`, "utf8")
  ]);

  return {
    output_dir: outputDir,
    files
  };
}

function toJsonl(rows: unknown[]): string {
  return rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length > 0 ? "\n" : "");
}
