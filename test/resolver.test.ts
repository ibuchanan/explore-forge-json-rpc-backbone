import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  data: new Map<string, string>(),
  requestJira: vi.fn(),
  asUser: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
}));
vi.mock("@forge/api", () => ({
  default: { asUser: mocks.asUser },
  route: (parts: TemplateStringsArray) => parts.join(""),
}));
vi.mock("@forge/kvs", () => ({
  kvs: { get: mocks.get, set: mocks.set, delete: mocks.delete },
}));

import { run } from "../src/index";
import { handler } from "../src/resolver";

const payload = (method: string, params: object = {}) => ({
  jsonrpc: "2.0",
  method,
  params,
  id: "ui-request",
});
const invoke = (request: unknown, accountId: unknown = "trusted-admin") =>
  handler(
    { call: { functionKey: "rpc", payload: request }, context: {} as never },
    { principal: { accountId } },
  );
const allowed = () => ({
  ok: true,
  json: async () => ({ permissions: { ADMINISTER: { havePermission: true } } }),
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.data.clear();
  mocks.delete.mockImplementation(async (key: string) => {
    mocks.data.delete(key);
  });
  mocks.asUser.mockReturnValue({ requestJira: mocks.requestJira });
  mocks.requestJira.mockResolvedValue(allowed());
  mocks.get.mockImplementation(async (key: string) => mocks.data.get(key));
  mocks.set.mockImplementation(async (key: string, value: string) => {
    mocks.data.set(key, value);
  });
});

it("uses the official resolver and shares read, save and preview commands and KVS with HTTP", async () => {
  expect(await invoke(payload("config.get"))).toHaveProperty("result", {
    configured: false,
    prefix: null,
  });
  expect(
    await invoke(payload("integration.preview", { text: " hi" })),
  ).toHaveProperty("error.code", -32002);
  expect(
    await invoke(payload("config.set", { prefix: "  😀  " })),
  ).toHaveProperty("result.configured", true);
  expect(await invoke(payload("config.get"))).toHaveProperty(
    "result.prefix",
    "😀",
  );
  expect(
    await invoke(payload("integration.preview", { text: " hi\n" })),
  ).toEqual({
    jsonrpc: "2.0",
    id: "ui-request",
    result: { output: "😀 hi\n" },
  });
  vi.stubEnv("RPC_BEARER_SECRET", "test-secret");
  try {
    const event = (request: unknown) => ({
      method: "POST" as const,
      path: "/",
      queryParameters: {},
      headers: {
        Authorization: ["Bearer test-secret"],
        "Content-Type": ["application/json"],
      },
      body: JSON.stringify(request),
    });
    const preview = payload("integration.preview", { text: " hi\n" });
    expect(JSON.parse((await run(event(preview))).body ?? "")).toEqual(
      await invoke(preview),
    );
    await run(event(payload("config.set", { prefix: "changed" })));
    expect(await invoke(preview)).toHaveProperty(
      "result.output",
      "changed hi\n",
    );
    expect([...mocks.data.entries()]).toEqual([["config.prefix", "changed"]]);
  } finally {
    vi.unstubAllEnvs();
  }
  expect(mocks.requestJira).toHaveBeenCalledWith(
    "/rest/api/3/mypermissions?permissions=ADMINISTER",
  );
  expect(mocks.asUser.mock.calls.every((args) => args.length === 0)).toBe(true);
});

it("resets only the prefix after an as-user admin permission check and supports reconfiguration", async () => {
  mocks.data.set("unrelated.setting", "keep");
  await invoke(payload("config.set", { prefix: "to delete" }));
  expect(await invoke(payload("config.reset", { confirm: true }))).toEqual({
    jsonrpc: "2.0",
    id: "ui-request",
    result: { configured: false },
  });
  expect(mocks.delete).toHaveBeenCalledExactlyOnceWith("config.prefix");
  expect([...mocks.data.entries()]).toEqual([["unrelated.setting", "keep"]]);
  expect(await invoke(payload("config.get"))).toHaveProperty("result", {
    configured: false,
    prefix: null,
  });
  expect(
    await invoke(payload("integration.preview", { text: "hello" })),
  ).toHaveProperty("error.code", -32002);
  await invoke(payload("config.set", { prefix: "new" }));
  expect(
    await invoke(payload("integration.preview", { text: "hello" })),
  ).toHaveProperty("result.output", "newhello");
  expect(mocks.requestJira).toHaveBeenCalledWith(
    "/rest/api/3/mypermissions?permissions=ADMINISTER",
  );
});

