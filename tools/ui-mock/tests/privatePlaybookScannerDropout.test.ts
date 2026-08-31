import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, it } from "node:test";
import { bootstrapLifecycleReview } from "../../data-poc/src/systemLifecycle.js";
import type { PersistableCandidate, PersistableScannerOutput } from "../../data-poc/src/persistableScannerModel.js";
import { buildAIAnalysisCacheIdentity } from "../server/aiResearchQueueStore.js";
import { createResearchEvidenceRepository } from "../server/researchEvidenceRepository.js";
import { createScannerApiServer } from "../server/scannerApiServer.js";
import { createUserWorkspaceRepository } from "../server/userWorkspaceRepository.js";

const ADDRESS = "0x1111111111111111111111111111111111111111";
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true, maxRetries: 3, retryDelay: 25 })));
});

describe("retained private Playbook after scanner dropout", () => {
  it("keeps 100 CAMP workspaces writable and isolated after a canonical scanner swap and runtime restart", async () => {
    const root = await tempRoot();
    const paths = {
      output: resolve(root, "output"),
      inbox: resolve(root, "lifecycle", "new-inbox.json"),
      receipt: resolve(root, "lifecycle", "cycle-receipts.json"),
      audit: resolve(root, "lifecycle", "audit.json"),
      recheck: resolve(root, "new-recheck", "store.json"),
      followUp: resolve(root, "follow-up", "store.json"),
      established: resolve(root, "established", "store.json"),
      workspace: resolve(root, "state", "user-workspace.sqlite"),
      research: resolve(root, "state", "research-evidence.sqlite"),
      identities: resolve(root, "state", "camp-user-identities.json"),
    };
    const initial = scannerSnapshot("scan_initial", "2026-08-20T10:00:00.000Z", [candidate("scan_initial")]);
    const dropout = scannerSnapshot("scan_dropout", "2026-08-20T11:00:00.000Z", []);
    await writeSnapshot(paths.output, initial);
    await writeSnapshot(paths.output, dropout);
    await bootstrapLifecycleReview(initial, {
      newInboxStorePath: paths.inbox,
      cycleReceiptPath: paths.receipt,
      followUpStorePath: paths.followUp,
      establishedStorePath: paths.established,
      now: new Date("2026-08-20T10:01:00.000Z"),
    });

    const first = await startRuntime(paths);
    const users = await Promise.all(Array.from({ length: 100 }, () => createCampSession(first.origin)));
    try {
      await Promise.all(users.slice(0, 50).map((cookie) => setPrivateStatus(first.origin, cookie, "MAIN_RADAR")));
      await Promise.all(users.slice(50, 75).map((cookie) => setPrivateStatus(first.origin, cookie, "FOLLOW_UP")));

      const retainedA = await checklist(first.origin, users[0]!);
      const retainedB = await checklist(first.origin, users[50]!);
      assert.equal(retainedA.status, 200, retainedA.text);
      assert.equal(retainedB.status, 200, retainedB.text);
      assert.equal(retainedA.body.private_progress_writable, true);
      assert.equal(retainedB.body.private_progress_writable, true);
      assert.equal(retainedA.body.manual_evidence_writable, true);
      assert.equal(retainedB.body.manual_evidence_writable, true);
      assert.equal(retainedA.body.private_progress.length, 0);
      assert.equal(retainedB.body.private_progress.length, 0);

      const unassigned = await checklist(first.origin, users[75]!);
      assert.equal(unassigned.status, 404, unassigned.text);
      const rejectedProgress = await saveProgress(first.origin, users[75]!, "REVIEWED");
      assert.equal(rejectedProgress.status, 404, rejectedProgress.text);

      const savedA = await saveProgress(first.origin, users[0]!, "REVIEWED");
      const savedB = await saveProgress(first.origin, users[50]!, "IN_PROGRESS");
      assert.equal(savedA.status, 200, savedA.text);
      assert.equal(savedB.status, 200, savedB.text);
      assert.equal((await checklist(first.origin, users[0]!)).body.private_progress[0]?.state, "REVIEWED");
      assert.equal((await checklist(first.origin, users[50]!)).body.private_progress[0]?.state, "IN_PROGRESS");

      const evidenceA = await saveEvidence(first.origin, users[0]!);
      const evidenceB = await saveEvidence(first.origin, users[50]!);
      assert.equal(evidenceA.status, 200, evidenceA.text);
      assert.equal(evidenceB.status, 200, evidenceB.text);
      const verification = await fetch(`${first.origin}/api/manual-verification`, {
        method: "POST",
        headers: requestHeaders(first.origin, users[0]!),
        body: JSON.stringify({ chain: "base", contract_address: ADDRESS, verdict: "NEEDS_MORE_DATA", note: "Private source check remains incomplete." }),
      });
      assert.equal(verification.status, 200, await verification.clone().text());

      const states = await Promise.all(users.map(async (cookie) => {
        const response = await token(first.origin, cookie);
        assert.equal(response.status, 200, response.text);
        return response.body.user_status;
      }));
      assert.equal(states.filter((state) => state === "MAIN_RADAR").length, 50);
      assert.equal(states.filter((state) => state === "FOLLOW_UP").length, 25);
      assert.equal(states.filter((state) => state === "NEW").length, 25);
      const sharedSystemSummaries = await Promise.all(users.slice(0, 75).map((cookie) => radarSummary(first.origin, cookie)));
      assert.equal(new Set(sharedSystemSummaries.map((summary) => JSON.stringify(summary))).size, 1);

      const sharedAiKeys = new Set(users.map(() => buildAIAnalysisCacheIdentity(aiIdentity()).cache_key));
      assert.equal(sharedAiKeys.size, 1, "all users retain one canonical shared-AI identity");
      assert.equal(
        JSON.stringify(buildAIAnalysisCacheIdentity(aiIdentity())).includes("camp-user-"),
        false,
        "the AI cache input contains canonical facts, never private workspace state",
      );
    } finally {
      await stopRuntime(first);
    }

    const restarted = await startRuntime(paths);
    try {
      const afterA = await token(restarted.origin, users[0]!);
      const afterB = await token(restarted.origin, users[50]!);
      assert.equal(afterA.body.user_status, "MAIN_RADAR");
      assert.equal(afterB.body.user_status, "FOLLOW_UP");
      const progressA = await checklist(restarted.origin, users[0]!);
      const progressB = await checklist(restarted.origin, users[50]!);
      assert.equal(progressA.status, 200, progressA.text);
      assert.equal(progressB.status, 200, progressB.text);
      assert.equal(progressA.body.private_progress_writable, true);
      assert.equal(progressB.body.private_progress_writable, true);
      assert.equal(progressA.body.manual_evidence_writable, true);
      assert.equal(progressB.body.manual_evidence_writable, true);
      assert.equal(progressA.body.private_progress[0]?.state, "REVIEWED");
      assert.equal(progressB.body.private_progress[0]?.state, "IN_PROGRESS");
      assert.equal(progressA.body.current_step, progressB.body.current_step, "private progress cannot mutate the canonical current step");
    } finally {
      await stopRuntime(restarted);
    }
  });
});

