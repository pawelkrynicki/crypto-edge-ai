import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { after, describe, it } from "node:test";
import {
  calculateUniverseChecksum,
  ESTABLISHED_UNIVERSE_SCHEMA_VERSION,
  type EstablishedAddressUniverse,
  type EstablishedAddressUniverseEntry,
} from "../../data-poc/src/establishedAddressUniverse.js";
import {
  calculateFollowUpChecksum,
  createEmptyFollowUpStore,
  ingestFollowUpObservations,
  type FollowUpObservationCandidate,
  type FollowUpStore,
} from "../../data-poc/src/followUpBasket.js";
import { buildAIResearchContext, type AIResearchContext } from "../server/aiResearchContext.js";
import { reconcileAIResearchLifecycle } from "../server/aiResearchLifecycleReconciler.js";
import type { AIResearchProvider } from "../server/aiResearchProvider.js";
import { createAIAnalysisQueueStore } from "../server/aiResearchQueueStore.js";
import { createAIResearchService } from "../server/aiResearchService.js";
import { createAIResearchWorker } from "../server/aiResearchWorker.js";
import { PERSISTABLE_SCANNER_SAMPLE } from "../src/fixtures/persistableScannerSample.js";

const root = await mkdtemp(resolve(tmpdir(), "crypto-edge-ai-lifecycle-reconcile-"));
const fixturePath = resolve(root, "scanner.json");
const outputDirPath = resolve(root, "missing-output");
const followUpPath = resolve(root, "follow-up.json");
const establishedPath = resolve(root, "established.json");
const reportsPath = resolve(root, "missing-reports");
const ADDRESS = "0x1111111111111111111111111111111111111111";
const START = new Date("2026-08-20T12:00:00.000Z");

await writeFile(fixturePath, `${JSON.stringify(PERSISTABLE_SCANNER_SAMPLE)}\n`, "utf8");
after(async () => { await rm(root, { recursive: true, force: true }); });

