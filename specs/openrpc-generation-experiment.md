# OpenRPC generation experiment — 2026-10-25

<!-- cspell:words openrpc prelint titleizer -->

## Decision and scope

**Choose:** a small OpenRPC traversal plus `json-schema-to-typescript` for the
next generation slice. **Reject:** stock `@open-rpc/typings` as this app's
contract generator. Both were executed against the unchanged four-command
[`openrpc.json`](../docs/reference/openrpc.json), not just evaluated from docs.

Tested base: `94cd59f7966f8e1bc007fec2d78fc78e8a54f0bb` plus this change.
This is ticket 02's local build-time experiment, not adoption by app handlers,
frontend callers, or the runtime. Ticket 03 may proceed; ticket 05 owns consumed
artifacts, regeneration/drift commands, and production generation integration.
No generated handler bodies, listeners, CLI, authorization, or retries are added.

## Reproducible evidence

The retained samples are [`test/generation.test.ts`](../test/generation.test.ts)
and its [bounded traversal](../test/generation/experiment.ts). Generated output
and compile samples stay in memory; no disposable generated file is retained.
The TypeScript compiler checks real imports, shared `Result`, positive examples,
and `@ts-expect-error` negative examples with strict null/optional checking.

```sh
bun run test -- test/generation.test.ts test/contract.test.ts
bun run typecheck
bun run check
```

The focused run passed 15 tests; the full check passed 111 tests in 11 files,
Biome, TypeScript, prelint, Forge lint, and the unchanged 8.46 kB / 10 kB size
check. Existing prelint advisories remain. An initial full-check attempt stopped
on formatting disposable audit JSON; those reports were deleted before rerun.

TDD observations: the generation/compile sample failed before the traversal
existed; the collision fixture failed before the name guard; the unsupported
`if` fixture failed before the supported-keyword guard. Each became green after
its implementation. Existing runtime contract tests stayed green.

Two fresh generations of the actual document produced identical 979-byte
output, SHA-256:
`b3745267c5c949c8b1e11951faeba8dc541cdadb6711a5723e25408ec64e68cd`.
The suite also generates both the actual document and a local-reference fixture
twice, asserts byte equality, and checks input immutability. Determinism is for
these pinned tools and fixtures, not arbitrary future versions or schemas.

## Executed comparison

| Observation | `@open-rpc/typings` 1.13.1 | Traversal + `json-schema-to-typescript` 16.0.0 |
| --- | --- | --- |
| Actual document compiles | No: unresolved generated result type | Yes |
| Minimal adaptation | Unique titles on parameter/result schemas repair compilation | Named descriptors become one object schema per method |
| Named parameters | Positional signatures despite `by-name`; object caller fails compilation | Object params; required/optional fields compile correctly |
| Literal booleans | Widens to `boolean`; `reset(false)` and false save-result compile | Preserves reset confirmation and true/false result literals |
| Dotted names | Renames method aliases such as `ConfigGet` | Quoted method keys retain exact names |
| Context and shared `Result` | Additional wrapper required; literal repair still needed | Small generic handler-map wrapper, context separate from params |
| Typed caller | Needs adaptation beyond stock signatures | Generic method-to-params/output correlation compiles |

The stock failure remains an expected comparison test, not a failing suite.
Title-adapted stock output is also compiled to distinguish a repairable naming
defect from the remaining positional/literal problems. The stock tool emits a
warning about nullable `type` arrays; no document change is made to appease it.
Repairing its schema semantics and then adding the same wrappers is more work
than delegating schema compilation to the alternative.

## Smallest viable contract shape and limits

The generated surface is `Commands`, `CommandName`,
`HandlerMap<Context, Failure>`, and `TypedCaller`. Parameter and output shapes are
indexed through `Commands[method]`; aliases per method are unnecessary. Handlers
return `Promise<Result<Output, Failure>>` using `@forge-ahead/errors`. Context and
failure policy remain supplied by the app. Caller transport/failure framing is
not implemented by the type alias.

The bounded experiment supports named descriptors and object/string/boolean/null
schemas, including nullable type arrays, properties, required fields,
`additionalProperties`, `enum`/`const`, titles/descriptions, and string length
keywords. Empty parameter lists become `Record<string, never>` via one fixed
compiler override: plain TypeScript `{}` would accept unwanted fields. User
schema `tsType` overrides are not allowed.

Only local `#/components/schemas/<name>` references are allowed. HTTP and file
resolvers are disabled as defense in depth; only checked schema components are
passed to the compiler. Missing local references are rejected by the compiler,
not by a second private reference resolver. Method/descriptor references,
external files/URLs, recursive-schema behavior, composition, arrays, numbers,
conditional schemas, schema-valued additional properties, and other keywords
are not supported/proven by this slice. New features require a deliberate
fixture and decision; unsupported keywords/types fail rather than becoming
`any`. This is a subset guard, not a new JSON Schema engine.

Command names are conservatively collision-checked after stripping punctuation
and folding case, before schema compilation (`config.get` versus `config-get`
is the retained failure fixture). Duplicate parameters and positional bindings
also fail. The compile samples reject missing/extra handlers, plain outputs in
place of shared `Result`, unknown methods/fields, false confirmation, incorrect
output literals, and broken nullability/reference types.

**Static types are not runtime validation.** Length/content constraints and
unknown fields from untyped callers still require runtime checks. The sample
intentionally compiles both empty prefix and a padded 64-code-point Unicode
prefix: only the real handler can reject the former and trim before validating
the latter. Preview text must still be preserved exactly, not trimmed by a
schema compiler. Existing runtime normalization/Unicode/preview contract tests
remain the independent evidence. Output validation belongs to ticket 06.

## Tooling and dependency posture

- Bun 1.4.4; npm CLI 11.19.1 run through Bun for the existing npm lockfile;
  TypeScript 5.9.3; Vitest 5.0.5.
- Exact new dev pins: `@open-rpc/typings` 1.13.1 (metadata: `Apache 2.0`) and
  `json-schema-to-typescript` 16.0.0 (MIT). The latter declares Node >=16.
- The comparison tool brings titleizer/transpiler/schema-utils and related
  dependencies; the chosen compiler brings ref-parser, schema/lodash types,
  YAML, lodash, minimist, Prettier, and tinyglobby. Lockfile additions are all
  dev-only: 45 package entries, with MIT/Apache/BSD/ISC metadata except
  `@open-rpc/spec-types` 0.0.2, whose license is absent/`Undefined` in registry,
  package metadata, and the installed license scanner. This unresolved license
  belongs to the rejected comparison chain; no legal approval is claimed.
- Installed `license-checker-evergreen` 6.3.1 confirmed direct tool metadata.
  Its production scan reported unresolved `UNLICENSED`/`SEE LICENSE IN` entries
  in the existing tree; this is not a clean license bill or a new runtime change.
- Before/after lockfile audits reported the same 12 affected package names and
  totals (8 high, 4 low), under existing Forge/Atlaskit and markdown tooling.
  No automatic audit fix or unrelated upgrade was applied. Existing React 16
  peer warnings from Atlaskit appeared during install; React stays at 18.3.1.
- Only tests import either generator. The emitted `Result` import is type-only;
  neither compiler nor schema tooling enters `src`, the deployment tsconfig,
  manifest, or app bundle. Keep the rejected tool only while its runnable
  comparison is useful; do not ship or select it as a runtime dependency.

No deployment, installation, live storage, native delivery, UI rendering,
backend-log, or isolation evidence was produced. Historical deployed evidence
retains its original meaning. The unrelated deleted trigger handoff is untouched.
