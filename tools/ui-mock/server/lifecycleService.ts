import { createHash } from "node:crypto";
import {
  buildLifecycleSummary,
  countNewInboxDetectedIdentities,
  evaluateFollowUpToMainRadar,
  evaluateNewToFollowUp,
  getDefaultLifecycleCycleReceiptPath,
  getDefaultNewInboxStorePath,
  readLatestLifecycleCycleReceipt,
  readNewInboxStore,
  resolveNewInboxArchiveStorePath,
  type LifecycleCycleReceipt,
  type LifecycleEvaluationContext,
  type LifecycleConditions,
  type LifecycleSummary,
  type SystemLifecycleStatus,
} from "../../data-poc/src/systemLifecycle.js";
import { getDefaultEstablishedUniverseStorePath, normalizeEstablishedAddress, normalizeEstablishedChain, universeIdentityKey, type EstablishedAddressUniverseEntry } from "../../data-poc/src/establishedAddressUniverse.js";
import { readEstablishedUniverseStore } from "../../data-poc/src/establishedUniverseManager.js";
import { readFollowUpStore, findLatestManualVerification, type FollowUpEntry } from "../../data-poc/src/followUpBasket.js";
import { getDefaultNewRecheckStorePath, readNewRecheckStore, type NewRecheckStore } from "../../data-poc/src/newRecheckStore.js";
import type { PersistableScannerOutput } from "../../data-poc/src/persistableScannerModel.js";
import { readLatestScannerOutput, type LatestScannerOutputOptions } from "./latestScannerOutput.js";
import type { Pc1SessionContext } from "./lifecycleSession.js";
import { createUserWorkspaceRepository, UserWorkspaceError, type UserWorkspaceRepository } from "./userWorkspaceRepository.js";
import type { UiTokenCandidate } from "../src/types/scannerTypes.js";

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
  market: LifecycleMarketObservation | null;
  follow_up: { lifecycle_status: string; next_check_at: string | null; last_checked_at: string | null; missing_data: string[]; risk_flags: string[]; action_due: boolean } | null;
};

export type LifecycleMarketObservation = {
  price_usd: number;
  market_cap_usd: number;
  liquidity_usd: number;
  volume_24h_usd: number;
  observed_at: string;
  source: "CURRENT_SCANNER" | "NEW_RECHECK" | "FOLLOW_UP";
};

