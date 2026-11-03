# Professional Profile: authenticated integration readiness (Step 13B.8D)

**Historical Step 13B.8D report:** its maintenance-lock connection and nine-behavior database inventory are superseded by [Step 13B.8E.1 target-only readiness](professional-http-target-only-readiness.md). No earlier database execution claim is added.

Status: preparation only. Storage remains disabled. No database-backed HTTP suite, migration, role/grant operation, or enablement was executed during this step.

## Verified baseline

Read-only inspection on 2026-11-01 verified PostgreSQL 17.11 at `127.0.0.1:5433`, database `campusconnect_professional_test_13b8b_20261101_01`, owner/current/session role `postgres`. All 13 application tables contain zero rows. The prior Step 13B.8C.3 cleanup therefore remains intact. Its evidence reports 17 passed repository/database cases and one restricted-role case blocked; those are historical results, not newly executed database tests.

The native migration is unchanged:

- `backend/prisma/migrations/20261101020000_native_professional_details/migration.sql`
- SHA-256: `8ed9e94167382e9c37086d6740a7e529482e457cdcaa17c1bda9ffc70ce0aa1f`
- Native table: `professional_profiles`; RLS enabled, FORCE RLS false, owner-only table ACL.
- Local roles `anon`, `authenticated`, and `service_role` are absent. Their live permission behavior remains untested.
- The retained synthetic schema has no Prisma migration-history table. It is not an application migration-deployment target.
- `PROFILE_PROFESSIONAL_STORAGE_READY` is unset/default-disabled; no environment file was changed.

The versioned `backend/tests/fixtures/professional-retained-schema.json` contains schema metadata only, never student rows or credentials. Relation/type/function inventories were compared with the previous run's residual-object report before capture. It pins columns/defaults, constraints, index definitions, enums, relation ACL/RLS/ownership, routine definitions/ACL/security configuration, public catalog objects, public schema ownership/ACL, triggers, policies, extensions and derived TOAST identities. Other non-public objects must pass the existing PostgreSQL template/extension rules.

Approval digest of the decoded snapshot (`schemaDigest`, not the pretty-printed file SHA):
`f740d00108fe0ba6716cef050c0f209f831b2261bd17234aa38a139a3e2289ee`.

This is an exact retained-instance fingerprint, including object OIDs. It is intentionally unsuitable for a different/recreated database. Drift must stop execution, never automatically regenerate an approval fingerprint or repair a database.

## Actual HTTP contract