describe("automatic AI lifecycle reconciliation", () => {
  it("queues one Follow-up identity, then remains idempotent", async () => {
    await writeFollowUp(fullFollowUp());
    await writeEstablished(emptyUniverse());
    const store = await createAIAnalysisQueueStore({ databaseFilePath: resolve(root, "follow-up.sqlite") });
    const first = await reconcile(store, { maxPerCycle: 25 });
    const second = await reconcile(store, { maxPerCycle: 25 });

    assert.deepEqual(first, { auto_eligible: 1, auto_examined: 1, auto_queued: 1, auto_already_current: 0, auto_insufficient: 0, auto_failed: 0 });
    assert.deepEqual(second, { auto_eligible: 1, auto_examined: 1, auto_queued: 0, auto_already_current: 1, auto_insufficient: 0, auto_failed: 0 });
    assert.equal(store.stats().records, 1);
    assert.equal(store.stats().queued, 1);
    store.close();
  });

  it("queues exactly one new identity when the canonical snapshot changes", async () => {
    let clock = START;
    const initial = fullFollowUp();
    await writeFollowUp(initial);
    await writeEstablished(emptyUniverse());
    const store = await createAIAnalysisQueueStore({ databaseFilePath: resolve(root, "snapshot-refresh.sqlite") });
    await reconcile(store, { now: () => clock });

    clock = new Date(START.getTime() + 60 * 60_000);
    await writeFollowUp(ingestFollowUpObservations(initial, [observation({ liquidity_usd: 55_000 })], clock.toISOString(), "scan_follow_up_refresh"));
    const refreshed = await reconcile(store, { now: () => clock });
    const repeated = await reconcile(store, { now: () => clock });

    assert.equal(refreshed.auto_queued, 1);
    assert.equal(repeated.auto_queued, 0);
    assert.equal(repeated.auto_already_current, 1);
    assert.equal(store.stats().records, 2);
    assert.equal(store.stats().queued, 2);
    store.close();
  });

  it("does not queue sparse Follow-up data, then queues one job after enrichment", async () => {
    let clock = START;
    const sparse = sparseFollowUp();
    await writeFollowUp(sparse);
    await writeEstablished(emptyUniverse());
    const store = await createAIAnalysisQueueStore({ databaseFilePath: resolve(root, "insufficient.sqlite") });
    const insufficient = await reconcile(store, { now: () => clock });
    assert.equal(insufficient.auto_insufficient, 1);
    assert.equal(insufficient.auto_queued, 0);
    assert.equal(store.stats().records, 0);

    clock = new Date(START.getTime() + 60 * 60_000);
    await writeFollowUp(ingestFollowUpObservations(sparse, [observation()], clock.toISOString(), "scan_follow_up_enriched"));
    const enriched = await reconcile(store, { now: () => clock });
    assert.equal(enriched.auto_queued, 1);
    assert.equal(store.stats().records, 1);
    store.close();
  });

  it("uses Main Radar as an identity source without symbol lookup", async () => {
    await writeFollowUp(createEmptyFollowUpStore(START));
    await writeEstablished(universeWithEntry({ display_name: "Configured Main Token", symbol_hint: "MAIN" }));
    const options = contextOptions();
    const context = await buildAIResearchContext("base", ADDRESS, "en", options);
    assert.equal(context.identity.contract_address, ADDRESS);
    assert.equal(context.symbol, "MAIN");
    assert.equal(context.research_state, "ESTABLISHED_RESEARCH");

    const store = await createAIAnalysisQueueStore({ databaseFilePath: resolve(root, "main-radar.sqlite") });
    const result = await reconcile(store);
    const repeated = await reconcile(store);
    assert.equal(result.auto_eligible, 1);
    assert.equal(result.auto_queued, 1);
    assert.equal(repeated.auto_already_current, 1);
    assert.equal(store.stats().records, 1);
    store.close();
  });

  it("does not treat a New Inbox-only identity as AI eligible", async () => {
    await writeFollowUp(createEmptyFollowUpStore(START));
    await writeEstablished(emptyUniverse());
    const store = await createAIAnalysisQueueStore({ databaseFilePath: resolve(root, "new-inbox.sqlite") });
    const result = await reconcile(store);
    assert.deepEqual(result, { auto_eligible: 0, auto_examined: 0, auto_queued: 0, auto_already_current: 0, auto_insufficient: 0, auto_failed: 0 });
    assert.equal(store.stats().records, 0);
    store.close();
  });

  it("keeps user locale and session requests on the one automatic shared job", async () => {
    await writeFollowUp(fullFollowUp());
    await writeEstablished(emptyUniverse());
    const store = await createAIAnalysisQueueStore({ databaseFilePath: resolve(root, "shared-users.sqlite") });
    const automatic = await reconcile(store);
    assert.equal(automatic.auto_queued, 1);
    const service = createAIResearchService({ ...contextOptions(), queueStore: store, providerEnabled: true, modelId: "gpt-5-mini", now: () => START });
    const [polish, english] = await Promise.all([
      service.generate({ chain: "base", contract_address: ADDRESS, locale: "pl", idempotency_key: "user-pl" }, "camp-user-a"),
      service.generate({ chain: "base", contract_address: ADDRESS, locale: "en", idempotency_key: "user-en" }, "camp-user-b"),
    ]);
    assert.equal(polish.analysis_id, english.analysis_id);
    assert.equal(store.stats().records, 1);
    assert.equal(store.stats().queued, 1);
    store.close();
  });

  it("runs reconciliation before claiming and preserves worker budget safety", async () => {
    await writeFollowUp(fullFollowUp());
    await writeEstablished(emptyUniverse());
    const store = await createAIAnalysisQueueStore({ databaseFilePath: resolve(root, "worker.sqlite") });
    let providerCalls = 0;
    const worker = createAIResearchWorker({
      ...contextOptions(),
      store,
      now: () => START,
      provider: mockProvider(() => { providerCalls += 1; }),
      limits: { maxAnalysesPerCycle: 1, maxAnalysesPerHour: 0, maxAttempts: 1 },
    });
    const blocked = await worker.runCycle();
    assert.equal(blocked.auto_queued, 1);
    assert.equal(blocked.claimed, 0);
    assert.equal(blocked.provider_calls, 0);
    assert.equal(providerCalls, 0);
    assert.equal(store.stats().queued, 1);
    store.close();
  });
});

async function reconcile(
  store: Awaited<ReturnType<typeof createAIAnalysisQueueStore>>,
  overrides: { now?: () => Date; maxPerCycle?: number; queueDepth?: number } = {},
) {
  return reconcileAIResearchLifecycle({
    ...contextOptions(),
    store,
    modelId: "gpt-5-mini",
    maxPerCycle: overrides.maxPerCycle,
    queueDepth: overrides.queueDepth,
    now: overrides.now ?? (() => START),
  });
}

function contextOptions() {
  return {
    scanner: { runtimeMode: "DEVELOPMENT_DEMO" as const, fixturePath, outputDirPath },
    followUp: { storePath: followUpPath, establishedUniverse: null, now: () => START },
    establishedUniverse: { storePath: establishedPath },
    reports: { reportsRootPath: reportsPath, now: START },
  };
}

