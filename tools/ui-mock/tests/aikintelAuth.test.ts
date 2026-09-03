import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createServer, type AddressInfo, type IncomingMessage } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { after, describe, it } from "node:test";
import { AIKINTEL_SESSION_COOKIE, createAikintelAuthService, createAikintelLaunchCredential, type AikintelLaunchPayload } from "../server/aikintelAuth.js";
import { createScannerApiHandler } from "../server/scannerApiHandler.js";
import { createPc1SessionContextService } from "../server/lifecycleSession.js";
import { createResearchEvidenceRepository } from "../server/researchEvidenceRepository.js";
import { createUserWorkspaceRepository } from "../server/userWorkspaceRepository.js";

const NOW = 1_800_000_000;
const SSO_SECRET = "aikintel-sso-test-secret-012345678901234567890123";
const ACTOR_KEY = "aikintel-actor-test-key-012345678901234567890123";
const IDENTITY = "bsc:0x1111111111111111111111111111111111111111";
const roots: string[] = [];

after(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

describe("AIKINTEL auth handoff", () => {
  it("creates stable opaque actors, persists sessions across restart, and isolates workspace state", async () => {
    const root = await tempRoot();
    const statePath = resolve(root, "aikintel-auth.json");
    const workspace = await createUserWorkspaceRepository({ databaseFilePath: resolve(root, "workspace.sqlite") });
    const auth = createAuth(statePath);
    const first = auth.exchange(fakeRequest(), credential("user-a", "jti-a"));
    const second = auth.exchange(fakeRequest(), credential("user-a", "jti-b"));
    const other = auth.exchange(fakeRequest(), credential("user-b", "jti-c"));

    assert.match(first.context.actor_id, /^aikintel-[a-f0-9]{64}$/);
    assert.equal(first.context.actor_id, second.context.actor_id);
    assert.notEqual(first.context.actor_id, other.context.actor_id);
    assert.equal(createAuth(statePath).resolve(fakeRequest(`${AIKINTEL_SESSION_COOKIE}=${cookieValue(first.setCookie)}`))?.context.actor_id, first.context.actor_id);
    assert.equal(first.context.role, "CAMP_USER");
    assert.deepEqual(first.context.capabilities, ["CAMP_USER_WORKSPACE_WRITE"]);

    workspace.transition({
      actorId: first.context.actor_id,
      identity: IDENTITY,
      previousPrivateStatus: "NEW",
      newPrivateStatus: "FOLLOW_UP",
      systemStatus: "FOLLOW_UP",
      conditions: { conditions_met: [], conditions_unmet: [], missing_data: [], risks: [], readiness: "CONDITIONS_UNMET", security_state: "PARTIAL", verification_state: "PENDING" },
      overrideReason: "User A private decision",
      sessionReference: first.context.session_id,
      now: new Date("2027-01-15T00:00:00.000Z"),
    });
    assert.ok(workspace.get(first.context.actor_id, IDENTITY));
    assert.equal(workspace.get(other.context.actor_id, IDENTITY), null);
    workspace.transition({
      actorId: other.context.actor_id,
      identity: IDENTITY,
      previousPrivateStatus: "NEW",
      newPrivateStatus: "FOLLOW_UP",
      systemStatus: "FOLLOW_UP",
      conditions: { conditions_met: [], conditions_unmet: [], missing_data: [], risks: [], readiness: "CONDITIONS_UNMET", security_state: "PARTIAL", verification_state: "PENDING" },
      overrideReason: "User B private decision",
      sessionReference: other.context.session_id,
      now: new Date("2027-01-15T00:00:00.000Z"),
    });
    assert.equal(workspace.get(first.context.actor_id, IDENTITY)?.note, "User A private decision");
    workspace.close();

    const state = await readFile(statePath, "utf8");
    assert.doesNotMatch(state, /user-a|user-b/);
    assert.match(state, /aikintel_auth_state_v1/);
  });

  it("rejects malformed, signed-invalid, expired, future, wrong-issuer, wrong-audience, missing-subject and replayed credentials", async () => {
    const root = await tempRoot();
    const auth = createAuth(resolve(root, "aikintel-auth.json"));
    const cases: Array<[string, string]> = [
      ["malformed", "not-a-credential"],
      ["invalid signature", `${signedPayload(validPayload("invalid-signature"))}.invalid`],
      ["expired", signedPayload(validPayload("expired", { expires_at: NOW - 1 }))],
      ["future", signedPayload(validPayload("future", { issued_at: NOW + 1, expires_at: NOW + 61 }))],
      ["wrong issuer", signedPayload(validPayload("wrong-issuer", { issuer: "other" }))],
      ["wrong audience", signedPayload(validPayload("wrong-audience", { audience: "other" }))],
      ["missing subject", signedPayload({ ...validPayload("missing-subject"), subject: undefined })],
      ["role claim", signedPayload({ ...validPayload("role-claim"), role: "OWNER" })],
    ];
    for (const [label, token] of cases) {
      assert.throws(() => auth.exchange(fakeRequest(), token), new RegExp(label === "invalid signature" ? "AIKINTEL_CREDENTIAL_INVALID" : label === "expired" ? "AIKINTEL_CREDENTIAL_EXPIRED" : label === "future" ? "AIKINTEL_CREDENTIAL_FUTURE" : "AIKINTEL_CREDENTIAL_INVALID"), label);
    }

    const replay = credential("replay", "replay-jti");
    auth.exchange(fakeRequest(), replay);
    assert.throws(() => auth.exchange(fakeRequest(), replay), /AIKINTEL_CREDENTIAL_REPLAY/);
  });

  it("keeps existing CAMP mode available while AIKINTEL mode rejects anonymous API access and exchanges once", async () => {
    const campRoot = await tempRoot();
    const camp = createPc1SessionContextService({ defaultRole: "CAMP_USER", campIdentityRegistryPath: resolve(campRoot, "camp-identities.json") });
    const campSession = camp.resolve(fakeRequest());
    assert.equal(campSession.context.role, "CAMP_USER");
    assert.match(campSession.context.actor_id, /^camp-user-[a-f0-9]{32}$/);

    const root = await tempRoot();
    const statePath = resolve(root, "aikintel-auth.json");
    const evidenceRepository = await createResearchEvidenceRepository({ databaseFilePath: resolve(root, "research-evidence.sqlite") });
    const api = createScannerApiHandler({
      runtimeMode: "INTERNAL_BETA",
      authMode: "AIKINTEL",
      aikintelAuth: { ssoSecret: SSO_SECRET, actorKey: ACTOR_KEY, statePath, cookieSecure: true, now: () => NOW },
      researchEvidence: { repository: evidenceRepository },
    });
    const server = createServer(api);
    await listen(server);
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      const rejected = await fetch(`${base}/api/lifecycle/session`);
      assert.equal(rejected.status, 401);
      assert.deepEqual(await rejected.json(), { error: "AUTH_REQUIRED", message: "Authentication required" });

      const invalidSession = await fetch(`${base}/api/lifecycle/session`, {
        headers: { cookie: `${AIKINTEL_SESSION_COOKIE}=${"x".repeat(32)}` },
      });
      assert.equal(invalidSession.status, 401);
      assert.deepEqual(await invalidSession.json(), { error: "AUTH_REQUIRED", message: "Authentication required" });

      const rejectedOptions = await fetch(`${base}/api/lifecycle/session`, { method: "OPTIONS" });
      assert.equal(rejectedOptions.status, 401);
      assert.deepEqual(await rejectedOptions.json(), { error: "AUTH_REQUIRED", message: "Authentication required" });

      const launch = await fetch(`${base}/api/auth/aikintel/exchange?credential=${encodeURIComponent(credential("api-user", "api-jti"))}`, { redirect: "manual" });
      assert.equal(launch.status, 303);
      assert.equal(launch.headers.get("location"), "/");
      assert.doesNotMatch(launch.headers.get("location") ?? "", /credential/);
      const setCookie = launch.headers.get("set-cookie") ?? "";
      assert.match(setCookie, /HttpOnly/);
      assert.match(setCookie, /Secure/);
      assert.match(setCookie, /SameSite=Lax/);

      const session = await fetch(`${base}/api/lifecycle/session`, { headers: { cookie: setCookie.split(";", 1)[0]! } });
      assert.equal(session.status, 200);
      assert.deepEqual(await session.json(), { actor: { role: "CAMP_USER", capabilities: ["CAMP_USER_WORKSPACE_WRITE"] } });
    } finally {
      await close(server);
      evidenceRepository.close();
    }
  });
});

