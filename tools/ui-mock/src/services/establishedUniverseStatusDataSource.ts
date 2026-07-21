export type EstablishedUniverseStatus = {
  universe_version: string | null;
  generated_at: string | null;
  entries_total: number;
  entries_enabled: number;
  validation_status: "valid" | "invalid" | "unavailable";
  last_change_at: string | null;
};

export async function loadEstablishedUniverseStatus(): Promise<EstablishedUniverseStatus | null> {
  try {
    const response = await fetch(`${getApiBaseUrl()}/api/established-universe/status`, {
      method: "GET",
      headers: { accept: "application/json" },
    });
    if (!response.ok) return null;
    const value = await response.json() as unknown;
    return isEstablishedUniverseStatus(value) ? value : null;
  } catch {
    return null;
  }
}

function isEstablishedUniverseStatus(value: unknown): value is EstablishedUniverseStatus {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const status = value as Record<string, unknown>;
  return (status.universe_version === null || typeof status.universe_version === "string")
    && (status.generated_at === null || typeof status.generated_at === "string")
    && Number.isSafeInteger(status.entries_total) && Number(status.entries_total) >= 0
    && Number.isSafeInteger(status.entries_enabled) && Number(status.entries_enabled) >= 0
    && ["valid", "invalid", "unavailable"].includes(String(status.validation_status))
    && (status.last_change_at === null || typeof status.last_change_at === "string");
}

function getApiBaseUrl(): string {
  const env = (import.meta as ImportMeta & { env?: { VITE_SCANNER_API_URL?: string } }).env;
  return env?.VITE_SCANNER_API_URL?.replace(/\/$/, "") ?? "";
}
