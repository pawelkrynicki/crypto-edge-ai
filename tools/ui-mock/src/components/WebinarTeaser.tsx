import React from "react";

const radarMetrics = [
  { label: "Projects scanned", value: "128", tone: "accent" },
  { label: "Needs analyst review", value: "24", tone: "amber" },
  { label: "Fresh context available", value: "76", tone: "green" },
  { label: "Risk flags detected", value: "9", tone: "red" },
];

const demoProjects = [
  { name: "Atlas Protocol", category: "Infrastructure", status: "Review priority", context: "Governance update and liquidity shift" },
  { name: "Nova Layer", category: "Layer network", status: "Needs context check", context: "New ecosystem activity" },
  { name: "Orion Markets", category: "Market tools", status: "Fresh sources", context: "Volume and community context changed" },
  { name: "Helio Finance", category: "DeFi research", status: "Manual review", context: "Security notes need analyst follow-up" },
];

const snapshotSections = [
  {
    title: "Narrative context",
    body: "Recent ecosystem attention is concentrated around developer activity, integrations and protocol positioning.",
  },
  {
    title: "Security notes",
    body: "Several checks are visible, with unresolved items kept separate for analyst verification.",
  },
  {
    title: "Liquidity / market context",
    body: "Market depth appears uneven across venues, so context is grouped for review rather than summarized as a decision.",
  },
  {
    title: "Open questions",
    body: "Clarify unlock timing, ownership concentration and whether recent growth is durable.",
  },
];

const sourceLayers = [
  { label: "Market context", status: "Fresh", tone: "green", detail: "Recent summary available" },
  { label: "Security indicators", status: "Partial", tone: "amber", detail: "Some checks require analyst review" },
  { label: "On-chain context", status: "Needs verification", tone: "amber", detail: "Coverage varies by network" },
  { label: "Community / narrative context", status: "Missing", tone: "slate", detail: "No positive context inferred" },
];

const reportPreview = [
  {
    title: "What changed",
    body: "The project appeared in a higher-priority research bucket after fresh market and narrative context arrived.",
  },
  {
    title: "Why it matters",
    body: "The update may help analysts decide where to spend research time first.",
  },
  {
    title: "Risks to verify",
    body: "Security notes, liquidity depth, ownership concentration and dependency on a single narrative remain open.",
  },
  {
    title: "Next review step",
    body: "Prepare a short analyst note and schedule a follow-up context check.",
  },
];

const reviewFlow = [
  "Detected",
  "Context checked",
  "Analyst review",
  "Watchlist",
  "Follow-up",
];

const captureScreens = [
  { label: "Radar Overview", shot: "radar-overview" },
  { label: "Project Research Snapshot", shot: "project-research-snapshot" },
  { label: "Source Confidence Layer", shot: "source-confidence-layer" },
  { label: "Analyst Research Brief", shot: "research-report-preview" },
  { label: "Review Flow", shot: "review-flow" },
  { label: "Research-only Closing Screen", shot: "closing-screen" },
];

const captureGuidance = [
  "Use browser screenshot/crop tools.",
  "Capture the product area only.",
  "Hide browser chrome and local system UI.",
  "Avoid internal setup views.",
  "Use demo-safe sections only.",
];

