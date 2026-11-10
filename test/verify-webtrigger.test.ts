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
  FORGE_SITE: "example.atlassian.net",
  RPC_VERIFY_EMAIL: "admin@example.com",
  RPC_VERIFY_API_TOKEN: "private-api-token",
};
const triggerUrl = "https://trigger.example.test/x/y";
const command = async () =>
  JSON.stringify([{ id: "one", triggerKey: "config-rpc", url: triggerUrl }]);
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
      { installation },
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
    const report = await verifyWebtrigger(
      env,
      fetcher,
      (l) => lines.push(l),
      command,
    );
    expect(report.status).toBe("passed");
    expect(report.checks).toHaveLength(10);
    expect(store.set).not.toHaveBeenCalled();
    expect(store.reset).not.toHaveBeenCalled();
    const output = JSON.stringify([report, lines]);
    for (const sensitive of [
      env.RPC_VERIFY_API_TOKEN,
      env.RPC_VERIFY_EMAIL,
      triggerUrl,
      "pre-😀",
    ])
      expect(output).not.toContain(sensitive);
  },
);

it("stops at the first failed check and reports it without response data", async () => {
  const fetcher = vi.fn(
    async () => new Response("private-body", { status: 200 }),
  );
  const report = await verifyWebtrigger(env, fetcher, undefined, command);
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
  const report = await verifyWebtrigger(env, fetcher, undefined, command);
  expect(report.status).toBe("failed");
  expect(JSON.stringify(report)).not.toContain("private-host");
});

it.each([
  [{ RPC_VERIFY_API_TOKEN: undefined }, "RPC_VERIFY_API_TOKEN"],
  [{ FORGE_SITE: undefined }, "FORGE_SITE"],
  [{ FORGE_SITE: "--site=elsewhere" }, "hostname"],
  [{ FORGE_SITE: "https://example.atlassian.net" }, "hostname"],
  [{ FORGE_ENVIRONMENT: "production" }, "FORGE_ENVIRONMENT=development"],
  [{ RPC_VERIFY_EMAIL: "bad email" }, "malformed"],
])("refuses to start with %o", async (override, message) => {
  const fetcher = vi.fn();
  const failure = await verifyWebtrigger(
    { ...env, ...override },
    fetcher,
    undefined,
    command,
  ).catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(PreconditionError);
  expect((failure as Error).message).toContain(message);
  expect(fetcher).not.toHaveBeenCalled();
});

it("lists the exact target without putting verification credentials in CLI arguments", async () => {
  const run = vi.fn(command);
  const { fetcher } = endpoint();
  const report = await verifyWebtrigger(env, fetcher, undefined, run);
  expect(report.status).toBe("passed");
  expect(run.mock.calls).toEqual([
    [
      "forge",
      [
        "webtrigger",
        "list",
        "--functionKey",
        "config-rpc",
        "--site",
        env.FORGE_SITE,
        "--product",
        "jira",
        "--environment",
        "development",
        "--json",
      ],
    ],
  ]);
  expect(fetcher.mock.calls.every(([url]) => url === triggerUrl)).toBe(true);
});

it.each([
  ["[]", "No config-rpc URL"],
  [
    JSON.stringify([{ triggerKey: "other", url: triggerUrl }]),
    "No config-rpc URL",
  ],
  [
    JSON.stringify([
      { triggerKey: "config-rpc", url: triggerUrl },
      { triggerKey: "config-rpc", url: triggerUrl },
    ]),
    "Multiple",
  ],
  ["{}", "format"],
  ["not JSON", "Could not list"],
  [JSON.stringify([{ triggerKey: "config-rpc" }]), "invalid"],
  [
    JSON.stringify([{ triggerKey: "config-rpc", url: "http://insecure.test" }]),
    "https",
  ],
  [
    JSON.stringify([
      {
        triggerKey: "config-rpc",
        url: "https://user:pass@trigger.example.test",
      },
    ]),
    "https",
  ],
])(
  "does not probe unsafe or missing CLI results: %s",
  async (stdout, message) => {
    const fetcher = vi.fn();
    const failure = await verifyWebtrigger(
      env,
      fetcher,
      undefined,
      async () => stdout,
    ).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(PreconditionError);
    expect((failure as Error).message).toContain(message);
    expect(fetcher).not.toHaveBeenCalled();
  },
);

it("sanitizes CLI failures without issuing an HTTP request", async () => {
  const fetcher = vi.fn();
  const failure = await verifyWebtrigger(env, fetcher, undefined, async () => {
    throw new Error(`private CLI failure ${triggerUrl}`);
  }).catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(PreconditionError);
  expect((failure as Error).message).not.toContain(triggerUrl);
  expect(fetcher).not.toHaveBeenCalled();
});
