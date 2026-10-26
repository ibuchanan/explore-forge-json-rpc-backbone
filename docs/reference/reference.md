# Implemented command and runtime reference

<!-- cspell:words openrpc -->

This reference describes the current POC, not the proposed library extraction.
The machine-readable contract is [OpenRPC 1.3.2](openrpc.json).
The [main spec](../../specs/spec.md) contains future work; current evidence lives
in the [verification record](../../specs/deployed-poc-verification.md).

## Command catalog

All methods require named object parameters with exactly the documented fields.
Unknown fields are rejected. Length limits count Unicode code points, not UTF-16
code units. Prefix is arbitrary demo text, not a project key, URL, or credential.

| Method                | Parameters           | Successful result                                 | Authorized UI | Authenticated HTTP |
| --------------------- | -------------------- | ------------------------------------------------- | ------------- | ------------------ |
| `config.get`          | `{}`                 | `{ configured: boolean, prefix: string \| null }` | Allowed       | Allowed            |
| `config.set`          | `{ prefix: string }` | `{ configured: true }`                            | Allowed       | Allowed            |
| `config.reset`        | `{ confirm: true }`  | `{ configured: false }`                           | Allowed       | Forbidden          |
| `integration.preview` | `{ text: string }`   | `{ output: string }`                              | Allowed       | Allowed            |

`config.set` trims before validation and persistence. The normalized prefix must
contain 1–64 code points. Invalid input leaves the previous value unchanged.
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

Authorization precedes parameter validation and storage. Semantic failures are
`forbidden`, `method-not-found`, `invalid-params`, `not-configured`, and `internal`.
The app-owned reset policy requires valid confirmation followed by an authorized
UI caller; a valid HTTP credential never grants reset authority. Storage
exceptions become `internal` regardless of exception type or message. The adapter
in `src/commands.ts` maps failures to the codes above and frames the response.
Both HTTP and the UI resolver use that same adapter.

Successful set/reset invokes the selected storage operation once, without an
implicit read-back. An exception or invalid output after persistence returns
`internal`; neither establishes rollback, triggers a retry, nor restores earlier
configuration. A separate read observes the resulting state. Output validation
runs before returning success to an adapter or emitting its success narrative.
Validation details and output values are neither returned nor logged; the existing
internal-failure narrative warns that a write may be uncertain. Each command is
registered once from generated `commandNames`, with no legacy handler path or fallback.

### Generated contract

`docs/reference/openrpc.json` owns the catalog. The build-time traversal in
`scripts/command-contracts.ts` delegates schema compilation to the dev dependency
`json-schema-to-typescript` 16.0.0. `scripts/generate-commands.ts` formats output
with the installed Biome version and owns the tracked `src/generated/commands.ts`
and `src/generated/commands.validators.js`. The latter contains standalone Ajv
8.20.0 output validators, including its small Unicode length helper bundled by
esbuild. Ajv remains a dev dependency; no runtime schema compiler or external module
resolution is required by these validators. The same read-only drift check covers
both artifacts.

The artifact exports `Commands` (method-indexed named params and results), literal
`commandNames`, `CommandName`, `HandlerMap<Context, Failure>`, and `TypedCaller`.
The executor's app-owned handlers satisfy the exhaustive map while accepting
unknown input for runtime validation. The JSON-RPC registration, Bridge caller,
request types, and deployed-verifier fixtures consume the same generated contract.
The verifier preserves configuration-first report ordering independently of
OpenRPC declaration order.

Supported schemas are the bounded subset selected by the
[generation experiment](../../specs/openrpc-generation-experiment.md): named
parameters; object/string/boolean/null types and nullable type arrays; properties,
required fields, boolean additional properties, enum/const, titles/descriptions,
and string lengths. Empty parameter lists become `Record<string, never>`.
Only local `#/components/schemas/<name>` references are allowed; missing references
fail and file/HTTP resolvers are disabled. Unsupported keywords/types, positional
parameters, duplicate params, and conservatively normalized naming collisions
fail generation. This is not a general schema compiler or remote resolver.

