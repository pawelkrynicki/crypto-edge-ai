import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { mapPersistableScannerOutputToUiCandidates } from "../src/adapters/scannerOutputAdapter.js";
import { CandidateDetailView } from "../src/components/CandidateDetailView.js";
import {
  MaturingFollowUpBasket,
  NewEmergingBasket,
} from "../src/components/CandidateResultsView.js";
import {
  TokenLifecycleFlow,
  TokenLifecycleStatus,
} from "../src/components/TokenLifecycleFlow.js";
import { PERSISTABLE_SCANNER_SAMPLE } from "../src/fixtures/persistableScannerSample.js";
import { ProductLocaleProvider, type ProductLocale } from "../src/productI18n.js";
import {
  findFollowUpByIdentity,
  isSameTokenIdentity,
  resolveTokenIdentity,
  resolveTokenLifecycle,
} from "../src/tokenLifecycle.js";
import type { FollowUpPublicEntry, FollowUpPublicStatus } from "../src/types/followUpTypes.js";
import type { UiTokenCandidate } from "../src/types/scannerTypes.js";

void React;

const uiRoot = resolve(import.meta.dirname, "..");
const repoRoot = resolve(uiRoot, "..", "..");
const ADDRESS = "0x1111111111111111111111111111111111111111";
const OTHER_ADDRESS = "0x2222222222222222222222222222222222222222";
const NOW = new Date("2026-07-25T12:00:00.000Z");

