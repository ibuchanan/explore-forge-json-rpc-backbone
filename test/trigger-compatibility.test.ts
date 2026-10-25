import {
  buildSuccessResponse,
  defineWebTrigger,
  parseJsonBody,
} from "@forge-ahead/triggers/webtrigger";
import { expect, it, vi } from "vitest";
import { handleHttp } from "../src/http";

const result = {
  jsonrpc: "2.0",
  id: 1,
  result: { configured: false, prefix: null },
};
const event = {
  method: "POST" as const,
  path: "/",
  userPath: "",
  queryParameters: {},
  headers: {
    Authorization: ["Bearer compatibility-token"],
    "Content-Type": ["application/json"],
  },
  body: JSON.stringify({
    jsonrpc: "2.0",
    method: "config.get",
    params: {},
    id: 1,
  }),
};
const expected = {
  statusCode: 200,
  headers: { "Content-Type": ["application/json"] },
  body: '{"jsonrpc":"2.0","id":1,"result":{"configured":false,"prefix":null}}',
};
const malformed = { ...event, body: "{" };
const rejection = {
  statusCode: 200,
  headers: { "Content-Type": ["application/json"] },
  body: '{"jsonrpc":"2.0","id":null,"error":{"code":-32700,"message":"Parse error"}}',
};
const context = { installContext: "ari:cloud:ecosystem::installation/local" };

it.each([
  [event, expected, 1],
  [malformed, rejection, 0],
] as const)(
  "preserves the app's HTTP contract for %j",
  async (request, response, reads) => {
    const store = {
      get: vi.fn(async () => undefined),
      set: vi.fn(),
      reset: vi.fn(),
    };
    expect(await handleHttp(request, "compatibility-token", store)).toEqual(
      response,
    );
    expect(store.get).toHaveBeenCalledTimes(reads);
    expect(store.set).not.toHaveBeenCalled();
    expect(store.reset).not.toHaveBeenCalled();
  },
);

// Expected failures against installed 0.2.1; an upstream fix must prompt review.
it.fails("the installed success helper preserves the exact response contract", async () => {
  const candidate = defineWebTrigger(() => buildSuccessResponse(result));
  expect(await candidate(event, context)).toEqual(expected);
});

it.fails("the installed parser preserves JSON-RPC parse rejection through a handler", async () => {
  const candidate = defineWebTrigger((request) =>
    parseJsonBody(request, (value): value is null => value === null).match(
      () => buildSuccessResponse(null),
      (response) => response,
    ),
  );
  expect(await candidate(malformed, context)).toEqual(rejection);
});
