import React from "react";

const sessionChecklist = [
  "Open Trusted Preview",
  "Follow the 10-minute click path",
  "Open radar overview",
  "Open candidate/project detail",
  "Check source freshness",
  "Read report preview",
  "Review labels and boundaries",
  "Capture feedback",
];

const feedbackPrompts = [
  "Is the product purpose clear?",
  "Which screen is most useful?",
  "What feels confusing?",
  "Is source freshness clear?",
  "Is WATCHLIST understood as manual review only?",
  "Are missing-data states clear?",
  "Does the report preview help?",
  "What would you need before accepting this direction?",
];

const triageBuckets = [
  {
    title: "Blocker",
    body: "prevents meaningful trusted tester use.",
  },
  {
    title: "Improvement",
    body: "would make the preview clearer or smoother.",
  },
  {
    title: "Later idea",
    body: "useful, but not needed before first external review.",
  },
  {
    title: "Clarification needed",
    body: "requires owner/product decision.",
  },
];

const sessionTemplate = [
  "Session date:",
  "Reviewer:",
  "Top confusion:",
  "Most useful view:",
  "Missing context:",
  "Trust blockers:",
  "Next changes:",
  "Owner decision:",
];

const previewBoundaries = [
  "This shell does not save feedback yet.",
  "Feedback capture and private access are later steps.",
  "No data is sent from this view.",
];

export const FeedbackNotes: React.FC = () => (
  <div className="feedback-notes">
    <section className="feedback-notes-hero">
      <div className="feedback-notes-hero-copy">
        <span className="section-label">Post-session worksheet</span>
        <h3>Feedback Notes</h3>
        <p>Structured session notes for a trusted preview review.</p>
        <p>Research-only. Feedback helps improve clarity, workflow and trust.</p>
        <p>This view helps organize feedback after the trusted preview path is completed.</p>
      </div>
      <div className="feedback-notes-boundary-card">
        No feedback is saved or sent from this shell.
      </div>
    </section>

    <section className="feedback-notes-section">
      <FeedbackNotesHeader
        label="Session checklist"
        title="Session checklist"
        description="A static review path for what the preview reviewer should inspect before notes are summarized."
      />
      <div className="feedback-notes-checklist">
        {sessionChecklist.map((item, index) => (
          <div key={item} className="feedback-notes-check-item">
            <span>{index + 1}</span>
            <p>{item}</p>
          </div>
        ))}
      </div>
    </section>

    <section className="feedback-notes-section">
      <FeedbackNotesHeader
        label="Feedback prompts"
        title="Feedback prompts"
        description="Use these questions to capture clarity, confusion, trust boundaries and missing context."
      />
      <div className="feedback-notes-prompt-grid">
        {feedbackPrompts.map((prompt) => (
          <div key={prompt} className="feedback-notes-prompt">
            {prompt}
          </div>
        ))}
      </div>
    </section>

    <section className="feedback-notes-section">
      <FeedbackNotesHeader
        label="Triage buckets"
        title="Triage buckets"
        description="Group feedback by what must change now, what can improve the preview, and what needs a product decision."
      />
      <div className="feedback-notes-triage-grid">
        {triageBuckets.map((bucket) => (
          <article key={bucket.title} className="feedback-notes-triage-card">
            <h4>{bucket.title}</h4>
            <p>{bucket.body}</p>
          </article>
        ))}
      </div>
    </section>

    <div className="feedback-notes-two-column">
      <section className="feedback-notes-section">
        <FeedbackNotesHeader
          label="Session notes template"
          title="Session notes template"
          description="Static copy block for owner notes after a trusted preview session."
        />
        <pre className="feedback-notes-template">{sessionTemplate.join("\n")}</pre>
      </section>

      <section className="feedback-notes-section">
        <FeedbackNotesHeader
          label="Preview boundary"
          title="Preview boundary"
          description="The worksheet is visible guidance only; real capture belongs to a later step."
        />
        <div className="feedback-notes-boundary-list">
          {previewBoundaries.map((item) => (
            <div key={item} className="feedback-notes-boundary-item">
              {item}
            </div>
          ))}
        </div>
      </section>
    </div>
  </div>
);

function FeedbackNotesHeader({
  label,
  title,
  description,
}: {
  label: string;
  title: string;
  description: string;
}) {
  return (
    <header className="feedback-notes-section-header">
      <span className="section-label">{label}</span>
      <h3>{title}</h3>
      <p>{description}</p>
    </header>
  );
}
