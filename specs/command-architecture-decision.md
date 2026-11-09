# Command architecture extraction decision

> **Historical record.** This describes the hand-written dispatcher and the
> retired bearer-secret web trigger, which `forge-ahead-rpc` has replaced. See the
> [main spec](spec.md) for the current design.

<!-- cspell:words openrpc prelint webtrigger brotlied -->

Status: local decision gate concluded, 2026-10-25. Tested revision:
`ce8def6e45917ff2da2ab5835e8e39f12d6b575f`, followed by documentation-only changes.
This is dated evidence, not a second implementation spec or a stable package API.
The [main spec](spec.md) remains the sole app implementation plan.

## Decision

**Keep the demonstrated executor, JSON-RPC adapter, generated contracts and
validation in this app. Defer package extraction/publication.** One app plus a
local product-event fixture demonstrates useful separation, not cross-app reuse.
The core local decision can close without claiming all original objectives met:
actual trigger-library runtime integration remains **unmet**, following ticket
08's explicit defer outcome. No dependency upgrade or helper workaround is
justified merely to turn a declared dependency into an import.

| Proposed seam | Decision | Evidence and constraint |
| --- | --- | --- |
| Neutral execution and shared `Result` | Keep locally; seed possible commands extraction | `src/executor.ts` and executor tests exercise all four commands without Forge or JSON-RPC imports. App-specific caller, store and policies are not a generic package interface. |
| First-class JSON-RPC adaptation | Keep | `src/commands.ts` is used by both existing entry points; exact response and rejection tests pass. The supported single-call profile is not full JSON-RPC. |
| Catalog, handler map and typed caller | Keep selected generation; reject stock generator | Bounded traversal plus `json-schema-to-typescript` is consumed by real handlers/callers. `@open-rpc/typings` remains an experimental comparator, not the selected generator. |
| Runtime output validation | Keep | Standalone Ajv validators reject malformed successful outputs before executor/adapter success. Input normalization and authorization remain handwritten. |
| Trusted context and command policy | Keep app-owned | Server-constructed arguments are separate from params. Admin permission, HTTP credential, reset confirmation and source restriction are not generated authority. |
| Native completion adaptation | Keep fixture; change upstream contract only after audit | Actual SDK retry values differ from ordinary results. The fixture is neither a live binding nor a universal delivery interface. |
| Trigger helper adoption | Defer; actual integration unmet | Installed 0.2.1 helpers change required response objects or parse rejection. Type-only fixture reuse and a declared dependency are not runtime adoption. |
| Safe observations | Keep existing shared logging | RPC response-ready and native completion intent are distinct from command outcome. Do not introduce another logger or modify the trigger invocation observer to classify outcomes. |
| Binding framework, richer failure taxonomy, durable reconciliation | Defer | No repeated consumer need or durable implementation is established. Production `internal` is not automatically transient or write-uncertain. |
| Published commands package or second consumer | Defer | No extracted package, accepted public interface, cross-app proof, or publication is delivered by this decision. |

## Preserved execution contract

The [runtime reference](../docs/reference/reference.md) owns exact current facts.
The fresh checks preserve these results:

- `config.get({})` returns `{ configured: false, prefix: null }` when unset and
  `{ configured: true, prefix }` when configured.
- `config.set({ prefix })` trims before the 1–64 Unicode-code-point limit,
  persists once and returns `{ configured: true }`.
- `integration.preview({ text })` preserves 0–2,000 code points exactly and
  returns `{ output: prefix + text }`; without configuration it returns
  `-32002 Not configured`.
- `config.reset({ confirm: true })` returns `{ configured: false }` only for
  authorized UI callers. Authenticated HTTP can address reset but receives
  `-32001 Forbidden`, without a delete.

