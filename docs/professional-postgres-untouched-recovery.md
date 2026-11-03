# Step 13B.8C.2 - OID normalization and untouched-target recovery

Status: source-only preparation. No database connection, runner execution, database write, migration or deletion occurred in this step. The 18 PostgreSQL integration cases remain unexecuted.

## Root cause and correction

The saved Step 13B.8C final-state evidence records `jsonb_build_object('oid', o.oid, ...)` returning `{"oid":"1259","name":"pg_class"}`. JavaScript received a string; `Number.isInteger("1259")` failed even though this is an ordinary initialization object. Earlier mocked catalogs used numbers and missed this boundary.

The catalog query is unchanged. `normalizeOid(unknown)` now accepts numeric nonnegative safe integers and canonical unsigned decimal strings only, converts the latter with Number after strict validation, and requires the PostgreSQL unsigned 32-bit OID domain: 0 through 4,294,967,295. It rejects fractions, negative/negative-zero values, whitespace, leading zeroes, signs, exponent/hex notation, trailing text, booleans, null/undefined, nonnumeric values and overflow. It does not use parseInt or trim ambiguous input.

Representation zero is valid to normalize but is not accepted as an actual catalog object's OID. Every inspected object, including extension members, is normalized before trust classification. Schema/extension metadata is still classified by the existing names/version/membership rules; the helper does not use their OIDs or add unnecessary catalog queries for normalization.

The initialization range remains strictly 0 < OID < 16384, only for existing allowed core namespaces and non-extension initialization objects. Public/user objects, extra schemas/extensions, wrong owners and unrecognized extension members remain rejected even if their OIDs parse correctly. The original catalog-query SQL and the approved migration are not loosened.

## Separate recovery interface

Default creation still requires `--approve-create` and rejects all pre-existing targets. A new mode requires **both** `--recover-untouched` and `--approve-recovery`, plus the existing independent `--approve-migration`, exact target and migration SHA. Mixed creation/recovery approval, missing approvals, duplicate/unknown flags and a different target/hash are rejected. There is no generic allow-existing override.

Both modes require the same dedicated PROFESSIONAL_TEST_DATABASE_URL, literal 127.0.0.1, port 5433, postgres user and exact database path. There is no DATABASE_URL/DIRECT_URL fallback. Recovery requires the target to exist and never creates, drops, recreates, truncates, resets or chooses another target.

The exact target is `campusconnect_professional_test_13b8b_20261101_01`. Its previous existence/clean state is historical evidence, not a current live verification in this source-only phase. Future execution must recheck it.

## Recovery sequence and concurrency

