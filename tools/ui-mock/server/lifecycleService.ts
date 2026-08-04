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
import { readFollowUpStore, findLatestManualVerification, type FollowUpEntry } from "../../data-poc/src/followUpBasket.js";
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

export type LifecycleRadarCard = LifecycleTokenView & {
  chain: string;
  contract_address: string;
  display_name: string | null;
  symbol: string | null;
  first_seen_at: string;
  last_seen_at: string;
  snapshot_present: boolean;
  snapshot_absence_notice: boolean;
  market: { price_usd: number | null; market_cap_usd: number | null; liquidity_usd: number | null; volume_24h_usd: number | null } | null;
  follow_up: { lifecycle_status: string; next_check_at: string | null; last_checked_at: string | null; missing_data: string[]; risk_flags: string[] } | null;
};

export type LifecycleRadarGroup = { total: number; displayed: number; limit: number; next_cursor: string | null; cards: LifecycleRadarCard[] };
export type LifecycleRadarView = {
  schema_version: "lifecycle_radar_view_v1";
  summary: LifecycleSummary;
  actor: LifecycleTokenView["actor"];
  new_inbox: LifecycleRadarGroup;
  follow_up: { action_due: LifecycleRadarGroup; candidates_ready: LifecycleRadarGroup; observed: LifecycleRadarGroup };
  main_radar: { total: number };
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
    const [inbox, followUp, audit, universe] = await Promise.all([readNewInboxStore(paths.inbox), readFollowUpStore(paths.followUp), readLifecycleAuditStore(paths.audit), readEstablishedUniverseStore(paths.established)]);
    return buildLifecycleSummary(inbox, followUp, audit, universe.current.entries.filter((entry) => entry.enabled).length);
  }

  async function inbox(): Promise<Awaited<ReturnType<typeof readNewInboxStore>>> { return readNewInboxStore(paths.inbox); }
  async function workspaceIntegrity() { return (await workspace()).integrity(); }

  async function radar(session: Pc1SessionContext, input: { limit: number; cursor: RadarCursor | null }): Promise<LifecycleRadarView> {
    const [inbox, followUp, audit, universe, scanner, workspaceRepository] = await Promise.all([
      readNewInboxStore(paths.inbox),
      readFollowUpStore(paths.followUp),
      readLifecycleAuditStore(paths.audit),
      readEstablishedUniverseStore(paths.established),
      readLatestScannerOutput(options.scanner).catch(() => null),
      workspace(),
    ]);
    const now = new Date();
    const mainIdentities = new Set(universe.current.entries.filter((entry) => entry.enabled).map((entry) => universeIdentityKey(entry.chain, entry.contract_address)));
    const privateByIdentity = new Map(workspaceRepository.list(session.actor_id).map((entry) => [entry.identity, entry]));
    const snapshot = scannerOutput(scanner);
    const candidateByIdentity = new Map((snapshot?.candidates ?? []).flatMap((candidate) => {
      if (candidate.contract_address === null) return [];
      const identity = safeIdentity(candidate.chain, candidate.contract_address);
      return identity ? [[identity, candidate] as const] : [];
    }));
    const actor = { role: session.role, capabilities: [...session.capabilities] };
    const makeCard = (identity: string, systemStatus: SystemLifecycleStatus, inboxEntry: Awaited<ReturnType<typeof readNewInboxStore>>["entries"][number] | null, followEntry: FollowUpEntry | null): LifecycleRadarCard => {
      const candidate = candidateByIdentity.get(identity) ?? null;
      const chain = inboxEntry?.chain ?? followEntry?.chain;
      const contractAddress = inboxEntry?.contract_address ?? followEntry?.contract_address;
      if (!chain || !contractAddress) throw new LifecycleServiceError("LIFECYCLE_RECORD_INVALID", 503);
      const main = mainIdentities.has(identity);
      const conditions = followEntry
        ? evaluateFollowUpToMainRadar(followEntry, main, true, { now, manualVerification: findLatestManualVerification(followUp, chain, contractAddress) })
        : candidate && snapshot
          ? evaluateNewToFollowUp(candidate, snapshot, { inFollowUp: false, inMainRadar: main })
          : inboxEntry?.last_evaluation ?? unavailableConditions();
      const privateEntry = privateByIdentity.get(identity) ?? null;
      return {
        identity,
        chain,
        contract_address: contractAddress,
        display_name: inboxEntry?.display_name ?? followEntry?.display_name ?? candidate?.name ?? null,
        symbol: inboxEntry?.symbol ?? followEntry?.symbol_hint ?? candidate?.symbol ?? null,
        first_seen_at: inboxEntry?.first_seen_at ?? followEntry?.first_seen_at ?? now.toISOString(),
        last_seen_at: inboxEntry?.last_seen_at ?? followEntry?.last_seen_at ?? now.toISOString(),
        snapshot_present: candidate !== null,
        snapshot_absence_notice: inboxEntry !== null && candidate === null,
        market: candidate ? {
          price_usd: finite(candidate.price_usd), market_cap_usd: finite(candidate.market_cap_usd), liquidity_usd: finite(candidate.liquidity_usd), volume_24h_usd: finite(candidate.volume_24h_usd),
        } : null,
        follow_up: followEntry ? {
          lifecycle_status: followEntry.lifecycle_status,
          next_check_at: followEntry.next_check_at,
          last_checked_at: followEntry.last_checked_at,
          missing_data: [...followEntry.latest_security_status.missing_data],
          risk_flags: [...followEntry.latest_security_status.risk_flags],
        } : null,
        system_status: systemStatus,
        user_status: privateEntry?.private_status ?? systemStatus,
        user_status_is_override: privateEntry !== null,
        conditions,
        actor,
      };
    };
    const newCards = inbox.entries
      .filter((entry) => entry.system_status === "NEW" && entry.archived_at === null && entry.rejected_at === null)
      .sort(compareInbox)
      .map((entry) => makeCard(entry.identity, "NEW", entry, null));
    const followCards = followUp.entries
      .filter((entry) => entry.lifecycle_status !== "ESTABLISHED" && entry.lifecycle_status !== "ARCHIVED" && !mainIdentities.has(universeIdentityKey(entry.chain, entry.contract_address)))
      .map((entry) => makeCard(universeIdentityKey(entry.chain, entry.contract_address), "FOLLOW_UP", inbox.entries.find((inboxEntry) => inboxEntry.identity === universeIdentityKey(entry.chain, entry.contract_address)) ?? null, entry));
    const due = followCards.filter((card) => isActionDue(card, now)).sort(compareFollowUpCards);
    const ready = followCards.filter((card) => !due.includes(card) && card.follow_up?.lifecycle_status === "CANDIDATE_FOR_ESTABLISHED" && card.conditions.risks.length === 0).sort(compareFollowUpCards);
    const observed = followCards.filter((card) => !due.includes(card) && !ready.includes(card)).sort(compareFollowUpCards);
    const cursor = input.cursor ?? emptyRadarCursor();
    const newGroup = pageRadarGroup(newCards, cursor.new_inbox, input.limit, "new_inbox", cursor);
    const dueGroup = pageRadarGroup(due, cursor.action_due, input.limit, "action_due", cursor);
    const readyGroup = pageRadarGroup(ready, cursor.candidates_ready, input.limit, "candidates_ready", cursor);
    const observedGroup = pageRadarGroup(observed, cursor.observed, input.limit, "observed", cursor);
    const summary = buildLifecycleSummary(inbox, followUp, audit, mainIdentities.size);
    summary.follow_up_displayed = dueGroup.displayed + readyGroup.displayed + observedGroup.displayed;
    return { schema_version: "lifecycle_radar_view_v1", summary, actor, new_inbox: newGroup, follow_up: { action_due: dueGroup, candidates_ready: readyGroup, observed: observedGroup }, main_radar: { total: mainIdentities.size } };
  }
  return { resolveToken, transition, summary, inbox, workspaceIntegrity, radar };
}