Strict named fields and the existing error precedence remain intact. RPC
supports one call with a string/finite-number ID, not batches, notifications,
null IDs or positional params. Fixed parse/envelope/method/parameter/internal
errors remain `-32700`, `-32600`, `-32601`, `-32602`, and `-32603`; exceptions
cannot supply public messages or details. HTTP ingress guards precede dispatch;
envelope checks precede caller authorization, then method lookup. Direct
execution checks authorization before parameters/effects; reset checks its
confirmation before its source restriction. No test credential grants UI rights.

`execute(method, params, caller, store)` returns the existing shared
`Result<Output, CommandFailure>`. `createExecutor(handlers)` validates successful
outputs; invalid output or a thrown store failure becomes semantic `internal`.
Both adapters preserve the established sanitized representation. A persisted
write followed by failure or invalid output remains observable through a separate
read: no automatic read-back, retry, rollback or restoration occurs.

### Generated ownership and limits

`docs/reference/openrpc.json` owns command names and schemas.
`scripts/command-contracts.ts` and `scripts/generate-commands.ts` produce the
tracked `src/generated/commands.ts` and `commands.validators.js`. Real handlers,
RPC registration, Bridge callers and verifier fixtures consume the generated
contract. The read-only drift check covers both artifacts; compiler fixtures
reject missing/extra handlers and invalid caller params/results. Handler bodies,
normalization and permission decisions are not generated.

The selected build-time traversal delegates types to `json-schema-to-typescript`
and output validators to Ajv. No schema compiler enters runtime. Local component
references, empty objects, literal booleans, nullable shapes and dotted names
are covered; unsupported features, unresolved/external references and naming
collisions fail generation. Remote/file reference loading is disabled. The
[experiment](openrpc-generation-experiment.md) records why stock
`@open-rpc/typings` was rejected: title repairs do not fix positional parameters
or widened literal booleans. It must not be described as an accepted generator.

### Native outcome versus completion

The [product-event evidence](native-outcome-translation.md) and complete handler
`test/native/product-event.ts` cover only Jira issue-created preview. The app
chooses the command, maps summary text and injects authorization/retry policy;
event fields cannot choose reset or manufacture a UI caller.

Success acknowledges with `undefined`, not command output. Terminal failures
also complete normally, without implying business success. Explicit fixture
transience can return the actual `@forge/events` `InvocationError` value with
30-second retry intent only when repeat-safe preview and app permission allow
it; malformed/exhausted retry metadata stops another request. The documented
limit is four retries after the initial invocation. Uncertain writes record
`reconciliation-required`, return normally and never request automatic retry.
Reconciliation is required, not implemented. Platform redelivery remains possible.

`transient` and `write-uncertain` are injected fixture knowledge, not additional
production executor failures or deductions from `-32603`. Production `internal`
is terminal in the fixture. Tests compare native values with the real RPC
adapter after reducing these extra classifications to `internal`.

RPC logs record `response-ready`, not observed delivery. Native logs record safe
outcome and disposition independently; neither capture proves retry scheduling.
Allowlisted metadata excludes raw params, output, identity, client IDs, URLs,
headers, credentials and exception/validation details. Local verifier run IDs
are not propagated to or automatically correlated with backend invocation IDs.
Local capture is not deployed backend-log inspection.

## Command and principal coverage

These are fresh **local** observations from independent seams, not new deployed
coverage or claims derived solely from a declared execution profile.

| Principal/seam | Command | Successful execution | Denial |
| --- | --- | --- | --- |
| Authenticated HTTP adapter/verifier fixture | `config.get` | Verified locally | Verified locally with missing/invalid authentication |
| Authenticated HTTP adapter/verifier fixture | `config.set` | Verified locally | Unverified per command at HTTP ingress; unauthorized API caller denied at dispatcher |
| Authenticated HTTP adapter/verifier fixture | `integration.preview` | Verified locally | Verified locally with missing/invalid authentication |
| Authenticated HTTP adapter/verifier fixture | `config.reset` | Unverified; forbidden by policy | Verified locally even with valid credential |
| Authorized UI resolver fixture | `config.get` | Verified locally | Verified locally without verified admin authority |
| Authorized UI resolver fixture | `config.set` | Verified locally | Verified locally without verified admin authority |
| Authorized UI resolver fixture | `integration.preview` | Verified locally | Verified locally without verified admin authority |
| Authorized UI resolver fixture | `config.reset` | Verified locally with confirmation | Verified locally without verified admin authority |

