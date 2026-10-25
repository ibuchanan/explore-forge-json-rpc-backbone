# Local product-event outcome translation evidence

<!-- cspell:words prelint -->

Status: local contract proof, 2026-10-25. Tested base:
`6a98e83ef2df5b600c0f6a321467147eb5a9291c` plus this slice.
No deployed/native-delivery acceptance is claimed.

## Verified family and sources

Selected family: Jira product event `avi:jira:created:issue`, not an async queue,
scheduled trigger, lifecycle event, or another HTTP mapping. Sources consulted on
2026-10-25 through Forge documentation search and Context7:

- [Product events](https://developer.atlassian.com/platform/forge/events-reference/product-events/):
  separate event/context arguments, normal completion without a return value,
  explicit app retry by returning `InvocationError`, retry metadata in
  `event.retryContext`, and automatic retries for platform failures.
- [Jira issue-created event](https://developer.atlassian.com/platform/forge/events-reference/jira/#issue-created):
  event discriminator and optional `issue.fields.summary`. This binding treats a
  missing summary as terminal rather than inventing text. Live subscription would
  require `read:jira-work`; no subscription or scope was added.
- Installed `@forge/events` **3.0.8**, public exports `InvocationError`,
  `InvocationErrorCode`, and `RetryOptions`. Declarations and implementation in
  `out/invocationError.*`, `out/invocationErrorCode.d.ts`, and
  `out/retryOptions.d.ts` were inspected. The constructor returns its native wire
  object (`_retry: true` and `retryOptions`), not an instance suitable for an
  `instanceof` assertion. Tests execute the actual public SDK, not a copied shape
  constructor or mock of the SDK.

The documented maximum is **four retries after the initial invocation**. The
fixture requests 30 seconds (below the documented 900-second cap), with
`FUNCTION_RETRY_REQUEST` and no retry data. It accepts the initial event or a
retry count 1–3 with a reason string when requesting another retry. Count 4,
malformed metadata, or app policy disallowing retry prevents another request.
Payload retry data is never forwarded or used as authority. No queue retention
window or scheduling semantics are inferred from the async-events API.

## Binding and outcome contracts

`test/native/product-event.ts` is a complete local handler with no manifest wiring.
It selects only `integration.preview`, maps the summary to `{ text }` unchanged,
and constructs `{ source: "api", authorized: true }` only after caller-owned policy
approves. Installation metadata does not itself establish permission. The fixture
policy is injected, not an installed authentication/authorization implementation.
Event-supplied method, caller, source, installation, retry permission, params, and
JSON-RPC envelope cannot select a different operation or grant UI authority.

The operation reads configuration and discards preview output; repeating it has
no mutation or outbound delivery effect. This assumption is specific to preview,
not inferred from a transport code and not transferable to save/reset.

| Semantic outcome | Existing JSON-RPC representation | Native value | Recorded disposition |
| --- | --- | --- | --- |
| Success | Exact command result | `undefined` | `acknowledged` |
| Forbidden | `-32001 Forbidden` | `undefined` | `terminal` |
| Invalid params | `-32602 Invalid params` | `undefined` | `terminal` |
| Not configured | `-32002 Not configured` | `undefined` | `terminal` |
| Explicit transient, retry permitted | Sanitized `-32603 Internal error` | SDK `InvocationError` | `retry-requested` |
| Transient, retry forbidden/exhausted | Sanitized `-32603 Internal error` | `undefined` | `terminal` |
| Internal or unexpected exception | Sanitized `-32603 Internal error` | `undefined` | `terminal` |
| Unknown write outcome | Sanitized `-32603 Internal error` | `undefined` | `reconciliation-required` |

Transient and write-uncertain labels are **explicit injected fixture knowledge**.
The production executor still returns its existing five semantic failure names;
`internal` does not distinguish transience from possible persisted effects. The
RPC comparison reduces the extra fixture classifications to `internal` before
using the real dispatcher. This proves differing adapter representations, not a
new production failure taxonomy or production retry capability. Native mapping
never derives a retry from an RPC code. JSON-RPC IDs are not deduplication keys.

Terminal and uncertain paths resolve normally instead of throwing or returning
an ordinary `Result`/RPC error. The record callback receives only allowlisted
outcome/disposition names, no input, output, identity, URL, or exception detail.
It models an app-owned disposition sink, not durable reconciliation. The local
fixture now also uses the existing app logger and demo narrative to record semantic
outcome separately from native completion intent; the
[runtime reference](../docs/reference/reference.md#logging-and-deployed-verification)
describes this observation contract. Neither local capture nor the callback proves
deployed log inspection or durable reconciliation. The sink must be reliable before
live adoption. No blanket claim about Forge's treatment of arbitrary thrown app
errors is needed: caught app errors are sanitized and acknowledged here. Platform
failures can still cause automatic redelivery, independently of this app policy;
this proof cannot guarantee exactly-once execution or suppress platform retries.

## Local evidence

`test/native-outcomes.test.ts` exercises complete native handlers and the existing
JSON-RPC dispatcher with injected execution outcomes and independent literal
expectations. A real-executor repeated-delivery fixture reads three times without
mutation. A defective executor deliberately violates preview's read-only contract,
persists a value, and returns uncertainty: one effect, no retry or restoration,
then a separate real `config.get` observes persistence.

TDD red-to-green slices covered the missing handler, terminal denial, execution
before authorization, native retry, retry cap/malformed context, unexpected
exceptions, and uncertainty reconciliation. Existing output-validation and
persisted-write exception checks remain independent production-seam evidence.

Validation: `bun run test -- test/native-outcomes.test.ts` (16 passed),
`bun run typecheck`, and the full check (149 tests across 14 files, generation
drift check, lint/format, Forge lint, build and unchanged 9.95 kB / 10 kB size).
The initial `bun run check` passed. Two subsequent parallel runs hit an existing
race: formatting saw the generator's unformatted temporary validator file before
cleanup. Final `bun run check -- --max-parallel 1` passed all the same tasks
serially without source/config changes or skipped checks. Standalone formatting
also passed. Existing prelint advisories and rejected-generator nullable-array
warnings remain.

## Proposed trigger-handoff delta and limits

- Installed `@forge-ahead/triggers` 0.2.1 supplies `InvocationContext` by type-only
  reuse in this test fixture. Its `ProductHandler` alias defaults to `void` and
  cannot describe the full explicit-retry completion union. A family-specific
  completion contract must represent normal completion and the verified SDK
  retry value; keep retry policy app-owned. The SDK constructor/wire discrepancy
  needs explicit tests rather than `instanceof` detection or a duplicate helper.
- No generic binding framework, schema compiler, retry manager, or new production
  errors were introduced. Actual trigger-package reuse in an installed entry
  point remains ticket 08, not satisfied by this type-only fixture.
- Exact SDK version is a dev dependency only; package lock adds one package and
  runtime size is unchanged. Its bundled license refers to Atlassian Developer
  Terms, not an asserted permissive OSS license. No legal approval is inferred.
  Install audit still reports 12 affected packages (4 low, 8 high), with existing
  React peer warnings; no audit remediation or unrelated upgrades were attempted.
- No manifest, scopes, runtime dependencies, peer repository, credentials, live
  invocation, deployment, installation, upgrade, queue, or native subscription
  changed. Delivery, scheduling, real isolation, installed UI, and backend-log
  inspection remain unverified. No production retry or exactly-once guarantee.
