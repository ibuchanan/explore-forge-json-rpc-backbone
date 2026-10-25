import { err, ok, type Result } from "@forge-ahead/errors";

export interface PrefixStore {
  get(): Promise<string | undefined>;
  set(prefix: string): Promise<void>;
  reset(): Promise<void>;
}

export type Caller = { source: "api" | "ui"; authorized: boolean };

export type Commands = {
  "config.get": {
    params: Record<string, never>;
    result: { configured: boolean; prefix: string | null };
  };
  "config.set": { params: { prefix: string }; result: { configured: true } };
  "config.reset": {
    params: { confirm: true };
    result: { configured: false };
  };
  "integration.preview": {
    params: { text: string };
    result: { output: string };
  };
};

const object = (
  params: unknown,
  keys: string[],
): params is Record<string, unknown> =>
  params !== null &&
  typeof params === "object" &&
  !Array.isArray(params) &&
  Object.keys(params).length === keys.length &&
  keys.every((key) => Object.hasOwn(params, key));

export type Command = keyof Commands;
export type CommandFailure =
  | "forbidden"
  | "method-not-found"
  | "invalid-params"
  | "not-configured"
  | "internal";

export async function execute(
  method: Command,
  params: unknown,
  caller: Caller,
  store: PrefixStore,
): Promise<Result<Commands[Command]["result"], CommandFailure>> {
  if (!caller.authorized || !["api", "ui"].includes(caller.source))
    return err("forbidden");
  try {
    if (method === "config.set") {
      if (!object(params, ["prefix"]) || typeof params["prefix"] !== "string")
        return err("invalid-params");
      const prefix = params["prefix"].trim();
      if (!prefix || [...prefix].length > 64) return err("invalid-params");
      await store.set(prefix);
      return ok({ configured: true });
    }
    if (method === "config.reset") {
      if (!object(params, ["confirm"]) || params["confirm"] !== true)
        return err("invalid-params");
      if (caller.source !== "ui") return err("forbidden");
      await store.reset();
      return ok({ configured: false });
    }
    if (method === "config.get") {
      if (!object(params, [])) return err("invalid-params");
      const prefix = await store.get();
      return ok({ configured: prefix !== undefined, prefix: prefix ?? null });
    }
    if (method !== "integration.preview") return err("method-not-found");
    if (!object(params, ["text"]) || typeof params["text"] !== "string")
      return err("invalid-params");
    const text = params["text"];
    if ([...text].length > 2000) return err("invalid-params");
    const prefix = await store.get();
    return prefix === undefined
      ? err("not-configured")
      : ok({ output: prefix + text });
  } catch {
    return err("internal");
  }
}
