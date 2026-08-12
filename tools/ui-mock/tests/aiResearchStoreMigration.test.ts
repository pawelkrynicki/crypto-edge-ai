import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { after, describe, it } from "node:test";
import { createAIResearchStore } from "../server/aiResearchStore.js";

const root = await mkdtemp(resolve(tmpdir(), "crypto-edge-ai-bilingual-store-"));
after(async () => { await rm(root, { recursive: true, force: true }); });

describe("AI Research store bilingual cache migration", () => {
  it("retains the legacy cache table while permitting the v2 bilingual brief contract", async () => {
    const databaseFilePath = resolve(root, "legacy.sqlite");
    const database = new DatabaseSync(databaseFilePath);
    database.exec(`
CREATE TABLE crypto_ai_research_briefs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  analysis_id TEXT NOT NULL UNIQUE,
  schema_version TEXT NOT NULL CHECK (schema_version = 'ai_research_brief_v1'),
  chain TEXT NOT NULL,
  contract_address TEXT NOT NULL,
  locale TEXT NOT NULL CHECK (locale IN ('pl','en')),
  snapshot_fingerprint TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  model TEXT NOT NULL,
  ai_analysis TEXT NOT NULL,
  prompt_tokens INTEGER NOT NULL CHECK (prompt_tokens >= 0),
  completion_tokens INTEGER NOT NULL CHECK (completion_tokens >= 0),
  total_tokens INTEGER NOT NULL CHECK (total_tokens >= 0),
  input_hash TEXT NOT NULL,
  output_hash TEXT NOT NULL,
  hash TEXT NOT NULL UNIQUE,
  generated_at TEXT NOT NULL,
  data_generated_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('VALID','STALE')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (chain, contract_address, snapshot_fingerprint, prompt_version, locale)
);
`);
    database.close();

    const store = await createAIResearchStore({ databaseFilePath });
    store.close();

    const verified = new DatabaseSync(databaseFilePath);
    const row = verified.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'crypto_ai_research_briefs'").get() as { sql?: unknown };
    verified.close();
    assert.match(String(row.sql), /ai_research_brief_v1/);
    assert.match(String(row.sql), /ai_research_brief_v2/);
  });
});
