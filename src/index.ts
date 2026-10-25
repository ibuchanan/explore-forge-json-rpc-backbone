import type { WebTriggerRequest, WebTriggerResponse } from "@forge/api";
import { handleHttp } from "./http";
import { store } from "./store";

export function run(event: WebTriggerRequest): Promise<WebTriggerResponse> {
  return handleHttp(event, process.env["RPC_BEARER_SECRET"], store);
}
