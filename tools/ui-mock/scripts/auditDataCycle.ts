import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { createFeedbackStore } from "../server/feedbackStore.js";
import { createScannerApiServer } from "../server/scannerApiServer.js";

const paths = [
  "/api/automation/status",
  "/api/scanner/latest",
  "/api/context/latest",
  "/api/follow-up/status",
  "/api/follow-up",
  "/api/readiness",
] as const;

const temporaryRoot = await mkdtemp(resolve(tmpdir(), "crypto-edge-data-cycle-audit-"));
const feedbackStore = await createFeedbackStore({ databaseFilePath: resolve(temporaryRoot, "feedback.sqlite") });
const server = createScannerApiServer({
  runtimeMode: "INTERNAL_BETA",
  feedback: { store: feedbackStore, submissionEnabled: false },
});
await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
try {
  const port = (server.address() as AddressInfo).port;
  const responses = await Promise.all(paths.map(async (path) => {
    const response = await fetch(`http://127.0.0.1:${port}${path}`);
    const body = await response.json() as unknown;
    return { path, status: response.status, body };
  }));
  const byPath = Object.fromEntries(responses.map((entry) => [entry.path, entry]));
  const failures = responses.filter((entry) => entry.status !== 200);
  if (failures.length > 0) {
    console.error(JSON.stringify({ endpoint_failures: failures }, null, 2));
  }
  for (const entry of responses) assert.equal(entry.status, 200, `${entry.path} returned ${entry.status}`);

  const scanner = asRecord(byPath["/api/scanner/latest"]!.body);
  const followUp = asRecord(byPath["/api/follow-up"]!.body);
  const candidates = recordArray(scanner.candidates);
  const followUpEntries = recordArray(followUp.entries);
  const candidateIdentities = candidates.map(identity).filter((value): value is string => value !== null);
  const followUpIdentities = followUpEntries.map(identity).filter((value): value is string => value !== null);
  assert.equal(new Set(candidateIdentities).size, candidateIdentities.length, "duplicate scanner identity");
  assert.equal(new Set(followUpIdentities).size, followUpIdentities.length, "duplicate follow-up identity");

  console.log(JSON.stringify({
    endpoints: Object.fromEntries(responses.map((entry) => [entry.path, entry.status])),
    automation: byPath["/api/automation/status"]!.body,
    scanner: {
      run_id: asRecord(scanner.scan_run).run_id ?? null,
      candidates: candidates.length,
      unique_identities: candidateIdentities.length,
      source_health: asRecord(asRecord(scanner.provenance).metadata).source_health ?? {},
    },
    context: summarizeContext(byPath["/api/context/latest"]!.body),
    follow_up_status: byPath["/api/follow-up/status"]!.body,
    follow_up_unique_identities: followUpIdentities.length,
    readiness: byPath["/api/readiness"]!.body,
    browser_provider_calls: 0,
  }, null, 2));
} finally {
  await new Promise<void>((resolveClose, rejectClose) => server.close((error) => error ? rejectClose(error) : resolveClose()));
  feedbackStore.close();
  await rm(temporaryRoot, { recursive: true, force: true });
}

function summarizeContext(value: unknown): Record<string, unknown> {
  const context = asRecord(value);
  return {
    run_id: context.run_id ?? null,
    generated_at: context.generated_at ?? null,
    summary: context.summary ?? null,
    sources: recordArray(context.sources).map((source) => ({
      source_id: source.source_id ?? null,
      status: source.status ?? null,
      fetched_at: source.fetched_at ?? null,
      records: recordArray(source.records).length,
    })),
  };
}

function identity(value: Record<string, unknown>): string | null {
  const chain = typeof value.chain === "string" ? value.chain.trim().toLowerCase() : null;
  const contract = typeof value.contract_address === "string" ? value.contract_address.trim().toLowerCase() : null;
  return chain && contract ? `${chain}:${contract}` : null;
}

function recordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry)) : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
