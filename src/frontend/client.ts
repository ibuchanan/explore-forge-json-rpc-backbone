import { makeInvoke } from "@forge/bridge";
import type { Commands, RpcDefinitions, RpcRequest } from "../rpc-types";

const invoke = makeInvoke<RpcDefinitions>();
let sequence = 0;

export class RpcFailure extends Error {
  constructor(readonly code: number) {
    super("Command failed");
  }
}

export async function rpc<M extends keyof Commands>(
  method: M,
  params: Commands[M]["params"],
): Promise<Commands[M]["result"]> {
  const id = ++sequence;
  const response = await invoke("rpc", {
    jsonrpc: "2.0",
    method,
    params,
    id,
  } as RpcRequest);
  if (response?.jsonrpc !== "2.0" || response.id !== id)
    throw new Error("Invalid response");
  if (response.error) throw new RpcFailure(response.error.code);
  const result = response.result as Commands[M]["result"];
  if (!result || typeof result !== "object") throw new Error("Invalid result");
  return result;
}

export function failureMessage(error: unknown): string {
  if (error instanceof RpcFailure) {
    if (error.code === -32001)
      return "Jira administrator access and a successful permission check are required. Check your access, then retry.";
    if (error.code === -32002)
      return "Not configured. Save a prefix, then run the preview again.";
    if (error.code === -32602) return "Check the field limits and try again.";
  }
  return "The request could not be completed. Retry; if it continues, contact your app administrator.";
}
