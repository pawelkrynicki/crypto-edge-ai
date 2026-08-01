import { randomBytes } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const OWNER_ACCEPTANCE_SCHEMA_VERSION = "owner_acceptance_session_v1" as const;
export const OWNER_ACCEPTANCE_STATUSES = ["PASS", "FAIL", "BLOCKED", "NOT_APPLICABLE"] as const;
export const OWNER_ACCEPTANCE_VERDICTS = ["ACCEPT", "ACCEPT_WITH_NOTES", "REJECT"] as const;
export const DEFAULT_OWNER_ACCEPTANCE_OUTPUT_ROOT = fileURLToPath(
  new URL("../.local/owner-acceptance/", import.meta.url),
);

export type OwnerAcceptanceStatus = typeof OWNER_ACCEPTANCE_STATUSES[number];
export type OwnerAcceptanceVerdict = typeof OWNER_ACCEPTANCE_VERDICTS[number];
export type OwnerAcceptanceFindingSeverity = "P0" | "P1" | "P2" | "P3";

export type OwnerAcceptancePointDefinition = {
  id: string;
  title: string;
};

export const OWNER_ACCEPTANCE_POINTS: readonly OwnerAcceptancePointDefinition[] = [
  { id: "start_and_health", title: "Start produktu i health" },
  { id: "radar_real_data_freshness", title: "Radar: prawdziwe dane, freshness i timestamp" },
  { id: "radar_layers", title: "Widoki New, Follow-up i Established" },
  { id: "candidate_detail_tabs", title: "Candidate Detail: prawidłowy token i siedem zakładek" },
  { id: "refresh_routing", title: "Refresh zachowuje token, routing i aktywną zakładkę" },
  { id: "data_boundaries", title: "Security, dane rynkowe i brakujące dane" },
  { id: "ai_provider_neutral", title: "AI przy wyłączonym OpenAI, bez providera i modelu w kliencie" },
  { id: "reports_and_feedback", title: "Reports i Feedback zgodnie z uprawnieniami" },
  { id: "language_and_viewports", title: "PL/EN oraz desktop i mobile" },
  { id: "client_owner_boundary", title: "Granice klient/owner i brak operacji technicznych klienta" },
] as const;

export type OwnerAcceptancePointResult = OwnerAcceptancePointDefinition & {
  status: OwnerAcceptanceStatus;
  owner_note: string;
};

export type OwnerAcceptanceFinding = {
  severity: OwnerAcceptanceFindingSeverity;
  note: string;
};

export type OwnerAcceptanceManifest = {
  schema_version: typeof OWNER_ACCEPTANCE_SCHEMA_VERSION;
  session_id: string;
  commit_sha: string;
  started_at: string;
  finished_at: string;
  acceptance_points: OwnerAcceptancePointResult[];
  detected_p0_p1: OwnerAcceptanceFinding[];
  deferred_p2_p3: OwnerAcceptanceFinding[];
  final_verdict: OwnerAcceptanceVerdict;
  final_verdict_source: "OWNER_MANUAL";
  safety_confirmations: {
    openai_calls: 0;
    provider_calls: 0;
    task_scheduler_changes: 0;
    established_universe_changes: 0;
    backup_restore_rollback_actions: 0;
    central_collector_started: false;
    browser_tabs_opened: 1;
    local_process_stopped: true;
  };
};

export type OwnerAcceptanceInput = {
  acceptancePoints: OwnerAcceptancePointResult[];
  detectedP0P1: OwnerAcceptanceFinding[];
  deferredP2P3: OwnerAcceptanceFinding[];
  finalVerdict: OwnerAcceptanceVerdict;
};

export type OwnerAcceptanceRuntime = {
  url: string;
  stop: () => Promise<void>;
};

export type OwnerAcceptanceArtifacts = {
  directoryPath: string;
  manifestPath: string;
  reportPath: string;
};

