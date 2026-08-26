import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";
import { reconcilePrivateLifecycleRadarMutation } from "../src/ProductApp.js";
import { resolveResearchChecklist } from "../src/researchChecklistResolver.js";
import type { LifecycleRadarCard, LifecycleRadarView, LifecycleTokenView } from "../src/types/lifecycleTypes.js";
import type { UiTokenCandidate } from "../src/types/scannerTypes.js";
import { createResearchEvidenceRepository } from "../server/researchEvidenceRepository.js";

const ADDRESS = "0x1111111111111111111111111111111111111111";
const IDENTITY = `base:${ADDRESS}`;

test("private Radar reconciliation immediately moves one confirmed card without changing Product Radar", () => {
  const card = lifecycleCard();
  const radar = lifecycleRadar(card);
  const beforeProductRadar = structuredClone({ new_inbox: radar.new_inbox, follow_up: radar.follow_up, main_radar: radar.main_radar, summary: radar.summary });
  const toMain = reconcilePrivateLifecycleRadarMutation(radar, { ...tokenView("MAIN_RADAR", true), system_status: "FOLLOW_UP" })!;
  assert.equal(toMain.private_baskets.follow_up.total, 0);
  assert.equal(toMain.private_baskets.main_radar.total, 1);
  assert.equal(toMain.private_baskets.main_radar.cards[0]?.user_status, "MAIN_RADAR");
  assert.deepEqual({ new_inbox: toMain.new_inbox, follow_up: toMain.follow_up, main_radar: toMain.main_radar, summary: toMain.summary }, beforeProductRadar);

  const toFollowUp = reconcilePrivateLifecycleRadarMutation(toMain, tokenView("FOLLOW_UP", true))!;
  assert.equal(toFollowUp.private_baskets.follow_up.total, 1);
  assert.equal(toFollowUp.private_baskets.main_radar.total, 0);
  assert.equal(toFollowUp.private_baskets.follow_up.cards[0]?.user_status, "FOLLOW_UP");

  const removed = reconcilePrivateLifecycleRadarMutation(toFollowUp, tokenView("FOLLOW_UP", false))!;
  assert.equal(removed.private_baskets.follow_up.total, 1, "removal returns the card to its system Follow-up bucket");
  assert.equal(removed.private_baskets.follow_up.cards[0]?.user_status_is_override, false);
  assert.equal(removed.private_baskets.follow_up.cards[0]?.system_status, "FOLLOW_UP");
});

test("private research progress is actor-isolated for 100 users and never changes the canonical checklist", async (t) => {
  const root = await mkdtemp(resolve(tmpdir(), "crypto-edge-private-progress-"));
  const repository = await createResearchEvidenceRepository({ databaseFilePath: resolve(root, "research.sqlite") });
  t.after(async () => { repository.close(); await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 40 }); });
  const candidate = researchCandidate();
  const before = resolveResearchChecklist(candidate);
  for (const step of [1, 2, 3, 4, 5, 6, 7] as const) {
    assert.equal(repository.saveProgress({ actorId: "stage-user-a", chain: "base", contractAddress: ADDRESS, stepNumber: step, state: "IN_PROGRESS", now: new Date("2026-08-26T11:00:00.000Z") }).state, "IN_PROGRESS");
    assert.equal(repository.saveProgress({ actorId: "stage-user-a", chain: "base", contractAddress: ADDRESS, stepNumber: step, state: "REVIEWED", now: new Date("2026-08-26T11:01:00.000Z") }).state, "REVIEWED");
  }
  assert.equal(repository.listProgress("stage-user-a", "base", ADDRESS).length, 7);
  assert.deepEqual(repository.listProgress("stage-user-b", "base", ADDRESS), []);
  assert.equal(repository.saveProgress({ actorId: "stage-user-a", chain: "base", contractAddress: ADDRESS, stepNumber: 1, state: "NOT_STARTED", now: new Date("2026-08-26T11:02:00.000Z") }).state, "NOT_STARTED");
  assert.equal(repository.listProgress("stage-user-a", "base", ADDRESS).some((entry) => entry.step_number === 1), false, "reset leaves no duplicate private progress record");
  for (let index = 0; index < 100; index += 1) {
    if (index < 50) repository.saveProgress({ actorId: `synthetic-user-${String(index).padStart(3, "0")}`, chain: "BASE", contractAddress: ADDRESS, stepNumber: 2, state: "REVIEWED", now: new Date("2026-08-26T12:00:00.000Z") });
  }
  const reviewed = Array.from({ length: 50 }, (_, index) => repository.listProgress(`synthetic-user-${String(index).padStart(3, "0")}`, "base", ADDRESS));
  const notStarted = Array.from({ length: 50 }, (_, index) => repository.listProgress(`synthetic-user-${String(index + 50).padStart(3, "0")}`, "base", ADDRESS));
  assert.equal(reviewed.filter((entries) => entries.length === 1 && entries[0]?.step_number === 2 && entries[0]?.state === "REVIEWED").length, 50);
  assert.equal(notStarted.filter((entries) => entries.length === 0).length, 50);

  const after = resolveResearchChecklist(candidate);
  assert.deepEqual(systemChecklistInvariant(after), systemChecklistInvariant(before));
  assert.equal(after.steps.find((step) => step.number === 2)?.state, before.steps.find((step) => step.number === 2)?.state, "Deal Breakers is not resolved by private review");
});

