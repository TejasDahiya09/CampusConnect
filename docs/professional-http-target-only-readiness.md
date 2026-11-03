# Step 13B.8E.1 ? target-only HTTP integration readiness

Source/test changes only. **No PostgreSQL connection, database read/write, live runner invocation, migration, feature activation or role operation was performed.** The approved Profile UI and production Profile implementation are unchanged.

## Discrepancies corrected

The Step 13B.8D runner copied the earlier initialization runner's maintenance-database lock convention. It connected to `/postgres`; its child expected an advisory lock scoped to that other database. This conflicted with Step 13B.8E's exact-target-only authorization. The blocked Step 13B.8E execution was inspected through its source and conversation report; it never connected or ran tests.

The prepared database suite had eight shared HTTP behaviors plus disabled storage: nine behaviors, with a parent test accounting for the misleading tenth Node entry. It now has ten real behaviors and one explicitly excluded parent (eleven Node entries in a successful future live run).

## Connection and lock design

Only `PROFESSIONAL_HTTP_TEST_DATABASE_URL` selects a database. `targetHttpConnection` validates PostgreSQL URL scheme, host `127.0.0.1`, port `5433`, username `postgres`, exact existing database `campusconnect_professional_test_13b8b_20261101_01`, and absence of URL query/hash. There is no alternate database, maintenance URL, environment fallback or database-creation path.

All three possible connections use these same validated target options:

1. Parent `pg.Client`: target-only, read-only session settings, unique `application_name`, authoritative database/owner/current-role/session-role/server/version/backend PID/start-time verification, then session advisory lock `(13808,1)`.
2. Child `pg.Pool`, maximum one connection: same target, synthetic-data writes allowed only after parent-lock/session/schema/empty-data checks. Its own session is identified using the server's backend PID. No unrelated PID is automatically exempted.
3. Child Prisma adapter pool, maximum one connection: same validated target; constructed only after initial guarded setup, then its actual database/server/role/session identity is verified. It is disconnected before quiescent cleanup checks, so an ORM session is never broadly allowlisted by application name.

The parent uses its own locked connection for preflight and postflight; no separate maintenance/preflight connection is needed. It holds the lock throughout setup, the sequential child suite and identity-checked cleanup. Lock conflict or lock loss prevents test writes. A further lock-catalog check rejects another holder of the known professional-test key, including a legacy runner's differently scoped lock, without connecting to another database.

In the child, `verifyHttpSessions` excludes its current control connection by server PID, and accepts exactly one other session: the verified parent PID, start time and unique application name, with `postgres` role, loopback address, exact target and a granted target-scoped lock. This rejects PID reuse, missing/lost locks, application-name/role/address mismatches and extra sessions. It also rejects another holder of the known test-lock key. No session is terminated.

The parent releases its session lock in `finally`, verifies release, and always closes its connection. If the connection is lost PostgreSQL releases its session lock; the child's subsequent lock checks fail closed. The live child stops after its first failed behavioral subtest; only guarded cleanup follows. No automatic rerun or repair exists.

## Retained-target and cleanup safeguards

The schema fingerprint algorithm/fixture is unchanged:

`f740d00108fe0ba6716cef050c0f209f831b2261bd17234aa38a139a3e2289ee`

This is only the **stored fixture's digest**. Its live match and current row counts were **not checked in this source-only phase**.

Before future synthetic writes, the parent and child enforce the existing schema/owner/server/role checks, full reviewed catalog fingerprint, all application tables empty, no large-object data and no unexpected sessions. Exact schema objects, professional constraints/indexes and absent migration history remain fingerprinted.

Both entry points verify the native SQL file and all six prerequisite hashes before any connection. SQL files are read for identity only; none is executed. The file manifest remains unchanged from the reviewed initialization runner.

User UUIDs are added to the cleanup tracker only after INSERT successfully returns that exact ID. Cleanup disconnects Prisma first, then rechecks database identity, schema fingerprint and verified parent/session state. It rejects malformed/duplicate/excess cleanup IDs and unexpected records in any application table: only invocation-owned users, their profiles and professional documents may remain. It issues only a parameterized UUID-scoped DELETE on those tracked users; existing cascades remove their synthetic dependent documents. It then verifies schema unchanged, all public application tables empty and no large objects/unexpected sessions. It never deletes untracked rows, truncates, resets, applies migrations, grants privileges, or creates/drops databases or schema objects.

