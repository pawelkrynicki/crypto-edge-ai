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

type ReportsLibraryProps = {
  candidates: UiTokenCandidate[];
  onOpenCandidate: (candidateId: string) => void;
  onOpenManualVerification: (candidateId: string) => void;
  initialStatus?: ReportsLibraryStatus | null;
  initialReports?: ReportListItem[];
  initialDetail?: ReportDetail | null;
};

export function ReportsLibrary({
  candidates,
  onOpenCandidate,
  onOpenManualVerification,
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
    setMissingReport(detail === null);
    setDetailLoading(false);
  }, []);

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

      <div className="reports-library-layout">
        <section className="reports-list" aria-label={copy.reportsList}>
          <header className="reports-subheader">
            <div><h4>{copy.savedReports}</h4><p>{copy.savedReportsHelp}</p></div>
            <button type="button" className="reports-secondary-button" onClick={() => void refresh()} disabled={loading}>
              {loading ? copy.refreshing : copy.refresh}
            </button>
          </header>

          {loading && reports.length === 0 ? (
            <p className="reports-empty-state" role="status">{copy.loading}</p>
          ) : status?.library_status === "READY" && reports.length === 0 ? (
            <p className="reports-empty-state">{copy.empty}</p>
          ) : (
            <div className="reports-list-records">
              {reports.map((report) => (
                <article className="report-list-card" key={report.report_id}>
                  <div className="report-list-card-main">
                    <div className="report-list-title-row">
                      <h5>{report.title}</h5>
                      <span className="report-validation-badge">{report.validation_status}</span>
                    </div>
                    <p>{projectIdentity(report, copy.notAvailable)}</p>
                    <dl>
                      <div><dt>{copy.generatedAt}</dt><dd>{dateValue(report.generated_at, locale, copy.notAvailable)}</dd></div>
                      <div><dt>{copy.chain}</dt><dd>{report.chain ?? copy.notAvailable}</dd></div>
                      {report.basket && <div><dt>{copy.basket}</dt><dd>{report.basket}</dd></div>}
                    </dl>
                  </div>
                  <button type="button" className="reports-primary-button" onClick={() => void openReport(report.report_id)}>
                    {copy.openReport}
                  </button>
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
              onBack={() => { setSelectedReport(null); setMissingReport(false); }}
              onOpenCandidate={onOpenCandidate}
              onOpenManualVerification={onOpenManualVerification}
            />
          ) : (
            <p className="reports-empty-state">{copy.selectReport}</p>
          )}
        </section>
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
        <span className="report-validation-badge">{detail.validation_status}</span>
      </header>

      <div className="report-detail-actions">
        <button type="button" className="reports-secondary-button" onClick={onBack}>{copy.back}</button>
        {linkedCandidate && (
          <>
            <button type="button" className="reports-primary-button" onClick={() => onOpenCandidate(linkedCandidate.candidate_id)}>{copy.openCandidate}</button>
            <button type="button" className="reports-secondary-button" onClick={() => onOpenManualVerification(linkedCandidate.candidate_id)}>{copy.openVerification}</button>
          </>
        )}
        {detail.contract_address && (
          <button type="button" className="reports-secondary-button" onClick={() => void copyContract(detail.contract_address!)}>{copy.copyContract}</button>
        )}
      </div>

      <dl className="report-metadata-grid">
        <div><dt>{copy.generatedAt}</dt><dd>{dateValue(detail.generated_at, locale, copy.notAvailable)}</dd></div>
        <div><dt>{copy.reportVersion}</dt><dd>{detail.report_version}</dd></div>
        <div><dt>{copy.scannerRun}</dt><dd>{detail.scanner_run_id ?? copy.notAvailable}</dd></div>
        <div><dt>{copy.chain}</dt><dd>{detail.chain ?? copy.notAvailable}</dd></div>
        {detail.contract_address && <div><dt>{copy.contract}</dt><dd><code>{detail.contract_address}</code></dd></div>}
      </dl>

      <ReportSection title={copy.researchSummary}>
        <dl className="report-inline-facts">
          <div><dt>{copy.candidates}</dt><dd>{detail.research_summary.candidates_count}</dd></div>
          <div><dt>{copy.reviewEntries}</dt><dd>{detail.research_summary.review_entries_count}</dd></div>
          <div><dt>{copy.scannerSource}</dt><dd>{detail.research_summary.scanner_source}</dd></div>
          <div><dt>{copy.contextSource}</dt><dd>{detail.research_summary.context_source}</dd></div>
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
                <span>{source.data_category} · {source.records_count} {copy.records} · {source.warnings_count} {copy.warnings}</span>
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
            {detail.security_observations.by_security_label.map((item) => <li key={item.label}>{item.label}: {item.count}</li>)}
          </ul>
        )}
      </ReportSection>

      <ReportSection title={copy.riskFlags}>
        {detail.risk_flags.length > 0 ? (
          <ul className="report-chip-list warning">
            {detail.risk_flags.map((flag) => <li key={flag.label}>{flag.label}: {flag.count}</li>)}
          </ul>
        ) : <p>{copy.cannotInfer}</p>}
      </ReportSection>

      <ReportSection title={copy.candidateSnapshot}>
        {detail.candidates.length > 0 ? (
          <ul className="report-candidate-list">
            {detail.candidates.map((candidate) => (
              <li key={candidate.candidate_id}>
                <div><strong>{candidate.name} ({candidate.symbol})</strong><span>{candidate.chain} · {candidate.final_label}</span></div>
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
              <li key={`${note.candidate_id}:${note.updated_at}`}><div><strong>{note.name} ({note.symbol})</strong><span>{note.review_status}</span></div><p>{note.note}</p></li>
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

function dateValue(value: string | null, locale: ProductLocale, fallback: string): string {
  return value ? formatProductDateTime(value, locale) : fallback;
}

async function copyContract(contractAddress: string): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    await navigator.clipboard.writeText(contractAddress);
  }
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
    savedReportsHelp: "Up to 100 newest valid reports, without local filenames or paths.",
    refresh: "Refresh reports",
    refreshing: "Refreshing…",
    loading: "Loading reports…",
    empty: "No reports have been saved yet. The library is operating correctly.",
    generatedAt: "Generated at",
    chain: "Chain",
    basket: "Basket",
    openReport: "Open report",
    reportDetail: "Report detail",
    loadingReport: "Loading report…",
    selectReport: "Select a report to read it.",
    researchOnly: "Research only",
    back: "Back to reports",
    openCandidate: "Open candidate detail",
    openVerification: "Open manual verification",
    copyContract: "Copy contract",
    reportVersion: "Report version",
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
    savedReportsHelp: "Do 100 najnowszych prawidłowych raportów, bez lokalnych nazw plików i ścieżek.",
    refresh: "Odśwież raporty",
    refreshing: "Odświeżanie…",
    loading: "Ładowanie raportów…",
    empty: "Nie ma jeszcze zapisanych raportów. Biblioteka działa prawidłowo.",
    generatedAt: "Wygenerowano",
    chain: "Sieć",
    basket: "Koszyk",
    openReport: "Otwórz raport",
    reportDetail: "Szczegóły raportu",
    loadingReport: "Ładowanie raportu…",
    selectReport: "Wybierz raport, aby go przeczytać.",
    researchOnly: "Wyłącznie badawczo",
    back: "Wróć do raportów",
    openCandidate: "Otwórz szczegóły kandydata",
    openVerification: "Otwórz ręczną weryfikację",
    copyContract: "Kopiuj kontrakt",
    reportVersion: "Wersja raportu",
    scannerRun: "Scanner run ID",
    contract: "Adres kontraktu",
    researchSummary: "Podsumowanie badawcze",
    candidates: "Kandydaci",
    reviewEntries: "Wpisy review",
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
    reviewNotes: "Notatki review",
    openQuestions: "Otwarte pytania",
    nextReviewStep: "Następny krok review",
    notAvailable: "Niedostępne",
    cannotInfer: "Nie można wyciągnąć wniosku",
  },
} as const;
