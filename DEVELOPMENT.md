# Development

Install dependencies with `npm install`. Forge wrappers also require Bun
1.4.3+, SecretSpec 0.21.1+, and an authenticated Forge CLI on `PATH`.
The `fence-rider` development dependency is installed from GitHub.
Use the [Fence Rider documentation][fence-rider-docs] for the shared workflow
and provider background. The instructions below apply its
[local controls][fence-rider-local] and [runtime variables][fence-rider-runtime]
guides to this repository's names and package scripts.

## Configure this repository's variables

Run configuration commands from the repository root. The committed
[`secretspec.toml`](secretspec.toml) declares project
`explore-forge-json-rpc-backbone` and profile `default`. Keep that project name
stable: providers such as the keyring namespace values by project and profile.
Do not put credential values in the declaration or commit them anywhere.

| Variable            | Provider alias    | Requirement                                        |
| ------------------- | ----------------- | -------------------------------------------------- |
| `FORGE_SITE`        | `shared_config`   | Required installation hostname, without `https://` |
| `FORGE_PRODUCT`     | `shared_config`   | Installation product; defaults to `jira`           |
| `FORGE_ENVIRONMENT` | `shared_config`   | Local Forge target; defaults to `development`      |
| `RPC_BEARER_SECRET` | `project_secrets` | Required bearer token for this app's web trigger   |

Only `RPC_BEARER_SECRET` belongs to `[scopes.runtime]`. The `FORGE_*` controls
are never uploaded. This app has no `manifest` scope. A SecretSpec profile is
not a Forge environment; keep profile `default` for these examples and review
`FORGE_ENVIRONMENT` separately.

### Set shared non-secret controls

Define `shared_config` in user-global SecretSpec configuration. If you already
use `user_dotenv`, bind the new alias to the same URI and existing file; do not
copy or reset its values. For a new non-secret settings file:

```sh
mkdir -p ~/.config/secretspec
secretspec config global provider add shared_config \
  'dotenv:~/.config/secretspec/user.env'
```

The filename can be different; the committed app config depends on the alias,
not the path. In user-global TOML, aliases belong under `[defaults.providers]`.
Do not define these aliases in the app's `[providers]` table: project aliases
override developers' bindings. This app needs only `shared_config` and
`project_secrets`, not the unused `project_config` or `shared_secrets` roles.

Set the site at the prompt and, if needed, override the product or environment:

```sh
secretspec set --provider shared_config --profile default FORGE_SITE
secretspec set --provider shared_config --profile default FORGE_PRODUCT jira
secretspec set --provider shared_config --profile default FORGE_ENVIRONMENT development
```

Use your authorized site hostname, for example `example.atlassian.net`. Skip
writes for existing values you intend to keep. Product and environment use
the declaration defaults when absent. These settings are shared across
participating projects: changing them can change other apps' default targets.
The dotenv file is plaintext; store no bearer tokens in it.

### Set the app's bearer credential

`RPC_BEARER_SECRET` explicitly selects `project_secrets`; the user's default
provider no longer determines its destination. Bind that alias to an approved
secret backend, not dotenv. For an approved OS-keyring setup:

```sh
secretspec config global provider add project_secrets 'keyring://'
```

Use your approved vault's URI and authentication instead if appropriate. No
global default change is needed. The alias is a contract, not enforcement:
verify that the backend isolates values by project and profile. The default
keyring convention does; another backend may need reference templates. Never
add a config/dotenv fallback for a secret. Avoid blanket `SECRETSPEC_PROVIDER`
overrides that redirect this mixed profile.

If the credential already exists, bind the alias to its current backend and
check resolution before setting anything. Different alias-specific references
or backend coordinates may require a controlled migration; do not regenerate
or upload a token just because an alias changed.

To provision an existing credential, enter it yourself in a trusted terminal:

```sh
secretspec set --provider project_secrets --profile default RPC_BEARER_SECRET
```

For a new credential or an approved rotation, generate 32 random bytes as a
64-character hexadecimal token and pass it directly on stdin. Run in Bash:

```sh
set -o pipefail
set +x
openssl rand -hex 32 | tr -d '\n' |
  secretspec set --provider project_secrets --profile default \
    --from-file - RPC_BEARER_SECRET
```

Choose one method, not both. Verify the `project_secrets` binding first; the
pipeline writes wherever that alias points. Stop on any error. If OpenSSL reports
provider/configuration errors, fix the executable/configuration mismatch
before retrying; do not disable approved crypto policy to suppress the error.
Do not print the token, put it in `.env`, or pass it as a command argument.
Do not regenerate it on routine deployments. Coordinate rotations with API
operators, who must send the matching `Authorization: Bearer` credential;
share it only through an approved secret channel.

### Verify resolution and activate the runtime value

Check the full profile and selected runtime names without printing values:

```sh
secretspec check --profile default --scope '' --explain
secretspec check --profile default --scope runtime --json
SECRETSPEC_PROFILE=default bun run fence-rider doctor --resolve
```

These commands may access the provider or request authentication. Expect all
four declarations in the full-profile report and only `RPC_BEARER_SECRET` in
the runtime report. Even `lint:forge` resolves required runtime values; fix a
missing token rather than weakening the declaration or bypassing the wrapper.
Do not use `get`, `export`, or environment dumps to debug real secret values.

Storing the token locally does not provision Forge. With explicit approval for
the registered app and development environment, upload and deploy:

```sh
SECRETSPEC_PROFILE=default bun run forge:variables:set --environment development &&
  SECRETSPEC_PROFILE=default bun run forge:deploy --environment development
```

Use the same target for both commands. `forge:variables:set` uploads only the
runtime token, encrypted; `forge:deploy` never uploads values. A changed Forge
variable becomes active after deployment. For code-only changes with an
unchanged token, omit the upload. Do not copy the upstream generic script names
into commands here: this repository uses the `forge:*` names in `package.json`.

## Run repository checks

Run the checks before sending a pull request:

```sh
npm run lint
npm run lint:docs
npm run format:check
npm run typecheck
npm run test
```

Shared tooling validation is documented upstream. This app no longer includes
`scripts/check-secretspec.sh`; do not run that removed local command.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the contribution process.

## Repository layout

- `.atlassian/`: Repository ownership metadata.
- `src/`: TypeScript source code.
- `docs/`: Diataxis guides, reference, explanations, and tutorials.
- `specs/`: Specifications and reference material; excluded from Biome checks.
- `dist/`: Build output; ignored by Git and excluded from Biome checks.
- `test/`: Forge app tests (Vitest) and optional evaluations.

[fence-rider-docs]: https://github.com/ibuchanan/ranch-rig-fence-rider#documentation
[fence-rider-local]: https://github.com/ibuchanan/ranch-rig-fence-rider/blob/main/docs/how-to/local.md
[fence-rider-runtime]: https://github.com/ibuchanan/ranch-rig-fence-rider/blob/main/docs/how-to/runtime.md
