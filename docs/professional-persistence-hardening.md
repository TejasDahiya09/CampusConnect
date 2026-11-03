# Step 13B.8B - Professional persistence hardening

Date: 2026-11-01. Source implementation and non-destructive checks only. No database connection, creation, migration, schema write or deletion was performed during this step. The PostgreSQL runner and integration suite were **not executed**. Professional storage was not enabled.

## Reliability and approved UI

The Step 13B.7 layout, stylesheet, identity cover, sections, completion, sidebar affix, global shell and navigation remain unchanged. Only professional retrieval, error, retry, save and conflict presentation changed.

- Initial loading, disabled storage, enabled empty storage, enabled populated storage, network failure, authentication/account failure and server failure are distinct. A failed GET does not become an empty saved record or a pending-storage response. Known previous details are retained during recoverable refresh failures.
- Retrieval failures have a functional Retry action. Professional loading remains independent of base Profile loading. Malformed success envelopes fail closed; a disabled/malformed save response cannot produce a success notice.
- A save notice appears only after a validated successful API response. Database persistence is still unverified until the authorized PostgreSQL tests run.
- Submission refs prevent duplicate calls, fields disable during saving, and Profile refresh/back controls cannot invalidate an in-flight professional save.
- The owner workspace still resets by account ID/status. Request sequence checks discard obsolete responses and prevent old GET results replacing a successful save.
- Whole-Profile refresh no longer unmounts the existing editor when a base Profile is already available. This fixes an additional source-confirmed draft-loss path.
- Clean editors use refreshed authoritative values. Dirty editors retain their draft and original version. A newer server version disables stale saving. Reloading fetches the latest state without overwriting the draft; the explicit **Use latest saved details (discard draft)** action is required to replace it. There is no silent merge or automatic destructive retry.

The editor still supports the same fields and collection limits. No new personal field, photo functionality or public visibility was added.

## Conditional replacement protocol

Routes and document bodies remain the same:

- `GET /api/profile/me/professional`
- `PUT /api/profile/me/professional`
- Body: `{headline, education, experience}` with the existing validation and limits.

GET and successful PUT now add `professional.version`: a SHA-256 digest of the canonical, validated document. An absent row has a distinct digest from an explicitly cleared document. Disabled storage returns `version: null` and does not query storage.

Enabled PUT requires `If-Match: "<64 lowercase hex characters>"`. Missing condition returns **428**, malformed condition **400**, and stale condition **409 PROFESSIONAL_CONFLICT**. The backend locks/rechecks the ACTIVE user, reads the current document, compares its version, and performs the upsert in one transaction. Competing first writes therefore compare against the absent-row version under the same user lock. A failed or conflicting write never reports success.

This extends the response additively but deliberately tightens enabled PUT: an old client without If-Match cannot overwrite data. Coordinate frontend/backend rollout before enabling the currently gated feature. It is not claimed to be backward-compatible with unconditional enabled writes.

No version column or speculative migration was added. This is content-state comparison, not a monotonically increasing revision or edit-history mechanism. Returning to identical canonical content returns the same digest; an identical-content update remains acceptable. There is no automatic merge, audit history or deduplication policy change.

Storage failures are converted to generic professional-storage errors before shared HTTP error logging. Unit coverage injects private error text and asserts it is absent from responses and captured logs. The prepared PostgreSQL test repeats this with an actual Prisma upsert CHECK failure and driver error logging enabled, capturing console output as well as HTTP logging. Driver-level privacy is not yet verified; this case may identify additional hardening required before storage can be enabled.

## JSON integrity and unapplied migration

File: `backend/prisma/migrations/20261101020000_native_professional_details/migration.sql`.

Previous SHA-256:

```text
7cac2c39c26075e0e1eaff88901185d2497c6f5d427f1c6e647f2b1e760e7c91
```

Revised SHA-256:

```text
8ed9e94167382e9c37086d6740a7e529482e457cdcaa17c1bda9ffc70ce0aa1f
```

The proposed table still has only `user_id UUID` (PK/FK) and `details JSONB NOT NULL`. Added four CHECKs to the original object CHECK:

