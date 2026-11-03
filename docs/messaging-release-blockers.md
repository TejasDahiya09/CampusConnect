# Messaging release-blocker remediation — Step 11F

Date: 2026-10-31. CampusConnect. No deployment or production approval.

## 1. Initial findings and root causes

Read the Step 11B security, 11C UI, 11D reliability and 11E final-readiness reports and inspected the current routes, controller, repository, service, validation, models/indexes, socket lifecycle, notifications, frontend reconciliation, PostgreSQL runner and Chrome fixtures. Findings were verified against source rather than inferred from mockups.

| Finding                                        | Initial evidence                                                                                                                                                                     | Disposition                                                                                                            |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Late commit omitted behind forward anchor      | `messages` recovery sorts native `created_at, id`; these represent row ordering, not commit visibility. Held transaction reproduction passed before edits in a fresh local database. | MITIGATED: authoritative bounded recent reconciliation supplements forward recovery.                                   |
| Unbounded inbox and N+1 unread/context queries | `messagingRepository.list` fetched every conversation; service filtered after fetching/decryption. Step 11E measured N+6 queries for DIRECT.                                         | FIXED: bounded database-selected pages, server-side privacy-safe search/filtering and batched projections/counts.      |
| No protected Messaging request quota           | Only public-highlights and moderation-specific controls existed.                                                                                                                     | FIXED within one process: independent authenticated account/action limits. Distributed enforcement remains unresolved. |
| Backup/key recovery unverified                 | Key is required in production; no current database-plus-key restore evidence was available for the configured project.                                                               | VERIFIED for a synthetic local dump/restore only; production custody/recovery remains unverified.                      |
| Real staging authentication                    | No explicitly authorized dedicated Supabase staging project/accounts identified. No staging-named backend environment file found.                                                    | BLOCKED: real Supabase-authenticated staging integration not exercised.                                                |

Affected paths: `backend/src/modules/messaging/{messaging.repository,messaging.service,messaging.controller,messaging.validation,messaging.routes}.ts`; `frontend/src/features/messaging/{MessagesPage,messaging-service,messaging.types}.tsx/ts`. Authentication middleware, encryption, receipts, notification emission, Socket.IO server, AppShell and cross-module interfaces retain their existing implementations.

## 2. Late-commit reproduction

`backend/tests/messaging-security-postgres.test.ts`, **11E known late-commit cursor omission reproduced against two real database transactions**, retains the original controlled failure:

1. Persist a baseline message.
2. Insert M in a held PostgreSQL transaction, with a controlled ordering key after baseline.
3. Commit N ordered after M, fetch N and advance the forward cursor.
4. Commit M.
5. A strict forward query from N omits M; persisted history contains M.

The pre-change focused run executed 70 tests successfully, including this known-failure reproduction, on `127.0.0.1:5433`, PostgreSQL 17.11. This did not mean recovery was correct. The extended test now additionally asserts that recent reconciliation returns M and identity deduplication preserves the complete fetched set. Separate real-database cases cover two delayed rows, equal timestamps, repeat reconciliation, invalid boundaries and the explicit 1,000-record limit.

## 3. Recovery design and guarantees

**MITIGATED, not an absolute commit-log guarantee.** The existing forward cursor endpoint remains compatible. An additive `mode=recent` reads newest-first using native timestamp/UUID cursor ordering. `after=start` begins a descending scan; subsequent anchors remain conversation-bound. Optional `floor=<message UUID>` restricts reconciliation to the loaded history interval. The floor must belong to the authorized conversation; the database timestamp is read from that row. Prisma represents the floor timestamp at millisecond precision, so rows in the same truncated millisecond can also be included; this conservative overlap is deduplicated by ID.

The frontend performs at most ten 100-record recent pages, then its existing at-most-ten-page forward catch-up. Recent anchors never overwrite forward progress. Existing `mergeMessages` gives chronological timestamp/ID order and one visible message per persistent ID. Signed receipts cover only records actually returned by the authorized endpoint. No plaintext recovery cache/log, new message IDs or speculative delivery receipt was introduced.