export const WebinarTeaser: React.FC = () => (
  <div className="webinar-teaser">
    <section className="webinar-hero">
      <div className="webinar-hero-copy">
        <span className="section-label">Demo-safe screenshot mode</span>
        <h3>Crypto Edge AI</h3>
        <p>Research radar for faster crypto project triage.</p>
      </div>
      <div className="webinar-hero-note">
        Built to organize context, risks and next review steps.
      </div>
    </section>

    <section className="webinar-capture-kit">
      <div className="webinar-capture-copy">
        <span className="section-label">Screenshot Capture Kit</span>
        <h3>Capture 4-6 demo-safe screens for webinar use.</h3>
        <p>Recommended viewport: 1920x1080 or 1440x900.</p>
      </div>

      <div className="webinar-capture-list">
        {captureScreens.map((screen, index) => (
          <div key={screen.shot} className="webinar-capture-item">
            <span>Screen {index + 1}</span>
            <strong>{screen.label}</strong>
          </div>
        ))}
      </div>

      <div className="webinar-capture-guidance">
        {captureGuidance.map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>
    </section>

    <section className="webinar-card webinar-radar-card" data-shot="radar-overview">
      <WebinarSectionHeader
        eyebrow="Radar Overview"
        screenLabel="Screen 1"
        title="Crypto Research Radar"
        description="A controlled demo view showing how projects can be organized for further research."
      />

      <div className="webinar-metric-grid">
        {radarMetrics.map((metric) => (
          <div key={metric.label} className={`webinar-metric ${metric.tone}`}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
          </div>
        ))}
      </div>

      <div className="webinar-project-list">
        {demoProjects.map((project) => (
          <article key={project.name} className="webinar-project-row">
            <div className="webinar-project-main">
              <strong>{project.name}</strong>
              <span>{project.category}</span>
            </div>
            <div className="webinar-project-context">{project.context}</div>
            <span className="webinar-status-pill">{project.status}</span>
          </article>
        ))}
      </div>
    </section>

    <section className="webinar-card webinar-snapshot-card" data-shot="project-research-snapshot">
      <WebinarSectionHeader
        eyebrow="Project Research Snapshot"
        screenLabel="Screen 2"
        title="Atlas Protocol"
        description="Research snapshot for one demo project with controlled, high-level context."
      />

      <div className="webinar-snapshot-layout">
        <div className="webinar-watchlist-panel">
          <span>Review state</span>
          <strong>Watchlist = manual review only</strong>
          <p>Analyst attention is requested before any conclusion is formed.</p>
        </div>

        <div className="webinar-snapshot-grid">
          {snapshotSections.map((section) => (
            <article key={section.title} className="webinar-mini-card">
              <h4>{section.title}</h4>
              <p>{section.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>

    <section className="webinar-card webinar-source-card" data-shot="source-confidence-layer">
      <WebinarSectionHeader
        eyebrow="Source Confidence Layer"
        screenLabel="Screen 3"
        title="Source Confidence Layer"
        description="Freshness and coverage are grouped at a high level with abstract source categories."
      />

      <div className="webinar-source-grid">
        {sourceLayers.map((layer) => (
          <article key={layer.label} className="webinar-source-row">
            <div>
              <strong>{layer.label}</strong>
              <p>{layer.detail}</p>
            </div>
            <span className={`webinar-source-status ${layer.tone}`}>{layer.status}</span>
          </article>
        ))}
      </div>

      <div className="webinar-research-boundary">
        Missing data does not pass as positive context.
      </div>
    </section>

    <section className="webinar-card webinar-report-card" data-shot="research-report-preview">
      <WebinarSectionHeader
        eyebrow="Research Report Preview"
        screenLabel="Screen 4"
        title="Analyst research brief"
        description="excerpt / demo-safe preview"
      />

      <div className="webinar-report-grid">
        {reportPreview.map((item) => (
          <article key={item.title} className="webinar-report-section">
            <h4>{item.title}</h4>
            <p>{item.body}</p>
          </article>
        ))}
      </div>
    </section>

    <section className="webinar-card webinar-flow-card" data-shot="review-flow">
      <WebinarSectionHeader
        eyebrow="Review Flow"
        screenLabel="Screen 5"
        title="Human analyst stays in control."
        description="The workflow is built for research triage, not automated decisions."
      />

      <div className="webinar-flow">
        {reviewFlow.map((step, index) => (
          <div key={step} className="webinar-flow-step">
            <span>{index + 1}</span>
            <strong>{step}</strong>
          </div>
        ))}
      </div>

      <div className="webinar-research-boundary">
        WATCHLIST means manual review only.
      </div>
    </section>

    <section className="webinar-closing" data-shot="closing-screen">
      <div className="webinar-section-topline">
        <span className="section-label">Product Teaser / Closing Screen</span>
        <span className="webinar-screen-label">Screen 6</span>
      </div>
      <h3>Crypto Edge AI</h3>
      <p>Research radar for faster crypto project triage.</p>
      <p>Built to organize context, risks and next review steps.</p>
      <strong>Research-only preview.</strong>
    </section>
  </div>
);

function WebinarSectionHeader({
  eyebrow,
  screenLabel,
  title,
  description,
}: {
  eyebrow: string;
  screenLabel: string;
  title: string;
  description: string;
}) {
  return (
    <header className="webinar-section-header">
      <div className="webinar-section-topline">
        <span className="section-label">{eyebrow}</span>
        <span className="webinar-screen-label">{screenLabel}</span>
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
    </header>
  );
}
