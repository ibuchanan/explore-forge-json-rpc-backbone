# POC: dual-transport command dispatcher for Forge

<!-- cspell:words webtrigger unconfigured pocock -->

Status: draft for review. This spec explores the hypothesis in
[Architectural Exploration: Command-Oriented JSON-RPC Engine for Atlassian
Forge](Architectural%20Exploration_%20Command-Oriented%20JSON-RPC%20Engine%20for%20Atlassian%20Forge.md).
It does not assert production suitability.

## Problem Statement

As an app developer, I cannot yet tell whether one command module can be
examined in local tests and invoked through both a Forge UI resolver and a
public webtrigger without duplicating behavior or confusing their different
security models. The repository currently has two hello-world webtrigger
handlers, no UI, no dispatcher, and no tests of that proposition.

## Solution

Build a small Jira Custom UI demonstration and one authenticated webtrigger
that invoke the same command dispatcher. A read-only `text.analyze` command
accepts text and returns deterministic character and word counts. The UI
shows its result and an external caller posts an equivalent single JSON-RPC
request. Prove parity with both local contract tests and deployed UI/HTTP
journeys. Evaluate the result before adding Jira APIs, a generated CLI, or
more commands.

## User Stories

1. As an app developer, I want to submit a request directly to the dispatcher,
   so that I can test behavior without a browser or Forge deployment.
2. As a Jira user, I want to enter text and run the command in the UI, so that
   I can see the bridge-to-resolver path work.
3. As a Jira user, I want clear empty, loading, success, and failure states,
   so that the demonstration is usable when the resolver fails.
4. As a CLI operator, I want to POST the same command to a webtrigger, so that
   I can verify the external transport independently.
5. As a CLI operator, I want my request ID echoed on success or command
   failure, so that I can match responses to calls.
6. As a CLI operator, I want invalid credentials rejected before execution,
   so that an exposed URL alone cannot run a command.
7. As a CLI operator, I want malformed JSON and unknown methods to produce
   predictable errors, so that I can diagnose mistakes.
8. As an app developer, I want each transport to derive actor and source from
   trusted server-side inputs, so that clients cannot impersonate a Jira user.
9. As an app developer, I want invalid parameters rejected centrally, so that
   both transports enforce one contract.
10. As an app developer, I want failures sanitized for callers but diagnosable
    in backend logs, so that internals are not exposed.
11. As an app developer, I want positive and negative deployed HTTP and UI
    tests, so that local tests cannot conceal broken wiring.
12. As a maintainer, I want documented protocol limits, so that this POC is
    not mistaken for a full JSON-RPC implementation.
13. As a maintainer, I want a recorded parity and effort assessment, so that
    we can decide whether the second transport earns its cost.

## Implementation Decisions

- **One command seam.** The dispatcher accepts an untrusted request value
  plus a server-constructed execution context and returns a JSON-serializable
  protocol result. It owns envelope and parameter validation, method lookup,
  source policy, and error mapping. The command performs no Forge or network
  I/O. Both entry-point adapters call this module; neither duplicates command
  rules. Do not build a registry generator for one command.
- **Command behavior.** `text.analyze` accepts exactly one object parameter,
  `text`, a string of at most 2,000 Unicode code points (including empty
  text). Return `{ characters, words }`: `characters` counts Unicode code
  points; `words` counts nonempty segments separated by Unicode whitespace.
  Reuse fixtures across local, UI, and HTTP checks. This is diagnostic
  behavior, not an Atlassian product feature.
- **Protocol contract.** Support one JSON-RPC-style request object with
  `jsonrpc: "2.0"`, a nonempty `method` string, object `params`, and a required
  string or finite number `id` (not `null`). Return one object containing
  `jsonrpc: "2.0"`, the same `id`, and exactly one of `result` or `error`.
  Return `id: null` if the ID cannot be trusted. Use standard codes `-32700`
  (parse error), `-32600` (invalid request), `-32601` (method not found),
  `-32602` (invalid params), and `-32603` (internal error); document a distinct
  application error for source-policy rejection. Never return exception
  messages or stacks. **This is a single-call subset, not full JSON-RPC 2.0
  compliance**: batches, notifications (missing `id`), positional params,
  and `id: null` are unsupported.
- **UI transport.** Add one Jira page with a small Custom UI using Forge
  Bridge `invoke('rpc', request)`. Its resolver takes the RPC payload, builds
  execution context from the server-side Forge resolver context (not browser
  `getContext()` or caller-supplied fields), and returns dispatcher results
  as data rather than throwing. The UI offers a text field and Run action
  with an empty prompt, pending state, result, and actionable error. Confirm
  final placement and UI details in a short UI spec before frontend code.
