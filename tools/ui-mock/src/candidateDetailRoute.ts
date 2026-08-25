import { isCandidateDetailTabId, type CandidateDetailTabId } from "./candidateDetailTabs";
import type { ResearchStepNumber } from "./researchChecklistTypes";
import { resolveTokenIdentity } from "./tokenLifecycle";
import { isVerificationMissingTarget, type VerificationMissingTarget } from "./verificationMissingItemTargets";

export const RESEARCH_VERIFICATION_CHECKS = ["honeypot"] as const;
export type ResearchVerificationCheck = (typeof RESEARCH_VERIFICATION_CHECKS)[number];

export type RouteTokenIdentity = {
  chain: string;
  contract_address: string;
};

export function resolveRouteTokenIdentity(): RouteTokenIdentity | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const rawChain = (params.get("chain") ?? "").trim();
  const rawContract = (params.get("contract") ?? "").trim();
  if (!rawChain || !rawContract) return null;
  const identity = resolveTokenIdentity(rawChain, rawContract);
  // A route is also the hand-off contract between Product Detail and
  // Verification. Unsupported or malformed records must remain selectable so
  // the product can explain the block; only lifecycle/AI eligibility uses the
  // stricter identity resolver.
  if (identity.status === "valid") return { chain: identity.chain, contract_address: identity.contract_address };
  return { chain: rawChain.toLowerCase(), contract_address: rawContract };
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

export function resolveResearchVerificationCheck(): ResearchVerificationCheck | null {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get("research_check");
  return RESEARCH_VERIFICATION_CHECKS.includes(value as ResearchVerificationCheck)
    ? value as ResearchVerificationCheck
    : null;
}

export function resolveVerificationMissingTarget(): VerificationMissingTarget | null {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get("verification_target");
  return isVerificationMissingTarget(value) ? value : null;
}

export function resolveVerificationDecisionOrigin(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("verification_origin") === "decision";
}

export function writeCandidateDetailRoute(
  identity: RouteTokenIdentity,
  tab: CandidateDetailTabId,
  focusResearchPlaybook = false,
  researchStep: ResearchStepNumber | null = null,
) {
  writeTokenRoute(identity, "candidate-detail", tab, researchStep, focusResearchPlaybook);
}

/** The only candidate-detail route shape for either the master or a focused Playbook stage. */
export function writeResearchPlaybookRoute(identity: RouteTokenIdentity, researchStep: ResearchStepNumber | null = null) {
  writeCandidateDetailRoute(identity, "summary", true, researchStep);
}

export function writeVerificationRoute(
  identity: RouteTokenIdentity,
  researchStep: ResearchStepNumber | null = null,
  researchCheck: ResearchVerificationCheck | null = null,
) {
  writeTokenRoute(identity, "external-checks", null, researchStep, false, researchCheck);
}

export function writeVerificationDecisionTargetRoute(identity: RouteTokenIdentity, target: VerificationMissingTarget) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set("chain", identity.chain);
  url.searchParams.set("contract", identity.contract_address);
  url.searchParams.set("verification_target", target);
  url.searchParams.set("verification_origin", "decision");
  url.searchParams.delete("detail");
  url.searchParams.delete("research_step");
  url.searchParams.delete("research_check");
  url.searchParams.delete("research_playbook");
  url.hash = "external-checks";
  commitTokenRoute(url);
}

export function writeVerificationDecisionRoute(identity: RouteTokenIdentity) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set("chain", identity.chain);
  url.searchParams.set("contract", identity.contract_address);
  url.searchParams.set("verification_tab", "decision");
  url.searchParams.delete("verification_target");
  url.searchParams.delete("verification_origin");
  url.searchParams.delete("detail");
  url.searchParams.delete("research_step");
  url.searchParams.delete("research_check");
  url.searchParams.delete("research_playbook");
  url.hash = "external-checks";
  commitTokenRoute(url);
}

export function resolveVerificationTab(): "decision" | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("verification_tab") === "decision" ? "decision" : null;
}

/**
 * Builds a normal browser route for a focused, read-only verification step.
 * This is intentionally separate from `writeVerificationRoute`: links need a
 * real href so normal browser back/forward behaviour is preserved.
 */
export function buildVerificationRouteHref(
  identity: RouteTokenIdentity,
  researchStep: ResearchStepNumber,
  researchCheck: ResearchVerificationCheck | null = null,
): string {
  if (typeof window === "undefined" || !window.location?.href) return "#external-checks";
  const url = new URL(window.location.href);
  url.searchParams.set("chain", identity.chain);
  url.searchParams.set("contract", identity.contract_address);
  url.searchParams.delete("detail");
  url.searchParams.set("research_step", String(researchStep));
  if (researchCheck) url.searchParams.set("research_check", researchCheck);
  else url.searchParams.delete("research_check");
  url.searchParams.delete("research_playbook");
  url.searchParams.delete("verification_target");
  url.searchParams.delete("verification_origin");
  url.searchParams.delete("verification_tab");
  url.hash = "external-checks";
  return `${url.pathname}${url.search}${url.hash}`;
}

export function writeVerificationListRoute() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.delete("chain");
  url.searchParams.delete("contract");
  url.searchParams.delete("detail");
  url.searchParams.delete("research_step");
  url.searchParams.delete("research_check");
  url.searchParams.delete("research_playbook");
  url.searchParams.delete("verification_target");
  url.searchParams.delete("verification_origin");
  url.searchParams.delete("verification_tab");
  url.hash = "external-checks";
  commitTokenRoute(url);
}

function writeTokenRoute(
  identity: RouteTokenIdentity,
  section: "candidate-detail" | "external-checks",
  tab: CandidateDetailTabId | null,
  researchStep: ResearchStepNumber | null = null,
  focusResearchPlaybook = false,
  researchCheck: ResearchVerificationCheck | null = null,
) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set("chain", identity.chain);
  url.searchParams.set("contract", identity.contract_address);
  if (tab) url.searchParams.set("detail", tab);
  else url.searchParams.delete("detail");
  if (researchStep) url.searchParams.set("research_step", String(researchStep));
  else url.searchParams.delete("research_step");
  if (researchCheck) url.searchParams.set("research_check", researchCheck);
  else url.searchParams.delete("research_check");
  if (focusResearchPlaybook) url.searchParams.set("research_playbook", "1");
  else url.searchParams.delete("research_playbook");
  url.searchParams.delete("verification_target");
  url.searchParams.delete("verification_origin");
  url.searchParams.delete("verification_tab");
  url.hash = section;
  commitTokenRoute(url);
}

/**
 * `history.pushState` intentionally does not emit popstate/hashchange. Product
 * Detail owns a rendered-tab state in addition to the URL, so notify that
 * state explicitly after every canonical token-route write.
 */
function commitTokenRoute(url: URL) {
  window.history.pushState(null, "", url);
  // Lightweight test/window shims may support history without an event
  // target. Real browsers always receive the synchronous route notification.
  if (typeof window.dispatchEvent === "function") {
    window.dispatchEvent(new Event("crypto-edge-token-route-change"));
  }
}
