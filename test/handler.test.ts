import { expect, it, vi } from "vitest";

const data = new Map<string, string>();
vi.mock("@forge/kvs", () => ({
  kvs: {
    get: vi.fn(async (key: string) => data.get(key)),
    set: vi.fn(async (key: string, value: string) => {
      data.set(key, value);
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
    expect([...data.values()]).toEqual(["test"]);
  } finally {
    if (previous === undefined) delete process.env["RPC_BEARER_SECRET"];
    else process.env["RPC_BEARER_SECRET"] = previous;
    data.clear();
  }
});