Recent reconciliation is armed on transport failure, online/visible return and a **60-second visible, online active-thread timer**. It is not re-run for every incoming message. An initial socket connection does not itself request a full recent scan. A failed overlap re-arms the next attempt. Concurrent invalidations retain existing coalescing/trailing-run and identity/version guards. Timers are cleared on unmount; hidden/offline tabs make no timer-driven recovery calls. Requests retain timeout and transient network/server retry behavior.

Existing earlier-history pagination remains in place. A loaded-window floor avoids automatically pulling the entire old thread into the initial 50-message presentation. When readers are scrolled up, recent reconciliation preserves a visible message element's position; older-page loading retains the existing prepend anchor. Socket/HTTP arrivals merge without duplicates or focus theft.

## 4. Remaining recovery limitations

- A completed recent pass can discover a late-committed row **if it is within the loaded interval and the newest 1,000 scanned records when encountered**. A commit after its region was scanned requires another pass. The original controlled race and multiple delayed-row database cases recover successfully.
- Rows older than that horizon or before the loaded interval are not promised automatic recovery. Existing history remains available within its validated offset bound; explicit recent/forward cursor requests can traverse deeper history under the request quotas. Continuous arrivals and repeated interruptions can postpone discovery.
- The 1,101-row database regression deliberately proves that a ten-page pass returns only 1,000 rows and leaves older records outside its guarantee. This is not labelled gap-free replay.
- Forward catch-up still surfaces its existing continuation/error state after its own ten-page cap. Restarting a recent pass is safe because results merge by ID.
- A sequence allocated before commit would not solve commit ordering. An absolute replay guarantee needs a separately designed durable delivery log/acknowledgment model with transactional append and client reconciliation, retention and indexing. That requires schema/migration review and implementation beyond this authorization; no such migration was prepared or applied here.

## 5. Inbox query optimization

`messagingRepository.inbox` selects only a page of authorized conversation IDs and redacted context metadata using parameterized `Prisma.sql`. Participant profile search follows `servicePerson` rules: hidden/inactive identities search as the generic public name. Context title/path joins require visible records and ACTIVE owners/providers. SERVICE context identity remains the request ID stored in `bookings`; no service-ID substitution.

Only selected page IDs, plus at most one independently authorized deep-linked conversation, receive participant/latest-message projections. Two aggregate queries calculate bounded per-page counts and global per-context unread totals. The totals query returns only context aggregates, not all conversations. No per-row count/context round trips remain. Ciphertext is decrypted only for returned authorized previews.

Existing participant/activity, receiver/unread and conversation-history indexes support this implementation. No schema changes were required for the observed local datasets. A constant query count does **not** mean constant database work: search, global unread aggregation, activity sorting and the Services JSONB association still depend on dataset size. This is not a production capacity certification.

Optional future index proposals, **not created/applied**:

```sql
CREATE INDEX CONCURRENTLY idx_conversations_participant_a_activity
ON public.conversations (participant_a_id, updated_at DESC, id DESC);
CREATE INDEX CONCURRENTLY idx_conversations_participant_b_activity
ON public.conversations (participant_b_id, updated_at DESC, id DESC);
```

Assess these against representative query plans before approving an additive migration; they may replace or duplicate existing participant indexes. JSONB Services lookup performance requires separate plans before proposing a GIN index. No index necessity is inferred solely from small local timings.

## 6. Before/after performance measurements

The same isolated synthetic DIRECT datasets have one encrypted latest message per conversation. The benchmark reproduces the former unbounded relation/unread query pattern and its privacy-safe DTO, then measures the bounded replacement. HTTP samples use the same authenticated local controller path; a test-only method adapter supplies the former implementation for the before measurements. No production path contains that adapter.

