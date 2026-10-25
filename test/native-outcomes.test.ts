import { err, ok } from "@forge-ahead/errors";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("../src/executor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/executor")>();
  return { ...actual, execute: vi.fn(actual.execute) };
});

import { dispatch } from "../src/commands";
import { execute as appExecute } from "../src/executor";
import { logRecords } from "./logging";
import {
  createIssueCreatedHandler,
  type Failure,
} from "./native/product-event";

afterEach(() => vi.mocked(appExecute).mockReset());

const event = {
  eventType: "avi:jira:created:issue",
  issue: { fields: { summary: "private-summary" } },
};
const context = { installContext: "private-installation" };

it("acknowledges preview success without returning command output", async () => {
  const output = { output: "private-output" };
  const serialize = vi.fn(() => {
    throw new Error("private-serialization");
  });
  Object.defineProperty(output, "toJSON", { value: serialize });
  const execute = vi.fn(async () => ok(output));
  const record = vi.fn();
  const handler = createIssueCreatedHandler({
    execute,
    authorize: (trusted) => trusted.installContext === "private-installation",
    retryAllowed: true,
    record,
  });
  expect(
    await handler(
      {
        ...event,
        issue: { fields: { summary: "  private-summary  " } },
        method: "config.reset",
        params: { confirm: true },
        caller: { source: "ui", authorized: true },
        installContext: "private-forged-installation",
        retryAllowed: true,
        jsonrpc: "2.0",
        id: 1,
      },
      context,
    ),
  ).toBeUndefined();
  expect(execute).toHaveBeenCalledExactlyOnceWith(
    "integration.preview",
    { text: "  private-summary  " },
    { source: "api", authorized: true },
  );
  expect(record).toHaveBeenCalledExactlyOnceWith({
    outcome: "succeeded",
    disposition: "acknowledged",
  });
  const records = logRecords();
  expect(
    records.map((entry) => entry["operation"] ?? entry["stepNumber"]),
  ).toEqual(["native.invoke", 1, 2, 3, "native.complete"]);
  expect(
    records.every(
      (entry) => entry["invocationId"] === records[0]?.["invocationId"],
    ),
  ).toBe(true);
  expect(records[0]).toMatchObject({
    name: "config-rpc",
    adapter: "jira.issue-created",
    source: "product-event",
    method: "integration.preview",
    invocationId: expect.any(String),
    level: "info",
  });
  expect(
    records.filter((entry) => entry["kind"] === "demoNarrativeStep"),
  ).toEqual([
    expect.objectContaining({
      storyId: "native-lifecycle",
      demoOnly: true,
      stepNumber: 1,
    }),
    expect.objectContaining({
      msg: "Command succeeded; output is omitted.",
      stepNumber: 2,
    }),
    expect.objectContaining({
      msg: "Acknowledge native delivery; no command output is returned.",
      stepNumber: 3,
    }),
  ]);
  expect(records.at(-1)).toMatchObject({
    operation: "native.complete",
    outcome: "succeeded",
    disposition: "acknowledged",
    elapsedMs: expect.any(Number),
    level: "info",
  });
  expect(JSON.stringify(records)).not.toContain("private-");
  expect(serialize).not.toHaveBeenCalled();
});

it("rejects missing trusted authorization and invalid event bindings before execution", async () => {
  const execute = vi.fn(async () => ok({ output: "private-output" }));
  for (const [payload, allowed] of [
    [
      {
        ...event,
        caller: { source: "ui", authorized: true },
        installContext: context.installContext,
      },
      false,
    ],
    [{ ...event, eventType: "avi:jira:deleted:issue" }, true],
    [{ ...event, issue: { fields: {} } }, true],
    [null, true],
  ] as const) {
    const record = vi.fn();
    const handler = createIssueCreatedHandler({
      execute,
      authorize: () => allowed,
      retryAllowed: true,
      record,
    });
    expect(await handler(payload, context)).toBeUndefined();
    expect(execute).not.toHaveBeenCalled();
    expect(record).toHaveBeenCalledExactlyOnceWith({
      outcome: allowed ? "invalid-params" : "forbidden",
      disposition: "terminal",
    });
    const records = logRecords().slice(-5);
    expect(
      records.map((entry) => entry["operation"] ?? entry["stepNumber"]),
    ).toEqual(["native.invoke", 1, 2, 3, "native.complete"]);
    expect(records.at(-1)).toMatchObject({
      outcome: allowed ? "invalid-params" : "forbidden",
      disposition: "terminal",
      level: "warn",
    });
    expect(JSON.stringify(logRecords())).not.toContain("private-");
  }
});

