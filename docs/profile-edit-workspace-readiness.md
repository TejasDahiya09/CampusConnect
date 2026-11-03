# Step 13C.1 - Edit Profile workspace and photo activation readiness

## Architecture and scope

The existing owner Profile route is retained. ProfilePage now presents a dedicated editing workspace with a desktop section rail and a mobile selector. Personal information, Skills & interests, Achievements, Portfolio and Professional details each reuse the existing components and APIs. Panels remain mounted while hidden; returning to the approved overview also preserves drafts. The overview, global shell, public Profile, approved photo editor, auth and backend implementations were not redesigned.

The owner/status keyed ProfileDraftProvider resets editing state on account changes. Its section hooks track meaningful personal, skill-add, interest-add, achievement, portfolio and professional drafts. Beforeunload warns on refresh/tab close; ordinary same-tab navigation links request confirmation when unsaved work exists. New-tab portfolio links do not discard the current page. Browser Back/Forward or arbitrary programmatic router navigation are not intercepted by this guard; the app uses BrowserRouter rather than the data router required by useBlocker. This limitation is explicit; no global router/history patch was introduced.

## Sections and working contracts

- Personal information: actual shared avatar, approved photo editor entry, display name, bio, department, year, location and predefined/initials fallback. Returned server Profile data updates the overview and owner navigation-avatar cache. A fallback-avatar draft is distinguished from server updates so photo replacement/removal does not silently overwrite its current fallback.
- Skills & interests: existing add/remove and 1-5 proficiency updates, compact skill rows in a bounded keyboard-scrollable region, add forms and interests. Existing resume skill analysis remains available; it was not invoked against an external service in QA. Skill names can be added, but the existing update endpoint changes proficiency only; no unsupported rename API was invented.
- Achievements: existing title/date/description editor with one active editing draft, add/edit/delete and empty state.
- Portfolio: existing label/URL/sort-order editor, add/edit/delete, safe external links and ordinary LinkedIn URL editing. No OAuth/import.
- Professional details: existing editor, If-Match/version/conflict safeguards retained. Storage remains disabled and the editor truthfully explains it cannot save those fields. Photo management is independent.

Existing client exports in profile-service.ts are reused without endpoint or DTO changes:
GET /api/profile/me and /api/profile/options; PATCH /api/profile/me;
POST/PATCH/DELETE /api/profile/me/skills (item operations use /:skillId);
POST/DELETE /api/profile/me/interests (delete uses /:interestId);
POST/PATCH/DELETE /api/profile/me/achievements (item operations use /:achievementId);
POST/PATCH/DELETE /api/profile/me/portfolio-links (item operations use /:portfolioLinkId).
Professional details continue through their existing GET/PUT endpoint and hook; the photo editor continues through /api/profile/me/photo and its existing upload authorization/completion/cancellation endpoints.

## Save and draft behavior

No fictional Save All. Each original form/mutation remains independent. A synchronous mutation lock blocks duplicate profile requests before React rerenders. Pending inputs are disabled so successful add/save completion cannot erase text entered during that request. Local form drafts survive panel switches and failed API requests. Success is shown only after an API resolves successfully; the returned full Profile becomes authoritative. Late responses are ignored after owner workspace unmount. Professional conflicts keep their existing separate versioned behavior.

Form controls gained explicit accessible names where placeholders were previously the only clue. Keyboard focus moves to the chosen section, selected desktop navigation has aria-current, mobile has a labelled native selector, and semantic Light/Dark controls retain 44px targets and focus indicators. Main page scrolling uses existing shell bottom clearance, not a duplicate sticky action bar.

## Photo prerequisites: local inspection only

Inspected backend/.env and current configuration/code without loading private credentials into an external command or making a remote connection.

| Setting                            | Local finding                                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------------- |
| AWS_REGION                         | ap-south-2                                                                            |
| AWS_S3_BUCKET                      | campusconnect-media-101631415847-ap-south-2-an                                        |
| AWS_CLOUDFRONT_DOMAIN              | d2hlfri2jp03h2.cloudfront.net                                                         |
| AWS credential pair                | Present; values never logged. Identity, validity and privileges unverified            |
| PROFILE_PHOTO_STORAGE_READY        | Unset, so disabled                                                                    |
| PROFILE_PHOTO_UPLOAD_SECRET        | Unset; minimum 32-character dedicated secret required                                 |
| PROFILE_PROFESSIONAL_STORAGE_READY | Unset/default disabled; unchanged                                                     |
| Database project reference         | tssvifupujyzydrzgazv                                                                  |
| DATABASE_URL target                | aws-0-ap-northeast-2.pooler.supabase.com:6543, database postgres (transaction pooler) |
| DIRECT_URL target                  | Same project/host/database, port 5432 (session pooler)                                |

The configured credential/project metadata indicates remote Supabase, not an isolated local database. Local documentation does not prove the bucket/project is exclusively development or identify all consumers. Treat both as potentially shared until the owner confirms. The current shell's process environment may override file values; a running backend process's environment was not inspected.

Persistence already uses profiles.avatar JSON through the owner-only compare-and-swap photo repository. No new field/migration is required in source. Actual remote schema parity, runtime role attributes, grants, RLS/browser write restrictions and ability to save/reload were not inspected remotely. Do not infer them from Prisma or mocked tests.

AWS configuration alone does not prove bucket ownership, region, least-privilege IAM, privacy, CORS, CloudFront origin access/delivery/cache behavior or reachability. CloudFront helper constructs a URL; that is not delivery verification. Backward-compatible presets/initials and safe photo projections remain unchanged. Real cross-module delivery is still unverified.

