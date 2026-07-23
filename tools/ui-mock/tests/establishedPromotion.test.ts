import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { request, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, it } from "node:test";
import {
  ESTABLISHED_UNIVERSE_STORE_SCHEMA_VERSION,
  loadEstablishedAddressUniverse,
} from "../../data-poc/src/establishedAddressUniverse.js";
import {
  mutateEstablishedUniverse,
  readEstablishedUniverseStore,
  type EstablishedUniverseStore,
} from "../../data-poc/src/establishedUniverseManager.js";
import {
  applyFollowUpRecheckSuccess,
  createEmptyFollowUpStore,
  ingestFollowUpObservations,
  type FollowUpObservationCandidate,
} from "../../data-poc/src/followUpBasket.js";
import { createScannerApiServer } from "../server/scannerApiServer.js";
import type {
  EstablishedPromotionOptions,
  EstablishedPromotionPreview,
  EstablishedPromotionProductRecord,
} from "../server/establishedPromotion.js";
import { readFollowUpDetail, readFollowUpStatus } from "../server/followUpApi.js";

const NOW_ISO = "2026-07-23T09:00:00.000Z";
const SECRET = "established-promotion-owner-session-secret-123456";
const ADDRESS = "0x9999999999999999999999999999999999999999";
const OTHER_ADDRESS = "0x8888888888888888888888888888888888888888";
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("owner established promotion capability", () => {
  it("is hidden and fail-closed in ordinary INTERNAL_BETA regardless of URL parameters", async () => {
    const harness = await createHarness("DISABLED");
    await listen(harness.server);
    try {
      for (const path of [
        promotionPath("status"),
        `${promotionPath("status")}&mode=ENABLED`,
        `${promotionPath("status")}&owner_operations=REVIEW_SAFE`,
        promotionPath("preview"),
      ]) {
        assert.equal((await requestApi(harness.server, "GET", path)).status, 404);
      }
    } finally {
      await close(harness.server);
    }
  });

  it("allows read-only status and preview in REVIEW_SAFE, performs no writes or provider calls, and blocks POST", async () => {
    let writes = 0;
    let providerCalls = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      providerCalls += 1;
      throw new Error("provider call forbidden");
    }) as typeof fetch;
    const harness = await createHarness("REVIEW_SAFE", {}, {
      mutateUniverse: async (mutation, options) => {
        if (options.apply) writes += 1;
        return mutateEstablishedUniverse(mutation, options);
      },
    });
    const before = await readEstablishedUniverseStore(harness.storePath);
    await listen(harness.server);
    try {
      const status = await requestApi(harness.server, "GET", promotionPath("status"));
      assert.equal(status.status, 200);
      const statusBody = JSON.parse(status.body) as Record<string, unknown>;
      assert.equal(statusBody.mode, "REVIEW_SAFE");
      assert.equal(statusBody.owner_controls_visible, true);
      assert.equal(statusBody.owner_actions_enabled, false);
      assert.equal(statusBody.eligibility_status, "ELIGIBLE");

      const preview = await getPreview(harness.server);
      assert.equal(preview.action_plan, "ADD");
      assert.equal(preview.owner_actions_enabled, false);
      assert.equal(preview.one_time, true);
      assert.equal(preview.planned_universe_version !== null, true);
      await assert.rejects(stat(`${harness.storePath}.lock`), (error: unknown) => isErrorCode(error, "ENOENT"));
      const post = await postPromotion(harness.server, preview);
      assert.equal(post.status, 403);
      assert.equal(errorOf(post.body), "OWNER_ACTIONS_DISABLED");
    } finally {
      globalThis.fetch = originalFetch;
      await close(harness.server);
    }
    const after = await readEstablishedUniverseStore(harness.storePath);
    assert.equal(after.current.universe_version, before.current.universe_version);
    assert.equal(after.current.checksum, before.current.checksum);
    assert.equal(JSON.stringify(after), JSON.stringify(before));
    assert.equal(writes, 0);
    assert.equal(providerCalls, 0);
  });

  it("returns only the safe owner contract without paths, audit details or secrets", async () => {
    const harness = await createHarness("REVIEW_SAFE");
    await listen(harness.server);
    try {
      const status = await requestApi(harness.server, "GET", promotionPath("status"));
      const preview = await requestApi(harness.server, "GET", promotionPath("preview"));
      for (const body of [status.body, preview.body]) {
        for (const forbidden of [SECRET, "C:\\", "/home/", "owner_note", "added_by", "audit_log", "history", "stack", "lock path", "pid"]) {
          assert.equal(body.toLowerCase().includes(forbidden.toLowerCase()), false, forbidden);
        }
      }
    } finally {
      await close(harness.server);
    }
  });

  it("explains lifecycle and duplicate outcomes without inventing planned versions", async () => {
    for (const [lifecycle, action, reason] of [
      ["NEW", "BLOCKED", "LIFECYCLE_NEW"],
      ["MATURING", "BLOCKED", "LIFECYCLE_MATURING"],
      ["ARCHIVED", "BLOCKED", "LIFECYCLE_ARCHIVED"],
      ["ESTABLISHED", "NO_ACTION", "ALREADY_ESTABLISHED"],
    ] as const) {
      const harness = await createHarness("REVIEW_SAFE", { lifecycle_status: lifecycle });
      await listen(harness.server);
      try {
        const preview = await getPreview(harness.server);
        assert.equal(preview.action_plan, action);
        assert.ok(preview.reason_codes.includes(reason));
        assert.equal(preview.planned_universe_version, null);
        assert.equal(preview.planned_entries_total, null);
      } finally {
        await close(harness.server);
      }
    }

    const active = await createHarness("REVIEW_SAFE");
    await mutateEstablishedUniverse({ operation: "add", chain: "ethereum", contract_address: ADDRESS }, {
      apply: true, storePath: active.storePath, now: () => new Date(NOW_ISO), actor: "test-owner",
    });
    await listen(active.server);
    try {
      const preview = await getPreview(active.server);
      assert.equal(preview.action_plan, "NO_ACTION");
      assert.equal(preview.duplicate_status, "ACTIVE_ENTRY_EXISTS");
    } finally {
      await close(active.server);
    }

    const disabled = await createHarness("REVIEW_SAFE");
    await mutateEstablishedUniverse({ operation: "add", chain: "ethereum", contract_address: ADDRESS }, {
      apply: true, storePath: disabled.storePath, now: () => new Date(NOW_ISO), actor: "test-owner",
    });
    await mutateEstablishedUniverse({ operation: "disable", chain: "ethereum", contract_address: ADDRESS }, {
      apply: true, storePath: disabled.storePath, now: () => new Date(Date.parse(NOW_ISO) + 1_000), actor: "test-owner",
    });
    await listen(disabled.server);
    try {
      const preview = await getPreview(disabled.server);
      assert.equal(preview.action_plan, "BLOCKED");
      assert.equal(preview.duplicate_status, "DISABLED_ENTRY_EXISTS");
      assert.ok(preview.reason_codes.includes("DISABLED_ENTRY_EXISTS"));
    } finally {
      await close(disabled.server);
    }
  });

  it("strictly validates query identity and rejects unknown product records", async () => {
    const harness = await createHarness("REVIEW_SAFE");
    await listen(harness.server);
    try {
      const paths = [
        "/api/owner-operations/established-promotion/status",
        `/api/owner-operations/established-promotion/status?chain=bitcoin&contract_address=${ADDRESS}`,
        "/api/owner-operations/established-promotion/status?chain=ethereum&contract_address=not-an-address",
        `${promotionPath("status")}&path=C%3A%5Cprivate`,
        `${promotionPath("status")}&chain=base`,
        `/api/owner-operations/established-promotion/status?chain=ethereum&contract_address=${OTHER_ADDRESS}`,
      ];
      for (const path of paths) assert.ok((await requestApi(harness.server, "GET", path)).status >= 400, path);
      assert.equal((await requestApi(harness.server, "GET", paths.at(-1)!)).status, 404);
    } finally {
      await close(harness.server);
    }
  });
});