it("returns the SDK native retry request only for an explicitly transient preview failure", async () => {
  const execute = vi.fn(async () => err("transient" as const));
  const record = vi.fn();
  const handler = createIssueCreatedHandler({
    execute,
    authorize: () => true,
    retryAllowed: true,
    record,
  });
  for (const retryCount of [undefined, 1, 2, 3]) {
    expect(
      await handler(
        {
          ...event,
          ...(retryCount === undefined
            ? {}
            : {
                retryContext: {
                  retryCount,
                  retryReason: "FUNCTION_RETRY_REQUEST",
                  retryData: { caller: "private-forged" },
                },
              }),
        },
        context,
      ),
    ).toEqual({
      _retry: true,
      retryOptions: { retryAfter: 30, retryReason: "FUNCTION_RETRY_REQUEST" },
    });
  }
  expect(execute).toHaveBeenCalledTimes(4);
  expect(record.mock.calls).toEqual(
    Array.from({ length: 4 }, () => [
      { outcome: "transient", disposition: "retry-requested" },
    ]),
  );
  const invocations = logRecords().filter(
    (entry) => entry["operation"] === "native.invoke",
  );
  expect(invocations).toHaveLength(4);
  for (const invocation of invocations) {
    const records = logRecords().filter(
      (entry) => entry["invocationId"] === invocation["invocationId"],
    );
    expect(
      records.map((entry) => entry["operation"] ?? entry["stepNumber"]),
    ).toEqual(["native.invoke", 1, 2, 3, "native.complete"]);
    expect(records[2]?.["msg"]).toBe(
      "Command failed transiently; repeat safety and retry permission are explicit app policy.",
    );
    expect(records[3]?.["msg"]).toBe(
      "Return a native retry request; retry scheduling and delivery are not observed.",
    );
    expect(records.at(-1)).toMatchObject({
      outcome: "transient",
      disposition: "retry-requested",
      level: "warn",
    });
  }
  expect(JSON.stringify(logRecords())).not.toContain("private-");
});

it("stops retry requests at the product-event limit and with malformed or forbidden retry context", async () => {
  const execute = vi.fn(async () => err("transient" as const));
  for (const [retryContext, retryAllowed] of [
    [undefined, false],
    [{ retryCount: 4, retryReason: "FUNCTION_RETRY_REQUEST" }, true],
    [{ retryCount: -1 }, true],
    [{ retryCount: 0 }, true],
    [{ retryCount: 1.5 }, true],
    [{ retryCount: "1" }, true],
    [{ retryCount: 1 }, true],
    [null, true],
  ] as const) {
    const record = vi.fn();
    const handler = createIssueCreatedHandler({
      execute,
      authorize: () => true,
      retryAllowed,
      record,
    });
    expect(
      await handler({ ...event, retryContext, retryAllowed: true }, context),
    ).toBeUndefined();
    expect(record).toHaveBeenCalledExactlyOnceWith({
      outcome: "transient",
      disposition: "terminal",
    });
    const records = logRecords().slice(-5);
    expect(records[2]?.["msg"]).toBe(
      "Command failed transiently; repeat safety and retry permission are explicit app policy.",
    );
    expect(records[3]?.["msg"]).toBe(
      "Acknowledge with terminal disposition; normal completion is not command success.",
    );
    expect(records.at(-1)).toMatchObject({
      outcome: "transient",
      disposition: "terminal",
      level: "warn",
    });
  }
});

it("sanitizes unexpected executor and authorization exceptions without throwing or retrying", async () => {
  for (const atAuthorization of [false, true]) {
    const execute = vi.fn(async () => {
      throw new Error("private-exception");
    });
    const record = vi.fn();
    const handler = createIssueCreatedHandler({
      execute,
      authorize: () => {
        if (atAuthorization) throw new Error("private-policy");
        return true;
      },
      retryAllowed: true,
      record,
    });
    expect(await handler(event, context)).toBeUndefined();
    expect(record).toHaveBeenCalledExactlyOnceWith({
      outcome: "internal",
      disposition: "terminal",
    });
    expect(JSON.stringify(record.mock.calls)).not.toContain("private-");
    expect(execute).toHaveBeenCalledTimes(atAuthorization ? 0 : 1);
    const records = logRecords().slice(-5);
    expect(
      records.map((entry) => entry["operation"] ?? entry["stepNumber"]),
    ).toEqual(["native.invoke", 1, 2, 3, "native.complete"]);
    expect(records[2]?.["msg"]).toBe(
      "Invocation failed internally; command success is not established and details are omitted.",
    );
    expect(records[3]?.["msg"]).toBe(
      "Acknowledge with terminal disposition; normal completion is not command success.",
    );
    expect(records.at(-1)).toMatchObject({
      outcome: "internal",
      disposition: "terminal",
      level: "error",
    });
    expect(JSON.stringify(logRecords())).not.toContain("private-");
  }
});