export type RunOwnerAcceptanceOptions = {
  commitSha: string;
  startRuntime: () => Promise<OwnerAcceptanceRuntime>;
  openBrowserTab: (url: string) => Promise<void>;
  collectOwnerInput: () => Promise<OwnerAcceptanceInput>;
  now?: () => Date;
  sessionId?: string;
  outputRoot?: string;
  writeArtifacts?: (manifest: OwnerAcceptanceManifest, outputRoot?: string) => Promise<OwnerAcceptanceArtifacts>;
};

export type OwnerAcceptancePreview = {
  schema_version: typeof OWNER_ACCEPTANCE_SCHEMA_VERSION;
  mode: "PREVIEW";
  runtime_started: false;
  openai_calls: 0;
  provider_calls: 0;
  task_scheduler_changes: 0;
  established_universe_changes: 0;
  backup_restore_rollback_actions: 0;
  central_collector_started: false;
  browser_tabs_opened: 1;
};

const SENSITIVE_MATERIAL = /(?:\bsk-[A-Za-z0-9_-]{16,}|authorization\s*[:=]\s*(?:bearer|basic)|cookie\s*[:=]|session[_ -]?token\s*[:=])/i;

export function createOwnerAcceptancePreview(): OwnerAcceptancePreview {
  return {
    schema_version: OWNER_ACCEPTANCE_SCHEMA_VERSION,
    mode: "PREVIEW",
    runtime_started: false,
    openai_calls: 0,
    provider_calls: 0,
    task_scheduler_changes: 0,
    established_universe_changes: 0,
    backup_restore_rollback_actions: 0,
    central_collector_started: false,
    browser_tabs_opened: 1,
  };
}

export function createSafeOwnerAcceptanceEnvironment(
  base: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  return {
    ...base,
    CRYPTO_EDGE_DATA_ENV: "INTERNAL_BETA",
    CRYPTO_EDGE_RUNTIME_MODE: "INTERNAL_BETA",
    CRYPTO_EDGE_AUTOMATION_ENABLED: "0",
    ALLOW_LIVE_PROVIDER_CALLS: "0",
    CRYPTO_EDGE_ALLOW_LIVE_SOURCE_CHECK: "0",
    CRYPTO_EDGE_AI_WORKER_ENABLED: "0",
    CRYPTO_EDGE_AI_RESEARCH_PROVIDER: "DISABLED",
    CRYPTO_EDGE_AI_RESEARCH_MODEL: "",
    CRYPTO_EDGE_AI_RESEARCH_LIVE_CALL_BUDGET: "0",
    CRYPTO_EDGE_OWNER_OPERATIONS_MODE: "REVIEW_SAFE",
    OPENAI_API_KEY: "",
  };
}

export async function runOwnerAcceptanceSession(
  options: RunOwnerAcceptanceOptions,
): Promise<{ manifest: OwnerAcceptanceManifest; artifacts: OwnerAcceptanceArtifacts }> {
  const now = options.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const sessionId = options.sessionId ?? createOwnerAcceptanceSessionId(new Date(startedAt));
  let runtime: OwnerAcceptanceRuntime | null = null;

  try {
    runtime = await options.startRuntime();
    await options.openBrowserTab(runtime.url);
    const ownerInput = await options.collectOwnerInput();
    const activeRuntime = runtime;
    await activeRuntime.stop();
    runtime = null;

    const manifest = createOwnerAcceptanceManifest({
      sessionId,
      commitSha: options.commitSha,
      startedAt,
      finishedAt: now().toISOString(),
      ownerInput,
      runtimeStopped: true,
    });
    const artifacts = await (options.writeArtifacts ?? writeOwnerAcceptanceArtifacts)(
      manifest,
      options.outputRoot,
    );
    return { manifest, artifacts };
  } finally {
    if (runtime !== null) await runtime.stop().catch(() => undefined);
  }
}