One warmup plus five sequential samples; reported p95 is the coarse maximum of five. Repository latency includes database round trips, mapping and decryption; HTTP latency also includes synthetic authentication, transport and serialization. Pool maximum is four. No concurrent-user capacity is extrapolated.

| Conversations | Queries before / after | Repository p50 before / after (ms) | Repository p95 before / after (ms) | Returned before / after |
| ------------- | ---------------------- | ---------------------------------- | ---------------------------------- | ----------------------- |
| 10            | 16 / 9                 | 7.37 / 7.81                        | 25.11 / 10.96                      | 10 / 10                 |
| 100           | 106 / 9                | 29.16 / 7.88                       | 32.37 / 11.31                      | 100 / 30                |
| 500           | 506 / 9                | 137.45 / 6.27                      | 180.45 / 7.64                      | 500 / 30                |

| Conversations | HTTP p50 before / after (ms) | HTTP p95 before / after (ms) | HTTP response bytes before / after |
| ------------- | ---------------------------- | ---------------------------- | ---------------------------------- |
| 10            | 9.34 / 9.24                  | 12.92 / 10.47                | 6330 / 6348                        |
| 100           | 32.92 / 9.15                 | 43.58 / 15.19                | 62132 / 19015                      |
| 500           | 157.93 / 9.69                | 167.58 / 37.15               | 310132 / 19015                     |

Raw evidence: `%TEMP%\campusconnect-messaging-11f-performance.json`. The earlier Step 11E benchmark remains a separate historical measurement; the updated old-size benchmark writes a distinct `11f-legacy-benchmark.json` artifact rather than replacing the 11E artifact.

## 7. Pagination API contract

Existing protected `GET /api/messages` retains `conversations` and `unread` and adds:

- Query `limit`: digit string 1–50, default 30.
- Query `cursor`: optional opaque encrypted token, maximum 2,048 characters, issued only by this endpoint.
- Existing `search`: at most 100 characters, literal case-insensitive public participant/context search, not message-body search.
- Existing `contextType`: validated existing enum.
- Query `selected`: optional UUID for an independently participant-authorized deep-link summary.
- Response `nextCursor`: token or null; `selectedConversation`: optional authorized summary.

Cursor payload is AES-GCM encrypted with a purpose-derived key from the existing configured key; no new environment secret or message-encryption-format change. It is bound to actor, search and context, has a 15-minute expiry and rejects tampering/noncanonical encoding, foreign accounts and changed filter scopes. It retains the native PostgreSQL timestamp text and UUID tie-breaker. No participant/search details are readable in the token. All inputs are validated and bound as SQL parameters. Unsupported query fields fail 400.

Sorting is `updated_at DESC, id DESC`. Under concurrent activity this is a live keyset, **not a cross-request snapshot**. A conversation updated above an already-consumed anchor reappears on first-page refresh; it is not guaranteed in that older scan. The frontend deduplicates appended pages and refreshes the authoritative first page on activity. Existing response fields remain compatible, but old consumers expecting every conversation in one call must adopt `nextCursor`; the default is intentionally bounded.

## 8. Frontend compatibility

`MessagesPage.tsx` uses the existing visual hierarchy and adds one shared-secondary **Load more conversations** button, with 44px minimum height and no flex shrinking. No cross-module or global shell presentation changed. Initial page 30, maximum server page 50. Loading state disables duplicate continuation requests; request-generation guards discard stale pages after search/filter/refresh. Failures retain the current data and cursor for an explicit retry; the existing Retry action refreshes page one. Authoritative refresh intentionally resets the loaded page window rather than appending stale ordering.

The `selected` summary preserves a deep link outside page one, including seller/context labels and existing permissions. Known selected conversations and drafts survive filtering. Incoming activity refreshes previews/unread totals; pages append with ID deduplication. The real two-tab database/browser fixture creates 35 synthetic conversations and verifies initial 30, continuation to 35, unique rows and selection outside page one. It captures Desktop/Mobile Light/Dark and a 320px Load more clearance/touch-target check.

