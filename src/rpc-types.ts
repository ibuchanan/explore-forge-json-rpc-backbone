import type { JSONRPCResponse } from "json-rpc-2.0";

import type { Commands } from "./executor";

export type { Commands } from "./executor";

export type RpcRequest = {
  [M in keyof Commands]: {
    jsonrpc: "2.0";
    method: M;
    params: Commands[M]["params"];
    id: string | number;
  };
}[keyof Commands];

export type RpcDefinitions = { rpc: (payload: RpcRequest) => JSONRPCResponse };