function observation(overrides: Partial<FollowUpObservationCandidate> = {}): FollowUpObservationCandidate {
  return {
    candidate_id: "candidate-follow-up",
    symbol: "FUP",
    name: "Follow-up Token",
    chain: "base",
    contract_address: ADDRESS,
    pair_address: "0x3333333333333333333333333333333333333333",
    pair_created_at: "2026-07-01T00:00:00.000Z",
    price_usd: 1,
    market_cap_usd: 1_000_000,
    fdv_usd: 1_000_000,
    liquidity_usd: 40_000,
    volume_24h_usd: 100_000,
    volume_market_cap_ratio: 0.1,
    pair_age_days: 50,
    basic_filter_status: "passed_basic_filter",
    filter_reasons: [],
    discovery_basket: "new_emerging",
    observation_only: true,
    ...overrides,
  };
}

function fullFollowUp(): FollowUpStore {
  return ingestFollowUpObservations(createEmptyFollowUpStore(START), [observation()], START.toISOString(), "scan_follow_up");
}

function sparseFollowUp(): FollowUpStore {
  const seeded = fullFollowUp();
  const entries = seeded.entries.map((entry) => ({
    ...entry,
    last_checked_at: null,
    completed_checkpoints: [],
    last_valid_market_snapshot: null,
    latest_filter_result: null,
    latest_security_status: { status: "UNAVAILABLE" as const, source: null, checked_at: null, missing_data: [], risk_flags: [] },
  }));
  const base = { schema_version: seeded.schema_version, generated_at: START.toISOString(), entries, audit_log: seeded.audit_log };
  return { ...base, checksum: calculateFollowUpChecksum(base) };
}

async function writeFollowUp(store: FollowUpStore): Promise<void> {
  await writeFile(followUpPath, `${JSON.stringify(store)}\n`, "utf8");
}

function emptyUniverse(): EstablishedAddressUniverse {
  return universe([]);
}

function universeWithEntry(overrides: Partial<EstablishedAddressUniverseEntry> = {}): EstablishedAddressUniverse {
  return universe([{
    chain: "base",
    contract_address: ADDRESS,
    enabled: true,
    display_name: "Main Radar Token",
    symbol_hint: "RADAR",
    added_at: START.toISOString(),
    updated_at: START.toISOString(),
    added_by: "owner",
    entry_id: "est_1111111111111111",
    ...overrides,
  }]);
}

function universe(entries: EstablishedAddressUniverseEntry[]): EstablishedAddressUniverse {
  const base = { schema_version: ESTABLISHED_UNIVERSE_SCHEMA_VERSION, universe_version: "established-universe-v000001", generated_at: START.toISOString(), entries };
  return { ...base, checksum: calculateUniverseChecksum(base) };
}

async function writeEstablished(current: EstablishedAddressUniverse): Promise<void> {
  await writeFile(establishedPath, `${JSON.stringify({ schema_version: "established_universe_store_v1", current, history: [], audit_log: [] })}\n`, "utf8");
}

function mockProvider(onGenerate: () => void): AIResearchProvider {
  return {
    mode: "OPENAI",
    model: "gpt-5-mini",
    async generate(context) {
      onGenerate();
      return {
        raw_json: JSON.stringify(narrative(context)),
        model: "gpt-5-mini",
        token_usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
        latency_ms: 1,
        request_id: "lifecycle_reconcile_mock",
      };
    },
  };
}

function narrative(context: AIResearchContext) {
  const slot = (entry: { id: string; allowed_support_ids: string[] }, en: string, pl: string) => ({ id: entry.id, support_ids: [entry.allowed_support_ids[0]!], en, pl });
  return {
    narrative_version: "ai_research_narrative_v6",
    summary: slot(context.narrative_contract.slots.summary, "The recorded lifecycle evidence remains available for review.", "Zapisane dane cyklu życia pozostają dostępne do przeglądu."),
    fact_narratives: context.narrative_contract.slots.facts.map((entry) => slot(entry, "This recorded fact adds context.", "Ten zapisany fakt uzupełnia kontekst.")),
    risk_narratives: context.narrative_contract.slots.risks.map((entry) => slot(entry, "This recorded risk remains open for review.", "To zapisane ryzyko pozostaje otwarte do przeglądu.")),
    missing_narratives: context.narrative_contract.slots.missing_information.map((entry) => slot(entry, "This evidence gap limits the current view.", "Ta luka w danych ogranicza bieżący obraz.")),
  };
}
