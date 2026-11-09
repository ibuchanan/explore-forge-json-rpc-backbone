import { expect, it, vi } from "vitest";
import { createAdoptedWebtrigger } from "../src/adoption";
import {
  PreconditionError,
  verifyWebtrigger,
} from "../scripts/verify-webtrigger.ts";

const installation = {
  id: "ari:cloud:ecosystem::installation/verify",
  jiraSiteUrl: "https://example.atlassian.net",
};
const env = {
  FORGE_ENVIRONMENT: "development",
  FORGE_PRODUCT: "jira",
  RPC_VERIFY_URL: "https://trigger.example.test/x/y",
  RPC_VERIFY_EMAIL: "admin@example.com",
  RPC_VERIFY_API_TOKEN: "private-api-token",
};
const valid = `Basic ${Buffer.from(`${env.RPC_VERIFY_EMAIL}:${env.RPC_VERIFY_API_TOKEN}`).toString("base64")}`;

/** The real adopted web trigger behind a fake Jira, reached through fetch. */
function endpoint(initial?: string) {
  let prefix = initial;
  const store = {
    get: vi.fn(async () => prefix),
    set: vi.fn(async (value: string) => {
      prefix = value;
    }),
    reset: vi.fn(async () => {
      prefix = undefined;
    }),
  };
  const trigger = createAdoptedWebtrigger({
    store,
    installation,
    requestJira: async (url, authorization) =>
      authorization !== valid
        ? { status: 401, body: {} }
        : url.endsWith("/myself")
          ? { status: 200, body: { accountId: "admin" } }
          : {
              status: 200,
              body: { permissions: { ADMINISTER: { havePermission: true } } },
            },
  });
  const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
    const response = await trigger(
      {
        method: init.method ?? "GET",
        headers: Object.fromEntries(
          [...new Headers(init.headers)].map(([name, value]) => [
            name,
            [value],
          ]),
        ),
        body: init.body as string,
      },
      { installContext: installation.id },
    );
    return new Response(response.body, { status: response.statusCode });
  });
  return { fetcher, store };
}

it.each([undefined, "pre-😀"])(
  "passes read-only against the adopted web trigger (saved prefix %s)",
  async (saved) => {
    const { fetcher, store } = endpoint(saved);
    const lines: string[] = [];
    const report = await verifyWebtrigger(env, fetcher, (l) => lines.push(l));
    expect(report.status).toBe("passed");
    expect(report.checks).toHaveLength(10);
    expect(store.set).not.toHaveBeenCalled();
    expect(store.reset).not.toHaveBeenCalled();
    const output = JSON.stringify([report, lines]);
    for (const sensitive of [
      env.RPC_VERIFY_API_TOKEN,
      env.RPC_VERIFY_EMAIL,
      env.RPC_VERIFY_URL,
      "pre-😀",
    ])
      expect(output).not.toContain(sensitive);
  },
);

it("stops at the first failed check and reports it without response data", async () => {
  const fetcher = vi.fn(
    async () => new Response("private-body", { status: 200 }),
  );
  const report = await verifyWebtrigger(env, fetcher);
  expect(report).toEqual({
    status: "failed",
    checks: [
      {
        name: "rejects a request without credentials",
        status: "failed",
        detail: "Expected HTTP 401, received 200.",
      },
    ],
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("sanitizes transport failures", async () => {
  const fetcher = vi.fn(async () => {
    throw new Error("private-host.example.test refused");
  });
  const report = await verifyWebtrigger(env, fetcher);
  expect(report.status).toBe("failed");
  expect(JSON.stringify(report)).not.toContain("private-host");
});

it.each([
  [{ RPC_VERIFY_API_TOKEN: undefined }, "RPC_VERIFY_API_TOKEN"],
  [{ RPC_VERIFY_URL: "http://insecure.example.test" }, "https"],
  [{ RPC_VERIFY_URL: "https://user:pass@trigger.example.test" }, "https"],
  [{ FORGE_ENVIRONMENT: "production" }, "FORGE_ENVIRONMENT=development"],
  [{ RPC_VERIFY_EMAIL: "bad email" }, "malformed"],
])("refuses to start with %o", async (override, message) => {
  const fetcher = vi.fn();
  const failure = await verifyWebtrigger(
    { ...env, ...override },
    fetcher,
  ).catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(PreconditionError);
  expect((failure as Error).message).toContain(message);
  expect(fetcher).not.toHaveBeenCalled();
});
