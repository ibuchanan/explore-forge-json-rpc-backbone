import { expect, it, vi } from "vitest";

vi.mock("@forge/bridge", () => ({ makeInvoke: () => vi.fn() }));

import { failureMessage, RpcFailure } from "../src/frontend/client";
import { rpcErrors } from "../src/rpc-errors";

it.each([
  [
    rpcErrors.forbidden,
    "Jira administrator access and a successful permission check are required. Check your access, then retry.",
  ],
  [
    rpcErrors["not-configured"],
    "Not configured. Save a prefix, then run the preview again.",
  ],
  [rpcErrors["invalid-params"], "Check the field limits and try again."],
  [
    rpcErrors.internal,
    "The request could not be completed. Retry; if it continues, contact your app administrator.",
  ],
])("presents safe guidance for $message", ({ code }, message) => {
  expect(failureMessage(new RpcFailure(code))).toBe(message);
});