function tokenView(userStatus: "FOLLOW_UP" | "MAIN_RADAR", override: boolean): LifecycleTokenView {
  return {
    identity: IDENTITY,
    system_status: "FOLLOW_UP",
    user_status: userStatus,
    user_status_is_override: override,
    conditions: { conditions_met: ["IDENTITY_VALID"], conditions_unmet: [], missing_data: [], risks: [], readiness: "CONDITIONS_MET", security_state: "CHECKED", verification_state: "VERIFIED" },
    actor: { role: "CAMP_USER", capabilities: ["CAMP_USER_WORKSPACE_WRITE"] },
  };
}

function lifecycleCard(): LifecycleRadarCard {
  return {
    ...tokenView("FOLLOW_UP", true), chain: "base", contract_address: ADDRESS, display_name: "Test", symbol: "TEST", first_seen_at: "2026-08-01T00:00:00.000Z", last_seen_at: "2026-08-26T00:00:00.000Z", snapshot_present: true, snapshot_absence_notice: false, market: null, follow_up: null,
  };
}

function lifecycleRadar(card: LifecycleRadarCard): LifecycleRadarView {
  const group = (cards: LifecycleRadarCard[]) => ({ total: cards.length, displayed: cards.length, limit: 24, next_cursor: null, cards });
  const empty = () => group([]);
  return {
    schema_version: "lifecycle_radar_view_v1",
    summary: { schema_version: "lifecycle_summary_v1", system_new_total: 0, system_follow_up_total: 1, system_main_radar_total: 0, follow_up_action_due: 0, follow_up_candidates_ready: 0, follow_up_displayed: 1, follow_up_store_version: "test", last_lifecycle_change_at: null, last_central_cycle_id: null, summary_as_of: null, last_completed_cycle_id: null, last_completed_cycle_at: null, delta_source: "NONE", last_change_summary: { added: 0, updated: 0, promoted_to_follow_up: 0, promoted_to_main_radar: 0, archived: 0, rejected: 0, duplicate_noop: 0 } },
    actor: card.actor,
    new_inbox: empty(),
    follow_up: { action_due: group([card]), candidates_ready: empty(), observed: empty() },
    main_radar: { total: 0 },
    private_new_total: 0,
    private_follow_up_total: 1,
    private_main_radar_total: 0,
    private_baskets: { new: empty(), follow_up: group([card]), main_radar: empty() },
  };
}

function systemChecklistInvariant(view: ReturnType<typeof resolveResearchChecklist>) {
  return {
    current_step: view.current_step,
    readiness: view.readiness,
    completeness: view.completeness,
    steps: view.steps,
    scorecard: view.effective_scorecard,
  };
}

function researchCandidate(): UiTokenCandidate {
  return {
    id: "candidate-a", runId: "run-a", symbol: "PASS", name: "Pass Token", chain: "base", dex: "uniswap", source: "dexscreener", contractAddress: ADDRESS, pairAddress: "0x2222222222222222222222222222222222222222", sourceUrl: "https://example.com/pair", discoveryBasket: "new_emerging", discoveryMethod: "dexscreener_latest_token_profiles", observationOnly: false, establishedEligible: false, universeVersion: null, universeEntryIndex: null, addressIdentityVerified: true,
    priceUsd: 1, marketCap: 1_000_000, fdvUsd: 1_000_000, liquidity: 120_000, volume24h: 100_000, volumeMarketCapRatio: 0.1, pairCreatedAt: "2026-01-01T00:00:00.000Z", pairAgeDays: 30, basicFilterStatus: "passed_basic_filter", securityLabel: "SECURITY_PASSED", finalLabel: "WATCHLIST", mainReason: "Eligible for further review", filterReasons: [], criticalReasons: [], warningReasons: [], finalReasons: [], missingData: [], riskFlags: [], security: { sources: ["goplus", "honeypot"], coverageStatus: null, honeypotStatus: "passed", buyTax: 3, sellTax: 4, contractVerified: true, ownershipStatus: "renounced", liquidityLocked: true, liquidityLockDays: 120, mintRisk: false, blacklistRisk: false, whitelistRisk: false, sellRestrictionRisk: false, proxyRisk: false, topWalletPct: 8.5, top10WalletsPct: 34.2, checkedAt: "2026-08-12T12:00:00.000Z" }, scorecard: null, lastCheckedAt: "2026-08-12T12:00:00.000Z",
  };
}
