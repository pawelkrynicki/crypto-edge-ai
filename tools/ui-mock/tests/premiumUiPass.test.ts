import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import { CandidateResultsView } from "../src/components/CandidateResultsView.js";
import { ProductWorkspaceShell, type ProductNavItem } from "../src/components/ProductWorkspaceShell.js";

void React;

const productRoot = resolve(import.meta.dirname, "..");
const repoRoot = resolve(productRoot, "..", "..");

async function source(path: string): Promise<string> {
  return readFile(resolve(productRoot, path), "utf8");
}

describe("Premium UI.1 presentation contract", () => {
  it("keeps every main product route and both locale dictionaries", async () => {
    const [app, i18n] = await Promise.all([
      source("src/ProductApp.tsx"),
      source("src/productI18n.tsx"),
    ]);
    for (const hash of [
      "#candidate-results",
      "#candidate-detail",
      "#external-checks",
      "#feedback",
      "#reports",
      "#methodology",
      "#control-center",
    ]) {
      assert.match(app, new RegExp(`"${hash}"`));
    }
    assert.match(i18n, /const EN =/);
    assert.match(i18n, /const PL:/);
    assert.match(i18n, /"app\.openNavigation": "Menu"/);
    assert.match(i18n, /"app\.closeNavigation": "Zamknij menu"/);
  });

  it("marks the active destination with aria-current", () => {
    const navItems: ProductNavItem[] = [
      { id: "candidate-results", label: "Radar", description: "Three layers", icon: "R" },
      { id: "candidate-detail", label: "Details", description: "Candidate context", icon: "D" },
    ];
    const markup = renderToStaticMarkup(React.createElement(ProductWorkspaceShell, {
      navItems,
      activeSection: "candidate-results",
      onSectionChange: () => undefined,
      onSendFeedback: () => undefined,
      loading: false,
      runtimeMode: "INTERNAL_BETA",
      resolvedSource: "unavailable",
      runId: null,
      generatedAt: null,
      ageSeconds: null,
      freshnessStatus: null,
      viewRefreshedAt: null,
      sourceIds: [],
      sourceHealth: { status: "unavailable", detailSourceIds: [], basis: "unavailable" },
      readiness: null,
      onRefresh: () => undefined,
      children: React.createElement("p", null, "content"),
    }));
    assert.match(markup, /aria-current="page"/);
    assert.equal((markup.match(/aria-current="page"/g) ?? []).length, 1);
  });

  it("provides a semantic mobile menu without horizontal-navigation fallback", async () => {
    const [shell, css] = await Promise.all([
      source("src/components/ProductWorkspaceShell.tsx"),
      source("src/index.css"),
    ]);
    assert.match(shell, /aria-expanded=\{mobileNavigationOpen\}/);
    assert.match(shell, /aria-controls="product-navigation"/);
    assert.match(shell, /id="product-navigation"/);
    assert.match(shell, /setMobileNavigationOpen\(false\)/);
    assert.match(css, /@media \(max-width: 900px\)[\s\S]*?\.product-mobile-nav-toggle\s*\{\s*display: inline-flex/);
    assert.match(css, /\.product-sidebar\.open\s*\{\s*display: block/);
    assert.match(css, /\.product-sidebar\s*\{[\s\S]*?overflow-x: hidden/);
  });

  it("keeps Radar as three explicitly named lifecycle layers", () => {
    const markup = renderToStaticMarkup(React.createElement(CandidateResultsView, { candidates: [] }));
    for (const layer of ["observation", "follow-up", "established"]) {
      assert.match(markup, new RegExp(`data-lifecycle-layer="${layer}"`));
    }
    assert.equal((markup.match(/data-lifecycle-layer=/g) ?? []).length, 3);
  });

  it("keeps all Candidate Detail modules in one-layer navigation and backend-gated owner controls", async () => {
    const detail = await source("src/components/CandidateDetailView.tsx");
    for (const layer of [
      "identity",
      "observation",
      "market",
      "filters",
      "security",
      "ai",
      "data",
      "sources",
    ]) {
      assert.match(detail, new RegExp(`"${layer}"`));
    }
    assert.match(detail, /data-active-detail-layer=\{activeLayer \?\? "summary"\}/);
    assert.match(detail, /activeLayer === "identity"/);
    assert.match(detail, /activeLayer === "sources"/);
    assert.equal((detail.match(/className="candidate-layer-body"/g) ?? []).length, 2);
    assert.match(detail, /status\?\.owner_controls_visible \? status : null/);
    assert.match(detail, /ownerPromotionStatus\?\.owner_controls_visible/);
    assert.doesNotMatch(detail, /owner_controls_visible\s*=\s*true/);
  });

  it("centralizes tokens, focus, responsive overflow and reduced motion", async () => {
    const css = await source("src/index.css");
    for (const token of [
      "--color-bg-app",
      "--color-surface-1",
      "--color-surface-2",
      "--color-surface-3",
      "--color-border-active",
      "--color-text-primary",
      "--color-text-helper",
      "--color-status-ready",
      "--color-status-partial",
      "--color-status-warning",
      "--color-status-not-ready",
      "--color-status-manual",
      "--focus-ring-color",
      "--duration-fast",
      "--duration-slow",
      "--ease-standard",
    ]) {
      assert.match(css, new RegExp(token));
    }
    assert.match(css, /:focus-visible/);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
    assert.match(css, /animation:\s*none !important/);
    assert.match(css, /@media \(max-width: 600px\)/);
    assert.match(css, /html,[\s\S]*?#root\s*\{[\s\S]*?overflow-x: hidden/);
    assert.match(css, /\.copyable-address code[\s\S]*?text-overflow: ellipsis/);
    assert.match(css, /button:disabled[\s\S]*?cursor: not-allowed/);
  });

  it("keeps the presentation layer injection-free and provider-free", async () => {
    const presentationFiles = [
      "src/ProductApp.tsx",
      "src/components/ProductWorkspaceShell.tsx",
      "src/components/CandidateResultsView.tsx",
      "src/components/CandidateDetailView.tsx",
      "src/components/ProductUi.tsx",
    ];
    const joined = (await Promise.all(presentationFiles.map(source))).join("\n");
    assert.doesNotMatch(joined, /dangerouslySetInnerHTML/);
    assert.doesNotMatch(joined, /https?:\/\//);
    assert.doesNotMatch(joined, /dexscreenerClient|goplusClient|internalBetaCollector|ALLOW_LIVE_PROVIDER_CALLS/);
  });

  it("ships review and check launchers with safe INTERNAL_BETA boundaries", async () => {
    const [launcher, check] = await Promise.all([
      readFile(resolve(repoRoot, "scripts", "win", "start-premium-ui-review.cmd"), "utf8"),
      readFile(resolve(repoRoot, "scripts", "win", "check-premium-ui-pass.cmd"), "utf8"),
    ]);
    for (const option of ["--radar", "--detail", "--mobile-guide"]) assert.match(launcher, new RegExp(option));
    assert.match(launcher, /CRYPTO_EDGE_RUNTIME_MODE=INTERNAL_BETA/);
    assert.match(launcher, /CRYPTO_EDGE_OWNER_OPERATIONS_MODE=DISABLED/);
    assert.match(launcher, /ALLOW_LIVE_PROVIDER_CALLS=/);
    assert.doesNotMatch(launcher, /DEVELOPMENT_DEMO|fixture|collector|automation:run/i);
    assert.match(check, /test:premium-ui/);
    assert.match(check, /build:internal-beta/);
  });

  it("keeps visual dependencies limited to React while allowing the server-only OpenAI SDK", async () => {
    const packageJson = JSON.parse(await readFile(resolve(productRoot, "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
    };
    assert.deepEqual(Object.keys(packageJson.dependencies).sort(), ["openai", "react", "react-dom"]);
    const componentNames = await readdir(resolve(productRoot, "src", "components"));
    assert.ok(componentNames.includes("ProductUi.tsx"));
  });
});
