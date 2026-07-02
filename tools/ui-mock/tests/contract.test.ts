import assert from "node:assert/strict";
import { get, request } from "node:http";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import type { AddressInfo } from "node:net";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { mapPersistableScannerOutputToUiCandidates } from "../src/adapters/scannerOutputAdapter";
import { CandidateDetail, getMissingSecurityText } from "../src/components/CandidateDetail";
import { ControlCenter } from "../src/components/ControlCenter";
import { LocalMvpWorkflowPanel } from "../src/components/LocalMvpWorkflowPanel";
import { MarketContextPanel } from "../src/components/MarketContextPanel";
import { ScannerRadar } from "../src/components/ScannerRadar";
import { StatCards } from "../src/components/StatCards";
import { FeedbackNotes } from "../src/components/FeedbackNotes";
import { TrustedPreview } from "../src/components/TrustedPreview";
import { WatchlistTab } from "../src/components/WatchlistTab";
import { WebinarTeaser } from "../src/components/WebinarTeaser";
import { WorkspaceOverview } from "../src/components/WorkspaceOverview";
import { WorkspaceSection, WorkspaceShell, type WorkspaceNavItem } from "../src/components/WorkspaceShell";
import { PERSISTABLE_SCANNER_SAMPLE } from "../src/fixtures/persistableScannerSample";
import { toMockCandidate } from "../src/mockData";
import { interpretContextApiOutput, parseMarketContextApiOutput } from "../src/services/contextDataSource";
import {
  createReviewSessionExport,
  createEmptyReviewSession,
  getCandidateReview,
  importReviewSession,
  loadReviewSession,
  mergeReviewSessionState,
  parseReviewSessionImport,
  REVIEW_SESSION_STORAGE_KEY,
  saveReviewRecord,
  saveReviewSessionState,
} from "../src/services/reviewSessionStore";
import type { StorageLike } from "../src/services/reviewSessionStore";
import {
  loadReviewSessionDiagnosticsFromApi,
  loadReviewSessionFromApi,
} from "../src/services/reviewSessionApi";
import { interpretScannerApiOutput } from "../src/services/scannerDataSource";
import type { ReviewSessionState } from "../src/types/reviewSessionTypes";
import type { PersistableScannerOutput, ScannerApiOutput } from "../src/types/scannerTypes";
import { createScannerApiServer } from "../server/scannerApiServer";
import { readLatestContextOutput, type ContextLatestOutput } from "../server/latestContextOutput";
import { isPersistableScannerOutputShape } from "../server/latestScannerOutput";
import {
  createFileReviewSessionStorageProvider,
  ReviewSessionFileStoreError,
  readReviewSessionDiagnostics,
  readReviewSessionFile,
  writeReviewSessionFile,
} from "../server/reviewSessionFileStore";
import {
  createSqliteReviewSessionStorageProvider,
  readReviewSessionSqlite,
  readReviewSessionSqliteDiagnostics,
  writeReviewSessionSqlite,
} from "../server/reviewSessionSqliteStore";
import type { ReviewSessionStorageProvider } from "../server/reviewSessionStorageProvider";
import { validateReviewSessionState } from "../src/services/reviewSessionValidation";

const realFixture = PERSISTABLE_SCANNER_SAMPLE;
const uiCandidates = mapPersistableScannerOutputToUiCandidates(realFixture);
const passCandidate = realFixture.candidates.find((candidate) => candidate.symbol === "PASS");
const lowlCandidate = realFixture.candidates.find((candidate) => candidate.symbol === "LOWL");
const fdvCandidate = realFixture.candidates.find((candidate) => candidate.symbol === "FDV");

assert.ok(passCandidate);
assert.ok(lowlCandidate);
assert.ok(fdvCandidate);

const passUi = uiCandidates.find((candidate) => candidate.symbol === "PASS");
const lowlUi = uiCandidates.find((candidate) => candidate.symbol === "LOWL");
const fdvUi = uiCandidates.find((candidate) => candidate.symbol === "FDV");

assert.ok(passUi);
assert.ok(lowlUi);
assert.ok(fdvUi);

assert.equal(passUi.id, passCandidate.candidate_id, "candidate_id becomes UI id");
assert.equal(passUi.security?.honeypotStatus, "passed", "security_check joins by candidate_id");
assert.equal(passUi.securityLabel, "SECURITY_PASSED", "security_label comes from security_check");
assert.equal(passUi.scorecard?.decisionLabel, "WATCHLIST", "scorecard joins by candidate_id");
assert.equal(passUi.priceUsd, passCandidate.price_usd, "price_usd is preserved");
assert.equal(fdvUi.fdvUsd, fdvCandidate.fdv_usd, "fdv_usd is preserved");

assert.equal(passUi.finalLabel, "WATCHLIST");
assert.ok(passUi.security, "WATCHLIST candidate with security displays security data");

assert.equal(lowlUi.finalLabel, "REJECT");
assert.equal(lowlUi.security, null, "rejected candidate has no security detail");
assert.equal(lowlUi.securityLabel, "NOT_CHECKED", "rejected candidate without security remains NOT_CHECKED");

const passedWithoutSecurity = {
  ...realFixture,
  candidates: [
    {
      ...passCandidate,
      candidate_id: "passed-without-security",
      basic_filter_status: "passed_basic_filter",
    },
  ],
  security_checks: [],
  scorecards: [],
} satisfies PersistableScannerOutput;
const [missingSecurityUi] = mapPersistableScannerOutputToUiCandidates(passedWithoutSecurity);

assert.equal(missingSecurityUi.securityLabel, "NOT_CHECKED");
assert.equal(
  getMissingSecurityText({ basic_filter_status: missingSecurityUi.basicFilterStatus }),
  "Security data is unavailable. Manual verification is required.",
  "missing security for a passed candidate does not claim it failed basic filters",
);

const obsoleteIdOnlyShape = {
  scan_run: { id: "old-run" },
  candidates: [{ id: "old-candidate" }],
  security_checks: [{ id: "old-security", candidate_id: "old-candidate" }],
  scorecards: [{ id: "old-scorecard", candidate_id: "old-candidate" }],
};

assert.equal(
  isPersistableScannerOutputShape(obsoleteIdOnlyShape),
  false,
  "obsolete id-only fixture is rejected by API validation",
);
assert.equal(
  isPersistableScannerOutputShape(realFixture),
  true,
  "real data-poc shaped fixture passes validation",
);

const publicFixturePath = resolve("public", "fixtures", "persistableScannerSample.json");
const publicFixture = JSON.parse(await readFile(publicFixturePath, "utf8"));

assert.equal(
  isPersistableScannerOutputShape(publicFixture),
  true,
  "public JSON fixture passes validation",
);

const apiRealOutput: ScannerApiOutput = {
  ...realFixture,
  _source_meta: {
    source: "real-output",
    path: "../data-poc/output/scan_20260623073520/full_output.json",
    reason: "latest valid tools/data-poc output selected",
    selected_run_id: "scan_20260623073520",
    loaded_at: "2026-06-23T07:35:21.000Z",
  },
};
const apiRealResult = interpretScannerApiOutput(apiRealOutput);

assert.equal(apiRealResult.usedFallback, false, "API real-output metadata is not a fallback");
assert.equal(apiRealResult.resolvedSource, "real-output", "API real-output metadata resolves correctly");

const apiFixtureFallbackOutput: ScannerApiOutput = {
  ...realFixture,
  _source_meta: {
    source: "fixture-fallback",
    path: "public/fixtures/persistableScannerSample.json",
    reason: "no valid real scanner output found",
    selected_run_id: null,
    loaded_at: "2026-06-23T07:35:21.000Z",
  },
};
const apiFixtureFallbackResult = interpretScannerApiOutput(apiFixtureFallbackOutput);

assert.equal(apiFixtureFallbackResult.usedFallback, true, "API fixture-fallback metadata is a fallback");
assert.equal(
  apiFixtureFallbackResult.fallbackReason,
  "no valid real scanner output found",
  "fallbackReason comes from API source metadata",
);
assert.equal(
  apiFixtureFallbackResult.resolvedSource,
  "fixture-fallback",
  "API fixture-fallback metadata resolves correctly",
);

const contextFixturePath = resolve("public", "fixtures", "contextLatestFixture.json");
const contextFixture = JSON.parse(await readFile(contextFixturePath, "utf8"));
const parsedContextFixture = parseMarketContextApiOutput(contextFixture);
const interpretedContextFixture = interpretContextApiOutput(parsedContextFixture);

if (interpretedContextFixture.status !== "ready") {
  throw new Error("context fixture should parse as a ready API result");
}

assert.equal(
  parsedContextFixture._source_meta.source_kind,
  "fixture-fallback",
  "context fallback fixture declares fixture-fallback metadata",
);
assert.equal(
  interpretedContextFixture.usedFallback,
  true,
  "context API client recognizes fixture-fallback metadata",
);

const fixturePanelMarkup = renderToStaticMarkup(React.createElement(MarketContextPanel, {
  state: {
    status: "ready",
    context: parsedContextFixture,
    message: interpretedContextFixture.fallbackReason,
  },
}));

assert.match(fixturePanelMarkup, /42/, "panel renders Fear & Greed value");
assert.match(fixturePanelMarkup, /Lido/, "panel renders DefiLlama protocol rows");
assert.match(fixturePanelMarkup, /Uniswap V3/, "panel renders multiple DefiLlama rows");
assert.match(fixturePanelMarkup, /Fixture fallback/, "panel renders fixture fallback badge");
assert.match(
  fixturePanelMarkup,
  /Context data is for research only\. It is not a buy\/sell signal\./,
  "panel renders compliance note",
);

const apiFailureMarkup = renderToStaticMarkup(React.createElement(MarketContextPanel, {
  state: {
    status: "error",
    context: null,
    message: "Context API unavailable: test failure",
  },
}));

assert.match(apiFailureMarkup, /API unavailable/, "panel shows API failure state");
assert.match(apiFailureMarkup, /Context API unavailable: test failure/, "panel renders API failure detail");

const localMvpWorkflowMarkup = renderToStaticMarkup(React.createElement(LocalMvpWorkflowPanel, {
  scannerSourceText: "Scanner source: real-output",
  contextSourceText: "Context source: approved-sources-output",
  reviewStorageText: "Review storage: local API (file-backed JSON)",
  reviewStorageDetail: "tools/ui-mock/.local/review-session.json",
}));

