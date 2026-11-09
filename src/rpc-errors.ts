export const rpcErrors = {
  "parse-error": { code: -32700, message: "Parse error" },
  "invalid-request": { code: -32600, message: "Invalid Request" },
  "method-not-found": { code: -32601, message: "Method not found" },
  "invalid-params": { code: -32602, message: "Invalid params" },
  internal: { code: -32603, message: "Internal error" },
  forbidden: { code: -32001, message: "Forbidden" },
  "not-configured": { code: -32002, message: "Not configured" },
} as const;
