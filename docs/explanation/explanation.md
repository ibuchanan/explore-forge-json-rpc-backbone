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
An operator-reported 30-check HTTP run passed in approximately 10.48 seconds;
that is an observation, not a general performance or reliability guarantee.
The [V&V record](../../specs/deployed-poc-verification.md) retains its limits.

## Shared behavior does not mean shared authority

The resolver derives identity from server-side Forge context and verifies Jira
admin permission using an as-user call. The public web-trigger URL has no such
identity; it checks a separately provisioned bearer credential. Neither claimed
request fields nor a logged source name can turn that token into a Jira admin.

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

## Why the next extraction separates outcomes from envelopes

Reads and previews now return shared application `Result` values through a small
neutral executor. The JSON-RPC adapter selects numeric errors and envelopes for
both existing entry points. Keeping trusted context and storage separate from
parameters preserves authorization without coupling those reads to a Forge
request or RPC exception. Types and validation are still handwritten.

Save and reset still use their original JSON-RPC-specific handlers. This additive
migration keeps the proven mutation behavior in place while establishing the
read seam; it is not yet a complete neutral command library or proof of native
completion. Actual trigger-library reuse also remains unproven:
`@forge-ahead/triggers` is declared but not imported by runtime source.

The next step is to migrate mutations through the same outcome boundary, not add
a new event framework. JSON-RPC remains a first-class supported adapter rather
than becoming an incidental example. The [main spec](../../specs/spec.md) owns
that remaining work; the [runtime reference](../reference/reference.md) records
the implemented boundary.

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
and tests. The current contract tests already validate the OpenRPC document and
compare examples and successful outputs with execution. They do not currently
generate implementation types or drive runtime parameter validation.

The planned generation experiment targets types, handler maps, names, validators,
and call helpers. Implementations and authorization stay handwritten. Prefix
normalization illustrates the limit: length is validated after trimming, so
blind validation of raw input can change behavior despite matching a schema.
Generated types cannot enforce runtime length or resource authorization.

The outbound [commands seed spec](../../specs/outbound/forge-ahead-commands.md)
keeps the proposed executor/JSON-RPC tooling separate from the
[trigger handoff](../../specs/outbound/forge-ahead-triggers.md), which owns native
completion and adaptation. The separation is a proposal to test locally first,
not a claim that either library already implements it.

## What remains outside command integration coverage

A passing HTTP suite does not establish event delivery, action input mapping,
resolver identity lookup in a live installation, retry scheduling, UI rendering,
or backend/browser log secrecy. Local adapter tests and selected native journeys
still matter. The installed UI and second-installation isolation remain unverified
in the recorded live evidence, even though relevant local tests exist.

Observability helps explain these distinctions. The app records safe RPC
invocation/outcome facts and numbered demo narratives, while the verifier names
each assertion separately. An expected negative test can produce a rejection log
and a passing check. A save-completed log is not its later read-back assertion.
The current local run ID is not propagated into backend records.

## What was not carried forward from the original exploration

The original proposal suggested full JSON-RPC support, inherited wildcard
permissions, generated CLI tooling, and broad speed/reliability gains. None of
those is an implemented or established property of this POC. This explanation
retains the useful rationale while the [runtime reference](../reference/reference.md)
records what exists and the main spec owns the bounded next experiments.
No persistent server, assumed user identity, automatic rollback, or general
production-integration promise follows from the successful demonstration.
