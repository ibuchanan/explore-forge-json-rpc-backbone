# How to prove it works from the Admin UI

Use this guide to verify the installed Jira admin screens, saved configuration,
and preview output. You will also trace each action from UI Kit through the
resolver into the shared commands. For the external transport, use
[How to prove it works via JSON-RPC](prove-json-rpc.md).

The **prefix** is arbitrary demo text placed before other text. It is not a
Jira project key, connection URL, or credential. Saving `demo:` and previewing
a space followed by `hello` produces `demo: hello`. This deliberately small
operation lets you verify persistence and shared execution without changing
Jira issues or calling an external service.

## Before you start

- Use an isolated development Jira installation, not a customer or production
  site. Obtain approval for the registered app, target, deployment, installation
  changes, and test writes. A configured default site is not approval.
- Follow [repository configuration](../../DEVELOPMENT.md#configure-this-repositorys-variables)
  for SecretSpec provider bindings and target controls. Use the committed
  [`secretspec.toml`](../../secretspec.toml), not copied credential values.
  Shared provider setup and diagnosis live in the
  [Fence Rider documentation][fence-rider-docs].
- Review the [release caveats](../../specs/deployed-poc-verification.md#release-caveats)
  and run `bun run check` from the repository root. Local tests are not evidence
  that the installed UI renders correctly.
- With approval, use `bun run forge:deploy`, then `bun run forge:upgrade` for an
  existing installation or `bun run forge:install` for a new one. Review the
  resolved target first. The current manifest requires `storage:app` and
  `read:jira-work`; the latter supports the as-user admin permission lookup.
  Use the repository wrappers, not ad hoc Forge commands.
- Do not register another app, rotate credentials, or start a tunnel as part of
  verification. For unchanged runtime credentials, do not upload them again.
  The UI uses your Jira identity, not the HTTP bearer credential.

**If you plan to run the full deployed HTTP verifier on this installation:**
first observe and record the UI's empty/loading states, without saving. Then
run the [HTTP suite](prove-json-rpc.md#run-the-full-deployed-verifier). It requires
an unused installation and leaves `poc-😀` saved. Afterward, compare that value
in the UI before making further changes. There is no reset command; do not delete
configuration or uninstall to manufacture an empty state.

## 1. Check the three entry points

1. As a Jira administrator, open **JSON-RPC status** under Marketplace apps
   in Jira settings. Expect a loading indicator followed by the installation's
   configuration state.
2. Choose **Get started**. Also open it through the app's **Get started** button
   in **Manage apps**, to verify the manifest's onboarding entry point.
3. Choose **Configure**. Verify that **Configure** in **Manage apps** opens the
   same form. Navigation buttons should open their named screens.
4. Confirm Jira supplies each page title only once. The content should explain
   the demo and define Prefix and Preview text before asking you to use them.

On an unused installation, expect **Not configured**, a **Setup needed** warning,
an empty Prefix field, and disabled **Run preview**. Get started should show
**Action needed** for saving configuration and **Verify manually** for preview.

On a configured installation, expect a green **Configured** badge and
**Configuration verified** message, the existing value on Configure and Status,
and **Complete** for the configuration checklist step. Preview must still say
**Verify manually**: storing a value does not prove a preview has run.

**Configuration verified means a saved value was read successfully.** It is not
an HTTP authentication, connectivity, or third-party integration check. Failed
reads must show an error, not a successful or empty configuration result.

## 2. Save a value and prove it persists

Only change configuration on the approved test installation. If an existing
value must be retained, use it for read/preview checks and mark save/normalization
checks unverified rather than overwriting it.

### Save and reload

1. On Configure, enter `demo:` with two spaces before and after in **Prefix**.
2. Choose **Save** once. While pending, expect disabled inputs/actions and a
   saving indicator. Repeated clicks must not duplicate the save.
3. Expect **Prefix saved** only after the app reads the value back. The field
   should contain `demo:`, without the surrounding spaces.
4. Reload the page. The value should still be `demo:`.
5. Open **Status** and choose **Refresh**. Expect the same literal saved prefix
   and green configured feedback, with no editable fields.
6. On **Get started**, choose **Refresh checks**. Configuration should be
   **Complete**, while preview remains **Verify manually**.

If you started with the HTTP suite, first confirm its saved value is `poc-😀`.
Complete the cross-transport comparison below before replacing it with `demo:`.

### Trace the save in code

Follow this path in the checkout being deployed:

```text
Configure form -> App.save -> rpc("config.set", { prefix })
  -> Forge Bridge invoke("rpc", JSON-RPC envelope)
  -> resolver.rpc -> Jira ADMINISTER permission check
  -> dispatch(payload, { source: "ui", authorized }, store)
  -> config.set -> store.set -> Forge KVS
  -> result returns along the same path
  -> App.save calls config.get to verify read-back
```

1. [`manifest.yml`](../../manifest.yml) connects each admin module's resource to
   `config-resolver`, whose handler is `resolver.handler`. The three frontend
   entry points render the same [`App`](../../src/frontend/App.tsx) with
   different screen selections.
2. In `App`, the prefix form validates input, then `save` calls
   `rpc("config.set", { prefix })`. Save subsequently calls `config.get` before
   displaying success; an accepted write and failed read-back are distinct.
3. [`client.ts`](../../src/frontend/client.ts) constructs the request with a
   unique sequence ID and sends it through the Bridge resolver named `rpc`:

   ```ts
   const response = await invoke("rpc", {
     jsonrpc: "2.0",
     method,
     params,
     id,
   } as RpcRequest);
   ```

   `rpc` is the resolver name; `config.set` is the command inside its payload.
   The client checks the response version and matching ID, then returns the
   result or raises a failure that the UI converts to sanitized guidance.
4. [`resolver.ts`](../../src/resolver.ts) requires a server-provided account ID
   and checks Jira's `ADMINISTER` permission using `api.asUser()`. A denied or
   failed permission check leaves `authorized` false. Its final call is:

   ```ts
   return dispatch(payload, { source: "ui", authorized }, store);
   ```

   The browser cannot supply its own trusted caller context. Merely hiding the
   admin page is not the authorization boundary.
5. [`commands.ts`](../../src/commands.ts) validates the JSON-RPC envelope and
   caller, then selects `config.set`. That command trims and validates the
   prefix, calls `store.set(prefix)`, and returns `{ configured: true }`.
   [`store.ts`](../../src/store.ts) maps that write to
   `kvs.set("config.prefix", prefix)` in installation-scoped Forge storage.

To prove a reload is not just reading React state, match the saved value after
reloading and again on Status. To prove the external transport shares that
store, use the same installation in the JSON-RPC comparison below.

## 3. Run a preview and check exact output

### Preview checks

1. Return to Configure with `demo:` saved, or use the existing saved value.
   In **Preview text**, enter one space followed by `hello`.
2. Choose **Run preview**. Expect **Preview output** to be exactly `demo: hello`.
   The app adds no separator: the space comes from your sample, not the prefix.
3. Preview an empty string. Expect only `demo:`. Try multiline text and literal
   `<b>text</b>`; preserve whitespace and render markup as text, not HTML.
4. Edit Prefix without saving, then preview again. The result must still use
   the previously saved prefix. Preview reads storage, not the draft form value.
5. Edit Preview text or successfully save a different prefix. Old output must
   clear so it cannot be mistaken for the new result.

The preview form calls `rpc("integration.preview", { text })` through the same
client, resolver, and dispatcher used for Save. In
[`commands.ts`](../../src/commands.ts), the command validates `text`, reads the
current prefix, rejects missing configuration, and returns:

```ts
return { output: prefix + text };
```

The command does not persist the sample or output. `App.preview` stores the
returned output in React state and displays it as a plain-text `CodeBlock`.
The only Jira product API call in this UI request path is the permission check;
there is no Jira issue update or third-party API operation.

## 4. Check validation and failure feedback

Use approved test inputs and safe failure injection only.

### Validation checklist

- A blank/whitespace-only prefix and 65 emoji must fail field validation. A
  trimmed 64-emoji prefix is valid; length counts Unicode code points.
- A preview of 2,001 emoji must fail; 2,000 emoji and empty text are valid.
  Invalid form submissions must not invoke their command.
- Pending requests disable overlapping actions. Loading and saving must not
  display a stale successful configuration check.
- A failed initial read or refresh must show sanitized, actionable errors and
  **Retry**. Status/Get started must hide prior readiness/checklist success.
- A successful save followed by a failed read-back must report that the value
  was saved but verification failed, not show a success banner. Do not assume
  the write rolled back; retry the read before deciding what to do next.
- With an approved non-admin caller or safely revoked test access, expect denial
  and no cached saved prefix/output. Restore access before retrying. Never
  modify production permissions just to create this condition.
- A navigation failure must report a sanitized error rather than silently fail.
  Review the browser console and deployed backend logs with approved tooling;
  do not attach credentials, raw exceptions, or sensitive logs to the evidence.

The corresponding local coverage is in [`ui.test.tsx`](../../test/ui.test.tsx),
[`resolver.test.ts`](../../test/resolver.test.ts), and
[`admin-wiring.test.tsx`](../../test/admin-wiring.test.tsx). Passing mocks is not
an installed-rendering pass; mark checks lacking safe injection **unverified**.

## 5. Compare transports and record the result

On the **same app, environment, and installation**, use the
[JSON-RPC read and preview requests](prove-json-rpc.md#inspect-individual-json-rpc-requests)
with the current saved prefix and exactly the same sample text. Expect matching
saved values and byte-for-byte equal output. Never paste the bearer credential
into the admin page or include it in screenshots.

Record the source revision/Forge version, app/environment/site/installation,
operator/date/browser, initial state, save/read-back/reload observations, exact
preview comparisons, validation/error outcomes, and elapsed time. Record
failures and discrepancies, not just the final successful attempt. Use the
[verification record](../../specs/deployed-poc-verification.md); leave unavailable
checks **unverified**. A UI pass alone does not prove HTTP authentication,
installation isolation, or a real integration works.

For the design rationale beyond this execution trace, see
[Why commands sit between transports and behavior](../explanation/explanation.md).

[fence-rider-docs]: https://github.com/ibuchanan/ranch-rig-fence-rider#documentation
