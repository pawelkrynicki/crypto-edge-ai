import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import { request } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  buildReportsLibraryIndex,
  readReportDetail,
  readReportsLibraryStatus,
  readReportsList,
} from "../server/reportsLibrary.js";
import { createScannerApiServer } from "../server/scannerApiServer.js";
import { ReportsLibrary } from "../src/components/ReportsLibrary.js";
import { ProductLocaleProvider } from "../src/productI18n.js";
import type { ReportDetail, ReportListItem } from "../src/types/reportTypes.js";

describe("read-only Reports Library index", () => {
  it("indexes canonical JSON, returns a path-free ID and reads detail by that ID", async () => {
    await withReportsRoot(async (root) => {
      await writeReport(root, "analyst-report-20260722-120000.json", validReport());
      const list = await readReportsList({ reportsRootPath: root, now: new Date("2026-07-22T12:30:00Z") });
      assert.equal(list.reports.length, 1);
      const [summary] = list.reports;
      assert.match(summary.report_id, /^rpt_[a-f0-9]{40}$/);
      assert.doesNotMatch(summary.report_id, /analyst|report|\\|\/|\.\./i);
      assert.equal(summary.report_version, 1);
      assert.equal(summary.scanner_run_id, "scan-safe-001");
      assert.equal(summary.validation_status, "VALID");
      const detail = await readReportDetail(summary.report_id, { reportsRootPath: root });
      assert.equal(detail?.research_summary.candidates_count, 1);
      assert.equal(detail?.candidates[0]?.candidate_id, "candidate-safe-001");
      assert.equal(detail?.manual_verification_requirements[0]?.final_label, "WATCHLIST");
    });
  });

  it("sorts newest first with deterministic IDs and caps the public list at 100", async () => {
    await withReportsRoot(async (root) => {
      await Promise.all(Array.from({ length: 105 }, (_, index) => {
        const report = validReport();
        report.generated_at = new Date(Date.UTC(2026, 6, 22, 0, index)).toISOString();
        return writeReport(root, `analyst-report-${String(index).padStart(3, "0")}.json`, report);
      }));
      const first = await readReportsList({ reportsRootPath: root });
      const second = await readReportsList({ reportsRootPath: root });
      assert.equal(first.reports.length, 100);
      assert.equal(first.reports[0]?.generated_at, new Date(Date.UTC(2026, 6, 22, 0, 104)).toISOString());
      assert.deepEqual(first.reports.map((report) => report.report_id), second.reports.map((report) => report.report_id));
    });
  });

  it("treats an available empty root as READY", async () => {
    await withReportsRoot(async (root) => {
      const status = await readReportsLibraryStatus({ reportsRootPath: root, now: new Date("2026-07-22T12:30:00Z") });
      assert.deepEqual(status, {
        library_available: true,
        library_status: "READY",
        report_count: 0,
        valid_report_count: 0,
        skipped_report_count: 0,
        latest_report_generated_at: null,
        supported_report_versions: [1],
        last_indexed_at: "2026-07-22T12:30:00.000Z",
      });
    });
  });

  it("returns PARTIAL when malformed, unsupported or oversized artifacts are skipped beside a valid report", async () => {
    await withReportsRoot(async (root) => {
      await writeReport(root, "analyst-report-valid.json", validReport());
      await writeFile(resolve(root, "analyst-report-broken.json"), "{broken", "utf8");
      await writeFile(resolve(root, "unsupported.txt"), "ignored", "utf8");
      await writeFile(resolve(root, "analyst-report-too-large.json"), "x".repeat(20_000), "utf8");
      const status = await readReportsLibraryStatus({ reportsRootPath: root, maxReportBytes: 10_000 });
      assert.equal(status.library_available, true);
      assert.equal(status.library_status, "PARTIAL");
      assert.equal(status.valid_report_count, 1);
      assert.equal(status.skipped_report_count, 3);
    });
  });

  it("ignores the generator's companion Markdown without parsing it or degrading status", async () => {
    await withReportsRoot(async (root) => {
      await writeReport(root, "analyst-report-valid.json", validReport());
      await writeFile(resolve(root, "analyst-report-valid.md"), "<script>never execute</script>", "utf8");
      const index = await buildReportsLibraryIndex({ reportsRootPath: root });
      assert.equal(index.status.library_status, "READY");
      assert.equal(index.status.skipped_report_count, 0);
      assert.equal(index.reports.length, 1);
    });
  });

  it("returns NOT_READY for unavailable storage and when no artifact can satisfy the contract", async () => {
    const missingRoot = resolve(tmpdir(), `crypto-edge-missing-reports-${Date.now()}`);
    assert.equal((await readReportsLibraryStatus({ reportsRootPath: missingRoot })).library_status, "NOT_READY");
    await withReportsRoot(async (root) => {
      await writeFile(resolve(root, "analyst-report-invalid.json"), "{}", "utf8");
      const status = await readReportsLibraryStatus({ reportsRootPath: root });
      assert.equal(status.library_available, true);
      assert.equal(status.library_status, "NOT_READY");
      assert.equal(status.skipped_report_count, 1);
    });
  });

  it("rejects symlinks, including a report symlink that points outside reports root", async () => {
    await withReportsRoot(async (root) => {
      const outsideRoot = await mkdtemp(resolve(tmpdir(), "crypto-edge-reports-outside-"));
      try {
        const outsideReport = resolve(outsideRoot, "outside.json");
        await writeFile(outsideReport, JSON.stringify(validReport()), "utf8");
        try {
          await symlink(outsideReport, resolve(root, "analyst-report-linked.json"), "file");
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "EPERM") {
            await symlink(outsideRoot, resolve(root, "analyst-report-linked.json"), "junction");
          } else {
            throw error;
          }
        }
        const status = await readReportsLibraryStatus({ reportsRootPath: root });
        assert.equal(status.valid_report_count, 0);
        assert.equal(status.skipped_report_count, 1);
        assert.equal(status.library_status, "NOT_READY");
      } finally {
        await rm(outsideRoot, { recursive: true, force: true });
      }
    });
  });

  it("does not expose local paths or non-allowlisted fields", async () => {
    await withReportsRoot(async (root) => {
      const report = validReport();
      report.secret = "should-not-leak";
      report.metadata.scanner_source_path = "C:\\Users\\owner\\private\\scanner.json";
      report.metadata.review_storage_file = "C:\\Users\\owner\\review.json";
      await writeReport(root, "analyst-report-safe.json", report);
      const list = await readReportsList({ reportsRootPath: root });
      const detail = await readReportDetail(list.reports[0]!.report_id, { reportsRootPath: root });
      const publicJson = JSON.stringify({ list, detail });
      for (const forbidden of ["C:\\Users", "owner", "private", "scanner_source_path", "review_storage_file", "should-not-leak", "secret"]) {
        assert.equal(publicJson.includes(forbidden), false, forbidden);
      }
    });
  });
});

