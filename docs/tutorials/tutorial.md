# Follow a command through local tests

In this tutorial, you will follow the demo configuration lifecycle through its
shared dispatcher and two adapters. You will see the same saved prefix used by
both paths, then a deliberate difference in reset permission.

Use an installed checkout with dependencies available and Node.js 24, as described
in the [README](../../README.md#try-the-repository-locally). Run each command from
the repository root. This lesson uses local Vitest fixtures only: no deployed
app, credential, browser, or Forge provider configuration is needed.

## 1. Observe the configuration lifecycle

Run the adoption tests:

```sh
npm run test -- test/adoption.test.ts
```

The tests pass. Among them, a preview before setup returns `Not configured`.
A padded prefix is then trimmed, saved, and previewed, and reset clears it.
The preview returns the saved prefix followed immediately by the supplied text.

Open the first test in [the adoption tests](../../test/adoption.test.ts). Its
injected in-memory store is shared across calls, just as the runtime uses one
storage interface. No HTTP listener or browser is involved.

## 2. Follow the external adapter

In the same test file, the later tests exercise the web trigger. A request for
the wrong installation, or from a Jira user without `ADMINISTER`, is rejected
before command storage is accessed. An accepted request reaches the same
dispatcher and returns a serialized JSON-RPC response, but only for the methods
the catalog marks as web-exposed.

Open [the adopted adapter](../../src/adoption.ts) and follow how the web trigger
reaches the package dispatcher. The adapter constructs the trusted API caller;
that context does not come from the JSON request body.

## 3. Observe the UI path and its different authority

Run the official resolver integration tests:

```sh
npm run test -- test/resolver.test.ts
```

The tests pass. They use the resolver interface with local Forge API/KVS fixtures
and exercise the same storage as the web trigger. The resolver performs an as-user
admin permission check before dispatch. An authorized UI caller can confirm
reset, while the web trigger cannot reach it.

Open [the resolver](../../src/resolver.ts). The command call is shared;
the caller's verified authority is not. These fixtures demonstrate local
behavior, not an installed Jira session or UI rendering.

## 4. Connect execution to the written contract

Run the OpenRPC contract tests:

```sh
npm run test -- test/contract.test.ts
```

The tests pass. Open [the OpenRPC document](../reference/openrpc.json) and find
`config.reset`. It is in the catalog even though the web trigger does not
expose it.
The tests compare examples, schemas, and documented errors with runtime behavior.
The app's handler types and validators are generated from this document with
`npm run generate:rpc`.

You have now followed one application lifecycle through command, web trigger,
resolver, and contract tests. The shared behavior and differing authority are
both visible. For actual live evidence, use the
[Admin UI](../how-to/prove-admin-ui.md) guide on an approved target.
The [explanation](../explanation/explanation.md) discusses why these seams differ.
