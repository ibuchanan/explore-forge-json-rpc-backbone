import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";
import {
  inputValidators,
  outputValidators,
} from "../src/generated/rpc/validators.js";
import { dispatch } from "./dispatch";

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
    reset: async () => {
      prefix = undefined;
    },
  };
};

describe("OpenRPC contract", () => {
  it("has a valid OpenRPC shape, documented security and protocol errors", () => {
    expect(validate(contract), JSON.stringify(validate.errors)).toBe(true);
    expect(contract["x-security"]).toMatchObject({
      type: "http",
      scheme: "basic",
    });
    expect(
      contract["x-protocolErrors"].map(({ code }: { code: number }) => code),
    ).toEqual([-32700, -32600, -32601, -32602, -32603, -32001]);
    const names = contract.methods.map(({ name }: { name: string }) => name);
    expect(names).toEqual([
      "config.get",
      "config.set",
      "integration.preview",
      "config.reset",
    ]);
    expect(Object.keys(inputValidators).sort()).toEqual([...names].sort());
    expect(Object.keys(outputValidators).sort()).toEqual([...names].sort());
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

  it("reset schemas and documented errors match runtime behavior", async () => {
    const reset = contract.methods.find(
      ({ name }: { name: string }) => name === "config.reset",
    );
    expect(reset.params).toHaveLength(1);
    expect(reset.params[0]).toMatchObject({
      name: "confirm",
      required: true,
      schema: { type: "boolean", enum: [true] },
    });
    const validResult = ajv.compile(reset.result.schema);
    expect(validResult({ configured: false })).toBe(true);
    expect(validResult({ configured: true })).toBe(false);
    expect(validResult({})).toBe(false);
    expect(validResult({ configured: false, extra: true })).toBe(false);

    const storage = store();
    await dispatch(
      { jsonrpc: "2.0", method: "config.set", params: { prefix: "hi" }, id: 1 },
      caller,
      storage,
    );
    // UI caller with authorization can reset
    expect(
      await dispatch(
        {
          jsonrpc: "2.0",
          method: "config.reset",
          params: { confirm: true },
          id: "reset",
        },
        { source: "ui", authorized: true },
        storage,
      ),
    ).toEqual({
      jsonrpc: "2.0",
      id: "reset",
      result: { configured: false },
    });
    // Idempotent: already unconfigured
    expect(
      await dispatch(
        {
          jsonrpc: "2.0",
          method: "config.reset",
          params: { confirm: true },
          id: "again",
        },
        { source: "ui", authorized: true },
        storage,
      ),
    ).toEqual({
      jsonrpc: "2.0",
      id: "again",
      result: { configured: false },
    });
    // API caller gets forbidden even if authorized
    expect(
      await dispatch(
        {
          jsonrpc: "2.0",
          method: "config.reset",
          params: { confirm: true },
          id: "api",
        },
        { source: "api", authorized: true },
        storage,
      ),
    ).toEqual({
      jsonrpc: "2.0",
      id: "api",
      error: contract.components.errors.Forbidden,
    });
    // Invalid params: missing confirm
    expect(
      await dispatch(
        { jsonrpc: "2.0", method: "config.reset", params: {}, id: "missing" },
        { source: "ui", authorized: true },
        storage,
      ),
    ).toEqual({
      jsonrpc: "2.0",
      id: "missing",
      error: contract.components.errors.InvalidParams,
    });
    // Invalid params: confirm not exactly true
    expect(
      await dispatch(
        {
          jsonrpc: "2.0",
          method: "config.reset",
          params: { confirm: false },
          id: "false",
        },
        { source: "ui", authorized: true },
        storage,
      ),
    ).toEqual({
      jsonrpc: "2.0",
      id: "false",
      error: contract.components.errors.InvalidParams,
    });
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
    for (const method of contract.methods) {
      const storage = store();
      const example = method.examples[0];
      const params = Object.fromEntries(
        example.params.map(
          ({ name, value }: { name: string; value: unknown }) => [name, value],
        ),
      );
      // Use UI caller for config.reset since it requires source === "ui"
      const methodCaller =
        method.name === "config.reset"
          ? { source: "ui" as const, authorized: true }
          : caller;
      // Prepare the saved value used by preview/reset examples.
      if (
        method.name === "integration.preview" ||
        method.name === "config.reset"
      ) {
        await dispatch(
          {
            jsonrpc: "2.0",
            method: "config.set",
            params: { prefix: "hi" },
            id: 0,
          },
          caller,
          storage,
        );
      }
      const result = await dispatch(
        { jsonrpc: "2.0", method: method.name, params, id: 1 },
        methodCaller,
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
