import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, it } from "node:test";
import { applySystemLifecycle } from "../../data-poc/src/systemLifecycle.js";
import { createEmptyNewRecheckStore, finalizeNewRecheckStore, updateNewRecheckStore } from "../../data-poc/src/newRecheckStore.js";
import type { PersistableCandidate, PersistableScannerOutput } from "../../data-poc/src/persistableScannerModel.js";
import { createLifecycleService } from "../server/lifecycleService.js";
import { createUserWorkspaceRepository } from "../server/userWorkspaceRepository.js";

const ADDRESS = "0x1111111111111111111111111111111111111111";
const IDENTITY = `base:${ADDRESS}`;
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe("New recheck lifecycle read model", () => {
  it("uses a valid newer recheck observation on Radar without a provider request", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "new-recheck-ui-"));
    roots.push(root);
    const paths = { inbox: resolve(root, "lifecycle", "new-inbox.json"), audit: resolve(root, "lifecycle", "audit.json"), followUp: resolve(root, "follow-up", "store.json"), established: resolve(root, "established", "store.json"), recheck: resolve(root, "new-recheck", "store.json"), output: resolve(root, "output") };
    const original = candidate({ created_at: "2026-08-01T00:00:00.000Z", market_cap_usd: 1_000_000, price_usd: 1 });
    const snapshot = scanner(original);
    await applySystemLifecycle(snapshot, { newInboxStorePath: paths.inbox, auditStorePath: paths.audit, followUpStorePath: paths.followUp, establishedStorePath: paths.established, centralCycleId: "cycle_seed", now: new Date("2026-08-01T00:00:00.000Z") });
    const refreshed = candidate({ created_at: "2026-08-02T00:00:00.000Z", market_cap_usd: 900_000, price_usd: 2, liquidity_usd: 90_000, volume_24h_usd: 90_000, volume_market_cap_ratio: 0.1 });
    await updateNewRecheckStore(() => finalizeNewRecheckStore({
      ...createEmptyNewRecheckStore(new Date("2026-08-02T00:00:00.000Z")),
      entries: [{ identity: IDENTITY, chain: "base", contract_address: ADDRESS, first_seen_at: "2026-08-01T00:00:00.000Z", completed_checkpoints: [1], last_attempt_at: "2026-08-02T00:00:00.000Z", last_success_at: "2026-08-02T00:00:00.000Z", last_checkpoint: 1, next_checkpoint: 3, latest_source_timestamp: "2026-08-02T00:00:00.000Z", latest_normalized_candidate: refreshed, latest_filter_result: { status: "rejected_basic_filter", reasons: ["liquidity_below_30000"], evaluated_at: "2026-08-02T00:00:00.000Z" }, last_error_code: null }],
    }, new Date("2026-08-02T00:00:00.000Z")), paths.recheck);
    await mkdir(resolve(paths.output, snapshot.scan_run.run_id), { recursive: true });
    await writeFile(resolve(paths.output, snapshot.scan_run.run_id, "full_output.json"), `${JSON.stringify(snapshot)}\n`, "utf8");
    const workspace = await createUserWorkspaceRepository({ databaseFilePath: resolve(root, "workspace.sqlite") });
    try {
      const service = createLifecycleService({ scanner: { runtimeMode: "DEVELOPMENT_DEMO", outputDirPath: paths.output, allowFixtureFallback: false, now: new Date("2026-08-02T00:01:00.000Z") }, newInboxStorePath: paths.inbox, auditStorePath: paths.audit, followUpStorePath: paths.followUp, establishedStorePath: paths.established, newRecheckStorePath: paths.recheck, workspace });
      const radar = await service.radar({ actor_id: "camp-user", session_id: "session", role: "CAMP_USER", capabilities: [] }, { limit: 24, cursor: null });
      const card = radar.new_inbox.cards.find((item) => item.identity === IDENTITY);
      assert.equal(card?.market?.price_usd, 2);
      assert.equal(card?.market?.market_cap_usd, 900_000);
      assert.equal(card?.last_seen_at, "2026-08-02T00:00:00.000Z");
    } finally {
      workspace.close();
    }
  });
});

function scanner(value: PersistableCandidate): PersistableScannerOutput {
  return { provenance: { contract_version: "test", fixture_used: false } as unknown as PersistableScannerOutput["provenance"], scan_run: { run_id: "scan_new_recheck", source: "combined-scanner-poc", mode: "live", query: "test", filters: {}, limits: {}, started_at: value.created_at, finished_at: value.created_at, total_raw: 1, passed_basic_filter: 0, rejected_basic_filter: 1, security_checked: 0, security_passed: 0, needs_manual_verification: 0, critical_risk: 0, watchlist_candidates: 0, errors: [] }, candidates: [value], security_checks: [], scorecards: [] };
}

function candidate(overrides: Partial<PersistableCandidate>): PersistableCandidate {
  return { run_id: "scan_new_recheck", candidate_id: "candidate", symbol: "NEW", name: "New Token", chain: "base", contract_address: ADDRESS, pair_address: "0x2222222222222222222222222222222222222222", dex: "uniswap", source: "dexscreener", source_url: "https://dexscreener.com/base/token", price_usd: 1, market_cap_usd: 1_000_000, fdv_usd: 1_000_000, liquidity_usd: 1, volume_24h_usd: 1, volume_market_cap_ratio: 0.001, pair_created_at: "2026-01-01T00:00:00.000Z", pair_age_days: 200, basic_filter_status: "rejected_basic_filter", filter_reasons: ["liquidity_below_30000"], final_label: "REJECT", final_reasons: ["liquidity_below_30000"], created_at: "2026-08-01T00:00:00.000Z", discovery_basket: "new_emerging", observation_only: true, ...overrides };
}
