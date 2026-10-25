import type { Result } from "@forge-ahead/errors";
import type { InvocationContext } from "@forge-ahead/triggers";
import { InvocationError, InvocationErrorCode } from "@forge/events";
import type { Caller, CommandFailure } from "../../src/executor";
import type { Commands } from "../../src/generated/commands";

/** Explicit fixture outcomes, not inferred from production `internal` or RPC codes. */
export type Failure = CommandFailure | "transient" | "write-uncertain";
type Options = {
  execute: (
    method: "integration.preview",
    params: Commands["integration.preview"]["params"],
    caller: Caller,
  ) => Promise<Result<Commands[keyof Commands]["result"], Failure>>;
  authorize: (context: InvocationContext) => boolean;
  retryAllowed: boolean;
  record: (entry: {
    outcome: "succeeded" | Failure;
    disposition:
      | "acknowledged"
      | "terminal"
      | "retry-requested"
      | "reconciliation-required";
  }) => void;
};

/**
 * Local Jira issue-created binding; intentionally absent from the app manifest.
 * The caller-owned policy must authorize preview, not infer permission from an ARI.
 * Preview only reads; its output is discarded, so duplicate delivery has no effect.
 */
export function createIssueCreatedHandler(options: Options) {
  return async (
    event: unknown,
    context: InvocationContext,
  ): Promise<undefined | InvocationError> => {
    try {
      if (options.authorize(context) !== true) {
        options.record({ outcome: "forbidden", disposition: "terminal" });
        return undefined;
      }
      const candidate = event as {
        eventType?: unknown;
        issue?: { fields?: { summary?: unknown } };
        retryContext?: { retryCount?: unknown; retryReason?: unknown } | null;
      } | null;
      const text = candidate?.issue?.fields?.summary;
      if (
        candidate?.eventType !== "avi:jira:created:issue" ||
        typeof text !== "string"
      ) {
        options.record({ outcome: "invalid-params", disposition: "terminal" });
        return undefined;
      }
      const result = await options.execute(
        "integration.preview",
        { text },
        {
          source: "api",
          authorized: true,
        },
      );
      const retry = candidate.retryContext;
      const count = retry?.retryCount;
      const canRetry =
        options.retryAllowed &&
        (retry === undefined ||
          (typeof count === "number" &&
            Number.isInteger(count) &&
            count >= 1 &&
            count < 4 &&
            typeof retry?.retryReason === "string"));
      return result.match(
        () => {
          options.record({ outcome: "succeeded", disposition: "acknowledged" });
          return undefined;
        },
        (outcome) => {
          if (outcome === "transient" && canRetry) {
            options.record({ outcome, disposition: "retry-requested" });
            return new InvocationError({
              retryAfter: 30,
              retryReason: InvocationErrorCode.FUNCTION_RETRY_REQUEST,
            });
          }
          options.record({
            outcome,
            disposition:
              outcome === "write-uncertain"
                ? "reconciliation-required"
                : "terminal",
          });
          return undefined;
        },
      );
    } catch {
      options.record({ outcome: "internal", disposition: "terminal" });
      return undefined;
    }
  };
}
