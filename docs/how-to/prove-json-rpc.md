# How to prove it works via JSON-RPC

Use this guide to verify the path through the API.
You will explore
the deployed HTTP boundary,
configuration persistence,
and preview output.
Trace the requests from the web trigger
into the same commands used by the [Admin UI](prove-admin-ui.md).

Both transports use JSON-RPC envelopes internally.
Here, **via JSON-RPC** means sending them
as authenticated HTTP POST requests to the Forge web trigger,
rather than through Forge Bridge.
The demo operation simply joins a saved text prefix to sample text:
`demo:` plus `" hello"` (one leading space) produces `demo: hello`.
It does not change Jira issues or call a third-party API.

## Before you start

- Use an isolated development Jira installation,
  not a customer or production site.
  A configured default site is not approval.
- Review [release caveats](../../specs/deployed-poc-verification.md#release-caveats)
  and follow [repository configuration](../../DEVELOPMENT.md#configure-this-repositorys-variables).
  The committed [`secretspec.toml`](../../secretspec.toml)
  declares the required values;
  [Fence Rider documentation][fence-rider-docs]
  owns shared provider setup and diagnosis.
- Bind `shared_config` to non-secret
  `FORGE_SITE`, `FORGE_PRODUCT`, and `FORGE_ENVIRONMENT` controls.
  Bind `project_secrets` to an approved backend
  with project/profile isolation for `RPC_BEARER_SECRET`.
  Bind `project_config` to writable isolated non-secret storage for URLs
  and the test-write acknowledgement.
  Aliases belong in user-global `[defaults.providers]`.
- Use `npm run forge:deploy`,
  then `npm run forge:upgrade` for an existing installation
  or `npm run forge:install` for a new one.
  Review the resolved target first.
  The current manifest requires `storage:app` and `read:jira-work`;
  the latter supports the as-user admin permission lookup.
  Use the repository wrappers, not ad hoc Forge commands.
- Do not register another app,
  rotate credentials,
  or start a tunnel as part of verification.
  For unchanged runtime credentials,
  do not upload them again.
  The UI uses your Jira identity,
  not the HTTP bearer credential.
- Keep the bearer token in the approved SecretSpec provider/operator tool.
  It must match the active encrypted Forge runtime variable.

**Choose the order before writing:**
the full verifier requires no saved prefix and leaves `poc-😀` saved.
You can start with the Admin UI flow, then use its
[confirmed reset procedure](prove-admin-ui.md#reset-demo-configuration-for-another-verification-run)
on the approved test installation before this suite.
Reset deletes only the saved demo prefix, not the bearer credential or app install.
After resetting, capture the UI's empty/loading states and run the verifier
before saving again. Never reset a value you must retain; use read/preview
comparisons instead. The verifier does not reset automatically, and HTTP callers
cannot invoke `config.reset`, even with a valid token.

## Save or reuse the web-trigger URL

<!-- cspell:words webtrigger -->

Finish the [local verification settings](../../DEVELOPMENT.md#configure-deployed-verification)
first. Run from this repository's root with the app already deployed and installed,
and an authenticated Forge CLI account with administrator access
on the approved site:

```sh
npm run forge:webtrigger:upsert
```

The package script runs [`upsert-webtrigger.sh`](../../scripts/upsert-webtrigger.sh)
under `secretspec run --scope ''`, following Fence Rider's injection pattern.

### Upsert behavior

- If SecretSpec supplies a nonempty `RPC_VERIFY_URL`, reuse it immediately.
  No Forge lookup, HTTP probe, validation, or provider write is performed.
- Otherwise, call `forge webtrigger create --site "$FORGE_SITE"`
  `--product "$FORGE_PRODUCT" --environment "$FORGE_ENVIRONMENT"`
  `--functionKey config-rpc`, capturing its output privately.
  Accept exactly one bare HTTPS URL line and save it with
  `secretspec set --provider project_config --from-file - RPC_VERIFY_URL`.
  A creation or storage failure stops the flow;
  it never falls back to another target.

SecretSpec supplies the targets; no hostname, URL, or token needs to be copied into
shell environment assignments. `SECRETSPEC_FILE` and `SECRETSPEC_PROFILE`
select the same declaration/profile for reading and saving.
The default profile is `default`.
Fence Rider currently has no web-trigger subcommand, so this app-local script owns
that step. Continue using Fence Rider's repository wrappers for deploy/install.

The app identity comes from this checkout's `manifest.yml`.
Despite the flag name, `--functionKey` takes the **web-trigger module key**,
`config-rpc`, not the backing function key `rpc` or handler `index.run`.
Repeated Forge `create` calls for the same installation and module return the same
URL; they do not deploy or reinstall the app. Do not use `--readSecretKey`:
that enables Forge's separate signed-request mode, not this app's bearer check.

The upsert script reports whether it reused or saved a URL, but does not print it.
The deployed verifier consumes it automatically. For individual requests, configure
your approved HTTP client to consume the SecretSpec-resolved `RPC_VERIFY_URL` and
`RPC_BEARER_SECRET`, for example by launching that client under
`secretspec run --scope '' -- <client-command>` with tracing disabled.
The URL is a target, not a credential; requests still need the bearer header.
Keep full URLs out of committed files and shared evidence.

**A stored URL is trusted, not rediscovered.** If you switch app identity, site,
product, environment, or installation, deliberately clear the old saved URL with
`secretspec delete --provider project_config RPC_VERIFY_URL`, review the new
SecretSpec target, then run the upsert again. It does not detect stale URLs or
change targets automatically. For a separate target/profile, use isolated provider
storage rather than overwriting the primary URL.

For read-only isolation checks, store an approved second installation's URL as
`RPC_VERIFY_ISOLATION_URL` through `project_config`. Leave it empty when no second
installation is intended. The suite never creates or writes to a second installation.
See the Forge CLI [`webtrigger create` reference](https://developer.atlassian.com/platform/forge/cli-reference/webtrigger-create/).

## Trace HTTP execution in the checkout

Use this map when comparing responses with the code:

```text
Approved HTTP client -> POST web-trigger URL
  -> manifest config-rpc -> function rpc -> index.run
  -> handleHttp(event, runtime secret, store)
  -> HTTP method/media/size and bearer checks
  -> dispatch(body, { source: "api", authorized: true }, store)
  -> config.get / config.set / integration.preview -> Forge KVS
  -> JSON-RPC response -> HTTP 200 application/json
```

1. [`manifest.yml`](../../manifest.yml)
   wires the `config-rpc` v2 dynamic web trigger to function `rpc`,
   whose handler is `index.run`.
2. [`index.ts`](../../src/index.ts)
   passes the Forge request,
   runtime secret,
   and shared storage adapter to the HTTP boundary:

   ```ts
   return handleHttp(event, process.env["RPC_BEARER_SECRET"], store);
   ```

3. [`http.ts`](../../src/http.ts)
   accepts POST,
   one JSON content-type header,
   and at most 16,384 UTF-8 body bytes.
   It then requires a configured secret
   and exactly one syntactically valid Bearer header.
   It hashes the supplied and configured token
   to equal-size buffers and uses `timingSafeEqual`.
   Only after these checks does it call:

   ```ts
   const result = await dispatch(
     event.body ?? "",
     { source: "api", authorized: true },
     store,
   );
   ```

   This adapter constructs the caller context.
   A token authorizes an API test operator;
   it does not grant or impersonate a Jira admin identity.
   The UI's as-user `ADMINISTER` permission check is a different boundary.

4. [`commands.ts`](../../src/commands.ts)
   parses the body,
   validates the supported JSON-RPC envelope and caller,
   and dispatches to a registered method:
   - `config.get` reads storage
     and returns `{ configured, prefix }`.
     - `config.set` trims and validates `prefix`,
       persists it,
       and returns `{ configured: true }`.
       Read it back separately to verify persistence.
       - `integration.preview` validates `text`,
         reads the saved prefix,
         and returns `{ output: prefix + text }`;
         no separator is inserted and no text is saved.

5. [`store.ts`](../../src/store.ts)
   supplies the same `PrefixStore` adapter as the UI resolver,
   using `kvs.get`/`kvs.set` at `config.prefix`.
   Forge scopes storage to the installation;
   the request body does not choose a tenant.
6. `handleHttp` serializes the dispatch result into an HTTP 200 JSON response.
   Parse/protocol/command errors are JSON-RPC `error` objects
   inside that 200 response.
   Earlier HTTP-boundary rejections are non-200 plain text instead.

## Inspect individual JSON-RPC requests

Use an approved HTTP client with request/header logging and tracing disabled.
Configure the approved
URL,
POST,
`Content-Type: application/json`,
and one `Authorization: Bearer <token>` header through its secret facility.
`<token>` is a placeholder,
not a value to paste into source or a request file.
Inspect both HTTP status and JSON body;
HTTP 200 alone is not success.

The [OpenRPC contract](../reference/openrpc.json)
is the detailed request/error reference.
Each request needs exactly
`jsonrpc`,
`method`,
object `params`,
and an `id` that is a string or finite number.
This POC rejects
batches,
notifications,
positional parameters,
null IDs,
and extra envelope fields.

### Read the current configuration

Send this body;
it is safe to use for comparison on an already configured approved installation:

```json
{ "jsonrpc": "2.0", "method": "config.get", "params": {}, "id": "read" }
```

On an unused installation,
expect HTTP 200 with this JSON value
(object key order is immaterial):

```json
{
  "jsonrpc": "2.0",
  "id": "read",
  "result": { "configured": false, "prefix": null }
}
```

If already configured,
expect `configured: true` and the existing prefix.
Do not overwrite that value just to match a sample.
On an unused installation,
`integration.preview` with valid text returns `Not configured` (`-32002`).

### Save and read back, only with test-write approval

**Skip this manual save until after the full verifier
if using the same installation.**
It would make the verifier's initial-state check fail.
On an isolated installation approved for this write,
send:

```json
{
  "jsonrpc": "2.0",
  "method": "config.set",
  "params": { "prefix": "  demo:  " },
  "id": "save"
}
```

Expect HTTP 200 and:

```json
{ "jsonrpc": "2.0", "id": "save", "result": { "configured": true } }
```

Send `config.get` again as a separate request.
Expect:

```json
{
  "jsonrpc": "2.0",
  "id": "read",
  "result": { "configured": true, "prefix": "demo:" }
}
```

This proves trimming and a separate storage read.
The prefix must contain 1–64 Unicode code points after trimming;
it is non-secret demo text.
A lost or timed-out save reply does not prove the write failed:
read the configuration before deciding whether another write is appropriate.

### Preview the saved value

With `demo:` saved,
send:

```json
{
  "jsonrpc": "2.0",
  "method": "integration.preview",
  "params": { "text": " hello" },
  "id": "preview"
}
```

Expect HTTP 200 and:

```json
{ "jsonrpc": "2.0", "id": "preview", "result": { "output": "demo: hello" } }
```

The leading space belongs to `text`.
Empty text returns just `demo:`.
Text is preserved exactly,
including newlines and markup-like characters,
up to 2,000 Unicode code points.
If the verifier saved `poc-😀` or you retained another value,
substitute that saved prefix in the expected output,
not in the request.
A `prefix` override in preview params is invalid;
preview always reads storage.

For each result,
check the echoed ID and exactly one `result` or `error`.
An invalid parameter example,
independent of the saved prefix,
is:

```json
{
  "jsonrpc": "2.0",
  "method": "integration.preview",
  "params": { "text": "hello", "prefix": "override" },
  "id": "invalid"
}
```

Expect HTTP 200 with:

```json
{
  "jsonrpc": "2.0",
  "id": "invalid",
  "error": { "code": -32602, "message": "Invalid params" }
}
```

## Run the full deployed verifier

Use this for repeatable boundary and lifecycle evidence,
not just the three happy-path requests.
Reserve an approved installation with no saved prefix or concurrent operators.
If a prefix is saved, use the
[Admin UI reset](prove-admin-ui.md#reset-demo-configuration-for-another-verification-run)
with approval to discard it. Deploy this version before expecting Reset to appear.
The optional second installation must also be approved and have no saved prefix.

### Execute the suite

1. Review the SecretSpec target and
   [configure deployed verification](../../DEVELOPMENT.md#configure-deployed-verification).
   The selected profile must resolve development, Jira, a nonempty site,
   the existing bearer credential, and the stored test-write acknowledgement.
   Confirm the stored primary URL belongs to that installation independently;
   upsert trusts an available URL. The verifier still rejects URL syntax with
   embedded credentials, query parameters, or fragments before HTTP calls.
2. Optionally store `RPC_VERIFY_ISOLATION_URL` for a distinct approved installation
   with the same environment secret. It is read-only during this suite.
   Leave it empty when unavailable; isolation stays **unverified**.
3. With shell tracing disabled, run from the repository root:

   ```sh
   set +x
   npm run test:deployed
   ```

   The package script resolves the full profile through SecretSpec itself.
   Do not wrap it in another `secretspec run` or hand-export target/token values.
   [`test-deployed.sh`](../../scripts/test-deployed.sh) checks the stored
   development acknowledgement and Jira target before any URL creation,
   runs the URL upsert, and passes its URL to the verifier in the same process.
   No second invocation or shell export is needed when a URL was just saved.
   This command can create/store a missing URL, makes live HTTP calls,
   and attempts a test write; it does not deploy, install, or upload runtime values.
   The acknowledgement records operator intent; it does not grant permission
   or prove that the configured URL belongs to the approved target.

4. Save the sanitized JSON report in the approved evidence location.
   Exit 0 means the HTTP suite passed;
   exit 1 means preflight or a named check failed.
   Do not blindly rerun after a failure:
   inspect `configurationMayHaveChanged`
   and read current configuration first.
   A save may persist without a reply.
5. On success, leave `poc-😀` saved for the
   [Admin UI comparison](prove-admin-ui.md#5-compare-transports-and-record-the-result).
   The suite does not restore or reset configuration. After recording comparisons,
   use the confirmed Admin UI reset before another full run if approved.
   Record its actual observations before proceeding with any other test writes.

### Check what the runner actually proved

`npm run test:deployed` resolves SecretSpec, runs
[`test-deployed.sh`](../../scripts/test-deployed.sh),
and runs the primary URL upsert.
Setup messages go to stderr and omit resolved URLs/credentials; a setup failure
exits before the JSON report. Once setup succeeds,
[`run.ts`](../../test/deployed/run.ts) invokes
[`verifyDeployed`](../../test/deployed/verify.ts)
with real `fetch`,
prints the sanitized report,
and selects the exit code.
The verifier never imports Forge or calls `dispatch` directly:
every probe uses the deployed HTTP path above.
[`deployed.test.ts`](../../test/deployed.test.ts)
instead injects a local adapter
and in-memory stores;
passing that test is not live acceptance.

#### Boundary and lifecycle checks

- Unset configuration before attempting writes,
  and an optional second installation's initial unset state.
- Absent, incorrect, malformed, and combined duplicate credentials (HTTP 401);
  wrong verb (405), wrong media type (415), and oversized body (413).
- Malformed JSON, unsupported request forms, unknown methods, invalid params,
  and preview before setup, checking exact sanitized JSON-RPC errors.
- Save of `poc-😀` padded with two spaces on each side,
  separate read-back of `poc-😀`,
  exact/empty/Unicode preview output,
  and rejection of over-limit text.
- An authenticated HTTP `config.reset` request is forbidden, followed by a read
  confirming that the saved prefix is unchanged. Reset is an Admin UI operation.
- If supplied,
  the second installation remains unset
  and its preview still reports not configured
  after the primary installation's save.

Each request has a 20-second timeout,
rejects redirects,
and limits response bodies to 32 KiB.
The suite stops at the first failure without retries.
It compares exact JSON values,
rejecting unexpected error data/stack traces,
and checks headers/bodies for the supplied and deliberately invalid credentials.
Fetch combines duplicate header values;
distinct duplicate header lines
remain local [`http.test.ts`](../../test/http.test.ts) coverage,
not a live-suite claim.

Read these report fields before declaring success:

| Field                         | Meaning                                                                           |
| ----------------------------- | --------------------------------------------------------------------------------- |
| `status` and `checks`         | Overall result and each attempted named check, with elapsed milliseconds.         |
| `checks[].message`            | Static guidance on a failed preflight setting; never its supplied value.          |
| `startedAt` / `elapsedMs`     | Run timestamp and total measured duration.                                        |
| `configurationMayHaveChanged` | True once a save is attempted, even if its reply fails. Not a rollback guarantee. |
| `isolation`                   | Verified only if the optional second-installation checks pass.                    |
| `ui`                          | Always unverified; this runner cannot inspect the installed UI.                   |

## Record evidence and investigate failures

Record approved app/site/environment/installation identity,
source revision and Forge version,
operator/date,
setup effort,
exit status,
report,
timings,
discrepancies,
and unavailable checks
in the [verification record](../../specs/deployed-poc-verification.md).
The JSON report intentionally omits
URLs,
credentials,
response bodies,
raw exceptions,
and target identity;
record target metadata separately without the full trigger URL.

### Diagnose by boundary

- **Setup failed before a JSON report:** read the script's static stderr guidance.
  Correct SecretSpec provider/target/acknowledgement resolution, Forge authentication,
  or `project_config` write access as indicated. If Forge obtained a URL but storage
  failed, fix the provider then rerun; Forge returns the same context's URL.
  Neither the app verifier nor its test writes ran.
  A URL may already have been created.
- **`preflight` failed:** the verifier made no HTTP request and did not inspect
  configuration. Read `checks[].message` for the first failing setting. Correct
  it in SecretSpec, not by exporting shell values. An invalid cached URL needs
  deliberate clearing followed by upsert; empty `RPC_VERIFY_ISOLATION_URL` disables
  isolation checks. Never print the secret to diagnose it. The report's
  `configurationMayHaveChanged` is false;
  earlier URL setup is not an app-config write.
- **`config.get unset` failed:** preflight passed and the first HTTP read did not
  match the expected unset response. If the UI has a saved prefix, this is the
  expected initial-state failure. Confirm target and authentication too; the
  sanitized report does not expose the response. With test-reset approval, reset
  through Configure, wait for read-back confirmation, and retry before saving.
  This check occurs before the verifier's writes, not before its HTTP calls.
- HTTP 401: the bearer credential is absent, invalid, malformed, or duplicated.
- HTTP 503: the runtime secret is missing. Follow approved provisioning;
  do not print it or rotate it as a speculative fix.
- HTTP 405/415/413: correct the method, content type, or UTF-8 body size.
- HTTP 200 with `error`: inspect the JSON-RPC code against the OpenRPC contract.
  `-32002` means no prefix is saved;
  `-32602` means invalid command params.
- A transport failure or uncertain save:
  stop, check configuration, and retain the failed named check.
  Do not treat a timeout as an automatic safe retry.

Reload Status/Configure on the same primary installation
and compare the saved prefix and exact preview output,
following the [Admin UI guide](prove-admin-ui.md).
Inspect deployed backend logs and browser console
through approved tools for credential/exception exposure;
never attach raw sensitive logs.
A green HTTP report cannot prove log secrecy,
installed UI rendering,
authorization for future Jira operations,
or a third-party integration.
Mark unavailable checks **unverified**,
not inferred passes.
Ordinary `npm run test` and `npm run check` never call the live entry point,
even with verifier environment variables set.

For architectural rationale,
see [Why commands sit between transports and behavior](../explanation/explanation.md).
The [historical configuration validation record](../../specs/secretspec-validation.md)
is earlier tooling evidence,
not a current provider or live acceptance report.

[fence-rider-docs]: https://github.com/ibuchanan/ranch-rig-fence-rider#documentation
