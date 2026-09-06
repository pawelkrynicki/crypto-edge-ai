import { AI_RESEARCH_TARGET_MODEL } from "../src/types/aiResearchTypes.js";
import { universeIdentityKey, type EstablishedAddressUniverse } from "../../data-poc/src/establishedAddressUniverse.js";
import { readEstablishedUniverseStore } from "../../data-poc/src/establishedUniverseManager.js";
import { readFollowUpStore, type FollowUpStore } from "../../data-poc/src/followUpBasket.js";
import {
  AIAnalysisQueueStoreError,
  AI_LIFECYCLE_AUTO_RECONCILIATION_SCOPE,
  type AIAnalysisQueueStore,
} from "./aiResearchQueueStore.js";
import {
  AIResearchContextError,
  buildAIResearchContext,
  type AIResearchContextOptions,
} from "./aiResearchContext.js";
import { buildAIResearchCacheIdentity } from "./aiResearchService.js";

export const AI_LIFECYCLE_AUTO_RECONCILE_MAX_PER_CYCLE = 25;
export const AI_LIFECYCLE_AUTO_RECONCILE_SCOPE = AI_LIFECYCLE_AUTO_RECONCILIATION_SCOPE;

export type AIResearchLifecycleReconciliation = {
  auto_eligible: number;
  auto_examined: number;
  auto_queued: number;
  auto_already_current: number;
  auto_insufficient: number;
  auto_failed: number;
};

export type AIResearchLifecycleReconcilerOptions = AIResearchContextOptions & {
  store: AIAnalysisQueueStore;
  modelId?: string;
  maxPerCycle?: number;
  queueDepth?: number;
  now?: () => Date;
};

type EligibleIdentity = {
  chain: string;
  contract_address: string;
  identity: string;
  source: "MAIN_RADAR" | "FOLLOW_UP";
  sort_at: string;
};

export function resolveAIResearchLifecycleReconcileMax(
  value?: number,
  env: NodeJS.ProcessEnv = process.env,
): number {
  const envValue = env.CRYPTO_EDGE_AI_AUTO_RECONCILE_MAX_PER_CYCLE;
  const candidate = value ?? (envValue && /^\d+$/.test(envValue.trim()) ? Number(envValue) : undefined);
  return candidate !== undefined && Number.isSafeInteger(candidate) && candidate >= 1 && candidate <= 100
    ? candidate
    : AI_LIFECYCLE_AUTO_RECONCILE_MAX_PER_CYCLE;
}

export function resolveAIResearchLifecycleQueueDepth(
  value?: number,
  env: NodeJS.ProcessEnv = process.env,
): number {
  const envValue = env.CRYPTO_EDGE_AI_QUEUE_DEPTH_LIMIT;
  const candidate = value ?? (envValue && /^\d+$/.test(envValue.trim()) ? Number(envValue) : undefined);
  return candidate !== undefined && Number.isSafeInteger(candidate) && candidate >= 1 && candidate <= 100_000
    ? candidate
    : 250;
}

export function createAIResearchLifecycleReconciler(options: AIResearchLifecycleReconcilerOptions) {
  const now = options.now ?? (() => new Date());
  const maxPerCycle = resolveAIResearchLifecycleReconcileMax(options.maxPerCycle);
  const queueDepth = resolveAIResearchLifecycleQueueDepth(options.queueDepth);
  const modelId = options.modelId ?? AI_RESEARCH_TARGET_MODEL;

  return {
    async reconcile(): Promise<AIResearchLifecycleReconciliation> {
      const result = emptyReconciliation();
      let eligible: EligibleIdentity[];
      try {
        eligible = await readEligibleIdentities(options.followUp, options.establishedUniverse);
      } catch {
        result.auto_failed = 1;
        return result;
      }
      result.auto_eligible = eligible.length;
      let cursor: ReturnType<AIAnalysisQueueStore["getReconciliationCursor"]>;
      try {
        cursor = options.store.getReconciliationCursor(AI_LIFECYCLE_AUTO_RECONCILE_SCOPE);
      } catch {
        result.auto_failed = 1;
        return result;
      }
      const selected = selectCircularWindow(eligible, cursor?.last_examined_identity ?? null, maxPerCycle);
      result.auto_examined = selected.length;
      const contextOptions: AIResearchContextOptions = {
        scanner: options.scanner,
        followUp: options.followUp,
        establishedUniverse: options.establishedUniverse,
        reports: options.reports,
        now,
      };

      for (const item of selected) {
        try {
          const context = await buildAIResearchContext(item.chain, item.contract_address, "en", contextOptions);
          if (context.research_state === "INSUFFICIENT_DATA") {
            result.auto_insufficient += 1;
            continue;
          }
          const identity = buildAIResearchCacheIdentity(context, modelId);
          const current = options.store.lookup(identity);
          if (isCurrent(current.record)) {
            result.auto_already_current += 1;
            continue;
          }
          const queued = options.store.enqueueSystem({
            identity,
            now: now(),
            queue_depth_limit: queueDepth,
          });
          if (queued.outcome === "QUEUED") result.auto_queued += 1;
          else if (queued.outcome === "READY" || queued.outcome === "ALREADY_EXISTS") result.auto_already_current += 1;
          else result.auto_failed += 1;
        } catch (error) {
          if (error instanceof AIResearchContextError || error instanceof AIAnalysisQueueStoreError) {
            result.auto_failed += 1;
            continue;
          }
          result.auto_failed += 1;
        } finally {
          try {
            options.store.advanceReconciliationCursor({
              scope: AI_LIFECYCLE_AUTO_RECONCILE_SCOPE,
              last_examined_identity: item.identity,
              now: now(),
            });
          } catch {
            result.auto_failed += 1;
          }
        }
      }
      return result;
    },
  };
}