assert.match(localMvpWorkflowMarkup, /Local MVP workflow/, "local MVP workflow panel renders title");
assert.match(localMvpWorkflowMarkup, /Scanner latest/, "local MVP workflow panel renders scanner step");
assert.match(localMvpWorkflowMarkup, /Market context/, "local MVP workflow panel renders market context step");
assert.match(localMvpWorkflowMarkup, /Candidate detail/, "local MVP workflow panel renders candidate detail step");
assert.match(localMvpWorkflowMarkup, /Local review/, "local MVP workflow panel renders local review step");
assert.match(localMvpWorkflowMarkup, /Review queue/, "local MVP workflow panel renders review queue step");
assert.match(localMvpWorkflowMarkup, /Analyst report/, "local MVP workflow panel renders analyst report step");
assert.match(localMvpWorkflowMarkup, /Local MVP health check/, "local MVP workflow panel renders health check step");
assert.match(
  localMvpWorkflowMarkup,
  /scripts\\win\\check-local-mvp\.cmd/,
  "local MVP workflow panel renders local health check command",
);
assert.match(
  localMvpWorkflowMarkup,
  /scripts\\win\\generate-analyst-report\.cmd/,
  "local MVP workflow panel renders analyst report command",
);
assert.match(
  localMvpWorkflowMarkup,
  /This is not a buy\/sell signal\./,
  "local MVP workflow panel renders compliance copy",
);

const workspaceNavItems = [
  { id: "overview",    label: "Overview",        icon: "OV", description: "Status and health" },
  { id: "control-center", label: "Control Center", icon: "CC", description: "Preview readiness" },
  { id: "trusted-preview", label: "Trusted Preview", icon: "TP", description: "Guided reviewer path" },
  { id: "feedback-notes", label: "Feedback Notes", icon: "FN", description: "Session notes worksheet" },
  { id: "webinar-teaser", label: "Webinar Teaser", icon: "WT", description: "Demo-safe screenshots" },
  { id: "scanner",     label: "Scanner Radar",   icon: "SR", description: "Read-only scanner output" },
  { id: "watchlist",   label: "Review Queue",    icon: "RQ", description: "Local analyst queue" },
  { id: "research",    label: "Research Review", icon: "RR", description: "Mock categorization" },
  { id: "risks",       label: "Risk Alerts",     icon: "RA", description: "Critical and manual checks" },
  { id: "methodology", label: "Methodology",     icon: "M",  description: "Scanner and review layers" },
] satisfies WorkspaceNavItem[];

const workspaceShellMarkup = renderToStaticMarkup(React.createElement(WorkspaceShell, {
  navItems: workspaceNavItems,
  activeSection: "overview",
  onSectionChange: () => undefined,
  dataSource: "fixture",
  dataSourceOptions: [
    { key: "fixture", label: "Fixture" },
    { key: "static-json", label: "Static JSON" },
    { key: "api", label: "API / latest" },
  ],
  onDataSourceChange: () => undefined,
  loading: false,
  sourceStatusText: "Scanner source: built-in fixture",
}, React.createElement(WorkspaceSection, {
  title: "Local MVP Overview",
  description: "Current local workflow status and health commands.",
}, React.createElement("div", null, "Overview body"))));

assert.match(workspaceShellMarkup, /Local MVP Overview/, "workspace shell renders overview section");
assert.match(workspaceShellMarkup, /Overview/, "workspace shell renders overview navigation");
assert.match(workspaceShellMarkup, /Control Center/, "workspace shell renders control center navigation");
assert.match(workspaceShellMarkup, /Trusted Preview/, "workspace shell renders trusted preview navigation");
assert.match(workspaceShellMarkup, /Feedback Notes/, "workspace shell renders feedback notes navigation");
assert.match(workspaceShellMarkup, /Webinar Teaser/, "workspace shell renders webinar teaser navigation");
assert.match(workspaceShellMarkup, /Scanner Radar/, "workspace shell renders scanner radar navigation");
assert.match(workspaceShellMarkup, /Review Queue/, "workspace shell renders review queue navigation");
assert.match(workspaceShellMarkup, /Research Review/, "workspace shell renders research review navigation");
assert.match(workspaceShellMarkup, /Risk Alerts/, "workspace shell renders risk alerts navigation");
assert.match(workspaceShellMarkup, /Methodology/, "workspace shell renders methodology navigation");
assert.match(
  workspaceShellMarkup,
  /This is not a buy\/sell signal\./,
  "workspace shell renders compliance footer",
);

const trustedPreviewMarkup = renderToStaticMarkup(React.createElement(WorkspaceShell, {
  navItems: workspaceNavItems,
  activeSection: "trusted-preview",
  onSectionChange: () => undefined,
  dataSource: "fixture",
  dataSourceOptions: [
    { key: "fixture", label: "Fixture" },
    { key: "static-json", label: "Static JSON" },
    { key: "api", label: "API / latest" },
  ],
  onDataSourceChange: () => undefined,
  loading: false,
  sourceStatusText: "Scanner source: built-in fixture",
  trustedPreviewMode: true,
}, React.createElement(WorkspaceSection, {
  title: "Trusted Preview",
  description: "Guided standalone preview path for a trusted external reviewer.",
}, React.createElement(TrustedPreview))));

assert.match(trustedPreviewMarkup, /Trusted Preview/, "trusted preview renders title and navigation");
assert.match(trustedPreviewMarkup, /Research-only/, "trusted preview renders research-only boundary");
assert.match(
  trustedPreviewMarkup,
  /WATCHLIST means manual review only/,
  "trusted preview renders WATCHLIST manual review boundary",
);
assert.match(trustedPreviewMarkup, /10-minute click path/, "trusted preview renders click path");
assert.match(trustedPreviewMarkup, /Open a candidate\/project/, "trusted preview renders project open step");
assert.match(trustedPreviewMarkup, /Check source freshness/, "trusted preview renders freshness step");
assert.match(trustedPreviewMarkup, /Review report preview/, "trusted preview renders report preview step");
assert.match(trustedPreviewMarkup, /Leave structured feedback/, "trusted preview renders feedback step");
assert.match(trustedPreviewMarkup, /What this tool is/, "trusted preview renders tool purpose section");
assert.match(trustedPreviewMarkup, /What this tool is not/, "trusted preview renders tool boundary section");
assert.match(trustedPreviewMarkup, /Feedback prompts/, "trusted preview renders feedback prompts section");

const forbiddenTrustedPreviewTerms = [
  /\bAI KINTEL\b/i,
  /Pawe(?:l|\u0142) Gr(?:a|\u0105)dziuk/i,
  /\bP0\b/i,
  /\bP1\b/i,
  /\bP2\b/i,
  /\bnot ready\b/i,
  /\bnot-ready\b/i,
  /\bGitHub\b/i,
  /\bCodex\b/i,
  /\bCMD\b/i,
  /\bbranch\b/i,
  /\bcommit\b/i,
  /\bscripts?\b/i,
  /\bendpoints?\b/i,
  /\bbuy\b/i,
  /\bsell\b/i,
  /\bentry\b/i,
  /\bsignal\b/i,
  /\brecommendation\b/i,
];

for (const pattern of forbiddenTrustedPreviewTerms) {
  assert.doesNotMatch(trustedPreviewMarkup, pattern, `trusted preview does not render forbidden term ${pattern}`);
}

const feedbackNotesMarkup = renderToStaticMarkup(React.createElement(WorkspaceShell, {
  navItems: workspaceNavItems,
  activeSection: "feedback-notes",
  onSectionChange: () => undefined,
  dataSource: "fixture",
  dataSourceOptions: [
    { key: "fixture", label: "Fixture" },
    { key: "static-json", label: "Static JSON" },
    { key: "api", label: "API / latest" },
  ],
  onDataSourceChange: () => undefined,
  loading: false,
  sourceStatusText: "Scanner source: built-in fixture",
  trustedPreviewMode: true,
}, React.createElement(WorkspaceSection, {
  title: "Feedback Notes",
  description: "Structured session notes for a trusted preview review.",
}, React.createElement(FeedbackNotes))));

assert.match(feedbackNotesMarkup, /Feedback Notes/, "feedback notes renders title and navigation");
assert.match(feedbackNotesMarkup, /Structured session notes/, "feedback notes renders structured session notes copy");
assert.match(feedbackNotesMarkup, /Research-only/, "feedback notes renders research-only boundary");
assert.match(feedbackNotesMarkup, /Session checklist/, "feedback notes renders session checklist");
assert.match(feedbackNotesMarkup, /Feedback prompts/, "feedback notes renders feedback prompts");
assert.match(feedbackNotesMarkup, /Triage buckets/, "feedback notes renders triage buckets");
assert.match(feedbackNotesMarkup, /Blocker/, "feedback notes renders blocker bucket");
assert.match(feedbackNotesMarkup, /Improvement/, "feedback notes renders improvement bucket");
assert.match(feedbackNotesMarkup, /Later idea/, "feedback notes renders later idea bucket");
assert.match(feedbackNotesMarkup, /Clarification needed/, "feedback notes renders clarification bucket");
assert.match(feedbackNotesMarkup, /Session notes template/, "feedback notes renders notes template");
assert.match(
  feedbackNotesMarkup,
  /This shell does not save feedback yet/,
  "feedback notes renders no-save boundary",
);
assert.match(
  feedbackNotesMarkup,
  /No data is sent from this view/,
  "feedback notes renders no-send boundary",
);

const forbiddenFeedbackNotesTerms = [
  /\bAI KINTEL\b/i,
  /Pawe(?:l|\u0142) Gr(?:a|\u0105)dziuk/i,
  /\bP0\b/i,
  /\bP1\b/i,
  /\bP2\b/i,
  /\bnot ready\b/i,
  /\bnot-ready\b/i,
  /\bGitHub\b/i,
  /\bCodex\b/i,
  /\bCMD\b/i,
  /\bbranch\b/i,
  /\bcommit\b/i,
  /\bscripts?\b/i,
  /\bendpoints?\b/i,
  /\bbuy\b/i,
  /\bsell\b/i,
  /\bentry\b/i,
  /\bsignal\b/i,
  /\brecommendation\b/i,
];

for (const pattern of forbiddenFeedbackNotesTerms) {
  assert.doesNotMatch(feedbackNotesMarkup, pattern, `feedback notes does not render forbidden term ${pattern}`);
}

const webinarTeaserMarkup = renderToStaticMarkup(React.createElement(WorkspaceShell, {
  navItems: workspaceNavItems,
  activeSection: "webinar-teaser",
  onSectionChange: () => undefined,
  dataSource: "fixture",
  dataSourceOptions: [
    { key: "fixture", label: "Fixture" },
    { key: "static-json", label: "Static JSON" },
    { key: "api", label: "API / latest" },
  ],
  onDataSourceChange: () => undefined,
  loading: false,
  sourceStatusText: "Scanner source: built-in fixture",
  presentationMode: true,
}, React.createElement(WorkspaceSection, {
  title: "Webinar Teaser",
  description: "Demo-safe screenshot mode for showing the product concept with controlled demo content.",
}, React.createElement(WebinarTeaser))));

