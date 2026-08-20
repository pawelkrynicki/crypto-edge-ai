import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Server } from "node:http";
import { afterEach, describe, it } from "node:test";
import {
  createEmptyFollowUpStore,
  ingestFollowUpObservations,
  inspectFollowUpStore,
} from "../../data-poc/src/followUpBasket.js";
import { createManualOwnerActionsService } from "../server/manualOwnerActions.js";
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

  it("persists one shared CAMP_USER verification result without changing the Follow-up lifecycle", async () => {
    const directory = await mkdtemp(join(tmpdir(), "crypto-edge-camp-verification-"));
    temporaryDirectories.push(directory);
    const storePath = join(directory, "follow-up.json");
    const initial = ingestFollowUpObservations(
      createEmptyFollowUpStore(new Date(NOW)),
      [TEST_CANDIDATE],
      NOW,
      PERSISTABLE_SCANNER_SAMPLE.scan_run.run_id,
    );
    await writeFile(storePath, `${JSON.stringify(initial, null, 2)}\n`, "utf8");
    const service = createManualOwnerActionsService({
      mode: "DISABLED",
      storePath,
      now: () => new Date(NOW),
      readScanner: async () => ({ ...PERSISTABLE_SCANNER_SAMPLE, candidates: [TEST_CANDIDATE], _source_meta: {} as never }),
    });
    const chain = TEST_CANDIDATE.chain;
    const address = TEST_CANDIDATE.contract_address!;
    const lifecycleBefore = (await inspectFollowUpStore(storePath)).store.entries[0]?.lifecycle_status;

    const [first, duplicate] = await Promise.all([
      service.saveVerificationFromCampUser(chain, address, "NEEDS_MORE_DATA", "Potrzebne jest dalsze potwierdzenie źródeł."),
      service.saveVerificationFromCampUser(chain, address, "NEEDS_MORE_DATA", "Potrzebne jest dalsze potwierdzenie źródeł."),
    ]);

    assert.deepEqual([first.status, duplicate.status], ["SAVED", "SAVED"], "the in-flight duplicate shares one canonical result");
    assert.equal(first.record.verdict, "NEEDS_MORE_DATA");
    assert.equal(duplicate.record.note, "Potrzebne jest dalsze potwierdzenie źródeł.");
    assert.deepEqual(await service.getPublicVerification(chain, address), first.record, "the canonical record is intentionally system-shared");

    const repeated = await service.saveVerificationFromCampUser(chain, address, "NEEDS_MORE_DATA", "Potrzebne jest dalsze potwierdzenie źródeł.");
    assert.equal(repeated.status, "NO_ACTION_SAME_RESULT");
    assert.equal(repeated.audit_created, false);

    const diagnostics = await inspectFollowUpStore(storePath);
    assert.equal(diagnostics.store.entries[0]?.lifecycle_status, lifecycleBefore, "a verification result never performs a lifecycle move");
    assert.equal(diagnostics.store.entries[0]?.latest_security_status.status, "PARTIAL");
    assert.equal(diagnostics.store.audit_log.filter((entry) => entry.operation === "OWNER_MANUAL_VERIFICATION").length, 1, "a duplicate click creates one logical verification record");
  });

  it("accepts a canonical CAMP_USER save without a client actor and rejects an actor field", async () => {
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
    const originalActor = process.env.CRYPTO_EDGE_PC1_REVIEW_DEFAULT_ACTOR;
    process.env.CRYPTO_EDGE_PC1_REVIEW_DEFAULT_ACTOR = "CAMP_USER";
    const server = createScannerApiServer({
      runtimeMode: "INTERNAL_BETA",
      manualOwnerActions: {
        storePath,
        now: () => new Date(NOW),
        readScanner: async () => ({ ...PERSISTABLE_SCANNER_SAMPLE, candidates: [TEST_CANDIDATE], _source_meta: {} as never }),
      },
    });
    if (originalActor === undefined) delete process.env.CRYPTO_EDGE_PC1_REVIEW_DEFAULT_ACTOR;
    else process.env.CRYPTO_EDGE_PC1_REVIEW_DEFAULT_ACTOR = originalActor;
    await listen(server);
    try {
      const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      const invalid = await fetch(`${baseUrl}/api/manual-verification`, {
        method: "POST",
        headers: { origin: baseUrl, "content-type": "application/json" },
        body: JSON.stringify({ chain: TEST_CANDIDATE.chain, contract_address: TEST_CANDIDATE.contract_address, verdict: "NEEDS_MORE_DATA", note: "Wymaga dalszej analizy.", actor_id: "another-user" }),
      });
      assert.equal(invalid.status, 400, "the browser cannot supply an actor identifier");

      const saved = await fetch(`${baseUrl}/api/manual-verification`, {
        method: "POST",
        headers: { origin: baseUrl, "content-type": "application/json" },
        body: JSON.stringify({ chain: TEST_CANDIDATE.chain, contract_address: TEST_CANDIDATE.contract_address, verdict: "NEEDS_MORE_DATA", note: "Wymaga dalszej analizy." }),
      });
      const savedText = await saved.text();
      assert.equal(saved.status, 200, savedText);
      const body = JSON.parse(savedText) as { status: string; record: { verdict: string; note: string } };
      assert.equal(body.status, "SAVED");
      assert.equal(body.record.verdict, "NEEDS_MORE_DATA");
      assert.equal(body.record.note, "Wymaga dalszej analizy.");
    } finally {
      await close(server);
    }
  });
});

function listen(server: Server): Promise<void> { return new Promise((done) => server.listen(0, "127.0.0.1", () => done())); }
function close(server: Server): Promise<void> { return new Promise((done, reject) => server.close((error) => error ? reject(error) : done())); }
