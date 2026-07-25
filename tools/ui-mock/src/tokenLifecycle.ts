import type { FollowUpPublicEntry, FollowUpPublicStatus } from "./types/followUpTypes";
import type { UiTokenCandidate } from "./types/scannerTypes";

export const TOKEN_LIFECYCLE_STAGES = [
  "new",
  "follow_up",
  "candidate",
  "established",
] as const;

export const TOKEN_LIFECYCLE_CHECKPOINTS = [1, 3, 7, 14, 30] as const;

export type TokenLifecycleStage = (typeof TOKEN_LIFECYCLE_STAGES)[number];
export type TokenLifecycleStageState =
  | "completed"
  | "current"
  | "pending"
  | "blocked"
  | "unavailable";
export type TokenLifecycleCheckpoint = (typeof TOKEN_LIFECYCLE_CHECKPOINTS)[number];
export type TokenLifecycleCheckpointState = "completed" | "current" | "future" | "skipped";
export type TokenLifecycleTrackingStatus =
  | "active"
  | "waiting"
  | "candidate"
  | "established"
  | "blocked"
  | "unavailable"
  | "complete";
export type TokenLifecycleNextActionType =
  | "automatic_enrollment"
  | "automatic_checkpoint"
  | "owner_decision"
  | "main_radar_monitoring"
  | "resolve_identity"
  | "restore_follow_up_data"
  | "observation_complete";
export type TokenLifecycleBlockingCondition =
  | "INCOMPLETE_IDENTITY"
  | "INVALID_CONTRACT_ADDRESS"
  | "UNSUPPORTED_CHAIN"
  | "FOLLOW_UP_DATA_UNAVAILABLE"
  | "FILTERS_NOT_MET"
  | "DATA_INCOMPLETE"
  | "OWNER_DECISION_PENDING"
  | "OBSERVATION_COMPLETE_NO_CANDIDATE";

export type TokenLifecycleCheckpointView = {
  day: TokenLifecycleCheckpoint;
  state: TokenLifecycleCheckpointState;
};

export type TokenLifecycleStageView = {
  id: TokenLifecycleStage;
  state: TokenLifecycleStageState;
};

/**
 * Stable, read-only presentation model prepared for later AI Research Brief use.
 * It never resolves lifecycle independently: Follow-up lifecycle and enabled
 * universe membership remain the source inputs.
 */
export type TokenLifecycleViewModel = {
  current_stage: TokenLifecycleStage;
  completed_stages: TokenLifecycleStage[];
  next_stage: TokenLifecycleStage | null;
  next_action_type: TokenLifecycleNextActionType;
  next_action_label: string;
  blocking_conditions: TokenLifecycleBlockingCondition[];
  next_checkpoint_at: string | null;
  completed_checkpoints: TokenLifecycleCheckpoint[];
  owner_decision_required: boolean;
  tracking_status: TokenLifecycleTrackingStatus;
  stages: TokenLifecycleStageView[];
  checkpoints: TokenLifecycleCheckpointView[];
};

export type TokenIdentityResolution =
  | {
    status: "valid";
    chain: SupportedTokenChain;
    contract_address: string;
    key: string;
  }
  | {
    status: "invalid";
    reason: Extract<
      TokenLifecycleBlockingCondition,
      "INCOMPLETE_IDENTITY" | "INVALID_CONTRACT_ADDRESS" | "UNSUPPORTED_CHAIN"
    >;
  };

type TokenLifecycleCandidate = Pick<
  UiTokenCandidate,
  "chain" | "contractAddress" | "discoveryBasket"
>;

type ResolveTokenLifecycleInput = {
  candidate?: TokenLifecycleCandidate | null;
  followUp?: FollowUpPublicEntry | null;
  followUpStatus?: FollowUpPublicStatus | null;
  /**
   * This value must come from enabled Established Universe membership. The
   * caller may use the established scanner basket because that basket is built
   * exclusively from enabled universe entries.
   */
  establishedMembership?: boolean;
  now?: Date;
};

const SUPPORTED_TOKEN_CHAINS = [
  "ethereum",
  "bsc",
  "base",
  "arbitrum",
  "polygon",
  "avalanche",
  "solana",
] as const;
type SupportedTokenChain = (typeof SUPPORTED_TOKEN_CHAINS)[number];

const EVM_TOKEN_CHAINS = new Set<SupportedTokenChain>([
  "ethereum",
  "bsc",
  "base",
  "arbitrum",
  "polygon",
  "avalanche",
]);
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const NEXT_ACTION_LABELS: Record<TokenLifecycleNextActionType, string> = {
  automatic_enrollment: "Automatic enrollment during the next central data cycle",
  automatic_checkpoint: "Automatic checkpoint",
  owner_decision: "Owner decision",
  main_radar_monitoring: "Main Radar monitoring",
  resolve_identity: "Complete chain and contract address",
  restore_follow_up_data: "Restore read-only Follow-up data",
  observation_complete: "Keep the completed Follow-up history",
};

