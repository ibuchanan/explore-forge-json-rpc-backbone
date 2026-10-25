# SecretSpec and Fence Rider validation record

## Scope and versions

Historical evidence recorded on 2026-10-24 in
`explore-forge-json-rpc-backbone`, before the shared documentation moved to
[Fence Rider][fence-rider-docs]. The results below describe that earlier pass,
not the current checkout or upstream test status:

| Component                    | Version        |
| ---------------------------- | -------------- |
| SecretSpec                   | 0.21.1         |
| Bun                          | 1.4.4          |
| Forge CLI detected by doctor | 14.2.0         |
| System OpenSSL command       | LibreSSL 3.3.6 |

At the time of validation, `scripts/check-secretspec.sh` extracted the first
TOML block from the app-configuration guide, so invalid copyable declarations
failed the check rather than remaining untested prose. Both the local guide
and script have since been removed from this app. Consult Fence Rider's
current validation instructions instead of running that historical path.

The check creates a disposable `tmp_rovo_` directory inside the workspace with
isolated HOME and XDG config/data/cache/state directories. User config and value
files are synthetic. It substitutes a disposable dotenv backend for the
`app_secrets` alias and a fake `forge` executable for every Forge invocation.
Copies of the app package scripts run in the fixture with dotenv autoload
disabled; no real project dotenv file is loaded. The check also verifies that
configured lint stops before calling Forge when the runtime credential is
removed. Generated values are never printed; fixtures are removed on exit.
This does not test the secrecy properties of a real vault or keyring.

## Evidence matrix

| Behavior                            | Evidence                                                                                               | Boundary                                            |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| User alias layout                   | Native `config global provider add` creates aliases                                                    | Disposable user config only                         |
| Home-relative dotenv path           | `user_dotenv` selects `~/.config/secretspec/user.env`                                                  | Synthetic controls only                             |
| Explicit app routes                 | Copied app declarations resolve controls and runtime value from distinct aliases                       | Runtime alias replaced with synthetic dotenv        |
| Missing required runtime credential | Full-profile check exits nonzero before provisioning                                                   | Native SecretSpec validation                        |
| OpenSSL stdin provisioning          | Generates a 64-character token through `set --from-file -`                                             | Synthetic token; test sets `OPENSSL_CONF=/dev/null` |
| Child-process injection             | Trusted child checks controls and token length without emitting values                                 | Native SecretSpec run                               |
| Scope and resolution diagnostics    | `check --explain`, `check --json`, `doctor --resolve` complete                                         | Value-free reports; providers still read            |
| Package script behavior             | Existing lint, variables, deploy, install, upgrade, and uninstall scripts execute against a fake Forge | No server calls or remote writes                    |
| Encrypted runtime upload selection  | Fake Forge checks only `RPC_BEARER_SECRET` is sent with `--encrypt` and the selected environment       | Argument contract, not actual remote encryption     |
| Deploy after upload                 | Recorded command order distinguishes upload from deployment                                            | No live deployment or runtime activation            |

## Failures found while testing the documentation

- SecretSpec 0.21.1's `config global init --provider app_secrets` rejects an
  alias even when it exists. The guide uses the built-in `keyring` backend for
  this command and explicit `app_secrets` routes for app declarations.
- Every declaration needs a description. Copyable examples now include one
  for the product and environment controls as well as the required names.
- The system `openssl` resolves to LibreSSL here; inherited OpenSSL provider
  configuration caused the random-generation command to fail. The synthetic
  check disables unrelated host configuration. The operator guide instead
  directs users to fix their approved OpenSSL installation/configuration and
  stop on pipeline failure.
- Global aliases under project-style `[providers.alias]` are not recognized.
  Global aliases belong under `[defaults.providers]`; project aliases belong
  under `[providers]` in `secretspec.toml`.

## Not established by these checks

- Real keyring permissions, approval prompts, storage access, or portability.
- Keeper authentication, bootstrap credential storage, record mapping, or other
  vault integrations. SecretSpec supports these, but this example does not
  certify them or recommend a provider as organizationally approved.
- Actual Forge variable storage, activation after deployment, install consent,
  upgrade, uninstall, registration, or tunnel behavior on a live site.
- Compliance with a blanket corporate "no secrets on disk" policy. The
  explanation cites the SSH initiative narrowly and states the broader
  no-plaintext-secrets principle as this workflow's design goal.
- Protection from an agent/process authorized to retrieve the secret or inspect
  its consuming process.

Native provider and live Forge tests require explicit operator authorization,
a disposable app/environment, a named provider and cleanup scope, and a
value-free observation of runtime receipt. Passing a fake Forge argument check
is not evidence that a deployed function received the value.

## Repository checks for this documentation pass

The changed Markdown passes Markdown lint and spelling checks; all 45 relative
links resolve. ShellCheck passes for the smoke test. All 16 application tests,
typechecking, formatting, pre-deployment lint, and bundle-size checks pass.

The real app's `bun run check` stops at Forge lint because this process cannot
resolve the required `RPC_BEARER_SECRET`. The requirement was not weakened and
no value was written to the operator's provider. Whole-repository
`bun run lint:docs` also reports 74 pre-existing Markdown issues in unchanged
conduct, contributing, security, and architectural-spec files; targeted lint
of these changed guides reports none.

## Documentation ownership

The security rationale, user-provider setup, provider diagnosis, and general
Forge workflow documentation have moved to Fence Rider. This repository
retains the concrete `RPC_BEARER_SECRET` declaration, its package scripts,
[app-specific guidance](../DEVELOPMENT.md#configure-this-repositorys-variables),
and this historical evidence record under `specs/`. See the
[upstream documentation][fence-rider-docs] for maintained shared guidance and
current verification status.

[fence-rider-docs]: https://github.com/ibuchanan/ranch-rig-fence-rider#documentation
