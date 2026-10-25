import { ok } from "@forge-ahead/errors";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("../src/executor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/executor")>();
  return { ...actual, execute: vi.fn(actual.execute) };
});

import { dispatch } from "../src/commands";
import { createExecutor, execute } from "../src/executor";
import { handleHttp } from "../src/http";
import { logRecords } from "./logging";

afterEach(() => vi.mocked(execute).mockReset());

it("maps invalid output and exceptions after a write to sanitized HTTP failures, never success", async () => {
  for (const throws of [false, true]) {
    let saved: string | undefined;
    const store = {
      get: vi.fn(async () => saved),
      set: vi.fn(async (prefix: string) => {
        saved = prefix;
      }),
      reset: vi.fn(),
    };
    vi.mocked(execute).mockImplementation(
      createExecutor({
        "config.get": async () =>
          ok({ configured: saved !== undefined, prefix: saved ?? null }),
        "config.set": async (_params, { store }) => {
          await store.set("private-saved-prefix");
          if (throws) throw new Error("private-handler-exception");
          return ok({ configured: true, extra: "private-invalid-output" });
        },
        "config.reset": async () => ok({ configured: false }),
        "integration.preview": async () => ok({ output: "" }),
      }),
    );
    const start = logRecords().length;
    const response = await handleHttp(
      {
        method: "POST",
        headers: {
          Authorization: ["Bearer private-token"],
          "Content-Type": ["application/json"],
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "config.set",
          params: { prefix: "private-saved-prefix" },
          id: 1,
        }),
      },
      "private-token",
      store,
    );
    expect(response).toEqual({
      statusCode: 200,
      headers: { "Content-Type": ["application/json"] },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        error: { code: -32603, message: "Internal error" },
      }),
    });
    const records = logRecords().slice(start);
    expect(
      records.filter((record) => record["operation"] === "rpc.complete"),
    ).toEqual([
      expect.objectContaining({
        outcome: "failed",
        rpcCode: -32603,
        level: "error",
      }),
    ]);
    expect(
      records.some((record) =>
        String(record["msg"]).includes("a write may be uncertain"),
      ),
    ).toBe(true);
    expect(
      records.some((record) =>
        String(record["msg"]).includes("Save completed"),
      ),
    ).toBe(false);
    expect(JSON.stringify(records)).not.toContain("private-");
    expect(store.set).toHaveBeenCalledExactlyOnceWith("private-saved-prefix");
    expect(store.get).not.toHaveBeenCalled();
    expect(store.reset).not.toHaveBeenCalled();
    expect(
      await dispatch(
        { jsonrpc: "2.0", method: "config.get", params: {}, id: 2 },
        { source: "ui", authorized: true },
        store,
      ),
    ).toEqual({
      jsonrpc: "2.0",
      id: 2,
      result: { configured: true, prefix: "private-saved-prefix" },
    });
  }
});
