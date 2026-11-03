# Messaging Step 11B — security and integrity readiness

Date: 2026-10-26. Backend/security changes only; no Messaging UI modernization.

## Verdict

The scoped local security/integrity gate passes. This is not unconditional production approval: real Supabase-authenticated staging, deployment transport behavior, load/abuse controls and key/backup operations remain unverified. No production database or real student messages were accessed.

## Confirmed findings and disposition

| Finding                                                                        | Classification                    | Correction/evidence                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------ | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Non-Service identity projection ignored account/profile visibility             | FIXED                             | All conversation and sender projections use existing `servicePerson` privacy rules; ID retained, restricted name/avatar/department redacted. PostgreSQL tests cover account states and all supported contexts                    |
| Cached message notification titles/descriptions could outlive privacy changes  | FIXED                             | Notification DTO mapping uses generic message titles and null descriptions, including legacy MESSAGE rows; conversation destination retained. No stored history rewritten                                                        |
| Socket handshake-only eligibility and expiry                                   | FIXED                             | Verified JWT with required expiration, ACTIVE authoritative account, expiry timer, per-emission revalidation, periodic idle revalidation and bounded auth timeout; synthetic socket and real PostgreSQL account-revocation cases |
| Marketplace inactive seller could be targeted                                  | FIXED                             | ACTIVE target/actor locks and seller status predicate inside creation transaction; negative PostgreSQL cases                                                                                                                     |
| New-conversation eligibility check/write gap                                   | FIXED                             | SERIALIZABLE transaction, sorted account locks, context share locks, authoritative eligibility recheck and bounded real conflict retries; deterministic snapshot barriers verify five eligibility races                          |
| Existing-context reuse accidentally depended on new eligibility                | FIXED                             | Exact existing participant identity can be retrieved by an ACTIVE actor after sale, moderation, membership removal or completion/archival; new identities remain restricted                                                      |
| Post-commit metadata/event failures caused false send failure                  | FIXED                             | Synchronous event failures and notification metadata/persistence failures isolated after commit; logs contain message ID, not message body; PostgreSQL regression verifies committed response                                    |
| Ambiguous send retries could create another message                            | FIXED for optional keyed contract | Existing message UUID PK provides durable identity, validated against conversation/sender/canonical text; concurrent retries return one row and no repeated event/notification                                                   |
| Blanket conversation read marking                                              | FIXED                             | Signed exact fetched-message receipt; user/conversation bound, 15-minute expiry, maximum 100 IDs; no client timestamp trust; real latest-50, concurrent arrival, older page and overlapping acknowledgment cases                 |
| Participant IDOR, sender derivation, encrypted storage                         | ALREADY PROTECTED, strengthened   | Existing participant lookup and server-derived sender preserved; write transaction rechecks ACTIVE pair and actual conversation; AES-256-GCM/version 1 unchanged                                                                 |
| LOST_FOUND operational messaging                                               | ALREADY PROTECTED                 | Open validator still rejects unsupported context; no new integration                                                                                                                                                             |
| Production/staging auth and UI browser journey                                 | BLOCKED                           | No dedicated isolated Supabase identity environment supplied; no real student accounts used                                                                                                                                      |
| Inbox pagination, reconnect catch-up, live read synchronization, rate limiting | UNRESOLVED                        | Intentionally outside this backend correction; preserve for approved later scope                                                                                                                                                 |

## Endpoint and permission matrix

All paths and success/error envelopes remain. HTTP uses existing Supabase JWT verification plus current ACTIVE application-account middleware. No moderator/admin bypass.

| Endpoint                           | Authorization                                                                   | Contract                                                                                                                                |
| ---------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| GET `/api/messages`                | Current participant                                                             | Existing conversations/unread DTO; privacy-safe person/context projections                                                              |
| POST `/api/messages/conversations` | ACTIVE actor; exact historical identity, or currently eligible new pair/context | Existing `{conversation}`, 201 for create/reuse                                                                                         |
| GET `/api/messages/:id`            | Current participant                                                             | Existing `{messages}` plus additive opaque `readReceipt`; page/limit semantics preserved; page capped at 1,000,000/safe integer         |
| POST `/api/messages/:id`           | Participant; authoritative ACTIVE sender and receiver checked in transaction    | `{text, clientMessageId?}`; existing `{message}`, 201; invalid/conflicting key fails safely                                             |
| PATCH `/api/messages/:id/read`     | Participant, current ACTIVE actor, valid signed fetched-set receipt             | **Required** `{readReceipt}`; returns existing `{updated}`. Old empty-body acknowledgments fail 400 rather than marking everything read |