assert.match(webinarTeaserMarkup, /Webinar Teaser/, "webinar teaser renders in navigation");
assert.match(webinarTeaserMarkup, /Screenshot Capture Kit/, "webinar teaser renders screenshot capture kit");
assert.match(
  webinarTeaserMarkup,
  /Capture 4-6 demo-safe screens for webinar use\./,
  "webinar teaser renders capture kit purpose",
);
assert.match(webinarTeaserMarkup, /1920x1080/, "webinar teaser renders large viewport guidance");
assert.match(webinarTeaserMarkup, /1440x900/, "webinar teaser renders compact viewport guidance");
assert.match(webinarTeaserMarkup, /Use browser screenshot\/crop tools\./, "webinar teaser renders capture tool guidance");
assert.match(webinarTeaserMarkup, /Crypto Research Radar/, "webinar teaser renders radar overview");
assert.match(webinarTeaserMarkup, /Research snapshot/, "webinar teaser renders project snapshot");
assert.match(webinarTeaserMarkup, /Source Confidence Layer/, "webinar teaser renders source confidence layer");
assert.match(webinarTeaserMarkup, /Analyst research brief/, "webinar teaser renders report preview");
assert.match(
  webinarTeaserMarkup,
  /WATCHLIST means manual review only/,
  "webinar teaser renders WATCHLIST manual review boundary",
);
assert.match(webinarTeaserMarkup, /Research-only preview/, "webinar teaser renders research-only preview copy");

for (const label of [
  "Radar Overview",
  "Project Research Snapshot",
  "Source Confidence Layer",
  "Analyst Research Brief",
  "Review Flow",
  "Research-only Closing Screen",
]) {
  assert.match(webinarTeaserMarkup, new RegExp(label), `webinar teaser renders capture label ${label}`);
}

for (const shotId of [
  "radar-overview",
  "project-research-snapshot",
  "source-confidence-layer",
  "research-report-preview",
  "review-flow",
  "closing-screen",
]) {
  assert.match(webinarTeaserMarkup, new RegExp(`data-shot="${shotId}"`), `webinar teaser renders data-shot ${shotId}`);
}

const forbiddenWebinarTerms = [
  /\bAI KINTEL\b/i,
  /Pawe[lł] Gr[aą]dziuk/i,
  /\bP0\b/i,
  /\bP1\b/i,
  /\bP2\b/i,
  /\bnot ready\b/i,
  /\bnot-ready\b/i,
  /\bweights?\b/i,
  /\bthresholds?\b/i,
  /\bvendors?\b/i,
  /\bendpoints?\b/i,
  /\brepository\b/i,
  /\bbranch\b/i,
  /\bcommit\b/i,
  /\bscript\b/i,
  /\bCMD\b/i,
  /\bGitHub\b/i,
  /\bCodex\b/i,
  /\bbuy\b/i,
  /\bsell\b/i,
  /\bentry\b/i,
  /\bsignal\b/i,
  /\brecommendation\b/i,
];

for (const pattern of forbiddenWebinarTerms) {
  assert.doesNotMatch(webinarTeaserMarkup, pattern, `webinar teaser does not render forbidden term ${pattern}`);
}

const controlCenterMarkup = renderToStaticMarkup(React.createElement(ControlCenter, {
  candidateCount: uiCandidates.length,
  resolvedScannerSource: "fixture-fallback",
  scannerSourceText: "Scanner source: fixture-fallback",
  scannerFallbackReason: "no valid real scanner output found",
  scannerGeneratedAt: realFixture.scan_run.finished_at,
  scannerMode: realFixture.scan_run.mode,
  contextSourceText: "Context source: fixture-fallback",
  contextSourceDetail: "Context API returned the local fixture fallback.",
  marketContextState: {
    status: "ready",
    context: parsedContextFixture,
    message: interpretedContextFixture.fallbackReason,
  },
  reviewStorageStatus: {
    tone: "fallback",
    text: "Review storage: browser fallback",
    detail: "Local API unavailable in test render.",
  },
}));

assert.match(controlCenterMarkup, /Control Center/, "control center renders title");
assert.match(
  controlCenterMarkup,
  /Research-only\. WATCHLIST means manual review only\./,
  "control center renders research-only WATCHLIST boundary",
);
assert.match(controlCenterMarkup, /Trusted Tester Readiness/, "control center renders readiness section");
assert.match(controlCenterMarkup, /Private access \/ simple launch/, "control center renders private access P0");
assert.match(controlCenterMarkup, /No-CMD tester path/, "control center renders no-CMD tester P0");
assert.match(controlCenterMarkup, /Candidate list\/detail/, "control center renders candidate list/detail P0");
assert.match(controlCenterMarkup, /Data freshness visible/, "control center renders data freshness P0");
assert.match(controlCenterMarkup, /Source status visible/, "control center renders source status P0");
assert.match(controlCenterMarkup, /Review semantics clear/, "control center renders review semantics P0");
assert.match(controlCenterMarkup, /Report preview accessible/, "control center renders report preview P0");
assert.match(controlCenterMarkup, /Feedback path/, "control center renders feedback path P0");
assert.match(controlCenterMarkup, /No paid source activation/, "control center renders paid source P0");
assert.match(controlCenterMarkup, /Not ready/, "control center does not claim tester preview is ready");
assert.match(controlCenterMarkup, /Data &amp; Source Freshness/, "control center renders data freshness status");
assert.match(controlCenterMarkup, /fixture-fallback/, "control center renders fixture fallback state");
assert.match(controlCenterMarkup, /Review &amp; Reports/, "control center renders review and reports section");
assert.match(controlCenterMarkup, /Review is separate from scanner label/, "control center renders review separation");
assert.match(controlCenterMarkup, /Safety &amp; Compliance/, "control center renders safety section");
assert.match(controlCenterMarkup, /No investment advice\./, "control center renders investment advice boundary");
assert.match(controlCenterMarkup, /Missing data = manual verification required\./, "control center renders missing data boundary");
assert.match(controlCenterMarkup, /12B\.2 - Control Center actions \/ operator workflow/, "control center renders next 12B.2 step");
assert.match(
  controlCenterMarkup,
  /AI KINTEL remains a later integration stage, not the next standalone implementation target\./,
  "control center keeps AI KINTEL out of nearest implementation target",
);

const forbiddenActionPattern = /<(button|a)\b[^>]*>[\s\S]*?\b(?:buy|sell|entry|signal|recommendation)\b[\s\S]*?<\/\1>/i;
assert.doesNotMatch(
  controlCenterMarkup,
  forbiddenActionPattern,
  "control center does not render forbidden trading words as actions",
);

const workspaceOverviewMarkup = renderToStaticMarkup(React.createElement(WorkspaceOverview, {
  statCards: React.createElement(StatCards, {
    summary: {
      total_candidates: uiCandidates.length,
      watchlist: uiCandidates.filter((candidate) => candidate.finalLabel === "WATCHLIST").length,
      critical_risk: uiCandidates.filter((candidate) => candidate.finalLabel === "CRITICAL_RISK").length,
      needs_manual_verification: uiCandidates.filter((candidate) => candidate.finalLabel === "NEEDS_MANUAL_VERIFICATION").length,
      rejected: uiCandidates.filter((candidate) => candidate.finalLabel === "REJECT").length,
    },
  }),
  marketContext: React.createElement(MarketContextPanel, {
    state: {
      status: "ready",
      context: parsedContextFixture,
      message: interpretedContextFixture.fallbackReason,
    },
  }),
  workflowPanel: React.createElement(LocalMvpWorkflowPanel, {
    scannerSourceText: "Scanner source: real-output",
    contextSourceText: "Context source: approved-sources-output",
    reviewStorageText: "Review storage: local API (file-backed JSON)",
  }),
}));

assert.match(workspaceOverviewMarkup, /Local MVP workspace overview/, "overview renders workspace copy");
assert.match(
  workspaceOverviewMarkup,
  /Scanner label and local review status are separate/,
  "overview explains scanner and review layers are separate",
);
assert.match(
  workspaceOverviewMarkup,
  /scripts\\win\\check-local-mvp\.cmd/,
  "overview renders local MVP health command",
);
assert.match(
  workspaceOverviewMarkup,
  /scripts\\win\\generate-analyst-report\.cmd/,
  "overview renders analyst report command",
);

const passMockCandidate = toMockCandidate(passUi);
const lowlMockCandidate = toMockCandidate(lowlUi);
const fdvMockCandidate = toMockCandidate(fdvUi);
const reviewStorage = createMemoryStorage();
const savedReviewState = saveReviewRecord({
  candidate_id: passMockCandidate.id,
  status: "saved_for_follow_up",
  note: "Track community and liquidity follow-up.",
}, reviewStorage);
const savedReviewRecord = getCandidateReview(passMockCandidate.id, savedReviewState);

assert.ok(savedReviewRecord, "saved review record is available from review session state");
assert.equal(savedReviewRecord.status, "saved_for_follow_up", "review status is persisted");
assert.equal(savedReviewRecord.note, "Track community and liquidity follow-up.", "review note is persisted");
assert.ok(reviewStorage.getItem(REVIEW_SESSION_STORAGE_KEY), "review session is written to local storage key");

const reloadedReviewState = loadReviewSession(reviewStorage);
assert.equal(
  getCandidateReview(passMockCandidate.id, reloadedReviewState)?.status,
  "saved_for_follow_up",
  "review session reloads saved record",
);

const corruptReviewStorage = createMemoryStorage({
  [REVIEW_SESSION_STORAGE_KEY]: "{ invalid json",
});
assert.deepEqual(
  loadReviewSession(corruptReviewStorage),
  createEmptyReviewSession(),
  "corrupt review session JSON falls back safely",
);
assert.equal(passMockCandidate.final_label, "WATCHLIST", "saving review status does not change scanner label");

