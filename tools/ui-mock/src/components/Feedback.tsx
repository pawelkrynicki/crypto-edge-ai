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

type FeedbackProps = {
  screenContext: FeedbackScreenContext;
  subjectRef?: FeedbackSubjectRef;
  subjectLabel?: string;
  initialPublicStatus?: FeedbackPublicStatus | null;
  initialOwnerStatus?: OwnerFeedbackStatus | null;
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
  refreshRevision = 0,
  onFeedbackRecorded,
}: FeedbackProps) {
  const { locale } = useProductLocale();
  const copy = feedbackCopy(locale);
  const [publicStatus, setPublicStatus] = useState<Awaited<ReturnType<typeof loadFeedbackStatus>>>(initialPublicStatus ?? null);
  const [category, setCategory] = useState<FeedbackCategory>("BLOCKER");
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [submissionKey, setSubmissionKey] = useState(createSubmissionKey);
  const [state, setState] = useState<"idle" | "submitting" | "error" | "rate_limited" | "success">("idle");
  const [receipt, setReceipt] = useState<FeedbackReceipt | null>(null);
  const [ownerInboxRevision, setOwnerInboxRevision] = useState(0);
  const submittingRef = useRef(false);

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
    setTitle("");
    setDetails("");
    setReceipt(null);
    setSubmissionKey(createSubmissionKey());
    setState("idle");
  };

  return (
    <div className="feedback-workspace">
      <section className="feedback-hero">
        <span className="section-label">Feedback</span>
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
            <div className="feedback-success" role="status">
              <span aria-hidden="true">✓</span>
              <h4>{receipt.submission_status === "ALREADY_RECORDED" ? copy.duplicate : copy.success}</h4>
              <dl>
                <div><dt>{copy.receipt}</dt><dd>{shortFeedbackId(receipt.feedback_id)}</dd></div>
                <div><dt>{copy.category}</dt><dd>{categoryCopy[locale][receipt.category].label}</dd></div>
                <div><dt>{copy.savedAt}</dt><dd>{formatProductDateTime(receipt.created_at, locale)}</dd></div>
              </dl>
              <button type="button" className="product-primary-button" onClick={reset}>{copy.addAnother}</button>
            </div>
          ) : (
            <form onSubmit={(event) => void submit(event)} className="feedback-form">
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
                <span>{copy.title}</span>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  minLength={5}
                  maxLength={publicStatus.max_title_length}
                  required
                  autoComplete="off"
                />
                <small>{Math.max(0, publicStatus.max_title_length - [...title].length)} {copy.charactersLeft}</small>
              </label>

              <label className="feedback-field">
                <span>{copy.details}</span>
                <textarea
                  value={details}
                  onChange={(event) => setDetails(event.target.value)}
                  minLength={20}
                  maxLength={publicStatus.max_details_length}
                  rows={8}
                  required
                />
                <small>{Math.max(0, publicStatus.max_details_length - [...details].length)} {copy.charactersLeft}</small>
              </label>

              <p className="feedback-privacy">{copy.privacy}</p>
              {state === "error" && <p className="feedback-inline-error" role="alert">{copy.error}</p>}
              {state === "rate_limited" && <p className="feedback-inline-error" role="alert">{copy.rateLimit}</p>}
              <button type="submit" className="product-primary-button" disabled={state === "submitting"}>
                {state === "submitting" ? copy.sending : copy.send}
              </button>
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

  useEffect(() => {
    if (initialStatus !== undefined) return;
    let active = true;
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
    });
    return () => { active = false; };
  }, [category, feedbackStatus, initialStatus, refreshRevision]);

  const openDetail = async (feedbackId: string) => {
    const value = await loadOwnerFeedbackDetail(feedbackId);
    if (value) setDetail(value);
  };

  if (!status) return null;

  return (
    <section className="owner-feedback-inbox" aria-label={copy.inboxHeading}>
      <header className="owner-feedback-header">
        <div>
          <span className="section-label">Owner only</span>
          <h3>{copy.inboxHeading}</h3>
          <p>{copy.inboxDescription}</p>
        </div>
        <div className={`feedback-storage-status ${status.feedback_status.toLowerCase()}`}>
          {status.feedback_status}
        </div>
      </header>

      <div className="owner-feedback-stats">
        <FeedbackStat label={copy.total} value={status.total_count} />
        <FeedbackStat label={copy.newItems} value={status.new_count} />
        <FeedbackStat label={copy.blockers} value={status.blocker_count} />
        <FeedbackStat label={copy.improvements} value={status.improvement_count} />
        <FeedbackStat label={copy.clarifications} value={status.clarification_count} />
        <FeedbackStat label={copy.laterItems} value={status.later_count} />
        <FeedbackStat label={copy.latest} value={status.latest_feedback_at ? formatProductDateTime(status.latest_feedback_at, locale) : "—"} />
      </div>

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
            {FEEDBACK_STATUSES.map((value) => <option value={value} key={value}>{value}</option>)}
          </select>
        </label>
        <div className="owner-feedback-export">
          <a href={getOwnerFeedbackExportUrl("json")} download>{copy.exportJson}</a>
          <a href={getOwnerFeedbackExportUrl("csv")} download>{copy.exportCsv}</a>
        </div>
      </div>

      <div className="owner-feedback-content">
        <div className="owner-feedback-list">
          {items.length === 0 && <p className="feedback-empty">{copy.empty}</p>}
          {items.map((item) => (
            <button type="button" key={item.feedback_id} onClick={() => void openDetail(item.feedback_id)} className={detail?.feedback_id === item.feedback_id ? "active" : ""}>
              <span className={`feedback-category-pill ${item.category.toLowerCase()}`}>{categoryCopy[locale][item.category].label}</span>
              <strong>{item.title}</strong>
              <small>{screenLabel(item.screen_context, locale)} · {formatProductDateTime(item.created_at, locale)}</small>
            </button>
          ))}
        </div>
        <article className="owner-feedback-detail">
          {detail ? (
            <>
              <div className="owner-feedback-detail-head">
                <span className={`feedback-category-pill ${detail.category.toLowerCase()}`}>{categoryCopy[locale][detail.category].label}</span>
                <span>{detail.status}</span>
              </div>
              <h4>{detail.title}</h4>
              <p className="owner-feedback-details-text">{detail.details}</p>
              <dl>
                <div><dt>{copy.receipt}</dt><dd>{shortFeedbackId(detail.feedback_id)}</dd></div>
                <div><dt>{copy.contextLabel}</dt><dd>{screenLabel(detail.screen_context, locale)}</dd></div>
                {detail.subject_summary && <div><dt>{copy.subject}</dt><dd>{detail.subject_summary}</dd></div>}
                <div><dt>{copy.sessionGroup}</dt><dd>{detail.session_group}</dd></div>
                {detail.build_sha && <div><dt>Build</dt><dd>{detail.build_sha}</dd></div>}
              </dl>
            </>
          ) : <p className="feedback-empty">{copy.selectItem}</p>}
        </article>
      </div>
    </section>
  );
}