Different credentials/authorization states supply the positive and negative
cases; denial is not observed success for the authorized principal.
`test/commands.test.ts`, `test/http.test.ts`, `test/resolver.test.ts`, and
`test/deployed.test.ts` provide the observations. The verifier's HTTP report
credits only observed authenticated, contract-matching replies: HTTP reset has
denial evidence, not successful reset; all UI fields remain unverified there.
Separate resolver tests do not retroactively populate that HTTP report.

The [operator-reported 30-check HTTP pass](deployed-poc-verification.md) remains
historical, not a rerun at this revision or a retrospective coverage report.
Current deployed HTTP, installed UI rendering/identity lookup, real installation
isolation, deployed backend logs, native delivery/retry scheduling, durable
reconciliation and external-service behavior remain **unverified**. Local UI,
overlap/isolation and handler fixtures do not establish those live properties.

## Local delta for the owning trigger handoff

The source moved to `forge-ahead-triggers`, at
`specs/explore-forge-json-rpc-backbone-feedback.md`. It was inspected read-only;
no peer edit is authorized here. Retain this proposed delta for that maintainer's
native-contract audit, product-completion and consumer-handoff sessions:

- Carry `test/native-outcomes.test.ts` and `test/native/product-event.ts` as
  complete-handler examples. Product completion must represent normal completion
  and the verified SDK retry value, not just the current `ProductHandler` default
  of `void`. Audit inferred/sync/async return assignability too; an annotation
  alone does not reject all accidentally returned application data.
- Reuse SDK types/values before inventing helpers. `InvocationError` constructs
  a native wire object; `instanceof` is not its contract. Keep explicit retry
  permission, repeat safety, terminal disposition and uncertainty app-owned.
  Product findings do not settle lifecycle, scheduled or queue contracts.
- Carry `test/trigger-compatibility.test.ts` alongside ordinary HTTP/handler
  regressions. The success helper adds `statusText: "OK"` and lowercase header
  keys; the parser returns HTTP 400/domain error instead of HTTP 200 with RPC
  parse error and null ID. These violate this app's exact parity requirement,
  not HTTP header semantics. The two `it.fails` fixtures are retained known
  incompatibilities, not evidence of repaired integration.
- Audit required `WebTriggerEvent.userPath` against the installed SDK request.
  Record source compatibility and migration/version implications before changing
  types. Preserve current helper defaults for other consumers. Consider opt-in
  caller-owned JSON metadata only if it actually removes app plumbing; do not
  force `defineWebTrigger` plus compensating builders as an adoption workaround.
- A future adoption must replace real plumbing in a real entry point and pass
  the complete ingress/auth/error/privacy fixtures. Unexpected compatibility
  passes require review and ordinary regression assertions, not blanket removal
  of expected-failure markers. A type/identity wrapper alone earns no integration.

Commands own execution, validation and JSON-RPC framing; triggers own verified
native contracts and necessary helpers; apps own bindings, authority and retry
policy. Both reuse shared errors/logging. Structural executor types and explicit
app composition require no commands-to-triggers-to-commands runtime cycle.
No generic binding framework or native error taxonomy is accepted by this delta.

## Reproduction and toolchain

Commands run from this repository, without the opt-in deployed entry point:

```sh
bun run test -- test/contract.test.ts test/generation.test.ts test/executor.test.ts test/output-validation.test.ts test/commands.test.ts test/http.test.ts test/handler.test.ts test/resolver.test.ts test/ui.test.tsx test/admin-wiring.test.tsx test/native-outcomes.test.ts test/trigger-compatibility.test.ts test/deployed.test.ts test/rpc-logging.test.ts
bun run check -- --max-parallel 1
```

