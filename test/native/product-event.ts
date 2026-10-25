import { randomUUID } from "node:crypto";
import type { Result } from "@forge-ahead/errors";
import { createDemoNarrative } from "@forge-ahead/logging/demo";
import type { InvocationContext } from "@forge-ahead/triggers";
import { InvocationError, InvocationErrorCode } from "@forge/events";
import type { Caller, CommandFailure } from "../../src/executor";
import type { Commands } from "../../src/generated/commands";
import { logger } from "../../src/logging";

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
    const log = logger.child({
      invocationId: randomUUID(),
      source: "product-event",
      adapter: "jira.issue-created",
      method: "integration.preview",
    });
    const story = createDemoNarrative(log, { storyId: "native-lifecycle" });
    const started = performance.now();
    log.info({ operation: "native.invoke" }, "Native handler invoked");
    story.step(
      "Validate the event binding and trusted caller before executing preview.",
    );
    const record: Options["record"] = (entry) => {
      story.step(
        entry.outcome === "succeeded"
          ? "Command succeeded; output is omitted."
          : entry.outcome === "transient"
            ? "Command failed transiently; repeat safety and retry permission are explicit app policy."
            : entry.outcome === "write-uncertain"
              ? "Write outcome is uncertain; persistence or rollback is not established."
              : entry.outcome === "internal"
                ? "Invocation failed internally; command success is not established and details are omitted."
                : "Command denied or rejected; no successful output is available.",
      );
      story.step(
        entry.disposition === "acknowledged"
          ? "Acknowledge native delivery; no command output is returned."
          : entry.disposition === "retry-requested"
            ? "Return a native retry request; retry scheduling and delivery are not observed."
            : entry.disposition === "reconciliation-required"
              ? "Stop automatic repetition; reconciliation is required, not performed."
              : "Acknowledge with terminal disposition; normal completion is not command success.",
      );
      log[
        entry.outcome === "internal" || entry.outcome === "write-uncertain"
          ? "error"
          : entry.outcome === "succeeded"
            ? "info"
            : "warn"
      ](
        {
          operation: "native.complete",
          outcome: entry.outcome,
          disposition: entry.disposition,
          elapsedMs: performance.now() - started,
        },
        "Native adapter completion intent selected",
      );
      options.record(entry);
    };
    try {
      if (options.authorize(context) !== true) {
        record({ outcome: "forbidden", disposition: "terminal" });
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
        record({ outcome: "invalid-params", disposition: "terminal" });
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
          record({ outcome: "succeeded", disposition: "acknowledged" });
          return undefined;
        },
        (outcome) => {
          if (outcome === "transient" && canRetry) {
            record({ outcome, disposition: "retry-requested" });
            return new InvocationError({
              retryAfter: 30,
              retryReason: InvocationErrorCode.FUNCTION_RETRY_REQUEST,
            });
          }
          record({
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
      record({ outcome: "internal", disposition: "terminal" });
      return undefined;
    }
  };
}