Generated types alone do not validate untrusted data, trim prefixes, preserve
preview text, or authorize callers. Parameter and policy checks remain handwritten;
standalone runtime validators enforce output shapes, required/extra fields, literal
booleans, nullability and Unicode length limits without coercion or field removal.
`createExecutor(handlers)` applies the same validation boundary to injected handler
fixtures; `execute` binds it to the four app-owned handlers. No generated handler
bodies or stubs exist. Neither generator nor schema compiler is imported by runtime
source. TypeScript includes the generated JavaScript and omits emitted comments;
ESNext/Node resolution and the 10 kB budget remain unchanged.
See [development guidance](../../DEVELOPMENT.md#regenerate-command-contracts)
for regeneration and read-only drift checks.

## Local product-event contract proof

`test/native/product-event.ts` binds Jira issue-created events only to
`integration.preview`. It accepts an injected executor and caller-owned policy,
constructs non-UI caller context separately, and maps only the issue summary to
preview text. It is not exported by the app or wired into the manifest.

Success returns `undefined`; terminal failures are recorded and acknowledged.
An explicitly transient read can return the SDK's `InvocationError`, subject to
app retry permission and the four-retry limit. Uncertain effects require
reconciliation, never an automatic retry. Production `internal` remains terminal
in this fixture; it does not imply transience. The
[contract evidence](../../specs/native-outcome-translation.md) records sources,
local-only failure classifications, and limits. This is not delivery or scheduling
verification and does not establish actual trigger-package runtime integration.

## Identity and authorization

The trusted caller has source `api` or `ui` and an `authorized` boolean.
It is server-constructed, not a reusable identity model or client parameter.

### UI caller

UI calls use the Bridge resolver `rpc`. It requires a nonempty server-provided
account ID and checks Jira `ADMINISTER` with `api.asUser()` on every call.
Missing identity, denied permission, failed responses, and lookup exceptions
fail closed before storage access.

### HTTP caller

HTTP checks a separately provisioned environment-specific bearer secret.
It creates an API caller only after authentication. The token grants the three
permitted demo operations, not Jira user identity or reset permission.

### Shared policy

The command dispatcher rejects unauthorized callers and unsupported sources.
Admin-page placement alone is not authorization. No wildcard permission or
fabricated user identity is used.

No command calls a product API or external integration. The resolver's permission
lookup is an authorization step, not command business behavior. Permissions for
future operations have not been designed by this POC.

## HTTP adapter

The installed `@forge-ahead/triggers` 0.2.1 package is not consumed by this
runtime adapter. Direct helper substitution changes the required exact response
objects or JSON-RPC rejection envelope; the
[compatibility experiment](../../specs/trigger-plumbing-compatibility.md) records
the expected-failure fixtures and deferred adoption. A declared dependency and
the local native fixture's type-only reuse do not establish runtime integration.

The `config-rpc` v2 dynamic web-trigger module maps to function `rpc`, handler
`index.run`. Its response uses Forge's array-valued headers and string body.

Guards run in this order: verb, media type, UTF-8 byte limit, configured secret,
then authorization. Body limit is 16,384 bytes. Content type is
`application/json`, case-insensitive, optionally followed by `; charset=utf-8`.
Other media parameters and duplicate content-type values are rejected.
Authorization must have exactly one header value matching the supported shape;
case variants and combined duplicate values cannot bypass that rule.
The secret comparison uses equal-size SHA-256 digests and `timingSafeEqual`.

| HTTP status | Plain-text body          | Condition                                                |
| ----------- | ------------------------ | -------------------------------------------------------- |
| `405`       | `Method Not Allowed`     | Method is not POST                                       |
| `415`       | `Unsupported Media Type` | Content type is not accepted                             |
| `413`       | `Payload Too Large`      | Body exceeds the UTF-8 byte limit                        |
| `503`       | `Service Unavailable`    | Runtime `RPC_BEARER_SECRET` is absent/empty              |
| `401`       | `Unauthorized`           | Authorization is absent, duplicated, malformed, or wrong |

These responses use `text/plain; charset=utf-8`. Authenticated protocol/command
outcomes return HTTP 200 with `application/json`, including RPC
errors. No CORS/browser-to-web-trigger path is configured for the demo.

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

## Logging and deployed verification

Backend records use `@forge-ahead/logging`, named `config-rpc`. Every shared RPC
has `rpc.invoke`/`rpc.complete`, a generated `invocationId`, safe method/source,
outcome, elapsed milliseconds, and an RPC error code when applicable.
`disposition=response-ready` means the adapter has constructed a response, not
that HTTP/Bridge delivery was observed. Rejected calls retain invocation and
completion records. `@forge-ahead/logging/demo` adds a two-step `rpc-lifecycle`
narrative per call. HTTP guard failures log `http.reject`; absent runtime
credentials log `RUNTIME_SECRET_MISSING` with `http.authenticate` and status 503.

The local product-event fixture uses that same logger, not an installed native
handler. Each call has `native.invoke`/`native.complete`, a generated
`invocationId`, fixed `source=product-event`, `adapter=jira.issue-created`, and
`method=integration.preview`. Its three-step `native-lifecycle` narrative records
validation, semantic outcome, and adapter completion intent separately. Step
numbers restart per invocation, including overlapping calls. Completion includes
`outcome`, `disposition`, and elapsed milliseconds:

| Outcome                                                             | Disposition                                                   | Completion level |
| ------------------------------------------------------------------- | ------------------------------------------------------------- | ---------------- |
| `succeeded`                                                         | `acknowledged`                                                | `info`           |
| `forbidden`, `invalid-params`, `method-not-found`, `not-configured` | `terminal`                                                    | `warn`           |
| `transient`                                                         | `retry-requested` or `terminal`, according to existing policy | `warn`           |
| `internal`                                                          | `terminal`                                                    | `error`          |
| `write-uncertain`                                                   | `reconciliation-required`                                     | `error`          |

These are allowlisted fixture classifications, not values inferred from arbitrary
exceptions or JSON-RPC codes. Normal handler completion does not establish command
success. A retry intent is not observed scheduling; reconciliation-required does
not perform reconciliation or establish rollback. Output values are not serialized
for observation. Production execution and native completion policy are unchanged.

The opt-in verifier logs a numbered `deployed-verification` narrative to stderr
and a sanitized JSON report to stdout, sharing a generated local `runId`.
That ID is not sent to the backend and is not automatically correlated with
backend invocation IDs. Local logger capture is not deployed backend-log
inspection. Info-level records honor logger level configuration. Logs omit
parameters, preview/prefix values, client IDs, credentials, URLs, account IDs,
and raw exception details.

The deployed suite requires a development Jira target and initially unset prefix.
It checks read-only readiness before state/write tests, stops on the first
failure, and leaves `poc-😀` saved on success. No automatic reset/restoration or
retry occurs. Reports flag possible configuration changes after a save attempt,
not transaction rollback. UI remains unverified; optional isolation checks are
read-only. HTTP probes reject redirects, time out after 20 seconds, and bound
responses to 32 KiB. Normal test/check commands never run the live entry point.

`commandCoverage` lists all four commands for the `http-bearer` and `ui-admin`
execution profiles. Each entry declares `expected` (`success`, except HTTP reset:
`denial`) and separate `successfulExecution` / `denial` evidence fields
(`verified` or `unverified`). Evidence is credited only after an authenticated,
contract-matching response: a result verifies execution; `-32001` verifies denial.
Other errors, planned probes, and failed checks earn neither. Earlier observations
survive an early stop, but an uncertain save is not verified execution. HTTP reset
success and all UI execution remain unverified, even on a passing HTTP run.
Installed UI rendering, optional isolation, and backend-log inspection are separate
observations; the local verifier run ID does not establish backend correlation.

SecretSpec resolves target, token, and URL settings. URL upsert trusts nonempty
cached values; otherwise it obtains/saves the module URL. Local resolution is
not runtime provisioning. See [development configuration](../../DEVELOPMENT.md)
and the [JSON-RPC proof guide](../how-to/prove-json-rpc.md) for procedures.

## Related records

- [OpenRPC contract](openrpc.json): all four commands, including reset denial.
- [JSON-RPC adapter](../../src/commands.ts) and [neutral executor](../../src/executor.ts):
  current dispatch and execution boundaries.
- [Extraction decision](../../specs/command-architecture-decision.md): dated local
  checks, keep/change/defer conclusions, and unapplied trigger-handoff delta.
- [Deployed V&V record](../../specs/deployed-poc-verification.md): operator-reported
  HTTP pass; installed UI, isolation, and backend-log acceptance remain separate.
- [Historical tooling V&V](../../specs/secretspec-validation.md): original
  SecretSpec pass, not current upstream validation.
- [Fence Rider documentation](https://github.com/ibuchanan/ranch-rig-fence-rider#documentation):
  shared configuration, provider, and command workflow reference.
