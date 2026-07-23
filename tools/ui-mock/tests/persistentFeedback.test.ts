import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, request } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { afterEach, describe, it } from "node:test";
import { randomUUID } from "node:crypto";
import {
  createFeedbackService,
  FEEDBACK_MAX_DETAILS_LENGTH,
  FEEDBACK_MAX_TITLE_LENGTH,
  FeedbackApiError,
  type FeedbackSubmission,
} from "../server/feedbackApi.js";
import {
  createFeedbackStore,
  getDefaultFeedbackStorePath,
  resolveFeedbackDatabasePath,
  resolveFeedbackStore,
  type FeedbackStore,
} from "../server/feedbackStore.js";
import { createProductVpsServer } from "../server/productVpsServer.js";
import { createScannerApiHandler } from "../server/scannerApiHandler.js";

const roots: string[] = [];
const stores: FeedbackStore[] = [];
const NOW = "2026-07-23T12:00:00.000Z";

afterEach(async () => {
  for (const store of stores.splice(0)) store.close();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("Persistent Feedback SQLite store", () => {
  it("uses one canonical path for a relative review store regardless of the working directory", async () => {
    const originalWorkingDirectory = process.cwd();
    const otherWorkingDirectory = await tempRoot();
    const relativePath = ".local/canonical-feedback-review.sqlite";
    const before = resolveFeedbackDatabasePath(relativePath);
    try {
      process.chdir(otherWorkingDirectory);
      assert.equal(resolveFeedbackDatabasePath(relativePath), before);
    } finally {
      process.chdir(originalWorkingDirectory);
    }
    const feedbackRuntimeRoot = resolve(dirname(getDefaultFeedbackStorePath()), "..");
    assert.equal(before, resolve(feedbackRuntimeRoot, relativePath));
  });

  it("returns the exact injected store instead of creating another runtime singleton", async () => {
    const { store } = await tempStore();
    assert.equal(await resolveFeedbackStore({ store }), store);
  });

  it("creates a valid empty READY store and keeps migration idempotent", async () => {
    const { store, databasePath } = await tempStore();
    assert.deepEqual(store.health(true), {
      storage_available: true,
      feedback_status: "READY",
      total_count: 0,
      new_count: 0,
      blocker_count: 0,
      improvement_count: 0,
      clarification_count: 0,
      later_count: 0,
      latest_feedback_at: null,
      oldest_new_feedback_at: null,
    });
    store.close();
    stores.splice(stores.indexOf(store), 1);
    const reopened = await createFeedbackStore({ databaseFilePath: databasePath });
    stores.push(reopened);
    assert.equal(reopened.health(true).feedback_status, "READY");
    assert.equal(reopened.health(true).total_count, 0);
    assert.equal(reopened.health(false).feedback_status, "PARTIAL");
  });

  it("persists feedback across a runtime restart", async () => {
    const { store, databasePath } = await tempStore();
    const service = serviceFor(store);
    const result = await service.submit(validSubmission("BLOCKER"), "11111111-1111-4111-8111-111111111111");
    assert.equal(result.submission_status, "RECORDED");
    store.close();
    stores.splice(stores.indexOf(store), 1);

    const reopened = await createFeedbackStore({ databaseFilePath: databasePath });
    stores.push(reopened);
    assert.equal(reopened.health(true).total_count, 1);
    assert.equal(reopened.get(result.feedback_id)?.details, validSubmission("BLOCKER").details);
  });

  it("reports corrupt storage as NOT_READY without affecting another subsystem", async () => {
    const root = await tempRoot();
    const databasePath = resolve(root, "broken.sqlite");
    await writeFile(databasePath, "not a sqlite database", "utf8");
    const store = await createFeedbackStore({ databaseFilePath: databasePath });
    stores.push(store);
    assert.equal(store.health(true).feedback_status, "NOT_READY");
    assert.equal(store.health(true).storage_available, false);

    const radarDirectory = resolve(root, "scanner");
    await mkdir(radarDirectory);
    const server = createServer(createScannerApiHandler({
      runtimeMode: "INTERNAL_BETA",
      scanner: { outputDirPath: radarDirectory },
      feedback: { store },
    }));
    await listen(server);
    try {
      const radar = await http(server, "GET", "/api/scanner/latest");
      assert.equal(radar.status, 503);
      assert.equal(JSON.parse(radar.body).reason_code, "SCANNER_OUTPUT_UNAVAILABLE");
      const feedback = await http(server, "GET", "/api/feedback/status");
      assert.equal(JSON.parse(feedback.body).feedback_status, "NOT_READY");
    } finally {
      await close(server);
    }
  });

  it("enforces the configured record capacity without deleting valid rows", async () => {
    const root = await tempRoot();
    const store = await createFeedbackStore({ databaseFilePath: resolve(root, "capacity.sqlite"), maxRecords: 2 });
    stores.push(store);
    const service = serviceFor(store, { sessionLimit: 20, globalLimit: 20 });
    await service.submit(validSubmission("BLOCKER"), "11111111-1111-4111-8111-111111111111");
    await service.submit(validSubmission("IMPROVEMENT"), "11111111-1111-4111-8111-111111111111");
    await assert.rejects(
      service.submit(validSubmission("LATER"), "11111111-1111-4111-8111-111111111111"),
      (error: unknown) => error instanceof FeedbackApiError && error.code === "CAPACITY_REACHED",
    );
    assert.equal(store.health(true).total_count, 2);
  });
});

describe("Feedback submission contract, idempotency and rate limits", () => {
  it("accepts all four canonical categories and sets server-owned fields", async () => {
    const { store } = await tempStore();
    const service = serviceFor(store, {
      sessionLimit: 20,
      globalLimit: 20,
      resolveSubject: async (ref) => ref.type === "candidate" && ref.id === "known-candidate"
        ? { candidate_identity: { chain: "base", contract_address: "0x1234" }, scanner_run_id: "run-1" }
        : null,
    });
    for (const category of ["BLOCKER", "IMPROVEMENT", "CLARIFICATION", "LATER"] as const) {
      const submission = validSubmission(category);
      if (category === "BLOCKER") submission.subject_ref = { type: "candidate", id: "known-candidate" };
      const receipt = await service.submit(submission, "22222222-2222-4222-8222-222222222222");
      const record = store.get(receipt.feedback_id);
      assert.equal(record?.category, category);
      assert.equal(record?.status, "NEW");
      assert.equal(record?.created_at, NOW);
      assert.equal(record?.runtime_mode, "INTERNAL_BETA");
      assert.equal(record?.build_sha, "abcdef1234567");
      if (category === "BLOCKER") assert.deepEqual(record?.candidate_identity, { chain: "base", contract_address: "0x1234" });
    }
  });

  it("stores an unknown subject reference without subject context", async () => {
    const { store } = await tempStore();
    const service = serviceFor(store, { resolveSubject: async () => null });
    const submission = validSubmission("CLARIFICATION");
    submission.subject_ref = { type: "candidate", id: "unknown" };
    const receipt = await service.submit(submission, "33333333-3333-4333-8333-333333333333");
    assert.equal(store.get(receipt.feedback_id)?.candidate_identity, null);
  });

  it("rejects extra fields, owner fields, invalid lengths and control characters", async () => {
    const { store } = await tempStore();
    const service = serviceFor(store, { sessionLimit: 100, globalLimit: 100 });
    const invalid: unknown[] = [
      { ...validSubmission(), priority: "P0" },
      { ...validSubmission(), status: "RESOLVED" },
      { ...validSubmission(), created_at: NOW },
      { ...validSubmission(), title: "tiny".slice(0, 4) },
      { ...validSubmission(), title: "x".repeat(FEEDBACK_MAX_TITLE_LENGTH + 1) },
      { ...validSubmission(), details: "short" },
      { ...validSubmission(), details: "x".repeat(FEEDBACK_MAX_DETAILS_LENGTH + 1) },
      { ...validSubmission(), title: "bad\u0000title" },
      { ...validSubmission(), subject_ref: { type: "candidate", id: "x", path: "C:\\secret" } },
    ];
    for (const body of invalid) await assert.rejects(service.submit(body, randomUUID()), FeedbackApiError);
    assert.equal(store.health(true).total_count, 0);
  });

  it("keeps HTML and Markdown as inert plain text", async () => {
    const { store } = await tempStore();
    const service = serviceFor(store);
    const submission = validSubmission();
    submission.title = "<img src=x onerror=alert(1)>";
    submission.details = "**not rendered** <script>alert('x')</script> plain text";
    const receipt = await service.submit(submission, "44444444-4444-4444-8444-444444444444");
    assert.equal(store.get(receipt.feedback_id)?.title, submission.title);
    assert.equal(store.get(receipt.feedback_id)?.details, submission.details);
  });

  it("returns one receipt for retry and creates at most one row for 100 concurrent identical keys", async () => {
    const { store } = await tempStore();
    const service = serviceFor(store, { sessionLimit: 1_000, globalLimit: 1_000 });
    const submission = validSubmission();
    const sessionId = "55555555-5555-4555-8555-555555555555";
    const receipts = await Promise.all(Array.from({ length: 100 }, () => service.submit(submission, sessionId)));
    assert.equal(new Set(receipts.map((value) => value.feedback_id)).size, 1);
    assert.equal(store.health(true).total_count, 1);
    assert.equal(receipts.filter((value) => value.submission_status === "RECORDED").length, 1);
    assert.equal(receipts.at(-1)?.submission_status, "ALREADY_RECORDED");
  });

  it("creates 100 distinct records when test rate limits are raised", async () => {
    const { store } = await tempStore();
    const service = serviceFor(store, { sessionLimit: 1_000, globalLimit: 1_000 });
    await Promise.all(Array.from({ length: 100 }, (_, index) => service.submit(
      validSubmission("IMPROVEMENT", randomUUID(), `Distinct feedback title ${index}`),
      "66666666-6666-4666-8666-666666666666",
    )));
    assert.equal(store.health(true).total_count, 100);
  });

  it("enforces session and global limits and resets through the injected clock", async () => {
    const { store } = await tempStore();
    let clock = Date.parse(NOW);
    const service = serviceFor(store, { now: () => new Date(clock), sessionLimit: 2, globalLimit: 3, rateWindowMs: 60_000 });
    const sessionA = "77777777-7777-4777-8777-777777777777";
    const sessionB = "88888888-8888-4888-8888-888888888888";
    await service.submit(validSubmission(), sessionA);
    await service.submit(validSubmission(), sessionA);
    await assert.rejects(service.submit(validSubmission(), sessionA), rateLimited);
    await service.submit(validSubmission(), sessionB);
    await assert.rejects(service.submit(validSubmission(), sessionB), rateLimited);
    assert.equal(store.health(true).total_count, 3);
    clock += 60_001;
    await service.submit(validSubmission(), sessionA);
    assert.equal(store.health(true).total_count, 4);
  });
});

describe("Feedback HTTP and owner boundary", () => {
  it("enforces Origin, JSON Content-Type, custom header, strict schema and body size", async () => {
    const { store } = await tempStore();
    const server = createServer(createScannerApiHandler({ runtimeMode: "INTERNAL_BETA", feedback: { store } }));
    await listen(server);
    const origin = serverUrl(server);
    try {
      const cases = [
        { headers: { "content-type": "application/json", "x-crypto-edge-feedback": "1" }, expected: 403 },
        { headers: { origin, "x-crypto-edge-feedback": "1" }, expected: 415 },
        { headers: { origin, "content-type": "application/json" }, expected: 403 },
        { headers: { origin: "https://foreign.invalid", "content-type": "application/json", "x-crypto-edge-feedback": "1" }, expected: 403 },
      ];
      for (const testCase of cases) {
        const response = await http(server, "POST", "/api/feedback", testCase.headers, JSON.stringify(validSubmission()));
        assert.equal(response.status, testCase.expected);
      }
      const oversized = await http(server, "POST", "/api/feedback", feedbackHeaders(origin), JSON.stringify({ ...validSubmission(), padding: "x".repeat(17_000) }));
      assert.equal(oversized.status, 413);
      assert.equal(store.health(true).total_count, 0);
    } finally {
      await close(server);
    }
  });

  it("returns only the public status allowlist and a signed pseudonymous HttpOnly cookie", async () => {
    const { store } = await tempStore();
    const server = createServer(createScannerApiHandler({ runtimeMode: "INTERNAL_BETA", feedback: { store } }));
    await listen(server);
    try {
      const response = await http(server, "GET", "/api/feedback/status");
      assert.equal(response.status, 200);
      assert.deepEqual(Object.keys(JSON.parse(response.body)).sort(), [
        "capture_available", "feedback_status", "max_details_length", "max_title_length",
        "submission_enabled", "supported_categories",
      ]);
      const cookie = String(response.headers["set-cookie"]);
      assert.match(cookie, /ce_feedback_session=/);
      assert.match(cookie, /HttpOnly/i);
      assert.match(cookie, /SameSite=Strict/i);
      assert.doesNotMatch(response.body, /storage|session|count|path/i);
    } finally {
      await close(server);
    }
  });

  it("shares one injected store across POST, owner reads, export and Control Center", async () => {
    const { store } = await tempStore();
    const disabled = createServer(createScannerApiHandler({
      runtimeMode: "INTERNAL_BETA",
      ownerOperations: { mode: "DISABLED" },
      feedback: { store },
    }));
    await listen(disabled);
    try {
      assert.equal((await http(disabled, "GET", "/api/owner/feedback/status")).status, 404);
      assert.equal((await http(disabled, "GET", "/api/owner/feedback?owner=1")).status, 404);
    } finally {
      await close(disabled);
    }

    const owner = createServer(createScannerApiHandler({
      runtimeMode: "INTERNAL_BETA",
      ownerOperations: { mode: "REVIEW_SAFE", sessionSecret: "x".repeat(32) },
      feedback: { store, sessionLimit: 20, globalLimit: 20 },
      health: { buildSha: "abcdef1234567" },
    }));
    await listen(owner);
    const origin = serverUrl(owner);
    try {
      const statusResponse = await http(owner, "GET", "/api/feedback/status");
      const cookie = cookieHeader(statusResponse.headers["set-cookie"]);
      const posted = await http(owner, "POST", "/api/feedback", { ...feedbackHeaders(origin), cookie }, JSON.stringify(validSubmission("IMPROVEMENT")));
      assert.equal(posted.status, 201);
      const receipt = JSON.parse(posted.body) as { feedback_id: string; category: string };
      const feedbackId = receipt.feedback_id;
      assert.equal(receipt.category, "IMPROVEMENT");

      const status = await http(owner, "GET", "/api/owner/feedback/status");
      assert.deepEqual(
        pickFeedbackCounts(JSON.parse(status.body)),
        { total_count: 1, new_count: 1, blocker_count: 0, improvement_count: 1 },
      );
      const list = await http(owner, "GET", "/api/owner/feedback?category=IMPROVEMENT&status=NEW&limit=100");
      const listBody = JSON.parse(list.body) as { feedback: Array<Record<string, unknown>> };
      assert.equal(listBody.feedback.length, 1);
      assert.equal(listBody.feedback[0]?.feedback_id, feedbackId);
      assert.equal(listBody.feedback[0]?.category, "IMPROVEMENT");
      assert.equal(listBody.feedback[0]?.details, undefined);
      const detail = await http(owner, "GET", `/api/owner/feedback/${feedbackId}`);
      assert.equal(JSON.parse(detail.body).details, validSubmission("IMPROVEMENT").details);
      assert.equal(JSON.parse(detail.body).category, "IMPROVEMENT");
      assert.match(JSON.parse(detail.body).session_group, /^session_[0-9a-f]{12}$/);
      assert.equal(JSON.parse(detail.body).pseudonymous_session_id, undefined);

      const jsonExport = await http(owner, "GET", "/api/owner/feedback/export?format=json");
      const csvExport = await http(owner, "GET", "/api/owner/feedback/export?format=csv");
      assert.equal(JSON.parse(jsonExport.body).feedback[0].feedback_id, feedbackId);
      assert.match(csvExport.body, /IMPROVEMENT/);
      for (const body of [jsonExport.body, csvExport.body]) {
        assert.doesNotMatch(body, /pseudonymous_session_id|submission_key|storage_file|\.local|secret/i);
      }

      const refreshedStatus = await http(owner, "GET", "/api/owner/feedback/status");
      const refreshedList = await http(owner, "GET", "/api/owner/feedback?limit=100");
      assert.equal(JSON.parse(refreshedStatus.body).total_count, 1);
      assert.equal(JSON.parse(refreshedList.body).feedback[0].feedback_id, feedbackId);

      const controlCenter = JSON.parse((await http(owner, "GET", "/api/control-center/status")).body);
      assert.equal(controlCenter.feedback.totalCount, 1);
      assert.equal(controlCenter.feedback.newCount, 1);
      assert.equal(controlCenter.feedback.blockerCount, 0);
      assert.equal(controlCenter.feedback.status, "READY");
      assert.equal(controlCenter.overallStatus, "NOT_READY");
      for (const method of ["POST", "PUT", "DELETE"]) {
        assert.equal((await http(owner, method, `/api/owner/feedback/${feedbackId}`)).status, 404);
      }
    } finally {
      await close(owner);
    }
  });

  it("forwards the review launcher's injected store through the integrated product runtime", async () => {
    const { store } = await tempStore();
    const distPath = resolve(await tempRoot(), "dist");
    await mkdir(distPath);
    await writeFile(resolve(distPath, "index.html"), "<!doctype html><title>feedback review</title>", "utf8");
    const server = createProductVpsServer({
      runtimeMode: "INTERNAL_BETA",
      distPath,
      ownerOperations: { mode: "REVIEW_SAFE", sessionSecret: "z".repeat(32) },
      feedback: { store, sessionLimit: 20, globalLimit: 20 },
    });
    await listen(server);
    const origin = serverUrl(server);
    try {
      const statusResponse = await http(server, "GET", "/api/feedback/status");
      const cookie = cookieHeader(statusResponse.headers["set-cookie"]);
      const posted = await http(
        server,
        "POST",
        "/api/feedback",
        { ...feedbackHeaders(origin), cookie },
        JSON.stringify(validSubmission("IMPROVEMENT")),
      );
      assert.equal(posted.status, 201);
      assert.equal(store.health(true).total_count, 1);
      assert.equal(JSON.parse((await http(server, "GET", "/api/owner/feedback/status")).body).total_count, 1);
    } finally {
      await close(server);
    }
  });

  it("performs 100 feedback GETs with zero provider calls and zero feedback writes", async () => {
    const { store } = await tempStore();
    const server = createServer(createScannerApiHandler({
      runtimeMode: "INTERNAL_BETA",
      ownerOperations: { mode: "REVIEW_SAFE", sessionSecret: "y".repeat(32) },
      feedback: { store },
    }));
    await listen(server);
    const before = store.health(true).total_count;
    const originalFetch = globalThis.fetch;
    let providerCalls = 0;
    globalThis.fetch = (async () => { providerCalls += 1; throw new Error("provider call forbidden"); }) as typeof fetch;
    try {
      const responses = await Promise.all(Array.from({ length: 100 }, () => http(server, "GET", "/api/feedback/status")));
      assert.ok(responses.every((response) => response.status === 200));
    } finally {
      globalThis.fetch = originalFetch;
      await close(server);
    }
    assert.equal(providerCalls, 0);
    assert.equal(store.health(true).total_count, before);
  });

  it("changes only the feedback store on POST", async () => {
    const root = await tempRoot();
    const snapshot = resolve(root, "snapshot.json");
    const automation = resolve(root, "automation.json");
    const followUp = resolve(root, "follow-up.json");
    const established = resolve(root, "established.json");
    const reviews = resolve(root, "reviews.json");
    const sentinel = "unchanged";
    await Promise.all([snapshot, automation, followUp, established, reviews].map((path) => writeFile(path, sentinel, "utf8")));
    const store = await createFeedbackStore({ databaseFilePath: resolve(root, "feedback.sqlite") });
    stores.push(store);
    const service = serviceFor(store);
    await service.submit(validSubmission(), "99999999-9999-4999-8999-999999999999");
    for (const path of [snapshot, automation, followUp, established, reviews]) {
      assert.equal(await readFile(path, "utf8"), sentinel);
    }
    assert.equal(store.health(true).total_count, 1);
  });
});

async function tempStore(): Promise<{ store: FeedbackStore; databasePath: string }> {
  const root = await tempRoot();
  const databasePath = resolve(root, "feedback.sqlite");
  const store = await createFeedbackStore({ databaseFilePath: databasePath });
  stores.push(store);
  return { store, databasePath };
}

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(resolve(tmpdir(), "crypto-edge-feedback-"));
  roots.push(root);
  return root;
}

function serviceFor(store: FeedbackStore, overrides: Partial<Parameters<typeof createFeedbackService>[0]> = {}) {
  return createFeedbackService({
    store,
    runtimeMode: "INTERNAL_BETA",
    buildSha: "abcdef1234567",
    now: () => new Date(NOW),
    ...overrides,
  });
}

function validSubmission(
  category: FeedbackSubmission["category"] = "BLOCKER",
  submissionKey = randomUUID(),
  title = "The current path cannot be completed",
): FeedbackSubmission {
  return {
    submission_key: submissionKey,
    category,
    title,
    details: "The action remains unavailable after following the visible instructions.",
    screen_context: "candidate-results",
    locale: "en",
  };
}

function rateLimited(error: unknown): boolean {
  return error instanceof FeedbackApiError && error.code === "RATE_LIMITED" && error.httpStatus === 429;
}

function listen(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", () => { server.off("error", rejectListen); resolveListen(); });
  });
}

