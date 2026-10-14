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

  it("persists trimmed Unicode prefixes across distinct calls and rejects invalid values", async () => {
    const store = memory();
    expect(
      await dispatch(
        request("config.set", { prefix: "  café 😀  " }),
        context,
        store,
      ),
    ).toEqual({
      jsonrpc: "2.0",
      id: 1,
      result: { configured: true },
    });
    expect(
      await dispatch(request("config.get", {}, "read"), context, store),
    ).toEqual({
      jsonrpc: "2.0",
      id: "read",
      result: { configured: true, prefix: "café 😀" },
    });
    expect(
      await dispatch(
        request("config.get"),
        { source: "ui", authorized: true },
        store,
      ),
    ).toEqual({
      jsonrpc: "2.0",
      id: 1,
      result: { configured: true, prefix: "café 😀" },
    });
    expect(
      await dispatch(
        request("config.set", { prefix: "😀".repeat(64) }),
        context,
        store,
      ),
    ).toHaveProperty("result.configured", true);
    for (const prefix of ["  ", "😀".repeat(65), 3]) {
      expect(
        await dispatch(request("config.set", { prefix }), context, store),
      ).toHaveProperty("error.code", -32602);
    }
    expect(
      await dispatch(request("config.get"), context, store),
    ).toHaveProperty("result.prefix", "😀".repeat(64));
  });

  it("rejects unsupported envelopes before executing commands and protects trusted context", async () => {
    const store = {
      get: vi.fn(async () => undefined),
      set: vi.fn(async () => {}),
    };
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
    for (const value of invalid) {
      expect(await dispatch(value, context, store)).toHaveProperty(
        "error.code",
        -32600,
      );
    }
    expect(store.get).not.toHaveBeenCalled();
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
