# Deployed POC verification and decision record

<!-- cspell:words prosemirror prelint brotlied -->

Originally recorded: 2026-10-24. Implementation baseline: `37bfac0` (Ticket 03).
Ticket 04 added verification tooling without a live acceptance claim.
The dated 2026-10-25 evidence records a passing deployed HTTP suite, an installed
UI walkthrough transcript and deployed backend logs. Detailed visual acceptance,
isolation, deployment revision and production acceptance remain unverified.

## Original target and approval record, 2026-10-24

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
or live HTTP call was performed for that original implementation record.
This historical table is not a description of the later operator-run suite.
A configured default site is not approval to use that site.

## Local evidence

This section records the original 2026-10-24 behavior and check results;
see the dated updates below for the current workflow.

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

## Repeat-run support added 2026-10-25

The local verifier now includes a static `message` on failed preflight checks,
identifying the required setting without printing its value. Preflight performs
no network requests; a saved UI prefix instead affects the later `config.get unset`
check. Configure now offers an admin-authorized, confirmed reset of `config.prefix`
with read-back verification. It does not reset the bearer credential or install.
The verifier still never resets/restores data itself: operators must deliberately
reset approved test configuration through the UI before repeating the full suite.
These are implementation changes, not a new live acceptance claim. Follow the
[Admin UI reset guide](../docs/how-to/prove-admin-ui.md#reset-demo-configuration-for-another-verification-run)
for the current repeat-run procedure; the earlier evidence above remains historical.

## Explicit test invocation replaces the approval latch, 2026-10-25

The local scripts and verifier no longer require a persisted approval value.
Running `test:deployed` explicitly starts the suite. SecretSpec still supplies
the target, URLs, and bearer credential; development-only and Jira-only guards
remain, as do URL validation, authentication checks, refusal of existing demo
configuration, and sanitized reports. A successful run still leaves `poc-😀`
saved without automatic reset or restoration. This changes local tooling only,
not the deployed app, and is not a new live acceptance claim.

## Read-only deployed readiness added 2026-10-25

Local `preflight` still validates inputs without HTTP calls. The runner now
reports an authenticated `deployed readiness` read separately from the unset-state
check, reusing the same response rather than adding a request. The app's exact
missing-runtime-secret 503 and rejected-credential 401 signatures receive static
corrective guidance. Other failures remain sanitized. The optional second target
uses the same readiness check before test writes. A saved prefix passes readiness
but fails the subsequent unset check with manual reset guidance. No automatic
upload, deployment, credential rotation, or reset was added. This is local
implementation evidence, not a new live acceptance claim.

## Operator-reported deployed HTTP run, 2026-10-25

Evidence source: the operator supplied the terminal narrative and sanitized JSON
report from `npm run test:deployed` in this session and confirmed success.
The assistant did not execute or independently repeat these live requests.
Only the summary and check coverage are recorded here, not credentials, trigger
URLs, raw responses, or the full terminal transcript.

| Field | Reported evidence |
| --- | --- |
| Run ID | `f3af9b48-9191-4f45-85d3-561c9663324a` |
| Started at | `2026-10-25T16:06:45.853Z` |
| Result | `passed`; all 30 named checks passed |
| Measured suite duration | `10480.660042` ms (approximately 10.48 seconds) |
| Per-check duration range | Approximately 0.07–1318.78 ms; includes local checks, not only HTTP latency |
| Configuration may have changed | `true`; save and separate read-back checks passed |
| Final demo configuration | Test prefix `poc-😀` remains saved; no automatic reset/restoration |
| Isolation / UI | Both `unverified` in the report |
| Tooling reference / run revision | `c2006fb` contains this verifier; the report does not record the operator's local or deployed revision |
| Target identity / deployed Forge version / tunnel state | Not established by the supplied report |
| Setup effort / process exit code | Not separately recorded; report status is `passed` |

The passing preflight is evidence that the runner accepted development Jira
controls, not independent proof of installation identity. Passing deployed
readiness establishes an authenticated, valid configuration response; it does
not inspect Forge's encrypted variable store or establish how it was provisioned.

| Coverage group | Passed checks | Observations |
| --- | --- | --- |
| Local settings, deployed readiness, initial state | 3 | Preflight, authenticated read, and unset state passed |
| Authentication rejection | 4 | Absent, invalid, malformed, and combined duplicate authorization rejected |
| HTTP request guards | 3 | Wrong verb, wrong media type, and oversized body rejected |
| JSON-RPC and parameter validation | 10 | Malformed JSON, batch, notification, null ID, positional params, extra context, invalid envelope, unknown method, extra params, and invalid preview params rejected |
| Before setup | 2 | Configuration still unset after negative probes; preview reports not configured |
| Save, persistence, and reset authorization | 4 | Save and separate read passed; HTTP reset forbidden; configuration preserved afterward |
| Preview behavior and boundaries | 4 | Exact text, empty text, Unicode boundary, and over-limit rejection passed |

The local demo narrative contained 62 sequential steps, from run start through
each check's start/result to the passing summary. All records shared the run ID.
This verifies the supplied local narrative output, not the deployed backend's
invocation logs or their deployed code version.

### Earlier failure retained

The preceding operator-run attempt, `b2bc1b71-f616-4707-97f8-05f1ba2c7b1d`,
started at `2026-10-25T16:04:41.582Z` and stopped after approximately 2.69 seconds.
Local preflight and deployed readiness passed; `config.get unset` failed because
a prefix was already saved. `configurationMayHaveChanged` was `false` and the
suite stopped before its write tests. The later passing run establishes that
its initial unset check passed; it does not independently document the intervening
reset action or its UI journey.

## Local command-coverage baseline, 2026-10-25

Command architecture ticket 01 was tested against base revision
`4fd39fcaf40537ee543b374e9520a71079995e00` plus the ticket's verifier,
characterization-test, and documentation changes. This is fresh **local** evidence,
not another deployed run or a renewal of the historical 30-check HTTP pass.

- The unchanged focused baseline passed 51 tests. Two new reporting assertions
  failed before implementation (missing `commandCoverage`, then missing observed
  evidence), and passed after their respective changes.
- The strengthened focused suite passed 52 tests across command, HTTP, resolver,
  handler, OpenRPC contract, and injected verifier seams. Existing fixtures cover
  Unicode/trim-before-length, exact preview text, empty state, save/read-back,
  confirmed UI reset, and fail-closed admin checks. Added assertions pin rejection
  precedence and reject forged UI authority without reset/write effects.
- `bun run check` passed: 101 tests in 10 files, typecheck, Biome lint/format,
  Forge lint through the existing Fence Rider wrapper, prelint, and a compiled
  bundle of 8.46 kB against 10 kB. Prelint retained its existing script/scope
  advisories. The first check attempt stopped on documentation table formatting;
  the corrected run passed.
- Local verifier fixtures cover full pass, failed preflight/readiness, malformed
  readiness results, and early stops. A save that persisted before losing its reply
  earns no successful-execution evidence; no retry or rollback is claimed.

| Command | Authenticated HTTP fixture | UI-admin fixture | Installed/live evidence from this session |
| --- | --- | --- | --- |
| `config.get` | Successful execution verified | Successful execution verified through resolver | Unverified |
| `config.set` | Successful execution verified | Successful execution verified through resolver | Unverified |
| `config.reset` | Denial verified; positive execution unverified | Confirmed reset verified through resolver | Unverified |
| `integration.preview` | Successful execution verified | Successful execution verified through resolver | Unverified |

The HTTP verifier's `commandCoverage` never imports the separate resolver-test
observations: its UI-admin entries remain unverified. A configured-state readiness
read can verify `config.get` even if the subsequent unset-state check fails;
failed readiness and unattempted checks earn no evidence. Optional isolation is
verified only within the injected two-store fixture here. Installed UI rendering,
real installation isolation, backend-log inspection, native delivery, and all
changed-revision deployed behavior remain unverified. No live request, deployment,
provisioning, reset, dependency change, or peer-repository edit was performed.

## Ticket 11 deployed attempt, 2026-10-25

The operator reported running `npm run forge:deploy`, then explicitly requested
`npm run test:deployed`. The assistant invoked the existing package script as
`bun run test:deployed`, through SecretSpec and `scripts/test-deployed.sh`.
This was one attempt, not an automatic repeat of the historical passing run.

| Field | Observed evidence |
| --- | --- |
| Local source revision | `c9896641581a8f3b60d2e78a719df2baee060481`; no runtime changes in this session |
| Deployment | Operator-reported invocation only; successful deployment, deployed revision, upgrade and Forge version not independently established |
| Target | Runner accepted development Jira controls; exact site/installation and cached endpoint ownership not independently established |
| URL policy | Stored URL reused; no Forge lookup or URL creation reported |
| Run ID | `28481051-0855-4150-91a4-7ccaea7920f3` |
| First captured narrative time | `2026-10-25T22:44:12.237Z`, from the logger's epoch timestamp |
| Result | Interrupted during deployed readiness; package runner reported exit code `143` |
| Local preflight | Passed |
| Deployed readiness | Started; no completion or valid response captured |
| JSON report / durations | Standard output empty; no final report or completed-check timing report produced |
| Write boundary | No configuration-write check reached in the captured sequence; current saved state not established |
| Recovery actions | No retry, reset, restoration, deployment, upgrade or credential change by the assistant |

The captured local narrative contains four steps: run start, preflight start,
preflight pass, and deployed readiness start. It does not explain the interruption
or establish a network/backend failure. The operator's subsequent “Looks good”
message contains no separate report or command output and is not treated as a
completed suite. Only the local preflight is verified by this attempt.

No command/principal success or denial is established by an unfinished readiness
request. In particular, `config.get`, `config.set`, `config.reset` denial, and
`integration.preview` remain unverified for this changed-revision attempt.
Installed UI, backend-log inspection, second-installation isolation, native
delivery/retry scheduling, deployed revision and tunnel state also remain
unverified. Ticket 11 stays open; the historical 30-check pass above is unchanged.
This is an evidence-only update, not a runtime change or a new TDD cycle.

## Ticket 11 operator report: saved-state blocker, 2026-10-25

The operator supplied a complete sanitized report from `bun run test:deployed`:
run `d3c3dbef-3726-4d11-bad9-319eb099f48b`, started
`2026-10-25T22:58:27.755Z`, exit code `1`, total duration `2784.852292 ms`.
The stored endpoint was reused without a Forge lookup.

| Check | Result | Duration |
| --- | --- | --- |
| Local preflight | Passed | 0.138291 ms |
| Deployed readiness | Passed | 2781.206917 ms |
| `config.get unset` | Failed: a demo prefix is already saved | 0.078208 ms |

This report verifies successful authenticated HTTP `config.get` execution, even
though the suite failed its unset-state prerequisite. It reports
`configurationMayHaveChanged: false`: execution stopped before the write phase.
No `config.set`, HTTP reset-denial, or preview result was established; UI-admin
coverage, isolation and installed UI remain unverified. Exact deployed revision,
installation identity, backend-log inspection and native delivery also remain
unverified. The earlier interrupted run and historical HTTP pass are unchanged.

Ticket 11 remains blocked on existing configuration. With permission to discard
that configuration, an authorized administrator can use **Configure > Reset
configuration**, then explicitly rerun the verifier; a completed suite leaves
`poc-😀` saved. No reset or additional live request was performed by the assistant.

## Ticket 11 operator-reported HTTP pass, 2026-10-25

The operator supplied the complete report and narrative from a subsequent explicit
`bun run test:deployed`, captured as `tmp_rovo_after-reset-report.json`. All
**30 checks passed**, exit code **0**, in **12393.710958 ms**.

| Field | Reported evidence |
| --- | --- |
| Run ID | `a7713063-53d3-409d-856a-eeb5f66a4070` |
| Started at | `2026-10-25T23:03:07.543Z` |
| Endpoint handling | Stored URL reused; no Forge lookup reported |
| Initial state | Unset configuration verified; earlier saved-state prerequisite cleared |
| Final demonstrated state | `poc-😀` saved, read back, and preserved after denied HTTP reset |
| Configuration risk | `configurationMayHaveChanged: true`; save and persistence positively verified, not rolled back |
| Source context | Local HEAD at evidence recording: `010c62733be477c25f8f24023b9bb542e8331adc`; only documentation changed since `c989664` |
| Deployment identity | Exact deployed revision, installation identity and tunnel state not established by the report |

| Command | Authenticated HTTP evidence | UI-admin evidence |
| --- | --- | --- |
| `config.get` | Successful execution verified | Unverified |
| `config.set` | Successful execution verified | Unverified |
| `config.reset` | Denial verified; saved configuration preserved | Unverified |
| `integration.preview` | Successful execution verified | Unverified |

The pass also covers four authorization rejection cases, method/media/body limits,
JSON-RPC envelope and parameter rejection, preview before setup, exact/empty/
Unicode-boundary previews and the over-limit rejection. Deployed readiness took
1499.279 ms; save took 317.609250 ms; persisted read took 327.045750 ms; reset
denial took 324.742417 ms. The 62 narrative steps are local runner output, not
independent deployed backend-log evidence.

This clears the HTTP-suite blocker, not all ticket 11 acceptance. The report
proves the initial unset state but does not independently demonstrate the Admin
UI reset flow. Installed three-screen UI, UI-admin execution, deployed backend-log
inspection, isolation and native delivery/retry scheduling remain unverified.
Earlier failure records and the historical pass remain separately dated evidence.
The assistant made no runtime changes, new tests, automatic retry, reset or live
request while recording this report. No further HTTP rerun is needed for this
evidence; another full run requires unset configuration.

## Ticket 11 installed UI and backend logs, 2026-10-25

The operator confirmed the same development Jira installation as the passing
HTTP run, with no active Forge tunnel, and supplied a
[Loom walkthrough](https://www.loom.com/share/92b02d8363124e14801aea721db91237)
and grouped development backend logs. Exact site/installation identifiers,
browser, deployed source revision and Forge deployment version were not supplied.
Local HEAD at receipt was `c089425da414be3e95e722c735fcacbfca280c6f`;
only evidence documentation changed since `c989664`.

The recording is titled **Configured and Verified POC SmileyFace**, created
`2026-10-25T23:12:48.669Z`, duration 61.89 seconds. The assistant retrieved its
metadata and full transcript through TWG, not video frames. At 0 seconds the
operator narrates refreshes and navigation to Configure and Get started; at
30.818 seconds, configured/verified feedback and running preview. This supports
an operator-reported three-screen walkthrough, not independent visual inspection.
The transcript does not establish exact preview output, markup rendering,
page-reload persistence, both Manage apps entry points, or all loading/error states.

The supplied `forge logs` excerpt covers `2026-10-25T22:58:29Z` through
`23:13:52Z`. Unlike the HTTP runner narrative, it contains deployed `config-rpc`
records with `rpc.invoke`, two lifecycle steps, and `rpc.complete`. Each pair
shares an app-generated `invocationId`; Forge's outer invocation ID is distinct.

| Deployed observation | Evidence |
| --- | --- |
| UI `config.get` | Successful saved-state reads, including app invocation `2106820c-b248-4b82-ad2e-f0e218c5bd7e` at `23:13:39Z` |
| UI `integration.preview` | Success at `23:13:41Z` and `23:13:52Z`, 27.542097 ms and 26.309189 ms |
| UI `config.reset` | Success at `23:02:45Z`, app invocation `1abf4cb0-fabe-459c-967d-9865432a62bf`, 52.825730 ms |
| Reset read-back | Subsequent UI `config.get` reports no saved prefix at `23:02:45.710Z`; HTTP initial-unset check then passed |
| HTTP commands | API save, persisted reads, reset denial (`-32001`) and previews corroborate the passing suite |
| Completion semantics | Successful calls have `outcome: succeeded`; expected denials have `outcome: rejected`; both use `disposition: response-ready` |

The excerpt's warnings match intentional verifier rejections: HTTP 401/405/415/
413 and RPC `-32700`, `-32600`, `-32601`, `-32602`, `-32001`, `-32002`.
No internal-error completion or exposed prefix, preview input/output, bearer
credential or endpoint appears in this excerpt. This is a bounded inspection,
not a whole-environment security review; browser console exposure is unverified.
UI `config.set` execution remains unverified because it is not shown here.

The earlier reset is now corroborated, without another destructive action. The
last established configuration remains `poc-😀`, saved by the HTTP suite; the
walkthrough uses read/preview operations. Isolation, native delivery and retry
scheduling remain unverified. Ticket 11 remains partially verified for missing
exact deployment metadata and detailed UI observations. No new live app request,
reset, retry, deployment, credential change or runtime change was performed by
the assistant while recording this evidence.

## Live acceptance evidence

Statuses below summarize dated operator reports, the retrieved Loom transcript,
and supplied deployed logs, not an independent assistant live run. Historical
attempts above retain their original scope; missing evidence remains unverified.

| Check | Status | Evidence / discrepancy |
| --- | --- | --- |
| Setup effort and provisioning time | Unmeasured | Not measured by the supplied run |
| HTTP rejection of absent/invalid credentials | Passed, operator-reported | Four authentication rejection checks passed on 2026-10-25 |
| HTTP malformed/unsupported requests | Passed, operator-reported | HTTP guards and JSON-RPC validation checks passed |
| HTTP unset configuration and not-configured preview | Passed, operator-reported | Initial/still-unset reads and preview-before-setup passed |
| HTTP save, separate read-back and preview | Passed, operator-reported | Save, persistence, reset denial/preservation, and preview checks passed |
| HTTP total and per-call runtimes | Recorded, operator-reported | Historical suite 10.48 seconds; ticket 11 suite 12.393711 seconds, plus selected backend timings |
| Second installation isolation | Unverified | Report explicitly says `unverified` |
| Same installation / no tunnel | Confirmed, operator-reported | Operator affirmed development target matches the passing HTTP run; exact identifiers/revision not supplied |
| Installed three-screen walkthrough | Supported, operator-reported | Linked Loom transcript narrates refresh, Configure, Get started, configured feedback and preview; frames not inspected |
| UI read, reset and preview execution | Verified in supplied backend excerpt | Successful UI calls; reset followed by an unset-state read |
| UI empty and loading | Partially evidenced | Empty backend state after reset verified; loading/empty visual states unverified |
| UI save and read-back after reload | Unverified | No UI save or explicit reload evidence supplied |
| UI exact preview parity with HTTP/OpenRPC | Unverified | Transcript/logs omit exact UI output text |
| UI validation and resolver failure | Unverified | No safe failure-injection evidence attached here |
| Deployed backend log exposure | No exposure observed in excerpt | Safe narratives, correlated completions and expected verifier warnings; not a complete-environment claim |
| Browser console exposure | Unverified | Console evidence not supplied |
| Authorization model for real API operations | Unverified | POC has no real integration |

Replace unverified entries only with dated observations from the approved target.
Attach the sanitized JSON report in an approved evidence location and record
source revision, target identity, test exit status, setup effort and actual
wall-clock durations. Do not include bearer credentials, full trigger URLs,
raw response bodies, or sensitive logs. Record failures and discrepancies even
when later attempts pass; a missing check is not a pass.

## Relationship to current documentation

This is a dated V&V and decision record, not the current implementation spec.
The [runtime reference](../docs/reference/reference.md) describes implemented
behavior, the [explanation](../docs/explanation/explanation.md) captures the
architectural rationale, and the [main spec](spec.md) owns remaining proof work.
Historical test counts and earlier deployment decisions below are retained as
evidence; they do not override current source or prove later revisions.

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
not as an accepted production surface.** The 2026-10-25 operator report provides
deployed HTTP verification evidence for this POC. Ticket 11 additionally records
an installed-UI walkthrough transcript and corroborating deployed backend logs.
Detailed visual UI acceptance, exact deployment identity and second-installation
isolation remain unverified; authorization for real operations is not designed.
The passing HTTP run does not by itself establish that its testing value
justifies the public endpoint, credential provisioning, and maintenance cost.

Recommend a real integration only after both deployed seams pass, authorization
is justified separately for each caller and real operation, the dependency
risk is reviewed, and observed setup/testing effort demonstrates useful value.
If HTTP adds friction or does not earn its maintenance/security cost, keep only
the useful resolver/shared-command seam and propose removal of the web trigger.
No removal or product API expansion is performed by this ticket.

The next decision needs explicit target/live-operation approval, the
[deployed HTTP procedure](../docs/how-to/prove-json-rpc.md),
and the [installed-UI journey](../docs/how-to/prove-admin-ui.md).
