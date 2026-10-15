# POC: shared commands for a Forge configuration lifecycle

<!-- cspell:words webtrigger unconfigured pocock -->

Status: draft for review. This spec narrows the hypothesis in
[Architectural Exploration: Command-Oriented JSON-RPC Engine for Atlassian
Forge](Architectural%20Exploration_%20Command-Oriented%20JSON-RPC%20Engine%20for%20Atlassian%20Forge.md).
It does not establish production suitability.

## Problem Statement

As a developer testing an integration Forge app, I can deploy and install it,
but an additional configuration step may be needed before an integrated flow
works. Today I must perform that step manually or drive a browser. I want to
exercise the same configuration and integration commands directly in fast tests
and through the deployed app, without writing a separate test-only backdoor or
duplicating behavior in the UI and HTTP handler. The linked
[configuration-lifecycle exploration][config-lifecycle] motivates the problem;
its exact implementation was not available for verification when drafting this
spec.

## Solution

Extend this existing Forge app with a small, shared command dispatcher. A Jira
admin can run its commands from a UI Kit page through a resolver, while an
authenticated external client can call the **same set of commands** through a
JSON-RPC webtrigger. The POC uses a non-secret configuration value and a
local, deterministic integration preview: save a prefix, read it back, and
preview the output for supplied text. This demonstrates a real persisted
configuration prerequisite without pretending that a mocked external API
proves integration with a third-party service.

Test at two seams: invoke the dispatcher directly for fast command tests, and
send authenticated requests to the **deployed HTTP webtrigger** for integration
tests. Also verify the installed UI manually against the same command results.
Publish the wire contract as an OpenRPC document. Customer-facing use of this
endpoint is a possible later application, not a production promise of this POC.

## User Stories

1. As an app developer, I want to call each command at a local dispatcher seam,
   so that command behavior can be checked without deploying or opening Jira.
2. As an app developer, I want a persistent, per-installation configuration
   prerequisite, so that tests can exercise the state transition after install.
3. As an app developer, I want the preview to fail clearly before configuration,
   so that an unconfigured installation cannot silently appear ready.
4. As an app developer, I want to save a non-secret prefix and read it back,
   so that I can confirm setup survived a separate Forge invocation.
5. As an app developer, I want to preview an output using saved configuration,
   so that I can check the configured path end to end without external egress.
6. As an app developer, I want the resolver and webtrigger to use the same
   command set, so that neither adapter silently diverges.
7. As a Jira admin, I want to inspect configuration status and run setup and
   preview commands from a UI Kit page, so that I can drive the POC manually.
8. As a Jira admin, I want empty, loading, success, and actionable error states,
   so that I can tell whether setup or a command failed.
9. As an API operator, I want an OpenRPC description and request IDs, so that
   I can create valid requests and correlate results with calls.
10. As an API operator, I want missing or invalid credentials rejected before
    commands execute, so that possession of the public URL is not enough.
11. As an API operator, I want predictable errors for malformed requests,
    unknown commands, invalid parameters, and unconfigured state, so that
    failures are diagnosable without exposing internal exception details.
12. As an app developer, I want transport identity derived from trusted
    server-side inputs, so that request parameters cannot impersonate a user.
13. As an app developer, I want a deployed HTTP test to save, read, and use
    configuration in separate calls, so that local mocks cannot hide broken
    storage, authentication, or manifest wiring.
14. As a maintainer, I want recorded HTTP and UI observations and a decision
    gate, so that I can decide whether to add a real integration next.

## Implementation Decisions

- **One shared command surface.** Use `json-rpc-2.0` as the proposed runtime
  server/dispatcher, not a long-lived HTTP server. Register the three methods
  once. Both adapters pass a validated single-request envelope and a trusted,
  server-constructed caller context to the same server; methods authorize
  against that context, never against client-supplied params. The HTTP adapter
  authenticates before calling it; the UI resolver verifies admin eligibility
  before calling it. Configuration storage is injected at the command boundary
  in local tests; the deployed app uses Forge KVS. Do not create a registry
  generator, test-only endpoint, or separate UI command implementation.
