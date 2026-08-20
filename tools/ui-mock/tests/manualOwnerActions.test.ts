import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import type { Server } from "node:http";
import { afterEach, describe, it } from "node:test";
import {
  createEmptyFollowUpStore,
  ingestFollowUpObservations,
  inspectFollowUpStore,
} from "../../data-poc/src/followUpBasket.js";
import { createManualOwnerActionsService } from "../server/manualOwnerActions.js";
import { createResearchEvidenceRepository } from "../server/researchEvidenceRepository.js";
import { createScannerApiServer } from "../server/scannerApiServer.js";
import { PERSISTABLE_SCANNER_SAMPLE } from "../src/fixtures/persistableScannerSample.js";

const NOW = "2026-08-02T12:00:00.000Z";
const SECRET = "manual-owner-actions-test-secret-123456789";
const ADDRESS = "0x7777777777777777777777777777777777777777";
const TEST_CANDIDATE = {
  ...PERSISTABLE_SCANNER_SAMPLE.candidates[0]!,
  chain: "ethereum",
  contract_address: ADDRESS,
  discovery_basket: "new_emerging" as const,
  observation_only: true,
};
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("manual owner Radar actions", () => {
  it("configures the canonical Product Radar launcher with a CAMP_USER server session", async () => {
    const reviewLauncher = await readFile(resolve(import.meta.dirname, "..", "..", "..", "scripts", "win", "start-product-radar-review.cmd"), "utf8");
    const apiLauncher = await readFile(resolve(import.meta.dirname, "..", "..", "..", "scripts", "win", "start-product-radar-api.cmd"), "utf8");
    assert.match(reviewLauncher, /set "CRYPTO_EDGE_PC1_REVIEW_DEFAULT_ACTOR=CAMP_USER"/);
    assert.match(apiLauncher, /set "CRYPTO_EDGE_PC1_REVIEW_DEFAULT_ACTOR=CAMP_USER"/);
  });

  it("moves New to Follow-up once, persists verification, audits the decision, and performs no provider reads", async () => {
    const directory = await mkdtemp(join(tmpdir(), "crypto-edge-owner-actions-"));
    temporaryDirectories.push(directory);
    const storePath = join(directory, "follow-up.json");
    await writeFile(storePath, `${JSON.stringify(createEmptyFollowUpStore(new Date(NOW)), null, 2)}\n`, "utf8");
    let scannerReads = 0;
    const service = createManualOwnerActionsService({
      mode: "ENABLED",
      sessionSecret: SECRET,
      storePath,
      now: () => new Date(NOW),
      readScanner: async () => {
        scannerReads += 1;
        return {
          ...PERSISTABLE_SCANNER_SAMPLE,
          candidates: [TEST_CANDIDATE],
          _source_meta: {
            source: "real-output",
            reason: "test",
            selected_run_id: PERSISTABLE_SCANNER_SAMPLE.scan_run.run_id,
            loaded_at: NOW,
            runtime_mode: "INTERNAL_BETA",
            age_seconds: 0,
            source_ids: ["dexscreener", "goplus_security"],
            freshness_status: "FRESH",
          },
        };
      },
    });
    const candidate = TEST_CANDIDATE;
    const chain = candidate.chain;
    const address = candidate.contract_address!;
    const identity = `${chain}:${address}`;

    const status = await service.getFollowUpStatus(chain, address, true);
    assert.equal(status.current_layer, "NEW");
    assert.equal(status.target_exists, false);
    assert.equal(status.readiness_status, "CONDITIONS_UNMET");
    assert.ok(status.conditions_unmet.includes("MANUAL_VERIFICATION_MISSING"));

    const preview = await service.createFollowUpPreview(chain, address, true);
    assert.equal(preview.action_plan, "ADD");
    assert.equal(preview.override_required, true);
    const added = await service.addToFollowUp(preview.preview_id, preview.preview_id, {
      confirmation: true,
      identity_confirmation: identity,
      owner_reason: "Właściciel rozpoczyna dalszą obserwację mimo brakującej ręcznej weryfikacji.",
    }, true);
    assert.equal(added.status, "ADDED");
    assert.equal(added.entries_total, 1);

    const duplicatePreview = await service.createFollowUpPreview(chain, address, true);
    assert.equal(duplicatePreview.action_plan, "NO_ACTION");
    const duplicate = await service.addToFollowUp(duplicatePreview.preview_id, duplicatePreview.preview_id, {
      confirmation: true,
      identity_confirmation: identity,
      owner_reason: null,
    }, true);
    assert.equal(duplicate.status, "NO_ACTION_ALREADY_IN_FOLLOW_UP");
    assert.equal(duplicate.entries_total, 1);

    const verificationPreview = await service.createVerificationPreview(
      chain,
      address,
      "VERIFIED",
      "Tożsamość i dane rynkowe porównano ręcznie w źródłach zewnętrznych.",
      true,
    );
    assert.equal(verificationPreview.action_plan, "SAVE");
    const verification = await service.saveVerification(
      verificationPreview.preview_id,
      verificationPreview.preview_id,
      {
        confirmation: true,
        identity_confirmation: identity,
        owner_reason: verificationPreview.note,
      },
      true,
    );
    assert.equal(verification.status, "SAVED");
    assert.equal(verification.record.verdict, "VERIFIED");
    assert.deepEqual(await service.getPublicVerification(chain, address), verification.record);

    const repeatedPreview = await service.createVerificationPreview(
      chain,
      address,
      "VERIFIED",
      verificationPreview.note,
      true,
    );
    assert.equal(repeatedPreview.action_plan, "NO_ACTION");
    const repeated = await service.saveVerification(repeatedPreview.preview_id, repeatedPreview.preview_id, {
      confirmation: true,
      identity_confirmation: identity,
      owner_reason: repeatedPreview.note,
    }, true);
    assert.equal(repeated.status, "NO_ACTION_SAME_RESULT");
    assert.equal(repeated.audit_created, false);

    const diagnostics = await inspectFollowUpStore(storePath);
    assert.equal(diagnostics.store.entries.length, 1);
    assert.equal(diagnostics.store.entries[0]?.latest_security_status.status, "CHECKED");
    assert.equal(diagnostics.store.audit_log.filter((entry) => entry.operation === "OWNER_MANUAL_INGEST").length, 1);
    assert.equal(diagnostics.store.audit_log.filter((entry) => entry.operation === "OWNER_MANUAL_VERIFICATION").length, 1);
    const decision = diagnostics.store.audit_log[0]?.owner_decision;
    assert.equal(decision?.actor, "owner");
    assert.equal(decision?.previous_layer, "FOLLOW_UP");
    assert.equal(decision?.new_layer, "FOLLOW_UP");
    assert.equal(decision?.chain, chain);
    assert.equal(decision?.contract_address, address);
    assert.ok(scannerReads > 0);
  });

  it("hides controls for a trusted tester and keeps REVIEW_SAFE mutation-free", async () => {
    const directory = await mkdtemp(join(tmpdir(), "crypto-edge-owner-boundary-"));
    temporaryDirectories.push(directory);
    const storePath = join(directory, "follow-up.json");
    await writeFile(storePath, `${JSON.stringify(createEmptyFollowUpStore(new Date(NOW)), null, 2)}\n`, "utf8");
    const candidate = TEST_CANDIDATE;
    const service = createManualOwnerActionsService({
      mode: "REVIEW_SAFE",
      sessionSecret: SECRET,
      storePath,
      now: () => new Date(NOW),
      readScanner: async () => ({ ...PERSISTABLE_SCANNER_SAMPLE, candidates: [TEST_CANDIDATE], _source_meta: {} as never }),
    });

    await assert.rejects(
      service.getFollowUpStatus(candidate.chain, candidate.contract_address!, false),
      (error: unknown) => error instanceof Error && error.message === "OWNER_OPERATIONS_UNAVAILABLE",
    );
    const preview = await service.createFollowUpPreview(candidate.chain, candidate.contract_address!, true);
    await assert.rejects(
      service.addToFollowUp(preview.preview_id, preview.preview_id, {
        confirmation: true,
        identity_confirmation: `${candidate.chain}:${candidate.contract_address}`,
        owner_reason: "Test safe preview",
      }, true),
      (error: unknown) => error instanceof Error && error.message === "OWNER_ACTIONS_DISABLED",
    );
    assert.equal((await inspectFollowUpStore(storePath)).store.entries.length, 0);
  });

  it("starts a normal-launcher-equivalent CAMP_USER runtime with private saves for a Follow-up-only identity", async () => {
    const directory = await mkdtemp(join(tmpdir(), "crypto-edge-camp-api-"));
    temporaryDirectories.push(directory);
    const storePath = join(directory, "follow-up.json");
    const initial = ingestFollowUpObservations(
      createEmptyFollowUpStore(new Date(NOW)),
      [TEST_CANDIDATE],
      NOW,
      PERSISTABLE_SCANNER_SAMPLE.scan_run.run_id,
    );
    await writeFile(storePath, `${JSON.stringify(initial, null, 2)}\n`, "utf8");
    const scannerPath = join(directory, "scanner.json");
    await writeFile(scannerPath, JSON.stringify({ ...PERSISTABLE_SCANNER_SAMPLE, candidates: [] }), "utf8");
    const repository = await createResearchEvidenceRepository({ databaseFilePath: join(directory, "research-evidence.sqlite") });
    const originalActor = process.env.CRYPTO_EDGE_PC1_REVIEW_DEFAULT_ACTOR;
    process.env.CRYPTO_EDGE_PC1_REVIEW_DEFAULT_ACTOR = "CAMP_USER";
    const server = createScannerApiServer({
      runtimeMode: "DEVELOPMENT_DEMO",
      scanner: { fixturePath: scannerPath, outputDirPath: join(directory, "output"), allowFixtureFallback: true },
      followUp: { storePath, now: () => new Date(NOW) },
      manualOwnerActions: {
        storePath,
        now: () => new Date(NOW),
        readScanner: async () => ({ ...PERSISTABLE_SCANNER_SAMPLE, candidates: [TEST_CANDIDATE], _source_meta: {} as never }),
      },
      researchEvidence: { repository },
    });
    if (originalActor === undefined) delete process.env.CRYPTO_EDGE_PC1_REVIEW_DEFAULT_ACTOR;
    else process.env.CRYPTO_EDGE_PC1_REVIEW_DEFAULT_ACTOR = originalActor;
    await listen(server);
    try {
      const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      const session = await fetch(`${baseUrl}/api/lifecycle/session`);
      assert.deepEqual(await session.json(), { actor: { role: "CAMP_USER", capabilities: ["CAMP_USER_WORKSPACE_WRITE"] } });
      const scannerOnlyLookup = await fetch(`${baseUrl}/api/research-checklist?chain=${TEST_CANDIDATE.chain}&contract_address=${TEST_CANDIDATE.contract_address}`);
      assert.equal(scannerOnlyLookup.status, 404, "the token exists only in canonical Follow-up, not in the latest scanner output");
      const lookup = async (cookie?: string) => fetch(`${baseUrl}/api/manual-verification?chain=${TEST_CANDIDATE.chain}&contract_address=${TEST_CANDIDATE.contract_address}`, {
        headers: cookie ? { cookie } : undefined,
      });
      const before = await inspectFollowUpStore(storePath);
      const userAStart = await lookup();
      const userACookie = userAStart.headers.get("set-cookie")?.split(";")[0];
      assert.ok(userACookie);
      assert.deepEqual((await userAStart.json() as { record: unknown }).record, null);
      const querySpoof = await fetch(`${baseUrl}/api/manual-verification?chain=${TEST_CANDIDATE.chain}&contract_address=${TEST_CANDIDATE.contract_address}&actor_id=another-user`, {
        headers: { cookie: userACookie! },
      });
      assert.equal(querySpoof.status, 400, "the browser cannot choose an actor through the query");
      const invalid = await fetch(`${baseUrl}/api/manual-verification`, {
        method: "POST",
        headers: { cookie: userACookie!, origin: baseUrl, "content-type": "application/json" },
        body: JSON.stringify({ chain: TEST_CANDIDATE.chain, contract_address: TEST_CANDIDATE.contract_address, verdict: "NEEDS_MORE_DATA", note: "Wymaga dalszej analizy.", actor_id: "another-user" }),
      });
      assert.equal(invalid.status, 400, "the browser cannot supply an actor identifier");

      const savedA = await fetch(`${baseUrl}/api/manual-verification`, {
        method: "POST",
        headers: { cookie: userACookie!, origin: baseUrl, "content-type": "application/json" },
        body: JSON.stringify({ chain: TEST_CANDIDATE.chain, contract_address: TEST_CANDIDATE.contract_address, verdict: "NEEDS_MORE_DATA", note: "Wymaga dalszej analizy." }),
      });
      const savedAText = await savedA.text();
      assert.equal(savedA.status, 200, savedAText);
      const bodyA = JSON.parse(savedAText) as { status: string; audit_created: boolean; record: { verdict: string; note: string } };
      assert.equal(bodyA.status, "SAVED");
      assert.equal(bodyA.audit_created, false);
      assert.equal(bodyA.record.verdict, "NEEDS_MORE_DATA");
      assert.equal(bodyA.record.note, "Wymaga dalszej analizy.");
      const repeatedA = await fetch(`${baseUrl}/api/manual-verification`, {
        method: "POST",
        headers: { cookie: userACookie!, origin: baseUrl, "content-type": "application/json" },
        body: JSON.stringify({ chain: TEST_CANDIDATE.chain, contract_address: TEST_CANDIDATE.contract_address, verdict: "NEEDS_MORE_DATA", note: "Wymaga dalszej analizy." }),
      });
      assert.equal((await repeatedA.json() as { status: string }).status, "NO_ACTION_SAME_RESULT", "a repeated click has no additional write");
      const refreshedA = await lookup(userACookie);
      assert.deepEqual((await refreshedA.json() as { record: { verdict: string; note: string } }).record, bodyA.record, "User A refreshes their own decision");

      const userBStart = await lookup();
      const userBCookie = userBStart.headers.get("set-cookie")?.split(";")[0];
      assert.ok(userBCookie);
      assert.deepEqual((await userBStart.json() as { record: unknown }).record, null, "User B cannot read User A's decision");
      const savedB = await fetch(`${baseUrl}/api/manual-verification`, {
        method: "POST",
        headers: { cookie: userBCookie!, origin: baseUrl, "content-type": "application/json", "x-actor-id": "camp-user-a" },
        body: JSON.stringify({ chain: TEST_CANDIDATE.chain, contract_address: TEST_CANDIDATE.contract_address, verdict: "CRITICAL_RISK", note: "Niezależna notatka drugiego użytkownika." }),
      });
      assert.equal(savedB.status, 200);
      const afterB = await lookup(userACookie);
      const userAAfterB = await afterB.json() as { record: { verdict: string; note: string } };
      assert.equal(userAAfterB.record.verdict, "NEEDS_MORE_DATA", "User B cannot overwrite User A");
      assert.equal(userAAfterB.record.note, "Wymaga dalszej analizy.");

      const after = await inspectFollowUpStore(storePath);
      assert.deepEqual(after.store, before.store, "CAMP_USER decisions never mutate shared Follow-up verification or lifecycle");
      assert.equal(after.store.entries[0]?.lifecycle_status, before.store.entries[0]?.lifecycle_status);
      assert.equal(after.store.entries[0]?.established_membership, before.store.entries[0]?.established_membership);
    } finally {
      await close(server);
      repository.close();
    }
  });

  it("keeps trusted testers read-only for private verification decisions", async () => {
    const directory = await mkdtemp(join(tmpdir(), "crypto-edge-trusted-verification-"));
    temporaryDirectories.push(directory);
    const repository = await createResearchEvidenceRepository({ databaseFilePath: join(directory, "research-evidence.sqlite") });
    const originalActor = process.env.CRYPTO_EDGE_PC1_REVIEW_DEFAULT_ACTOR;
    process.env.CRYPTO_EDGE_PC1_REVIEW_DEFAULT_ACTOR = "TRUSTED_TESTER";
    const server = createScannerApiServer({ runtimeMode: "DEVELOPMENT_DEMO", researchEvidence: { repository } });
    if (originalActor === undefined) delete process.env.CRYPTO_EDGE_PC1_REVIEW_DEFAULT_ACTOR;
    else process.env.CRYPTO_EDGE_PC1_REVIEW_DEFAULT_ACTOR = originalActor;
    await listen(server);
    try {
      const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      const lookup = await fetch(`${baseUrl}/api/manual-verification?chain=${TEST_CANDIDATE.chain}&contract_address=${TEST_CANDIDATE.contract_address}`);
      assert.equal(lookup.status, 200);
      const cookie = lookup.headers.get("set-cookie")?.split(";")[0];
      assert.ok(cookie);
      const denied = await fetch(`${baseUrl}/api/manual-verification`, {
        method: "POST",
        headers: { cookie: cookie!, origin: baseUrl, "content-type": "application/json" },
        body: JSON.stringify({ chain: TEST_CANDIDATE.chain, contract_address: TEST_CANDIDATE.contract_address, verdict: "NEEDS_MORE_DATA", note: "Read-only test." }),
      });
      assert.equal(denied.status, 403);
      assert.equal(repository.getVerificationDecision("trusted-tester", TEST_CANDIDATE.chain, TEST_CANDIDATE.contract_address!), null);
    } finally {
      await close(server);
      repository.close();
    }
  });
});

function listen(server: Server): Promise<void> { return new Promise((done) => server.listen(0, "127.0.0.1", () => done())); }
function close(server: Server): Promise<void> { return new Promise((done, reject) => server.close((error) => error ? reject(error) : done())); }