const reviewFileTempRoot = await mkdtemp(resolve(tmpdir(), "crypto-edge-review-file-"));
try {
  const storageFilePath = resolve(reviewFileTempRoot, "review-session.json");
  const fileBackedProvider = createFileReviewSessionStorageProvider({ storageFilePath });
  const missingProviderState = await fileBackedProvider.read();

  assert.deepEqual(
    missingProviderState.state,
    createEmptyReviewSession(),
    "file-backed provider returns empty state when the file does not exist",
  );

  const missingProviderDiagnostics = await fileBackedProvider.diagnostics();

  assert.equal(
    missingProviderDiagnostics.file_exists,
    false,
    "file-backed provider diagnostics reports missing file",
  );
  assert.equal(missingProviderDiagnostics.valid, true, "file-backed provider treats missing file as valid empty state");
  assert.equal(missingProviderDiagnostics.entries_count, 0, "file-backed provider diagnostics reports zero entries");

  const missingFileDiagnostics = await readReviewSessionDiagnostics({ storageFilePath });

  assert.equal(
    missingFileDiagnostics.file_exists,
    false,
    "review storage diagnostics reports missing file",
  );
  assert.equal(missingFileDiagnostics.valid, true, "missing review storage file is a valid empty state");
  assert.equal(missingFileDiagnostics.entries_count, 0, "missing review storage file reports zero entries");
  assert.equal(
    Object.prototype.hasOwnProperty.call(missingFileDiagnostics, "entries"),
    false,
    "review storage diagnostics does not expose review entries",
  );

  const missingFileState = await readReviewSessionFile({ storageFilePath });

  assert.deepEqual(
    missingFileState.state,
    createEmptyReviewSession(),
    "file-backed review storage returns empty state when the file does not exist",
  );
  assert.equal(
    missingFileState._source_meta.source_kind,
    "file-backed-review-session",
    "file-backed review storage includes source metadata",
  );

  await fileBackedProvider.write(savedReviewState);
  const providerReloadedState = await fileBackedProvider.read();

  assert.deepEqual(
    providerReloadedState.state,
    savedReviewState,
    "file-backed provider writes and reloads ReviewSessionState",
  );

  await writeReviewSessionFile(savedReviewState, { storageFilePath });
  const validFileDiagnostics = await readReviewSessionDiagnostics({ storageFilePath });
  const validProviderDiagnostics = await fileBackedProvider.diagnostics();

  assert.equal(validFileDiagnostics.file_exists, true, "review storage diagnostics reports existing file");
  assert.equal(validFileDiagnostics.valid, true, "review storage diagnostics reports valid review file");
  assert.equal(validFileDiagnostics.entries_count, 1, "review storage diagnostics counts entries");
  assert.equal(validProviderDiagnostics.file_exists, true, "file-backed provider diagnostics reports existing file");
  assert.equal(validProviderDiagnostics.valid, true, "file-backed provider diagnostics reports valid review file");
  assert.equal(validProviderDiagnostics.entries_count, 1, "file-backed provider diagnostics counts entries");
  assert.equal(
    typeof validFileDiagnostics.file_size_bytes,
    "number",
    "review storage diagnostics reports file size for existing file",
  );

  const reloadedFileState = await readReviewSessionFile({ storageFilePath });

  assert.deepEqual(
    reloadedFileState.state,
    savedReviewState,
    "file-backed review storage writes and reloads ReviewSessionState",
  );

  await writeFile(storageFilePath, "{ invalid json", "utf8");
  const corruptProviderDiagnostics = await fileBackedProvider.diagnostics();
  const corruptFileDiagnostics = await readReviewSessionDiagnostics({ storageFilePath });

  assert.equal(corruptProviderDiagnostics.file_exists, true, "corrupt file-backed provider diagnostics reports existing file");
  assert.equal(corruptProviderDiagnostics.valid, false, "corrupt file-backed provider diagnostics reports invalid file");
  assert.equal(corruptProviderDiagnostics.entries_count, 0, "corrupt file-backed provider diagnostics reports zero entries");
  assert.match(
    corruptProviderDiagnostics.warning ?? "",
    /could not be read or parsed|must be a JSON object/i,
    "corrupt file-backed provider diagnostics includes warning",
  );
  assert.equal(corruptFileDiagnostics.file_exists, true, "corrupt review storage diagnostics reports existing file");
  assert.equal(corruptFileDiagnostics.valid, false, "corrupt review storage diagnostics reports invalid file");
  assert.equal(corruptFileDiagnostics.entries_count, 0, "corrupt review storage diagnostics reports zero entries");
  assert.match(
    corruptFileDiagnostics.warning ?? "",
    /could not be read or parsed/i,
    "corrupt review storage diagnostics includes warning",
  );

  const corruptFileState = await readReviewSessionFile({ storageFilePath });

  assert.deepEqual(
    corruptFileState.state,
    createEmptyReviewSession(),
    "corrupt file-backed review storage returns an empty session",
  );
  assert.match(
    corruptFileState._source_meta.warning ?? "",
    /could not be read or parsed/i,
    "corrupt file-backed review storage includes a warning",
  );
} finally {
  await rm(reviewFileTempRoot, { recursive: true, force: true });
}

const reviewSqliteTempRoot = await mkdtemp(resolve(tmpdir(), "crypto-edge-review-sqlite-"));
try {
  const databaseFilePath = resolve(reviewSqliteTempRoot, "review-session.sqlite");
  const sqliteProvider = createSqliteReviewSessionStorageProvider({ databaseFilePath });
  const missingSqliteProviderState = await sqliteProvider.read();

  assert.deepEqual(
    missingSqliteProviderState.state,
    createEmptyReviewSession(),
    "SQLite provider returns empty state when the database file does not exist",
  );
  assert.equal(
    missingSqliteProviderState._source_meta.source_kind,
    "sqlite-review-session",
    "SQLite provider includes SQLite source metadata",
  );

  const missingSqliteProviderDiagnostics = await sqliteProvider.diagnostics();
  const missingSqliteDiagnostics = await readReviewSessionSqliteDiagnostics({ databaseFilePath });

  assert.equal(
    missingSqliteProviderDiagnostics.source_kind,
    "sqlite-review-session-diagnostics",
    "SQLite provider diagnostics includes SQLite diagnostic metadata",
  );
  assert.equal(missingSqliteProviderDiagnostics.file_exists, false, "SQLite diagnostics reports missing file");
  assert.equal(missingSqliteProviderDiagnostics.valid, true, "SQLite diagnostics treats missing file as valid empty state");
  assert.equal(missingSqliteProviderDiagnostics.entries_count, 0, "SQLite diagnostics reports zero entries for missing file");
  assert.equal(missingSqliteDiagnostics.file_exists, false, "direct SQLite diagnostics reports missing file");
  assert.equal(
    Object.prototype.hasOwnProperty.call(missingSqliteDiagnostics, "entries"),
    false,
    "direct SQLite diagnostics does not expose review entries",
  );

  await writeReviewSessionSqlite(savedReviewState, { databaseFilePath });
  const reloadedSqliteState = await readReviewSessionSqlite({ databaseFilePath });

  assert.deepEqual(
    reloadedSqliteState.state,
    savedReviewState,
    "SQLite review storage writes and reloads ReviewSessionState",
  );

  const validSqliteDiagnostics = await sqliteProvider.diagnostics();
  const serializedValidSqliteDiagnostics = JSON.stringify(validSqliteDiagnostics);

  assert.equal(validSqliteDiagnostics.file_exists, true, "SQLite diagnostics reports existing file");
  assert.equal(validSqliteDiagnostics.valid, true, "SQLite diagnostics reports valid database");
  assert.equal(validSqliteDiagnostics.entries_count, 1, "SQLite diagnostics counts entries");
  assert.equal(
    typeof validSqliteDiagnostics.file_size_bytes,
    "number",
    "SQLite diagnostics reports file size for existing database",
  );
  assert.equal(
    serializedValidSqliteDiagnostics.includes('"entries"'),
    false,
    "SQLite diagnostics does not expose entries",
  );
  assert.equal(
    serializedValidSqliteDiagnostics.includes("Track community and liquidity follow-up."),
    false,
    "SQLite diagnostics does not expose analyst notes",
  );

  await assert.rejects(
    () => sqliteProvider.write({
      version: 2,
      entries: {},
    }),
    /Expected version 1/,
    "SQLite provider rejects invalid state",
  );
  assert.deepEqual(
    (await sqliteProvider.read()).state,
    savedReviewState,
    "SQLite provider does not overwrite previous state after invalid write",
  );

  await writeFile(databaseFilePath, "not a sqlite database", "utf8");
  const corruptSqliteDiagnostics = await sqliteProvider.diagnostics();
  const corruptSqliteState = await sqliteProvider.read();

  assert.equal(corruptSqliteDiagnostics.file_exists, true, "corrupt SQLite diagnostics reports existing file");
  assert.equal(corruptSqliteDiagnostics.valid, false, "corrupt SQLite diagnostics reports invalid database");
  assert.equal(corruptSqliteDiagnostics.entries_count, 0, "corrupt SQLite diagnostics reports zero entries");
  assert.match(
    corruptSqliteDiagnostics.warning ?? "",
    /SQLite storage could not be read or parsed/i,
    "corrupt SQLite diagnostics includes warning",
  );
  assert.deepEqual(
    corruptSqliteState.state,
    createEmptyReviewSession(),
    "corrupt SQLite storage returns an empty session instead of crashing",
  );
  assert.match(
    corruptSqliteState._source_meta.warning ?? "",
    /SQLite storage could not be read or parsed/i,
    "corrupt SQLite storage read includes a warning",
  );
} finally {
  await rm(reviewSqliteTempRoot, { recursive: true, force: true });
}

const originalReviewApiFetch = globalThis.fetch;
globalThis.fetch = (async (input) => {
  const url = String(input);
  const body = url.endsWith("/api/review-session/diagnostics")
    ? {
      source_kind: "sqlite-review-session-diagnostics",
      storage_file: "memory://sqlite-review-session",
      checked_at: "2026-06-26T00:00:00.000Z",
      file_exists: true,
      file_size_bytes: 4096,
      entries_count: 1,
      valid: true,
    }
    : {
      ...savedReviewState,
      _source_meta: {
        source_kind: "sqlite-review-session",
        storage_file: "memory://sqlite-review-session",
        loaded_at: "2026-06-26T00:00:00.000Z",
      },
    };

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json",
    },
  });
}) as typeof fetch;