export type LifecycleRadarGroup = { total: number; displayed: number; limit: number; next_cursor: string | null; cards: LifecycleRadarCard[] };
export type LifecyclePrivateBaskets = { new: LifecycleRadarGroup; follow_up: LifecycleRadarGroup; main_radar: LifecycleRadarGroup };
export type LifecycleRadarView = {
  schema_version: "lifecycle_radar_view_v1";
  summary: LifecycleSummary;
  actor: LifecycleTokenView["actor"];
  new_inbox: LifecycleRadarGroup;
  follow_up: { action_due: LifecycleRadarGroup; candidates_ready: LifecycleRadarGroup; observed: LifecycleRadarGroup };
  main_radar: { total: number };
  private_new_total: number;
  private_follow_up_total: number;
  private_main_radar_total: number;
  private_baskets: LifecyclePrivateBaskets;
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
  newInboxArchiveStorePath?: string;
  auditStorePath?: string;
  cycleReceiptPath?: string;
  newRecheckStorePath?: string;
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
    archive: resolveNewInboxArchiveStorePath(options.newInboxStorePath, options.newInboxArchiveStorePath),
    receipt: options.cycleReceiptPath ?? getDefaultLifecycleCycleReceiptPath(),
    newRecheck: options.newRecheckStorePath ?? getDefaultNewRecheckStorePath(),
  };

  async function resolveToken(chainInput: string, addressInput: string, session: Pc1SessionContext): Promise<LifecycleTokenView> {
    const identity = normalizeIdentity(chainInput, addressInput);
    const [inbox, followUp, universe, scanner, receipt, newRecheck, workspaceRepository] = await Promise.all([
      readNewInboxStore(paths.inbox),
      readFollowUpStore(paths.followUp),
      readEstablishedUniverseStore(paths.established),
      readLatestScannerOutput(options.scanner).catch(() => null),
      readLatestLifecycleCycleReceipt(paths.receipt),
      readNewRecheckStore(paths.newRecheck),
      workspace(),
    ]);
    const followUpEntry = followUp.entries.find((entry) => universeIdentityKey(entry.chain, entry.contract_address) === identity.identity) ?? null;
    const inboxEntry = inbox.entries.find((entry) => entry.identity === identity.identity) ?? null;
    const main = universe.current.entries.some((entry) => entry.enabled && universeIdentityKey(entry.chain, entry.contract_address) === identity.identity);
    const snapshot = scannerOutput(scanner);
    const snapshotCandidate = snapshot?.candidates.find((entry) => entry.contract_address !== null && safeIdentity(entry.chain, entry.contract_address) === identity.identity) ?? null;
    const candidate = preferredNewRecheckCandidate(identity.identity, snapshotCandidate, newRecheck);
    const systemStatus: SystemLifecycleStatus = main
      ? "MAIN_RADAR"
      : inboxEntry?.system_status ?? (followUpEntry && followUpEntry.lifecycle_status !== "ARCHIVED" ? "FOLLOW_UP" : "NEW");
    const conditions = systemStatus === "FOLLOW_UP" && followUpEntry
      ? evaluateFollowUpToMainRadar(followUpEntry, lifecycleEvaluationContext({
        receipt,
        scannerRunId: snapshot?.scan_run.run_id ?? null,
        evaluatedAt: new Date(),
        manualVerification: findLatestManualVerification(followUp, followUpEntry.chain, followUpEntry.contract_address),
        establishedMembership: main,
      }))
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

  async function clearPrivateStatus(input: {
    chain: string;
    contractAddress: string;
    session: Pc1SessionContext;
  }): Promise<LifecycleTokenView & { removed: boolean }> {
    if (!input.session.capabilities.includes("CAMP_USER_WORKSPACE_WRITE")) throw new LifecycleServiceError("WORKSPACE_WRITE_FORBIDDEN", 403);
    const view = await resolveToken(input.chain, input.contractAddress, input.session);
    try {
      const removed = (await workspace()).remove({ actorId: input.session.actor_id, identity: view.identity });
      return { ...view, user_status: view.system_status, user_status_is_override: false, removed };
    } catch (error) {
      if (error instanceof UserWorkspaceError) throw new LifecycleServiceError(error.code, error.code === "WORKSPACE_UNAVAILABLE" ? 503 : 400);
      throw error;
    }
  }

  /**
   * A current scanner observation is not required for a CAMP participant to
   * continue private research on an active canonical New record they retained
   * in their own workspace. The workspace grants access only after the Inbox
   * independently proves the token was a product record; browser facts never
   * participate in this decision.
   */
  async function resolveRetainedPrivateResearchCandidate(
    chainInput: string,
    addressInput: string,
    session: Pc1SessionContext,
  ): Promise<UiTokenCandidate | null> {
    const identity = normalizeIdentity(chainInput, addressInput);
    const [inbox, workspaceRepository] = await Promise.all([
      readNewInboxStore(paths.inbox),
      workspace(),
    ]);
    const privateEntry = workspaceRepository.get(session.actor_id, identity.identity);
    if (!privateEntry) return null;
    const retained = inbox.entries.find((entry) => (
      entry.identity === identity.identity
      && entry.archived_at === null
      && entry.rejected_at === null
    ));
    return retained ? researchCandidateFromRetainedInbox(retained) : null;
  }

  async function summary(): Promise<LifecycleSummary> {
    const [inbox, followUp, universe, receipt, scanner] = await Promise.all([
      readNewInboxStore(paths.inbox),
      readFollowUpStore(paths.followUp),
      readEstablishedUniverseStore(paths.established),
      readLatestLifecycleCycleReceipt(paths.receipt),
      readLatestScannerOutput(options.scanner).catch(() => null),
    ]);
    const detectedIdentityCount = await countNewInboxDetectedIdentities(paths.archive);
    const grouping = resolveCurrentSystemFollowUpGrouping(inbox, followUp, universe.current.entries, receipt, scannerOutput(scanner), new Date());
    return {
      ...buildLifecycleSummary(
        inbox,
        followUp,
        universe.current.entries.filter((entry) => entry.enabled).length,
        receipt,
        new Date(),
        Math.max(detectedIdentityCount, new Set(inbox.entries.map((entry) => entry.identity)).size),
      ),
      follow_up_action_due: grouping.action_due,
      follow_up_candidates_ready: grouping.candidates_ready,
    };
  }

  async function inbox(): Promise<Awaited<ReturnType<typeof readNewInboxStore>>> { return readNewInboxStore(paths.inbox); }
  async function latestReceipt() { return readLatestLifecycleCycleReceipt(paths.receipt); }
  async function workspaceIntegrity() { return (await workspace()).integrity(); }

  async function radar(session: Pc1SessionContext, input: { limit: number; cursor: RadarCursor | null }): Promise<LifecycleRadarView> {
    const [inbox, followUp, universe, scanner, receipt, newRecheck, workspaceRepository, detectedIdentityCount] = await Promise.all([
      readNewInboxStore(paths.inbox),
      readFollowUpStore(paths.followUp),
      readEstablishedUniverseStore(paths.established),
      readLatestScannerOutput(options.scanner).catch(() => null),
      readLatestLifecycleCycleReceipt(paths.receipt),
      readNewRecheckStore(paths.newRecheck),
      workspace(),
      countNewInboxDetectedIdentities(paths.archive),
    ]);
    const now = new Date();
    const mainEntries = universe.current.entries.filter((entry) => entry.enabled);
    const mainByIdentity = new Map(mainEntries.map((entry) => [universeIdentityKey(entry.chain, entry.contract_address), entry]));
    const mainIdentities = new Set(mainByIdentity.keys());
    const privateByIdentity = new Map(workspaceRepository.list(session.actor_id).map((entry) => [entry.identity, entry]));
    const snapshot = scannerOutput(scanner);
    const candidateByIdentity = new Map((snapshot?.candidates ?? []).flatMap((candidate) => {
      if (candidate.contract_address === null) return [];
      const identity = safeIdentity(candidate.chain, candidate.contract_address);
      return identity ? [[identity, candidate] as const] : [];
    }));
    const freshRecheckByIdentity = new Map<string, PersistableScannerOutput["candidates"][number]>();
    const freshRecheckTimestampByIdentity = new Map<string, string>();
    for (const entry of newRecheck.entries) {
      const candidate = preferredNewRecheckCandidate(entry.identity, candidateByIdentity.get(entry.identity) ?? null, { ...newRecheck, entries: [entry] });
      if (candidate && candidate !== candidateByIdentity.get(entry.identity)) {
        candidateByIdentity.set(entry.identity, candidate);
        freshRecheckByIdentity.set(entry.identity, candidate);
        if (entry.latest_source_timestamp !== null) {
          freshRecheckTimestampByIdentity.set(entry.identity, entry.latest_source_timestamp);
        }
      }
    }
    const actor = { role: session.role, capabilities: [...session.capabilities] };
    const makeCard = (identity: string, systemStatus: SystemLifecycleStatus, inboxEntry: Awaited<ReturnType<typeof readNewInboxStore>>["entries"][number] | null, followEntry: FollowUpEntry | null, mainEntry: EstablishedAddressUniverseEntry | null): LifecycleRadarCard => {
      const candidate = candidateByIdentity.get(identity) ?? null;
      const chain = inboxEntry?.chain ?? followEntry?.chain ?? mainEntry?.chain;
      const contractAddress = inboxEntry?.contract_address ?? followEntry?.contract_address ?? mainEntry?.contract_address;
      if (!chain || !contractAddress) throw new LifecycleServiceError("LIFECYCLE_RECORD_INVALID", 503);
      const main = mainIdentities.has(identity);
      const conditions = followEntry
        ? evaluateFollowUpToMainRadar(followEntry, lifecycleEvaluationContext({
          receipt,
          scannerRunId: snapshot?.scan_run.run_id ?? null,
          evaluatedAt: now,
          manualVerification: findLatestManualVerification(followUp, chain, contractAddress),
          establishedMembership: main,
        }))
        : candidate && snapshot
          ? evaluateNewToFollowUp(candidate, snapshot, { inFollowUp: false, inMainRadar: main })
          : inboxEntry?.last_evaluation ?? unavailableConditions();
      const privateEntry = privateByIdentity.get(identity) ?? null;
      return {
        identity,
        chain,
        contract_address: contractAddress,
        display_name: inboxEntry?.display_name ?? followEntry?.display_name ?? mainEntry?.display_name ?? candidate?.name ?? null,
        symbol: inboxEntry?.symbol ?? followEntry?.symbol_hint ?? mainEntry?.symbol_hint ?? candidate?.symbol ?? null,
        first_seen_at: inboxEntry?.first_seen_at ?? followEntry?.first_seen_at ?? now.toISOString(),
        last_seen_at: freshRecheckByIdentity.get(identity)?.created_at ?? inboxEntry?.last_seen_at ?? followEntry?.last_seen_at ?? now.toISOString(),
        snapshot_present: candidate !== null,
        snapshot_absence_notice: inboxEntry !== null && candidate === null,
        market: resolveLifecycleMarketObservation({
          scanner_candidate: candidate,
          scanner_observed_at: freshRecheckTimestampByIdentity.get(identity) ?? candidate?.created_at ?? null,
          scanner_source: freshRecheckByIdentity.has(identity) ? "NEW_RECHECK" : "CURRENT_SCANNER",
          follow_up_snapshot: followEntry?.last_valid_market_snapshot ?? null,
        }),
        follow_up: followEntry ? {
          lifecycle_status: followEntry.lifecycle_status,
          next_check_at: followEntry.next_check_at,
          last_checked_at: followEntry.last_checked_at,
          missing_data: [...followEntry.latest_security_status.missing_data],
          risk_flags: [...followEntry.latest_security_status.risk_flags],
          action_due: false,
        } : null,
        system_status: systemStatus,
        user_status: privateEntry?.private_status ?? systemStatus,
        user_status_is_override: privateEntry !== null,
        conditions,
        actor,
      };
    };
    const inboxByIdentity = new Map(inbox.entries
      .filter((entry) => entry.archived_at === null && entry.rejected_at === null)
      .map((entry) => [entry.identity, entry]));
    const followByIdentity = new Map(followUp.entries
      .filter((entry) => entry.lifecycle_status !== "ESTABLISHED" && entry.lifecycle_status !== "ARCHIVED")
      .map((entry) => [universeIdentityKey(entry.chain, entry.contract_address), entry]));
    const identities = new Set([...inboxByIdentity.keys(), ...followByIdentity.keys(), ...mainByIdentity.keys()]);
    const cards = [...identities].map((identity) => {
      const inboxEntry = inboxByIdentity.get(identity) ?? null;
      const followEntry = followByIdentity.get(identity) ?? null;
      const mainEntry = mainByIdentity.get(identity) ?? null;
      // The durable inbox is the canonical lifecycle record for an identity.
      // A stale Follow-up observation can coexist with an unpromoted New record
      // in the review fixture; it must not overwrite that record's system status.
      const systemStatus: SystemLifecycleStatus = mainEntry ? "MAIN_RADAR" : inboxEntry?.system_status ?? (followEntry ? "FOLLOW_UP" : "NEW");
      return makeCard(identity, systemStatus, inboxEntry, followEntry, mainEntry);
    });
    const actionAwareCards = cards.map((card) => card.follow_up
      ? { ...card, follow_up: { ...card.follow_up, action_due: isActionDue(card, now) } }
      : card);
    const newCards = actionAwareCards.filter((card) => card.system_status === "NEW").sort(compareInbox);
    const followCards = actionAwareCards.filter((card) => card.system_status === "FOLLOW_UP");
    const due = followCards.filter((card) => isActionDue(card, now)).sort(compareFollowUpCards);
    const ready = followCards.filter((card) => !due.includes(card) && card.follow_up?.lifecycle_status === "CANDIDATE_FOR_ESTABLISHED" && card.conditions.risks.length === 0).sort(compareFollowUpCards);
    const observed = followCards.filter((card) => !due.includes(card) && !ready.includes(card)).sort(compareFollowUpCards);
    const cursor = input.cursor ?? emptyRadarCursor();
    const newGroup = pageRadarGroup(newCards, cursor.new_inbox, input.limit, "new_inbox", cursor);
    const dueGroup = pageRadarGroup(due, cursor.action_due, input.limit, "action_due", cursor);
    const readyGroup = pageRadarGroup(ready, cursor.candidates_ready, input.limit, "candidates_ready", cursor);
    const observedGroup = pageRadarGroup(observed, cursor.observed, input.limit, "observed", cursor);
    const privateNewGroup = pageRadarGroup(actionAwareCards.filter((card) => card.user_status === "NEW").sort(compareInbox), cursor.private_new, input.limit, "private_new", cursor);
    const privateFollowUpGroup = pageRadarGroup(actionAwareCards.filter((card) => card.user_status === "FOLLOW_UP").sort(compareInbox), cursor.private_follow_up, input.limit, "private_follow_up", cursor);
    const privateMainRadarGroup = pageRadarGroup(actionAwareCards.filter((card) => card.user_status === "MAIN_RADAR").sort(compareInbox), cursor.private_main_radar, input.limit, "private_main_radar", cursor);
    const summary = buildLifecycleSummary(
      inbox,
      followUp,
      mainIdentities.size,
      receipt,
      now,
      Math.max(detectedIdentityCount, new Set(inbox.entries.map((entry) => entry.identity)).size),
    );
    summary.follow_up_action_due = dueGroup.total;
    summary.follow_up_candidates_ready = readyGroup.total;
    summary.follow_up_displayed = dueGroup.displayed + readyGroup.displayed + observedGroup.displayed;
    return {
      schema_version: "lifecycle_radar_view_v1",
      summary,
      actor,
      new_inbox: newGroup,
      follow_up: { action_due: dueGroup, candidates_ready: readyGroup, observed: observedGroup },
      main_radar: { total: mainIdentities.size },
      private_new_total: privateNewGroup.total,
      private_follow_up_total: privateFollowUpGroup.total,
      private_main_radar_total: privateMainRadarGroup.total,
      private_baskets: { new: privateNewGroup, follow_up: privateFollowUpGroup, main_radar: privateMainRadarGroup },
    };
  }
  return { resolveToken, transition, clearPrivateStatus, resolveRetainedPrivateResearchCandidate, summary, inbox, latestReceipt, workspaceIntegrity, radar };
}