export async function reconcileAIResearchLifecycle(
  options: AIResearchLifecycleReconcilerOptions,
): Promise<AIResearchLifecycleReconciliation> {
  return createAIResearchLifecycleReconciler(options).reconcile();
}

function emptyReconciliation(): AIResearchLifecycleReconciliation {
  return {
    auto_eligible: 0,
    auto_examined: 0,
    auto_queued: 0,
    auto_already_current: 0,
    auto_insufficient: 0,
    auto_failed: 0,
  };
}

function isCurrent(record: ReturnType<AIAnalysisQueueStore["lookup"]>["record"]): boolean {
  return record !== null
    && (record.status === "READY" || record.status === "QUEUED" || record.status === "PROCESSING" || record.status === "STALE" && record.result !== null);
}

function selectCircularWindow(
  eligible: EligibleIdentity[],
  lastExaminedIdentity: string | null,
  maxPerCycle: number,
): EligibleIdentity[] {
  if (eligible.length === 0 || maxPerCycle < 1) return [];
  const cursorIndex = lastExaminedIdentity === null
    ? -1
    : eligible.findIndex((item) => item.identity === lastExaminedIdentity);
  const start = cursorIndex >= 0 ? (cursorIndex + 1) % eligible.length : 0;
  const windowSize = Math.min(maxPerCycle, eligible.length - start);
  return eligible.slice(start, start + windowSize);
}

async function readEligibleIdentities(
  followUpOptions: AIResearchContextOptions["followUp"],
  establishedOptions: AIResearchContextOptions["establishedUniverse"],
): Promise<EligibleIdentity[]> {
  const [followUp, established] = await Promise.all([
    readFollowUpStore(followUpOptions?.storePath),
    readEstablishedUniverse(establishedOptions),
  ]);
  const main = established?.entries
    .filter((entry) => entry.enabled)
    .map((entry) => eligibleFromMain(entry)) ?? [];
  const follow = followUp.entries
    .filter((entry) => entry.lifecycle_status !== "ARCHIVED" && entry.lifecycle_status !== "ESTABLISHED")
    .map((entry) => eligibleFromFollowUp(entry));
  const byIdentity = new Map<string, EligibleIdentity>();
  for (const item of [...main, ...follow].sort(compareEligible)) {
    if (!byIdentity.has(item.identity)) byIdentity.set(item.identity, item);
  }
  return [...byIdentity.values()].sort(compareEligible);
}

async function readEstablishedUniverse(
  options: AIResearchContextOptions["establishedUniverse"],
): Promise<EstablishedAddressUniverse | null> {
  if (options?.universe !== undefined) return options.universe;
  try {
    return (await readEstablishedUniverseStore(options?.storePath)).current;
  } catch {
    return null;
  }
}

function eligibleFromMain(entry: EstablishedAddressUniverse["entries"][number]): EligibleIdentity {
  return {
    chain: entry.chain,
    contract_address: entry.contract_address,
    identity: universeIdentityKey(entry.chain, entry.contract_address),
    source: "MAIN_RADAR",
    sort_at: entry.updated_at,
  };
}

function eligibleFromFollowUp(storeEntry: FollowUpStore["entries"][number]): EligibleIdentity {
  return {
    chain: storeEntry.chain,
    contract_address: storeEntry.contract_address,
    identity: universeIdentityKey(storeEntry.chain, storeEntry.contract_address),
    source: "FOLLOW_UP",
    sort_at: storeEntry.last_seen_at,
  };
}

function compareEligible(left: EligibleIdentity, right: EligibleIdentity): number {
  return Number(left.source !== "MAIN_RADAR") - Number(right.source !== "MAIN_RADAR")
    || Date.parse(left.sort_at) - Date.parse(right.sort_at)
    || left.identity.localeCompare(right.identity);
}
