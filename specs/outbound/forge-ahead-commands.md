# Seed spec: reusable commands with an OpenRPC testing surface

<!-- cspell:words pocock -->

Status: seed draft, 2026-10-25. Audience: prospective `forge-ahead-commands`
maintainers. This proposes a new logical layer and possible package; it does
not establish that a repository, published package, or stable API already exists.

## Problem Statement

Forge apps repeat operation logic across UI, external HTTP, and background
invocations, or force every invocation through a protocol-specific handler.
The reference app proves that a shared dispatcher and deployed JSON-RPC endpoint
can exercise persistence and validation without driving a browser. Its handlers
still depend on JSON-RPC exceptions, and its contract has handwritten duplicates.

We need a small reusable command interface that preserves this testing advantage
while allowing each native adapter to express its own output and delivery
semantics. The integration-testing surface must cover the command catalog
without silently granting every actor the authority to execute every operation.

## Solution

Define a protocol-neutral command contract, typed registry, and executor using
the existing shared `Result` abstraction. Provide a first-class JSON-RPC adapter
and build-time OpenRPC contract tooling. Keep native Forge trigger adaptation
and application permissions separate from command execution.

Every registered command is addressable through the standard JSON-RPC test
adapter. Execution is governed by explicit application policy. A documented
forbidden response is coverage of denial, not coverage of successful execution.
No automatic privileged testing principal is introduced.

## User Stories

1. As a command author, I want named operations with typed parameters and outputs,
   so that implementations are independent of the invoking Forge surface.
2. As an app maintainer, I want one typed registry,
   so that handler lookup and command catalog completeness are checked together.
3. As a caller, I want explicit application outcomes,
   so that expected failures do not depend on transport-specific exceptions.
4. As an adapter author, I want trusted context supplied separately,
   so that serialized input cannot inject permissions or dependencies.
5. As a security reviewer, I want application-defined authorization per operation,
   so that a service credential is never treated as an authenticated Jira user.
6. As an integration-test author, I want every registered command addressable
   over JSON-RPC, so that Forge apps can share one deployed testing approach.
7. As a reviewer, I want denial distinguished from successful execution,
   so that common-surface coverage does not conceal inaccessible positive paths.
8. As an API author, I want OpenRPC as the contract source,
   so that parameter and output shapes are not redefined in several places.
9. As a developer, I want generated types and handler-map contracts,
   so that incompatible implementations fail typechecking.
10. As a developer, I want a typed client independent of HTTP configuration,
    so that tests and UI adapters can supply their own invocation mechanism.
11. As a maintainer, I want deterministic generation and drift checks,
    so that generated artifacts remain reproducible and reviewable.
12. As a command author, I want runtime input/output validation,
    so that static types do not permit malformed untrusted data at execution time.
13. As an app maintainer, I want explicit normalization order,
    so that generation preserves application behavior such as trim-before-length.
14. As an adapter author, I want semantic failures mapped deliberately,
    so that HTTP statuses, JSON-RPC codes, and retries are not conflated.
15. As a maintainer, I want safe unexpected-failure handling,
    so that exceptions do not leak and side effects are not called rolled back.
16. As a queue consumer author, I want execution separate from delivery policy,
    so that the native adapter controls acknowledgement and safe retry.
17. As a test operator, I want deployment and write policy supplied by the app,
    so that a common library never targets a customer installation implicitly.
18. As an operator, I want safe per-invocation observations,
    so that command completion can be distinguished from adapter completion.
19. As a Forge developer, I want an invocation-scoped implementation,
    so that no persistent server or process-local state is required.
20. As a library maintainer, I want bounded extraction from a working consumer,
    so that the public interface is supported by evidence rather than speculation.

## Implementation Decisions

- **Keep the core small and platform-neutral.** A command contract describes
  name, parameter schema, successful-output schema, and expected failures.
  A command handler accepts parameters plus trusted execution context and returns
  a `Promise<Result<Output, Failure>>`. A command call selects name/parameters;
  it does not include trusted context. These are proposed interfaces, not exports
  already available to consumers. Reads may use the Command umbrella term;
  a separate CQRS system is not required.
