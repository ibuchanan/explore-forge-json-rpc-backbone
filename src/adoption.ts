import { err, type Result } from "@forge-ahead/errors";
import { createDispatcher, createWebDispatcher } from "forge-ahead-rpc";
import { createWebtrigger } from "forge-ahead-rpc/webtrigger";
import {
  type CommandFailure,
  type Context,
  handlers,
  type PrefixStore,
} from "./executor";
import { catalog } from "./generated/rpc/catalog";
import type { HandlerMap } from "./generated/rpc/contract";
import {
  inputValidators,
  outputValidators,
} from "./generated/rpc/validators.js";
import { webPolicy } from "./generated/rpc/web-policy";
import { createJiraAdminAuthenticator } from "./jira-admin-authenticator";
import { rpcErrors } from "./rpc-errors";

type Failure = CommandFailure | "internal-error";
const errorCatalog = {
  "not-configured": {
    code: rpcErrors["not-configured"].code,
    title: rpcErrors["not-configured"].message,
  },
} as const;

// The app owns normalization, authorization and storage. This adapter does not
// turn an application failure into a transport policy or retry instruction.
const adapt =
  <Params, Output>(
    run: (
      params: Params,
      context: Context,
    ) => Promise<Result<Output, CommandFailure>>,
  ): ((params: Params, context: Context) => Promise<Result<Output, Failure>>) =>
  async (params, context) => {
    if (
      !context.caller.authorized ||
      !["api", "ui"].includes(context.caller.source)
    )
      return err("forbidden");
    try {
      return await run(params, context);
    } catch {
      return err("internal-error");
    }
  };

const appHandlers = {
  "config.get": adapt(handlers["config.get"]),
  "config.set": adapt(handlers["config.set"]),
  "integration.preview": adapt(handlers["integration.preview"]),
  "config.reset": adapt(handlers["config.reset"]),
} satisfies HandlerMap<Context, Failure>;

export function createAdoptedRpc({ store }: { store: PrefixStore }) {
  const dispatch = createDispatcher({
    handlers: appHandlers,
    inputValidators,
    outputValidators,
    errorCatalog,
  });
  const web = createWebDispatcher({
    handlers: appHandlers,
    inputValidators,
    outputValidators,
    errorCatalog,
    webPolicy,
    catalog,
    // Exposure is none until a reviewed per-installation selection is supplied.
  });
  return { dispatch, web, store };
}

/** The entry point supplies installation and site data resolved through Forge. */
export function createAdoptedWebtrigger(options: {
  store: PrefixStore;
  requestJira: (
    url: string,
    authorization: string,
  ) => Promise<{ status: number; body: unknown }>;
}) {
  return createWebtrigger({
    handlers: appHandlers,
    inputValidators,
    outputValidators,
    errorCatalog,
    webPolicy,
    catalog,
    installation: (context: {
      installation?: { id: string; jiraSiteUrl: string } | undefined;
    }) => context.installation,
    authenticate: createJiraAdminAuthenticator(options.requestJira),
    context: (_installation, _principal) => ({
      caller: { source: "api" as const, authorized: true },
      store: options.store,
    }),
    selection: () => ({
      "config.get": "asApp",
      "integration.preview": "asApp",
    }),
    authorize: (_method, mode, context) =>
      mode === "asApp" && context.caller.authorized,
  });
}
