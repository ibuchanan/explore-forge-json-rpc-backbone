import { compile } from "json-schema-to-typescript";

// This experiment is deliberately not imported by the app or its build.
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
        "// Generated experiment; not an application implementation.",
      $refOptions: { resolve: { file: false, http: false } },
      enableConstEnums: false,
      unknownAny: true,
    },
  );
  return `import type { Result } from "@forge-ahead/errors";\n${output}
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
