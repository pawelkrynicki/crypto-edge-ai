import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useProductLocale } from "../productI18n";
import { researchChecklistItemValue, researchEvidencePresentationText } from "../researchChecklistPresentation";
import { resolveResearchChecklist } from "../researchChecklistResolver";
import {
  type PersistedManualResearchState,
  type ResearchChecklistItem,
  type ResearchChecklistItemKey,
  type ResearchChecklistStep,
  type ResearchChecklistState,
  type ResearchChecklistView,
  type ResearchScorecardCriterion,
  type ResearchScorecardDomain,
  type ResearchScorecardView,
  type ResearchStepNumber,
} from "../researchChecklistTypes";
import {
  deleteResearchEvidence,
  loadResearchChecklist,
  saveResearchEvidence,
} from "../services/researchChecklistDataSource";
import {
  resolveManualResearchTarget,
  type ManualResearchTool,
} from "../externalVerificationTargets";
import { normalizeSafePublicHttpsUrl, normalizeSafeSocialLinkUrl, type SocialLinkCategory } from "../socialLinks";
import type { UiTokenCandidate } from "../types/scannerTypes";
import { ActionButton } from "./ProductUi";

void React;

const STEP_NAMES = {
  pl: ["Szybki filtr", "Deal Breakers", "Bezpieczeństwo / 3 kontrole", "On-chain", "Social", "Scorecard", "Finalna checklista"],
  en: ["Quick filter", "Deal breakers", "Security / 3 checks", "On-chain", "Social", "Scorecard", "Final research checklist"],
} as const;

const ITEM_NAMES: Record<string, [string, string]> = {
  market_cap: ["Kapitalizacja", "Market cap"], volume_24h: ["Wolumen 24 h", "24h volume"], liquidity: ["Płynność", "Liquidity"], pair_age: ["Wiek pary", "Pair age"], volume_market_cap_ratio: ["Wolumen / kapitalizacja", "Volume / market cap"], token_age: ["Wiek tokena", "Token age"],
  honeypot: ["Honeypot", "Honeypot"], top1_wallet: ["Największy portfel", "Top wallet"], contract_verified: ["Zweryfikowany kontrakt", "Contract verified"], buy_tax: ["Podatek kupna", "Buy tax"], sell_tax: ["Podatek sprzedaży", "Sell tax"], liquidity_unlocked: ["Płynność niezablokowana", "Liquidity unlocked"], tokensniffer: ["TokenSniffer", "TokenSniffer"], anonymous_team_young_project: ["Anonimowy zespół + młody projekt", "Anonymous team + young project"], suspicious_whitepaper: ["Podejrzany whitepaper", "Suspicious whitepaper"],
  goplus_coverage: ["Pokrycie GoPlus", "GoPlus coverage"], ownership: ["Własność", "Ownership"], mint: ["Mint", "Mint"], blacklist: ["Blacklist", "Blacklist"], whitelist: ["Whitelist", "Whitelist"], sell_restriction: ["Ograniczenie sprzedaży", "Sell restriction"], proxy: ["Proxy", "Proxy"], liquidity_lock: ["Blokada płynności", "Liquidity lock"], defi_scanner: ["De.Fi Scanner", "De.Fi Scanner"],
  top10_wallets: ["Top 10 portfeli", "Top 10 wallets"], liquidity_market_cap_ratio: ["Płynność / kapitalizacja", "Liquidity / market cap"], liquidity_lock_days: ["Dni blokady płynności", "Liquidity lock days"], holder_count: ["Liczba holderów", "Holder count"], developer_wallet: ["Portfel dewelopera", "Developer wallet"], liquidity_lock_end_date: ["Data końca blokady", "Liquidity lock end date"], wallet_clustering: ["Klaster portfeli", "Wallet clustering"], volume_quality: ["Jakość wolumenu", "Volume quality"],
  twitter: ["X / Twitter", "X / Twitter"], telegram: ["Telegram", "Telegram"], discord: ["Discord", "Discord"], website: ["Strona WWW", "Website"], team: ["Zespół", "Team"], whitepaper: ["Whitepaper", "Whitepaper"], roadmap: ["Roadmap", "Roadmap"],
  security_scorecard: ["Bezpieczeństwo (30)", "Security (30)"], onchain_scorecard: ["On-chain (25)", "On-chain (25)"], social_scorecard: ["Social (25)", "Social (25)"], narrative_scorecard: ["Narrative (20)", "Narrative (20)"], research_readiness: ["Gotowość researchu", "Research readiness"],
};

const STATUS_NAMES: Record<ResearchChecklistState, [string, string]> = {
  AUTO_VERIFIED: ["Sprawdzone automatycznie", "Automatically checked"],
  MANUAL_VERIFIED: ["Sprawdzone ręcznie", "Manually checked"],
  OPEN_EXTERNAL_TOOL: ["Wymaga sprawdzenia zewnętrznego", "External check required"],
  MISSING_DATA: ["Brak danych", "Missing data"],
  NOT_APPLICABLE: ["Nie dotyczy", "Not applicable"],
  RED_FLAG: ["Czerwona flaga", "Red flag"],
};

export function ResearchChecklistSummary({
  candidate,
  onOpenStep,
  focusOnMount = false,
}: {
  candidate: UiTokenCandidate;
  onOpenStep?: (step: ResearchStepNumber) => void;
  focusOnMount?: boolean;
}) {
  const view = useResearchChecklist(candidate);
  const { locale } = useProductLocale();
  const pl = locale === "pl";
  useEffect(() => {
    if (!focusOnMount || typeof document === "undefined") return;
    const focusPlaybook = () => {
      const target = document.getElementById("research-playbook-summary");
      if (!target) return;
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      target.focus({ preventScroll: true });
    };
    const frame = window.requestAnimationFrame(focusPlaybook);
    return () => window.cancelAnimationFrame(frame);
  }, [candidate.chain, candidate.contractAddress, focusOnMount]);
  return <section id="research-playbook-summary" tabIndex={focusOnMount ? -1 : undefined} data-research-playbook-focused={focusOnMount ? "true" : undefined} className="research-checklist-summary" aria-label={pl ? "Research playbook" : "Research playbook"}>
    <header><span>{pl ? "RESEARCH PLAYBOOK" : "RESEARCH PLAYBOOK"}</span><button type="button" className="research-current-step-cta" data-research-current-step-cta={view.current_step} onClick={() => onOpenStep?.(view.current_step)} onKeyDown={(event) => handleResearchStepKeyDown(event, view.current_step, onOpenStep)} aria-label={openStepLabel(view.current_step, locale)}>{pl ? `Krok ${view.current_step}/7 — ${stepName(view.current_step, locale)}` : `Step ${view.current_step}/7 — ${stepName(view.current_step, locale)}`}</button></header>
    <p>{pl ? "KOMPLETNOŚĆ RESEARCHU" : "RESEARCH COMPLETENESS"}: <b>{view.completeness.resolved_checks} / {view.completeness.total_checks}</b> ({view.completeness.percentage}%)</p>
    <ResearchKeyToolsOverview view={view} candidate={candidate} locale={locale} onOpenStep={onOpenStep} />
    <ol>{view.steps.map((step) => <li key={step.number} className={step.number === view.current_step ? "current" : ""}><button type="button" className="research-step-nav" data-research-step-nav={step.number} onClick={() => onOpenStep?.(step.number)} onKeyDown={(event) => handleResearchStepKeyDown(event, step.number, onOpenStep)} aria-label={openStepLabel(step.number, locale)}><span>{step.number}. {stepName(step.number, locale)}</span><ResearchStateBadge state={step.state} compact labelOverride={isIncompleteFinalStep(step) ? researchIncompleteName(locale) : undefined} /></button></li>)}</ol>
  </section>;
}

export function ResearchChecklistDetail({
  candidate,
  focusedStep = null,
  onBackToResearchPlaybook,
}: {
  candidate: UiTokenCandidate;
  focusedStep?: ResearchStepNumber | null;
  onBackToResearchPlaybook?: () => void;
}) {
  const { view, reload } = useResearchChecklistWithReload(candidate);
  const { locale } = useProductLocale();
  const pl = locale === "pl";
  useEffect(() => {
    if (!focusedStep || typeof document === "undefined") return;
    const focusStep = () => {
      const target = document.getElementById(`research-checklist-focus-${focusedStep}`);
      if (!target) return;
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      target.focus({ preventScroll: true });
    };
    const frame = window.requestAnimationFrame(focusStep);
    return () => window.cancelAnimationFrame(frame);
  }, [candidate.chain, candidate.contractAddress, focusedStep]);
  const selectedStep = focusedStep ? view.steps.find((step) => step.number === focusedStep) ?? null : null;
  if (selectedStep) {
    return <section id={`research-checklist-focus-${selectedStep.number}`} tabIndex={-1} className="research-checklist-detail research-checklist-focus-mode" aria-label={pl ? "Skupiony krok checklisty researchu" : "Focused research checklist step"}>
      <header className="research-focus-navigation" data-research-focus-navigation>
        <button type="button" className="research-focus-back" data-research-playbook-back onClick={() => onBackToResearchPlaybook?.()}>{pl ? "← Wróć do Research Playbook" : "← Back to Research Playbook"}</button>
        <strong>{pl ? `Krok ${selectedStep.number}/7` : `Step ${selectedStep.number}/7`}</strong>
      </header>
      <FocusedResearchStep step={selectedStep} view={view} candidate={candidate} locale={locale} writable={view.manual_evidence_writable} onSaved={reload} />
    </section>;
  }
  return <section className="research-checklist-detail" aria-label={pl ? "7-stopniowa checklista researchu" : "7-step research checklist"}>
    <header className="research-checklist-heading"><div><span>{pl ? "RESEARCH PLAYBOOK" : "RESEARCH PLAYBOOK"}</span><h3>{pl ? `Aktualny krok ${view.current_step}/7: ${stepName(view.current_step, locale)}` : `Current step ${view.current_step}/7: ${stepName(view.current_step, locale)}`}</h3><p>{readinessText(view, locale)}</p></div><ResearchProgress view={view} /></header>
    <div className="research-checklist-steps">{view.steps.map((step) => <ResearchStepCard key={step.number} step={step} view={view} candidate={candidate} locale={locale} writable={view.manual_evidence_writable} onSaved={reload} />)}</div>
  </section>;
}

function ResearchStepCard({
  step,
  view,
  candidate,
  locale,
  focused = false,
  writable = false,
  onSaved,
  children,
}: {
  step: ResearchChecklistStep;
  view?: ResearchChecklistView;
  candidate?: UiTokenCandidate;
  locale: "pl" | "en";
  focused?: boolean;
  writable?: boolean;
  onSaved?: () => Promise<void>;
  children?: React.ReactNode;
}) {
  const pl = locale === "pl";
  return <section id={`research-checklist-step-${step.number}`} tabIndex={focused ? -1 : undefined} data-research-step={step.number} data-research-focused={focused ? "true" : undefined} className={`research-checklist-step ${focused ? "focused" : ""}`}>
    <header><div><span>{pl ? `KROK ${step.number}` : `STEP ${step.number}`}</span><h4>{stepName(step.number, locale)}</h4></div><ResearchStateBadge state={step.state} labelOverride={isIncompleteFinalStep(step) ? researchIncompleteName(locale) : undefined} /></header>
    {children ?? <ResearchStepBody step={step} view={view} candidate={candidate} locale={locale} writable={writable} onSaved={onSaved} />}
  </section>;
}

