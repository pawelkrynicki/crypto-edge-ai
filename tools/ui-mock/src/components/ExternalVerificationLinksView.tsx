import React from "react";
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

interface ExternalVerificationLinksViewProps {
  candidate?: UiTokenCandidate | null;
}

export const ExternalVerificationLinksView: React.FC<ExternalVerificationLinksViewProps> = ({ candidate }) => {
  const { locale, t } = useProductLocale();
  const ui = VERIFICATION_UI_COPY[locale];
  if (!candidate) {
    return (
      <section className="basket-state empty">
        <span>{t("verification.eyebrow")}</span>
        <h3>{t("verification.noneTitle")}</h3>
        <p>{t("verification.noneDetail")}</p>
      </section>
    );
  }

  const input = buildInput(candidate);
  const normalizedInput = normalizeExternalVerificationInput(input);
  const targets = buildExternalVerificationTargets(input);
  const securityResolution = resolveProductSecurityState(candidate);

  return (
    <div className="external-checks-view product-verification">
      <section className="external-checks-hero">
        <div className="external-checks-hero-copy">
          <span className="external-checks-eyebrow">{t("verification.manualEyebrow")}</span>
          <h3>{candidate.symbol} <small>{candidate.name}</small></h3>
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
        <div className="verification-contract">
          <span>{t("verification.contractAddress")}</span>
          <code title={normalizedInput.contractAddress}>{normalizedInput.contractAddress || t("radar.missingData")}</code>
          {normalizedInput.contractAddress && (
            <button type="button" onClick={() => copyManualValue(normalizedInput.contractAddress)} aria-label={t("verification.copyContract")}>{t("verification.copyAddress")}</button>
          )}
        </div>
        <div><span>{t("verification.pairAddress")}</span><code title={normalizedInput.pairAddress}>{normalizedInput.pairAddress || t("radar.missingData")}</code></div>
        <div><span>{t("verification.recordSource")}</span><strong>{formatProductSourceLabel(candidate.source)}</strong></div>
      </section>

      <section className="verification-research-section" aria-labelledby="verification-market-heading">
        <header><span>02</span><div><h3 id="verification-market-heading">{ui.marketData}</h3><p>{ui.marketDataHelp}</p></div></header>
        <div className="external-checks-review-grid">
          <VerificationMetric label={ui.marketCap} value={formatProductUsd(candidate.marketCap, locale, t("radar.missingData"))} />
          <VerificationMetric label={ui.liquidity} value={formatProductUsd(candidate.liquidity, locale, t("radar.missingData"))} />
          <VerificationMetric label={ui.volume} value={formatProductUsd(candidate.volume24h, locale, t("radar.missingData"))} />
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
          <VerificationMetric label={t("verification.securityMetric")} value={presentVerificationSecurityState(securityResolution.state, t)} />
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

      <section className="verification-return" aria-labelledby="verification-return-heading">
        <div><span className="external-checks-eyebrow">07</span><h3 id="verification-return-heading">{ui.returnTitle}</h3><p>{ui.returnHelp}</p></div>
        <a className="product-primary-button" href="#candidate-detail">{ui.returnAction}</a>
      </section>
    </div>
  );
};

function ExternalCheckCard({ target }: { target: ExternalVerificationTarget }) {
  const { t } = useProductLocale();
  const copyValue = target.copyValue ?? "";
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
          <a className="external-check-link" href={target.href} target="_blank" rel="noreferrer noopener" aria-label={t("verification.openSourceLabel", { source: title })}>
            {t("verification.openSource")}
          </a>
        ) : (
          <span className="external-check-disabled" aria-disabled="true">{t("verification.sourceUnavailable")}</span>
        )}
        {copyValue && <button type="button" className="external-check-copy-button" onClick={() => copyManualValue(copyValue)}>{t("verification.copyAddress")}</button>}
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

function buildInput(candidate: UiTokenCandidate): ExternalVerificationInput {
  return {
    symbol: candidate.symbol,
    projectName: candidate.name,
    chain: candidate.chain,
    contractAddress: candidate.contractAddress,
    pairAddress: candidate.pairAddress,
    sourceUrl: candidate.sourceUrl,
    tokenInput: candidate.contractAddress,
  };
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

function copyManualValue(value: string): void {
  if (!value || typeof navigator === "undefined" || !navigator.clipboard) return;
  void navigator.clipboard.writeText(value);
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
    securityStatusHelp: "Brak zgłoszonej flagi nie oznacza, że projekt jest bezpieczny. Honeypot.is nie uruchamia się automatycznie.",
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
    securityStatusHelp: "No reported flag means neither safety nor approval. Honeypot.is is not run automatically.",
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
