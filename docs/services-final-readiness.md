# Campus Services — Step 10E final integration evidence

Date: 2026-10-26. Scope: verification and test fixtures only; approved Services UI and application behavior were not changed.

## Verdict and evidence boundaries

**VERIFIED:** isolated PostgreSQL workflows, authorization/identity redaction, concurrent request mutations, real HTTP controllers, encrypted messaging persistence, notification persistence/destinations, and synthetic-component Chrome regressions.

**BLOCKED:** real authenticated browser-to-Express integration and Supabase staging rehearsal. No dedicated isolated Supabase/test identity environment was supplied. Production accounts, normal database configuration and Supabase were not used. Offline verifier injection is not proof of real JWT verification, token refresh, RLS or deployment behavior.

**UNVERIFIED:** production capacity, native 200% browser zoom, real mobile keyboard/safe-area hardware, external socket delivery, current backup restore readiness, and final user visual acceptance. Responsive reflow and emulated viewports are narrower claims.

**FIXED:** no application defect reproduced, so no product fix or redesign was made. Two additional database cases and an optional real-AppShell fixture close test coverage gaps. Test-only lint and harness mistakes were corrected and rerun.

**OUT OF SCOPE:** deployment, production writes, schema/migrations, auth changes, global shell changes, new infrastructure and other module modernization.

The local integration gate passes. This is **not unconditional production approval**: complete staging/authentication and operational release checks below first.

## Environment and isolation

- PostgreSQL 17.11, verified `127.0.0.1:5433`, local `postgres` identity.
- Private `backend/.env.teamup-test.local` parsed without printing values. Only local connection credentials were reused; retained TeamUp databases were never opened.
- Each invocation created a new `campusconnect_services_test_*` database after server verification. Actual target host/port/name and zero public tables were checked before synthetic DDL.
- The suite requires `SERVICES_TEST_DATABASE_URL`, rejects non-loopback targets/query overrides and never falls back to the normal `DATABASE_URL`. Global imported clients were pinned to that exact isolated URL in the child environment. Normal dotenv loading was disabled; no normal backend environment file was loaded.
- Final full-run target: `campusconnect_services_test_10e_1793033210216_09f8f5`. Synthetic databases retained, not dropped/reset. Test-only schema is deliberately smaller than the full deployed schema and does not rehearse migrations, managed Supabase schemas, RLS or least-privilege production grants.
- AI disabled, offline synthetic AWS configuration used only for existing signing tests; no AWS requests or paid inference.

## Workflow and permission matrix

| Operation                | Exercised rule/outcome                                                                                                        | Evidence class                                   |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Publish                  | ACTIVE provider; identity server-derived; unknown owner field rejected; consent/pricing persisted                             | VERIFIED, HTTP + PostgreSQL                      |
| Discover/detail          | Matching filters and pagination; public projection excludes consent/request history; hidden/ineligible content restricted     | VERIFIED, HTTP + PostgreSQL                      |
| Request                  | ACTIVE unrelated requester; self forbidden; one active request; exact message/PENDING persisted                               | VERIFIED, HTTP + PostgreSQL                      |
| Accept/reject            | Exact provider only, matching request ID, valid previous state; repeat/conflicting decisions rejected                         | VERIFIED, HTTP + PostgreSQL                      |
| Workspace                | Authoritative statuses and participant-specific data after mutations; private identities redacted                             | VERIFIED, PostgreSQL + synthetic Chrome UI       |
| Start conversation       | ACCEPTED eligible request; SERVICE context uses request ID, exact participant pair; third party denied                        | VERIFIED, real messaging controller + PostgreSQL |
| Send/read message        | Authorized pair only; persisted ciphertext, 12-byte IV, 16-byte tag, version 1; decrypting history round-trip                 | VERIFIED, real messaging controller + PostgreSQL |
| Complete                 | Provider completes ACCEPTED request; repeat/unauthorized operations cause no mutation                                         | VERIFIED, HTTP + PostgreSQL                      |
| Re-request               | New request permitted after REJECTED/COMPLETED when service/account eligible; history retained                                | VERIFIED, HTTP + PostgreSQL                      |
| Pause/resume/archive     | ACTIVE→PAUSED→ACTIVE, ACTIVE/PAUSED→ARCHIVED; stale/repeated/terminal edits rejected                                          | VERIFIED, HTTP + PostgreSQL                      |
| Historical restrictions  | PAUSED/ARCHIVED/HIDDEN prevent new engagement; permitted history/completion retained; existing messages participant-protected | VERIFIED, PostgreSQL                             |
| Authenticated UI/session | Real Supabase login/token/session through actual application                                                                  | BLOCKED, no safe staging identity                |

Additional account cases cover SUSPENDED/DEACTIVATED provider and requester, non-owner/role-based privilege attempts, malformed or substituted IDs, and no persisted changes on denial. Role is not ownership. Source contract: optional authentication for public Services GETs; writes/workspace require authentication, current account eligibility and repository policy.

