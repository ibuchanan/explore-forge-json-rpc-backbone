import {
  JSONRPCErrorCode,
  JSONRPCErrorException,
  JSONRPCServer,
  createJSONRPCErrorResponse,
  type JSONRPCResponse,
  type JSONRPCRequest,
} from "json-rpc-2.0";

export interface PrefixStore {
  get(): Promise<string | undefined>;
  set(prefix: string): Promise<void>;
}

export type Caller = { source: "api" | "ui"; authorized: boolean };
type CommandContext = { caller: Caller; store: PrefixStore };

// The library's default error listener logs raw exceptions (including secrets).
const server = new JSONRPCServer<CommandContext>({ errorListener: () => {} });
server.mapErrorToJSONRPCErrorResponse = (id, error: unknown) =>
  error instanceof JSONRPCErrorException &&
  (error.code === -32602 || error.code === -32001)
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
  if (value === undefined) return rpcError(null, -32700, "Parse error");
  const candidate =
    value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  const id =
    candidate &&
    (typeof candidate["id"] === "string" ||
      (typeof candidate["id"] === "number" && Number.isFinite(candidate["id"])))
      ? candidate["id"]
      : null;
  if (
    !candidate ||
    candidate["jsonrpc"] !== "2.0" ||
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
    return rpcError(id, -32600, "Invalid Request");
  }
  if (!caller.authorized || !["api", "ui"].includes(caller.source)) {
    return rpcError(id, -32001, "Forbidden");
  }
  // Library methods receive only server-constructed context, not client fields.
  const response = await server.receive(
    candidate as unknown as JSONRPCRequest,
    { caller, store },
  );
  return response ?? rpcError(id, -32603, "Internal error");
}
