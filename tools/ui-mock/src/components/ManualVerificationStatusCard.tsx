import React, { useEffect, useState } from "react";

void React;
import { formatProductDateTime, useProductLocale } from "../productI18n";
import { manualVerificationVerdictLabel } from "../manualVerificationVerdictLabel";
import {
  loadManualVerification,
  type PrivateVerificationRecord,
} from "../services/manualOwnerActionsDataSource";

export function ManualVerificationStatusCard({
  chain,
  contractAddress,
  initialRecord = null,
}: {
  chain: string;
  contractAddress: string;
  initialRecord?: PrivateVerificationRecord | null;
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
  initialRecord?: PrivateVerificationRecord | null;
}) {
  const { locale } = useProductLocale();
  const [record, setRecord] = useState<PrivateVerificationRecord | null>(() => (
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
    <section className="manual-verification-status" aria-label={pl ? "Twój wynik weryfikacji" : "Your verification result"}>
      <span>{pl ? "Twój wynik weryfikacji" : "Your verification result"}</span>
      {record ? (
        <>
          <strong data-verification-verdict={record.verdict}>{manualVerificationVerdictLabel(record.verdict, locale)}</strong>
          <small>{pl ? "Twoja notatka" : "Your note"}</small>
          <p>{record.note}</p>
          <small>{formatProductDateTime(record.checked_at, locale)}</small>
        </>
      ) : (
        <>
          <strong>{pl ? "Weryfikacja nieukończona" : "Verification incomplete"}</strong>
          <p>{pl ? "Otwórz ręczną weryfikację, porównaj źródła i zapisz wynik." : "Open manual verification, compare sources and save the result."}</p>
        </>
      )}
    </section>
  );
}

function matchesIdentity(
  record: PrivateVerificationRecord | null | undefined,
  chain: string,
  contractAddress: string,
): record is PrivateVerificationRecord {
  return Boolean(
    record
    && record.chain.toLowerCase() === chain.toLowerCase()
    && record.contract_address.toLowerCase() === contractAddress.toLowerCase(),
  );
}
