import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { dispatch } from "../src/commands";

const bridge = vi.hoisted(() => ({ invoke: vi.fn(), navigate: vi.fn() }));
vi.mock("@forge/bridge", () => ({
  makeInvoke: () => bridge.invoke,
  router: { navigate: bridge.navigate },
}));
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
        "ButtonGroup",
        "CodeBlock",
        "ErrorMessage",
        "Form",
        "Heading",
        "HelperMessage",
        "Inline",
        "Label",
        "Lozenge",
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
const mount = async (
  page: "configure" | "status" | "get-started" = "configure",
) => {
  await act(async () => {
    renderer = create(<App page={page} />);
  });
};
const click = async (label: string) => {
  const button = nodes("Button").find(
    (node) => node.props["children"] === label,
  );
  expect(button, `Button ${label}`).toBeDefined();
  await act(async () => {
    button?.props["onClick"]();
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
      reset: async () => {
        prefix = undefined;
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

it.each(["status", "configure", "get-started"] as const)(
  "%s leaves the page title to Jira rather than duplicating the manifest heading",
  async (page) => {
    await mount(page);
    expect(nodes("Heading").some((node) => node.props["as"] === "h1")).toBe(
      false,
    );
    expect(text()).not.toContain("JSON-RPC configuration");
    expect(text()).not.toContain("JSON-RPC status");
  },
);

it("explains the demo and worked example before onboarding is configured", async () => {
  await mount("get-started");
  expect(text()).toContain("This proof of concept");
  expect(text()).toContain("same JSON-RPC commands");
  expect(text()).toContain("a prefix, a short piece of text placed before");
  expect(text()).toContain("enter demo: in Prefix and choose Save");
  expect(text()).toContain(
    "If a prefix is already saved, you can use it instead",
  );
  expect(text()).toContain("demo: hello");
  expect(text()).toContain("no separator automatically");
  expect(text()).toContain("Empty text returns just the prefix");
  expect(text()).toContain("Preview completion is not tracked");
});

it("explains the status meaning without repeating the Configure instructions", async () => {
  await mount("status");
  expect(text()).toContain("Configured means a prefix is stored");
  expect(text()).toContain("does not test the HTTP endpoint");
  expect(text()).not.toContain("demo: hello");
});

it.each([
  ["status", false],
  ["status", true],
  ["configure", false],
  ["configure", true],
  ["get-started", false],
  ["get-started", true],
] as const)(
  "%s colors configuration feedback for configured=%s",
  async (page, configured) => {
    prefix = configured ? "demo:" : undefined;
    await mount(page);
    const badge = nodes("Lozenge")[0];
    expect(badge?.props["appearance"]).toBe(configured ? "success" : "removed");
    expect(badge?.props["children"]).toBe(
      configured ? "Configured" : "Not configured",
    );
    const message = nodes("SectionMessage")[0];
    expect(message?.props["appearance"]).toBe(
      configured ? "success" : "warning",
    );
    expect(message?.props["title"]).toBe(
      configured ? "Configuration verified" : "Setup needed",
    );
    if (page === "get-started") {
      const [, configuration, preview] = nodes("Lozenge");
      expect(configuration?.props["appearance"]).toBe(
        configured ? "success" : "removed",
      );
      expect(configuration?.props["children"]).toBe(
        configured ? "Complete" : "Action needed",
      );
      expect(preview?.props["appearance"]).toBe("default");
      expect(preview?.props["children"]).toBe("Verify manually");
    }
    expect(text()).not.toContain("All checks passed");
    expect(text()).not.toContain("App is healthy");
  },
);

it("the documented example produces the explained result and action feedback", async () => {
  await mount();
  expect(text()).toContain("A prefix is text added at the start");
  expect(text()).toContain(
    "Preview text is a sample to place after your saved prefix",
  );
  expect(text()).toContain("No separator is added automatically");
  expect(text()).toContain("Unsaved prefix edits are not used");
  await change("Textfield", "demo:");
  await submit(0);
  expect(text()).toContain("The setting was stored and read back successfully");
  expect(nodes("CodeBlock")).toHaveLength(0);
  await change("TextArea", " hello");
  await submit(1);
  expect(nodes("CodeBlock")[0]?.props["text"]).toBe("demo: hello");
  expect(text()).toContain(
    "The sample was not saved and no Jira issue was changed",
  );
  await change("TextArea", "");
  await submit(1);
  expect(nodes("CodeBlock")[0]?.props["text"]).toBe("demo:");
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

it("requires reset confirmation, supports cancellation, and verifies reset before reconfiguration", async () => {
  prefix = "saved";
  await mount();
  await change("TextArea", " sample");
  await submit(1);
  const calls = bridge.invoke.mock.calls.length;
  await click("Reset configuration");
  expect(bridge.invoke).toHaveBeenCalledTimes(calls);
  expect(text()).toContain("Remove the saved prefix?");
  expect(text()).toContain("cannot be undone");
  expect(nodes("Textfield")[0]?.props["isDisabled"]).toBe(true);
  await click("Cancel");
  expect(prefix).toBe("saved");
  expect(bridge.invoke).toHaveBeenCalledTimes(calls);
  await click("Reset configuration");
  await click("Confirm reset");
  expect(
    bridge.invoke.mock.calls
      .slice(-2)
      .map(([, request]) => [request.method, request.params]),
  ).toEqual([
    ["config.reset", { confirm: true }],
    ["config.get", {}],
  ]);
  expect(prefix).toBeUndefined();
  expect(text()).toContain("Configuration reset");
  expect(text()).toContain("Not configured");
  expect(nodes("CodeBlock")).toHaveLength(0);
  expect(nodes("Textfield")[0]?.props["defaultValue"]).toBe("");
  expect(nodes("TextArea")[0]?.props["defaultValue"]).toBe("");
  expect(nodes("TextArea")[0]?.props["isDisabled"]).toBe(true);
  await change("Textfield", "new");
  await submit(0);
  await change("TextArea", " sample");
  await submit(1);
  expect(nodes("CodeBlock")[0]?.props["text"]).toBe("new sample");
});

it("blocks duplicate resets and other actions during reset and its read-back", async () => {
  prefix = "saved";
  await mount();
  await click("Reset configuration");
  const confirm = nodes("Button").find(
    (node) => node.props["children"] === "Confirm reset",
  )?.props["onClick"];
  const response = deferred<Awaited<ReturnType<typeof dispatch>>>();
  bridge.invoke.mockReturnValueOnce(response.promise);
  await click("Confirm reset");
  expect(nodes("Spinner")[0]?.props["label"]).toBe(
    "Resetting configuration and verifying",
  );
  expect(nodes("Lozenge")).toHaveLength(0);
  expect(nodes("Button").every((node) => node.props["isDisabled"])).toBe(true);
  const calls = bridge.invoke.mock.calls.length;
  await act(async () => {
    confirm?.();
  });
  await submit(0);
  await submit(1);
  expect(bridge.invoke).toHaveBeenCalledTimes(calls);
  const readBack = deferred<Awaited<ReturnType<typeof dispatch>>>();
  bridge.invoke.mockReturnValueOnce(readBack.promise);
  await act(async () => {
    prefix = undefined;
    response.resolve({
      jsonrpc: "2.0",
      id: bridge.invoke.mock.calls[calls - 1]?.[1].id,
      result: { configured: false },
    });
  });
  expect(nodes("Spinner")).toHaveLength(1);
  expect(text()).not.toContain("Configuration reset");
  await act(async () => {
    readBack.resolve({
      jsonrpc: "2.0",
      id: bridge.invoke.mock.calls.at(-1)?.[1].id,
      result: { configured: false, prefix: null },
    });
  });
  expect(text()).toContain("Configuration reset");
});

it.each([
  "delete failure",
  "read-back failure",
  "read-back mismatch",
  "permission denied",
])(
  "shows sanitized uncertain state and offers a read retry on %s",
  async (failure) => {
    prefix = "private saved prefix";
    await mount();
    await submit(1);
    await click("Reset configuration");
    if (failure === "delete failure")
      bridge.invoke.mockRejectedValueOnce(
        new Error("private delete exception"),
      );
    else if (failure === "permission denied")
      bridge.invoke.mockImplementationOnce(async (_key, request) => ({
        jsonrpc: "2.0",
        id: request.id,
        error: { code: -32001, message: "Forbidden" },
      }));
    else {
      bridge.invoke.mockImplementationOnce(respond);
      if (failure === "read-back failure")
        bridge.invoke.mockRejectedValueOnce(
          new Error("private read exception"),
        );
      else
        bridge.invoke.mockImplementationOnce(async (_key, request) => ({
          jsonrpc: "2.0",
          id: request.id,
          result: { configured: true, prefix: "private concurrent write" },
        }));
    }
    await click("Confirm reset");
    expect(text()).not.toContain("private");
    expect(text()).not.toContain("Configuration reset");
    expect(nodes("Lozenge")).toHaveLength(0);
    expect(nodes("CodeBlock")).toHaveLength(0);
    expect(nodes("Textfield")[0]?.props["defaultValue"]).toBe("");
    expect(nodes("Textfield")[0]?.props["isDisabled"]).toBe(true);
    expect(text()).toContain(
      failure.startsWith("read-back")
        ? "Configuration was reset, but read-back verification failed"
        : "Reset could not be confirmed",
    );
    const resets = bridge.invoke.mock.calls.filter(
      ([, request]) => request.method === "config.reset",
    ).length;
    await click("Retry");
    expect(
      bridge.invoke.mock.calls.filter(
        ([, request]) => request.method === "config.reset",
      ),
    ).toHaveLength(resets);
  },
);

it.each(["status", "get-started"] as const)(
  "%s does not offer destructive reset",
  async (page) => {
    prefix = "saved";
    await mount(page);
    expect(
      nodes("Button").some(
        (node) => node.props["children"] === "Reset configuration",
      ),
    ).toBe(false);
  },
);

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
  expect(nodes("Lozenge")).toHaveLength(0);
  expect(nodes("SectionMessage")).toHaveLength(0);
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
  expect(nodes("Lozenge")).toHaveLength(0);
  expect(nodes("SectionMessage")).toHaveLength(0);
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
  expect(nodes("Lozenge")).toHaveLength(0);
  expect(
    nodes("SectionMessage").every(
      (node) => node.props["appearance"] === "error",
    ),
  ).toBe(true);
  expect(nodes("Textfield")[0]?.props["isDisabled"]).toBe(true);
  await act(async () => {
    nodes("Button")
      .find((node) => node.props["children"] === "Retry")
      ?.props["onClick"]();
  });
  expect(nodes("Textfield")[0]?.props["defaultValue"]).toBe("new");
});

it.each(["status", "get-started"] as const)(
  "%s shows read-only configuration state and refreshes from storage",
  async (page) => {
    await mount(page);
    expect(text()).toContain("Not configured");
    expect(nodes("Form")).toHaveLength(0);
    expect(nodes("Textfield")).toHaveLength(0);
    expect(nodes("TextArea")).toHaveLength(0);
    if (page === "get-started") {
      expect(text()).toContain("1. Save a prefix — action needed.");
      expect(text()).toContain("Preview completion is not tracked.");
    }
    prefix = "😀<b>literal</b>";
    await click(page === "status" ? "Refresh" : "Refresh checks");
    expect(text()).toContain('"Configured"');
    if (page === "status") {
      expect(nodes("CodeBlock")[0]?.props["text"]).toBe(prefix);
      expect(nodes("CodeBlock")[0]?.props["language"]).toBe("text");
    } else {
      expect(text()).toContain("1. Save a prefix — complete.");
      expect(text()).toContain("verify manually on Configure");
    }
    expect(
      bridge.invoke.mock.calls.every(
        ([, request]) => request.method === "config.get",
      ),
    ).toBe(true);
  },
);

it.each(["status", "get-started"] as const)(
  "%s blocks overlapping refreshes and hides stale state on failed authorization",
  async (page) => {
    prefix = "private saved prefix";
    await mount(page);
    const initial = deferred<Awaited<ReturnType<typeof dispatch>>>();
    bridge.invoke.mockReturnValueOnce(initial.promise);
    const refresh = page === "status" ? "Refresh" : "Refresh checks";
    await click(refresh);
    expect(nodes("Spinner")[0]?.props["label"]).toBe("Loading configuration");
    expect(text()).not.toContain('"Configured"');
    expect(text()).not.toContain("private saved prefix");
    expect(text()).not.toContain("1. Save a prefix — complete.");
    expect(nodes("Button").every((node) => node.props["isDisabled"])).toBe(
      true,
    );
    const calls = bridge.invoke.mock.calls.length;
    await click(refresh);
    expect(bridge.invoke).toHaveBeenCalledTimes(calls);
    await act(async () => {
      initial.resolve({
        jsonrpc: "2.0",
        id: bridge.invoke.mock.calls[calls - 1]?.[1].id,
        error: { code: -32001, message: "sensitive permission failure" },
      });
    });
    expect(text()).toContain("Jira administrator access");
    expect(text()).not.toContain("sensitive permission failure");
    expect(text()).not.toContain("private saved prefix");
    expect(nodes("Lozenge")).toHaveLength(0);
    expect(
      nodes("SectionMessage").every(
        (node) => node.props["appearance"] === "error",
      ),
    ).toBe(true);
    expect(text()).not.toContain('"Not configured"');
    expect(text()).not.toContain('"Configured"');
    await click("Retry");
    expect(text()).toContain('"Configured"');
  },
);

it.each(["status", "get-started"] as const)(
  "%s offers Retry on sanitized initial read errors",
  async (page) => {
    bridge.invoke.mockRejectedValueOnce(new Error("secret storage failure"));
    await mount(page);
    expect(text()).not.toContain("secret storage failure");
    expect(text()).not.toContain('"Not configured"');
    expect(text()).not.toContain("complete.");
    await click("Retry");
    expect(text()).toContain("Not configured");
  },
);

it.each([
  ["status", "Configure", "config-configure"],
  ["status", "Get started", "config-get-started"],
  ["configure", "Status", "config-admin"],
  ["get-started", "Configure", "config-configure"],
  ["get-started", "Status", "config-admin"],
] as const)(
  "%s navigates to %s through its module key",
  async (page, label, moduleKey) => {
    await mount(page);
    await click(label);
    expect(bridge.navigate).toHaveBeenCalledExactlyOnceWith({
      target: "module",
      moduleKey,
    });
  },
);

it("reports sanitized navigation failure and allows retry", async () => {
  await mount("status");
  bridge.navigate.mockRejectedValueOnce(
    new Error("private navigation failure"),
  );
  await click("Configure");
  expect(text()).toContain("The page could not be opened");
  expect(text()).not.toContain("private navigation failure");
  await click("Configure");
  expect(bridge.navigate).toHaveBeenCalledTimes(2);
  expect(text()).not.toContain("The page could not be opened");
});

it("clears the cached prefix and preview after authorization is revoked", async () => {
  prefix = "private saved prefix";
  await mount();
  await submit(1);
  bridge.invoke.mockImplementationOnce(async (_key, request) => ({
    jsonrpc: "2.0",
    id: request.id,
    error: { code: -32001, message: "Forbidden" },
  }));
  await submit(1);
  expect(nodes("Textfield")[0]?.props["defaultValue"]).toBe("");
  expect(nodes("CodeBlock")).toHaveLength(0);
  expect(text()).not.toContain("private saved prefix");
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