function FocusedResearchStep({ step, view, candidate, locale, writable, onSaved }: {
  step: ResearchChecklistStep;
  view: ResearchChecklistView;
  candidate: UiTokenCandidate;
  locale: "pl" | "en";
  writable: boolean;
  onSaved: () => Promise<void>;
}) {
  const [technicalExpanded, setTechnicalExpanded] = useState(false);
  if (step.number === 6) {
    return <ResearchStepCard step={step} candidate={candidate} locale={locale} focused writable={writable} onSaved={onSaved}>
      <ResearchScorecardStep scorecard={view.effective_scorecard} locale={locale} />
    </ResearchStepCard>;
  }
  if (step.number === 7) {
    return <ResearchStepCard step={step} candidate={candidate} locale={locale} focused writable={writable} onSaved={onSaved}>
      <ResearchFinalReadinessStep scorecard={view.effective_scorecard} locale={locale} />
    </ResearchStepCard>;
  }
  if (step.number === 5) {
    return <ResearchStepCard step={step} candidate={candidate} locale={locale} focused writable={writable} onSaved={onSaved}>
      <SocialTeamDocsStep step={step} candidate={candidate} writable={writable} locale={locale} onSaved={onSaved} />
    </ResearchStepCard>;
  }
  const pl = locale === "pl";
  const contextualTools = contextualResearchTools(step);
  const technicalItems = meaningfulTechnicalItems(step);
  const unavailableItems = unavailableTechnicalItems(step);
  const summaryItems = step.number === 4 ? step.items : [...contextualTools, ...technicalItems];
  const checked = summaryItems.filter((item) => isSimpleChecked(item.state));
  const redFlags = summaryItems.filter((item) => item.state === "RED_FLAG");
  const toCheck = summaryItems.filter((item) => !isSimpleChecked(item.state) && item.state !== "RED_FLAG");
  const technicalRedFlags = technicalItems.filter((item) => item.state === "RED_FLAG");
  return <ResearchStepCard step={step} candidate={candidate} locale={locale} focused writable={writable} onSaved={onSaved}>
    <section className="research-simple-summary" data-research-simple-summary={step.number} aria-label={pl ? "Prosty status researchu" : "Simple research status"}>
      <header><div><span>{simpleFocusTitle(step.number, locale)}</span><strong>{simpleResearchStatus(view, step, summaryItems, locale)}</strong></div>{technicalRedFlags.length > 0 && <button type="button" className="research-red-flag-reveal" data-research-red-flag-reveal onClick={() => setTechnicalExpanded(true)}>{pl ? `Wykryto ${technicalRedFlags.length} ${technicalRedFlags.length === 1 ? "czerwoną flagę" : "czerwone flagi"}` : `${technicalRedFlags.length} red ${technicalRedFlags.length === 1 ? "flag detected" : "flags detected"}`} <span>{pl ? "Zobacz" : "View"}</span></button>}</header>
      <div className="research-focused-step-summary">
        <span><b>{pl ? "Sprawdzone" : "Checked"}</b>{checked.length}</span>
        <span className={redFlags.length > 0 ? "has-red-flags" : ""}><b>{pl ? "Czerwone flagi" : "Red flags"}</b>{redFlags.length}</span>
        <span><b>{pl ? "Do sprawdzenia" : "To check"}</b>{toCheck.length}</span>
      </div>
    </section>
    <ContextualResearchTools items={contextualTools} step={step.number} candidate={candidate} locale={locale} writable={writable} onSaved={onSaved} />
    {technicalItems.length > 0 && <details className="research-technical-details" data-research-technical-details={step.number} open={technicalExpanded} onToggle={(event) => setTechnicalExpanded(event.currentTarget.open)}>
      <summary><span>{pl ? `Pokaż szczegóły techniczne (${technicalItems.length})` : `Show technical details (${technicalItems.length})`}</span><b>{technicalExpanded ? (pl ? "Ukryj" : "Hide") : (pl ? "Pokaż" : "Show")}</b></summary>
      {technicalRedFlags.length > 0 && <div className="research-technical-red-flags" data-research-technical-red-flags><strong>{pl ? `Wykryto ${technicalRedFlags.length} ${technicalRedFlags.length === 1 ? "czerwoną flagę" : "czerwone flagi"}` : `${technicalRedFlags.length} red ${technicalRedFlags.length === 1 ? "flag" : "flags"}`}</strong></div>}
      <div className="research-checklist-items">{technicalItems.map((item) => <ResearchItem key={`${step.number}:${item.key}`} item={item} locale={locale} incompleteResearch={isIncompleteFinalStep(step)} />)}</div>
    </details>}
    {step.number === 4 && <OnchainManualEvidenceSection items={step.items.filter(isPc3cManualEvidenceItem)} candidate={candidate} writable={writable} locale={locale} onSaved={onSaved} />}
    <ResearchUnavailableState step={step} view={view} items={unavailableItems} locale={locale} />
  </ResearchStepCard>;
}