## 9. Abuse policy and implementation

`createMessagingRateLimit` follows the project's `AppError`, no-store and Retry-After conventions without importing an unrelated public-IP quota or adding a dependency. It runs **after authoritative authentication/ACTIVE-account middleware** and before each controller.

| Action                    | Per-account requests / 60-second fixed window | Route                              |
| ------------------------- | --------------------------------------------- | ---------------------------------- |
| Open/reuse conversation   | 30                                            | POST `/api/messages/conversations` |
| Send, including retries   | 120                                           | POST `/api/messages/:id`           |
| Inbox/search/continuation | 120                                           | GET `/api/messages`                |
| History                   | 240                                           | GET `/api/messages/:id`            |
| Exact read acknowledgment | 240                                           | PATCH `/api/messages/:id/read`     |
| Forward/recent recovery   | 240                                           | GET `/api/messages/:id/updates`    |

Assumptions: normal students can send up to two messages per second averaged over a minute, open 30 contexts, refresh inbox twice per second and use multiple tabs. A maximum 20-request combined recovery cycle, plus acknowledgments, fits the separate read/recovery budgets; many simultaneously active tabs can exhaust an account budget and must wait. These are initial protective policies, not workload-derived production optima.

Exhaustion returns generic **429 MESSAGING_RATE_LIMITED**, `Retry-After` seconds and no content/user-existence information. Buckets key only authenticated application user ID and action. Malformed authorized requests still consume their action budget. Send retries retain the same `clientMessageId`, encryption and database idempotency; retries count toward quota but cannot create duplicate messages/notifications. Frontend reads no longer automatically retry a 429 after 250ms; the error remains actionable and the user can retry after the server's indicated window. Network/408/5xx retry behavior is preserved.

Pages are independently size-bounded. Offset history now rejects offsets above **100,000 records** before querying, avoiding the previous theoretical 100-million-row skip; the cursor routes offer bounded per-request traversal for deeper recovery. Existing page/limit semantics remain otherwise unchanged.

## 10. Rate-limit enforcement limitations

VERIFIED: deterministic-clock exhaustion/reset, concurrent permitted send burst, separate accounts/actions, missing authentication, generic error, Retry-After and pagination/cursor validation. Existing durable retry PostgreSQL cases still pass.

The limiter is process-local, resets on restart and is **not distributed enforcement**. Multiple instances multiply the effective budget. It stores at most 20,000 account/action buckets, expires them on a bounded periodic sweep, refreshes an expired caller bucket immediately and fails closed for new buckets at capacity without evicting active quotas. It retains no message body, token, arbitrary client identity or per-message retry cache. Authentication/JWKS work before this middleware still needs deployment-level abuse protection. No Redis, cloud service or new dependency was introduced.

## 11. Authentication and privacy regression

Existing real PostgreSQL and socket suites cover ACTIVE actors, participant-only history/send/read, context eligibility, hidden/inactive person redaction, historical context access, current-token handshake, expiry/revocation, private room delivery and reader-only invalidation. New cursor tests deny cross-account/context/tampered tokens. Search cannot match hidden profile names; generic redacted names remain searchable. An unauthorized `selected` ID yields no selected metadata.

DIRECT, MARKETPLACE, TEAMUP and SERVICE integrations remain exercised. LOST_FOUND operational messaging remains outside scope. No real Supabase credentials/accounts or production records were used.

## 12. Encryption preservation

AES-256-GCM version 1, random IVs, existing ciphertext/tag storage and `MESSAGE_ENCRYPTION_KEY` configuration are unchanged. No key rotation, re-encryption, plaintext storage or E2EE claim. Signed fetched-set receipts and stable server sender identity retain their implementation. Existing wrong-key/tamper/version tests pass. Inbox cursor encryption uses a distinct derived purpose key; it does not change historical ciphertext.

## 13. Backup/restore rehearsal

