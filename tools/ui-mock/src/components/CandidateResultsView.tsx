import React, { useEffect, useMemo, useState } from "react";
import type {
  ProductReadinessOutput,
  ScannerDiscoveryMetadata,
  UiTokenCandidate,
} from "../types/scannerTypes";

type BasketId = "new_emerging" | "established";
type Tone = "neutral" | "accent" | "warning" | "critical" | "ready";

interface CandidateResultsViewProps {
  candidates: UiTokenCandidate[];
  metadata?: ScannerDiscoveryMetadata | null;
  readiness?: ProductReadinessOutput | null;
  generatedAt?: string | null;
  ageSeconds?: number | null;
  sourceIds?: string[];
  scannerUnavailableReasonCode?: string | null;
  onOpenCandidate?: (candidateId: string) => void;
  onOpenExternalChecks?: (candidate: UiTokenCandidate) => void;
}

export const CandidateResultsView: React.FC<CandidateResultsViewProps> = ({
  candidates,
  metadata,
  readiness,
  generatedAt = null,
  ageSeconds = null,
  sourceIds = [],
  scannerUnavailableReasonCode = null,
  onOpenCandidate,
  onOpenExternalChecks,
}) => {
  const newCandidates = useMemo(
    () => candidates.filter((candidate) => candidate.discoveryBasket === "new_emerging"),
    [candidates],
  );
  const establishedCandidates = useMemo(
    () => candidates.filter((candidate) => candidate.discoveryBasket === "established"),
    [candidates],
  );
  const [activeBasket, setActiveBasket] = useState<BasketId>(() => resolveInitialBasket(candidates));

  useEffect(() => {
    setActiveBasket(resolveInitialBasket(candidates));
  }, [candidates]);

  const establishedEntries = metadata?.established?.entries_enabled ?? establishedCandidates.length;
  const establishedAfterFilters = metadata?.established?.candidates_after_filters
    ?? establishedCandidates.filter((candidate) => candidate.basicFilterStatus === "passed_basic_filter").length;
  const securityChecked = establishedCandidates.filter((candidate) => candidate.security !== null).length;
  const freshness = getFreshness(ageSeconds, readiness?.scanner.reason_code ?? scannerUnavailableReasonCode);
  const sourceState = getSourceState(metadata, sourceIds);

  return (
    <div className="candidate-results-view product-radar">
      <section className="product-radar-intro">
        <div>
          <span className="candidate-results-eyebrow">INTERNAL_BETA · real-data</span>
          <h3>Dwa koszyki, dwa różne znaczenia</h3>
          <p>
            Nowe projekty służą obserwacji. Established to osobna, utrzymywana przez ownera lista adresów
            i jedyny koszyk głównego Radaru.
          </p>
        </div>
        <div className={`product-freshness ${freshness.tone}`}>
          <span>Dane</span>
          <strong>{freshness.value}</strong>
          <small>{freshness.detail}</small>
        </div>
      </section>

      <section className="product-summary-grid" aria-label="Podsumowanie Radaru">
        <SummaryCard label="Nowe projekty" value={String(newCandidates.length)} detail="wyłącznie obserwacja" />
        <SummaryCard label="Established entries" value={String(establishedEntries)} detail="aktywne adresy w universe" />
        <SummaryCard label="Established po filtrach" value={String(establishedAfterFilters)} detail="kandydaci do analizy" />
        <SummaryCard label="Security sprawdzone" value={String(securityChecked)} detail="GoPlus po filtrach" />
        <SummaryCard label="Dane wygenerowane" value={freshness.value} detail={generatedAt ? formatTimestamp(generatedAt) : freshness.detail} tone={freshness.tone} />
        <SummaryCard label="Stan źródeł" value={sourceState.value} detail={sourceState.detail} tone={sourceState.tone} />
      </section>

      <section className="basket-switcher" aria-label="Wybór koszyka">
        <button
          type="button"
          className={activeBasket === "new_emerging" ? "active" : ""}
          onClick={() => setActiveBasket("new_emerging")}
          aria-pressed={activeBasket === "new_emerging"}
        >
          <span>Nowe / obserwacja</span>
          <strong>{newCandidates.length}</strong>
          <small>Bardzo nowe projekty, bez automatycznego awansu</small>
        </button>
        <button
          type="button"
          className={activeBasket === "established" ? "active" : ""}
          onClick={() => setActiveBasket("established")}
          aria-pressed={activeBasket === "established"}
        >
          <span>Established / główny Radar</span>
          <strong>{establishedCandidates.length}</strong>
          <small>{getEstablishedTabStatus(metadata, readiness)}</small>
        </button>
      </section>

      {scannerUnavailableReasonCode ? (
        <BasketUnavailable
          title="Radar nie może odczytać aktualnego skanu"
          reasonCode={scannerUnavailableReasonCode}
          detail="Nie utworzono danych przykładowych. Sprawdź output i readiness lokalnego Scanner API."
        />
      ) : activeBasket === "new_emerging" ? (
        <NewEmergingBasket
          candidates={newCandidates}
          readiness={readiness}
          onOpenCandidate={onOpenCandidate}
          onOpenExternalChecks={onOpenExternalChecks}
        />
      ) : (
        <EstablishedBasket
          candidates={establishedCandidates}
          metadata={metadata}
          readiness={readiness}
          onOpenCandidate={onOpenCandidate}
          onOpenExternalChecks={onOpenExternalChecks}
        />
      )}
    </div>
  );
};

