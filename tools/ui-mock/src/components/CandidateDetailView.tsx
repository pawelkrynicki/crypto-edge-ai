import React from "react";
import type { UiTokenCandidate } from "../types/scannerTypes";

interface CandidateDetailViewProps {
  candidate: UiTokenCandidate | null;
  onBackToResults?: () => void;
  onOpenExternalChecks?: (candidate: UiTokenCandidate) => void;
}

export const CandidateDetailView: React.FC<CandidateDetailViewProps> = ({
  candidate,
  onBackToResults,
  onOpenExternalChecks,
}) => {
  if (!candidate) {
    return (
      <section className="candidate-detail-empty product-detail-empty">
        <span className="candidate-detail-eyebrow">Szczegóły</span>
        <h3>Nie wybrano kandydata</h3>
        <p>Wróć do Radaru i otwórz rekord z koszyka Nowe / Emerging albo Established.</p>
        {onBackToResults && <button type="button" className="candidate-detail-secondary-button" onClick={onBackToResults}>Wróć do Radaru</button>}
      </section>
    );
  }

  const basketLabel = candidate.discoveryBasket === "established" ? "Established" : "New / Emerging";
  const status = getCandidateStatus(candidate);
  const failedFilters = candidate.filterReasons.map(formatReason);
  const filterSummary = candidate.basicFilterStatus === "passed_basic_filter"
    ? "Warunki podstawowe zostały spełnione. Nie jest to rekomendacja."
    : "Rekord nie spełnił co najmniej jednego zamrożonego warunku.";

  return (
    <div className="candidate-detail-view product-candidate-detail">
      <section className="candidate-detail-hero">
        <div className="candidate-detail-hero-copy">
          <span className="candidate-detail-eyebrow">{basketLabel}</span>
          <h3>{candidate.symbol} <small>{candidate.name}</small></h3>
          <div className="candidate-detail-token-line">
            <strong>{status}</strong>
            <span>{candidate.chain || "sieć niepodana"}</span>
            <span>{candidate.dex || "DEX niepodany"}</span>
            <span>{candidate.source}</span>
            <span>{formatTimestamp(candidate.lastCheckedAt)}</span>
          </div>
        </div>
        <div className="candidate-detail-boundary">
          <strong>{candidate.observationOnly ? "Observation only" : "Manual Review Only"}</strong>
          <span>Brak rekomendacji transakcyjnej. Wszystkie decyzje wymagają ręcznej analizy.</span>
        </div>
      </section>

      <section className="product-detail-section" aria-labelledby="identity-heading">
        <SectionHeader id="identity-heading" index="1" title="Tożsamość" />
        <div className="product-detail-grid">
          <DetailField label="Contract" value={candidate.contractAddress || "Brak danych"} copyValue={candidate.contractAddress} mono />
          <DetailField label="Pair address" value={candidate.pairAddress || "Brak danych"} copyValue={candidate.pairAddress} mono />
          <DetailField label="Chain" value={candidate.chain || "Brak danych"} />
          <DetailField label="Address identity" value={candidate.addressIdentityVerified ? "Zweryfikowana" : "Niezatwierdzona"} tone={candidate.addressIdentityVerified ? "ready" : "warning"} />
          <DetailField label="Universe version" value={candidate.discoveryBasket === "established" ? candidate.universeVersion ?? "Brak danych" : "Nie dotyczy"} />
          <DetailField label="Discovery method" value={formatDiscoveryMethod(candidate.discoveryMethod)} />
          <DetailField label="Run ID" value={candidate.runId} mono />
          <DetailField label="Universe entry" value={candidate.universeEntryIndex == null ? "Nie dotyczy" : String(candidate.universeEntryIndex)} />
        </div>
      </section>

      <section className="product-detail-section" aria-labelledby="market-heading">
        <SectionHeader id="market-heading" index="2" title="Dane rynkowe" />
        <div className="product-detail-grid market">
          <DetailField label="Cena" value={formatPrice(candidate.priceUsd)} />
          <DetailField label="Market cap" value={formatUsd(candidate.marketCap)} />
          <DetailField label="FDV" value={formatUsd(candidate.fdvUsd)} />
          <DetailField label="Liquidity" value={formatUsd(candidate.liquidity)} />
          <DetailField label="Volume 24h" value={formatUsd(candidate.volume24h)} />
          <DetailField label="Ratio" value={candidate.volumeMarketCapRatio == null ? "Brak danych" : candidate.volumeMarketCapRatio.toFixed(4)} />
          <DetailField label="Wiek pary" value={candidate.pairAgeDays == null ? "Brak danych" : `${candidate.pairAgeDays.toFixed(1)} dni`} />
          <DetailField label="Utworzenie pary" value={candidate.pairCreatedAt ? formatTimestamp(candidate.pairCreatedAt) : "Brak danych"} />
        </div>
      </section>

      <section className="product-detail-section" aria-labelledby="filters-heading">
        <SectionHeader id="filters-heading" index="3" title="Filtry" />
        <div className="product-filter-summary">
          <DetailField
            label="Status"
            value={candidate.basicFilterStatus === "passed_basic_filter" ? "Warunki spełnione" : "Warunki niespełnione"}
            tone={candidate.basicFilterStatus === "passed_basic_filter" ? "ready" : "warning"}
          />
          <div>
            <span>Proste wyjaśnienie</span>
            <p>{filterSummary}</p>
          </div>
        </div>
        <div className="filter-condition-grid">
          <ConditionList
            title="Warunki spełnione"
            items={candidate.basicFilterStatus === "passed_basic_filter" ? BASIC_FILTER_COPY : BASIC_FILTER_COPY.filter((item) => !failedFilters.some((failed) => failed.toLowerCase().includes(item.keyword)))}
            tone="ready"
          />
          <ConditionList
            title="Warunki niespełnione"
            items={failedFilters.length > 0 ? failedFilters.map((text) => ({ text, keyword: "" })) : [{ text: "Brak zgłoszonych niespełnionych warunków", keyword: "" }]}
            tone={failedFilters.length > 0 ? "warning" : "neutral"}
          />
        </div>
      </section>

      <section className="product-detail-section" aria-labelledby="security-heading">
        <SectionHeader id="security-heading" index="4" title="Bezpieczeństwo" />
        {candidate.security ? (
          <>
            <div className="product-detail-grid security">
              <DetailField label="Źródło" value={candidate.security.sources.join(", ") || "GoPlus"} />
              <DetailField label="Security label" value={formatSecurityLabel(candidate.securityLabel)} tone={getSecurityTone(candidate.securityLabel)} />
              <DetailField label="Buy tax" value={formatPercent(candidate.security.buyTax)} />
              <DetailField label="Sell tax" value={formatPercent(candidate.security.sellTax)} />
              <DetailField label="Ownership" value={candidate.security.ownershipStatus || "Brak danych"} />
              <DetailField label="Proxy" value={formatBooleanRisk(candidate.security.proxyRisk)} />
              <DetailField label="Blacklist" value={formatBooleanRisk(candidate.security.blacklistRisk)} />
              <DetailField label="Mint" value={formatBooleanRisk(candidate.security.mintRisk)} />
              <DetailField label="Liquidity lock" value={formatLiquidityLock(candidate)} />
              <DetailField label="Contract verified" value={formatNullableBoolean(candidate.security.contractVerified)} />
              <DetailField label="Checked at" value={formatTimestamp(candidate.security.checkedAt)} />
              <DetailField label="Honeypot status" value={candidate.security.honeypotStatus || "Nieuruchomiony automatycznie"} />
            </div>
            <div className="security-lists">
              <FlagList title="Risk flags" items={candidate.riskFlags} empty="Brak zgłoszonych flag" tone="critical" />
              <FlagList title="Brakujące dane" items={candidate.missingData} empty="Brak zgłoszonych braków" tone="warning" />
            </div>
          </>
        ) : (
          <div className="security-not-invoked">
            <strong>Security nie zostało uruchomione dla tego koszyka/statusu</strong>
            <p>Brak rekordu bezpieczeństwa nie jest wynikiem pozytywnym i nie pozwala wnioskować o bezpieczeństwie.</p>
            <code>security_label={candidate.securityLabel || "NOT_CHECKED"}</code>
          </div>
        )}
      </section>

      <section className="product-detail-section next-step" aria-labelledby="next-heading">
        <SectionHeader id="next-heading" index="5" title="Następny krok" />
        <p>
          Zweryfikuj ręcznie tożsamość i aktualne dane w DexScreener oraz explorerze. Ten ekran nie stanowi
          rekomendacji inwestycyjnej ani sygnału do transakcji.
        </p>
        <div className="product-detail-actions">
          {onBackToResults && <button type="button" className="secondary" onClick={onBackToResults}>Wróć do Radaru</button>}
          {onOpenExternalChecks && <button type="button" onClick={() => onOpenExternalChecks(candidate)}>Przejdź do weryfikacji źródłowej</button>}
        </div>
      </section>
    </div>
  );
};

