import { describe, expect, it, vi } from "vitest";
import { handleHttp } from "../src/http";
import { verifyDeployed } from "./deployed/verify";

const secret = "local-verifier-test-credential";
const primary = "https://primary.example.test/rpc";
const secondary = "https://secondary.example.test/rpc";
const environment = {
  RPC_VERIFY_APPROVED: "development",
  FORGE_ENVIRONMENT: "development",
  FORGE_PRODUCT: "jira",
  FORGE_SITE: "isolated.example.test",
  RPC_VERIFY_URL: primary,
  RPC_BEARER_SECRET: secret,
};

function transport(initialPrefix?: string) {
  const prefixes = new Map<string, string>();
  if (initialPrefix !== undefined) prefixes.set(primary, initialPrefix);
  const fetcher = vi.fn(async (url: string, init: RequestInit) => {
    expect(init.redirect).toBe("error");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    const response = await handleHttp(
      {
        method: init.method ?? "GET",
        headers: Object.fromEntries(
          [...new Headers(init.headers)].map(([name, value]) => [
            name,
            [value],
          ]),
        ),
        body: String(init.body ?? ""),
      },
      secret,
      {
        get: async () => prefixes.get(url),
        set: async (prefix) => {
          prefixes.set(url, prefix);
        },
        reset: async () => {
          prefixes.delete(url);
        },
      },
    );
    return new Response(response.body, {
      status: response.statusCode,
      headers: Object.fromEntries(
        Object.entries(response.headers).map(([name, values]) => [
          name,
          values.join(", "),
        ]),
      ),
    });
  });
  return { fetcher, prefixes };
}

