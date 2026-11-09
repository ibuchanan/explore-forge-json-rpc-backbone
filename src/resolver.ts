import api, { route } from "@forge/api";
import { makeResolver } from "@forge/resolver";
import { createAdoptedRpc } from "./adoption";
import { logger } from "./logging";
import type { RpcDefinitions } from "./rpc-types";
import { store } from "./store";

const { dispatch } = createAdoptedRpc({ store });

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
    logger.info({ operation: "rpc.invoke", source: "ui" }, "RPC invoked");
    const response = await dispatch(payload, {
      caller: { source: "ui", authorized },
      store,
    });
    const code = "error" in response ? response.error.code : undefined;
    const log =
      code === -32603
        ? logger.error
        : code === undefined
          ? logger.info
          : logger.warn;
    log(
      {
        operation: "rpc.complete",
        outcome:
          code === undefined
            ? "succeeded"
            : code === -32603
              ? "failed"
              : "rejected",
        ...(code !== undefined && { rpcCode: code }),
      },
      code === undefined ? "RPC completed" : "RPC returned a sanitized error",
    );
    return response;
  },
});