export type RadarCursor = { new_inbox: number; action_due: number; candidates_ready: number; observed: number; private_new: number; private_follow_up: number; private_main_radar: number };
export function parseRadarCursor(value: string | null): RadarCursor | null {
  if (value === null) return null;
  if (value.length < 4 || value.length > 240 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new LifecycleServiceError("LIFECYCLE_CURSOR_INVALID", 400);
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
    if (!isRecord(parsed) || parsed.v !== 1 || !isRecord(parsed.o)) throw new Error("invalid");
    const offsets = [parsed.o.new_inbox, parsed.o.action_due, parsed.o.candidates_ready, parsed.o.observed, parsed.o.private_new ?? 0, parsed.o.private_follow_up ?? 0, parsed.o.private_main_radar ?? 0];
    if (!offsets.every((offset) => Number.isSafeInteger(offset) && Number(offset) >= 0 && Number(offset) <= 10_000)) throw new Error("invalid");
    return { new_inbox: Number(parsed.o.new_inbox), action_due: Number(parsed.o.action_due), candidates_ready: Number(parsed.o.candidates_ready), observed: Number(parsed.o.observed), private_new: Number(parsed.o.private_new ?? 0), private_follow_up: Number(parsed.o.private_follow_up ?? 0), private_main_radar: Number(parsed.o.private_main_radar ?? 0) };
  } catch { throw new LifecycleServiceError("LIFECYCLE_CURSOR_INVALID", 400); }
}

