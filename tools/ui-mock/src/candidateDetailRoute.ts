import { isCandidateDetailTabId, type CandidateDetailTabId } from "./candidateDetailTabs";
import type { ResearchStepNumber } from "./researchChecklistTypes";
import { resolveTokenIdentity } from "./tokenLifecycle";

export type RouteTokenIdentity = {
  chain: string;
  contract_address: string;
};

export function resolveRouteTokenIdentity(): RouteTokenIdentity | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const identity = resolveTokenIdentity(params.get("chain") ?? "", params.get("contract") ?? "");
  if (identity.status !== "valid") return null;
  return { chain: identity.chain, contract_address: identity.contract_address };
}

export function resolveDetailTab(): CandidateDetailTabId {
  if (typeof window === "undefined") return "summary";
  const value = new URLSearchParams(window.location.search).get("detail");
  return isCandidateDetailTabId(value) ? value : "summary";
}

export function resolveResearchChecklistStep(): ResearchStepNumber | null {
  if (typeof window === "undefined") return null;
  const value = Number(new URLSearchParams(window.location.search).get("research_step"));
  return Number.isInteger(value) && value >= 1 && value <= 7 ? value as ResearchStepNumber : null;
}

export function resolveResearchPlaybookFocus(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("research_playbook") === "1";
}

export function writeCandidateDetailRoute(identity: RouteTokenIdentity, tab: CandidateDetailTabId, focusResearchPlaybook = false) {
  writeTokenRoute(identity, "candidate-detail", tab, null, focusResearchPlaybook);
}

export function writeVerificationRoute(identity: RouteTokenIdentity, researchStep: ResearchStepNumber | null = null) {
  writeTokenRoute(identity, "external-checks", null, researchStep);
}

export function writeVerificationListRoute() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.delete("chain");
  url.searchParams.delete("contract");
  url.searchParams.delete("detail");
  url.searchParams.delete("research_step");
  url.searchParams.delete("research_playbook");
  url.hash = "external-checks";
  window.history.pushState(null, "", url);
}

function writeTokenRoute(
  identity: RouteTokenIdentity,
  section: "candidate-detail" | "external-checks",
  tab: CandidateDetailTabId | null,
  researchStep: ResearchStepNumber | null = null,
  focusResearchPlaybook = false,
) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set("chain", identity.chain);
  url.searchParams.set("contract", identity.contract_address);
  if (tab) url.searchParams.set("detail", tab);
  else url.searchParams.delete("detail");
  if (researchStep) url.searchParams.set("research_step", String(researchStep));
  else url.searchParams.delete("research_step");
  if (focusResearchPlaybook) url.searchParams.set("research_playbook", "1");
  else url.searchParams.delete("research_playbook");
  url.hash = section;
  window.history.pushState(null, "", url);
}
