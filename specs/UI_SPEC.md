# UI Specification: Three admin screens

## 1. Strategy & Scope

- **User Goal:** Understand whether this installation is configured, edit its prefix,
  and discover how to verify the JSON-RPC proof of concept.
- **Posture:** Transient administration and onboarding.
- **Placement:** Three native UI Kit `jira:adminPage` modules, matching the peer
  `explore-forge-config-lifecycle` project:
  - **Status:** The persistent Jira Apps admin sidebar entry. Preserve the
    existing `config-admin` module key and label it **JSON-RPC status**.
  - **Configure:** A dedicated page with `useAsConfig: true`, accessible from the
    app's **Configure** button in Manage Apps and from the other admin screens.
  - **Get started:** A dedicated page with `useAsGetStarted: true`, accessible from
    the app's **Get started** button in Manage Apps and from Status.
- Preserve the existing JSON-RPC commands, administrator authorization, KVS data,
  prefix validation, and preview behavior. No new dependencies, scopes, egress,
  lifecycle handlers, or remote operations are required.
- Approved follow-up: add an admin-only confirmed reset on Configure to remove
  the saved demo prefix. Reset does not change credentials or app identity.
- Reuse the peer's separation of responsibilities, not its external-service
  signup, URL/token configuration, illustrations, or connectivity checks.

## 2. Structure & Skeleton

- **Hero Element:** Installation configuration readiness, expressed as
  **Configured** or **Not configured**, not a claim that an external service or
  deployed HTTP endpoint is healthy.
- **Hierarchy:**
  - **Status:** Configuration state, saved prefix displayed literally,
    a short explanation of preview-only behavior, and Configure, Get started,
    and Refresh actions. No editable fields.
  - **Configure:** Existing prefix form, Save with read-back verification, preview
    form and literal output, and a route back to Status. Keep the current field
    help, Unicode limits, loading feedback, sanitized errors, and duplicate-action
    protection. Add **Reset configuration** with a warning, **Confirm reset**,
    and **Cancel**. Opening confirmation and canceling make no backend call;
    block edits/navigation until resolved. Reset uses the authorized UI command,
    then read-back; clear stale output immediately and show success only on a
    verified **Not configured** result. Clear sample input after verified reset.
    On uncertain deletion or failed read-back, hide stale
    state and offer a read-only Retry, not an automatic repeated delete.
  - **Get started:** Brief explanation and an onboarding checklist: save a prefix
    (completion derived from `config.get`), then run the preview on Configure.
    Explain that preview only combines prefix and text and makes no Jira or
    third-party integration call. Do not mark the preview step complete merely
    because a prefix exists. Provide Configure, Status, and Refresh checks actions.
- **Interaction Flow:** Get started → Configure → Save → Run preview → Status.
  Status and Get started read the same installation state through the existing
  typed RPC client and permission-checking resolver.
- Use Forge Bridge module navigation rather than hard-coded Jira URLs. Surface
  navigation failures with actionable feedback.
- Use existing UI Kit components and spacing patterns; avoid a new styling layer.
- Reuse the peer's colored verification pattern: a green **Configured** badge
  and success message after a successful read, or a **Not configured** badge and
  warning message when setup is needed. Keep explicit text labels so color is not
  the only cue. On Get started, show **Complete** or **Action needed** for saved
  configuration, and a neutral **Verify manually** badge for the preview step.
  Do not claim connectivity or all checks passed. Suppress readiness success
  during saves, failed reads, and errors; retain the existing red error feedback.
- Jira supplies each page title from the manifest; do not repeat it as an in-app
  heading. Section headings describe tasks or results, not the current page.
- Apply the [Loom UI feedback](https://www.loom.com/share/48e7407274314add961a7ddd10fec942):
  give each page purpose-specific copy, explain the architecture-demo context,
  define Prefix and Preview text, and walk through saving `demo:` then previewing
  a space followed by `hello` to produce `demo: hello`. Explain that no separator
  is inserted, preview uses saved settings, and running it does not save samples
  or change Jira issues. Explain save confirmation and preview output in place.

## 3. The State Matrix

| State       | Status                                                                        | Configure                                                                                | Get started                                                             |
| ----------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **Ideal**   | Configured state and saved prefix; Refresh rereads storage.                   | Prefilled prefix; Save verifies read-back; preview uses saved data, never unsaved edits. | Prefix step complete; guidance to run preview remains available.        |
| **Empty**   | Not configured; direct the administrator to Configure.                        | Empty prefix field; Save available; preview disabled until configured.                   | Prefix step needs attention; Configure is the primary action.           |
| **Loading** | Loading indicator; prevent overlapping refreshes and hide stale readiness.    | Preserve existing pending states and disable overlapping form actions.                   | Loading indicator; do not display completion before the state is known. |
| **Error**   | Sanitized message and Retry; do not imply configuration is absent or healthy. | Preserve sanitized load/save/preview errors and saved-but-read-back-failed distinction.  | Sanitized message and Retry; no false success checklist.                |

Authorization failures must not leave saved configuration or preview output visible.
All reads remain backend-authorized; navigation is not an authorization mechanism.

## 4. Edge Cases

- Preserve literal whitespace, markup-like characters, multiline preview text,
  and Unicode code-point validation: trimmed prefix 1–64; preview text 0–2,000.
- Preserve saved configuration across the screen split and page reloads.
- Display long values without interpreting them as markup.
- Clear stale preview output on edits, successful saves, and failed previews.
- Distinguish missing configuration from failed reads and denied permissions.
- Prevent duplicate saves and overlapping refresh/preview operations.
- Keep navigation and form controls labeled and keyboard accessible using UI Kit.

## 5. Validation (approved 25 October 2026)

- Add local coverage for the three module/resource bindings, screen-specific
  content, configured/empty/loading/error states, refresh, and module navigation.
- Retain the existing save/read-back, preview, authorization, and validation tests.
- Update installed-admin acceptance guidance to cover all three surfaces.
- Run focused type and test checks, then the repository `check` script, including
  the wrapped Forge lint command after manifest changes.
- Do not deploy, install, upgrade, register, or perform git writes without approval.
- Local mocks and manifest validation do not establish installed-UI acceptance.
