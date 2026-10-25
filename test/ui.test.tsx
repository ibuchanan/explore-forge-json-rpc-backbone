import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { dispatch } from "../src/commands";

const bridge = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@forge/bridge", () => ({ makeInvoke: () => bridge.invoke }));
vi.mock("@forge/react", async () => {
  // Keep the real UI Kit form hook; replace only platform-rendered host components.
  const { useForm } = await import(
    "../node_modules/@forge/react/out/hooks/useForm.js"
  );
  return {
    useForm,
    ...Object.fromEntries(
      [
        "Button",
        "CodeBlock",
        "ErrorMessage",
        "Form",
        "Heading",
        "HelperMessage",
        "Label",
        "SectionMessage",
        "Spinner",
        "Stack",
        "Text",
        "TextArea",
        "Textfield",
      ].map((name) => [name, name]),
    ),
  };
});

import { App } from "../src/frontend/App";

let renderer: ReactTestRenderer;
let prefix: string | undefined;
const text = () => JSON.stringify(renderer.toJSON());
const nodes = (name: string) => renderer.root.findAllByType(name as never);
const change = async (name: "Textfield" | "TextArea", value: string) => {
  await act(async () => {
    nodes(name)[0]?.props["onChange"]({
      target: { type: name === "Textfield" ? "text" : "textarea", value },
    });
  });
};
const submit = async (index: number) => {
  await act(async () => {
    await nodes("Form")[index]?.props["onSubmit"]();
  });
};
const mount = async () => {
  await act(async () => {
    renderer = create(<App />);
  });
};
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const respond = (_key: string, request: unknown) =>
  dispatch(
    request,
    { source: "ui", authorized: true },
    {
      get: async () => prefix,
      set: async (value) => {
        prefix = value;
      },
    },
  );

beforeEach(() => {
  vi.resetAllMocks();
  prefix = undefined;
  bridge.invoke.mockImplementation(respond);
});
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
});

it("loads, saves normalized data, previews saved rather than edited prefix, and reloads", async () => {
  await mount();
  expect(text()).toContain("Not configured");
  expect(
    nodes("Button").find((node) => node.props["children"] === "Run preview")
      ?.props["isDisabled"],
  ).toBe(true);
  await change("Textfield", "  hi 😀  ");
  await submit(0);
  expect(prefix).toBe("hi 😀");
  expect(text()).toContain("Prefix saved");
  expect(nodes("Textfield")[0]?.props["defaultValue"]).toBe("hi 😀");
  await change("Textfield", "not saved");
  await change("TextArea", " there\n <b>literal</b>");
  await submit(1);
  expect(nodes("CodeBlock")[0]?.props["text"]).toBe(
    "hi 😀 there\n <b>literal</b>",
  );
  expect(nodes("CodeBlock")[0]?.props["language"]).toBe("text");
  await change("TextArea", "");
  expect(nodes("CodeBlock")).toHaveLength(0);
  await submit(1);
  expect(nodes("CodeBlock")[0]?.props["text"]).toBe("hi 😀");
  await submit(0);
  expect(nodes("CodeBlock")).toHaveLength(0);
  await act(async () => renderer.unmount());
  await mount();
  expect(nodes("Textfield")[0]?.props["defaultValue"]).toBe("not saved");
  expect(
    bridge.invoke.mock.calls.every(
      ([key, request]) =>
        key === "rpc" &&
        request.jsonrpc === "2.0" &&
        typeof request.id === "number",
    ),
  ).toBe(true);
});

it("matches Unicode command boundaries without UTF-16 maxLength constraints", async () => {
  await mount();
  for (const value of ["", "  ", "😀".repeat(65)]) {
    await change("Textfield", value);
    await submit(0);
    expect(nodes("ErrorMessage")).toHaveLength(1);
    expect(prefix).toBeUndefined();
  }
  await change("Textfield", ` ${"😀".repeat(64)} `);
  await submit(0);
  expect(prefix).toBe("😀".repeat(64));
  expect(nodes("Textfield")[0]?.props["maxLength"]).toBeUndefined();
  await change("TextArea", "😀".repeat(2001));
  const calls = bridge.invoke.mock.calls.length;
  await submit(1);
  expect(bridge.invoke).toHaveBeenCalledTimes(calls);
  expect(nodes("ErrorMessage")).toHaveLength(1);
  await change("TextArea", "😀".repeat(2000));
  await submit(1);
  expect(nodes("CodeBlock")[0]?.props["text"]).toBe("😀".repeat(2064));
});

