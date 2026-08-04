import { createHash } from "node:crypto";
import {
  buildLifecycleSummary,
  evaluateFollowUpToMainRadar,
  evaluateNewToFollowUp,
  getDefaultLifecycleAuditStorePath,
  getDefaultNewInboxStorePath,
  readLifecycleAuditStore,
  readNewInboxStore,
  type LifecycleConditions,
  type LifecycleSummary,
  type SystemLifecycleStatus,
} from "../../data-poc/src/systemLifecycle.js";
import { getDefaultEstablishedUniverseStorePath, normalizeEstablishedAddress, normalizeEstablishedChain, universeIdentityKey } from "../../data-poc/src/establishedAddressUniverse.js";
import { readEstablishedUniverseStore } from "../../data-poc/src/establishedUniverseManager.js";
import { readFollowUpStore } from "../../data-poc/src/followUpBasket.js";
import type { PersistableScannerOutput } from "../../data-poc/src/persistableScannerModel.js";
import { readLatestScannerOutput, type LatestScannerOutputOptions } from "./latestScannerOutput.js";
import type { Pc1SessionContext } from "./lifecycleSession.js";
import { createUserWorkspaceRepository, UserWorkspaceError, type UserWorkspaceRepository } from "./userWorkspaceRepository.js";

export type LifecycleTokenView = {
  identity: string;
  system_status: SystemLifecycleStatus;
  user_status: SystemLifecycleStatus;
  user_status_is_override: boolean;
  conditions: LifecycleConditions;
  actor: { role: Pc1SessionContext["role"]; capabilities: Pc1SessionContext["capabilities"] };
};

export class LifecycleServiceError extends Error {
  readonly code: string;
  readonly httpStatus: number;
  constructor(code: string, httpStatus: number) { super(code); this.name = "LifecycleServiceError"; this.code = code; this.httpStatus = httpStatus; }
}