`backend/tests/messaging-restore-rehearsal.mjs`, invoked with `--phase11f --restore` only after a successful Messaging run, exports **only its newly created synthetic local test database** using installed PostgreSQL 17.11 `pg_dump -Fc`. No production dump was made. It restricts the output ACL to the current Windows account and SYSTEM; ACL failure blocks export. Credentials travel in child process environment, never CLI connection strings or logs.

The archive is listed using `pg_restore --list`, then restored with `--exit-on-error --no-owner --no-privileges` to a separately created database whose exact name, loopback host/port and zero public tables were verified first. It compares every fixture table's count and every ordered encrypted message record byte-for-byte, decrypts restored rows with the matching ephemeral test key and checks wrong-key rejection. No database was dropped/reset. The test key stays in memory and is not packaged or printed.

VERIFIED: `C:\Users\dahiy\AppData\Local\Temp\campusconnect-messaging-11f-restore-1793463439534`. Archive `synthetic-messaging.dump`: **439,309 bytes**, SHA-256 `f47ca20de356338b3f84458d02c8825c2c0de50bdd968a637c7e83dfa8fe479f`. **3,081 restored messages decrypted**, ciphertext byte-for-byte preserved, wrong key rejected; no export/restore warnings. All **9 fixture table counts** matched. Exact source `campusconnect_messaging_test_11f_1793463419940_1a68a014` and fresh restore `campusconnect_messaging_test_11f_1793463419940_1a68a014_r` are recorded in `results.json`.

This proves local ciphertext backup/restore and key compatibility, **not durable production key custody or a full Supabase project recovery**. The fixture database contains a deliberately small synthetic application schema, not `_prisma_migrations`, Supabase Auth/Storage, cloud media, grants, infrastructure, production backups or all application tables. A restored-row crypto check is separate from the application's participant-authorization regression. Real database-plus-matching-key custody, least-privilege restoration and recovery objectives still require an authorized operational rehearsal. Loss/replacement of the sole historical key remains unrecoverable without its protected copy.

## 14. Supabase staging readiness

**BLOCKED — Real Supabase-authenticated staging integration not exercised.** No authorized isolated staging project/users were identified. Environment file metadata and source configuration were inspected without opening production secrets or using the configured normal database. Synthetic identity/JWT/session adapters are not evidence of real refresh/JWKS/cross-tab SDK behavior. No project was created and no cloud credentials requested.

## 15. Files created/modified

Created:

- `backend/src/modules/messaging/messaging-inbox-cursor.ts`
- `backend/src/modules/messaging/messaging-rate-limit.ts`
- `backend/tests/messaging-abuse.test.ts`
- `backend/tests/messaging-restore-rehearsal.mjs`
- `docs/messaging-release-blockers.md`

Modified production files:

- `backend/src/modules/messaging/messaging.repository.ts` — bounded batched inbox, recent reconciliation.
- `backend/src/modules/messaging/messaging.service.ts` — compatible page/recovery integration.
- `backend/src/modules/messaging/messaging.controller.ts` — recent mode/window arguments.
- `backend/src/modules/messaging/messaging.validation.ts` — bounded pagination, cursors and history offsets.
- `backend/src/modules/messaging/messaging.routes.ts` — per-action authenticated quotas.
- `frontend/src/features/messaging/MessagesPage.tsx` — pagination, deep links, recent reconciliation, cleanup and scroll anchoring.
- `frontend/src/features/messaging/messaging-service.ts` — additive query arguments and no immediate 429 retry.
- `frontend/src/features/messaging/messaging.types.ts` — additive inbox fields.
- `frontend/src/features/messaging/messaging.css` — only the Load more minimum touch height/flex rule.

Modified tests/fixtures:

- `backend/tests/messaging-security-postgres.test.ts`
- `backend/tests/run-messaging-postgres.mjs`
- `frontend/tests/messaging.test.ts`
- `frontend/tests/messaging-reliability.test.ts`
- `frontend/tests/messaging-visual-fixture.ts`
- `frontend/tests/messaging-browser-qa.mjs`
- `frontend/tests/messaging-local-integration-browser-qa.mjs`