export function NewEmergingBasket({
  candidates,
  readiness,
  onOpenCandidate,
  onOpenExternalChecks,
}: {
  candidates: UiTokenCandidate[];
  readiness?: ProductReadinessOutput | null;
  onOpenCandidate?: (candidateId: string) => void;
  onOpenExternalChecks?: (candidate: UiTokenCandidate) => void;
}) {
  const state = readiness?.discovery.new_emerging;
  if (state && !state.ready) {
    return (
      <BasketUnavailable
        title="Koszyk Nowe / obserwacja jest niedostępny"
        reasonCode={state.reason_code ?? "NEW_EMERGING_UNAVAILABLE"}
        detail="Pozostałe części produktu mogą nadal działać. Brak danych nie jest uzupełniany przykładem."
      />
    );
  }

  if (candidates.length === 0) {
    return (
      <BasketEmpty
        title="Brak nowych projektów w aktualnym skanie"
        detail="To uczciwy wynik bieżącego źródła. System nie tworzy sample candidates."
        code="NEW_EMERGING_EMPTY"
      />
    );
  }

  return (
    <section className="basket-content" aria-label="Nowe projekty — obserwacja">
      <header className="basket-heading">
        <div>
          <span>Nowe / Emerging</span>
          <h3>Obserwacja bardzo nowych projektów</h3>
          <p>Obecność w tym koszyku nie oznacza statusu Established ani uruchomienia kontroli GoPlus.</p>
        </div>
        <strong className="basket-status observation">OBSERWACJA — NOWY PROJEKT</strong>
      </header>
      <div className="product-candidate-list">
        {candidates.map((candidate) => (
          <NewCandidateCard
            key={candidate.id}
            candidate={candidate}
            onOpenCandidate={onOpenCandidate}
            onOpenExternalChecks={onOpenExternalChecks}
          />
        ))}
      </div>
    </section>
  );
}

