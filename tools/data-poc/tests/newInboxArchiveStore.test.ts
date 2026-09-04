import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, it } from "node:test";
import {
  countNewInboxArchiveEvents,
  countNewInboxArchiveIdentities,
  countNewInboxDetectedIdentities,
  createNewInboxArchiveEvent,
  findNewInboxArchiveEventsByIdentity,
  findRecentNewInboxArchiveEvents,
  getDefaultNewInboxArchiveSqlitePath,
  persistNewInboxArchiveEvents,
  upsertNewInboxDetectedIdentities,
} from "../src/newInboxArchiveStore.js";

const roots: string[] = [];

afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe("NEW Inbox SQLite archive store", () => {
  it("uses the configured path and the runtime-root default", async () => {
    const custom = resolve(tmpdir(), "crypto-edge-new-inbox-archive", "archive.sqlite");
    assert.equal(getDefaultNewInboxArchiveSqlitePath({ CRYPTO_EDGE_NEW_INBOX_ARCHIVE_SQLITE_PATH: custom }), custom);
    assert.match(getDefaultNewInboxArchiveSqlitePath(), /\.local[\\/]lifecycle[\\/]new-inbox-archive\.sqlite$/i);
  });

  it("persists the required event fields and supports indexed identity/recent reads", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "crypto-edge-new-inbox-archive-"));
    roots.push(root);
    const path = resolve(root, "archive.sqlite");
    const event = archiveEvent("base:one", "2026-08-01T00:00:00.000Z", "2026-08-08T00:00:00.000Z");
    const result = await persistNewInboxArchiveEvents([event], path);
    assert.deepEqual(result, { attempted: 1, inserted: 1, duplicate_noop: 0 });
    const byIdentity = await findNewInboxArchiveEventsByIdentity(event.identity, path);
    assert.deepEqual(byIdentity, [event]);
    assert.equal((await findRecentNewInboxArchiveEvents(10, path)).length, 1);
    assert.equal(await countNewInboxArchiveEvents(path), 1);
    assert.equal(await countNewInboxArchiveIdentities(path), 1);
    assert.equal(await countNewInboxDetectedIdentities(path), 0);
    await upsertNewInboxDetectedIdentities([detectedIdentity(event.identity, event.last_seen_at)], path);
    assert.equal(await countNewInboxDetectedIdentities(path), 1);
  });

  it("ignores a repeated deterministic archive event", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "crypto-edge-new-inbox-archive-"));
    roots.push(root);
    const path = resolve(root, "archive.sqlite");
    const event = archiveEvent("base:one", "2026-08-01T00:00:00.000Z", "2026-08-08T00:00:00.000Z");
    await persistNewInboxArchiveEvents([event], path);
    const retry = await persistNewInboxArchiveEvents([event], path);
    assert.deepEqual(retry, { attempted: 1, inserted: 0, duplicate_noop: 1 });
    assert.equal(await countNewInboxArchiveEvents(path), 1);
  });

  it("keeps the unique detected total stable across SQLite close and reopen", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "crypto-edge-new-inbox-archive-reopen-"));
    roots.push(root);
    const path = resolve(root, "archive.sqlite");
    await upsertNewInboxDetectedIdentities([
      detectedIdentity("base:one", "2026-08-08T00:00:00.000Z"),
      detectedIdentity("base:two", "2026-08-08T00:00:00.000Z"),
    ], path);
    assert.equal(await countNewInboxDetectedIdentities(path), 2);
    assert.equal(await countNewInboxDetectedIdentities(path), 2);
  });

  it("benchmarks 100,000 archive records and 80,000 unique identities without an unbounded read", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "crypto-edge-new-inbox-archive-scale-"));
    roots.push(root);
    const path = resolve(root, "archive.sqlite");
    const uniqueIdentities = Array.from({ length: 80_000 }, (_, index) => detectedIdentity(`base:scale-${index}`, "2026-08-08T00:00:00.000Z"));
    await upsertNewInboxDetectedIdentities(uniqueIdentities, path);
    const events = Array.from({ length: 100_000 }, (_, index) => {
      const identity = `base:scale-${index % 80_000}`;
      const lastSeenAt = new Date(Date.UTC(2026, 7, 8, 0, 0, index)).toISOString();
      return archiveEvent(identity, lastSeenAt, new Date(Date.UTC(2026, 7, 8, 1, 0, index)).toISOString());
    });
    const insertStarted = performance.now();
    const inserted = await persistNewInboxArchiveEvents(events, path);
    const insertMs = performance.now() - insertStarted;
    const lookupStarted = performance.now();
    const identityRows = await findNewInboxArchiveEventsByIdentity("base:scale-50000", path);
    const identityLookupMs = performance.now() - lookupStarted;
    const recentStarted = performance.now();
    const recentRows = await findRecentNewInboxArchiveEvents(24, path);
    const recentLookupMs = performance.now() - recentStarted;
    const archiveCountStarted = performance.now();
    const archiveCount = await countNewInboxArchiveEvents(path);
    const archiveCountMs = performance.now() - archiveCountStarted;
    const uniqueCountStarted = performance.now();
    const uniqueCount = await countNewInboxDetectedIdentities(path);
    const uniqueCountMs = performance.now() - uniqueCountStarted;
    assert.equal(inserted.inserted, 100_000);
    assert.equal(identityRows.length, 1);
    assert.equal(recentRows.length, 24);
    assert.equal(archiveCount, 100_000);
    assert.equal(uniqueCount, 80_000);
    assert.equal(await countNewInboxArchiveIdentities(path), 80_000);
    console.log(JSON.stringify({
      marker: "NEW_INBOX_ARCHIVE_100K_SCALE",
      insert_ms: Number(insertMs.toFixed(2)),
      identity_lookup_ms: Number(identityLookupMs.toFixed(2)),
      recent_lookup_ms: Number(recentLookupMs.toFixed(2)),
      archive_count_ms: Number(archiveCountMs.toFixed(2)),
      unique_count_ms: Number(uniqueCountMs.toFixed(2)),
      archive_event_count: archiveCount,
      detected_unique_total: uniqueCount,
      full_archive_load: false,
    }));
  });
});

function archiveEvent(identity: string, lastSeenAt: string, archivedAt: string) {
  return createNewInboxArchiveEvent({
    identity,
    chain: "base",
    contract_address: identity,
    display_name: "Scale token",
    symbol: "SCALE",
    first_seen_at: "2026-08-01T00:00:00.000Z",
    last_seen_at: lastSeenAt,
    archived_at: archivedAt,
    previous_system_status: "NEW",
    payload_json: JSON.stringify({ identity, last_seen_at: lastSeenAt }),
  });
}

function detectedIdentity(identity: string, lastSeenAt: string) {
  const [, contract_address] = identity.split(":");
  return {
    identity,
    chain: "base",
    contract_address: contract_address ?? identity,
    first_seen_at: "2026-08-01T00:00:00.000Z",
    last_seen_at: lastSeenAt,
    display_name: "Scale token",
    symbol: "SCALE",
  };
}
