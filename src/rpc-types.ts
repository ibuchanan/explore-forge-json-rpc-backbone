import type { JSONRPCResponse } from "json-rpc-2.0";

export type Commands = {
  "config.get": {
    params: Record<string, never>;
    result: { configured: boolean; prefix: string | null };
  };
  "config.set": { params: { prefix: string }; result: { configured: true } };
  "integration.preview": {
    params: { text: string };
    result: { output: string };
  };
};

export type RpcRequest = {
  [M in keyof Commands]: {
    jsonrpc: "2.0";
    method: M;
    params: Commands[M]["params"];
    id: string | number;
  };
}[keyof Commands];

export type RpcDefinitions = { rpc: (payload: RpcRequest) => JSONRPCResponse };
