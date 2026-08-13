import React, { useMemo } from "react";

void React;

import { useProductLocale } from "../productI18n";
import { isSameTokenIdentity } from "../tokenLifecycle";
import type { UiTokenCandidate } from "../types/scannerTypes";
import type { FollowUpPublicEntry } from "../types/followUpTypes";
import type { ManualVerificationRecord } from "../services/manualOwnerActionsDataSource";
import type { ResearchStepNumber } from "../researchChecklistTypes";
import { ExternalVerificationLinksView } from "./ExternalVerificationLinksView";

type VerificationTokenBrowserProps = {
  candidates: UiTokenCandidate[];
  followUpEntries: FollowUpPublicEntry[];
  selectedCandidate?: UiTokenCandidate | null;
  selectedFollowUp?: FollowUpPublicEntry | null;
  onSelectToken: (token: UiTokenCandidate | FollowUpPublicEntry) => void;
  onCloseToken: () => void;
  onOpenResearchBrief?: () => void;
  onVerificationSaved?: (record: ManualVerificationRecord) => void;
  onReturnToDetail?: () => void;
  onBackToResearchPlaybook?: () => void;
  focusedResearchStep?: ResearchStepNumber | null;
};

type VerificationListToken =
  | { kind: "candidate"; token: UiTokenCandidate }
  | { kind: "follow-up"; token: FollowUpPublicEntry };

/**
 * A selectable Radar list beside the shared Details drawer. It deliberately
 * has no queue state or independent verification workflow.
 */
export function VerificationTokenBrowser({
  candidates,
  followUpEntries,
  selectedCandidate = null,
  selectedFollowUp = null,
  onSelectToken,
  onCloseToken,
  onOpenResearchBrief,
  onVerificationSaved,
  onReturnToDetail,
  onBackToResearchPlaybook,
  focusedResearchStep = null,
}: VerificationTokenBrowserProps) {
  const { locale } = useProductLocale();
  const tokens = useMemo<VerificationListToken[]>(() => {
    const currentCandidates: VerificationListToken[] = candidates.map((token) => ({ kind: "candidate", token }));
    const followUpOnly = followUpEntries
      .filter((entry) => !candidates.some((candidate) => isSameTokenIdentity(
        entry,
        { chain: candidate.chain, contract_address: candidate.contractAddress },
      )))
      .map((token): VerificationListToken => ({ kind: "follow-up", token }));
    return [...currentCandidates, ...followUpOnly];
  }, [candidates, followUpEntries]);

  const selectedIdentity = selectedCandidate
    ? { chain: selectedCandidate.chain, contract_address: selectedCandidate.contractAddress }
    : selectedFollowUp
      ? { chain: selectedFollowUp.chain, contract_address: selectedFollowUp.contract_address }
      : null;

  return (
    <div className="verification-token-browser" data-verification-presentation="shared-details-drawer">
      <section className="verification-token-list" aria-labelledby="verification-token-list-heading">
        <header>
          <span>{locale === "pl" ? "Ręczna weryfikacja" : "Manual verification"}</span>
          <h3 id="verification-token-list-heading">{locale === "pl" ? "Tokeny z bieżącego Radaru" : "Tokens from the current Radar"}</h3>
          <p>{locale === "pl" ? "Wybierz token. Szczegóły otworzą się obok w tej samej karcie, bez opuszczania listy." : "Select a token. Its details open beside the list in the same card pattern."}</p>
        </header>
        {tokens.length > 0 ? (
          <div className="verification-token-list-items" role="list">
            {tokens.map((item) => {
              const chain = item.token.chain;
              const contractAddress = item.kind === "candidate"
                ? item.token.contractAddress
                : item.token.contract_address;
              const name = item.kind === "candidate" ? item.token.name : item.token.display_name;
              const symbol = item.token.symbol;
              const selected = Boolean(selectedIdentity && isSameTokenIdentity(
                { chain, contract_address: contractAddress },
                selectedIdentity,
              ));
              return (
                <button
                  key={`${chain}:${contractAddress}`}
                  type="button"
                  className={`verification-token-list-item ${selected ? "selected" : ""}`}
                  aria-pressed={selected}
                  data-verification-token={`${chain}:${contractAddress}`}
                  onClick={() => onSelectToken(item.token)}
                >
                  <span className="verification-token-list-symbol">{symbol || (locale === "pl" ? "Bez symbolu" : "No symbol")}</span>
                  <span className="verification-token-list-name">{name || (locale === "pl" ? "Bez nazwy" : "No name")}</span>
                  <span className="verification-token-list-meta">{chain} · {shortAddress(contractAddress)}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="verification-token-list-empty">{locale === "pl" ? "Brak tokenów w bieżących danych Radaru." : "No tokens are available in the current Radar data."}</p>
        )}
      </section>

      <div className="verification-token-drawer-region" aria-live="polite">
        {selectedCandidate || selectedFollowUp ? (
          <ExternalVerificationLinksView
            key={`${selectedCandidate?.chain ?? selectedFollowUp?.chain}:${selectedCandidate?.contractAddress ?? selectedFollowUp?.contract_address}:${focusedResearchStep ?? "none"}`}
            candidate={selectedCandidate}
            followUp={selectedFollowUp}
            onClose={onCloseToken}
            onOpenResearchBrief={onOpenResearchBrief}
            onVerificationSaved={onVerificationSaved}
            onReturnToDetail={onReturnToDetail}
            onBackToResearchPlaybook={onBackToResearchPlaybook}
            focusedResearchStep={focusedResearchStep}
          />
        ) : (
          <section className="verification-token-drawer-placeholder" aria-label={locale === "pl" ? "Wybór tokena do weryfikacji" : "Verification token selection"}>
            <h3>{locale === "pl" ? "Wybierz token do weryfikacji" : "Select a token for verification"}</h3>
            <p>{locale === "pl" ? "Lista pozostaje widoczna podczas przeglądania i zapisywania decyzji ownera." : "The list remains visible while the owner reviews and saves a decision."}</p>
          </section>
        )}
      </div>
    </div>
  );
}

function shortAddress(address: string): string {
  return address.length > 16 ? `${address.slice(0, 8)}…${address.slice(-6)}` : address;
}
