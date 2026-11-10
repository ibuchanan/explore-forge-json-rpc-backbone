import { expect, it, vi } from "vitest";
import { createAdoptedRpc, createAdoptedWebtrigger } from "../src/adoption";
const installation = {
  id: "ari:cloud:ecosystem::installation/one",
  jiraSiteUrl: "https://example.atlassian.net",
};

const memory = () => {
  let prefix: string | undefined;
  return {
    get: vi.fn(async () => prefix),
    set: vi.fn(async (value: string) => {
      prefix = value;
    }),
    reset: vi.fn(async () => {
      prefix = undefined;
    }),
  };
};
const request = (method: string, params: object, id: number) => ({
  jsonrpc: "2.0",
  method,
  params,
  id,
});

it("runs the documented commands through the package dispatcher with app-owned policy", async () => {
  const store = memory();
  const { dispatch } = createAdoptedRpc({ store });
  const context = {
    caller: { source: "ui" as const, authorized: true },
    store,
  };
  expect(await dispatch(request("config.get", {}, 1), context)).toEqual({
    jsonrpc: "2.0",
    id: 1,
    result: { configured: false, prefix: null },
  });
  expect(
    await dispatch(request("integration.preview", { text: "hi" }, 2), context),
  ).toEqual({
    jsonrpc: "2.0",
    id: 2,
    error: { code: -32002, message: "Not configured" },
  });
  expect(
    await dispatch(request("config.set", { prefix: "  hi  " }, 3), context),
  ).toEqual({ jsonrpc: "2.0", id: 3, result: { configured: true } });
  expect(
    await dispatch(
      request("integration.preview", { text: " there" }, 4),
      context,
    ),
  ).toEqual({ jsonrpc: "2.0", id: 4, result: { output: "hi there" } });
  expect(
    await dispatch(request("config.reset", { confirm: true }, 5), context),
  ).toEqual({ jsonrpc: "2.0", id: 5, result: { configured: false } });
  expect(store.reset).toHaveBeenCalledTimes(1);
});

it("fails closed without a trusted installation binding or acknowledged audit publisher", async () => {
  const store = memory();
  const requestJira = vi.fn();
  const trigger = createAdoptedWebtrigger({
    store,
    requestJira,
  });
  const event = {
    method: "POST",
    headers: {
      "Content-Type": ["application/json"],
      Authorization: ["Basic Zm9vOmJhcg=="],
    },
    body: JSON.stringify(request("config.set", { prefix: "bad" }, 9)),
  };
  expect((await trigger(event, {})).statusCode).toBe(503);
  expect(requestJira).not.toHaveBeenCalled();
  expect(store.set).not.toHaveBeenCalled();
});

it("denies a verified account without Jira ADMINISTER before any store access", async () => {
  const store = memory();
  const requestJira = vi.fn(async (url: string) =>
    url.endsWith("/myself")
      ? { status: 200, body: { accountId: "verified-user" } }
      : {
          status: 200,
          body: { permissions: { ADMINISTER: { havePermission: false } } },
        },
  );
  const trigger = createAdoptedWebtrigger({
    store,
    requestJira,
  });
  const response = await trigger(
    {
      method: "POST",
      headers: {
        "Content-Type": ["application/json"],
        Authorization: ["Basic YWRhQGV4YW1wbGUuY29tOnRva2Vu"],
      },
      body: JSON.stringify(request("config.get", {}, 1)),
    },
    { installation },
  );
  expect(response.statusCode).toBe(403);
  expect(store.get).not.toHaveBeenCalled();
});

it("verifies a Jira admin on every request and exposes only reviewed read methods", async () => {
  const store = memory();
  const requestJira = vi.fn(async (url: string) =>
    url.endsWith("/myself")
      ? { status: 200, body: { accountId: "verified-user" } }
      : {
          status: 200,
          body: { permissions: { ADMINISTER: { havePermission: true } } },
        },
  );
  const trigger = createAdoptedWebtrigger({
    store,
    requestJira,
  });
  const call = async (method: string, params: object = {}) =>
    trigger(
      {
        method: "POST",
        headers: {
          "Content-Type": ["application/json"],
          Authorization: ["Basic YWRhQGV4YW1wbGUuY29tOnRva2Vu"],
        },
        body: JSON.stringify(request(method, params, 9)),
      },
      { installation },
    );
  expect(JSON.parse((await call("config.get")).body)).toEqual({
    jsonrpc: "2.0",
    id: 9,
    result: { configured: false, prefix: null },
  });
  expect(
    JSON.parse((await call("config.set", { prefix: "bad" })).body),
  ).toEqual({
    jsonrpc: "2.0",
    id: 9,
    error: { code: -32601, message: "Method not found" },
  });
  expect(
    JSON.parse((await call("config.reset", { confirm: true })).body),
  ).toEqual({
    jsonrpc: "2.0",
    id: 9,
    error: { code: -32601, message: "Method not found" },
  });
  expect(
    JSON.parse((await call("rpc.discover")).body).result.methods.map(
      (m: { name: string }) => m.name,
    ),
  ).toEqual(["config.get", "integration.preview"]);
  expect(
    JSON.parse((await call("integration.preview", { text: "hi" })).body),
  ).toEqual({
    jsonrpc: "2.0",
    id: 9,
    error: { code: -32002, message: "Not configured" },
  });
  expect(requestJira).toHaveBeenCalledTimes(10);
  expect(store.set).not.toHaveBeenCalled();
  expect(store.reset).not.toHaveBeenCalled();
});
