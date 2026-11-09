/** Codes the admin UI branches on; the package dispatcher owns the rest. */
export const rpcErrors = {
  "invalid-params": { code: -32602, message: "Invalid params" },
  internal: { code: -32603, message: "Internal error" },
  forbidden: { code: -32001, message: "Forbidden" },
  "not-configured": { code: -32002, message: "Not configured" },
} as const;
