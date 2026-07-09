import type { WorkspaceSectionId } from "./components/WorkspaceShell";

export const DEFAULT_WORKSPACE_SECTION: WorkspaceSectionId = "overview";

const WORKSPACE_SECTION_HASHES: Record<WorkspaceSectionId, string> = {
  overview: "#overview",
  "control-center": "#control-center",
  "candidate-results": "#candidate-results",
  "candidate-detail": "#candidate-detail",
  "token-lookup": "#token-lookup",
  "trusted-preview": "#trusted-preview",
  "feedback-notes": "#feedback-notes",
  "webinar-teaser": "#webinar-teaser",
  scanner: "#scanner",
  watchlist: "#watchlist",
  research: "#research",
  risks: "#risks",
  methodology: "#methodology",
};

const HASH_TO_WORKSPACE_SECTION: Record<string, WorkspaceSectionId> = {
  "#overview": "overview",
  "#control-center": "control-center",
  "#candidate-results": "candidate-results",
  "#candidate-detail": "candidate-detail",
  "#token-lookup": "token-lookup",
  "#trusted-preview": "trusted-preview",
  "#feedback-notes": "feedback-notes",
  "#webinar-teaser": "webinar-teaser",
  "#scanner": "scanner",
  "#watchlist": "watchlist",
  "#research": "research",
  "#risks": "risks",
  "#methodology": "methodology",
  "#context": "overview",
  "#workflow": "overview",
};

export function resolveInitialWorkspaceSection(hash: string): WorkspaceSectionId {
  return HASH_TO_WORKSPACE_SECTION[normalizeWorkspaceHash(hash)] ?? DEFAULT_WORKSPACE_SECTION;
}

export function sectionToHash(section: WorkspaceSectionId): string {
  return WORKSPACE_SECTION_HASHES[section] ?? WORKSPACE_SECTION_HASHES[DEFAULT_WORKSPACE_SECTION];
}

function normalizeWorkspaceHash(hash: string): string {
  const trimmedHash = hash.trim().toLowerCase();

  if (!trimmedHash) {
    return "";
  }

  return trimmedHash.startsWith("#") ? trimmedHash : `#${trimmedHash}`;
}
