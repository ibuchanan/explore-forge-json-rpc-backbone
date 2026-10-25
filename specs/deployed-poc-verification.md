# Deployed POC verification and decision record

<!-- cspell:words prosemirror prelint brotlied -->

Recorded: 2026-10-24. Implementation baseline: `37bfac0` (Ticket 03).
Ticket 04 adds verification tooling; this record does not assert live acceptance.

## Target and approval

| Field | Observation |
| --- | --- |
| Registered app | `b4fb5180-6f8a-4652-afdc-56e68ba7adbd`, from `manifest.yml` |
| Approved development site / installation | Not supplied; unverified |
| Approval for deployment / install / upgrade / test writes | Not obtained |
| Encrypted runtime secret provisioned and active | Unverified; no upload performed |
| Deployed source revision / Forge version | Unverified |
| No active tunnel | Unverified |
| Second approved installation | Not supplied; isolation unverified |
| Operator / date / browser | No live operator session recorded |

No deployment, installation, upgrade, registration, tunnel, variable write,
or live HTTP call was performed for this implementation. A configured default
site is not approval to use that site.

## Local evidence

- `test/deployed/verify.ts` implements the opt-in HTTP sequence. The actual runner
  is `test/deployed/run.ts`, invoked only by `bun run test:deployed`; it is not
  a Vitest test and ordinary repository checks never call it.
- Local verifier tests inject the existing HTTP adapter and in-memory stores.
  They test the same sequence and safety gates without making network requests.
  They cannot establish deployed Forge KVS persistence or installed rendering.
- Preflight requires a development acknowledgement, development Jira controls,
  a credential and approved HTTPS endpoint input. These are operator controls,
  not independent proof of installation identity or approval.
- The suite refuses existing configuration, bounds request time and response
  size, rejects redirects, sanitizes reports, stops at the first failure, and
  leaves a successful save in place. It neither resets nor restores storage.
- Fresh `bun run check` passed: 37 tests, typecheck, formatting, Biome,
  prelint, Forge lint, TypeScript build and size check. The measured full gate
  took 7.705 seconds; Vitest reported 613 milliseconds. Compiled JavaScript
  remained 4.77 kB brotlied against a 10 kB limit; this is not the deployed
  webpack bundle size or an HTTP latency measurement.
- The live entry point was exercised with its acknowledgement removed: it
  exited 1 at preflight with `configurationMayHaveChanged: false`, without a
  network call. No live credential resolution or endpoint was required.
- Targeted Markdown/spelling checks pass. Existing non-blocking diagnostics
  remain: Biome's optional-chain suggestion, prelint script/hook conventions
  and scope/StrictMode notes, and OpenRPC's ignored URI-format warnings. The
  initial new-document format/spelling failures were corrected before the pass.

## Live acceptance evidence

| Check | Status | Evidence / discrepancy |
| --- | --- | --- |
| Setup effort and provisioning time | Unmeasured | No approved setup performed |
| HTTP rejection of absent/invalid credentials | Unverified | Opt-in suite not run live |
| HTTP malformed/unsupported requests | Unverified | Opt-in suite not run live |
| HTTP unset configuration and not-configured preview | Unverified | Requires unused installation |
| HTTP save, separate read-back and preview | Unverified | Requires approved test write |
| HTTP total and per-call runtimes | Unmeasured | No deployed report |
| Second installation isolation | Unverified | No second approved installation |
| UI empty and loading | Unverified | Observe before HTTP saves configuration |
| UI save and read-back after reload | Unverified | Manual installed-UI journey not run |
| UI exact preview parity with HTTP/OpenRPC | Unverified | Manual journey not run |
| UI validation and resolver failure | Unverified | Safe failure injection not approved |
| Backend logs and browser console free of exposure | Unverified | Not inspected live |
| Authorization model for real API operations | Unverified | POC has no real integration |

Replace unverified entries only with dated observations from the approved target.
Attach the sanitized JSON report in an approved evidence location and record
source revision, target identity, test exit status, setup effort and actual
wall-clock durations. Do not include bearer credentials, full trigger URLs,
raw response bodies, or sensitive logs. Record failures and discrepancies even
when later attempts pass; a missing check is not a pass.

## Release caveats

Ticket 03 recorded a dependency audit with 8 high and 4 low entries, including
UI Kit's pinned transitive `prosemirror-view` 1.41.5 advisory
`GHSA-c8x8-7fp4-3x9w`. The app does not use a rich-text editor; exploitability
was not established, and no override or forced downgrade was applied. This
implementation does not change dependencies, rerun a current online audit, or
clear that release risk. Review it before an approved release. Upstream legacy
React peer warnings also require installed-rendering evidence. Local checks
and package license metadata are not security or legal approval.

## Decision

**Defer real integration. Retain the HTTP adapter provisionally for evaluation,
not as an accepted production surface.** Neither deployed HTTP nor installed UI
has been verified, and authorization for real operations has not been designed.
There is no evidence yet that HTTP reduces testing friction enough to justify
its public endpoint, credential provisioning and maintenance cost.

Recommend a real integration only after both deployed seams pass, authorization
is justified separately for each caller and real operation, the dependency
risk is reviewed, and observed setup/testing effort demonstrates useful value.
If HTTP adds friction or does not earn its maintenance/security cost, keep only
the useful resolver/shared-command seam and propose removal of the web trigger.
No removal or product API expansion is performed by this ticket.

The next decision needs explicit target/live-operation approval, the
[deployed HTTP procedure](../docs/how-to/prove-json-rpc.md),
and the [installed-UI journey](../docs/how-to/prove-admin-ui.md).
