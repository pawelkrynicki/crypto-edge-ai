import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const distDir = resolve(process.cwd(), "dist");
const forbiddenText = [
  "/fixtures/",
  "persistableScannerSample",
  "Built-in sample",
  "Local data file",
  "Webinar Teaser",
  "Trusted Preview",
  "PASSTOKEN111",
  "LOWLIQTOKEN111",
  "FDVFALLBACKTOKEN111",
];
const requiredText = [
  "Radar",
  "Details",
  "Szczegóły",
  "Verification",
  "Weryfikacja",
  "Methodology",
  "Metodologia",
  "API connectivity",
  "Refresh",
  "Odśwież",
  "INTERNAL_BETA",
];
const files = listFiles(distDir);
const serialized = files
  .filter((file) => /\.(?:html|js|css|json)$/i.test(file))
  .map((file) => readFileSync(file, "utf8"))
  .join("\n");

for (const forbidden of forbiddenText) {
  if (serialized.includes(forbidden)) {
    throw new Error(`INTERNAL_BETA build contains forbidden demo surface marker: ${forbidden}`);
  }
}

for (const required of requiredText) {
  if (!serialized.includes(required)) {
    throw new Error(`INTERNAL_BETA build is missing required product marker: ${required}`);
  }
}

console.log(`INTERNAL_BETA build boundary passed (${files.length} files, no demo/sample surfaces).`);

function listFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = resolve(directory, entry);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}
