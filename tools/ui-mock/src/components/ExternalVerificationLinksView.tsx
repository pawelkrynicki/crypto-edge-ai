import React, { useEffect, useMemo, useState } from "react";
import {
  buildExternalVerificationTargets,
  normalizeExternalVerificationInput,
  type ExternalVerificationInput,
  type ExternalVerificationTarget,
} from "../externalVerificationTargets";
import { formatProductUsd, useProductLocale } from "../productI18n";
import { formatProductSourceLabel } from "../productPresentation";
import { resolveProductSecurityState, type ProductSecurityState } from "../productSecurityResolver";
import type { UiTokenCandidate } from "../types/scannerTypes";
import type { FollowUpPublicEntry } from "../types/followUpTypes";
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

interface ExternalVerificationLinksViewProps {
  candidate?: UiTokenCandidate | null;
  followUp?: FollowUpPublicEntry | null;
  onOpenResearchBrief?: () => void;
  onVerificationSaved?: (record: ManualVerificationRecord) => void;
  onReturnToDetail?: () => void;
}

export const ExternalVerificationLinksView: React.FC<ExternalVerificationLinksViewProps> = ({
  candidate,
  followUp,
  onOpenResearchBrief,
  onVerificationSaved,
  onReturnToDetail,
}) => {
  const { locale, t } = useProductLocale();
  const ui = VERIFICATION_UI_COPY[locale];
  const chain = candidate?.chain ?? followUp?.chain ?? "";
  const contractAddress = candidate?.contractAddress ?? followUp?.contract_address ?? "";
  const symbol = candidate?.symbol ?? followUp?.symbol ?? "";
  const displayName = candidate?.name ?? followUp?.display_name ?? "";
  const [ownerStatus, setOwnerStatus] = useState<ManualVerificationOwnerStatus | null>(null);
  const [verdict, setVerdict] = useState<ManualVerificationVerdict>("NEEDS_MORE_DATA");
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState<ManualVerificationPreview | null>(null);
  const [identityConfirmation, setIdentityConfirmation] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
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
    return (
      <section className="basket-state empty">
        <span>{t("verification.eyebrow")}</span>
        <h3>{t("verification.noneTitle")}</h3>
        <p>{t("verification.noneDetail")}</p>
      </section>
    );
  }

  const input = buildInput(candidate, followUp);
  const normalizedInput = normalizeExternalVerificationInput(input);
  const targets = buildExternalVerificationTargets(input);
  const securityResolution = candidate ? resolveProductSecurityState(candidate) : null;
  const missingData = ownerStatus?.missing_data ?? fallbackMissing;
  const availableData = ownerStatus?.available_data ?? fallbackAvailable;
  const expectedIdentity = `${chain}:${contractAddress}`;
  const canSave = Boolean(preview
    && preview.action_plan === "SAVE"
    && ownerStatus?.mode === "ENABLED"
    && ownerStatus.owner_actions_enabled
    && identityConfirmation === expectedIdentity
    && confirmed
    && !saving);

  const prepareSave = async () => {
    if (note.trim().length < 3) return;
    setPreparing(true);
    setSaveError(false);
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
      const result = await saveManualVerification(preview, {
        identityConfirmation,
        ownerReason: note.trim(),
      });
      setSavedRecord(result.record);
      setOwnerStatus((current) => current ? { ...current, current_record: result.record } : current);
      setPreview(null);
      setConfirmed(false);
      onVerificationSaved?.(result.record);
    } catch {
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="external-checks-view product-verification">
      <section className="external-checks-hero">
        <div className="external-checks-hero-copy">
          <span className="external-checks-eyebrow">{t("verification.manualEyebrow")}</span>
          <h3>{symbol || t("radar.missingData")} <small>{displayName}</small></h3>
          <p>{t("verification.intro")}</p>
        </div>
        <div className="external-checks-boundary">
          <strong>{t("detail.boundaryManual")}</strong>
          <span>{t("verification.boundary")}</span>
        </div>
      </section>

      <section className="verification-identity" aria-labelledby="verification-identity-heading">
        <header><span>01</span><div><h3 id="verification-identity-heading">{t("verification.identity")}</h3><p>{ui.identityHelp}</p></div></header>
        <div><span>{t("verification.network")}</span><strong>{normalizedInput.chain || t("radar.missingData")}</strong></div>
        <div><span>{locale === "pl" ? "Nazwa" : "Name"}</span><strong>{displayName || t("radar.missingData")}</strong></div>
        <div><span>{locale === "pl" ? "Symbol" : "Symbol"}</span><strong>{symbol || t("radar.missingData")}</strong></div>
        <div className="verification-contract">
          <span>{t("verification.contractAddress")}</span>
          <code title={normalizedInput.contractAddress}>{normalizedInput.contractAddress || t("radar.missingData")}</code>
          {normalizedInput.contractAddress && (
            <CopyButton value={normalizedInput.contractAddress} label={t("verification.copyContract")} copiedLabel={t("app.copied")} />
          )}
        </div>
        <div className="verification-contract">
          <span>{t("verification.pairAddress")}</span>
          <code title={normalizedInput.pairAddress}>{normalizedInput.pairAddress || t("radar.missingData")}</code>
          {normalizedInput.pairAddress && (
            <CopyButton value={normalizedInput.pairAddress} label={t("verification.copyPair")} copiedLabel={t("app.copied")} />
          )}
        </div>
        <div><span>{t("verification.recordSource")}</span><strong>{candidate ? formatProductSourceLabel(candidate.source) : "Follow-up"}</strong></div>
      </section>

      {onOpenResearchBrief && (
        <section className="verification-ai-research-action" aria-label={locale === "pl" ? "Analiza badawcza AI" : "AI Research Brief"}>
          <div>
            <strong>{locale === "pl" ? "Analiza badawcza AI" : "AI Research Brief"}</strong>
            <p>{locale === "pl" ? "Analiza AI uzupełnia, ale nie zastępuje ręcznej weryfikacji." : "AI analysis complements but does not replace manual verification."}</p>
          </div>
          <ActionButton variant="secondary" icon="arrow" iconPosition="end" onClick={onOpenResearchBrief}>
            {locale === "pl" ? "Otwórz analizę AI" : "Open AI analysis"}
          </ActionButton>
        </section>
      )}

      <section className="verification-research-section" aria-labelledby="verification-market-heading">
        <header><span>02</span><div><h3 id="verification-market-heading">{ui.marketData}</h3><p>{ui.marketDataHelp}</p></div></header>
        <div className="external-checks-review-grid">
          <VerificationMetric label={ui.marketCap} value={formatProductUsd(candidate?.marketCap ?? followUp?.market_metrics.market_cap_usd ?? null, locale, t("radar.missingData"))} />
          <VerificationMetric label={ui.liquidity} value={formatProductUsd(candidate?.liquidity ?? followUp?.market_metrics.liquidity_usd ?? null, locale, t("radar.missingData"))} />
          <VerificationMetric label={ui.volume} value={formatProductUsd(candidate?.volume24h ?? followUp?.market_metrics.volume_24h_usd ?? null, locale, t("radar.missingData"))} />
        </div>
      </section>

      <section className="verification-research-section" aria-labelledby="verification-contract-heading">
        <header><span>03</span><div><h3 id="verification-contract-heading">{ui.contractExplorer}</h3><p>{ui.contractExplorerHelp}</p></div></header>
        <div className="external-checks-list">
          {targets.filter((target) => target.id === "explorer" || target.id === "dex").map((target) => <ExternalCheckCard key={target.id} target={target} />)}
        </div>
      </section>

      <section className="verification-research-section" aria-labelledby="verification-security-heading">
        <header><span>04</span><div><h3 id="verification-security-heading">{ui.securityStatus}</h3><p>{ui.securityStatusHelp}</p></div></header>
        <div className="external-checks-review-grid">
          <VerificationMetric label={t("verification.securityMetric")} value={securityResolution ? presentVerificationSecurityState(securityResolution.state, t) : (followUp?.security_status ?? t("radar.missingData"))} />
          <VerificationMetric label={t("verification.decision")} value={t("verification.manualOnly")} />
        </div>
      </section>

      <section className="verification-research-section" aria-labelledby="verification-sources-heading">
        <header><span>05</span><div><h3 id="verification-sources-heading">{ui.externalSources}</h3><p>{t("verification.whatOpensDetail")}</p></div></header>
        <div className="external-checks-list">
          {targets.filter((target) => target.id === "source" || target.id === "security").map((target) => <ExternalCheckCard key={target.id} target={target} />)}
        </div>
      </section>

      <section className="external-checks-review-panel verification-checklist" aria-labelledby="verification-checklist-heading">
        <div><span className="external-checks-eyebrow">06</span><h3 id="verification-checklist-heading">{ui.manualChecklist}</h3><p>{t("verification.compareDetail")}</p></div>
        <ol>{ui.checklist.map((item) => <li key={item}>{item}</li>)}</ol>
      </section>

      <section className="verification-research-section verification-data-coverage" aria-labelledby="verification-coverage-heading">
        <header><span>07</span><div><h3 id="verification-coverage-heading">{locale === "pl" ? "Kompletność przed decyzją" : "Decision data coverage"}</h3><p>{locale === "pl" ? "Sprawdź jawnie, co jest dostępne, a czego nadal brakuje." : "Review explicitly what is available and what is still missing."}</p></div></header>
        <div className="filter-condition-grid">
          <div className="condition-list ready"><strong>{locale === "pl" ? "Dostępne" : "Available"}</strong><ul>{availableData.map((item) => <li key={item}>{formatCoverageItem(item, locale)}</li>)}</ul></div>
          <div className="condition-list warning"><strong>{locale === "pl" ? "Brakujące" : "Missing"}</strong>{missingData.length > 0 ? <ul>{missingData.map((item) => <li key={item}>{formatCoverageItem(item, locale)}</li>)}</ul> : <p>{locale === "pl" ? "Brak" : "None"}</p>}</div>
        </div>
      </section>

      {ownerStatus && (
        <section className="verification-research-section owner-verification-decision" aria-labelledby="verification-decision-heading">
          <header><span>08</span><div><h3 id="verification-decision-heading">{locale === "pl" ? "Zapisz decyzję właściciela" : "Save owner decision"}</h3><p>{locale === "pl" ? "Wynik zostanie zapisany w historii Follow-up i od razu pokaże się w szczegółach tokena." : "The result is stored in Follow-up history and appears immediately in token details."}</p></div></header>
          <label><span>{locale === "pl" ? "Werdykt" : "Verdict"}</span>
            <select value={verdict} onChange={(event) => { setVerdict(event.target.value as ManualVerificationVerdict); setPreview(null); }}>
              <option value="VERIFIED">VERIFIED</option>
              <option value="NEEDS_MORE_DATA">NEEDS_MORE_DATA</option>
              <option value="CRITICAL_RISK">CRITICAL_RISK</option>
              <option value="REJECT">REJECT</option>
            </select>
          </label>
          <label><span>{locale === "pl" ? "Notatka i uzasadnienie" : "Note and rationale"}</span><textarea value={note} onChange={(event) => { setNote(event.target.value); setPreview(null); }} minLength={3} maxLength={500} /></label>
          <ActionButton variant="secondary" onClick={() => void prepareSave()} loading={preparing} disabled={note.trim().length < 3}>{locale === "pl" ? "Przygotuj zapis decyzji" : "Prepare decision save"}</ActionButton>
          {preview && (
            <div className="owner-decision-confirmation">
              <p>{locale === "pl" ? `Potwierdź dokładną tożsamość: ${expectedIdentity}` : `Confirm the exact identity: ${expectedIdentity}`}</p>
              <input aria-label={locale === "pl" ? "Potwierdzenie tożsamości" : "Identity confirmation"} value={identityConfirmation} onChange={(event) => setIdentityConfirmation(event.target.value)} autoComplete="off" />
              <label className="owner-confirmation"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>{locale === "pl" ? "Potwierdzam werdykt i zapis w audycie." : "I confirm the verdict and audit record."}</span></label>
              <ActionButton variant="primary" onClick={() => void save()} loading={saving} disabled={!canSave}>{locale === "pl" ? "Zapisz status weryfikacji" : "Save verification status"}</ActionButton>
            </div>
          )}
          {saveError && <p role="alert">{locale === "pl" ? "Nie zapisano decyzji. Przygotuj nowy zapis i spróbuj ponownie." : "The decision was not saved. Prepare a new save and try again."}</p>}
          {savedRecord && <p role="status" data-verification-verdict={savedRecord.verdict}>{locale === "pl" ? `Zapisany status: ${savedRecord.verdict}` : `Saved status: ${savedRecord.verdict}`}</p>}
        </section>
      )}

      <section className="verification-return" aria-labelledby="verification-return-heading">
        <div><span className="external-checks-eyebrow">09</span><h3 id="verification-return-heading">{ui.returnTitle}</h3><p>{ui.returnHelp}</p></div>
        <ActionButton variant="primary" icon="arrow" iconPosition="end" className="product-primary-button" onClick={() => {
          if (savedRecord) onVerificationSaved?.(savedRecord);
          else if (onReturnToDetail) onReturnToDetail();
          else if (typeof window !== "undefined") window.location.hash = "candidate-detail";
        }}>{ui.returnAction}</ActionButton>
      </section>
    </div>
  );
};

