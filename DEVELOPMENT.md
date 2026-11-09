# Development

<!-- cspell:words webtrigger openrpc -->

Install dependencies with `npm install`.
App generation, tests, and checks use Node/npm.
The upstream Fence Rider CLI still requires Bun 1.4.3+
for optional Forge lifecycle wrappers;
those operations also require SecretSpec 0.21.1+
and an authenticated Forge CLI on `PATH`.
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

| Variable            | Provider alias  | Requirement                                        |
| ------------------- | --------------- | -------------------------------------------------- |
| `FORGE_SITE`        | `shared_config` | Required installation hostname, without `https://` |
| `FORGE_PRODUCT`     | `shared_config` | Installation product; defaults to `jira`           |
| `FORGE_ENVIRONMENT` | `shared_config` | Local Forge target; defaults to `development`      |

`RPC_INSTALLATION_ARI` and `RPC_JIRA_SITE_URL` (`project_config`) are the only
members of `[scopes.runtime]`; `npm run forge:variables:set` uploads them. The
web trigger needs no shared credential. `RPC_VERIFY_URL`, `RPC_VERIFY_EMAIL`
and `RPC_VERIFY_API_TOKEN` stay local for the live check below. The `FORGE_*`
controls are never uploaded. This app has no `manifest` scope. A SecretSpec
profile is not a Forge environment; keep profile `default` for these examples
and review `FORGE_ENVIRONMENT` separately.

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
override developers' bindings. This app uses only `shared_config`.

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
The dotenv file is plaintext; store no credentials in it.

## Configure the web trigger

`src/index.ts` reads `RPC_INSTALLATION_ARI` and `RPC_JIRA_SITE_URL` (an
`https://<site>.atlassian.net` origin) from the runtime environment. Until both
are set and the request's Forge `installContext` matches the ARI, every web
request returns `503`. The ARI is known only after installation, so use a
placeholder for the first deploy and upload the real value afterward. Callers
authenticate with HTTP Basic credentials (a Jira user's email and API token);
the trigger verifies on each request that the user holds Jira `ADMINISTER`. Only
methods marked `x-forge-ahead.web` in the OpenRPC catalog and selected in
`src/adoption.ts` are reachable.

Bind the aliases, then store the values. `project_config` holds non-secret
values; bind `project_secrets` to an approved secret backend, never dotenv:

```sh
secretspec set --provider project_config --profile default RPC_INSTALLATION_ARI
secretspec set --provider project_config --profile default RPC_JIRA_SITE_URL
npm run forge:variables:set
```

## Check the deployed web trigger

`npm run test:deployed` runs `scripts/verify-webtrigger.ts` under
`secretspec run`. It needs a development Jira installation whose runtime
variables are set. Store the local inputs once; the URL comes from
`forge webtrigger create` for the `config-rpc` function:

```sh
secretspec set --provider project_config --profile default RPC_VERIFY_URL
secretspec set --provider project_config --profile default RPC_VERIFY_EMAIL
secretspec set --provider project_secrets --profile default RPC_VERIFY_API_TOKEN
```

The account must be a Jira administrator on `FORGE_SITE`. The check is
read-only: it probes authentication, method and media-type rejection, discovery,
`config.get`, `integration.preview`, and that save and reset are not exposed. It
stops at the first failure, refuses to run unless `FORGE_ENVIRONMENT` is
`development` and `FORGE_PRODUCT` is `jira`, and prints a JSON report with no
credentials, URLs or saved values. `test/verify-webtrigger.test.ts` runs the
same script offline against the real adopted trigger and a fake Jira. Normal
`npm run test` and `npm run check` never call the live endpoint.

## Regenerate command contracts

After editing `docs/reference/openrpc.json`, regenerate the tracked contract and
check its consumers:

```sh
npm run generate:rpc
npm run generate:rpc:check
npm run typecheck
npm run test -- test/contract.test.ts
```

`scripts/generate-rpc.ts` calls the `forge-ahead-rpc/generator` export and owns
the tracked files in `src/generated/rpc/`: the typed contract, standalone input
and output validators, the reviewed web policy and the embedded catalog. Do not
edit them manually. Implement new commands in the handwritten handler map in
`src/executor.ts`; regeneration does not create handler bodies or grant
permissions. A missing handler fails typecheck after generation. The package
dispatcher validates envelopes, parameters and results from these artifacts, so
handlers own only app policy such as trimming, caller source and storage.

Use `npm run generate:rpc:check` for read-only drift detection. It exits
nonzero for missing or stale output without rewriting files. `npm run check`
includes this check; it does not regenerate or accept changed artifacts silently.

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

If formatting races with a generator's temporary validator artifact, run the
same pipeline serially; do not skip checks or accept generated drift:

```sh
npm run check -- --max-parallel 1
```

Shared tooling validation is documented upstream. This app no longer includes
`scripts/check-secretspec.sh`; do not run that removed local command.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the contribution process.

## Repository layout

- `.atlassian/`: Repository ownership metadata.
- `src/`: TypeScript source code.
- `docs/`: Diataxis guides, reference, explanations, and tutorials.
- `specs/spec.md`: The single main spec for this repo's remaining proof work.
- `specs/outbound/`: Proposed commands-library seed. The trigger handoff moved to
  the trigger repository; its unapplied consumer delta is in the local decision
  record.
- Other `specs/` records: Dated V&V evidence, not competing implementation plans.
  Specs are excluded from Biome checks; validate their Markdown separately.
- `GLOSSARY.md`: Shared command, trigger, outcome, and adapter vocabulary.
- `dist/`: Build output; ignored by Git and excluded from Biome checks.
- `scripts/`: OpenRPC contract generation and the opt-in live web trigger check.
- `test/`: Forge app tests (Vitest).

[fence-rider-docs]: https://github.com/ibuchanan/ranch-rig-fence-rider#documentation
[fence-rider-local]: https://github.com/ibuchanan/ranch-rig-fence-rider/blob/main/docs/how-to/local.md
[fence-rider-runtime]: https://github.com/ibuchanan/ranch-rig-fence-rider/blob/main/docs/how-to/runtime.md