describe("owner established promotion mutation security", () => {
  it("rejects Origin, session, content type, confirmation, extra fields, chain and address in POST", async () => {
    const harness = await createHarness("ENABLED");
    await listen(harness.server);
    try {
      const preview = await getPreview(harness.server);
      const validBody = JSON.stringify({ preview_id: preview.preview_id, confirmation: true });
      assert.equal((await requestApi(harness.server, "POST", promotionPostPath(), {
        "content-type": "application/json",
        "x-crypto-edge-owner-session": preview.preview_id,
      }, validBody)).status, 403);
      assert.equal((await requestApi(harness.server, "POST", promotionPostPath(), {
        origin: "https://foreign.invalid",
        "content-type": "application/json",
        "x-crypto-edge-owner-session": preview.preview_id,
      }, validBody)).status, 403);
      assert.equal((await requestApi(harness.server, "POST", promotionPostPath(), ownerHeaders(harness.server), validBody)).status, 403);
      assert.equal((await requestApi(harness.server, "POST", promotionPostPath(), {
        ...ownerHeaders(harness.server),
        "x-crypto-edge-owner-session": "wrong-session",
      }, validBody)).status, 403);
      assert.equal((await requestApi(harness.server, "POST", promotionPostPath(), {
        origin: ownerHeaders(harness.server).origin,
        "content-type": "text/plain",
        "x-crypto-edge-owner-session": preview.preview_id,
      }, validBody)).status, 415);
      for (const body of [
        { preview_id: preview.preview_id, confirmation: false },
        { preview_id: preview.preview_id, confirmation: true, extra: true },
        { preview_id: preview.preview_id, confirmation: true, chain: "ethereum" },
        { preview_id: preview.preview_id, confirmation: true, contract_address: ADDRESS },
      ]) {
        assert.equal((await requestApi(harness.server, "POST", promotionPostPath(), {
          ...ownerHeaders(harness.server),
          "x-crypto-edge-owner-session": preview.preview_id,
        }, JSON.stringify(body))).status, 400);
      }
    } finally {
      await close(harness.server);
    }
  });

  it("returns STALE_PREVIEW for expiry, universe, lifecycle and filter changes", async () => {
    let nowMs = Date.parse(NOW_ISO);
    const expired = await createHarness("ENABLED", {}, { now: () => new Date(nowMs), preflightTtlMs: 1_000 });
    await listen(expired.server);
    try {
      const preview = await getPreview(expired.server);
      nowMs += 1_001;
      const response = await postPromotion(expired.server, preview);
      assert.equal(response.status, 409);
      assert.equal(errorOf(response.body), "STALE_PREVIEW");
    } finally {
      await close(expired.server);
    }

    for (const change of ["universe", "lifecycle", "filter"] as const) {
      const harness = await createHarness("ENABLED");
      await listen(harness.server);
      try {
        const preview = await getPreview(harness.server);
        if (change === "universe") {
          await mutateEstablishedUniverse({ operation: "add", chain: "ethereum", contract_address: OTHER_ADDRESS }, {
            apply: true, storePath: harness.storePath, now: () => new Date(NOW_ISO), actor: "other-owner",
          });
        } else if (change === "lifecycle") {
          harness.record.lifecycle_status = "MATURING";
        } else {
          harness.record.basic_filter_status = "rejected_basic_filter";
        }
        const response = await postPromotion(harness.server, preview);
        assert.equal(response.status, 409, change);
        assert.equal(errorOf(response.body), "STALE_PREVIEW", change);
      } finally {
        await close(harness.server);
      }
    }
  });

  it("returns PROMOTION_ALREADY_IN_PROGRESS when the universe lock becomes occupied", async () => {
    let lockAvailable = true;
    const harness = await createHarness("ENABLED", {}, { inspectUniverseLock: async () => lockAvailable });
    await listen(harness.server);
    try {
      const preview = await getPreview(harness.server);
      lockAvailable = false;
      const response = await postPromotion(harness.server, preview);
      assert.equal(response.status, 409);
      assert.equal(errorOf(response.body), "PROMOTION_ALREADY_IN_PROGRESS");
    } finally {
      await close(harness.server);
    }
  });

  it("accepts at most one of 100 concurrent POST attempts and creates one version, history entry and audit", async () => {
    let managerWrites = 0;
    const harness = await createHarness("ENABLED", {}, {
      mutateUniverse: async (mutation, options) => {
        if (options.apply) managerWrites += 1;
        return mutateEstablishedUniverse(mutation, options);
      },
    });
    const before = await readEstablishedUniverseStore(harness.storePath);
    await listen(harness.server);
    try {
      const preview = await getPreview(harness.server);
      const responses = await Promise.all(Array.from({ length: 100 }, () => postPromotion(harness.server, preview)));
      assert.equal(responses.filter((response) => response.status === 200).length, 1);
      assert.equal(responses.filter((response) => response.status === 409).length, 99);
      const added = responses.find((response) => response.status === 200)!;
      assert.equal((JSON.parse(added.body) as { status: string }).status, "ADDED");
    } finally {
      await close(harness.server);
    }
    const after = await readEstablishedUniverseStore(harness.storePath);
    assert.equal(managerWrites, 1);
    assert.equal(after.history.length, before.history.length + 1);
    assert.equal(after.audit_log.length, before.audit_log.length + 1);
    assert.equal(after.current.entries.length, before.current.entries.length + 1);
    assert.equal(after.audit_log[0].operation, "add");
    assert.equal(after.current.entries.filter((entry) => entry.contract_address === ADDRESS).length, 1);
  });

  it("turns a concurrent active duplicate into safe NO_ACTION without a second version", async () => {
    const harness = await createHarness("ENABLED");
    await listen(harness.server);
    try {
      const preview = await getPreview(harness.server);
      await mutateEstablishedUniverse({ operation: "add", chain: "ethereum", contract_address: ADDRESS }, {
        apply: true, storePath: harness.storePath, now: () => new Date(NOW_ISO), actor: "other-owner",
      });
      const beforePost = await readEstablishedUniverseStore(harness.storePath);
      const response = await postPromotion(harness.server, preview);
      assert.equal(response.status, 200);
      assert.equal((JSON.parse(response.body) as { status: string }).status, "NO_ACTION_ALREADY_ESTABLISHED");
      const afterPost = await readEstablishedUniverseStore(harness.storePath);
      assert.equal(afterPost.current.universe_version, beforePost.current.universe_version);
      assert.equal(afterPost.audit_log.length, beforePost.audit_log.length);
    } finally {
      await close(harness.server);
    }
  });

  it("keeps 100 GET requests read-only and provider-free", async () => {
    let writes = 0;
    let providerCalls = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => { providerCalls += 1; throw new Error("forbidden"); }) as typeof fetch;
    const harness = await createHarness("REVIEW_SAFE", {}, {
      mutateUniverse: async (mutation, options) => {
        if (options.apply) writes += 1;
        return mutateEstablishedUniverse(mutation, options);
      },
    });
    const before = await readFile(harness.storePath, "utf8");
    await listen(harness.server);
    try {
      const responses = await Promise.all(Array.from({ length: 100 }, () => requestApi(
        harness.server,
        "GET",
        promotionPath("status"),
      )));
      assert.equal(responses.every((response) => response.status === 200), true);
    } finally {
      globalThis.fetch = originalFetch;
      await close(harness.server);
    }
    assert.equal(await readFile(harness.storePath, "utf8"), before);
    assert.equal(writes, 0);
    assert.equal(providerCalls, 0);
  });

  it("lets Follow-up resolve ESTABLISHED from active membership without rewriting its store", async () => {
    const harness = await createHarness("ENABLED");
    const followUpPath = join(harness.directory, "follow-up.json");
    const observedAt = "2026-07-20T09:00:00.000Z";
    const candidate = observationCandidate(ADDRESS);
    const ingested = ingestFollowUpObservations(
      createEmptyFollowUpStore(new Date(observedAt)),
      [candidate],
      observedAt,
      "scanner_run_one",
      null,
    );
    const entry = ingested.entries[0];
    const candidateStore = applyFollowUpRecheckSuccess(ingested, {
      entry_id: entry.entry_id,
      candidate,
      checked_at: NOW_ISO,
      source_run_id: "follow_up_run_one",
    }, null);
    assert.equal(candidateStore.entries[0].lifecycle_status, "CANDIDATE_FOR_ESTABLISHED");
    await writeFile(followUpPath, `${JSON.stringify(candidateStore, null, 2)}\n`, "utf8");
    const beforeFollowUp = await readFile(followUpPath, "utf8");

    const server = createScannerApiServer({
      runtimeMode: "INTERNAL_BETA",
      ownerOperations: { mode: "ENABLED", sessionSecret: SECRET },
      establishedUniverse: { storeFilePath: harness.storePath },
      establishedPromotion: {
        storePath: harness.storePath,
        followUp: { storePath: followUpPath },
        scanner: { outputDirPath: join(harness.directory, "missing-scanner-output") },
        now: () => new Date(NOW_ISO),
        inspectUniverseLock: async () => true,
      },
    });

    await listen(server);
    try {
      const preview = await getPreview(server);
      assert.equal(preview.action_plan, "ADD");
      assert.equal(preview.display_name, "Canonical Candidate");
      assert.equal((await postPromotion(server, preview)).status, 200);
    } finally {
      await close(server);
    }
    const detail = await readFollowUpDetail(entry.entry_id, {
      storePath: followUpPath,
      establishedUniversePath: harness.storePath,
      now: () => new Date(NOW_ISO),
    });
    const status = await readFollowUpStatus({
      storePath: followUpPath,
      establishedUniversePath: harness.storePath,
      now: () => new Date(NOW_ISO),
    });
    assert.equal(detail?.lifecycle_status, "ESTABLISHED");
    assert.equal(detail?.established_membership, true);
    assert.equal(status.candidate_count, 0);
    assert.equal(status.established_count, 1);
    assert.equal(await readFile(followUpPath, "utf8"), beforeFollowUp);
  });
});

