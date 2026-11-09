// Generated from docs/reference/openrpc.json; do not edit.
import type { Result } from "@forge-ahead/errors";

export interface Commands {
  "config.get": {
    params: Record<string, never>;
    result: { configured: boolean; prefix: string | null };
  };
  "config.set": { params: { prefix: string }; result: { configured: true } };
  "integration.preview": {
    params: { text: string };
    result: { output: string };
  };
  "config.reset": { params: { confirm: true }; result: { configured: false } };
}
export type HandlerMap<Context, Failure> = {
  [M in keyof Commands]: (
    params: Commands[M]["params"],
    context: Context,
  ) => Promise<Result<Commands[M]["result"], Failure>>;
};
export type Caller = <M extends keyof Commands>(
  method: M,
  params: Commands[M]["params"],
) => Promise<Commands[M]["result"]>;
