import assert from "node:assert/strict";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { basename, dirname, extname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createScannerApiServer } from "../server/scannerApiServer.js";
import { mapPersistableScannerOutputToUiCandidates } from "../src/adapters/scannerOutputAdapter";
import {
  buildAnalystReportData,
  renderAnalystReportMarkdown,
  type AnalystReportData,
  type AnalystReportReviewDiagnostics,
  type AnalystReportReviewSourceMeta,
} from "../src/services/analystReport";
import { interpretContextApiOutput, parseMarketContextApiOutput } from "../src/services/contextDataSource";
import { interpretScannerApiOutput } from "../src/services/scannerDataSource";
import { validateReviewSessionState } from "../src/services/reviewSessionValidation";
import type { ReviewSessionState } from "../src/types/reviewSessionTypes";
import type { ScannerApiOutput, UiTokenCandidate } from "../src/types/scannerTypes";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const uiMockRoot = resolve(scriptDir, "..");
const localDir = resolve(uiMockRoot, ".local");
const reportsDir = resolve(localDir, "reports");
const smokeReportsDir = resolve(localDir, "reports-smoke");
const smokeReviewStorageFile = resolve(localDir, "analyst-report-smoke-review-session.json");
const smokeNote = "Analyst report smoke note";

const args = process.argv.slice(2);
const smoke = args.includes("--smoke");

