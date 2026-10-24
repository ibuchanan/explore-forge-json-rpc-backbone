import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { dispatch, type PrefixStore } from "../src/commands";

const request = (
  method: string,
  params: unknown = {},
  id: string | number = 1,
) => ({
  jsonrpc: "2.0",
  method,
  params,
  id,
});
const context = { source: "api" as const, authorized: true };
const validPrefix = fc
  .string({ unit: "binary", minLength: 1, maxLength: 64 })
  .filter((prefix) => prefix.trim().length > 0);
const invalidPrefix = fc.oneof(
  fc.string({
    unit: fc.constantFrom(" ", "\t", "\n", "\r", "\u00a0", "\u3000", "\ufeff"),
  }),
  fc
    .string({ unit: "binary", minLength: 65, maxLength: 128 })
    .filter((prefix) => [...prefix.trim()].length > 64),
  fc.jsonValue().filter((value) => typeof value !== "string"),
);
const memory = (): PrefixStore => {
  let prefix: string | undefined;
  return {
    get: async () => prefix,
    set: async (value) => {
      prefix = value;
    },
  };
};

describe("shared JSON-RPC commands", () => {
  it("returns unconfigured state before setup", async () => {
    expect(await dispatch(request("config.get"), context, memory())).toEqual({
      jsonrpc: "2.0",
      id: 1,
      result: { configured: false, prefix: null },
    });
  });

  it("round-trips trimmed Unicode prefixes and request IDs through both caller sources", async () => {
    await fc.assert(
      fc.asyncProperty(
        validPrefix,
        fc.oneof(
          fc.string(),
          fc.double({ noNaN: true, noDefaultInfinity: true }),
        ),
        async (prefix, id) => {
          const store = memory();
          expect(
            await dispatch(
              request("config.set", { prefix: ` \t${prefix}\n ` }, id),
              context,
              store,
            ),
          ).toEqual({ jsonrpc: "2.0", id, result: { configured: true } });
          for (const source of ["api", "ui"] as const) {
            expect(
              await dispatch(
                request("config.get", {}, id),
                { source, authorized: true },
                store,
              ),
            ).toEqual({
              jsonrpc: "2.0",
              id,
              result: { configured: true, prefix: prefix.trim() },
            });
          }
        },
      ),
      {
        examples: [
          ["café 😀", "read"],
          ["😀".repeat(64), 0],
        ],
      },
    );
  });

  it("rejects invalid prefix values without changing saved configuration", async () => {
    await fc.assert(
      fc.asyncProperty(invalidPrefix, async (prefix) => {
        const store = memory();
        await store.set("saved");
        expect(
          await dispatch(request("config.set", { prefix }), context, store),
        ).toHaveProperty("error.code", -32602);
        expect(
          await dispatch(request("config.get"), context, store),
        ).toHaveProperty("result.prefix", "saved");
      }),
      { examples: [[""], ["  "], ["😀".repeat(65)], [3]] },
    );
  });

  it("keeps the last successful write across generated command sequences", async () => {
    const operation = fc.oneof(
      fc.constant({ kind: "get" } as const),
      validPrefix.map((prefix) => ({ kind: "set" as const, prefix })),
      invalidPrefix.map((prefix) => ({ kind: "invalid" as const, prefix })),
      validPrefix.map((prefix) => ({ kind: "forbidden" as const, prefix })),
    );
    const step = fc.record({
      operation,
      source: fc.constantFrom("api" as const, "ui" as const),
      serialized: fc.boolean(),
    });
    await fc.assert(
      fc.asyncProperty(
        fc.array(step, { minLength: 1, maxLength: 30 }),
        async (steps) => {
          const store = memory();
          let expectedPrefix: string | undefined;
          for (const [
            index,
            { operation, source, serialized },
          ] of steps.entries()) {
            const id = index + 1;
            const payload =
              operation.kind === "get"
                ? request("config.get", {}, id)
                : request("config.set", { prefix: operation.prefix }, id);
            const response = await dispatch(
              serialized ? JSON.stringify(payload) : payload,
              { source, authorized: operation.kind !== "forbidden" },
              store,
            );
            if (
              operation.kind === "forbidden" ||
              operation.kind === "invalid"
            ) {
              expect(response).toEqual({
                jsonrpc: "2.0",
                id,
                error:
                  operation.kind === "forbidden"
                    ? { code: -32001, message: "Forbidden" }
                    : { code: -32602, message: "Invalid params" },
              });
            } else if (operation.kind === "set") {
              expect(response).toEqual({
                jsonrpc: "2.0",
                id,
                result: { configured: true },
              });
              expectedPrefix = operation.prefix.trim();
            } else {
              expect(response).toEqual({
                jsonrpc: "2.0",
                id,
                result: {
                  configured: expectedPrefix !== undefined,
                  prefix: expectedPrefix ?? null,
                },
              });
            }
            for (const source of ["api", "ui"] as const) {
              expect(
                await dispatch(
                  request("config.get", {}, id),
                  { source, authorized: true },
                  store,
                ),
              ).toEqual({
                jsonrpc: "2.0",
                id,
                result: {
                  configured: expectedPrefix !== undefined,
                  prefix: expectedPrefix ?? null,
                },
              });
            }
          }
        },
      ),
      {
        examples: [
          [
            [
              { operation: { kind: "get" }, source: "api", serialized: false },
              {
                operation: { kind: "invalid", prefix: "" },
                source: "ui",
                serialized: true,
              },
              {
                operation: { kind: "set", prefix: "  first 😀  " },
                source: "api",
                serialized: true,
              },
              {
                operation: { kind: "invalid", prefix: "😀".repeat(65) },
                source: "ui",
                serialized: false,
              },
              {
                operation: { kind: "forbidden", prefix: "not saved" },
                source: "api",
                serialized: true,
              },
              {
                operation: { kind: "set", prefix: "  second  " },
                source: "ui",
                serialized: false,
              },
              { operation: { kind: "get" }, source: "api", serialized: true },
            ],
          ],
        ],
      },
    );
  });

  it("rejects unsupported envelopes before executing commands", async () => {
    const invalid = [
      [],
      [request("config.set", { prefix: "bad" })],
      null,
      {},
      { ...request("config.get"), id: null },
      { jsonrpc: "2.0", method: "config.get", params: {} },
      { ...request("config.get"), params: [] },
      { ...request("config.get"), id: Infinity },
      { ...request("config.get"), actor: "admin" },
      { ...request("config.get"), jsonrpc: "1.0" },
    ];
    const envelope = request("config.set", { prefix: "must not be saved" });
    const invalidEnvelope: fc.Arbitrary<unknown> = fc.oneof(
      fc.jsonValue().map((value) => [value]),
      fc
        .constantFrom("jsonrpc", "method", "params", "id")
        .map((missing) =>
          Object.fromEntries(
            Object.entries(envelope).filter(([key]) => key !== missing),
          ),
        ),
      fc
        .string()
        .filter((version) => version !== "2.0")
        .map((jsonrpc) => ({ ...envelope, jsonrpc })),
      fc
        .jsonValue()
        .filter((method) => typeof method !== "string" || !method)
        .map((method) => ({ ...envelope, method })),
      fc
        .jsonValue()
        .filter((id) => typeof id !== "string" && typeof id !== "number")
        .map((id) => ({ ...envelope, id })),
      fc
        .jsonValue()
        .filter(
          (params) =>
            params === null ||
            typeof params !== "object" ||
            Array.isArray(params),
        )
        .map((params) => ({ ...envelope, params })),
      fc
        .tuple(
          fc.string().filter((key) => !Object.hasOwn(envelope, key)),
          fc.jsonValue(),
        )
        .map(([key, value]) => ({ ...envelope, [key]: value })),
    );
    await fc.assert(
      fc.asyncProperty(invalidEnvelope, async (value) => {
        const storage = {
          get: vi.fn(async () => undefined),
          set: vi.fn(async () => {}),
        };
        expect(await dispatch(value, context, storage)).toHaveProperty(
          "error.code",
          -32600,
        );
        expect(
          await dispatch(JSON.stringify(value), context, storage),
        ).toHaveProperty("error.code", -32600);
        expect(storage.get).not.toHaveBeenCalled();
        expect(storage.set).not.toHaveBeenCalled();
      }),
      { examples: invalid.map((value): [unknown] => [value]) },
    );
  });

  it("protects trusted context and reports protocol and parameter errors", async () => {
    const store = {
      get: vi.fn(async () => undefined),
      set: vi.fn(async () => {}),
    };
    expect(
      await dispatch(
        request("config.get"),
        { source: "api", authorized: false },
        store,
      ),
    ).toHaveProperty("error.code", -32001);
    expect(store.get).not.toHaveBeenCalled();
    expect(await dispatch(request("unknown"), context, store)).toHaveProperty(
      "error.code",
      -32601,
    );
    expect(
      await dispatch(request("config.get", { other: true }), context, store),
    ).toHaveProperty("error.code", -32602);
    expect(
      await dispatch(
        request("config.set", { prefix: "yes", actor: "admin" }),
        context,
        store,
      ),
    ).toHaveProperty("error.code", -32602);
    expect(store.set).not.toHaveBeenCalled();
    expect(await dispatch("{", context, store)).toEqual({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32700, message: "Parse error" },
    });
  });

  it("sanitizes unexpected storage failures without logging exception details", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const store = {
      get: async (): Promise<string | undefined> => {
        throw new Error("sensitive details");
      },
      set: vi.fn(),
    };
    try {
      const response = await dispatch(request("config.get"), context, store);
      expect(response).toEqual({
        jsonrpc: "2.0",
        id: 1,
        error: { code: -32603, message: "Internal error" },
      });
      expect(JSON.stringify(response)).not.toContain("sensitive details");
      expect(warning).not.toHaveBeenCalled();
    } finally {
      warning.mockRestore();
    }
  });
});
