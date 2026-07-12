import type {
  WorkspaceNavGroup,
  WorkspaceNavItem,
  WorkspaceSectionId,
} from "./components/WorkspaceShell";

export const DEFAULT_WORKSPACE_SECTION: WorkspaceSectionId = "candidate-results";

export const WORKSPACE_NAV_GROUPS: WorkspaceNavGroup[] = [
  {
    id: "product-flow",
    label: "Product Flow",
    description: "Candidate Results to External Checks.",
    items: [
      { id: "candidate-results", label: "Candidate Results", icon: "CR", description: "Candidate results" },
      { id: "candidate-detail", label: "Candidate Detail", icon: "CD", description: "Candidate detail" },
      { id: "token-lookup", label: "Token Lookup", icon: "TL", description: "Token lookup" },
      { id: "external-checks", label: "External Checks", icon: "EC", description: "External checks" },
    ],
  },
  {
    id: "review-feedback",
    label: "Review / Feedback",
    description: "Manual Review only notes and follow-up.",
    items: [
      { id: "feedback-notes", label: "Feedback Notes", icon: "FN", description: "Manual Review only" },
      { id: "watchlist", label: "Manual Review", icon: "MR", description: "Watchlist Candidate review" },
    ],
  },
  {
    id: "admin-status",
    label: "Admin / Status",
    description: "Source Freshness and operational status.",
    items: [
      { id: "control-center", label: "Control Center", icon: "CC", description: "Admin / status view" },
      { id: "overview", label: "Source Freshness Overview", icon: "SF", description: "Source Freshness overview" },
      { id: "scanner", label: "Candidate Source Review", icon: "CS", description: "Read-only candidate source" },
      { id: "risks", label: "Risk Flags", icon: "RF", description: "Critical and manual checks" },
      { id: "research", label: "Manual Research Notes", icon: "MN", description: "Frontend-only research notes" },
      { id: "methodology", label: "Methodology", icon: "M", description: "Scanner and review reference" },
    ],
  },
  {
    id: "demo-preview",
    label: "Demo / Preview",
    description: "Preview and demo surfaces.",
    items: [
      { id: "trusted-preview", label: "Trusted Preview", icon: "TP", description: "Demo / preview guide" },
      { id: "webinar-teaser", label: "Webinar Teaser", icon: "WT", description: "Demo / preview screenshots" },
    ],
  },
];

const WORKSPACE_SECTION_HASHES: Record<WorkspaceSectionId, string> = {
  overview: "#overview",
  "control-center": "#control-center",
  "candidate-results": "#candidate-results",
  "candidate-detail": "#candidate-detail",
  "token-lookup": "#token-lookup",
  "external-checks": "#external-checks",
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
  "#external-checks": "external-checks",
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

export function flattenWorkspaceNavGroups(navGroups: WorkspaceNavGroup[] = WORKSPACE_NAV_GROUPS): WorkspaceNavItem[] {
  return navGroups.flatMap((group) => group.items);
}

function normalizeWorkspaceHash(hash: string): string {
  const trimmedHash = hash.trim().toLowerCase();

  if (!trimmedHash) {
    return "";
  }

  return trimmedHash.startsWith("#") ? trimmedHash : `#${trimmedHash}`;
}