## Pricing, privacy and concurrency

FREE stores zero, FIXED stores positive INR decimal, NEGOTIABLE stores null. Real API/database checks cover precision, negative/zero/maximum rejection, incompatible partial updates/ranges, combined type/bounds, and null-last ordering. Consent opt-out preserves request history. Browser management checks exercise changed-field PATCH and consent serialization, without production writes.

The 33 PostgreSQL cases cover synchronized duplicate submissions and competing reviews, archival after a submission snapshot, stale resume/pause versus archive, newly hidden content, provider/requester eligibility races, ownership change, actual SQLSTATE serialization failures, retry/exhaustion, HTTP 409, rollback, intent counts, unique conversations and complete HTTP journeys. Persisted JSONB/rows are inspected. `runServicesTransaction` retains SERIALIZABLE isolation, at most three attempts, 2-second max wait and 5-second transaction timeout. These tests demonstrate selected races, not an exhaustive proof or load benchmark.

Hidden-profile identity is redacted in list/detail/workspace/global-search/notification projections. No private email, enrollment/contact data or raw private profile fields were added. Authorized historical participants retain only the existing permitted projection. Share/Report payloads and request-context messaging navigation pass frontend Chrome tests; these browser adapters are synthetic, not real moderation delivery.

## Messaging and notifications

New HTTP workflow uses production Services/messaging controllers, repositories and encryption with an ephemeral test key. Request-ID substitution, pre-request conversation attempts and unrelated reads/sends fail; reverse participant pair resolves to the same conversation. Hiding the synthetic service blocks new conversation creation while authorized existing history remains available.

Actual notification rows verify correct provider/requester recipients for request/accept/reject/complete, expected counts and `/services/saved` or `/messages/:id` destinations. Retry tests verify one notification intent for one committed outcome. Socket delivery/reconnection was not tested: browser shell uses an explicitly synthetic notification adapter.

`notificationsService.createSafely` logs failure with recipient/type/entity identifiers and returns null. State changes can succeed while notification persistence/delivery fails. There is no transactional outbox, durable retry/replay guarantee or demonstrated recovery from lost notifications. Operational alerting must monitor these failures without logging request/message content.

## Regression results

| Check                              | Actual result                                                                                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Services PostgreSQL, standalone    | 33 passed, 0 failed, 0 skipped                                                                                                                         |
| Full backend, final rerun          | 389 total; 367 passed, 0 failed, 22 skipped; exit 0                                                                                                    |
| Backend skips                      | 21 separately gated TeamUp PostgreSQL cases; 1 opt-in live Lost & Found FastAPI integration. Not counted as passes. No retained TeamUp DB/live AI used |
| Full frontend                      | 252 passed, 0 failed, 0 skipped                                                                                                                        |
| Backend/frontend ESLint            | Passed, zero warnings                                                                                                                                  |
| Backend/frontend TypeScript        | Passed; backend source and test projects checked                                                                                                       |
| Backend/frontend production builds | Passed; Prisma client generation sequential, not migration execution                                                                                   |
| Repository formatting              | Passed: all matched files use Prettier code style                                                                                                      |
| Services Browse Chrome             | 20 viewport/theme cases plus filters/URL/history/cancellation/pagination/dialog/states                                                                 |
| Services Details Chrome            | 20 viewport/theme cases, 28 mobile state cases plus submit/refresh/messaging/Share/Report/recovery                                                     |
| Services management Chrome         | 60 screen/viewport/theme cases plus pricing/consent/PATCH/lifecycle/review/completion/focus/recovery                                                   |
| Mobile workspace Chrome            | 12 viewport/theme navigation cases + 12 empty-state comparisons; retained Step 10D.1 baseline and desktop screenshot hashes passed                     |
| Actual AppShell composition        | 54 create/edit/workspace viewport/theme combinations; overflow, six mobile links, last-control clearance passed; synthetic adapters, not real auth     |
| TeamUp Browse/Details Chrome       | Passed: 20 Browse cases; 20 Details cases + 15 state scenarios and interactions                                                                        |
| Marketplace Browse Chrome          | Passed existing layout/interaction suite; generator requires `--tsconfig frontend/tests/tsconfig.json`                                                 |
| Lost & Found                       | Existing offline cases included in complete backend/frontend passes; separately gated live FastAPI test skipped                                        |

The initial Marketplace fixture invocation omitted its JSX tsconfig and failed before rendering (`React is not defined`); rerunning with the existing test tsconfig passed without product changes. Mobile before/after comparison initially compared identical current snapshots; rerunning against the retained genuine Step 10D.1 baseline passed. AppShell harness selector and immediate-scroll measurement were corrected before its passing rerun. These were harness setup issues, not application defects.

