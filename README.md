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

**Current state:** A UI Kit Jira admin page and one authenticated v2 web trigger
share `config.get`, `config.set`, and `integration.preview` through the same
JSON-RPC dispatcher and installation-scoped KVS store. The UI resolver checks
Jira `ADMINISTER` permission on every call; HTTP uses a separately provisioned
bearer secret. Preview only concatenates the saved prefix and supplied text.
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
The [installed-UI journey](docs/how-to/how-to.md#verify-the-installed-admin-page)
covers save, reload, preview, and error checks after separate deployment and
installation approval. The new `read:jira-work` scope requires an installation
upgrade. Do not infer live acceptance from local mocks.

## Read more

- [Why commands sit between transports and behavior](docs/explanation/explanation.md)
  — architectural rationale and trade-offs.
- [POC spec](specs/spec.md) — proposed scope, contract, security, and test
  criteria.
- [Forge app configuration](docs/how-to/how-to.md) — this app's requirements
  and links to the shared SecretSpec and Fence Rider documentation.
- [Development](DEVELOPMENT.md) — checks and repository layout.
- [Contributing](CONTRIBUTING.md) and [security policy](SECURITY.md).

## License

Apache 2.0; see [LICENSE](LICENSE).