`DIRECT`: two distinct ACTIVE accounts for creation. `MARKETPLACE`: VISIBLE ACTIVE listing, exact seller and ACTIVE pair. `TEAMUP`: existing current-member/owner, visible project, ACTIVE pair/owner rules preserved. `SERVICE`: VISIBLE service and ACCEPTED/COMPLETED request, exact provider/requester pair and actual request ID. No new lifecycle restrictions on legitimate accepted historical collaboration.

Existing history is preserved. An ACTIVE participant may retrieve an existing conversation even when its peer becomes inactive; restricted peer identity is redacted. New sends require both accounts ACTIVE. Historical retrieval does not reapply new-context eligibility. No message is deleted or re-encrypted.

## Transaction and database guarantees

`runMessagingTransaction` uses SERIALIZABLE isolation, 2-second max wait, 5-second transaction timeout, and at most three attempts for Prisma serialization/deadlock codes P2034 or P2010 wrapping 40001/40P01. Exhaustion becomes `MESSAGING_CONCURRENCY_CONFLICT` / HTTP 409. Unrelated errors are not blindly retried. P2002 recovery separately reruns an authoritative lookup after a unique identity collision.

Accounts are locked in sorted UUID order. New contexts lock the relevant Marketplace/TeamUp/Services row and recheck actual eligibility. TeamUp's separate owner account is included when applicable. Changes committed after the initial snapshot are retried/rechecked, not accepted on stale eligibility. Existing conversation retrieval checks only the current actor's eligibility, preserving historical policy.

Sending rechecks the participant pair and stored context, then inserts encrypted content and updates activity in one transaction. Socket/notification effects occur only after commit and only on the newly created result. Read updates target only signed IDs, the actual conversation, recipient and unread rows, inside an ACTIVE-account transaction.

Database-enforced: message PK, conversation pair/context unique identity, canonical participant and context-key CHECK constraints, user/conversation FKs. Application-enforced: valid context relationships, sender/receiver matching and idempotent payload binding. Polymorphic context IDs and Services JSONB request IDs still lack typed cross-table FK guarantees. Independent SQL writers can bypass application invariants; no schema change is introduced here.

## Durable send retry contract

Use an optional UUID `clientMessageId`. It becomes the existing `Message.id`, whose PostgreSQL primary key already enforces uniqueness. No new column/index/migration is needed.

- First submission persists ciphertext normally.
- Same UUID + same conversation + same authenticated sender + same trimmed text returns the persisted current result.
- A different sender, conversation or text with that UUID receives `MESSAGE_IDEMPOTENCY_CONFLICT` / 409 without disclosing the prior text.
- Concurrent retries yield one row and one initial event/notification attempt.
- Existing clients omitting the UUID still work, but separate requests remain separate messages. They do **not** gain durable idempotency.
- Minimal frontend logic retains an attempt UUID after an ambiguous error for an unchanged conversation/text; changed payload/context gets a new ID. A send lock prevents concurrent submission. Late completion does not clear another thread's draft.

The attempt ID is not persisted across a page reload. Reusing it after reloading is the caller's responsibility; the backend guarantee lasts while the message row exists. Future message deletion/retention requires revisiting retry retention. Retries do not replay failed best-effort side effects; there is no outbox/recovery guarantee.

## Authoritative read receipt

History issues an HMAC-SHA256 receipt covering exactly the returned message UUIDs, current user, conversation and expiration. A domain-separated derived key uses the existing backend encryption secret; AES encryption/key custody and stored format remain untouched. Verification uses constant-time signature comparison.

