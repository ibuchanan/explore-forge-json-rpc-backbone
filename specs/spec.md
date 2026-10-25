# Prove a reusable trigger-to-command architecture

<!-- cspell:words pocock -->

Status: draft for review, 2026-10-25. Audience: maintainers of
`explore-forge-json-rpc-backbone`. This is the **only main implementation spec
for this repository**. It replaces the original POC plan and architectural
exploration; implemented behavior is documented in the reference and guides.
It does not authorize live operations or claim production readiness.

## Problem Statement

The app has demonstrated a shared configuration lifecycle through a Jira UI
resolver and an authenticated JSON-RPC web trigger. An operator-reported run
passed all 30 deployed HTTP checks. However, the current dispatcher combines
application execution with JSON-RPC errors and envelopes. Types, method names,
validation, and OpenRPC descriptions still have overlapping handwritten forms.

We want to learn whether commands can become a reusable application interface
across Forge apps, with JSON-RPC as a standard deployed integration-testing
surface. We must preserve the proven behavior without assuming that every
trigger can execute every command, or that every actor has the same authority.
Native result and retry translation remain the important unproven dimension.

## Solution

Use this app as the reference consumer for a small, protocol-neutral command
executor and a first-class JSON-RPC adapter. Generate contract types from the
existing OpenRPC description, preserve the current wire contract, and prove
explicit application-outcome mappings before extracting reusable libraries.

Every registered command must be addressable through the JSON-RPC test surface,
subject to explicit authorization. Addressability is not successful execution:
HTTP denial of `config.reset` remains a valid coverage case, not positive-path
reset coverage. No adapter may impersonate a UI administrator to obtain parity.

Use the existing direct-execution and deployed-JSON-RPC seams. Add focused
native-adapter contract tests only where they establish different output or
retry behavior. Native Forge wiring and installed UI checks remain separate
from command integration coverage.

## User Stories

1. As an app maintainer, I want a preserved baseline contract, so that extracting
   the command layer does not change existing callers' behavior.
2. As a command author, I want protocol-neutral outcomes, so that handlers do
   not construct HTTP responses or JSON-RPC exceptions.
3. As a test author, I want every registered command represented in OpenRPC,
   so that the common integration surface has a complete catalog.
4. As a test operator, I want expected authorization denials recorded separately
   from successful execution, so that coverage does not overstate evidence.
5. As a Jira admin, I want reset to retain its existing authorization rule,
   so that a testing refactor does not expand destructive access.
6. As a maintainer, I want trusted caller context outside command parameters,
   so that client input cannot manufacture permissions or dependencies.
7. As a developer, I want generated parameter and result types, so that method
   changes cannot silently leave the frontend and handlers inconsistent.
8. As a developer, I want named parameter objects and stable dotted method
   names, so that generation preserves the current OpenRPC contract.
9. As a maintainer, I want normalization tested before validation, so that a
   generator does not change prefix trimming or Unicode length behavior.
10. As a developer, I want invalid outputs detected as internal failures,
    so that handler defects cannot escape as apparently valid results.
11. As a trigger adapter author, I want explicit success, terminal failure,
    retryable failure, and uncertain-write cases, so that native completion
    semantics are tested rather than guessed.
12. As an operator, I want no automatic retry after an uncertain write,
    so that a lost reply does not cause duplicate side effects.
13. As a maintainer, I want real use of compatible trigger-library helpers,
    so that declaring the dependency becomes an evidence-backed integration.
14. As a library author, I want consumer evidence before extraction,
    so that shared packages capture repeated behavior rather than speculation.
15. As a reviewer, I want installed UI, isolation, and backend-log observations
    distinguished from HTTP evidence, so that missing checks stay unverified.
16. As an operator, I want the existing SecretSpec workflow and sanitized
    narratives preserved, so that verification remains repeatable and safe.
17. As a maintainer, I want a bounded second-consumer experiment,
    so that cross-app reuse can be assessed without building another framework.
18. As a reviewer, I want an explicit extraction decision and unresolved risks,
    so that successful tests do not become an unsupported production promise.

## Implementation Decisions

- **Preserve the implemented baseline.** Retain four named methods, exact
  results/errors, the single-call protocol profile, trusted-context rules,
  source-based reset denial, and storage semantics. Runtime improvements must
  not silently change authentication, error precedence, supported envelopes,
  or the distinction between write completion and read-back verification.
- **Separate execution from representation.** Extract handlers and an executor
  that return the existing shared `Result` abstraction with semantic failures.
  JSON-RPC framing and numeric code translation belong to an adapter. Storage
  stays injected; the command core must not depend on Forge request objects.
- **Keep authorization explicit.** Adapters establish trusted context; the
  application defines per-operation policy. Preserve current reset behavior
  while evaluating a more expressive context than a source and boolean.
  Do not manufacture identities, wildcard permissions, or a privileged test mode.
- **Keep JSON-RPC first-class.** The registry and OpenRPC method set must agree.
  A test execution profile records permitted success, expected denial, and
  unavailable positive paths for each command/principal. It is application
  policy, not an authority grant inferred from schema presence. Record the
  declared expectation and observed coverage per command/principal: successful
  execution verified, denial verified, or positive path unverified. Do not label
  a denial-only command fully exercised.
- **Experiment with generation before selecting tooling.** Evaluate
  `@open-rpc/typings` against the current document. Adapt its output to named
  objects, trusted context, and `Result`, or use a small document traversal
  with `json-schema-to-typescript` if that is simpler and more reliable.
  Produce a written comparison and compile generated output before choosing.