No Prisma schema/migration, backend authentication, encryption, shared socket, notification implementation, AppShell or approved cross-module interface was modified. The existing reliability-browser suite was run, not redesigned. Windows editing briefly introduced copy encoding corruption during this pass; it was corrected at source and rendered synthetic-copy checks were added before completion.

## 16. Complete test results

| Check                                     | Final result                                                                                                                           |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Complete backend                          | 459 total: **404 passed, 0 failed, 55 skipped**                                                                                        |
| Focused Messaging                         | **76 passed, 0 failed, 0 skipped**: 48 PostgreSQL cases, 15 socket, 4 validation, 4 receipts, 3 encryption, 2 abuse/cursor             |
| Services PostgreSQL                       | **33 passed**, no skips                                                                                                                |
| TeamUp PostgreSQL                         | **21 passed**, no skips                                                                                                                |
| Complete frontend                         | **267 passed**, no failures/skips                                                                                                      |
| Backend/frontend ESLint                   | Passed, zero warnings                                                                                                                  |
| Backend/frontend TypeScript               | Passed, including backend test types                                                                                                   |
| Formatting                                | Passed                                                                                                                                 |
| Backend/frontend builds                   | Passed, no new dependencies or Vite warnings                                                                                           |
| Messaging Chrome                          | 20 viewport/theme combinations plus interactions passed                                                                                |
| Two-tab synthetic transport Chrome        | 235-message gap, session/draft/read/logout passed                                                                                      |
| Real local PostgreSQL/HTTP/Socket Chrome  | 30-to-35 inbox pagination, selected deep link, Light/Dark, 320px clearance and five persisted/read messages with real reconnect passed |
| Marketplace Details Chrome                | 17 viewport/theme + 13 lifecycle/error states and gallery/actions passed                                                               |
| TeamUp Browse/Details Chrome              | 20 viewport/theme each, Details 15 states, discovery/workflows passed                                                                  |
| Services Browse/Details/Management Chrome | 20 viewport/theme Browse/Details each, 60 management cases plus workflows passed                                                       |
| Synthetic dump/restore                    | Passed with PostgreSQL 17.11 tools                                                                                                     |

The full run's 55 skips are 33 Services DB + 21 TeamUp DB + one live Lost & Found/FastAPI integration. The first 54 passed separately on their own fresh databases; the unrelated live FastAPI case was not run. Focused tests overlap the full suite and are not additional unique passes.

Command evidence: `%TEMP%\cc11f-{all,focused,frontend,services,teamup}.log` and runner-reported sanitized logs. No normal dotenv-loaded backend test command was used against an application database.

Commands from repository root:

```powershell
node backend/tests/run-messaging-postgres.mjs --phase11f --all --restore
node backend/tests/run-messaging-postgres.mjs --phase11f
node backend/tests/run-messaging-postgres.mjs --phase11f --services
node backend/tests/run-messaging-postgres.mjs --phase11f --teamup
npm test --workspace frontend
npm run lint --workspace backend
npm run lint --workspace frontend
npm run typecheck --workspace backend
npm run typecheck --workspace frontend
npm run format:check
npm run build --workspace backend
npm run build --workspace frontend
```

All database runs use fresh `campusconnect_*_test_11f_*` databases, private `.env.teamup-test.local`, loopback/port/version/name/empty-schema checks and pinned child clients. Normal application DATABASE_URL is never a database target. Environment inheritance removes normal Supabase/AI/AWS credentials and uses synthetic configuration. Test servers, sockets and pools are closed; disposable databases are retained. Prisma client generation is sequential. Earlier failed development runs are not represented as final passing evidence.

## 17. Browser screenshots and visual preservation

