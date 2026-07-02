import React from "react";

const clickPathSteps = [
  {
    title: "Step 1 - Start with radar overview",
    detail: "Scan the current project list, visible risk flags, and review priority before opening details.",
  },
  {
    title: "Step 2 - Open a candidate/project",
    detail: "Pick one item and move into its project context, reasons, and review notes.",
  },
  {
    title: "Step 3 - Check source freshness",
    detail: "Look for the most recent context marker and any missing or partial data notes.",
  },
  {
    title: "Step 4 - Read the research snapshot",
    detail: "Use the snapshot to understand context, open questions, and risks that need human review.",
  },
  {
    title: "Step 5 - Review report preview",
    detail: "Check whether the report format explains what changed, why it matters, and what needs verification.",
  },
  {
    title: "Step 6 - Leave structured feedback",
    detail: "Use the prompts below to describe clarity, confusion, missing context, and the next review need.",
  },
];

const toolCards = [
  {
    title: "Research radar",
    body: "Organizes projects by review priority, available context, and visible risk areas.",
  },
  {
    title: "Context organizer",
    body: "Groups project, market, source, and review notes into one readable path.",
  },
  {
    title: "Risk checklist",
    body: "Keeps missing data, unresolved checks, and manual verification needs visible.",
  },
  {
    title: "Review workflow",
    body: "Separates scanner output from human review notes and follow-up context.",
  },
  {
    title: "Report preview",
    body: "Shows how a compact research brief can summarize context and open review questions.",
  },
];

const notToolItems = [
  "It does not make portfolio decisions.",
  "It does not replace analyst judgment.",
  "It does not hide missing data.",
  "It does not treat WATCHLIST as an instruction.",
];

const labelGuidance = [
  {
    label: "WATCHLIST",
    detail: "manual review only",
  },
  {
    label: "Missing data",
    detail: "manual verification required",
  },
  {
    label: "Freshness",
    detail: "context recency, not quality guarantee",
  },
  {
    label: "Review status",
    detail: "does not change scanner label or scoring",
  },
];

const feedbackPrompts = [
  "Is the product purpose clear?",
  "Which view is most useful?",
  "What feels confusing?",
  "Is source freshness clear?",
  "Is WATCHLIST understood as manual review only?",
  "What would you need before accepting this direction?",
];

export const TrustedPreview: React.FC = () => (
  <div className="trusted-preview">
    <section className="trusted-preview-hero">
      <div className="trusted-preview-hero-copy">
        <span className="section-label">Guided standalone preview path</span>
        <h3>Trusted Preview</h3>
        <p>A guided standalone product walkthrough for a trusted external reviewer.</p>
        <p>Crypto Edge AI helps organize projects, context, risks, and next research steps in one readable workspace.</p>
        <p>This view can be opened directly with #trusted-preview.</p>
      </div>
      <div className="trusted-preview-research-note">
        Research-only. WATCHLIST means manual review only.
      </div>
    </section>

    <section className="trusted-preview-section trusted-preview-path">
      <TrustedPreviewHeader
        label="Click path"
        title="10-minute click path"
        description="A simple route for understanding what to open, what to read, and what to review next."
      />
      <div className="trusted-preview-step-grid">
        {clickPathSteps.map((step) => (
          <article key={step.title} className="trusted-preview-step">
            <h4>{step.title}</h4>
            <p>{step.detail}</p>
          </article>
        ))}
      </div>
    </section>

    <div className="trusted-preview-two-column">
      <section className="trusted-preview-section">
        <TrustedPreviewHeader
          label="Purpose"
          title="What this tool is"
          description="A research workspace that makes context, risk, review, and report flow easier to inspect."
        />
        <div className="trusted-preview-card-grid">
          {toolCards.map((card) => (
            <article key={card.title} className="trusted-preview-card">
              <h4>{card.title}</h4>
              <p>{card.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="trusted-preview-section">
        <TrustedPreviewHeader
          label="Boundaries"
          title="What this tool is not"
          description="The preview keeps human judgment and missing data visible."
        />
        <div className="trusted-preview-boundary-list">
          {notToolItems.map((item) => (
            <div key={item} className="trusted-preview-boundary-item">
              {item}
            </div>
          ))}
        </div>
      </section>
    </div>

    <section className="trusted-preview-section">
      <TrustedPreviewHeader
        label="Labels"
        title="Reading the labels"
        description="Use these meanings while reading radar, project, review, and report preview screens."
      />
      <div className="trusted-preview-label-grid">
        {labelGuidance.map((item) => (
          <article key={item.label} className="trusted-preview-label-card">
            <strong>{item.label}</strong>
            <p>{item.detail}</p>
          </article>
        ))}
      </div>
    </section>

    <section className="trusted-preview-section trusted-preview-feedback">
      <TrustedPreviewHeader
        label="Reviewer notes"
        title="Feedback prompts"
        description="Guidance only for the first external review conversation. Feedback capture comes later."
      />
      <div className="trusted-preview-prompt-grid">
        {feedbackPrompts.map((prompt) => (
          <div key={prompt} className="trusted-preview-prompt">
            {prompt}
          </div>
        ))}
      </div>
    </section>

    <section className="trusted-preview-readiness-note">
      <strong>Preview readiness note</strong>
      <p>This preview shell prepares the external review path. Private access and feedback capture are later steps.</p>
    </section>
  </div>
);

function TrustedPreviewHeader({
  label,
  title,
  description,
}: {
  label: string;
  title: string;
  description: string;
}) {
  return (
    <header className="trusted-preview-section-header">
      <span className="section-label">{label}</span>
      <h3>{title}</h3>
      <p>{description}</p>
    </header>
  );
}
