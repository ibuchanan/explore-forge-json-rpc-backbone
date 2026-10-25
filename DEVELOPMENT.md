# Development

<!-- cspell:words webtrigger openrpc -->

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

| Variable                   | Provider alias    | Requirement                                                   |
| -------------------------- | ----------------- | ------------------------------------------------------------- |
| `FORGE_SITE`               | `shared_config`   | Required installation hostname, without `https://`            |
| `FORGE_PRODUCT`            | `shared_config`   | Installation product; defaults to `jira`                      |
| `FORGE_ENVIRONMENT`        | `shared_config`   | Local Forge target; defaults to `development`                 |
| `RPC_BEARER_SECRET`        | `project_secrets` | Required bearer token for this app's web trigger              |
| `RPC_VERIFY_URL`           | `project_config`  | Primary URL saved by upsert; defaults to empty                |
| `RPC_VERIFY_ISOLATION_URL` | `project_config`  | Optional read-only second installation URL; defaults to empty |

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
override developers' bindings. This app uses `shared_config`, `project_config`,
and `project_secrets`; it does not use `shared_secrets`. Configure `project_config`
for the verifier as described below, even when its optional URL values are empty.

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
64-character hexadecimal token and pass it directly on stdin. Choose **one**
of the following generators. Run the pipeline in Bash with `pipefail` and
shell tracing disabled. Verify the `project_secrets` binding first: the
pipeline writes wherever that alias points.

#### Apple system LibreSSL

On macOS, use `/usr/bin/openssl` explicitly. If an inherited `OPENSSL_CONF`
points at an OpenSSL 3/4 configuration, Apple's LibreSSL cannot load its
`providers` module. Remove that override for the generator invocation only:

```sh
set -o pipefail
set +x
env -u OPENSSL_CONF /usr/bin/openssl rand -hex 32 | tr -d '\n' |
  secretspec set --provider project_secrets --profile default \
    --from-file - RPC_BEARER_SECRET
```

`env -u` leaves your shell and SecretSpec's environment unchanged; LibreSSL
uses its own default configuration. It does not force an empty config with
`OPENSSL_CONF=/dev/null`. If your organization requires the inherited crypto
configuration, use a compatible approved Homebrew executable instead; do not
bypass that policy.

#### Homebrew OpenSSL 3 or 4

Select an installed formula by its prefix rather than assuming `openssl` on
`PATH` is Homebrew's. Use `openssl@3` below, or replace it with `openssl@4`:

```sh
set -o pipefail
set +x
openssl_prefix=$(brew --prefix openssl@3) &&
  "$openssl_prefix/bin/openssl" rand -hex 32 | tr -d '\n' |
    secretspec set --provider project_secrets --profile default \
      --from-file - RPC_BEARER_SECRET
```

`brew --prefix` works with both Apple Silicon and Intel Homebrew locations.
This option retains `OPENSSL_CONF`; it must match the selected OpenSSL
version and installed provider modules. Check the executable without generating
a token with `"$(brew --prefix openssl@3)/bin/openssl" version` (or
`openssl@4`). If configuration errors persist, correct the executable/config
pair rather than globally clearing crypto settings.

On other platforms with a correctly configured OpenSSL on `PATH`, the generator
can simply be `openssl rand -hex 32` in the same stdin pipeline. Stop on any
error; do not upload or deploy after a failed generation or write.
Do not print the token, put it in `.env`, or pass it as a command argument.
Do not regenerate it on routine deployments. Coordinate rotations with API
operators, who must send the matching `Authorization: Bearer` credential;
share it only through an approved secret channel.

### Configure deployed verification

Bind `project_config` to writable non-secret storage isolated to this app and
profile. If that alias already exists, verify its addressing instead of replacing
it. For a new binding, Fence Rider's local-config convention uses a per-project
ignored dotenv file:

```sh
secretspec config global provider add project_config 'dotenv:.env'
```

`.env` is already ignored by this repository. Ensure the relative path resolves
to this app's file when running from its root. Use profile-aware backend references
or separate files if you need multiple targets; a plain dotenv file does not
isolate profiles by itself. Never store `RPC_BEARER_SECRET` in this config backend.
Shared alias definitions remain in the operator's global SecretSpec configuration,
not the committed project declaration.

The verifier's inputs live in SecretSpec, not shell assignments. The URL fields
are optional and default to empty. Review the selected isolated **development Jira**
installation before each run. Running `test:deployed` explicitly starts the live
suite, which requires no saved demo prefix and leaves `poc-😀` saved.
There is no separate approval setting and no automatic reset or restoration.

After deployment and installation, use:

```sh
npm run forge:webtrigger:upsert
npm run test:deployed
```

Both scripts resolve the full selected SecretSpec profile, like Fence Rider's
existing wrappers; do not add an outer `secretspec run`. `test:deployed` also calls
upsert, so the first command is optional. A stored primary URL is assumed valid
without a Forge lookup. When absent, upsert obtains it through
`forge webtrigger create` and saves it through `project_config` using stdin.
A URL obtained this way is usable immediately in the same test run. Setup messages
omit the URL, and a setup failure prevents the HTTP suite from starting.
The verifier separates local `preflight` from authenticated, read-only
`deployed readiness`. A local credential does not prove it is active in Forge:
the app's missing-secret 503 reports the upload/deploy steps instead of
mislabeling the failure as saved configuration. No provisioning runs automatically.
`SECRETSPEC_FILE` and `SECRETSPEC_PROFILE` apply to both resolution and persistence;
no value flags or ambient target overrides are needed.