If schema identity, sessions or unexpected records prevent safe cleanup, it leaves the target untouched and reports failure. No fallback deletion is attempted.

### Remaining race limitations

Advisory locking excludes cooperating runners; it cannot block a non-cooperating privileged client from connecting or writing after a check. Session/catalog/record checks and the known-key conflict checks fail closed when discrepancies are observed, but cannot prove the absence of an arbitrarily brief external superuser action between checks. Keep the disposable target quiescent. Cleanup verifies identity immediately before deleting only tracked identities, but does not claim an absolute guarantee against a malicious concurrent local superuser. No additional grants, lock tables or schema changes were introduced to manufacture that guarantee.

## Ten behavioral HTTP cases

The actual registration array is created by `createProfessionalHttpPlan`, shared with inventory tests. It excludes the parent container, hooks and setup.

1. ACTIVE owner GET, conditional PUT, authoritative new version and fresh GET/persisted-data assertion.
2. Missing If-Match returns 428 without mutation.
3. Stale If-Match returns 409 and preserves the newer committed document.
4. Malformed payload, owner spoof and malformed version return 400 without mutation.
5. Missing, malformed and forged authentication return 401.
6. SUSPENDED/DEACTIVATED actors cannot GET or PUT (403), with stored data unchanged.
7. Another ACTIVE account has its own document/save and cannot read or target the first owner's document.
8. Actual public Profile HTTP route excludes native private professional additions.
9. Disabled storage uses real account lookup but no professional queries: unavailable GET and PUT 503.
10. Storage-failure confidentiality: real repository upsert inside a transaction, synthetic pre-commit failure, sanitized HTTP 503/logs and prior document preserved.

The original eight shared scenarios and disabled-storage assertions remain intact. There is no merging or parent-count padding.

## Confidentiality scenario and evidence boundary

`runStorageFailureConfidentiality` creates the actual Express routers, real authentication middleware with the existing signed local test issuer, real Professional Profile repository and the supplied PostgreSQL Prisma client. It first reads an existing synthetic document. A narrowly scoped Proxy wraps only that fixture client's interactive transaction: all original repository user-lock/status/version checks and the actual upsert execute, then the wrapper throws a synthetic error **inside the transaction before commit**. It observes completion of the upsert, so a pre-query failure cannot falsely satisfy the test.

The synthetic error carries private headline/education/experience and credential canaries. The test captures application `console.error`/`console.warn` in memory without echoing payloads. It requires the actual route's generic 503 `PROFESSIONAL_STORAGE_ERROR`, requires a sanitized application error log to exist, and asserts no private values occur in either response or captured logs. It then disables the fixture-local fault and restores logging in `finally`, checks persisted data unchanged, and verifies a fresh GET through the original, uninjected client. Assertions avoid printing raw private documents; live behavioral failures are rethrown as sanitized messages.

The fault itself is **synthetic**, not a PostgreSQL server outage. In the future live suite the write and transaction rollback are genuine PostgreSQL operations. In this source-only phase the harness was exercised with a mocked transactional adapter; this is not evidence of real PostgreSQL rollback or authenticated Supabase interoperability. No mock HTTP handler or wholly mocked store replaces the live suite's repository path.

## Safe validation and scope

Validation results and exact changed-file inventory are recorded below after checks. Permitted checks use mocked connection responses only. The database-backed integration file remains outside automatic `*.test.ts` discovery and was never invoked. Backend TypeScript compiles it without executing it.

The normal application gate is not activated. The future child environment uses `DOTENV_CONFIG_PATH=NUL` and deliberately unreachable dummy application `DATABASE_URL`; inherited PG, Supabase, AWS, AI, DIRECT_URL, other test URLs and normal gate variables are removed. Test-router readiness remains fixture-local. No credential file needs to be read or modified during this source-only task.

## Next separately authorized execution interface