function NewCandidateCard({
  candidate,
  onOpenCandidate,
  onOpenExternalChecks,
}: {
  candidate: UiTokenCandidate;
  onOpenCandidate?: (candidateId: string) => void;
  onOpenExternalChecks?: (candidate: UiTokenCandidate) => void;
}) {
  const reasons = candidate.filterReasons.slice(0, 3);
  return (
    <article className="product-candidate-card observation">
      <header className="product-candidate-topline">
        <div>
          <span className="candidate-results-eyebrow">Nowy projekt — obserwacja</span>
          <h4>{candidate.symbol} <small>{candidate.name}</small></h4>
          <p>{formatChain(candidate.chain)} · {candidate.dex || "DEX niepodany"} · {candidate.source}</p>
        </div>
        <strong className="basket-status observation">OBSERWACJA — NOWY PROJEKT</strong>
      </header>

      <div className="product-metrics-grid">
        <Metric label="Wiek pary" value={formatDays(candidate.pairAgeDays)} />
        <Metric label="Cena" value={formatPrice(candidate.priceUsd)} />
        <Metric label={candidate.marketCap == null ? "FDV" : "Market cap"} value={formatUsd(candidate.marketCap ?? candidate.fdvUsd)} />
        <Metric label="Liquidity" value={formatUsd(candidate.liquidity)} />
        <Metric label="Volume 24h" value={formatUsd(candidate.volume24h)} />
        <Metric label="Ratio" value={formatRatio(candidate.volumeMarketCapRatio)} />
      </div>

      <div className="candidate-explanation-grid">
        <Explanation
          label="Dlaczego jest tutaj"
          value="Profil z najnowszego strumienia DexScreener; projekt jest obserwacyjny."
        />
        <Explanation
          label="Dlaczego nie jest Established"
          value="Nie pochodzi z wersjonowanej listy adresów i nie ma automatycznego awansu."
        />
        <Explanation
          label="Status operacyjny"
          value={`observation_only=${String(candidate.observationOnly)} · established_eligible=${String(candidate.establishedEligible)}`}
        />
      </div>

      {reasons.length > 0 && candidate.basicFilterStatus === "rejected_basic_filter" && (
        <div className="product-reason-panel warning">
          <span>Główne powody odrzucenia przez filtry</span>
          <ul>{reasons.map((reason) => <li key={reason}>{formatReason(reason)}</li>)}</ul>
        </div>
      )}

      <footer className="product-candidate-footer">
        <div>
          <span>Źródło i kontrola</span>
          <strong>{candidate.source}</strong>
          <small>{formatTimestamp(candidate.lastCheckedAt)}</small>
        </div>
        <p>Brak automatycznej rekomendacji. Security nie jest uruchamiane wyłącznie z powodu obecności w tym koszyku.</p>
        <CandidateActions candidate={candidate} onOpenCandidate={onOpenCandidate} onOpenExternalChecks={onOpenExternalChecks} />
      </footer>
    </article>
  );
}

export function EstablishedBasket({
  candidates,
  metadata,
  readiness,
  onOpenCandidate,
  onOpenExternalChecks,
}: {
  candidates: UiTokenCandidate[];
  metadata?: ScannerDiscoveryMetadata | null;
  readiness?: ProductReadinessOutput | null;
  onOpenCandidate?: (candidateId: string) => void;
  onOpenExternalChecks?: (candidate: UiTokenCandidate) => void;
}) {
  const state = getEstablishedState(metadata, readiness, candidates);
  if (state === "empty") {
    const universe = metadata?.established;
    return (
      <section className="established-empty" aria-label="Pusty koszyk Established">
        <span className="candidate-results-eyebrow">Konfiguracja gotowa</span>
        <h3>Koszyk Established jest pusty</h3>
        <p>
          To nie jest błąd systemu. Wersjonowana lista adresów kontraktów nie została jeszcze uzupełniona.
          Dane New / Emerging mogą nadal być aktualne, a system nie zastępuje braku wpisów przykładowymi tokenami.
        </p>
        <div className="empty-state-facts">
          <Metric label="Stan" value="ESTABLISHED_UNIVERSE_EMPTY" tone="warning" />
          <Metric label="Wersja universe" value={universe?.universe_version ?? "established_address_universe_v1"} />
          <Metric label="Aktywne wpisy" value="0" />
        </div>
        <div className="empty-state-next-step">
          <span>Instrukcja operacyjna</span>
          <strong>Uzupełnij wersjonowaną listę adresów kontraktów</strong>
          <small>Ten etap nie udostępnia interfejsu edycji i nie kieruje do danych demo.</small>
        </div>
      </section>
    );
  }

  if (state === "unavailable") {
    return (
      <BasketUnavailable
        title="Koszyk Established jest niedostępny"
        reasonCode={readiness?.discovery.established.reason_code ?? "ESTABLISHED_UNAVAILABLE"}
        detail="Nie oznacza to pustego universe. Sprawdź readiness i aktualny snapshot."
      />
    );
  }

  return (
    <section className="basket-content" aria-label="Established — główny Radar">
      <header className="basket-heading">
        <div>
          <span>Established</span>
          <h3>Główny Radar oparty na adresach</h3>
          <p>Tożsamość jest ustalana przez chain + contract address. GoPlus pojawia się dopiero po filtrach.</p>
        </div>
        <strong className="basket-status established">GŁÓWNY RADAR</strong>
      </header>
      <div className="product-candidate-list">
        {candidates.map((candidate) => (
          <EstablishedCandidateCard
            key={candidate.id}
            candidate={candidate}
            onOpenCandidate={onOpenCandidate}
            onOpenExternalChecks={onOpenExternalChecks}
          />
        ))}
      </div>
    </section>
  );
}