export function createLifecycleService(options: {
  scanner?: LatestScannerOutputOptions;
  followUpStorePath?: string;
  establishedStorePath?: string;
  newInboxStorePath?: string;
  auditStorePath?: string;
  workspace?: UserWorkspaceRepository;
  workspaceDatabasePath?: string;
} = {}) {
  let workspacePromise: Promise<UserWorkspaceRepository> | null = options.workspace ? Promise.resolve(options.workspace) : null;
  const workspace = () => {
    if (!workspacePromise) workspacePromise = createUserWorkspaceRepository({ databaseFilePath: options.workspaceDatabasePath });
    return workspacePromise;
  };
  const paths = {
    followUp: options.followUpStorePath,
    established: options.establishedStorePath ?? getDefaultEstablishedUniverseStorePath(),
    inbox: options.newInboxStorePath ?? getDefaultNewInboxStorePath(),
    audit: options.auditStorePath ?? getDefaultLifecycleAuditStorePath(),
  };

  async function resolveToken(chainInput: string, addressInput: string, session: Pc1SessionContext): Promise<LifecycleTokenView> {
    const identity = normalizeIdentity(chainInput, addressInput);
    const [inbox, followUp, universe, scanner, workspaceRepository] = await Promise.all([
      readNewInboxStore(paths.inbox),
      readFollowUpStore(paths.followUp),
      readEstablishedUniverseStore(paths.established),
      readLatestScannerOutput(options.scanner).catch(() => null),
      workspace(),
    ]);
    const followUpEntry = followUp.entries.find((entry) => universeIdentityKey(entry.chain, entry.contract_address) === identity.identity) ?? null;
    const inboxEntry = inbox.entries.find((entry) => entry.identity === identity.identity) ?? null;
    const main = universe.current.entries.some((entry) => entry.enabled && universeIdentityKey(entry.chain, entry.contract_address) === identity.identity);
    const snapshot = scannerOutput(scanner);
    const candidate = snapshot?.candidates.find((entry) => entry.contract_address !== null && safeIdentity(entry.chain, entry.contract_address) === identity.identity) ?? null;
    const systemStatus: SystemLifecycleStatus = main ? "MAIN_RADAR" : followUpEntry && followUpEntry.lifecycle_status !== "ARCHIVED" ? "FOLLOW_UP" : inboxEntry?.system_status ?? "NEW";
    const conditions = systemStatus === "FOLLOW_UP" && followUpEntry
      ? evaluateFollowUpToMainRadar(followUpEntry, main)
      : candidate && snapshot
        ? evaluateNewToFollowUp(candidate, snapshot, { inFollowUp: Boolean(followUpEntry), inMainRadar: main })
        : unavailableConditions();
    const current = workspaceRepository.get(session.actor_id, identity.identity);
    return {
      identity: identity.identity,
      system_status: systemStatus,
      user_status: current?.private_status ?? systemStatus,
      user_status_is_override: current !== null,
      conditions,
      actor: { role: session.role, capabilities: [...session.capabilities] },
    };
  }

  async function transition(input: {
    chain: string;
    contractAddress: string;
    targetStatus: SystemLifecycleStatus;
    overrideReason: string | null;
    session: Pc1SessionContext;
  }): Promise<LifecycleTokenView & { transition_id: string }> {
    if (!input.session.capabilities.includes("CAMP_USER_WORKSPACE_WRITE")) throw new LifecycleServiceError("WORKSPACE_WRITE_FORBIDDEN", 403);
    const view = await resolveToken(input.chain, input.contractAddress, input.session);
    try {
      const repository = await workspace();
      const audit = repository.transition({
        actorId: input.session.actor_id,
        identity: view.identity,
        previousPrivateStatus: view.user_status,
        newPrivateStatus: input.targetStatus,
        systemStatus: view.system_status,
        conditions: view.conditions,
        overrideReason: input.overrideReason,
        sessionReference: input.session.session_id,
      });
      return { ...view, user_status: input.targetStatus, user_status_is_override: true, transition_id: audit.transition_id };
    } catch (error) {
      if (error instanceof UserWorkspaceError) throw new LifecycleServiceError(error.code, error.code === "WORKSPACE_UNAVAILABLE" ? 503 : 400);
      throw error;
    }
  }

  async function summary(): Promise<LifecycleSummary> {
    const [inbox, followUp, audit] = await Promise.all([readNewInboxStore(paths.inbox), readFollowUpStore(paths.followUp), readLifecycleAuditStore(paths.audit)]);
    return buildLifecycleSummary(inbox, followUp, audit);
  }

  async function inbox(): Promise<Awaited<ReturnType<typeof readNewInboxStore>>> { return readNewInboxStore(paths.inbox); }
  async function workspaceIntegrity() { return (await workspace()).integrity(); }
  return { resolveToken, transition, summary, inbox, workspaceIntegrity };
}

function normalizeIdentity(chain: string, address: string): { identity: string } {
  try {
    const normalizedChain = normalizeEstablishedChain(chain);
    const normalizedAddress = normalizeEstablishedAddress(normalizedChain, address);
    return { identity: universeIdentityKey(normalizedChain, normalizedAddress) };
  } catch { throw new LifecycleServiceError("LIFECYCLE_IDENTITY_INVALID", 400); }
}
function safeIdentity(chain: string, address: string): string | null { try { return normalizeIdentity(chain, address).identity; } catch { return null; } }
function unavailableConditions(): LifecycleConditions { return { conditions_met: [], conditions_unmet: ["VALIDATED_LIFECYCLE_RECORD_REQUIRED"], missing_data: ["LIFECYCLE_RECORD"], risks: [], readiness: "CONDITIONS_UNMET", security_state: "UNKNOWN", verification_state: "UNKNOWN" }; }
function scannerOutput(value: unknown): PersistableScannerOutput | null {
  if (!isRecord(value) || !isRecord(value.scan_run) || !Array.isArray(value.candidates) || !Array.isArray(value.security_checks) || !Array.isArray(value.scorecards)) return null;
  return value as unknown as PersistableScannerOutput;
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
export function lifecycleSessionReference(sessionId: string): string { return `sha256:${createHash("sha256").update(sessionId, "utf8").digest("hex")}`; }