The verifier emits a numbered `@forge-ahead/logging/demo` narrative to stderr
and the sanitized JSON report to stdout. Both include a fresh `runId`.
Backend RPC invocation/outcome logs use the shared `config-rpc` logger, with
per-call generated IDs and no parameter values. Follow the
[logging guidance](docs/how-to/prove-json-rpc.md#follow-the-verification-narrative)
to distinguish local check results, backend rejections, and uncertain writes.

When switching installation or environment, deliberately clear the stored URL
before upsert; it does not automatically invalidate cached values:

```sh
secretspec delete --provider project_config --profile default RPC_VERIFY_URL
```

For an approved second installation, enter its URL at the SecretSpec prompt:

```sh
secretspec set --provider project_config --profile default RPC_VERIFY_ISOLATION_URL
```

Remove the stored optional URL to disable isolation checks:

```sh
secretspec delete --provider project_config --profile default RPC_VERIFY_ISOLATION_URL
```

Deletion restores the declaration's empty default; SecretSpec's dotenv provider
rejects setting an empty stored value. The full suite requires no saved demo prefix
and leaves `poc-😀` saved;
follow the [JSON-RPC verification guide](docs/how-to/prove-json-rpc.md) for reset,
approval, evidence, and failure handling. Neither script uploads these local
verification settings; Fence Rider's `runtime` scope still contains only the token.

### Verify resolution and activate the runtime value

Check the full profile and selected runtime names without printing values:

```sh
secretspec check --profile default --scope '' --explain
secretspec check --profile default --scope runtime --json
SECRETSPEC_PROFILE=default bun run fence-rider doctor --resolve
```

These commands may access the provider or request authentication. Expect all
six declarations in the full-profile report and only `RPC_BEARER_SECRET` in
the runtime report. Even `lint:check:forge` resolves required runtime values;
fix a missing token rather than weakening the declaration or bypassing the wrapper.
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

## Regenerate command contracts

After editing `docs/reference/openrpc.json`, regenerate the tracked contract and
check its consumers:

```sh
bun run generate:commands
bun run generate:commands:check
bun run typecheck
bun run test -- test/generation.test.ts test/contract.test.ts
```

Do not edit `src/generated/commands.ts` manually. Implement new commands in the
handwritten handler map in `src/executor.ts`; regeneration does not create handler
bodies or grant permissions. A missing handler fails typecheck after generation.
Keep runtime normalization and validation tests when changing schemas.

Use `bun run generate:commands:check` for read-only drift detection. It exits
nonzero for missing or stale output without rewriting files. `bun run check`
includes this check; it does not regenerate or accept changed artifacts silently.
The [contract reference](docs/reference/reference.md#generated-contract) defines
the supported schema subset and remaining runtime checks.

## Run repository checks

Run `npm run check` before sending a pull request. Package scripts own the
validation pipeline: `check` explicitly lists the required lint tasks,
typechecking, formatting, tests, and bundle-size check. Independent checks run
in parallel with labeled output through `npm-run-all2`.

Use `npm run lint` for all `lint:check:*` tasks: Biome, Forge, pre-deployment
lint, typechecking, and formatting. Run individual tasks such as
`lint:check:forge` or `lint:check:biome` for focused feedback. Documentation
lint stays a separate command. Lefthook's pre-push hook only calls
`npm run check`; pre-commit retains secret scanning and auto-formatting.

Run the full pipeline and optional documentation check with:

```sh
npm run check
npm run lint:docs
```

Shared tooling validation is documented upstream. This app no longer includes
`scripts/check-secretspec.sh`; do not run that removed local command.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the contribution process.

## Repository layout

- `.atlassian/`: Repository ownership metadata.
- `src/`: TypeScript source code.
- `docs/`: Diataxis guides, reference, explanations, and tutorials.
- `specs/spec.md`: The single main spec for this repo's remaining proof work.
- `specs/outbound/`: Draft handoffs for the trigger and proposed command libraries.
- Other `specs/` records: Dated V&V evidence, not competing implementation plans.
  Specs are excluded from Biome checks; validate their Markdown separately.
- `GLOSSARY.md`: Shared command, trigger, outcome, and adapter vocabulary.
- `dist/`: Build output; ignored by Git and excluded from Biome checks.
- `scripts/`: SecretSpec-backed web-trigger URL upsert and deployed-test setup.
- `test/`: Forge app tests (Vitest), isolated script checks, and the opt-in
  deployed verifier.

[fence-rider-docs]: https://github.com/ibuchanan/ranch-rig-fence-rider#documentation
[fence-rider-local]: https://github.com/ibuchanan/ranch-rig-fence-rider/blob/main/docs/how-to/local.md
[fence-rider-runtime]: https://github.com/ibuchanan/ranch-rig-fence-rider/blob/main/docs/how-to/runtime.md
