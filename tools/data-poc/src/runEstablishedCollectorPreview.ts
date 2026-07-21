import { previewEstablishedAddressUniverse } from "./establishedAddressDiscovery.js";

function main(): void {
  const args = process.argv.slice(2);
  if (args[0] === "--") args.shift();
  let entryLimit: number | undefined;
  if (args.length > 0) {
    if (args.length !== 2 || args[0] !== "--limit" || !/^\d+$/.test(args[1])) {
      throw new Error("PREVIEW_ARGUMENT_INVALID");
    }
    entryLimit = Number(args[1]);
  }
  console.log(JSON.stringify(previewEstablishedAddressUniverse({ entryLimit }), null, 2));
}

try {
  main();
} catch (error) {
  console.error(JSON.stringify({ error: error instanceof Error ? error.message : "ESTABLISHED_PREVIEW_FAILED" }));
  process.exitCode = 1;
}
