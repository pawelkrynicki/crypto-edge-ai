import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Feedback } from "../src/components/Feedback.js";
import { ProductLocaleProvider } from "../src/productI18n.js";
import type { FeedbackPublicStatus, OwnerFeedbackStatus } from "../src/services/feedbackDataSource.js";

const uiRoot = resolve(process.cwd());
const repoRoot = resolve(uiRoot, "..", "..");

describe("Persistent Feedback product UI", () => {
  it("renders semantically equivalent PL and EN forms with all categories and privacy copy", () => {
    const english = render("en");
    const polish = render("pl");
    for (const [markup, phrases] of [
      [english, ["Send feedback", "Blocker", "Improvement", "Question or clarification", "Idea for later", "Do not include personal data"]],
      [polish, ["Przekaż feedback", "Bloker", "Ulepszenie", "Pytanie lub niejasność", "Pomysł na później", "Nie podawaj danych osobowych"]],
    ] as const) {
      for (const phrase of phrases) assert.match(markup, new RegExp(phrase));
      assert.equal((markup.match(/type="radio"/g) ?? []).length, 4);
      assert.match(markup, /maxLength="120"/);
      assert.match(markup, /maxLength="3000"/);
      assert.match(markup, /Radar/);
    }
  });

  it("shows candidate context only when it is supplied by the product route", () => {
    const withCandidate = render("en", {
      subjectRef: { type: "candidate", id: "candidate-1" },
      subjectLabel: "EDGE · base · 0x1234",
    });
    const withoutCandidate = render("en");
    assert.match(withCandidate, /EDGE · base · 0x1234/);
    assert.doesNotMatch(withoutCandidate, /0x1234/);
  });

  it("keeps the owner inbox absent for a tester and shows it only with backend-provided capability", () => {
    assert.doesNotMatch(render("en", { initialOwnerStatus: null }), /Feedback inbox|Export JSON|Session group/);
    const owner = render("en", { initialOwnerStatus: ownerStatus() });
    assert.match(owner, /Feedback inbox/);
    assert.match(owner, /Export JSON/);
    assert.match(owner, /Export CSV/);
    assert.match(owner, /Owner only/);
  });

  it("uses React text rendering, guards double submission and contains all success/error/rate-limit copy", async () => {
    const component = await readFile(resolve(uiRoot, "src", "components", "Feedback.tsx"), "utf8");
    assert.doesNotMatch(component, /dangerouslySetInnerHTML/);
    assert.match(component, /submittingRef\.current/);
    assert.match(component, /Feedback został zapisany\. Dziękujemy\./);
    assert.match(component, /To zgłoszenie zostało już zapisane\./);
    assert.match(component, /Wysłano kilka zgłoszeń w krótkim czasie/);
    assert.match(component, /Feedback was saved\. Thank you\./);
    assert.doesNotMatch(component, /marked|markdown-to-jsx|react-markdown/i);
  });

  it("adds #feedback navigation and a compact action to the INTERNAL_BETA Product Radar", async () => {
    const [app, shell, i18n] = await Promise.all([
      readFile(resolve(uiRoot, "src", "ProductApp.tsx"), "utf8"),
      readFile(resolve(uiRoot, "src", "components", "ProductWorkspaceShell.tsx"), "utf8"),
      readFile(resolve(uiRoot, "src", "productI18n.tsx"), "utf8"),
    ]);
    assert.match(app, /"#feedback": "feedback"/);
    assert.match(app, /id: "feedback"/);
    assert.match(app, /groupLabel: t\("nav\.groupReview"\)/);
    assert.match(shell, /feedback\.quickAction/);
    assert.match(i18n, /"nav\.feedbackDescription": "Report an issue or idea"/);
    assert.match(i18n, /"nav\.feedbackDescription": "Zgłoś problem lub pomysł"/);
  });

  it("keeps owner review and cleanup scoped to the isolated feedback database", async () => {
    const [start, clear] = await Promise.all([
      readFile(resolve(repoRoot, "scripts", "win", "start-feedback-loop-review.cmd"), "utf8"),
      readFile(resolve(repoRoot, "scripts", "win", "clear-feedback-loop-review.cmd"), "utf8"),
    ]);
    assert.match(start, /CRYPTO_EDGE_RUNTIME_MODE=INTERNAL_BETA/);
    assert.match(start, /CRYPTO_EDGE_OWNER_OPERATIONS_MODE=REVIEW_SAFE/);
    assert.match(start, /feedback-loop-review\.sqlite/);
    assert.match(start, /#feedback/);
    assert.match(start, /CRYPTO_EDGE_AUTOMATION_ENABLED=0/);
    assert.doesNotMatch(start, /run-central-automation|generate-live-context|collect-scanner|runCentral/i);
    assert.match(clear, /feedback-loop-review\.sqlite/);
    assert.doesNotMatch(clear, /review-session|data-poc|output|established|follow-up/i);
  });
});

function render(
  locale: "en" | "pl",
  overrides: Partial<React.ComponentProps<typeof Feedback>> = {},
): string {
  return renderToStaticMarkup(React.createElement(
    ProductLocaleProvider,
    { initialLocale: locale },
    React.createElement(Feedback, {
      screenContext: "candidate-results",
      initialPublicStatus: publicStatus(),
      initialOwnerStatus: null,
      ...overrides,
    }),
  ));
}

function publicStatus(): FeedbackPublicStatus {
  return {
    capture_available: true,
    feedback_status: "READY",
    submission_enabled: true,
    max_title_length: 120,
    max_details_length: 3_000,
    supported_categories: ["BLOCKER", "IMPROVEMENT", "CLARIFICATION", "LATER"],
  };
}

function ownerStatus(): OwnerFeedbackStatus {
  return {
    storage_available: true,
    feedback_status: "READY",
    total_count: 0,
    new_count: 0,
    blocker_count: 0,
    improvement_count: 0,
    clarification_count: 0,
    later_count: 0,
    latest_feedback_at: null,
    oldest_new_feedback_at: null,
  };
}