describe("read-only Reports Library API", () => {
  it("serves status, list and detail while rejecting unknown IDs and traversal", async () => {
    await withReportsRoot(async (root) => {
      await writeReport(root, "analyst-report-api.json", validReport());
      const server = createScannerApiServer({ runtimeMode: "INTERNAL_BETA", reports: { reportsRootPath: root } });
      await listen(server);
      try {
        const status = await requestRaw(server, "GET", "/api/reports/status");
        assert.equal(status.status, 200);
        assert.equal(JSON.parse(status.body).library_status, "READY");
        const list = await requestRaw(server, "GET", "/api/reports");
        assert.equal(list.status, 200);
        const reportId = JSON.parse(list.body).reports[0].report_id as string;
        assert.equal((await requestRaw(server, "GET", `/api/reports/${reportId}`)).status, 200);
        assert.equal((await requestRaw(server, "GET", "/api/reports/rpt_0000000000000000000000000000000000000000")).status, 404);
        for (const path of [
          "/api/reports/../secret",
          "/api/reports/%2e%2e%2fsecret",
          "/api/reports/%252e%252e%252fsecret",
          "/api/reports/C:%5CUsers%5Cowner%5Csecret.json",
          "/api/reports/%2Fetc%2Fpasswd",
        ]) {
          assert.equal((await requestRaw(server, "GET", path)).status, 404, path);
        }
      } finally {
        await close(server);
      }
    });
  });

  it("rejects POST, PUT, PATCH and DELETE with zero side effects", async () => {
    await withReportsRoot(async (root) => {
      await writeReport(root, "analyst-report-methods.json", validReport());
      const before = await snapshotDirectory(root);
      const server = createScannerApiServer({ runtimeMode: "INTERNAL_BETA", reports: { reportsRootPath: root } });
      await listen(server);
      try {
        for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
          for (const path of ["/api/reports/status", "/api/reports", "/api/reports/rpt_0000000000000000000000000000000000000000"]) {
            assert.equal((await requestRaw(server, method, path)).status, 405, `${method} ${path}`);
          }
        }
      } finally {
        await close(server);
      }
      assert.deepEqual(await snapshotDirectory(root), before);
    });
  });

  it("feeds Control Center from the canonical report status while overall remains NOT_READY", async () => {
    await withReportsRoot(async (root) => {
      await writeReport(root, "analyst-report-control.json", validReport());
      await writeFile(resolve(root, "analyst-report-invalid.json"), "{}", "utf8");
      const server = createScannerApiServer({ runtimeMode: "INTERNAL_BETA", reports: { reportsRootPath: root } });
      await listen(server);
      try {
        const [libraryResponse, controlResponse] = await Promise.all([
          requestRaw(server, "GET", "/api/reports/status"),
          requestRaw(server, "GET", "/api/control-center/status"),
        ]);
        const library = JSON.parse(libraryResponse.body);
        const control = JSON.parse(controlResponse.body);
        assert.equal(control.reports.status, library.library_status);
        assert.equal(control.reports.validReportCount, library.valid_report_count);
        assert.equal(control.reports.skippedReportCount, library.skipped_report_count);
        assert.equal(control.reports.latestReportGeneratedAt, library.latest_report_generated_at);
        assert.equal(control.reports.status, "PARTIAL");
        assert.equal(control.overallStatus, "NOT_READY");
        assert.equal(control.accessDeployment.externalTesterAccess, "NO_GO");
      } finally {
        await close(server);
      }
    });
  });

  it("handles 100 concurrent GETs with zero provider calls and zero writes", async () => {
    await withReportsRoot(async (root) => {
      await writeReport(root, "analyst-report-concurrent.json", validReport());
      const before = await snapshotDirectory(root);
      const originalFetch = globalThis.fetch;
      let providerCalls = 0;
      globalThis.fetch = (async () => {
        providerCalls += 1;
        throw new Error("provider fetch forbidden");
      }) as typeof fetch;
      const server = createScannerApiServer({ runtimeMode: "INTERNAL_BETA", reports: { reportsRootPath: root } });
      await listen(server);
      try {
        const list = await requestRaw(server, "GET", "/api/reports");
        const reportId = JSON.parse(list.body).reports[0].report_id as string;
        const paths = Array.from({ length: 100 }, (_, index) => (
          index % 3 === 0 ? "/api/reports/status" : index % 3 === 1 ? "/api/reports" : `/api/reports/${reportId}`
        ));
        const responses = await Promise.all(paths.map((path) => requestRaw(server, "GET", path)));
        assert.equal(responses.every((response) => response.status === 200), true);
      } finally {
        globalThis.fetch = originalFetch;
        await close(server);
      }
      assert.equal(providerCalls, 0);
      assert.deepEqual(await snapshotDirectory(root), before);
    });
  });
});

