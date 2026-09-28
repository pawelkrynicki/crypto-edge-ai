import React, { useEffect, useMemo, useState } from "react";

void React; // Required by the Node TSX test runtime's classic JSX transform.
import { formatProductDateTime, formatProductUsd, useProductLocale, type ProductLocale } from "../productI18n";
import {
  KrakenAccountDataSourceError,
  loadKrakenAccount,
  type KrakenAccountSnapshot,
} from "../services/krakenAccountDataSource";
import {
  loadKrakenCopyProfile,
  saveKrakenCopyProfile,
  type KrakenCopyProfile,
  type KrakenCopyProfileWrite,
} from "../services/krakenCopyProfileDataSource";
import { ActionButton, LoadingState, ReadOnlyCard, StatusBadge, type ProductStatusTone } from "./ProductUi";

type KrakenCopyProps = {
  loadAccount?: typeof loadKrakenAccount;
  loadProfile?: typeof loadKrakenCopyProfile;
  saveProfile?: typeof saveKrakenCopyProfile;
};

type AccountState =
  | { kind: "loading" }
  | { kind: "ready"; snapshot: KrakenAccountSnapshot }
  | { kind: "unavailable"; reason: "disabled" | "forbidden" | "error" };

type ProfileState =
  | { kind: "loading" }
  | { kind: "ready"; profile: KrakenCopyProfile }
  | { kind: "unavailable" };

/** Account and readiness view only. It has no execution or order controls. */
export function KrakenCopy({
  loadAccount = loadKrakenAccount,
  loadProfile = loadKrakenCopyProfile,
  saveProfile = saveKrakenCopyProfile,
}: KrakenCopyProps) {
  const { locale } = useProductLocale();
  const copy = KRAKEN_COPY[locale];
  const [state, setState] = useState<AccountState>({ kind: "loading" });
  const [profileState, setProfileState] = useState<ProfileState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    void loadAccount()
      .then((snapshot) => {
        if (!cancelled) setState({ kind: "ready", snapshot });
      })
      .catch((error) => {
        if (!cancelled) setState({ kind: "unavailable", reason: classifyUnavailableReason(error) });
      });
    void loadProfile()
      .then((profile) => {
        if (!cancelled) setProfileState({ kind: "ready", profile });
      })
      .catch(() => {
        if (!cancelled) setProfileState({ kind: "unavailable" });
      });
    return () => { cancelled = true; };
  }, [loadAccount, loadProfile]);

  const profileSaved = async (profile: KrakenCopyProfile) => {
    setProfileState({ kind: "ready", profile });
    try {
      setState({ kind: "loading" });
      setState({ kind: "ready", snapshot: await loadAccount() });
    } catch (error) {
      setState({ kind: "unavailable", reason: classifyUnavailableReason(error) });
    }
  };

  const headlineBadge = useMemo(() => state.kind === "ready"
    ? { label: state.snapshot.mode === "SIMULATED" ? copy.simulatedMode : copy.liveMode, tone: state.snapshot.mode === "SIMULATED" ? "warning" as const : "accent" as const }
    : null, [copy.liveMode, copy.simulatedMode, state]);

  return (
    <div className="kraken-copy" data-kraken-copy-state={state.kind}>
      <section className="kraken-copy-hero" aria-labelledby="kraken-copy-heading">
        <div>
          <span className="section-label">{copy.eyebrow}</span>
          <h3 id="kraken-copy-heading">Kraken Copy</h3>
          <p>{copy.intro}</p>
        </div>
        {headlineBadge && <StatusBadge tone={headlineBadge.tone}>{headlineBadge.label}</StatusBadge>}
      </section>

      <section className="kraken-copy-execution-boundary" aria-label={copy.executionInactive}>
        <strong>{copy.executionInactive}</strong>
        <p>{copy.executionDetail}</p>
      </section>

      {state.kind === "loading" && <LoadingState label={copy.loading} />}
      {state.kind === "unavailable" && <UnavailableCard reason={state.reason} copy={copy} />}
      {state.kind === "ready" && (
        <AccountSnapshotView
          snapshot={state.snapshot}
          locale={locale}
          copy={copy}
          profileState={profileState}
          saveProfile={saveProfile}
          onProfileSaved={profileSaved}
        />
      )}
    </div>
  );
}