function SectionHeader({ id, index, title }: { id: string; index: string; title: string }) {
  return <header className="product-detail-section-header"><span>{index}</span><h3 id={id}>{title}</h3></header>;
}

function DetailField({
  label,
  value,
  copyValue,
  mono = false,
  tone = "neutral",
}: {
  label: string;
  value: string;
  copyValue?: string;
  mono?: boolean;
  tone?: "neutral" | "ready" | "warning" | "critical";
}) {
  return (
    <div className={`product-detail-field ${tone}`}>
      <span>{label}</span>
      <div className={mono ? "mono" : ""} title={value}>{value}</div>
      {copyValue && <button type="button" onClick={() => copyToClipboard(copyValue)} aria-label={`Kopiuj: ${label}`}>Kopiuj</button>}
    </div>
  );
}

const BASIC_FILTER_COPY = [
  { text: "Market cap 300 tys.–10 mln USD", keyword: "market cap" },
  { text: "Volume 24h minimum 30 tys. USD", keyword: "volume" },
  { text: "Liquidity minimum 30 tys. USD", keyword: "liquidity" },
  { text: "Ratio 0,01–1", keyword: "ratio" },
  { text: "Wiek pary ponad 7 dni", keyword: "par" },
];

function ConditionList({ title, items, tone }: { title: string; items: Array<{ text: string; keyword: string }>; tone: "neutral" | "ready" | "warning" }) {
  return (
    <div className={`condition-list ${tone}`}>
      <strong>{title}</strong>
      <ul>{items.map((item) => <li key={item.text}>{item.text}</li>)}</ul>
    </div>
  );
}