function emptyRadarCursor(): RadarCursor { return { new_inbox: 0, action_due: 0, candidates_ready: 0, observed: 0, private_new: 0, private_follow_up: 0, private_main_radar: 0 }; }
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
export function resolveLifecycleMarketObservation(input: {
  scanner_candidate: PersistableScannerOutput["candidates"][number] | null;
  scanner_observed_at: string | null;
  scanner_source: "CURRENT_SCANNER" | "NEW_RECHECK";
  follow_up_snapshot: FollowUpEntry["last_valid_market_snapshot"];
}): LifecycleMarketObservation | null {
  const scanner = input.scanner_candidate === null ? null : marketObservation({
    price_usd: input.scanner_candidate.price_usd,
    market_cap_usd: input.scanner_candidate.market_cap_usd,
    liquidity_usd: input.scanner_candidate.liquidity_usd,
    volume_24h_usd: input.scanner_candidate.volume_24h_usd,
    observed_at: input.scanner_observed_at,
    source: input.scanner_source,
  });
  const followUp = input.follow_up_snapshot === null ? null : marketObservation({
    price_usd: input.follow_up_snapshot.price_usd,
    market_cap_usd: input.follow_up_snapshot.market_cap_usd,
    liquidity_usd: input.follow_up_snapshot.liquidity_usd,
    volume_24h_usd: input.follow_up_snapshot.volume_24h_usd,
    observed_at: input.follow_up_snapshot.captured_at,
    source: "FOLLOW_UP",
  });
  if (scanner === null) return followUp;
  if (followUp === null) return scanner;
  return Date.parse(followUp.observed_at) >= Date.parse(scanner.observed_at) ? followUp : scanner;
}