it("shows initial loading and blocks duplicate saves and overlapping previews", async () => {
  const initial = deferred<Awaited<ReturnType<typeof dispatch>>>();
  bridge.invoke.mockReturnValueOnce(initial.promise);
  await mount();
  expect(nodes("Spinner")[0]?.props["label"]).toBe("Loading configuration");
  expect(nodes("Textfield")[0]?.props["isDisabled"]).toBe(true);
  await act(async () => {
    initial.resolve({
      jsonrpc: "2.0",
      id: bridge.invoke.mock.calls[0]?.[1].id,
      result: { configured: false, prefix: null },
    });
  });
  await change("Textfield", "saved");
  const write = deferred<Awaited<ReturnType<typeof dispatch>>>();
  bridge.invoke.mockReturnValueOnce(write.promise);
  let saving: Promise<void>;
  await act(async () => {
    saving = nodes("Form")[0]?.props["onSubmit"]();
  });
  expect(nodes("Spinner")[0]?.props["label"]).toBe(
    "Saving prefix and verifying",
  );
  expect(nodes("Textfield")[0]?.props["isDisabled"]).toBe(true);
  expect(nodes("TextArea")[0]?.props["isDisabled"]).toBe(true);
  const calls = bridge.invoke.mock.calls.length;
  await submit(0);
  await submit(1);
  expect(bridge.invoke).toHaveBeenCalledTimes(calls);
  await act(async () => {
    prefix = "saved";
    write.resolve({
      jsonrpc: "2.0",
      id: bridge.invoke.mock.calls[calls - 1]?.[1].id,
      result: { configured: true },
    });
    await saving;
  });
  expect(text()).toContain("Prefix saved");
});

it("offers Retry on sanitized load errors and denies unauthorized actions", async () => {
  bridge.invoke.mockRejectedValueOnce(new Error("private bearer credential"));
  await mount();
  expect(text()).not.toContain("private bearer credential");
  expect(text()).toContain("Retry");
  expect(nodes("Textfield")[0]?.props["isDisabled"]).toBe(true);
  await act(async () => {
    await nodes("Button")
      .find((node) => node.props["children"] === "Retry")
      ?.props["onClick"]();
  });
  // Retry's click starts an async load; act drains its resolution.
  expect(text()).toContain("Not configured");
  await change("Textfield", "hi");
  bridge.invoke.mockImplementationOnce(async (_key, request) => ({
    jsonrpc: "2.0",
    id: request.id,
    error: { code: -32001, message: "raw details ignored" },
  }));
  await submit(0);
  expect(text()).toContain("Jira administrator access");
  expect(text()).not.toContain("raw details ignored");
  expect(nodes("Textfield")[0]?.props["isDisabled"]).toBe(true);
});

it("distinguishes failed saves from successful saves with failed read-back", async () => {
  prefix = "old";
  await mount();
  await change("Textfield", " new ");
  bridge.invoke.mockRejectedValueOnce(new Error("sensitive write failure"));
  await submit(0);
  expect(prefix).toBe("old");
  expect(text()).not.toContain("Prefix was saved");
  bridge.invoke
    .mockImplementationOnce(respond)
    .mockRejectedValueOnce(new Error("sensitive read failure"));
  await submit(0);
  expect(prefix).toBe("new");
  expect(text()).toContain(
    "Prefix was saved, but read-back verification failed",
  );
  expect(text()).not.toContain("sensitive");
  expect(text()).not.toContain('"children":["Prefix saved"]');
  expect(nodes("Textfield")[0]?.props["isDisabled"]).toBe(true);
  await act(async () => {
    nodes("Button")
      .find((node) => node.props["children"] === "Retry")
      ?.props["onClick"]();
  });
  expect(nodes("Textfield")[0]?.props["defaultValue"]).toBe("new");
});

it("clears stale output on failed preview, edits and configuration changes", async () => {
  prefix = "hi";
  await mount();
  await submit(1);
  expect(nodes("CodeBlock")).toHaveLength(1);
  prefix = undefined;
  await submit(1);
  expect(nodes("CodeBlock")).toHaveLength(0);
  expect(text()).toContain("Not configured. Save a prefix");
  expect(text()).toContain("Retry");
});
