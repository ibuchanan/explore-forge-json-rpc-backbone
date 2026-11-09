/**
 * Opt-in, read-only live check of the deployed `config-rpc` web trigger.
 *
 * Run through SecretSpec so settings come from the environment:
 *   npm run test:deployed
 *
 * It sends only reads and negative probes. It never saves or resets
 * configuration, never prints credentials, URLs or saved values, and stops at
 * the first failed check. Stdout carries a sanitized JSON report; stderr carries
 * one line per check.
 */
import { pathToFileURL } from "node:url";

type Env = Record<string, string | undefined>;
type Fetcher = (url: string, init: RequestInit) => Promise<Response>;
type Check = { name: string; status: "passed" | "failed"; detail?: string };
export type Report = { status: "passed" | "failed"; checks: Check[] };

export class PreconditionError extends Error {}

const exposed = ["config.get", "integration.preview"];
const sample = "verify-😀";
const maxResponseChars = 32_768;

type Probe = {
  status: number;
  json?: Record<string, unknown>;
};
type Auth = "valid" | "invalid" | "none";

function settings(env: Env) {
  const missing = [
    "RPC_VERIFY_URL",
    "RPC_VERIFY_EMAIL",
    "RPC_VERIFY_API_TOKEN",
  ].filter((name) => !env[name]);
  if (missing.length)
    throw new PreconditionError(
      `Required settings missing: ${missing.join(", ")}`,
    );
  if (
    env["FORGE_ENVIRONMENT"] !== "development" ||
    env["FORGE_PRODUCT"] !== "jira"
  )
    throw new PreconditionError(
      "Requires FORGE_ENVIRONMENT=development and FORGE_PRODUCT=jira.",
    );
  const email = env["RPC_VERIFY_EMAIL"] ?? "";
  const token = env["RPC_VERIFY_API_TOKEN"] ?? "";
  if (/[\s:]/.test(email) || /[\r\n]/.test(token))
    throw new PreconditionError(
      "RPC_VERIFY_EMAIL or RPC_VERIFY_API_TOKEN is malformed.",
    );
  let url: URL;
  try {
    url = new URL(env["RPC_VERIFY_URL"] ?? "");
  } catch {
    throw new PreconditionError("RPC_VERIFY_URL is not a valid URL.");
  }
  if (url.protocol !== "https:" || url.username || url.password)
    throw new PreconditionError(
      "RPC_VERIFY_URL must be https without credentials.",
    );
  return { url: url.href, email, token };
}

