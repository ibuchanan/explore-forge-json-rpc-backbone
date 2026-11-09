// Generated from docs/reference/openrpc.json; do not edit.
export const catalog = {
  openrpc: "1.3.2",
  info: {
    title: "Forge configuration JSON-RPC",
    version: "0.1.0",
    description:
      "Single-call JSON-RPC 2.0 subset. No batches, notifications, positional params or null IDs. A successful authenticated POST returns one JSON-RPC response with the request ID and exactly one result or error. Invalid IDs and parse errors use null. This POC is not a production service.",
  },
  "x-security": {
    type: "http",
    scheme: "basic",
    description:
      "Supply one Authorization: Basic header with a Jira user's email and API token. The web trigger verifies the identity and Jira ADMINISTER permission on every request, for the configured installation only. The public URL alone grants no access.",
  },
  "x-http": {
    method: "POST",
    contentType: "application/json",
    maxBodyBytes: 65536,
    nonRpcErrors: {
      "400":
        "Bad Request for malformed headers, query parameters or credentials inside params",
      "401": "Unauthorized when credentials are missing or invalid",
      "403": "Forbidden when the verified user is not a Jira administrator",
      "405": "Method Not Allowed",
      "413": "Payload Too Large",
      "415": "Unsupported Media Type",
      "503":
        "Service Unavailable when the installation binding or Jira verification is unavailable",
    },
  },
  "x-protocolErrors": [
    { code: -32700, message: "Parse error" },
    { code: -32600, message: "Invalid request" },
    { code: -32601, message: "Method not found" },
    { code: -32602, message: "Invalid params" },
    { code: -32603, message: "Internal error" },
    { code: -32001, message: "Forbidden" },
  ],
  methods: [
    {
      name: "config.get",
      "x-forge-ahead": { web: true, execution: "asApp", audit: "standard" },
      summary: "Read the saved non-secret prefix or the unconfigured state.",
      paramStructure: "by-name",
      params: [],
      result: {
        name: "configuration",
        required: true,
        schema: {
          type: "object",
          required: ["configured", "prefix"],
          additionalProperties: false,
          properties: {
            configured: { type: "boolean" },
            prefix: { type: ["string", "null"] },
          },
        },
      },
      examples: [
        {
          name: "before setup",
          params: [],
          result: {
            name: "configuration",
            value: { configured: false, prefix: null },
          },
        },
      ],
      errors: [{ $ref: "#/components/errors/Forbidden" }],
    },
    {
      name: "config.set",
      summary:
        "Trim and persist a non-secret prefix in installation-scoped Forge KVS.",
      description:
        "The prefix must contain 1 to 64 Unicode code points as sent, including any surrounding whitespace, and at least one non-whitespace character. The trimmed value is stored. Extra parameters are rejected.",
      paramStructure: "by-name",
      params: [
        {
          name: "prefix",
          required: true,
          schema: { type: "string", minLength: 1, maxLength: 64 },
          description:
            "Length counts Unicode code points before trimming; the trimmed value must not be empty.",
        },
      ],
      result: {
        name: "configuration",
        required: true,
        schema: {
          type: "object",
          required: ["configured"],
          additionalProperties: false,
          properties: { configured: { type: "boolean", enum: [true] } },
        },
      },
      examples: [
        {
          name: "save prefix",
          params: [{ name: "prefix", value: "  hi  " }],
          result: { name: "configuration", value: { configured: true } },
        },
      ],
      errors: [
        { $ref: "#/components/errors/InvalidParams" },
        { $ref: "#/components/errors/Forbidden" },
      ],
    },
    {
      name: "integration.preview",
      "x-forge-ahead": { web: true, execution: "asApp", audit: "standard" },
      summary: "Preview local output using the saved prefix.",
      description:
        "Accepts exactly one text parameter containing at most 2,000 Unicode code points, including empty text. Returns the saved prefix concatenated with text without trimming or normalization. Reads the current installation-scoped prefix on every call; no implicit default or client-supplied configuration is used. Does not persist text or output or call an external API. Invalid params are rejected before checking configuration. Before setup, returns Not configured (-32002).",
      paramStructure: "by-name",
      params: [
        {
          name: "text",
          required: true,
          schema: { type: "string", maxLength: 2000 },
          description:
            "Preserved exactly; length counts Unicode code points. Extra parameters are rejected.",
        },
      ],
      result: {
        name: "preview",
        required: true,
        schema: {
          type: "object",
          required: ["output"],
          additionalProperties: false,
          properties: { output: { type: "string", maxLength: 2064 } },
        },
      },
      examples: [
        {
          name: "preview after saving hi",
          params: [{ name: "text", value: " there 😀" }],
          result: { name: "preview", value: { output: "hi there 😀" } },
        },
      ],
      errors: [
        { $ref: "#/components/errors/InvalidParams" },
        { $ref: "#/components/errors/Forbidden" },
        { $ref: "#/components/errors/NotConfigured" },
      ],
    },
    {
      name: "config.reset",
      summary:
        "Clear the saved prefix in installation-scoped Forge KVS (admin only).",
      description:
        "Requires a trusted UI caller with Jira ADMINISTER permission and exactly confirm: true. Authenticated HTTP callers are forbidden (-32001). Deletes only config.prefix; does not alter app identity, installation settings or unrelated storage. Idempotent if already unset. The UI performs a separate config.get read-back before showing success.",
      paramStructure: "by-name",
      params: [
        {
          name: "confirm",
          required: true,
          schema: { type: "boolean", enum: [true] },
          description: "Must be exactly true to prevent accidental resets.",
        },
      ],
      result: {
        name: "configuration",
        required: true,
        schema: {
          type: "object",
          required: ["configured"],
          additionalProperties: false,
          properties: { configured: { type: "boolean", enum: [false] } },
        },
      },
      examples: [
        {
          name: "reset after configuration",
          params: [{ name: "confirm", value: true }],
          result: { name: "configuration", value: { configured: false } },
        },
      ],
      errors: [
        { $ref: "#/components/errors/InvalidParams" },
        { $ref: "#/components/errors/Forbidden" },
      ],
    },
  ],
  components: {
    errors: {
      Forbidden: { code: -32001, message: "Forbidden" },
      InvalidParams: { code: -32602, message: "Invalid params" },
      NotConfigured: { code: -32002, message: "Not configured" },
    },
  },
};