function AccountSnapshotView({
  snapshot,
  locale,
  copy,
  profileState,
  saveProfile,
  onProfileSaved,
}: {
  snapshot: KrakenAccountSnapshot;
  locale: ProductLocale;
  copy: KrakenCopyCopy;
  profileState: ProfileState;
  saveProfile: typeof saveKrakenCopyProfile;
  onProfileSaved: (profile: KrakenCopyProfile) => Promise<void>;
}) {
  const missing = copy.unavailableValue;
  const connection = connectionPresentation(snapshot.connection_status, copy);
  const facts = [
    [copy.equity, formatProductUsd(snapshot.equity_usd, locale, missing)],
    [copy.availableMargin, formatProductUsd(snapshot.available_margin_usd, locale, missing)],
    [copy.portfolioValue, formatProductUsd(snapshot.portfolio_value_usd, locale, missing)],
    [copy.collateralValue, formatProductUsd(snapshot.collateral_value_usd, locale, missing)],
    [copy.initialMargin, formatProductUsd(snapshot.initial_margin_usd, locale, missing)],
    [copy.maintenanceMargin, formatProductUsd(snapshot.maintenance_margin_usd, locale, missing)],
    [copy.pnl, formatProductUsd(snapshot.pnl_usd, locale, missing)],
    [copy.unrealizedPnl, formatProductUsd(snapshot.total_unrealized_usd, locale, missing)],
  ];

  return (
    <>
      <ReadOnlyCard className="kraken-copy-status-card">
        <div>
          <span>{copy.connectionStatus}</span>
          <StatusBadge tone={connection.tone} activeState={connection.tone === "ready"}>{connection.label}</StatusBadge>
        </div>
        <div>
          <span>{copy.observedAt}</span>
          <strong>{formatProductDateTime(snapshot.observed_at, locale)}</strong>
        </div>
        <div>
          <span>{copy.source}</span>
          <strong>{snapshot.source === "CRYPTO_EDGE_SIMULATION" ? copy.cryptoEdgeSimulation : "Kraken Futures"}</strong>
        </div>
      </ReadOnlyCard>

      {snapshot.mode === "SIMULATED" && (
        <ReadOnlyCard className="kraken-copy-simulation-note">
          <strong>{copy.simulationTitle}</strong>
          <p>{copy.simulationDetail}</p>
        </ReadOnlyCard>
      )}

      <dl className="kraken-copy-facts" aria-label={copy.accountFacts}>
        {facts.map(([label, value]) => <Fact key={label} label={label} value={value} />)}
      </dl>

      {snapshot.mode === "KRAKEN_LIVE" && (
        <ReadOnlyCard className="kraken-copy-permissions">
          <span className="section-label">{copy.apiPermissions}</span>
          {snapshot.permissions ? (
            <dl>
              <Fact label={copy.generalPermission} value={snapshot.permissions.general} />
              <Fact label={copy.transferPermission} value={snapshot.permissions.transfer} />
            </dl>
          ) : <p>{copy.permissionUnavailable}</p>}
        </ReadOnlyCard>
      )}

      <ReadOnlyCard className="kraken-copy-sizing-note">
        <strong>{copy.sizingTitle}</strong>
        <p>{copy.sizingDetail}</p>
      </ReadOnlyCard>

      {profileState.kind === "loading" && <LoadingState label={copy.profileLoading} />}
      {profileState.kind === "unavailable" && (
        <ReadOnlyCard className="kraken-copy-unavailable"><strong>{copy.profileUnavailable}</strong></ReadOnlyCard>
      )}
      {profileState.kind === "ready" && (
        <KrakenCopyProfileEditor
          mode={snapshot.mode}
          profile={profileState.profile}
          locale={locale}
          copy={copy}
          saveProfile={saveProfile}
          onProfileSaved={onProfileSaved}
        />
      )}
    </>
  );
}

