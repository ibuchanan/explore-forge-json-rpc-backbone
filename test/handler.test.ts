import { expect, it } from "vitest";
import { run } from "../src/index";

it("rejects web requests without trusted installation context, even with a legacy bearer secret", async () => {
  const previous = process.env["RPC_BEARER_SECRET"];
  process.env["RPC_BEARER_SECRET"] = "legacy-secret";
  try {
    for (const method of [
      "config.get",
      "config.set",
      "config.reset",
      "rpc.discover",
    ]) {
      const response = await run({
        method: "POST",
        headers: {
          "Content-Type": ["application/json"],
          Authorization: ["Bearer legacy-secret"],
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: {} }),
        path: "/",
        queryParameters: {},
      });
      expect(response.statusCode).toBe(503);
    }
  } finally {
    if (previous === undefined) delete process.env["RPC_BEARER_SECRET"];
    else process.env["RPC_BEARER_SECRET"] = previous;
  }
});
