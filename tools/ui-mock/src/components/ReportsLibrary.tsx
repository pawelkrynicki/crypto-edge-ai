import React, { useCallback, useEffect, useMemo, useState } from "react";

void React; // Required by the Node TSX test runtime's classic JSX transform.
import { formatProductDateTime, useProductLocale, type ProductLocale } from "../productI18n";
import {
  loadReportDetail,
  loadReportsLibraryStatus,
  loadReportsList,
} from "../services/reportsDataSource";
import type { UiTokenCandidate } from "../types/scannerTypes";
import type {
  ReportCandidate,
  ReportDetail,
  ReportListItem,
  ReportsLibraryStatus,
} from "../types/reportTypes";
import { ActionButton, CopyButton, StatusBadge, TechnicalDetails } from "./ProductUi";
import { formatProductSourceLabel } from "../productPresentation";

type ReportsLibraryProps = {
  candidates: UiTokenCandidate[];
  onOpenCandidate: (candidateId: string) => void;
  onOpenManualVerification: (candidateId: string) => void;
  onSelectedReportChange?: (report: ReportDetail | null) => void;
  initialStatus?: ReportsLibraryStatus | null;
  initialReports?: ReportListItem[];
  initialDetail?: ReportDetail | null;
};

export function ReportsLibrary({
  candidates,
  onOpenCandidate,
  onOpenManualVerification,
  onSelectedReportChange,
  initialStatus,
  initialReports,
  initialDetail,
}: ReportsLibraryProps) {
  const { locale } = useProductLocale();
  const copy = REPORTS_COPY[locale];
  const [status, setStatus] = useState<ReportsLibraryStatus | null>(initialStatus ?? null);
  const [reports, setReports] = useState<ReportListItem[]>(initialReports ?? []);
  const [selectedReport, setSelectedReport] = useState<ReportDetail | null>(initialDetail ?? null);
  const [loading, setLoading] = useState(initialStatus === undefined);
  const [detailLoading, setDetailLoading] = useState(false);
  const [missingReport, setMissingReport] = useState(false);
  const candidateIds = useMemo(() => new Set(candidates.map((candidate) => candidate.id)), [candidates]);
  const libraryIsEmpty = !loading && status?.library_status === "READY" && reports.length === 0;

  const refresh = useCallback(async () => {
    setLoading(true);
    const [nextStatus, nextReports] = await Promise.all([
      loadReportsLibraryStatus(),
      loadReportsList(),
    ]);
    setStatus(nextStatus);
    setReports(nextReports ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (initialStatus !== undefined) return;
    void refresh();
  }, [initialStatus, refresh]);

  const openReport = useCallback(async (reportId: string) => {
    setDetailLoading(true);
    setMissingReport(false);
    const detail = await loadReportDetail(reportId);
    setSelectedReport(detail);
    onSelectedReportChange?.(detail);
    setMissingReport(detail === null);
    setDetailLoading(false);
  }, [onSelectedReportChange]);

  const linkedCandidate = selectedReport?.candidates.find((candidate) => candidateIds.has(candidate.candidate_id)) ?? null;

  return (
    <div className="reports-library">
      <section className="reports-library-hero">
        <div>
          <span className="section-label">{copy.eyebrow}</span>
          <h3>{copy.title}</h3>
          <p>{copy.intro}</p>
        </div>
        <div className="reports-library-status" aria-label={copy.libraryStatus}>
          <span className={`control-status-badge ${statusTone(status?.library_status)}`}>
            {status ? statusLabel(status.library_status, locale) : copy.unavailableStatus}
          </span>
          <strong>{status?.valid_report_count ?? 0}</strong>
          <small>{copy.reportsCount}</small>
        </div>
      </section>

      <div className="reports-library-facts">
        <ReportFact label={copy.latestReport} value={dateValue(status?.latest_report_generated_at ?? null, locale, copy.notAvailable)} />
        <ReportFact label={copy.skippedReports} value={String(status?.skipped_report_count ?? 0)} />
        <ReportFact label={copy.lastIndexed} value={dateValue(status?.last_indexed_at ?? null, locale, copy.notAvailable)} />
      </div>

      {status?.library_status === "PARTIAL" && (
        <p className="reports-library-notice partial" role="status">{copy.partial}</p>
      )}
      {(!status || status.library_status === "NOT_READY") && !loading && (
        <p className="reports-library-notice unavailable" role="alert">{copy.unavailable}</p>
      )}
      {missingReport && (
        <p className="reports-library-notice unavailable" role="alert">{copy.reportUnavailable}</p>
      )}

      <div className={`reports-library-layout ${libraryIsEmpty ? "empty" : ""}`}>
        {libraryIsEmpty ? (
          <section className="reports-list reports-library-empty-panel" aria-label={copy.reportsList}>
            <header className="reports-subheader">
              <div><h4>{copy.savedReports}</h4><p>{copy.savedReportsHelp}</p></div>
              <ActionButton variant="secondary" icon="refresh" className="reports-secondary-button" onClick={() => void refresh()} loading={loading} loadingLabel={copy.refreshing}>
                {copy.refresh}
              </ActionButton>
            </header>
            <p className="reports-empty-state">{copy.empty}</p>
          </section>
        ) : (
          <>
            <section className="reports-list" aria-label={copy.reportsList}>
              <header className="reports-subheader">
                <div><h4>{copy.savedReports}</h4><p>{copy.savedReportsHelp}</p></div>
                <ActionButton variant="secondary" icon="refresh" className="reports-secondary-button" onClick={() => void refresh()} loading={loading} loadingLabel={copy.refreshing}>
                  {copy.refresh}
                </ActionButton>
              </header>

              {loading && reports.length === 0 ? (
                <p className="reports-empty-state" role="status">{copy.loading}</p>
              ) : (
                <div className="reports-list-records">
                  {reports.map((report) => (
                    <article className={`report-list-card ${selectedReport?.report_id === report.report_id ? "selected" : ""}`} key={report.report_id} data-interaction="read-only">
                      <div className="report-list-card-main">
                        <div className="report-list-title-row">
                          <h5>{report.title}</h5>
                          <StatusBadge tone="ready">{copy.available}</StatusBadge>
                        </div>
                        <p>{projectIdentity(report, copy.notAvailable)}</p>
                        <dl>
                          <div><dt>{copy.generatedAt}</dt><dd>{dateValue(report.generated_at, locale, copy.notAvailable)}</dd></div>
                          <div><dt>{copy.reportVersion}</dt><dd>{report.report_version}</dd></div>
                          <div><dt>{copy.reportType}</dt><dd>{copy.researchReport}</dd></div>
                          <div><dt>{copy.chain}</dt><dd>{report.chain ?? copy.notAvailable}</dd></div>
                          {report.basket && <div><dt>{copy.basket}</dt><dd>{formatBasket(report.basket, locale)}</dd></div>}
                        </dl>
                      </div>
                      <ActionButton
                        variant="primary"
                        icon="arrow"
                        iconPosition="end"
                        className="reports-primary-button"
                        aria-current={selectedReport?.report_id === report.report_id ? "page" : undefined}
                        onClick={() => void openReport(report.report_id)}
                      >
                        {copy.openReport}
                      </ActionButton>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="report-detail" aria-label={copy.reportDetail}>
              {detailLoading ? (
                <p className="reports-empty-state" role="status">{copy.loadingReport}</p>
              ) : selectedReport ? (
                <ReportDetailView
                  detail={selectedReport}
                  linkedCandidate={linkedCandidate}
                  locale={locale}
                  copy={copy}
                  onBack={() => { setSelectedReport(null); setMissingReport(false); onSelectedReportChange?.(null); }}
                  onOpenCandidate={onOpenCandidate}
                  onOpenManualVerification={onOpenManualVerification}
                />
              ) : (
                <p className="reports-empty-state">{copy.selectReport}</p>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function ReportDetailView({
  detail,
  linkedCandidate,
  locale,
  copy,
  onBack,
  onOpenCandidate,
  onOpenManualVerification,
}: {
  detail: ReportDetail;
  linkedCandidate: ReportCandidate | null;
  locale: ProductLocale;
  copy: ReportsCopy;
  onBack: () => void;
  onOpenCandidate: (candidateId: string) => void;
  onOpenManualVerification: (candidateId: string) => void;
}) {
  return (
    <article className="report-detail-card">
      <header className="report-detail-header">
        <div>
          <span className="section-label">{copy.researchOnly}</span>
          <h4>{detail.title}</h4>
          <p>{projectIdentity(detail, copy.notAvailable)}</p>
        </div>
        <StatusBadge tone="ready">{copy.available}</StatusBadge>
      </header>

      <div className="report-detail-actions">
        <ActionButton variant="secondary" className="reports-secondary-button" onClick={onBack}>{copy.back}</ActionButton>
        {linkedCandidate && (
          <>
            <ActionButton variant="primary" icon="arrow" iconPosition="end" className="reports-primary-button" onClick={() => onOpenCandidate(linkedCandidate.candidate_id)}>{copy.openCandidate}</ActionButton>
            <ActionButton variant="secondary" className="reports-secondary-button" onClick={() => onOpenManualVerification(linkedCandidate.candidate_id)}>{copy.openVerification}</ActionButton>
          </>
        )}
        {detail.contract_address && (
          <CopyButton value={detail.contract_address} label={copy.copyContract} copiedLabel={copy.copied} />
        )}
      </div>

      <dl className="report-metadata-grid">
        <div><dt>{copy.generatedAt}</dt><dd>{dateValue(detail.generated_at, locale, copy.notAvailable)}</dd></div>
        <div><dt>{copy.reportVersion}</dt><dd>{detail.report_version}</dd></div>
        <div><dt>{copy.reportType}</dt><dd>{copy.researchReport}</dd></div>
        <div><dt>{copy.chain}</dt><dd>{detail.chain ?? copy.notAvailable}</dd></div>
      </dl>

      <TechnicalDetails label={copy.technicalDetails}>
        <dl className="report-metadata-grid technical">
          <div><dt>{copy.reportId}</dt><dd>{detail.report_id}</dd></div>
          {detail.analysis_id && <div><dt>Analysis ID</dt><dd>{detail.analysis_id}</dd></div>}
          <div><dt>{copy.scannerRun}</dt><dd>{detail.scanner_run_id ?? copy.notAvailable}</dd></div>
          {detail.contract_address && <div><dt>{copy.contract}</dt><dd><code>{detail.contract_address}</code></dd></div>}
          <div><dt>{copy.format}</dt><dd>{detail.report_format.toUpperCase()}</dd></div>
        </dl>
      </TechnicalDetails>

      <ReportSection title={copy.researchSummary}>
        {detail.localized_research && (
          <>
            <p>{detail.localized_research[locale]}</p>
            {detail.transaction_signal === "NONE" && (
              <p>{locale === "pl" ? "Raport nie zawiera instrukcji transakcyjnej." : "The report contains no transaction instruction."}</p>
            )}
          </>
        )}
        <dl className="report-inline-facts">
          <div><dt>{copy.candidates}</dt><dd>{detail.research_summary.candidates_count}</dd></div>
          <div><dt>{copy.reviewEntries}</dt><dd>{detail.research_summary.review_entries_count}</dd></div>
          <div><dt>{copy.scannerSource}</dt><dd>{formatProductSourceLabel(detail.research_summary.scanner_source)}</dd></div>
          <div><dt>{copy.contextSource}</dt><dd>{formatProductSourceLabel(detail.research_summary.context_source)}</dd></div>
        </dl>
      </ReportSection>

      <ReportSection title={copy.sourceFreshness}>
        <dl className="report-inline-facts">
          <div><dt>{copy.scannerSnapshot}</dt><dd>{dateValue(detail.source_freshness.scanner_finished_at, locale, copy.notAvailable)}</dd></div>
          <div><dt>{copy.contextSnapshot}</dt><dd>{dateValue(detail.source_freshness.context_generated_at, locale, copy.notAvailable)}</dd></div>
        </dl>
      </ReportSection>

      <ReportSection title={copy.sourceCoverage}>
        {detail.source_coverage.length > 0 ? (
          <ul className="report-plain-list">
            {detail.source_coverage.map((source) => (
              <li key={`${source.source_id}:${source.fetched_at}`}>
                <strong>{source.source_name}</strong>
                <span>{formatReportStatus(source.data_category, locale)} · {source.records_count} {copy.records} · {source.warnings_count} {copy.warnings}</span>
              </li>
            ))}
          </ul>
        ) : <MissingValue copy={copy} />}
      </ReportSection>

      <ReportSection title={copy.securityObservations}>
        <dl className="report-inline-facts">
          <div><dt>{copy.securityChecked}</dt><dd>{detail.security_observations.security_checked}</dd></div>
          <div><dt>{copy.securityPassed}</dt><dd>{detail.security_observations.security_passed}</dd></div>
        </dl>
        {detail.security_observations.by_security_label.length > 0 && (
          <ul className="report-chip-list">
            {detail.security_observations.by_security_label.map((item) => <li key={item.label}>{formatReportStatus(item.label, locale)}: {item.count}</li>)}
          </ul>
        )}
      </ReportSection>

      <ReportSection title={copy.riskFlags}>
        {detail.risk_flags.length > 0 ? (
          <ul className="report-chip-list warning">
            {detail.risk_flags.map((flag) => <li key={flag.label}>{formatReportStatus(flag.label, locale)}: {flag.count}</li>)}
          </ul>
        ) : <p>{copy.cannotInfer}</p>}
      </ReportSection>

      <ReportSection title={copy.candidateSnapshot}>
        {detail.candidates.length > 0 ? (
          <ul className="report-candidate-list">
            {detail.candidates.map((candidate) => (
              <li key={candidate.candidate_id}>
                <div><strong>{candidate.name} ({candidate.symbol})</strong><span>{candidate.chain} · {formatReportStatus(candidate.final_label, locale)}</span></div>
                <p>{candidate.reason}</p>
              </li>
            ))}
          </ul>
        ) : <MissingValue copy={copy} />}
      </ReportSection>

      <ReportSection title={copy.manualVerification}>
        {detail.manual_verification_requirements.length > 0 ? (
          <ul className="report-plain-list">
            {detail.manual_verification_requirements.map((candidate) => (
              <li key={candidate.candidate_id}><strong>{candidate.name} ({candidate.symbol})</strong><span>{copy.manualRequired}</span></li>
            ))}
          </ul>
        ) : <p>{copy.cannotInfer}</p>}
      </ReportSection>

      <ReportSection title={copy.reviewNotes}>
        {detail.review_notes.length > 0 ? (
          <ul className="report-candidate-list">
            {detail.review_notes.map((note) => (
              <li key={`${note.candidate_id}:${note.updated_at}`}><div><strong>{note.name} ({note.symbol})</strong><span>{formatReportStatus(note.review_status, locale)}</span></div><p>{note.note}</p></li>
            ))}
          </ul>
        ) : <MissingValue copy={copy} />}
      </ReportSection>

      <ReportSection title={copy.openQuestions}>
        {detail.open_questions.length > 0
          ? <ul>{detail.open_questions.map((question) => <li key={question}>{question}</li>)}</ul>
          : <p>{copy.notAvailable}</p>}
      </ReportSection>

      <ReportSection title={copy.nextReviewStep}>
        <p>{detail.next_review_step ?? copy.manualRequired}</p>
      </ReportSection>
    </article>
  );
}

function ReportSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="report-section"><h5>{title}</h5>{children}</section>;
}

function MissingValue({ copy }: { copy: ReportsCopy }) {
  return <p>{copy.notAvailable}</p>;
}

function ReportFact({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}

function statusTone(status: ReportsLibraryStatus["library_status"] | undefined): string {
  if (status === "READY") return "ready";
  if (status === "PARTIAL") return "partial";
  return "not-ready";
}

function statusLabel(status: ReportsLibraryStatus["library_status"], locale: ProductLocale): string {
  if (locale === "pl") return status === "READY" ? "Gotowa" : status === "PARTIAL" ? "Częściowa" : "Niedostępna";
  return status === "READY" ? "Ready" : status === "PARTIAL" ? "Partial" : "Unavailable";
}

function projectIdentity(report: ReportListItem, fallback: string): string {
  return report.project_name ?? report.candidate_name ?? report.symbol ?? fallback;
}

function formatBasket(value: string, locale: ProductLocale): string {
  if (value === "new_emerging") return locale === "pl" ? "Nowe obserwacje" : "New observations";
  if (value === "follow_up") return locale === "pl" ? "Dalsza obserwacja" : "Follow-up";
  if (value === "established") return locale === "pl" ? "Established" : "Established";
  return value.replaceAll("_", " ");
}

function formatReportStatus(value: string, locale: ProductLocale): string {
  const normalized = value.trim().toUpperCase();
  const labels: Record<string, [string, string]> = {
    WATCHLIST: ["WATCHLIST — manual review only", "WATCHLIST — wyłącznie ręczna analiza"],
    NEEDS_MANUAL_VERIFICATION: ["Manual verification required", "Wymaga ręcznej weryfikacji"],
    CRITICAL_RISK: ["Critical risk", "Krytyczne ryzyko"],
    REJECT: ["Rejected by filters", "Odrzucono przez filtry"],
    NEW: ["New", "Nowe"],
    TRIAGED: ["Triaged", "Przejrzane"],
    PLANNED: ["Planned", "Zaplanowane"],
    RESOLVED: ["Resolved", "Rozwiązane"],
    CLOSED: ["Closed", "Zamknięte"],
    SECURITY_PASSED: ["Check passed without a reported flag", "Kontrola bez wykrytej flagi"],
    SECURITY_DATA_UNAVAILABLE: ["Security data unavailable", "Dane bezpieczeństwa niedostępne"],
    NOT_CHECKED: ["Not checked", "Nie sprawdzono"],
  };
  const label = labels[normalized];
  if (label) return label[locale === "pl" ? 1 : 0];
  return value.replaceAll("_", " ").toLowerCase().replace(/^./, (character) => character.toUpperCase());
}

function dateValue(value: string | null, locale: ProductLocale, fallback: string): string {
  return value ? formatProductDateTime(value, locale) : fallback;
}

type ReportsCopy = { [Key in keyof typeof REPORTS_COPY.en]: string };

const REPORTS_COPY = {
  en: {
    eyebrow: "Research reports",
    title: "Reports Library",
    intro: "Read-only research material. Reports do not provide investment recommendations and WATCHLIST remains manual review only.",
    libraryStatus: "Reports Library status",
    unavailableStatus: "Unavailable",
    reportsCount: "valid reports",
    latestReport: "Latest report",
    skippedReports: "Skipped reports",
    lastIndexed: "Last indexed",
    partial: "Some reports were skipped because they did not match the current contract.",
    unavailable: "The Reports Library is currently unavailable.",
    reportUnavailable: "This report is no longer available or does not match the current contract.",
    reportsList: "Reports list",
    savedReports: "Saved reports",
    savedReportsHelp: "The library keeps up to 100 newest reports. Technical file details stay hidden.",
    refresh: "Refresh reports",
    refreshing: "Refreshing…",
    loading: "Loading reports…",
    empty: "No reports have been saved yet. The library is operating correctly.",
    generatedAt: "Generated at",
    chain: "Chain",
    basket: "Basket",
    openReport: "Open report",
    available: "Available",
    reportType: "Report type",
    researchReport: "Research report",
    reportDetail: "Report detail",
    loadingReport: "Loading report…",
    selectReport: "Select a report to read it.",
    researchOnly: "Research only",
    back: "Back to reports",
    openCandidate: "Open candidate detail",
    openVerification: "Open manual verification",
    copyContract: "Copy contract",
    copied: "Copied",
    reportVersion: "Report version",
    technicalDetails: "Technical details",
    reportId: "Report ID",
    format: "Format",
    scannerRun: "Scanner run ID",
    contract: "Contract address",
    researchSummary: "Research summary",
    candidates: "Candidates",
    reviewEntries: "Review entries",
    scannerSource: "Scanner source",
    contextSource: "Context source",
    sourceFreshness: "Source freshness",
    scannerSnapshot: "Scanner snapshot",
    contextSnapshot: "Context snapshot",
    sourceCoverage: "Source coverage",
    records: "records",
    warnings: "warnings",
    securityObservations: "Security observations",
    securityChecked: "Security checked",
    securityPassed: "Security passed",
    riskFlags: "Risk flags",
    candidateSnapshot: "Candidate snapshot",
    manualVerification: "Manual verification requirements",
    manualRequired: "Manual verification required",
    reviewNotes: "Review notes",
    openQuestions: "Open questions",
    nextReviewStep: "Next review step",
    notAvailable: "Not available",
    cannotInfer: "Cannot infer",
  },
  pl: {
    eyebrow: "Raporty badawcze",
    title: "Biblioteka raportów",
    intro: "Materiały badawcze wyłącznie do odczytu. Raporty nie zawierają rekomendacji inwestycyjnych, a WATCHLIST nadal oznacza wyłącznie ręczną analizę.",
    libraryStatus: "Status Biblioteki raportów",
    unavailableStatus: "Niedostępna",
    reportsCount: "prawidłowych raportów",
    latestReport: "Najnowszy raport",
    skippedReports: "Pominięte raporty",
    lastIndexed: "Ostatnie indeksowanie",
    partial: "Część raportów została pominięta, ponieważ nie spełniała aktualnego kontraktu.",
    unavailable: "Biblioteka raportów jest obecnie niedostępna.",
    reportUnavailable: "Ten raport nie jest już dostępny albo nie spełnia aktualnego kontraktu.",
    reportsList: "Lista raportów",
    savedReports: "Zapisane raporty",
    savedReportsHelp: "Biblioteka przechowuje do 100 najnowszych raportów. Dane techniczne plików pozostają ukryte.",
    refresh: "Odśwież raporty",
    refreshing: "Odświeżanie…",
    loading: "Ładowanie raportów…",
    empty: "Nie ma jeszcze zapisanych raportów. Biblioteka działa prawidłowo.",
    generatedAt: "Wygenerowano",
    chain: "Sieć",
    basket: "Koszyk",
    openReport: "Otwórz raport",
    available: "Dostępny",
    reportType: "Typ raportu",
    researchReport: "Raport badawczy",
    reportDetail: "Szczegóły raportu",
    loadingReport: "Ładowanie raportu…",
    selectReport: "Wybierz raport, aby go przeczytać.",
    researchOnly: "Wyłącznie badawczo",
    back: "Wróć do raportów",
    openCandidate: "Otwórz szczegóły kandydata",
    openVerification: "Otwórz ręczną weryfikację",
    copyContract: "Kopiuj kontrakt",
    copied: "Skopiowano",
    reportVersion: "Wersja raportu",
    technicalDetails: "Szczegóły techniczne",
    reportId: "ID raportu",
    format: "Format",
    scannerRun: "Scanner run ID",
    contract: "Adres kontraktu",
    researchSummary: "Podsumowanie badawcze",
    candidates: "Kandydaci",
    reviewEntries: "Wpisy analizy",
    scannerSource: "Źródło skanera",
    contextSource: "Źródło kontekstu",
    sourceFreshness: "Aktualność źródeł",
    scannerSnapshot: "Migawka skanera",
    contextSnapshot: "Migawka kontekstu",
    sourceCoverage: "Pokrycie źródeł",
    records: "rekordów",
    warnings: "ostrzeżeń",
    securityObservations: "Obserwacje bezpieczeństwa",
    securityChecked: "Sprawdzono bezpieczeństwo",
    securityPassed: "Przeszło sprawdzenie",
    riskFlags: "Flagi ryzyka",
    candidateSnapshot: "Migawka kandydatów",
    manualVerification: "Wymagania ręcznej weryfikacji",
    manualRequired: "Wymaga ręcznej weryfikacji",
    reviewNotes: "Notatki analityczne",
    openQuestions: "Otwarte pytania",
    nextReviewStep: "Następny krok analizy",
    notAvailable: "Niedostępne",
    cannotInfer: "Nie można wyciągnąć wniosku",
  },
} as const;
