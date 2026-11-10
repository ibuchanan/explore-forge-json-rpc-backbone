# Implemented command and runtime reference

<!-- cspell:words openrpc webtrigger -->

This reference describes the current POC, not the proposed library extraction.
The machine-readable contract is [OpenRPC 1.3.2](openrpc.json).
The [main spec](../../specs/spec.md) contains future work; current evidence lives
in the [verification record](../../specs/deployed-poc-verification.md).

## Command catalog

All methods require named object parameters with exactly the documented fields.
Unknown fields are rejected. Length limits count Unicode code points, not UTF-16
code units. Prefix is arbitrary demo text, not a project key, URL, or credential.

| Method                | Parameters           | Successful result                                 | Authorized UI | Web trigger |
| --------------------- | -------------------- | ------------------------------------------------- | ------------- | ----------- |
| `config.get`          | `{}`                 | `{ configured: boolean, prefix: string \| null }` | Allowed       | Allowed     |
| `config.set`          | `{ prefix: string }` | `{ configured: true }`                            | Allowed       | Not exposed |
| `config.reset`        | `{ confirm: true }`  | `{ configured: false }`                           | Allowed       | Not exposed |
| `integration.preview` | `{ text: string }`   | `{ output: string }`                              | Allowed       | Allowed     |

`config.set` validates the prefix as sent (1–64 code points, counted before
trimming), then trims it and rejects a result that is empty. Invalid input leaves
the previous value unchanged.
`config.get` returns `{ configured: false, prefix: null }` when absent; a saved
value produces `configured: true` and the literal value.

`integration.preview` accepts 0–2,000 code points and preserves text exactly.
Output is the saved prefix immediately followed by text, with no inserted space.
Before configuration, valid preview input returns `-32002 Not configured`.
Preview reads storage; it does not use the draft prefix form or write output.

`config.reset` requires the literal boolean `true` and an authorized UI source.
It removes only `config.prefix` and succeeds if already absent. Even a valid
HTTP credential cannot reset. Reset never changes credentials, unrelated data,
app identity, or the installation. A successful write/delete is distinct from
the UI's subsequent read-back assertion; failures do not imply rollback.

## JSON-RPC profile

The app supports a deliberately restricted single-call JSON-RPC 2.0 profile.
Required fields are `jsonrpc: "2.0"`, a nonempty method string, object `params`,
and a string or finite-number `id`. Other top-level fields are rejected.
Empty string IDs are accepted. Batches, notifications, positional parameters,
missing/null IDs, and client-supplied caller context are unsupported.

A response contains `jsonrpc: "2.0"`, the valid request ID, and exactly one
`result` or `error`. Parse failures and invalid IDs use `id: null`. Envelope,
parameter and authorization checks are handwritten. Successful handler outputs
are validated by standalone functions generated from OpenRPC result schemas;
the catalog does not grant authority. Command types and registered names are
also generated at build time.

| Code     | Message            | Meaning                                              |
| -------- | ------------------ | ---------------------------------------------------- |
| `-32700` | `Parse error`      | Serialized input is not valid JSON                   |
| `-32600` | `Invalid Request`  | Envelope or single-call profile is unsupported       |
| `-32601` | `Method not found` | Authorized, well-formed call names an unknown method |
| `-32602` | `Invalid params`   | Command parameters fail shape, type, or value rules  |
| `-32603` | `Internal error`   | Unexpected failure; raw exception is suppressed      |
| `-32001` | `Forbidden`        | Trusted caller is denied or HTTP attempts reset      |
| `-32002` | `Not configured`   | Preview requires a saved prefix                      |

The shared dispatcher validates envelopes before caller authorization. Authorized
calls then use the JSON-RPC library for method lookup. All four commands route to
the neutral executor described below. Reset parameter validation precedes its
source restriction. Authentication/HTTP guards occur before this dispatcher.
Unexpected exception messages, stacks, and error data are not returned. Neutral
failures map to fixed public text.

### Neutral command executor

`src/executor.ts` exports `execute(method, params, caller, store)` for all four
commands. Parameters are untrusted; caller context and the storage adapter are
separate, server-constructed arguments. The return value is
`Promise<Result<Output, CommandFailure>>` from `@forge-ahead/errors`, not an RPC
response or exception. The core imports no Forge or JSON-RPC runtime.