| Route                              | Behavior                                                                                                                                                                                                                                                         |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/profile/me/professional` | Real authentication middleware requires a verified token and an ACTIVE database account. Returns 200 with `{professional:{available,details,version}}` inside the normal success envelope. Owner identity comes from authentication, never a caller-supplied ID. |
| `PUT /api/profile/me/professional` | Same authentication, complete-document validation, quoted `If-Match` comparison, transactional ACTIVE/profile recheck and upsert. Returns authoritative saved details/version on 200.                                                                            |
| `GET /api/profile/:userId`         | Existing public profile projection. ACTIVE and moderation visibility rules still apply. Native professional additions and private email are not included.                                                                                                        |

- Missing/malformed/forged authentication: 401; suspended/deactivated account: 403.
- Disabled GET: 200, `{available:false,details:null,version:null}`; disabled PUT: 503 `PROFESSIONAL_STORAGE_PENDING`, no professional repository query.
- Malformed/unknown document fields, unsupported lengths/collection sizes or malformed If-Match: 400.
- Missing If-Match on an otherwise valid save: 428 `PROFESSIONAL_VERSION_REQUIRED`.
- Stale version: 409 `PROFESSIONAL_CONFLICT`, committed document preserved.
- Storage failure: generic 503 `PROFESSIONAL_STORAGE_ERROR`, no private SQL/document text returned.
- Responses are private/no-store.

The version is a SHA-256 of the validated canonical complete document, with a distinct digest for no stored row. The client sends it as a quoted If-Match value. The existing transaction locks the authenticated user, rechecks ACTIVE account and profile, compares the current digest, then writes. No revision column or schema change is introduced. This is content-based optimistic concurrency; an A-to-B-to-A edit has the same version as A, rather than providing monotonic edit history.

Supported document fields: nullable headline (180 characters); up to five education entries (institution required, qualification, each 180); up to five experience entries (role required and organization, each 180; description 1000). No dates or invented profile fields.

## Controlled authentication and HTTP evidence

`professional-http-app.ts` uses real Express routers, validators, response/error middleware and `createAuthenticationMiddleware`. A cryptographically signed local HS256 token has a per-fixture random key, pinned issuer/audience, expiry and algorithm. Verification calls `jwtVerify`; the middleware then looks up and checks the account. Tests do not assign `req.auth` or remove authorization.

This is a controlled test-auth mechanism. It does not exercise Supabase JWKS, token issuance, OAuth, session refresh, or a real signed-in browser session. No Supabase connection is made.

The non-destructive suite uses in-memory repositories; the separately prepared PostgreSQL suite uses `createAuthUserLookup(db)`, `createProfileReadRepository(db)` and `createProfessionalStore(db)` against an explicitly injected isolated Prisma client. The two narrow repository factories preserve their original select/filter/mapping logic and default application client. Synchronization and mutation behavior are unchanged.

Eight shared ordered HTTP scenarios cover authenticated read/save/fresh read, missing precondition, stale conflict, malformed/spoofed payloads, invalid authentication, inactive accounts, ownership isolation, and public projection privacy. Two further mocked cases cover disabled storage with zero professional queries and sanitized storage errors. The database suite also prepares a disabled-storage case using the real account lookup. It has not run.

## Retained-target data-only mode: prepared, NOT executed

Files:

- `backend/tests/run-professional-http-postgres.mjs`
- `backend/tests/professional-http-postgres.integration.ts` (excluded from `*.test.ts` auto-discovery)
- `backend/tests/helpers/professional-http-safety.mjs` and `.d.mts`
- The pinned schema fixture above.

Safeguards:

1. Exact target, current schema digest and separate `--approve-synthetic-http` argument required before credential use or connection. The native migration file hash must still match; no SQL from it is executed.
2. Only `PROFESSIONAL_HTTP_TEST_DATABASE_URL` is accepted; no credential fallback. URL must be PostgreSQL, `127.0.0.1:5433`, user `postgres`, the exact retained database name, no URL options/hash.
3. Authoritative server/owner/current/session identity is checked. Read-only schema fingerprint, all public table emptiness, absence of large-object records and no other target sessions are required before synthetic writes.
4. Maintenance connection holds the same advisory exclusion lock `(13808,1)` as the existing professional runner. Child verifies its parent's lock. Runs sequentially.
5. The child uses an unreachable dummy application DATABASE_URL; strips inherited PG, Supabase, AWS, AI, DIRECT_URL, other test URLs and storage-gate variables. It does not enable the application gate. Test router readiness is injected only into the isolated fixture.
6. It creates two randomly identified synthetic users/profiles only after checks. Routes persist synthetic professional documents and toggle these test users' statuses. No real student data is needed.
7. Cleanup rechecks identity/schema, deletes only invocation-tracked user UUIDs (their owned profile/professional rows cascade), disconnects clients, and verifies zero records and unchanged schema. No DROP/TRUNCATE/reset, role/grant operation, schema initialization, migration execution or migration-history write exists in this mode.
8. Any failure stops without automatic repair. If interrupted before cleanup, inspect retained synthetic records before considering a separately approved targeted recovery; the next run refuses populated targets.

The advisory lock excludes cooperating runners, not arbitrary local administrative sessions. Keep the isolated target quiescent throughout execution. Pre/post checks detect other sessions/drift but do not promise protection against a malicious local superuser. The local superuser mode does not prove least-privilege or browser-role enforcement.

### Exact next execution step, ONLY after separate authorization

Authorize this target and snapshot digest for the prepared data-only HTTP test mode. Then securely provide `PROFESSIONAL_HTTP_TEST_DATABASE_URL` in that process (no credential values in source or logs). For example, from the backend directory after approval:

```powershell
$localPassword = Read-Host 'Local PostgreSQL password' -AsSecureString
$localCredential = [System.Net.NetworkCredential]::new('postgres', $localPassword)
$encodedPassword = [Uri]::EscapeDataString($localCredential.Password)
$env:PROFESSIONAL_HTTP_TEST_DATABASE_URL = "postgresql://postgres:${encodedPassword}@127.0.0.1:5433/campusconnect_professional_test_13b8b_20261101_01"
try {
  node tests/run-professional-http-postgres.mjs --target campusconnect_professional_test_13b8b_20261101_01 --schema-sha256 f740d00108fe0ba6716cef050c0f209f831b2261bd17234aa38a139a3e2289ee --approve-synthetic-http
} finally {
  Remove-Item Env:PROFESSIONAL_HTTP_TEST_DATABASE_URL -ErrorAction SilentlyContinue
  Remove-Variable localCredential, localPassword, encodedPassword -ErrorAction SilentlyContinue
}
```

Do not run the older initialization/recovery runner on this schema-populated target. Do not set the application storage flag to run this test.

## Runtime role and least privilege

Secure configuration inspection identifies the existing backend URL as a Supabase-managed pooled login in the `postgres` username family. No remote connection was made. The effective server role, ownership, memberships, BYPASSRLS, policies and grants are therefore **unverified**; a connection-string username is insufficient evidence. The verified disposable role is local `postgres`, superuser/BYPASSRLS, and table owner.

For a trusted server runtime, verify:

- Schema USAGE, user/profile SELECT needed by authentication and the profile existence/status recheck.
- SELECT/INSERT/UPDATE on `professional_profiles` and necessary returned columns. UUID user-keyed table needs no sequence privilege. Ordinary professional persistence does not require DELETE.
- SELECT plus UPDATE permission on the locked `users` relation (PostgreSQL FOR UPDATE requires UPDATE privilege on at least one column), while application mutations remain authorization-checked.
- Whether the role owns the table, inherits an applicable role, has BYPASSRLS, or instead requires explicitly reviewed server-only RLS policies. RLS enabled without a policy denies a non-owner/non-bypass runtime; a grant alone does not fix it.
- Migration executor ownership matters: a different runtime does not automatically inherit ownership/privileges. Inspect default grants as well as explicit ACLs.
- Browser roles `anon`/`authenticated` and PUBLIC must not get private-table SELECT/INSERT/UPDATE/DELETE or an exposing view/security-definer function. A server-only endpoint is the intended access path. Do not add browser policies to make a server request succeed.

After separate authorization, verify these with read-only privilege catalogs and effective-role behavior; use an approved isolated non-owner role to exercise allowed server operations and denied browser operations. Local roles are absent now; no cluster role or grant was created. Missing restricted-role verification remains an explicit release gate. Never use a browser service credential or infer security from successful superuser tests.

## Frontend readiness (UI unchanged)

Reviewed ProfilePage, ProfessionalProfileForm, professional-profile client and useProfessionalProfile. Existing behavior supports authoritative stored details/version; quoted conditional saves; refresh after save; stale draft retention and blocked overwrite; explicit reload/discard; network/session/server errors; disabled storage; guarded pending saves; and account-switch reset. The client validates response shapes and does not manufacture successful persistence. The approved Profile presentation remains unchanged.

Synthetic Chrome fixtures exercise actual components and client contracts with mock adapters. They are not authenticated production-like end-to-end or database evidence. Current validation results are recorded in the completion report.

## Controlled local enablement sequence (not performed)

1. Execute separately authorized disposable HTTP verification and resolve failures. Complete restricted-role tests separately; neither grants real-database migration authority.
2. Identify the actual development database and runtime role with approved access. Inspect migration ordering/parity and verified private backup/recovery readiness. Do not assume the retained raw fixture is a deployed application database.
3. Present exact unchanged migration SQL/hash, affected objects, locking and rollback considerations for separate development-database approval. Apply only after that approval, in a separate task.
4. Verify effective backend privileges/RLS and browser denials. Any required role/policy/grant change needs its own reviewed authorization.
5. Only after migration and runtime checks, separately authorize local `PROFILE_PROFESSIONAL_STORAGE_READY=true`, restart the local backend and verify the authenticated route. It is not enabled by this work.
6. Use approved isolated/synthetic accounts to exercise actual local frontend/backend authenticated save, reload, stale draft/conflict, account switch and unavailable states; distinguish genuine Supabase verification from local test issuer evidence.
7. Recovery: disable the gate/restart to stop new writes, preserve existing records and backups, inspect failure before intervention. Do not automatically drop the table, reset the database, repair migration history or erase documents. Schema rollback/data recovery requires a separately reviewed plan.

Remaining gates: retained DB HTTP execution; restricted-role behavior; actual development migration readiness/approval; effective runtime grants/RLS; feature activation; real authenticated frontend/backend integration. No production readiness claim is made by this preparation.

## Validation performed in this step

- Backend non-PostgreSQL unit/mocked HTTP selection: **452 passed, 0 failed, 1 skipped** (453 cases). Explicitly excluded all PostgreSQL suites. The skipped case is opt-in live FastAPI matching, not counted as passing.
- Includes **10 new controlled-auth HTTP cases**, **11 new mocked retained-target safety cases**, and the existing professional safety suite. HTTP storage-error checks cover GET and PUT; ownership checks include a second owner's independent save with the first owner's document unchanged.
- Initial broad backend invocation: 451 passed, one failed, one skipped because S3 signing configuration was absent. Re-run passed using synthetic AWS signing values; no storage request or real AWS credential was used. This was a test-process configuration correction, not an application-code defect.
- Frontend: **293 passed, 0 failed, 0 skipped**.
- Both frontend/backend TypeScript and ESLint: passed. Backend check includes the prepared, unexecuted integration TypeScript file.
- Repository formatting check: passed.
- Frontend/backend production builds: passed; Prisma validation: passed. Prisma's configuration notice is emitted on stderr by the Windows npm wrapper, but commands exited zero; it is not a schema error.
- Isolated Chrome: **30 native professional viewport/theme/state cases plus 10 reliability scenarios passed**. Checked actual Profile/AppShell components with synthetic adapters, including mock save/failure, draft retention, stale conflict, explicit discard, guarded save and account reset. No real authenticated database session was exercised.
- Final read-only check: unchanged schema fingerprint, all 13 public application tables empty, native migration hash unchanged, restricted roles absent. All Prisma/schema/migration/environment files and frontend source/tests remained unchanged by source hash comparison.
- Current frontend output: Profile route JavaScript 45.78 kB (12.74 kB gzip); no frontend source or dependency additions, hence no frontend bundle impact from this backend/test-only preparation.

Evidence: `C:\Users\dahiy\CampusConnect-Professional-Step13B.8D-2026-11-01`. Browser files are explicitly marked SYNTHETIC. Database-backed HTTP mode remains **NOT RUN**. Real Supabase authentication, effective remote runtime role privileges, restricted-role denials, migration deployment and actual storage enablement remain **UNVERIFIED / NOT AUTHORIZED**.

### Files changed

Modified:

- `backend/src/modules/auth/auth.repository.ts` ? injectable existing user lookup.
- `backend/src/modules/profile/profile.repository.ts` ? injectable existing profile read projection.
- `backend/tests/helpers/professional-test-safety.mjs` and `.d.mts` ? extract shared read-only catalog reader; initialization safety behavior retained.

Created:

- `backend/tests/professional-authenticated-http.test.ts`
- `backend/tests/professional-http-safety.test.ts`
- `backend/tests/professional-http-postgres.integration.ts`
- `backend/tests/run-professional-http-postgres.mjs`
- `backend/tests/helpers/professional-http-app.ts`
- `backend/tests/helpers/professional-http-contract.ts`
- `backend/tests/helpers/professional-http-safety.mjs` and `.d.mts`
- `backend/tests/fixtures/professional-retained-schema.json`
- `docs/professional-authenticated-readiness.md`

No source files were removed. No UI, application authentication policy, schema, migration, environment credential file or dependency was changed. No database writes, Supabase/production access, grants, feature activation, Git operation, deployment or Step 13C work was performed.