1. Exactly the three required document keys.
2. Headline is JSON null or string.
3. Education is an array with at most five entries.
4. Experience is an array with at most five entries.

There are now five CHECK constraints total. Detailed entry keys, required names, text limits and trimming remain at the trusted API boundary. No SQL validation function/trigger was introduced. Arbitrary direct trusted-role writes can still violate entry-level application semantics; API reads fail closed on such documents. This is an explicit maintainability choice, not a claim of full SQL document validation.

Existing PK, cascading users FK, RLS and PUBLIC/conditional anon/authenticated revocations are retained. No defaults, secondary indexes, timestamps, data backfill or existing-profile columns changed. Prisma model parity is unchanged; Prisma validation does not execute or validate PostgreSQL CHECK behavior. All six historical migration files match their pre-step hashes.

## Prepared dedicated PostgreSQL runner

Files:

- `backend/tests/run-professional-postgres.mjs`
- `backend/tests/helpers/professional-test-safety.mjs` and its TypeScript declaration
- `backend/tests/professional-postgres.test.ts`
- `backend/tests/professional-test-safety.test.ts`

Guards:

- Exact target: `campusconnect_professional_test_13b8b_20261101_01`.
- Dedicated `PROFESSIONAL_TEST_DATABASE_URL`; no application URL or private-file fallback.
- Only PostgreSQL URL, user postgres, host `127.0.0.1`, explicit port `5433`, exact target path, no query/hash overrides.
- Explicit CLI creation approval, migration approval, exact target and exact SQL SHA checked before credential processing or connection.
- Historical prerequisite hashes checked and approved bytes retained for execution, preventing later rereads changing the approved input.
- PG service/environment variables are removed, not assigned empty strings. Child environment removes Supabase/AWS/AI, alternate test URLs, DIRECT_URL and the application readiness gate. Its application DATABASE_URL is an unreachable dummy; the actual repository under test receives the isolated Prisma client explicitly.
- Server address/port/PostgreSQL 17 verified before creation. A maintenance-session advisory lock excludes concurrent runs.
- Any existing target is refused, even if empty. A fresh template0 target must have an empty public schema before setup.
- Setup transaction creates citext, applies the six preserved historical SQL prerequisites and the exact proposed native migration. This is isolated fixture provisioning, not a production migration-history claim.
- The suite rechecks identity/hash and refuses any preexisting public-table records before inserting synthetic users.
- Cleanup is enabled only after safety checks pass, rechecks target/server identity and deletes only the synthetic user IDs created by the suite; FK cascades remove their dependent fixture rows.
- **No database DROP, reset or automatic destructive recovery exists.** Schema/database remain for inspection after a run or failure. Reusing a retained target is refused.
- No cluster roles are created. Missing or unsuitable anon/authenticated roles mark the permission case **BLOCKED/skipped**, rather than passing it as superuser evidence.

The earlier read-only review verified a local PostgreSQL 17.11 server and found the proposed database absent, with Supabase-style roles absent. Those are historical preflight facts, not a new verification in this step. The runner must reverify everything immediately before any separately authorized execution.

## Prepared integration inventory - NOT RUN

Eighteen actual database cases are prepared:

1. Columns, named constraints, index count, RLS and absence of public policies.
2. Create/read through the real repository.
3. Update/read.
4. Clear all fields.
5. Persistence after reconnect.
6. Missing/malformed top-level documents rejected by SQL.
7. Maximum headline accepted and oversized headline rejected by API validation.
8. Maximum collection counts accepted; oversized collections rejected by SQL.
9. Unsupported fields/dates rejected without changing persisted data.
10. Independent owner documents and missing-base-Profile write denial.
11. Simultaneous first writes: one winner, one conflict, one persisted row.
12. Concurrent updates: one winner; stale writer rejected; persisted winner verified.
13. Failure after upsert rolls back the transaction.
14. Deactivation holding the user lock prevents a pending save; stored data stays unchanged.
15. Hard user deletion cascades.
16. Persisted professional additions excluded from public DTO construction.
17. Browser-role privilege denial and no-policy RLS exclusion even with a transactional SELECT grant, where suitable roles exist. Temporary grants roll back; no roles created.
18. Actual SQL failure returns a generic HTTP error, excludes private error text from logs, and rolls back the attempted update.

