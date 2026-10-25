import api, { route } from "@forge/api";
import { makeResolver } from "@forge/resolver";
import { dispatch } from "./commands";
import type { RpcDefinitions } from "./rpc-types";
import { store } from "./store";

export const handler = makeResolver<RpcDefinitions>({
  async rpc({ payload, context }) {
    let authorized = false;
    if (
      typeof context["accountId"] === "string" &&
      context["accountId"].trim()
    ) {
      try {
        const response = await api
          .asUser()
          .requestJira(route`/rest/api/3/mypermissions?permissions=ADMINISTER`);
        if (response.ok) {
          const body = (await response.json()) as {
            permissions?: { ADMINISTER?: { havePermission?: unknown } };
          } | null;
          authorized = body?.permissions?.ADMINISTER?.havePermission === true;
        }
      } catch {
        // A failed permission check never authorizes storage access.
      }
    }
    return dispatch(payload, { source: "ui", authorized }, store);
  },
});