export function resolveTokenIdentity(chainInput: string, addressInput: string): TokenIdentityResolution {
  const chain = chainInput.trim().toLowerCase();
  const address = addressInput.trim();
  if (!chain || !address) return { status: "invalid", reason: "INCOMPLETE_IDENTITY" };
  if (!SUPPORTED_TOKEN_CHAINS.includes(chain as SupportedTokenChain)) {
    return { status: "invalid", reason: "UNSUPPORTED_CHAIN" };
  }
  const supportedChain = chain as SupportedTokenChain;
  if (EVM_TOKEN_CHAINS.has(supportedChain)) {
    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
      return { status: "invalid", reason: "INVALID_CONTRACT_ADDRESS" };
    }
    const normalizedAddress = address.toLowerCase();
    return {
      status: "valid",
      chain: supportedChain,
      contract_address: normalizedAddress,
      key: `${supportedChain}:${normalizedAddress}`,
    };
  }
  if (!isValidSolanaAddress(address)) {
    return { status: "invalid", reason: "INVALID_CONTRACT_ADDRESS" };
  }
  return {
    status: "valid",
    chain: supportedChain,
    contract_address: address,
    key: `${supportedChain}:${address}`,
  };
}

export function isSameTokenIdentity(
  left: { chain: string; contract_address: string },
  right: { chain: string; contract_address: string },
): boolean {
  const leftIdentity = resolveTokenIdentity(left.chain, left.contract_address);
  const rightIdentity = resolveTokenIdentity(right.chain, right.contract_address);
  return leftIdentity.status === "valid"
    && rightIdentity.status === "valid"
    && leftIdentity.key === rightIdentity.key;
}

export function findFollowUpByIdentity(
  entries: FollowUpPublicEntry[],
  candidate: Pick<UiTokenCandidate, "chain" | "contractAddress">,
): FollowUpPublicEntry | null {
  const identity = resolveTokenIdentity(candidate.chain, candidate.contractAddress);
  if (identity.status !== "valid") return null;
  return entries.find((entry) => {
    const entryIdentity = resolveTokenIdentity(entry.chain, entry.contract_address);
    return entryIdentity.status === "valid" && entryIdentity.key === identity.key;
  }) ?? null;
}

export function resolveTokenLifecycle(input: ResolveTokenLifecycleInput): TokenLifecycleViewModel {
  const source = input.candidate
    ? { chain: input.candidate.chain, contract_address: input.candidate.contractAddress }
    : input.followUp
      ? { chain: input.followUp.chain, contract_address: input.followUp.contract_address }
      : { chain: "", contract_address: "" };
  const identity = resolveTokenIdentity(source.chain, source.contract_address);
  const followUp = input.followUp && isSameTokenIdentity(source, input.followUp)
    ? input.followUp
    : null;
  const followUpUnavailable = input.followUpStatus === null
    || input.followUpStatus?.store_available === false
    || input.followUpStatus?.validation_status === "invalid"
    || input.followUpStatus?.validation_status === "unavailable";
  const established = input.establishedMembership === true
    || followUp?.established_membership === true;
  const lifecycle = established ? "ESTABLISHED" : followUp?.lifecycle_status ?? null;
  const completedCheckpoints = normalizeCompletedCheckpoints(followUp?.completed_checkpoints ?? []);
  const checkpointViews = resolveCheckpointViews(
    completedCheckpoints,
    followUp?.next_check_at ?? null,
    followUp?.missing_data ?? [],
    input.now ?? new Date(),
  );

  if (identity.status !== "valid") {
    return viewModel({
      currentStage: "new",
      nextStage: null,
      action: "resolve_identity",
      blocking: [identity.reason],
      tracking: "blocked",
      completedCheckpoints,
      checkpoints: checkpointViews,
      stageStates: ["current", "blocked", "unavailable", "unavailable"],
    });
  }

  if (established || lifecycle === "ESTABLISHED") {
    return viewModel({
      currentStage: "established",
      nextStage: null,
      action: "main_radar_monitoring",
      blocking: [],
      tracking: "established",
      completedCheckpoints,
      checkpoints: checkpointViews,
      stageStates: ["completed", "completed", "completed", "current"],
    });
  }

  if (lifecycle === "CANDIDATE_FOR_ESTABLISHED") {
    return viewModel({
      currentStage: "candidate",
      nextStage: "established",
      action: "owner_decision",
      blocking: ["OWNER_DECISION_PENDING"],
      tracking: "candidate",
      completedCheckpoints,
      checkpoints: checkpointViews,
      nextCheckpointAt: followUp?.next_check_at ?? null,
      ownerDecisionRequired: true,
      stageStates: ["completed", "completed", "current", "pending"],
    });
  }

  if (lifecycle === "ARCHIVED") {
    return viewModel({
      currentStage: "follow_up",
      nextStage: null,
      action: "observation_complete",
      blocking: ["OBSERVATION_COMPLETE_NO_CANDIDATE"],
      tracking: "complete",
      completedCheckpoints,
      checkpoints: checkpointViews,
      stageStates: ["completed", "current", "blocked", "unavailable"],
    });
  }

  if (followUp) {
    const blocking: TokenLifecycleBlockingCondition[] = [];
    if (followUp.filter_status === "rejected_basic_filter") blocking.push("FILTERS_NOT_MET");
    if (followUp.missing_data.length > 0) blocking.push("DATA_INCOMPLETE");
    return viewModel({
      currentStage: "follow_up",
      nextStage: "candidate",
      action: "automatic_checkpoint",
      blocking,
      tracking: "active",
      completedCheckpoints,
      checkpoints: checkpointViews,
      nextCheckpointAt: followUp.next_check_at,
      stageStates: ["completed", "current", "pending", "pending"],
    });
  }

  if (followUpUnavailable) {
    return viewModel({
      currentStage: "new",
      nextStage: "follow_up",
      action: "restore_follow_up_data",
      blocking: ["FOLLOW_UP_DATA_UNAVAILABLE"],
      tracking: "unavailable",
      completedCheckpoints,
      checkpoints: checkpointViews,
      stageStates: ["current", "unavailable", "unavailable", "unavailable"],
    });
  }

  return viewModel({
    currentStage: "new",
    nextStage: "follow_up",
    action: "automatic_enrollment",
    blocking: [],
    tracking: "waiting",
    completedCheckpoints,
    checkpoints: checkpointViews,
    stageStates: ["current", "pending", "pending", "pending"],
  });
}