Actual Messaging/AppShell components are exercised in isolated Chrome at 1920/1440/1366/1280/1024/768/430/390/360/320, both themes. The existing workflow suite covers drafts, pagination, reader scroll anchoring, errors, keyboard semantics and bottom navigation. The two-tab synthetic transport suite retains 235-message catch-up, refresh/session lifecycle, unread invalidation and logout checks. A separate stronger two-tab test uses real HTTP, Socket.IO, Prisma and PostgreSQL; only authentication/session identity is synthetic. This test adds actual paginated inbox Light/Dark screenshots and 320px target/clearance assertions.

Compared eight standard inbox/conversation captures (1440/390, Light/Dark) against the Step 11C baseline: **five pixel-identical**, two desktop inbox captures differ by only **4 and 5 corner pixels**, and mobile Dark inbox differs in a **4px right-edge strip** (3,288 pixels); component-region layout/overflow checks pass. The edge difference is recorded rather than called a perfect image match. Standard fixtures contain no continuation control; separate actual-database screenshots show the new control with 35 conversations.

A previous 53-file presentation hash baseline shows only the two authorized Messaging presentation files changed; **51 other files match**, including global and cross-module presentation. No shared style token changed. Reviewed actual Desktop Light and 320px Dark Load more screenshots: shared secondary styling, separate scrollable rows and button above bottom navigation. Actual local fixtures assert the button is at least 44px high and does not overlap navigation.

Previous MessagesPage bundle: **14.86 kB / 5.31 kB gzip**. Current production build output:

```text
dist/assets/MessagesPage-BXqbjgP9.css                   7.79 kB │ gzip:  2.02 kB
dist/assets/index-DB5c0RLi.css                        142.95 kB │ gzip: 25.38 kB
dist/assets/MessagesPage-BBmyVaZc.js                   16.73 kB │ gzip:  5.77 kB
dist/assets/index-DHmKhtGS.js                         131.70 kB │ gzip: 40.48 kB
```

MessagesPage grows by about 2 kB uncompressed JavaScript; CSS adds only the functional minimum-height rule. No new library or animation. The copy encoding introduced during Windows editing was corrected; real browser assertions check visible text and placeholders.

Artifacts: `%TEMP%\campusconnect-messaging-11f-qa`, `%TEMP%\campusconnect-messaging-11f-integrated-browser`, and `%TEMP%\cc11f-{marketplace,teamup-browse,teamup-detail,services-browse,services-detail,services-management}`. The interaction fixtures use synthetic data and do not establish real staging authentication. Native 200% zoom, physical mobile keyboard/safe-area hardware, OS sleep/wake and production network behavior remain unverified. CSS viewport reflow is a narrower claim.

## 18. Remaining blockers

1. **MITIGATED:** late-commit automatic recovery has a defined loaded-window/1,000-record horizon; absolute delayed-commit replay remains unresolved without a separately approved durable design.
2. **BLOCKED:** real Supabase-authenticated/deployed staging, domain CORS/WSS, refresh/revocation and SDK cross-tab behavior.
3. **UNRESOLVED:** distributed fan-out and distributed rate quotas; current architecture remains a single backend process. Restart clears limiter state.
4. **UNRESOLVED operational verification:** actual database/key custody, protected backups, full-schema/grants recovery, monitoring/alerts and recovery objectives. Synthetic restoration does not certify these.
5. **MITIGATED:** bounded inbox responses/round trips; unread aggregation/search/JSONB lookup cost still needs representative production-like plans and load tests. No capacity claim.
6. Existing best-effort notification persistence/no outbox and session-only frontend send-attempt memory remain documented limitations. No outbox or unrelated feature was implemented.

## 19. Updated release-readiness verdict

**Level 2 — Local integration verified within documented bounds. No Level 3 staging verification or Level 4 production release approval.**

The scoped engineering blockers have bounded, tested remediation or explicit remaining limitations. The approved Messaging presentation is preserved apart from the requested functional continuation affordance. No Git operations, deployment, production access/writes, schema migrations, key rotation, dependency installation, cloud changes or paid inference occurred. Stop after Step 11F; no next module was started.
