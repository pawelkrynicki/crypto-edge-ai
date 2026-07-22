import {
  CONTROL_CENTER_BLOCKERS,
  CONTROL_CENTER_STATUSES,
  type ControlCenterStatus,
} from "../controlCenterStatus";

export async function loadControlCenterStatus(): Promise<ControlCenterStatus | null> {
  try {
    const response = await fetch(`${getApiBaseUrl()}/api/control-center/status`, {
      method: "GET",
      headers: { accept: "application/json" },
    });
    if (!response.ok) return null;
    const value = await response.json() as unknown;
    return isControlCenterStatus(value) ? value : null;
  } catch {
    return null;
  }
}

function isControlCenterStatus(value: unknown): value is ControlCenterStatus {
  if (!isRecord(value) || value.schemaVersion !== "control_center_status_v1") return false;
  if (!isStatus(value.overallStatus)) return false;
  if (!Array.isArray(value.unmetGates) || !value.unmetGates.every(isBlocker)) return false;
  const sectionKeys = [
    "runtimeApi",
    "dataSnapshots",
    "sources",
    "automation",
    "establishedUniverse",
    "reviewStorage",
    "reports",
    "accessDeployment",
    "feedback",
  ];
  return sectionKeys.every((key) => isRecord(value[key]) && isStatus(value[key].status));
}

function isStatus(value: unknown): boolean {
  return typeof value === "string" && (CONTROL_CENTER_STATUSES as readonly string[]).includes(value);
}

function isBlocker(value: unknown): boolean {
  return typeof value === "string" && (CONTROL_CENTER_BLOCKERS as readonly string[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getApiBaseUrl(): string {
  const env = (import.meta as ImportMeta & { env?: { VITE_SCANNER_API_URL?: string } }).env;
  return env?.VITE_SCANNER_API_URL?.replace(/\/$/, "") ?? "";
}