function marketObservation(input: {
  price_usd: number | null;
  market_cap_usd: number | null;
  liquidity_usd: number | null;
  volume_24h_usd: number | null;
  observed_at: string | null;
  source: LifecycleMarketObservation["source"];
}): LifecycleMarketObservation | null {
  const values = [input.price_usd, input.market_cap_usd, input.liquidity_usd, input.volume_24h_usd];
  if (!values.every((value) => typeof value === "number" && Number.isFinite(value) && value > 0)) return null;
  if (input.observed_at === null || !Number.isFinite(Date.parse(input.observed_at))) return null;
  return {
    price_usd: input.price_usd!,
    market_cap_usd: input.market_cap_usd!,
    liquidity_usd: input.liquidity_usd!,
    volume_24h_usd: input.volume_24h_usd!,
    observed_at: input.observed_at,
    source: input.source,
  };
}

function preferredNewRecheckCandidate(
  identity: string,
  snapshotCandidate: PersistableScannerOutput["candidates"][number] | null,
  recheck: NewRecheckStore,
): PersistableScannerOutput["candidates"][number] | null {
  const entry = recheck.entries.find((candidate) => candidate.identity === identity);
  const fresh = entry?.latest_normalized_candidate ?? null;
  if (!fresh || !entry?.latest_source_timestamp || fresh.contract_address === null || safeIdentity(fresh.chain, fresh.contract_address) !== identity) return snapshotCandidate;
  const snapshotTimestamp = snapshotCandidate ? Date.parse(snapshotCandidate.created_at) : Number.NEGATIVE_INFINITY;
  return Date.parse(entry.latest_source_timestamp) > snapshotTimestamp ? fresh : snapshotCandidate;
}

