import React from "react";
import {
  buildExternalVerificationTargets,
  normalizeExternalVerificationInput,
  type ExternalVerificationInput,
  type ExternalVerificationTarget,
} from "../externalVerificationTargets";
import { useProductLocale } from "../productI18n";
import type { UiTokenCandidate } from "../types/scannerTypes";

interface ExternalVerificationLinksViewProps {
  candidate?: UiTokenCandidate | null;
}

export const ExternalVerificationLinksView: React.FC<ExternalVerificationLinksViewProps> = ({ candidate }) => {
  const { t } = useProductLocale();
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

      <section className="verification-identity" aria-label={t("verification.identity")}>
        <div><span>{t("verification.network")}</span><strong>{normalizedInput.chain || t("radar.missingData")}</strong></div>
        <div className="verification-contract">
          <span>{t("verification.contractAddress")}</span>
          <code title={normalizedInput.contractAddress}>{normalizedInput.contractAddress || t("radar.missingData")}</code>
          {normalizedInput.contractAddress && (
            <button type="button" onClick={() => copyManualValue(normalizedInput.contractAddress)} aria-label={t("verification.copyContract")}>{t("verification.copyAddress")}</button>
          )}
        </div>
        <div><span>{t("verification.pairAddress")}</span><code title={normalizedInput.pairAddress}>{normalizedInput.pairAddress || t("radar.missingData")}</code></div>
        <div><span>{t("verification.recordSource")}</span><strong>{candidate.source}</strong></div>
      </section>

      <section className="verification-guidance">
        <strong>{t("verification.whatOpens")}</strong>
        <p>{t("verification.whatOpensDetail")}</p>
      </section>

      <section className="external-checks-list" aria-label={t("verification.safeSources")}>
        {targets.map((target) => <ExternalCheckCard key={target.id} target={target} />)}
      </section>

      <section className="external-checks-review-panel">
        <div>
          <span className="external-checks-eyebrow">{t("verification.nextStep")}</span>
          <h3>{t("verification.compareTitle")}</h3>
          <p>{t("verification.compareDetail")}</p>
        </div>
        <div className="external-checks-review-grid">
          <VerificationMetric label={t("verification.identityMetric")} value={candidate.addressIdentityVerified ? t("verification.identityMatches") : t("verification.identityNeedsCheck")} />
          <VerificationMetric label={t("verification.securityMetric")} value={candidate.security ? t("verification.securityPresent") : t("verification.securityNotRun")} />
          <VerificationMetric label={t("verification.decision")} value={t("verification.manualOnly")} />
        </div>
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
