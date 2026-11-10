import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAppContext: vi.fn(),
  requestJira: vi.fn(),
  fetch: vi.fn(),
  get: vi.fn(),
}));
vi.mock("@forge/api", () => ({
  default: { asApp: () => ({ requestJira: mocks.requestJira }) },
  getAppContext: mocks.getAppContext,
  fetch: mocks.fetch,
  route: (parts: TemplateStringsArray) => parts.join(""),
}));
vi.mock("@forge/kvs", () => ({ kvs: { get: mocks.get } }));

import { run } from "../src/index";

const authorization = `Basic ${Buffer.from("admin@example.com:token").toString("base64")}`;
const event = {
  method: "POST" as const,
  headers: {
    "Content-Type": ["application/json"],
    Authorization: [authorization],
  },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "config.get",
    params: {},
  }),
  path: "/",
  queryParameters: {},
};
const serverInfo = (body: unknown, ok = true) => ({
  ok,
  json: async () => body,
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getAppContext.mockReturnValue({
    installationAri: {
      toString: () => "ari:cloud:ecosystem::installation/one",
    },
  });
  mocks.requestJira.mockResolvedValue(
    serverInfo({ baseUrl: "https://example.atlassian.net" }),
  );
  mocks.fetch.mockImplementation(async (url: string) => ({
    status: 200,
    json: async () =>
      url.endsWith("/myself")
        ? { accountId: "verified-admin" }
        : { permissions: { ADMINISTER: { havePermission: true } } },
  }));
});

it("discovers the current Jira site through Forge before verifying the caller's API token", async () => {
  const response = await run(event);
  expect(response.statusCode).toBe(200);
  expect(JSON.parse(response.body ?? "").result).toEqual({
    configured: false,
    prefix: null,
  });
  expect(mocks.requestJira).toHaveBeenCalledWith("/rest/api/3/serverInfo");
  expect(mocks.fetch.mock.calls).toEqual([
    [
      "https://example.atlassian.net/rest/api/3/myself",
      { headers: { Authorization: authorization }, redirect: "manual" },
    ],
    [
      "https://example.atlassian.net/rest/api/3/mypermissions?permissions=ADMINISTER",
      { headers: { Authorization: authorization }, redirect: "manual" },
    ],
  ]);
});

it.each([
  null,
  {},
  { baseUrl: 123 },
  { baseUrl: "http://example.atlassian.net" },
  { baseUrl: "https://example.atlassian.net.attacker.test" },
  { baseUrl: "https://user:password@example.atlassian.net" },
  { baseUrl: "https://example.atlassian.net/path" },
  { baseUrl: "https://example.atlassian.net/?redirect=attacker" },
])(
  "fails closed before forwarding credentials when serverInfo is unsafe: %j",
  async (body) => {
    mocks.requestJira.mockResolvedValue(serverInfo(body));
    expect((await run(event)).statusCode).toBe(503);
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.get).not.toHaveBeenCalled();
  },
);

it.each(["context", "installation", "request", "status", "json"])(
  "fails closed on discovery failure: %s",
  async (failure) => {
    if (failure === "context")
      mocks.getAppContext.mockImplementation(() => {
        throw new Error("unavailable");
      });
    if (failure === "installation")
      mocks.getAppContext.mockReturnValue({
        installationAri: { toString: () => "" },
      });
    if (failure === "request")
      mocks.requestJira.mockRejectedValue(new Error("unavailable"));
    if (failure === "status")
      mocks.requestJira.mockResolvedValue(serverInfo({}, false));
    if (failure === "json")
      mocks.requestJira.mockResolvedValue({
        ok: true,
        json: async () => {
          throw new Error("invalid JSON");
        },
      });
    expect((await run(event)).statusCode).toBe(503);
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.get).not.toHaveBeenCalled();
  },
);

it("resolves the site afresh for each invocation instead of reusing another installation's URL", async () => {
  await run(event);
  mocks.getAppContext.mockReturnValue({
    installationAri: {
      toString: () => "ari:cloud:ecosystem::installation/two",
    },
  });
  mocks.requestJira.mockResolvedValue(
    serverInfo({ baseUrl: "https://second.atlassian.net/" }),
  );
  expect((await run(event)).statusCode).toBe(200);
  expect(mocks.fetch.mock.calls.slice(2).map(([url]) => url)).toEqual([
    "https://second.atlassian.net/rest/api/3/myself",
    "https://second.atlassian.net/rest/api/3/mypermissions?permissions=ADMINISTER",
  ]);
});

it("does not authorize a legacy bearer credential even after successful site discovery", async () => {
  expect(
    (
      await run({
        ...event,
        headers: { ...event.headers, Authorization: ["Bearer legacy-secret"] },
      })
    ).statusCode,
  ).toBe(401);
  expect(mocks.fetch).not.toHaveBeenCalled();
  expect(mocks.get).not.toHaveBeenCalled();
});