type Runtime = {
  origin: string;
  server: Server;
  workspace: Awaited<ReturnType<typeof createUserWorkspaceRepository>>;
  research: Awaited<ReturnType<typeof createResearchEvidenceRepository>>;
};

async function startRuntime(paths: Record<string, string>): Promise<Runtime> {
  const workspace = await createUserWorkspaceRepository({ databaseFilePath: paths.workspace });
  const research = await createResearchEvidenceRepository({ databaseFilePath: paths.research });
  const server = createScannerApiServer({
    runtimeMode: "DEVELOPMENT_DEMO",
    scanner: { outputDirPath: paths.output, allowFixtureFallback: false },
    followUp: { storePath: paths.followUp },
    establishedUniverse: { storeFilePath: paths.established },
    lifecycle: {
      newInboxStorePath: paths.inbox,
      auditStorePath: paths.audit,
      cycleReceiptPath: paths.receipt,
      newRecheckStorePath: paths.recheck,
      workspace,
      defaultSessionRole: "CAMP_USER",
      campIdentityRegistryPath: paths.identities,
    },
    researchEvidence: { repository: research },
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", () => done()));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return { origin: `http://127.0.0.1:${address.port}`, server, workspace, research };
}

async function stopRuntime(runtime: Runtime): Promise<void> {
  await new Promise<void>((done, reject) => runtime.server.close((error) => error ? reject(error) : done()));
  runtime.workspace.close();
  runtime.research.close();
}

async function createCampSession(origin: string): Promise<string> {
  const response = await fetch(`${origin}/api/lifecycle/session`);
  assert.equal(response.status, 200, await response.clone().text());
  const cookie = response.headers.get("set-cookie")?.split(";", 1)[0];
  assert.ok(cookie);
  return cookie;
}

async function setPrivateStatus(origin: string, cookie: string, target: "MAIN_RADAR" | "FOLLOW_UP"): Promise<void> {
  const response = await fetch(`${origin}/api/lifecycle/token/status`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ chain: "base", contract_address: ADDRESS, target_status: target, override_reason: `Private ${target} organization`, confirmation: true }),
  });
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal((await response.json() as { system_status: string; user_status: string }).system_status, "NEW");
}

async function checklist(origin: string, cookie: string): Promise<{ status: number; body: ChecklistBody; text: string }> {
  const response = await fetch(`${origin}/api/research-checklist?chain=base&contract_address=${ADDRESS}`, { headers: { cookie } });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) as ChecklistBody : {} as ChecklistBody, text };
}

async function saveProgress(origin: string, cookie: string, state: "REVIEWED" | "IN_PROGRESS"): Promise<{ status: number; text: string }> {
  const response = await fetch(`${origin}/api/research-progress`, {
    method: "PUT",
    headers: requestHeaders(origin, cookie),
    body: JSON.stringify({ chain: "base", contract_address: ADDRESS, step_number: 1, state }),
  });
  return { status: response.status, text: await response.text() };
}