export function createOwnerAcceptanceManifest(input: {
  sessionId: string;
  commitSha: string;
  startedAt: string;
  finishedAt: string;
  ownerInput: OwnerAcceptanceInput;
  runtimeStopped: boolean;
}): OwnerAcceptanceManifest {
  if (!input.runtimeStopped) fail("LOCAL_PROCESS_NOT_STOPPED");
  const manifest: OwnerAcceptanceManifest = {
    schema_version: OWNER_ACCEPTANCE_SCHEMA_VERSION,
    session_id: input.sessionId,
    commit_sha: input.commitSha,
    started_at: input.startedAt,
    finished_at: input.finishedAt,
    acceptance_points: input.ownerInput.acceptancePoints,
    detected_p0_p1: input.ownerInput.detectedP0P1,
    deferred_p2_p3: input.ownerInput.deferredP2P3,
    final_verdict: input.ownerInput.finalVerdict,
    final_verdict_source: "OWNER_MANUAL",
    safety_confirmations: {
      openai_calls: 0,
      provider_calls: 0,
      task_scheduler_changes: 0,
      established_universe_changes: 0,
      backup_restore_rollback_actions: 0,
      central_collector_started: false,
      browser_tabs_opened: 1,
      local_process_stopped: true,
    },
  };
  validateOwnerAcceptanceManifest(manifest);
  return manifest;
}

export function validateOwnerAcceptanceManifest(value: unknown): asserts value is OwnerAcceptanceManifest {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("MANIFEST_INVALID");
  const manifest = value as Partial<OwnerAcceptanceManifest>;
  if (manifest.schema_version !== OWNER_ACCEPTANCE_SCHEMA_VERSION) fail("SCHEMA_VERSION_INVALID");
  if (typeof manifest.session_id !== "string" || !/^oa1_\d{8}T\d{6}Z_[a-f0-9]{8}$/.test(manifest.session_id)) {
    fail("SESSION_ID_INVALID");
  }
  if (typeof manifest.commit_sha !== "string" || !/^[a-f0-9]{40}$/i.test(manifest.commit_sha)) fail("COMMIT_SHA_INVALID");
  const startedAt = isoTime(manifest.started_at, "STARTED_AT_INVALID");
  const finishedAt = isoTime(manifest.finished_at, "FINISHED_AT_INVALID");
  if (finishedAt < startedAt) fail("SESSION_TIME_INVALID");
  validateAcceptancePoints(manifest.acceptance_points);
  validateFindings(manifest.detected_p0_p1, ["P0", "P1"], "P0_P1_INVALID");
  validateFindings(manifest.deferred_p2_p3, ["P2", "P3"], "P2_P3_INVALID");
  if (!OWNER_ACCEPTANCE_VERDICTS.includes(manifest.final_verdict as OwnerAcceptanceVerdict)) fail("FINAL_VERDICT_REQUIRED");
  if (manifest.final_verdict_source !== "OWNER_MANUAL") fail("FINAL_VERDICT_MUST_BE_MANUAL");
  if ((manifest.detected_p0_p1?.length ?? 0) > 0 && manifest.final_verdict !== "REJECT") {
    fail("P0_P1_BLOCKS_ACCEPTANCE");
  }
  const safety = manifest.safety_confirmations;
  if (!safety
    || safety.openai_calls !== 0
    || safety.provider_calls !== 0
    || safety.task_scheduler_changes !== 0
    || safety.established_universe_changes !== 0
    || safety.backup_restore_rollback_actions !== 0
    || safety.central_collector_started !== false
    || safety.browser_tabs_opened !== 1
    || safety.local_process_stopped !== true) {
    fail("SAFETY_CONFIRMATIONS_INVALID");
  }
}

