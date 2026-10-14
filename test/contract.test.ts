import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import Ajv from "ajv";
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
    ]);
    expect(
      contract.methods.every(
        ({ paramStructure }: { paramStructure: string }) =>
          paramStructure === "by-name",
      ),
    ).toBe(true);
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
