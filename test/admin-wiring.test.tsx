import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";

const render = vi.hoisted(() => vi.fn());
vi.mock("@forge/react", () => ({ default: { render } }));
vi.mock("../src/frontend/App", () => ({ App: () => null }));

it("wires Status, Configure and Get started to distinct native entrypoints and the shared resolver", async () => {
  const manifest = readFileSync(
    new URL("../manifest.yml", import.meta.url),
    "utf8",
  );
  for (const [key, resource, title, flag, entrypoint, page] of [
    ["config-admin", "status-ui", "JSON-RPC status", "", "status", "status"],
    [
      "config-configure",
      "config-ui",
      "Configure",
      "useAsConfig",
      "index",
      undefined,
    ],
    [
      "config-get-started",
      "get-started-ui",
      "Get started",
      "useAsGetStarted",
      "get-started",
      "get-started",
    ],
  ] as const) {
    expect(manifest).toContain(
      `    - key: ${key}\n      resource: ${resource}\n      render: native\n      resolver:\n        function: config-resolver\n      title: ${title}${flag ? `\n      ${flag}: true` : ""}`,
    );
    expect(manifest).toContain(
      `  - key: ${resource}\n    path: src/frontend/${entrypoint}.tsx`,
    );
    render.mockClear();
    if (entrypoint === "index") await import("../src/frontend/index");
    else if (entrypoint === "status") await import("../src/frontend/status");
    else await import("../src/frontend/get-started");
    expect(render).toHaveBeenCalledTimes(1);
    expect(render.mock.calls[0]?.[0].props.children.props.page).toBe(page);
  }
});
