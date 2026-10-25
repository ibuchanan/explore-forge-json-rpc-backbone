# Outbound spec: route Forge triggers to commands with native outcomes

<!-- cspell:words pocock -->

Status: handoff draft, 2026-10-25. Audience: `forge-ahead-triggers` maintainers.
This document proposes work in that library; it is not another implementation
spec for this app and does not modify the peer checkout.

## Problem Statement

Forge apps need to route different invocation families to shared application
commands, but those families do not share a universal completion contract.
An HTTP response, resolver result, action output, and event retry request are
not interchangeable. A command error returned as ordinary data can accidentally
acknowledge work that should have requested a retry.

The library already supplies useful invocation contracts, web-trigger parsing
and response helpers, and logging observation. Its current generic handler
allows a result type, but the product, lifecycle, and scheduled aliases default
to `void`; their native completion and retry semantics need stronger modeling.
Authorization and routing are currently application responsibilities, not
capabilities the library should claim already to provide.

## Solution

Make native input and output adaptation an explicit, family-specific interface.
Keep command execution outside this library. An app binds a selected native
invocation to a command, constructs trusted context, invokes an executor, and
maps the application outcome to the invoking platform's actual contract.

Use small response/retry helpers and correct native types before introducing a
binding abstraction. A helper must not silently choose permissions, retry
policy, an HTTP status, or a JSON-RPC error representation for every app.

## User Stories

1. As a trigger author, I want accurate input and completion types,
   so that a compiling handler is compatible with its Forge invocation family.
2. As an adapter author, I want native success output modeled explicitly,
   so that a command result is not confused with delivery acknowledgement.
3. As an event handler author, I want retry requests represented correctly,
   so that retryable work is not acknowledged as an ordinary returned object.
4. As an operator, I want permanent failures handled deliberately,
   so that invalid work does not retry indefinitely or disappear silently.
5. As an app author, I want to select the command for a product event,
   so that arbitrary event fields cannot choose a privileged operation.
6. As an app author, I want trusted context separate from mapped parameters,
   so that payload values cannot impersonate a user or installation.
7. As a security reviewer, I want caller verification supplied explicitly,
   so that a public URL or claimed source does not confer authority.
8. As a command consumer, I want protocol-neutral executor compatibility,
   so that trigger helpers do not require JSON-RPC or a specific command package.
9. As an HTTP adapter author, I want application outcomes mapped separately
   from ingress rejections, so that the documented wire contract is preserved.
10. As a resolver author, I want safe serializable output,
    so that library-specific result objects do not cross Forge Bridge accidentally.
11. As an action author, I want declared action outputs and failures,
    so that tool/rule completion is not modeled as a web-trigger response.
12. As an async consumer author, I want retry context and delivery limits kept
    native, so that product events and queued events are not treated identically.
13. As an operator, I want uncertain writes identified before retry,
    so that a timeout does not duplicate an operation.
14. As a maintainer, I want existing response helper behavior preserved,
    so that stronger adapters do not silently break current consumers.
15. As a test author, I want complete handler-level contract fixtures,
    so that outcome mappings can be verified without inspecting private helpers.
16. As a maintainer, I want safe logging for command and adapter outcomes,
    so that observability does not expose payloads or treat every `Result` as success.
17. As a library adopter, I want tested examples using the shared command layer,
    so that adding a dependency corresponds to actual reuse.
18. As a release reviewer, I want deployed evidence scoped to each adapter,
    so that one app's HTTP success does not imply native event delivery works.

## Implementation Decisions

- **Own Forge adaptation, not commands.** Keep family event/context types,
  native response constructors, completion/retry translation, and optional
  composition here. The commands layer owns registry/execution and JSON-RPC
  framing. Application bindings own command selection and authorization.
- **Preserve compatibility first.** Audit public aliases against current Forge
  declarations and docs before adding result unions or replacement types.
  Product-event and async-consumer retries need their respective native
  contracts. Scheduled handlers need a verified completion contract; do not
  equate schedules, events, and lifecycle hooks merely because current aliases
  use `void`. Record any correction and its migration/version implications.
- **Use actual invocation metadata.** Preserve platform context separately
  from event data. Treat event headers, payloads, and client trace values as
  untrusted. Do not infer end-user consent or resource permission from an
  installation ID, service token, source label, or app identity.
