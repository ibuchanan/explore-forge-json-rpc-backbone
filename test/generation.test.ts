import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import OpenRPCTypings from "@open-rpc/typings";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { generate } from "./generation/experiment";

const document = () =>
  JSON.parse(readFileSync("docs/reference/openrpc.json", "utf8"));

function diagnostics(source: string): string[] {
  const filename = resolve("tmp_rovo_generation.ts");
  const options: ts.CompilerOptions = {
    strict: true,
    exactOptionalPropertyTypes: true,
    noEmit: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    types: [],
  };
  const host = ts.createCompilerHost(options);
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (
    path,
    languageVersion,
    onError,
    shouldCreateNewSourceFile,
  ) =>
    path === filename
      ? ts.createSourceFile(path, source, languageVersion, true)
      : getSourceFile(
          path,
          languageVersion,
          onError,
          shouldCreateNewSourceFile,
        );
  return ts
    .getPreEmitDiagnostics(ts.createProgram([filename], options, host))
    .map((diagnostic) =>
      ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
    );
}

const sample = `
import { ok } from "@forge-ahead/errors";
type Context = { authorized: boolean };
type Failure = { kind: "forbidden" };
const handlers: HandlerMap<Context, Failure> = {
  "config.get": async (_params, context) => ok({ configured: context.authorized, prefix: null }),
  "config.set": async ({ prefix }) => ok({ configured: true }),
  "integration.preview": async ({ text }) => ok({ output: text }),
  "config.reset": async ({ confirm }) => ok({ configured: false }),
};
declare const call: TypedCaller;
const read: Promise<{ configured: boolean; prefix: string | null }> = call("config.get", {});
const save: Promise<{ configured: true }> = call("config.set", { prefix: "  hi  " });
// Static string types do not validate content, length, Unicode, or normalization.
call("config.set", { prefix: "" });
call("config.set", { prefix: "  " + "😀".repeat(64) + "  " });
const preview: Promise<{ output: string }> = call("integration.preview", { text: " there 😀" });
const reset: Promise<{ configured: false }> = call("config.reset", { confirm: true });
// @ts-expect-error Unknown dotted method
call("config.unknown", {});
// @ts-expect-error Empty params must not accept fields
call("config.get", { unexpected: true });
// @ts-expect-error Reset requires literal true
call("config.reset", { confirm: false });
// @ts-expect-error Trusted context is not a parameter
call("config.set", { prefix: "hi", authorized: true });
// @ts-expect-error Incorrect output literal
const invalidOutput: Commands["config.set"]["result"] = { configured: false };
// @ts-expect-error Missing required output
const incompleteOutput: Commands["config.get"]["result"] = { configured: true };
// @ts-expect-error Missing handlers
const incompleteHandlers: HandlerMap<Context, Failure> = {};
const extraHandlers: HandlerMap<Context, Failure> = {
  ...handlers,
  // @ts-expect-error Extra handlers are not commands
  "config.unknown": async () => ok({}),
};
// @ts-expect-error Handler must return the shared Result, not a plain output
const plainOutput: HandlerMap<Context, Failure>["config.set"] = async () => ({ configured: true });
`;

describe("bounded OpenRPC generation experiment", () => {
  it("compiles named handlers and a typed caller for all four real commands", async () => {
    const output = await generate(document());
    expect(diagnostics(output + sample)).toEqual([]);
  });

  it("resolves local schema references and preserves optional and nullable shapes deterministically", async () => {
    const contract = document();
    contract.components.schemas = {
      Text: { type: "string" },
      Preview: {
        type: "object",
        additionalProperties: false,
        required: ["output"],
        properties: {
          output: { type: ["string", "null"] },
          note: { $ref: "#/components/schemas/Text" },
        },
      },
    };
    contract.methods[2].params.push({
      name: "note",
      required: false,
      schema: { $ref: "#/components/schemas/Text" },
    });
    contract.methods[2].result.schema = {
      $ref: "#/components/schemas/Preview",
    };
    const before = JSON.stringify(contract);
    const first = await generate(contract);
    expect(await generate(contract)).toBe(first);
    expect(JSON.stringify(contract)).toBe(before);
    expect(
      diagnostics(`${first}
      declare const call: TypedCaller;
      call("integration.preview", { text: "" });
      call("integration.preview", { text: "", note: "optional" });
      const nullable: Commands["integration.preview"]["result"] = { output: null };
      // @ts-expect-error Reference must stay string
      call("integration.preview", { text: "", note: false });
      // @ts-expect-error Optional output is string, not null
      const wrong: Commands["integration.preview"]["result"] = { output: "", note: null };
    `),
    ).toEqual([]);
    const actual = document();
    expect(await generate(actual)).toBe(await generate(actual));
  });

  it("rejects unsupported schema features rather than silently weakening types", async () => {
    const contract = document();
    contract.methods[1].params[0].schema = {
      type: "string",
      if: { const: "admin" },
    };
    await expect(generate(contract)).rejects.toThrow(
      /unsupported schema keyword: if/i,
    );
  });

  it.each([
    "https://example.invalid/schema.json",
    "file:///not-allowed/schema.json",
    "./schema.json",
    "#/components/schemas/Missing",
  ])("rejects unavailable or external reference %s", async ($ref) => {
    const contract = document();
    contract.methods[1].params[0].schema = { $ref };
    await expect(generate(contract)).rejects.toThrow();
  });

  it("rejects positional params and duplicate parameter names", async () => {
    const positional = document();
    positional.methods[1].paramStructure = "by-position";
    await expect(generate(positional)).rejects.toThrow(/by-name/);
    const duplicate = document();
    duplicate.methods[1].params.push(duplicate.methods[1].params[0]);
    await expect(generate(duplicate)).rejects.toThrow(/duplicate parameter/i);
  });

  it("compares raw OpenRPC typings with the smallest title adaptation", () => {
    const raw = new OpenRPCTypings(document()).toString("typescript");
    expect(
      diagnostics(raw).some((message) => message.includes("Cannot find name")),
    ).toBe(true);

    const titled = document();
    for (const [index, method] of titled.methods.entries()) {
      method.result.schema.title = `Method${index}Output`;
      for (const [paramIndex, param] of method.params.entries()) {
        param.schema.title = `Method${index}Param${paramIndex}`;
      }
    }
    const adapted = new OpenRPCTypings(titled).toString("typescript");
    expect(diagnostics(adapted)).toEqual([]);
    // This compiles but violates our actual named-object and literal contracts.
    expect(
      diagnostics(
        adapted +
          `
      declare const reset: ConfigReset;
      reset(false);
      const wrong: Method1Output = { configured: false };
    `,
      ),
    ).toEqual([]);
    expect(
      diagnostics(
        adapted +
          `
      declare const save: ConfigSet;
      save({ prefix: "hi" });
    `,
      ).some((message) => message.includes("not assignable")),
    ).toBe(true);
  });

  it("rejects command names that collide after identifier normalization", async () => {
    const contract = document();
    const first = contract.methods[0];
    contract.methods.push({ ...first, name: "config-get" });
    await expect(generate(contract)).rejects.toThrow(
      /collision.*config.get.*config-get/i,
    );
  });
});
