import React, { useEffect, useRef, useState } from "react";

void React;
import { formatProductDateTime, useProductLocale, type ProductLocale } from "../productI18n";
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_STATUSES,
  FeedbackSubmissionError,
  getOwnerFeedbackExportUrl,
  loadFeedbackStatus,
  loadOwnerFeedbackDetail,
  loadOwnerFeedbackList,
  loadOwnerFeedbackStatus,
  submitFeedback,
  type FeedbackCategory,
  type FeedbackPublicStatus,
  type FeedbackReceipt,
  type FeedbackScreenContext,
  type FeedbackStatus,
  type FeedbackSubjectRef,
  type OwnerFeedbackDetail,
  type OwnerFeedbackListItem,
  type OwnerFeedbackStatus,
} from "../services/feedbackDataSource";
import { ActionButton, ActionLink, ProductIcon, StatusBadge, TechnicalDetails } from "./ProductUi";

type FeedbackProps = {
  screenContext: FeedbackScreenContext;
  subjectRef?: FeedbackSubjectRef;
  subjectLabel?: string;
  initialPublicStatus?: FeedbackPublicStatus | null;
  initialOwnerStatus?: OwnerFeedbackStatus | null;
  initialReceipt?: FeedbackReceipt | null;
  refreshRevision?: number;
  onFeedbackRecorded?: () => void | Promise<void>;
};

const categoryCopy: Record<ProductLocale, Record<FeedbackCategory, { label: string; description: string }>> = {
  pl: {
    BLOCKER: { label: "Bloker", description: "Nie można przejść dalej w ścieżce testowej." },
    IMPROVEMENT: { label: "Ulepszenie", description: "Produkt działa, ale może być prostszy lub czytelniejszy." },
    CLARIFICATION: { label: "Pytanie lub niejasność", description: "Znaczenie danych, komunikatu albo następnego kroku nie jest jasne." },
    LATER: { label: "Pomysł na później", description: "Nieblokujący pomysł poza bieżącym zakresem." },
  },
  en: {
    BLOCKER: { label: "Blocker", description: "The tested path cannot be completed." },
    IMPROVEMENT: { label: "Improvement", description: "The product works but could be clearer or easier." },
    CLARIFICATION: { label: "Question or clarification", description: "The data, message or next step is unclear." },
    LATER: { label: "Idea for later", description: "A non-blocking idea outside the current scope." },
  },
};

