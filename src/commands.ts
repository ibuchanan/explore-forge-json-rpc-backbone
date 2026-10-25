import { randomUUID } from "node:crypto";
import { createDemoNarrative } from "@forge-ahead/logging/demo";
import {
  createJSONRPCErrorResponse,
  JSONRPCErrorCode,
  JSONRPCErrorException,
  type JSONRPCRequest,
  type JSONRPCResponse,
  JSONRPCServer,
} from "json-rpc-2.0";
import { logger } from "./logging";

export interface PrefixStore {
  get(): Promise<string | undefined>;
  set(prefix: string): Promise<void>;
  reset(): Promise<void>;
}

export type Caller = { source: "api" | "ui"; authorized: boolean };
type CommandContext = { caller: Caller; store: PrefixStore };

// The library's default error listener logs raw exceptions (including secrets).
const server = new JSONRPCServer<CommandContext>({ errorListener: () => {} });
server.mapErrorToJSONRPCErrorResponse = (id, error: unknown) =>
  error instanceof JSONRPCErrorException &&
  (error.code === -32602 || error.code === -32001 || error.code === -32002)
    ? createJSONRPCErrorResponse(id, error.code, error.message)
    : createJSONRPCErrorResponse(
        id,
        JSONRPCErrorCode.InternalError,
        "Internal error",
      );

const object = (
  params: unknown,
  keys: string[],
): params is Record<string, unknown> =>
  params !== null &&
  typeof params === "object" &&
  !Array.isArray(params) &&
  Object.keys(params).length === keys.length &&
  keys.every((key) => Object.hasOwn(params, key));
const invalidParams = (): never => {
  throw new JSONRPCErrorException("Invalid params", -32602);
};

server.addMethod("config.get", async (params, { store }) => {
  if (!object(params, [])) invalidParams();
  const prefix = await store.get();
  return { configured: prefix !== undefined, prefix: prefix ?? null };
});
server.addMethod("config.set", async (params, { store }) => {
  if (!object(params, ["prefix"]) || typeof params["prefix"] !== "string")
    invalidParams();
  const prefix = (params["prefix"] as string).trim();
  if (!prefix || [...prefix].length > 64) invalidParams();
  await store.set(prefix);
  return { configured: true };
});
server.addMethod("config.reset", async (params, { caller, store }) => {
  if (!object(params, ["confirm"]) || params["confirm"] !== true)
    invalidParams();
  if (caller.source !== "ui") {
    throw new JSONRPCErrorException("Forbidden", -32001);
  }
  await store.reset();
  return { configured: false };
});

server.addMethod("integration.preview", async (params, { store }) => {
  if (!object(params, ["text"]) || typeof params["text"] !== "string")
    invalidParams();
  const text = params["text"] as string;
  if ([...text].length > 2000) invalidParams();
  const prefix = await store.get();
  if (prefix === undefined)
    throw new JSONRPCErrorException("Not configured", -32002);
  return { output: prefix + text };
});

export const rpcError = (
  id: string | number | null,
  code: number,
  message: string,
): JSONRPCResponse => createJSONRPCErrorResponse(id, code, message);

/** Single-call subset: reject unsupported JSON-RPC forms before the library can execute them. */
export async function dispatch(
  payload: unknown,
  caller: Caller,
  store: PrefixStore,
): Promise<JSONRPCResponse> {
  const value =
    typeof payload === "string"
      ? (() => {
          try {
            return JSON.parse(payload) as unknown;
          } catch {
            return undefined;
          }
        })()
      : payload;
  const candidate =
    value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  const method =
    ["config.get", "config.set", "config.reset", "integration.preview"].find(
      (known) => known === candidate?.["method"],
    ) ?? "unknown";
  const log = logger.child({
    invocationId: randomUUID(),
    source:
      caller.source === "api" || caller.source === "ui"
        ? caller.source
        : "unknown",
    method,
  });
  const story = createDemoNarrative(log, { storyId: "rpc-lifecycle" });
  const started = performance.now();
  log.info({ operation: "rpc.invoke" }, "RPC invoked");
  story.step(
    "Validate the single-call envelope and trusted caller before executing a command.",
  );
  const complete = (response: JSONRPCResponse): JSONRPCResponse => {
    const code = response.error?.code;
    const messages: Record<number, string> = {
      [-32700]: "Reject malformed JSON before executing a command.",
      [-32600]:
        "Reject the unsupported request envelope before executing a command.",
      [-32601]: "Reject an unknown RPC method.",
      [-32602]:
        "Reject invalid command parameters without changing configuration.",
      [-32001]: "Deny the command because this caller is not permitted.",
      [-32002]: "Preview is unavailable until configuration has been saved.",
      [-32603]:
        "The command failed internally; no exception details are recorded and a write may be uncertain.",
    };
    const successes: Record<string, string> = {
      "config.get":
        response.result?.configured === true
          ? "Read saved configuration; the prefix value is omitted."
          : "Read configuration; no prefix is saved.",
      "config.set":
        "Save completed; use a separate read to verify persistence.",
      "config.reset":
        "The authorized admin reset completed; use a separate read to verify empty state.",
      "integration.preview":
        "Preview completed using saved configuration; input and output are omitted.",
    };
    story.step(
      code === undefined
        ? (successes[method] ?? "RPC completed.")
        : (messages[code] ?? "RPC rejected."),
    );
    log[code === -32603 ? "error" : code === undefined ? "info" : "warn"](
      {
        operation: "rpc.complete",
        outcome:
          code === undefined
            ? "succeeded"
            : code === -32603
              ? "failed"
              : "rejected",
        ...(code !== undefined && { rpcCode: code }),
        elapsedMs: performance.now() - started,
      },
      code === undefined ? "RPC completed" : "RPC returned a sanitized error",
    );
    return response;
  };
  if (value === undefined)
    return complete(rpcError(null, -32700, "Parse error"));
  const id =
    candidate &&
    (typeof candidate["id"] === "string" ||
      (typeof candidate["id"] === "number" && Number.isFinite(candidate["id"])))
      ? candidate["id"]
      : null;
  if (
    candidate?.["jsonrpc"] !== "2.0" ||
    typeof candidate["method"] !== "string" ||
    !candidate["method"] ||
    !Object.hasOwn(candidate, "id") ||
    id === null ||
    !Object.hasOwn(candidate, "params") ||
    candidate["params"] === null ||
    typeof candidate["params"] !== "object" ||
    Array.isArray(candidate["params"]) ||
    Object.keys(candidate).some(
      (key) => !["jsonrpc", "method", "params", "id"].includes(key),
    )
  ) {
    return complete(rpcError(id, -32600, "Invalid Request"));
  }
  if (!caller.authorized || !["api", "ui"].includes(caller.source)) {
    return complete(rpcError(id, -32001, "Forbidden"));
  }
  // Library methods receive only server-constructed context, not client fields.
  const response = await server.receive(
    candidate as unknown as JSONRPCRequest,
    { caller, store },
  );
  return complete(response ?? rpcError(id, -32603, "Internal error"));
}
