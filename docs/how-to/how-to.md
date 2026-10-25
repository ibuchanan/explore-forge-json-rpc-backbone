# Configure and operate this Forge app

Use the [Fence Rider documentation][fence-rider-docs] for shared user-provider
setup, app-secret provisioning, provider diagnosis, and configured Forge
workflows. Those guides are maintained upstream rather than duplicated here.

## Apply this app's configuration

- Use the committed [`secretspec.toml`](../../secretspec.toml) as the declaration
  of required values and scopes.
- Bind `shared_config` to shared non-secret settings for `FORGE_SITE`,
  `FORGE_PRODUCT`, and `FORGE_ENVIRONMENT`.
- Bind `project_secrets` to an approved backend with project/profile isolation
  for `RPC_BEARER_SECRET`. Do not use plaintext storage or config fallbacks.
- Define these aliases in user-global `[defaults.providers]`, not the project's
  `[providers]` table. Follow the [setup instructions](../../DEVELOPMENT.md#configure-this-repositorys-variables)
  to bind aliases, reuse existing values, and verify resolution.
- Use the `forge:*` and `lint:check:forge` scripts in
  [`package.json`](../../package.json) from the repository root. Upload runtime
  values with `forge:variables:set` when they change; `forge:deploy` does not
  upload them. Review the target and obtain approval before remote changes.
- Run the checks listed in [development guidance](../../DEVELOPMENT.md).

The [historical validation record](../../specs/secretspec-validation.md)
captures the original local checks and their limits; it is not a current
upstream validation report.

## Verify the installed admin page

Use an isolated development Jira installation. These are post-approval manual
checks, not evidence of a completed deployment or an installed-UI pass.

### Acceptance steps

1. Obtain approval for the registered app, development environment, Jira site,
   deployment, and installation upgrade. Review the configured target using
   the [development guidance](../../DEVELOPMENT.md). Use `bun run forge:deploy`,
   then `bun run forge:upgrade` for an existing installation, or
   `bun run forge:install` for a new one. The manifest adds `read:jira-work` for
   the as-user admin permission lookup; an existing installation must consent.
   Do not register another app, change the bearer secret, or start a tunnel
   as part of these checks.
2. As a Jira administrator, open **JSON-RPC configuration** in Jira settings
   under Marketplace apps. On an unused installation, expect **Not configured**,
   an empty Prefix field, and disabled **Run preview**. On an already configured
   installation, expect its existing saved value; do not reset it to force
   an empty-state test. Observe loading feedback before either form is enabled.
3. Enter `demo` with two spaces before and after as Prefix and choose **Save**.
   Expect **Prefix saved** only after read-back, **Configured**, and a field
   containing `demo`. Reload and confirm that the saved value remains.
4. Enter one space followed by `hello` in Preview text and choose **Run preview**.
   Expect exactly
   `demo hello`. Try multiline text, empty text, and literal `<b>text</b>`;
   whitespace must be preserved and markup must not be interpreted. Edit Prefix
   without saving and run again: output must still use `demo`. Editing preview
   text or successfully saving a different prefix must clear old output.
5. Try a blank/whitespace-only prefix and 65 emoji, then a preview of 2,001 emoji.
   Expect field errors without a write or preview. A trimmed 64-emoji prefix and
   2,000-emoji preview are valid. While a request is pending, verify that inputs
   and action buttons are disabled and repeated clicks do not duplicate saves.
6. With approved failure injection or revoked admin access, confirm sanitized,
   actionable errors rather than credentials, stack traces, or raw exceptions.
   Initial-load failures offer **Retry**. If Save succeeds but read-back fails,
   expect an explicit saved-but-verification-failed message, not a success banner.
   Restore access before retrying. Do not change production permissions to test.
7. Compare the saved value and exact preview output with authenticated HTTP calls
   using the [OpenRPC contract](../reference/openrpc.json) on the **same approved
   installation**. Keep the bearer credential in an approved operator tool;
   never paste it into the page or capture it in evidence. Record browser,
   environment, target, observations, and any failures. Mark checks unavailable
   without safe failure injection or a second caller as **unverified**.

## Verify the deployed HTTP lifecycle

Run this only after explicit approval for the registered app, development Jira
site, installation, and test writes. The runner cannot establish from a URL
that an installation is developmental or approved. Do not use a customer site.

### HTTP acceptance steps

1. Review the dependency-audit caveat in the
   [verification record](../../specs/deployed-poc-verification.md). Complete
   approved provisioning through the repository's `forge:*` scripts as described
   above. Confirm the web trigger belongs to that app, environment, and
   installation; confirm no tunnel is running. Do not register a new app.
2. Reserve an unused, isolated installation with no concurrent operators. Capture
   the UI's empty/loading states **before** running HTTP checks: the suite saves
   configuration, so a later UI check cannot establish the initial empty state.
   The suite refuses an already-configured installation; do not delete data or
   uninstall to bypass that guard. There is no reset command.
3. Set `RPC_VERIFY_URL` to the approved HTTPS web-trigger URL in your operator
   environment. URLs with credentials, query parameters, or fragments are rejected.
   Optionally set `RPC_VERIFY_ISOLATION_URL` to a **second approved, unused
   development installation** of the same app with the same environment secret.
   That installation is read-only during this suite. Omit the variable when no
   second installation is available; isolation then remains **unverified**.
4. Keep the existing bearer credential in the approved SecretSpec provider; do
   not print it, set it as a command-line argument, or save it in a plaintext
   file. With shell tracing disabled, run from the repository root:

   ```sh
   set +x
   RPC_VERIFY_APPROVED=development SECRETSPEC_PROFILE=default \
     secretspec run --scope '' -- bun run test:deployed
   ```

   The resolved profile must specify `FORGE_ENVIRONMENT=development`,
   `FORGE_PRODUCT=jira`, a nonempty `FORGE_SITE`, and `RPC_BEARER_SECRET`. Review
   these non-secret target settings against the approved URL before opting in.
   Setting `RPC_VERIFY_APPROVED` is an operator acknowledgement, not approval
   discovery. This command performs HTTP calls, not deployment or secret upload.
5. Save the JSON report in your approved evidence location. Exit 0 means the
   HTTP checks passed; exit 1 means preflight or a named check failed. The report
   records per-check and total elapsed milliseconds without URLs, credentials,
   response bodies, or raw exceptions. It does not contain target identity:
   record the approved site, app, environment, installation and source revision
   separately, without the bearer credential or full trigger URL.
6. On failure, stop and investigate the named check. Requests have a 20-second
   timeout, redirects are rejected, responses are capped at 32 KiB, and the
   suite stops at the first failure without retries. If
   `configurationMayHaveChanged` is true, a save was attempted and may have
   persisted even if its reply failed. The suite deliberately leaves `poc-😀`
   saved for the subsequent UI comparison; it does not restore or reset data.
   Do not blindly rerun it against the now-configured installation.
7. On the same primary installation, reload the admin page and compare its saved
   prefix and exact preview output with HTTP. Then complete the remaining
   [manual UI checks](#verify-the-installed-admin-page), including save and error
   states. Review deployed backend logs and the browser console through approved
   tools for credential/exception exposure; never attach raw sensitive logs.
8. Complete the [verification record](../../specs/deployed-poc-verification.md):
   setup effort, runtimes, failures, discrepancies, unavailable checks, and the
   decision. Mark installed UI, logs, authorization for real operations, and any
   unavailable isolation/failure injection as **unverified**, not inferred passes.

The opt-in runner checks absent, invalid, malformed, and combined duplicate
credentials; verb/media/body limits; malformed and unsupported JSON-RPC forms;
unknown methods and invalid params; unset configuration and preview; then save,
read-back, and exact/empty/Unicode preview output in separate requests. Fetch
combines duplicate header values; distinct duplicate header lines remain local
HTTP-adapter coverage, not a deployed-runner claim. Exact response comparisons
reject extra error data and stack traces. A green report cannot prove that no
secret was written to server logs, that UI Kit renders correctly, or that any
third-party API works. Ordinary `bun run test` and `bun run check` never invoke
the live entry point, even if these environment variables are set.

[fence-rider-docs]: https://github.com/ibuchanan/ranch-rig-fence-rider#documentation
