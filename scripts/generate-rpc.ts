import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { generateContract } from "forge-ahead-rpc/generator";

const mode = process.argv[2];
if (mode !== "generate" && mode !== "check")
  throw new Error("Usage: bun run scripts/generate-rpc.ts generate|check");
const source = "docs/reference/openrpc.json";
const outputs = generateContract(
  JSON.parse(readFileSync(source, "utf8")),
  source,
);
const catalog = JSON.parse(readFileSync(source, "utf8"));
const files = {
  "catalog.ts": `// Generated from ${source}; do not edit.\nexport const catalog = ${JSON.stringify(catalog)};\n`,
  "contract.ts": outputs.contract,
  "validators.js": outputs.validators,
  "validators.d.ts": outputs.declarations,
  "web-policy.ts": outputs.policy,
};
const directory = "src/generated/rpc";
if (mode === "generate") mkdirSync(directory, { recursive: true });
for (const [name, content] of Object.entries(files)) {
  const path = join(directory, name);
  if (mode === "generate") writeFileSync(path, content);
  else if (readFileSync(path, "utf8") !== content)
    throw new Error(`Generated artifact drift: ${path}`);
}
