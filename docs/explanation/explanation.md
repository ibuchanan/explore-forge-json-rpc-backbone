# Why triggers route to commands

A trigger explains why execution starts. A command describes the requested
application operation. An adapter translates the incoming invocation and the
outgoing outcome. Keeping these ideas distinct lets different Forge entry points
share behavior without pretending they share identity or completion semantics.

Here, Command includes reads such as `config.get`, not only state-changing
requests. It is neither a shell command nor a requirement to implement a class
hierarchy. The [glossary](../../GLOSSARY.md) defines the shared vocabulary.

## What the app already demonstrates

Three UI Kit Jira admin screens call one Bridge resolver. An external operator
calls an authenticated web trigger. Both paths reach the same JSON-RPC dispatcher
and installation-scoped KVS adapter. Saving a non-secret prefix, reading it back,
and previewing its concatenation with supplied text provides an observable
configuration prerequisite without claiming a third-party integration.

This implemented seam prevents separate UI and HTTP implementations of the same
operation. Fast local tests exercise it without a browser or server. Separate
HTTP invocations can then test actual deployed persistence and authentication.
An earlier operator-reported 30-check run used the retired bearer credential;
it is an observation, not evidence for the current web trigger. The
[V&V record](../../specs/deployed-poc-verification.md) retains its limits.

## Shared behavior does not mean shared authority

The resolver derives identity from server-side Forge context and verifies Jira
admin permission using an as-user call. The public web-trigger URL has no such
identity; the package web trigger verifies Basic credentials against Jira and
requires `ADMINISTER` on every request. Neither claimed request fields nor a
logged source name can make a caller a Jira admin.

`config.reset` makes this distinction concrete. Both paths recognize the command,
but HTTP is forbidden even with a valid credential. The UI requires admin
authorization and explicit confirmation. Shared registration is not universal
execution permission, and a successful denial test does not prove the successful
reset path. No wildcard permission template is justified by a common envelope.

## JSON-RPC as the common integration-testing surface

The useful objective is not that every trigger invokes every command. Native
triggers need deliberate bindings: an event, rule, or schedule selects an
operation appropriate to its purpose. A common JSON-RPC test surface instead
makes the command catalog addressable by stable names and documented parameters.
Application policy still decides whether an endpoint principal may execute.

This gives a reusable place to test validation, authorization, real storage,
side-effect preservation, and command sequences across Forge apps. OpenRPC
captures the catalog and successful result/error contracts. It does not grant
permissions or prove a principal can exercise every positive path.

The current app supports only a single-call JSON-RPC profile, with required IDs
and named parameters. Batches, notifications, positional parameters, and null IDs
are deliberately rejected. A JSON-RPC ID correlates responses; it is not an
idempotency key or a background-job completion mechanism.

## Why execution is separate from envelopes

All four commands now return shared application `Result` values through a small
neutral executor. The JSON-RPC adapter selects numeric errors and envelopes for
both existing entry points. Keeping trusted context and storage separate from
parameters preserves authorization without coupling handlers to a Forge request
or RPC exception. Command types and successful-output validators now come from
OpenRPC; input normalization, validation and application policy remain handwritten.

Migrating reads first and mutations second preserved a working baseline without
leaving a permanent second execution path. Reset policy stays in the app-owned
executor, not in the transport or schema: valid confirmation and UI authorization
are both required. A storage exception cannot impersonate a trusted command error,
and a failed write is not automatically retried or rolled back.

This is not a deployed native-trigger consumer. The earlier
[local product-event proof](../../specs/native-outcome-translation.md) was
removed with the hand-written dispatcher; its findings remain as history. The
`forge-ahead-rpc` package now supplies the dispatcher, generated validators and
web trigger, and generated validators check successful command output before
adapter success. JSON-RPC remains a first-class supported adapter. The
[main spec](../../specs/spec.md) owns the remaining work; the
[runtime reference](../reference/reference.md) records the implemented boundary.

Native completion is the important variation. An HTTP caller needs a response;
a UI needs serializable data; an async consumer needs acknowledgement or a native
retry request. Returning a JSON-RPC error or an ordinary `Result` failure may
still complete a consumer invocation successfully. Command failure and delivery
failure therefore cannot be collapsed into the same return object.

Likewise, a transient failure is not sufficient evidence that repeating a write
is safe. A write can persist before its reply is lost. Outcome mapping must keep
uncertainty, repeat safety, and native retry policy distinct; no universal retry
rule follows from an HTTP status or RPC error code.

## Why OpenRPC is useful without generating business policy

A contract-first catalog can reduce drift between handlers, clients, schemas,
and tests. The contract tests validate the OpenRPC document and compare examples
and successful outputs with execution. The selected build-time generator now
supplies the types used by app handlers, the frontend caller, and integration
fixtures. A stale artifact fails the check-only workflow; after regeneration,
a new command cannot compile until its app-owned handler is implemented.

Generation supplies contracts and names, not handler bodies or authority.
Implementations, input normalization/validation, and authorization stay
handwritten; successful-output validation is generated. Prefix normalization
illustrates the limit: the schema bounds the raw value, and the handler then
trims it and rejects an empty result, so the stored value can be shorter than
the validated input.
Generated types cannot enforce runtime length or resource authorization.

The [extraction decision](../../specs/command-architecture-decision.md) keeps
these demonstrated seams in the app and defers package extraction. The outbound
[commands seed](../../specs/outbound/forge-ahead-commands.md) describes a possible
commands library, not an accepted package interface. Trigger contracts/helpers
belong to the separate trigger repository; apps retain command selection,
authority and retry policy. The decision record retains an unapplied delta for
the moved trigger handoff. Its exact response/type incompatibilities remain
visible rather than being hidden by a decorative import or a compensating wrapper.

## What remains outside command integration coverage

A passing local suite does not establish event delivery, action input mapping,
resolver identity lookup in a live installation, retry scheduling, UI rendering,
or backend/browser log secrecy. Local adapter tests still matter. The installed
UI, the current web trigger and
second-installation isolation remain unverified in live evidence, even though
relevant local tests exist.

Observability helps explain these distinctions. The UI resolver records safe RPC
invocation and outcome facts. An expected negative test can produce a rejection
log and a passing check, and a save-completed log is not the later read-back
assertion.

## What was not carried forward from the original exploration

The original proposal suggested full JSON-RPC support, inherited wildcard
permissions, generated CLI tooling, and broad speed/reliability gains. None of
those is an implemented or established property of this POC. This explanation
retains the useful rationale while the [runtime reference](../reference/reference.md)
records what exists and the main spec owns the bounded next experiments.
No persistent server, assumed user identity, automatic rollback, or general
production-integration promise follows from the successful demonstration.
