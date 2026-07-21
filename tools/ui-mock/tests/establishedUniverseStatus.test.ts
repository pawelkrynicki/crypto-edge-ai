import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { request } from "node:http";
import type { AddressInfo } from "node:net";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import { createScannerApiServer } from "../server/scannerApiServer.js";

describe("established universe product status API", () => {
  it("serves 100 read-only sanitized responses without changing universe state", async () => {
    const template = JSON.parse(await readFile(
      resolve(import.meta.dirname, "..", "..", "..", "config", "established_address_universe_v1.json"),
      "utf8",
    )) as Record<string, unknown>;
    const store = {
      schema_version: "established_universe_store_v1",
      current: template,
      history: [],
      audit_log: [{
        changed_at: "2026-07-21T12:00:00.000Z",
        actor: "private-owner-id",
        owner_note: "must-not-leak",
        storage_path: "C:\\private\\universe.json",
      }],
    };
    const before = JSON.stringify(store);
    let reads = 0;
    const server = createScannerApiServer({
      runtimeMode: "INTERNAL_BETA",
      establishedUniverse: {
        readText: async () => {
          reads += 1;
          return JSON.stringify(store);
        },
      },
    });
    await listen(server);
    try {
      const responses = await Promise.all(Array.from({ length: 100 }, () => requestRaw(server, "GET", "/api/established-universe/status")));
      assert.equal(responses.every((response) => response.status === 200), true);
      assert.equal(new Set(responses.map((response) => response.body)).size, 1);
      const body = JSON.parse(responses[0].body) as Record<string, unknown>;
      assert.deepEqual(Object.keys(body).sort(), [
        "entries_enabled",
        "entries_total",
        "generated_at",
        "last_change_at",
        "universe_version",
        "validation_status",
      ]);
      assert.equal(body.validation_status, "valid");
      assert.equal(body.entries_total, 0);
      assert.equal(body.last_change_at, "2026-07-21T12:00:00.000Z");
      for (const forbidden of ["owner_note", "actor", "added_by", "private-owner-id", "storage_path", "C:\\private", "history", "audit_log"]) {
        assert.equal(responses[0].body.includes(forbidden), false);
      }
    } finally {
      await close(server);
    }
    assert.equal(reads, 100);
    assert.equal(JSON.stringify(store), before);
  });

  it("reports invalid state safely and exposes no public mutation endpoint", async () => {
    const server = createScannerApiServer({
      runtimeMode: "INTERNAL_BETA",
      establishedUniverse: { readText: async () => JSON.stringify({ schema_version: "bad", owner_note: "hidden" }) },
    });
    await listen(server);
    try {
      const status = await requestRaw(server, "GET", "/api/established-universe/status");
      assert.equal(status.status, 200);
      assert.deepEqual(JSON.parse(status.body), {
        universe_version: null,
        generated_at: null,
        entries_total: 0,
        entries_enabled: 0,
        validation_status: "invalid",
        last_change_at: null,
      });
      for (const path of ["/api/established-universe/add", "/api/established-universe/remove", "/api/established-universe/status"]) {
        const response = await requestRaw(server, "POST", path);
        assert.equal(response.status, 404, path);
      }
    } finally {
      await close(server);
    }
  });
});

function listen(server: ReturnType<typeof createScannerApiServer>): Promise<void> {
  return new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
}

function close(server: ReturnType<typeof createScannerApiServer>): Promise<void> {
  return new Promise((resolveClose, rejectClose) => server.close((error) => error ? rejectClose(error) : resolveClose()));
}

function requestRaw(
  server: ReturnType<typeof createScannerApiServer>,
  method: string,
  path: string,
): Promise<{ status: number; body: string }> {
  const port = (server.address() as AddressInfo).port;
  return new Promise((resolveRequest, rejectRequest) => {
    const req = request({ hostname: "127.0.0.1", port, method, path }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      res.on("end", () => resolveRequest({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.once("error", rejectRequest);
    req.end();
  });
}
