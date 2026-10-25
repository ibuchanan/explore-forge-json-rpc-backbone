import { spawnSync } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import { handleHttp } from "../src/http";
import { verifyDeployed } from "./deployed/verify";
import { logRecords } from "./logging";

const secret = "local-verifier-test-credential";
const primary = "https://primary.example.test/rpc";
const secondary = "https://secondary.example.test/rpc";
const environment = {
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
  it("keeps real narrative output on stderr and the JSON report alone on stdout", () => {
    const run = spawnSync("bun", ["run", "-"], {
      input: `
          import { verifyDeployed } from "./test/deployed/verify.ts";
          const report = await verifyDeployed({}, async () => { throw new Error("must not call HTTP"); });
          console.log(JSON.stringify(report));
        `,
      encoding: "utf8",
      env: { ...process.env, LOG_LEVEL: "info", FORGE_LOG_PRETTY: "false" },
    });
    expect(run.status).toBe(0);
    const report = JSON.parse(run.stdout);
    expect(report.status).toBe("failed");
    const records = run.stderr
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(
      records.every(
        (record) =>
          record.name === "deployed-verifier" && record.runId === report.runId,
      ),
    ).toBe(true);
    const steps = records.filter(
      (record) => record.kind === "demoNarrativeStep",
    );
    expect(steps.map((record) => record.stepNumber)).toEqual([1, 2, 3, 4]);
    expect(steps[2].msg).toBe("Check failed: preflight");
    expect(steps[3].msg).toBe("Verification failed; UI remains unverified.");
    expect(records.some((record) => record.level === "error")).toBe(true);
  });
  it("emits actionable preflight diagnostics for each condition", async () => {
    const fetcher = vi.fn();
    const cases: Array<[Record<string, string | undefined>, string]> = [
      [
        { FORGE_ENVIRONMENT: undefined },
        "FORGE_ENVIRONMENT must be development",
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

  it("fails closed without valid development Jira settings", async () => {
    const fetcher = vi.fn();
    for (const overrides of [
      { FORGE_ENVIRONMENT: undefined },
      { FORGE_ENVIRONMENT: "production" },
      { FORGE_ENVIRONMENT: "staging" },
      { FORGE_PRODUCT: undefined },
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
    const narrative = logRecords().filter(
      (record) => record["storyId"] === "deployed-verification",
    );
    expect(narrative.map((record) => record["stepNumber"])).toEqual(
      narrative.map((_, index) => index + 1),
    );
    expect(
      narrative.every(
        (record) =>
          record["runId"] === report.runId && record["demoOnly"] === true,
      ),
    ).toBe(true);
    expect(narrative.slice(1, -1).map((record) => record["msg"])).toEqual(
      report.checks.flatMap(({ name }) => [
        `Check started: ${name}`,
        `Check passed: ${name}`,
      ]),
    );
    expect(narrative.at(-1)?.["msg"]).toBe(
      "Verification passed; UI remains unverified.",
    );
    expect(
      narrative.some((record) =>
        String(record["msg"]).includes("config.set save"),
      ),
    ).toBe(true);
    expect(
      logRecords()
        .filter((record) => record["operation"] === "http.reject")
        .map((record) => record["statusCode"]),
    ).toEqual([401, 401, 401, 401, 405, 415, 413]);
    const output = JSON.stringify([report, logRecords()]);
    for (const sensitive of [
      secret,
      primary,
      secondary,
      "Authorization",
      "poc-😀",
    ]) {
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

  it("reports deployment readiness failures before checking configuration or writing", async () => {
    const cases = [
      [
        503,
        "Service Unavailable",
        "text/plain",
        "runtime RPC_BEARER_SECRET is missing",
      ],
      [
        401,
        "Unauthorized",
        "text/plain",
        "deployed endpoint rejected RPC_BEARER_SECRET",
      ],
      [
        503,
        "<html>proxy unavailable</html>",
        "text/html",
        "Unexpected HTTP response",
      ],
      [404, "Not Found", "text/plain", "Unexpected HTTP response"],
    ] as const;
    for (const [status, body, media, guidance] of cases) {
      const fetcher = vi.fn(
        async () =>
          new Response(body, {
            status,
            headers: { "Content-Type": media },
          }),
      );
      const report = await verifyDeployed(environment, fetcher);
      expect(report.checks.map(({ name }) => name)).toEqual([
        "preflight",
        "deployed readiness",
      ]);
      expect(report.checks.at(-1)).toMatchObject({
        status: "failed",
        message: expect.stringContaining(guidance),
      });
      expect(report.configurationMayHaveChanged).toBe(false);
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(report)).not.toContain(secret);
      expect(JSON.stringify(report)).not.toContain(primary);
      if (status === 503 && media === "text/plain") {
        expect(report.checks.at(-1)?.message).toContain(
          "npm run forge:variables:set",
        );
        expect(report.checks.at(-1)?.message).toContain("npm run forge:deploy");
      }
    }
  });

  it("rejects malformed readiness envelopes without exposing returned values", async () => {
    for (const value of [
      { jsonrpc: "2.0", id: 1, result: { configured: false, prefix: null } },
      {
        jsonrpc: "2.0",
        id: 0,
        result: { configured: false, prefix: "private-prefix" },
      },
      {
        jsonrpc: "2.0",
        id: 0,
        result: { configured: true, prefix: "x".repeat(65) },
      },
      {
        jsonrpc: "2.0",
        id: 0,
        result: { configured: true, prefix: "private-prefix" },
        extra: "private-detail",
      },
    ]) {
      const fetcher = vi.fn(
        async () =>
          new Response(JSON.stringify(value), {
            headers: { "Content-Type": "application/json" },
          }),
      );
      const report = await verifyDeployed(environment, fetcher);
      expect(report.checks.at(-1)).toMatchObject({
        name: "deployed readiness",
        status: "failed",
        message: expect.stringContaining("JSON-RPC contract"),
      });
      expect(report.configurationMayHaveChanged).toBe(false);
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(report)).not.toContain("private-");
    }
  });

  it("checks optional second-installation readiness before any write", async () => {
    const { fetcher: adapter, prefixes } = transport();
    const fetcher = vi.fn((url: string, init: RequestInit) =>
      url === secondary
        ? Promise.resolve(
            new Response("Unauthorized", {
              status: 401,
              headers: { "Content-Type": "text/plain" },
            }),
          )
        : adapter(url, init),
    );
    const report = await verifyDeployed(
      { ...environment, RPC_VERIFY_ISOLATION_URL: secondary },
      fetcher,
    );
    expect(report.checks.at(-1)).toMatchObject({
      name: "second installation readiness",
      status: "failed",
      message: expect.stringContaining("rejected RPC_BEARER_SECRET"),
    });
    expect(report.configurationMayHaveChanged).toBe(false);
    expect(prefixes.size).toBe(0);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("refuses configured installations before attempting any writes", async () => {
    const { fetcher, prefixes } = transport("existing setup");
    const report = await verifyDeployed(environment, fetcher);
    expect(report.status).toBe("failed");
    expect(report.checks).toContainEqual(
      expect.objectContaining({ name: "deployed readiness", status: "passed" }),
    );
    expect(report.checks.at(-1)).toMatchObject({
      name: "config.get unset",
      message: expect.stringContaining("already saved"),
    });
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
      expect(report.checks.at(-1)).toMatchObject({
        name: "deployed readiness",
        status: "failed",
        message: expect.any(String),
      });
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