function ExternalCheckCard({ target }: { target: ExternalVerificationTarget }) {
  const { t } = useProductLocale();
  const copyValue = target.copyValue ?? "";
  const copyLabelKey = target.copyLabel === "Copy Pair Address"
    ? "verification.copyPair"
    : target.copyLabel === "Copy Link"
      ? "verification.copyLink"
      : target.copyLabel === "Copy Token Input"
        ? "verification.copyInput"
        : "verification.copyContract";
  const labelKey = target.id === "explorer"
    ? "verification.networkExplorer"
    : target.id === "dex"
      ? "verification.dexScreener"
      : target.id === "source"
        ? "verification.recordSourceLabel"
        : "verification.securityManual";
  const titleKey = target.id === "explorer"
    ? "verification.explorerTitle"
    : target.id === "dex"
      ? "verification.dexTitle"
      : target.id === "source"
        ? "verification.sourceTitle"
        : "verification.securityTitle";
  const explanationKey = target.id === "explorer"
    ? "verification.explorerExplanation"
    : target.id === "dex"
      ? "verification.dexExplanation"
      : target.id === "source"
        ? "verification.sourceExplanation"
        : "verification.securityExplanation";
  const title = t(titleKey);

  return (
    <article className={`external-check-card ${target.state === "manual" ? "manual" : ""}`}>
      <div className="external-check-card-main">
        <span className="external-checks-eyebrow">{t(labelKey)}</span>
        <h4>{title}</h4>
        <p>{target.state === "link" ? t(explanationKey) : translateStatus(target.status, t)}</p>
      </div>
      <div className="external-check-card-status">
        <span>{t("verification.status")}</span>
        <strong>{target.state === "link" ? t("verification.allowlisted") : translateStatus(target.status, t)}</strong>
        {target.state === "manual" && <p>{t("verification.manualMissing")}</p>}
      </div>
      <div className="external-check-actions">
        {target.href ? (
          <ExternalLinkAction variant="secondary" className="external-check-link" href={target.href} aria-label={t("verification.openSourceLabel", { source: title })}>
            {t("verification.openSource")}
          </ExternalLinkAction>
        ) : (
          <span className="external-check-disabled" aria-disabled="true">{t("verification.sourceUnavailable")}</span>
        )}
        {copyValue && <CopyButton className="external-check-copy-button" value={copyValue} label={t(copyLabelKey)} copiedLabel={t("app.copied")} />}
      </div>
    </article>
  );
}