async function saveEvidence(origin: string, cookie: string): Promise<{ status: number; text: string }> {
  const response = await fetch(`${origin}/api/research-evidence`, {
    method: "PUT",
    headers: requestHeaders(origin, cookie),
    body: JSON.stringify({
      chain: "base",
      contract_address: ADDRESS,
      step_number: 3,
      item_key: "honeypot",
      manual_state: "MANUAL_VERIFIED",
      value_text: "no_honeypot",
      value_number: null,
      note: "Private source check.",
      source_tool: "Honeypot.is",
      evidence_url: null,
      observed_at: null,
    }),
  });
  return { status: response.status, text: await response.text() };
}

async function token(origin: string, cookie: string): Promise<{ status: number; body: { user_status: string }; text: string }> {
  const response = await fetch(`${origin}/api/lifecycle/token?chain=base&contract_address=${ADDRESS}`, { headers: { cookie } });
  const text = await response.text();
  return { status: response.status, body: JSON.parse(text) as { user_status: string }, text };
}

async function radarSummary(origin: string, cookie: string): Promise<Record<string, unknown>> {
  const response = await fetch(`${origin}/api/lifecycle/radar?limit=100`, { headers: { cookie } });
  assert.equal(response.status, 200, await response.clone().text());
  return (await response.json() as { summary: Record<string, unknown> }).summary;
}

function requestHeaders(origin: string, cookie: string): Record<string, string> {
  return { cookie, origin, "content-type": "application/json" };
}

function scannerSnapshot(runId: string, timestamp: string, candidates: PersistableCandidate[]): PersistableScannerOutput {
  return {
    provenance: {
      schema_version: "scanner_snapshot_v2",
      contract_version: "real_data_boundary_v1",
      generator_version: "private-playbook-dropout-test",
      environment: "INTERNAL_BETA",
      mode: "live",
      fixture_used: false,
      run_id: runId,
      generated_at: timestamp,
      finished_at: timestamp,
      source_ids: ["dexscreener"],
      policy_decisions: {},
    },
    scan_run: {
      run_id: runId,
      source: "combined-scanner-poc",
      mode: "live",
      query: "private-playbook-dropout-test",
      filters: {},
      limits: {},
      started_at: timestamp,
      finished_at: timestamp,
      total_raw: candidates.length,
      passed_basic_filter: candidates.length,
      rejected_basic_filter: 0,
      security_checked: 0,
      security_passed: 0,
      needs_manual_verification: 0,
      critical_risk: 0,
      watchlist_candidates: candidates.length,
      errors: [],
    },
    candidates,
    security_checks: [],
    scorecards: [],
  };
}

function candidate(runId: string): PersistableCandidate {
  return {
    run_id: runId,
    candidate_id: "candidate_private_dropout",
    symbol: "BAOBAO",
    name: "BAOBAO",
    chain: "base",
    contract_address: ADDRESS,
    pair_address: "0x2222222222222222222222222222222222222222",
    dex: "uniswap",
    source: "dexscreener",
    source_url: "https://example.invalid/baobao",
    price_usd: 1,
    market_cap_usd: 1_000_000,
    fdv_usd: 1_000_000,
    liquidity_usd: 50_000,
    volume_24h_usd: 100_000,
    volume_market_cap_ratio: 0.1,
    pair_created_at: "2026-08-01T10:00:00.000Z",
    pair_age_days: 19,
    basic_filter_status: "passed_basic_filter",
    filter_reasons: [],
    final_label: "WATCHLIST",
    final_reasons: [],
    created_at: "2026-08-20T10:00:00.000Z",
    discovery_basket: "new_emerging",
    observation_only: true,
  };
}

async function writeSnapshot(outputRoot: string, snapshot: PersistableScannerOutput): Promise<void> {
  const directory = resolve(outputRoot, snapshot.scan_run.run_id);
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, "full_output.json"), `${JSON.stringify(snapshot)}\n`, "utf8");
}

function aiIdentity() {
  return {
    chain: "base",
    contract_address: ADDRESS,
    snapshot_fingerprint: "a".repeat(64),
    prompt_version: "ai_research_prompt_v7",
    narrative_contract_version: "ai_research_narrative_v6",
    semantic_policy_version: "ai_research_semantic_policy_v3",
    composition_policy_version: "ai_research_composition_policy_v1",
    provider_wire_schema_version: "ai_research_wire_schema_v3",
    model_id: "gpt-5-mini",
    analysis_schema_version: "ai_research_brief_v2",
    locale: "en" as const,
  };
}

type ChecklistBody = {
  manual_evidence_writable: boolean;
  private_progress_writable: boolean;
  private_progress: Array<{ step_number: number; state: string }>;
  current_step: number;
};

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(resolve(tmpdir(), "crypto-edge-private-playbook-dropout-"));
  roots.push(root);
  return root;
}
