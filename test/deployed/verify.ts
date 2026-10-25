import { isDeepStrictEqual } from "node:util";

type Environment = Record<string, string | undefined>;
type Transport = (url: string, init: RequestInit) => Promise<Response>;
type Check = {
  name: string;
  status: "passed" | "failed";
  elapsedMs: number;
  message?: string;
};

const request = (
  method: string,
  params: unknown = {},
  id: string | number = 0,
) => ({
  jsonrpc: "2.0",
  method,
  params,
  id,
});
const result = (id: string | number, value: unknown) => ({
  jsonrpc: "2.0",
  id,
  result: value,
});
const error = (id: string | number | null, code: number, message: string) => ({
  jsonrpc: "2.0",
  id,
  error: { code, message },
});
const unset = { configured: false, prefix: null };
const prefix = "poc-😀";

function endpoint(value: string | undefined): string {
  const url = new URL(value ?? "");
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error("Invalid endpoint");
  }
  return url.href;
}

// This runner never imports Forge or dispatches commands directly. Local tests
// inject the HTTP adapter; the opt-in entry point supplies the real fetch.
export async function verifyDeployed(env: Environment, send: Transport) {
  const started = performance.now();
  const report = {
    startedAt: new Date().toISOString(),
    status: "failed" as "passed" | "failed",
    elapsedMs: 0,
    configurationMayHaveChanged: false,
    isolation: "unverified" as "unverified" | "verified",
    ui: "unverified" as const,
    checks: [] as Check[],
  };
  async function check(
    name: string,
    action: () => void | Promise<void>,
    messageSupplier?: () => string | undefined,
  ) {
    const start = performance.now();
    try {
      await action();
      report.checks.push({
        name,
        status: "passed",
        elapsedMs: performance.now() - start,
      });
    } catch {
      const message = messageSupplier?.();
      report.checks.push({
        name,
        status: "failed",
        elapsedMs: performance.now() - start,
        ...(message && { message }),
      });
      // Do not expose assertion diffs, fetch errors, URLs, headers, or bodies.
      throw new Error("Verification failed");
    }
  }
  try {
    let url = "";
    let isolationUrl: string | undefined;
    const secret = env["RPC_BEARER_SECRET"] ?? "";

    // Sequential preflight validations with actionable diagnostics
    let preflightMessage: string | undefined;
    await check(
      "preflight",
      () => {
        // RPC_VERIFY_APPROVED must be "development"
        if (env["RPC_VERIFY_APPROVED"] !== "development") {
          preflightMessage = "RPC_VERIFY_APPROVED must be development";
          throw new Error();
        }

        // FORGE_ENVIRONMENT must be "development"
        if (env["FORGE_ENVIRONMENT"] !== "development") {
          preflightMessage = "FORGE_ENVIRONMENT must be development";
          throw new Error();
        }

        // FORGE_PRODUCT must be "jira"
        if (env["FORGE_PRODUCT"] !== "jira") {
          preflightMessage = "FORGE_PRODUCT must be jira";
          throw new Error();
        }

        // FORGE_SITE must be non-blank
        if (!env["FORGE_SITE"]?.trim()) {
          preflightMessage = "FORGE_SITE required and must not be whitespace";
          throw new Error();
        }

        // RPC_BEARER_SECRET must be non-empty and valid bearer syntax
        if (!secret) {
          preflightMessage = "RPC_BEARER_SECRET required";
          throw new Error();
        }
        if (!/^[A-Za-z0-9._~+/-]+={0,2}$/.test(secret)) {
          preflightMessage = "RPC_BEARER_SECRET invalid bearer syntax";
          throw new Error();
        }

        // RPC_VERIFY_URL required and valid HTTPS without credentials, query, fragment
        try {
          url = endpoint(env["RPC_VERIFY_URL"]);
        } catch {
          preflightMessage =
            "RPC_VERIFY_URL required valid HTTPS URL without credentials query or fragment";
          throw new Error();
        }

        // Optional RPC_VERIFY_ISOLATION_URL same validation and must be distinct
        if (env["RPC_VERIFY_ISOLATION_URL"] !== undefined) {
          try {
            isolationUrl = endpoint(env["RPC_VERIFY_ISOLATION_URL"]);
          } catch {
            preflightMessage =
              "RPC_VERIFY_ISOLATION_URL invalid HTTPS URL without credentials query or fragment";
            throw new Error();
          }
          if (isolationUrl === url) {
            preflightMessage =
              "RPC_VERIFY_ISOLATION_URL must be distinct normalized from primary";
            throw new Error();
          }
        }
      },
      () => preflightMessage,
    );
    const invalidToken = `${secret.replace(/=+$/, "")}-invalid`;
    const authorization = `Bearer ${secret}`;
    async function probe(
      name: string,
      body: unknown,
      expected: unknown,
      options: {
        url?: string;
        status?: number;
        method?: string;
        media?: string;
        auth?: string | null;
      } = {},
    ) {
      await check(name, async () => {
        const headers: Record<string, string> = {
          "Content-Type": options.media ?? "application/json",
        };
        if (options.auth !== null)
          headers["Authorization"] = options.auth ?? authorization;
        const method = options.method ?? "POST";
        const response = await send(options.url ?? url, {
          method,
          headers,
          ...(method === "GET"
            ? {}
            : { body: typeof body === "string" ? body : JSON.stringify(body) }),
          redirect: "error",
          signal: AbortSignal.timeout(20_000),
        });
        const chunks: Uint8Array[] = [];
        let bytes = 0;
        const reader = response.body?.getReader();
        if (reader) {
          try {
            while (true) {
              const chunk = await reader.read();
              if (chunk.done) break;
              bytes += chunk.value.byteLength;
              if (bytes > 32_768) throw new Error("Response too large");
              chunks.push(chunk.value);
            }
          } finally {
            await reader.cancel();
          }
        }
        const text = Buffer.concat(chunks).toString("utf8");
        const exposed = `${JSON.stringify([...response.headers])}\n${text}`;
        if ([secret, invalidToken].some((token) => exposed.includes(token))) {
          throw new Error("Credential exposure");
        }
        const media = response.headers.get("content-type") ?? "";
        const validMedia =
          typeof expected === "string"
            ? /^text\/plain(?:\s*;|$)/i.test(media)
            : /^application\/json(?:\s*;|$)/i.test(media);
        if (
          response.status !== (options.status ?? 200) ||
          !validMedia ||
          !isDeepStrictEqual(
            typeof expected === "string" ? text : JSON.parse(text),
            expected,
          )
        ) {
          throw new Error("Response mismatch");
        }
      });
    }

    await probe("config.get unset", request("config.get"), result(0, unset));
    if (isolationUrl) {
      await probe(
        "second installation unset before save",
        request("config.get"),
        result(0, unset),
        { url: isolationUrl },
      );
    }
    for (const [name, auth] of [
      ["absent", null],
      ["invalid", `Bearer ${invalidToken}`],
      ["malformed", `Basic ${secret}`],
      ["combined duplicate", `${authorization}, ${authorization}`],
    ] as const) {
      await probe(
        `authorization ${name}`,
        request("config.get"),
        "Unauthorized",
        { auth, status: 401 },
      );
    }
    await probe("wrong verb", request("config.get"), "Method Not Allowed", {
      method: "GET",
      status: 405,
    });
    await probe(
      "wrong media type",
      request("config.get"),
      "Unsupported Media Type",
      { media: "text/plain", status: 415 },
    );
    await probe("oversized body", " ".repeat(16_385), "Payload Too Large", {
      status: 413,
    });
    await probe("malformed JSON", "{", error(null, -32700, "Parse error"));
    const read = request("config.get", {}, "protocol");
    for (const [name, payload, id] of [
      ["batch", [read], null],
      [
        "notification",
        { jsonrpc: "2.0", method: "config.get", params: {} },
        null,
      ],
      ["nullable ID", { ...read, id: null }, null],
      ["positional params", { ...read, params: [] }, "protocol"],
      [
        "extra context",
        { ...read, caller: { source: "ui", authorized: true } },
        "protocol",
      ],
      ["invalid envelope", { ...read, jsonrpc: "1.0" }, "protocol"],
    ] as const) {
      await probe(name, payload, error(id, -32600, "Invalid Request"));
    }
    await probe(
      "unknown method",
      request("unknown", {}, "unknown"),
      error("unknown", -32601, "Method not found"),
    );
    await probe(
      "extra params",
      request("config.get", { extra: true }),
      error(0, -32602, "Invalid params"),
    );
    await probe(
      "invalid preview params",
      request("integration.preview", { text: "x", prefix: "override" }),
      error(0, -32602, "Invalid params"),
    );
    await probe(
      "config.get still unset",
      request("config.get"),
      result(0, unset),
    );
    await probe(
      "preview before setup",
      request("integration.preview", { text: "hello" }, "unset"),
      error("unset", -32002, "Not configured"),
    );
    // A timed-out save may still persist. Never retry or claim rollback.
    report.configurationMayHaveChanged = true;
    await probe(
      "config.set save",
      request("config.set", { prefix: `  ${prefix}  ` }, "save"),
      result("save", { configured: true }),
    );
    await probe(
      "config.get persisted",
      request("config.get", {}, "read-back"),
      result("read-back", { configured: true, prefix }),
    );
    await probe(
      "config.reset forbidden for HTTP",
      request("config.reset", { confirm: true }, "reset-denied"),
      error("reset-denied", -32001, "Forbidden"),
    );
    await probe(
      "config.get preserved after forbidden reset",
      request("config.get", {}, "reset-read-back"),
      result("reset-read-back", { configured: true, prefix }),
    );
    for (const text of [" hello 😀\n<b>text</b>", "", "😀".repeat(2000)]) {
      await probe(
        `preview ${text === "" ? "empty" : text.length > 2000 ? "Unicode boundary" : "exact text"}`,
        request("integration.preview", { text }, "preview"),
        result("preview", { output: prefix + text }),
      );
    }
    await probe(
      "preview over limit",
      request("integration.preview", { text: "😀".repeat(2001) }),
      error(0, -32602, "Invalid params"),
    );
    if (isolationUrl) {
      await probe(
        "second installation unset after save",
        request("config.get"),
        result(0, unset),
        { url: isolationUrl },
      );
      await probe(
        "second installation preview not configured",
        request("integration.preview", { text: "hello" }),
        error(0, -32002, "Not configured"),
        { url: isolationUrl },
      );
      report.isolation = "verified";
    }
    report.status = "passed";
  } catch {
    // The failed named check is sufficient evidence; raw exceptions are unsafe.
  }
  report.elapsedMs = performance.now() - started;
  return report;
}
