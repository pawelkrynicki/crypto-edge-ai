import { formatProductUsd } from "./productI18n";
import type { ResearchChecklistItem } from "./researchChecklistTypes";

export function researchChecklistItemValue(item: ResearchChecklistItem, locale: "pl" | "en"): string {
  if (item.manual_external_tool && !item.manual_evidence) return locale === "pl" ? "Brak zapisanego wyniku" : "No saved result";
  if (item.manual_evidence?.value_text) return researchEvidencePresentationText(item.manual_evidence.value_text, locale, item.manual_evidence.source_tool);
  if (item.value_number != null) {
    if (item.manual_evidence?.source_tool === "TokenSniffer") return locale === "pl"
      ? `Ręcznie zapisany wynik TokenSniffer: ${item.value_number}`
      : `Manually recorded TokenSniffer score: ${item.value_number}`;
    if (["market_cap", "volume_24h", "liquidity"].includes(item.key)) return formatProductUsd(item.value_number, locale, locale === "pl" ? "Brak danych" : "Missing data");
    if (["volume_market_cap_ratio", "liquidity_market_cap_ratio"].includes(item.key)) return `${(item.value_number * 100).toFixed(2)}%`;
    if (["pair_age", "liquidity_lock_days"].includes(item.key)) return `${item.value_number.toFixed(1)} ${locale === "pl" ? "dni" : "days"}`;
    if (["top1_wallet", "top10_wallets", "buy_tax", "sell_tax"].includes(item.key)) return `${item.value_number.toFixed(2)}%`;
    return String(item.value_number);
  }
  if (item.key === "ownership") {
    if (item.value_text === "renounced") return locale === "pl" ? "Własność zrzucona" : "Ownership renounced";
    if (item.value_text === "active") return locale === "pl" ? "Własność aktywna" : "Ownership active";
    return locale === "pl" ? "Brak danych" : "Missing data";
  }
  if (item.value_text) {
    if (isUnrecordedMachineValue(item.value_text)) return locale === "pl" ? "Brak zapisanego wyniku" : "No recorded result";
    if (item.value_text === "yes") return locale === "pl" ? "Tak" : "Yes";
    if (item.value_text === "no") return locale === "pl" ? "Nie" : "No";
    if (item.value_text === "passed") return locale === "pl" ? "Pozytywny wynik" : "Passed";
    if (item.value_text === "failed") return locale === "pl" ? "Negatywny wynik" : "Failed";
    if (item.value_text === "locked") return locale === "pl" ? "Zablokowana" : "Locked";
    if (item.value_text === "unlocked") return locale === "pl" ? "Niezablokowana" : "Unlocked";
    return item.value_text;
  }
  if (item.key.endsWith("scorecard")) return locale === "pl" ? "Brak dostępnego wyniku" : "No score is available";
  if (item.manual_external_tool) return locale === "pl" ? "Zapisany wynik" : "Saved result";
  return item.state === "MISSING_DATA" ? (locale === "pl" ? "Brak zapisanych danych" : "No recorded data") : (locale === "pl" ? "Zapisana kontrola" : "Recorded check");
}

export function researchEvidencePresentationText(value: string, locale: "pl" | "en", sourceTool: string | null = null): string {
  if (sourceTool === "Honeypot.is") {
    if (value === "low_honeypot_risk" || value === "no_honeypot") return locale === "pl" ? "Niskie ryzyko honeypota" : "Low honeypot risk";
    if (value === "honeypot_detected") return locale === "pl" ? "Honeypot wykryty" : "Honeypot detected";
    if (value === "no_conclusive_result" || value === "could_not_confirm") return locale === "pl" ? "Brak jednoznacznego wyniku" : "No conclusive result";
  }
  if (sourceTool === "Bubblemaps") {
    if (value === "no_material_cluster") return locale === "pl" ? "Brak istotnego klastra" : "No material cluster";
    if (value === "needs_attention") return locale === "pl" ? "Wymaga uwagi — dalsza ocena ręczna" : "Needs attention — further manual assessment";
    if (value === "strong_concentration_or_related_cluster") return locale === "pl" ? "Silna koncentracja / powiązany klaster" : "Strong concentration / related cluster";
    if (value === "no_data") return locale === "pl" ? "Brak danych" : "No data";
  }
  return isUnrecordedMachineValue(value) ? (locale === "pl" ? "Brak zapisanego wyniku" : "No recorded result") : value;
}

function isUnrecordedMachineValue(value: string): boolean {
  return [
    "unknown",
    "null",
    "undefined",
    "missing_data",
    "open_external_tool",
    "auto_verified",
    "manual_verified",
    "not_applicable",
    "red_flag",
  ].includes(value.trim().toLowerCase());
}