- **HTTP transport.** Replace the two demonstration handlers with one v2
  dynamic-response webtrigger. Accept POST and JSON only, cap request size
  below Forge limits, parse the body, and call the same dispatcher. Return
  JSON for protocol results. Wrong HTTP method/media type, oversized body,
  and invalid credential receive suitable HTTP statuses and small non-RPC
  error bodies; authenticated protocol/command errors get JSON-RPC error
  bodies. A shell client does not require CORS support.
- **Authentication and identity.** Webtrigger URLs are public. Authenticate
  one POC client with an environment-specific bearer secret supplied as a
  Forge runtime variable, never committed or logged. Fail closed when
  unconfigured; reject missing, duplicate, or invalid authorization before
  dispatch, using constant-time comparison for valid-shape secrets. The
  token identifies an external client, **not an Atlassian user**. Resolver
  context identifies a Jira user; webtrigger context identifies the external
  client. Neither transport grants wildcard permissions; explicit source
  policy allows only `text.analyze` for both. No product API call is in
  scope. Do not use `asUser()` in the webtrigger or imply that `asApp()`
  enforces end-user permissions.
- **Configuration and wiring.** Preserve the registered app identity and
  Node 24 ESM setup. Wire the UI resource/resolver and webtrigger functions
  in the manifest and add only needed dependencies. Keep existing test and
  quality commands. For a future Jira command, determine exact OAuth scopes
  from its REST operation and design app-versus-user authorization separately.

## Testing Decisions

- Test observable request/response behavior at the highest shared seam:
  call the dispatcher with trusted test contexts and assert results/errors,
  not private helper calls. This repository has no existing test prior art;
  use its configured Vitest runner.
- Cover text counts (empty text, whitespace, non-BMP characters), malformed
  or incomplete envelopes, unknown methods, invalid params, and source-policy
  denial. Assert that internal exception text cannot escape on a failure.
- Test adapters with representative Forge resolver and webtrigger inputs:
  payload fields cannot override server-derived identity; unauthenticated,
  wrong-method, wrong-media-type, malformed JSON, and oversized HTTP requests
  do not execute commands. Keep secrets out of logs and assertions.
- Give deployed transports **equal weight**, as agreed: after explicitly
  approved deployment and installation on a development Jira site, run a
  repeatable positive/negative HTTP matrix against the real webtrigger
  **and** a repeatable browser UI positive/negative journey against the
  installed page. Compare normalized `text.analyze` results with the local
  fixture. Include an invalid UI input and inspect bridge failure handling.
  Keep live tests opt-in, separate from ordinary `npm run test`; record
  prerequisites and observations rather than claiming mocks prove wiring.
- Success requires: local checks pass; UI displays expected result/error;
  authenticated HTTP returns the same result; missing/invalid tokens never
  dispatch; protocol errors have predictable IDs/codes; neither responses
  nor logs leak credentials or stacks; privilege differences and unsupported
  protocol features are documented. Record setup time, test runtime, and
  failure modes as observations, not promised speed improvements.
- Before implementation is considered done, run `npm run check`,
  `npm run typecheck`, `npm run test`, and, after manifest changes,
  `npm run lint:forge`. Deployment, installation, upgrade, and tunnel use
  require separate approval under repository guidance.

## Out of Scope

- Full JSON-RPC 2.0 conformance (batches, notifications, positional params,
  nullable IDs), generated CLI flags/SDKs, dynamic command registration,
  multiple clients, token rotation/revocation, persistence, async events,
  and production SLOs.
- Jira reads/writes or claims of parity between Atlassian user authorization
  and an external token; a product API command is a follow-up experiment.
- Deploying, installing, registering another app, or changing a live site as
  part of this specification task.

## Further Notes

- The architecture note is a hypothesis: do not copy its
  `permissions: ['*']` or `userId: 'anonymous'` examples as authorization
  decisions. Fire-and-forget notifications, generated CLI, and
  `issue.addComment` are future work; mocking an API does not prove Jira
  integration.
- The manifest currently has two unauthenticated v2 webtriggers and no UI;
  current source returns random request IDs and fixed hello-world output.
  Change this app rather than create another Forge app.
- **Decision gate:** proceed to another slice only if commands remain local
  to one module, both deployed transports can be tested reliably, and
  external authentication/operations are justified by a concrete client
  use case. Otherwise retain the resolver-only command module.
- Platform grounding: [webtrigger authentication][webtrigger],
  [webtrigger event format][events], [app-context security][context],
  and [Forge bridge invoke][bridge].
- Issue tracker publication and `ready-for-agent` labeling are deferred:
  no project issue tracker or triage vocabulary was provided for this repo.
  Run `/setup-matt-pocock-skills` before the `to-spec` publishing step. This
  draft is not marked ready for an implementation agent.

[webtrigger]: https://developer.atlassian.com/platform/forge/runtime-reference/web-trigger
[events]: https://developer.atlassian.com/platform/forge/events-reference/web-trigger/
[context]: https://developer.atlassian.com/platform/forge/app-context-security
[bridge]: https://developer.atlassian.com/platform/forge/custom-ui-bridge/invoke/