After separate explicit execution authorization, securely supply only `PROFESSIONAL_HTTP_TEST_DATABASE_URL` for the fixed target. From `backend`, the interface is unchanged:

```powershell
node tests/run-professional-http-postgres.mjs --target campusconnect_professional_test_13b8b_20261101_01 --schema-sha256 f740d00108fe0ba6716cef050c0f209f831b2261bd17234aa38a139a3e2289ee --approve-synthetic-http
```

No additional maintenance-database permission is needed. The runner passes its PID/start-time/application identity to its child internally; do not launch the child by inventing those environment variables. Do not run initialization/recovery/migration commands. Do not enable the normal application's storage gate.

Remaining gates: actual live target/session/schema/empty-data preflight; one separately authorized ten-behavior HTTP?PostgreSQL run and cleanup verification; restricted-role/RLS behavior (still blocked, superuser tests do not establish least privilege); actual development migration readiness and separate approval; runtime role/privilege verification; feature activation and real authenticated frontend/backend verification. Production readiness remains unestablished.

## Final source-only validation

- Focused runner/catalog safety, confidentiality harness, authenticated mocked HTTP, existing professional Profile unit and existing initialization-safety regressions: **124 passed, 0 failed, 0 skipped**. These include 29 newly added runner/confidentiality tests. Initialization-safety regressions use mocked queries only; no initialization runner was invoked.
- Backend TypeScript: passed, including compilation of the unexecuted PostgreSQL integration file.
- Backend ESLint: passed with zero warnings.
- Repository Prettier check: passed.
- `node --check` for the entry point and both HTTP `.mjs` safety/lifecycle helpers: passed.
- Prisma validation: passed without connecting to a database. Its normal configuration notice is written to stderr by the Windows npm wrapper; exit status was zero.
- All seven migration file SHA-256 comparisons passed. Native migration SHA-256: `8ed9e94167382e9c37086d6740a7e529482e457cdcaa17c1bda9ffc70ce0aa1f`.
- Stored fixture digest matches the reviewed value; fixture bytes are unchanged. No claim about current live database fingerprint or emptiness is made.
- Source-hash comparison confirms production backend code, all frontend source/tests, Prisma schema, migration SQL and backend environment files unchanged. No dependencies were added or changed.

Mocked safety tests exercise exact URL rejection, both connection option modes, actual entry/pool/ORM wiring, lock acquisition/hold/release/conflict/loss, child/preflight/postflight failures, parent PID/start-time/application/role/address verification, external-session rejection, schema/owner/record failures before writes, invocation-scoped cleanup, rejection of unexpected related records, migration identity and ten-behavior registration excluding the parent. Confidentiality regressions exercise the real HTTP middleware/router/repository with a mocked transactional adapter, confirm the upsert/failure/rollback sequence and logging restoration, and prove private-value detection fails rather than silently accepting leaked data.

The ten real PostgreSQL behaviors are **PREPARED, NOT EXECUTED**. No actual database connection or write occurred. Live PostgreSQL rollback/session/locking behavior remains unverified until separately authorized execution. No Supabase, production, AWS or LinkedIn access, Git operation, deployment, UI redesign, feature activation or Step 13C work occurred.

### Exact file inventory

Modified:

- `backend/tests/professional-http-postgres.integration.ts`
- `backend/tests/professional-http-safety.test.ts`
- `backend/tests/run-professional-http-postgres.mjs`
- `backend/tests/helpers/professional-http-safety.d.mts`
- `backend/tests/helpers/professional-http-safety.mjs`
- `docs/professional-authenticated-readiness.md`

Created:

- `backend/tests/professional-http-confidentiality.test.ts`
- `backend/tests/professional-http-runner.test.ts`
- `backend/tests/helpers/professional-http-confidentiality.ts`
- `backend/tests/helpers/professional-http-plan.ts`
- `backend/tests/helpers/professional-http-runner.d.mts`
- `backend/tests/helpers/professional-http-runner.mjs`
- `backend/tests/helpers/professional-retained-catalog.mock.ts`
- `docs/professional-http-target-only-readiness.md`

No files removed. Generated Prisma client output from the permitted typecheck is a local build artifact, not a schema or migration change.
