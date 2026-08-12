import React, { useCallback, useEffect, useMemo, useState } from "react";
import { formatProductUsd, useProductLocale } from "../productI18n";
import { resolveResearchChecklist } from "../researchChecklistResolver";
import {
  type PersistedManualResearchState,
  type ResearchChecklistItem,
  type ResearchChecklistStep,
  type ResearchChecklistState,
  type ResearchChecklistView,
  type ResearchStepNumber,
} from "../researchChecklistTypes";
import {
  deleteResearchEvidence,
  loadResearchChecklist,
  saveResearchEvidence,
} from "../services/researchChecklistDataSource";
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
  const view = useResearchChecklist(candidate);
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
      <FocusedResearchStep step={selectedStep} locale={locale} />
    </section>;
  }
  return <section className="research-checklist-detail" aria-label={pl ? "7-stopniowa checklista researchu" : "7-step research checklist"}>
    <header className="research-checklist-heading"><div><span>{pl ? "RESEARCH PLAYBOOK" : "RESEARCH PLAYBOOK"}</span><h3>{pl ? `Aktualny krok ${view.current_step}/7: ${stepName(view.current_step, locale)}` : `Current step ${view.current_step}/7: ${stepName(view.current_step, locale)}`}</h3><p>{readinessText(view, locale)}</p></div><ResearchProgress view={view} /></header>
    <div className="research-checklist-steps">{view.steps.map((step) => <ResearchStepCard key={step.number} step={step} locale={locale} />)}</div>
  </section>;
}

function ResearchStepCard({
  step,
  locale,
  focused = false,
  children,
}: {
  step: ResearchChecklistStep;
  locale: "pl" | "en";
  focused?: boolean;
  children?: React.ReactNode;
}) {
  const pl = locale === "pl";
  return <section id={`research-checklist-step-${step.number}`} tabIndex={focused ? -1 : undefined} data-research-step={step.number} data-research-focused={focused ? "true" : undefined} className={`research-checklist-step ${focused ? "focused" : ""}`}>
    <header><div><span>{pl ? `KROK ${step.number}` : `STEP ${step.number}`}</span><h4>{stepName(step.number, locale)}</h4></div><ResearchStateBadge state={step.state} labelOverride={isIncompleteFinalStep(step) ? researchIncompleteName(locale) : undefined} /></header>
    {children ?? <div className="research-checklist-items">{step.items.map((item) => <ResearchItem key={`${step.number}:${item.key}`} item={item} locale={locale} incompleteResearch={isIncompleteFinalStep(step)} />)}</div>}
  </section>;
}

function FocusedResearchStep({ step, locale }: { step: ResearchChecklistStep; locale: "pl" | "en" }) {
  const pl = locale === "pl";
  const [missingExpanded, setMissingExpanded] = useState(false);
  const redFlags = step.items.filter((item) => item.state === "RED_FLAG");
  const verified = step.items.filter((item) => item.state === "AUTO_VERIFIED" || item.state === "MANUAL_VERIFIED" || item.state === "NOT_APPLICABLE");
  const incomplete = step.items.filter((item) => item.state === "MISSING_DATA" || item.state === "OPEN_EXTERNAL_TOOL");
  return <ResearchStepCard step={step} locale={locale} focused>
    <div className="research-focused-step-summary" data-research-step-summary={step.number}>
      <span><b>{pl ? "Sprawdzone" : "Checked"}</b>{verified.length}</span>
      <span className={redFlags.length > 0 ? "has-red-flags" : ""}><b>{pl ? "Czerwone flagi" : "Red flags"}</b>{redFlags.length}</span>
      <span><b>{pl ? "Do uzupełnienia" : "To complete"}</b>{incomplete.length}</span>
    </div>
    {redFlags.length > 0 && <FocusedResearchItemGroup title={pl ? "Czerwone flagi" : "Red flags"} items={redFlags} locale={locale} tone="red-flag" />}
    {verified.length > 0 && <FocusedResearchItemGroup title={pl ? "Sprawdzone" : "Checked"} items={verified} locale={locale} tone="verified" />}
    <details className="research-focused-item-group incomplete" data-research-missing-group={step.number} open={missingExpanded} onToggle={(event) => setMissingExpanded(event.currentTarget.open)}>
      <summary><span>{pl ? `Do uzupełnienia (${incomplete.length})` : `To complete (${incomplete.length})`}</span><b>{missingExpanded ? (pl ? "Ukryj" : "Hide") : (pl ? "Pokaż" : "Show")}</b></summary>
      <div className="research-checklist-items">{incomplete.map((item) => <ResearchItem key={`${step.number}:${item.key}`} item={item} locale={locale} incompleteResearch={isIncompleteFinalStep(step)} />)}</div>
    </details>
  </ResearchStepCard>;
}