it("keeps a persisted but uncertain write observable and requests reconciliation, never repetition", async () => {
  let saved: string | undefined;
  const write = vi.fn(async () => {
    saved = "private-persisted";
  });
  // Fault injection violates the read-only binding's effect contract deliberately.
  const execute = vi.fn(async () => {
    await write();
    return err("write-uncertain" as const);
  });
  const record = vi.fn();
  const handler = createIssueCreatedHandler({
    execute,
    authorize: () => true,
    retryAllowed: true,
    record,
  });
  expect(await handler(event, context)).toBeUndefined();
  expect(record).toHaveBeenCalledExactlyOnceWith({
    outcome: "write-uncertain",
    disposition: "reconciliation-required",
  });
  expect(write).toHaveBeenCalledTimes(1);
  expect(
    logRecords().map((entry) => entry["operation"] ?? entry["stepNumber"]),
  ).toEqual(["native.invoke", 1, 2, 3, "native.complete"]);
  expect(logRecords()[2]?.["msg"]).toBe(
    "Write outcome is uncertain; persistence or rollback is not established.",
  );
  expect(logRecords()[3]?.["msg"]).toBe(
    "Stop automatic repetition; reconciliation is required, not performed.",
  );
  expect(logRecords().at(-1)).toMatchObject({
    outcome: "write-uncertain",
    disposition: "reconciliation-required",
    level: "error",
  });
  const { execute: read } =
    await vi.importActual<typeof import("../src/executor")>("../src/executor");
  expect(
    (
      await read(
        "config.get",
        {},
        { source: "api", authorized: true },
        {
          get: async () => saved,
          set: vi.fn(),
          reset: vi.fn(),
        },
      )
    ).unwrapOr(null),
  ).toEqual({ configured: true, prefix: "private-persisted" });
  expect(JSON.stringify(record.mock.calls)).not.toContain("private-");
});

it("records terminal command denial and acknowledges without requesting retry", async () => {
  const execute = vi.fn(async () => err("forbidden" as const));
  const record = vi.fn();
  const handler = createIssueCreatedHandler({
    execute,
    authorize: () => true,
    retryAllowed: true,
    record,
  });
  expect(await handler(event, context)).toBeUndefined();
  expect(record).toHaveBeenCalledExactlyOnceWith({
    outcome: "forbidden",
    disposition: "terminal",
  });
  expect(
    logRecords().map((entry) => entry["operation"] ?? entry["stepNumber"]),
  ).toEqual(["native.invoke", 1, 2, 3, "native.complete"]);
  expect(
    logRecords()
      .filter((entry) => entry["kind"] === "demoNarrativeStep")
      .map((entry) => entry["msg"]),
  ).toEqual([
    "Validate the event binding and trusted caller before executing preview.",
    "Command denied or rejected; no successful output is available.",
    "Acknowledge with terminal disposition; normal completion is not command success.",
  ]);
  expect(logRecords().at(-1)).toMatchObject({
    outcome: "forbidden",
    disposition: "terminal",
    level: "warn",
  });
});

it.each([
  ["success", undefined, "acknowledged"],
  ["forbidden", { code: -32001, message: "Forbidden" }, "terminal"],
  ["invalid-params", { code: -32602, message: "Invalid params" }, "terminal"],
  ["not-configured", { code: -32002, message: "Not configured" }, "terminal"],
  ["transient", { code: -32603, message: "Internal error" }, "retry-requested"],
  ["internal", { code: -32603, message: "Internal error" }, "terminal"],
  ["exception", { code: -32603, message: "Internal error" }, "terminal"],
  [
    "write-uncertain",
    { code: -32603, message: "Internal error" },
    "reconciliation-required",
  ],
] as const)(
  "represents the same %s outcome through complete RPC and native handlers",
  async (outcome, error, disposition) => {
    const execute = vi.fn(async () => {
      if (outcome === "exception") throw new Error("private-exception");
      return outcome === "success"
        ? ok({ output: "private-output" })
        : err(outcome);
    });
    const store = { get: vi.fn(), set: vi.fn(), reset: vi.fn() };
    // The existing production profile deliberately has no transient/uncertain codes.
    vi.mocked(appExecute).mockImplementation(async () =>
      (await execute()).match(
        (value) => ok(value),
        (failure: Failure) =>
          err(
            failure === "transient" || failure === "write-uncertain"
              ? "internal"
              : failure,
          ),
      ),
    );
    expect(
      await dispatch(
        {
          jsonrpc: "2.0",
          method: "integration.preview",
          params: { text: "private-summary" },
          id: 1,
        },
        { source: "api", authorized: true },
        store,
      ),
    ).toEqual({
      jsonrpc: "2.0",
      id: 1,
      ...(error ? { error } : { result: { output: "private-output" } }),
    });
    const record = vi.fn();
    const handler = createIssueCreatedHandler({
      execute,
      authorize: () => true,
      retryAllowed: true,
      record,
    });
    expect(await handler(event, context)).toEqual(
      outcome === "transient"
        ? {
            _retry: true,
            retryOptions: {
              retryAfter: 30,
              retryReason: "FUNCTION_RETRY_REQUEST",
            },
          }
        : undefined,
    );
    expect(record).toHaveBeenCalledExactlyOnceWith({
      outcome:
        outcome === "success"
          ? "succeeded"
          : outcome === "exception"
            ? "internal"
            : outcome,
      disposition,
    });
    expect(execute).toHaveBeenCalledTimes(2);
    expect(JSON.stringify([record.mock.calls, logRecords()])).not.toContain(
      "private-",
    );
  },
);