The server does not trust arbitrary client timestamps or a blanket upper watermark. A page receipt acknowledges only its fetched set, so older unfetched messages and newer concurrent arrivals remain unread. Receipt replay is idempotent, wrong user/conversation or tampering is rejected, and an empty fetched page safely updates zero rows. Expired receipts require fetching again.

This means **acknowledged fetch**, not proof of visual reading. The frontend acknowledges after receiving the actual history page. Incoming socket events trigger a new authoritative page fetch before read marking; the old unchecked socket read call is removed. A receipt grants no new conversation authorization.

Compatibility: backend/frontend changes must ship together for read acknowledgments. Old clients can still read history/send, but their empty-body read request receives validation error and leaves unread state intact. New send IDs are optional; other DTOs/routes/navigation remain compatible.

## Socket guarantees and limits

Production connection verification uses existing Supabase signature/issuer/audience verification, then reads the expiration from that same verified token and resolves the authoritative ACTIVE database user. Missing/invalid/expired tokens, missing expiration and inactive accounts fail closed. Client-provided user IDs/room requests are ignored; only the server assigns identity rooms.

Each connection has an expiration timer. Every private message/notification delivery reauthenticates the recipient session and checks expiration again immediately before emitting; no positive eligibility cache. An idle session is revalidated every 30 seconds. Authentication operations have a 5-second timeout and fail closed. Default idle invalidation is therefore up to approximately 30 seconds plus lookup time (bounded by 5 seconds), subject to event-loop scheduling. An event attempted sooner is checked before delivery rather than waiting for that interval.

These are not instantaneous, globally atomic revocation guarantees: a status change can race immediately after the final database lookup. Timers also depend on a functioning event loop. External database status changes are covered by authoritative lookups, not only process-local events. Database unavailability suppresses delivery/disconnects the session.

Disconnect/server-close cleanup removes session credentials, expiry/revalidation timers and event listeners. No plaintext/token is logged. Slow underlying database/JWKS work cannot deliver after timeout, although a timed-out underlying operation is not forcibly cancelled by Promise.race.

The existing frontend does not yet implement fresh-token reconnect following a server-forced disconnect; reopening the page/connection restores eligible sessions. Existing reconnect catch-up and multi-instance event distribution remain separate work. No new Socket.IO transport, queue or infrastructure was added.

## Privacy and notifications

All four supported inbox contexts reuse the existing account/profile moderation projection: only ACTIVE + VISIBLE profiles expose permitted name/avatar/department. Internal IDs remain stable. Context title/path resolution also requires visible content and ACTIVE owning account; unavailable contexts receive generic labels/null paths.

Message-notification DTOs always use generic titles and no cached description, including existing MESSAGE rows. This avoids re-exposing old names/context titles after moderation without rewriting historical notification storage. Conversation links and deterministic event-ID deduplication remain. Message plaintext is not included in notification metadata.

Post-commit event or metadata/persistence failures cannot change a committed message response. Failure logs contain only safe identifiers. Notification creation is still best-effort: a message can exist without its notification. Delivery is not transactional with message storage and there is no durable replay/outbox.

## Isolated verification and actual results

`node backend/tests/run-messaging-postgres.mjs` provisions a fresh `campusconnect_messaging_test_*` database. It parses the ignored private `.env.teamup-test.local` file, uses its explicit local test credential only, verifies PostgreSQL 17 on 127.0.0.1:5433, validates the fresh target identity and zero public tables, then launches child tests with normal dotenv loading disabled and all imported clients pinned to that isolated target. It never reads normal app DATABASE_URL. Logs redact credentials/URLs/key material. Existing TeamUp/Services databases are not opened or reset; disposable databases are retained. Tests close Prisma/pools/sockets and remove their test-only fault triggers/functions/sequences.

The synthetic schema includes actual conversation uniqueness/canonical/context CHECK rules plus relevant application tables. It is not a full Supabase migration/RLS/grant rehearsal. Synthetic JWT identity adapters are explicitly separate from real Supabase authentication.