function createAuth(statePath: string) {
  return createAikintelAuthService({ ssoSecret: SSO_SECRET, actorKey: ACTOR_KEY, statePath, cookieSecure: false, now: () => NOW });
}

function credential(subject: string, jti: string): string {
  return createAikintelLaunchCredential({ subject, issuedAt: NOW, expiresAt: NOW + 60, jti: `${jti}-000000000001` }, SSO_SECRET);
}

function validPayload(subject: string, overrides: Partial<AikintelLaunchPayload> = {}): AikintelLaunchPayload {
  return { version: "aikintel_launch_v1", issuer: "aikintel", audience: "crypto-edge", subject, issued_at: NOW, expires_at: NOW + 60, jti: `jti-${subject}-000001`, ...overrides };
}

function signedPayload(payload: Record<string, unknown>): string {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${createHmac("sha256", SSO_SECRET).update(encoded, "utf8").digest("base64url")}`;
}

function fakeRequest(cookie?: string): IncomingMessage {
  return { headers: cookie ? { cookie } : {} } as IncomingMessage;
}

function cookieValue(setCookie: string): string {
  return setCookie.split(";", 1)[0]!.split("=", 2)[1]!;
}

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(resolve(tmpdir(), "crypto-edge-aikintel-")).then((value) => { roots.push(value); return value; });
  return root;
}

async function listen(server: ReturnType<typeof createServer>): Promise<void> {
  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolveListen());
  });
}

async function close(server: ReturnType<typeof createServer>): Promise<void> {
  await new Promise<void>((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
}
