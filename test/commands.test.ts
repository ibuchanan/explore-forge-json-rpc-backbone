import fc from "fast-check";
import { JSONRPCErrorException } from "json-rpc-2.0";
import { describe, expect, it, vi } from "vitest";
import { dispatch, type PrefixStore } from "../src/commands";
import { logRecords } from "./logging";

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
    reset: async () => {
      prefix = undefined;
    },
  };
};

describe("shared JSON-RPC commands", () => {
  it("reports not configured when preview is requested before setup", async () => {
    expect(
      await dispatch(
        request("integration.preview", { text: "hello" }, "preview-unset"),
        context,
        memory(),
      ),
    ).toEqual({
      jsonrpc: "2.0",
      id: "preview-unset",
      error: { code: -32002, message: "Not configured" },
    });
  });

  it("previews exact text and Unicode boundaries without changing configuration", async () => {
    const store = memory();
    await dispatch(request("config.set", { prefix: "  hi  " }), context, store);
    for (const source of ["api", "ui"] as const) {
      for (const [text, output] of [
        ["", "hi"],
        [" there 😀\n", "hi there 😀\n"],
        ["e\u0301", "hie\u0301"],
        ["a".repeat(2000), `hi${"a".repeat(2000)}`],
        ["😀".repeat(2000), `hi${"😀".repeat(2000)}`],
      ]) {
        expect(
          await dispatch(
            request("integration.preview", { text }, "preview"),
            { source, authorized: true },
            store,
          ),
        ).toEqual({ jsonrpc: "2.0", id: "preview", result: { output } });
      }
    }
    expect(
      await dispatch(request("config.get"), context, store),
    ).toHaveProperty("result.prefix", "hi");
  });

  it("rejects invalid preview params before reading configuration", async () => {
    const store = {
      get: vi.fn(async () => undefined),
      set: vi.fn(async () => {}),
      reset: vi.fn(async () => {}),
    };
    for (const params of [
      {},
      { text: null },
      { text: 7 },
      { text: false },
      { text: [] },
      { text: {} },
      { text: "hello", prefix: "client override" },
      { text: "hello", caller: { authorized: true } },
      { text: "a".repeat(2001) },
      { text: "😀".repeat(2001) },
    ]) {
      expect(
        await dispatch(request("integration.preview", params), context, store),
      ).toEqual({
        jsonrpc: "2.0",
        id: 1,
        error: { code: -32602, message: "Invalid params" },
      });
    }
    expect(store.get).not.toHaveBeenCalled();
    expect(store.set).not.toHaveBeenCalled();
  });

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
      [request("integration.preview", { text: "hello" })],
      {
        jsonrpc: "2.0",
        method: "integration.preview",
        params: { text: "hello" },
      },
      { ...request("integration.preview", { text: "hello" }), id: null },
      { ...request("integration.preview"), params: ["hello"] },
      { ...request("integration.preview", { text: "hello" }), caller: context },
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
          reset: vi.fn(async () => {}),
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
      reset: vi.fn(async () => {}),
    };
    expect(
      await dispatch(
        request("config.get"),
        { source: "api", authorized: false },
        store,
      ),
    ).toHaveProperty("error.code", -32001);
    for (const source of ["api", "ui"] as const) {
      expect(
        await dispatch(
          request("integration.preview", { text: "hello" }),
          { source, authorized: false },
          store,
        ),
      ).toEqual({
        jsonrpc: "2.0",
        id: 1,
        error: { code: -32001, message: "Forbidden" },
      });
    }
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

  it("preserves rejection precedence before any storage effects", async () => {
    const store = {
      get: vi.fn(async () => undefined),
      set: vi.fn(async () => {}),
      reset: vi.fn(async () => {}),
    };
    const denied = { source: "api" as const, authorized: false };
    for (const [payload, caller, id, code, message] of [
      ["{", denied, null, -32700, "Parse error"],
      [
        { ...request("unknown"), caller: { source: "ui", authorized: true } },
        denied,
        1,
        -32600,
        "Invalid Request",
      ],
      [request("unknown"), denied, 1, -32001, "Forbidden"],
      [request("config.set", { prefix: 7 }), denied, 1, -32001, "Forbidden"],
      [
        request("unknown", { caller: "admin" }),
        context,
        1,
        -32601,
        "Method not found",
      ],
      [request("config.reset", {}), context, 1, -32602, "Invalid params"],
      [
        request("config.reset", { confirm: true }),
        context,
        1,
        -32001,
        "Forbidden",
      ],
      [
        request("integration.preview", {}),
        context,
        1,
        -32602,
        "Invalid params",
      ],
    ] as const) {
      expect(await dispatch(payload, caller, store)).toEqual({
        jsonrpc: "2.0",
        id,
        error: { code, message },
      });
    }
    expect(store.get).not.toHaveBeenCalled();
    expect(store.set).not.toHaveBeenCalled();
    expect(store.reset).not.toHaveBeenCalled();
  });

  it("does not translate store-thrown RPC exceptions into trusted command failures or retry reads", async () => {
    const store = {
      get: vi.fn(async (): Promise<string | undefined> => {
        throw new JSONRPCErrorException("private-store-error", -32002, {
          secret: "private-data",
        });
      }),
      set: vi.fn(),
      reset: vi.fn(),
    };
    for (const payload of [
      request("config.get"),
      request("integration.preview", { text: "private-text" }),
    ]) {
      expect(await dispatch(payload, context, store)).toEqual({
        jsonrpc: "2.0",
        id: 1,
        error: { code: -32603, message: "Internal error" },
      });
    }
    expect(store.get).toHaveBeenCalledTimes(2);
    expect(store.set).not.toHaveBeenCalled();
    expect(store.reset).not.toHaveBeenCalled();
  });

  it("sanitizes mutation exceptions after persistence without retry, rollback, or implicit read-back", async () => {
    for (const thrown of [
      new Error("private-store-error"),
      new JSONRPCErrorException("private-store-error", -32001, {
        secret: "private-data",
      }),
      new JSONRPCErrorException("private-store-error", -32602),
      new JSONRPCErrorException("private-store-error", -32002),
    ]) {
      for (const [method, params, expected] of [
        ["config.set", { prefix: "  private-new  " }, "private-new"],
        ["config.reset", { confirm: true }, null],
      ] as const) {
        let saved: string | undefined = "private-original";
        const store = {
          get: vi.fn(async () => saved),
          set: vi.fn(async (value: string) => {
            saved = value;
            throw thrown;
          }),
          reset: vi.fn(async () => {
            saved = undefined;
            throw thrown;
          }),
        };
        const caller = { source: "ui" as const, authorized: true };
        const start = logRecords().length;
        expect(await dispatch(request(method, params), caller, store)).toEqual({
          jsonrpc: "2.0",
          id: 1,
          error: { code: -32603, message: "Internal error" },
        });
        const records = logRecords().slice(start);
        expect(JSON.stringify(records)).not.toContain("private-");
        expect(
          records
            .filter((record) => record["operation"] === "rpc.complete")
            .at(-1),
        ).toMatchObject({
          outcome: "failed",
          rpcCode: -32603,
          level: "error",
        });
        expect(
          records.some((record) =>
            String(record["msg"]).includes("a write may be uncertain"),
          ),
        ).toBe(true);
        expect(store.get).not.toHaveBeenCalled();
        expect(store.set).toHaveBeenCalledTimes(
          method === "config.set" ? 1 : 0,
        );
        expect(store.reset).toHaveBeenCalledTimes(
          method === "config.reset" ? 1 : 0,
        );
        expect(await dispatch(request("config.get"), caller, store)).toEqual({
          jsonrpc: "2.0",
          id: 1,
          result: { configured: expected !== null, prefix: expected },
        });
      }
    }
  });

  it("sanitizes unexpected storage failures without logging exception details", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const store = {
      get: async (): Promise<string | undefined> => {
        throw new Error("sensitive details");
      },
      set: vi.fn(),
      reset: vi.fn(),
    };
    try {
      for (const payload of [
        request("config.get"),
        request("integration.preview", { text: "hello" }),
      ]) {
        const response = await dispatch(payload, context, store);
        expect(response).toEqual({
          jsonrpc: "2.0",
          id: 1,
          error: { code: -32603, message: "Internal error" },
        });
        expect(JSON.stringify(response)).not.toContain("sensitive details");
      }
      expect(warning).not.toHaveBeenCalled();
    } finally {
      warning.mockRestore();
    }
  });

  it("resets configuration only from UI callers with explicit confirm", async () => {
    const store = memory();
    // Set initial configuration
    expect(
      await dispatch(
        request("config.set", { prefix: "  test  " }),
        context,
        store,
      ),
    ).toHaveProperty("result.configured", true);
    expect(
      await dispatch(request("config.get"), context, store),
    ).toHaveProperty("result.prefix", "test");

    // UI caller with authorization can reset
    expect(
      await dispatch(
        request("config.reset", { confirm: true }, "reset-ui"),
        { source: "ui", authorized: true },
        store,
      ),
    ).toEqual({
      jsonrpc: "2.0",
      id: "reset-ui",
      result: { configured: false },
    });
    // Verify configuration cleared
    expect(await dispatch(request("config.get"), context, store)).toEqual({
      jsonrpc: "2.0",
      id: 1,
      result: { configured: false, prefix: null },
    });

    // Reset is idempotent when already unconfigured
    expect(
      await dispatch(
        request("config.reset", { confirm: true }, "reset-again"),
        { source: "ui", authorized: true },
        store,
      ),
    ).toEqual({
      jsonrpc: "2.0",
      id: "reset-again",
      result: { configured: false },
    });
  });

  it("rejects reset from API callers even when authorized", async () => {
    const store = memory();
    await dispatch(
      request("config.set", { prefix: "api-test" }),
      context,
      store,
    );
    expect(
      await dispatch(
        request("config.reset", { confirm: true }, "api-reset"),
        { source: "api", authorized: true },
        store,
      ),
    ).toEqual({
      jsonrpc: "2.0",
      id: "api-reset",
      error: { code: -32001, message: "Forbidden" },
    });
    // Verify configuration unchanged
    expect(
      await dispatch(request("config.get"), context, store),
    ).toHaveProperty("result.prefix", "api-test");
  });

  it("rejects reset with invalid confirm parameter variations", async () => {
    const store = memory();
    await store.set("keep");
    const reset = vi.spyOn(store, "reset");
    for (const params of [
      {},
      { confirm: false },
      { confirm: 1 },
      { confirm: "true" },
      { confirm: null },
      { confirm: [] },
      { confirm: {} },
      { confirm: true, extra: "field" },
    ]) {
      expect(
        await dispatch(
          request("config.reset", params),
          { source: "ui", authorized: true },
          store,
        ),
      ).toEqual({
        jsonrpc: "2.0",
        id: 1,
        error: { code: -32602, message: "Invalid params" },
      });
    }
    expect(reset).not.toHaveBeenCalled();
    expect(await store.get()).toBe("keep");
  });

  it("sanitizes storage delete failures in reset without logging details", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const store = {
      get: async () => "test",
      set: vi.fn(),
      reset: async () => {
        throw new Error("sensitive delete error");
      },
    };
    try {
      const response = await dispatch(
        request("config.reset", { confirm: true }),
        { source: "ui", authorized: true },
        store,
      );
      expect(response).toEqual({
        jsonrpc: "2.0",
        id: 1,
        error: { code: -32603, message: "Internal error" },
      });
      expect(JSON.stringify(response)).not.toContain("sensitive delete error");
      expect(warning).not.toHaveBeenCalled();
    } finally {
      warning.mockRestore();
    }
  });

  it("allows save/reset/reconfigure cycle", async () => {
    const store = memory();
    const uiCaller = { source: "ui" as const, authorized: true };

    // Set prefix
    expect(
      await dispatch(
        request("config.set", { prefix: "first" }),
        context,
        store,
      ),
    ).toHaveProperty("result.configured", true);

    // Reset
    expect(
      await dispatch(
        request("config.reset", { confirm: true }, "reset1"),
        uiCaller,
        store,
      ),
    ).toEqual({
      jsonrpc: "2.0",
      id: "reset1",
      result: { configured: false },
    });

    // Preview fails when unconfigured
    expect(
      await dispatch(
        request("integration.preview", { text: "test" }, "preview1"),
        context,
        store,
      ),
    ).toHaveProperty("error.code", -32002);

    // Reconfigure
    expect(
      await dispatch(
        request("config.set", { prefix: "second" }),
        context,
        store,
      ),
    ).toHaveProperty("result.configured", true);

    // Preview works again
    expect(
      await dispatch(
        request("integration.preview", { text: "text" }, "preview2"),
        context,
        store,
      ),
    ).toEqual({
      jsonrpc: "2.0",
      id: "preview2",
      result: { output: "secondtext" },
    });

    // Reset again
    expect(
      await dispatch(
        request("config.reset", { confirm: true }, "reset2"),
        uiCaller,
        store,
      ),
    ).toHaveProperty("result.configured", false);
  });
});
