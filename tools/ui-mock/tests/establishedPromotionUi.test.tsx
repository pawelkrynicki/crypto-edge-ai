import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { mapPersistableScannerOutputToUiCandidates } from "../src/adapters/scannerOutputAdapter.js";
import { CandidateDetailView } from "../src/components/CandidateDetailView.js";
import {
  EstablishedPromotionPanel,
  formatEstablishedPromotionReason,
} from "../src/components/EstablishedPromotionPanel.js";
import { ProductControlCenter } from "../src/components/ProductControlCenter.js";
import { PERSISTABLE_SCANNER_SAMPLE } from "../src/fixtures/persistableScannerSample.js";
import { ProductLocaleProvider, type ProductLocale } from "../src/productI18n.js";
import type {
  EstablishedPromotionPreview,
  EstablishedPromotionStatus,
} from "../src/services/establishedPromotionDataSource.js";

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
    assert.match(markup, /Only a token with Candidate for Established status can be considered/);
    assert.match(markup, /Review-safe mode: adding to Established remains blocked/);
    assert.match(markup, /<button[^>]*disabled=""[^>]*>Add to Established<\/button>/);
    assert.match(markup, new RegExp(ADDRESS));
  });

  it("uses natural PL and EN status labels without exposing machine identifiers", () => {
    const english = render("en", React.createElement(EstablishedPromotionPanel, {
      initialStatus: visibleStatus("REVIEW_SAFE", {
        lifecycle_status: "NEW",
        basic_filter_status: "rejected_basic_filter",
        security_status: "PARTIAL",
      }),
    }));
    const polish = render("pl", React.createElement(EstablishedPromotionPanel, {
      initialStatus: visibleStatus("REVIEW_SAFE", {
        lifecycle_status: "NEW",
        basic_filter_status: "rejected_basic_filter",
        security_status: "PARTIAL",
      }),
    }));
    for (const value of [english, polish]) {
      assert.match(value, new RegExp(ADDRESS));
      assert.doesNotMatch(value, />NEW<|rejected_basic_filter|>PARTIAL<|NOT_ESTABLISHED|REVIEW_SAFE/);
      assert.doesNotMatch(value, /\b(?:Execute|Command|Shell|Terminal|Apply)\b/i);
      assert.doesNotMatch(value, /C:\\|\/home\/|session-secret|stack trace|lock path/i);
    }
    assert.match(english, /currently New/);
    assert.match(english, /Filters not passed/);
    assert.match(english, /Partial data/);
    assert.match(english, /Not in Established/);
    assert.match(english, /Review-safe mode/);
    assert.match(polish, /obecnie status Nowe/);
    assert.match(polish, /Filtry niespełnione/);
    assert.match(polish, /Częściowe dane/);
    assert.match(polish, /Nie znajduje się w Established/);
    assert.match(polish, /Bezpieczny tryb przeglądu/);
    assert.match(english, /Adding it creates a new Established Universe version and audit entry/);
    assert.match(english, /does not verify token safety and is not an investment recommendation/);
    assert.match(english, /Missing security data requires manual verification/);
    assert.match(polish, /Dodanie tworzy nową wersję Established Universe i wpis audytu/);
    assert.match(polish, /nie potwierdza bezpieczeństwa tokena ani nie stanowi rekomendacji inwestycyjnej/);
    assert.match(polish, /Brakujące dane bezpieczeństwa wymagają ręcznej weryfikacji/);
  });

  it("presents blocked preview reasons in natural PL and EN copy with a neutral fallback", () => {
    const preview = blockedPreview();
    const english = render("en", React.createElement(EstablishedPromotionPanel, {
      initialStatus: visibleStatus("REVIEW_SAFE", {
        lifecycle_status: "NEW",
        basic_filter_status: "rejected_basic_filter",
        security_status: "PARTIAL",
      }),
      initialPreview: preview,
    }));
    const polish = render("pl", React.createElement(EstablishedPromotionPanel, {
      initialStatus: visibleStatus("REVIEW_SAFE", {
        lifecycle_status: "NEW",
        basic_filter_status: "rejected_basic_filter",
        security_status: "PARTIAL",
      }),
      initialPreview: preview,
    }));
    for (const value of [english, polish]) {
      assert.doesNotMatch(value, /LIFECYCLE_NEW|BASIC_FILTER_NOT_PASSED/);
    }
    assert.match(english, /The token remains in the New layer and is not yet a candidate for Established/);
    assert.match(english, /The token did not pass the Radar basic filters/);
    assert.match(polish, /Token pozostaje w warstwie Nowe i nie jest jeszcze kandydatem do Established/);
    assert.match(polish, /Token nie przeszedł podstawowych filtrów Radaru/);
    assert.match(polish, /Zablokowane/);
    assert.match(polish, /Prawidłowy/);
    assert.match(polish, /Nie wykryto duplikatu/);
    assert.match(polish, /Bieżąca wersja Established/);
    assert.doesNotMatch(polish, /Bieżąca wersja universe/i);
    assert.equal(formatEstablishedPromotionReason("UNKNOWN_REASON", "en"), "The action does not meet the current requirements.");
    assert.equal(formatEstablishedPromotionReason("UNKNOWN_REASON", "pl"), "Operacja nie spełnia aktualnych warunków.");
    const knownReasonCodes = [
      "ALREADY_ESTABLISHED",
      "UNIVERSE_NOT_VALID",
      "DISABLED_ENTRY_EXISTS",
      "LIFECYCLE_NEW",
      "LIFECYCLE_MATURING",
      "LIFECYCLE_CANDIDATE_FOR_ESTABLISHED",
      "LIFECYCLE_ESTABLISHED",
      "LIFECYCLE_ARCHIVED",
      "BASIC_FILTER_NOT_PASSED",
      "PROMOTION_ALREADY_IN_PROGRESS",
    ];
    for (const code of knownReasonCodes) {
      assert.notEqual(formatEstablishedPromotionReason(code, "en"), "The action does not meet the current requirements.");
      assert.notEqual(formatEstablishedPromotionReason(code, "pl"), "Operacja nie spełnia aktualnych warunków.");
    }
  });

  it("disables confirmation and addition for BLOCKED and REVIEW_SAFE without a POST path", async () => {
    const blocked = render("pl", React.createElement(EstablishedPromotionPanel, {
      initialStatus: visibleStatus("ENABLED", {
        lifecycle_status: "NEW",
        basic_filter_status: "rejected_basic_filter",
      }),
      initialPreview: blockedPreview(),
    }));
    const reviewSafe = render("en", React.createElement(EstablishedPromotionPanel, {
      initialStatus: visibleStatus("REVIEW_SAFE"),
      initialPreview: addPreview(),
    }));
    for (const value of [blocked, reviewSafe]) {
      assert.match(value, /<input[^>]*type="checkbox"[^>]*disabled=""/);
      assert.match(value, /<button[^>]*disabled=""[^>]*>[^<]*Add to Established|<button[^>]*disabled=""[^>]*>[^<]*Dodaj do Established/);
    }
    assert.match(blocked, /Dodanie jest niedostępne, ponieważ token nie spełnia warunków kwalifikacji/);
    assert.match(reviewSafe, /Review-safe mode: adding to Established remains blocked/);

    const componentSource = await readFile(resolve(process.cwd(), "src", "components", "EstablishedPromotionPanel.tsx"), "utf8");
    const guardIndex = componentSource.indexOf("if (!canAdd || !preview");
    const postIndex = componentSource.indexOf("await addToEstablished(preview)");
    assert.ok(guardIndex >= 0 && postIndex > guardIndex, "the click handler must return before the POST helper when disabled");
    assert.match(componentSource, /disabled=\{!canAdd\}/);
  });

  it("forces the owner launcher to open #candidate-detail in REVIEW_SAFE without preview, writes or providers", async () => {
    const root = resolve(process.cwd(), "..", "..");
    const launcher = await readFile(resolve(root, "scripts", "win", "start-established-promotion-review.cmd"), "utf8");
    const productLauncher = await readFile(resolve(root, "scripts", "win", "start-product-radar-review.cmd"), "utf8");
    assert.match(launcher, /%\* --established-promotion-review --candidate-detail/);
    assert.match(productLauncher, /if "%ESTABLISHED_PROMOTION_REVIEW%"=="1" set "RADAR_VIEW=candidate-detail"/);
    assert.match(productLauncher, /RADAR_URL=http:\/\/127\.0\.0\.1:5173\/#\!RADAR_VIEW\!/);
    assert.match(productLauncher, /CRYPTO_EDGE_RUNTIME_MODE=INTERNAL_BETA/);
    assert.match(productLauncher, /CRYPTO_EDGE_OWNER_OPERATIONS_MODE=REVIEW_SAFE/);
    for (const value of [launcher, productLauncher]) {
      assert.doesNotMatch(value, /established-promotion-preview|\/api\/owner-operations|--apply|universe:manage/i);
      assert.doesNotMatch(value, /ALLOW_LIVE_PROVIDER_CALLS=1|CRYPTO_EDGE_ALLOW_LIVE_SOURCE_CHECK=1|OWNER_OPERATIONS_MODE=ENABLED/i);
    }
  });

  it("does not change overall Trusted Tester Preview readiness", () => {
    const english = render("en", React.createElement(ProductControlCenter, {
      status: null,
      ownerOperationsStatus: null,
    }));
    const polish = render("pl", React.createElement(ProductControlCenter, {
      status: null,
      ownerOperationsStatus: null,
    }));
    assert.match(english, /Not ready/);
    assert.match(polish, /Niegotowe/);
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
    assert.match(launcher, /--established-promotion-review --candidate-detail/);
    assert.match(launcher, /REVIEW_SAFE/);
    assert.doesNotMatch(launcher, /OWNER_OPERATIONS_MODE=ENABLED|ALLOW_LIVE_PROVIDER_CALLS=1|collector.*start/i);
  });
});

