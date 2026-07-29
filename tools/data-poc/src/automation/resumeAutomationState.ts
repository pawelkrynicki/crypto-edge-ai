import {
  createAutomationStateStore,
  type AutomationState,
  type AutomationStateStore,
} from "./automationState.js";

export type ResumeAutomationStateResult = {
  mode: "PREVIEW" | "OWNER_CONFIRMED";
  status: "RESUME_AVAILABLE" | "RESUMED" | "NOT_SUSPENDED";
  automation_suspended: boolean;
  resume_required: boolean;
  consecutive_failure_count: number;
  suspended_reason: string | null;
};

export async function resumeAutomationState(options: {
  ownerConfirmed: boolean;
  automationDirectoryPath?: string;
  stateStore?: AutomationStateStore;
}): Promise<ResumeAutomationStateResult> {
  const store = options.stateStore ?? createAutomationStateStore(options.automationDirectoryPath);
  const current = await store.read();
  if (!current.automation_suspended) {
    return result(options.ownerConfirmed, "NOT_SUSPENDED", current);
  }
  if (!options.ownerConfirmed) {
    return result(false, "RESUME_AVAILABLE", current);
  }

  const resumed: AutomationState = {
    ...current,
    automation_suspended: false,
    suspended_at: null,
    suspended_reason: null,
    resume_required: false,
  };
  await store.write(resumed);
  return result(true, "RESUMED", resumed);
}

function result(
  ownerConfirmed: boolean,
  status: ResumeAutomationStateResult["status"],
  state: AutomationState,
): ResumeAutomationStateResult {
  return {
    mode: ownerConfirmed ? "OWNER_CONFIRMED" : "PREVIEW",
    status,
    automation_suspended: state.automation_suspended,
    resume_required: state.resume_required,
    consecutive_failure_count: state.consecutive_failure_count,
    suspended_reason: state.suspended_reason,
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== "--confirm-owner-resume")) {
    throw new Error("OWNER_RESUME_ARGUMENT_INVALID");
  }
  const output = await resumeAutomationState({ ownerConfirmed: args[0] === "--confirm-owner-resume" });
  console.log(JSON.stringify(output, null, 2));
}

if (process.argv[1]?.endsWith("resumeAutomationState.js")) {
  main().catch((error: unknown) => {
    const code = error instanceof Error ? error.message : "OWNER_RESUME_FAILED";
    console.error(JSON.stringify({ error: code }));
    process.exitCode = 1;
  });
}