function SocialTeamDocsStep({ step, candidate, writable, locale, onSaved }: {
  step: ResearchChecklistStep;
  candidate: UiTokenCandidate;
  writable: boolean;
  locale: "pl" | "en";
  onSaved: () => Promise<void>;
}) {
  const pl = locale === "pl";
  const automaticLinks = step.items.flatMap((item) => {
    const url = item.automatic_link ? normalizeSafeSocialLinkUrl(item.key as SocialLinkCategory, item.automatic_link.url) : null;
    return url ? [{ item, url }] : [];
  });
  const automaticLinkItemKeys = new Set(automaticLinks.map(({ item }) => item.key));
  const checkedItems = step.items.filter((item) => isSimpleChecked(item.state));
  const redFlagItems = step.items.filter((item) => item.state === "RED_FLAG");
  const unresolvedItems = step.items.filter((item) => isUnresolvedResearchState(item.state));
  const missingAutomaticLinkItems = step.items.filter((item) => !automaticLinkItemKeys.has(item.key));
  const hasManualEvidence = step.items.some((item) => item.manual_evidence !== null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  return <section className="research-social-step" data-pc3d-social-step>
    <section className="research-social-simple-summary" data-pc3d-social-beginner aria-label={pl ? "Social / Team / Docs" : "Social / Team / Docs"}>
      <header><div><span>{pl ? "SOCIAL / TEAM / DOCS" : "SOCIAL / TEAM / DOCS"}</span><strong>{automaticLinks.length > 0 ? (pl ? "Źródła gotowe do researchu" : "Sources ready for research") : (pl ? "Wymaga ręcznego sprawdzenia" : "Manual review required")}</strong></div>{redFlagItems.length > 0 && <button type="button" className="research-red-flag-reveal" data-pc3d-social-red-flag onClick={() => setDetailsOpen(true)}>{pl ? `Wykryto ${redFlagItems.length} ${redFlagItems.length === 1 ? "czerwoną flagę" : "czerwone flagi"}` : `${redFlagItems.length} red ${redFlagItems.length === 1 ? "flag" : "flags"}`} <span>{pl ? "Zobacz" : "View"}</span></button>}</header>
      <div className="research-focused-step-summary">
        <span><b>{pl ? "Dostępne źródła" : "Available sources"}</b>{automaticLinks.length}</span>
        <span><b>{pl ? "Sprawdzone" : "Checked"}</b>{checkedItems.length}</span>
        <span className={redFlagItems.length > 0 ? "has-red-flags" : ""}><b>{pl ? "Czerwone flagi" : "Red flags"}</b>{redFlagItems.length}</span>
        <span><b>{pl ? "Do uzupełnienia" : "To complete"}</b>{unresolvedItems.length}</span>
      </div>
      {automaticLinks.length > 0 ? <><div className="research-social-link-actions" data-pc3d-social-links>{automaticLinks.map(({ item, url }) => <a key={`${item.key}:${url}`} href={url} target="_blank" rel="noopener noreferrer" data-pc3d-social-link={item.key}>{socialLinkButtonLabel(item.key, locale)} <span aria-hidden="true">↗</span></a>)}</div><small className="research-social-link-provenance">{pl ? "Link ze źródła tokena — wymaga własnej oceny." : "Link from token source — it still requires your own review."}</small></> : <NoSocialLinksState candidate={candidate} hasManualEvidence={hasManualEvidence} locale={locale} />}
      <p className="research-social-next-action">{pl ? "Następny krok: otwórz źródło lub dodaj własne ustalenie." : "Next step: open a source or add your own finding."}</p>
    </section>
    {redFlagItems.length > 0 && <section className="research-social-red-flags" data-pc3d-social-red-flag-summary><strong>{pl ? "Czerwone flagi wymagają uwagi" : "Red flags require attention"}</strong><ul>{redFlagItems.map((item) => <li key={item.key}>{itemName(item.key, locale)}: {researchChecklistItemValue(item, locale)}</li>)}</ul></section>}
    <details className="research-social-details" data-pc3d-social-details open={detailsOpen} onToggle={(event) => setDetailsOpen(event.currentTarget.open)}>
      <summary><span>{pl ? "Pokaż szczegóły Social / Team / Docs" : "Show Social / Team / Docs details"}</span><b>{detailsOpen ? (pl ? "Ukryj" : "Hide") : (pl ? "Pokaż" : "Show")}</b></summary>
      {detailsOpen && <div className="research-social-details-content">
        {automaticLinks.length > 0 && <section className="research-social-sources"><h5>{pl ? "Linki ze źródła tokena" : "Links from token source"}</h5>{automaticLinks.map(({ item, url }) => <article key={`detail:${item.key}:${url}`}><div><strong>{itemName(item.key, locale)}</strong><small>{automaticProvenanceText(item.automatic_link!.provenance.source, item.automatic_link!.provenance.snapshot_at, locale)}</small></div><a href={url} target="_blank" rel="noopener noreferrer">{pl ? "Otwórz link" : "Open link"} ↗</a><p>{pl ? "Link ze źródła tokena — wymaga własnej oceny." : "Link from token source — it still requires your own review."}</p></article>)}</section>}
        <section className="research-social-manual" data-pc3d-social-manual>
          <header><div><h5>{pl ? "Twoje ustalenia" : "Your findings"}</h5><p>{writable ? (pl ? "Widoczne tylko dla Ciebie. Nie wpływają na wspólne dane ani status tokena." : "Visible only to you. They do not affect shared data or the token status.") : (pl ? "Tryb tylko do odczytu." : "Read-only mode.")}</p></div></header>
          {step.items.map((item) => <SocialManualEvidenceEditor key={item.key} item={item} candidate={candidate} writable={writable} locale={locale} onSaved={onSaved} />)}
        </section>
        {missingAutomaticLinkItems.length > 0 && <p className="research-social-missing" data-pc3d-social-missing>{pl ? `Brakuje automatycznych linków dla: ${missingAutomaticLinkItems.map((item) => itemName(item.key, locale)).join(", ")}.` : `No automatic links for: ${missingAutomaticLinkItems.map((item) => itemName(item.key, locale)).join(", ")}.`}</p>}
      </div>}
    </details>
  </section>;
}

function NoSocialLinksState({ candidate, hasManualEvidence, locale }: { candidate: UiTokenCandidate; hasManualEvidence: boolean; locale: "pl" | "en" }) {
  const pl = locale === "pl";
  const source = normalizeSafePublicHttpsUrl(candidate.sourceUrl);
  return <div className="research-social-empty" data-pc3d-social-empty><p>{pl ? "Nie znaleziono automatycznych linków społecznościowych w obecnym źródle." : "No automatic social links were found in the current source."}</p><small>{hasManualEvidence ? (pl ? "Masz zapisane prywatne ustalenia — znajdziesz je w szczegółach." : "You have saved private findings — find them in the details.") : (pl ? "Research społeczny wymaga ręcznego uzupełnienia." : "Social research requires manual completion.")}</small>{source && <a href={source} target="_blank" rel="noopener noreferrer">{pl ? "Otwórz źródło tokena" : "Open token source"} ↗</a>}</div>;
}

const SOCIAL_MANUAL_OPTIONS: Record<Extract<ResearchChecklistItemKey, "twitter" | "telegram" | "discord" | "website" | "team" | "whitepaper" | "roadmap">, Array<[string, string, string]>> = {
  twitter: [["healthy", "Zdrowy / organiczny profil", "Healthy / organic profile"], ["needs_attention", "Wymaga uwagi", "Needs attention"], ["suspicious", "Wyraźnie sztuczny / podejrzany", "Clearly artificial / suspicious"], ["missing", "Brak danych", "Missing data"]],
  telegram: [["healthy", "Aktywna / realna społeczność", "Active / real community"], ["needs_attention", "Wymaga uwagi", "Needs attention"], ["suspicious", "Podejrzana / sztuczna aktywność", "Suspicious / artificial activity"], ["missing", "Brak danych", "Missing data"]],
  discord: [["healthy", "Aktywny / realny", "Active / real"], ["needs_attention", "Wymaga uwagi", "Needs attention"], ["suspicious", "Podejrzany", "Suspicious"], ["missing", "Brak danych", "Missing data"]],
  website: [["working", "Działa i pasuje do projektu", "Working and consistent with the project"], ["needs_attention", "Wymaga uwagi", "Needs attention"], ["suspicious", "Podejrzana / niespójna", "Suspicious / inconsistent"], ["missing", "Brak danych", "Missing data"]],
  team: [["transparent", "Transparentny / nazwany team", "Transparent / named team"], ["anonymous", "Anonimowy team", "Anonymous team"], ["missing", "Nie udało się potwierdzić", "Could not confirm"]],
  whitepaper: [["reasonable", "Oryginalny / sensowny", "Original / reasonable"], ["needs_attention", "Wymaga uwagi", "Needs attention"], ["suspected_copy_paste", "Podejrzenie copy-paste", "Suspected copy-paste"], ["missing", "Brak danych", "Missing data"]],
  roadmap: [["coherent", "Spójna / realistyczna", "Coherent / realistic"], ["needs_attention", "Wymaga uwagi", "Needs attention"], ["missing", "Brak / nie udało się potwierdzić", "Missing / could not confirm"]],
};

function SocialManualEvidenceEditor({ item, candidate, writable, locale, onSaved }: {
  item: ResearchChecklistItem;
  candidate: UiTokenCandidate;
  writable: boolean;
  locale: "pl" | "en";
  onSaved: () => Promise<void>;
}) {
  const pl = locale === "pl";
  const key = item.key as keyof typeof SOCIAL_MANUAL_OPTIONS;
  const options = SOCIAL_MANUAL_OPTIONS[key];
  const evidence = item.manual_evidence;
  const [expanded, setExpanded] = useState(false);
  const [result, setResult] = useState(evidence?.value_text && options.some(([value]) => value === evidence.value_text) ? evidence.value_text : options[0][0]);
  const [percentage, setPercentage] = useState(evidence?.value_number?.toString() ?? "");
  const [note, setNote] = useState(evidence?.note ?? "");
  const [evidenceUrl, setEvidenceUrl] = useState(evidence?.evidence_url ?? item.automatic_link?.url ?? "");
  const [observedAt, setObservedAt] = useState(evidence?.observed_at ? evidence.observed_at.slice(0, 16) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const acceptsRatio = key === "twitter" || key === "telegram";
  const save = async () => {
    if (!writable) return;
    const ratio = percentage.trim() ? Number(percentage) : null;
    if (ratio !== null && (!Number.isFinite(ratio) || ratio < 0 || ratio > 100)) { setError(pl ? "Podaj wartość od 0 do 100%." : "Provide a value from 0 to 100%."); return; }
    if (evidenceUrl && !normalizeSafeSocialLinkUrl(key, evidenceUrl)) { setError(pl ? "Podaj bezpieczny link HTTPS dla tego źródła." : "Provide a safe HTTPS link for this source."); return; }
    const manualState = socialManualState(key, result);
    if (!manualState) { setError(pl ? "Wybierz prawidłowy wynik." : "Choose a valid result."); return; }
    setSaving(true); setError(null);
    const saved = await saveResearchEvidence({ chain: candidate.chain, contractAddress: candidate.contractAddress, stepNumber: 5, itemKey: item.key, manualState, valueText: result, valueNumber: acceptsRatio ? ratio : null, note: note || null, sourceTool: `Manual social research: ${key}`, evidenceUrl: evidenceUrl || null, observedAt: observedAt ? new Date(observedAt).toISOString() : null });
    setSaving(false);
    if (!saved) { setError(pl ? "Nie zapisano wyniku. Sprawdź pola i spróbuj ponownie." : "The result was not saved. Check the fields and try again."); return; }
    setExpanded(false); await onSaved();
  };
  const remove = async () => {
    if (!writable) return;
    setSaving(true); setError(null);
    const deleted = await deleteResearchEvidence({ chain: candidate.chain, contractAddress: candidate.contractAddress, stepNumber: 5, itemKey: item.key });
    setSaving(false);
    if (!deleted) { setError(pl ? "Nie usunięto wpisu." : "The entry was not deleted."); return; }
    setExpanded(false); await onSaved();
  };
  return <article className="research-social-manual-item" data-pc3d-manual-item={key}>
    <div><strong>{itemName(key, locale)}</strong><ResearchStateBadge state={item.state} compact />{item.manual_evidence && <p>{researchChecklistItemValue(item, locale)}</p>}</div>
    {writable && <ActionButton variant="secondary" onClick={() => setExpanded((current) => !current)}>{expanded ? (pl ? "Zamknij" : "Close") : evidence ? (pl ? "Edytuj ustalenie" : "Edit finding") : (pl ? "Dodaj ustalenie" : "Add finding")}</ActionButton>}
    {expanded && <div className="research-social-manual-form"><label><span>{pl ? "Wynik" : "Result"}</span><select value={result} disabled={!writable} onChange={(event) => setResult(event.target.value)}>{options.map(([value, polish, english]) => <option key={value} value={value}>{pl ? polish : english}</option>)}</select></label>{acceptsRatio && <label><span>{pl ? "Zaangażowanie / aktywność (%) — opcjonalnie" : "Engagement / activity (%) — optional"}</span><input type="number" min="0" max="100" step="0.1" value={percentage} disabled={!writable} onChange={(event) => setPercentage(event.target.value)} /></label>}<label><span>{pl ? "URL dowodu" : "Evidence URL"}</span><input type="url" value={evidenceUrl} disabled={!writable} maxLength={2048} placeholder="https://" onChange={(event) => setEvidenceUrl(event.target.value)} /></label><label><span>{pl ? "Zaobserwowano" : "Observed at"}</span><input type="datetime-local" value={observedAt} disabled={!writable} onChange={(event) => setObservedAt(event.target.value)} /></label><label className="research-social-note"><span>{pl ? "Krótka notatka" : "Short note"}</span><textarea value={note} disabled={!writable} maxLength={1000} rows={2} onChange={(event) => setNote(event.target.value)} /></label>{socialManualAdvisory(key, result, locale) && <p className="research-manual-advisory">{socialManualAdvisory(key, result, locale)}</p>}{writable && <div className="research-manual-actions"><ActionButton variant="primary" loading={saving} onClick={() => void save()}>{pl ? "Zapisz wynik" : "Save result"}</ActionButton>{evidence && <ActionButton variant="secondary" loading={saving} onClick={() => void remove()}>{pl ? "Usuń" : "Delete"}</ActionButton>}</div>}{error && <p role="alert">{error}</p>}</div>}
  </article>;
}

function socialLinkButtonLabel(key: ResearchChecklistItemKey, locale: "pl" | "en"): string {
  const labels: Partial<Record<ResearchChecklistItemKey, [string, string]>> = { twitter: ["X", "X"], telegram: ["Telegram", "Telegram"], discord: ["Discord", "Discord"], website: ["Strona", "Website"], whitepaper: ["Docs", "Docs"], roadmap: ["Roadmap", "Roadmap"], team: ["Team", "Team"] };
  return labels[key]?.[locale === "pl" ? 0 : 1] ?? itemName(key, locale);
}

function socialManualState(key: keyof typeof SOCIAL_MANUAL_OPTIONS, value: string): PersistedManualResearchState | null {
  if (value === "missing") return "MISSING_DATA";
  if (value === "suspicious" || value === "suspected_copy_paste") return "RED_FLAG";
  return SOCIAL_MANUAL_OPTIONS[key].some(([option]) => option === value) ? "MANUAL_VERIFIED" : null;
}

function socialManualAdvisory(key: keyof typeof SOCIAL_MANUAL_OPTIONS, value: string, locale: "pl" | "en"): string | null {
  if (value === "needs_attention") return locale === "pl" ? "Wynik wymaga dalszego review; nie jest automatyczną czerwoną flagą." : "This result needs further review; it is not an automatic red flag.";
  if (key === "team" && value === "anonymous") return locale === "pl" ? "Anonimowy team sam w sobie nie jest deal breakerem bez wiarygodnego wieku tokena." : "An anonymous team alone is not a deal breaker without reliable token age.";
  if (key === "twitter" && value === "healthy") return locale === "pl" ? "Kontekst metodologii: 2–5% engagement może być zdrowym sygnałem, ale nie tworzy automatycznej oceny." : "Method context: 2–5% engagement can be healthy context, but it does not create an automatic verdict.";
  if (key === "telegram" && value === "healthy") return locale === "pl" ? "Kontekst metodologii: >500 członków i 10–30% aktywności są pomocne, ale wymagają własnej obserwacji." : "Method context: >500 members and 10–30% activity are useful, but require your own observation.";
  return null;
}

function ResearchScorecardStep({ scorecard, locale }: { scorecard: ResearchScorecardView; locale: "pl" | "en" }) {
  const pl = locale === "pl";
  const hasRedFlags = scorecard.red_flags_total > 0;
  const domains: Array<["security" | "onchain" | "social", ResearchScorecardDomain]> = [
    ["security", scorecard.security],
    ["onchain", scorecard.onchain],
    ["social", scorecard.social],
  ];
  return <section className="research-scorecard" data-pc3e-scorecard aria-label={pl ? "Scorecard researchu" : "Research scorecard"}>
    <section className="research-scorecard-beginner" data-pc3e-scorecard-beginner>
      <span>{pl ? "SCORECARD RESEARCHU" : "RESEARCH SCORECARD"}</span>
      {hasRedFlags && <strong className="research-scorecard-red-flag">{pl ? "Wykryto czerwoną flagę" : "A red flag was detected"}</strong>}
      <div className="research-scorecard-total"><b>{formatResearchScore(scorecard.total.earned, locale)} / 100</b><p>{pl ? "Wynik częściowy" : "Partial score"}</p></div>
      <dl>
        {domains.map(([name, domain]) => <div key={name}><dt>{scorecardDomainName(name, locale)}</dt><dd>{formatResearchScore(domain.earned, locale)} / {domain.max}</dd></div>)}
        <div><dt>{pl ? "Narracja" : "Narrative"}</dt><dd>{scorecard.narrative.scored ? `${formatResearchScore(scorecard.narrative.earned, locale)} / ${scorecard.narrative.max}` : `— / ${scorecard.narrative.max}`}</dd></div>
      </dl>
      {!scorecard.narrative.scored && <p className="research-scorecard-narrative-note">{pl ? "Narracja: nieoceniona — 20 pkt pozostaje nierozstrzygnięte." : "Narrative: not scored — 20 points remain unresolved."}</p>}
      <div className="research-scorecard-counters"><span>{pl ? "Brakuje danych" : "Missing"}: <b>{scorecard.missing_total}</b></span><span className={hasRedFlags ? "has-red-flags" : ""}>{pl ? "Czerwone flagi" : "Red flags"}: <b>{scorecard.red_flags_total}</b></span></div>
      <p className="research-scorecard-helper">{pl ? "To podsumowanie potwierdzonego researchu, nie rekomendacja inwestycyjna." : "This summarizes confirmed research; it is not an investment recommendation."}</p>
    </section>
    <details className="research-scorecard-details" data-pc3e-scorecard-details>
      <summary>{pl ? "Pokaż, jak powstał wynik" : "Show how the score was calculated"}</summary>
      {domains.map(([name, domain]) => <ScorecardDomainBreakdown key={name} name={name} domain={domain} locale={locale} />)}
      <ScorecardNarrativeBreakdown scorecard={scorecard} locale={locale} />
    </details>
  </section>;
}

function ScorecardDomainBreakdown({ name, domain, locale }: { name: "security" | "onchain" | "social"; domain: ResearchScorecardDomain; locale: "pl" | "en" }) {
  const pl = locale === "pl";
  return <section className="research-scorecard-domain" data-pc3e-scorecard-domain={name}>
    <header><strong>{scorecardDomainName(name, locale)}: {formatResearchScore(domain.earned, locale)} / {domain.max}</strong><span>{pl ? `Sprawdzone: ${domain.resolved}` : `Checked: ${domain.resolved}`}</span></header>
    <p>{pl ? `Braki: ${domain.missing} · Czerwone flagi: ${domain.red_flags}` : `Missing: ${domain.missing} · Red flags: ${domain.red_flags}`}</p>
    <ul>{domain.reasons.filter((criterion) => criterion.state !== "NOT_APPLICABLE").map((criterion) => <ScorecardCriterionRow key={criterion.key} criterion={criterion} locale={locale} />)}</ul>
  </section>;
}

function ScorecardNarrativeBreakdown({ scorecard, locale }: { scorecard: ResearchScorecardView; locale: "pl" | "en" }) {
  const pl = locale === "pl";
  return <section className="research-scorecard-domain" data-pc3e-scorecard-domain="narrative">
    <header><strong>{pl ? "Narracja" : "Narrative"}: {scorecard.narrative.scored ? `${formatResearchScore(scorecard.narrative.earned, locale)} / ${scorecard.narrative.max}` : `— / ${scorecard.narrative.max}`}</strong><span>{pl ? "Nieoceniona" : "Not scored"}</span></header>
    <p>{pl ? "Brak zatwierdzonego źródła liczbowego. Tekst AI ani sentyment nie są punktowane." : "No approved numeric source is available. AI prose and sentiment are not scored."}</p>
  </section>;
}

function ScorecardCriterionRow({ criterion, locale }: { criterion: ResearchScorecardCriterion; locale: "pl" | "en" }) {
  const label = scorecardCriterionName(criterion.key, locale);
  return <li className={`research-scorecard-criterion ${criterion.state.toLowerCase()}`}><span aria-hidden="true">{scorecardCriterionIcon(criterion.state)}</span><strong>{label}</strong><small>{scorecardCriterionStatus(criterion.state, locale)}</small></li>;
}

function ResearchFinalReadinessStep({ scorecard, locale }: { scorecard: ResearchScorecardView; locale: "pl" | "en" }) {
  const pl = locale === "pl";
  const readiness = scorecard.readiness;
  return <section className="research-final-readiness" data-pc3e-final-readiness aria-label={pl ? "Finalna checklista researchu" : "Final research checklist"}>
    <section className="research-final-readiness-beginner" data-pc3e-final-readiness-beginner>
      <span>{pl ? "FINALNA CHECKLISTA" : "FINAL RESEARCH CHECKLIST"}</span>
      <h5>{pl ? "Status" : "Status"}: {readinessStatusName(readiness.status, locale)}</h5>
      <p>{pl ? "Wynik" : "Score"}: <b>{formatResearchScore(scorecard.total.earned, locale)} / 100</b> — {scorecard.partial ? (pl ? "częściowy" : "partial") : (pl ? "kompletny" : "complete")}</p>
      <dl>
        <div><dt>{pl ? "Sprawdzone" : "Checked"}</dt><dd>{readiness.resolved} / {readiness.applicable}</dd></div>
        <div className={readiness.red_flags > 0 ? "has-red-flags" : ""}><dt>{pl ? "Czerwone flagi" : "Red flags"}</dt><dd>{readiness.red_flags}</dd></div>
        <div><dt>{pl ? "Brakuje" : "Missing"}</dt><dd>{readiness.missing}</dd></div>
      </dl>
      <p className="research-final-next-action">{nextReadinessAction(readiness.status, locale)}</p>
    </section>
    <details className="research-final-readiness-details" data-pc3e-final-readiness-details>
      <summary>{pl ? "Pokaż pełną checklistę" : "Show full checklist"}</summary>
      {readiness.groups.map((group) => <section key={group.step_number} className="research-final-readiness-group" data-pc3e-readiness-group={group.step_number}>
        <header><strong>{pl ? `Krok ${group.step_number}: ${stepName(group.step_number, locale)}` : `Step ${group.step_number}: ${stepName(group.step_number, locale)}`}</strong><span>{pl ? `Sprawdzone ${group.resolved}/${group.applicable}` : `Checked ${group.resolved}/${group.applicable}`}</span></header>
        {group.step_number === 2 && <p>{pl ? "Kontrole z kroku 2 są uwzględnione tylko raz — w Bezpieczeństwie i On-chain." : "Step 2 checks are included only once — in Security and On-chain."}</p>}
        {group.reasons.length > 0 && <ul>{group.reasons.filter((criterion) => criterion.state !== "NOT_APPLICABLE").map((criterion) => <ScorecardCriterionRow key={criterion.key} criterion={criterion} locale={locale} />)}</ul>}
      </section>)}
    </details>
  </section>;
}

function scorecardDomainName(name: "security" | "onchain" | "social", locale: "pl" | "en"): string {
  const labels = { security: ["Bezpieczeństwo", "Security"], onchain: ["On-chain", "On-chain"], social: ["Social", "Social"] } as const;
  return labels[name][locale === "pl" ? 0 : 1];
}

function scorecardCriterionName(key: string, locale: "pl" | "en"): string {
  if (key === "narrative") return locale === "pl" ? "Narracja" : "Narrative";
  return itemName(key, locale);
}

function scorecardCriterionIcon(state: ResearchScorecardCriterion["state"]): string {
  if (state === "POSITIVE") return "✓";
  if (state === "RED_FLAG") return "✕";
  if (state === "MISSING") return "—";
  return "!";
}

function scorecardCriterionStatus(state: ResearchScorecardCriterion["state"], locale: "pl" | "en"): string {
  const pl = locale === "pl";
  if (state === "POSITIVE") return pl ? "potwierdzone" : "confirmed";
  if (state === "RED_FLAG") return pl ? "czerwona flaga" : "red flag";
  if (state === "MISSING") return pl ? "brak danych" : "missing";
  if (state === "NOT_APPLICABLE") return pl ? "nie dotyczy" : "not applicable";
  return pl ? "wymaga uwagi" : "requires attention";
}

function readinessStatusName(status: ResearchScorecardView["readiness"]["status"], locale: "pl" | "en"): string {
  if (status === "RED_FLAGS_DETECTED") return locale === "pl" ? "Wykryto czerwone flagi" : "Red flags detected";
  if (status === "RESEARCH_COMPLETE_FOR_OWN_ASSESSMENT") return locale === "pl" ? "Research kompletny do własnej oceny" : "Research complete for your own assessment";
  return locale === "pl" ? "Research niekompletny" : "Research incomplete";
}

function nextReadinessAction(status: ResearchScorecardView["readiness"]["status"], locale: "pl" | "en"): string {
  if (status === "RED_FLAGS_DETECTED") return locale === "pl" ? "Sprawdź wykrytą czerwoną flagę." : "Review the detected red flag.";
  if (status === "RESEARCH_COMPLETE_FOR_OWN_ASSESSMENT") return locale === "pl" ? "Research kompletny — przejdź do własnej oceny." : "Research is complete — continue with your own assessment.";
  return locale === "pl" ? "Uzupełnij najważniejsze brakujące kontrole." : "Complete the most important missing checks.";
}

function formatResearchScore(value: number, locale: "pl" | "en"): string {
  return new Intl.NumberFormat(locale === "pl" ? "pl-PL" : "en-US", { maximumFractionDigits: 1 }).format(value);
}

function ResearchStepBody({ step, view, candidate, locale, writable, onSaved }: {
  step: ResearchChecklistStep;
  view?: ResearchChecklistView;
  candidate?: UiTokenCandidate;
  locale: "pl" | "en";
  writable: boolean;
  onSaved?: () => Promise<void>;
}) {
  const contextualTools = contextualResearchTools(step);
  const technicalItems = meaningfulTechnicalItems(step);
  if (step.number === 6 && view) return <ResearchScorecardStep scorecard={view.effective_scorecard} locale={locale} />;
  if (step.number === 7 && view) return <ResearchFinalReadinessStep scorecard={view.effective_scorecard} locale={locale} />;
  return <>
    {candidate && onSaved && <ContextualResearchTools items={contextualTools} step={step.number} candidate={candidate} locale={locale} writable={writable} onSaved={onSaved} />}
    {technicalItems.length > 0 && <div className="research-checklist-items">{technicalItems.map((item) => <ResearchItem key={`${step.number}:${item.key}`} item={item} locale={locale} incompleteResearch={isIncompleteFinalStep(step)} />)}</div>}
    <ResearchUnavailableState step={step} view={view} items={unavailableTechnicalItems(step)} locale={locale} />
  </>;
}

function ResearchKeyToolsOverview({ view, candidate, locale, onOpenStep }: {
  view: ResearchChecklistView;
  candidate: UiTokenCandidate;
  locale: "pl" | "en";
  onOpenStep?: (step: ResearchStepNumber) => void;
}) {
  const pl = locale === "pl";
  const tools = resolveKeyResearchTools(view);
  return <section className="research-global-key-tools" data-research-global-tools aria-label={pl ? "Główne kontrole" : "Key checks"}>
    <header><h4>{pl ? "Główne kontrole" : "Key checks"}</h4><span>{pl ? "4 narzędzia" : "4 tools"}</span></header>
    <div>{tools.map((item) => {
      const tool = item.manual_external_tool;
      const content = <><strong>{keyToolName(tool, locale)}</strong><span>{simpleToolStatus(item, candidate, locale)}</span></>;
      return onOpenStep
        ? <button type="button" key={tool} data-research-global-tool={tool} data-research-global-tool-focus={item.step_number} onClick={() => onOpenStep(item.step_number)} aria-label={pl ? `Otwórz krok ${item.step_number}: ${keyToolName(tool, locale)}` : `Open step ${item.step_number}: ${keyToolName(tool, locale)}`}>{content}</button>
        : <div key={tool} data-research-global-tool={tool}>{content}</div>;
    })}</div>
  </section>;
}

function ContextualResearchTools({ items, step, candidate, locale, writable, onSaved }: {
  items: Array<ResearchChecklistItem & { manual_external_tool: ManualResearchTool }>;
  step: ResearchStepNumber;
  candidate: UiTokenCandidate;
  locale: "pl" | "en";
  writable: boolean;
  onSaved: () => Promise<void>;
}) {
  if (items.length === 0) return null;
  const pl = locale === "pl";
  return <section className="research-key-tools" data-research-contextual-tools={step} aria-label={pl ? "Główne kontrole" : "Key checks"}>
    <header><h5>{pl ? "Główne kontrole" : "Key checks"}</h5><span>{pl ? `${items.length} narzędzia` : `${items.length} tools`}</span></header>
    <div>{items.map((item) => <ContextualResearchToolCard key={`${item.step_number}:${item.key}`} item={item} candidate={candidate} locale={locale} writable={writable} onSaved={onSaved} />)}</div>
  </section>;
}

function ContextualResearchToolCard({ item, candidate, locale, writable, onSaved }: {
  item: ResearchChecklistItem & { manual_external_tool: ManualResearchTool };
  candidate: UiTokenCandidate;
  locale: "pl" | "en";
  writable: boolean;
  onSaved: () => Promise<void>;
}) {
  const tool = item.manual_external_tool;
  return <article className="research-key-tool" data-key-research-tool={tool}>
    <div className="research-key-tool-heading"><strong>{keyToolName(tool, locale)}</strong><span>{simpleToolStatus(item, candidate, locale)}</span></div>
    <ManualExternalResearchWorkflow item={item} candidate={candidate} writable={writable} locale={locale} onSaved={onSaved} compact />
  </article>;
}

export function ResearchManualEvidencePanel({ candidate }: { candidate: UiTokenCandidate }) {
  const { view, reload } = useResearchChecklistWithReload(candidate);
  const { locale } = useProductLocale();
  const pl = locale === "pl";
  const manualItems = view.steps.map((step) => ({ ...step, items: step.items.filter((item) => !isManualExternalResearchItem(item) && item.manual_allowed && (item.state === "MISSING_DATA" || item.state === "OPEN_EXTERNAL_TOOL" || item.manual_evidence)) })).filter((step) => step.items.length > 0);
  return <section className="research-manual-evidence" aria-label={pl ? "Prywatne dowody researchu" : "Private research evidence"}>
    <header><span>{pl ? "PRYWATNE DOWODY RESEARCHU" : "PRIVATE RESEARCH EVIDENCE"}</span><h3>{pl ? "Twoje ręczne ustalenia" : "Your manual findings"}</h3><p>{view.manual_evidence_writable ? (pl ? "Widoczne tylko w Twoim workspace. Nie zmieniają Radaru, lifecycle ani danych wspólnych." : "Visible only in your workspace. They never change Radar, lifecycle, or shared data.") : (pl ? "Tryb tylko do odczytu. Nie możesz zapisywać prywatnych dowodów." : "Read-only mode. You cannot save private evidence.")}</p></header>
    {manualItems.length === 0 ? <p className="research-empty">{pl ? "Brak pozycji wymagających ręcznego wpisu." : "No items currently require a manual entry."}</p> : manualItems.map((step) => <section key={step.number} className="research-manual-step"><h4>{step.number}. {stepName(step.number, locale)}</h4>{step.items.map((item) => isPc3cManualEvidenceItem(item) ? <OnchainManualEvidenceEditor key={`${step.number}:${item.key}`} item={item} candidate={candidate} writable={view.manual_evidence_writable} locale={locale} onSaved={reload} /> : <ManualEvidenceEditor key={`${step.number}:${item.key}`} item={item} candidate={candidate} writable={view.manual_evidence_writable} locale={locale} onSaved={reload} />)}</section>)}
  </section>;
}

function useResearchChecklist(candidate: UiTokenCandidate): ResearchChecklistView {
  return useResearchChecklistWithReload(candidate).view;
}

function useResearchChecklistWithReload(candidate: UiTokenCandidate): { view: ResearchChecklistView; reload: () => Promise<void> } {
  const fallback = useMemo(() => resolveResearchChecklist(candidate), [candidate]);
  const [remoteView, setRemoteView] = useState<ResearchChecklistView | null>(null);
  const identity = `${candidate.chain}:${candidate.contractAddress}`.toLowerCase();
  const reload = useCallback(async () => {
    const value = await loadResearchChecklist(candidate.chain, candidate.contractAddress);
    if (value) setRemoteView(value);
  }, [candidate.chain, candidate.contractAddress]);
  useEffect(() => {
    let active = true;
    void loadResearchChecklist(candidate.chain, candidate.contractAddress).then((value) => {
      if (active && value) setRemoteView(value);
    });
    return () => { active = false; };
  }, [candidate.chain, candidate.contractAddress]);
  const view = remoteView && `${remoteView.chain}:${remoteView.contract_address}`.toLowerCase() === identity
    ? remoteView
    : fallback;
  return { view, reload };
}

function ResearchProgress({ view }: { view: ResearchChecklistView }) {
  const { locale } = useProductLocale();
  const pl = locale === "pl";
  return <div className="research-progress"><span>{pl ? "KOMPLETNOŚĆ RESEARCHU" : "RESEARCH COMPLETENESS"}</span><strong>{view.completeness.resolved_checks} / {view.completeness.total_checks}</strong><div aria-hidden="true"><i style={{ width: `${view.completeness.percentage}%` }} /></div></div>;
}

function ResearchItem({ item, candidate, locale, writable = false, onSaved, incompleteResearch = false }: { item: ResearchChecklistItem; candidate?: UiTokenCandidate; locale: "pl" | "en"; writable?: boolean; onSaved?: () => Promise<void>; incompleteResearch?: boolean }) {
  const pl = locale === "pl";
  const manual = item.manual_evidence;
  return <article className={`research-checklist-item ${item.state.toLowerCase()}`}><div><strong>{itemName(item.key, locale)}</strong><ResearchStateBadge state={item.state} labelOverride={incompleteResearch ? researchIncompleteName(locale) : undefined} /><p>{researchChecklistItemValue(item, locale)}</p>{item.manual_external_tool && item.automatic_state && item.automatic_state !== item.state && <small>{pl ? "Dane automatyczne pozostają oddzielne" : "Automatic evidence remains separate"}: {statusName(item.automatic_state, locale)}</small>}{item.threshold && <small>{pl ? "Próg metodologii" : "Methodology threshold"}: {methodologyThreshold(item.threshold, locale)}</small>}{item.automatic_provenance && <small className="research-automatic-provenance">{automaticProvenanceText(item.automatic_provenance.source, item.automatic_provenance.snapshot_at, locale)}</small>}</div>{candidate && isManualExternalResearchItem(item) && onSaved && <ManualExternalResearchWorkflow item={item} candidate={candidate} writable={writable} locale={locale} onSaved={onSaved} />}{manual && <div className="research-manual-note"><span>{pl ? "Prywatny wpis" : "Private entry"}</span>{manual.value_text && <p>{researchEvidencePresentationText(manual.value_text, locale, manual.source_tool)}</p>}{manual.value_number != null && <p>{manual.value_number}</p>}{manual.note && <p>{manual.note}</p>}{manual.source_tool && <small>{pl ? "Narzędzie" : "Tool"}: {manual.source_tool}</small>}{manual.evidence_url && <a href={manual.evidence_url} target="_blank" rel="noopener noreferrer">{pl ? "Otwórz dowód" : "Open evidence"}</a>}</div>}</article>;
}

const MANUAL_TOOL_DETAILS: Record<ManualResearchTool, { sourceTool: string; title: [string, string]; open: [string, string] }> = {
  honeypot: { sourceTool: "Honeypot.is", title: ["Honeypot.is — wynik ręczny", "Honeypot.is — manual result"], open: ["Sprawdź Honeypot", "Check Honeypot"] },
  tokensniffer: { sourceTool: "TokenSniffer", title: ["TokenSniffer — wynik ręczny", "TokenSniffer — manual result"], open: ["Otwórz TokenSniffer", "Open TokenSniffer"] },
  defi_scanner: { sourceTool: "De.Fi Scanner", title: ["De.Fi Scanner — wynik ręczny", "De.Fi Scanner — manual result"], open: ["Otwórz De.Fi Scanner", "Open De.Fi Scanner"] },
  bubblemaps: { sourceTool: "Bubblemaps", title: ["Bubblemaps — wynik ręczny", "Bubblemaps — manual result"], open: ["Otwórz Bubblemaps", "Open Bubblemaps"] },
};

const KEY_RESEARCH_TOOL_ORDER: readonly ManualResearchTool[] = ["honeypot", "tokensniffer", "defi_scanner", "bubblemaps"];

function resolveKeyResearchTools(view: ResearchChecklistView): Array<ResearchChecklistItem & { manual_external_tool: ManualResearchTool }> {
  const manualItems = view.steps.flatMap((step) => step.items.filter(isManualExternalResearchItem));
  return KEY_RESEARCH_TOOL_ORDER.flatMap((tool) => {
    const item = manualItems.find((entry) => entry.manual_external_tool === tool);
    return item ? [item] : [];
  });
}

function isSimpleChecked(state: ResearchChecklistState): boolean {
  return state === "AUTO_VERIFIED" || state === "MANUAL_VERIFIED" || state === "NOT_APPLICABLE";
}

function isUnresolvedResearchState(state: ResearchChecklistState): boolean {
  return state === "MISSING_DATA" || state === "OPEN_EXTERNAL_TOOL";
}

function contextualResearchTools(step: ResearchChecklistStep): Array<ResearchChecklistItem & { manual_external_tool: ManualResearchTool }> {
  return step.items.filter(isManualExternalResearchItem);
}

function meaningfulTechnicalItems(step: ResearchChecklistStep): ResearchChecklistItem[] {
  return step.items.filter((item) => !isManualExternalResearchItem(item) && isMeaningfulResearchItem(item));
}

function unavailableTechnicalItems(step: ResearchChecklistStep): ResearchChecklistItem[] {
  return step.items.filter((item) => !isManualExternalResearchItem(item) && !isMeaningfulResearchItem(item));
}

function isMeaningfulResearchItem(item: ResearchChecklistItem): boolean {
  if (item.manual_evidence) return true;
  if (item.state === "AUTO_VERIFIED" || item.state === "MANUAL_VERIFIED" || item.state === "RED_FLAG") return true;
  if (item.state === "NOT_APPLICABLE") return hasRealResearchValue(item);
  return hasRealResearchValue(item);
}

function hasRealResearchValue(item: ResearchChecklistItem): boolean {
  if (item.value_number != null) return true;
  if (!item.value_text) return false;
  return !["unknown", "null", "undefined", "missing_data", "open_external_tool", "auto_verified", "manual_verified", "not_applicable", "red_flag", "not calculated"].includes(item.value_text.trim().toLowerCase());
}

function simpleFocusTitle(step: ResearchStepNumber, locale: "pl" | "en"): string {
  if (step === 3) return locale === "pl" ? "Bezpieczeństwo" : "Security";
  if (step === 4) return locale === "pl" ? "On-chain" : "On-chain";
  return stepName(step, locale);
}

function simpleResearchStatus(view: ResearchChecklistView, step: ResearchChecklistStep, items: ResearchChecklistItem[], locale: "pl" | "en"): string {
  if (step.number === 7) return derivedReadinessText(view, locale);
  if (items.some((item) => item.state === "RED_FLAG")) return locale === "pl" ? "Research wymaga uwagi" : "Research needs attention";
  if (step.state === "MISSING_DATA" || step.state === "OPEN_EXTERNAL_TOOL") return researchIncompleteName(locale);
  const completed = items.filter((item) => isSimpleChecked(item.state)).length;
  if (items.length > 0 && completed === items.length) return locale === "pl"
    ? `${completed}/${items.length} kontrole wykonane`
    : `${completed}/${items.length} checks completed`;
  return locale === "pl" ? "Research niekompletny" : "Research incomplete";
}

function ResearchUnavailableState({ step, view, items, locale }: {
  step: ResearchChecklistStep;
  view?: ResearchChecklistView;
  items: ResearchChecklistItem[];
  locale: "pl" | "en";
}) {
  const pl = locale === "pl";
  const technicalItems = meaningfulTechnicalItems(step);
  if (step.number === 7) return <ResearchDerivedReadiness view={view} locale={locale} />;
  if (step.number === 5 && technicalItems.length === 0) return <p className="research-empty-step-state" data-research-social-unavailable>{pl ? "Brak dostępnych danych społecznościowych" : "No social research data available"}</p>;
  if (step.number === 6 && technicalItems.length === 0) return <section className="research-empty-step-state" data-research-scorecard-unavailable><strong>{pl ? "Scorecard" : "Scorecard"}</strong><p>{pl ? "Brak dostępnego wyniku" : "No score is available"}</p></section>;
  if (items.length === 0) return null;
  return <section className="research-unavailable-data" data-research-unavailable-data={step.number}>
    <p>{unavailableSummary(items.length, locale)}</p>
    <details data-research-missing-fields={step.number}><summary>{pl ? `Pokaż brakujące pola (${items.length})` : `Show missing fields (${items.length})`}</summary><ul>{items.map((item) => <li key={`${step.number}:${item.key}`}>{itemName(item.key, locale)}</li>)}</ul></details>
  </section>;
}

function ResearchDerivedReadiness({ view, locale }: { view?: ResearchChecklistView; locale: "pl" | "en" }) {
  return <p className="research-derived-readiness" data-research-derived-readiness>{view ? derivedReadinessText(view, locale) : researchIncompleteName(locale)}</p>;
}

function unavailableSummary(count: number, locale: "pl" | "en"): string {
  if (locale === "en") return `Data is unavailable for ${count} additional ${count === 1 ? "check" : "checks"}`;
  return count === 1 ? "Brakuje danych dla 1 dodatkowej kontroli" : `Brakuje danych dla ${count} dodatkowych kontroli`;
}

function derivedReadinessText(view: ResearchChecklistView, locale: "pl" | "en"): string {
  if (view.readiness === "CRITICAL_RED_FLAG_PRESENT") return locale === "pl" ? "Wykryto czerwoną flagę" : "A red flag was detected";
  if (view.readiness === "EVIDENCE_COMPLETE_FOR_REVIEW") return locale === "pl" ? "Research kompletny do przeglądu" : "Research is complete for review";
  return researchIncompleteName(locale);
}

function keyToolName(tool: ManualResearchTool, locale: "pl" | "en"): string {
  const names: Record<ManualResearchTool, [string, string]> = {
    honeypot: ["Honeypot", "Honeypot"],
    tokensniffer: ["TokenSniffer", "TokenSniffer"],
    defi_scanner: ["De.Fi Scanner", "De.Fi Scanner"],
    bubblemaps: ["Bubblemaps", "Bubblemaps"],
  };
  return names[tool][locale === "pl" ? 0 : 1];
}

function simpleToolStatus(item: ResearchChecklistItem & { manual_external_tool: ManualResearchTool }, candidate: UiTokenCandidate, locale: "pl" | "en"): string {
  const target = resolveManualResearchTarget(item.manual_external_tool, { chain: candidate.chain, contractAddress: candidate.contractAddress });
  if (target.availability === "UNSUPPORTED_CHAIN" || target.availability === "UNAVAILABLE") return locale === "pl" ? "Niedostępne dla tej sieci" : "Unavailable for this network";
  if (item.manual_evidence?.value_text) return researchEvidencePresentationText(item.manual_evidence.value_text, locale, item.manual_evidence.source_tool);
  if (item.state === "RED_FLAG") return locale === "pl" ? "Czerwona flaga" : "Red flag";
  if (isSimpleChecked(item.state)) return locale === "pl" ? "Sprawdzone" : "Checked";
  return locale === "pl" ? "Do sprawdzenia" : "To check";
}

function isManualExternalResearchItem(item: ResearchChecklistItem): item is ResearchChecklistItem & { manual_external_tool: ManualResearchTool } {
  return item.manual_external_tool !== null;
}

function ManualExternalResearchWorkflow({ item, candidate, writable, locale, onSaved, compact = false }: {
  item: ResearchChecklistItem & { manual_external_tool: ManualResearchTool };
  candidate: UiTokenCandidate;
  writable: boolean;
  locale: "pl" | "en";
  onSaved: () => Promise<void>;
  compact?: boolean;
}) {
  const pl = locale === "pl";
  const tool = item.manual_external_tool;
  const detail = MANUAL_TOOL_DETAILS[tool];
  const target = resolveManualResearchTarget(tool, { chain: candidate.chain, contractAddress: candidate.contractAddress });
  const evidence = item.manual_evidence;
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const copyAddress = async () => {
    try {
      if (!target.copy_value || !navigator.clipboard) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(target.copy_value);
      setCopied(true);
    } catch { setError(pl ? "Nie udało się skopiować adresu." : "The address could not be copied."); }
  };
  const canRecord = target.availability !== "UNSUPPORTED_CHAIN" && target.availability !== "UNAVAILABLE";
  const manualSearch = target.availability === "MANUAL_SEARCH";
  return <section className={`research-external-tool${compact ? " compact" : ""}`} data-manual-research-tool={tool}>
    {!compact && <strong>{detail.title[pl ? 0 : 1]}</strong>}
    {manualSearch && target.copy_value && <button type="button" className="research-copy-address" onClick={() => void copyAddress()}>{copied ? (pl ? "Skopiowano CA" : "CA copied") : (pl ? "Kopiuj CA" : "Copy CA")}</button>}
    {target.official_url && <a className="research-external-open-action" href={target.official_url} target="_blank" rel="noopener noreferrer">{detail.open[pl ? 0 : 1]} <span aria-hidden="true">↗</span></a>}
    {manualSearch && <p>{manualSearchHelper(tool, locale)}</p>}
    {target.availability === "UNSUPPORTED_CHAIN" && <p>{tool === "honeypot"
      ? (pl ? "Honeypot.is nie obsługuje tej sieci." : "Honeypot.is does not support this network.")
      : (pl ? "To narzędzie nie obsługuje tej sieci." : "This tool does not support this network.")}</p>}
    {canRecord && <ActionButton variant="secondary" onClick={() => setExpanded((current) => !current)}>{expanded ? (pl ? "Zamknij" : "Close") : evidence ? (pl ? "Edytuj wynik" : "Edit result") : (pl ? "Dodaj wynik" : "Add result")}</ActionButton>}
    {expanded && <ManualExternalResearchForm tool={tool} item={item} candidate={candidate} evidence={evidence} writable={writable} locale={locale} onSaved={async () => { setExpanded(false); await onSaved(); }} onError={setError} />}
    {error && <p role="alert">{error}</p>}
  </section>;
}

function ManualExternalResearchForm({ tool, item, candidate, evidence, writable, locale, onSaved, onError }: {
  tool: ManualResearchTool;
  item: ResearchChecklistItem;
  candidate: UiTokenCandidate;
  evidence: ResearchChecklistItem["manual_evidence"];
  writable: boolean;
  locale: "pl" | "en";
  onSaved: () => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const pl = locale === "pl";
  const [result, setResult] = useState(normalizeManualResult(tool, evidence?.value_text));
  const [score, setScore] = useState(evidence?.value_number?.toString() ?? "");
  const [valueText, setValueText] = useState(tool === "defi_scanner" ? evidence?.value_text ?? "" : "");
  const [valueNumber, setValueNumber] = useState(tool === "defi_scanner" && evidence?.value_number != null ? String(evidence.value_number) : "");
  const [note, setNote] = useState(evidence?.note ?? "");
  const [evidenceUrl, setEvidenceUrl] = useState(evidence?.evidence_url ?? "");
  const [observedAt, setObservedAt] = useState(evidence?.observed_at ? evidence.observed_at.slice(0, 16) : "");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    onError(null);
    const sourceTool = MANUAL_TOOL_DETAILS[tool].sourceTool;
    let manualState: PersistedManualResearchState;
    let savedValueText: string | null = null;
    let savedValueNumber: number | null = null;
    if (tool === "tokensniffer") {
      const numericScore = Number(score);
      if (!Number.isFinite(numericScore) || numericScore < 0 || numericScore > 100) {
        onError(pl ? "Wynik TokenSniffer musi mieć wartość od 0 do 100." : "The TokenSniffer score must be from 0 to 100.");
        return;
      }
      manualState = numericScore < 50 ? "RED_FLAG" : "MANUAL_VERIFIED";
      savedValueNumber = numericScore;
    } else if (tool === "defi_scanner") {
      const parsedNumber = valueNumber.trim() ? Number(valueNumber) : null;
      if (parsedNumber !== null && !Number.isFinite(parsedNumber)) { onError(pl ? "Wynik liczbowy musi być prawidłowy." : "The numeric result must be valid."); return; }
      manualState = result as PersistedManualResearchState;
      savedValueText = valueText.trim() || null;
      savedValueNumber = parsedNumber;
    } else {
      const mapped = manualResultState(tool, result);
      if (!mapped) { onError(pl ? "Wybierz wynik." : "Choose a result."); return; }
      manualState = mapped;
      savedValueText = result;
    }
    setSaving(true);
    const saved = await saveResearchEvidence({
      chain: candidate.chain,
      contractAddress: candidate.contractAddress,
      stepNumber: item.step_number,
      itemKey: item.key,
      manualState,
      valueText: savedValueText,
      valueNumber: savedValueNumber,
      note: note || null,
      sourceTool,
      evidenceUrl: evidenceUrl || null,
      observedAt: observedAt ? new Date(observedAt).toISOString() : null,
    });
    setSaving(false);
    if (!saved) { onError(pl ? "Nie zapisano wyniku. Sprawdź pola i spróbuj ponownie." : "The result was not saved. Check the fields and try again."); return; }
    await onSaved();
  };
  return <div className="research-manual-form research-external-result-form">
    {tool === "honeypot" && <label><span>{pl ? "Wynik" : "Result"}</span><select value={result} disabled={!writable} onChange={(event) => setResult(event.target.value)}><option value="low_honeypot_risk">{pl ? "Niskie ryzyko honeypota" : "Low honeypot risk"}</option><option value="honeypot_detected">{pl ? "Honeypot wykryty" : "Honeypot detected"}</option><option value="no_conclusive_result">{pl ? "Brak jednoznacznego wyniku" : "No conclusive result"}</option></select></label>}
    {tool === "tokensniffer" && <label><span>{pl ? "Ręcznie zapisany wynik TokenSniffer (0–100)" : "Manually recorded TokenSniffer score (0–100)"}</span><input type="number" min="0" max="100" step="1" value={score} disabled={!writable} onChange={(event) => setScore(event.target.value)} /></label>}
    {tool === "defi_scanner" && <><label><span>{pl ? "Stan ręczny" : "Manual state"}</span><select value={result} disabled={!writable} onChange={(event) => setResult(event.target.value)}><option value="MANUAL_VERIFIED">{pl ? "Sprawdzone ręcznie" : "Manually checked"}</option><option value="RED_FLAG">{pl ? "Czerwona flaga" : "Red flag"}</option><option value="MISSING_DATA">{pl ? "Brak danych" : "Missing data"}</option><option value="NOT_APPLICABLE">{pl ? "Nie dotyczy" : "Not applicable"}</option></select></label><label><span>{pl ? "Wynik tekstowy (opcjonalnie)" : "Text result (optional)"}</span><input value={valueText} disabled={!writable} maxLength={1000} onChange={(event) => setValueText(event.target.value)} /></label><label><span>{pl ? "Wynik liczbowy (opcjonalnie)" : "Numeric result (optional)"}</span><input type="number" value={valueNumber} disabled={!writable} onChange={(event) => setValueNumber(event.target.value)} /></label></>}
    {tool === "bubblemaps" && <label><span>{pl ? "Wynik klastra" : "Cluster result"}</span><select value={result} disabled={!writable} onChange={(event) => setResult(event.target.value)}><option value="no_material_cluster">{pl ? "Brak istotnego klastra" : "No material cluster"}</option><option value="needs_attention">{pl ? "Wymaga uwagi" : "Needs attention"}</option><option value="strong_concentration_or_related_cluster">{pl ? "Silna koncentracja / powiązany klaster" : "Strong concentration / related cluster"}</option><option value="no_data">{pl ? "Brak danych" : "No data"}</option></select></label>}
    {tool === "bubblemaps" && result === "needs_attention" && <p className="research-manual-advisory">{pl ? "To ustalenie wymaga dalszej ręcznej oceny; nie stanowi werdyktu inwestycyjnego." : "This finding needs further manual assessment; it is not an investment verdict."}</p>}
    <label><span>{pl ? "Krótka notatka" : "Short note"}</span><textarea value={note} disabled={!writable} maxLength={1000} rows={2} onChange={(event) => setNote(event.target.value)} /></label>
    <label><span>{pl ? "URL dowodu" : "Evidence URL"}</span><input type="url" value={evidenceUrl} disabled={!writable} maxLength={2048} placeholder="https://" onChange={(event) => setEvidenceUrl(event.target.value)} /></label>
    <label><span>{pl ? "Zaobserwowano" : "Observed at"}</span><input type="datetime-local" value={observedAt} disabled={!writable} onChange={(event) => setObservedAt(event.target.value)} /></label>
    <small>{pl ? `Prywatny wpis • Źródło: ${MANUAL_TOOL_DETAILS[tool].sourceTool}` : `Private entry • Source: ${MANUAL_TOOL_DETAILS[tool].sourceTool}`}</small>
    {writable && <div className="research-manual-actions"><ActionButton variant="primary" loading={saving} onClick={() => void save()}>{pl ? "Zapisz wynik" : "Save result"}</ActionButton></div>}
  </div>;
}

function defaultManualResult(tool: ManualResearchTool): string {
  if (tool === "honeypot") return "low_honeypot_risk";
  if (tool === "bubblemaps") return "no_material_cluster";
  if (tool === "defi_scanner") return "MANUAL_VERIFIED";
  return "";
}

function manualResultState(tool: ManualResearchTool, value: string): PersistedManualResearchState | null {
  const states: Partial<Record<ManualResearchTool, Record<string, PersistedManualResearchState>>> = {
    honeypot: { low_honeypot_risk: "MANUAL_VERIFIED", honeypot_detected: "RED_FLAG", no_conclusive_result: "MISSING_DATA", no_honeypot: "MANUAL_VERIFIED", could_not_confirm: "MISSING_DATA" },
    bubblemaps: { no_material_cluster: "MANUAL_VERIFIED", needs_attention: "MANUAL_VERIFIED", strong_concentration_or_related_cluster: "RED_FLAG", no_data: "MISSING_DATA" },
  };
  return states[tool]?.[value] ?? null;
}

function normalizeManualResult(tool: ManualResearchTool, value: string | null | undefined): string {
  if (tool === "honeypot" && value === "no_honeypot") return "low_honeypot_risk";
  if (tool === "honeypot" && value === "could_not_confirm") return "no_conclusive_result";
  return value ?? defaultManualResult(tool);
}

function manualSearchHelper(tool: ManualResearchTool, locale: "pl" | "en"): string {
  if (tool === "tokensniffer") return locale === "pl"
    ? "Wklej skopiowany adres w polu wyszukiwania TokenSniffer."
    : "Paste the copied address into TokenSniffer search.";
  if (tool === "defi_scanner") return locale === "pl"
    ? "Wklej skopiowany adres w wyszukiwarce De.Fi Scanner."
    : "Paste the copied address into De.Fi Scanner search.";
  return locale === "pl"
    ? "Wklej skopiowany adres w wyszukiwarce Bubblemaps i wybierz właściwą sieć."
    : "Paste the copied address into Bubblemaps search and select the correct network.";
}

const PC3C_MANUAL_EVIDENCE_KEYS = new Set<ResearchChecklistItemKey>([
  "holder_count",
  "developer_wallet",
  "liquidity_lock_end_date",
  "volume_quality",
]);

function isPc3cManualEvidenceItem(item: ResearchChecklistItem): boolean {
  return item.step_number === 4 && PC3C_MANUAL_EVIDENCE_KEYS.has(item.key);
}

function OnchainManualEvidenceSection({ items, candidate, writable, locale, onSaved }: {
  items: ResearchChecklistItem[];
  candidate: UiTokenCandidate;
  writable: boolean;
  locale: "pl" | "en";
  onSaved: () => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  if (items.length === 0) return null;
  const pl = locale === "pl";
  return <section className="research-onchain-manual-evidence" data-pc3c-onchain-manual data-expanded={expanded ? "true" : "false"}>
    <button type="button" className="research-onchain-manual-toggle" onClick={() => setExpanded((current) => !current)} aria-expanded={expanded}><span>{pl ? "Dodaj wynik ręczny" : "Add manual finding"}</span><b>{expanded ? (pl ? "Ukryj" : "Hide") : (pl ? "Opcjonalnie" : "Optional")}</b></button>
    {expanded && <div className="research-onchain-manual-content"><p>{pl ? "Prywatne ustalenia są widoczne tylko w Twoim workspace i nie zmieniają Radaru, lifecycle ani wspólnej migawki." : "Private findings are visible only in your workspace and never change Radar, lifecycle, or the shared snapshot."}</p>{items.map((item) => <OnchainManualEvidenceEditor key={`${item.step_number}:${item.key}`} item={item} candidate={candidate} writable={writable} locale={locale} onSaved={onSaved} />)}</div>}
  </section>;
}

function OnchainManualEvidenceEditor({ item, candidate, writable, locale, onSaved }: {
  item: ResearchChecklistItem;
  candidate: UiTokenCandidate;
  writable: boolean;
  locale: "pl" | "en";
  onSaved: () => Promise<void>;
}) {
  const pl = locale === "pl";
  const evidence = item.manual_evidence;
  const [expanded, setExpanded] = useState(Boolean(evidence));
  const [holderCount, setHolderCount] = useState(item.key === "holder_count" && evidence?.value_number != null ? String(evidence.value_number) : "");
  const [wallet, setWallet] = useState(item.key === "developer_wallet" ? evidence?.value_text ?? "" : "");
  const [percentage, setPercentage] = useState(item.key === "developer_wallet" && evidence?.value_number != null ? String(evidence.value_number) : "");
  const [lockContext, setLockContext] = useState(developerLockContext(evidence?.source_tool));
  const [lockEndDate, setLockEndDate] = useState(item.key === "liquidity_lock_end_date" ? evidence?.value_text ?? "" : "");
  const [volumeQuality, setVolumeQuality] = useState(item.key === "volume_quality" ? evidence?.value_text ?? "missing" : "missing");
  const [note, setNote] = useState(evidence?.note ?? "");
  const [evidenceUrl, setEvidenceUrl] = useState(evidence?.evidence_url ?? "");
  const [observedAt, setObservedAt] = useState(evidence?.observed_at ? evidence.observed_at.slice(0, 16) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!writable) return;
    setError(null);
    const prepared = preparePc3cManualEvidence(item.key, { holderCount, wallet, percentage, lockContext, lockEndDate, volumeQuality }, locale);
    if (!prepared.ok) { setError(prepared.error); return; }
    setSaving(true);
    const saved = await saveResearchEvidence({
      chain: candidate.chain,
      contractAddress: candidate.contractAddress,
      stepNumber: 4,
      itemKey: item.key,
      manualState: prepared.manualState,
      valueText: prepared.valueText,
      valueNumber: prepared.valueNumber,
      note: note || null,
      sourceTool: prepared.sourceTool,
      evidenceUrl: evidenceUrl || null,
      observedAt: observedAt ? new Date(observedAt).toISOString() : null,
    });
    setSaving(false);
    if (!saved) { setError(pl ? "Nie zapisano wyniku. Sprawdź pola i spróbuj ponownie." : "The result was not saved. Check the fields and try again."); return; }
    setExpanded(false);
    await onSaved();
  };

  const remove = async () => {
    if (!writable) return;
    setSaving(true); setError(null);
    const deleted = await deleteResearchEvidence({ chain: candidate.chain, contractAddress: candidate.contractAddress, stepNumber: 4, itemKey: item.key });
    setSaving(false);
    if (!deleted) { setError(pl ? "Nie usunięto wpisu." : "The entry was not deleted."); return; }
    setExpanded(false);
    await onSaved();
  };

  return <article className="research-manual-editor research-onchain-manual-editor" data-pc3c-manual-item={item.key}>
    <div className="research-manual-editor-heading"><div><strong>{itemName(item.key, locale)}</strong><ResearchStateBadge state={item.state} compact /></div><ActionButton variant="secondary" onClick={() => setExpanded((current) => !current)}>{expanded ? (pl ? "Zamknij" : "Close") : evidence ? (pl ? "Edytuj wynik" : "Edit result") : (pl ? "Dodaj wynik ręczny" : "Add manual finding")}</ActionButton></div>
    {expanded && <div className="research-manual-form">
      {item.key === "holder_count" && <label><span>{pl ? "Liczba holderów" : "Holder count"}</span><input type="number" min="0" step="1" value={holderCount} disabled={!writable} onChange={(event) => setHolderCount(event.target.value)} /></label>}
      {item.key === "developer_wallet" && <><label><span>{pl ? "Adres / identyfikator portfela dewelopera" : "Developer wallet address / identifier"}</span><input value={wallet} maxLength={128} disabled={!writable} onChange={(event) => setWallet(event.target.value)} /></label><label><span>{pl ? "Udział portfela (%)" : "Wallet share (%)"}</span><input type="number" min="0" max="100" step="0.01" value={percentage} disabled={!writable} onChange={(event) => setPercentage(event.target.value)} /></label><label><span>{pl ? "Kontekst blokady" : "Lock context"}</span><select value={lockContext} disabled={!writable} onChange={(event) => setLockContext(event.target.value as DeveloperLockContext)}><option value="locked">{pl ? "Zablokowany" : "Locked"}</option><option value="unlocked">{pl ? "Niezablokowany" : "Unlocked"}</option><option value="unknown">{pl ? "Nieznany" : "Unknown"}</option></select></label><small>{pl ? ">10% i niezablokowany portfel = czerwona flaga. Nieznany kontekst blokady nie jest pozytywnym wynikiem." : ">10% with an unlocked wallet is a red flag. Unknown lock context is not a positive result."}</small></>}
      {item.key === "liquidity_lock_end_date" && <label><span>{pl ? "Data końca blokady" : "Liquidity lock end date"}</span><input type="date" value={lockEndDate} disabled={!writable} onChange={(event) => setLockEndDate(event.target.value)} /></label>}
      {item.key === "volume_quality" && <label><span>{pl ? "Wynik jakości wolumenu" : "Volume-quality finding"}</span><select value={volumeQuality} disabled={!writable} onChange={(event) => setVolumeQuality(event.target.value)}><option value="natural">{pl ? "Naturalny / bez oczywistych anomalii" : "Natural / no obvious anomalies"}</option><option value="requires_attention">{pl ? "Wymaga uwagi" : "Requires attention"}</option><option value="suspicious">{pl ? "Podejrzany / nienaturalny" : "Suspicious / unnatural"}</option><option value="missing">{pl ? "Brak danych" : "Missing data"}</option></select></label>}
      <label><span>{pl ? "Krótka notatka" : "Short note"}</span><textarea value={note} disabled={!writable} maxLength={1000} rows={2} onChange={(event) => setNote(event.target.value)} /></label>
      <label><span>{pl ? "URL dowodu" : "Evidence URL"}</span><input type="url" value={evidenceUrl} disabled={!writable} maxLength={2048} placeholder="https://" onChange={(event) => setEvidenceUrl(event.target.value)} /></label>
      <label><span>{pl ? "Zaobserwowano" : "Observed at"}</span><input type="datetime-local" value={observedAt} disabled={!writable} onChange={(event) => setObservedAt(event.target.value)} /></label>
      {writable && <div className="research-manual-actions"><ActionButton variant="primary" loading={saving} onClick={() => void save()}>{pl ? "Zapisz wynik" : "Save result"}</ActionButton>{evidence && <ActionButton variant="secondary" loading={saving} onClick={() => void remove()}>{pl ? "Usuń" : "Delete"}</ActionButton>}</div>}
      {error && <p role="alert">{error}</p>}
    </div>}
  </article>;
}

type DeveloperLockContext = "locked" | "unlocked" | "unknown";

function developerLockContext(sourceTool: string | null | undefined): DeveloperLockContext {
  if (sourceTool === "Manual developer wallet (locked)") return "locked";
  if (sourceTool === "Manual developer wallet (unlocked)") return "unlocked";
  return "unknown";
}

function preparePc3cManualEvidence(key: ResearchChecklistItemKey, input: {
  holderCount: string;
  wallet: string;
  percentage: string;
  lockContext: DeveloperLockContext;
  lockEndDate: string;
  volumeQuality: string;
}, locale: "pl" | "en"): { ok: true; manualState: PersistedManualResearchState; valueText: string | null; valueNumber: number | null; sourceTool: string } | { ok: false; error: string } {
  const error = (pl: string, en: string) => ({ ok: false as const, error: locale === "pl" ? pl : en });
  if (key === "holder_count") {
    const value = Number(input.holderCount);
    if (!Number.isSafeInteger(value) || value < 0) return error("Liczba holderów musi być liczbą całkowitą 0 lub większą.", "Holder count must be an integer greater than or equal to 0.");
    return { ok: true, manualState: "MANUAL_VERIFIED", valueText: null, valueNumber: value, sourceTool: "Manual holder research" };
  }
  if (key === "developer_wallet") {
    const value = Number(input.percentage);
    const wallet = input.wallet.trim();
    if (!wallet || wallet.length > 128 || !Number.isFinite(value) || value < 0 || value > 100) return error("Podaj portfel i udział od 0 do 100%.", "Provide a wallet and a share from 0 to 100%.");
    return { ok: true, manualState: value > 10 && input.lockContext === "unlocked" ? "RED_FLAG" : "MANUAL_VERIFIED", valueText: wallet, valueNumber: value, sourceTool: `Manual developer wallet (${input.lockContext})` };
  }
  if (key === "liquidity_lock_end_date") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.lockEndDate) || !Number.isFinite(Date.parse(`${input.lockEndDate}T00:00:00.000Z`))) return error("Podaj prawidłową datę końca blokady.", "Provide a valid lock end date.");
    return { ok: true, manualState: "MANUAL_VERIFIED", valueText: input.lockEndDate, valueNumber: null, sourceTool: "Manual liquidity lock research" };
  }
  if (key === "volume_quality") {
    const states: Record<string, PersistedManualResearchState> = { natural: "MANUAL_VERIFIED", requires_attention: "MANUAL_VERIFIED", suspicious: "RED_FLAG", missing: "MISSING_DATA" };
    const manualState = states[input.volumeQuality];
    if (!manualState) return error("Wybierz prawidłowy wynik jakości wolumenu.", "Choose a valid volume-quality finding.");
    return { ok: true, manualState, valueText: input.volumeQuality, valueNumber: null, sourceTool: "Manual volume-quality research" };
  }
  return error("Ta pozycja nie obsługuje ręcznego wyniku on-chain.", "This item does not support a manual on-chain finding.");
}

