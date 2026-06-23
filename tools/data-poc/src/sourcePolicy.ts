import { readFileSync } from "node:fs";
import { type AccessStatus, type SourceRegistrySource, type UsageScope } from "./sourceRegistryTypes.js";
import { loadSourceRegistry, resolveRepoFile } from "./sourceRegistryValidator.js";

export const SOURCE_ENVIRONMENTS = ["FIXTURE_ONLY", "LOCAL_POC", "INTERNAL_BETA", "PUBLIC_BETA", "COMMERCIAL"] as const;
export const SOURCE_ACTIONS = [
  "fixture_load",
  "live_fetch",
  "normalized_storage",
  "raw_storage",
  "user_display",
  "derived_score_display"
] as const;

export type SourceEnvironment = (typeof SOURCE_ENVIRONMENTS)[number];
export type SourceAction = (typeof SOURCE_ACTIONS)[number];

export type SourcePolicyDecision = {
  allowed: boolean;
  source_id: string;
  environment: string;
  action: string;
  access_status: AccessStatus | null;
  usage_scope: UsageScope | null;
  reason: string;
};

export type SourcePolicyRequest = {
  sourceId: string;
  environment?: string | null;
  action: SourceAction | string;
};

type RuntimePolicySource = {
  action_allowlist: Partial<Record<SourceAction, SourceEnvironment[]>>;
  notes?: string[];
};

type RuntimePolicy = {
  policy_version: string;
  safe_default_environment: SourceEnvironment;
  environments: SourceEnvironment[];
  actions: SourceAction[];
  sources: Record<string, RuntimePolicySource>;
};

let runtimePolicyCache: RuntimePolicy | null = null;
let registrySourcesCache: Map<string, SourceRegistrySource> | null = null;

export class SourcePolicyError extends Error {
  readonly decision: SourcePolicyDecision;

  constructor(decision: SourcePolicyDecision) {
    super(decision.reason);
    this.name = "SourcePolicyError";
    this.decision = decision;
  }
}

export function getSourcePolicyDecision(request: SourcePolicyRequest): SourcePolicyDecision {
  const sourceId = request.sourceId;
  const environment = normalizeSourceEnvironment(request.environment);
  const action = request.action;
  const registrySource = getRegistrySources().get(sourceId);

  if (!isSourceAction(action)) {
    return {
      allowed: false,
      source_id: sourceId,
      environment,
      action,
      access_status: registrySource?.access_status ?? null,
      usage_scope: registrySource?.usage_scope ?? null,
      reason: `Denied: unknown action ${action}`
    };
  }

  if (!registrySource) {
    return {
      allowed: false,
      source_id: sourceId,
      environment,
      action,
      access_status: null,
      usage_scope: null,
      reason: `Denied: unknown source_id ${sourceId}`
    };
  }

  if (registrySource.access_status === "BLOCKED_NO_PERMISSION" || registrySource.usage_scope === "NOT_ALLOWED") {
    return {
      allowed: false,
      source_id: sourceId,
      environment,
      action,
      access_status: registrySource.access_status,
      usage_scope: registrySource.usage_scope,
      reason: `Denied: source ${sourceId} is blocked by registry status`
    };
  }

  const runtimeSource = loadRuntimePolicy().sources[sourceId];
  if (!runtimeSource) {
    return {
      allowed: false,
      source_id: sourceId,
      environment,
      action,
      access_status: registrySource.access_status,
      usage_scope: registrySource.usage_scope,
      reason: `Denied: source ${sourceId} has no explicit runtime policy`
    };
  }

  const allowedEnvironments = runtimeSource.action_allowlist[action] ?? [];
  const allowed = allowedEnvironments.includes(environment);

  return {
    allowed,
    source_id: sourceId,
    environment,
    action,
    access_status: registrySource.access_status,
    usage_scope: registrySource.usage_scope,
    reason: allowed
      ? `Allowed: ${sourceId} may perform ${action} in ${environment}`
      : `Denied: ${sourceId} may not perform ${action} in ${environment}`
  };
}

export function assertSourceActionAllowed(request: SourcePolicyRequest): SourcePolicyDecision {
  const decision = getSourcePolicyDecision(request);
  if (!decision.allowed) {
    throw new SourcePolicyError(decision);
  }
  return decision;
}

export function getActiveSourceEnvironment(value = process.env.CRYPTO_EDGE_DATA_ENV): SourceEnvironment {
  return normalizeSourceEnvironment(value);
}

export function normalizeSourceEnvironment(value?: string | null): SourceEnvironment {
  return isSourceEnvironment(value) ? value : loadRuntimePolicy().safe_default_environment;
}

export function isSourceEnvironment(value: unknown): value is SourceEnvironment {
  return typeof value === "string" && SOURCE_ENVIRONMENTS.includes(value as SourceEnvironment);
}

export function isSourceAction(value: unknown): value is SourceAction {
  return typeof value === "string" && SOURCE_ACTIONS.includes(value as SourceAction);
}

export function isSourcePolicyError(error: unknown): error is SourcePolicyError {
  return error instanceof SourcePolicyError;
}

export function resetSourcePolicyCachesForTests(): void {
  runtimePolicyCache = null;
  registrySourcesCache = null;
}

function loadRuntimePolicy(): RuntimePolicy {
  if (runtimePolicyCache) return runtimePolicyCache;

  const path = resolveRepoFile("config/data_source_runtime_policy.json");
  runtimePolicyCache = JSON.parse(readFileSync(path, "utf8")) as RuntimePolicy;
  return runtimePolicyCache;
}

function getRegistrySources(): Map<string, SourceRegistrySource> {
  if (registrySourcesCache) return registrySourcesCache;

  registrySourcesCache = new Map(loadSourceRegistry().sources.map((source) => [source.source_id, source]));
  return registrySourcesCache;
}
