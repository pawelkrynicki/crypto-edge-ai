import React, { useEffect, useState } from "react";

void React;
import { formatProductDateTime, useProductLocale } from "../productI18n";
import {
  loadManualVerification,
  type ManualVerificationRecord,
  type ManualVerificationVerdict,
} from "../services/manualOwnerActionsDataSource";

const VERDICT_COPY: Record<"pl" | "en", Record<ManualVerificationVerdict, string>> = {
  pl: {
    VERIFIED: "Zweryfikowano",
    NEEDS_MORE_DATA: "Potrzeba więcej danych",
    CRITICAL_RISK: "Ryzyko krytyczne",
    REJECT: "Odrzucono",
  },
  en: {
    VERIFIED: "Verified",
    NEEDS_MORE_DATA: "More data needed",
    CRITICAL_RISK: "Critical risk",
    REJECT: "Rejected",
  },
};

export function ManualVerificationStatusCard({
  chain,
  contractAddress,
  initialRecord = null,
}: {
  chain: string;
  contractAddress: string;
  initialRecord?: ManualVerificationRecord | null;
}) {
  const identityKey = `${chain.toLowerCase()}:${contractAddress.toLowerCase()}:${initialRecord?.checked_at ?? ""}`;
  return (
    <ManualVerificationStatusCardForIdentity
      key={identityKey}
      chain={chain}
      contractAddress={contractAddress}
      initialRecord={initialRecord}
    />
  );
}

function ManualVerificationStatusCardForIdentity({
  chain,
  contractAddress,
  initialRecord = null,
}: {
  chain: string;
  contractAddress: string;
  initialRecord?: ManualVerificationRecord | null;
}) {
  const { locale } = useProductLocale();
  const [record, setRecord] = useState<ManualVerificationRecord | null>(() => (
    matchesIdentity(initialRecord, chain, contractAddress) ? initialRecord : null
  ));

  useEffect(() => {
    if (matchesIdentity(initialRecord, chain, contractAddress)) {
      return;
    }
    let cancelled = false;
    void loadManualVerification(chain, contractAddress).then((value) => {
      if (!cancelled) setRecord(value);
    });
    return () => { cancelled = true; };
  }, [chain, contractAddress, initialRecord]);

  const pl = locale === "pl";
  return (
    <section className="manual-verification-status" aria-label={pl ? "Status ręcznej weryfikacji" : "Manual verification status"}>
      <span>{pl ? "Status ręcznej weryfikacji" : "Manual verification status"}</span>
      {record ? (
        <>
          <strong data-verification-verdict={record.verdict}>{VERDICT_COPY[locale][record.verdict]}</strong>
          <p>{record.note}</p>
          <small>{formatProductDateTime(record.checked_at, locale)}</small>
        </>
      ) : (
        <>
          <strong>{pl ? "Brak zapisanej decyzji" : "No saved decision"}</strong>
          <p>{pl ? "Otwórz ręczną weryfikację, porównaj źródła i zapisz werdykt." : "Open manual verification, compare sources and save a verdict."}</p>
        </>
      )}
    </section>
  );
}

function matchesIdentity(
  record: ManualVerificationRecord | null | undefined,
  chain: string,
  contractAddress: string,
): record is ManualVerificationRecord {
  return Boolean(
    record
    && record.chain.toLowerCase() === chain.toLowerCase()
    && record.contract_address.toLowerCase() === contractAddress.toLowerCase(),
  );
}
