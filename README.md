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

**Current state:** `manifest.yml` declares two v2 dynamic-response web
triggers. Their handlers in `src/index.ts` return `{"hello": "world"}` and a
random `X-Request-Id`; the asynchronous handler delays its response. There is
no UI, command dispatcher, JSON-RPC protocol, product API operation, or
implemented authentication. Web trigger URLs are public and these handlers
accept unauthenticated requests. Do not use this code to process sensitive
input or assume it is production-ready.

## Try the repository locally

Use Node.js 24 (see `.nvmrc`) and npm. Dependencies include GitHub-sourced
packages, so installation needs access to them. From the repository root:

```sh
npm ci
npm run test
```

The Vitest script currently allows an empty test suite, so a passing run
only confirms that the test runner starts; it does **not** verify the handlers
or transport parity. `npm run check` is the broader pre-push gate, but the
current checkout has existing source type errors and formatting failures.
Deploying or installing is a separate, opt-in Forge operation; see
[development guidance](DEVELOPMENT.md) and the `forge:*` scripts in
`package.json` for this repository's environment-targeted workflow. Do not
register a new app identity just to inspect this checkout.

## Proposed direction

The [POC spec](specs/spec.md) proposes a single, read-only `text.analyze`
command invoked through a Custom UI resolver and an authenticated web trigger.
Both adapters would pass requests to one dispatcher; each would establish its
own trusted caller context. The spec narrows the earlier JSON-RPC blueprint to
a single-request subset and calls for local **and** deployed UI/HTTP checks.
None of that proposed behavior is available in the current handlers.

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
