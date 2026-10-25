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

[fence-rider-docs]: https://github.com/ibuchanan/ranch-rig-fence-rider#documentation