- **Own generated artifacts deliberately.** Regenerate types, command names,
  and handler-map contracts deterministically. Keep implementation bodies and
  authorization handwritten. Generated stubs must fail explicitly until
  implemented, never return examples as working business behavior.
- **Preserve validation semantics.** Prefix length is checked after trimming;
  preview text is preserved exactly. Reject unknown parameter fields. Resolve
  references and handle empty objects, literal booleans, nullable results,
  dotted names, and naming collisions. Types alone do not enforce these rules.
  Validate result shapes without claiming rollback if validation fails after
  a side effect. Unsupported schema features must fail generation clearly.
- **Prove outbound translation locally first.** Add contract fixtures showing
  the same application outcome mapped to JSON-RPC and a delivery-oriented
  adapter. The latter is not a deployed consumer until approved manifest
  wiring and native verification exist. Map retry requests explicitly and
  consider idempotency before repeating work; JSON-RPC IDs are not deduplication.
- **Integrate the trigger package by evidence.** Reuse compatible contracts or
  response helpers in this app when they preserve its behavior. Do not replace
  authentication or JSON-RPC error sanitization with a generic helper that
  changes status codes, messages, or exposure. Track unmet library needs in
  the outbound trigger spec instead of inventing duplicate private frameworks.
- **Retain operational controls.** SecretSpec supplies targets, credential,
  and URLs; cached URLs remain operator-reviewed. Keep explicit live invocation,
  fresh-state requirements, no automatic reset/restoration, and no hidden
  deployment/provisioning. Keep command outcome and adapter completion distinct
  in safe logs; do not claim local and backend IDs are already correlated.
- **Stage adoption.** First prove contract generation and local extraction;
  then outcome mapping; then consume compatible library releases. A second
  Forge app or native trigger is a later, bounded experiment with its own policy
  and approval, not a prerequisite to every local iteration.

## Testing Decisions

- Prefer observable behavior at the existing direct dispatcher/executor seam
  and the deployed HTTP seam. Prior art includes generated command sequences,
  Unicode cases, OpenRPC example/result checks, resolver authorization tests,
  HTTP rejection tests, and the local-adapter version of the deployed verifier.
- Keep baseline requests and exact response/error fixtures passing across
  extraction. Preserve rejection-before-side-effect behavior and unknown-field
  rejection, including client attempts to supply trusted context.
- Typecheck generated handlers and clients; test deterministic regeneration,
  missing/extra handler detection, dotted-name preservation, collision failure,
  resolved references, empty parameters, literal results, and nullability.
  A clean generation check must detect drift without rewriting manual handlers.
  The tooling experiment is the first gate: record compile/sample results and
  choose or reject a generator before treating generated-artifact checks as done.
- Test normalization and runtime validation separately from static types.
  Include padded prefixes whose raw length exceeds the normalized limit,
  Unicode boundaries, invalid outputs, and side effects followed by failure.
- For one outcome-mapping contract, cover success, permanent denial, transient
  failure, and unknown write outcome. A returned error object must not silently
  count as a native retry. Scheduling and product-event return contracts need
  current documentation and evidence, not an assumed universal `void` result.
- Preserve privacy and overlapping-invocation logging tests. No raw context,
  input, output, credential, URL, or exception details may be logged by default.
- Keep live writes out of normal checks. With separate operator approval,
  rerun the existing deployed suite after runtime changes and record revision,
  target metadata, timing, and differences. Retain the dated 30-check pass as
  historical evidence, not proof of a later implementation.
- Record installed UI, second-installation isolation, and backend-log inspection
  separately when available. No HTTP pass or local consumer fixture proves
  native delivery, UI rendering, retry scheduling, or real external integration.
- Completion of the next proof requires preserved baseline behavior,
  reproducible generated contracts, demonstrated outcome mappings, and a
  written keep/change/defer decision for library extraction. Unavailable live
  evidence remains explicitly unverified rather than blocking honest local findings.

## Out of Scope

- Implementing either outbound library merely by writing these specifications.
- Making every command executable by every trigger or every authenticated actor.
- Adding a universal superuser credential, automatic reset, rollback, or retry.
- Full JSON-RPC conformance, notifications, batches, streaming, generated CLI,
  runtime schema discovery, or automatic native-module/manifest generation.
- Real Jira writes, external-service integration, new scopes, app registration,
  deployment, installation, upgrade, or production acceptance without approval.
- An event bus, workflow engine, global dependency container, or durable job system
  before a concrete consumer requires it.

## Further Notes

The implementation facts live in the [runtime reference](../docs/reference/reference.md),
[architectural explanation](../docs/explanation/explanation.md), and the two
[proof guides](../docs/how-to/prove-admin-ui.md).
The [deployed verification record](deployed-poc-verification.md) preserves the
operator-reported 2026-10-25 HTTP pass and its limits; the
[SecretSpec validation record](secretspec-validation.md) is historical tooling
V&V, not another implementation plan.

The [trigger-library outbound spec](outbound/forge-ahead-triggers.md) owns native
contracts and outcome translation. The [commands-library seed spec](outbound/forge-ahead-commands.md)
owns reusable command execution, the first-class JSON-RPC adapter, and generation.
These are handoff drafts, not accepted changes in their target repositories.

Issue publication and `ready-for-agent` labeling are deferred because no project
tracker or triage vocabulary is configured. Run `/setup-matt-pocock-skills`
before using the publishing part of `to-spec`. No remote issue was created.