Concurrency tests inspect persisted state rather than response codes only. Deactivation synchronization uses a held database row lock and explicit query-entry signal, not timing sleeps. These assertions are prepared and typechecked, **not evidence that PostgreSQL execution has passed**.

## Validation actually executed

- Full frontend: **293 passed, 0 failed/skipped**.
- Relevant backend unit/contracts and pure runner-safety tests: **29 passed, 0 failed/skipped**.
- Frontend/backend TypeScript, ESLint, formatting, Prisma validation and production builds: passed.
- Professional reliability Chrome: distinct errors/loading/empty state, retry, retained save-failure draft, conflict/reload/discard, guarded successful mock save, duplicate click, whole-Profile refresh and account reset passed. Error states include desktop Light and mobile Dark, without horizontal overflow.
- Native professional Chrome: 30 synthetic viewport/theme/state cases plus existing mocked editor/link/failure/draft cases passed.
- Existing Profile Chrome: 20 viewport/theme cases plus editor/drafts/mutations, loading/error, clearance and reflow checks passed.
- Signature Profile Chrome: 18 viewport/theme cases plus six minimal captures and existing affix/keyboard/tall/mobile checks passed.
- AppShell: 20 viewport/theme cases and role/keyboard/history checks passed after the build completed. An initial concurrent-build attempt failed; no AppShell source change was made, and the rerun against stable built assets passed.
- Dashboard: 18 responsive cases, nine states and existing interaction assertions passed.
- Marketplace: 16 recorded responsive cases and existing interaction assertions passed.
- TeamUp, Services and Messaging: 20 responsive/theme cases each plus existing interaction assertions passed.

All browser evidence uses actual components and synthetic service adapters. It does not establish durable storage, a real authenticated session, production permissions or native 200% zoom. Existing reflow proxies are not native zoom verification. Full backend/AI suites were not run; the authorized relevant backend contracts were run. No database-mutating suite, including the new PostgreSQL suite, was invoked even to report skips.

## Changed files

Modified:

- `backend/src/modules/profile/professional-profile.ts`
- `backend/tests/professional-profile.test.ts`
- The single unapplied native professional migration listed above.
- `frontend/src/features/profile/professional-profile.ts`
- `frontend/src/features/profile/ProfessionalProfileCard.tsx`
- `frontend/src/features/profile/ProfessionalProfileForm.tsx`
- `frontend/src/features/profile/ProfileOverview.tsx`
- `frontend/src/features/profile/ProfilePage.tsx`
- `frontend/tests/professional-profile.test.ts`
- `frontend/tests/profile-visual-fixture.ts`

Created:

- The five backend runner/test/helper/declaration files listed above.
- `frontend/src/features/profile/useProfessionalProfile.ts`
- `frontend/tests/professional-reliability.test.ts`
- `frontend/tests/professional-reliability-browser-qa.mjs`
- This report.

## Separate execution authorization required

Authorize only the exact local target, citext and the six hashed historical fixture prerequisites plus revised native SQL hash above, synthetic test writes, and identity-checked synthetic-row cleanup. No production/Supabase operation, cluster-role creation, database deletion or readiness-gate enablement is included.

After that approval and secure provisioning of the dedicated URL, the prepared command from the repository root is:

```powershell
node backend/tests/run-professional-postgres.mjs `
  --target campusconnect_professional_test_13b8b_20261101_01 `
  --migration-sha256 8ed9e94167382e9c37086d6740a7e529482e457cdcaa17c1bda9ffc70ce0aa1f `
  --approve-create `
  --approve-migration
```

**Do not run this command under the current authorization.** Credentials must be supplied privately through PROFESSIONAL_TEST_DATABASE_URL and never printed or committed. RLS role coverage may remain blocked without separately approved suitable local roles. A failure leaves the verified disposable database intact for review; it is not automatically dropped/reused.

The source is ready for that isolated execution review. Real persistence, SQL execution, concurrency and deployed role readiness remain unverified. Photo upload, LinkedIn OAuth/API, public professional fields, Supabase/AWS, global AppShell and Step 13C remain out of scope.
