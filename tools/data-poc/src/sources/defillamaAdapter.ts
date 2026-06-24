import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertSourceActionAllowed, type SourcePolicyDecision } from "../sourcePolicy.js";
import type { DefiContextRecord, NormalizedSourceOutput, NormalizedSourcePolicy, SourceAdapter, SourceAdapterMode } from "./sourceAdapterTypes.js";

export const DEFILLAMA_SOURCE_ID = "defillama_api";
export const DEFILLAMA_DISPLAY_NAME = "DefiLlama API";
export const DEFILLAMA_PROTOCOLS_URL = "https://api.llama.fi/protocols";
export const DEFILLAMA_MAX_PROTOCOL_RECORDS = 10;

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = resolve(__dirname, "../../../fixtures/defillama_protocols_sample.json");

type DefillamaProtocol = {
  name?: unknown;
  chain?: unknown;
  chains?: unknown;
  tvl?: unknown;
  change_1d?: unknown;
  change_7d?: unknown;
  url?: unknown;
};

export const defillamaAdapter: SourceAdapter = {
  sourceId: DEFILLAMA_SOURCE_ID,
  displayName: DEFILLAMA_DISPLAY_NAME,
  supportedActions: ["fixture_load", "live_fetch"],
  async fetchFixture(): Promise<NormalizedSourceOutput> {
    const decision = assertSourceActionAllowed({
      sourceId: DEFILLAMA_SOURCE_ID,
      action: "fixture_load"
    });
    const payload = await readJson<unknown>(FIXTURE_PATH);

    return normalizeDefillamaProtocolsResponse(payload, "fixture", toOutputPolicy(decision));
  },
  async fetchLive(options: { environment?: string }): Promise<NormalizedSourceOutput> {
    const decision = assertSourceActionAllowed({
      sourceId: DEFILLAMA_SOURCE_ID,
      environment: options.environment,
      action: "live_fetch"
    });
    const response = await fetch(DEFILLAMA_PROTOCOLS_URL);
    if (!response.ok) {
      throw new Error(`DefiLlama protocols request failed with HTTP ${response.status}`);
    }
    const payload = await response.json();

    return normalizeDefillamaProtocolsResponse(payload, "live", toOutputPolicy(decision));
  }
};

export function normalizeDefillamaProtocolsResponse(
  payload: unknown,
  mode: SourceAdapterMode,
  policy: NormalizedSourcePolicy,
  now = new Date()
): NormalizedSourceOutput {
  const warnings: string[] = [];
  const protocols = Array.isArray(payload) ? (payload as DefillamaProtocol[]) : [];

  if (!Array.isArray(payload)) {
    warnings.push("DefiLlama protocols response was not an array");
  }
  if (protocols.length > DEFILLAMA_MAX_PROTOCOL_RECORDS) {
    warnings.push(`DefiLlama protocols were capped at ${DEFILLAMA_MAX_PROTOCOL_RECORDS} records for lightweight context output`);
  }

  const records = protocols
    .slice(0, DEFILLAMA_MAX_PROTOCOL_RECORDS)
    .map(toProtocolRecord)
    .filter((record): record is DefiContextRecord => record !== null);

  if (records.length === 0) {
    warnings.push("DefiLlama fixture/API response produced no protocol records");
  }

  return {
    source_id: DEFILLAMA_SOURCE_ID,
    source_name: DEFILLAMA_DISPLAY_NAME,
    mode,
    fetched_at: now.toISOString(),
    policy,
    data_category: "defi_context",
    records,
    warnings,
    errors: []
  };
}

function toProtocolRecord(protocol: DefillamaProtocol): DefiContextRecord | null {
  const name = toNullableString(protocol.name);
  if (!name) return null;

  return {
    record_type: "defi_protocol_snapshot",
    name,
    chain: toNullableString(protocol.chain) ?? firstString(protocol.chains),
    tvl_usd: toFiniteNumber(protocol.tvl),
    change_1d: toFiniteNumber(protocol.change_1d),
    change_7d: toFiniteNumber(protocol.change_7d),
    url: toNullableString(protocol.url)
  };
}

function toOutputPolicy(decision: SourcePolicyDecision): NormalizedSourcePolicy {
  return {
    environment: decision.environment,
    action: decision.action,
    allowed: decision.allowed,
    reason: decision.reason
  };
}

async function readJson<T>(path: string): Promise<T> {
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw) as T;
}

function toFiniteNumber(value: unknown): number | null {
  const numeric = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(numeric) ? numeric : null;
}

function toNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function firstString(value: unknown): string | null {
  if (!Array.isArray(value)) return null;

  const first = value.find((item) => typeof item === "string" && item.trim() !== "");
  return typeof first === "string" ? first : null;
}