1. Verify exact arguments, native SQL hash and the six preserved prerequisite hashes before connecting.
2. Retain the existing maintenance-session advisory lock for the entire runner/test invocation.
3. Require the existing exact target; connect and verify database identity, catalog-resolved postgres owner, PostgreSQL 17, loopback address/port and strict cross-namespace clean-template inventory.
4. Clear the local statistics snapshot before each other-session check so the in-transaction rechecks do not reuse cached activity. Reject other target sessions; do not terminate or disconnect any client. See [PostgreSQL 17 statistics snapshot behavior](https://www.postgresql.org/docs/17/monitoring-stats.html#MONITORING-STATS-VIEWS).
5. Start the existing provisioning transaction. Recheck other sessions, acquire SHARE/NOWAIT locks on the inspected **per-database** catalogs, recheck sessions, then repeat owner/template validation under those locks. Lock contention aborts without retry.
6. Reject standalone large-object metadata/pages, which can store user records without an application table. Application records/partial migrations already require objects that the strict template gate rejects. Normal initialization data in PostgreSQL's own catalogs is not mistaken for application records.
7. Only then run the existing citext/six-prerequisite/native-migration provisioning. Check for other sessions once more before commit. Failures use the existing transaction rollback; no preexisting object is removed to force eligibility.
8. Retain the original synthetic-data suite and identity-checked cleanup. No test assertion was weakened. The database is never automatically dropped.

The locked catalogs include namespace, relation, function, type, extension/dependency/language, operator, collation, conversion, text-search, foreign-data, event-trigger, publication, access-method and large-object catalogs. Shared catalogs such as pg_database and pg_subscription are deliberately not locked cluster-wide. The original inspection rules remain fail-closed.

This reduces inspection/provisioning races; it is not exclusive administrative ownership of the server. Advisory locks exclude cooperating runners only. Non-cooperating privileged maintenance clients can still change shared database metadata, and clients can connect after the final check or after provisioning commits. The integration-test phase also necessarily uses additional connections. Keep this disposable target quiescent; unexpected activity must stop execution. No cluster-wide locking, connection-permission alteration, role modification or backend termination was added. Actual lock/setup behavior still requires the separately authorized PostgreSQL run; mocked passing tests do not prove it.

PostgreSQL 17's LOCK implementation and NOWAIT handling were reviewed in the primary [lockcmds.c source](https://github.com/postgres/postgres/blob/REL_17_STABLE/src/backend/commands/lockcmds.c). No SQL was executed to test those locks in this phase.

Recovery is one narrowly bounded attempt to continue from an untouched template. Once application objects or citext exist, this mode refuses reuse, including after a partially provisioned or completed run. It is not a reset/re-run facility.

## Approved migration integrity

File: `backend/prisma/migrations/20261101020000_native_professional_details/migration.sql`.

```text
8ed9e94167382e9c37086d6740a7e529482e457cdcaa17c1bda9ffc70ce0aa1f
```

The native SQL, six historical prerequisites, Prisma schema and synthetic baseline are unchanged. No new migration, Profile API/UI change or storage enablement was introduced.

## Validation and files

Focused tests cover actual string-OID representations, valid bounds, invalid forms, unchanged object trust rules, default target rejection, independent recovery approval, exact name/hash restrictions, wrong ownership, extra schemas/functions/types/tables/extensions, partial migrations, other sessions, lock contention, late-arriving sessions and large-object records. Existing safety tests remain intact.

Actual permitted validation:

- Focused OID/recovery/safety suite: **67 passed**, 0 failed/skipped.
- Combined safety and relevant Profile backend unit/contracts: **94 passed**, 0 failed/skipped (includes the 67 safety cases).
- Backend TypeScript, ESLint, runner/helper syntax, repository formatting and Prisma validation: passed.
- Native migration hash and six prerequisite hashes: unchanged/matched.
- PostgreSQL integration runner, recovery execution and 18 database cases: **NOT EXECUTED**. No database connection was made.

Modified:

- `backend/tests/helpers/professional-test-safety.mjs`
- `backend/tests/helpers/professional-test-safety.d.mts`
- `backend/tests/professional-test-safety.test.ts`
- `backend/tests/run-professional-postgres.mjs`

Created: this report. Integration-test cases, application sources, approved UI and database SQL were not modified.

## Proposed command - DO NOT EXECUTE UNDER THIS STEP

After separate explicit recovery/provisioning/test authorization, with the private dedicated URL supplied securely, from the repository root:

```powershell
node backend/tests/run-professional-postgres.mjs `
  --target campusconnect_professional_test_13b8b_20261101_01 `
  --migration-sha256 8ed9e94167382e9c37086d6740a7e529482e457cdcaa17c1bda9ffc70ce0aa1f `
  --recover-untouched `
  --approve-recovery `
  --approve-migration
```

No `--approve-create` is used for recovery. Authorization must cover recovery of only this exact existing untouched local target, reviewed locking/preflight behavior, citext and the six hashed prerequisites/native SQL, 18 synthetic integration cases, and existing synthetic-row cleanup. It does not include deleting the database, creating roles, enabling storage, production/Supabase access or an alternate target.

Remaining blockers: separate execution authorization, a fresh successful target/template/session preflight, real PostgreSQL lock/provisioning/persistence/concurrency/privacy results, and suitable restricted-role verification. Missing roles must remain blocked rather than created automatically. No next phase has started.
