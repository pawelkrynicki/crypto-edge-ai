import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { request as httpRequest, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, it } from "node:test";
import {
  createCampUserIdentityRegistry,
  getDefaultCampUserIdentityRegistryPath,
} from "../server/campUserIdentityRegistry.js";
import { buildAIAnalysisCacheIdentity } from "../server/aiResearchQueueStore.js";
import { resolveFeedbackDatabasePath } from "../server/feedbackStore.js";
import { createPc1SessionContextService } from "../server/lifecycleSession.js";
import { createResearchEvidenceRepository, getDefaultResearchEvidenceDatabasePath } from "../server/researchEvidenceRepository.js";
import { createScannerApiServer } from "../server/scannerApiServer.js";
import { createUserWorkspaceRepository, getDefaultUserWorkspaceDatabasePath } from "../server/userWorkspaceRepository.js";

const ADDRESS = "0x1111111111111111111111111111111111111111";
const IDENTITY = `base:${ADDRESS}`;
const CONDITIONS = {
  conditions_met: ["IDENTITY_VALID"],
  conditions_unmet: [],
  missing_data: [],
  risks: [],
  readiness: "CONDITIONS_MET" as const,
  security_state: "CHECKED" as const,
  verification_state: "VERIFIED" as const,
};
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("persistent CAMP user identity", () => {
  it("uses explicit stable state-root paths for every persisted CAMP private store", async () => {
    const stateRoot = await tempRoot();
    const identityPath = resolve(stateRoot, "camp-user-identities.json");
    const workspacePath = resolve(stateRoot, "user-workspace.sqlite");
    const researchPath = resolve(stateRoot, "research-evidence.sqlite");
    const feedbackPath = resolve(stateRoot, "tester-feedback.sqlite");
    assert.equal(getDefaultCampUserIdentityRegistryPath({ CRYPTO_EDGE_CAMP_IDENTITY_REGISTRY_PATH: identityPath }), identityPath);
    assert.equal(getDefaultUserWorkspaceDatabasePath({ CRYPTO_EDGE_USER_WORKSPACE_SQLITE_PATH: workspacePath }), workspacePath);
    assert.equal(getDefaultResearchEvidenceDatabasePath({ CRYPTO_EDGE_RESEARCH_EVIDENCE_SQLITE_PATH: researchPath }), researchPath);
    assert.equal(resolveFeedbackDatabasePath(feedbackPath), feedbackPath);
  });

  it("uses persistent HttpOnly opaque cookies without storing the raw token", async () => {
    const root = await tempRoot();
    const registryPath = resolve(root, "state", "camp-user-identities.json");
    const first = createPc1SessionContextService({ defaultRole: "CAMP_USER", campIdentityRegistryPath: registryPath });
    const userA = first.resolve(request());
    const userB = first.resolve(request());
    assert.ok(userA.setCookie);
    assert.ok(userB.setCookie);
    assert.notEqual(userA.context.actor_id, userB.context.actor_id);
    assert.match(userA.setCookie, /HttpOnly/);
    assert.match(userA.setCookie, /SameSite=Lax/);
    assert.match(userA.setCookie, /Max-Age=15552000/);
    assert.doesNotMatch(userA.setCookie, /Secure/);

    const userACookie = cookiePair(userA.setCookie);
    const sameRuntime = first.resolve(request(userACookie));
    assert.equal(sameRuntime.context.actor_id, userA.context.actor_id);

    const restarted = createPc1SessionContextService({ defaultRole: "CAMP_USER", campIdentityRegistryPath: registryPath });
    const restoredA = restarted.resolve(request(userACookie));
    assert.equal(restoredA.context.actor_id, userA.context.actor_id);
    assert.equal(restoredA.setCookie, undefined);

    const tampered = restarted.resolve(request(tamperCookie(userACookie)));
    assert.notEqual(tampered.context.actor_id, userA.context.actor_id);
    assert.ok(tampered.setCookie);
    const serialized = await readFile(registryPath, "utf8");
    assert.equal(serialized.includes(cookieToken(userACookie)), false);
    assert.match(serialized, /"sha256:[a-f0-9]{64}"/);
    assert.equal(createCampUserIdentityRegistry({ databaseFilePath: registryPath }).integrity().identities, 3);
  });

  it("persists 100 isolated private workspaces and progress across restart and release roots", async () => {
    const stateRoot = await tempRoot();
    const releaseRootA = resolve(await tempRoot(), "CAMP2026-VPS-RC2");
    const releaseRootB = resolve(await tempRoot(), "CAMP2026-VPS-RC3");
    const identityRegistryPath = resolve(stateRoot, "camp-user-identities.json");
    const workspacePath = resolve(stateRoot, "user-workspace.sqlite");
    const researchPath = resolve(stateRoot, "research-evidence.sqlite");
    const serviceA = createPc1SessionContextService({ defaultRole: "CAMP_USER", campIdentityRegistryPath: identityRegistryPath });
    const users = Array.from({ length: 100 }, () => {
      const session = serviceA.resolve(request());
      assert.ok(session.setCookie);
      return { actorId: session.context.actor_id, cookie: cookiePair(session.setCookie) };
    });
    assert.equal(new Set(users.map((user) => user.actorId)).size, 100);

    const workspaceA = await createUserWorkspaceRepository({ databaseFilePath: workspacePath });
    for (const [index, user] of users.entries()) {
      const privateStatus = index < 50 ? "MAIN_RADAR" : index < 75 ? "FOLLOW_UP" : null;
      if (!privateStatus) continue;
      workspaceA.transition({
        actorId: user.actorId,
        identity: IDENTITY,
        previousPrivateStatus: "NEW",
        newPrivateStatus: privateStatus,
        systemStatus: "NEW",
        conditions: CONDITIONS,
        overrideReason: null,
        sessionReference: `session-${index}`,
      });
    }
    const researchA = await createResearchEvidenceRepository({ databaseFilePath: researchPath });
    researchA.saveProgress({ actorId: users[0]!.actorId, chain: "base", contractAddress: ADDRESS, stepNumber: 2, state: "REVIEWED" });
    researchA.saveVerificationDecision({ actorId: users[0]!.actorId, chain: "base", contractAddress: ADDRESS, verdict: "NEEDS_MORE_DATA", note: "Source comparison remains incomplete." });
    researchA.saveVerificationDecision({ actorId: users[1]!.actorId, chain: "base", contractAddress: ADDRESS, verdict: "VERIFIED", note: "Independent private review completed." });
    workspaceA.close();
    researchA.close();

    // The code can be served from a new release worktree while every private
    // dependency remains explicitly rooted in the external state directory.
    assert.notEqual(releaseRootA, releaseRootB);
    assert.equal(getDefaultCampUserIdentityRegistryPath({ CRYPTO_EDGE_CAMP_IDENTITY_REGISTRY_PATH: identityRegistryPath }), identityRegistryPath);
    const serviceB = createPc1SessionContextService({ defaultRole: "CAMP_USER", campIdentityRegistryPath: identityRegistryPath });
    const restored = users.map((user) => serviceB.resolve(request(user.cookie)).context.actor_id);
    assert.deepEqual(restored, users.map((user) => user.actorId));

    const workspaceB = await createUserWorkspaceRepository({ databaseFilePath: workspacePath });
    const states = users.map((user) => workspaceB.get(user.actorId, IDENTITY)?.private_status ?? "NEW");
    assert.equal(states.filter((state) => state === "MAIN_RADAR").length, 50);
    assert.equal(states.filter((state) => state === "FOLLOW_UP").length, 25);
    assert.equal(states.filter((state) => state === "NEW").length, 25);
    assert.equal(workspaceB.get(users[0]!.actorId, IDENTITY)?.system_status_at_decision, "NEW");

    const researchB = await createResearchEvidenceRepository({ databaseFilePath: researchPath });
    assert.deepEqual(researchB.listProgress(users[0]!.actorId, "base", ADDRESS).map((entry) => [entry.step_number, entry.state]), [[2, "REVIEWED"]]);
    assert.deepEqual(researchB.listProgress(users[1]!.actorId, "base", ADDRESS), []);
    assert.equal(researchB.getVerificationDecision(users[0]!.actorId, "base", ADDRESS)?.verdict, "NEEDS_MORE_DATA");
    assert.equal(researchB.getVerificationDecision(users[1]!.actorId, "base", ADDRESS)?.verdict, "VERIFIED");
    assert.equal(researchB.getVerificationDecision(users[2]!.actorId, "base", ADDRESS), null);

    const sharedAIForA = buildAIAnalysisCacheIdentity(aiIdentityInput());
    const sharedAIForB = buildAIAnalysisCacheIdentity(aiIdentityInput());
    assert.equal(sharedAIForA.cache_key, sharedAIForB.cache_key);
    assert.equal(JSON.stringify(sharedAIForA).includes(users[0]!.actorId), false);
    assert.equal(JSON.stringify(sharedAIForB).includes(users[1]!.actorId), false);
    workspaceB.close();
    researchB.close();
  });

  it("sets Secure only when the HTTPS tunnel deployment configuration enables it", async () => {
    const root = await tempRoot();
    const service = createPc1SessionContextService({
      defaultRole: "CAMP_USER",
      campIdentityRegistryPath: resolve(root, "camp-user-identities.json"),
      cookieSecure: true,
    });
    const session = service.resolve(request());
    assert.match(session.setCookie ?? "", /; Secure$/);
  });

  it("restores the same CAMP actor and private Radar through a recreated product API service", async () => {
    const stateRoot = await tempRoot();
    const identityRegistryPath = resolve(stateRoot, "camp-user-identities.json");
    const workspacePath = resolve(stateRoot, "user-workspace.sqlite");

    const workspaceA = await createUserWorkspaceRepository({ databaseFilePath: workspacePath });
    const serverA = createScannerApiServer({
      runtimeMode: "DEVELOPMENT_DEMO",
      lifecycle: { workspace: workspaceA, defaultSessionRole: "CAMP_USER", campIdentityRegistryPath: identityRegistryPath },
    });
    await listen(serverA);
    let cookie: string;
    let actorBefore: string;
    try {
      const session = await requestApi(serverA, "GET", "/api/lifecycle/session");
      assert.equal(session.status, 200, session.body);
      cookie = responseCookie(session);
      actorBefore = createCampUserIdentityRegistry({ databaseFilePath: identityRegistryPath }).resolveActorId(cookieToken(cookie))!;
      const moved = await requestApi(serverA, "POST", "/api/lifecycle/token/status", { cookie, "content-type": "application/json" }, JSON.stringify({
        chain: "base",
        contract_address: ADDRESS,
        target_status: "MAIN_RADAR",
        override_reason: "Private CAMP organization",
        confirmation: true,
      }));
      assert.equal(moved.status, 200, moved.body);
      assert.equal((JSON.parse(moved.body) as { user_status: string; system_status: string }).user_status, "MAIN_RADAR");
      assert.equal((JSON.parse(moved.body) as { system_status: string }).system_status, "NEW");
    } finally {
      await close(serverA);
      workspaceA.close();
    }

    // Server B represents a later process/release. It receives only the external
    // state-root paths and the persisted browser cookie, not an in-memory session.
    const workspaceB = await createUserWorkspaceRepository({ databaseFilePath: workspacePath });
    const serverB = createScannerApiServer({
      runtimeMode: "DEVELOPMENT_DEMO",
      lifecycle: { workspace: workspaceB, defaultSessionRole: "CAMP_USER", campIdentityRegistryPath: identityRegistryPath },
    });
    await listen(serverB);
    try {
      const actorAfter = createCampUserIdentityRegistry({ databaseFilePath: identityRegistryPath }).resolveActorId(cookieToken(cookie));
      assert.equal(actorAfter, actorBefore);
      const restored = await requestApi(serverB, "GET", `/api/lifecycle/token?chain=base&contract_address=${ADDRESS}`, { cookie });
      assert.equal(restored.status, 200, restored.body);
      const body = JSON.parse(restored.body) as { user_status: string; system_status: string };
      assert.equal(body.user_status, "MAIN_RADAR");
      assert.equal(body.system_status, "NEW");
    } finally {
      await close(serverB);
      workspaceB.close();
    }
  });
});