try {
  const sqliteReviewApi = await loadReviewSessionFromApi();

  assert.equal(sqliteReviewApi.status, "ready", "review API client accepts SQLite review source metadata");
  if (sqliteReviewApi.status !== "ready") {
    throw new Error(sqliteReviewApi.error);
  }
  assert.equal(sqliteReviewApi.sourceMeta?.source_kind, "sqlite-review-session", "SQLite source kind is preserved");

  const sqliteReviewDiagnosticsApi = await loadReviewSessionDiagnosticsFromApi();

  assert.equal(sqliteReviewDiagnosticsApi.status, "ready", "review diagnostics client accepts SQLite diagnostics");
  if (sqliteReviewDiagnosticsApi.status !== "ready") {
    throw new Error(sqliteReviewDiagnosticsApi.error);
  }
  assert.equal(
    sqliteReviewDiagnosticsApi.diagnostics.source_kind,
    "sqlite-review-session-diagnostics",
    "SQLite diagnostics source kind is preserved",
  );
} finally {
  globalThis.fetch = originalReviewApiFetch;
}

const originalReviewFetch = globalThis.fetch;
let reviewFetchCalled = false;
globalThis.fetch = (async () => {
  reviewFetchCalled = true;
  throw new TypeError("review API unavailable in test");
}) as typeof fetch;

try {
  const unavailableReviewApi = await loadReviewSessionFromApi();
  assert.equal(unavailableReviewApi.status, "unavailable", "review API client reports unavailable without crashing");
  const unavailableReviewDiagnosticsApi = await loadReviewSessionDiagnosticsFromApi();
  assert.equal(
    unavailableReviewDiagnosticsApi.status,
    "unavailable",
    "review diagnostics API client reports unavailable without crashing",
  );
  assert.equal(reviewFetchCalled, true, "review API client attempts the local API request");
} finally {
  globalThis.fetch = originalReviewFetch;
}

const exportedReviewJson = createReviewSessionExport(savedReviewState);
const exportedReviewState = JSON.parse(exportedReviewJson) as ReviewSessionState;
assert.equal(exportedReviewState.version, 1, "review export includes version");
assert.equal(
  exportedReviewState.entries[passMockCandidate.id].status,
  "saved_for_follow_up",
  "review export includes stored entries",
);

const parsedReviewImport = parseReviewSessionImport(exportedReviewJson);
assert.equal(parsedReviewImport.ok, true, "valid review backup JSON parses");
if (!parsedReviewImport.ok) {
  throw new Error(parsedReviewImport.error);
}
assert.equal(parsedReviewImport.entries_count, 1, "valid review backup reports entries count");
assert.equal(
  parsedReviewImport.state.entries[passMockCandidate.id].note,
  "Track community and liquidity follow-up.",
  "valid review backup preserves analyst note",
);

const corruptReviewImport = parseReviewSessionImport("{ invalid json");
assert.equal(corruptReviewImport.ok, false, "corrupt review backup JSON returns an error");
if (corruptReviewImport.ok) {
  throw new Error("corrupt review backup unexpectedly parsed");
}
assert.match(corruptReviewImport.error, /invalid/i, "corrupt review backup error is readable");

const unknownVersionImport = parseReviewSessionImport(JSON.stringify({ version: 2, entries: {} }));
assert.equal(unknownVersionImport.ok, false, "unknown review backup version returns an error");
if (unknownVersionImport.ok) {
  throw new Error("unknown review backup version unexpectedly parsed");
}
assert.match(unknownVersionImport.error, /version 1/i, "unknown version error explains expected version");

const invalidEntryImport = parseReviewSessionImport(JSON.stringify({
  version: 1,
  entries: {
    [passMockCandidate.id]: {
      candidate_id: passMockCandidate.id,
      status: "unknown_status",
      note: "Bad status should fail validation.",
      updated_at: "2026-06-24T12:00:00.000Z",
    },
  },
}));
assert.equal(invalidEntryImport.ok, false, "review backup validates entry status values");

const currentMergeState = {
  version: 1 as const,
  entries: {
    [passMockCandidate.id]: savedReviewRecord,
    [lowlMockCandidate.id]: {
      candidate_id: lowlMockCandidate.id,
      status: "needs_more_research",
      note: "Keep local-only note.",
      updated_at: "2026-06-24T12:15:00.000Z",
    },
  },
} satisfies ReviewSessionState;

const importedMergeState = {
  version: 1 as const,
  entries: {
    [passMockCandidate.id]: {
      candidate_id: passMockCandidate.id,
      status: "waiting_for_more_data",
      note: "Imported conflict wins.",
      updated_at: "2026-06-25T12:00:00.000Z",
    },
    [fdvMockCandidate.id]: {
      candidate_id: fdvMockCandidate.id,
      status: "saved_for_follow_up",
      note: "Imported new entry.",
      updated_at: "2026-06-25T12:05:00.000Z",
    },
  },
} satisfies ReviewSessionState;

const mergedReviewState = mergeReviewSessionState(currentMergeState, importedMergeState, "merge");
assert.equal(
  mergedReviewState.entries[lowlMockCandidate.id].note,
  "Keep local-only note.",
  "review import merge keeps existing non-conflicting entries",
);
assert.equal(
  mergedReviewState.entries[passMockCandidate.id].note,
  "Imported conflict wins.",
  "review import merge overwrites conflicts by candidate_id",
);
assert.equal(
  mergedReviewState.entries[fdvMockCandidate.id].note,
  "Imported new entry.",
  "review import merge adds imported entries",
);

const mergeImportStorage = createMemoryStorage({
  [REVIEW_SESSION_STORAGE_KEY]: JSON.stringify(currentMergeState),
});
const persistedMergeState = importReviewSession(importedMergeState, "merge", mergeImportStorage);
assert.equal(
  persistedMergeState.entries[passMockCandidate.id].note,
  "Imported conflict wins.",
  "review import helper persists merged state",
);
assert.equal(
  loadReviewSession(mergeImportStorage).entries[fdvMockCandidate.id].note,
  "Imported new entry.",
  "review import helper writes merged state to local storage",
);

const replaceImportStorage = createMemoryStorage({
  [REVIEW_SESSION_STORAGE_KEY]: JSON.stringify(currentMergeState),
});
const replacedReviewState = importReviewSession(importedMergeState, "replace", replaceImportStorage);
assert.deepEqual(
  Object.keys(replacedReviewState.entries).sort(),
  [fdvMockCandidate.id, passMockCandidate.id].sort(),
  "review import replace substitutes the current state",
);
assert.equal(
  loadReviewSession(replaceImportStorage).entries[lowlMockCandidate.id],
  undefined,
  "review import replace removes previous local entries",
);
assert.equal(passMockCandidate.final_label, "WATCHLIST", "review export/import does not change scanner final_label");
assert.equal(passUi.scorecard?.decisionLabel, "WATCHLIST", "review export/import does not change WATCHLIST meaning");

const resetReviewStorage = createMemoryStorage({
  [REVIEW_SESSION_STORAGE_KEY]: JSON.stringify(savedReviewState),
});
const passScorecardBeforeReset = JSON.stringify(passUi.scorecard);
const resetReviewState = saveReviewSessionState(createEmptyReviewSession(), resetReviewStorage);

assert.deepEqual(
  resetReviewState,
  createEmptyReviewSession(),
  "reset local reviews uses an empty ReviewSessionState",
);
assert.equal(
  resetReviewStorage.getItem(REVIEW_SESSION_STORAGE_KEY),
  null,
  "reset local reviews clears only the local review storage key",
);
assert.equal(passMockCandidate.final_label, "WATCHLIST", "reset local reviews does not change final_label");
assert.equal(passUi.scorecard?.decisionLabel, "WATCHLIST", "reset local reviews does not change scoring decision label");
assert.equal(JSON.stringify(passUi.scorecard), passScorecardBeforeReset, "reset local reviews does not mutate score fields");

const detailWithContextMarkup = renderToStaticMarkup(React.createElement(CandidateDetail, {
  candidate: passMockCandidate,
  marketContextState: {
    status: "ready",
    context: parsedContextFixture,
    message: interpretedContextFixture.fallbackReason,
  },
}));

assert.match(detailWithContextMarkup, /Data Coverage.*Context/, "candidate detail renders research context section");
assert.match(detailWithContextMarkup, /42 - Fear/, "candidate detail renders Fear & Greed context");
assert.match(detailWithContextMarkup, /Paid market\/onchain data/, "candidate detail shows paid market source category as deferred");
assert.match(detailWithContextMarkup, /Clarification pending; no new source connected/, "candidate detail shows dedicated security source category as deferred");
assert.match(detailWithContextMarkup, /Token unlocks \/ vesting/, "candidate detail shows unlock source category as deferred");
assert.match(detailWithContextMarkup, /This is not a buy\/sell signal\./, "candidate detail renders compliance note");
assert.match(detailWithContextMarkup, /Context does not alter scanner label\./, "candidate detail explains context does not alter label");
assert.match(detailWithContextMarkup, /Fixture context/, "candidate detail represents fixture context fallback");
assert.match(detailWithContextMarkup, /Local Review Session/, "candidate detail renders local review session");
assert.match(detailWithContextMarkup, /This does not change scanner label\./, "candidate detail explains review does not change label");
assert.match(
  detailWithContextMarkup,
  /final_label.*comes from scanner latest output/,
  "candidate detail explains scanner final_label source",
);
assert.match(
  detailWithContextMarkup,
  /Saving a review status records a local analyst note only/,
  "candidate detail explains local review status scope",
);
assert.match(
  detailWithContextMarkup,
  /WATCHLIST means eligible for further manual review only/,
  "candidate detail explains WATCHLIST as manual follow-up only",
);
assert.match(
  detailWithContextMarkup,
  /Missing security or context data means manual verification is required, not a positive assessment/,
  "candidate detail explains missing data is not a positive assessment",
);
assert.match(detailWithContextMarkup, /Scanner Label vs Local Review/, "candidate detail renders scanner-vs-review section");
assert.match(detailWithContextMarkup, /Quick Snapshot/, "candidate detail renders quick snapshot section");
assert.match(detailWithContextMarkup, /Security.*Manual Verification/, "candidate detail renders security manual verification section");
assert.match(detailWithContextMarkup, /Reasoning Checklist/, "candidate detail renders reasoning checklist section");
assert.match(
  detailWithContextMarkup,
  /Missing security or context data requires manual verification/,
  "candidate detail renders manual verification guidance",
);
assert.match(detailWithContextMarkup, /Further review only/, "candidate detail keeps candidate final label visible");
assert.equal(passMockCandidate.final_label, "WATCHLIST", "context rendering does not change candidate final label");

const detailWithReviewMarkup = renderToStaticMarkup(React.createElement(CandidateDetail, {
  candidate: passMockCandidate,
  reviewRecord: savedReviewRecord,
  onSaveReview: () => undefined,
  onClearReview: () => undefined,
}));