export function Feedback({
  screenContext,
  subjectRef,
  subjectLabel,
  initialPublicStatus,
  initialOwnerStatus,
  initialReceipt,
  refreshRevision = 0,
  onFeedbackRecorded,
}: FeedbackProps) {
  const { locale } = useProductLocale();
  const copy = feedbackCopy(locale);
  const [publicStatus, setPublicStatus] = useState<Awaited<ReturnType<typeof loadFeedbackStatus>>>(initialPublicStatus ?? null);
  const [category, setCategory] = useState<FeedbackCategory | null>(null);
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [submissionKey, setSubmissionKey] = useState(createSubmissionKey);
  const [state, setState] = useState<"idle" | "submitting" | "error" | "rate_limited" | "success">(initialReceipt ? "success" : "idle");
  const [receipt, setReceipt] = useState<FeedbackReceipt | null>(initialReceipt ?? null);
  const [ownerInboxRevision, setOwnerInboxRevision] = useState(0);
  const submittingRef = useRef(false);
  const formComplete = category !== null && title.trim().length >= 5 && details.trim().length >= 20;

  useEffect(() => {
    if (initialPublicStatus !== undefined) return;
    let active = true;
    void loadFeedbackStatus().then((value) => { if (active) setPublicStatus(value); });
    return () => { active = false; };
  }, [initialPublicStatus]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submittingRef.current || !publicStatus?.submission_enabled) return;
    const selectedCategory = resolveSelectedFeedbackCategory(
      new FormData(event.currentTarget).get("feedback-category"),
      category,
    );
    if (!selectedCategory) return;
    submittingRef.current = true;
    setState("submitting");
    try {
      const result = await submitFeedback({
        submission_key: submissionKey,
        category: selectedCategory,
        title,
        details,
        screen_context: screenContext,
        locale,
        ...(subjectRef ? { subject_ref: subjectRef } : {}),
      });
      setReceipt(result);
      setState("success");
      setOwnerInboxRevision((value) => value + 1);
      void onFeedbackRecorded?.();
    } catch (error) {
      setState(error instanceof FeedbackSubmissionError && error.status === 429 ? "rate_limited" : "error");
    } finally {
      submittingRef.current = false;
    }
  };

  const reset = () => {
    setCategory(null);
    setTitle("");
    setDetails("");
    setReceipt(null);
    setSubmissionKey(createSubmissionKey());
    setState("idle");
  };

  return (
    <div className="feedback-workspace">
      <section className="feedback-hero">
        <span className="section-label">{copy.eyebrow}</span>
        <h3>{copy.heading}</h3>
        <p>{copy.description}</p>
      </section>

      <div className="feedback-layout">
        <section className="feedback-form-card">
          <div className="feedback-context" aria-label={copy.contextLabel}>
            <span>{copy.contextLabel}</span>
            <strong>{screenLabel(screenContext, locale)}</strong>
            {subjectLabel && <small>{subjectLabel}</small>}
          </div>

          {publicStatus === null ? (
            <div className="feedback-notice" role="status">{copy.checking}</div>
          ) : !publicStatus.submission_enabled ? (
            <div className="feedback-notice error" role="alert">{copy.unavailable}</div>
          ) : state === "success" && receipt ? (
            <FeedbackReceiptPanel receipt={receipt} onReset={reset} />
          ) : (
            <form onSubmit={(event) => void submit(event)} className="feedback-form" aria-describedby="feedback-form-purpose">
              <p id="feedback-form-purpose" className="feedback-form-purpose">{copy.formPurpose}</p>
              <fieldset>
                <legend>{copy.category}</legend>
                <div className="feedback-category-grid">
                  {FEEDBACK_CATEGORIES.map((value) => (
                    <label key={value} className={`feedback-category ${category === value ? "selected" : ""}`}>
                      <input
                        type="radio"
                        name="feedback-category"
                        value={value}
                        checked={category === value}
                        onChange={() => setCategory(value)}
                      />
                      <span><strong>{categoryCopy[locale][value].label}</strong><small>{categoryCopy[locale][value].description}</small></span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <label className="feedback-field">
                <span>{copy.title} <em>{copy.required}</em></span>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  minLength={5}
                  maxLength={publicStatus.max_title_length}
                  required
                  autoComplete="off"
                  aria-describedby="feedback-title-help"
                />
                <small id="feedback-title-help">{copy.titleHelp} · {Math.max(0, publicStatus.max_title_length - [...title].length)} {copy.charactersLeft}</small>
              </label>

              <label className="feedback-field">
                <span>{copy.details} <em>{copy.required}</em></span>
                <textarea
                  value={details}
                  onChange={(event) => setDetails(event.target.value)}
                  minLength={20}
                  maxLength={publicStatus.max_details_length}
                  rows={6}
                  required
                  aria-describedby="feedback-details-help"
                />
                <small id="feedback-details-help">{copy.detailsHelp} · {Math.max(0, publicStatus.max_details_length - [...details].length)} {copy.charactersLeft}</small>
              </label>

              <p className="feedback-privacy">{copy.privacy}</p>
              <div aria-live="polite">
                {state === "error" && <p className="feedback-inline-error" role="alert">{copy.error}</p>}
                {state === "rate_limited" && <p className="feedback-inline-error" role="alert">{copy.rateLimit}</p>}
              </div>
              {!formComplete && <p className="feedback-disabled-help" id="feedback-submit-help">{copy.completeRequired}</p>}
              <ActionButton
                type="submit"
                variant="primary"
                className="product-primary-button"
                loading={state === "submitting"}
                loadingLabel={copy.sending}
                disabled={!formComplete}
                aria-describedby={!formComplete ? "feedback-submit-help" : undefined}
              >
                {copy.send}
              </ActionButton>
            </form>
          )}
        </section>

        <aside className="feedback-boundary-card">
          <h4>{copy.boundaryTitle}</h4>
          <p>{copy.boundaryBody}</p>
          <p>{copy.noPersonalData}</p>
        </aside>
      </div>

      <OwnerFeedbackInbox
        initialStatus={initialOwnerStatus}
        refreshRevision={refreshRevision + ownerInboxRevision}
      />
    </div>
  );
}

export function FeedbackReceiptPanel({ receipt, onReset }: { receipt: FeedbackReceipt; onReset: () => void }) {
  const { locale } = useProductLocale();
  const copy = feedbackCopy(locale);
  const duplicate = receipt.submission_status === "ALREADY_RECORDED";
  return (
    <div className={`feedback-success ${duplicate ? "duplicate" : "recorded"}`} role="status" aria-live="polite">
      <div className="feedback-receipt-heading">
        <span className="feedback-receipt-mark" aria-hidden="true">✓</span>
        <div>
          <StatusBadge tone={duplicate ? "partial" : "ready"}>{duplicate ? copy.alreadyRecorded : copy.recorded}</StatusBadge>
          <h4>{duplicate ? copy.duplicate : copy.success}</h4>
        </div>
      </div>
      <dl>
        <div><dt>{copy.receipt}</dt><dd>{shortFeedbackId(receipt.feedback_id)}</dd></div>
        <div><dt>{copy.category}</dt><dd>{categoryCopy[locale][receipt.category].label}</dd></div>
        <div><dt>{copy.savedAt}</dt><dd>{formatProductDateTime(receipt.created_at, locale)}</dd></div>
      </dl>
      <p className="feedback-receipt-next">{duplicate ? copy.duplicateNext : copy.successNext}</p>
      <div className="feedback-receipt-actions">
        <ActionLink variant="primary" icon="arrow" iconPosition="end" className="product-primary-button" href="#candidate-results">{copy.returnToProduct}</ActionLink>
        <ActionButton variant="secondary" className="reports-secondary-button" onClick={onReset}>{copy.addAnother}</ActionButton>
      </div>
    </div>
  );
}

function OwnerFeedbackInbox({
  initialStatus,
  refreshRevision,
}: {
  initialStatus?: OwnerFeedbackStatus | null;
  refreshRevision: number;
}) {
  const { locale } = useProductLocale();
  const copy = feedbackCopy(locale);
  const [status, setStatus] = useState<OwnerFeedbackStatus | null>(initialStatus ?? null);
  const [items, setItems] = useState<OwnerFeedbackListItem[]>([]);
  const [detail, setDetail] = useState<OwnerFeedbackDetail | null>(null);
  const [category, setCategory] = useState<FeedbackCategory | "">("");
  const [feedbackStatus, setFeedbackStatus] = useState<FeedbackStatus | "">("");
  const [itemsLoading, setItemsLoading] = useState(initialStatus === undefined);
  const [listUnavailable, setListUnavailable] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const inboxIsEmpty = status?.total_count === 0 && !itemsLoading && !listUnavailable;

  useEffect(() => {
    if (initialStatus !== undefined) return;
    let active = true;
    setItemsLoading(true);
    setListUnavailable(false);
    void Promise.all([
      loadOwnerFeedbackStatus(),
      loadOwnerFeedbackList({
        ...(category ? { category } : {}),
        ...(feedbackStatus ? { status: feedbackStatus } : {}),
      }),
    ]).then(([nextStatus, nextItems]) => {
      if (!active) return;
      if (nextStatus) setStatus(nextStatus);
      if (nextItems) setItems(nextItems);
      else if (nextStatus) setListUnavailable(true);
      setItemsLoading(false);
    });
    return () => { active = false; };
  }, [category, feedbackStatus, initialStatus, refreshRevision]);

  const openDetail = async (feedbackId: string) => {
    setDetailLoading(true);
    const value = await loadOwnerFeedbackDetail(feedbackId);
    if (value) setDetail(value);
    setDetailLoading(false);
  };

  if (!status) return null;

  return (
    <section className="owner-feedback-inbox" aria-label={copy.inboxHeading}>
      <header className="owner-feedback-header">
        <div>
          <span className="section-label">{copy.ownerOnly}</span>
          <h3>{copy.inboxHeading}</h3>
          <p>{copy.inboxDescription}</p>
        </div>
        <StatusBadge tone={readinessTone(status.feedback_status)}>{formatReadiness(status.feedback_status, locale)}</StatusBadge>
      </header>

      <div className="owner-feedback-stats">
        <FeedbackFilterStat active={!category && !feedbackStatus} label={copy.total} value={status.total_count} onClick={() => { setCategory(""); setFeedbackStatus(""); setDetail(null); }} />
        <FeedbackFilterStat active={feedbackStatus === "NEW"} label={copy.newItems} value={status.new_count} onClick={() => { setCategory(""); setFeedbackStatus("NEW"); setDetail(null); }} />
        <FeedbackFilterStat active={category === "BLOCKER"} label={copy.blockers} value={status.blocker_count} onClick={() => { setCategory("BLOCKER"); setFeedbackStatus(""); setDetail(null); }} />
        <FeedbackFilterStat active={category === "IMPROVEMENT"} label={copy.improvements} value={status.improvement_count} onClick={() => { setCategory("IMPROVEMENT"); setFeedbackStatus(""); setDetail(null); }} />
        <FeedbackFilterStat active={category === "CLARIFICATION"} label={copy.clarifications} value={status.clarification_count} onClick={() => { setCategory("CLARIFICATION"); setFeedbackStatus(""); setDetail(null); }} />
        <FeedbackFilterStat active={category === "LATER"} label={copy.laterItems} value={status.later_count} onClick={() => { setCategory("LATER"); setFeedbackStatus(""); setDetail(null); }} />
      </div>

      <p className="owner-feedback-latest">{copy.latest}: <strong>{status.latest_feedback_at ? formatProductDateTime(status.latest_feedback_at, locale) : "—"}</strong></p>

      <div className="owner-feedback-toolbar">
        <label>{copy.category}
          <select value={category} onChange={(event) => {
            const next = event.target.value as FeedbackCategory | "";
            setCategory(next);
            setDetail(null);
          }}>
            <option value="">{copy.all}</option>
            {FEEDBACK_CATEGORIES.map((value) => <option value={value} key={value}>{categoryCopy[locale][value].label}</option>)}
          </select>
        </label>
        <label>{copy.status}
          <select value={feedbackStatus} onChange={(event) => {
            const next = event.target.value as FeedbackStatus | "";
            setFeedbackStatus(next);
            setDetail(null);
          }}>
            <option value="">{copy.all}</option>
            {FEEDBACK_STATUSES.map((value) => <option value={value} key={value}>{formatOwnerFeedbackStatus(value, locale)}</option>)}
          </select>
        </label>
        <div className="owner-feedback-export">
          {status.total_count === 0 ? (
            <>
              <ActionButton variant="tertiary" icon="lock" disabled aria-describedby="feedback-export-help">{copy.exportJson}</ActionButton>
              <ActionButton variant="tertiary" icon="lock" disabled aria-describedby="feedback-export-help">{copy.exportCsv}</ActionButton>
            </>
          ) : (
            <>
              <ActionLink variant="secondary" icon="download" href={getOwnerFeedbackExportUrl("json")} download>{copy.exportJson}</ActionLink>
              <ActionLink variant="secondary" icon="download" href={getOwnerFeedbackExportUrl("csv")} download>{copy.exportCsv}</ActionLink>
            </>
          )}
        </div>
      </div>

      {inboxIsEmpty ? (
        <div className="owner-feedback-empty-state">
          <strong>{copy.emptyInboxTitle}</strong>
          <p>{copy.emptyInbox}</p>
          <small id="feedback-export-help">{copy.exportUnavailable}</small>
        </div>
      ) : (
        <div className="owner-feedback-content">
          <div className="owner-feedback-list">
            {itemsLoading && <p className="feedback-empty" role="status">{copy.loadingInbox}</p>}
            {listUnavailable && <p className="feedback-empty error" role="alert">{copy.inboxUnavailable}</p>}
            {!itemsLoading && !listUnavailable && items.length === 0 && <p className="feedback-empty">{copy.empty}</p>}
            {items.map((item) => (
              <button
                type="button"
                key={item.feedback_id}
                onClick={() => void openDetail(item.feedback_id)}
                className={detail?.feedback_id === item.feedback_id ? "active" : ""}
                aria-current={detail?.feedback_id === item.feedback_id ? "true" : undefined}
              >
                <span className="owner-feedback-record-topline"><span className={`feedback-category-pill ${item.category.toLowerCase()}`}>{categoryCopy[locale][item.category].label}</span><span>{formatOwnerFeedbackStatus(item.status, locale)}</span></span>
                <strong>{item.title}</strong>
                <small>{item.subject_summary ?? screenLabel(item.screen_context, locale)} · {formatProductDateTime(item.created_at, locale)}</small>
                <span className="owner-feedback-open-indicator">{copy.openItem}<ProductIcon name="arrow" /></span>
              </button>
            ))}
          </div>
          <article className="owner-feedback-detail">
            {detailLoading ? <p className="feedback-empty" role="status">{copy.loadingDetail}</p> : <OwnerFeedbackDetailPanel detail={detail} />}
          </article>
        </div>
      )}
    </section>
  );
}

export function OwnerFeedbackDetailPanel({ detail }: { detail: OwnerFeedbackDetail | null }) {
  const { locale } = useProductLocale();
  const copy = feedbackCopy(locale);
  if (!detail) return <p className="feedback-empty">{copy.selectItem}</p>;
  const productVersion = detail.product_version ?? detail.build_sha;

  return (
    <>
      <div className="owner-feedback-detail-head">
        <span className={`feedback-category-pill ${detail.category.toLowerCase()}`}>{categoryCopy[locale][detail.category].label}</span>
        <span>{formatOwnerFeedbackStatus(detail.status, locale)}</span>
      </div>
      <h4>{detail.title}</h4>
      <dl className="owner-feedback-primary-meta">
        <div><dt>{copy.savedAt}</dt><dd>{formatProductDateTime(detail.created_at, locale)}</dd></div>
        <div><dt>{copy.contextLabel}</dt><dd>{screenLabel(detail.screen_context, locale)}</dd></div>
        {detail.subject_summary && <div><dt>{copy.subject}</dt><dd>{detail.subject_summary}</dd></div>}
        <div><dt>{copy.sessionGroup}</dt><dd>{formatPseudonymousSessionGroup(detail.session_group)}</dd></div>
        {productVersion && <div><dt>{copy.productVersion}</dt><dd>{formatProductVersion(productVersion)}</dd></div>}
      </dl>
      <section className="owner-feedback-message" aria-label={copy.feedbackContent}>
        <span>{copy.feedbackContent}</span>
        <p className="owner-feedback-details-text">{detail.details}</p>
      </section>
      <TechnicalDetails label={copy.technicalDetails}>
        <dl>
          <div><dt>{copy.receipt}</dt><dd>{shortFeedbackId(detail.feedback_id)}</dd></div>
          {detail.scanner_run_id && <div><dt>Run ID</dt><dd>{detail.scanner_run_id}</dd></div>}
          {detail.report_id && <div><dt>Report ID</dt><dd>{detail.report_id}</dd></div>}
          {detail.viewport_class && <div><dt>Viewport</dt><dd>{detail.viewport_class}</dd></div>}
          <div><dt>{copy.locale}</dt><dd>{detail.locale.toUpperCase()}</dd></div>
        </dl>
      </TechnicalDetails>
    </>
  );
}

function FeedbackFilterStat({ label, value, active, onClick }: { label: string; value: number; active: boolean; onClick: () => void }) {
  return <button type="button" className={active ? "active" : ""} data-action-variant="tertiary" aria-pressed={active} onClick={onClick}><span>{label}</span><strong>{value}</strong></button>;
}

function createSubmissionKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}0000-4000-8000-000000000000`.slice(-36);
}

export function resolveSelectedFeedbackCategory(
  selectedValue: FormDataEntryValue | null,
  fallback: FeedbackCategory | null,
): FeedbackCategory | null {
  return typeof selectedValue === "string"
    && (FEEDBACK_CATEGORIES as readonly string[]).includes(selectedValue)
    ? selectedValue as FeedbackCategory
    : fallback;
}

export function formatOwnerFeedbackStatus(status: FeedbackStatus, locale: ProductLocale): string {
  if (status === "NEW") return locale === "pl" ? "Nowe" : "New";
  if (status === "TRIAGED") return locale === "pl" ? "Przejrzane" : "Triaged";
  if (status === "PLANNED") return locale === "pl" ? "Zaplanowane" : "Planned";
  if (status === "RESOLVED") return locale === "pl" ? "Rozwiązane" : "Resolved";
  return locale === "pl" ? "Zamknięte" : "Closed";
}

function formatReadiness(value: OwnerFeedbackStatus["feedback_status"], locale: ProductLocale): string {
  if (value === "READY") return locale === "pl" ? "Gotowa" : "Ready";
  if (value === "PARTIAL") return locale === "pl" ? "Częściowa" : "Partial";
  return locale === "pl" ? "Niegotowa" : "Not ready";
}

function readinessTone(value: OwnerFeedbackStatus["feedback_status"]): "ready" | "partial" | "not-ready" {
  if (value === "READY") return "ready";
  if (value === "PARTIAL") return "partial";
  return "not-ready";
}

export function formatPseudonymousSessionGroup(sessionGroup: string): string {
  const match = /^session_([0-9a-f]{12})$/i.exec(sessionGroup);
  return match ? `SES-${match[1].slice(0, 6).toUpperCase()}` : "—";
}

export function formatProductVersion(productVersion: string): string {
  return /^[0-9a-f]{7,64}$/i.test(productVersion) ? productVersion.slice(0, 8) : "—";
}

function shortFeedbackId(value: string): string {
  return value.startsWith("fb_") ? `FB-${value.slice(3, 11).toUpperCase()}` : value;
}

function screenLabel(screen: FeedbackScreenContext, locale: ProductLocale): string {
  const labels: Record<FeedbackScreenContext, [string, string]> = {
    "candidate-results": ["Radar", "Radar"],
    "candidate-detail": ["Candidate detail", "Szczegóły kandydata"],
    "external-checks": ["External verification", "Weryfikacja zewnętrzna"],
    reports: ["Reports", "Raporty"],
    methodology: ["Methodology", "Metodologia"],
    "control-center": ["Control Center", "Centrum sterowania"],
    "trusted-preview": ["Preview path", "Ścieżka testowa"],
    feedback: ["Feedback", "Opinia"],
  };
  return labels[screen][locale === "pl" ? 1 : 0];
}

function feedbackCopy(locale: ProductLocale) {
  if (locale === "pl") return {
    eyebrow: "Opinia",
    heading: "Przekaż opinię",
    description: "Zgłoś bloker, niejasność albo pomysł dotyczący bieżącego widoku.",
    formPurpose: "Opisz jedną konkretną obserwację. Kontekst bieżącego ekranu zostanie dołączony automatycznie.",
    contextLabel: "Kontekst ekranu",
    checking: "Sprawdzanie dostępności zapisu…",
    unavailable: "Trwały zapis opinii jest teraz niedostępny. Spróbuj ponownie później.",
    category: "Kategoria",
    title: "Tytuł",
    details: "Opis",
    required: "wymagane",
    titleHelp: "Minimum 5 znaków",
    detailsHelp: "Minimum 20 znaków",
    completeRequired: "Wybierz kategorię oraz uzupełnij wymagany tytuł i opis, aby wysłać zgłoszenie.",
    charactersLeft: "znaków pozostało",
    privacy: "Nie podawaj danych osobowych, haseł ani kluczy API. Sesja jest grupowana wyłącznie pseudonimowo.",
    send: "Wyślij opinię",
    sending: "Zapisywanie…",
    success: "Opinia została zapisana. Dziękujemy.",
    duplicate: "To zgłoszenie zostało już zapisane.",
    recorded: "Przyjęto",
    alreadyRecorded: "Już przyjęto",
    successNext: "Zgłoszenie trafiło do odczytowej skrzynki właściciela. Nie zmienia danych ani decyzji Radaru.",
    duplicateNext: "Nie utworzono drugiego wpisu. Wcześniej przyjęte zgłoszenie pozostaje w skrzynce właściciela.",
    returnToProduct: "Wróć do Radaru",
    error: "Nie udało się zapisać opinii. Spróbuj ponownie.",
    rateLimit: "Wysłano kilka zgłoszeń w krótkim czasie. Odczekaj chwilę.",
    receipt: "Identyfikator",
    savedAt: "Zapisano",
    addAnother: "Dodaj kolejne zgłoszenie",
    boundaryTitle: "Zakres zgłoszenia",
    boundaryBody: "Opinia nie zmienia Radaru, oceny, cyklu obserwacji ani żadnej decyzji analitycznej.",
    noPersonalData: "Zapisujemy wyłącznie treść zgłoszenia i pseudonimowy identyfikator sesji.",
    inboxHeading: "Skrzynka opinii",
    inboxDescription: "Wyłącznie odczytowy panel właściciela. Tester nie widzi tej sekcji.",
    ownerOnly: "Panel właściciela",
    total: "Wszystkie",
    newItems: "Nowe",
    blockers: "Blokery",
    improvements: "Ulepszenia",
    clarifications: "Pytania i niejasności",
    laterItems: "Pomysły na później",
    latest: "Ostatnie zgłoszenie",
    all: "Wszystkie",
    status: "Status",
    exportJson: "Pobierz JSON",
    exportCsv: "Pobierz CSV",
    empty: "Brak zgłoszeń dla wybranych filtrów.",
    emptyInboxTitle: "Brak zapisanych opinii",
    emptyInbox: "Skrzynka jest pusta. Nie zapisano jeszcze żadnej opinii.",
    exportUnavailable: "Pobieranie będzie dostępne po zapisaniu pierwszej opinii.",
    loadingInbox: "Ładowanie skrzynki…",
    loadingDetail: "Ładowanie szczegółu…",
    inboxUnavailable: "Nie udało się odczytać skrzynki. Spróbuj ponownie później.",
    selectItem: "Wybierz zgłoszenie, aby zobaczyć szczegóły.",
    openItem: "Otwórz szczegóły",
    subject: "Kontekst produktu",
    sessionGroup: "Pseudonimowa grupa sesji",
    productVersion: "Wersja produktu",
    feedbackContent: "Treść zgłoszenia",
    technicalDetails: "Szczegóły techniczne",
    locale: "Język",
  };
  return {
    eyebrow: "Feedback",
    heading: "Send feedback",
    description: "Report a blocker, unclear point or idea about the current view.",
    formPurpose: "Describe one specific observation. The current screen context is attached automatically.",
    contextLabel: "Screen context",
    checking: "Checking capture availability…",
    unavailable: "Persistent feedback capture is currently unavailable. Try again later.",
    category: "Category",
    title: "Title",
    details: "Details",
    required: "required",
    titleHelp: "At least 5 characters",
    detailsHelp: "At least 20 characters",
    completeRequired: "Complete the required title and description to send feedback.",
    charactersLeft: "characters left",
    privacy: "Do not include personal data, passwords or API keys. The session is grouped pseudonymously only.",
    send: "Send feedback",
    sending: "Saving…",
    success: "Feedback was saved. Thank you.",
    duplicate: "This feedback was already recorded.",
    recorded: "Recorded",
    alreadyRecorded: "Already recorded",
    successNext: "The report is available in the read-only owner inbox. It does not change Radar data or decisions.",
    duplicateNext: "No duplicate entry was created. The previously recorded report remains in the owner inbox.",
    returnToProduct: "Return to Radar",
    error: "Feedback could not be saved. Please try again.",
    rateLimit: "Several reports were sent in a short time. Please wait a moment.",
    receipt: "Receipt",
    savedAt: "Saved at",
    addAnother: "Add another report",
    boundaryTitle: "Safe boundary",
    boundaryBody: "Feedback does not change Radar, scoring, lifecycle or any analytical decision.",
    noPersonalData: "Only the report content and a pseudonymous session identifier are stored.",
    inboxHeading: "Feedback inbox",
    inboxDescription: "Read-only owner view. Testers cannot see this section.",
    ownerOnly: "Owner only",
    total: "Total",
    newItems: "New",
    blockers: "Blockers",
    improvements: "Improvements",
    clarifications: "Questions and clarifications",
    laterItems: "Ideas for later",
    latest: "Latest feedback",
    all: "All",
    status: "Status",
    exportJson: "Export JSON",
    exportCsv: "Export CSV",
    empty: "No feedback matches the selected filters.",
    emptyInboxTitle: "No feedback recorded",
    emptyInbox: "The inbox is empty. No feedback has been recorded yet.",
    exportUnavailable: "Downloads will be available after the first feedback entry is recorded.",
    loadingInbox: "Loading inbox…",
    loadingDetail: "Loading detail…",
    inboxUnavailable: "The inbox could not be loaded. Try again later.",
    selectItem: "Select feedback to view details.",
    openItem: "Open details",
    subject: "Product context",
    sessionGroup: "Pseudonymous session group",
    productVersion: "Product version",
    feedbackContent: "Feedback content",
    technicalDetails: "Technical details",
    locale: "Language",
  };
}