Final backend sanitized log: `%TEMP%\campusconnect-services-10e-1793033219286.log`. Frontend log: `%TEMP%\services10e-frontend-final.log`. Build log: `%TEMP%\services10e-build.log`.

## Browser evidence and manual release checks

Artifacts are outside the repository under `%TEMP%\campusconnect-services-10e-{browse,detail,management,mobile,shell,teamup,teamup-detail,marketplace}`. Each suite writes screenshots and JSON evidence. Shell screenshots use deliberately long synthetic text. Selected desktop Dark workspace and mobile Light form/Dark workspace captures were visually inspected; this is not user visual approval.

Services fixtures cover Light/Dark widths 1920, 1440, 1366, 1280, 1024, 768, 430, 390, 360 and 320. Shell composition covers all listed widths except 1366. Mobile horizontal tabs, active reveal, keyboard focus, modal containment/Escape, reduced-motion mode, request errors and recovery are exercised in existing suites. 720px reflow is zoom-equivalent, **not native browser zoom**. Device virtual keyboards, actual notch safe-area insets, assistive technology and exhaustive contrast calculations remain unverified.

Before release, use a separately approved staging environment with two test students and one unrelated test student. Repeat publish→filtered discovery→request→accept→SERVICE message→complete; verify notifications, reload/back-forward and opt-out. Repeat suspended/hidden/archived/owner states; check no unrelated participant access. On real mobile hardware open the keyboard in request/form textareas, confirm final actions/dialog scrolling/bottom clearance and safe-area behavior. Check native 200% zoom, screen-reader announcements, both themes and final Step 10D.1 mobile visual sign-off.

## Residual integrity and operational risks

1. **JSONB relationships:** production HTTP booking append/review/complete paths use protected Services repository transactions. Admin writer changes moderation fields; demo seed create/delete paths are separate explicit maintenance tooling, not protected booking mutation APIs. External SQL, future writers or maintenance scripts can bypass duplicate/state/reference invariants: JSONB has no independent request uniqueness/FK/check constraints. Do not broaden the production-readiness claim to arbitrary writers. Relational redesign needs separate approval.
2. **Workspace volume:** two unpaginated service queries and JSONB expansion load all provided/requested histories. People lookup is batched, avoiding per-request identity queries, but history/payload grows without a bound. Initial rollout acceptability is conditional on measured account/history limits; none was provided or benchmarked. Do not claim high-scale readiness. Monitor query duration, returned rows, payload size and browser rendering; authorize pagination separately if needed.
3. **Rate limiting:** no Services-specific or general API rate limiter was found on these routes; landing-highlights has its own unrelated limiter. Request duplicate guards/body-size limit are not abuse throttles. Deployment-level throttling is unverified. Set a release policy for request/report/message abuse without silently adding endpoints/infrastructure.
4. **Environment:** source requires production `DATABASE_URL`, `FRONTEND_URL`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and Base64 32-byte `MESSAGE_ENCRYPTION_KEY`. Existing AWS settings are needed where the shared app uses media; no new Services media dependency. Keep encryption key stable/private with a recovery plan. Frontend public API/Supabase configuration must match staging; do not expose server keys.
5. **Database/deployment:** default `DATABASE_POOL_MAX=10`, `DATABASE_CONNECTION_TIMEOUT_MS=5000`; validate total multi-instance pool demand, Supabase pooler/transaction behavior, timeout/retry contention, TLS and least-privilege grants in staging. Local superuser tests cannot prove production grants, RLS, pooler configuration or full-schema compatibility. Normal builds/client generation do not prove deployed migration state.
6. **Monitoring:** `/health` is basic liveness, not demonstrated database/readiness monitoring. Operational request errors and notification failure logs exist; durable alerts, request latency/409/retry metrics, notification recovery and production dashboards were not exercised. Establish sensitive-data-safe logging and alert ownership.
7. **Recovery:** no current production backup/restore rehearsal was performed. Historical backup claims are not current evidence. Confirm an access-controlled pre-release backup including application data/migration history, encryption-key recovery and independently verified restore procedures before rollout. No backup contents were loaded into this synthetic environment.

## Files and scope confirmation

- Modified `backend/tests/services-security-postgres.test.ts`: two real HTTP/database journeys, notification/message fixture DDL, reusable isolated HTTP helper. No Prisma schema or migration change.
- Modified `frontend/tests/services-management-visual-fixture.ts`: optional `--shell` mode using actual AppShell/ThemeProvider and synthetic notification boundary; existing fixture mode retained.
- Created `frontend/tests/services-shell-browser-qa.mjs`: shell geometry/bottom clearance checks and screenshots.
- Created this report.

No application source, approved UI, backend contract, auth infrastructure, Prisma schema/migration, Supabase/AWS configuration or production record changed. No Git operations, deployment, dependencies or paid AI. Stop at Step 10E.
