import type { WebTriggerRequest, WebTriggerResponse } from "@forge/api";
import { kvs } from "@forge/kvs";
import { handleHttp } from "./http";

const store = {
  get: () => kvs.get<string>("config.prefix"),
  set: (prefix: string) => kvs.set("config.prefix", prefix),
};

export function run(event: WebTriggerRequest): Promise<WebTriggerResponse> {
  return handleHttp(event, process.env["RPC_BEARER_SECRET"], store);
}
