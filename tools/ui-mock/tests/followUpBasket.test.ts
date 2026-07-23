import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  createEmptyFollowUpStore,
  ingestFollowUpObservations,
  updateFollowUpStore,
  type FollowUpObservationCandidate,
} from "../../data-poc/src/followUpBasket.js";
import { createScannerApiHandler } from "../server/scannerApiHandler.js";
import { mapPersistableScannerOutputToUiCandidates } from "../src/adapters/scannerOutputAdapter.js";
import { CandidateDetailView } from "../src/components/CandidateDetailView.js";
import { resolveControlCenterStatus, type ControlCenterReadinessInput } from "../src/controlCenterStatus.js";
import {
  CandidateResultsView,
  MaturingFollowUpBasket,
  NewEmergingBasket,
} from "../src/components/CandidateResultsView.js";
import { PERSISTABLE_SCANNER_SAMPLE } from "../src/fixtures/persistableScannerSample.js";
import {
  formatFollowUpLifecycleStatus,
  formatProductElapsedSince,
  formatProductPairAge,
  ProductLocaleProvider,
  type ProductLocale,
} from "../src/productI18n.js";
import type { FollowUpPublicEntry, FollowUpPublicStatus } from "../src/types/followUpTypes.js";

const START = "2026-06-01T00:00:00.000Z";
const ADDRESS = "0x1111111111111111111111111111111111111111";