try {
  assertValidArgs(args);
  await generateAnalystReport({ smoke });
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

async function generateAnalystReport(options: { smoke: boolean }): Promise<void> {
  await mkdir(localDir, { recursive: true });

  const outputDir = options.smoke ? smokeReportsDir : reportsDir;
  const previousReviewProvider = process.env.CRYPTO_EDGE_REVIEW_STORAGE_PROVIDER;
  const previousReviewSqlitePath = process.env.CRYPTO_EDGE_REVIEW_SQLITE_PATH;
  let generatedPaths: ReportOutputPaths | null = null;

  if (options.smoke) {
    await mkdir(smokeReportsDir, { recursive: true });
    await removeSmokeReports();
    await removeSmokeReviewStorageFile(smokeReviewStorageFile);
    delete process.env.CRYPTO_EDGE_REVIEW_STORAGE_PROVIDER;
    delete process.env.CRYPTO_EDGE_REVIEW_SQLITE_PATH;
  }

  const server = createScannerApiServer(options.smoke
    ? {
        runtimeMode: "DEVELOPMENT_DEMO",
        reviewSession: {
          storageFilePath: smokeReviewStorageFile,
        },
      }
    : { runtimeMode: "DEVELOPMENT_DEMO" });

  try {
    await listen(server);
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const scannerLatest = await getJson(`${baseUrl}/api/scanner/latest`) as ScannerApiOutput;
    const scannerResult = interpretScannerApiOutput(scannerLatest);
    const scannerOutput = scannerResult.output;
    const uiCandidates = mapPersistableScannerOutputToUiCandidates(scannerOutput);

    const contextLatest = parseMarketContextApiOutput(await getJson(`${baseUrl}/api/context/latest`));
    const contextResult = interpretContextApiOutput(contextLatest);
    assert.equal(contextResult.status, "ready");

    if (options.smoke) {
      assert.ok(uiCandidates.length > 0, "analyst report smoke requires at least one scanner candidate");
      const smokeReviewCandidate = chooseSmokeReviewCandidate(uiCandidates);
      const smokeReviewState = buildSmokeReviewState(smokeReviewCandidate.id);
      const putResponse = await requestJson(`${baseUrl}/api/review-session`, {
        method: "PUT",
        body: smokeReviewState,
      });
      assert.equal(putResponse.statusCode, 200, "smoke review session PUT must succeed");
    }

    const reviewSessionResponse = await getJson(`${baseUrl}/api/review-session`);
    const reviewSession = parseReviewSessionApiResponse(reviewSessionResponse);
    const reviewDiagnostics = parseReviewDiagnosticsResponse(
      await getJson(`${baseUrl}/api/review-session/diagnostics`),
    );

    const report = buildAnalystReportData({
      generatedAt: new Date().toISOString(),
      scannerOutput,
      uiCandidates,
      scannerSourceMeta: scannerLatest._source_meta ?? null,
      contextOutput: contextLatest,
      reviewSession,
      reviewSourceMeta: parseReviewSourceMeta(reviewSessionResponse),
      reviewDiagnostics,
    });
    const markdown = renderAnalystReportMarkdown(report);

    generatedPaths = buildReportOutputPaths(outputDir, createTimestampSlug(report.generated_at));
    await writeReportFiles(generatedPaths, report, markdown, outputDir);

    console.log(`Markdown report: ${generatedPaths.markdownPath}`);
    console.log(`JSON report: ${generatedPaths.jsonPath}`);
    console.log(`Candidates: ${report.candidates_count}`);
    console.log(`Review entries: ${report.review_entries_count}`);
    console.log(`Scanner source: ${scannerResult.resolvedSource}`);
    console.log(`Context source: ${contextResult.resolvedSource}`);
    console.log("ANALYST REPORT GENERATED");

    if (options.smoke) {
      await assertSmokeReport(generatedPaths, outputDir);
      console.log("ANALYST REPORT SMOKE OK");
    }
  } finally {
    await close(server);

    if (options.smoke) {
      restoreOptionalEnv("CRYPTO_EDGE_REVIEW_STORAGE_PROVIDER", previousReviewProvider);
      restoreOptionalEnv("CRYPTO_EDGE_REVIEW_SQLITE_PATH", previousReviewSqlitePath);
      if (generatedPaths) {
        await removeSmokeReportFile(generatedPaths.markdownPath);
        await removeSmokeReportFile(generatedPaths.jsonPath);
      }
      await removeSmokeReviewStorageFile(smokeReviewStorageFile);
    }
  }
}

async function writeReportFiles(
  paths: ReportOutputPaths,
  report: AnalystReportData,
  markdown: string,
  outputDir: string,
): Promise<void> {
  await mkdir(outputDir, { recursive: true });
  assertReportOutputPath(paths.markdownPath, outputDir);
  assertReportOutputPath(paths.jsonPath, outputDir);
  await writeFile(paths.markdownPath, markdown, "utf8");
  await writeFile(paths.jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function buildReportOutputPaths(outputDir: string, timestampSlug: string): ReportOutputPaths {
  const paths = {
    markdownPath: resolve(outputDir, `analyst-report-${timestampSlug}.md`),
    jsonPath: resolve(outputDir, `analyst-report-${timestampSlug}.json`),
  };

  assertReportOutputPath(paths.markdownPath, outputDir);
  assertReportOutputPath(paths.jsonPath, outputDir);

  return paths;
}

function assertReportOutputPath(filePath: string, outputDir: string): void {
  const resolvedFile = resolve(filePath);
  const resolvedOutputDir = resolve(outputDir);
  const pathFromOutputDir = relative(resolvedOutputDir, resolvedFile);
  const isUnderOutputDir = pathFromOutputDir.length > 0
    && !pathFromOutputDir.startsWith("..")
    && !isAbsolute(pathFromOutputDir);
  const fileName = basename(resolvedFile);
  const extension = extname(resolvedFile);

  if (!isUnderOutputDir || !fileName.includes("analyst-report") || ![".md", ".json"].includes(extension)) {
    throw new Error(`Refusing to write analyst report outside the reports directory: ${resolvedFile}`);
  }
}

async function assertSmokeReport(paths: ReportOutputPaths, outputDir: string): Promise<void> {
  assertReportOutputPath(paths.markdownPath, outputDir);
  assertReportOutputPath(paths.jsonPath, outputDir);

  const markdown = await readFile(paths.markdownPath, "utf8");
  const json = JSON.parse(await readFile(paths.jsonPath, "utf8")) as Partial<AnalystReportData>;

  assert.ok(markdown.includes("This is not a buy/sell signal."), "Markdown report must include compliance text");
  assert.ok(markdown.includes(smokeNote), "Markdown report must include the smoke review note");
  assert.equal(json.report_version, 1, "JSON report_version must be 1");
  assert.ok((json.candidates_count ?? 0) > 0, "JSON candidates_count must be greater than 0");
  assert.ok((json.review_entries_count ?? 0) >= 1, "JSON review_entries_count must be at least 1");
}

function parseReviewSessionApiResponse(value: unknown): ReviewSessionState {
  const validation = validateReviewSessionState(value, "Review session API response");

  if (!validation.ok) {
    throw new Error(validation.error);
  }

  return validation.state;
}

function parseReviewSourceMeta(value: unknown): AnalystReportReviewSourceMeta {
  if (!isRecord(value) || !isRecord(value._source_meta)) return null;

  const meta = value._source_meta;

  if (typeof meta.source_kind !== "string" || typeof meta.storage_file !== "string") {
    return null;
  }

  return {
    source_kind: meta.source_kind,
    storage_file: meta.storage_file,
    ...(typeof meta.loaded_at === "string" ? { loaded_at: meta.loaded_at } : {}),
    ...(typeof meta.warning === "string" ? { warning: meta.warning } : {}),
  };
}

function parseReviewDiagnosticsResponse(value: unknown): AnalystReportReviewDiagnostics {
  if (!isRecord(value)) return null;

  if (
    typeof value.source_kind !== "string"
    || typeof value.storage_file !== "string"
    || typeof value.checked_at !== "string"
    || typeof value.file_exists !== "boolean"
    || !(value.file_size_bytes === null || typeof value.file_size_bytes === "number")
    || typeof value.entries_count !== "number"
    || typeof value.valid !== "boolean"
  ) {
    return null;
  }

  return {
    source_kind: value.source_kind,
    storage_file: value.storage_file,
    checked_at: value.checked_at,
    file_exists: value.file_exists,
    file_size_bytes: value.file_size_bytes,
    entries_count: value.entries_count,
    valid: value.valid,
    ...(typeof value.warning === "string" ? { warning: value.warning } : {}),
  };
}

function chooseSmokeReviewCandidate(candidates: UiTokenCandidate[]): UiTokenCandidate {
  return candidates.find((candidate) => candidate.finalLabel === "WATCHLIST") ?? candidates[0];
}

function buildSmokeReviewState(candidateId: string): ReviewSessionState {
  return {
    version: 1,
    entries: {
      [candidateId]: {
        candidate_id: candidateId,
        status: "saved_for_follow_up",
        note: smokeNote,
        updated_at: new Date().toISOString(),
      },
    },
  };
}

async function getJson(url: string): Promise<unknown> {
  assertLocalLoopbackUrl(url);
  const response = await fetch(url);
  const body = await response.json() as unknown;

  if (!response.ok) {
    throw new Error(`GET ${url} failed with HTTP ${response.status}: ${JSON.stringify(body)}`);
  }

  return body;
}

async function requestJson(
  url: string,
  options: { method: "PUT"; body: unknown },
): Promise<{ statusCode: number; body: unknown }> {
  assertLocalLoopbackUrl(url);
  const response = await fetch(url, {
    method: options.method,
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(options.body),
  });

  return {
    statusCode: response.status,
    body: await response.json() as unknown,
  };
}

function assertLocalLoopbackUrl(url: string): void {
  const parsed = new URL(url);
  assert.equal(parsed.protocol, "http:");
  assert.equal(parsed.hostname, "127.0.0.1");
}

function createTimestampSlug(isoTimestamp: string): string {
  return isoTimestamp.replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
}

function listen(server: ReturnType<typeof createScannerApiServer>): Promise<void> {
  return new Promise((resolveListen) => {
    server.listen(0, "127.0.0.1", resolveListen);
  });
}

function close(server: ReturnType<typeof createScannerApiServer>): Promise<void> {
  return new Promise((resolveClose, rejectClose) => {
    server.close((error) => {
      if (error) rejectClose(error);
      else resolveClose();
    });
  });
}

async function removeSmokeReports(): Promise<void> {
  try {
    const files = await readdir(smokeReportsDir, { withFileTypes: true });

    for (const file of files) {
      if (!file.isFile()) continue;
      if (!isSmokeReportFileName(file.name)) continue;
      await removeSmokeReportFile(resolve(smokeReportsDir, file.name));
    }
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return;
    throw error;
  }
}

async function removeSmokeReportFile(filePath: string): Promise<void> {
  assertSmokeReportFile(filePath);
  await rm(filePath, { force: true });
}

function assertSmokeReportFile(filePath: string): void {
  assertReportOutputPath(filePath, smokeReportsDir);
}

function isSmokeReportFileName(fileName: string): boolean {
  return fileName.includes("analyst-report") && [".md", ".json"].includes(extname(fileName));
}

async function removeSmokeReviewStorageFile(filePath: string): Promise<void> {
  assertSmokeReviewStorageFile(filePath);
  await rm(filePath, { force: true });
}

function assertSmokeReviewStorageFile(filePath: string): void {
  const resolvedFile = resolve(filePath);
  const resolvedLocalDir = resolve(localDir);
  const pathFromLocalDir = relative(resolvedLocalDir, resolvedFile);
  const isUnderLocalDir = pathFromLocalDir.length > 0
    && !pathFromLocalDir.startsWith("..")
    && !isAbsolute(pathFromLocalDir);

  if (!isUnderLocalDir || basename(resolvedFile) !== "analyst-report-smoke-review-session.json") {
    throw new Error(`Refusing to remove non-smoke review storage file: ${resolvedFile}`);
  }
}

function restoreOptionalEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}

function assertValidArgs(values: string[]): void {
  const invalid = values.filter((value) => value !== "--smoke");
  if (invalid.length > 0) {
    throw new Error("Usage: generateAnalystReport.ts [--smoke]");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

type ReportOutputPaths = {
  markdownPath: string;
  jsonPath: string;
};
