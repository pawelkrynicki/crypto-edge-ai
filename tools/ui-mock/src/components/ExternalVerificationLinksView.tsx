import React from "react";
import {
  buildExternalVerificationTargets,
  normalizeExternalVerificationInput,
  type ExternalVerificationInput,
  type ExternalVerificationTarget,
} from "../externalVerificationTargets";
import type { UiTokenCandidate } from "../types/scannerTypes";

interface ExternalVerificationLinksViewProps {
  candidate?: UiTokenCandidate | null;
}

export const ExternalVerificationLinksView: React.FC<ExternalVerificationLinksViewProps> = ({ candidate }) => {
  if (!candidate) {
    return (
      <section className="basket-state empty">
        <span>Weryfikacja</span>
        <h3>Nie wybrano kandydata</h3>
        <p>Otwórz rekord w Radarze, a następnie wybierz weryfikację źródłową.</p>
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
          <span className="external-checks-eyebrow">Ręczna weryfikacja źródłowa</span>
          <h3>{candidate.symbol} <small>{candidate.name}</small></h3>
          <p>
            Linki są tworzone wyłącznie z prawdziwego chain i contract address. Otwierają źródło dopiero po kliknięciu;
            aplikacja nie wykonuje fetchy w przeglądarce i nie uruchamia providera automatycznie.
          </p>
        </div>
        <div className="external-checks-boundary">
          <strong>Manual Review Only</strong>
          <span>Brak automatycznego Honeypot.is i brak rekomendacji transakcyjnej.</span>
        </div>
      </section>

      <section className="verification-identity" aria-label="Tożsamość do weryfikacji">
        <div><span>Sieć</span><strong>{normalizedInput.chain || "Brak danych"}</strong></div>
        <div className="verification-contract">
          <span>Contract address</span>
          <code title={normalizedInput.contractAddress}>{normalizedInput.contractAddress || "Brak danych"}</code>
          {normalizedInput.contractAddress && (
            <button type="button" onClick={() => copyManualValue(normalizedInput.contractAddress)} aria-label="Kopiuj contract address">Kopiuj adres</button>
          )}
        </div>
        <div><span>Pair address</span><code title={normalizedInput.pairAddress}>{normalizedInput.pairAddress || "Brak danych"}</code></div>
        <div><span>Źródło rekordu</span><strong>{candidate.source}</strong></div>
      </section>

      <section className="verification-guidance">
        <strong>Co zostanie otwarte?</strong>
        <p>Explorer służy do kontroli adresu, DexScreener do danych pary, a źródło rekordu do porównania aktualnego wpisu. Niedostępne cele pozostają jawnie oznaczone.</p>
      </section>

      <section className="external-checks-list" aria-label="Lista bezpiecznych źródeł weryfikacyjnych">
        {targets.map((target) => <ExternalCheckCard key={target.id} target={target} />)}
      </section>

      <section className="external-checks-review-panel">
        <div>
          <span className="external-checks-eyebrow">Następny krok</span>
          <h3>Porównaj dane ręcznie</h3>
          <p>Zapisz rozbieżności poza tym ekranem. Samo otwarcie linku nie zmienia `final_label`, statusu filtrów ani bezpieczeństwa.</p>
        </div>
        <div className="external-checks-review-grid">
          <VerificationMetric label="Tożsamość" value={candidate.addressIdentityVerified ? "Zgodna ze snapshotem" : "Wymaga kontroli"} />
          <VerificationMetric label="Security" value={candidate.security ? "Dane obecne — zweryfikuj" : "Nie uruchomiono"} />
          <VerificationMetric label="Decyzja" value="Wyłącznie ręczna analiza" />
        </div>
      </section>
    </div>
  );
};

function ExternalCheckCard({ target }: { target: ExternalVerificationTarget }) {
  const copyValue = target.copyValue ?? "";
  return (
    <article className={`external-check-card ${target.state === "manual" ? "manual" : ""}`}>
      <div className="external-check-card-main">
        <span className="external-checks-eyebrow">{translateTargetLabel(target.id)}</span>
        <h4>{translateTargetTitle(target.id)}</h4>
        <p>{target.state === "link" ? explainTarget(target.id) : target.reason ?? "Brak wymaganego kontekstu."}</p>
      </div>
      <div className="external-check-card-status">
        <span>Status</span>
        <strong>{target.state === "link" ? "Link allowlistowany" : translateStatus(target.status)}</strong>
        {target.state === "manual" && <p>Jawny brak — nic nie zostanie otwarte automatycznie.</p>}
      </div>
      <div className="external-check-actions">
        {target.href ? (
          <a className="external-check-link" href={target.href} target="_blank" rel="noreferrer noopener" aria-label={`Otwórz ${translateTargetTitle(target.id)}`}>
            Otwórz źródło
          </a>
        ) : (
          <span className="external-check-disabled" aria-disabled="true">Źródło niedostępne</span>
        )}
        {copyValue && <button type="button" className="external-check-copy-button" onClick={() => copyManualValue(copyValue)}>Kopiuj adres</button>}
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

function translateTargetLabel(id: ExternalVerificationTarget["id"]): string {
  if (id === "explorer") return "Explorer sieci";
  if (id === "dex") return "DexScreener";
  if (id === "source") return "Źródło rekordu";
  return "Security — kontrola ręczna";
}

function translateTargetTitle(id: ExternalVerificationTarget["id"]): string {
  if (id === "explorer") return "Zweryfikuj contract address";
  if (id === "dex") return "Zweryfikuj parę i płynność";
  if (id === "source") return "Otwórz źródło kandydata";
  return "Zweryfikuj bezpieczeństwo ręcznie";
}

function explainTarget(id: ExternalVerificationTarget["id"]): string {
  if (id === "explorer") return "Otworzy stronę adresu kontraktu w explorerze właściwym dla sieci.";
  if (id === "dex") return "Otworzy konkretną parę w DexScreener na podstawie chain i pair address.";
  if (id === "source") return "Otworzy allowlistowany URL zapisany w snapshotcie kandydata.";
  return "Security pozostaje krokiem ręcznym; provider nie zostanie uruchomiony.";
}

function translateStatus(value: string): string {
  if (value === "Contract Required") return "Brak contract address";
  if (value === "Chain Unknown") return "Brak obsługiwanego explorera";
  if (value === "Liquidity Unknown") return "Brak pair address";
  return value;
}

function copyManualValue(value: string): void {
  if (!value || typeof navigator === "undefined" || !navigator.clipboard) return;
  void navigator.clipboard.writeText(value);
}