it("sanitizes reset deletion errors and never deletes after an invalid confirmation", async () => {
  mocks.data.set("config.prefix", "keep");
  expect(
    await invoke(payload("config.reset", { confirm: false })),
  ).toHaveProperty("error.code", -32602);
  expect(mocks.delete).not.toHaveBeenCalled();
  mocks.delete.mockRejectedValueOnce(new Error("private deletion failure"));
  expect(await invoke(payload("config.reset", { confirm: true }))).toEqual({
    jsonrpc: "2.0",
    id: "ui-request",
    error: { code: -32603, message: "Internal error" },
  });
  expect(mocks.data.get("config.prefix")).toBe("keep");
});

it("denies every command when permission is absent, malformed, revoked or unverifiable", async () => {
  const responses = [
    { ok: false, json: async () => allowed() },
    ...[
      null,
      {},
      { permissions: {} },
      { permissions: { ADMINISTER: { havePermission: false } } },
      { permissions: { ADMINISTER: { havePermission: "true" } } },
    ].map((body) => ({ ok: true, json: async () => body })),
    {
      ok: true,
      json: async () => {
        throw new Error("private response");
      },
    },
  ];
  for (const request of [
    payload("config.get"),
    payload("config.set", { prefix: "no" }),
    payload("config.reset", { confirm: true }),
    payload("integration.preview", { text: "no" }),
  ]) {
    for (const response of responses) {
      mocks.requestJira.mockResolvedValueOnce(response);
      expect(await invoke(request)).toEqual({
        jsonrpc: "2.0",
        id: "ui-request",
        error: { code: -32001, message: "Forbidden" },
      });
    }
    mocks.requestJira.mockRejectedValueOnce(new Error("private credential"));
    expect(await invoke(request)).toHaveProperty("error.code", -32001);
  }
  expect(mocks.get).not.toHaveBeenCalled();
  expect(mocks.set).not.toHaveBeenCalled();
  expect(mocks.delete).not.toHaveBeenCalled();
  expect(await invoke(payload("config.get"))).toHaveProperty(
    "result.configured",
    false,
  );
  mocks.requestJira.mockResolvedValueOnce(responses[0]);
  expect(await invoke(payload("config.get"))).toHaveProperty(
    "error.code",
    -32001,
  );
});

it("ignores browser-supplied identity and requires a trusted runtime principal", async () => {
  for (const accountId of [null, undefined, "", " ", 7]) {
    // getDefinitions replaces this event context with the Forge runtime principal.
    expect(
      await handler(
        {
          call: { functionKey: "rpc", payload: payload("config.get") },
          context: { accountId: "forged-admin" } as never,
        },
        { principal: { accountId } },
      ),
    ).toHaveProperty("error.code", -32001);
  }
  expect(mocks.requestJira).not.toHaveBeenCalled();
  mocks.requestJira.mockResolvedValueOnce({ ok: false });
  expect(
    await invoke({
      ...payload("config.set", { prefix: "no", accountId: "admin" }),
      caller: { authorized: true },
    }),
  ).toHaveProperty("error.code", -32600);
  expect(mocks.set).not.toHaveBeenCalled();
});

it("preserves shared invalid envelope, parameter and sanitized storage errors", async () => {
  for (const [request, code] of [
    ["{", -32700],
    [[], -32600],
    [[payload("config.get")], -32600],
    [{ jsonrpc: "2.0", method: "config.get", params: {} }, -32600],
    [{ ...payload("config.get"), id: null }, -32600],
    [payload("config.get", []), -32600],
    [payload("unknown"), -32601],
    [payload("config.set", { prefix: " " }), -32602],
    [payload("config.set", { prefix: "😀".repeat(65) }), -32602],
    [payload("integration.preview", { text: "😀".repeat(2001) }), -32602],
    [
      payload("integration.preview", { text: "hi", prefix: "override" }),
      -32602,
    ],
  ] as const) {
    expect(await invoke(request)).toHaveProperty("error.code", code);
  }
  expect(mocks.get).not.toHaveBeenCalled();
  expect(mocks.set).not.toHaveBeenCalled();
  const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    mocks.get.mockRejectedValue(new Error("private storage details"));
    mocks.set.mockRejectedValue(new Error("private storage details"));
    for (const request of [
      payload("config.get"),
      payload("config.set", { prefix: "hi" }),
      payload("integration.preview", { text: "hi" }),
    ]) {
      expect(await invoke(request)).toEqual({
        jsonrpc: "2.0",
        id: "ui-request",
        error: { code: -32603, message: "Internal error" },
      });
    }
    expect(warning).not.toHaveBeenCalled();
  } finally {
    warning.mockRestore();
  }
});
