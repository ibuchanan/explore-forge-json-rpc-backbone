# Follow a command through local tests

In this tutorial, you will follow the demo configuration lifecycle through its
shared dispatcher and two adapters. You will see the same saved prefix used by
both paths, then a deliberate difference in reset permission.

Use an installed checkout with dependencies available and Node.js 24, as described
in the [README](../../README.md#try-the-repository-locally). Run each command from
the repository root. This lesson uses local Vitest fixtures only: no deployed
app, credential, browser, or Forge provider configuration is needed.

## 1. Observe the configuration lifecycle

Run the shared command tests:

```sh
npm run test -- test/commands.test.ts
```

The tests pass. Among them, a preview before setup returns `Not configured`.
A padded prefix is then trimmed, saved, and read through both caller sources.
The preview returns the saved prefix followed immediately by the supplied text.

Open the test named `previews exact text and Unicode boundaries without changing
configuration` in [the command tests](../../test/commands.test.ts). Its injected
in-memory store is shared across calls, just as the runtime uses one storage
interface. No HTTP listener or browser is involved.

## 2. Follow the external adapter

Run the HTTP tests:

```sh
npm run test -- test/http.test.ts
```

The tests pass. Wrong credentials and unsupported HTTP requests are rejected
before command storage is accessed. An accepted request reaches the same
command dispatcher and returns a serialized JSON-RPC response.

Open [the HTTP adapter](../../src/http.ts) and follow its call to `dispatch`.
The adapter constructs the trusted API caller; that context does not come from
the JSON request body.

## 3. Observe the UI path and its different authority

Run the official resolver integration tests:

```sh
npm run test -- test/resolver.test.ts
```

The tests pass. They use the resolver interface with local Forge API/KVS fixtures
and exercise shared storage with the HTTP path. The resolver performs an as-user
admin permission check before dispatch. An authorized UI caller can confirm
reset, while the authenticated HTTP caller cannot.

Open [the resolver](../../src/resolver.ts). The command call is shared;
the caller's verified authority is not. These fixtures demonstrate local
behavior, not an installed Jira session or UI rendering.

## 4. Connect execution to the written contract

Run the OpenRPC contract tests:

```sh
npm run test -- test/contract.test.ts
```

The tests pass. Open [the OpenRPC document](../reference/openrpc.json) and find
`config.reset`. It is in the catalog even though HTTP execution is forbidden.
The tests compare examples, schemas, and documented errors with runtime behavior.
The app does not yet generate its handler types from this document.

## 5. Follow a verification narrative locally

Run the deployed-verifier tests, not the live runner:

```sh
npm run test -- test/deployed.test.ts
```

The tests pass. These fixtures inject a local HTTP adapter and capture real
structured logging records. They check the numbered narrative, separate report
output, expected failures, persistence, and optional isolation behavior without
calling a deployed endpoint.

You have now followed one application lifecycle through command, HTTP, resolver,
and contract tests. The shared behavior and differing authority are both visible.
For actual live evidence, use the separate
[Admin UI](../how-to/prove-admin-ui.md) or
[JSON-RPC verification](../how-to/prove-json-rpc.md) guide on an approved target.
The [explanation](../explanation/explanation.md) discusses why these seams differ.