Focused result: **146 passed + two expected compatibility failures**, 14 files.
Full result: **152 passed + the same two expected failures**, 15 files. All
pipeline tasks passed: Biome lint/format, Fence Rider Forge lint, prelint,
generated-artifact drift check, typecheck, build and size check. Bundle size:
**9.96 kB brotlied / unchanged 10 kB limit**. This is the repository's size check,
not a fresh deployed Forge bundle verification. Targeted Markdown lint and
CSpell cover all seven changed documentation files; `git diff --check` covers
whitespace. Final validation results are also recorded on the local ticket.

Serial scheduling avoids the previously observed generator temporary-validator
format race; no task was skipped and no script/config was changed. Existing
prelint scope/script advisories and the rejected generator's nullable-array
warnings remain. This documentation-only ticket reuses the approved regression
seams; no new runtime behavior or artificial document-string test was added, and
no new red-to-green implementation cycle is claimed.

| Tool/dependency | Observed version or lockfile pin |
| --- | --- |
| Bun / Vitest / TypeScript | 1.4.4 / 5.0.5 / 5.9.3 |
| Forge CLI / SecretSpec / Fence Rider | 14.2.0 / 0.21.1 / 0.1.0 (`293ade8bb8c35d06bf6fc04ded57a8391b5445db`) |
| Biome / OpenRPC meta-schema | 2.6.2 / 1.14.9 |
| Selected type generator / Ajv | `json-schema-to-typescript` 16.0.0 / 8.20.0 (dev dependencies) |
| Rejected generator | `@open-rpc/typings` 1.13.1 (experimental dev dependency) |
| JSON-RPC runtime | `json-rpc-2.0` 1.8.1 |
| Shared errors | 0.3.3, `d4d972d6fd545e8d6b25c3a8c1c7d7e96792ba12` |
| Shared logging | 0.6.0, `6f159f790354cd10148d9ae8cf4959f48409f114` |
| Triggers (not adopted at runtime) | 0.2.1, `87fe98fa100a7843305a008e2bf513e51ac5b516` |
| Forge API / Bridge / KVS / React / Resolver | 8.3.0 / 7.2.0 / 2.1.0 / 12.3.1 / 2.0.1 |
| Product retry SDK (dev only) | `@forge/events` 3.0.8 |

Exact dependency provenance remains in `package-lock.json`. No dependencies or
lockfile changed. Prior experiment records retain unresolved license metadata,
SDK terms and the previous audit result (12 affected packages, eight high/four
low); no fresh vulnerability audit or legal approval is claimed by these checks.

## Smallest next work and stop conditions

- **Recommended upstream step:** trigger maintainer's native-contract audit,
  using the delta above. Blocked on a separately authorized upstream session and
  source/version compatibility decisions, not on creating a commands package.
  Stop with a dated contract matrix, compiler probes and an explicit minimum
  correction/no-change decision. Do not expand automatically to other families.
- **Revisit ticket 08:** app maintainer, only after a useful compatible public
  surface exists or exact compatibility requirements are explicitly revised.
  Stop unless real entry-point reuse removes duplication and complete parity,
  authority, privacy and size checks pass. A newer version alone is not proof.
- **Optional ticket 11:** operator owns target approval, deployment/install
  permissions, fresh-state writes and separate UI/isolation/backend-log evidence.
  Stop on missing approval, target ambiguity or uncertain write; never reset or
  restore automatically. This decision authorizes no live action.
- **Optional ticket 12:** app/library maintainer selects one accessible consumer
  and obtains permission for its repository and policy. Stop at one bounded
  acceptance matrix and a keep/change/defer update; no generalized framework.
  No second target is selected or authorized here.

Tickets 11 and 12 are structurally next after this decision but retain their own
approval gates; neither is an automatically runnable implementation ticket.
No peer repository, manifest, scopes, credentials, deployment, installation,
upgrade, live write/reset, tracker publication or push changed in this session.