describe("opt-in deployed HTTP verifier (local adapter only)", () => {
  it("emits actionable preflight diagnostics for each condition", async () => {
    const fetcher = vi.fn();
    const cases: Array<[Record<string, string | undefined>, string]> = [
      [
        { RPC_VERIFY_APPROVED: undefined },
        "RPC_VERIFY_APPROVED must be development",
      ],
      [
        { RPC_VERIFY_APPROVED: "true" },
        "RPC_VERIFY_APPROVED must be development",
      ],
      [
        { FORGE_ENVIRONMENT: "production" },
        "FORGE_ENVIRONMENT must be development",
      ],
      [{ FORGE_PRODUCT: "confluence" }, "FORGE_PRODUCT must be jira"],
      [{ FORGE_SITE: "" }, "FORGE_SITE required and must not be whitespace"],
      [{ FORGE_SITE: "  " }, "FORGE_SITE required and must not be whitespace"],
      [{ RPC_BEARER_SECRET: undefined }, "RPC_BEARER_SECRET required"],
      [{ RPC_BEARER_SECRET: "" }, "RPC_BEARER_SECRET required"],
      [
        { RPC_BEARER_SECRET: "bad\ntoken" },
        "RPC_BEARER_SECRET invalid bearer syntax",
      ],
      [
        { RPC_BEARER_SECRET: "!@#$" },
        "RPC_BEARER_SECRET invalid bearer syntax",
      ],
      [
        { RPC_VERIFY_URL: undefined },
        "RPC_VERIFY_URL required valid HTTPS URL without credentials query or fragment",
      ],
      [
        { RPC_VERIFY_URL: "" },
        "RPC_VERIFY_URL required valid HTTPS URL without credentials query or fragment",
      ],
      [
        { RPC_VERIFY_URL: "http://primary.example.test/rpc" },
        "RPC_VERIFY_URL required valid HTTPS URL without credentials query or fragment",
      ],
      [
        { RPC_VERIFY_URL: "not a url" },
        "RPC_VERIFY_URL required valid HTTPS URL without credentials query or fragment",
      ],
      [
        { RPC_VERIFY_URL: "https://user:password@primary.example.test/rpc" },
        "RPC_VERIFY_URL required valid HTTPS URL without credentials query or fragment",
      ],
      [
        { RPC_VERIFY_URL: `${primary}?token=private` },
        "RPC_VERIFY_URL required valid HTTPS URL without credentials query or fragment",
      ],
      [
        { RPC_VERIFY_URL: `${primary}#private` },
        "RPC_VERIFY_URL required valid HTTPS URL without credentials query or fragment",
      ],
      [
        { RPC_VERIFY_ISOLATION_URL: primary },
        "RPC_VERIFY_ISOLATION_URL must be distinct normalized from primary",
      ],
      [
        { RPC_VERIFY_ISOLATION_URL: "http://secondary.example.test/rpc" },
        "RPC_VERIFY_ISOLATION_URL invalid HTTPS URL without credentials query or fragment",
      ],
    ];

    for (const [overrides, expectedMessage] of cases) {
      const report = await verifyDeployed(
        { ...environment, ...overrides },
        fetcher,
      );
      expect(report.status).toBe("failed");
      const preflightCheck = report.checks.find((c) => c.name === "preflight");
      expect(preflightCheck).toBeDefined();
      expect(preflightCheck?.message).toBe(expectedMessage);
      expect(report.configurationMayHaveChanged).toBe(false);
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("never echoes malicious preflight values and compares normalized isolation URLs", async () => {
    const fetcher = vi.fn();
    for (const overrides of [
      { FORGE_ENVIRONMENT: "private-target-value" },
      { RPC_BEARER_SECRET: "private token value" },
      {
        RPC_VERIFY_URL:
          "https://user:private-password@private-host.example.test/path?private-query",
      },
      {
        RPC_VERIFY_ISOLATION_URL:
          "https://private-host.example.test/path#private-fragment",
      },
      {
        RPC_VERIFY_URL: "https://primary.example.test",
        RPC_VERIFY_ISOLATION_URL: "https://PRIMARY.example.test:443/",
      },
    ]) {
      const report = await verifyDeployed(
        { ...environment, ...overrides },
        fetcher,
      );
      expect(report.checks).toHaveLength(1);
      expect(report.checks[0]?.message).toBeTruthy();
      expect(report.status).toBe("failed");
      expect(report.configurationMayHaveChanged).toBe(false);
      const output = JSON.stringify(report);
      for (const sensitive of [
        secret,
        primary,
        "private-",
        "private token",
        "PRIMARY.example.test",
      ]) {
        expect(output).not.toContain(sensitive);
      }
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("fails closed without explicit approval and valid development settings", async () => {
    const fetcher = vi.fn();
    for (const overrides of [
      { RPC_VERIFY_APPROVED: undefined },
      { RPC_VERIFY_APPROVED: "true" },
      { FORGE_ENVIRONMENT: "production" },
      { FORGE_PRODUCT: "confluence" },
      { FORGE_SITE: "" },
      { RPC_BEARER_SECRET: undefined },
      { RPC_BEARER_SECRET: "bad\ntoken" },
      { RPC_VERIFY_URL: undefined },
      { RPC_VERIFY_URL: "http://primary.example.test/rpc" },
      { RPC_VERIFY_URL: "not a url" },
      { RPC_VERIFY_URL: "https://user:password@primary.example.test/rpc" },
      { RPC_VERIFY_URL: `${primary}?token=private` },
      { RPC_VERIFY_URL: `${primary}#private` },
      { RPC_VERIFY_ISOLATION_URL: primary },
      { RPC_VERIFY_ISOLATION_URL: "http://secondary.example.test/rpc" },
    ]) {
      const report = await verifyDeployed(
        { ...environment, ...overrides },
        fetcher,
      );
      expect(report.status).toBe("failed");
      expect(report.checks.at(-1)?.name).toBe("preflight");
      expect(report.configurationMayHaveChanged).toBe(false);
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("runs separate HTTP calls and optional read-only installation isolation checks", async () => {
    const { fetcher, prefixes } = transport();
    const report = await verifyDeployed(
      { ...environment, RPC_VERIFY_ISOLATION_URL: secondary },
      fetcher,
    );
    expect(report.status).toBe("passed");
    expect(report.isolation).toBe("verified");
    expect(report.ui).toBe("unverified");
    expect(report.configurationMayHaveChanged).toBe(true);
    expect(prefixes.get(primary)).toBe("poc-😀");
    expect(prefixes.has(secondary)).toBe(false);
    expect(report.checks.every((check) => check.status === "passed")).toBe(
      true,
    );
    expect(fetcher.mock.calls.length).toBeGreaterThan(20);
    expect(report.checks).toContainEqual(
      expect.objectContaining({
        name: "config.reset forbidden for HTTP",
        status: "passed",
      }),
    );
    expect(report.checks).toContainEqual(
      expect.objectContaining({
        name: "config.get preserved after forbidden reset",
        status: "passed",
      }),
    );
    const output = JSON.stringify(report);
    for (const sensitive of [secret, primary, secondary, "Authorization"]) {
      expect(output).not.toContain(sensitive);
    }

    for (const sharedStorage of [false, true]) {
      const { fetcher: adapter, prefixes: isolatedPrefixes } = transport();
      if (!sharedStorage) isolatedPrefixes.set(secondary, "existing setup");
      const fetcher = (url: string, init: RequestInit) =>
        adapter(sharedStorage ? primary : url, init);
      const failed = await verifyDeployed(
        { ...environment, RPC_VERIFY_ISOLATION_URL: secondary },
        fetcher,
      );
      expect(failed.status).toBe("failed");
      expect(failed.isolation).toBe("unverified");
      expect(failed.checks.at(-1)?.name).toBe(
        `second installation unset ${sharedStorage ? "after" : "before"} save`,
      );
      expect(failed.configurationMayHaveChanged).toBe(sharedStorage);
    }
  });

  it("does not imply isolation without a second approved installation", async () => {
    const { fetcher } = transport();
    const report = await verifyDeployed(environment, fetcher);
    expect(report.status).toBe("passed");
    expect(report.isolation).toBe("unverified");
  });

  it("refuses configured installations before attempting any writes", async () => {
    const { fetcher, prefixes } = transport("existing setup");
    const report = await verifyDeployed(environment, fetcher);
    expect(report.status).toBe("failed");
    expect(report.checks.at(-1)?.name).toBe("config.get unset");
    expect(report.configurationMayHaveChanged).toBe(false);
    expect(prefixes.get(primary)).toBe("existing setup");
    expect(fetcher.mock.calls).toHaveLength(1);
  });

  it("sanitizes mismatches, leaked headers/bodies, and transport failures", async () => {
    for (const fetcher of [
      vi.fn(async () => {
        throw new Error(`request failed: ${secret} ${primary}`);
      }),
      vi.fn(async () => new Response(secret, { status: 500 })),
      vi.fn(async () => new Response('{"invalid":"jsonrpc"}')),
      vi.fn(async () => new Response("not JSON")),
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              id: 0,
              result: { configured: false, prefix: null },
            }),
            { headers: { "Content-Type": "application/json", leaked: secret } },
          ),
      ),
      vi.fn(async () => new Response("x".repeat(32769))),
    ]) {
      const report = await verifyDeployed(environment, fetcher);
      expect(report.status).toBe("failed");
      expect(report.checks.at(-1)?.status).toBe("failed");
      expect(JSON.stringify(report)).not.toContain(secret);
      expect(JSON.stringify(report)).not.toContain(primary);
      expect(fetcher.mock.calls).toHaveLength(1);
    }
  });

  it("stops before save on negative-case regressions and after an uncertain write", async () => {
    for (const failingName of ["authorization absent", "config.set save"]) {
      const { fetcher: adapter } = transport();
      const fetcher = vi.fn(async (url: string, init: RequestInit) => {
        const payload = String(init.body ?? "");
        if (
          (failingName === "authorization absent" &&
            !new Headers(init.headers).has("authorization")) ||
          (failingName === "config.set save" &&
            payload.includes('"prefix":"  poc-😀  "'))
        ) {
          throw new Error("unsafe raw exception");
        }
        return adapter(url, init);
      });
      const report = await verifyDeployed(environment, fetcher);
      expect(report.status).toBe("failed");
      expect(report.checks.at(-1)?.name).toBe(failingName);
      expect(JSON.stringify(report)).not.toContain("unsafe raw exception");
      expect(report.configurationMayHaveChanged).toBe(
        failingName === "config.set save",
      );
    }
  });
});
