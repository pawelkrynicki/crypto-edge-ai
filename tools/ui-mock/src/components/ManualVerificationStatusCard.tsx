import React, { useEffect, useState } from "react";

void React;
import { formatProductDateTime, useProductLocale } from "../productI18n";
import { manualVerificationVerdictLabel } from "../manualVerificationVerdictLabel";
import {
  loadManualVerification,
  type ManualVerificationRecord,
} from "../services/manualOwnerActionsDataSource";

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
          <strong data-verification-verdict={record.verdict}>{manualVerificationVerdictLabel(record.verdict, locale)}</strong>
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
