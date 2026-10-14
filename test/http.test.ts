import { describe, expect, it, vi } from "vitest";
import { handleHttp } from "../src/http";
import type { PrefixStore } from "../src/commands";

const request = (method: string, params: object = {}) => ({
  jsonrpc: "2.0",
  method,
  params,
  id: 1,
});
const memory = (): PrefixStore => {
  let prefix: string | undefined;
  return {
    get: async () => prefix,
    set: async (value) => {
      prefix = value;
    },
  };
};
const secret = "a-private-test-token-long-enough";
const makeEvent = (
  headers: Record<string, string[]> = {
    Authorization: [`Bearer ${secret}`],
    "Content-Type": ["application/json"],
  },
  body = JSON.stringify(request("config.get")),
) => ({ method: "POST", headers, body });
const body = (response: { body?: string }) =>
  JSON.parse(response.body ?? "null");

describe("public web trigger boundary", () => {
  it("reads saved configuration across distinct authenticated HTTP requests", async () => {
    const store = memory();
    const execute = (event: ReturnType<typeof makeEvent>) =>
      handleHttp(event, secret, store);
    expect(body(await execute(makeEvent()))).toEqual({
      jsonrpc: "2.0",
      id: 1,
      result: { configured: false, prefix: null },
    });
    expect(
      body(
        await execute(
          makeEvent(
            undefined,
            JSON.stringify(request("config.set", { prefix: "  hi " })),
          ),
        ),
      ),
    ).toEqual({ jsonrpc: "2.0", id: 1, result: { configured: true } });
    expect(body(await execute(makeEvent()))).toEqual({
      jsonrpc: "2.0",
      id: 1,
      result: { configured: true, prefix: "hi" },
    });
  });

  it("rejects missing, invalid, malformed, duplicated and unconfigured credentials without dispatch", async () => {
    const store = {
      get: vi.fn(async () => undefined),
      set: vi.fn(async () => {}),
    };
    for (const headers of [
      { "Content-Type": ["application/json"] },
      {
        "Content-Type": ["application/json"],
        Authorization: ["Bearer a-private-test-token-wrong"],
      },
      {
        "Content-Type": ["application/json"],
        Authorization: ["Basic a-private-test-token-long-enough"],
      },
      {
        "Content-Type": ["application/json"],
        Authorization: [`Bearer ${secret}`, `Bearer ${secret}`],
      },
      {
        "Content-Type": ["application/json"],
        Authorization: [`Bearer ${secret}`],
        authorization: [`Bearer ${secret}`],
      },
    ]) {
      const response = await handleHttp(makeEvent(headers), secret, store);
      expect(response.statusCode).toBe(401);
      expect(JSON.stringify(response)).not.toContain(secret);
    }
    expect((await handleHttp(makeEvent(), undefined, store)).statusCode).toBe(
      503,
    );
    expect(store.get).not.toHaveBeenCalled();
    expect(store.set).not.toHaveBeenCalled();
  });

  it("rejects wrong verb, media type, oversize and malformed JSON", async () => {
    const store = {
      get: vi.fn(async () => undefined),
      set: vi.fn(async () => {}),
    };
    expect(
      (await handleHttp({ ...makeEvent(), method: "GET" }, secret, store))
        .statusCode,
    ).toBe(405);
    expect(
      (
        await handleHttp(
          makeEvent({
            Authorization: [`Bearer ${secret}`],
            "Content-Type": ["text/plain"],
          }),
          secret,
          store,
        )
      ).statusCode,
    ).toBe(415);
    expect(
      (
        await handleHttp(
          makeEvent(undefined, "x".repeat(16_385)),
          secret,
          store,
        )
      ).statusCode,
    ).toBe(413);
    const malformed = await handleHttp(
      makeEvent(undefined, "{"),
      secret,
      store,
    );
    expect(malformed.statusCode).toBe(200);
    expect(body(malformed)).toEqual({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32700, message: "Parse error" },
    });
    expect(store.get).not.toHaveBeenCalled();
  });
});