- **Small command set.** `config.set` takes `{ prefix: string }`, a
  non-secret string trimmed before validation and persistence; the trimmed
  value must be nonempty and at most 64 Unicode code points. It returns
  `{ configured: true }` after persisting it. `config.get` takes `{}` and
  returns `{ configured: boolean, prefix: string | null }`. `integration.preview`
  takes `{ text: string }`, up to 2,000 Unicode code points including empty,
  and returns `{ output: string }`, with `output` equal to the saved prefix
  concatenated with `text`. Before setup it returns a documented application
  error, not a default prefix. Reject extraneous parameters on all methods.
  The preview is a local stand-in, not an outbound integration or Jira API call.
- **Configuration isolation.** Save only the prefix in Forge KVS, scoped to
  the app installation; do not persist request credentials, output text, or
  a process-local cache. Separate invocations and installations must observe
  the appropriate stored value. `config.set` is the only state-changing
  command. Keep test installations and data distinct from any live customer
  installation; no automated cleanup against a real site without approval.
- **Protocol and OpenRPC.** Document the three methods, object parameters,
  result shapes, error codes, and a bearer security scheme in an OpenRPC
  artifact. The common envelope requires `jsonrpc: "2.0"`, a nonempty method
  string, object `params`, and a string or finite-number `id`; no null or
  missing ID. An unknown well-formed method returns `-32601`.
  Responses contain the same valid ID and exactly one of `result` or `error`;
  invalid IDs use `null`. Use standard JSON-RPC error codes `-32700` (parse),
  `-32600` (request), `-32601` (method), `-32602` (params), and `-32603`
  (internal), plus distinct documented application codes for forbidden and
  unconfigured. Never return stack traces or raw exception messages. This
  explicitly supports a **single-call JSON-RPC 2.0 subset**, not batches,
  notifications, positional params, or nullable IDs. `json-rpc-2.0` supports
  more of JSON-RPC than this POC: have both adapters call one shared envelope
  preflight that rejects unsupported forms before handing requests to the
  library, rather than depending on its default batch/notification behavior.
  Validate method params at the shared command boundary; the library does not
  authenticate callers or validate params against OpenRPC. Keep the document
  and runtime behavior in agreement through contract tests. Lint the document
  as a development check, not a second dispatch implementation.
- **UI transport.** Add one Jira admin page rendered with Forge UI Kit. It
  calls one resolver method through Forge Bridge with the same RPC request
  object; the resolver builds trusted context from Forge's server-side request
  and returns responses as data, including sanitized errors. The page shows
  configuration status, a prefix form with Save, and a text preview with Run.
  Initial/empty state explains setup; pending state blocks duplicate saves;
  success shows saved status or preview output; failure shows an actionable
  message. Never render the bearer secret. The admin-page location alone is
  not an authorization check: verify Jira admin eligibility server-side for
  all three UI commands (including preview, which reveals the prefix), and
  fail closed if it cannot be verified. Final UI details should be approved
  before UI code.
- **HTTP transport.** Replace the two demo webtriggers with one v2 dynamic
  response webtrigger. Accept POST with JSON only; bound body size below Forge
  limits, parse once, authenticate before dispatch, and return JSON-RPC bodies
  for authenticated protocol or command outcomes. Return suitable HTTP
  statuses and small non-RPC bodies for wrong verb, media type, oversized
  body, or missing/invalid credentials; do not echo secrets. No CORS or
  browser-to-webtrigger access is needed for this POC.
- **Identity and authorization.** A public webtrigger URL has no Atlassian
  user identity. Authenticate one POC external client using an
  environment-specific bearer secret provided as a Forge runtime variable,
  never in source, storage responses, or logs. Fail closed if unconfigured;
  reject missing, duplicate, malformed, and invalid headers before commands
  run; compare valid-shape secrets in constant time. This credential grants
  the three POC commands only, including `config.set`; treat it as powerful
  and distribute only to approved test operators. UI context identifies a
  Jira user, not a browser-supplied account ID. Authorization is checked for
  each method in the shared dispatch path using trusted context, with the
  resolver performing any needed platform permission lookup; neither path
  invents wildcard permissions or maps the external token to a Jira user.
  The commands themselves make no product API calls; a server-side admin
  permission lookup at the resolver boundary is a separate authorization step.
- **Forge wiring.** Reuse this app identity and Node 24 ESM setup. Wire the
  admin page resource, resolver, webtrigger, and KVS scope in the manifest and
  add only necessary dependencies. Configure the encrypted bearer credential
  as a per-environment Forge runtime variable using the repository's existing
  variable workflow, not a manifest build-time variable. Where the admin
  check uses a Jira REST API, look up the exact scopes before implementation.
  Do not register a new app or deploy as part of this spec.

