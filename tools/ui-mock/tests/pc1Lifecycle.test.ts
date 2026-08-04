import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { request, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, it } from "node:test";
import type { LifecycleConditions } from "../../data-poc/src/systemLifecycle.js";
import { createScannerApiServer } from "../server/scannerApiServer.js";
import { createUserWorkspaceRepository, UserWorkspaceError } from "../server/userWorkspaceRepository.js";

const ADDRESS = "0x1111111111111111111111111111111111111111";
const IDENTITY = `base:${ADDRESS}`;
const roots: string[] = [];
const MET: LifecycleConditions = { conditions_met: ["IDENTITY_VALID"], conditions_unmet: [], missing_data: [], risks: [], readiness: "CONDITIONS_MET", security_state: "CHECKED", verification_state: "VERIFIED" };
const UNMET: LifecycleConditions = { conditions_met: ["IDENTITY_VALID"], conditions_unmet: ["PROMOTION_RESOLVER_READY"], missing_data: ["FOLLOW_UP_CHECK"], risks: [], readiness: "CONDITIONS_UNMET", security_state: "NOT_CHECKED", verification_state: "VERIFICATION_REQUIRED" };

afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe("PC.1 private workspace repository", () => {
  it("keeps private forward decisions separate per server actor, with an auditable override", async () => {
    const repository = await workspace();
    const first = repository.transition({ actorId: "camp-user-one", identity: IDENTITY, previousPrivateStatus: "NEW", newPrivateStatus: "FOLLOW_UP", systemStatus: "NEW", conditions: UNMET, overrideReason: "I want to monitor this earlier", sessionReference: "session-one" });
    assert.match(first.session_reference, /^sha256:/);
    assert.equal(repository.get("camp-user-two", IDENTITY), null);
    const second = repository.transition({ actorId: "camp-user-one", identity: IDENTITY, previousPrivateStatus: "FOLLOW_UP", newPrivateStatus: "MAIN_RADAR", systemStatus: "FOLLOW_UP", conditions: MET, overrideReason: null, sessionReference: "session-one" });
    assert.equal(second.new_private_status, "MAIN_RADAR");
    assert.equal(repository.integrity().audits, 2);
    repository.close();
  });

  it("requires an override reason only when conditions are unmet and rejects invalid, duplicate, and backward writes", async () => {
    const repository = await workspace();
    const base = { actorId: "camp-user-one", identity: IDENTITY, previousPrivateStatus: "NEW" as const, newPrivateStatus: "FOLLOW_UP" as const, systemStatus: "NEW" as const, sessionReference: "session-one" };
    assert.throws(() => repository.transition({ ...base, conditions: UNMET, overrideReason: null }), (error: unknown) => error instanceof UserWorkspaceError && error.code === "WORKSPACE_OVERRIDE_REASON_REQUIRED");
    assert.throws(() => repository.transition({ ...base, identity: "base:not-an-address", conditions: MET, overrideReason: null }), UserWorkspaceError);
    repository.transition({ ...base, conditions: MET, overrideReason: null });
    assert.throws(() => repository.transition({ ...base, conditions: MET, overrideReason: null }), (error: unknown) => error instanceof UserWorkspaceError && error.code === "WORKSPACE_DUPLICATE");
    repository.close();
  });
});