function KrakenCopyProfileEditor({
  mode,
  profile,
  locale,
  copy,
  saveProfile,
  onProfileSaved,
}: {
  mode: KrakenAccountSnapshot["mode"];
  profile: KrakenCopyProfile;
  locale: ProductLocale;
  copy: KrakenCopyCopy;
  saveProfile: typeof saveKrakenCopyProfile;
  onProfileSaved: (profile: KrakenCopyProfile) => Promise<void>;
}) {
  const [draft, setDraft] = useState(() => profileToDraft(profile));
  const [saveState, setSaveState] = useState<"idle" | "saving" | "error">("idle");

  const save = async () => {
    const write = draftToProfileWrite(draft, profile.simulated_equity_usd);
    if (!write) {
      setSaveState("error");
      return;
    }
    setSaveState("saving");
    try {
      const saved = await saveProfile(write);
      await onProfileSaved(saved);
      setSaveState("idle");
    } catch {
      setSaveState("error");
    }
  };

  return (
    <ReadOnlyCard className="kraken-copy-profile" data-kraken-copy-profile-mode={mode}>
      <span className="section-label">{copy.profileLabel}</span>
      <p>{mode === "SIMULATED" ? copy.profileSimulatedDetail : copy.profileLiveDetail}</p>
      <div className="kraken-copy-profile-fields">
        {mode === "SIMULATED" && (
          <ProfileField label={copy.accountSize} value={draft.simulated_equity_usd} onChange={(value) => setDraft((current) => ({ ...current, simulated_equity_usd: value }))} />
        )}
        <ProfileField label={copy.riskPerTrade} value={draft.risk_pct_per_trade} onChange={(value) => setDraft((current) => ({ ...current, risk_pct_per_trade: value }))} />
        <ProfileField label={copy.maxLeverage} value={draft.max_leverage} minimum={1} onChange={(value) => setDraft((current) => ({ ...current, max_leverage: value }))} />
        <ProfileField label={copy.maxPositionNotional} value={draft.max_position_notional_usd} optional onChange={(value) => setDraft((current) => ({ ...current, max_position_notional_usd: value }))} />
      </div>
      {saveState === "error" && <p className="kraken-copy-profile-error">{copy.profileSaveError}</p>}
      <ActionButton variant="secondary" onClick={() => void save()} disabled={saveState === "saving"}>
        {saveState === "saving" ? copy.saving : copy.save}
      </ActionButton>
      <p className="kraken-copy-profile-updated">{copy.profileUpdated}: {formatProductDateTime(profile.updated_at, locale)}</p>
    </ReadOnlyCard>
  );
}