function VerificationMetric({ label, value }: { label: string; value: string }) {
  return <div className="external-check-metric manual"><span>{label}</span><strong>{value}</strong></div>;
}

function presentVerificationSecurityState(
  state: ProductSecurityState,
  t: ReturnType<typeof useProductLocale>["t"],
): string {
  if (state === "not_invoked") return t("verification.securityStateNotInvoked");
  if (state === "unavailable") return t("verification.securityStateUnavailable");
  if (state === "partial") return t("verification.securityStatePartial");
  if (state === "checked_needs_manual_review") return t("verification.securityStateNeedsReview");
  if (state === "checked_critical") return t("verification.securityStateCritical");
  return t("verification.securityStateChecked");
}

function buildInput(candidate?: UiTokenCandidate | null, followUp?: FollowUpPublicEntry | null): ExternalVerificationInput {
  return {
    symbol: candidate?.symbol ?? followUp?.symbol ?? "",
    projectName: candidate?.name ?? followUp?.display_name ?? "",
    chain: candidate?.chain ?? followUp?.chain ?? "",
    contractAddress: candidate?.contractAddress ?? followUp?.contract_address ?? "",
    pairAddress: candidate?.pairAddress ?? "",
    sourceUrl: candidate?.sourceUrl ?? "",
    tokenInput: candidate?.contractAddress ?? followUp?.contract_address ?? "",
  };
}