async function createHarness(
  mode: "DISABLED" | "REVIEW_SAFE" | "ENABLED",
  recordOverrides: Partial<EstablishedPromotionProductRecord> = {},
  options: Partial<EstablishedPromotionOptions> = {},
): Promise<{
  server: Server;
  directory: string;
  storePath: string;
  record: EstablishedPromotionProductRecord;
}> {
  const directory = await mkdtemp(join(tmpdir(), "crypto-edge-promotion-"));
  temporaryDirectories.push(directory);
  const storePath = join(directory, "universe.json");
  const current = loadEstablishedAddressUniverse(resolve(process.cwd(), "..", "..", "config", "established_address_universe_v1.json"));
  const store: EstablishedUniverseStore = {
    schema_version: ESTABLISHED_UNIVERSE_STORE_SCHEMA_VERSION,
    current,
    history: [],
    audit_log: [],
  };
  await writeFile(storePath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  const record: EstablishedPromotionProductRecord = {
    chain: "ethereum",
    contract_address: ADDRESS,
    display_name: "Canonical Candidate",
    symbol_hint: "CAND",
    source_layer: "FOLLOW_UP",
    source_record_id: "fup_9999999999999999",
    source_run_id: "follow_up_run_one",
    lifecycle_status: "CANDIDATE_FOR_ESTABLISHED",
    basic_filter_status: "passed_basic_filter",
    security_status: "MANUAL_VERIFICATION_REQUIRED",
    ...recordOverrides,
  };
  const promotionOptions: EstablishedPromotionOptions = {
    mode,
    sessionSecret: SECRET,
    now: () => new Date(NOW_ISO),
    storePath,
    readProductRecord: async (chain, contractAddress) => (
      chain === record.chain && contractAddress === record.contract_address ? record : null
    ),
    inspectUniverseLock: async () => true,
    ...options,
  };
  return {
    directory,
    storePath,
    record,
    server: createScannerApiServer({
      runtimeMode: "INTERNAL_BETA",
      ownerOperations: { mode, sessionSecret: SECRET },
      establishedUniverse: { storeFilePath: storePath },
      establishedPromotion: promotionOptions,
    }),
  };
}

function observationCandidate(contractAddress: string): FollowUpObservationCandidate {
  return {
    candidate_id: "candidate_observation_one",
    symbol: "CAND",
    name: "Canonical Candidate",
    chain: "ethereum",
    contract_address: contractAddress,
    pair_address: null,
    pair_created_at: null,
    price_usd: 1,
    market_cap_usd: 1_000_000,
    fdv_usd: 1_000_000,
    liquidity_usd: 100_000,
    volume_24h_usd: 50_000,
    volume_market_cap_ratio: 0.05,
    pair_age_days: 3,
    basic_filter_status: "passed_basic_filter",
    filter_reasons: [],
    discovery_basket: "new_emerging",
    observation_only: true,
  };
}

function promotionPath(kind: "status" | "preview"): string {
  const endpoint = kind === "status"
    ? "/api/owner-operations/established-promotion/status"
    : "/api/owner-operations/established-promotion-preview";
  return `${endpoint}?chain=ethereum&contract_address=${ADDRESS}`;
}

function promotionPostPath(): string {
  return "/api/owner-operations/established-promotion";
}

async function getPreview(server: Server): Promise<EstablishedPromotionPreview> {
  const response = await requestApi(server, "GET", promotionPath("preview"));
  assert.equal(response.status, 200, response.body);
  return JSON.parse(response.body) as EstablishedPromotionPreview;
}

function postPromotion(server: Server, preview: EstablishedPromotionPreview) {
  return requestApi(server, "POST", promotionPostPath(), {
    ...ownerHeaders(server),
    "x-crypto-edge-owner-session": preview.preview_id,
  }, JSON.stringify({ preview_id: preview.preview_id, confirmation: true }));
}

function ownerHeaders(server: Server): Record<string, string> {
  const address = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${address.port}`,
    "content-type": "application/json",
  };
}

function errorOf(body: string): string {
  return (JSON.parse(body) as { error: string }).error;
}

function listen(server: Server): Promise<void> {
  return new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolveClose, rejectClose) => server.close((error) => error ? rejectClose(error) : resolveClose()));
}

function requestApi(
  server: Server,
  method: string,
  path: string,
  headers: Record<string, string> = {},
  body?: string,
): Promise<{ status: number; body: string }> {
  const address = server.address() as AddressInfo;
  return new Promise((resolveRequest, rejectRequest) => {
    const req = request({ hostname: "127.0.0.1", port: address.port, method, path, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      res.on("end", () => resolveRequest({
        status: res.statusCode ?? 0,
        body: Buffer.concat(chunks).toString("utf8"),
      }));
    });
    req.once("error", rejectRequest);
    req.end(body);
  });
}

function isErrorCode(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === code);
}