function request(cookie?: string): IncomingMessage {
  return { headers: cookie ? { cookie } : {} } as IncomingMessage;
}

function cookiePair(setCookie: string): string {
  return setCookie.split(";", 1)[0]!;
}

function cookieToken(cookie: string): string {
  const [, token] = cookie.split("=", 2);
  assert.ok(token);
  return token;
}

function tamperCookie(cookie: string): string {
  const token = cookieToken(cookie);
  const replacement = token.endsWith("A") ? "B" : "A";
  return `crypto_edge_pc1_session=${token.slice(0, -1)}${replacement}`;
}

function listen(server: Server): Promise<void> {
  return new Promise((done) => server.listen(0, "127.0.0.1", () => done()));
}

function close(server: Server): Promise<void> {
  return new Promise((done, reject) => server.close((error) => error ? reject(error) : done()));
}

function requestApi(server: Server, method: string, path: string, headers: Record<string, string> = {}, body?: string): Promise<{ status: number; body: string; headers: Record<string, string | string[] | undefined> }> {
  const port = (server.address() as AddressInfo).port;
  return new Promise((done, reject) => {
    const request = httpRequest({ host: "127.0.0.1", port, path, method, headers }, (response) => {
      let responseBody = "";
      response.setEncoding("utf8");
      response.on("data", (chunk: string) => { responseBody += chunk; });
      response.on("end", () => done({ status: response.statusCode ?? 0, body: responseBody, headers: response.headers }));
    });
    request.on("error", reject);
    if (body) request.write(body);
    request.end();
  });
}

function responseCookie(response: { headers: Record<string, string | string[] | undefined> }): string {
  const value = response.headers["set-cookie"];
  const header = Array.isArray(value) ? value[0] : value;
  assert.ok(header);
  return header.split(";", 1)[0]!;
}

function aiIdentityInput() {
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

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(resolve(tmpdir(), "crypto-edge-camp-identity-"));
  roots.push(root);
  return root;
}