- **Reuse existing primitives.** Use `Result`, `ok`, and `err` from
  `@forge-ahead/errors`, not a new result framework. Semantic command failures
  need stable discriminators and public-safe messages; do not require HTTP
  Problem Details or numeric JSON-RPC codes in the core. Reuse existing error
  forms where compatible without making an HTTP status the domain discriminator.
- **Execute once through one interface.** Resolve name, validate/normalize input,
  apply application authorization, execute the handler, validate successful output,
  and observe sanitized outcome. Precisely define validation/authorization order
  and fail closed without side effects; apps needing the current POC's error
  precedence must retain it through their adapter. Do not add a dependency
  container, middleware framework, or internal network call to execute a handler.
- **Inject context and dependencies.** The application supplies verified actor,
  installation, operation policy, storage, and API capabilities as needed.
  Neither a JSON payload nor a claimed trigger source can construct authority.
  Keep denied results explicit and unexpected exceptions sanitized. No Forge SDK,
  resolver, HTTP header, or queue invocation object is required in the core.
- **Make JSON-RPC a supported reference adapter.** Route a parsed in-memory call
  to the same executor; map output/failure into an envelope and preserve request
  IDs only for response correlation. Protocol parsing and unsupported envelopes
  are adapter concerns. Start with the proven single-call profile: required
  string/finite-number IDs, object parameters, no batches, notifications, null
  IDs, or client context fields. Do not claim full JSON-RPC 2.0 conformance.
- **Separate endpoint policy from catalog.** OpenRPC describes all registered
  commands. Application execution profiles determine allowed success, expected
  denial, and unavailable positive coverage for each endpoint principal.
  Unknown-method, forbidden, and unavailable-capability outcomes stay distinct.
  The JSON-RPC adapter does not provision credentials or bypass command policy.
- **Separate package entry points by responsibility.** The root is command
  execution; a proposed JSON-RPC subpath owns framing; build-time generation is
  optional tooling. Exact names/package split follow the consumer experiment.
  Keep generators, file/network schema loaders, and server listeners out of
  deployed command runtime. Trigger helpers remain independently consumable.
- **Generate contracts, not application decisions.** Produce named parameter
  objects, output types, method-name unions, typed handler maps, and typed call
  helpers. Optional scaffold generation must not overwrite manual handlers and
  must fail explicitly until implemented. Do not generate authorization, retry
  policy, business effects, or native manifest modules from examples.
- **Evaluate existing tooling.** First test `@open-rpc/typings` for schema and
  method aliases. Its individual-argument signatures need adaptation to named
  objects and `Result`. `@open-rpc/schema-utils-js` can validate/dereference
  documents. A small OpenRPC traversal plus `json-schema-to-typescript` is an
  alternative; do not write a schema compiler. The broader OpenRPC generator's
  server scaffold is not a Forge runtime and needs custom templates for dotted
  method names. Tool choice remains an experiment, not an installed dependency.
- **Define the generation profile explicitly.** Resolve references reproducibly;
  preserve dotted wire names while escaping identifiers and rejecting collisions.
  Support required/optional fields, empty objects, nullable results, literal
  booleans, and declared errors. Close parameter objects according to the app's
  policy. Unsupported constructs must produce actionable generation failures.
  Do not perform uncontrolled remote schema fetching during builds or invocations.
- **Keep runtime semantics stronger than types.** String length, normalization,
  resource permission, output validity, and side-effect safety require runtime
  behavior/tests. Existing trim-before-validation semantics need explicit metadata
  or a handwritten normalization hook; generation must not silently reinterpret
  prose. Define schema dialect compatibility and test it before claiming coverage.