## Testing Decisions

- Test externally observable behavior, not private helpers or internal data
  structures. The two main seams are (1) direct dispatcher invocation with
  trusted contexts and a test storage adapter, and (2) JSON-RPC over the
  deployed HTTP webtrigger. The repository has a configured Vitest runner but
  no existing behavior tests; use it for local checks.
- At the dispatcher seam, cover all three commands in sequence, pre-setup
  failure, repeated set, empty text, Unicode length boundaries, invalid and
  extra parameters, unknown method, invalid IDs/envelopes, batches,
  notifications, positional params, denial by source policy, and sanitized
  internal failures. Assert unsupported forms never invoke a registered
  method, even though `json-rpc-2.0` accepts them by default. Verify UI and
  API contexts have the same allowed POC command set but cannot override
  trusted actor/source with request fields. Check the OpenRPC method names,
  parameter/result shapes, and error examples against the runtime contract.
- At adapter boundaries, check wrong verb, media type, oversize, malformed
  JSON, and missing/duplicate/invalid credentials; assert no command runs on
  rejected requests. Check resolver failure is returned as data. Never put
  credentials into fixtures, snapshots, or diagnostic output.
- With separate approval for deployment/installation on a **development**
  Jira site, run an opt-in HTTP suite against the actual webtrigger: negative
  auth and protocol cases; then `config.get` (unset), preview (unconfigured),
  `config.set`, `config.get`, and preview in separate HTTP invocations. Confirm
  the persisted value and exact output; verify a second installation if
  available. Keep this suite out of ordinary `npm run test` and do not run it
  against a customer's installation by default.
- Verify the installed UI as a separate manual journey: unconfigured state,
  save, read-back after reload, successful preview, validation and resolver
  failure. Compare method results and error codes against the same OpenRPC
  examples and local fixtures. A passing local suite or HTTP suite does not
  prove the UI works; a mock API does not prove an external integration works.
- Success means local checks pass, authenticated deployed HTTP reads back the
  saved setting and uses it in the next call, unauthorized HTTP requests never
  dispatch, the UI produces matching results, and no secret, stack, or
  untrusted identity escapes into output or logs. Record setup time, test
  runtime, and failures as observations rather than promised speed gains.
  Before implementation is done run `npm run check`, `npm run typecheck`,
  `npm run test`, and after manifest changes `npm run lint:forge`.

## Out of Scope

- Real external service configuration, credentials, egress, data transfer, or
  Jira product API reads/writes; the local preview cannot prove those flows.
- Full JSON-RPC conformance, batch calls, notifications, generated CLI/SDK,
  dynamic registry, multi-client auth, rotation/revocation, and production SLOs.
- Registering, deploying, installing, upgrading, or modifying a live site as
  part of writing this specification. Those are separate approved operations.

## Further Notes

- The architecture note is a hypothesis: do not copy its
  `permissions: ['*']` or `userId: 'anonymous'` examples as authorization
  decisions. `issue.addComment` and fire-and-forget notifications are future
  work.
- Current source is Forge-create demo output: two unauthenticated webtriggers
  return hello-world content and random request IDs; there is no UI, storage,
  dispatcher, or JSON-RPC implementation. Change this app, not its identity.
- **Decision gate:** add a real integration only if both test seams work,
  authorization can be justified for real commands, and the deployed HTTP
  path demonstrably reduces test friction. Otherwise keep only the useful
  resolver/command seam.
- The linked configuration-lifecycle repository could not be read (HTTP 403)
  during drafting; revisit its actual requirements before claiming parity.
- Platform grounding: [webtrigger authentication][webtrigger],
  [webtrigger event format][events], [app-context security][context],
  and [Forge bridge invoke][bridge].
- Issue tracker publication and `ready-for-agent` labeling are deferred:
  no project issue tracker or triage vocabulary was provided for this repo.
  Run `/setup-matt-pocock-skills` before the `to-spec` publishing step. This
  draft is not marked ready for an implementation agent.

[config-lifecycle]: https://github.com/ibuchanan/explore-forge-config-lifecycle
[webtrigger]: https://developer.atlassian.com/platform/forge/runtime-reference/web-trigger
[events]: https://developer.atlassian.com/platform/forge/events-reference/web-trigger/
[context]: https://developer.atlassian.com/platform/forge/app-context-security
[bridge]: https://developer.atlassian.com/platform/forge/custom-ui-bridge/invoke/
