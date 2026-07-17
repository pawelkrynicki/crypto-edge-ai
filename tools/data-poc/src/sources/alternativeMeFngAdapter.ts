import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertSourceActionAllowed, type SourcePolicyDecision } from "../sourcePolicy.js";
import type { FearGreedIndexRecord, NormalizedSourceOutput, NormalizedSourcePolicy, SourceAdapter, SourceAdapterMode } from "./sourceAdapterTypes.js";

export const ALTERNATIVE_ME_FNG_SOURCE_ID = "alternative_me_fng";
export const ALTERNATIVE_ME_FNG_DISPLAY_NAME = "Alternative.me Fear & Greed Index";
export const ALTERNATIVE_ME_FNG_URL = "https://api.alternative.me/fng/?limit=1";
export const ALTERNATIVE_ME_ATTRIBUTION = {
  provider: "Alternative.me",
  requirement: "Attribution appreciated, not required",
  url: "https://alternative.me/crypto/fear-and-greed-index/",
} as const;

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = resolve(__dirname, "../../../fixtures/alternative_me_fng_sample.json");

type AlternativeMeFngEntry = {
  value?: unknown;
  value_classification?: unknown;
  timestamp?: unknown;
  time_until_update?: unknown;
};

type AlternativeMeFngResponse = {
  data?: unknown;
};

export const alternativeMeFngAdapter: SourceAdapter = {
  sourceId: ALTERNATIVE_ME_FNG_SOURCE_ID,
  displayName: ALTERNATIVE_ME_FNG_DISPLAY_NAME,
  supportedActions: ["fixture_load", "live_fetch"],
  async fetchFixture(): Promise<NormalizedSourceOutput> {
    const decision = assertSourceActionAllowed({
      sourceId: ALTERNATIVE_ME_FNG_SOURCE_ID,
      action: "fixture_load"
    });
    const payload = await readJson<AlternativeMeFngResponse>(FIXTURE_PATH);

    return normalizeAlternativeMeFngResponse(payload, "fixture", toOutputPolicy(decision));
  },
  async fetchLive(options): Promise<NormalizedSourceOutput> {
    const decision = assertSourceActionAllowed({
      sourceId: ALTERNATIVE_ME_FNG_SOURCE_ID,
      environment: options.environment,
      action: "live_fetch"
    });
    const payload = options.requestJson
      ? await options.requestJson<AlternativeMeFngResponse>(ALTERNATIVE_ME_FNG_URL)
      : await defaultRequestJson<AlternativeMeFngResponse>(ALTERNATIVE_ME_FNG_URL);

    return normalizeAlternativeMeFngResponse(payload, "live", toOutputPolicy(decision));
  }
};

export function normalizeAlternativeMeFngResponse(
  payload: AlternativeMeFngResponse,
  mode: SourceAdapterMode,
  policy: NormalizedSourcePolicy,
  now = new Date()
): NormalizedSourceOutput {
  const warnings: string[] = [];
  const entries = Array.isArray(payload.data) ? (payload.data as AlternativeMeFngEntry[]) : [];
  const latest = entries[0];
  const records: FearGreedIndexRecord[] = [];

  if (!latest) {
    warnings.push("Alternative.me fixture/API response had no Fear & Greed records");
  } else {
    const value = toFiniteNumber(latest.value);
    if (value === null) {
      warnings.push("Alternative.me Fear & Greed value was missing or invalid");
    } else {
      records.push({
        record_type: "fear_greed_index",
        value,
        value_classification: toStringOrDefault(latest.value_classification, "unknown"),
        timestamp: toUnixSecondsIsoString(latest.timestamp),
        time_until_update: toNullableString(latest.time_until_update)
      });
    }
  }

  return {
    source_id: ALTERNATIVE_ME_FNG_SOURCE_ID,
    source_name: ALTERNATIVE_ME_FNG_DISPLAY_NAME,
    mode,
    fetched_at: records[0]?.timestamp ?? now.toISOString(),
    attribution: ALTERNATIVE_ME_ATTRIBUTION,
    policy,
    data_category: "sentiment",
    records,
    warnings,
    errors: []
  };
}

async function defaultRequestJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Alternative.me Fear & Greed request failed with HTTP ${response.status}`);
  }
  return await response.json() as T;
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

function toStringOrDefault(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() !== "" ? value : fallback;
}

function toNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function toUnixSecondsIsoString(value: unknown): string | null {
  const seconds = toFiniteNumber(value);
  if (seconds === null) return null;

  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