assert.match(detailWithReviewMarkup, /Local Review Session/, "candidate detail renders review controls");
assert.match(detailWithReviewMarkup, /Saved for follow-up/, "candidate detail shows saved review status");
assert.match(detailWithReviewMarkup, /Track community and liquidity follow-up\./, "candidate detail shows saved analyst note");
assert.match(detailWithReviewMarkup, /This does not change scanner label\./, "candidate detail includes scanner-label compliance copy");
assert.match(detailWithReviewMarkup, /Further review only/, "review rendering keeps scanner final label visible");
assert.equal(passMockCandidate.final_label, "WATCHLIST", "saved review status does not mutate final_label");

const radarWithReviewMarkup = renderToStaticMarkup(React.createElement(ScannerRadar, {
  candidates: [passMockCandidate],
  reviewSession: savedReviewState,
  onSaveReview: () => undefined,
  onClearReview: () => undefined,
}));

assert.match(radarWithReviewMarkup, /Scanner Radar/, "scanner radar renders workspace title");
assert.match(radarWithReviewMarkup, /scanner-candidate-card/, "scanner radar renders candidate cards");
assert.match(radarWithReviewMarkup, /Selected/, "scanner radar renders selected candidate state");
assert.match(radarWithReviewMarkup, /View details/, "scanner radar renders neutral detail action copy");
assert.match(radarWithReviewMarkup, /Scanner output is read-only/, "scanner radar renders read-only guidance");
assert.match(
  radarWithReviewMarkup,
  /WATCHLIST means eligible for further manual review only/,
  "scanner radar explains WATCHLIST scope",
);
assert.match(radarWithReviewMarkup, /Local Review Session/, "scanner radar renders selected candidate detail");
assert.match(radarWithReviewMarkup, /Quick Snapshot/, "scanner radar renders selected candidate detail sections");
assert.match(radarWithReviewMarkup, /This is not a buy\/sell signal\./, "scanner radar renders compliance copy");
assert.match(radarWithReviewMarkup, /Follow-up/, "scanner radar renders local review badge");
assert.equal(passMockCandidate.final_label, "WATCHLIST", "scanner radar review status does not mutate final_label");

const reviewQueueState = {
  version: 1 as const,
  entries: {
    [passMockCandidate.id]: savedReviewRecord,
    [lowlMockCandidate.id]: {
      candidate_id: lowlMockCandidate.id,
      status: "needs_more_research",
      note: "Check why liquidity failed before any follow-up.",
      updated_at: "2026-06-24T12:15:00.000Z",
    },
    [fdvMockCandidate.id]: {
      candidate_id: fdvMockCandidate.id,
      status: "waiting_for_more_data",
      note: "Wait for updated security coverage.",
      updated_at: "2026-06-24T12:20:00.000Z",
    },
    "stored-review-not-in-scan": {
      candidate_id: "stored-review-not-in-scan",
      status: "dismissed_after_review",
      note: "Removed from this local review pass.",
      updated_at: "2026-06-24T12:25:00.000Z",
    },
  },
} satisfies ReviewSessionState;

const readyReviewStorageStatus = {
  tone: "ready" as const,
  text: "Review storage: local API",
};

const reviewQueueMarkup = renderToStaticMarkup(React.createElement(WatchlistTab, {
  candidates: [passMockCandidate, lowlMockCandidate, fdvMockCandidate],
  reviewSession: reviewQueueState,
  reviewStorageStatus: readyReviewStorageStatus,
  onClearReview: () => undefined,
  onOpenCandidate: () => undefined,
  onImportReviewSession: () => undefined,
  onResetReviewSession: async () => ({ status: "ready" as const, message: "Reset completed in test." }),
}));

assert.match(reviewQueueMarkup, /Review Queue Workspace/, "watchlist tab renders review queue workspace");
assert.match(reviewQueueMarkup, /Local Review Queue/, "review queue renders local review queue section");
assert.match(reviewQueueMarkup, /Scanner Watchlist/, "review queue renders scanner watchlist section");
assert.match(reviewQueueMarkup, /Stored Reviews Not In Current Scan/, "review queue renders stored reviews section");
assert.match(reviewQueueMarkup, /Storage &amp; Backup/, "review queue renders storage and backup section");
assert.match(reviewQueueMarkup, /Analyst Report Workspace/, "review queue renders analyst report workspace");
assert.match(
  reviewQueueMarkup,
  /scripts\\win\\generate-analyst-report\.cmd/,
  "review queue renders analyst report command",
);
assert.match(
  reviewQueueMarkup,
  /scripts\\win\\check-analyst-report\.cmd/,
  "review queue renders analyst report smoke command",
);
assert.match(
  reviewQueueMarkup,
  /tools\\ui-mock\\\.local\\reports/,
  "review queue renders analyst report output path",
);
assert.match(
  reviewQueueMarkup,
  /This is not a buy\/sell signal/,
  "review queue renders compliance copy",
);
assert.match(reviewQueueMarkup, /Review Backup/, "review queue renders backup controls");
assert.match(reviewQueueMarkup, /Export review JSON/, "review queue renders export action");
assert.match(reviewQueueMarkup, /Import review JSON/, "review queue renders import file control");
assert.match(reviewQueueMarkup, /Merge with current/, "review queue renders merge import mode");
assert.match(reviewQueueMarkup, /Replace current/, "review queue renders replace import mode");
assert.match(reviewQueueMarkup, /Storage diagnostics/, "review queue renders storage diagnostics");
assert.match(reviewQueueMarkup, /Refresh diagnostics/, "review queue renders refresh diagnostics action");
assert.match(reviewQueueMarkup, /API diagnostics/, "review queue renders API diagnostics availability");
assert.match(reviewQueueMarkup, /Storage file path/, "review queue renders storage file path field");
assert.match(reviewQueueMarkup, /Reset local reviews/, "review queue renders reset local reviews");
assert.match(reviewQueueMarkup, /Type RESET to confirm/, "review queue requires RESET confirmation");
assert.match(
  reviewQueueMarkup,
  /Reset clears only local review status and analyst notes\./,
  "review queue explains reset scope",
);
assert.match(
  reviewQueueMarkup,
  /It does not delete scanner output or market data\./,
  "review queue explains reset preserves scanner output and market data",
);
assert.match(
  reviewQueueMarkup,
  /Backup includes only local review status and analyst notes\./,
  "review queue explains backup scope",
);
assert.match(
  reviewQueueMarkup,
  /It does not include scanner output or market data\./,
  "review queue explains scanner and market data are excluded",
);
assert.match(reviewQueueMarkup, /Saved for follow-up/, "review queue renders local saved follow-up status");
assert.match(reviewQueueMarkup, /Track community and liquidity follow-up\./, "review queue renders analyst note preview");
assert.match(reviewQueueMarkup, /final_label: WATCHLIST/, "review queue labels scanner final_label separately");
assert.match(reviewQueueMarkup, /Review status/, "review queue labels local review status separately");
assert.match(reviewQueueMarkup, /Further review only/, "review queue keeps scanner label visible");
assert.match(reviewQueueMarkup, /Needs more research/, "review queue renders needs research status");
assert.match(reviewQueueMarkup, /Waiting for more data/, "review queue renders waiting data status");
assert.match(reviewQueueMarkup, /Dismissed after review/, "review queue renders dismissed status");
assert.match(reviewQueueMarkup, /Stored reviews not in current scan/, "review queue summary renders missing-current-scan count");
assert.match(reviewQueueMarkup, /stored-review-not-in-scan/, "review queue shows stored review candidate_id");
assert.match(
  reviewQueueMarkup,
  /This review belongs to a candidate not present in the current scanner output\./,
  "review queue explains stored reviews outside current scan",
);
assert.match(
  reviewQueueMarkup,
  /Review storage uses the local API when available, with browser localStorage fallback\./,
  "review queue explains local API storage with browser fallback",
);
assert.match(reviewQueueMarkup, /Review storage: local API/, "review queue renders storage status");
assert.match(
  reviewQueueMarkup,
  /Review status does not change scanner labels, scoring, final_label or WATCHLIST meaning\./,
  "review queue includes scanner-label compliance copy",
);
assert.equal(passMockCandidate.final_label, "WATCHLIST", "review queue rendering does not mutate final_label");

const emptyReviewQueueMarkup = renderToStaticMarkup(React.createElement(WatchlistTab, {
  candidates: [passMockCandidate],
  reviewSession: createEmptyReviewSession(),
  reviewStorageStatus: readyReviewStorageStatus,
  onClearReview: () => undefined,
  onOpenCandidate: () => undefined,
  onImportReviewSession: () => undefined,
  onResetReviewSession: async () => ({ status: "ready" as const, message: "Reset completed in test." }),
}));

assert.match(emptyReviewQueueMarkup, /No local review items yet\./, "review queue renders empty state");
assert.match(
  emptyReviewQueueMarkup,
  /Mark a candidate as Saved for follow-up or Needs more research from the scanner detail panel\./,
  "review queue empty state points back to scanner detail",
);

const detailFailureMarkup = renderToStaticMarkup(React.createElement(CandidateDetail, {
  candidate: passMockCandidate,
  marketContextState: {
    status: "error",
    context: null,
    message: "Context API unavailable: test failure",
  },
}));

assert.match(detailFailureMarkup, /Context unavailable/, "candidate detail handles context API failure");
assert.match(detailFailureMarkup, /Further review only/, "candidate detail still renders label when context is unavailable");

