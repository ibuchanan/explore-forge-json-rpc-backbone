# explore-forge-json-rpc-backbone

<!-- cspell:words webtrigger -->

[![Apache 2.0 license][license-badge]](LICENSE)
[![PRs welcome][prs-badge]](CONTRIBUTING.md)

[license-badge]: https://img.shields.io/badge/license-Apache%202.0-blue
[prs-badge]: https://img.shields.io/badge/PRs-welcome-brightgreen

An early-stage Atlassian Forge architecture experiment: can one command
implementation serve both a Forge UI resolver and an external web trigger
without duplicating behavior or conflating their security models? This is a
Forge app repository, not an installable JSON-RPC service or a published npm
package (`package.json` marks it private).

**Current state:** Three UI Kit Jira admin screens (Status, Configure, and
Get started) and one authenticated v2 web trigger share `config.get`,
`config.set`, and `integration.preview` through the same
JSON-RPC dispatcher and installation-scoped KVS store. The UI resolver checks
Jira `ADMINISTER` permission on every call; the web trigger verifies the caller
as a Jira administrator through HTTP Basic credentials and exposes only
`config.get` and `integration.preview`. Preview only concatenates the saved
prefix and supplied text.
Configure also offers a confirmed, admin-only `config.reset` command to remove
that prefix for repeat verification; The web trigger cannot reset or save configuration.
Local tests pass. The earlier operator-reported deployed run in the
[evidence record](specs/deployed-poc-verification.md) used the retired bearer
credential, so the current web trigger and installed UI remain unverified.
This is a proof of concept, not production-ready integration software.

## Try the repository locally

Use Node.js 24 (see `.nvmrc`) and npm. Dependencies include GitHub-sourced
packages, so installation needs access to them. From the repository root:

```sh
npm ci
npm run test
```

Vitest covers the command contract, web trigger boundary, resolver authorization,
shared storage, and UI behavior without a browser or deployed app.
`npm run check` is the broader pre-push gate, including Forge lint.
Deploying or installing is a separate, opt-in Forge operation; see
[development guidance](DEVELOPMENT.md) and the `forge:*` scripts in
`package.json` for this repository's environment-targeted workflow. Do not
register a new app identity just to inspect this checkout.

## Next verification

The [main spec](specs/spec.md) plans the next command-layer and adapter proofs;
it does not replace separate local, deployed HTTP, and installed-UI evidence.
[Prove it from the Admin UI](docs/how-to/prove-admin-ui.md) covers save, reload,
preview, and error checks, with a UI-to-resolver-to-command execution trace.
Web trigger configuration and the read-only `npm run test:deployed` live check
are described in
[development guidance](DEVELOPMENT.md#configure-the-web-trigger).
Deployment, installation, and test writes require separate approval.
The `read:jira-work` scope requires consent on existing installations that do
not yet grant it. Do not infer live acceptance from local mocks.

## Read more

- [Follow a command through local tests](docs/tutorials/tutorial.md) — a guided,
  credential-free walkthrough of the implemented paths.
- [Why triggers route to commands](docs/explanation/explanation.md)
  — current architecture, rationale, and the limits of the proof.
- [Runtime reference](docs/reference/reference.md) — command, protocol,
  authorization, storage, and logging facts.
- [Main spec](specs/spec.md) — this repo's remaining proof work and test criteria.
- [Extraction decision](specs/command-architecture-decision.md) — local evidence,
  deferred trigger adoption, and the delta for the moved trigger-library handoff.
- [Commands-library seed](specs/outbound/forge-ahead-commands.md) — demonstrated
  seams and proposed package scope, not implemented package capabilities.
- [Forge app configuration](DEVELOPMENT.md#configure-this-repositorys-variables)
  — this app's requirements and links to shared SecretSpec and Fence Rider docs.
- [Development](DEVELOPMENT.md) — checks and repository layout.
- [Contributing](CONTRIBUTING.md) and [security policy](SECURITY.md).

## License

Apache 2.0; see [LICENSE](LICENSE).