function visibleStatus(
  mode: "REVIEW_SAFE" | "ENABLED",
  overrides: Partial<EstablishedPromotionStatus> = {},
): EstablishedPromotionStatus {
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
    ...overrides,
    mode,
    owner_actions_enabled: mode === "ENABLED",
  };
}

function blockedPreview(): EstablishedPromotionPreview {
  return {
    preview_id: "preview-id",
    created_at: "2099-01-01T00:00:00.000Z",
    expires_at: "2099-01-01T00:01:00.000Z",
    one_time: true,
    eligibility_status: "BLOCKED",
    reason_codes: ["LIFECYCLE_NEW", "BASIC_FILTER_NOT_PASSED"],
    chain: "ethereum",
    contract_address: ADDRESS,
    display_name: "Canonical Candidate",
    symbol_hint: "CAND",
    current_universe_version: "established-universe-v000001",
    planned_universe_version: null,
    current_entries_total: 1,
    planned_entries_total: null,
    current_entries_enabled: 1,
    planned_entries_enabled: null,
    duplicate_status: "NONE",
    address_validation_status: "VALID",
    lifecycle_status: "NEW",
    basic_filter_status: "rejected_basic_filter",
    security_status: "PARTIAL",
    manual_verification_required: true,
    action_plan: "BLOCKED",
    lock_available: true,
    owner_actions_enabled: true,
  };
}

function addPreview(): EstablishedPromotionPreview {
  return {
    ...blockedPreview(),
    eligibility_status: "ELIGIBLE",
    reason_codes: [],
    planned_universe_version: "established-universe-v000002",
    planned_entries_total: 2,
    planned_entries_enabled: 2,
    lifecycle_status: "CANDIDATE_FOR_ESTABLISHED",
    basic_filter_status: "passed_basic_filter",
    action_plan: "ADD",
  };
}

function render(locale: ProductLocale, element: React.ReactElement): string {
  return renderToStaticMarkup(React.createElement(
    ProductLocaleProvider,
    { initialLocale: locale },
    element,
  ));
}