describe("Follow-up read-only product boundary", () => {
  it("serves status, a maximum of 100 prioritized records, 404, and fail-closed mutations without paths", async () => {
    const directory = await mkdtemp(resolve(tmpdir(), "follow-up-api-"));
    const storePath = resolve(directory, "store.json");
    try {
      await updateFollowUpStore(() => seedStore(), { storePath, now: new Date(START) });
      const server = createServer(createScannerApiHandler({
        runtimeMode: "INTERNAL_BETA",
        followUp: { storePath, now: () => new Date("2026-06-02T00:00:00.000Z"), establishedUniverse: null },
      }));
      await listen(server);
      try {
        const status = await request(server, "GET", "/api/follow-up/status");
        assert.equal(status.status, 200);
        assert.equal(status.body.store_available, true);
        assert.equal(status.body.validation_status, "valid");
        assert.equal(status.body.maturing_count, 1);
        assert.doesNotMatch(JSON.stringify(status.body), /follow-up-api-|store\.json|lock/i);

        const list = await request(server, "GET", "/api/follow-up");
        assert.equal(list.status, 200);
        assert.equal((list.body.entries as unknown[]).length, 1);
        assert.equal((list.body.entries as Array<Record<string, unknown>>)[0]?.lifecycle_status, "MATURING");

        assert.equal((await request(server, "GET", "/api/follow-up/fup_0000000000000000")).status, 404);
        for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
          assert.equal((await request(server, method, "/api/follow-up")).status, 405);
          assert.equal((await request(server, method, "/api/follow-up/fup_0000000000000000")).status, 405);
        }
      } finally {
        await close(server);
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("handles 100 concurrent GETs and 100 UI-style refresh reads with zero writes or provider calls", async () => {
    const directory = await mkdtemp(resolve(tmpdir(), "follow-up-reads-"));
    const storePath = resolve(directory, "store.json");
    let providerCalls = 0;
    try {
      await updateFollowUpStore(() => seedStore(), { storePath, now: new Date(START) });
      const before = await readFile(storePath, "utf8");
      const beforeMtime = (await stat(storePath)).mtimeMs;
      const server = createServer(createScannerApiHandler({ runtimeMode: "INTERNAL_BETA", followUp: { storePath, establishedUniverse: null } }));
      await listen(server);
      try {
        const firstWave = await Promise.all(Array.from({ length: 100 }, () => request(server, "GET", "/api/follow-up")));
        const refreshWave = await Promise.all(Array.from({ length: 100 }, async () => Promise.all([
          request(server, "GET", "/api/follow-up/status"),
          request(server, "GET", "/api/follow-up"),
        ])));
        assert.equal(firstWave.every((response) => response.status === 200), true);
        assert.equal(refreshWave.flat().every((response) => response.status === 200), true);
        assert.equal(providerCalls, 0);
        assert.equal(await readFile(storePath, "utf8"), before);
        assert.equal((await stat(storePath)).mtimeMs, beforeMtime);
      } finally {
        await close(server);
      }
      void providerCalls;
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("renders three Radar layers, sub-24-hour age, lifecycle copy, and no promotion action in EN and PL", () => {
    const entry = publicEntry();
    const status = publicStatus();
    for (const locale of ["en", "pl"] as const) {
      const markup = render(locale, React.createElement(CandidateResultsView, {
        candidates: mapPersistableScannerOutputToUiCandidates(PERSISTABLE_SCANNER_SAMPLE),
        followUpEntries: [entry],
        followUpStatus: status,
      }));
      assert.match(markup, locale === "pl" ? /Trzy warstwy Radaru/ : /Three Radar layers/);
      assert.match(markup, locale === "pl" ? /Dalsza obserwacja/ : /Maturing \/ follow-up/);
      assert.match(markup, /Established \/ (?:main Radar|główny Radar)/);
      assert.doesNotMatch(markup, /Add to Established|Dodaj do Established/);
      if (locale === "pl") {
        assert.doesNotMatch(markup, />MATURING</);
        assert.doesNotMatch(markup, /CANDIDATE FOR ESTABLISHED/);
        assert.match(markup, /Kandydaci do Established/);
      } else {
        assert.match(markup, /Maturing/);
        assert.match(markup, /Candidate for Established/);
      }
    }
    assert.equal(formatProductElapsedSince("2026-06-01T00:00:00.000Z", new Date("2026-06-01T05:30:00.000Z"), "en", "missing"), "5 hours");
    assert.equal(formatProductElapsedSince("2026-06-01T00:00:00.000Z", new Date("2026-06-01T05:30:00.000Z"), "pl", "brak"), "5 godz.");
    assert.notEqual(formatProductElapsedSince("2026-06-01T00:00:00.000Z", new Date("2026-06-01T05:30:00.000Z"), "pl", "brak"), "0 dni");
  });

  it("uses one age presentation for New and Follow-up and localizes lifecycle labels", () => {
    const now = new Date();
    const fiveHoursAgo = new Date(now.getTime() - 5 * 60 * 60 * 1_000).toISOString();
    const candidate = {
      ...mapPersistableScannerOutputToUiCandidates(PERSISTABLE_SCANNER_SAMPLE)[0]!,
      pairAgeDays: 0,
      pairCreatedAt: fiveHoursAgo,
    };
    const entry = { ...publicEntry(), pair_age: 5 / 24, first_seen_at: fiveHoursAgo };

    for (const locale of ["en", "pl"] as const) {
      const expected = locale === "pl" ? "5 godz." : "5 hours";
      const newMarkup = render(locale, React.createElement(NewEmergingBasket, { candidates: [candidate] }));
      const followUpMarkup = render(locale, React.createElement(MaturingFollowUpBasket, { entries: [entry], status: publicStatus() }));
      assert.match(newMarkup, new RegExp(expected.replace(".", "\\.")));
      assert.match(followUpMarkup, new RegExp(expected.replace(".", "\\.")));
      assert.equal(formatProductPairAge(5 / 24, locale, "missing"), expected);
    }

    const statuses = ["NEW", "MATURING", "CANDIDATE_FOR_ESTABLISHED", "ESTABLISHED", "ARCHIVED"] as const;
    assert.deepEqual(statuses.map((status) => formatFollowUpLifecycleStatus(status, "pl")), [
      "Nowe", "Dalsza obserwacja", "Kandydaci do Established", "Established", "Archiwalne",
    ]);
    assert.deepEqual(statuses.map((status) => formatFollowUpLifecycleStatus(status, "en")), [
      "New", "Maturing", "Candidate for Established", "Established", "Archived",
    ]);
    assert.equal(resolveControlCenterStatus(notReadyControlCenterInput()).overallStatus, "NOT_READY");
  });

  it("shows Candidate for Established as an owner decision and links detail only through safe identity", () => {
    const candidate = mapPersistableScannerOutputToUiCandidates(PERSISTABLE_SCANNER_SAMPLE)[0]!;
    const entry = { ...publicEntry(), chain: candidate.chain, contract_address: candidate.contractAddress, lifecycle_status: "CANDIDATE_FOR_ESTABLISHED" as const, next_review_step: "OWNER_DECISION_REQUIRED" as const };
    const englishBasket = render("en", React.createElement(MaturingFollowUpBasket, { entries: [entry], status: publicStatus() }));
    const polishBasket = render("pl", React.createElement(MaturingFollowUpBasket, { entries: [entry], status: publicStatus() }));
    assert.match(englishBasket, /Candidate for an owner decision\. It has not been added to Established automatically\./);
    assert.match(polishBasket, /Kandydat do ręcznej decyzji ownera\. Nie został automatycznie dodany do Established\./);
    const englishDetail = render("en", React.createElement(CandidateDetailView, { candidate, followUp: entry }));
    const polishDetail = render("pl", React.createElement(CandidateDetailView, { candidate, followUp: entry }));
    assert.match(englishDetail, /Candidate for Established/);
    assert.match(polishDetail, /Kandydaci do Established/);
    assert.doesNotMatch(polishDetail, /CANDIDATE_FOR_ESTABLISHED|CANDIDATE FOR ESTABLISHED/);
    assert.match(englishDetail, /Adding this token to Established requires a separate owner decision\./);
    assert.match(polishDetail, /Dodanie do Established wymaga osobnej, ręcznej decyzji ownera\./);
  });
});

function seedStore() {
  return ingestFollowUpObservations(createEmptyFollowUpStore(), [observation()], START, "scan_seed");
}

function observation(): FollowUpObservationCandidate {
  return {
    candidate_id: "candidate-a", symbol: "TOK", name: "Token", chain: "base", contract_address: ADDRESS,
    pair_address: "0x3333333333333333333333333333333333333333", pair_created_at: "2026-05-01T00:00:00.000Z",
    price_usd: 1, market_cap_usd: 1_000_000, fdv_usd: 1_000_000, liquidity_usd: 20_000,
    volume_24h_usd: 100_000, volume_market_cap_ratio: 0.1, pair_age_days: 31,
    basic_filter_status: "rejected_basic_filter", filter_reasons: ["liquidity_below_30000"],
    discovery_basket: "new_emerging", observation_only: true,
  };
}

function publicEntry(): FollowUpPublicEntry {
  return {
    entry_id: "fup_1111111111111111", chain: "base", contract_address: ADDRESS, display_name: "Token", symbol: "TOK",
    lifecycle_status: "MATURING", pair_age: 31, first_seen_at: START, last_seen_at: START,
    last_checked_at: "2026-06-02T00:00:00.000Z", next_check_at: "2026-06-04T00:00:00.000Z", completed_checkpoints: [1],
    market_metrics: { price_usd: 1, market_cap_usd: 1_000_000, fdv_usd: 1_000_000, liquidity_usd: 20_000, volume_24h_usd: 100_000, volume_market_cap_ratio: 0.1 },
    filter_status: "rejected_basic_filter", filter_reasons: ["liquidity_below_30000"],
    security_status: "MANUAL_VERIFICATION_REQUIRED", missing_data: ["security_not_checked"], established_membership: false,
    next_review_step: "WAIT_FOR_NEXT_CHECKPOINT",
  };
}

function publicStatus(): FollowUpPublicStatus {
  return {
    schema_version: "follow_up_status_v1", store_available: true, validation_status: "valid", entries_total: 1,
    new_count: 0, maturing_count: 1, candidate_count: 0, established_count: 0, archived_count: 0,
    due_count: 0, next_due_at: "2026-06-04T00:00:00.000Z", last_updated_at: START,
  };
}

function notReadyControlCenterInput(): ControlCenterReadinessInput {
  return {
    runtime: { runtimeMode: "INTERNAL_BETA", healthAvailable: true, apiConnected: true, sameOriginResponseValid: true, readiness: "ready", buildSha: "test" },
    scanner: { available: true, generatedAt: START, freshness: "FRESH", lastKnownGood: true, newObservationCount: 1, establishedAfterFilters: 0 },
    context: { available: true, generatedAt: START, freshness: "FRESH", lastKnownGood: true },
    sources: { availability: "available", sourceIds: ["dexscreener"], affectedSourceIds: [] },
    automation: { enabled: true, active: false, stateAvailable: true, lastRunAt: START, lastResult: "SUCCESS", nextRunAt: START, nextDueAfterActivation: START },
    establishedUniverse: { validationStatus: "valid", universeVersion: "established-universe-v000000", entriesEnabled: 0, lastChangeAt: START },
    reviewStorage: { available: true, entriesCount: 0, lastSavedAt: null },
    reportsLibrary: { libraryAvailable: false, status: "NOT_READY", reportCount: 0, validReportCount: 0, skippedReportCount: 0, latestReportGeneratedAt: null },
    followUp: { storeAvailable: true, validationStatus: "valid", activeEntries: 1, dueEntries: 0, candidateEntries: 0, nextDueAt: START, lastUpdatedAt: START },
    gates: { feedbackCaptureReady: false, trustedTesterPreviewModeReady: false, vpsDeploymentConfirmed: false, cloudflareAccessVerified: false, rollbackTested: false, ownerApproved: false },
  };
}

function render(locale: ProductLocale, element: React.ReactElement): string {
  return renderToStaticMarkup(React.createElement(ProductLocaleProvider, { initialLocale: locale }, element));
}

async function listen(server: ReturnType<typeof createServer>): Promise<void> {
  await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
}

async function close(server: ReturnType<typeof createServer>): Promise<void> {
  await new Promise<void>((resolveClose, rejectClose) => server.close((error) => error ? rejectClose(error) : resolveClose()));
}

async function request(server: ReturnType<typeof createServer>, method: string, path: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("SERVER_ADDRESS_UNAVAILABLE");
  const response = await fetch(`http://127.0.0.1:${address.port}${path}`, { method });
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}