function formatCoverageItem(value: string, locale: "pl" | "en"): string {
  const labels: Record<string, [string, string]> = {
    chain: ["Network", "Sieć"],
    contract_address: ["Contract address", "Adres kontraktu"],
    symbol: ["Symbol", "Symbol"],
    display_name: ["Name", "Nazwa"],
    liquidity: ["Liquidity", "Płynność"],
    market_cap: ["Market cap", "Kapitalizacja"],
    volume_24h: ["24h volume", "Wolumen 24 h"],
    security_data: ["Security data", "Dane bezpieczeństwa"],
    security_not_checked: ["Security check", "Sprawdzenie bezpieczeństwa"],
    liquidity_missing: ["Liquidity", "Płynność"],
    market_cap_missing: ["Market cap", "Kapitalizacja"],
    volume_24h_missing: ["24h volume", "Wolumen 24 h"],
  };
  return (labels[value] ?? [value, value])[locale === "pl" ? 1 : 0];
}

function translateStatus(
  value: string,
  t: ReturnType<typeof useProductLocale>["t"],
): string {
  if (value === "Contract Required") return t("verification.contractRequired");
  if (value === "Chain Unknown") return t("verification.chainUnknown");
  if (value === "Liquidity Unknown") return t("verification.liquidityUnknown");
  return t("verification.missingContext");
}