const reviewApiTempRoot = await mkdtemp(resolve(tmpdir(), "crypto-edge-review-api-"));
try {
  const storageFilePath = resolve(reviewApiTempRoot, "review-session.json");
  const server = createScannerApiServer({
    reviewSession: {
      storageFilePath,
    },
  });
  await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));

  try {
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const initialResponse = await getJson(`${baseUrl}/api/review-session`) as ReviewSessionState & {
      _source_meta: { source_kind: string; storage_file: string };
    };

    assert.deepEqual(
      { version: initialResponse.version, entries: initialResponse.entries },
      createEmptyReviewSession(),
      "GET /api/review-session returns empty state before storage exists",
    );
    assert.equal(
      initialResponse._source_meta.source_kind,
      "file-backed-review-session",
      "GET /api/review-session includes file-backed source metadata",
    );

    const initialDiagnosticsResponse = await getJson(`${baseUrl}/api/review-session/diagnostics`) as Record<string, unknown>;

    assert.equal(
      initialDiagnosticsResponse.source_kind,
      "file-backed-review-session-diagnostics",
      "GET /api/review-session/diagnostics returns diagnostic metadata",
    );
    assert.equal(
      initialDiagnosticsResponse.file_exists,
      false,
      "GET /api/review-session/diagnostics reports missing storage file",
    );
    assert.equal(
      initialDiagnosticsResponse.valid,
      true,
      "GET /api/review-session/diagnostics treats missing file as valid empty state",
    );
    assert.equal(
      JSON.stringify(initialDiagnosticsResponse).includes('"entries"'),
      false,
      "GET /api/review-session/diagnostics does not return review entries",
    );

    const putResponse = await requestJson(`${baseUrl}/api/review-session`, {
      method: "PUT",
      body: savedReviewState,
    });
    const putBody = putResponse.body as ReviewSessionState & {
      _source_meta: { source_kind: string; storage_file: string };
    };

    assert.equal(putResponse.statusCode, 200, "PUT /api/review-session accepts valid state");
    assert.deepEqual(
      { version: putBody.version, entries: putBody.entries },
      savedReviewState,
      "PUT /api/review-session returns saved state",
    );
    assert.equal(
      putBody._source_meta.source_kind,
      "file-backed-review-session",
      "PUT /api/review-session returns file-backed source metadata",
    );
    assert.deepEqual(
      (await readReviewSessionFile({ storageFilePath })).state,
      savedReviewState,
      "PUT /api/review-session writes file-backed storage",
    );

    const savedDiagnosticsResponse = await getJson(`${baseUrl}/api/review-session/diagnostics`) as Record<string, unknown>;

    assert.equal(
      savedDiagnosticsResponse.file_exists,
      true,
      "GET /api/review-session/diagnostics reports existing storage file",
    );
    assert.equal(savedDiagnosticsResponse.valid, true, "GET /api/review-session/diagnostics reports valid storage");
    assert.equal(savedDiagnosticsResponse.entries_count, 1, "GET /api/review-session/diagnostics reports entry count");
    assert.equal(
      JSON.stringify(savedDiagnosticsResponse).includes('"entries"'),
      false,
      "GET /api/review-session/diagnostics still omits entries after save",
    );

    const invalidPutResponse = await requestJson(`${baseUrl}/api/review-session`, {
      method: "PUT",
      body: {
        version: 2,
        entries: {},
      },
    });

    assert.equal(invalidPutResponse.statusCode, 400, "PUT /api/review-session rejects invalid state");
    assert.deepEqual(
      (await readReviewSessionFile({ storageFilePath })).state,
      savedReviewState,
      "invalid PUT /api/review-session does not overwrite storage",
    );
  } finally {
    await new Promise<void>((resolveClose, rejectClose) => {
      server.close((error) => {
        if (error) rejectClose(error);
        else resolveClose();
      });
    });
  }
} finally {
  await rm(reviewApiTempRoot, { recursive: true, force: true });
}

const reviewSqliteApiTempRoot = await mkdtemp(resolve(tmpdir(), "crypto-edge-review-sqlite-api-"));
try {
  const databaseFilePath = resolve(reviewSqliteApiTempRoot, "review-session.sqlite");
  const sqliteProvider = createSqliteReviewSessionStorageProvider({ databaseFilePath });
  const sqliteServer = createScannerApiServer({
    reviewSessionProvider: sqliteProvider,
  });
  await new Promise<void>((resolveListen) => sqliteServer.listen(0, "127.0.0.1", resolveListen));

  try {
    const address = sqliteServer.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const initialResponse = await getJson(`${baseUrl}/api/review-session`) as ReviewSessionState & {
      _source_meta: { source_kind: string; storage_file: string };
    };

    assert.deepEqual(
      { version: initialResponse.version, entries: initialResponse.entries },
      createEmptyReviewSession(),
      "GET /api/review-session returns empty state through SQLite provider",
    );
    assert.equal(
      initialResponse._source_meta.source_kind,
      "sqlite-review-session",
      "GET /api/review-session includes SQLite source metadata",
    );

    const initialDiagnosticsResponse = await getJson(`${baseUrl}/api/review-session/diagnostics`) as Record<string, unknown>;

    assert.equal(
      initialDiagnosticsResponse.source_kind,
      "sqlite-review-session-diagnostics",
      "GET /api/review-session/diagnostics returns SQLite diagnostics metadata",
    );
    assert.equal(
      initialDiagnosticsResponse.file_exists,
      false,
      "GET /api/review-session/diagnostics reports missing SQLite database",
    );

    const putResponse = await requestJson(`${baseUrl}/api/review-session`, {
      method: "PUT",
      body: savedReviewState,
    });
    const putBody = putResponse.body as ReviewSessionState & {
      _source_meta: { source_kind: string; storage_file: string };
    };

    assert.equal(putResponse.statusCode, 200, "PUT /api/review-session accepts valid state through SQLite provider");
    assert.deepEqual(
      { version: putBody.version, entries: putBody.entries },
      savedReviewState,
      "PUT /api/review-session returns SQLite-saved state",
    );
    assert.equal(
      putBody._source_meta.source_kind,
      "sqlite-review-session",
      "PUT /api/review-session returns SQLite source metadata",
    );
    assert.deepEqual(
      (await readReviewSessionSqlite({ databaseFilePath })).state,
      savedReviewState,
      "PUT /api/review-session writes SQLite storage",
    );

    const savedDiagnosticsResponse = await getJson(`${baseUrl}/api/review-session/diagnostics`) as Record<string, unknown>;

    assert.equal(savedDiagnosticsResponse.file_exists, true, "SQLite diagnostics endpoint reports existing database");
    assert.equal(savedDiagnosticsResponse.valid, true, "SQLite diagnostics endpoint reports valid database");
    assert.equal(savedDiagnosticsResponse.entries_count, 1, "SQLite diagnostics endpoint reports entry count");
    assert.equal(
      JSON.stringify(savedDiagnosticsResponse).includes('"entries"'),
      false,
      "SQLite diagnostics endpoint omits entries after save",
    );
    assert.equal(
      JSON.stringify(savedDiagnosticsResponse).includes("Track community and liquidity follow-up."),
      false,
      "SQLite diagnostics endpoint omits analyst notes after save",
    );

    const invalidPutResponse = await requestJson(`${baseUrl}/api/review-session`, {
      method: "PUT",
      body: {
        version: 2,
        entries: {},
      },
    });

    assert.equal(invalidPutResponse.statusCode, 400, "SQLite-backed PUT rejects invalid state");
    assert.deepEqual(
      (await readReviewSessionSqlite({ databaseFilePath })).state,
      savedReviewState,
      "invalid SQLite-backed PUT does not overwrite storage",
    );
  } finally {
    await new Promise<void>((resolveClose, rejectClose) => {
      sqliteServer.close((error) => {
        if (error) rejectClose(error);
        else resolveClose();
      });
    });
  }
} finally {
  await rm(reviewSqliteApiTempRoot, { recursive: true, force: true });
}

const reviewSqliteEnvApiTempRoot = await mkdtemp(resolve(tmpdir(), "crypto-edge-review-sqlite-env-api-"));
const originalReviewStorageProviderEnv = process.env.CRYPTO_EDGE_REVIEW_STORAGE_PROVIDER;
const originalReviewSqlitePathEnv = process.env.CRYPTO_EDGE_REVIEW_SQLITE_PATH;
try {
  const databaseFilePath = resolve(reviewSqliteEnvApiTempRoot, "review-session.sqlite");
  process.env.CRYPTO_EDGE_REVIEW_STORAGE_PROVIDER = "sqlite";
  process.env.CRYPTO_EDGE_REVIEW_SQLITE_PATH = databaseFilePath;

  const sqliteEnvServer = createScannerApiServer();
  await new Promise<void>((resolveListen) => sqliteEnvServer.listen(0, "127.0.0.1", resolveListen));

  try {
    const address = sqliteEnvServer.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const response = await getJson(`${baseUrl}/api/review-session`) as ReviewSessionState & {
      _source_meta: { source_kind: string; storage_file: string };
    };

    assert.equal(
      response._source_meta.source_kind,
      "sqlite-review-session",
      "createScannerApiServer uses SQLite provider when env selects it",
    );
    assert.equal(
      response._source_meta.storage_file,
      databaseFilePath,
      "SQLite env path is used as the storage file",
    );
  } finally {
    await new Promise<void>((resolveClose, rejectClose) => {
      sqliteEnvServer.close((error) => {
        if (error) rejectClose(error);
        else resolveClose();
      });
    });
  }
} finally {
  restoreOptionalEnv("CRYPTO_EDGE_REVIEW_STORAGE_PROVIDER", originalReviewStorageProviderEnv);
  restoreOptionalEnv("CRYPTO_EDGE_REVIEW_SQLITE_PATH", originalReviewSqlitePathEnv);
  await rm(reviewSqliteEnvApiTempRoot, { recursive: true, force: true });
}

let fakeProviderState = createEmptyReviewSession();
let fakeProviderWriteCount = 0;
const fakeReviewSessionProvider: ReviewSessionStorageProvider = {
  async read() {
    return createFakeProviderResult(fakeProviderState);
  },
  async write(nextState: unknown) {
    const validation = validateReviewSessionState(nextState, "Review session");

    if (!validation.ok) {
      throw new ReviewSessionFileStoreError("invalid_review_session", validation.error);
    }

    fakeProviderState = validation.state;
    fakeProviderWriteCount += 1;
    return createFakeProviderResult(fakeProviderState);
  },
  async diagnostics() {
    return {
      source_kind: "file-backed-review-session-diagnostics",
      storage_file: "memory://review-session",
      checked_at: "2026-06-26T00:00:00.000Z",
      file_exists: true,
      file_size_bytes: null,
      entries_count: Object.keys(fakeProviderState.entries).length,
      valid: true,
    };
  },
};
const providerServer = createScannerApiServer({
  reviewSessionProvider: fakeReviewSessionProvider,
});
await new Promise<void>((resolveListen) => providerServer.listen(0, "127.0.0.1", resolveListen));