## Minimal separate approval needed before activation

No remote operations or activation were performed. The task explicitly requires stopping before remote S3 operations or configured Supabase writes are used to prove readiness.

1. Owner confirms the exact bucket/domain/project above and whether shared records/applications use them. Approve metadata-only inspection of that AWS identity/bucket/distribution and that Supabase project's avatar schema/runtime permissions; no student rows need to be fetched for the metadata preflight. The database connection should use the appropriate approved non-transaction inspection connection, not an assumed local target.
2. Identify an existing, owner-authorized dedicated ACTIVE development student account UUID with no existing uploaded photo. No unknown real account or synthetic database user will be created automatically. Approve reading that account's own profile and writing only its avatar reference through the existing authenticated local backend.
3. Approve at most two synthetic 512x512 PNG upload/replace cycles plus removal in the bucket above, with generated keys restricted to profile-photos-pending/<approved-owner-UUID>/<server-session-UUID>.png and profile-photos/<server-photo-UUID>.png. UUIDs must remain server-generated; exact keys are learned from the authorized workflow, not supplied by the browser. This creates at most two pending and two canonical objects; cleanup is limited to those newly created test objects. Do not remove any pre-existing student's image.
4. Verify least-privilege PutObject/GetObject/DeleteObject for those namespaces (HEAD uses GetObject), private origins/approved delivery, exact-origin signed-upload CORS, and deny unauthorized direct avatar writes/metadata reads. No IAM/bucket/CloudFront/RLS changes are authorized automatically. A failed prerequisite stops activation.
5. Only after approved prerequisites, temporarily enable the photo flag in one local backend process with a securely supplied dedicated secret. Keep professional storage OFF. Perform actual authenticated upload, GET/reload, replacement, failed-replacement preservation, removal/fallback and scoped cleanup. Confirm actual CloudFront image delivery.
6. A permanent local feature flag is considered only after the real end-to-end save/reload succeeds and its evidence is reviewed. On failure, stop and turn off the temporary flag; do not apply migrations, change permissions or attempt an unapproved database rollback.

Current status: photo editor integrated, source-tested, still gated. No permanent operational storage success is claimed. Existing professional migration/preflight/activation work remains postponed.

## Validation and evidence

Final automated counts and exact file inventory are appended below. Browser fixtures use actual components and browser behavior with synthetic DTOs, in-memory APIs and synthetic media. They are not Supabase/S3 or real student persistence evidence. Browser QA covers section navigation, retained drafts, mocked personal/skills/interests/achievement/portfolio saves, duplicate-submission protection, failed-save draft retention, disabled professional/photo states and empty lists. Desktop/mobile Light/Dark screenshots are captured at 1440, 440, 390 and 320px; equivalent 200% desktop reflow uses 720x450 CSS pixels/device scale 2. Native browser zoom and real-device safe areas remain unverified.

No Supabase/AWS connection, production write, migration, database/role/policy change, private environment edit, storage enablement, Git operation, dependency installation or deployment was performed.

## Final verification results

- Frontend: 301 tests passed, zero failed/skipped.
- Backend selected non-database suite: 506 passed, zero failed, one opt-in live FastAPI case skipped (507 total). PostgreSQL integration files were deliberately excluded; no database was contacted.
- Frontend/backend TypeScript and ESLint: passed.
- Repository formatting: passed.
- Frontend/backend production builds: passed; no Vite warnings.
- Prisma validation: passed against source with an unreachable dummy datasource, without a database connection.
- Workspace Chrome: eight requested viewport/theme sets, five sections plus photo entry, mock personal/skills/interests/achievement/portfolio saves, duplicate submit lock, pending input lock, cross-section and overview draft retention, failed-save retention, unload warning, empty states and 200%-equivalent desktop reflow passed.
- Existing Professional Profile browser tests and approved photo-editor browser tests are rerun as separate regression checks. Their JSON evidence is included with the screenshot artifacts.

Current production bundle: Profile JS 63.54 kB raw / 18.29 kB gzip; Profile CSS 24.55 kB raw / 5.30 kB gzip; main JS 133.36 kB raw / 41.30 kB gzip. No dependencies added; route-level splitting retained.

Synthetic browser evidence directory:
C:\Users\dahiy\CampusConnect-Profile-Step13C.1-2026-11-02

All screenshot filenames begin workspace-SYNTHETIC (workspace), native-SYNTHETIC (prior profile regressions), reliability-SYNTHETIC or photo-SYNTHETIC. No real development-account persistence is implied.

## Exact source-file inventory

### Modified

- `frontend/src/features/profile/AchievementsManager.tsx`
- `frontend/src/features/profile/EditProfileForm.tsx`
- `frontend/src/features/profile/InterestsManager.tsx`
- `frontend/src/features/profile/PortfolioManager.tsx`
- `frontend/src/features/profile/ProfessionalProfileForm.tsx`
- `frontend/src/features/profile/profile.css`
- `frontend/src/features/profile/ProfilePage.tsx`
- `frontend/src/features/profile/SkillsManager.tsx`

### Created

- `frontend/src/features/profile/profile-draft-state.ts`
- `frontend/src/features/profile/profile-drafts.tsx`
- `frontend/src/features/profile/profile-editor.css`
- `frontend/tests/profile-workspace-browser-qa.mjs`
- `docs/profile-edit-workspace-readiness.md`

No source files deleted. Backend, Prisma/migrations, private environment files, approved overview component and approved photo editor source/styles remain unchanged against pre-step hashes.
