# explore-forge-json-rpc-backbone

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
Jira `ADMINISTER` permission on every call; HTTP uses a separately provisioned
bearer secret. Preview only concatenates the saved prefix and supplied text.
Configure also offers a confirmed, admin-only `config.reset` command to remove
that prefix for repeat verification; HTTP callers cannot reset configuration.
Local tests pass; deployed HTTP and installed-UI acceptance remain unverified.
This is a proof of concept, not production-ready integration software.

## Try the repository locally

Use Node.js 24 (see `.nvmrc`) and npm. Dependencies include GitHub-sourced
packages, so installation needs access to them. From the repository root:

```sh
npm ci
npm run test
```

Vitest covers the command contract, HTTP boundary, resolver authorization,
shared storage, and UI behavior without a browser or deployed app.
`npm run check` is the broader pre-push gate, including Forge lint.
Deploying or installing is a separate, opt-in Forge operation; see
[development guidance](DEVELOPMENT.md) and the `forge:*` scripts in
`package.json` for this repository's environment-targeted workflow. Do not
register a new app identity just to inspect this checkout.

## Next verification

The [POC spec](specs/spec.md) requires local **and** deployed UI/HTTP evidence.
[Prove it from the Admin UI](docs/how-to/prove-admin-ui.md) covers save, reload,
preview, and error checks, with a UI-to-resolver-to-command execution trace.
[Prove it via JSON-RPC](docs/how-to/prove-json-rpc.md) covers HTTP requests and
the deployed verifier, with the corresponding web-trigger execution trace.
Both require separate approval for deployment, installation, and test writes.
The `read:jira-work` scope requires consent on existing installations that do
not yet grant it. Do not infer live acceptance from local mocks.

## Read more

- [Why commands sit between transports and behavior](docs/explanation/explanation.md)
  — architectural rationale and trade-offs.
- [POC spec](specs/spec.md) — proposed scope, contract, security, and test
  criteria.
- [Forge app configuration](DEVELOPMENT.md#configure-this-repositorys-variables)
  — this app's requirements and links to shared SecretSpec and Fence Rider docs.
- [Development](DEVELOPMENT.md) — checks and repository layout.
- [Contributing](CONTRIBUTING.md) and [security policy](SECURITY.md).

## License

Apache 2.0; see [LICENSE](LICENSE).