export type RadarCursor = { new_inbox: number; action_due: number; candidates_ready: number; observed: number };
export function parseRadarCursor(value: string | null): RadarCursor | null {
  if (value === null) return null;
  if (value.length < 4 || value.length > 240 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new LifecycleServiceError("LIFECYCLE_CURSOR_INVALID", 400);
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
    if (!isRecord(parsed) || parsed.v !== 1 || !isRecord(parsed.o)) throw new Error("invalid");
    const offsets = [parsed.o.new_inbox, parsed.o.action_due, parsed.o.candidates_ready, parsed.o.observed];
    if (!offsets.every((offset) => Number.isSafeInteger(offset) && Number(offset) >= 0 && Number(offset) <= 10_000)) throw new Error("invalid");
    return { new_inbox: Number(parsed.o.new_inbox), action_due: Number(parsed.o.action_due), candidates_ready: Number(parsed.o.candidates_ready), observed: Number(parsed.o.observed) };
  } catch { throw new LifecycleServiceError("LIFECYCLE_CURSOR_INVALID", 400); }
}

function emptyRadarCursor(): RadarCursor { return { new_inbox: 0, action_due: 0, candidates_ready: 0, observed: 0 }; }
function pageRadarGroup(cards: LifecycleRadarCard[], offset: number, limit: number, key: keyof RadarCursor, cursor: RadarCursor): LifecycleRadarGroup {
  const boundedOffset = Math.min(offset, cards.length);
  const page = cards.slice(boundedOffset, boundedOffset + limit);
  const nextOffset = boundedOffset + page.length;
  const next = nextOffset < cards.length ? encodeRadarCursor({ ...cursor, [key]: nextOffset }) : null;
  return { total: cards.length, displayed: page.length, limit, next_cursor: next, cards: page };
}
function encodeRadarCursor(cursor: RadarCursor): string { return Buffer.from(JSON.stringify({ v: 1, o: cursor }), "utf8").toString("base64url"); }
function compareInbox(left: { last_seen_at: string; identity: string }, right: { last_seen_at: string; identity: string }): number { return Date.parse(right.last_seen_at) - Date.parse(left.last_seen_at) || left.identity.localeCompare(right.identity); }
function compareFollowUpCards(left: LifecycleRadarCard, right: LifecycleRadarCard): number {
  const leftDue = left.follow_up?.next_check_at ? Date.parse(left.follow_up.next_check_at) : Number.POSITIVE_INFINITY;
  const rightDue = right.follow_up?.next_check_at ? Date.parse(right.follow_up.next_check_at) : Number.POSITIVE_INFINITY;
  return leftDue - rightDue
    || Number(left.conditions.readiness === "CONDITIONS_UNMET") - Number(right.conditions.readiness === "CONDITIONS_UNMET")
    || right.conditions.missing_data.length - left.conditions.missing_data.length
    || Date.parse(right.last_seen_at) - Date.parse(left.last_seen_at)
    || left.identity.localeCompare(right.identity);
}
function isActionDue(card: LifecycleRadarCard, now: Date): boolean {
  const due = card.follow_up?.next_check_at ? Date.parse(card.follow_up.next_check_at) <= now.getTime() : false;
  return due || card.follow_up?.lifecycle_status === "CANDIDATE_FOR_ESTABLISHED" && card.conditions.readiness === "CONDITIONS_UNMET" || card.conditions.missing_data.length > 0 || card.conditions.risks.length > 0;
}
function finite(value: number | null): number | null { return typeof value === "number" && Number.isFinite(value) ? value : null; }

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
