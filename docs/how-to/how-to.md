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

[fence-rider-docs]: https://github.com/ibuchanan/ranch-rig-fence-rider#documentation
