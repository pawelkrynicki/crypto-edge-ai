import type {
  PersistedManualResearchState,
  PublicResearchEvidence,
  ResearchChecklistItemKey,
  ResearchChecklistView,
  ResearchStepNumber,
} from "../researchChecklistTypes";

export async function loadResearchChecklist(chain: string, contractAddress: string): Promise<ResearchChecklistView | null> {
  try {
    const response = await fetch(`/api/research-checklist?chain=${encodeURIComponent(chain)}&contract_address=${encodeURIComponent(contractAddress)}`, {
      credentials: "same-origin",
      headers: { accept: "application/json" },
    });
    const value = await response.json() as unknown;
    return response.ok && isChecklist(value) ? value : null;
  } catch {
    return null;
  }
}

export async function saveResearchEvidence(input: {
  chain: string;
  contractAddress: string;
  stepNumber: ResearchStepNumber;
  itemKey: ResearchChecklistItemKey;
  manualState: PersistedManualResearchState;
  valueText: string | null;
  valueNumber: number | null;
  note: string | null;
  sourceTool: string | null;
  evidenceUrl: string | null;
  observedAt: string | null;
}): Promise<PublicResearchEvidence | null> {
  try {
    const response = await fetch("/api/research-evidence", {
      method: "PUT",
      credentials: "same-origin",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({
        chain: input.chain,
        contract_address: input.contractAddress,
        step_number: input.stepNumber,
        item_key: input.itemKey,
        manual_state: input.manualState,
        value_text: input.valueText,
        value_number: input.valueNumber,
        note: input.note,
        source_tool: input.sourceTool,
        evidence_url: input.evidenceUrl,
        observed_at: input.observedAt,
      }),
    });
    const value = await response.json() as unknown;
    return response.ok && isRecord(value) && isEvidence(value.evidence) ? value.evidence : null;
  } catch {
    return null;
  }
}

export async function deleteResearchEvidence(input: {
  chain: string;
  contractAddress: string;
  stepNumber: ResearchStepNumber;
  itemKey: ResearchChecklistItemKey;
}): Promise<boolean> {
  try {
    const response = await fetch("/api/research-evidence", {
      method: "DELETE",
      credentials: "same-origin",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({
        chain: input.chain,
        contract_address: input.contractAddress,
        step_number: input.stepNumber,
        item_key: input.itemKey,
      }),
    });
    const value = await response.json() as unknown;
    return response.ok && isRecord(value) && value.deleted === true;
  } catch {
    return false;
  }
}

function isChecklist(value: unknown): value is ResearchChecklistView {
  return isRecord(value)
    && value.schema_version === "research_checklist_view_v1"
    && typeof value.chain === "string"
    && typeof value.contract_address === "string"
    && typeof value.manual_evidence_writable === "boolean"
    && Number.isSafeInteger(value.current_step)
    && isRecord(value.completeness)
    && Array.isArray(value.steps);
}

function isEvidence(value: unknown): value is PublicResearchEvidence {
  return isRecord(value)
    && value.schema_version === "research_evidence_sqlite_v1"
    && typeof value.chain === "string"
    && typeof value.contract_address === "string"
    && Number.isSafeInteger(value.step_number)
    && typeof value.item_key === "string"
    && typeof value.manual_state === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
