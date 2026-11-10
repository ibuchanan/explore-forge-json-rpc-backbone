# Prove a reusable trigger-to-command architecture

<!-- cspell:words webtrigger openrpc -->

Status: the app consumes the `forge-ahead-rpc` library and the bearer-secret web
trigger is retired (2026-11-09). Live verification of the new web trigger and
an installed UI walkthrough remain unverified. Audience: maintainers of
`explore-forge-json-rpc-backbone`. This is the **only main implementation spec
for this repository**; the other `specs/` files are dated records. It does not
authorize live operations or claim production readiness.

## Problem Statement

The original app shared one configuration lifecycle between a Jira UI resolver
and a bearer-secret JSON-RPC web trigger, using a hand-written dispatcher
(`json-rpc-2.0`), executor and generator. An operator-reported 2026-10-25 run
passed all 30 deployed HTTP checks against that design. That design gave every
holder of one shared secret the same access, and the envelope, validation,
error-mapping and generation code was specific to this app.

We want to learn whether commands defined once in an OpenRPC catalog can serve
several triggers through a reusable library, while each trigger keeps its own
authority. The questions that remain are whether the library holds up in a
deployed installation, and what it still lacks.

## Solution

This app is the reference consumer of `forge-ahead-rpc`. The OpenRPC catalog
(`docs/reference/openrpc.json`) is the single contract. The package generator
produces types, validators, a reviewed web policy and the catalog. The package
dispatcher validates envelopes, parameters and results and maps errors. The app
owns only policy: handlers (`src/executor.ts`), the caller context and the
`errorMap` entry for `not-configured` (`src/adoption.ts`).

Two entry points share that dispatcher and one Forge KVS store:

- The **UI resolver** checks Jira `ADMINISTER` as the user on every call and
  may call all four commands. Only it may reset.
- The **web trigger** is the package handler. It requires a trusted
  installation context, verifies a Jira admin through HTTP Basic credentials on
  every request, and exposes only the methods marked `x-forge-ahead.web`
  (`config.get`, `integration.preview`). Save and reset are not reachable.

## Implementation Decisions

- **One dispatcher.** The hand-written dispatcher, HTTP adapter, executor,
  generated command files and their generator are removed. No parallel stack
  remains. Handlers take typed parameters and do not re-validate shapes.
- **Authority is per entry point, not per secret.** The shared bearer credential
  and `RPC_BEARER_SECRET` are retired. The entry point reads the installation
  ARI from `getAppContext()` and discovers the installed Jira site's `baseUrl`
  using an as-app `/rest/api/3/serverInfo` request on each invocation. Discovery
  failure returns 503. Forge `fetch` separately verifies the caller's API token
  and Jira administrator permission on that site.
- **Exposure is reviewed metadata.** Web reachability is declared in the
  catalog (`x-forge-ahead`), mirrored into a generated policy that the library
  checks for drift, and then selected in app code. `rpc.discover` lists only
  what is exposed.
- **Validation semantics.** The schema bounds the prefix as sent (1–64 code
  points); the handler then trims it and rejects an empty result. Preview text
  is preserved exactly. A padded prefix over the raw limit is rejected, in both
  the form and the dispatcher. Unknown parameters are rejected.
- **App errors stay explicit.** `not-configured` keeps code -32002 through the
  library's `errorMap`. Forbidden and invalid-params pass through. Anything else
  becomes a generic internal error without exception details.
- **Contract generation.** `npm run generate:rpc` regenerates
  `src/generated/rpc/`; `generate:rpc:check` fails on drift and is part of
  `npm run check`. Generated files are never edited by hand.
- **Runtime configuration.** No web trigger installation or site variables
  are needed; no runtime scope is declared. Local live-check inputs stay out
  of every scope.

## Testing Decisions

- Test observable behavior through the real adopted dispatcher: lifecycle,
  authorization, error codes, rejection before side effects, and the web
  trigger's fail-closed paths (`test/adoption.test.ts`, `test/handler.test.ts`).
- Keep resolver authorization, sanitized storage failures and logging privacy
  tests (`test/resolver.test.ts`), UI behavior (`test/ui.test.tsx`), and
  OpenRPC examples and schemas checked against the dispatcher
  (`test/contract.test.ts`).
- The live check (`npm run test:deployed`, `scripts/verify-webtrigger.ts`) is
  read-only, opt-in and development-only. Its logic is tested offline
  (`test/verify-webtrigger.test.ts`) against the real adopted trigger and a fake
  Jira. Normal checks never call a deployed endpoint.
- Record installed-UI, second-installation isolation and backend-log
  observations separately. No local test proves them.

## Remaining Work

- Run the live check against an approved development installation and record the
  result, revision and timing in a new dated record.
- Walk through the installed UI using the
  [Admin UI guide](../docs/how-to/prove-admin-ui.md).
- Feed library gaps back upstream: exported standard error constants, a
  completion hook for logging, a generator that also emits the catalog and runs
  under Node, and packaging that does not need `file:` or a `paths` workaround.
- Decide whether the `config.set` and `config.reset` paths ever need a web
  surface; today they are intentionally UI-only.

## Out of Scope

- Making every command executable by every trigger or every authenticated actor.
- A shared superuser credential, automatic reset, rollback or retry.
- Full JSON-RPC conformance: notifications, batches, streaming, runtime schema
  discovery or generated manifest modules.
- Real Jira writes by tests, external-service integration, new scopes, app
  registration, deployment, installation or upgrade without approval.
- Distributable-app authentication. The package's Jira admin verifier is for
  internal use only.

## Further Notes

Implemented behavior is in the [runtime reference](../docs/reference/reference.md)
and [architectural explanation](../docs/explanation/explanation.md).
The earlier specs record how the design got here and describe code that no
longer exists: the [deployed verification record](deployed-poc-verification.md),
[extraction decision](command-architecture-decision.md),
[generation experiment](openrpc-generation-experiment.md),
[native outcome proof](native-outcome-translation.md),
[trigger compatibility experiment](trigger-plumbing-compatibility.md) and the
[commands seed](outbound/forge-ahead-commands.md). The
[SecretSpec validation record](secretspec-validation.md) is historical tooling
V&V.