const VERIFICATION_UI_COPY = {
  pl: {
    identityHelp: "Potwierdź nazwę, sieć i adres przed porównaniem innych źródeł.",
    marketData: "Dane rynkowe",
    marketDataHelp: "Punkt odniesienia z bieżącej migawki; wartości mogą się zmieniać.",
    marketCap: "Kapitalizacja",
    liquidity: "Płynność",
    volume: "Wolumen 24 h",
    contractExplorer: "Kontrakt i eksplorator",
    contractExplorerHelp: "Otwórz ręcznie dozwolone źródła i porównaj identyfikatory.",
    securityStatus: "Status bezpieczeństwa",
    securityStatusHelp: "Brak zgłoszonej flagi nie oznacza bezpieczeństwa ani zatwierdzenia.",
    externalSources: "Źródła zewnętrzne",
    manualChecklist: "Lista ręcznej weryfikacji",
    checklist: [
      "Porównaj nazwę, symbol, sieć i adres kontraktu.",
      "Sprawdź płynność, wolumen i wiek pary w niezależnym źródle.",
      "Oceń dostępne dane bezpieczeństwa i każdą lukę informacyjną.",
      "Traktuj wynik jako materiał badawczy, nie rekomendację inwestycyjną.",
    ],
    returnTitle: "Powrót do projektu",
    returnHelp: "Wróć do szczegółu po zakończeniu ręcznego porównania.",
    returnAction: "Wróć do szczegółów",
  },
  en: {
    identityHelp: "Confirm the name, network and address before comparing other sources.",
    marketData: "Market data",
    marketDataHelp: "A reference from the current snapshot; values may change.",
    marketCap: "Market cap",
    liquidity: "Liquidity",
    volume: "24h volume",
    contractExplorer: "Contract and explorer",
    contractExplorerHelp: "Open allowlisted sources manually and compare identifiers.",
    securityStatus: "Security status",
    securityStatusHelp: "No reported flag means neither safety nor approval.",
    externalSources: "External sources",
    manualChecklist: "Manual checklist",
    checklist: [
      "Compare the name, symbol, network and contract address.",
      "Check liquidity, volume and pair age in an independent source.",
      "Assess reported security data and every information gap.",
      "Treat the result as research material, not investment advice.",
    ],
    returnTitle: "Return to project",
    returnHelp: "Return to the detail view after completing the manual comparison.",
    returnAction: "Return to detail",
  },
} as const;
