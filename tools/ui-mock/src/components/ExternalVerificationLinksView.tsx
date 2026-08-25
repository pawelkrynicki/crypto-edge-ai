import React, { useEffect, useMemo, useState } from "react";
import {
  buildExternalVerificationTargets,
  normalizeExternalVerificationInput,
  resolveManualResearchTarget,
  type ExternalVerificationInput,
  type ExternalVerificationTarget,
} from "../externalVerificationTargets";
import {
  formatFollowUpLifecycleStatus,
  formatProductDateTime,
  formatProductPairAge,
  formatProductUsd,
  useProductLocale,
  type ProductLocale,
} from "../productI18n";
import { resolveProductFilterConditions, type BasicFilterCategory, type BasicFilterConditionState } from "../productFilterResolver";
import { formatProductSourceLabel } from "../productPresentation";
import { resolveProductSecurityState, type ProductSecurityState } from "../productSecurityResolver";
import { manualVerificationVerdictLabel } from "../manualVerificationVerdictLabel";
import type { UiTokenCandidate } from "../types/scannerTypes";
import type { FollowUpPublicEntry } from "../types/followUpTypes";
import type { ResearchStepNumber } from "../researchChecklistTypes";
import { followUpToResearchCandidate } from "../followUpResearchCandidate";
import {
  loadManualVerification,
  saveManualVerificationDecision,
  type ManualVerificationVerdict,
  type PrivateVerificationRecord,
} from "../services/manualOwnerActionsDataSource";
import { ActionButton, CopyButton, ExternalLinkAction } from "./ProductUi";
import { TokenDetailDrawer } from "./TokenDetailDrawer";
import { TokenDetailTabPanel, TokenDetailTabs } from "./TokenDetailTabs";
import { ManualSourceGuidance, ResearchManualEvidencePanel, ResearchPlaybookContext, type ManualSourceGuidanceTopic } from "./ResearchChecklist";
import { getVerificationMissingTargetPresentation, resolveVerificationMissingTarget, type VerificationMissingTarget } from "../verificationMissingItemTargets";

const VERIFICATION_DRAWER_TAB_IDS = ["identity", "market", "filters", "security", "data", "decision"] as const;
export type VerificationDrawerTabId = (typeof VERIFICATION_DRAWER_TAB_IDS)[number];

interface ExternalVerificationLinksViewProps {
  candidate?: UiTokenCandidate | null;
  followUp?: FollowUpPublicEntry | null;
  onOpenResearchBrief?: () => void;
  onVerificationSaved?: (record: PrivateVerificationRecord) => void;
  onReturnToDetail?: () => void;
  onClose?: () => void;
  /** Supports focused UI tests. A selected token always uses the identity tab. */
  initialActiveTab?: VerificationDrawerTabId;
  /** A specific Playbook task that opened this evidence workspace. */
  focusedResearchStep?: ResearchStepNumber | null;
  focusedResearchCheck?: "honeypot" | null;
  /** Returns from the focused checklist step to Candidate Detail > Summary. */
  onBackToResearchPlaybook?: () => void;
  focusedMissingTarget?: VerificationMissingTarget | null;
  decisionOrigin?: boolean;
  onOpenMissingTarget?: (target: VerificationMissingTarget) => void;
  onReturnToDecision?: () => void;
}

