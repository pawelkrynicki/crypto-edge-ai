import { constants } from "node:fs";
import { access, mkdir, rename, rm, rmdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";

export type AtomicPublishOptions<T> = {
  output: T;
  baseOutputDir: string;
  runId: string;
  fileName: string;
  validate: (output: T) => void;
};

export type AtomicPublishResult = {
  output_dir: string;
  output_file: string;
};

export class AtomicPublishError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "AtomicPublishError";
    this.code = code;
  }
}

export async function publishAtomicJson<T>(options: AtomicPublishOptions<T>): Promise<AtomicPublishResult> {
  options.validate(options.output);
  await mkdir(options.baseOutputDir, { recursive: true });

  const outputDir = resolve(options.baseOutputDir, options.runId);
  const outputFile = resolve(outputDir, options.fileName);
  const temporaryFile = resolve(outputDir, `.${options.fileName}.${randomUUID()}.tmp`);

  if (await pathExists(outputDir)) throw new AtomicPublishError("RUN_ID_COLLISION");
  await mkdir(outputDir);

  try {
    await writeFile(temporaryFile, `${JSON.stringify(options.output, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    if (await pathExists(outputFile)) throw new AtomicPublishError("RUN_ID_COLLISION");
    await rename(temporaryFile, outputFile);
    return { output_dir: outputDir, output_file: outputFile };
  } catch (error: unknown) {
    await rm(temporaryFile, { force: true });
    await rmdir(outputDir).catch(() => undefined);
    throw error;
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
