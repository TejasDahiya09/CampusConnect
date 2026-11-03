# Step 13C.3 - Real photo activation status

## Outcome and exact disabled conditions

**Not operationally enabled. No real upload, deletion or database write was performed.** The task's Part 8 requires explicit development-target and student-account approval before those operations. No designated development student UUID or explicit writable development-resource approval is present.

Original direct blockers: PROFILE_PHOTO_STORAGE_READY is unset and PROFILE_PHOTO_UPLOAD_SECRET is unset. The frontend correctly keeps Save disabled when authenticated GET /api/profile/me/photo returns available:false. No frontend hardcoded enablement or mock production readiness was added.

The new local-only control also requires PROFILE_PHOTO_LOCAL_OWNER_ID. It is intentionally unset until the owner supplies the approved account UUID. Professional storage remains unset/default disabled.

## Actual configuration and read-only findings

| Target/check                 | Actual result                                                                                             |
| ---------------------------- | --------------------------------------------------------------------------------------------------------- |
| Configured bucket            | campusconnect-media-101631415847-ap-south-2-an                                                            |
| Configured region            | ap-south-2                                                                                                |
| GetBucketLocation            | Succeeded; actual region ap-south-2                                                                       |
| STS GetCallerIdentity        | Succeeded; arn:aws:iam::101631415847:user/campusconnect-backend                                           |
| GetPublicAccessBlock         | AccessDenied, HTTP 403; privacy metadata unverified                                                       |
| GetBucketPolicyStatus        | AccessDenied, HTTP 403; policy status unverified                                                          |
| GetBucketCors                | AccessDenied, HTTP 403; browser upload CORS unverified                                                    |
| Configured CloudFront domain | d2hlfri2jp03h2.cloudfront.net                                                                             |
| CloudFront root HEAD         | HTTP 403, Server AmazonS3; root reached, actual photo-path delivery NOT verified                          |
| Supabase project             | tssvifupujyzydrzgazv                                                                                      |
| Database pooler              | aws-0-ap-northeast-2.pooler.supabase.com; database postgres; DATABASE_URL port 6543, DIRECT_URL port 5432 |

These operations were metadata-only reads and one public root HEAD. No object list, student image or profile row was fetched. No Supabase connection occurred. Credentials were used privately and never logged. No AWS CLI/STS package or other dependency was installed; STS identity was obtained with a narrowly scoped signed read using existing signing dependencies.

A 403 on the CloudFront root does not establish that image delivery is broken: the root is not a known photo object. Neither environment configuration nor root reachability proves that profile-photos/<id>.png can be delivered. Likewise AccessDenied for bucket metadata does not prove PutObject is denied or that the bucket is public. Those settings remain unknown.

The bucket name and current AWS account are consistent identifiers, but they do not prove the resource is exclusively development or that database records are disposable. Treat the target as potentially shared until explicitly confirmed.

## Safe local controls implemented

- Default photo router can activate only in NODE_ENV=development, with explicit flag, a server-only secret of at least 32 characters, valid designated development owner UUID, complete/sane storage configuration and a loopback frontend.
- Even with eligible configuration, photo routes accept only actual loopback backend peer addresses and that verified ACTIVE owner's token. Forwarded headers do not satisfy the peer check. Other accounts receive available:false and cannot authorize/complete/delete photo uploads.
- Existing authentication, owner-derived keys, signed ticket, object verification, CAS/transaction behavior, replacement/removal, sanitized DTO and failure handling are unchanged.
- Production/test default routers fail closed even if someone sets the photo flag. Factory-injected synthetic tests remain independently testable.
- npm run photo:check-local --workspace backend is configuration-only. It does not start the app, set flags, generate/write secrets, connect to providers, or certify infrastructure. Current underlying CLI exit is 2 (expected blocked), reporting PHOTO_FLAG_DISABLED, UPLOAD_SECRET_REQUIRED and APPROVED_DEVELOPMENT_OWNER_REQUIRED.
- No real environment values or deployed settings were changed. Only the .env.example template documents the owner field.

The flag remains an explicit operator activation step after approved verification. The local checks are NOT an automatic IAM/CORS/delivery/persistence health certificate. Runtime upload failures continue to fail without associating an unverified photo or reporting success.

## Persistence and integration

The existing Prisma Profile.avatar Json? field supports the current reference. No additional field, schema change or migration is needed for this source implementation. Actual remote schema/grants/runtime write ability have not been queried.

The server verifies pending object ownership, exact size/type, encryption metadata and actual canonical PNG bytes before immutable final storage and transactional compare-and-swap of that owner's avatar. A failed new upload retains the prior association; remove restores the stored predefined/initials fallback. Cleanup is best effort, not an assertion that every remote deletion will succeed.

