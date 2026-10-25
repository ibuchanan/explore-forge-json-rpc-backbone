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

export type ReadCommand = "config.get" | "integration.preview";
export type CommandFailure =
  | "forbidden"
  | "method-not-found"
  | "invalid-params"
  | "not-configured"
  | "internal";

export async function execute(
  method: ReadCommand,
  params: unknown,
  caller: Caller,
  store: PrefixStore,
): Promise<Result<Commands[ReadCommand]["result"], CommandFailure>> {
  if (!caller.authorized || !["api", "ui"].includes(caller.source))
    return err("forbidden");
  try {
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