/** The API summary and rendered Radar must classify the same active system population. */
function resolveCurrentSystemFollowUpGrouping(
  inbox: Awaited<ReturnType<typeof readNewInboxStore>>,
  followUp: Awaited<ReturnType<typeof readFollowUpStore>>,
  mainEntries: readonly EstablishedAddressUniverseEntry[],
  receipt: LifecycleCycleReceipt | null,
  scanner: PersistableScannerOutput | null,
  now: Date,
): { action_due: number; candidates_ready: number } {
  const activeInbox = new Set(inbox.entries
    .filter((entry) => entry.system_status === "NEW" && entry.archived_at === null && entry.rejected_at === null)
    .map((entry) => entry.identity));
  const activeMain = new Set(mainEntries.filter((entry) => entry.enabled).map((entry) => universeIdentityKey(entry.chain, entry.contract_address)));
  let actionDue = 0;
  let candidatesReady = 0;
  for (const entry of followUp.entries) {
    const identity = universeIdentityKey(entry.chain, entry.contract_address);
    if (entry.lifecycle_status === "ARCHIVED" || entry.lifecycle_status === "ESTABLISHED" || activeInbox.has(identity) || activeMain.has(identity)) continue;
    const conditions = evaluateFollowUpToMainRadar(entry, lifecycleEvaluationContext({
      receipt,
      scannerRunId: scanner?.scan_run.run_id ?? null,
      evaluatedAt: now,
      manualVerification: findLatestManualVerification(followUp, entry.chain, entry.contract_address),
      establishedMembership: false,
    }));
    const card = { follow_up: { lifecycle_status: entry.lifecycle_status, next_check_at: entry.next_check_at }, conditions } as Pick<LifecycleRadarCard, "follow_up" | "conditions">;
    if (isActionDue(card as LifecycleRadarCard, now)) {
      actionDue += 1;
    } else if (entry.lifecycle_status === "CANDIDATE_FOR_ESTABLISHED" && conditions.risks.length === 0) {
      candidatesReady += 1;
    }
  }
  return { action_due: actionDue, candidates_ready: candidatesReady };
}