it("isolates overlapping native outcomes and RPC narratives without serializing private values", async () => {
  const { execute } =
    await vi.importActual<typeof import("../src/executor")>("../src/executor");
  let release: () => void = () => {};
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  const store = {
    get: vi.fn(async () => {
      await waiting;
      return "private-prefix";
    }),
    set: vi.fn(),
    reset: vi.fn(),
  };
  const record = vi.fn();
  const handler = createIssueCreatedHandler({
    execute: (method, params, caller) => execute(method, params, caller, store),
    authorize: (trusted) => trusted.installContext === context.installContext,
    retryAllowed: true,
    record,
  });
  const slow = handler(event, context);
  expect(
    await handler(
      { ...event, method: "private-forged-method" },
      { installContext: "private-denied" },
    ),
  ).toBeUndefined();
  expect(
    await dispatch(
      {
        jsonrpc: "2.0",
        method: "private-method",
        params: {},
        id: "private-id",
      },
      { source: "api", authorized: true },
      store,
    ),
  ).toMatchObject({ error: { code: -32601 } });
  release();
  expect(await slow).toBeUndefined();
  const invocations = logRecords().filter((entry) =>
    ["native.invoke", "rpc.invoke"].includes(String(entry["operation"])),
  );
  expect(invocations).toHaveLength(3);
  expect(new Set(invocations.map((entry) => entry["invocationId"])).size).toBe(
    3,
  );
  for (const [index, invocation] of invocations.entries()) {
    const records = logRecords().filter(
      (entry) => entry["invocationId"] === invocation["invocationId"],
    );
    expect(
      records.map((entry) => entry["operation"] ?? entry["stepNumber"]),
    ).toEqual(
      index === 2
        ? ["rpc.invoke", 1, 2, "rpc.complete"]
        : ["native.invoke", 1, 2, 3, "native.complete"],
    );
    expect(
      records.every(
        (entry) =>
          entry["source"] === invocation["source"] &&
          entry["method"] === invocation["method"],
      ),
    ).toBe(true);
    expect(records.at(-1)).toMatchObject(
      index === 0
        ? { outcome: "succeeded", disposition: "acknowledged", level: "info" }
        : index === 1
          ? { outcome: "forbidden", disposition: "terminal", level: "warn" }
          : {
              outcome: "rejected",
              disposition: "response-ready",
              level: "warn",
            },
    );
  }
  expect(store.get).toHaveBeenCalledTimes(1);
  expect(store.set).not.toHaveBeenCalled();
  expect(store.reset).not.toHaveBeenCalled();
  expect(record).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(logRecords())).not.toContain("private-");
});

it("handles repeated delivery with the real read-only executor and no mutation", async () => {
  const { execute } =
    await vi.importActual<typeof import("../src/executor")>("../src/executor");
  const store = {
    get: vi.fn(async () => "private-prefix"),
    set: vi.fn(),
    reset: vi.fn(),
  };
  const record = vi.fn();
  const handler = createIssueCreatedHandler({
    execute: (method, params, caller) => execute(method, params, caller, store),
    authorize: () => true,
    retryAllowed: true,
    record,
  });
  for (const payload of [
    event,
    event,
    {
      ...event,
      retryContext: { retryCount: 1, retryReason: "FUNCTION_RETRY_REQUEST" },
    },
  ]) {
    expect(await handler(payload, context)).toBeUndefined();
  }
  expect(store.get).toHaveBeenCalledTimes(3);
  expect(store.set).not.toHaveBeenCalled();
  expect(store.reset).not.toHaveBeenCalled();
  expect(record.mock.calls).toEqual(
    Array.from({ length: 3 }, () => [
      { outcome: "succeeded", disposition: "acknowledged" },
    ]),
  );
});