export const ExternalVerificationLinksView: React.FC<ExternalVerificationLinksViewProps> = ({
  candidate,
  followUp,
  onOpenResearchBrief,
  onVerificationSaved,
  onReturnToDetail,
  onClose,
  initialActiveTab = "identity",
  focusedResearchStep = null,
  focusedResearchCheck = null,
  onBackToResearchPlaybook,
  focusedMissingTarget = null,
  decisionOrigin = false,
  onOpenMissingTarget,
  onReturnToDecision,
}) => {
  const { locale, t } = useProductLocale();
  const chain = candidate?.chain ?? followUp?.chain ?? "";
  const contractAddress = candidate?.contractAddress ?? followUp?.contract_address ?? "";
  const symbol = candidate?.symbol ?? followUp?.symbol ?? "";
  const displayName = candidate?.name ?? followUp?.display_name ?? "";
  // Follow-up entries are canonical Radar records too. Project them once for
  // the shared Playbook resolver instead of hiding context when the token is
  // not present in the current scanner batch.
  const researchCandidate = candidate ?? (followUp ? followUpToResearchCandidate(followUp) : null);
  const focusedMissingMapping = focusedMissingTarget ? getVerificationMissingTargetPresentation(focusedMissingTarget) : null;
  const focusedMissingTab = focusedMissingMapping?.tab ?? null;
  const [activeTab, setActiveTab] = useState<VerificationDrawerTabId>(focusedMissingMapping?.tab ?? (focusedResearchStep === 3 ? "security" : initialActiveTab));
  const [verdict, setVerdict] = useState<ManualVerificationVerdict | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [saveSucceeded, setSaveSucceeded] = useState(false);
  const [savedRecord, setSavedRecord] = useState<PrivateVerificationRecord | null>(null);

  useEffect(() => {
    if (!chain || !contractAddress) return;
    let cancelled = false;
    void loadManualVerification(chain, contractAddress).then((value) => {
      if (cancelled) return;
      setSavedRecord(value);
      setVerdict(value?.verdict ?? null);
      setNote(value?.note ?? "");
      setSaveError(false);
      setSaveSucceeded(false);
    });
    return () => { cancelled = true; };
  }, [chain, contractAddress]);

  useEffect(() => {
    if (!focusedMissingTab || typeof window === "undefined") return;
    const frame = window.requestAnimationFrame(() => setActiveTab(focusedMissingTab));
    return () => window.cancelAnimationFrame(frame);
  }, [focusedMissingTab]);

  useEffect(() => {
    if (!focusedMissingTarget || typeof document === "undefined") return;
    const frame = window.requestAnimationFrame(() => document.getElementById(`verification-target-${focusedMissingTarget}`)?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [activeTab, focusedMissingTarget]);

  const fallbackMissing = useMemo(() => candidate?.missingData ?? followUp?.missing_data ?? [], [candidate?.missingData, followUp?.missing_data]);
  const fallbackAvailable = useMemo(() => {
    const values = ["chain", "contract_address"];
    if (symbol) values.push("symbol");
    if (displayName) values.push("display_name");
    if ((candidate?.marketCap ?? followUp?.market_metrics.market_cap_usd) != null) values.push("market_cap");
    if ((candidate?.liquidity ?? followUp?.market_metrics.liquidity_usd) != null) values.push("liquidity");
    if ((candidate?.volume24h ?? followUp?.market_metrics.volume_24h_usd) != null) values.push("volume_24h");
    return values;
  }, [candidate?.liquidity, candidate?.marketCap, candidate?.volume24h, displayName, followUp?.market_metrics, symbol]);

  if (!candidate && !followUp) {
    return <section className="basket-state empty"><span>{t("verification.eyebrow")}</span><h3>{t("verification.noneTitle")}</h3><p>{t("verification.noneDetail")}</p></section>;
  }

  const input = buildInput(candidate, followUp);
  const normalizedInput = normalizeExternalVerificationInput(input);
  const targets = buildExternalVerificationTargets(input);
  const securityResolution = candidate ? resolveProductSecurityState(candidate) : null;
  const missingData = fallbackMissing;
  const availableData = fallbackAvailable;
  const missingText = t("radar.missingData");
  const tabCopy = getVerificationTabCopy(locale);
  const market = {
    marketCap: candidate?.marketCap ?? followUp?.market_metrics.market_cap_usd ?? null,
    liquidity: candidate?.liquidity ?? followUp?.market_metrics.liquidity_usd ?? null,
    volume: candidate?.volume24h ?? followUp?.market_metrics.volume_24h_usd ?? null,
    volumeMarketCapRatio: candidate?.volumeMarketCapRatio ?? followUp?.market_metrics.volume_market_cap_ratio ?? null,
    pairAge: candidate?.pairAgeDays ?? followUp?.pair_age ?? null,
  };
  const marketObservedAt = followUp?.market_observed_at ?? candidate?.lastCheckedAt ?? null;
  const filterResolution = resolveProductFilterConditions({
    basicFilterStatus: candidate?.basicFilterStatus ?? followUp?.filter_status ?? "not_checked",
    filterReasons: candidate?.filterReasons ?? followUp?.filter_reasons ?? [],
  });

  const save = async () => {
    if (!verdict || note.trim().length < 3 || saving) return;
    setSaving(true);
    setSaveError(false);
    setSaveSucceeded(false);
    try {
      const result = await saveManualVerificationDecision({ chain, contractAddress, verdict, note: note.trim() });
      setSavedRecord(result.record);
      setSaveSucceeded(true);
      onVerificationSaved?.(result.record);
    } catch {
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  };

  const firstSeen = followUp?.first_seen_at ?? candidate?.pairCreatedAt ?? null;
  const lastSeen = followUp?.last_seen_at ?? candidate?.lastCheckedAt ?? null;
  const radarLayer = candidate
    ? candidate.discoveryBasket === "established" ? "Established" : locale === "pl" ? "Nowe / Emerging" : "New / Emerging"
    : followUp ? formatFollowUpLifecycleStatus(followUp.lifecycle_status, locale) : missingText;
  const security = candidate?.security ?? null;
  const lastDecision = savedRecord;

  let activeContent: React.ReactNode;
  if (activeTab === "identity") {
    activeContent = (
      <VerificationSection heading={tabCopy.identity} detail={locale === "pl" ? "Potwierdź tożsamość tokena przed oceną danych i ryzyka." : "Confirm the token identity before evaluating market data and risk."}>
        {focusedMissingTarget && <VerificationMissingTargetFocus target={focusedMissingTarget} chain={chain} contractAddress={contractAddress} locale={locale} onReturnToDecision={decisionOrigin ? onReturnToDecision : undefined} />}
        <div className="product-detail-grid data verification-identity-grid">
          <VerificationMetric label={locale === "pl" ? "Nazwa" : "Name"} value={displayName || missingText} />
          <VerificationMetric label={locale === "pl" ? "Symbol" : "Symbol"} value={symbol || missingText} />
          <VerificationMetric label={t("verification.network")} value={normalizedInput.chain || missingText} />
          <VerificationMetric label={locale === "pl" ? "Warstwa Radaru" : "Radar layer"} value={radarLayer} />
          <VerificationMetric label={locale === "pl" ? "Pierwsze wykrycie" : "First seen"} value={firstSeen ? formatProductDateTime(firstSeen, locale) : missingText} />
          <VerificationMetric label={locale === "pl" ? "Ostatnie wykrycie" : "Last seen"} value={lastSeen ? formatProductDateTime(lastSeen, locale) : missingText} />
        </div>
        <div className="verification-contract verification-contract-panel"><span>{t("verification.contractAddress")}</span><code title={normalizedInput.contractAddress}>{normalizedInput.contractAddress || missingText}</code>{normalizedInput.contractAddress && <CopyButton value={normalizedInput.contractAddress} label={t("verification.copyContract")} copiedLabel={t("app.copied")} />}</div>
      </VerificationSection>
    );
  } else if (activeTab === "market") {
    activeContent = (
      <VerificationSection heading={tabCopy.market} detail={locale === "pl" ? "Migawka rynkowa. Brakujące wartości pozostają jawne." : "Market snapshot. Missing values remain explicit."}>
        <div className="external-checks-review-grid">
          <VerificationMetric label={locale === "pl" ? "Kapitalizacja" : "Market cap"} value={formatProductUsd(market.marketCap, locale, missingText)} />
          <VerificationMetric label={locale === "pl" ? "Płynność" : "Liquidity"} value={formatProductUsd(market.liquidity, locale, missingText)} />
          <VerificationMetric label={locale === "pl" ? "Wolumen 24 h" : "24h volume"} value={formatProductUsd(market.volume, locale, missingText)} />
          <VerificationMetric label={locale === "pl" ? "Wolumen / kapitalizacja" : "Volume / market cap"} value={formatRatio(market.volumeMarketCapRatio, missingText)} />
          <VerificationMetric label={locale === "pl" ? "Wiek pary" : "Pair age"} value={formatProductPairAge(market.pairAge, locale, missingText, { pairCreatedAt: candidate?.pairCreatedAt ?? null })} />
          <VerificationMetric label={locale === "pl" ? "Cena" : "Price"} value={formatVerificationPrice(candidate?.priceUsd ?? followUp?.market_metrics.price_usd ?? null, locale, missingText)} />
          <VerificationMetric label={locale === "pl" ? "Zmiana ceny" : "Price change"} value={locale === "pl" ? "Brak danych o zmianie ceny" : "No price-change data"} />
          <VerificationMetric label={locale === "pl" ? "Dane aktualne na" : "Market data as of"} value={marketObservedAt ? formatProductDateTime(marketObservedAt, locale) : missingText} />
        </div>
      </VerificationSection>
    );
  } else if (activeTab === "filters") {
    activeContent = (
      <VerificationSection heading={tabCopy.filters} detail={locale === "pl" ? "Każdy filtr pokazuje osobno stan, aktualną wartość i obowiązujący próg." : "Each filter shows its own state, current value and threshold."}>
        <div className="filter-condition-grid verification-filter-rows">
          {filterResolution.conditions.map((condition) => <VerificationFilterRow key={condition.category} category={condition.category} state={condition.state} value={filterValue(condition.category, market, locale, missingText)} reasons={condition.failureReasons} advisory={filterAdvisory(condition.category, filterResolution.preferredRangeNotes, locale)} locale={locale} />)}
        </div>
      </VerificationSection>
    );
  } else if (activeTab === "security") {
    activeContent = (
      <VerificationSection heading={tabCopy.security} detail={locale === "pl" ? "Brak kontroli jest pokazany jako brak danych — nie jako bezpieczny wynik." : "A missing control is shown as missing data, never as a safe result."}>
        {focusedMissingTarget && <VerificationMissingTargetFocus target={focusedMissingTarget} chain={chain} contractAddress={contractAddress} locale={locale} onReturnToDecision={decisionOrigin ? onReturnToDecision : undefined} />}
        {followUp && !candidate ? (
          <div className="external-checks-review-grid">
            <VerificationMetric label={locale === "pl" ? "Status bezpieczeństwa" : "Security status"} value={formatFollowUpSecuritySummary(followUp.security_status, locale)} />
            <VerificationMetric label={locale === "pl" ? "Stan ręcznej weryfikacji" : "Manual verification state"} value={formatFollowUpManualState(followUp.security_status, followUp.missing_data, locale)} />
            {securityMissingFacts(followUp.missing_data, locale).map((item) => <VerificationMetric key={item.label} label={item.label} value={item.value} />)}
          </div>
        ) : (
          <div className="external-checks-review-grid">
            <VerificationMetric label="Honeypot" value={formatSecurityValue(security?.honeypotStatus, locale, missingText)} />
            <VerificationMetric label={locale === "pl" ? "Podatek kupna" : "Buy tax"} value={formatPercent(security?.buyTax, missingText)} />
            <VerificationMetric label={locale === "pl" ? "Podatek sprzedaży" : "Sell tax"} value={formatPercent(security?.sellTax, missingText)} />
            <VerificationMetric label={locale === "pl" ? "Zweryfikowany kontrakt" : "Contract verified"} value={formatNullableBoolean(security?.contractVerified, locale)} />
            <VerificationMetric label={locale === "pl" ? "Własność" : "Ownership"} value={formatSecurityValue(security?.ownershipStatus, locale, missingText)} />
            <VerificationMetric label={locale === "pl" ? "Blokada płynności i dni" : "Liquidity lock and days"} value={formatLiquidityLock(security?.liquidityLocked, security?.liquidityLockDays, locale)} />
            <VerificationMetric label="Mint" value={formatRisk(security?.mintRisk, locale)} />
            <VerificationMetric label="Blacklist" value={formatRisk(security?.blacklistRisk, locale)} />
            <VerificationMetric label="Whitelist" value={formatRisk(security?.whitelistRisk, locale)} />
            <VerificationMetric label={locale === "pl" ? "Ograniczenie sprzedaży" : "Sell restriction"} value={formatRisk(security?.sellRestrictionRisk, locale)} />
            <VerificationMetric label="Proxy" value={formatRisk(security?.proxyRisk, locale)} />
            <VerificationMetric label={locale === "pl" ? "Największy portfel" : "Top wallet"} value={formatPercent(security?.topWalletPct, missingText)} />
            <VerificationMetric label={locale === "pl" ? "Top 10 portfeli" : "Top 10 wallets"} value={formatPercent(security?.top10WalletsPct, missingText)} />
            <VerificationMetric label={t("verification.securityMetric")} value={securityResolution ? presentVerificationSecurityState(securityResolution.state, t) : missingText} />
            <VerificationMetric label={locale === "pl" ? "Stan ręcznej weryfikacji" : "Manual verification state"} value={t("verification.manualOnly")} />
          </div>
        )}
        <p className="external-checks-eyebrow">{t("verification.securityManual")}</p>
        <div className="security-flag-list warning"><strong>{locale === "pl" ? "Brakujące kontrole" : "Missing controls"}</strong><div>{formatVerificationEvidenceItems(missingData, locale).length > 0 ? formatVerificationEvidenceItems(missingData, locale).map((item) => <span key={item}>{item}</span>) : <span>{locale === "pl" ? "Brak zgłoszonych braków" : "No reported gaps"}</span>}</div></div>
        <MissingSecurityGuidance locale={locale} />
      </VerificationSection>
    );
  } else if (activeTab === "data") {
    activeContent = (
      <VerificationSection heading={tabCopy.data} detail={locale === "pl" ? "Źródła są opisane i linkowane; otwarcie oraz zmiana zakładki nie wykonują połączeń do dostawców." : "Sources are described and linked; opening and switching tabs do not call providers."}>
        {focusedMissingTarget && <VerificationMissingTargetFocus target={focusedMissingTarget} chain={chain} contractAddress={contractAddress} locale={locale} onReturnToDecision={decisionOrigin ? onReturnToDecision : undefined} />}
        <div className="product-detail-grid data">
          <VerificationMetric label={locale === "pl" ? "Źródło danych rynkowych i filtrów" : "Market and filter source"} value={candidate ? formatProductSourceLabel(candidate.source) : formatFollowUpMarketSource(locale)} />
          <VerificationMetric label={locale === "pl" ? "Timestamp danych" : "Data timestamp"} value={marketObservedAt ? formatProductDateTime(marketObservedAt, locale) : missingText} />
          <VerificationMetric label={locale === "pl" ? "Status źródła" : "Source status"} value={locale === "pl" ? "Migawka dostępna do ręcznej kontroli" : "Snapshot available for manual review"} />
          <VerificationMetric label={locale === "pl" ? "Źródła kontroli bezpieczeństwa" : "Security check sources"} value={securityResolution?.sources.map(formatProductSourceLabel).join(", ") || missingText} />
        </div>
        <div className="external-checks-list">{targets.map((target) => <ExternalCheckCard key={target.id} target={target} />)}</div>
        {onOpenResearchBrief && <section className="verification-ai-research-action" aria-label={locale === "pl" ? "Analiza badawcza AI" : "AI Research Brief"}><div><strong>{locale === "pl" ? "Analiza badawcza AI" : "AI Research Brief"}</strong><p>{locale === "pl" ? "Analiza AI uzupełnia, ale nie zastępuje ręcznej weryfikacji." : "AI analysis complements but does not replace manual verification."}</p></div><ActionButton variant="secondary" icon="arrow" iconPosition="end" onClick={onOpenResearchBrief}>{locale === "pl" ? "Otwórz analizę AI" : "Open AI analysis"}</ActionButton></section>}
      </VerificationSection>
    );
  } else {
    activeContent = null;
  }

  if (activeTab === "decision") {
    activeContent = (
      <VerificationDecision
        candidate={candidate}
        locale={locale}
        lastDecision={lastDecision}
        verdict={verdict}
        onVerdictChange={(value) => { setVerdict(value); setSaveSucceeded(false); }}
        note={note}
        onNoteChange={(value) => { setNote(value); setSaveSucceeded(false); }}
        availableData={availableData}
        missingData={missingData}
        saving={saving}
        saveError={saveError}
        saveSucceeded={saveSucceeded}
        onSave={save}
        onReturnToDetail={onReturnToDetail}
        onOpenMissingTarget={onOpenMissingTarget}
      />
    );
  }

  return (
    <TokenDetailDrawer
      title={symbol || missingText}
      subtitle={displayName}
      badge={<span className="detail-verification-badge">{t("verification.manualEyebrow")}</span>}
      onClose={onClose}
      closeLabel={locale === "pl" ? "Zamknij kartę tokena" : "Close token card"}
      summary={<><span>{t("verification.intro")}</span><span>{t("detail.boundaryManual")}</span><span>{t("verification.boundary")}</span></>}
      meta={<><span className="research-context-chip"><span>{t("verification.network")}</span><strong>{chain || missingText}</strong></span><span className="research-context-chip"><span>{t("verification.contractAddress")}</span><code>{contractAddress || missingText}</code></span></>}
      tabBar={<TokenDetailTabs tabs={VERIFICATION_DRAWER_TAB_IDS.map((id) => ({ id, label: tabCopy[id] }))} activeTab={activeTab} onChange={setActiveTab} idPrefix="verification" ariaLabel={locale === "pl" ? "Zakładki karty Weryfikacji" : "Verification drawer tabs"} />}
      bodyClassName="token-detail-drawer-body--tabbed"
      className="verification-token-drawer"
    >
      <TokenDetailTabPanel activeTab={activeTab} idPrefix="verification"><div className="external-checks-view product-verification verification-tab-content">
        {focusedResearchStep && researchCandidate && <ResearchPlaybookContext candidate={researchCandidate} focusedStep={focusedResearchStep} verificationCheck={focusedResearchCheck} surface="verification" onOpenPlaybook={onBackToResearchPlaybook} />}
        {activeContent}
      </div></TokenDetailTabPanel>
    </TokenDetailDrawer>
  );
};

function VerificationDecision({
  candidate,
  locale,
  lastDecision,
  verdict,
  onVerdictChange,
  note,
  onNoteChange,
  availableData,
  missingData,
  saving,
  saveError,
  saveSucceeded,
  onSave,
  onReturnToDetail,
  onOpenMissingTarget,
}: {
  candidate: UiTokenCandidate | null | undefined;
  locale: ProductLocale;
  lastDecision: PrivateVerificationRecord | null;
  verdict: ManualVerificationVerdict | null;
  onVerdictChange: (value: ManualVerificationVerdict) => void;
  note: string;
  onNoteChange: (value: string) => void;
  availableData: string[];
  missingData: string[];
  saving: boolean;
  saveError: boolean;
  saveSucceeded: boolean;
  onSave: () => Promise<void>;
  onReturnToDetail?: () => void;
  onOpenMissingTarget?: (target: VerificationMissingTarget) => void;
}) {
  const pl = locale === "pl";
  return (
    <VerificationSection heading={pl ? "Decyzja weryfikacyjna" : "Verification decision"} detail={pl ? "Zapisujesz swój wynik weryfikacji. Nie zmienia on wspólnego Radaru ani lifecycle." : "You save your own verification result. It does not change the shared Radar or lifecycle."}>
      <section className="verification-decision-current" aria-label={pl ? "Twój wynik weryfikacji" : "Your verification result"}>
        <span>{pl ? "Twój wynik weryfikacji" : "Your verification result"}</span>
        <strong data-verification-verdict={lastDecision?.verdict}>{lastDecision ? manualVerificationVerdictLabel(lastDecision.verdict, locale) : (pl ? "Brak zapisanej decyzji" : "No saved decision")}</strong>
        {lastDecision && <p>{pl ? `Twój zapis: ${formatProductDateTime(lastDecision.checked_at, locale)}` : `Your saved result: ${formatProductDateTime(lastDecision.checked_at, locale)}`}</p>}
      </section>

      <div className="verification-decision-options" role="radiogroup" aria-label={pl ? "Wybierz decyzję weryfikacyjną" : "Choose verification decision"}>
        {(["VERIFIED", "NEEDS_MORE_DATA", "CRITICAL_RISK", "REJECT"] as const).map((option) => (
          <button key={option} type="button" role="radio" aria-checked={verdict === option} className={verdict === option ? "selected" : ""} onClick={() => onVerdictChange(option)}>
            {manualVerificationVerdictLabel(option, locale)}
          </button>
        ))}
      </div>

      <label className="verification-decision-note"><span>{pl ? "Twoja notatka" : "Your note"}</span><textarea value={note} onChange={(event) => onNoteChange(event.target.value)} minLength={3} maxLength={500} rows={4} /></label>

      <section className="verification-decision-impact"><strong>{pl ? "Podsumowanie skutków decyzji" : "Decision impact summary"}</strong><p>{verdict ? decisionImpactCopy(verdict, locale) : (pl ? "Wybierz decyzję, aby zobaczyć jej skutki." : "Choose a decision to see its impact.")}</p></section>

      <section className="verification-decision-coverage"><div className="condition-list ready"><strong>{pl ? "Dostępne" : "Available"}</strong><ul>{availableData.map((item) => <li key={item}>{formatCoverageItem(item, locale)}</li>)}</ul></div><div className="condition-list warning"><strong>{pl ? "Brakujące" : "Missing"}</strong>{missingData.length > 0 ? <ul>{missingData.map((item) => <MissingDecisionItem key={item} value={item} locale={locale} onOpenMissingTarget={onOpenMissingTarget} />)}</ul> : <p>{pl ? "Brak" : "None"}</p>}</div></section>

      {candidate && <ResearchManualEvidencePanel candidate={candidate} />}

      <section className="verification-save-section" aria-label={pl ? "Zapis wyniku weryfikacji" : "Save verification result"}>
        <ActionButton variant="primary" onClick={() => void onSave()} loading={saving} disabled={!verdict || note.trim().length < 3 || saving}>{pl ? "Zapisz wynik weryfikacji" : "Save verification result"}</ActionButton>
        {saveError && <p role="alert">{pl ? "Nie zapisano wyniku. Wprowadzone dane pozostają na ekranie — spróbuj ponownie." : "The result was not saved. Your entered data remains on screen — try again."}</p>}
      </section>

      {saveSucceeded && lastDecision && <p className="verification-decision-saved" role="status" data-verification-verdict={lastDecision.verdict}>{pl ? `Zapisano wynik weryfikacji: ${manualVerificationVerdictLabel(lastDecision.verdict, locale)}` : `Verification result saved: ${manualVerificationVerdictLabel(lastDecision.verdict, locale)}`}</p>}

      <section className="verification-return" aria-labelledby="verification-return-heading"><div><h3 id="verification-return-heading">{pl ? "Powrót do Szczegółów tokena" : "Return to token details"}</h3><p>{pl ? "Lista Weryfikacji pozostaje zachowana po powrocie." : "The Verification list remains intact when returning."}</p></div><ActionButton variant="primary" icon="arrow" iconPosition="end" className="product-primary-button" onClick={() => { if (onReturnToDetail) onReturnToDetail(); else if (typeof window !== "undefined") window.location.hash = "candidate-detail"; }}>{pl ? "Wróć do szczegółów" : "Return to detail"}</ActionButton></section>
    </VerificationSection>
  );
}

function VerificationSection({ heading, detail, children }: { heading: string; detail: string; children: React.ReactNode }) {
  const isIdentity = heading === "Tożsamość" || heading === "Identity";
  const isDecision = heading === "Decyzja weryfikacyjna" || heading === "Verification decision";
  return <section className={`verification-research-section ${isIdentity ? "verification-identity-panel" : ""} ${isDecision ? "verification-decision-panel" : ""}`.trim()}><header><div><h3>{heading}</h3><p>{detail}</p></div></header>{children}</section>;
}

function decisionImpactCopy(verdict: ManualVerificationVerdict, locale: ProductLocale): string {
  const pl = locale === "pl";
  if (verdict === "VERIFIED") return pl ? "Werdykt zostanie zapisany jako ręcznie zweryfikowany dla tej tożsamości tokena." : "The verdict will be saved as manually verified for this token identity.";
  if (verdict === "CRITICAL_RISK") return pl ? "Werdykt wskaże krytyczne ryzyko do dalszej ręcznej oceny." : "The verdict will mark critical risk for further manual assessment.";
  if (verdict === "REJECT") return pl ? "Werdykt wskaże odrzucenie tej tożsamości w historii ręcznej weryfikacji." : "The verdict will mark this identity as rejected in manual-verification history.";
  return pl ? "Werdykt wskaże, że przed decyzją potrzebne są dodatkowe dane." : "The verdict will mark that more data is needed before a decision.";
}

function VerificationFilterRow({ category, state, value, reasons, advisory, locale }: { category: BasicFilterCategory; state: BasicFilterConditionState; value: string; reasons: string[]; advisory: string | null; locale: ProductLocale }) {
  const copy = filterCopy(category, locale);
  const stateLabel = state === "passed" ? locale === "pl" ? "Spełniony" : "Passed" : state === "failed" ? locale === "pl" ? "Niespełniony" : "Failed" : locale === "pl" ? "Brak danych" : "Missing data";
  return <article className={`condition-list ${state === "passed" ? "ready" : state === "failed" ? "warning" : "neutral"}`}><strong>{copy.label}</strong><p>{stateLabel}</p><dl><div><dt>{locale === "pl" ? "Wartość" : "Value"}</dt><dd>{value}</dd></div><div><dt>{locale === "pl" ? "Próg" : "Threshold"}</dt><dd>{copy.threshold}</dd></div></dl>{advisory && <p className="filter-preferred-advisory">{advisory}</p>}{reasons.length > 0 && <p>{reasons.join(", ")}</p>}</article>;
}

function MissingDecisionItem({ value, locale, onOpenMissingTarget }: { value: string; locale: ProductLocale; onOpenMissingTarget?: (target: VerificationMissingTarget) => void }) {
  const mapping = resolveVerificationMissingTarget(value);
  const label = mapping ? mapping.label[locale] : formatCoverageItem(value, locale);
  if (!mapping || !onOpenMissingTarget) return <li><span>{label}</span><small>{locale === "pl" ? "Sprawdź ten brak w odpowiedniej zakładce Weryfikacji." : "Check this gap in the relevant Verification tab."}</small></li>;
  return <li><button type="button" className="verification-missing-link" onClick={() => onOpenMissingTarget(mapping.target)} aria-label={locale === "pl" ? `Otwórz kontrolę: ${label}` : `Open check: ${label}`}>{label}</button></li>;
}

function VerificationMissingTargetFocus({ target, chain, contractAddress, locale, onReturnToDecision }: { target: VerificationMissingTarget; chain: string; contractAddress: string; locale: ProductLocale; onReturnToDecision?: () => void }) {
  const presentation = getVerificationMissingTargetPresentation(target);
  const topic: ManualSourceGuidanceTopic = target === "honeypot" ? "honeypot"
    : target === "liquidity_lock" ? "liquidity"
      : target === "top10_wallets" || target === "bubblemaps" ? "holders"
        : "explorer";
  const pl = locale === "pl";
  const manualTool = target === "honeypot" ? "honeypot"
    : target === "top10_wallets" || target === "bubblemaps" ? "bubblemaps"
      : target === "tokensniffer" ? "tokensniffer"
        : target === "defi_scanner" ? "defi_scanner"
          : null;
  const manualTarget = manualTool ? resolveManualResearchTarget(manualTool, { chain, contractAddress }) : null;
  return <section id={`verification-target-${target}`} tabIndex={-1} className="verification-target-focus" data-verification-target={target}>
    <strong>{pl ? `Sprawdź: ${presentation.label.pl}` : `Check: ${presentation.label.en}`}</strong>
    <p>{pl ? "To jest dokładne miejsce kontroli wybrane z brakujących danych w decyzji weryfikacyjnej." : "This is the exact check selected from missing evidence in the verification decision."}</p>
    <ManualSourceGuidance topic={topic} locale={locale} />
    {manualTarget?.official_url && <ExternalLinkAction variant="secondary" href={manualTarget.official_url}>{pl ? `Otwórz kontrolę: ${presentation.label.pl}` : `Open check: ${presentation.label.en}`}</ExternalLinkAction>}
    {onReturnToDecision && <ActionButton variant="tertiary" onClick={onReturnToDecision}>{pl ? "Wróć do decyzji weryfikacyjnej" : "Return to verification decision"}</ActionButton>}
  </section>;
}

function filterAdvisory(category: BasicFilterCategory, notes: readonly string[], locale: ProductLocale): string | null {
  if (category !== "volume_market_cap_ratio" || !notes.includes("volume_market_cap_ratio_outside_sweet_spot_5_30_percent")) return null;
  return locale === "pl" ? "Uwaga: poza preferowanym zakresem 5–30%." : "Note: outside the preferred 5–30% range.";
}

function ExternalCheckCard({ target }: { target: ExternalVerificationTarget }) {
  const { t, locale } = useProductLocale();
  const copyValue = target.copyValue ?? "";
  const copyLabelKey = target.copyLabel === "Copy Pair Address" ? "verification.copyPair" : target.copyLabel === "Copy Link" ? "verification.copyLink" : target.copyLabel === "Copy Token Input" ? "verification.copyInput" : "verification.copyContract";
  const labelKey = target.id === "explorer" ? "verification.networkExplorer" : target.id === "dex" ? "verification.dexScreener" : target.id === "source" ? "verification.recordSourceLabel" : "verification.securityManual";
  const titleKey = target.id === "explorer" ? "verification.explorerTitle" : target.id === "dex" ? "verification.dexTitle" : target.id === "source" ? "verification.sourceTitle" : "verification.securityTitle";
  const explanationKey = target.id === "explorer" ? "verification.explorerExplanation" : target.id === "dex" ? "verification.dexExplanation" : target.id === "source" ? "verification.sourceExplanation" : "verification.securityExplanation";
  const title = t(titleKey);
  const guidanceTopic = externalGuidanceTopic(target.id);
  return <article className={`external-check-card ${target.state === "manual" ? "manual" : ""}`}><div className="external-check-card-main"><span className="external-checks-eyebrow">{t(labelKey)}</span><h4>{title}</h4><p>{target.state === "link" ? t(explanationKey) : translateStatus(target.status, t)}</p>{guidanceTopic && <ManualSourceGuidance topic={guidanceTopic} locale={locale} />}</div><div className="external-check-card-status"><span>{t("verification.status")}</span><strong>{target.state === "link" ? t("verification.allowlisted") : translateStatus(target.status, t)}</strong>{target.state === "manual" && <p>{t("verification.manualMissing")}</p>}</div><div className="external-check-actions">{target.href ? <ExternalLinkAction variant="secondary" className="external-check-link" href={target.href} aria-label={t("verification.openSourceLabel", { source: title })}>{t("verification.openSource")}</ExternalLinkAction> : <span className="external-check-disabled" aria-disabled="true">{t("verification.sourceUnavailable")}</span>}{copyValue && <CopyButton className="external-check-copy-button" value={copyValue} label={t(copyLabelKey)} copiedLabel={t("app.copied")} />}</div></article>;
}

function externalGuidanceTopic(id: ExternalVerificationTarget["id"]): ManualSourceGuidanceTopic | null {
  if (id === "dex") return "dex";
  if (id === "security") return "honeypot";
  if (id === "explorer") return "explorer";
  return null;
}

function MissingSecurityGuidance({ locale }: { locale: ProductLocale }) {
  const pl = locale === "pl";
  return <details className="manual-source-guidance missing-security-guidance" data-missing-security-guidance>
    <summary>{pl ? "Jak sprawdzić brakujące dane?" : "How to check missing data?"}</summary>
    <div className="missing-security-guidance-content">
      <section><strong>{pl ? "KONCENTRACJA PORTFELI" : "WALLET CONCENTRATION"}</strong><ul>
        <li>{pl ? "Sprawdź udział największych portfeli." : "Check the share held by the largest wallets."}</li>
        <li>{pl ? "Preferowane: największy portfel <10%." : "Preferred: the largest wallet is below 10%."}</li>
        <li>{pl ? "Preferowane: Top 10 portfeli łącznie <40%." : "Preferred: the Top 10 wallets together are below 40%."}</li>
        <li>{pl ? "Adresy burn, LP i kontrakty mogą wymagać osobnej interpretacji." : "Burn, LP and contract addresses may need separate interpretation."}</li>
      </ul></section>
      <section><strong>{pl ? "PŁYNNOŚĆ" : "LIQUIDITY"}</strong><ul>
        <li>{pl ? "Sprawdź, czy płynność jest spalona lub zablokowana." : "Check whether liquidity is burned or locked."}</li>
        <li>{pl ? "LP wysłane na adres burn, np. 0x...dead, oznaczają spaloną płynność." : "LP sent to a burn address, for example 0x...dead, means the liquidity is burned."}</li>
        <li>{pl ? "Jeśli użyto lockera, sprawdź czy blokada nadal obowiązuje." : "If a locker was used, check whether the lock is still active."}</li>
        <li>{pl ? "Jeżeli nie da się tego ustalić, pozostaw brak danych." : "If this cannot be determined, leave it as missing data."}</li>
      </ul></section>
      <p>{pl ? "Linki do źródeł znajdziesz w zakładce Dane i źródła." : "Source links are available in the Data & sources tab."}</p>
    </div>
  </details>;
}

function VerificationMetric({ label, value }: { label: string; value: string }) {
  return <div className="external-check-metric manual"><span>{label}</span><strong>{value}</strong></div>;
}

function getVerificationTabCopy(locale: ProductLocale): Record<VerificationDrawerTabId, string> {
  return locale === "pl"
    ? { identity: "Tożsamość", market: "Dane rynkowe", filters: "Filtry", security: "Bezpieczeństwo", data: "Dane i źródła", decision: "Decyzja weryfikacyjna" }
    : { identity: "Identity", market: "Market data", filters: "Filters", security: "Security", data: "Data & sources", decision: "Verification decision" };
}

function filterCopy(category: BasicFilterCategory, locale: ProductLocale): { label: string; threshold: string } {
  const pl = locale === "pl";
  if (category === "market_cap") return { label: pl ? "Kapitalizacja" : "Market cap", threshold: "$300,000–$10,000,000" };
  if (category === "volume_24h") return { label: pl ? "Wolumen 24 h" : "24h volume", threshold: ">= $30,000" };
  if (category === "liquidity") return { label: pl ? "Płynność" : "Liquidity", threshold: ">= $30,000" };
  if (category === "volume_market_cap_ratio") return { label: pl ? "Wolumen / kapitalizacja" : "Volume / market cap", threshold: "1%–100%" };
  return { label: pl ? "Wiek pary" : "Pair age", threshold: pl ? "> 7 dni" : "> 7 days" };
}

function filterValue(category: BasicFilterCategory, market: { marketCap: number | null; volume: number | null; liquidity: number | null; volumeMarketCapRatio: number | null; pairAge: number | null }, locale: ProductLocale, missing: string): string {
  if (category === "market_cap") return formatProductUsd(market.marketCap, locale, missing);
  if (category === "volume_24h") return formatProductUsd(market.volume, locale, missing);
  if (category === "liquidity") return formatProductUsd(market.liquidity, locale, missing);
  if (category === "volume_market_cap_ratio") return formatRatio(market.volumeMarketCapRatio, missing);
  return market.pairAge == null ? missing : `${market.pairAge.toFixed(1)} ${locale === "pl" ? "dni" : "days"}`;
}

function formatRatio(value: number | null, missing: string): string {
  return value == null ? missing : `${(value * 100).toFixed(2)}%`;
}

function formatVerificationPrice(value: number | null, locale: ProductLocale, missing: string): string {
  if (value == null) return missing;
  const digits = value < 0.01 ? 8 : value < 1 ? 5 : 2;
  return new Intl.NumberFormat(locale === "pl" ? "pl-PL" : "en-US", { style: "currency", currency: "USD", maximumFractionDigits: digits }).format(value);
}

function formatPercent(value: number | null | undefined, missing: string): string {
  return value == null ? missing : `${value.toFixed(2)}%`;
}

function formatNullableBoolean(value: boolean | null | undefined, locale: ProductLocale): string {
  if (value == null) return locale === "pl" ? "Brak danych" : "No data";
  return value ? locale === "pl" ? "Tak" : "Yes" : locale === "pl" ? "Nie" : "No";
}

function formatRisk(value: boolean | null | undefined, locale: ProductLocale): string {
  if (value == null) return locale === "pl" ? "Brak danych" : "No data";
  return value ? locale === "pl" ? "Wykryto ryzyko" : "Risk reported" : locale === "pl" ? "Nie zgłoszono ryzyka" : "No reported risk";
}

function formatSecurityValue(value: string | null | undefined, locale: ProductLocale, missing: string): string {
  if (!value || value.trim().length === 0) return missing;
  const normalized = value.toUpperCase().replaceAll(" ", "_");
  if (normalized === "NOT_CHECKED") return locale === "pl" ? "Nie sprawdzono" : "Not checked";
  if (normalized === "NEEDS_MANUAL_VERIFICATION") return locale === "pl" ? "Wymagana ręczna weryfikacja" : "Manual verification required";
  return value;
}

type SecurityMissingFact = { label: string; value: string };

function securityMissingFacts(values: readonly string[], locale: ProductLocale): SecurityMissingFact[] {
  const pl = locale === "pl";
  const facts: SecurityMissingFact[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = value.trim().toLowerCase();
    let fact: SecurityMissingFact | null = null;
    if (normalized === "honeypot_status" || normalized === "honeypot_missing") fact = { label: "Honeypot", value: pl ? "Brak wyniku" : "No result" };
    if (normalized === "liquidity_locked" || normalized === "liquidity_lock_missing") fact = { label: pl ? "Blokada płynności" : "Liquidity lock", value: pl ? "Brak danych" : "No data" };
    if (normalized === "top_10_wallets_pct" || normalized === "top_10_wallets_pct_missing") fact = { label: pl ? "Udział Top 10 portfeli" : "Top 10 wallet share", value: pl ? "Brak danych" : "No data" };
    if (normalized === "top_wallet_pct" || normalized === "top_wallet_pct_missing") fact = { label: pl ? "Udział największego portfela" : "Largest wallet share", value: pl ? "Brak danych" : "No data" };
    if (normalized === "ownership_status" || normalized === "ownership_unknown") fact = { label: pl ? "Status własności" : "Ownership status", value: pl ? "Brak danych" : "No data" };
    if (fact && !seen.has(fact.label)) {
      seen.add(fact.label);
      facts.push(fact);
    }
  }
  return facts;
}

function formatVerificationEvidenceItems(values: readonly string[], locale: ProductLocale): string[] {
  const securityFacts = securityMissingFacts(values, locale).map((fact) => `${fact.label} — ${fact.value}`);
  const covered = new Set<string>();
  for (const value of values) {
    const normalized = value.trim().toLowerCase();
    if (["honeypot_status", "honeypot_missing", "liquidity_locked", "liquidity_lock_missing", "top_10_wallets_pct", "top_10_wallets_pct_missing", "top_wallet_pct", "top_wallet_pct_missing", "ownership_status", "ownership_unknown", "honeypot_source", "goplus_source"].includes(normalized)) covered.add(value);
  }
  const other = values.filter((value) => !covered.has(value)).map((value) => formatCoverageItem(value, locale));
  return [...new Set([...securityFacts, ...other])];
}

function formatFollowUpSecuritySummary(status: string, locale: ProductLocale): string {
  if (status === "PARTIAL") return locale === "pl" ? "Dane częściowe" : "Partial data";
  if (status === "CHECKED") return locale === "pl" ? "Sprawdzone" : "Checked";
  if (status === "CRITICAL_RISK") return locale === "pl" ? "Wykryto ryzyko" : "Risk reported";
  if (status === "UNAVAILABLE") return locale === "pl" ? "Brak danych bezpieczeństwa" : "Security data unavailable";
  return locale === "pl" ? "Wymaga ręcznej weryfikacji" : "Manual verification required";
}

function formatFollowUpManualState(status: string, missingData: readonly string[], locale: ProductLocale): string {
  if (status === "CHECKED" && missingData.length === 0) return locale === "pl" ? "Ukończona" : "Complete";
  return locale === "pl" ? "Wymaga ręcznej weryfikacji" : "Requires manual verification";
}

function formatFollowUpMarketSource(locale: ProductLocale): string {
  return locale === "pl" ? "Źródło zachowanej obserwacji nie zostało zapisane" : "The source of the retained observation was not stored";
}

function formatLiquidityLock(locked: boolean | null | undefined, days: number | null | undefined, locale: ProductLocale): string {
  if (locked == null) return locale === "pl" ? "Brak danych" : "No data";
  const value = locked ? locale === "pl" ? "Zablokowana" : "Locked" : locale === "pl" ? "Niezablokowana" : "Not locked";
  return days == null ? value : `${value} (${days} ${locale === "pl" ? "dni" : "days"})`;
}

function presentVerificationSecurityState(state: ProductSecurityState, t: ReturnType<typeof useProductLocale>["t"]): string {
  if (state === "not_invoked") return t("verification.securityStateNotInvoked");
  if (state === "unavailable") return t("verification.securityStateUnavailable");
  if (state === "partial") return t("verification.securityStatePartial");
  if (state === "checked_needs_manual_review") return t("verification.securityStateNeedsReview");
  if (state === "checked_critical") return t("verification.securityStateCritical");
  return t("verification.securityStateChecked");
}

function buildInput(candidate?: UiTokenCandidate | null, followUp?: FollowUpPublicEntry | null): ExternalVerificationInput {
  return { symbol: candidate?.symbol ?? followUp?.symbol ?? "", projectName: candidate?.name ?? followUp?.display_name ?? "", chain: candidate?.chain ?? followUp?.chain ?? "", contractAddress: candidate?.contractAddress ?? followUp?.contract_address ?? "", pairAddress: candidate?.pairAddress ?? followUp?.pair_address ?? "", sourceUrl: candidate?.sourceUrl ?? "", tokenInput: candidate?.contractAddress ?? followUp?.contract_address ?? "" };
}

function formatCoverageItem(value: string, locale: ProductLocale): string {
  const labels: Record<string, [string, string]> = { chain: ["Network", "Sieć"], contract_address: ["Contract address", "Adres kontraktu"], symbol: ["Symbol", "Symbol"], display_name: ["Name", "Nazwa"], liquidity: ["Liquidity", "Płynność"], market_cap: ["Market cap", "Kapitalizacja"], volume_24h: ["24h volume", "Wolumen 24 h"], security_data: ["Security data", "Dane bezpieczeństwa"], security_not_checked: ["Security check", "Sprawdzenie bezpieczeństwa"], liquidity_missing: ["Liquidity", "Płynność"], market_cap_missing: ["Market cap", "Kapitalizacja"], volume_24h_missing: ["24h volume", "Wolumen 24 h"] };
  return (labels[value] ?? ["Additional verification data", "Dodatkowe dane do weryfikacji"])[locale === "pl" ? 1 : 0];
}

function translateStatus(value: string, t: ReturnType<typeof useProductLocale>["t"]): string {
  if (value === "Contract Required") return t("verification.contractRequired");
  if (value === "Chain Unknown") return t("verification.chainUnknown");
  if (value === "Liquidity Unknown") return t("verification.liquidityUnknown");
  return t("verification.missingContext");
}
