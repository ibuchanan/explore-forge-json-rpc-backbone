import { expect, it, vi } from "vitest";

const data = new Map<string, string>();
vi.mock("@forge/kvs", () => ({
  kvs: {
    get: vi.fn(async (key: string) => data.get(key)),
    set: vi.fn(async (key: string, value: string) => {
      data.set(key, value);
    }),
    delete: vi.fn(async (key: string) => {
      data.delete(key);
    }),
  },
}));

import { run } from "../src/index";

const event = (method: string, params: object) => ({
  method: "POST" as const,
  path: "/",
  queryParameters: {},
  headers: {
    Authorization: ["Bearer integration-test-key"],
    "Content-Type": ["application/json"],
  },
  body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 4 }),
});

it("uses KVS across separate Forge handler invocations", async () => {
  const previous = process.env["RPC_BEARER_SECRET"];
  process.env["RPC_BEARER_SECRET"] = "integration-test-key";
  try {
    expect(
      JSON.parse((await run(event("config.get", {}))).body ?? ""),
    ).toHaveProperty("result.configured", false);
    expect(
      JSON.parse(
        (await run(event("config.set", { prefix: "  test  " }))).body ?? "",
      ),
    ).toHaveProperty("result.configured", true);
    expect(
      JSON.parse((await run(event("config.get", {}))).body ?? ""),
    ).toHaveProperty("result.prefix", "test");
    expect(
      JSON.parse(
        (await run(event("integration.preview", { text: " hello 😀" }))).body ??
          "",
      ),
    ).toEqual({ jsonrpc: "2.0", id: 4, result: { output: "test hello 😀" } });
    await run(event("config.set", { prefix: "next" }));
    expect(
      JSON.parse(
        (await run(event("integration.preview", { text: "" }))).body ?? "",
      ),
    ).toHaveProperty("result.output", "next");
    expect([...data.entries()]).toEqual([["config.prefix", "next"]]);
  } finally {
    if (previous === undefined) delete process.env["RPC_BEARER_SECRET"];
    else process.env["RPC_BEARER_SECRET"] = previous;
    data.clear();
  }
});

it("forbids reset through the HTTP handler even with a valid bearer token", async () => {
  const previous = process.env["RPC_BEARER_SECRET"];
  process.env["RPC_BEARER_SECRET"] = "integration-test-key";
  try {
    // Set configuration first
    await run(event("config.set", { prefix: "to-delete" }));
    expect([...data.entries()]).toEqual([["config.prefix", "to-delete"]]);

    // Try reset via API (should fail with Forbidden, which returns -32001)
    const apiReset = JSON.parse(
      (await run(event("config.reset", { confirm: true }))).body ?? "",
    );
    expect(apiReset).toEqual({
      jsonrpc: "2.0",
      id: 4,
      error: { code: -32001, message: "Forbidden" },
    });
    // Configuration should still be there
    expect([...data.entries()]).toEqual([["config.prefix", "to-delete"]]);
  } finally {
    if (previous === undefined) delete process.env["RPC_BEARER_SECRET"];
    else process.env["RPC_BEARER_SECRET"] = previous;
    data.clear();
  }
});