function ManualEvidenceEditor({ item, candidate, writable, locale, onSaved }: { item: ResearchChecklistItem; candidate: UiTokenCandidate; writable: boolean; locale: "pl" | "en"; onSaved: () => Promise<void> }) {
  const pl = locale === "pl";
  const evidence = item.manual_evidence;
  const [expanded, setExpanded] = useState(Boolean(evidence));
  const [state, setState] = useState<PersistedManualResearchState>(evidence?.manual_state ?? "MANUAL_VERIFIED");
  const [valueText, setValueText] = useState(evidence?.value_text ?? "");
  const [note, setNote] = useState(evidence?.note ?? "");
  const [sourceTool, setSourceTool] = useState(evidence?.source_tool ?? "");
  const [evidenceUrl, setEvidenceUrl] = useState(evidence?.evidence_url ?? "");
  const [observedAt, setObservedAt] = useState(evidence?.observed_at ? evidence.observed_at.slice(0, 16) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const save = async () => {
    if (!writable) return;
    setSaving(true); setError(false);
    const saved = await saveResearchEvidence({ chain: candidate.chain, contractAddress: candidate.contractAddress, stepNumber: item.step_number, itemKey: item.key, manualState: state, valueText: valueText || null, valueNumber: null, note: note || null, sourceTool: sourceTool || null, evidenceUrl: evidenceUrl || null, observedAt: observedAt ? new Date(observedAt).toISOString() : null });
    setSaving(false);
    if (!saved) { setError(true); return; }
    await onSaved();
  };
  const remove = async () => { if (!writable) return; setSaving(true); setError(false); const deleted = await deleteResearchEvidence({ chain: candidate.chain, contractAddress: candidate.contractAddress, stepNumber: item.step_number, itemKey: item.key }); setSaving(false); if (!deleted) { setError(true); return; } setExpanded(false); await onSaved(); };
  return <article className="research-manual-editor"><div className="research-manual-editor-heading"><div><strong>{itemName(item.key, locale)}</strong><ResearchStateBadge state={item.state} compact /></div><ActionButton variant="secondary" onClick={() => setExpanded((current) => !current)}>{expanded ? (pl ? "Zamknij" : "Close") : evidence ? (pl ? "Edytuj" : "Edit") : (pl ? "Dodaj wpis" : "Add entry")}</ActionButton></div>{expanded && <div className="research-manual-form"><label><span>{pl ? "Wynik" : "Result"}</span><select value={state} disabled={!writable} onChange={(event) => setState(event.target.value as PersistedManualResearchState)}><option value="MANUAL_VERIFIED">{pl ? "Sprawdzone ręcznie" : "Manually checked"}</option><option value="RED_FLAG">{pl ? "Czerwona flaga" : "Red flag"}</option><option value="MISSING_DATA">{pl ? "Brak danych" : "Missing data"}</option><option value="NOT_APPLICABLE">{pl ? "Nie dotyczy" : "Not applicable"}</option></select></label><label><span>{pl ? "Wartość" : "Value"}</span><input value={valueText} disabled={!writable} maxLength={1000} onChange={(event) => setValueText(event.target.value)} /></label><label><span>{pl ? "Krótka notatka" : "Short note"}</span><textarea value={note} disabled={!writable} maxLength={1000} rows={2} onChange={(event) => setNote(event.target.value)} /></label><label><span>{pl ? "Narzędzie / źródło" : "Tool / source"}</span><input value={sourceTool} disabled={!writable} maxLength={120} onChange={(event) => setSourceTool(event.target.value)} /></label><label><span>{pl ? "URL dowodu" : "Evidence URL"}</span><input type="url" value={evidenceUrl} disabled={!writable} maxLength={2048} placeholder="https://" onChange={(event) => setEvidenceUrl(event.target.value)} /></label><label><span>{pl ? "Zaobserwowano" : "Observed at"}</span><input type="datetime-local" value={observedAt} disabled={!writable} onChange={(event) => setObservedAt(event.target.value)} /></label>{writable && <div className="research-manual-actions"><ActionButton variant="primary" loading={saving} onClick={() => void save()}>{pl ? "Zapisz wpis" : "Save entry"}</ActionButton>{evidence && <ActionButton variant="secondary" loading={saving} onClick={() => void remove()}>{pl ? "Usuń" : "Delete"}</ActionButton>}</div>}{error && <p role="alert">{pl ? "Nie zapisano wpisu. Sprawdź adres URL i spróbuj ponownie." : "The entry was not saved. Check the URL and try again."}</p>}</div>}</article>;
}

function ResearchStateBadge({ state, compact = false, labelOverride }: { state: ResearchChecklistState; compact?: boolean; labelOverride?: string }) {
  const { locale } = useProductLocale();
  return <span className={`research-state ${state.toLowerCase()} ${compact ? "compact" : ""}`}>{labelOverride ?? STATUS_NAMES[state][locale === "pl" ? 0 : 1]}</span>;
}

function itemName(key: string, locale: "pl" | "en"): string { return (ITEM_NAMES[key] ?? [key, key])[locale === "pl" ? 0 : 1]; }
function stepName(step: number, locale: "pl" | "en"): string { return STEP_NAMES[locale][step - 1] ?? String(step); }
function handleResearchStepKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, step: ResearchStepNumber, onOpenStep?: (step: ResearchStepNumber) => void) {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  onOpenStep?.(step);
}
function openStepLabel(step: ResearchStepNumber, locale: "pl" | "en"): string { return locale === "pl" ? `Otwórz szczegóły kroku ${step}: ${stepName(step, locale)}` : `Open step ${step} details: ${stepName(step, locale)}`; }
function researchIncompleteName(locale: "pl" | "en"): string { return locale === "pl" ? "Research niekompletny" : "Research incomplete"; }
function isIncompleteFinalStep(step: { number: ResearchStepNumber; state: ResearchChecklistState }): boolean { return step.number === 7 && step.state === "MISSING_DATA"; }
function readinessText(view: ResearchChecklistView, locale: "pl" | "en"): string {
  if (view.steps[6]?.state === "MISSING_DATA") return locale === "pl" ? "Research jest niekompletny. Czerwone flagi pozostają widoczne przy odpowiednich kontrolach." : "Research is incomplete. Red flags remain visible on the relevant checks.";
  if (view.readiness === "CRITICAL_RED_FLAG_PRESENT") return locale === "pl" ? "Wykryto czerwoną flagę. To nie jest rekomendacja inwestycyjna." : "A red flag is recorded. This is not investment advice.";
  if (view.readiness === "EVIDENCE_COMPLETE_FOR_REVIEW") return locale === "pl" ? "Dowody są kompletne do przeglądu użytkownika lub ownera." : "Evidence is complete enough for user or owner review.";
  if (view.readiness === "MANUAL_VERIFICATION_REQUIRED") return locale === "pl" ? "Wymagana jest ręczna weryfikacja." : "Manual verification is required.";
  return locale === "pl" ? "Research jest niekompletny." : "Research is incomplete.";
}
function methodologyThreshold(value: string, locale: "pl" | "en"): string {
  if (locale === "en") return value;
  const translations: Record<string, string> = {
    required: "wymagane",
    "must be locked": "płynność musi być zablokowana",
    "preferred <40%": "Preferowane: <40%",
    "not calculated": "nie obliczono",
  };
  return translations[value.trim().toLowerCase()] ?? value;
}
function statusName(state: ResearchChecklistState, locale: "pl" | "en"): string {
  return STATUS_NAMES[state][locale === "pl" ? 0 : 1];
}
function automaticProvenanceText(source: "DexScreener" | "GoPlus", snapshotAt: string | null, locale: "pl" | "en"): string {
  if (!snapshotAt || Number.isNaN(Date.parse(snapshotAt))) return locale === "pl" ? `Źródło automatyczne: ${source}` : `Automatic source: ${source}`;
  const timestamp = new Intl.DateTimeFormat(locale === "pl" ? "pl-PL" : "en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(snapshotAt));
  return locale === "pl" ? `Źródło automatyczne: ${source} · migawka ${timestamp} UTC` : `Automatic source: ${source} · snapshot ${timestamp} UTC`;
}