describe("Reports Library presentation boundary", () => {
  it("renders the exact neutral, partial and unavailable semantics in EN and PL", () => {
    for (const [locale, expected] of [
      ["en", "No reports have been saved yet. The library is operating correctly."],
      ["pl", "Nie ma jeszcze zapisanych raportów. Biblioteka działa prawidłowo."],
    ] as const) {
      const markup = renderReports(locale, status("READY", 0, 0), [], null);
      assert.match(markup, new RegExp(escapeRegExp(expected)));
    }
    assert.match(renderReports("en", status("PARTIAL", 1, 1), [], null), /Some reports were skipped/);
    assert.match(renderReports("pl", status("PARTIAL", 1, 1), [], null), /Część raportów została pominięta/);
    assert.match(renderReports("en", status("NOT_READY", 0, 0), [], null), /Reports Library is currently unavailable/);
    assert.match(renderReports("pl", status("NOT_READY", 0, 0), [], null), /Biblioteka raportów jest obecnie niedostępna/);
  });

  it("escapes report HTML and scripts and never uses dangerouslySetInnerHTML", async () => {
    await withReportsRoot(async (root) => {
      const report = validReport();
      report.review_summary.entries[0]!.note = '<script>alert("x")</script><b>research</b>';
      await writeReport(root, "analyst-report-html.json", report);
      const list = await readReportsList({ reportsRootPath: root });
      const detail = await readReportDetail(list.reports[0]!.report_id, { reportsRootPath: root });
      assert.ok(detail);
      const markup = renderReports("en", status("READY", 1, 0), list.reports, detail);
      assert.doesNotMatch(markup, /<script>|<b>research<\/b>/i);
      assert.match(markup, /&lt;script&gt;alert/);
      const componentSource = await readFile(resolve(process.cwd(), "src", "components", "ReportsLibrary.tsx"), "utf8");
      assert.doesNotMatch(componentSource, /dangerouslySetInnerHTML/);
    });
  });

  it("uses only same-origin GET endpoints and performs no provider fetch", async () => {
    const source = await readFile(resolve(process.cwd(), "src", "services", "reportsDataSource.ts"), "utf8");
    assert.match(source, /fetch\(path/);
    assert.match(source, /method:\s*"GET"/);
    assert.match(source, /credentials:\s*"same-origin"/);
    assert.doesNotMatch(source, /VITE_SCANNER_API_URL|https?:\/\/|provider|collector/i);
    assert.doesNotMatch(source, /POST|PUT|PATCH|DELETE/);
  });
});

async function withReportsRoot(run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(resolve(tmpdir(), "crypto-edge-reports-"));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function writeReport(root: string, fileName: string, report: ReturnType<typeof validReport>): Promise<void> {
  await writeFile(resolve(root, fileName), `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

async function snapshotDirectory(root: string): Promise<Array<{ name: string; body: string; size: number; mtimeMs: number }>> {
  const names = (await readdir(root)).sort();
  return Promise.all(names.map(async (name) => {
    const path = resolve(root, name);
    const metadata = await stat(path);
    return { name, body: await readFile(path, "utf8"), size: metadata.size, mtimeMs: metadata.mtimeMs };
  }));
}

function validReport() {
  return {
    report_version: 1,
    generated_at: "2026-07-22T12:00:00.000Z",
    candidates_count: 1,
    review_entries_count: 1,
    scanner_source: "real-output",
    context_source: "real-output",
    metadata: {
      scanner_source: "real-output",
      scanner_source_path: "not_available",
      scanner_run_id: "scan-safe-001",
      scanner_loaded_at: "2026-07-22T12:00:00.000Z",
      context_source: "real-output",
      context_run_id: "context-safe-001",
      context_generated_at: "2026-07-22T11:55:00.000Z",
      context_loaded_at: "2026-07-22T11:56:00.000Z",
      context_output_file: "not_available",
      review_storage_source: "file",
      review_storage_file: "not_available",
      review_loaded_at: "2026-07-22T11:57:00.000Z",
      review_diagnostics_checked_at: "2026-07-22T11:58:00.000Z",
    },
    scanner_summary: {
      candidates_count: 1,
      by_final_label: { WATCHLIST: 1 },
      by_security_label: { NEEDS_MANUAL_VERIFICATION: 1 },
      watchlist_count: 1,
      reject_count: 0,
      critical_risk_count: 0,
      needs_manual_verification_count: 0,
      scan_run: {
        run_id: "scan-safe-001",
        source: "internal-beta",
        mode: "offline",
        finished_at: "2026-07-22T12:00:00.000Z",
        total_raw: 1,
        passed_basic_filter: 1,
        rejected_basic_filter: 0,
        security_checked: 1,
        security_passed: 0,
        watchlist_candidates: 1,
      },
    },
    review_summary: {
      review_entries_count: 1,
      by_status: { saved_for_follow_up: 1 },
      entries: [{
        candidate_id: "candidate-safe-001",
        symbol: "SAFE",
        name: "Safe Research Candidate",
        final_label: "WATCHLIST",
        status: "saved_for_follow_up",
        note: "Check source freshness manually.",
        updated_at: "2026-07-22T12:01:00.000Z",
        matched_current_scan: true,
      }],
      stored_reviews_not_in_current_scan: [],
      diagnostics: null,
    },
    market_context_summary: {
      source_kind: "real-output",
      run_id: "context-safe-001",
      generated_at: "2026-07-22T11:55:00.000Z",
      loaded_at: "2026-07-22T11:56:00.000Z",
      environment: "INTERNAL_BETA",
      summary: { sources_requested: 1, sources_allowed: 1, sources_denied: 0, records_total: 1, warnings_total: 0, errors_total: 0 },
      fear_greed: { value: 45, value_classification: "Neutral", timestamp: "2026-07-22T11:50:00.000Z", source_name: "Alternative.me" },
      defi_snapshots: [{ name: "Example Protocol", chain: "ethereum", tvl_usd: 1000, change_1d: 1, change_7d: -2, source_name: "DefiLlama" }],
      defi_snapshots_omitted_count: 0,
      sources: [{ source_id: "alternative_me_fng", source_name: "Alternative.me", mode: "fixture", fetched_at: "2026-07-22T11:55:00.000Z", data_category: "market_sentiment", records_count: 1, warnings_count: 0, errors_count: 0 }],
    },
    candidate_snapshot: {
      limit: 25,
      truncated: false,
      omitted_count: 0,
      candidates: [{ candidate_id: "candidate-safe-001", symbol: "SAFE", name: "Safe Research Candidate", chain: "ethereum", final_label: "WATCHLIST", security_label: "NEEDS_MANUAL_VERIFICATION", reason: "Manual research is required." }],
    },
    compliance: {
      local_research_workflow: "This report is a local analyst research workflow export.",
      research_only: "It is not investment advice or a recommendation.",
      buy_sell_signal: "This is not a buy/sell signal.",
      review_status_scope: "Review status does not change scanner label, scoring, final_label, or WATCHLIST meaning.",
    },
    secret: undefined as string | undefined,
  };
}

function status(libraryStatus: "READY" | "PARTIAL" | "NOT_READY", valid: number, skipped: number) {
  return {
    library_available: libraryStatus !== "NOT_READY",
    library_status: libraryStatus,
    report_count: valid + skipped,
    valid_report_count: valid,
    skipped_report_count: skipped,
    latest_report_generated_at: valid > 0 ? "2026-07-22T12:00:00.000Z" : null,
    supported_report_versions: [1],
    last_indexed_at: "2026-07-22T12:30:00.000Z",
  } as const;
}

function renderReports(
  locale: "en" | "pl",
  libraryStatus: ReturnType<typeof status>,
  reports: ReportListItem[],
  detail: ReportDetail | null,
): string {
  return renderToStaticMarkup(React.createElement(
    ProductLocaleProvider,
    { initialLocale: locale },
    React.createElement(ReportsLibrary, {
      candidates: [],
      onOpenCandidate: () => undefined,
      onOpenManualVerification: () => undefined,
      initialStatus: libraryStatus,
      initialReports: reports,
      initialDetail: detail,
    }),
  ));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function listen(server: ReturnType<typeof createScannerApiServer>): Promise<void> {
  return new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
}

function close(server: ReturnType<typeof createScannerApiServer>): Promise<void> {
  return new Promise((resolveClose, rejectClose) => server.close((error) => error ? rejectClose(error) : resolveClose()));
}

function requestRaw(
  server: ReturnType<typeof createScannerApiServer>,
  method: string,
  path: string,
): Promise<{ status: number; body: string }> {
  const port = (server.address() as AddressInfo).port;
  return new Promise((resolveRequest, rejectRequest) => {
    const req = request({ hostname: "127.0.0.1", port, method, path }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      res.on("end", () => resolveRequest({
        status: res.statusCode ?? 0,
        body: Buffer.concat(chunks).toString("utf8"),
      }));
    });
    req.once("error", rejectRequest);
    req.end();
  });
}
