import { err, ok, type Result } from "@forge-ahead/errors";
import type { CommandName, Commands, HandlerMap } from "./generated/commands";

export type { Commands } from "./generated/commands";

export interface PrefixStore {
  get(): Promise<string | undefined>;
  set(prefix: string): Promise<void>;
  reset(): Promise<void>;
}

export type Caller = { source: "api" | "ui"; authorized: boolean };
export type Command = CommandName;
export type CommandFailure =
  | "forbidden"
  | "method-not-found"
  | "invalid-params"
  | "not-configured"
  | "internal";

type Context = { caller: Caller; store: PrefixStore };
const object = (
  params: unknown,
  keys: string[],
): params is Record<string, unknown> =>
  params !== null &&
  typeof params === "object" &&
  !Array.isArray(params) &&
  Object.keys(params).length === keys.length &&
  keys.every((key) => Object.hasOwn(params, key));

// Accept unknown input at the runtime boundary; the generated map checks every
// command's implementation and successful output, without supplying app policy.
const handlers = {
  "config.set": async (params: unknown, { store }) => {
    if (!object(params, ["prefix"]) || typeof params["prefix"] !== "string")
      return err("invalid-params");
    const prefix = params["prefix"].trim();
    if (!prefix || [...prefix].length > 64) return err("invalid-params");
    await store.set(prefix);
    return ok({ configured: true });
  },
  "config.reset": async (params: unknown, { caller, store }) => {
    if (!object(params, ["confirm"]) || params["confirm"] !== true)
      return err("invalid-params");
    if (caller.source !== "ui") return err("forbidden");
    await store.reset();
    return ok({ configured: false });
  },
  "config.get": async (params: unknown, { store }) => {
    if (!object(params, [])) return err("invalid-params");
    const prefix = await store.get();
    return ok({ configured: prefix !== undefined, prefix: prefix ?? null });
  },
  "integration.preview": async (params: unknown, { store }) => {
    if (!object(params, ["text"]) || typeof params["text"] !== "string")
      return err("invalid-params");
    const text = params["text"];
    if ([...text].length > 2000) return err("invalid-params");
    const prefix = await store.get();
    return prefix === undefined
      ? err("not-configured")
      : ok({ output: prefix + text });
  },
} satisfies HandlerMap<Context, CommandFailure>;

export async function execute(
  method: Command,
  params: unknown,
  caller: Caller,
  store: PrefixStore,
): Promise<Result<Commands[Command]["result"], CommandFailure>> {
  if (!caller.authorized || !["api", "ui"].includes(caller.source))
    return err("forbidden");
  if (!Object.hasOwn(handlers, method)) return err("method-not-found");
  try {
    return await handlers[method](params, { caller, store });
  } catch {
    return err("internal");
  }
}