describe("FLOW.1 visible token lifecycle contracts", () => {
  it("matches only normalized chain + contract_address and never symbol, name, pair or list position", () => {
    const candidate = productCandidate();
    const sameIdentity = followUpEntry({ contract_address: ADDRESS.toUpperCase().replace("0X", "0x") });
    const sameCopyDifferentIdentity = followUpEntry({
      entry_id: "fup_2222222222222222",
      contract_address: OTHER_ADDRESS,
      symbol: candidate.symbol,
      display_name: candidate.name,
    });
    assert.equal(findFollowUpByIdentity([sameCopyDifferentIdentity, sameIdentity], candidate)?.entry_id, sameIdentity.entry_id);
    assert.equal(isSameTokenIdentity(sameIdentity, { chain: "BASE", contract_address: ADDRESS }), true);
    assert.equal(isSameTokenIdentity(sameCopyDifferentIdentity, { chain: "base", contract_address: ADDRESS }), false);
    assert.deepEqual(resolveTokenIdentity("base", ADDRESS.toUpperCase().replace("0X", "0x")), {
      status: "valid",
      chain: "base",
      contract_address: ADDRESS,
      key: `base:${ADDRESS}`,
    });
    assert.equal(resolveTokenIdentity("solana", "So11111111111111111111111111111111111111112").status, "valid");
  });

  it("shows active automatic tracking for an enrolled New record", () => {
    const candidate = productCandidate();
    const entry = followUpEntry();
    const model = resolveTokenLifecycle({ candidate, followUp: entry, followUpStatus: followUpStatus(), now: NOW });
    assert.equal(model.tracking_status, "active");
    assert.equal(model.current_stage, "follow_up");
    assert.equal(model.next_action_type, "automatic_checkpoint");

    const polish = render("pl", React.createElement(NewEmergingBasket, {
      candidates: [candidate],
      followUpEntries: [entry],
      followUpStatus: followUpStatus(),
    }));
    assert.match(polish, /Automatyczne śledzenie aktywne/);
    assert.match(polish, /Nie wymaga ręcznego przenoszenia/);
    assert.match(polish, /Pierwsze wykrycie/);
    assert.match(polish, /Następny checkpoint/);
    assert.doesNotMatch(polish, /Przenieś do dalszej obserwacji/);
  });

  it("shows a neutral wait for a valid New identity that is not enrolled yet", () => {
    const candidate = productCandidate();
    const model = resolveTokenLifecycle({ candidate, followUpStatus: followUpStatus(), now: NOW });
    assert.equal(model.tracking_status, "waiting");
    assert.equal(model.next_action_type, "automatic_enrollment");
    assert.equal(model.next_action_label, "Automatic enrollment during the next central data cycle");
    assert.deepEqual(model.blocking_conditions, []);

    for (const locale of ["pl", "en"] as const) {
      const markup = render(locale, React.createElement(NewEmergingBasket, {
        candidates: [candidate],
        followUpEntries: [],
        followUpStatus: followUpStatus({ entries_total: 0 }),
      }));
      assert.match(markup, locale === "pl"
        ? /Oczekuje na zapis do dalszej obserwacji/
        : /Waiting for follow-up enrollment/);
      assert.match(markup, locale === "pl"
        ? /najbliższego centralnego cyklu danych/
        : /next central data cycle/);
      assert.doesNotMatch(markup, /error|błąd/i);
    }
  });

  it("shows natural identity and availability blockers without raw reason codes", () => {
    const invalid = productCandidate({ contractAddress: "not-an-address" });
    const unsupported = productCandidate({ chain: "unknown-chain" });
    const invalidModel = resolveTokenLifecycle({ candidate: invalid, followUpStatus: followUpStatus() });
    const unsupportedModel = resolveTokenLifecycle({ candidate: unsupported, followUpStatus: followUpStatus() });
    assert.deepEqual(invalidModel.blocking_conditions, ["INVALID_CONTRACT_ADDRESS"]);
    assert.deepEqual(unsupportedModel.blocking_conditions, ["UNSUPPORTED_CHAIN"]);

    const invalidMarkup = render("pl", React.createElement(NewEmergingBasket, {
      candidates: [invalid],
      followUpEntries: [],
      followUpStatus: followUpStatus(),
    }));
    const unavailableMarkup = render("pl", React.createElement(NewEmergingBasket, {
      candidates: [productCandidate()],
      followUpEntries: [],
      followUpStatus: followUpStatus({ store_available: false, validation_status: "unavailable" }),
    }));
    assert.match(invalidMarkup, /Brak poprawnego adresu kontraktu/);
    assert.doesNotMatch(invalidMarkup.replace(/<details>[\s\S]*?<\/details>/g, ""), /INVALID_CONTRACT_ADDRESS/);
    assert.match(unavailableMarkup, /Dane Follow-up niedostępne/);
  });

  it("presents 1/3/7/14/30 checkpoints as reassessment dates, including a data-unavailable retry", () => {
    const entry = followUpEntry({
      lifecycle_status: "MATURING",
      completed_checkpoints: [1, 3],
      next_check_at: "2026-07-20T00:00:00.000Z",
      missing_data: ["security_not_checked"],
    });
    const model = resolveTokenLifecycle({ followUp: entry, followUpStatus: followUpStatus(), now: NOW });
    assert.deepEqual(model.checkpoints.map(({ day }) => day), [1, 3, 7, 14, 30]);
    assert.deepEqual(model.checkpoints.map(({ state }) => state), ["completed", "completed", "skipped", "future", "future"]);

    const markup = render("pl", React.createElement(MaturingFollowUpBasket, {
      entries: [entry],
      status: followUpStatus(),
    }));
    for (const day of [1, 3, 7, 14, 30]) assert.match(markup, new RegExp(`>${day}<`));
    assert.match(markup, /Brak danych — oczekuje na ponowienie/);
    assert.match(markup, /Checkpoint oznacza termin ponownej oceny danych, a nie akceptację tokena/);
  });

  it("keeps Candidate separate from Established until enabled universe membership is supplied", () => {
    const candidate = productCandidate({ discoveryBasket: "established" });
    const entry = followUpEntry({
      lifecycle_status: "CANDIDATE_FOR_ESTABLISHED",
      filter_status: "passed_basic_filter",
      next_check_at: null,
      next_review_step: "OWNER_DECISION_REQUIRED",
    });
    const candidateModel = resolveTokenLifecycle({ candidate, followUp: entry, followUpStatus: followUpStatus() });
    assert.equal(candidateModel.current_stage, "candidate");
    assert.equal(candidateModel.owner_decision_required, true);
    assert.equal(candidateModel.completed_stages.includes("established"), false);
    assert.equal(candidateModel.next_action_type, "owner_decision");

    const withoutMembership = resolveTokenLifecycle({ candidate, followUpStatus: followUpStatus(), establishedMembership: false });
    assert.notEqual(withoutMembership.current_stage, "established");
    const established = resolveTokenLifecycle({ candidate, followUp: entry, establishedMembership: true });
    assert.equal(established.current_stage, "established");
    assert.deepEqual(established.completed_stages, ["new", "follow_up", "candidate"]);
  });

  it("renders Candidate, owner decision and completed Main Radar flow naturally in PL and EN", () => {
    const entry = followUpEntry({
      lifecycle_status: "CANDIDATE_FOR_ESTABLISHED",
      filter_status: "passed_basic_filter",
      next_check_at: null,
      next_review_step: "OWNER_DECISION_REQUIRED",
    });
    const candidateModel = resolveTokenLifecycle({ followUp: entry, followUpStatus: followUpStatus() });
    const establishedModel = resolveTokenLifecycle({ followUp: entry, establishedMembership: true });
    for (const locale of ["pl", "en"] as const) {
      const candidateMarkup = render(locale, React.createElement(React.Fragment, null,
        React.createElement(TokenLifecycleFlow, { model: candidateModel }),
        React.createElement(TokenLifecycleStatus, { model: candidateModel }),
      ));
      const establishedMarkup = render(locale, React.createElement(TokenLifecycleFlow, { model: establishedModel }));
      assert.match(candidateMarkup, locale === "pl" ? /Kandydat do Established/ : /Candidate for Established/);
      assert.match(candidateMarkup, locale === "pl" ? /Decyzja właściciela/ : /Owner decision/);
      assert.match(candidateMarkup, locale === "pl" ? /Nie dodano automatycznie/ : /not promoted automatically/i);
      assert.match(establishedMarkup, locale === "pl" ? /Główny Radar/ : /Main Radar/);
      assert.doesNotMatch(candidateMarkup, /CANDIDATE_FOR_ESTABLISHED|OWNER_DECISION_REQUIRED/);
    }
  });

  it("puts the complete Observation flow high in Candidate Detail and hides owner controls from testers", () => {
    const candidate = productCandidate();
    const entry = followUpEntry({ chain: candidate.chain, contract_address: candidate.contractAddress });
    const markup = render("pl", React.createElement(CandidateDetailView, {
      candidate,
      followUp: entry,
      followUpStatus: followUpStatus(),
    }));
    assert.ok(markup.indexOf("Przepływ obserwacji") > markup.indexOf("Tożsamość"));
    assert.ok(markup.indexOf("Przepływ obserwacji") < markup.indexOf("Dane rynkowe"));
    assert.match(markup, /Co nastąpi automatycznie/);
    assert.match(markup, /Co wymaga decyzji/);
    assert.match(markup, /Najbliższy termin/);
    assert.match(markup, /Warunki blokujące/);
    assert.doesNotMatch(markup, /established-promotion-panel|Dodaj do Established/);
  });

  it("keeps FLOW.1 presentation provider-free, mutation-free, responsive and injection-free", async () => {
    const [model, component, results, detail, app, dataSource, handler, css] = await Promise.all([
      source("src/tokenLifecycle.ts"),
      source("src/components/TokenLifecycleFlow.tsx"),
      source("src/components/CandidateResultsView.tsx"),
      source("src/components/CandidateDetailView.tsx"),
      source("src/ProductApp.tsx"),
      source("src/services/followUpDataSource.ts"),
      source("server/scannerApiHandler.ts"),
      source("src/index.css"),
    ]);
    const presentation = [model, component, results, detail, app].join("\n");
    assert.doesNotMatch(presentation, /dangerouslySetInnerHTML/);
    assert.doesNotMatch(presentation, /dexscreenerClient|goplusClient|internalBetaCollector|ALLOW_LIVE_PROVIDER_CALLS/);
    assert.doesNotMatch(dataSource, /POST|PUT|PATCH|DELETE/);
    assert.match(dataSource, /\/api\/follow-up/);
    assert.match(handler, /isFollowUpApiPath[\s\S]*sendJson\(req, res, 405/);
    assert.match(css, /@media \(max-width: 420px\)/);
    assert.match(css, /\.token-lifecycle-stages[\s\S]*grid-template-columns: 1fr/);
    assert.match(css, /html,[\s\S]*?#root\s*\{[\s\S]*?overflow-x: hidden/);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  });

  it("ships the safe FLOW.1 launcher and required localized owner states", async () => {
    const [launcher, controlCenter] = await Promise.all([
      readFile(resolve(repoRoot, "scripts", "win", "start-token-flow-review.cmd"), "utf8"),
      source("src/components/ProductControlCenter.tsx"),
    ]);
    assert.match(launcher, /CRYPTO_EDGE_RUNTIME_MODE=INTERNAL_BETA/);
    assert.match(launcher, /--detail/);
    assert.match(launcher, /start-product-radar-review\.cmd" --candidate-detail/);
    assert.doesNotMatch(launcher, /--established-promotion-review/);
    assert.doesNotMatch(launcher, /OWNER_OPERATIONS_MODE=ENABLED|PUBLIC_BETA|collect:internal-beta|automation:run/i);
    for (const label of [
      "Wyłączona",
      "Tryb przeglądu",
      "Aktywna decyzja właściciela",
      "Review mode",
      "Owner decision enabled",
    ]) assert.match(controlCenter, new RegExp(label));
  });
});

function productCandidate(overrides: Partial<UiTokenCandidate> = {}): UiTokenCandidate {
  return {
    ...mapPersistableScannerOutputToUiCandidates(PERSISTABLE_SCANNER_SAMPLE)[0]!,
    chain: "base",
    contractAddress: ADDRESS,
    pairAddress: "0x3333333333333333333333333333333333333333",
    discoveryBasket: "new_emerging",
    observationOnly: true,
    establishedEligible: false,
    addressIdentityVerified: true,
    ...overrides,
  };
}

function followUpEntry(overrides: Partial<FollowUpPublicEntry> = {}): FollowUpPublicEntry {
  return {
    entry_id: "fup_1111111111111111",
    chain: "base",
    contract_address: ADDRESS,
    display_name: "Token",
    symbol: "TOK",
    lifecycle_status: "MATURING",
    pair_age: 31,
    first_seen_at: "2026-07-01T00:00:00.000Z",
    last_seen_at: "2026-07-24T00:00:00.000Z",
    last_checked_at: "2026-07-24T00:00:00.000Z",
    next_check_at: "2026-07-28T00:00:00.000Z",
    completed_checkpoints: [1, 3, 7, 14],
    market_metrics: {
      price_usd: 1,
      market_cap_usd: 1_000_000,
      fdv_usd: 1_000_000,
      liquidity_usd: 100_000,
      volume_24h_usd: 100_000,
      volume_market_cap_ratio: 0.1,
    },
    filter_status: "rejected_basic_filter",
    filter_reasons: ["pair_age_below_min"],
    security_status: "MANUAL_VERIFICATION_REQUIRED",
    missing_data: [],
    established_membership: false,
    next_review_step: "WAIT_FOR_NEXT_CHECKPOINT",
    ...overrides,
  };
}

function followUpStatus(overrides: Partial<FollowUpPublicStatus> = {}): FollowUpPublicStatus {
  return {
    schema_version: "follow_up_status_v1",
    store_available: true,
    validation_status: "valid",
    entries_total: 1,
    new_count: 0,
    maturing_count: 1,
    candidate_count: 0,
    established_count: 0,
    archived_count: 0,
    due_count: 0,
    next_due_at: "2026-07-28T00:00:00.000Z",
    last_updated_at: "2026-07-24T00:00:00.000Z",
    ...overrides,
  };
}

function render(locale: ProductLocale, element: React.ReactElement): string {
  return renderToStaticMarkup(React.createElement(
    ProductLocaleProvider,
    { initialLocale: locale },
    element,
  ));
}

function source(path: string): Promise<string> {
  return readFile(resolve(uiRoot, path), "utf8");
}