function close(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolveClose, rejectClose) => {
    server.close((error) => error ? rejectClose(error) : resolveClose());
  });
}

function serverUrl(server: ReturnType<typeof createServer>): string {
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

function feedbackHeaders(origin: string): Record<string, string> {
  return { origin, "content-type": "application/json", "x-crypto-edge-feedback": "1" };
}

function cookieHeader(value: string | string[] | undefined): string {
  const first = Array.isArray(value) ? value[0] : value;
  return first?.split(";", 1)[0] ?? "";
}

function pickFeedbackCounts(value: Record<string, number>): Record<string, number> {
  return {
    total_count: value.total_count,
    new_count: value.new_count,
    blocker_count: value.blocker_count,
    improvement_count: value.improvement_count,
  };
}

function http(
  server: ReturnType<typeof createServer>,
  method: string,
  path: string,
  headers: Record<string, string> = {},
  body?: string,
): Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: string }> {
  const url = new URL(serverUrl(server));
  return new Promise((resolveRequest, rejectRequest) => {
    const req = request({ hostname: url.hostname, port: url.port, method, path, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      res.on("end", () => resolveRequest({
        status: res.statusCode ?? 0,
        headers: res.headers,
        body: Buffer.concat(chunks).toString("utf8"),
      }));
    });
    req.once("error", rejectRequest);
    if (body) req.write(body);
    req.end();
  });
}
