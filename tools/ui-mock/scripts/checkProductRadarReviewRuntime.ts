const API_BASE_URL = "http://127.0.0.1:5177";
const STARTUP_TIMEOUT_MS = 20_000;
const POLL_INTERVAL_MS = 250;

type JsonRecord = Record<string, unknown>;

async function main(): Promise<void> {
  const health = await waitForHealth();
  assertStatus(health, 200, "/api/health");
  assertRuntimeMode(health.body, "/api/health");

  const readiness = await requestJson("/api/readiness");
  assertRuntimeMode(readiness.body, "/api/readiness");
  assertNoRuntimeUnconfigured(readiness.body, "/api/readiness");

  const scanner = await requestJson("/api/scanner/latest");
  if (scanner.status !== 200 && scanner.status !== 503) {
    throw new Error(`/api/scanner/latest returned unexpected HTTP ${scanner.status}`);
  }
  if (scanner.status === 503 && scanner.body.status !== "data_unavailable") {
    throw new Error("/api/scanner/latest did not return an honest data_unavailable error");
  }
  assertNoRuntimeUnconfigured(scanner.body, "/api/scanner/latest");

  console.log(`HEALTH HTTP ${health.status} runtime_mode=${String(health.body.runtime_mode)}`);
  console.log(`READINESS HTTP ${readiness.status} status=${String(readiness.body.status)} reason_codes=${JSON.stringify(readiness.body.reason_codes ?? [])}`);
  console.log(`SCANNER HTTP ${scanner.status} run_id=${String(readRunId(scanner.body) ?? "n/a")} reason_code=${String(scanner.body.reason_code ?? "none")}`);
}

async function waitForHealth(): Promise<{ status: number; body: JsonRecord }> {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  let lastError: unknown = null;
  while (Date.now() < deadline) {
    const remainingMs = deadline - Date.now();
    try {
      return await requestJson("/api/health", Math.min(5_000, remainingMs));
    } catch (error) {
      lastError = error;
      const remainingAfterAttemptMs = deadline - Date.now();
      if (remainingAfterAttemptMs <= 0) break;
      await new Promise((resolve) => setTimeout(resolve, Math.min(POLL_INTERVAL_MS, remainingAfterAttemptMs)));
    }
  }
  throw new Error(`Scanner API did not become ready within 20 seconds: ${errorMessage(lastError)}`);
}

async function requestJson(path: string, timeoutMs = 5_000): Promise<{ status: number; body: JsonRecord }> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(Math.max(1, timeoutMs)),
  });
  const body = await response.json() as unknown;
  if (!isRecord(body)) throw new Error(`${path} did not return a JSON object`);
  return { status: response.status, body };
}

function assertStatus(response: { status: number }, expected: number, path: string): void {
  if (response.status !== expected) throw new Error(`${path} returned HTTP ${response.status}, expected ${expected}`);
}

function assertRuntimeMode(body: JsonRecord, path: string): void {
  if (body.runtime_mode !== "INTERNAL_BETA") {
    throw new Error(`${path} runtime_mode=${String(body.runtime_mode)}, expected INTERNAL_BETA`);
  }
}

function assertNoRuntimeUnconfigured(body: JsonRecord, path: string): void {
  if (JSON.stringify(body).includes("RUNTIME_MODE_UNCONFIGURED")) {
    throw new Error(`${path} contains forbidden RUNTIME_MODE_UNCONFIGURED`);
  }
}

function readRunId(body: JsonRecord): string | null {
  if (typeof body.run_id === "string") return body.run_id;
  if (isRecord(body.scan_run) && typeof body.scan_run.run_id === "string") return body.scan_run.run_id;
  return null;
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? "unknown error");
}

main().catch((error: unknown) => {
  console.error(errorMessage(error));
  process.exit(1);
});