| Check                                                    | Result                                                                                                                                                                                                                        |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Messaging PostgreSQL                                     | 33 passed, 0 failed/skipped, including deterministic snapshot races, concurrent sends/read acknowledgments, primary-key retry reconciliation, actual HTTP retry/read validation and HTTP 409 on real serialization exhaustion |
| Socket integration                                       | 14 passed: active/missing/invalid/expired/inactive identity, expiry while connected, before-emission revocation, idle multiple-session revocation, room spoofing and stalled-auth fail-closed behavior                        |
| Read receipt unit tests                                  | 4 passed: binding, tampering/wrong key, expiry, limits/empty set and invalid key configuration                                                                                                                                |
| Messaging validation                                     | 4 passed                                                                                                                                                                                                                      |
| Encryption                                               | 3 passed; AES-256-GCM/version 1 compatible and unchanged                                                                                                                                                                      |
| Full backend                                             | 439 total: 384 passed, 0 failed, 55 skipped                                                                                                                                                                                   |
| Backend skip explanation                                 | 33 Services opt-in PostgreSQL cases run separately below; 21 TeamUp opt-in PostgreSQL cases and 1 live Lost & Found FastAPI test intentionally not invoked                                                                    |
| Separate Services PostgreSQL regression                  | 33 passed, 0 failed/skipped on a separate fresh Services database                                                                                                                                                             |
| Full frontend                                            | 253 passed, 0 failed/skipped; no UI layout changes                                                                                                                                                                            |
| Backend/frontend lint, TypeScript, formatting and builds | Passed: both ESLint/typechecks/builds and repository Prettier check; zero lint warnings                                                                                                                                       |

The full run includes ordinary Marketplace/TeamUp/Services/auth/profile/notification regressions. No skipped case is counted as a pass. Socket unit tests use synthetic verification; an additional PostgreSQL socket case changes actual account status using SQL and verifies both sessions disconnect without private delivery. The test process never accesses real Supabase.

Focused runner: 58 passed, 0 failed/skipped (`%TEMP%\campusconnect-messaging-11b-1793038444555.log`).

Final backend log: `%TEMP%\campusconnect-messaging-11b-1793038192878.log`. Services regression log: `%TEMP%\campusconnect-services-10e-1793037718173.log`. Synthetic databases and sanitized logs are local only.

## Files created and modified

Created:

- `backend/src/modules/messaging/messaging-policy.ts`
- `backend/src/modules/messaging/messaging-read-receipt.ts`
- `backend/tests/messaging-security-postgres.test.ts`
- `backend/tests/messaging-read-receipt.test.ts`
- `backend/tests/run-messaging-postgres.mjs`
- `docs/messaging-security-readiness.md`

Modified:

- Messaging repository, service, controller, routes, validation and socket implementation.
- `backend/src/modules/notifications/notifications.repository.ts`
- `backend/tests/messaging-realtime.test.ts`
- `backend/tests/messaging-validation.test.ts`
- `backend/tests/services-security-postgres.test.ts` — one expectation updated for explicitly approved existing historical conversation reuse; new contexts still denied.
- `frontend/src/features/messaging/messaging-service.ts`
- `frontend/src/features/messaging/MessagesPage.tsx` — API/read/retry compatibility only; JSX/layout unchanged.
- `frontend/tests/messaging.test.ts`

No Prisma/schema/migration, Supabase, AWS, auth infrastructure, AppShell, approved module UI or encryption-format change. No dependencies, production writes, Git operations, deployment or paid AI. No Step 11C work.

## Remaining release gates

- BLOCKED: real Supabase-authenticated staging journeys; no safe isolated staging identities supplied.
- UNRESOLVED: unpaginated inbox/N+1 context queries, rate limiting/abuse policy, reconnect/catch-up, client token renewal after forced disconnect, live read receipts and multi-instance distribution. These were not represented as fixed.
- UNVERIFIED: production load, external notification delivery, actual browser/mobile behavior, least-privilege/RLS/pooler compatibility and current backup/restore readiness.
- Key rotation, encryption-key backup custody and message retention remain separately approved operational work. Stored ciphertext is server-side encrypted, not end-to-end encrypted.

Stop at Step 11B. Await review before any Messaging UI modernization.