function EstablishedCandidateCard({
  candidate,
  onOpenCandidate,
  onOpenExternalChecks,
}: {
  candidate: UiTokenCandidate;
  onOpenCandidate?: (candidateId: string) => void;
  onOpenExternalChecks?: (candidate: UiTokenCandidate) => void;
}) {
  const status = getEstablishedCandidateStatus(candidate);
  const riskFlags = candidate.riskFlags.slice(0, 3);
  return (
    <article className={`product-candidate-card ${status.tone}`}>
      <header className="product-candidate-topline">
        <div>
          <span className="candidate-results-eyebrow">Established · {formatChain(candidate.chain)}</span>
          <h4>{candidate.symbol} <small>{candidate.name}</small></h4>
          <div className="contract-line">
            <code title={candidate.contractAddress}>{shortenAddress(candidate.contractAddress)}</code>
            <button type="button" onClick={() => copyValue(candidate.contractAddress)} aria-label={`Kopiuj adres kontraktu ${candidate.symbol}`}>Kopiuj</button>
          </div>
        </div>
        <div className="candidate-status-stack">
          <strong className={`basket-status ${status.tone}`}>{status.label}</strong>
          {candidate.finalLabel === "WATCHLIST" && <small>WATCHLIST — wyłącznie ręczna analiza</small>}
        </div>
      </header>

      <div className="product-metrics-grid established">
        <Metric label="Address identity" value={candidate.addressIdentityVerified ? "Zweryfikowana" : "Wymaga weryfikacji"} tone={candidate.addressIdentityVerified ? "ready" : "warning"} />
        <Metric label="Market cap" value={formatUsd(candidate.marketCap ?? candidate.fdvUsd)} />
        <Metric label="Liquidity" value={formatUsd(candidate.liquidity)} />
        <Metric label="Volume 24h" value={formatUsd(candidate.volume24h)} />
        <Metric label="Ratio" value={formatRatio(candidate.volumeMarketCapRatio)} />
        <Metric label="Wiek pary" value={formatDays(candidate.pairAgeDays)} />
        <Metric label="Basic filters" value={candidate.basicFilterStatus === "passed_basic_filter" ? "Spełnione" : "Odrzucone"} tone={candidate.basicFilterStatus === "passed_basic_filter" ? "ready" : "warning"} />
        <Metric label="Security" value={formatSecurityLabel(candidate.securityLabel, candidate.security !== null)} tone={candidate.security ? status.tone : "warning"} />
      </div>

      <div className="product-reason-panel">
        <span>Najważniejsze ryzyka i braki</span>
        <div className="candidate-risk-chips">
          {(riskFlags.length > 0 ? riskFlags : candidate.missingData.slice(0, 3)).map((flag) => (
            <small key={flag}>{formatReason(flag)}</small>
          ))}
          {riskFlags.length === 0 && candidate.missingData.length === 0 && <small>Brak zgłoszonych flag w aktualnym snapshotcie</small>}
        </div>
      </div>

      <footer className="product-candidate-footer">
        <div>
          <span>Ostatnia kontrola</span>
          <strong>{formatTimestamp(candidate.lastCheckedAt)}</strong>
          <small>{candidate.security?.sources.join(", ") || candidate.source}</small>
        </div>
        <p>Universe: {candidate.universeVersion ?? "brak"} · wpis {candidate.universeEntryIndex ?? "brak"}</p>
        <CandidateActions candidate={candidate} onOpenCandidate={onOpenCandidate} onOpenExternalChecks={onOpenExternalChecks} />
      </footer>
    </article>
  );
}

