import { execFile, spawn } from "node:child_process";
import type { Server } from "node:http";
import { createInterface, type Interface } from "node:readline/promises";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  OWNER_ACCEPTANCE_POINTS,
  OWNER_ACCEPTANCE_STATUSES,
  OWNER_ACCEPTANCE_VERDICTS,
  createOwnerAcceptancePreview,
  createSafeOwnerAcceptanceEnvironment,
  runOwnerAcceptanceSession,
  type OwnerAcceptanceFinding,
  type OwnerAcceptanceFindingSeverity,
  type OwnerAcceptanceInput,
  type OwnerAcceptancePointResult,
  type OwnerAcceptanceVerdict,
} from "../server/ownerAcceptance.js";
import { startProductVpsRuntime } from "../server/productVpsServer.js";

const execFileAsync = promisify(execFile);
const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const runbookUrl = pathToFileURL(fileURLToPath(new URL("../../../docs/local_owner_acceptance.md", import.meta.url))).href;

async function main(): Promise<void> {
  const args = stripArgumentSeparators(process.argv.slice(2));
  if (args.length === 0 || (args.length === 1 && args[0] === "--preview")) {
    const preview = createOwnerAcceptancePreview();
    console.log(JSON.stringify(preview, null, 2));
    await openExactlyOneTab(runbookUrl);
    console.log(`Runtime started: ${preview.runtime_started ? 1 : 0}`);
    return;
  }
  if (args.length !== 1 || args[0] !== "--run-local") {
    throw new Error("Usage: runOwnerAcceptance.ts [--preview|--run-local]");
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error("OWNER_ACCEPTANCE_TTY_REQUIRED");

  const environment = createSafeOwnerAcceptanceEnvironment(process.env);
  Object.assign(process.env, environment);
  const commitSha = (await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repoRoot })).stdout.trim();
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const result = await runOwnerAcceptanceSession({
      commitSha,
      startRuntime: async () => {
        const { server, config } = await startProductVpsRuntime(environment);
        try {
          const url = `http://${config.host}:${config.port}/#candidate-results`;
          await assertHealth(`http://${config.host}:${config.port}/api/health`);
          return { url, stop: () => stopServer(server) };
        } catch (error) {
          await stopServer(server).catch(() => undefined);
          throw error;
        }
      },
      openBrowserTab: openExactlyOneTab,
      collectOwnerInput: () => collectOwnerInput(readline),
    });
    console.log("");
    console.log(`Owner verdict recorded: ${result.manifest.final_verdict}`);
    console.log(`Manifest: ${result.artifacts.manifestPath}`);
    console.log(`Report: ${result.artifacts.reportPath}`);
    console.log("Local runtime process stopped: yes");
  } finally {
    readline.close();
  }
}

async function collectOwnerInput(readline: Interface): Promise<OwnerAcceptanceInput> {
  const acceptancePoints: OwnerAcceptancePointResult[] = [];
  console.log("");
  console.log("OA.1: oceń 10 punktów. Każdy status i notatka są wymagane.");
  for (const [index, point] of OWNER_ACCEPTANCE_POINTS.entries()) {
    console.log("");
    console.log(`${index + 1}. ${point.title}`);
    const status = await askAllowed(readline, "Status", OWNER_ACCEPTANCE_STATUSES);
    const ownerNote = await askRequired(readline, "Krótka notatka ownera");
    acceptancePoints.push({ ...point, status, owner_note: ownerNote });
  }

  const detectedP0P1 = await collectFindings(readline, "P0/P1", ["P0", "P1"]);
  const deferredP2P3 = await collectFindings(readline, "P2/P3 do później", ["P2", "P3"]);
  let finalVerdict: OwnerAcceptanceVerdict;
  do {
    finalVerdict = await askAllowed(readline, "Ręczny werdykt ownera", OWNER_ACCEPTANCE_VERDICTS);
    if (detectedP0P1.length > 0 && finalVerdict !== "REJECT") {
      console.log("P0/P1 blokuje akceptację. Wybierz REJECT.");
    }
  } while (detectedP0P1.length > 0 && finalVerdict !== "REJECT");
  return { acceptancePoints, detectedP0P1, deferredP2P3, finalVerdict };
}

async function collectFindings(
  readline: Interface,
  label: string,
  severities: readonly OwnerAcceptanceFindingSeverity[],
): Promise<OwnerAcceptanceFinding[]> {
  const findings: OwnerAcceptanceFinding[] = [];
  while ((await readline.question(`Dodać finding ${label}? [y/N]: `)).trim().toLowerCase() === "y") {
    const severity = await askAllowed(readline, "Severity", severities);
    const note = await askRequired(readline, "Opis");
    findings.push({ severity, note });
  }
  return findings;
}

async function askAllowed<T extends string>(readline: Interface, label: string, allowed: readonly T[]): Promise<T> {
  while (true) {
    const value = (await readline.question(`${label} [${allowed.join("/")}]: `)).trim().toUpperCase();
    if (allowed.includes(value as T)) return value as T;
    console.log(`Dozwolone wartości: ${allowed.join(", ")}`);
  }
}

async function askRequired(readline: Interface, label: string): Promise<string> {
  while (true) {
    const value = (await readline.question(`${label}: `)).trim();
    if (value.length > 0) return value;
    console.log("Notatka jest wymagana. Nie wklejaj sekretów, cookie ani danych sesyjnych.");
  }
}

async function openExactlyOneTab(url: string): Promise<void> {
  if (process.env.CRYPTO_EDGE_OA1_PLAN_ONLY === "1") {
    console.log(`OPEN_URL=${url}`);
    return;
  }
  const child = spawn("cmd.exe", ["/d", "/c", "start", "", url], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
}

async function assertHealth(url: string): Promise<void> {
  const response = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(5_000) });
  if (!response.ok) throw new Error(`OWNER_ACCEPTANCE_HEALTH_FAILED_${response.status}`);
}

async function stopServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

function stripArgumentSeparators(args: string[]): string[] {
  const normalized = [...args];
  while (normalized[0] === "--") normalized.shift();
  return normalized;
}

await main();
