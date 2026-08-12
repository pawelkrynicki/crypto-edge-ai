import React, { useEffect, useMemo, useState } from "react";
import {
  buildExternalVerificationTargets,
  normalizeExternalVerificationInput,
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
import {
  createManualVerificationPreview,
  loadManualVerificationOwnerStatus,
  saveManualVerification,
  type ManualVerificationOwnerStatus,
  type ManualVerificationPreview,
  type ManualVerificationRecord,
  type ManualVerificationVerdict,
} from "../services/manualOwnerActionsDataSource";
import { ActionButton, CopyButton, ExternalLinkAction } from "./ProductUi";
import { TokenDetailDrawer } from "./TokenDetailDrawer";
import { TokenDetailTabPanel, TokenDetailTabs } from "./TokenDetailTabs";
import { ResearchChecklistDetail, ResearchManualEvidencePanel } from "./ResearchChecklist";

const VERIFICATION_DRAWER_TAB_IDS = ["identity", "market", "filters", "security", "data", "decision"] as const;
export type VerificationDrawerTabId = (typeof VERIFICATION_DRAWER_TAB_IDS)[number];

interface ExternalVerificationLinksViewProps {
  candidate?: UiTokenCandidate | null;
  followUp?: FollowUpPublicEntry | null;
  onOpenResearchBrief?: () => void;
  onVerificationSaved?: (record: ManualVerificationRecord) => void;
  onReturnToDetail?: () => void;
  onClose?: () => void;
  /** Supports focused UI tests. A selected token always uses the identity tab. */
  initialActiveTab?: VerificationDrawerTabId;
  /** A compact playbook navigation target in the existing Data and sources tab. */
  focusedResearchStep?: ResearchStepNumber | null;
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
}) => {
  const { locale, t } = useProductLocale();
  const chain = candidate?.chain ?? followUp?.chain ?? "";
  const contractAddress = candidate?.contractAddress ?? followUp?.contract_address ?? "";
  const symbol = candidate?.symbol ?? followUp?.symbol ?? "";
  const displayName = candidate?.name ?? followUp?.display_name ?? "";
  const [activeTab, setActiveTab] = useState<VerificationDrawerTabId>(focusedResearchStep ? "data" : initialActiveTab);
  const [ownerStatus, setOwnerStatus] = useState<ManualVerificationOwnerStatus | null>(null);
  const [verdict, setVerdict] = useState<ManualVerificationVerdict>("NEEDS_MORE_DATA");
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState<ManualVerificationPreview | null>(null);
  const [identityConfirmation, setIdentityConfirmation] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [saveSucceeded, setSaveSucceeded] = useState(false);
  const [savedRecord, setSavedRecord] = useState<ManualVerificationRecord | null>(null);

  useEffect(() => {
    if (!chain || !contractAddress) return;
    let cancelled = false;
    void loadManualVerificationOwnerStatus(chain, contractAddress).then((value) => {
      if (cancelled) return;
      setOwnerStatus(value);
      if (value?.current_record) {
        setVerdict(value.current_record.verdict);
        setNote(value.current_record.note);
        setSavedRecord(value.current_record);
      }
    });
    return () => { cancelled = true; };
  }, [chain, contractAddress]);

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
  const missingData = ownerStatus?.missing_data ?? fallbackMissing;
  const availableData = ownerStatus?.available_data ?? fallbackAvailable;
  const expectedIdentity = `${chain}:${contractAddress}`;
  const canSave = Boolean(preview && preview.action_plan === "SAVE" && ownerStatus?.mode === "ENABLED" && ownerStatus.owner_actions_enabled && identityConfirmation === expectedIdentity && confirmed && !saving);
  const missingText = t("radar.missingData");
  const tabCopy = getVerificationTabCopy(locale);
  const market = {
    marketCap: candidate?.marketCap ?? followUp?.market_metrics.market_cap_usd ?? null,
    liquidity: candidate?.liquidity ?? followUp?.market_metrics.liquidity_usd ?? null,
    volume: candidate?.volume24h ?? followUp?.market_metrics.volume_24h_usd ?? null,
    volumeMarketCapRatio: candidate?.volumeMarketCapRatio ?? followUp?.market_metrics.volume_market_cap_ratio ?? null,
    pairAge: candidate?.pairAgeDays ?? followUp?.pair_age ?? null,
  };
  const filterResolution = resolveProductFilterConditions({
    basicFilterStatus: candidate?.basicFilterStatus ?? followUp?.filter_status ?? "not_checked",
    filterReasons: candidate?.filterReasons ?? followUp?.filter_reasons ?? [],
  });

  const prepareSave = async () => {
    if (note.trim().length < 3) return;
    setPreparing(true);
    setSaveError(false);
    setSaveSucceeded(false);
    setConfirmed(false);
    try {
      setPreview(await createManualVerificationPreview({ chain, contractAddress, verdict, note: note.trim() }));
    } catch {
      setPreview(null);
      setSaveError(true);
    } finally {
      setPreparing(false);
    }
  };

  const save = async () => {
    if (!preview || !canSave) return;
    setSaving(true);
    setSaveError(false);
    try {
      const result = await saveManualVerification(preview, { identityConfirmation, ownerReason: note.trim() });
      setSavedRecord(result.record);
      setOwnerStatus((current) => current ? { ...current, current_record: result.record } : current);
      setPreview(null);
      setConfirmed(false);
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
  const lastDecision = savedRecord ?? ownerStatus?.current_record ?? null;

  let activeContent: React.ReactNode;
  if (activeTab === "identity") {
    activeContent = (
      <VerificationSection heading={tabCopy.identity} detail={locale === "pl" ? "Potwierdź tożsamość tokena przed oceną danych i ryzyka." : "Confirm the token identity before evaluating market data and risk."}>
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
        </div>
      </VerificationSection>
    );
  } else if (activeTab === "filters") {
    activeContent = (
      <VerificationSection heading={tabCopy.filters} detail={locale === "pl" ? "Każdy filtr pokazuje osobno stan, aktualną wartość i obowiązujący próg." : "Each filter shows its own state, current value and threshold."}>
        <div className="filter-condition-grid verification-filter-rows">
          {filterResolution.conditions.map((condition) => <VerificationFilterRow key={condition.category} category={condition.category} state={condition.state} value={filterValue(condition.category, market, locale, missingText)} reasons={condition.failureReasons} locale={locale} />)}
        </div>
      </VerificationSection>
    );
  } else if (activeTab === "security") {
    activeContent = (
      <VerificationSection heading={tabCopy.security} detail={locale === "pl" ? "Brak kontroli jest pokazany jako brak danych — nie jako bezpieczny wynik." : "A missing control is shown as missing data, never as a safe result."}>
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
          <VerificationMetric label={t("verification.securityMetric")} value={securityResolution ? presentVerificationSecurityState(securityResolution.state, t) : (followUp?.security_status || missingText)} />
          <VerificationMetric label="Manual Verification Required" value={t("verification.manualOnly")} />
        </div>
        <p className="external-checks-eyebrow">{t("verification.securityManual")}</p>
        <div className="security-flag-list warning"><strong>{locale === "pl" ? "Brakujące kontrole" : "Missing controls"}</strong><div>{missingData.length > 0 ? missingData.map((item) => <span key={item}>{formatCoverageItem(item, locale)}</span>) : <span>{locale === "pl" ? "Brak zgłoszonych braków" : "No reported gaps"}</span>}</div></div>
      </VerificationSection>
    );
  } else if (activeTab === "data") {
    activeContent = (
      <VerificationSection heading={tabCopy.data} detail={locale === "pl" ? "Źródła są opisane i linkowane; otwarcie oraz zmiana zakładki nie wykonują połączeń do dostawców." : "Sources are described and linked; opening and switching tabs do not call providers."}>
        <div className="product-detail-grid data">
          <VerificationMetric label={locale === "pl" ? "Źródło danych rynkowych i filtrów" : "Market and filter source"} value={candidate ? formatProductSourceLabel(candidate.source) : "Follow-up"} />
          <VerificationMetric label={locale === "pl" ? "Timestamp danych" : "Data timestamp"} value={lastSeen ? formatProductDateTime(lastSeen, locale) : missingText} />
          <VerificationMetric label={locale === "pl" ? "Status źródła" : "Source status"} value={locale === "pl" ? "Migawka dostępna do ręcznej kontroli" : "Snapshot available for manual review"} />
          <VerificationMetric label={locale === "pl" ? "Źródła kontroli bezpieczeństwa" : "Security check sources"} value={securityResolution?.sources.map(formatProductSourceLabel).join(", ") || missingText} />
        </div>
        {candidate && <ResearchChecklistDetail candidate={candidate} focusedStep={focusedResearchStep} />}
        <div className="external-checks-list">{targets.map((target) => <ExternalCheckCard key={target.id} target={target} />)}</div>
        {onOpenResearchBrief && <section className="verification-ai-research-action" aria-label={locale === "pl" ? "Analiza badawcza AI" : "AI Research Brief"}><div><strong>{locale === "pl" ? "Analiza badawcza AI" : "AI Research Brief"}</strong><p>{locale === "pl" ? "Analiza AI uzupełnia, ale nie zastępuje ręcznej weryfikacji." : "AI analysis complements but does not replace manual verification."}</p></div><ActionButton variant="secondary" icon="arrow" iconPosition="end" onClick={onOpenResearchBrief}>{locale === "pl" ? "Otwórz analizę AI" : "Open AI analysis"}</ActionButton></section>}
      </VerificationSection>
    );
  } else {
    activeContent = (
      <VerificationSection heading={tabCopy.decision} detail={locale === "pl" ? "Zapis decyzji aktualizuje od razu Candidate Detail, bez opuszczania listy." : "Saving a decision updates Candidate Detail immediately without leaving the list."}>
        <div className="filter-condition-grid"><div className="condition-list ready"><strong>{locale === "pl" ? "Dostępne" : "Available"}</strong><ul>{availableData.map((item) => <li key={item}>{formatCoverageItem(item, locale)}</li>)}</ul></div><div className="condition-list warning"><strong>{locale === "pl" ? "Brakujące" : "Missing"}</strong>{missingData.length > 0 ? <ul>{missingData.map((item) => <li key={item}>{formatCoverageItem(item, locale)}</li>)}</ul> : <p>{locale === "pl" ? "Brak" : "None"}</p>}</div></div>
        {lastDecision && <p role="status" data-verification-verdict={lastDecision.verdict}>{locale === "pl" ? `Ostatnia decyzja: ${lastDecision.verdict} (${formatProductDateTime(lastDecision.checked_at, locale)})` : `Last decision: ${lastDecision.verdict} (${formatProductDateTime(lastDecision.checked_at, locale)})`}</p>}
        {ownerStatus && <section className="verification-research-section owner-verification-decision" aria-labelledby="verification-decision-heading"><header><div><h3 id="verification-decision-heading">{locale === "pl" ? "Zapisz decyzję ownera" : "Save owner decision"}</h3></div></header><label><span>{locale === "pl" ? "Werdykt" : "Verdict"}</span><select value={verdict} onChange={(event) => { setVerdict(event.target.value as ManualVerificationVerdict); setPreview(null); }}><option value="VERIFIED">VERIFIED</option><option value="NEEDS_MORE_DATA">NEEDS_MORE_DATA</option><option value="CRITICAL_RISK">CRITICAL_RISK</option><option value="REJECT">REJECT</option></select></label><label><span>{locale === "pl" ? "Krótka notatka ownera" : "Short owner note"}</span><textarea value={note} onChange={(event) => { setNote(event.target.value); setPreview(null); }} minLength={3} maxLength={500} /></label><ActionButton variant="secondary" onClick={() => void prepareSave()} loading={preparing} disabled={note.trim().length < 3}>{locale === "pl" ? "Przygotuj zapis decyzji" : "Prepare decision save"}</ActionButton>{preview && <div className="owner-decision-confirmation"><p>{locale === "pl" ? `Potwierdź dokładną tożsamość: ${expectedIdentity}` : `Confirm the exact identity: ${expectedIdentity}`}</p><input aria-label={locale === "pl" ? "Potwierdzenie tożsamości" : "Identity confirmation"} value={identityConfirmation} onChange={(event) => setIdentityConfirmation(event.target.value)} autoComplete="off" /><label className="owner-confirmation"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>{locale === "pl" ? "Potwierdzam werdykt i zapis w audycie." : "I confirm the verdict and audit record."}</span></label><ActionButton variant="primary" onClick={() => void save()} loading={saving} disabled={!canSave}>{locale === "pl" ? "Zapisz status weryfikacji" : "Save verification status"}</ActionButton></div>}{saveError && <p role="alert">{locale === "pl" ? "Nie zapisano decyzji. Przygotuj nowy zapis i spróbuj ponownie." : "The decision was not saved. Prepare a new save and try again."}</p>}</section>}
        <section className="verification-return" aria-labelledby="verification-return-heading"><div><h3 id="verification-return-heading">{locale === "pl" ? "Powrót do Candidate Detail" : "Return to Candidate Detail"}</h3><p>{locale === "pl" ? "Lista Weryfikacji pozostaje zachowana po powrocie." : "The Verification list remains intact when returning."}</p></div><ActionButton variant="primary" icon="arrow" iconPosition="end" className="product-primary-button" onClick={() => { if (onReturnToDetail) onReturnToDetail(); else if (savedRecord) onVerificationSaved?.(savedRecord); else if (typeof window !== "undefined") window.location.hash = "candidate-detail"; }}>{locale === "pl" ? "Wróć do szczegółów" : "Return to detail"}</ActionButton></section>
      </VerificationSection>
    );
  }

  if (activeTab === "decision") {
    activeContent = (
      <VerificationDecision
        candidate={candidate}
        locale={locale}
        lastDecision={lastDecision}
        verdict={verdict}
        onVerdictChange={(value) => { setVerdict(value); setPreview(null); setSaveSucceeded(false); }}
        note={note}
        onNoteChange={(value) => { setNote(value); setPreview(null); setSaveSucceeded(false); }}
        availableData={availableData}
        missingData={missingData}
        ownerStatus={ownerStatus}
        preparing={preparing}
        preview={preview}
        identityConfirmation={identityConfirmation}
        onIdentityConfirmationChange={setIdentityConfirmation}
        confirmed={confirmed}
        onConfirmedChange={setConfirmed}
        canSave={canSave}
        saving={saving}
        saveError={saveError}
        saveSucceeded={saveSucceeded}
        expectedIdentity={expectedIdentity}
        onPrepare={prepareSave}
        onSave={save}
        onReturnToDetail={onReturnToDetail}
        onVerificationSaved={onVerificationSaved}
        savedRecord={savedRecord}
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
      <TokenDetailTabPanel activeTab={activeTab} idPrefix="verification"><div className="external-checks-view product-verification verification-tab-content">{activeContent}</div></TokenDetailTabPanel>
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
  ownerStatus,
  preparing,
  preview,
  identityConfirmation,
  onIdentityConfirmationChange,
  confirmed,
  onConfirmedChange,
  canSave,
  saving,
  saveError,
  saveSucceeded,
  expectedIdentity,
  onPrepare,
  onSave,
  onReturnToDetail,
  onVerificationSaved,
  savedRecord,
}: {
  candidate: UiTokenCandidate | null | undefined;
  locale: ProductLocale;
  lastDecision: ManualVerificationRecord | null;
  verdict: ManualVerificationVerdict;
  onVerdictChange: (value: ManualVerificationVerdict) => void;
  note: string;
  onNoteChange: (value: string) => void;
  availableData: string[];
  missingData: string[];
  ownerStatus: ManualVerificationOwnerStatus | null;
  preparing: boolean;
  preview: ManualVerificationPreview | null;
  identityConfirmation: string;
  onIdentityConfirmationChange: (value: string) => void;
  confirmed: boolean;
  onConfirmedChange: (value: boolean) => void;
  canSave: boolean;
  saving: boolean;
  saveError: boolean;
  saveSucceeded: boolean;
  expectedIdentity: string;
  onPrepare: () => Promise<void>;
  onSave: () => Promise<void>;
  onReturnToDetail?: () => void;
  onVerificationSaved?: (record: ManualVerificationRecord) => void;
  savedRecord: ManualVerificationRecord | null;
}) {
  const pl = locale === "pl";
  return (
    <VerificationSection heading={pl ? "Decyzja weryfikacyjna" : "Verification decision"} detail={pl ? "Zapis decyzji aktualizuje od razu Candidate Detail, bez opuszczania listy." : "Saving a decision updates Candidate Detail immediately without leaving the list."}>
      <section className="verification-decision-current" aria-label={pl ? "Aktualny status weryfikacji" : "Current verification status"}>
        <span>{pl ? "Aktualny status weryfikacji" : "Current verification status"}</span>
        <strong data-verification-verdict={lastDecision?.verdict}>{lastDecision ? manualVerificationVerdictLabel(lastDecision.verdict, locale) : (pl ? "Brak zapisanej decyzji" : "No saved decision")}</strong>
        {lastDecision && <p>{pl ? `Ostatnia decyzja: ${formatProductDateTime(lastDecision.checked_at, locale)}` : `Last decision: ${formatProductDateTime(lastDecision.checked_at, locale)}`}</p>}
      </section>

      <div className="verification-decision-options" role="radiogroup" aria-label={pl ? "Wybierz decyzję weryfikacyjną" : "Choose verification decision"}>
        {(["VERIFIED", "NEEDS_MORE_DATA", "CRITICAL_RISK", "REJECT"] as const).map((option) => (
          <button key={option} type="button" role="radio" aria-checked={verdict === option} className={verdict === option ? "selected" : ""} onClick={() => onVerdictChange(option)}>
            {manualVerificationVerdictLabel(option, locale)}
          </button>
        ))}
      </div>

      <label className="verification-decision-note"><span>{pl ? "Krótka notatka ownera" : "Short owner note"}</span><textarea value={note} onChange={(event) => onNoteChange(event.target.value)} minLength={3} maxLength={500} rows={4} /></label>

      <section className="verification-decision-impact"><strong>{pl ? "Podsumowanie skutków decyzji" : "Decision impact summary"}</strong><p>{decisionImpactCopy(verdict, locale)}</p></section>

      <section className="verification-decision-coverage"><div className="condition-list ready"><strong>{pl ? "Dostępne" : "Available"}</strong><ul>{availableData.map((item) => <li key={item}>{formatCoverageItem(item, locale)}</li>)}</ul></div><div className="condition-list warning"><strong>{pl ? "Brakujące" : "Missing"}</strong>{missingData.length > 0 ? <ul>{missingData.map((item) => <li key={item}>{formatCoverageItem(item, locale)}</li>)}</ul> : <p>{pl ? "Brak" : "None"}</p>}</div></section>

      {candidate && <ResearchManualEvidencePanel candidate={candidate} />}

      {ownerStatus && <section className="owner-verification-decision" aria-labelledby="verification-decision-heading"><header><h3 id="verification-decision-heading">{pl ? "Potwierdzenie zapisu" : "Save confirmation"}</h3></header><ActionButton variant="primary" onClick={() => void onPrepare()} loading={preparing} disabled={note.trim().length < 3}>{pl ? "Zapisz decyzję" : "Save decision"}</ActionButton>{preview && <div className="owner-decision-confirmation"><p>{pl ? `Potwierdź dokładną tożsamość: ${expectedIdentity}` : `Confirm the exact identity: ${expectedIdentity}`}</p><input aria-label={pl ? "Potwierdzenie tożsamości" : "Identity confirmation"} value={identityConfirmation} onChange={(event) => onIdentityConfirmationChange(event.target.value)} autoComplete="off" /><label className="owner-confirmation"><input type="checkbox" checked={confirmed} onChange={(event) => onConfirmedChange(event.target.checked)} /><span>{pl ? "Potwierdzam werdykt i zapis w audycie." : "I confirm the verdict and audit record."}</span></label><ActionButton variant="primary" onClick={() => void onSave()} loading={saving} disabled={!canSave}>{pl ? "Zapisz status weryfikacji" : "Save verification status"}</ActionButton></div>}{saveError && <p role="alert">{pl ? "Nie zapisano decyzji. Przygotuj nowy zapis i spróbuj ponownie." : "The decision was not saved. Prepare a new save and try again."}</p>}</section>}

      {saveSucceeded && lastDecision && <p className="verification-decision-saved" role="status" data-verification-verdict={lastDecision.verdict}>{pl ? `Zapisano decyzję: ${manualVerificationVerdictLabel(lastDecision.verdict, locale)}` : `Saved decision: ${manualVerificationVerdictLabel(lastDecision.verdict, locale)}`}</p>}

      <section className="verification-return" aria-labelledby="verification-return-heading"><div><h3 id="verification-return-heading">{pl ? "Powrót do Candidate Detail" : "Return to Candidate Detail"}</h3><p>{pl ? "Lista Weryfikacji pozostaje zachowana po powrocie." : "The Verification list remains intact when returning."}</p></div><ActionButton variant="primary" icon="arrow" iconPosition="end" className="product-primary-button" onClick={() => { if (onReturnToDetail) onReturnToDetail(); else if (savedRecord) onVerificationSaved?.(savedRecord); else if (typeof window !== "undefined") window.location.hash = "candidate-detail"; }}>{pl ? "Wróć do szczegółów" : "Return to detail"}</ActionButton></section>
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

function VerificationFilterRow({ category, state, value, reasons, locale }: { category: BasicFilterCategory; state: BasicFilterConditionState; value: string; reasons: string[]; locale: ProductLocale }) {
  const copy = filterCopy(category, locale);
  const stateLabel = state === "passed" ? locale === "pl" ? "Spełniony" : "Passed" : state === "failed" ? locale === "pl" ? "Niespełniony" : "Failed" : locale === "pl" ? "Brak danych" : "Missing data";
  return <article className={`condition-list ${state === "passed" ? "ready" : state === "failed" ? "warning" : "neutral"}`}><strong>{copy.label}</strong><p>{stateLabel}</p><dl><div><dt>{locale === "pl" ? "Wartość" : "Value"}</dt><dd>{value}</dd></div><div><dt>{locale === "pl" ? "Próg" : "Threshold"}</dt><dd>{copy.threshold}</dd></div></dl>{reasons.length > 0 && <p>{reasons.join(", ")}</p>}</article>;
}

function ExternalCheckCard({ target }: { target: ExternalVerificationTarget }) {
  const { t } = useProductLocale();
  const copyValue = target.copyValue ?? "";
  const copyLabelKey = target.copyLabel === "Copy Pair Address" ? "verification.copyPair" : target.copyLabel === "Copy Link" ? "verification.copyLink" : target.copyLabel === "Copy Token Input" ? "verification.copyInput" : "verification.copyContract";
  const labelKey = target.id === "explorer" ? "verification.networkExplorer" : target.id === "dex" ? "verification.dexScreener" : target.id === "source" ? "verification.recordSourceLabel" : "verification.securityManual";
  const titleKey = target.id === "explorer" ? "verification.explorerTitle" : target.id === "dex" ? "verification.dexTitle" : target.id === "source" ? "verification.sourceTitle" : "verification.securityTitle";
  const explanationKey = target.id === "explorer" ? "verification.explorerExplanation" : target.id === "dex" ? "verification.dexExplanation" : target.id === "source" ? "verification.sourceExplanation" : "verification.securityExplanation";
  const title = t(titleKey);
  return <article className={`external-check-card ${target.state === "manual" ? "manual" : ""}`}><div className="external-check-card-main"><span className="external-checks-eyebrow">{t(labelKey)}</span><h4>{title}</h4><p>{target.state === "link" ? t(explanationKey) : translateStatus(target.status, t)}</p></div><div className="external-check-card-status"><span>{t("verification.status")}</span><strong>{target.state === "link" ? t("verification.allowlisted") : translateStatus(target.status, t)}</strong>{target.state === "manual" && <p>{t("verification.manualMissing")}</p>}</div><div className="external-check-actions">{target.href ? <ExternalLinkAction variant="secondary" className="external-check-link" href={target.href} aria-label={t("verification.openSourceLabel", { source: title })}>{t("verification.openSource")}</ExternalLinkAction> : <span className="external-check-disabled" aria-disabled="true">{t("verification.sourceUnavailable")}</span>}{copyValue && <CopyButton className="external-check-copy-button" value={copyValue} label={t(copyLabelKey)} copiedLabel={t("app.copied")} />}</div></article>;
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
  return { symbol: candidate?.symbol ?? followUp?.symbol ?? "", projectName: candidate?.name ?? followUp?.display_name ?? "", chain: candidate?.chain ?? followUp?.chain ?? "", contractAddress: candidate?.contractAddress ?? followUp?.contract_address ?? "", pairAddress: candidate?.pairAddress ?? "", sourceUrl: candidate?.sourceUrl ?? "", tokenInput: candidate?.contractAddress ?? followUp?.contract_address ?? "" };
}

function formatCoverageItem(value: string, locale: ProductLocale): string {
  const labels: Record<string, [string, string]> = { chain: ["Network", "Sieć"], contract_address: ["Contract address", "Adres kontraktu"], symbol: ["Symbol", "Symbol"], display_name: ["Name", "Nazwa"], liquidity: ["Liquidity", "Płynność"], market_cap: ["Market cap", "Kapitalizacja"], volume_24h: ["24h volume", "Wolumen 24 h"], security_data: ["Security data", "Dane bezpieczeństwa"], security_not_checked: ["Security check", "Sprawdzenie bezpieczeństwa"], liquidity_missing: ["Liquidity", "Płynność"], market_cap_missing: ["Market cap", "Kapitalizacja"], volume_24h_missing: ["24h volume", "Wolumen 24 h"] };
  return (labels[value] ?? [value, value])[locale === "pl" ? 1 : 0];
}

function translateStatus(value: string, t: ReturnType<typeof useProductLocale>["t"]): string {
  if (value === "Contract Required") return t("verification.contractRequired");
  if (value === "Chain Unknown") return t("verification.chainUnknown");
  if (value === "Liquidity Unknown") return t("verification.liquidityUnknown");
  return t("verification.missingContext");
}
