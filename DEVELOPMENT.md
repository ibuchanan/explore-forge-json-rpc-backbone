# Development

Install dependencies with `npm install`. Forge wrappers also require Bun
1.4.3+, SecretSpec 0.21.1+, and an authenticated Forge CLI on `PATH`.
The `fence-rider` development dependency is installed from GitHub.
Configure values for `secretspec.toml` in your local dotenv provider; override
it with `SECRETSPEC_PROVIDER` to use a different provider. Never commit values.
All configured wrappers, including `lint:forge`, require the profile's required
values to resolve; configure the provider if a check reports missing names.

Run the checks before sending a pull request:

```sh
npm run lint
npm run lint:docs
npm run format:check
npm run typecheck
npm run test
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the contribution process.

## Repository layout

- `.atlassian/`: Repository ownership metadata.
- `src/`: TypeScript source code.
- `docs/`: Diataxis guides, reference, explanations, and tutorials.
- `specs/`: Specifications and reference material; excluded from Biome checks.
- `dist/`: Build output; ignored by Git and excluded from Biome checks.
- `test/`: Forge app tests (Vitest) and optional evaluations.
