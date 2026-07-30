import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

export type ReportPublishFaultPoint = "after_temporary_write" | "after_markdown_publish";

export type AtomicReportPublishInput = {
  jsonPath: string;
  markdownPath: string;
  json: unknown;
  markdown: string;
  faultAt?: ReportPublishFaultPoint;
};

export type AtomicReportPublishResult = {
  jsonPath: string;
  markdownPath: string;
  created: boolean;
};

export class AtomicReportPublishError extends Error {
  readonly code: "REPORT_IDEMPOTENCY_CONFLICT" | "REPORT_WRITE_FAILED";

  constructor(code: AtomicReportPublishError["code"], cause?: unknown) {
    super(code, cause === undefined ? undefined : { cause });
    this.name = "AtomicReportPublishError";
    this.code = code;
  }
}

export async function publishReportAtomically(
  input: AtomicReportPublishInput,
): Promise<AtomicReportPublishResult> {
  const jsonPath = resolve(input.jsonPath);
  const markdownPath = resolve(input.markdownPath);
  if (dirname(jsonPath) !== dirname(markdownPath)
    || !/^analyst-report-[A-Za-z0-9_-]+\.json$/.test(basename(jsonPath))
    || basename(markdownPath) !== `${basename(jsonPath, ".json")}.md`) {
    throw new AtomicReportPublishError("REPORT_WRITE_FAILED");
  }

  const json = `${JSON.stringify(input.json, null, 2)}\n`;
  JSON.parse(json);
  const markdown = input.markdown.endsWith("\n") ? input.markdown : `${input.markdown}\n`;
  const existingJson = await readFile(jsonPath, "utf8").catch(() => null);
  const existingMarkdown = await readFile(markdownPath, "utf8").catch(() => null);
  if ((existingJson !== null && existingJson !== json)
    || (existingMarkdown !== null && existingMarkdown !== markdown)) {
    throw new AtomicReportPublishError("REPORT_IDEMPOTENCY_CONFLICT");
  }
  if (existingJson === json && existingMarkdown === markdown) {
    return { jsonPath, markdownPath, created: false };
  }

  await mkdir(dirname(jsonPath), { recursive: true });
  const nonce = randomUUID();
  const temporaryJson = resolve(dirname(jsonPath), `.${basename(jsonPath)}.${nonce}.tmp`);
  const temporaryMarkdown = resolve(dirname(markdownPath), `.${basename(markdownPath)}.${nonce}.tmp`);
  try {
    if (existingMarkdown === null) await writeDurableExclusive(temporaryMarkdown, markdown);
    if (existingJson === null) await writeDurableExclusive(temporaryJson, json);
    if (input.faultAt === "after_temporary_write") throw new Error("INJECTED_REPORT_WRITE_FAILURE");

    if (existingMarkdown === null) await rename(temporaryMarkdown, markdownPath);
    if (input.faultAt === "after_markdown_publish") throw new Error("INJECTED_REPORT_WRITE_FAILURE");

    // JSON is the library-visible artifact and is deliberately committed last.
    if (existingJson === null) await rename(temporaryJson, jsonPath);
    return { jsonPath, markdownPath, created: existingJson === null };
  } catch (error) {
    await Promise.all([
      rm(temporaryJson, { force: true }).catch(() => undefined),
      rm(temporaryMarkdown, { force: true }).catch(() => undefined),
    ]);
    if (error instanceof AtomicReportPublishError) throw error;
    throw new AtomicReportPublishError("REPORT_WRITE_FAILED", error);
  }
}

async function writeDurableExclusive(path: string, body: string): Promise<void> {
  const handle = await open(path, "wx");
  try {
    await handle.writeFile(body, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}