- **Keep delivery outside the outcome.** A retryable failure is not permission
  to repeat an uncertain write. Do not put Forge `InvocationError`, HTTP responses,
  queue acknowledgements, or job handles into every command outcome. Durable
  submission/status commands can be added when a real asynchronous operation
  needs them, with separate acknowledgement and completion contracts.
- **Keep observations safe.** Support injectable/integrated observation using
  existing logging without serializing arbitrary parameters, results, context,
  or exception details. Invocation and outcome facts may be logged; retry and
  adapter completion belong to native mapping. Generated IDs are not deduplication
  or proof of transaction atomicity.

## Testing Decisions

- Test through the public executor and JSON-RPC adapter, not private registry
  structures. The reference app's command sequences, property-based Unicode
  checks, OpenRPC examples, exact response fixtures, and side-effect-denial
  tests are prior art; preserve their observable behavior through extraction.
- Typecheck parameter/output inference, missing/extra handlers, and command-name
  exhaustiveness. Run deterministic generation twice and detect drift in checks.
  Generated types and examples do not establish implementation correctness alone.
- Validate malformed inputs before effects and validate outputs before returning
  success. Cover normalization order, extra fields, referenced schemas, empty
  objects, nullability, literal outputs, naming collisions, and unsupported
  schema features. Test a side effect followed by an invalid output or exception
  without asserting rollback or safe automatic retry.
- Test authority separation and command exposure: every registered name belongs
  to OpenRPC and is addressable through JSON-RPC, while forbidden calls execute
  no handler. Denial-only cases must not be counted as positive-path coverage.
- Compare the same application outcome through JSON-RPC and one native delivery
  adapter contract. Distinguish retry requests from returned error data and
  queue acknowledgement from operation completion. Do not mock away the result
  translation being tested.
- Keep HTTP authentication/guards in adapter-consumer tests. The core must not
  acquire HTTP, Forge context, or credential assumptions to make tests pass.
- Verify sanitized unexpected errors and concurrent invocation metadata without
  raw payloads, identities, URLs, or secrets. Log policy must be testable without
  actual production logging or live credentials.
- Require a real reference-app adoption and preserved deployed suite before
  claiming this package makes a standard Forge integration-testing surface.
  One app's HTTP pass is not native trigger coverage or proof across all apps.

## Out of Scope

- Publishing or creating a new repository/package as part of this seed document.
- Business handlers, credential provisioning, app-specific permissions, native
  Forge result/retry translation, or automatic module generation.
- Automatically permitting every command for a testing credential.
- Full JSON-RPC, persistent listeners, event buses, workflow engines, global state,
  universal retries, transactions, or a durable job system.
- Replacing the shared error/logging packages or implementing another schema
  validator/compiler. A generated CLI and runtime discovery can wait for demand.
- Performance/SLO claims, production readiness, or live changes without approval.

## Further Notes

The [reference-app spec](../spec.md) owns the extraction experiment and backward
compatibility proof. The [trigger outbound spec](forge-ahead-triggers.md) owns
native contracts and outcome mapping. Dependency direction must stay acyclic;
shared structural executor interfaces need not force a runtime dependency.

Tooling sources checked during planning:

- [OpenRPC typings](https://github.com/open-rpc/typings): schema types and
  method aliases.
- [OpenRPC generator](https://github.com/open-rpc/generator): customizable generation,
  but stock server templates are not a Forge deployment target.
- [OpenRPC schema utilities](https://github.com/open-rpc/schema-utils-js): validation
  and reference resolution, not business implementations.
- [JSON Schema to TypeScript](https://github.com/bcherny/json-schema-to-typescript):
  schema-to-type generation, not runtime validation or authorization.

These tools were inspected during planning, not proven against this app's
contract by an executed generation experiment. Pin versions and evaluate Forge
bundle compatibility before adoption. Do not equate the potential generated
surface with an accepted package API.

Issue publication and `ready-for-agent` labeling remain deferred until project
setup via `/setup-matt-pocock-skills`; this is a local seed spec only.