function ProfileField({
  label,
  value,
  onChange,
  minimum,
  optional = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  minimum?: number;
  optional?: boolean;
}) {
  return (
    <label>
      <span>{label}</span>
      <input
        type="number"
        inputMode="decimal"
        min={minimum ?? 0}
        step="any"
        value={value}
        placeholder={optional ? "—" : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

type ProfileDraft = Record<keyof KrakenCopyProfileWrite, string>;

function profileToDraft(profile: KrakenCopyProfile): ProfileDraft {
  return {
    simulated_equity_usd: String(profile.simulated_equity_usd),
    risk_pct_per_trade: String(profile.risk_pct_per_trade),
    max_leverage: String(profile.max_leverage),
    max_position_notional_usd: profile.max_position_notional_usd === null ? "" : String(profile.max_position_notional_usd),
  };
}

function draftToProfileWrite(draft: ProfileDraft, simulatedEquityUsd: number): KrakenCopyProfileWrite | null {
  const risk = Number(draft.risk_pct_per_trade);
  const leverage = Number(draft.max_leverage);
  const equity = draft.simulated_equity_usd.trim() === "" ? simulatedEquityUsd : Number(draft.simulated_equity_usd);
  const notional = draft.max_position_notional_usd.trim() === "" ? null : Number(draft.max_position_notional_usd);
  if (!isPositiveFinite(equity) || !isPositiveFinite(risk) || !Number.isFinite(leverage) || leverage < 1
    || (notional !== null && !isPositiveFinite(notional))) return null;
  return {
    simulated_equity_usd: equity,
    risk_pct_per_trade: risk,
    max_leverage: leverage,
    max_position_notional_usd: notional,
  };
}

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function UnavailableCard({ reason, copy }: { reason: "disabled" | "forbidden" | "error"; copy: KrakenCopyCopy }) {
  const presentation = reason === "disabled"
    ? { title: copy.disabledTitle, detail: copy.disabledDetail }
    : reason === "forbidden"
      ? { title: copy.forbiddenTitle, detail: copy.forbiddenDetail }
      : { title: copy.unavailableTitle, detail: copy.unavailableDetail };
  return (
    <ReadOnlyCard className="kraken-copy-unavailable">
      <strong>{presentation.title}</strong>
      <p>{presentation.detail}</p>
    </ReadOnlyCard>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

function classifyUnavailableReason(error: unknown): "disabled" | "forbidden" | "error" {
  if (error instanceof KrakenAccountDataSourceError) {
    if (error.code === "KRAKEN_COPY_DISABLED") return "disabled";
    if (error.status === 403) return "forbidden";
  }
  return "error";
}

function connectionPresentation(
  status: KrakenAccountSnapshot["connection_status"],
  copy: KrakenCopyCopy,
): { label: string; tone: ProductStatusTone } {
  const values: Record<KrakenAccountSnapshot["connection_status"], { label: string; tone: ProductStatusTone }> = {
    SIMULATED: { label: copy.statusSimulated, tone: "warning" },
    CONNECTED_READ_ONLY: { label: copy.statusReadOnly, tone: "ready" },
    CONNECTED_FULL_ACCESS: { label: copy.statusFullAccess, tone: "warning" },
    NOT_CONFIGURED: { label: copy.statusNotConfigured, tone: "warning" },
    AUTH_FAILED: { label: copy.statusAuthFailed, tone: "critical" },
    UNAVAILABLE: { label: copy.statusUnavailable, tone: "critical" },
    INVALID_RESPONSE: { label: copy.statusInvalidResponse, tone: "critical" },
  };
  return values[status];
}

type KrakenCopyCopy = { [Key in keyof typeof KRAKEN_COPY.en]: string };

const KRAKEN_COPY = {
  en: {
    eyebrow: "Trading readiness",
    intro: "Read account equity and readiness for the Kraken Copy path. This view does not place, copy, or execute orders.",
    simulatedMode: "SIMULATION",
    liveMode: "KRAKEN LIVE",
    executionInactive: "COPY / EXECUTION IS NOT ACTIVE YET",
    executionDetail: "No copy switch, auto-trading, Kraken order endpoint, or final order quantity is active in this module.",
    loading: "Loading Kraken Copy account readiness",
    disabledTitle: "Kraken Copy is disabled",
    disabledDetail: "This product module is unavailable because the server-side Kraken feature flag is off.",
    forbiddenTitle: "Kraken live access is restricted",
    forbiddenDetail: "Live account readiness is currently available only to the owner pilot.",
    unavailableTitle: "Kraken Copy account data is unavailable",
    unavailableDetail: "No account data could be loaded. Execution remains inactive.",
    connectionStatus: "Connection status",
    observedAt: "Observed / sync time",
    source: "Account source",
    cryptoEdgeSimulation: "Crypto Edge simulation",
    simulationTitle: "Crypto Edge simulation — not Kraken demo",
    simulationDetail: "These values are a server-configured Crypto Edge test/owner simulation. Kraken’s discontinued demo-futures environment is not used.",
    accountFacts: "Account readiness values",
    equity: "Equity",
    availableMargin: "Available margin",
    portfolioValue: "Portfolio value",
    collateralValue: "Collateral value",
    initialMargin: "Initial margin",
    maintenanceMargin: "Maintenance margin",
    pnl: "PnL",
    unrealizedPnl: "Unrealized PnL",
    unavailableValue: "Unavailable",
    apiPermissions: "API permission status",
    generalPermission: "General",
    transferPermission: "Transfer",
    permissionUnavailable: "Permission status is unavailable.",
    sizingTitle: "Position sizing is calculated separately",
    sizingDetail: "A separate Equity Planner calculates sizing from the AXI source signal and current account equity. This screen does not calculate sizing or a live Kraken order quantity.",
    statusSimulated: "Simulated",
    statusReadOnly: "Connected — read-only",
    statusFullAccess: "Connected — full access (execution still inactive)",
    statusNotConfigured: "Live credentials not configured",
    statusAuthFailed: "Authentication failed",
    statusUnavailable: "Provider unavailable",
    statusInvalidResponse: "Provider response invalid",
    profileLoading: "Loading your Kraken Copy risk profile",
    profileUnavailable: "Your Kraken Copy risk profile is unavailable.",
    profileLabel: "Your risk settings",
    profileSimulatedDetail: "These settings and the Crypto Edge simulated account size are personal to your signed-in account.",
    profileLiveDetail: "Kraken equity and margin above are read-only. You can still save your personal risk settings.",
    accountSize: "Account size / Equity USD",
    riskPerTrade: "Risk per trade %",
    maxLeverage: "Max leverage",
    maxPositionNotional: "Max position notional USD (optional)",
    save: "Save risk settings",
    saving: "Saving…",
    profileSaveError: "Enter valid positive values and try again.",
    profileUpdated: "Profile updated",
  },
  pl: {
    eyebrow: "Gotowość tradingowa",
    intro: "Odczyt equity i gotowości ścieżki Kraken Copy. Ten widok nie składa, nie kopiuje ani nie wykonuje zleceń.",
    simulatedMode: "SYMULACJA",
    liveMode: "KRAKEN LIVE",
    executionInactive: "KOPIOWANIE / WYKONANIE NIE JEST JESZCZE AKTYWNE",
    executionDetail: "W tym module nie ma aktywnego przełącznika kopiowania, auto-tradingu, endpointu zleceń Kraken ani końcowej ilości zlecenia.",
    loading: "Ładowanie gotowości konta Kraken Copy",
    disabledTitle: "Kraken Copy jest wyłączony",
    disabledDetail: "Ten moduł produktu jest niedostępny, ponieważ serwerowa flaga Kraken jest wyłączona.",
    forbiddenTitle: "Dostęp do Kraken live jest ograniczony",
    forbiddenDetail: "Gotowość konta live jest obecnie dostępna wyłącznie dla pilota właściciela.",
    unavailableTitle: "Dane konta Kraken Copy są niedostępne",
    unavailableDetail: "Nie udało się załadować danych konta. Wykonanie pozostaje nieaktywne.",
    connectionStatus: "Status połączenia",
    observedAt: "Czas obserwacji / synchronizacji",
    source: "Źródło konta",
    cryptoEdgeSimulation: "Symulacja Crypto Edge",
    simulationTitle: "Symulacja Crypto Edge — to nie jest demo Kraken",
    simulationDetail: "Te wartości są testową/symulowaną konfiguracją właściciela po stronie serwera Crypto Edge. Wycofane środowisko demo-futures Kraken nie jest używane.",
    accountFacts: "Wartości gotowości konta",
    equity: "Equity",
    availableMargin: "Dostępny margin",
    portfolioValue: "Wartość portfela",
    collateralValue: "Wartość collateral",
    initialMargin: "Margin początkowy",
    maintenanceMargin: "Margin utrzymania",
    pnl: "PnL",
    unrealizedPnl: "Niezrealizowany PnL",
    unavailableValue: "Niedostępne",
    apiPermissions: "Status uprawnień API",
    generalPermission: "Ogólne",
    transferPermission: "Transfer",
    permissionUnavailable: "Status uprawnień jest niedostępny.",
    sizingTitle: "Wielkość pozycji jest liczona oddzielnie",
    sizingDetail: "Oddzielny Equity Planner oblicza wielkość z sygnału źródłowego AXI i bieżącego equity konta. Ten ekran nie wylicza wielkości ani końcowej ilości zlecenia Kraken.",
    statusSimulated: "Symulowane",
    statusReadOnly: "Połączono — tylko odczyt",
    statusFullAccess: "Połączono — pełny dostęp (wykonanie nadal nieaktywne)",
    statusNotConfigured: "Brak konfiguracji danych live",
    statusAuthFailed: "Uwierzytelnienie nie powiodło się",
    statusUnavailable: "Dostawca niedostępny",
    statusInvalidResponse: "Nieprawidłowa odpowiedź dostawcy",
    profileLoading: "Ładowanie Twojego profilu ryzyka Kraken Copy",
    profileUnavailable: "Twój profil ryzyka Kraken Copy jest niedostępny.",
    profileLabel: "Twoje ustawienia ryzyka",
    profileSimulatedDetail: "Te ustawienia i symulowana wielkość konta Crypto Edge są osobiste dla zalogowanego konta.",
    profileLiveDetail: "Equity i margin Kraken powyżej są tylko do odczytu. Nadal możesz zapisać własne ustawienia ryzyka.",
    accountSize: "Wielkość konta / Equity USD",
    riskPerTrade: "Ryzyko na transakcję %",
    maxLeverage: "Maks. dźwignia",
    maxPositionNotional: "Maks. nominał pozycji USD (opcjonalnie)",
    save: "Zapisz ustawienia ryzyka",
    saving: "Zapisywanie…",
    profileSaveError: "Wprowadź poprawne dodatnie wartości i spróbuj ponownie.",
    profileUpdated: "Profil zaktualizowano",
  },
} as const;
