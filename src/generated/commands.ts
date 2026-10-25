import type { Result } from "@forge-ahead/errors";
// Generated from docs/reference/openrpc.json; do not edit.
// Regenerate: bun run generate:commands

export interface Commands {
  "config.get": {
    params: Record<string, never>;
    result: {
      configured: boolean;
      prefix: string | null;
    };
  };
  "config.set": {
    params: {
      prefix: string;
    };
    result: {
      configured: true;
    };
  };
  "integration.preview": {
    params: {
      text: string;
    };
    result: {
      output: string;
    };
  };
  "config.reset": {
    params: {
      confirm: true;
    };
    result: {
      configured: false;
    };
  };
}

export const commandNames = [
  "config.get",
  "config.set",
  "integration.preview",
  "config.reset",
] as const;
export type CommandName = keyof Commands;
export type HandlerMap<Context, Failure> = {
  [M in CommandName]: (
    params: Commands[M]["params"],
    context: Context,
  ) => Promise<Result<Commands[M]["result"], Failure>>;
};
export type TypedCaller = <M extends CommandName>(
  method: M,
  params: Commands[M]["params"],
) => Promise<Commands[M]["result"]>;