function CandidateActions({
  candidate,
  onOpenCandidate,
  onOpenExternalChecks,
}: {
  candidate: UiTokenCandidate;
  onOpenCandidate?: (candidateId: string) => void;
  onOpenExternalChecks?: (candidate: UiTokenCandidate) => void;
}) {
  return (
    <div className="product-card-actions">
      {onOpenCandidate && <button type="button" onClick={() => onOpenCandidate(candidate.id)}>Otwórz szczegóły</button>}
      {onOpenExternalChecks && <button type="button" className="secondary" onClick={() => onOpenExternalChecks(candidate)}>Weryfikacja źródłowa</button>}
    </div>
  );
}

function SummaryCard({ label, value, detail, tone = "neutral" }: { label: string; value: string; detail: string; tone?: Tone }) {
  return (
    <div className={`product-summary-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </div>
  );
}

function Metric({ label, value, tone = "neutral" }: { label: string; value: string; tone?: Tone }) {
  return (
    <div className={`product-metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Explanation({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><p>{value}</p></div>;
}

function BasketUnavailable({ title, reasonCode, detail }: { title: string; reasonCode: string; detail: string }) {
  return (
    <section className="basket-state unavailable" role="status">
      <span>Niedostępne</span>
      <h3>{title}</h3>
      <code>{reasonCode}</code>
      <p>{detail}</p>
    </section>
  );
}

function BasketEmpty({ title, detail, code }: { title: string; detail: string; code: string }) {
  return (
    <section className="basket-state empty" role="status">
      <span>Pusty wynik</span>
      <h3>{title}</h3>
      <code>{code}</code>
      <p>{detail}</p>
    </section>
  );
}

export function resolveInitialBasket(candidates: UiTokenCandidate[]): BasketId {
  return candidates.some((candidate) => candidate.discoveryBasket === "established")
    ? "established"
    : "new_emerging";
}

export function getEstablishedState(
  metadata: ScannerDiscoveryMetadata | null | undefined,
  readiness: ProductReadinessOutput | null | undefined,
  candidates: UiTokenCandidate[],
): "ready" | "empty" | "unavailable" {
  if (
    readiness?.discovery.established.status === "empty_configured"
    || metadata?.established?.universe_status === "ESTABLISHED_UNIVERSE_EMPTY"
  ) return "empty";
  if (readiness && readiness.discovery.established.status === "unavailable") return "unavailable";
  if (candidates.length === 0 && metadata?.established?.entries_enabled === 0) return "empty";
  return "ready";
}

function getEstablishedTabStatus(metadata?: ScannerDiscoveryMetadata | null, readiness?: ProductReadinessOutput | null): string {
  if (readiness?.discovery.established.status === "empty_configured" || metadata?.established?.universe_status === "ESTABLISHED_UNIVERSE_EMPTY") {
    return "Universe skonfigurowany, 0 aktywnych wpisów";
  }
  if (readiness?.discovery.established.status === "unavailable") return readiness.discovery.established.reason_code ?? "Niedostępny";
  return "Adresy, filtry i bezpieczeństwo";
}

function getEstablishedCandidateStatus(candidate: UiTokenCandidate): { label: string; tone: Tone } {
  if (candidate.finalLabel === "CRITICAL_RISK") return { label: "Krytyczne ryzyko", tone: "critical" };
  if (candidate.basicFilterStatus === "rejected_basic_filter" || candidate.finalLabel === "REJECT") return { label: "Odrzucony przez filtry", tone: "warning" };
  if (!candidate.security || candidate.finalLabel === "NEEDS_MANUAL_VERIFICATION") return { label: "Wymaga weryfikacji", tone: "warning" };
  return { label: "Kandydat do ręcznej analizy", tone: "accent" };
}

function getFreshness(ageSeconds: number | null, reasonCode?: string | null): { value: string; detail: string; tone: Tone } {
  if (ageSeconds == null) return { value: "Niedostępne", detail: reasonCode ?? "SCANNER_TIMESTAMP_MISSING", tone: "warning" };
  if (ageSeconds <= 1800) return { value: "Aktualne", detail: `${formatAge(ageSeconds)} temu`, tone: "ready" };
  return { value: "Nieaktualne", detail: reasonCode ?? "SCANNER_SNAPSHOT_STALE", tone: "critical" };
}

function getSourceState(metadata: ScannerDiscoveryMetadata | null | undefined, sourceIds: string[]): { value: string; detail: string; tone: Tone } {
  const health = Object.entries(metadata?.source_health ?? {});
  const degraded = health.filter(([, state]) => state === "DEGRADED" || state === "UNAVAILABLE");
  if (degraded.length > 0) return { value: "Degradacja", detail: degraded.map(([id, state]) => `${id}: ${state}`).join(", "), tone: "warning" };
  if (sourceIds.length === 0) return { value: "Brak", detail: "SOURCE_IDS_MISSING", tone: "warning" };
  return { value: "Dostępne", detail: sourceIds.join(", "), tone: "ready" };
}

function formatSecurityLabel(label: string, invoked: boolean): string {
  if (!invoked || label === "NOT_CHECKED") return "Nie uruchomiono";
  if (label === "SECURITY_PASSED") return "Sprawdzone — wymaga analizy";
  if (label.includes("CRITICAL")) return "Krytyczne ryzyko";
  return "Wymaga weryfikacji";
}

const REASON_COPY: Record<string, string> = {
  market_cap_below_min: "Market cap poniżej 300 tys. USD",
  market_cap_above_max: "Market cap powyżej 10 mln USD",
  volume_24h_below_min: "Volume 24h poniżej 30 tys. USD",
  liquidity_below_min: "Liquidity poniżej 30 tys. USD",
  volume_market_cap_ratio_below_min: "Ratio poniżej 0,01",
  volume_market_cap_ratio_above_max: "Ratio powyżej 1",
  pair_age_below_min: "Para ma nie więcej niż 7 dni",
};

function formatReason(value: string): string {
  return REASON_COPY[value] ?? value.replaceAll("_", " ");
}

function formatChain(value: string): string {
  return value ? value.toUpperCase() : "SIEĆ NIEPODANA";
}

function formatUsd(value: number | null): string {
  if (value == null) return "Brak danych";
  return new Intl.NumberFormat("pl-PL", { style: "currency", currency: "USD", maximumFractionDigits: value < 1 ? 6 : 0 }).format(value);
}

function formatPrice(value: number | null): string {
  if (value == null) return "Brak danych";
  return `$${value.toLocaleString("en-US", { maximumSignificantDigits: 6 })}`;
}

function formatRatio(value: number | null): string {
  return value == null ? "Brak danych" : value.toFixed(4);
}

function formatDays(value: number | null): string {
  return value == null ? "Brak danych" : `${value.toFixed(value < 10 ? 1 : 0)} dni`;
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "Brak danych";
  return date.toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" });
}

function formatAge(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)} s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min`;
  return `${Math.floor(seconds / 3600)} godz.`;
}

function shortenAddress(value: string): string {
  if (!value) return "Brak adresu";
  if (value.length <= 20) return value;
  return `${value.slice(0, 10)}…${value.slice(-8)}`;
}

function copyValue(value: string): void {
  if (!value || typeof navigator === "undefined" || !navigator.clipboard) return;
  void navigator.clipboard.writeText(value);
}
