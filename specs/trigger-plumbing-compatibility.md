# Trigger-plumbing compatibility experiment

<!-- cspell:words prelint webtrigger -->

Status: local evidence and proposed handoff delta, 2026-10-25. This is not a
second implementation spec or proof of runtime integration.

## Scope and decision

Ticket 08 evaluated the installed `@forge-ahead/triggers` 0.2.1 public root and
family exports against the app's existing complete HTTP adapter. Base revision:
`4b5142abb9b284ba4d65f2d3d2b2c2ef7d82f01e`, plus this experiment. The lockfile
pins the package to `87fe98fa100a7843305a008e2bf513e51ac5b516`.

**Defer actual integration.** No inspected helper replaces existing plumbing
without changing the required exact response contract or adding compensating
plumbing. No app entry point was changed. The package remains a declared runtime
dependency, not a demonstrated runtime integration. The earlier native fixture
reuses only its invocation-context type. Neither counts as actual adoption.

This is a consumer compatibility constraint, not a claim that the helpers are
incorrect: HTTP header names are case-insensitive, but this ticket requires
preserving the app's exact Forge response objects as well as wire behavior.

## Inspected public surfaces

| Public API | Consumer finding |
| --- | --- |
| `buildSuccessResponse` | Serializes the same JSON body, but emits lowercase `content-type` and adds `statusText: "OK"`. No options preserve the existing object shape. |
| `parseJsonBody` | Missing/malformed bodies produce a domain-error envelope, normally HTTP 400. Status/header options do not supply the app's JSON-RPC envelope, null ID, or parse-versus-envelope rejection semantics. |
| `buildErrorResponse` | Produces Problem Details from unknown errors, not the app's fixed sanitized JSON-RPC errors or plain-text ingress rejections. Not used. |
| `buildErrorCodeResponse` | Serializes `{ error, detail? }`, not a JSON-RPC response or the existing plain text. |
| `buildEmptySuccessResponse` | HTTP 204 is not used by this app. |
| `extractClientHeaders` | Selects tracing/client headers, not the authentication/media headers the app validates and rejects when duplicated. |
| `defineWebTrigger` | Identity function at runtime. Its handler contract requires `userPath`, absent from the installed Forge SDK's `WebTriggerRequest`. Importing it alone would not replace app plumbing. |
| Root `TriggerHandler` / `WebTriggerResponse` | Generic type/SDK alias reuse only; adds no missing validation or response behavior to the existing SDK-typed entry point. |
| `withInvocationLogging` | Observes raw invocation through `forgeInvocation`; it does not replace the existing safe rejection/RPC narratives. Adding observation solely for an import is not integration evidence. |

No public bearer-authentication or ingress-validation helper was found. There is
no request to add one: secret checks, exact bearer syntax, constant-time comparison,
JSON-RPC framing, command selection, authorization, and privacy remain app-owned.
Replacing helper defaults and then rebuilding the original headers/status/body
would add code without eliminating the existing policy or serialization boundary.

## Executable evidence

`test/trigger-compatibility.test.ts` invokes complete candidate handlers through
public `/webtrigger` exports. Two ordinary tests independently verify the app's
literal success and parse-error responses and storage effects. Two `it.fails`
fixtures retain the failed direct-substitution contracts:

- Success: same body and HTTP 200; incompatible header key and added status text.
- Malformed JSON: expected HTTP 200 with `-32700 Parse error`, `id: null`, and
  `Content-Type`; observed HTTP 400 with `{"error":"invalid-request-body"}` and
  lowercase `content-type`.

Both were first run as ordinary failing tests. Expected-failure registration
keeps the repository check usable without labeling the incompatibilities fixed.
An unexpected pass fails the suite and requires reassessing this decision.
The candidate fixtures are deliberately not production handlers or authentication
implementations. Existing HTTP/handler tests remain the evidence for auth,
rejection precedence, duplicate headers, byte limits, reset denial and redaction.

## Proposed delta for the moved trigger handoff

The owning source is the sibling trigger repository's
`specs/explore-forge-json-rpc-backbone-feedback.md`; it was read but not changed.
For its consumer-handoff session:

- Carry these complete-handler parity fixtures and exact response constraints
  forward. Preserve current helper defaults for other consumers; do not silently
  change them to satisfy this app.
- Verify `WebTriggerEvent.userPath` versus the installed SDK request before
  recommending `defineWebTrigger` as a drop-in declaration seam. Treat source
  compatibility and migration/version implications explicitly.
- Consider an opt-in way to preserve caller-owned JSON response metadata only
  if it removes real duplication. Re-run these fixtures before adoption; a wrapper
  that undoes helper defaults is not a demonstrated improvement. No API expansion
  is justified or authorized by this experiment alone.
- Keep parsing/envelope errors and application authorization in their owning
  layers. Do not add a JSON-RPC dependency, raw-exception serialization, implicit
  authentication, or retry policy to the trigger package.
- Product-event completion/type gaps remain separately recorded in the
  [native outcome evidence](native-outcome-translation.md). They do not establish
  web-trigger reuse or justify a universal adapter.

Ticket 10 must report the integration criterion as **unmet/deferred**, even after
this compatibility experiment has concluded. Ticket 09 is the next eligible
local slice; a compatible upstream change or an explicitly revised compatibility
requirement is needed before retrying actual adoption.

## Validation and limits

- Bun 1.4.4, Vitest 5.0.5; no dependency or lockfile changes.
- Focused adapter/executor/resolver/contract/verifier/privacy run: 56 passed and
  two expected compatibility failures across eight files; typecheck passed.
- `bun run check -- --max-parallel 1`: passed all tasks, including Forge lint,
  Biome lint/format, prelint, generation drift, typecheck/build, and tests:
  151 passed plus two expected compatibility failures across 15 files. Size:
  unchanged 9.95 kB / 10 kB. Serial scheduling avoids the previously recorded
  generation-fixture/format-check race; no task was skipped or config changed.
- Existing prelint scope/script advisories and rejected-generator schema warnings
  remain unchanged. Targeted Markdown lint and CSpell passed after allowing the
  literal public import subpath; `git diff --check` passed.
- The local scratch ticket records the implementation commit. Its integration
  acceptance box remains unchecked and status is deferred, not completed.
- No runtime, manifest, scope, credential, peer-repository, deployment, install,
  upgrade, live write/reset, or retry behavior changed. No new bundling/deployment
  evidence is claimed. Deployed HTTP, installed UI, real installation isolation,
  native delivery, and backend-log inspection remain unverified for this revision.
