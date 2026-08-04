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
    const actorOne = "camp-user-one";
    const actorTwo = "camp-user-two";
    const first = repository.transition({ actorId: actorOne, identity: IDENTITY, previousPrivateStatus: "NEW", newPrivateStatus: "FOLLOW_UP", systemStatus: "NEW", conditions: UNMET, overrideReason: "I want to monitor this earlier", sessionReference: "session-one" });
    assert.equal(first.system_status_at_decision, "NEW");
    assert.match(first.session_reference, /^sha256:/);
    assert.equal(repository.get(actorOne, IDENTITY)?.private_status, "FOLLOW_UP");
    assert.equal(repository.get(actorTwo, IDENTITY), null);
    const second = repository.transition({ actorId: actorOne, identity: IDENTITY, previousPrivateStatus: "FOLLOW_UP", newPrivateStatus: "MAIN_RADAR", systemStatus: "FOLLOW_UP", conditions: MET, overrideReason: null, sessionReference: "session-one" });
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
    assert.throws(() => repository.transition({ ...base, previousPrivateStatus: "FOLLOW_UP", newPrivateStatus: "NEW" as never, conditions: MET, overrideReason: null }), UserWorkspaceError);
    repository.close();
  });
});

describe("PC.1 session-derived lifecycle API", () => {
  it("rejects client-supplied user identity and keeps a trusted tester read-only", async () => {
    const database = resolve(await root(), "workspace.sqlite");
    const repository = await createUserWorkspaceRepository({ databaseFilePath: database });
    const server = createScannerApiServer({ runtimeMode: "DEVELOPMENT_DEMO", lifecycle: { workspace: repository } });
    await listen(server);
    try {
      const trusted = await requestApi(server, "GET", `/api/lifecycle/token?chain=base&contract_address=${ADDRESS}`);
      assert.equal(trusted.status, 200);
      assert.deepEqual((JSON.parse(trusted.body) as { actor: { capabilities: string[] } }).actor.capabilities, []);

      const camp = await requestApi(server, "POST", "/api/lifecycle/review-session/camp-user");
      assert.equal(camp.status, 200);
      const campCookie = cookie(camp);
      const rejected = await requestApi(server, "POST", "/api/lifecycle/token/status", { cookie: campCookie, "content-type": "application/json" }, JSON.stringify({ chain: "base", contract_address: ADDRESS, target_status: "FOLLOW_UP", override_reason: "reason", confirmation: true, user_id: "attacker" }));
      assert.equal(rejected.status, 400);
      assert.match(rejected.body, /LIFECYCLE_BODY_INVALID/);
    } finally { await close(server); repository.close(); }
  });

  it("uses the server-created CAMP session actor and does not expose its private state to another session", async () => {
    const database = resolve(await root(), "workspace.sqlite");
    const repository = await createUserWorkspaceRepository({ databaseFilePath: database });
    const server = createScannerApiServer({ runtimeMode: "DEVELOPMENT_DEMO", lifecycle: { workspace: repository } });
    await listen(server);
    try {
      const firstSession = await requestApi(server, "POST", "/api/lifecycle/review-session/camp-user");
      const firstCookie = cookie(firstSession);
      const moved = await requestApi(server, "POST", "/api/lifecycle/token/status", { cookie: firstCookie, "content-type": "application/json" }, JSON.stringify({ chain: "base", contract_address: ADDRESS, target_status: "FOLLOW_UP", override_reason: "early private review", confirmation: true }));
      assert.equal(moved.status, 200, moved.body);
      const movedBody = JSON.parse(moved.body) as { system_status: string; user_status: string; user_status_is_override: boolean; actor: { capabilities: string[] } };
      assert.equal(movedBody.system_status, "NEW");
      assert.equal(movedBody.user_status, "FOLLOW_UP");
      assert.equal(movedBody.user_status_is_override, true);
      assert.deepEqual(movedBody.actor.capabilities, ["CAMP_USER_WORKSPACE_WRITE"]);

      const secondSession = await requestApi(server, "POST", "/api/lifecycle/review-session/camp-user");
      const second = await requestApi(server, "GET", `/api/lifecycle/token?chain=base&contract_address=${ADDRESS}`, { cookie: cookie(secondSession) });
      const secondBody = JSON.parse(second.body) as { system_status: string; user_status: string; user_status_is_override: boolean };
      assert.equal(secondBody.system_status, "NEW");
      assert.equal(secondBody.user_status, "NEW");
      assert.equal(secondBody.user_status_is_override, false);

      const ownerSession = await requestApi(server, "POST", "/api/lifecycle/review-session/owner");
      assert.deepEqual((JSON.parse(ownerSession.body) as { actor: { capabilities: string[] } }).actor.capabilities, ["CAMP_USER_WORKSPACE_WRITE", "LIFECYCLE_SCAN_NOW"]);
    } finally { await close(server); repository.close(); }
  });

  it("ships a read-only lifecycle summary and visible, direct private-radar controls", async () => {
    const rootPath = await root();
    const repository = await createUserWorkspaceRepository({ databaseFilePath: resolve(rootPath, "workspace.sqlite") });
    const server = createScannerApiServer({ runtimeMode: "DEVELOPMENT_DEMO", lifecycle: { workspace: repository } });
    await listen(server);
    try {
      const summary = await requestApi(server, "GET", "/api/lifecycle/summary");
      assert.equal(summary.status, 200);
      assert.equal((JSON.parse(summary.body) as { schema_version: string }).schema_version, "lifecycle_summary_v1");
    } finally { await close(server); repository.close(); }
    const component = await readFile(resolve(import.meta.dirname, "..", "src", "components", "PersonalRadarPanel.tsx"), "utf8");
    const app = await readFile(resolve(import.meta.dirname, "..", "src", "ProductApp.tsx"), "utf8");
    assert.match(component, /Status systemowy/);
    assert.match(component, /Twój status/);
    assert.match(component, /Dodaj do dalszej obserwacji/);
    assert.match(component, /Przenieś do mojego Głównego Radaru/);
    assert.match(component, /Potwierdzam prywatną decyzję/);
    assert.match(app, /onRefresh=\{\(\) => void loadData\(\)\}/);
    assert.doesNotMatch(app, /runInternalBetaCollector|ALLOW_LIVE_PROVIDER_CALLS/);
  });

  it("keeps the PC.1 review launcher isolated, one-tab, and provider-free until an owner click", async () => {
    const launcher = await readFile(resolve(import.meta.dirname, "..", "..", "..", "scripts", "win", "start-pc1-lifecycle-radar-review.cmd"), "utf8");
    assert.match(launcher, /build:internal-beta/);
    assert.match(launcher, /crypto-edge-pc1-review-/);
    assert.match(launcher, /CRYPTO_EDGE_NEW_INBOX_STORE_PATH=%REVIEW_DATA_POC%/);
    assert.match(launcher, /CRYPTO_EDGE_USER_WORKSPACE_SQLITE_PATH=%REVIEW_UI%/);
    assert.match(launcher, /set "OPENAI_API_KEY="/);
    assert.match(launcher, /Honeypot\.is calls: 0/);
    assert.match(launcher, /\?pc1_review=1#candidate-results/);
    assert.equal((launcher.match(/start "" "http:\/\/127\.0\.0\.1:%UI_PORT%\//g) ?? []).length, 1);
    assert.doesNotMatch(launcher, /runInternalBetaCollector|curl |Invoke-WebRequest/i);
  });
});

async function workspace() {
  const database = resolve(await root(), "workspace.sqlite");
  return createUserWorkspaceRepository({ databaseFilePath: database });
}

async function root(): Promise<string> {
  const path = await mkdtemp(resolve(tmpdir(), "crypto-edge-pc1-workspace-"));
  roots.push(path);
  return path;
}

function listen(server: Server): Promise<void> { return new Promise((resolveListen) => server.listen(0, "127.0.0.1", () => resolveListen())); }
function close(server: Server): Promise<void> { return new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose())); }
function requestApi(server: Server, method: string, path: string, headers: Record<string, string> = {}, body?: string): Promise<{ status: number; body: string; headers: Record<string, string | string[] | undefined> }> {
  const port = (server.address() as AddressInfo).port;
  return new Promise((resolveRequest, reject) => {
    const req = request({ host: "127.0.0.1", port, path, method, headers }, (res) => {
      let response = "";
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => { response += chunk; });
      res.on("end", () => resolveRequest({ status: res.statusCode ?? 0, body: response, headers: res.headers }));
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}
function cookie(response: { headers: Record<string, string | string[] | undefined> }): string {
  const value = response.headers["set-cookie"];
  const header = Array.isArray(value) ? value[0] : value;
  assert.ok(header);
  return header.split(";", 1)[0]!;
}
