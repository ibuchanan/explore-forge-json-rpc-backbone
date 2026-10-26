import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  type Document,
  generate,
  generateValidators,
} from "./command-contracts.ts";

const args = process.argv.slice(2);
const check = args.includes("--check");
const paths = args.filter((arg) => arg !== "--check");
if (paths.length > 2 || paths.some((arg) => arg.startsWith("--"))) {
  throw new Error(
    "Usage: generate-commands.ts [input.json output.ts] [--check]",
  );
}
const [
  input = "docs/reference/openrpc.json",
  output = "src/generated/commands.ts",
] = paths;
if (!output.endsWith(".ts")) throw new Error("Output must end in .ts");
const document = JSON.parse(readFileSync(input, "utf8")) as Document;
const source = await generate(document);
for (const [path, content] of [
  [output, source],
  [output.replace(/\.ts$/, ".validators.js"), generateValidators(document)],
] as const) {
  const formatted = execFileSync(
    "./node_modules/.bin/biome",
    ["format", "--stdin-file-path", path],
    { input: content, encoding: "utf8" },
  );
  if (check) {
    let current: string | undefined;
    try {
      current = readFileSync(path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    if (current !== formatted) {
      console.error(
        "Generated command contract is stale; run npm run generate:commands.",
      );
      process.exitCode = 1;
    }
  } else {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, formatted);
  }
}
