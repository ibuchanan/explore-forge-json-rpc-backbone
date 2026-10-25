import { expect, it, vi } from "vitest";
import { dispatch, type PrefixStore } from "../src/commands";
import { logRecords } from "./logging";

const request = (method: string, params: object = {}) => ({
  jsonrpc: "2.0",
  method,
  params,
  id: "private-client-id",
});

it("logs every API and UI invocation with independent demo steps and sanitized outcomes", async () => {
  let prefix: string | undefined;
  const store: PrefixStore = {
    get: async () => prefix,
    set: async (value) => {
      prefix = value;
    },
    reset: async () => {
      prefix = undefined;
    },
  };
  for (const source of ["api", "ui"] as const) {
    const caller = { source, authorized: true };
    const start = logRecords().length;
    for (const payload of [
      request("config.get"),
      request("integration.preview", { text: "private-preview" }),
      request("config.set", { prefix: "private-prefix" }),
      request("config.get"),
      request("integration.preview", { text: "private-preview" }),
      request("config.reset", { confirm: true }),
      request("private-unknown-method"),
      request("config.get", { extra: "private-parameter" }),
      "{private-malformed-json",
      { ...request("config.get"), caller: { private: "private-context" } },
    ]) {
      await dispatch(payload, caller, store);
    }
    const records = logRecords().slice(start);
    const invocations = records.filter(
      (record) => record["operation"] === "rpc.invoke",
    );
    const completions = records.filter(
      (record) => record["operation"] === "rpc.complete",
    );
    expect(invocations).toHaveLength(10);
    expect(completions).toHaveLength(10);
    expect(
      new Set(invocations.map((record) => record["invocationId"])).size,
    ).toBe(10);
    expect(completions.map((record) => record["rpcCode"] ?? "success")).toEqual(
      [
        "success",
        -32002,
        "success",
        "success",
        "success",
        source === "api" ? -32001 : "success",
        -32601,
        -32602,
        -32700,
        -32600,
      ],
    );
    for (const invocation of invocations) {
      expect(invocation).toMatchObject({
        source,
        name: "config-rpc",
        level: "info",
      });
      const steps = records.filter(
        (record) =>
          record["kind"] === "demoNarrativeStep" &&
          record["invocationId"] === invocation["invocationId"],
      );
      expect(steps.map((record) => record["stepNumber"])).toEqual([1, 2]);
      expect(
        steps.every(
          (record) =>
            record["storyId"] === "rpc-lifecycle" &&
            record["demoOnly"] === true,
        ),
      ).toBe(true);
    }
    expect(
      records.some((record) =>
        String(record["msg"]).includes("no prefix is saved"),
      ),
    ).toBe(true);
    expect(
      records.some((record) =>
        String(record["msg"]).includes("Read saved configuration"),
      ),
    ).toBe(true);
    prefix = undefined;
  }
  expect(JSON.stringify(logRecords())).not.toContain("private-");
});

it("keeps invocation IDs and narrative step numbers independent during overlapping calls", async () => {
  let release: () => void = () => {};
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  const slow = dispatch(
    request("config.get"),
    { source: "api", authorized: true },
    {
      get: async () => {
        await waiting;
        return undefined;
      },
      set: vi.fn(),
      reset: vi.fn(),
    },
  );
  await dispatch(
    request("config.get"),
    { source: "ui", authorized: true },
    {
      get: async () => "private-prefix",
      set: vi.fn(),
      reset: vi.fn(),
    },
  );
  release();
  await slow;
  const calls = logRecords().filter(
    (record) => record["operation"] === "rpc.invoke",
  );
  expect(calls).toHaveLength(2);
  expect(calls[0]?.["invocationId"]).not.toBe(calls[1]?.["invocationId"]);
  for (const call of calls) {
    const records = logRecords().filter(
      (record) => record["invocationId"] === call["invocationId"],
    );
    expect(
      records.map((record) => record["operation"] ?? record["stepNumber"]),
    ).toEqual(["rpc.invoke", 1, 2, "rpc.complete"]);
    expect(records.every((record) => record["source"] === call["source"])).toBe(
      true,
    );
  }
  expect(JSON.stringify(logRecords())).not.toContain("private-");
});

it("logs forbidden callers and storage failures without raw exceptions", async () => {
  const get = vi.fn(async (): Promise<string | undefined> => {
    throw new Error("private-storage-exception");
  });
  const store = { get, set: vi.fn(), reset: vi.fn() };
  await dispatch(
    request("config.get"),
    { source: "ui", authorized: false },
    store,
  );
  expect(get).not.toHaveBeenCalled();
  await dispatch(
    request("config.get"),
    { source: "api", authorized: true },
    store,
  );
  expect(
    logRecords().filter((record) => record["operation"] === "rpc.complete"),
  ).toEqual([
    expect.objectContaining({
      outcome: "rejected",
      rpcCode: -32001,
      level: "warn",
    }),
    expect.objectContaining({
      outcome: "failed",
      rpcCode: -32603,
      level: "error",
    }),
  ]);
  expect(JSON.stringify(logRecords())).not.toContain("private-");
});
