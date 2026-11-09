import { err, ok } from "@forge-ahead/errors";
import type { HandlerMap } from "./generated/rpc/contract";

export interface PrefixStore {
  get(): Promise<string | undefined>;
  set(prefix: string): Promise<void>;
  reset(): Promise<void>;
}

export type Caller = { source: "api" | "ui"; authorized: boolean };
export type CommandFailure = "forbidden" | "invalid-params" | "not-configured";

export type Context = { caller: Caller; store: PrefixStore };

// The package dispatcher validates envelopes, parameter shapes and result shapes
// from the generated contract. These handlers own only app policy: trimming,
// caller source and storage.
export const handlers = {
  "config.set": async ({ prefix }, { store }) => {
    const trimmed = prefix.trim();
    if (!trimmed) return err("invalid-params");
    await store.set(trimmed);
    return ok({ configured: true });
  },
  "config.reset": async (_params, { caller, store }) => {
    if (caller.source !== "ui") return err("forbidden");
    await store.reset();
    return ok({ configured: false });
  },
  "config.get": async (_params, { store }) => {
    const prefix = await store.get();
    return ok({ configured: prefix !== undefined, prefix: prefix ?? null });
  },
  "integration.preview": async ({ text }, { store }) => {
    const prefix = await store.get();
    return prefix === undefined
      ? err("not-configured")
      : ok({ output: prefix + text });
  },
} satisfies HandlerMap<Context, CommandFailure>;