The adapter checks the trusted caller before the handler runs. Semantic failures
are `forbidden`, `invalid-params`, and `not-configured`; the package adds
`method-not-found` and `internal-error`.
The app-owned reset policy requires valid confirmation followed by an authorized
UI caller; a valid HTTP credential never grants reset authority. Storage
exceptions become `internal-error` regardless of exception type or message. The
`forge-ahead-rpc` dispatcher in `src/adoption.ts` maps failures to the codes above
(with `not-configured` as the app's `errorMap` entry) and frames the response. Both
the web trigger and the UI resolver use that same dispatcher.

Successful set/reset invokes the selected storage operation once, without an
implicit read-back. An exception or invalid output after persistence returns
`internal`; neither establishes rollback, triggers a retry, nor restores earlier
configuration. A separate read observes the resulting state. The dispatcher
validates output before returning success.
Validation details and output values are neither returned nor logged. Each command
is a single entry in the handler map checked against the generated contract.

### Generated contract

`docs/reference/openrpc.json` owns the catalog. `scripts/generate-rpc.ts` calls
the `forge-ahead-rpc/generator` export and owns the tracked files in
`src/generated/rpc/`: `contract.ts` (types), `validators.js` and `validators.d.ts`
(standalone input and output validators), `web-policy.ts` (reviewed web exposure)
and `catalog.ts` (the embedded catalog). One read-only drift check covers all of
them. The generator is not imported by runtime source. No generated handler bodies
or stubs exist.
See [development guidance](../../DEVELOPMENT.md#regenerate-command-contracts)
for regeneration and read-only drift checks.

## Identity and authorization

The trusted caller has source `api` or `ui` and an `authorized` boolean.
It is server-constructed, not a reusable identity model or client parameter.

### UI caller

UI calls use the Bridge resolver `rpc`. It requires a nonempty server-provided
account ID and checks Jira `ADMINISTER` with `api.asUser()` on every call.
Missing identity, denied permission, failed responses, and lookup exceptions
fail closed before storage access.

### Web trigger caller

The web trigger verifies the caller against Jira on every request: HTTP Basic
credentials must identify a Jira user, and that user must hold `ADMINISTER`. It
creates an API caller only after verification. Only methods marked
`x-forge-ahead.web` and selected in `src/adoption.ts` are routable, so reset and
save are not reachable.

### Shared policy

The adapter rejects unauthorized callers and unsupported sources.
Admin-page placement alone is not authorization. No wildcard permission or
fabricated user identity is used.

No command calls a product API or external integration. The resolver's permission
lookup is an authorization step, not command business behavior. Permissions for
future operations have not been designed by this POC.

## Web trigger adapter

The `config-rpc` v2 dynamic web-trigger module maps to function `rpc`, handler
`index.run`, which calls the `forge-ahead-rpc/webtrigger` handler configured in
`src/adoption.ts`. Its response uses Forge's array-valued headers and a JSON
string body.

The entry point reads the installation ARI from `getAppContext()` and resolves
the installed Jira site's `baseUrl` through an as-app request to
`/rest/api/3/serverInfo` on each invocation. No installation or site runtime
variables are required. Discovery failure or an invalid HTTPS Atlassian site
origin returns `503` before caller credentials are forwarded. Caller-token
verification uses Forge `fetch` and the manifest's `https://*.atlassian.net`
egress; the discovery request does not authenticate the external caller.
Body limit is 65,536 bytes. Content type is `application/json`,
case-insensitive, optionally followed by `; charset=utf-8`. Query parameters,
duplicate headers and credential-like keys inside `params` are rejected.

| HTTP status | Body                           | Condition                                             |
| ----------- | ------------------------------ | ----------------------------------------------------- |
| `400`       | `{"error":"Request rejected"}` | Malformed headers, query parameters or credentials    |
| `401`       | `{"error":"Request rejected"}` | Authorization absent or Jira rejected the credentials |
| `403`       | `{"error":"Request rejected"}` | Verified user is not a Jira administrator             |
| `405`       | `{"error":"Request rejected"}` | Method is not POST                                    |
| `413`       | `{"error":"Request rejected"}` | Body exceeds the byte limit                           |
| `415`       | `{"error":"Request rejected"}` | Content type is not accepted                          |
| `503`       | `{"error":"Request rejected"}` | Installation unbound or Jira verification unavailable |

Verified protocol and command outcomes return HTTP 200 with `application/json`,
including RPC errors. `rpc.discover` lists only the exposed methods. No
CORS/browser-to-web-trigger path is configured for the demo.

## UI and storage

Three UI Kit admin modules use the same resolver and command implementations:

| Screen      | Entry role              | Behavior                                      |
| ----------- | ----------------------- | --------------------------------------------- |
| Status      | Jira admin navigation   | Reads saved configuration; no editable fields |
| Configure   | Manage apps Configure   | Saves/resets with read-back and runs preview  |
| Get started | Manage apps Get started | Explains setup and refreshes checklist state  |

Configured feedback means a saved value was read successfully. It is not an HTTP
credential, connectivity, or third-party check. Preview remains a manual
verification step. Pending actions are disabled; failed reads are not treated
as empty or successful state. Exact screen behavior is covered by the
[Admin UI proof guide](../how-to/prove-admin-ui.md).

Storage is installation-scoped Forge KVS under `config.prefix`, accessed through
an injected `get`/`set`/`reset` adapter. There is no process-local persistent cache.
The manifest uses Node.js 24, ESM source, and `storage:app`/`read:jira-work` scopes.

## Logging

Backend records use `@forge-ahead/logging`, named `config-rpc`. The UI resolver
logs `rpc.invoke` and `rpc.complete` with `source=ui`, the outcome, and an RPC
error code when applicable. `disposition` does not claim Bridge delivery. Logs
omit parameters, preview and prefix values, client IDs, credentials, account IDs
and raw exception details. The web trigger's own audit hooks are not configured.

## Related records

- [OpenRPC contract](openrpc.json): all four commands, including which are web-exposed.
- [Package adapter](../../src/adoption.ts) and [app handlers](../../src/executor.ts):
  current dispatch and execution boundaries.
- [Extraction decision](../../specs/command-architecture-decision.md): dated local
  checks, keep/change/defer conclusions, and unapplied trigger-handoff delta.
- [Deployed V&V record](../../specs/deployed-poc-verification.md): historical,
  operator-reported run against the retired bearer credential.
- [Historical tooling V&V](../../specs/secretspec-validation.md): original
  SecretSpec pass, not current upstream validation.
- [Fence Rider documentation](https://github.com/ibuchanan/ranch-rig-fence-rider#documentation):
  shared configuration, provider, and command workflow reference.