function viewModel(input: {
  currentStage: TokenLifecycleStage;
  nextStage: TokenLifecycleStage | null;
  action: TokenLifecycleNextActionType;
  blocking: TokenLifecycleBlockingCondition[];
  tracking: TokenLifecycleTrackingStatus;
  completedCheckpoints: TokenLifecycleCheckpoint[];
  checkpoints: TokenLifecycleCheckpointView[];
  nextCheckpointAt?: string | null;
  ownerDecisionRequired?: boolean;
  stageStates: [
    TokenLifecycleStageState,
    TokenLifecycleStageState,
    TokenLifecycleStageState,
    TokenLifecycleStageState,
  ];
}): TokenLifecycleViewModel {
  const stages = TOKEN_LIFECYCLE_STAGES.map((id, index) => ({
    id,
    state: input.stageStates[index],
  }));
  return {
    current_stage: input.currentStage,
    completed_stages: stages.filter((stage) => stage.state === "completed").map((stage) => stage.id),
    next_stage: input.nextStage,
    next_action_type: input.action,
    next_action_label: NEXT_ACTION_LABELS[input.action],
    blocking_conditions: input.blocking,
    next_checkpoint_at: input.nextCheckpointAt ?? null,
    completed_checkpoints: input.completedCheckpoints,
    owner_decision_required: input.ownerDecisionRequired ?? false,
    tracking_status: input.tracking,
    stages,
    checkpoints: input.checkpoints,
  };
}

function normalizeCompletedCheckpoints(values: number[]): TokenLifecycleCheckpoint[] {
  const completed = new Set(values);
  return TOKEN_LIFECYCLE_CHECKPOINTS.filter((day) => completed.has(day));
}

function resolveCheckpointViews(
  completed: TokenLifecycleCheckpoint[],
  nextCheckpointAt: string | null,
  missingData: string[],
  now: Date,
): TokenLifecycleCheckpointView[] {
  const completedSet = new Set(completed);
  const nextDay = TOKEN_LIFECYCLE_CHECKPOINTS.find((day) => !completedSet.has(day)) ?? null;
  const nextIsDue = nextCheckpointAt !== null
    && Number.isFinite(Date.parse(nextCheckpointAt))
    && Date.parse(nextCheckpointAt) <= now.getTime();
  return TOKEN_LIFECYCLE_CHECKPOINTS.map((day) => {
    if (completedSet.has(day)) return { day, state: "completed" };
    if (day === nextDay) {
      return {
        day,
        state: nextIsDue && missingData.length > 0 ? "skipped" : "current",
      };
    }
    return { day, state: "future" };
  });
}

function isValidSolanaAddress(value: string): boolean {
  if (value.length < 32 || value.length > 44) return false;
  let bytes: number[] = [0];
  for (const character of value) {
    const digit = BASE58_ALPHABET.indexOf(character);
    if (digit < 0) return false;
    let carry = digit;
    for (let index = 0; index < bytes.length; index += 1) {
      carry += bytes[index] * 58;
      bytes[index] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  let leadingZeros = 0;
  while (leadingZeros < value.length && value[leadingZeros] === "1") leadingZeros += 1;
  return bytes.length + leadingZeros === 32;
}