describe("PC.1 bounded lifecycle Radar API", () => {
  it("derives actors only from sessions, keeps trusted tester read-only, and bounds public Radar reads", async () => {
    const database = resolve(await root(), "workspace.sqlite");
    const repository = await createUserWorkspaceRepository({ databaseFilePath: database });
    const server = createScannerApiServer({ runtimeMode: "DEVELOPMENT_DEMO", lifecycle: { workspace: repository } });
    await listen(server);
    try {
      const trusted = await requestApi(server, "GET", `/api/lifecycle/token?chain=base&contract_address=${ADDRESS}`);
      assert.deepEqual((JSON.parse(trusted.body) as { actor: { capabilities: string[] } }).actor.capabilities, []);
      const radar = await requestApi(server, "GET", "/api/lifecycle/radar?limit=24");
      const radarBody = JSON.parse(radar.body) as { schema_version: string; new_inbox: { cards: unknown[]; limit: number }; follow_up: { action_due: { cards: unknown[] } } };
      assert.equal(radar.status, 200, radar.body);
      assert.equal(radarBody.schema_version, "lifecycle_radar_view_v1");
      assert.equal(radarBody.new_inbox.limit, 24);
      assert.equal(Array.isArray(radarBody.follow_up.action_due.cards), true);
      assert.equal((await requestApi(server, "GET", "/api/lifecycle/radar?limit=101")).status, 400);
      assert.equal((await requestApi(server, "GET", "/api/lifecycle/radar?cursor=not-a-valid-cursor")).status, 400);
      assert.equal((await requestApi(server, "GET", "/api/lifecycle/new-inbox")).status, 403);
      assert.equal((await requestApi(server, "GET", "/api/lifecycle/workspace/integrity")).status, 403);
      const camp = await requestApi(server, "POST", "/api/lifecycle/review-session/camp-user");
      const rejected = await requestApi(server, "POST", "/api/lifecycle/token/status", { cookie: cookie(camp), "content-type": "application/json" }, JSON.stringify({ chain: "base", contract_address: ADDRESS, target_status: "FOLLOW_UP", override_reason: "reason", confirmation: true, user_id: "attacker" }));
      assert.equal(rejected.status, 400);
    } finally { await close(server); repository.close(); }
  });

  it("uses a server-created CAMP actor without exposing another actor's private state", async () => {
    const database = resolve(await root(), "workspace.sqlite");
    const repository = await createUserWorkspaceRepository({ databaseFilePath: database });
    const server = createScannerApiServer({ runtimeMode: "DEVELOPMENT_DEMO", lifecycle: { workspace: repository } });
    await listen(server);
    try {
      const first = await requestApi(server, "POST", "/api/lifecycle/review-session/camp-user");
      const moved = await requestApi(server, "POST", "/api/lifecycle/token/status", { cookie: cookie(first), "content-type": "application/json" }, JSON.stringify({ chain: "base", contract_address: ADDRESS, target_status: "FOLLOW_UP", override_reason: "early private review", confirmation: true }));
      assert.equal(moved.status, 200, moved.body);
      const second = await requestApi(server, "POST", "/api/lifecycle/review-session/camp-user");
      const view = await requestApi(server, "GET", `/api/lifecycle/token?chain=base&contract_address=${ADDRESS}`, { cookie: cookie(second) });
      const body = JSON.parse(view.body) as { user_status: string; user_status_is_override: boolean };
      assert.equal(body.user_status, "NEW");
      assert.equal(body.user_status_is_override, false);
    } finally { await close(server); repository.close(); }
  });

  it("uses one canonical Radar request for up to 100 cards and keeps private UI compact and localized", async () => {
    const source = await readFile(resolve(import.meta.dirname, "..", "src", "services", "lifecycleDataSource.ts"), "utf8");
    const component = await readFile(resolve(import.meta.dirname, "..", "src", "components", "PersonalRadarPanel.tsx"), "utf8");
    const results = await readFile(resolve(import.meta.dirname, "..", "src", "components", "CandidateResultsView.tsx"), "utf8");
    const presentation = await readFile(resolve(import.meta.dirname, "..", "src", "lifecyclePresentation.ts"), "utf8");
    assert.match(source, /\/api\/lifecycle\/radar\?limit=24/);
    assert.match(component, /initialView/);
    assert.match(component, /compact/);
    assert.match(results, /data-pc1-review-switch="global"/);
    assert.equal((results.match(/data-pc1-review-switch="global"/g) ?? []).length, 1);
    assert.match(presentation, /Status systemowy/);
    assert.match(presentation, /System status/);
    assert.doesNotMatch(component, /conditions_met\.join/);
  });

  it("keeps the review launcher isolated, detects occupied ports, and opens one provider-free tab", async () => {
    const launcher = await readFile(resolve(import.meta.dirname, "..", "..", "..", "scripts", "win", "start-pc1-lifecycle-radar-review.cmd"), "utf8");
    assert.match(launcher, /build:internal-beta/);
    assert.match(launcher, /crypto-edge-pc1-review-/);
    assert.match(launcher, /netstat -ano/);
    assert.match(launcher, /Port %%P/);
    assert.match(launcher, /set "OPENAI_API_KEY="/);
    assert.match(launcher, /Honeypot\.is calls: 0/);
    assert.equal((launcher.match(/start "" "http:\/\/127\.0\.0\.1:%UI_PORT%\//g) ?? []).length, 1);
    assert.doesNotMatch(launcher, /runInternalBetaCollector|curl |Invoke-WebRequest/i);
  });
});

async function workspace() { return createUserWorkspaceRepository({ databaseFilePath: resolve(await root(), "workspace.sqlite") }); }
async function root(): Promise<string> { const path = await mkdtemp(resolve(tmpdir(), "crypto-edge-pc1-workspace-")); roots.push(path); return path; }
function listen(server: Server): Promise<void> { return new Promise((done) => server.listen(0, "127.0.0.1", () => done())); }
function close(server: Server): Promise<void> { return new Promise((done, reject) => server.close((error) => error ? reject(error) : done())); }
function requestApi(server: Server, method: string, path: string, headers: Record<string, string> = {}, body?: string): Promise<{ status: number; body: string; headers: Record<string, string | string[] | undefined> }> {
  const port = (server.address() as AddressInfo).port;
  return new Promise((done, reject) => {
    const req = request({ host: "127.0.0.1", port, path, method, headers }, (res) => { let response = ""; res.setEncoding("utf8"); res.on("data", (chunk: string) => { response += chunk; }); res.on("end", () => done({ status: res.statusCode ?? 0, body: response, headers: res.headers })); });
    req.on("error", reject); if (body) req.write(body); req.end();
  });
}
function cookie(response: { headers: Record<string, string | string[] | undefined> }): string { const value = response.headers["set-cookie"]; const header = Array.isArray(value) ? value[0] : value; assert.ok(header); return header.split(";", 1)[0]!; }
