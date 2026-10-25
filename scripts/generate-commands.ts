import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { type Document, generate } from "./command-contracts";

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
const source = await generate(
  JSON.parse(readFileSync(input, "utf8")) as Document,
);
const formatted = execFileSync(
  "./node_modules/.bin/biome",
  ["format", "--stdin-file-path", output],
  { input: source, encoding: "utf8" },
);
if (check) {
  let current: string | undefined;
  try {
    current = readFileSync(output, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (current !== formatted) {
    console.error(
      "Generated command contract is stale; run bun run generate:commands.",
    );
    process.exitCode = 1;
  }
} else {
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, formatted);
}