- **Retain explicit input and output mapping.** Input adaptation selects an
  allowed command and parameters. Output adaptation receives an application
  outcome and native invocation context. Its declared native return type must
  not be flattened into a catch-all response union. Ordinary event payloads
  must not be forwarded as generic command names or JSON-RPC envelopes.
- **Do not install implicit auth policy.** Accept app-supplied verification and
  policy where composition needs it; fail closed when required evidence is
  absent. Reusable verification mechanisms can be added for a proven consumer,
  but must not claim that authentication grants every command or Jira authority.
- **Make delivery semantics explicit.** Success may acknowledge an event rather
  than return its command output. Terminal failures require a documented
  recording/disposition policy. Transient failures can request native retry
  only when application idempotency/write-outcome policy permits repetition.
  Never infer retry from a numeric HTTP/JSON-RPC code alone.
- **Avoid implicit serialization.** Do not serialize a `Result`, raw exception,
  context, or request automatically. An HTTP adapter may produce JSON-RPC,
  Problem Details, or another documented body; those choices stay explicit.
  Existing generic error helpers must not replace an app's sanitizer blindly.
- **Prefer additive helpers.** Begin with types and narrow native completion
  helpers. Add a compositional binding helper only after repeated consumers
  demonstrate stable input/execution/output interfaces. Use structural executor
  compatibility or type-only integration; avoid mandatory command-runtime,
  JSON-RPC, or schema-generation dependencies.
- **Support real families incrementally.** Start with the existing web-trigger
  surface and verified native event completion. Add resolver/action/consumer
  integrations only as their fixtures and consumers are available. Keep optional
  Forge SDK dependencies out of unrelated entry points where practical.
- **Observe the right outcome.** The existing wrapper observes invocation only
  and leaves returns/errors untouched; it does not currently classify outcomes.
  Any added completion observation must distinguish command failure from native
  completion/retry intent, not report business success merely because a function
  resolved. Use allowlisted metadata and no payload/secret logs; do not change
  the existing wrapper into an implicit serializer or policy engine.

## Testing Decisions

- Test complete handlers through their native function interface. Use existing
  web-trigger parsing/response tests and invocation-observer tests as prior art;
  compare against declared Forge return shapes rather than private builders.
- Cover one executor outcome through multiple adapters: success, denied/terminal
  failure, transient failure, unexpected exception, and unknown write outcome.
  Assert native retry objects are actually returned where appropriate; returning
  `err(...)` or a JSON-RPC error object must not pass a retry-contract test.
- Test rejection before command execution, trusted-context separation, deliberate
  command selection, malformed input, and unsupported native responses.
- Type-test incompatible native results and ensure each supported handler family
  models its own completion contract. Validate schedule behavior with current
  docs and a separately approved deployed proof before making strong guarantees.
- Preserve all existing response helper fixtures. Test explicit error redaction;
  no default path may leak raw errors, headers, identities, or saved data.
- Test repeated delivery only for an explicitly repeat-safe command. An uncertain
  write must not become an automatic retry merely because its failure is transient.
- Use the reference app as a real consumer for compatible helpers and parity
  checks. Its existing HTTP evidence is prior art, not proof of new library code.
  Native live delivery/retry evidence requires approved target metadata and dates.

## Out of Scope

- Application command implementations, their OpenRPC catalog, or business policy.
- A universal return value for every Forge invocation family.
- Automatic arbitrary command exposure from product events, actions, or queues.
- Global authentication configuration, wildcard permissions, user impersonation,
  and making the library's current contracts appear to enforce authorization.
- A command bus, durable scheduler, deduplication store, or job-status database.
- Silent breaking changes to existing response builders or generic error helpers.
- Peer-repository edits, publication, installation, deployment, or live retries
  merely by accepting this handoff document.

## Further Notes

The [reference-app main spec](../spec.md) owns consumer experiments and preserved
wire behavior. The [commands seed spec](forge-ahead-commands.md) owns the
protocol-neutral executor and first-class JSON-RPC adapter. These documents
share an interface proposal, not an accepted package API.

Review native contracts against the current Forge
[product-event retry reference](https://developer.atlassian.com/platform/forge/events-reference/product-events/),
[async-events API](https://developer.atlassian.com/platform/forge/runtime-reference/async-events-api/),
and [scheduled-trigger reference](https://developer.atlassian.com/platform/forge/function-reference/scheduled-trigger/).
Different families have different completion and retry policies.

Issue publication and `ready-for-agent` labeling need target-project setup.
Run `/setup-matt-pocock-skills` before publication; no issue or label is created
by this local handoff draft.