Normal Profile GET, auth identity projection and shared avatar components already consume the sanitized photo reference. Browser tests verify mocked save and owner-header update, removal and fallbacks. A genuine fresh Profile GET/reload, CloudFront image delivery and Dashboard/Messaging display against real services remain unverified. No design or cross-module rendering code was changed in this step.

## One bounded end-to-end test requiring explicit approval

Confirm these exact resources are approved for development testing:

- S3 bucket campusconnect-media-101631415847-ap-south-2-an in ap-south-2.
- Delivery domain d2hlfri2jp03h2.cloudfront.net.
- Supabase project tssvifupujyzydrzgazv / postgres.
- An existing, explicitly authorized ACTIVE development student UUID with no pre-existing uploaded photo. Do not use an unknown or normal student account.

The input image is prepared locally: profile-photo-synthetic-13C3.png, 512x512 RGBA PNG, 20,401 bytes, SHA-256 57d802df5e2fe1bcdcf55ba481f203ce9395cbac156103048f5cb4c2a02c0c56. It is a geometric pattern without student data. It has NOT been uploaded. Cropping may produce a different canonical output hash.

Approve one save/reload/replace/remove cycle through the existing authenticated local UI/backend. Expected side effects are at most two pending objects under profile-photos-pending/<approved-student-UUID>/<server-session-UUID>.png, two immutable final objects under profile-photos/<server-photo-UUID>.png, and three avatar-reference updates for ONLY that profile (save, replace, remove). Keys remain server-generated; cleanup is limited to the newly created test objects. Existing raw avatar/fallback must be checked before writing. No user/account creation, unrelated row changes, schema changes, grants, policies or public ACL changes are included.

Because the current identity cannot read CORS/privacy settings, provide the existing owner-visible CORS/private-origin/delivery configuration or an approved way to inspect it with a permitted identity. Do not automatically grant permissions. Required photo-object capabilities are PutObject, GetObject (including HEAD) and DeleteObject for the two namespaces; actual upload capability is not inferred from GetBucketLocation.

After those prerequisites and explicit approval, generate a dedicated random signing secret privately and set the photo flag and approved UUID only in one local development backend process. Keep professional storage disabled. Perform the controlled cycle, verify actual object delivery and fresh authenticated Profile GET/reload, check header/other identity surfaces, restore fallback and verify test-object cleanup. Do not permanently enable the feature until real evidence passes. On an unknown commit/failure, stop and reread the approved profile before any further mutation; do not automatically roll back/delete an uncertain committed object.

## Validation

Final counts/file inventory are appended below. Backend tests use an unreachable dummy loopback datasource, DOTENV_CONFIG_PATH=NUL and mocked S3 transport. PostgreSQL integration files and real provider tests are not run. Presigning in tests is local cryptography with synthetic credentials.

No real end-to-end acceptance step is marked passed. The frontend photo browser checks use actual crop/editor/client code with explicitly synthetic API/S3 transport and images; they are regression evidence only.

## Scope

No frontend/editor/navigation/overview changes, Supabase access, migration, database/role/RLS change, AWS write/infrastructure change, production configuration edit, professional storage activation, LinkedIn change, dependency installation, Git operation or deployment. Local backend guards, a no-network diagnostic, tests and photo readiness documentation are the only changes.

### Final Step 13C.3 validation results

- Frontend: 301 passed, 0 failed, 0 skipped.
- Backend non-database suite: 511 passed, 0 failed, 1 skipped (opt-in live FastAPI). PostgreSQL integration files were excluded; no database integration claim is made.
- Focused photo suites: 30 passed, 0 failed.
- Frontend and backend TypeScript, ESLint, repository formatting and both production builds passed.
- Chrome synthetic photo fixtures passed at 1440, 440, 390 and 320 pixels in Light and Dark. Actual crop/editor/client code was exercised with mocked remote transport; this does not verify real uploads, remote persistence or CloudFront delivery. Browser zoom evidence is equivalent reflow, not native browser 200% zoom acceptance.
- Frontend source/test hashes and all Prisma/migration/private environment hashes remain unchanged from the pre-step snapshot. No frontend bundle code was added. Build output is recorded in the external evidence folder.

### Exact source and documentation inventory

Modified: backend/src/modules/profile/profile-photo.ts; backend/tests/profile-photo.test.ts; backend/.env.example; backend/package.json; docs/profile-photo-readiness.md.

Created: backend/src/modules/profile/profile-photo-readiness.ts; backend/scripts/profile-photo-local-check.mjs; backend/tests/profile-photo-readiness.test.ts; docs/profile-photo-local-activation.md.

Status: local safeguards implemented; actual photo storage remains OFF. Stop before real uploads/deletions/database writes under Part 8 of the request, pending approval of the exact development targets and account.
