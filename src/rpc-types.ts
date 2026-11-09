import type { Commands } from "./generated/rpc/contract";

export type { Caller as TypedCaller, Commands } from "./generated/rpc/contract";

export type RpcRequest = {
  [M in keyof Commands]: {
    jsonrpc: "2.0";
    method: M;
    params: Commands[M]["params"];
    id: string | number;
  };
}[keyof Commands];

export type RpcResponse = {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string };
};

export type RpcDefinitions = { rpc: (payload: RpcRequest) => RpcResponse };