function FocusedResearchItemGroup({
  title,
  items,
  locale,
  tone,
}: {
  title: string;
  items: ResearchChecklistItem[];
  locale: "pl" | "en";
  tone: "red-flag" | "verified";
}) {
  return <section className={`research-focused-item-group ${tone}`} data-research-item-group={tone}>
    <header><strong>{title}</strong><span>{items.length}</span></header>
    {items.length > 0 && <div className="research-checklist-items">{items.map((item) => <ResearchItem key={`${item.step_number}:${item.key}`} item={item} locale={locale} />)}</div>}
  </section>;
}

export function ResearchManualEvidencePanel({ candidate }: { candidate: UiTokenCandidate }) {
  const { view, reload } = useResearchChecklistWithReload(candidate);
  const { locale } = useProductLocale();
  const pl = locale === "pl";
  const manualItems = view.steps.map((step) => ({ ...step, items: step.items.filter((item) => item.manual_allowed && (item.state === "MISSING_DATA" || item.state === "OPEN_EXTERNAL_TOOL" || item.manual_evidence)) })).filter((step) => step.items.length > 0);
  return <section className="research-manual-evidence" aria-label={pl ? "Prywatne dowody researchu" : "Private research evidence"}>
    <header><span>{pl ? "PRYWATNE DOWODY RESEARCHU" : "PRIVATE RESEARCH EVIDENCE"}</span><h3>{pl ? "Twoje ręczne ustalenia" : "Your manual findings"}</h3><p>{view.manual_evidence_writable ? (pl ? "Widoczne tylko w Twoim workspace. Nie zmieniają Radaru, lifecycle ani danych wspólnych." : "Visible only in your workspace. They never change Radar, lifecycle, or shared data.") : (pl ? "Tryb tylko do odczytu. Nie możesz zapisywać prywatnych dowodów." : "Read-only mode. You cannot save private evidence.")}</p></header>
    {manualItems.length === 0 ? <p className="research-empty">{pl ? "Brak pozycji wymagających ręcznego wpisu." : "No items currently require a manual entry."}</p> : manualItems.map((step) => <section key={step.number} className="research-manual-step"><h4>{step.number}. {stepName(step.number, locale)}</h4>{step.items.map((item) => <ManualEvidenceEditor key={`${step.number}:${item.key}`} item={item} candidate={candidate} writable={view.manual_evidence_writable} locale={locale} onSaved={reload} />)}</section>)}
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

function ResearchItem({ item, locale, incompleteResearch = false }: { item: ResearchChecklistItem; locale: "pl" | "en"; incompleteResearch?: boolean }) {
  const pl = locale === "pl";
  const manual = item.manual_evidence;
  return <article className={`research-checklist-item ${item.state.toLowerCase()}`}><div><strong>{itemName(item.key, locale)}</strong><ResearchStateBadge state={item.state} labelOverride={incompleteResearch ? researchIncompleteName(locale) : undefined} /><p>{itemValue(item, locale)}</p>{item.threshold && <small>{pl ? "Próg metodologii" : "Methodology threshold"}: {methodologyThreshold(item.threshold, locale)}</small>}</div>{manual && <div className="research-manual-note"><span>{pl ? "Prywatny wpis" : "Private entry"}</span>{manual.value_text && <p>{presentationText(manual.value_text, locale)}</p>}{manual.value_number != null && <p>{manual.value_number}</p>}{manual.note && <p>{manual.note}</p>}{manual.source_tool && <small>{pl ? "Narzędzie" : "Tool"}: {manual.source_tool}</small>}{manual.evidence_url && <a href={manual.evidence_url} target="_blank" rel="noreferrer">{pl ? "Otwórz dowód" : "Open evidence"}</a>}</div>}</article>;
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
  return locale === "pl" ? "Research jest niekompletny — brakuje zapisanych danych." : "Research is incomplete — recorded data is missing.";
}
function methodologyThreshold(value: string, locale: "pl" | "en"): string {
  if (locale === "en") return value;
  const translations: Record<string, string> = {
    required: "wymagane",
    "must be locked": "płynność musi być zablokowana",
    "not calculated": "nie obliczono",
  };
  return translations[value.trim().toLowerCase()] ?? value;
}
function itemValue(item: ResearchChecklistItem, locale: "pl" | "en"): string {
  if (item.value_number != null) {
    if (["market_cap", "volume_24h", "liquidity"].includes(item.key)) return formatProductUsd(item.value_number, locale, locale === "pl" ? "Brak danych" : "Missing data");
    if (["volume_market_cap_ratio", "liquidity_market_cap_ratio"].includes(item.key)) return `${(item.value_number * 100).toFixed(2)}%`;
    if (["pair_age", "liquidity_lock_days"].includes(item.key)) return `${item.value_number.toFixed(1)} ${locale === "pl" ? "dni" : "days"}`;
    if (["top1_wallet", "top10_wallets", "buy_tax", "sell_tax"].includes(item.key)) return `${item.value_number.toFixed(2)}%`;
    return String(item.value_number);
  }
  if (item.key === "ownership") {
    if (item.value_text === "renounced") return locale === "pl" ? "Własność zrzucona" : "Ownership renounced";
    if (item.value_text === "active") return locale === "pl" ? "Własność aktywna" : "Ownership active";
    return locale === "pl" ? "Brak danych" : "Missing data";
  }
  if (item.value_text) {
    if (isUnrecordedMachineValue(item.value_text)) return locale === "pl" ? "Brak zapisanego wyniku" : "No recorded result";
    if (item.value_text === "yes") return locale === "pl" ? "Tak" : "Yes";
    if (item.value_text === "no") return locale === "pl" ? "Nie" : "No";
    if (item.value_text === "passed") return locale === "pl" ? "Pozytywny wynik" : "Passed";
    if (item.value_text === "failed") return locale === "pl" ? "Negatywny wynik" : "Failed";
    if (item.value_text === "locked") return locale === "pl" ? "Zablokowana" : "Locked";
    if (item.value_text === "unlocked") return locale === "pl" ? "Niezablokowana" : "Unlocked";
    return item.value_text;
  }
  if (item.key.endsWith("scorecard")) return locale === "pl" ? "Nie obliczono w PC.3A" : "Not calculated in PC.3A";
  return item.state === "MISSING_DATA" ? (locale === "pl" ? "Brak zapisanych danych" : "No recorded data") : (locale === "pl" ? "Zapisana kontrola" : "Recorded check");
}

function presentationText(value: string, locale: "pl" | "en"): string {
  return isUnrecordedMachineValue(value) ? (locale === "pl" ? "Brak zapisanego wyniku" : "No recorded result") : value;
}

function isUnrecordedMachineValue(value: string): boolean {
  return [
    "unknown",
    "null",
    "undefined",
    "missing_data",
    "open_external_tool",
    "auto_verified",
    "manual_verified",
    "not_applicable",
    "red_flag",
  ].includes(value.trim().toLowerCase());
}