try {
  const address = providerServer.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const providerInitialResponse = await getJson(`${baseUrl}/api/review-session`) as ReviewSessionState & {
    _source_meta: { source_kind: string; storage_file: string };
  };

  assert.deepEqual(
    { version: providerInitialResponse.version, entries: providerInitialResponse.entries },
    createEmptyReviewSession(),
    "GET /api/review-session reads through reviewSessionProvider",
  );
  assert.equal(
    providerInitialResponse._source_meta.storage_file,
    "memory://review-session",
    "GET /api/review-session can use a non-file-backed provider",
  );

  const providerPutResponse = await requestJson(`${baseUrl}/api/review-session`, {
    method: "PUT",
    body: savedReviewState,
  });
  const providerPutBody = providerPutResponse.body as ReviewSessionState & {
    _source_meta: { source_kind: string; storage_file: string };
  };

  assert.equal(providerPutResponse.statusCode, 200, "PUT /api/review-session writes through reviewSessionProvider");
  assert.deepEqual(
    { version: providerPutBody.version, entries: providerPutBody.entries },
    savedReviewState,
    "PUT /api/review-session returns provider-saved state",
  );
  assert.equal(fakeProviderWriteCount, 1, "PUT /api/review-session calls provider write once");
  assert.deepEqual(fakeProviderState, savedReviewState, "provider state is updated after valid PUT");

  const providerDiagnosticsResponse = await getJson(`${baseUrl}/api/review-session/diagnostics`) as Record<string, unknown>;

  assert.equal(
    providerDiagnosticsResponse.storage_file,
    "memory://review-session",
    "GET /api/review-session/diagnostics reads through reviewSessionProvider",
  );
  assert.equal(providerDiagnosticsResponse.entries_count, 1, "provider diagnostics returns current entry count");
  assert.equal(
    JSON.stringify(providerDiagnosticsResponse).includes('"entries"'),
    false,
    "provider diagnostics endpoint still omits review entries",
  );

  const invalidProviderPutResponse = await requestJson(`${baseUrl}/api/review-session`, {
    method: "PUT",
    body: {
      version: 2,
      entries: {},
    },
  });

  assert.equal(invalidProviderPutResponse.statusCode, 400, "provider-backed PUT rejects invalid state");
  assert.equal(fakeProviderWriteCount, 1, "invalid provider-backed PUT does not count as a write");
  assert.deepEqual(fakeProviderState, savedReviewState, "invalid provider-backed PUT does not overwrite provider state");
} finally {
  await new Promise<void>((resolveClose, rejectClose) => {
    providerServer.close((error) => {
      if (error) rejectClose(error);
      else resolveClose();
    });
  });
}

const contextTempRoot = await mkdtemp(resolve(tmpdir(), "crypto-edge-context-api-"));
try {
  const outputDir = resolve(contextTempRoot, "output");
  await mkdir(outputDir, { recursive: true });
  await writeContextRun(outputDir, makeContextOutput("approved_sources_20260624010101", 3));
  await writeContextRun(outputDir, makeContextOutput("approved_sources_20260624020202", 9));

  const latestContext = await readLatestContextOutput({ outputDirPath: outputDir, fixturePath: contextFixturePath });
  assert.equal(
    latestContext.run_id,
    "approved_sources_20260624020202",
    "context API reader selects the newest approved_sources_* directory",
  );
  assert.equal(latestContext._source_meta.source_kind, "approved-sources-output", "latest output metadata is included");
  assert.ok(latestContext._source_meta.output_file?.endsWith("approved_sources_output.json"));
  assert.equal(latestContext.summary.records_total, 3, "summary counts are preserved from approved source output");
  assert.deepEqual(
    latestContext.sources.map((source) => source.source_id),
    ["alternative_me_fng", "defillama_api"],
    "approved context source IDs are preserved",
  );

  const server = createScannerApiServer({
    context: {
      outputDirPath: outputDir,
      fixturePath: contextFixturePath,
    },
  });
  await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));

  try {
    const address = server.address() as AddressInfo;
    const response = await getJson(`http://127.0.0.1:${address.port}/api/context/latest`) as ContextLatestOutput;

    assert.equal(response.run_id, "approved_sources_20260624020202", "GET /api/context/latest returns latest approved output");
    assert.equal(response._source_meta.source_kind, "approved-sources-output", "GET /api/context/latest includes source metadata");
    assert.equal(response.summary.sources_requested, 2, "GET /api/context/latest preserves summary counts");
  } finally {
    await new Promise<void>((resolveClose, rejectClose) => {
      server.close((error) => {
        if (error) rejectClose(error);
        else resolveClose();
      });
    });
  }

  const emptyOutputDir = resolve(contextTempRoot, "empty-output");
  await mkdir(emptyOutputDir, { recursive: true });
  const fallbackContext = await readLatestContextOutput({ outputDirPath: emptyOutputDir, fixturePath: contextFixturePath });
  assert.equal(fallbackContext._source_meta.source_kind, "fixture-fallback", "context reader falls back when no output exists");
  assert.equal(fallbackContext._source_meta.output_file, null, "fixture fallback does not claim an output file");

  const invalidOutputDir = resolve(contextTempRoot, "invalid-output");
  await mkdir(resolve(invalidOutputDir, "approved_sources_20260624030303"), { recursive: true });
  await writeFile(
    resolve(invalidOutputDir, "approved_sources_20260624030303", "approved_sources_output.json"),
    "{ invalid json",
    "utf8",
  );
  const invalidFallbackContext = await readLatestContextOutput({ outputDirPath: invalidOutputDir, fixturePath: contextFixturePath });
  assert.equal(
    invalidFallbackContext._source_meta.source_kind,
    "fixture-fallback",
    "context reader handles invalid JSON with fixture fallback",
  );

  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = (async () => {
    fetchCalled = true;
    throw new Error("context reader must not call network");
  }) as typeof fetch;

  try {
    await readLatestContextOutput({ outputDirPath: outputDir, fixturePath: contextFixturePath });
    assert.equal(fetchCalled, false, "context reader does not call network");
  } finally {
    globalThis.fetch = originalFetch;
  }

  const rawLeakOutputDir = resolve(contextTempRoot, "raw-leak-output");
  const rawLeakOutput = makeContextOutput("approved_sources_20260624040404", 5);
  await writeContextRun(rawLeakOutputDir, {
    ...rawLeakOutput,
    metadata: { provider: "raw" },
    sources: rawLeakOutput.sources.map((source) => ({
      ...source,
      raw: { unsafe: true },
      provider_response: { unsafe: true },
      records: source.records.map((record) => ({
        ...record,
        description: "raw provider field",
        symbol: "RAW",
        chains: ["Ethereum"],
      })),
    })),
  });
  const sanitizedContext = await readLatestContextOutput({ outputDirPath: rawLeakOutputDir, fixturePath: contextFixturePath });
  const serializedContext = JSON.stringify(sanitizedContext);
  for (const forbiddenField of ["metadata", "description", "symbol", "chains", "raw", "provider_response"]) {
    assert.equal(
      serializedContext.includes(`"${forbiddenField}"`),
      false,
      `context output must not expose raw provider field ${forbiddenField}`,
    );
  }
} finally {
  await rm(contextTempRoot, { recursive: true, force: true });
}

console.log("contract tests passed");

async function writeContextRun(outputDir: string, output: Record<string, unknown>): Promise<void> {
  const runDir = resolve(outputDir, output.run_id as string);
  await mkdir(runDir, { recursive: true });
  await writeFile(resolve(runDir, "approved_sources_output.json"), `${JSON.stringify(output, null, 2)}\n`, "utf8");
}

function makeContextOutput(runId: string, fearGreedValue: number): Omit<ContextLatestOutput, "_source_meta"> {
  return {
    run_id: runId,
    generated_at: "2026-06-24T00:00:00.000Z",
    environment: "PUBLIC_BETA",
    sources: [
      {
        source_id: "alternative_me_fng",
        source_name: "Alternative.me Fear & Greed Index",
        mode: "live",
        fetched_at: "2026-06-24T00:00:01.000Z",
        policy: {
          environment: "PUBLIC_BETA",
          action: "live_fetch",
          allowed: true,
          reason: "Allowed in PUBLIC_BETA",
        },
        data_category: "sentiment",
        records: [
          {
            record_type: "fear_greed_index",
            value: fearGreedValue,
            value_classification: "Fear",
            timestamp: "2026-06-24T00:00:00.000Z",
            time_until_update: "12345",
          },
        ],
        warnings: [],
        errors: [],
      },
      {
        source_id: "defillama_api",
        source_name: "DefiLlama API",
        mode: "live",
        fetched_at: "2026-06-24T00:00:02.000Z",
        policy: {
          environment: "PUBLIC_BETA",
          action: "live_fetch",
          allowed: true,
          reason: "Allowed in PUBLIC_BETA",
        },
        data_category: "defi_context",
        records: [
          {
            record_type: "defi_protocol_snapshot",
            name: "Lido",
            chain: "Ethereum",
            tvl_usd: 35400000000,
            change_1d: 0.75,
            change_7d: -2.1,
            url: "https://lido.fi",
          },
          {
            record_type: "defi_protocol_snapshot",
            name: "Uniswap V3",
            chain: "Ethereum",
            tvl_usd: 4200000000,
            change_1d: 1.2,
            change_7d: 3.4,
            url: "https://app.uniswap.org",
          },
        ],
        warnings: [],
        errors: [],
      },
    ],
    summary: {
      sources_requested: 2,
      sources_allowed: 2,
      sources_denied: 0,
      records_total: 3,
      warnings_total: 0,
      errors_total: 0,
    },
  };
}

function getJson(url: string): Promise<unknown> {
  return new Promise((resolveRequest, rejectRequest) => {
    const request = get(url, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        if (response.statusCode !== 200) {
          rejectRequest(new Error(`GET ${url} failed with HTTP ${response.statusCode}: ${body}`));
          return;
        }

        try {
          resolveRequest(JSON.parse(body));
        } catch (error) {
          rejectRequest(error);
        }
      });
    });
    request.on("error", rejectRequest);
  });
}

function requestJson(
  url: string,
  options: { method: "PUT"; body: unknown },
): Promise<{ statusCode: number; body: unknown; rawBody: string }> {
  return new Promise((resolveRequest, rejectRequest) => {
    const httpRequest = request(url, {
      method: options.method,
      headers: {
        "content-type": "application/json",
      },
    }, (response) => {
      let rawBody = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        rawBody += chunk;
      });
      response.on("end", () => {
        try {
          resolveRequest({
            statusCode: response.statusCode ?? 0,
            body: JSON.parse(rawBody) as unknown,
            rawBody,
          });
        } catch (error) {
          rejectRequest(error);
        }
      });
    });

    httpRequest.on("error", rejectRequest);
    httpRequest.write(JSON.stringify(options.body));
    httpRequest.end();
  });
}

function createFakeProviderResult(state: ReviewSessionState) {
  return {
    state,
    _source_meta: {
      source_kind: "file-backed-review-session" as const,
      storage_file: "memory://review-session",
      loaded_at: "2026-06-26T00:00:00.000Z",
    },
  };
}

function restoreOptionalEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}

function createMemoryStorage(initial: Record<string, string> = {}): StorageLike {
  const values = new Map(Object.entries(initial));

  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
    removeItem(key: string) {
      values.delete(key);
    },
  };
}
