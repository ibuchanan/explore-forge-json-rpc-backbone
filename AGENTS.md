# Agent guidance

This repository is an Atlassian Forge app.

## Platform boundaries

- Read `manifest.yml` before changing modules, function handlers, resources,
  scopes, or external permissions. Keep code and manifest wiring aligned.
- Backend functions are invocation-scoped, not persistent servers. Persist
  state in Forge storage; use async events for work beyond an invocation.
- Preserve the app's UI Kit or Custom UI model. Use Forge Bridge/resolvers
  for frontend-to-backend calls; do not assume a public backend URL.
  Web triggers and remotes require explicit manifest wiring.
- Declare external network access in the manifest; do not assume unrestricted
  egress.
- Keep `"type": "module"` in `package.json`: Forge's webpack bundler needs it
  to resolve ESM-only dependencies. Keep deploy-time `tsconfig.json` on
  `module: ESNext` and `moduleResolution: Node` (not Bundler).
- Prefer `asUser()` for user-driven product API calls. Use `asApp()` only when
  app-level access is needed, and enforce caller authorization for
  user-triggered operations.

## Checks and operations

- Before submitting changes, run `npm run check`.
- Use `npm run typecheck` and `npm run test` for focused feedback.
  The Forge test runner is Vitest.
- Run `npm run lint:forge` after manifest changes.
- Use the generated `forge:*` scripts from the repository root. They supply
  SecretSpec targeting values and command-specific flags; do not bypass them
  or copy flags between CLI commands.
- Do not register, deploy, install, upgrade, or uninstall without approval.
  Registration creates a new app identity; it is not routine maintenance.
- After scope or egress changes, use `npm run forge:deploy`, followed by
  `npm run forge:upgrade` for existing installations, with approval.
- Tunnels target development only and redirect invocations to your machine.
  Inspect deployed backend invocation logs for backend failures; frontend
  logs are in the browser console.