function FlagList({ title, items, empty, tone }: { title: string; items: string[]; empty: string; tone: "warning" | "critical" }) {
  return (
    <div className={`security-flag-list ${tone}`}>
      <strong>{title}</strong>
      <div>{(items.length > 0 ? items : [empty]).map((item) => <span key={item}>{formatReason(item)}</span>)}</div>
    </div>
  );
}

function getCandidateStatus(candidate: UiTokenCandidate): string {
  if (candidate.discoveryBasket === "new_emerging") return "OBSERWACJA — NOWY PROJEKT";
  if (candidate.finalLabel === "CRITICAL_RISK") return "Krytyczne ryzyko";
  if (candidate.basicFilterStatus === "rejected_basic_filter" || candidate.finalLabel === "REJECT") return "Odrzucony przez filtry";
  if (!candidate.security || candidate.finalLabel === "NEEDS_MANUAL_VERIFICATION") return "Wymaga weryfikacji";
  return "WATCHLIST — wyłącznie ręczna analiza";
}

function formatDiscoveryMethod(value: UiTokenCandidate["discoveryMethod"]): string {
  return value === "address_seeded_universe" ? "Wersjonowana lista adresów" : "Najnowsze profile DexScreener";
}

function formatSecurityLabel(value: string): string {
  if (value === "SECURITY_PASSED") return "Sprawdzone — nadal wymaga ręcznej analizy";
  if (value.includes("CRITICAL")) return "Krytyczne ryzyko";
  if (value === "NOT_CHECKED") return "Nie sprawdzono";
  return value.replaceAll("_", " ");
}

function getSecurityTone(value: string): "ready" | "warning" | "critical" {
  if (value.includes("CRITICAL")) return "critical";
  if (value === "SECURITY_PASSED") return "ready";
  return "warning";
}

function formatReason(value: string): string {
  return value.replaceAll("_", " ");
}

function formatUsd(value: number | null): string {
  if (value == null) return "Brak danych";
  return new Intl.NumberFormat("pl-PL", { style: "currency", currency: "USD", maximumFractionDigits: value < 1 ? 6 : 0 }).format(value);
}

function formatPrice(value: number | null): string {
  if (value == null) return "Brak danych";
  return `$${value.toLocaleString("en-US", { maximumSignificantDigits: 6 })}`;
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "Brak danych";
  return date.toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" });
}

function formatPercent(value: number | null): string {
  return value == null ? "Brak danych" : `${value}%`;
}

function formatNullableBoolean(value: boolean | null): string {
  return value == null ? "Brak danych" : value ? "Tak" : "Nie";
}

function formatBooleanRisk(value: boolean | null): string {
  return value == null ? "Brak danych" : value ? "Ryzyko wykryte" : "Nie wykryto flagi";
}

function formatLiquidityLock(candidate: UiTokenCandidate): string {
  if (!candidate.security || candidate.security.liquidityLocked == null) return "Brak danych";
  if (!candidate.security.liquidityLocked) return "Niepotwierdzony";
  return candidate.security.liquidityLockDays == null ? "Potwierdzony" : `Potwierdzony · ${candidate.security.liquidityLockDays} dni`;
}

function copyToClipboard(value: string): void {
  if (!value || typeof navigator === "undefined" || !navigator.clipboard) return;
  void navigator.clipboard.writeText(value);
}
