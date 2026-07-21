import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, it } from "node:test";

const productRoot = resolve(import.meta.dirname, "..");
const forbiddenImports = [
  "internalBetaCollector",
  "runInternalBetaCollector",
  "dexscreenerClient",
  "dexscreenerDiscovery",
  "goplusClient",
  "honeypotClient",
  "alternativeMeFngAdapter",
  "defillamaAdapter",
];

describe("ordinary request path import boundary", () => {
  it("keeps provider and collector modules out of frontend and API request handlers", async () => {
    const files = [
      "src/ProductApp.tsx",
      "src/services/scannerDataSource.ts",
      "server/scannerApiHandler.ts",
      "server/scannerApiServer.ts",
      "server/productVpsServer.ts",
    ];
    for (const file of files) {
      const source = await readFile(resolve(productRoot, file), "utf8");
      for (const forbidden of forbiddenImports) {
        assert.doesNotMatch(source, new RegExp(forbidden), `${file} must not import ${forbidden}`);
      }
      assert.doesNotMatch(source, /\/api\/scanner\/(?:collect|refresh|run|scan)/, `${file} must not expose a collector endpoint`);
    }
  });

  it("makes both HTTP servers depend on the single shared scanner API handler", async () => {
    const scannerServer = await readFile(resolve(productRoot, "server", "scannerApiServer.ts"), "utf8");
    const productServer = await readFile(resolve(productRoot, "server", "productVpsServer.ts"), "utf8");
    assert.match(scannerServer, /createScannerApiHandler/);
    assert.match(productServer, /createScannerApiHandler/);
    for (const source of [scannerServer, productServer]) {
      assert.doesNotMatch(source, /path === "\/api\/(?:health|readiness|scanner\/latest|context\/latest|scanner\/sources|review-session)"/);
    }
    assert.match(productServer, /process\.once\("SIGINT"/);
    assert.match(productServer, /process\.once\("SIGTERM"/);
    assert.match(productServer, /server\.close/);
  });
});