function normalizeIdentity(chain: string, address: string): { identity: string } {
  try {
    const normalizedChain = normalizeEstablishedChain(chain);
    const normalizedAddress = normalizeEstablishedAddress(normalizedChain, address);
    return { identity: universeIdentityKey(normalizedChain, normalizedAddress) };
  } catch { throw new LifecycleServiceError("LIFECYCLE_IDENTITY_INVALID", 400); }
}
function safeIdentity(chain: string, address: string): string | null { try { return normalizeIdentity(chain, address).identity; } catch { return null; } }
function lifecycleEvaluationContext(input: {
  receipt: LifecycleCycleReceipt | null;
  scannerRunId: string | null;
  evaluatedAt: Date;
  manualVerification: LifecycleEvaluationContext["latestManualVerification"];
  establishedMembership: boolean;
}): LifecycleEvaluationContext {
  return {
    lastCompletedCentralCycleId: input.receipt?.central_cycle_id ?? null,
    currentScannerRunId: input.scannerRunId,
    evaluatedAt: input.evaluatedAt,
    latestManualVerification: input.manualVerification,
    establishedMembership: input.establishedMembership,
    universeValid: true,
  };
}
function unavailableConditions(): LifecycleConditions { return { conditions_met: [], conditions_unmet: ["VALIDATED_LIFECYCLE_RECORD_REQUIRED"], missing_data: ["LIFECYCLE_RECORD"], risks: [], readiness: "CONDITIONS_UNMET", security_state: "UNKNOWN", verification_state: "UNKNOWN" }; }

function researchCandidateFromRetainedInbox(entry: Awaited<ReturnType<typeof readNewInboxStore>>["entries"][number]): UiTokenCandidate {
  const missingData = [...new Set([
    "CURRENT_SCANNER_OBSERVATION_UNAVAILABLE",
    ...entry.last_evaluation.missing_data,
  ])];
  return {
    id: `retained-lifecycle:${entry.identity}`,
    runId: entry.last_scanner_run_id,
    symbol: entry.symbol ?? entry.display_name ?? entry.contract_address,
    name: entry.display_name ?? entry.symbol ?? entry.contract_address,
    chain: entry.chain,
    dex: "",
    source: "retained_lifecycle_inbox",
    contractAddress: entry.contract_address,
    pairAddress: "",
    sourceUrl: "",
    discoveryBasket: "new_emerging",
    discoveryMethod: "dexscreener_latest_token_profiles",
    observationOnly: true,
    establishedEligible: false,
    universeVersion: null,
    universeEntryIndex: null,
    addressIdentityVerified: entry.last_evaluation.conditions_met.includes("IDENTITY_VALID"),
    priceUsd: null,
    marketCap: null,
    fdvUsd: null,
    liquidity: null,
    volume24h: null,
    volumeMarketCapRatio: null,
    pairCreatedAt: entry.first_seen_at,
    pairAgeDays: null,
    basicFilterStatus: "not_evaluated",
    securityLabel: "NOT_CHECKED",
    finalLabel: "NEEDS_MANUAL_VERIFICATION",
    mainReason: "CURRENT_SCANNER_OBSERVATION_UNAVAILABLE",
    filterReasons: [],
    criticalReasons: [],
    warningReasons: missingData,
    finalReasons: [],
    missingData,
    riskFlags: [...entry.last_evaluation.risks],
    security: null,
    scorecard: null,
    candidateSnapshotAt: entry.last_seen_at,
    lastCheckedAt: entry.last_seen_at,
  };
}

function scannerOutput(value: unknown): PersistableScannerOutput | null {
  if (!isRecord(value) || !isRecord(value.scan_run) || !Array.isArray(value.candidates) || !Array.isArray(value.security_checks) || !Array.isArray(value.scorecards)) return null;
  return value as unknown as PersistableScannerOutput;
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
export function lifecycleSessionReference(sessionId: string): string { return `sha256:${createHash("sha256").update(sessionId, "utf8").digest("hex")}`; }
