import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";
import { dispatch } from "../src/commands";

const contract = JSON.parse(
  readFileSync(
    new URL("../docs/reference/openrpc.json", import.meta.url),
    "utf8",
  ),
);

// The upstream meta-schema references an unbundled remote JSON Schema.
// Validate the OpenRPC structure here; validate result schemas separately below.
const require = createRequire(import.meta.url);
const schema = structuredClone(
  require("@open-rpc/meta-schema").openrpcDocument,
) as {
  $schema: string;
  definitions: {
    JSONSchema: unknown;
    referenceObject: { properties: { $ref: unknown } };
  };
};
schema.$schema = "http://json-schema.org/draft-07/schema#";
schema.definitions.JSONSchema = {};
schema.definitions.referenceObject.properties.$ref = { type: "string" };
const ajv = new Ajv({ strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);

const caller = { source: "api" as const, authorized: true };
const store = () => {
  let prefix: string | undefined;
  return {
    get: async () => prefix,
    set: async (value: string) => {
      prefix = value;
    },
  };
};

describe("OpenRPC contract", () => {
  it("has a valid OpenRPC shape, documented security and protocol errors", () => {
    expect(validate(contract), JSON.stringify(validate.errors)).toBe(true);
    expect(contract["x-security"]).toMatchObject({
      type: "http",
      scheme: "bearer",
    });
    expect(
      contract["x-protocolErrors"].map(({ code }: { code: number }) => code),
    ).toEqual([-32700, -32600, -32601, -32602, -32603, -32001]);
    expect(contract.methods.map(({ name }: { name: string }) => name)).toEqual([
      "config.get",
      "config.set",
      "integration.preview",
    ]);
    expect(
      contract.methods.every(
        ({ paramStructure }: { paramStructure: string }) =>
          paramStructure === "by-name",
      ),
    ).toBe(true);
  });

  it("validates URI syntax in OpenRPC metadata", () => {
    for (const [uri, valid] of [
      ["https://example.test/terms", true],
      ["urn:example:terms", true],
      ["not a URI", false],
      ["/relative/terms", false],
    ] as const) {
      const document = structuredClone(contract);
      document.info.termsOfService = uri;
      expect(validate(document), uri).toBe(valid);
      if (!valid) {
        expect(validate.errors).toContainEqual(
          expect.objectContaining({
            instancePath: "/info/termsOfService",
            keyword: "format",
            params: { format: "uri" },
          }),
        );
      }
    }
  });

  it("preview schemas and documented errors match runtime behavior", async () => {
    const preview = contract.methods.find(
      ({ name }: { name: string }) => name === "integration.preview",
    );
    expect(preview.params).toHaveLength(1);
    expect(preview.params[0]).toMatchObject({ name: "text", required: true });
    const validText = ajv.compile(preview.params[0].schema);
    for (const [text, valid] of [
      ["", true],
      ["😀".repeat(2000), true],
      ["😀".repeat(2001), false],
      ["a".repeat(2001), false],
      [null, false],
      [1, false],
    ] as const) {
      expect(validText(text)).toBe(valid);
    }
    const validResult = ajv.compile(preview.result.schema);
    expect(validResult({ output: "hi" })).toBe(true);
    expect(validResult({ output: 1 })).toBe(false);
    expect(validResult({})).toBe(false);
    expect(validResult({ output: "hi", extra: true })).toBe(false);

    const storage = store();
    for (const [params, authorized, errorName] of [
      [{ text: "hello" }, true, "NotConfigured"],
      [{}, true, "InvalidParams"],
      [{ text: "hello", prefix: "override" }, true, "InvalidParams"],
      [{ text: "😀".repeat(2001) }, true, "InvalidParams"],
      [{ text: "hello" }, false, "Forbidden"],
    ] as const) {
      expect(preview.errors).toContainEqual({
        $ref: `#/components/errors/${errorName}`,
      });
      expect(
        await dispatch(
          { jsonrpc: "2.0", method: preview.name, params, id: "preview" },
          { ...caller, authorized },
          storage,
        ),
      ).toEqual({
        jsonrpc: "2.0",
        id: "preview",
        error: contract.components.errors[errorName],
      });
    }
  });

  it("method parameter and result shapes agree with actual examples", async () => {
    const storage = store();
    for (const method of contract.methods) {
      const example = method.examples[0];
      const params = Object.fromEntries(
        example.params.map(
          ({ name, value }: { name: string; value: unknown }) => [name, value],
        ),
      );
      const result = await dispatch(
        { jsonrpc: "2.0", method: method.name, params, id: 1 },
        caller,
        storage,
      );
      expect(result).toEqual({
        jsonrpc: "2.0",
        id: 1,
        result: example.result.value,
      });
      expect(method.params.map(({ name }: { name: string }) => name)).toEqual(
        Object.keys(params),
      );
      const resultSchema = ajv.compile(method.result.schema);
      expect(
        resultSchema(example.result.value),
        JSON.stringify(resultSchema.errors),
      ).toBe(true);
    }
  });
});
