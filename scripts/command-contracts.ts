import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildSync } from "esbuild";
import Ajv, { type AnySchema } from "ajv";
import standaloneCode from "ajv/dist/standalone/index.js";
import { compile } from "json-schema-to-typescript";

// Build-time only: the app imports the generated contract, never this compiler.
type Schema = Parameters<typeof compile>[0];
type Descriptor = { name: string; required?: boolean; schema: Schema };
export type Document = {
  methods: {
    name: string;
    paramStructure: string;
    params: Descriptor[];
    result: Descriptor;
  }[];
  components?: { schemas?: Record<string, Schema> };
};

const schemaKeywords = new Set([
  "$ref",
  "title",
  "description",
  "type",
  "properties",
  "required",
  "additionalProperties",
  "enum",
  "const",
  "minLength",
  "maxLength",
]);

function checkSchema(schema: Schema): void {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    throw new Error("Unsupported non-object schema");
  }
  for (const keyword of Object.keys(schema)) {
    if (!schemaKeywords.has(keyword)) {
      throw new Error(`Unsupported schema keyword: ${keyword}`);
    }
  }
  if (schema.$ref && !/^#\/components\/schemas\/[^/]+$/.test(schema.$ref)) {
    throw new Error("Only local #/components/schemas references are supported");
  }
  if (schema.type) {
    for (const type of [schema.type].flat()) {
      if (!["object", "string", "boolean", "null"].includes(type)) {
        throw new Error(`Unsupported schema type: ${type}`);
      }
    }
  }
  if (typeof schema.additionalProperties === "object") {
    throw new Error("Schema-valued additionalProperties is unsupported");
  }
  for (const property of Object.values(schema.properties ?? {}))
    checkSchema(property);
}

export function generateValidators(document: Document): string {
  const ajv = new Ajv({
    strict: true,
    allowUnionTypes: true,
    ownProperties: true,
    messages: false,
    logger: false,
    code: { source: true, esm: true },
  });
  ajv.addKeyword("components");
  // Ask Ajv for a boolean verdict, without generating unused error details.
  ajv.addKeyword({
    keyword: "outputContract",
    schemaType: "object",
    code(context) {
      const valid = context.gen.name("valid");
      context.subschema(
        { keyword: "outputContract", createErrors: false },
        valid,
      );
      context.gen.return(valid);
    },
  });
  const exports = Object.fromEntries(
    document.methods.map((method, index) => {
      const id = `command-output:${index}`;
      ajv.addSchema(
        {
          outputContract: method.result.schema,
          components: { schemas: document.components?.schemas ?? {} },
        } as AnySchema,
        id,
      );
      return [`output${index}`, id];
    }),
  );
  const source = `${standaloneCode(ajv, exports)}
const outputValidators = {
${document.methods.map((method, index) => `${JSON.stringify(method.name)}: output${index}`).join(",\n")}
};
export const validOutput = (method, value) => outputValidators[method](value);`;
  // Bundle Ajv's small runtime helpers too, so no compiler or dev dependency is
  // needed in Forge. Keep generated implementation out of handwritten TS checks.
  const directory = mkdtempSync(resolve("tmp_rovo_validators_"));
  try {
    const input = resolve(directory, "validators.js");
    writeFileSync(input, source);
    return `// Generated from docs/reference/openrpc.json by Ajv; do not edit.\n// Regenerate: npm run generate:commands\n${
      buildSync({
        entryPoints: [input],
        bundle: true,
        format: "esm",
        minify: true,
        platform: "browser",
        write: false,
      }).outputFiles[0]?.text ?? ""
    }`;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

export async function generate(document: Document): Promise<string> {
  for (const schema of Object.values(document.components?.schemas ?? {}))
    checkSchema(schema);
  const names = new Map<string, string>();
  for (const method of document.methods) {
    if (method.paramStructure !== "by-name") {
      throw new Error("Only by-name parameters are supported");
    }
    for (const param of method.params) checkSchema(param.schema);
    checkSchema(method.result.schema);
    const parameterNames = method.params.map((param) => param.name);
    if (new Set(parameterNames).size !== parameterNames.length) {
      throw new Error(`Duplicate parameter in ${method.name}`);
    }
    const identifier = method.name.replace(/[^a-z0-9]/gi, "").toLowerCase();
    const previous = names.get(identifier);
    if (previous !== undefined) {
      throw new Error(
        `Command naming collision: ${previous} and ${method.name}`,
      );
    }
    names.set(identifier, method.name);
  }
  const properties = Object.fromEntries(
    document.methods.map((method): [string, Schema] => [
      method.name,
      {
        type: "object",
        additionalProperties: false,
        required: ["params", "result"],
        properties: {
          params: method.params.length
            ? {
                type: "object",
                additionalProperties: false,
                properties: Object.fromEntries(
                  method.params.map((param) => [param.name, param.schema]),
                ),
                required: method.params
                  .filter((param) => param.required === true)
                  .map((param) => param.name),
              }
            : { tsType: "Record<string, never>" },
          result: method.result.schema,
        },
      },
    ]),
  );
  const output = await compile(
    {
      type: "object",
      additionalProperties: false,
      properties,
      required: document.methods.map((method) => method.name),
      components: { schemas: document.components?.schemas ?? {} },
    },
    "Commands",
    {
      bannerComment:
        "// Generated from docs/reference/openrpc.json; do not edit.\n// Regenerate: npm run generate:commands",
      $refOptions: { resolve: { file: false, http: false } },
      enableConstEnums: false,
      unknownAny: true,
    },
  );
  return `import type { Result } from "@forge-ahead/errors";\n${output}
export const commandNames = ${JSON.stringify(document.methods.map((method) => method.name))} as const;
export type CommandName = keyof Commands;
export type HandlerMap<Context, Failure> = {
  [M in CommandName]: (
    params: Commands[M]["params"],
    context: Context,
  ) => Promise<Result<Commands[M]["result"], Failure>>;
};
export type TypedCaller = <M extends CommandName>(
  method: M,
  params: Commands[M]["params"],
) => Promise<Commands[M]["result"]>;
`;
}
