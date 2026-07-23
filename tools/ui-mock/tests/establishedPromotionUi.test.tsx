import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { mapPersistableScannerOutputToUiCandidates } from "../src/adapters/scannerOutputAdapter.js";
import { CandidateDetailView } from "../src/components/CandidateDetailView.js";
import { EstablishedPromotionPanel } from "../src/components/EstablishedPromotionPanel.js";
import { PERSISTABLE_SCANNER_SAMPLE } from "../src/fixtures/persistableScannerSample.js";
import { ProductLocaleProvider, type ProductLocale } from "../src/productI18n.js";
import type { EstablishedPromotionStatus } from "../src/services/establishedPromotionDataSource.js";

const ADDRESS = "0x9999999999999999999999999999999999999999";

describe("Established promotion Candidate Detail UI", () => {
  it("does not render any owner operation name for an ordinary tester", () => {
    const candidate = mapPersistableScannerOutputToUiCandidates(PERSISTABLE_SCANNER_SAMPLE)[0];
    const markup = render("en", React.createElement(CandidateDetailView, {
      candidate,
      initialOwnerPromotionStatus: null,
    }));
    assert.doesNotMatch(markup, /Owner decision|Consider for Established|Preview addition plan|Add to Established/);
    assert.doesNotMatch(markup, /owner_controls_visible|preview_id|owner session/i);
  });

  it("renders the owner-only section in Candidate Detail when backend capability is visible", () => {
    const candidate = {
      ...mapPersistableScannerOutputToUiCandidates(PERSISTABLE_SCANNER_SAMPLE)[0],
      chain: "ethereum",
      contractAddress: ADDRESS,
    };
    const markup = render("en", React.createElement(CandidateDetailView, {
      candidate,
      initialOwnerPromotionStatus: visibleStatus("REVIEW_SAFE"),
    }));
    assert.match(markup, /Owner decision/);
    assert.match(markup, /Consider for Established/);
    assert.match(markup, /Preview addition plan/);
    assert.match(markup, /Candidate for Established means only that the token is ready for an owner decision/);
    assert.match(markup, /Review-safe mode: adding to Established remains blocked/);
    assert.match(markup, /<button[^>]*disabled=""[^>]*>Add to Established<\/button>/);
    assert.match(markup, new RegExp(ADDRESS));
  });

  it("keeps PL and EN semantics aligned and avoids technical command language", () => {
    const english = render("en", React.createElement(EstablishedPromotionPanel, {
      initialStatus: visibleStatus("REVIEW_SAFE"),
    }));
    const polish = render("pl", React.createElement(EstablishedPromotionPanel, {
      initialStatus: visibleStatus("REVIEW_SAFE"),
    }));
    for (const value of [english, polish]) {
      assert.match(value, /CANDIDATE_FOR_ESTABLISHED/);
      assert.match(value, /REVIEW_SAFE/);
      assert.match(value, new RegExp(ADDRESS));
      assert.doesNotMatch(value, /\b(?:Execute|Command|Shell|Terminal|Apply)\b/i);
      assert.doesNotMatch(value, /C:\\|\/home\/|session-secret|stack trace|lock path/i);
    }
    assert.match(english, /Adding it creates a new Established Universe version and audit entry/);
    assert.match(english, /does not verify token safety and is not an investment recommendation/);
    assert.match(english, /Missing security data requires manual verification/);
    assert.match(polish, /Dodanie tworzy nową wersję Established Universe i wpis audytu/);
    assert.match(polish, /nie potwierdza bezpieczeństwa tokena ani nie stanowi rekomendacji inwestycyjnej/);
    assert.match(polish, /Brakujące dane bezpieczeństwa wymagają ręcznej weryfikacji/);
  });

  it("uses the manager directly and keeps ordinary view refresh free of promotion writes", async () => {
    const root = resolve(process.cwd());
    const backend = await readFile(resolve(root, "server", "establishedPromotion.ts"), "utf8");
    const app = await readFile(resolve(root, "src", "ProductApp.tsx"), "utf8");
    const detail = await readFile(resolve(root, "src", "components", "CandidateDetailView.tsx"), "utf8");
    const dataSource = await readFile(resolve(root, "src", "services", "establishedPromotionDataSource.ts"), "utf8");
    const launcher = await readFile(resolve(root, "..", "..", "scripts", "win", "start-established-promotion-review.cmd"), "utf8");
    assert.match(backend, /import[\s\S]*mutateEstablishedUniverse[\s\S]*establishedUniverseManager/);
    assert.doesNotMatch(backend, /node:child_process|execFile|execSync|spawnSync|cmd\.exe|powershell/i);
    assert.doesNotMatch(app, /established-promotion-preview|established-promotion"/);
    assert.doesNotMatch(detail, /loadEstablishedPromotionPreview|addToEstablished/);
    assert.match(dataSource, /JSON\.stringify\(\{ preview_id: preview\.preview_id, confirmation: true \}\)/);
    assert.doesNotMatch(dataSource, /owner_note|added_by|--apply|command|path:/i);
    assert.match(launcher, /--candidate-detail --established-promotion-review/);
    assert.match(launcher, /REVIEW_SAFE/);
    assert.doesNotMatch(launcher, /OWNER_OPERATIONS_MODE=ENABLED|ALLOW_LIVE_PROVIDER_CALLS=1|collector.*start/i);
  });
});

function visibleStatus(mode: "REVIEW_SAFE" | "ENABLED"): EstablishedPromotionStatus {
  return {
    mode,
    owner_controls_visible: true,
    owner_actions_enabled: mode === "ENABLED",
    chain: "ethereum",
    contract_address: ADDRESS,
    display_name: "Canonical Candidate",
    symbol: "CAND",
    source_layer: "FOLLOW_UP",
    lifecycle_status: "CANDIDATE_FOR_ESTABLISHED",
    eligibility_status: "ELIGIBLE",
    eligibility_reason_codes: [],
    basic_filter_status: "passed_basic_filter",
    security_status: "MANUAL_VERIFICATION_REQUIRED",
    established_membership: "NOT_ESTABLISHED",
    current_universe_version: "established-universe-v000001",
    current_universe_checksum: `sha256:${"a".repeat(64)}`,
    universe_validation_status: "valid",
  };
}

function render(locale: ProductLocale, element: React.ReactElement): string {
  return renderToStaticMarkup(React.createElement(
    ProductLocaleProvider,
    { initialLocale: locale },
    element,
  ));
}