function FeedbackStat({ label, value }: { label: string; value: string | number }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}

function createSubmissionKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}0000-4000-8000-000000000000`.slice(-36);
}

export function resolveSelectedFeedbackCategory(
  selectedValue: FormDataEntryValue | null,
  fallback: FeedbackCategory,
): FeedbackCategory {
  return typeof selectedValue === "string"
    && (FEEDBACK_CATEGORIES as readonly string[]).includes(selectedValue)
    ? selectedValue as FeedbackCategory
    : fallback;
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
    feedback: ["Feedback", "Feedback"],
  };
  return labels[screen][locale === "pl" ? 1 : 0];
}

function feedbackCopy(locale: ProductLocale) {
  if (locale === "pl") return {
    heading: "Przekaż feedback",
    description: "Zgłoś bloker, niejasność albo pomysł dotyczący bieżącego widoku.",
    contextLabel: "Kontekst ekranu",
    checking: "Sprawdzanie dostępności zapisu…",
    unavailable: "Trwały zapis feedbacku jest teraz niedostępny. Spróbuj ponownie później.",
    category: "Kategoria",
    title: "Tytuł",
    details: "Opis",
    charactersLeft: "znaków pozostało",
    privacy: "Nie podawaj danych osobowych, haseł ani kluczy API.",
    send: "Wyślij feedback",
    sending: "Zapisywanie…",
    success: "Feedback został zapisany. Dziękujemy.",
    duplicate: "To zgłoszenie zostało już zapisane.",
    error: "Nie udało się zapisać feedbacku. Spróbuj ponownie.",
    rateLimit: "Wysłano kilka zgłoszeń w krótkim czasie. Odczekaj chwilę.",
    receipt: "Identyfikator",
    savedAt: "Zapisano",
    addAnother: "Dodaj kolejne zgłoszenie",
    boundaryTitle: "Bezpieczna granica",
    boundaryBody: "Feedback nie zmienia Radaru, scoringu, lifecycle ani żadnej decyzji analitycznej.",
    noPersonalData: "Zapisujemy wyłącznie treść zgłoszenia i pseudonimowy identyfikator sesji.",
    inboxHeading: "Skrzynka feedbacku",
    inboxDescription: "Wyłącznie odczytowy widok ownera. Tester nie widzi tej sekcji.",
    total: "Wszystkie",
    newItems: "Nowe",
    blockers: "Blokery",
    improvements: "Ulepszenia",
    clarifications: "Pytania i niejasności",
    laterItems: "Pomysły na później",
    latest: "Ostatnie zgłoszenie",
    all: "Wszystkie",
    status: "Status",
    exportJson: "Eksport JSON",
    exportCsv: "Eksport CSV",
    empty: "Brak zgłoszeń dla wybranych filtrów.",
    selectItem: "Wybierz zgłoszenie, aby zobaczyć szczegóły.",
    subject: "Kontekst produktu",
    sessionGroup: "Grupa sesji",
  };
  return {
    heading: "Send feedback",
    description: "Report a blocker, unclear point or idea about the current view.",
    contextLabel: "Screen context",
    checking: "Checking capture availability…",
    unavailable: "Persistent feedback capture is currently unavailable. Try again later.",
    category: "Category",
    title: "Title",
    details: "Details",
    charactersLeft: "characters left",
    privacy: "Do not include personal data, passwords or API keys.",
    send: "Send feedback",
    sending: "Saving…",
    success: "Feedback was saved. Thank you.",
    duplicate: "This feedback was already recorded.",
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
    selectItem: "Select feedback to view details.",
    subject: "Product context",
    sessionGroup: "Session group",
  };
}