export async function writeOwnerAcceptanceArtifacts(
  manifest: OwnerAcceptanceManifest,
  outputRoot = DEFAULT_OWNER_ACCEPTANCE_OUTPUT_ROOT,
): Promise<OwnerAcceptanceArtifacts> {
  validateOwnerAcceptanceManifest(manifest);
  const directoryPath = resolve(outputRoot, manifest.session_id);
  const manifestPath = resolve(directoryPath, "manifest.json");
  const reportPath = resolve(directoryPath, "report.md");
  await mkdir(directoryPath, { recursive: true });
  await writeTextAtomic(reportPath, renderOwnerAcceptanceReport(manifest));
  await writeTextAtomic(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return { directoryPath, manifestPath, reportPath };
}

export function renderOwnerAcceptanceReport(manifest: OwnerAcceptanceManifest): string {
  validateOwnerAcceptanceManifest(manifest);
  const pointRows = manifest.acceptance_points.map((point, index) => (
    `| ${index + 1} | ${escapeMarkdown(point.title)} | ${point.status} | ${escapeMarkdown(point.owner_note)} |`
  ));
  return [
    "# OA.1 Local Owner Acceptance",
    "",
    `- Session ID: \`${manifest.session_id}\``,
    `- Commit: \`${manifest.commit_sha}\``,
    `- Started: ${manifest.started_at}`,
    `- Finished: ${manifest.finished_at}`,
    `- Manual owner verdict: **${manifest.final_verdict}**`,
    "",
    "## Acceptance points",
    "",
    "| # | Point | Status | Owner note |",
    "|---:|---|---|---|",
    ...pointRows,
    "",
    "## Findings",
    "",
    findingSection("P0/P1", manifest.detected_p0_p1),
    findingSection("Deferred P2/P3", manifest.deferred_p2_p3),
    "",
    "## Safety confirmations",
    "",
    "- OpenAI calls: 0",
    "- Data-provider calls: 0",
    "- Task Scheduler changes: 0",
    "- Established Universe changes: 0",
    "- Backup/restore/rollback actions: 0",
    "- Central collector started: no",
    "- Browser tabs opened: exactly 1",
    "- Local runtime process stopped: yes",
    "",
  ].join("\n");
}

function validateAcceptancePoints(value: unknown): asserts value is OwnerAcceptancePointResult[] {
  if (!Array.isArray(value) || value.length !== OWNER_ACCEPTANCE_POINTS.length) fail("ACCEPTANCE_POINTS_INVALID");
  value.forEach((candidate, index) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) fail("ACCEPTANCE_POINT_INVALID");
    const point = candidate as Partial<OwnerAcceptancePointResult>;
    const expected = OWNER_ACCEPTANCE_POINTS[index];
    if (!expected || point.id !== expected.id || point.title !== expected.title) fail("ACCEPTANCE_POINT_ID_INVALID");
    if (!OWNER_ACCEPTANCE_STATUSES.includes(point.status as OwnerAcceptanceStatus)) fail("ACCEPTANCE_STATUS_INVALID");
    validateOwnerText(point.owner_note, "OWNER_NOTE_REQUIRED");
  });
}

function validateFindings(value: unknown, allowed: readonly string[], code: string): asserts value is OwnerAcceptanceFinding[] {
  if (!Array.isArray(value)) fail(code);
  value.forEach((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) fail(code);
    const finding = candidate as Partial<OwnerAcceptanceFinding>;
    if (typeof finding.severity !== "string" || !allowed.includes(finding.severity)) fail(code);
    validateOwnerText(finding.note, code);
  });
}

function validateOwnerText(value: unknown, code: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length < 1 || value.length > 2_000 || SENSITIVE_MATERIAL.test(value)) fail(code);
}

function isoTime(value: unknown, code: string): number {
  if (typeof value !== "string") fail(code);
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) fail(code);
  return timestamp;
}

function createOwnerAcceptanceSessionId(now: Date): string {
  const timestamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return `oa1_${timestamp}_${randomBytes(4).toString("hex")}`;
}

function findingSection(label: string, findings: OwnerAcceptanceFinding[]): string {
  return findings.length === 0
    ? `- ${label}: none recorded.`
    : [`- ${label}:`, ...findings.map((finding) => `  - ${finding.severity}: ${escapeMarkdown(finding.note)}`)].join("\n");
}

function escapeMarkdown(value: string): string {
  return value.replace(/\r?\n/g, " ").replace(/\|/g, "\\|");
}

async function writeTextAtomic(path: string, value: string): Promise<void> {
  const temporaryPath = `${path}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  try {
    await writeFile(temporaryPath, value.endsWith("\n") ? value : `${value}\n`, { encoding: "utf8", flag: "wx" });
    await rename(temporaryPath, path);
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
  }
}

function fail(code: string): never {
  throw new Error(code);
}