export async function verifyWebtrigger(
  env: Env,
  fetcher: Fetcher = fetch,
  log: (line: string) => void = () => {},
): Promise<Report> {
  const { url, email, token } = settings(env);
  const basic = (value: string) =>
    `Basic ${Buffer.from(`${email}:${value}`).toString("base64")}`;
  const authorization: Record<Auth, string | undefined> = {
    valid: basic(token),
    invalid: basic("invalid-verification-token"),
    none: undefined,
  };

  async function send(
    body: unknown,
    options: { auth?: Auth; method?: string; contentType?: string } = {},
  ): Promise<Probe> {
    const headers: Record<string, string> = {
      "Content-Type": options.contentType ?? "application/json",
    };
    const credential = authorization[options.auth ?? "valid"];
    if (credential) headers["Authorization"] = credential;
    const method = options.method ?? "POST";
    const response = await fetcher(url, {
      method,
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(20_000),
      ...(method === "GET" ? {} : { body: JSON.stringify(body) }),
    });
    const text = (await response.text()).slice(0, maxResponseChars);
    let json: Record<string, unknown> | undefined;
    try {
      const parsed: unknown = JSON.parse(text);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
        json = parsed as Record<string, unknown>;
    } catch {}
    return { status: response.status, ...(json ? { json } : {}) };
  }

  const rpc = (method: string, params: object = {}, id = 1) => ({
    jsonrpc: "2.0",
    method,
    params,
    id,
  });
  const errorCode = (probe: Probe) =>
    (probe.json?.["error"] as { code?: unknown } | undefined)?.code;
  const result = (probe: Probe) =>
    probe.status === 200 ? probe.json?.["result"] : undefined;

  const checks: Check[] = [];
  const run = async (name: string, test: () => Promise<string | undefined>) => {
    let detail: string | undefined;
    try {
      detail = await test();
    } catch {
      detail = "Request failed before a response was read.";
    }
    const check: Check = {
      name,
      status: detail === undefined ? "passed" : "failed",
      ...(detail === undefined ? {} : { detail }),
    };
    checks.push(check);
    log(
      `${check.status === "passed" ? "ok  " : "FAIL"} ${name}${detail ? `: ${detail}` : ""}`,
    );
    return check.status === "passed";
  };
  const expectStatus = (probe: Probe, status: number) =>
    probe.status === status
      ? undefined
      : `Expected HTTP ${status}, received ${probe.status}.`;

  let configured: boolean | undefined;
  let prefix: string | null | undefined;
  const steps: [string, () => Promise<string | undefined>][] = [
    [
      "rejects a request without credentials",
      async () =>
        expectStatus(await send(rpc("config.get"), { auth: "none" }), 401),
    ],
    [
      "rejects invalid credentials",
      async () =>
        expectStatus(await send(rpc("config.get"), { auth: "invalid" }), 401),
    ],
    [
      "rejects a GET",
      async () => expectStatus(await send(undefined, { method: "GET" }), 405),
    ],
    [
      "rejects a non-JSON media type",
      async () =>
        expectStatus(
          await send(rpc("config.get"), { contentType: "text/plain" }),
          415,
        ),
    ],
    [
      "exposes only the reviewed read methods",
      async () => {
        const probe = await send(rpc("rpc.discover"));
        const methods = (
          result(probe) as { methods?: { name?: string }[] } | undefined
        )?.methods
          ?.map((method) => method.name)
          .sort();
        return JSON.stringify(methods) === JSON.stringify([...exposed].sort())
          ? undefined
          : probe.status === 200
            ? "Discovery did not list exactly the reviewed read methods."
            : `Expected HTTP 200, received ${probe.status}.`;
      },
    ],
    [
      "reads configuration",
      async () => {
        const probe = await send(rpc("config.get"));
        const value = result(probe) as
          | { configured?: unknown; prefix?: unknown }
          | undefined;
        if (
          !value ||
          typeof value.configured !== "boolean" ||
          !(value.prefix === null || typeof value.prefix === "string") ||
          value.configured !== (value.prefix !== null)
        )
          return probe.status === 200
            ? "Result did not match the config.get contract."
            : `Expected HTTP 200, received ${probe.status}.`;
        configured = value.configured;
        prefix = value.prefix as string | null;
        return undefined;
      },
    ],
    [
      "previews consistently with the saved state",
      async () => {
        const probe = await send(rpc("integration.preview", { text: sample }));
        if (configured === false)
          return errorCode(probe) === -32002
            ? undefined
            : "Expected Not configured (-32002) before setup.";
        const output = (result(probe) as { output?: unknown } | undefined)
          ?.output;
        return output === `${prefix}${sample}`
          ? undefined
          : "Preview output did not equal the saved prefix followed by the text.";
      },
    ],
    [
      "rejects preview with an extra parameter",
      async () =>
        errorCode(
          await send(rpc("integration.preview", { text: sample, extra: true })),
        ) === -32602
          ? undefined
          : "Expected Invalid params (-32602).",
    ],
    [
      "does not expose config.set",
      async () =>
        errorCode(
          await send(rpc("config.set", { prefix: "must-not-save" })),
        ) === -32601
          ? undefined
          : "Expected Method not found (-32601).",
    ],
    [
      "does not expose config.reset",
      async () =>
        errorCode(await send(rpc("config.reset", { confirm: true }))) === -32601
          ? undefined
          : "Expected Method not found (-32601).",
    ],
  ];
  for (const [name, test] of steps) if (!(await run(name, test))) break;
  return {
    status:
      checks.length === steps.length &&
      checks.every((check) => check.status === "passed")
        ? "passed"
        : "failed",
    checks,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const report = await verifyWebtrigger(process.env, fetch, (line) =>
      console.error(line),
    );
    console.log(JSON.stringify(report));
    process.exitCode = report.status === "passed" ? 0 : 1;
  } catch (error) {
    console.error(
      error instanceof PreconditionError
        ? error.message
        : "Verification could not start.",
    );
    process.exitCode = 2;
  }
}
