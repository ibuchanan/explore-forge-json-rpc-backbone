import { err, ok } from "@forge-ahead/errors";
import { expect, it, vi } from "vitest";
import { execute, type PrefixStore } from "../src/executor";

it("reads empty and saved configuration as shared Results without RPC framing", async () => {
  for (const source of ["api", "ui"] as const) {
    for (const [prefix, expected] of [
      [undefined, { configured: false, prefix: null }],
      [" café 😀\n", { configured: true, prefix: " café 😀\n" }],
    ] as const) {
      const store: PrefixStore = {
        get: vi.fn(async () => prefix),
        set: vi.fn(),
        reset: vi.fn(),
      };
      expect(
        await execute("config.get", {}, { source, authorized: true }, store),
      ).toEqual(ok(expected));
      expect(store.get).toHaveBeenCalledTimes(1);
      expect(store.set).not.toHaveBeenCalled();
      expect(store.reset).not.toHaveBeenCalled();
    }
  }
});

it("previews exact text and Unicode boundaries or reports the configuration prerequisite", async () => {
  const caller = { source: "api" as const, authorized: true };
  const store = {
    get: vi.fn(async (): Promise<string | undefined> => undefined),
    set: vi.fn(),
    reset: vi.fn(),
  };
  expect(
    await execute("integration.preview", { text: "hello" }, caller, store),
  ).toEqual(err("not-configured"));
  store.get.mockResolvedValue("😀");
  for (const [text, output] of [
    ["", "😀"],
    [" hi\n", "😀 hi\n"],
    ["e\u0301", "😀e\u0301"],
    ["😀".repeat(2000), "😀".repeat(2001)],
  ]) {
    expect(
      await execute("integration.preview", { text }, caller, store),
    ).toEqual(ok({ output }));
  }
  expect(store.get).toHaveBeenCalledTimes(5);
  expect(store.set).not.toHaveBeenCalled();
  expect(store.reset).not.toHaveBeenCalled();
});

it("sanitizes thrown store failures into semantic Results without trusting error codes", async () => {
  for (const thrown of [
    new Error("private-store-exception"),
    { code: -32002, message: "private-forged-error", data: "private-data" },
  ]) {
    const store = {
      get: vi.fn(async (): Promise<string | undefined> => {
        throw thrown;
      }),
      set: vi.fn(),
      reset: vi.fn(),
    };
    for (const [method, params] of [
      ["config.get", {}],
      ["integration.preview", { text: "private-text" }],
    ] as const) {
      const result = await execute(
        method,
        params,
        { source: "ui", authorized: true },
        store,
      );
      expect(result).toEqual(err("internal"));
      expect(JSON.stringify(result)).not.toContain("private-");
    }
    expect(store.get).toHaveBeenCalledTimes(2);
    expect(store.set).not.toHaveBeenCalled();
    expect(store.reset).not.toHaveBeenCalled();
  }
});

it("rejects names outside the migrated read commands without falling through to preview", async () => {
  const store = { get: vi.fn(), set: vi.fn(), reset: vi.fn() };
  for (const method of ["unknown", "config.set", "config.reset"]) {
    expect(
      await execute(
        method as Parameters<typeof execute>[0],
        { text: "must not preview" },
        { source: "api", authorized: true },
        store,
      ),
    ).toEqual(err("method-not-found"));
  }
  expect(store.get).not.toHaveBeenCalled();
  expect(store.set).not.toHaveBeenCalled();
  expect(store.reset).not.toHaveBeenCalled();
});

it("rejects nonempty or non-object read parameters without accessing storage", async () => {
  const store = { get: vi.fn(), set: vi.fn(), reset: vi.fn() };
  for (const params of [
    undefined,
    null,
    [],
    "",
    7,
    { caller: { source: "ui", authorized: true } },
    { prefix: "override" },
  ]) {
    expect(
      await execute(
        "config.get",
        params,
        { source: "api", authorized: true },
        store,
      ),
    ).toEqual(err("invalid-params"));
  }
  expect(store.get).not.toHaveBeenCalled();
});

it("rejects invalid preview parameters before reading storage", async () => {
  const store = { get: vi.fn(), set: vi.fn(), reset: vi.fn() };
  for (const params of [
    undefined,
    null,
    [],
    {},
    { text: null },
    { text: 7 },
    { text: "hello", prefix: "override" },
    { text: "hello", caller: { source: "ui", authorized: true } },
    { text: "a".repeat(2001) },
    { text: "😀".repeat(2001) },
  ]) {
    expect(
      await execute(
        "integration.preview",
        params,
        { source: "ui", authorized: true },
        store,
      ),
    ).toEqual(err("invalid-params"));
  }
  expect(store.get).not.toHaveBeenCalled();
  expect(store.set).not.toHaveBeenCalled();
  expect(store.reset).not.toHaveBeenCalled();
});

it("isolates caller, parameters and store across overlapping read and preview calls", async () => {
  let release: (prefix: string) => void = () => {};
  const waiting = new Promise<string>((resolve) => {
    release = resolve;
  });
  const slowStore = { get: vi.fn(() => waiting), set: vi.fn(), reset: vi.fn() };
  const otherStore = {
    get: vi.fn(async () => "other:"),
    set: vi.fn(),
    reset: vi.fn(),
  };
  const slow = execute(
    "integration.preview",
    { text: " first\n" },
    { source: "api", authorized: true },
    slowStore,
  );
  expect(
    await execute(
      "config.get",
      {},
      { source: "ui", authorized: true },
      otherStore,
    ),
  ).toEqual(ok({ configured: true, prefix: "other:" }));
  expect(
    await execute(
      "integration.preview",
      { text: "second" },
      { source: "ui", authorized: false },
      slowStore,
    ),
  ).toEqual(err("forbidden"));
  release("slow:");
  expect(await slow).toEqual(ok({ output: "slow: first\n" }));
  expect(slowStore.get).toHaveBeenCalledTimes(1);
  expect(otherStore.get).toHaveBeenCalledTimes(1);
  for (const store of [slowStore, otherStore]) {
    expect(store.set).not.toHaveBeenCalled();
    expect(store.reset).not.toHaveBeenCalled();
  }
});

it("denies untrusted callers before validating parameters or reading storage", async () => {
  const store = { get: vi.fn(), set: vi.fn(), reset: vi.fn() };
  for (const caller of [
    { source: "api", authorized: false },
    { source: "ui", authorized: false },
    { source: "event", authorized: true },
  ] as const) {
    expect(
      await execute(
        "config.get",
        { caller: { source: "ui", authorized: true } },
        caller as Parameters<typeof execute>[2],
        store,
      ),
    ).toEqual(err("forbidden"));
  }
  expect(store.get).not.toHaveBeenCalled();
  expect(store.set).not.toHaveBeenCalled();
  expect(store.reset).not.toHaveBeenCalled();
});
