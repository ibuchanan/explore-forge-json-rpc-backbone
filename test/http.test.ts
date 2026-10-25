import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import type { PrefixStore } from "../src/commands";
import { handleHttp } from "../src/http";
import { logRecords } from "./logging";

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
    reset: async () => {
      prefix = undefined;
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

  it("previews the current saved prefix across separate HTTP requests", async () => {
    const store = memory();
    const execute = async (method: string, params: object) => {
      const response = await handleHttp(
        makeEvent(undefined, JSON.stringify(request(method, params))),
        secret,
        store,
      );
      expect(response.statusCode).toBe(200);
      return body(response);
    };
    expect(await execute("integration.preview", { text: "hello" })).toEqual({
      jsonrpc: "2.0",
      id: 1,
      error: { code: -32002, message: "Not configured" },
    });
    expect(await execute("config.set", { prefix: "  hi  " })).toHaveProperty(
      "result.configured",
      true,
    );
    for (const [text, output] of [
      [" there 😀", "hi there 😀"],
      ["", "hi"],
      [" \n", "hi \n"],
      ["😀".repeat(2000), `hi${"😀".repeat(2000)}`],
    ]) {
      expect(await execute("integration.preview", { text })).toEqual({
        jsonrpc: "2.0",
        id: 1,
        result: { output },
      });
    }
    for (const params of [
      {},
      { text: 1 },
      { text: "hello", prefix: "override" },
      { text: "😀".repeat(2001) },
    ]) {
      expect(await execute("integration.preview", params)).toHaveProperty(
        "error.code",
        -32602,
      );
    }
    expect(await execute("config.get", {})).toHaveProperty(
      "result.prefix",
      "hi",
    );
    await execute("config.set", { prefix: "bye" });
    expect(
      await execute("integration.preview", { text: " there" }),
    ).toHaveProperty("result.output", "bye there");
    expect(
      body(
        await handleHttp(
          makeEvent(
            undefined,
            JSON.stringify(request("integration.preview", { text: "hello" })),
          ),
          secret,
          memory(),
        ),
      ),
    ).toHaveProperty("error.code", -32002);
  });

  it("accepts case-insensitive header names and JSON media types", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.mixedCase(fc.constant("authorization")),
        fc.mixedCase(fc.constant("content-type")),
        fc.mixedCase(
          fc.constantFrom(
            "application/json",
            "application/json; charset=utf-8",
          ),
        ),
        async (authorization, contentType, media) => {
          const response = await handleHttp(
            makeEvent({
              [authorization]: [`Bearer ${secret}`],
              [contentType]: [media],
            }),
            secret,
            memory(),
          );
          expect(response.statusCode).toBe(200);
          expect(body(response)).toHaveProperty("result.configured", false);
        },
      ),
    );
  });

  it("rejects missing, invalid, malformed and duplicated credentials without dispatch", async () => {
    const invalidAuthorization: fc.Arbitrary<Record<string, string[]>> =
      fc.oneof(
        fc.constant({}),
        fc
          .stringMatching(/^[A-Za-z0-9._~+/-]{1,128}={0,2}$/)
          .filter((token) => token !== secret)
          .map((token) => ({ Authorization: [`Bearer ${token}`] })),
        fc
          .constantFrom(
            `Basic ${secret}`,
            `Bearer ${secret} `,
            `Bearer ${secret}\n`,
            "Bearer ",
          )
          .map((value) => ({ Authorization: [value] })),
        fc
          .array(fc.constant(`Bearer ${secret}`), {
            minLength: 2,
            maxLength: 4,
          })
          .map((Authorization) => ({ Authorization })),
        fc
          .mixedCase(fc.constant("authorization"))
          .filter((name) => name !== "Authorization")
          .map((name) => ({
            Authorization: [`Bearer ${secret}`],
            [name]: [`Bearer ${secret}`],
          })),
      );
    await fc.assert(
      fc.asyncProperty(invalidAuthorization, async (authorization) => {
        const store = {
          get: vi.fn(async () => undefined),
          set: vi.fn(async () => {}),
          reset: vi.fn(async () => {}),
        };
        for (const payload of [
          request("config.get"),
          request("integration.preview", { text: "hello" }),
        ]) {
          const response = await handleHttp(
            makeEvent(
              { "Content-Type": ["application/json"], ...authorization },
              JSON.stringify(payload),
            ),
            secret,
            store,
          );
          expect(response.statusCode).toBe(401);
          expect(JSON.stringify(response)).not.toContain(secret);
        }
        expect(store.get).not.toHaveBeenCalled();
        expect(store.set).not.toHaveBeenCalled();
      }),
      {
        examples: [
          [{}],
          [{ Authorization: ["Bearer a-private-test-token-wrong"] }],
          [{ Authorization: [`Basic ${secret}`] }],
          [{ Authorization: [`Bearer ${secret}`, `Bearer ${secret}`] }],
          [
            {
              Authorization: [`Bearer ${secret}`],
              authorization: [`Bearer ${secret}`],
            },
          ],
        ],
      },
    );
  });

  it.each([undefined, ""])(
    "logs a structured runtime configuration error and rejects missing secret %j without dispatch",
    async (runtimeSecret) => {
      const store = {
        get: vi.fn(async () => undefined),
        set: vi.fn(async () => {}),
        reset: vi.fn(async () => {}),
      };
      const response = await handleHttp(
        makeEvent(
          undefined,
          JSON.stringify(
            request("config.set", {
              prefix: "private-prefix-must-not-be-logged",
            }),
          ),
        ),
        runtimeSecret,
        store,
      );
      expect(response).toEqual({
        statusCode: 503,
        body: "Service Unavailable",
        headers: { "Content-Type": ["text/plain; charset=utf-8"] },
      });
      expect(logRecords()).toEqual([
        {
          level: "error",
          time: expect.any(Number),
          name: "config-rpc",
          operation: "http.authenticate",
          errorCode: "RUNTIME_SECRET_MISSING",
          setting: "RPC_BEARER_SECRET",
          statusCode: 503,
          msg: "RPC_BEARER_SECRET is missing or empty in the active Forge runtime. Provision the encrypted runtime variable and redeploy.",
        },
      ]);
      const serialized = JSON.stringify(logRecords());
      expect(serialized).not.toContain(secret);
      expect(serialized).not.toContain("private-prefix-must-not-be-logged");
      expect(store.get).not.toHaveBeenCalled();
      expect(store.set).not.toHaveBeenCalled();
      expect(store.reset).not.toHaveBeenCalled();
    },
  );

  it("does not log a missing-variable error for successful or rejected authentication", async () => {
    expect((await handleHttp(makeEvent(), secret, memory())).statusCode).toBe(
      200,
    );
    expect(
      (await handleHttp(makeEvent(), "another-private-token", memory()))
        .statusCode,
    ).toBe(401);
    expect(
      logRecords().filter(
        (record) => record["errorCode"] === "RUNTIME_SECRET_MISSING",
      ),
    ).toEqual([]);
  });

  it("enforces the inclusive 16 KiB body limit in UTF-8 bytes, not UTF-16 units", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ unit: "binary", maxLength: 64 }),
        fc.integer({ min: 16_383, max: 16_385 }),
        async (id, bytes) => {
          const json = JSON.stringify({ ...request("config.get"), id });
          const payload =
            json + " ".repeat(bytes - Buffer.byteLength(json, "utf8"));
          const store = {
            get: vi.fn(async () => undefined),
            set: vi.fn(async () => {}),
            reset: vi.fn(async () => {}),
          };
          const response = await handleHttp(
            makeEvent(undefined, payload),
            secret,
            store,
          );
          if (bytes > 16_384) {
            expect(response.statusCode).toBe(413);
            expect(store.get).not.toHaveBeenCalled();
          } else {
            expect(response.statusCode).toBe(200);
            expect(body(response)).toEqual({
              jsonrpc: "2.0",
              id,
              result: { configured: false, prefix: null },
            });
          }
          expect(store.set).not.toHaveBeenCalled();
        },
      ),
      {
        examples: [
          ["😀", 16_383],
          ["😀", 16_384],
          ["😀", 16_385],
        ],
      },
    );
  });

  it("rejects wrong verb, media type and malformed JSON", async () => {
    const store = {
      get: vi.fn(async () => undefined),
      set: vi.fn(async () => {}),
      reset: vi.fn(async () => {}),
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

  it("forbids reset via authenticated HTTP and preserves saved configuration", async () => {
    const store = memory();
    const reset = vi.spyOn(store, "reset");
    const save = vi.spyOn(store, "set");
    const execute = async (method: string, params: object) => {
      const response = await handleHttp(
        makeEvent(undefined, JSON.stringify(request(method, params))),
        secret,
        store,
      );
      expect(response.statusCode).toBe(200);
      return body(response);
    };
    // Set initial configuration
    expect(await execute("config.set", { prefix: "to-reset" })).toHaveProperty(
      "result.configured",
      true,
    );
    // Verify it's set
    expect(await execute("config.get", {})).toHaveProperty(
      "result.prefix",
      "to-reset",
    );
    for (const payload of [
      {
        ...request("config.reset", { confirm: true }),
        caller: { source: "ui", authorized: true },
      },
      request("config.reset", {
        confirm: true,
        source: "ui",
        authorized: true,
      }),
    ]) {
      const response = await handleHttp(
        makeEvent(undefined, JSON.stringify(payload)),
        secret,
        store,
      );
      expect(response.statusCode).toBe(200);
      expect(body(response)).toEqual({
        jsonrpc: "2.0",
        id: 1,
        error: {
          code: "caller" in payload ? -32600 : -32602,
          message: "caller" in payload ? "Invalid Request" : "Invalid params",
        },
      });
    }
    // Reset (API caller should get Forbidden)
    expect(await execute("config.reset", { confirm: true })).toEqual({
      jsonrpc: "2.0",
      id: 1,
      error: { code: -32001, message: "Forbidden" },
    });
    expect(reset).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledTimes(1);
    // Verify still configured (API caller couldn't reset)
    expect(await execute("config.get", {})).toHaveProperty(
      "result.prefix",
      "to-reset",
    );
  });

  it("rejects reset with missing or invalid confirm parameters", async () => {
    const store = memory();
    const execute = async (params: object) => {
      const response = await handleHttp(
        makeEvent(undefined, JSON.stringify(request("config.reset", params))),
        secret,
        store,
      );
      expect(response.statusCode).toBe(200);
      return body(response);
    };
    for (const params of [
      {},
      { confirm: false },
      { confirm: "true" },
      { confirm: 1 },
      { confirm: true, extra: "field" },
    ]) {
      expect(await execute(params)).toEqual({
        jsonrpc: "2.0",
        id: 1,
        error: { code: -32602, message: "Invalid params" },
      });
    }
  });
});
