import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { mapPersistableScannerOutputToUiCandidates } from "../src/adapters/scannerOutputAdapter.js";
import { ExternalVerificationLinksView } from "../src/components/ExternalVerificationLinksView.js";
import {
  ManualSourceGuidance,
  ResearchChecklistDetail,
  type ManualSourceGuidanceTopic,
} from "../src/components/ResearchChecklist.js";
import { PERSISTABLE_SCANNER_SAMPLE } from "../src/fixtures/persistableScannerSample.js";
import { ProductLocaleProvider } from "../src/productI18n.js";

void React;

const candidate = mapPersistableScannerOutputToUiCandidates(PERSISTABLE_SCANNER_SAMPLE)[0]!;

function renderGuidance(topic: ManualSourceGuidanceTopic, locale: "pl" | "en") {
  return renderToStaticMarkup(<ManualSourceGuidance topic={topic} locale={locale} />);
}

test("manual source guidance is collapsed, localized, and has no fetch or persistence behavior", () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    return new Response("{}", { status: 404 });
  }) as typeof fetch;

  try {
    for (const topic of ["dex", "honeypot", "holders", "liquidity", "explorer"] as const) {
      const polish = renderGuidance(topic, "pl");
      const english = renderGuidance(topic, "en");
      assert.match(polish, new RegExp(`data-manual-source-guidance="${topic}"`));
      assert.match(polish, /Czego szukać\?/);
      assert.match(english, /What to look for\?/);
      assert.doesNotMatch(polish, /<details[^>]*\sopen(?:=|\s|>)/, `${topic} begins collapsed`);
      assert.doesNotMatch(`${polish}${english}`, /<iframe|fetch\(|api\.honeypot\.is|openai/i);
    }

    const dex = renderGuidance("dex", "pl");
    assert.match(dex, /właściwa para i sieć/);
    assert.match(dex, /wcześniejszej migawki/);
    const honeypot = renderGuidance("honeypot", "pl");
    assert.match(honeypot, /token można normalnie kupić i sprzedać/);
    assert.match(honeypot, /powyżej 10%/);
    assert.doesNotMatch(honeypot, /bezpiecz|rekomend|kup\s|sprzedaj\s/i);
    const holders = renderGuidance("holders", "pl");
    assert.match(holders, /największy portfel &lt;10%/);
    assert.match(holders, /Top 10 portfeli łącznie &lt;40%/);
    const liquidity = renderGuidance("liquidity", "pl");
    assert.match(liquidity, /0x\.\.\.dead/);
    assert.match(liquidity, /pozostaw brak danych/);
    const explorer = renderGuidance("explorer", "pl");
    assert.match(explorer, /Nie musisz analizować kodu kontraktu/);
    assert.doesNotMatch(explorer, /owner\(\)|mint|proxy|upgrade|blacklist|whitelist|Solidity/i);
    assert.equal(fetchCalls, 0, "rendering or expanding native details never calls a provider");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("guidance appears only in existing relevant cards and does not add a tab or iframe", () => {
  const data = renderToStaticMarkup(<ProductLocaleProvider initialLocale="pl"><ExternalVerificationLinksView candidate={candidate} initialActiveTab="data" /></ProductLocaleProvider>);
  for (const topic of ["dex", "honeypot", "explorer"]) assert.match(data, new RegExp(`data-manual-source-guidance="${topic}"`));
  assert.match(data, /<a[^>]+target="_blank"[^>]*>/, "external pages remain ordinary explicit links");
  assert.doesNotMatch(data, /<iframe/i);
  assert.equal((data.match(/role="tab"/g) ?? []).length, 6, "Verification Drawer tab count is unchanged");

  const stepThree = renderToStaticMarkup(<ProductLocaleProvider initialLocale="pl"><ResearchChecklistDetail candidate={candidate} focusedStep={3} /></ProductLocaleProvider>);
  const stepFour = renderToStaticMarkup(<ProductLocaleProvider initialLocale="pl"><ResearchChecklistDetail candidate={candidate} focusedStep={4} /></ProductLocaleProvider>);
  assert.match(stepThree, /data-manual-source-guidance="honeypot"/);
  assert.match(stepFour, /data-manual-source-guidance="holders"/);
  assert.match(stepFour, /data-manual-source-guidance="liquidity"/);
  assert.doesNotMatch(`${stepThree}${stepFour}`, /<iframe/i);
});
