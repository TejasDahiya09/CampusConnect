# Step 13B.5 — Native professional profile

Date: 2026-11-01. LinkedIn OAuth has been cancelled. **Native presentation implemented; additional persistence and photo upload remain gated.**

## 1. Removal evidence and boundaries

The owner explicitly identified the OAuth migration as never applied. The repository's prior readiness and hardening reports recorded it as proposed/unapplied. The Step 13B.4 creation attempt failed before creation or test setup, and no migration execution followed. Its last verified SHA-256 was `0f7f54c27496bcf7c80a5923c05ba9bb0db16138096d18171002010ad3105209`. These consistent session and repository records support removing that proposed migration; this was not a live database-history audit or a claim about unknown external databases.

Removed the OAuth backend module, router mount, provider, flow/connection repositories, cleanup helpers, Prisma models/relations, unapplied migration, frontend connection service/card, consent/callback logic, provider-specific tests/fixtures and obsolete readiness documents. Removed 28 stale compiled OAuth artifacts from the feature's old backend dist directory. No dependency was removed: shared `jose`, Supabase and other consumers remain intact.

A source-only historical copy of the 21 removed files is outside the repository at `C:\Users\dahiy\CampusConnect-Abandoned-LinkedIn-2026-11-01`. It is not active migration/code input and contains no environment files. No actual database or roles were modified. All six older migration files match their pre-task hashes. No Git, deployment, installation, LinkedIn requests, paid AI or production operations.

Backend/frontend private env files contained no LinkedIn OAuth keys, so neither required editing. Removed abandoned settings from backend/.env.example. The application now requires no LinkedIn credentials or feature flags.

## 2. Native card and editing

The owner Profile retains its approved approximately 65/35 desktop composition, main identity, About, skills, achievements, interests and portfolio, with native professional card and completion in the sidebar. Existing safe non-sticky fallback is retained where the document overflow ancestor prevents sticky positioning. No AppShell or public Profile layout changed.

The card uses CampusConnect branding and the existing avatar/initials fallback, real display name and location, existing department/year as an honest education fallback, and the first five existing skills without invented ranking. Optional education and experience display only explicitly supplied records. No fake university, employer, rating, verification or imported identity. LinkedIn icon appears on the external-profile link, not as the card's brand.

The canonical stored LinkedIn selection/validation and all portfolio records remain. `View LinkedIn Profile` opens only an existing valid student-supplied profile URL in a new tab with noopener/noreferrer. If absent, the owner sees `Add LinkedIn Profile`, which opens/focuses the existing Portfolio editor. No scraping, iframe, metadata fetch or LinkedIn API call occurs. Other portfolio links remain visible.

The existing temporary editor now has a Professional Profile section. Name/location/avatar and LinkedIn URL actions lead to existing editors rather than duplicating their mutation paths. New headline/education/experience editing is prepared, retains drafts during errors and displays explicit save feedback. Before storage approval, those fields and Save are disabled with a truthful explanation. Profile photo selection is separately disabled at all times. Existing Skills, Interests, Achievements, Portfolio, base-profile saving and Resume Analyzer remain.

Professional information loads independently of the base Profile/options: failed or hanging optional retrieval cannot prevent the existing Profile from rendering. Owner workspace remains keyed by account ID/status, preventing account-switch leakage. New professional details are not added to completion scoring.

## 3. Supported versus pending data

| Data                                       | Status                                                                                                                 |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Display name, location, department/year    | Existing persisted Profile fields; existing editor                                                                     |
| Skills, portfolio records and LinkedIn URL | Existing persistence and validation retained                                                                           |
| Avatar                                     | Existing predefined avatar/initials; not a student photograph                                                          |
| Headline                                   | Prepared owner-only storage/API/editor, max 180 characters; not enabled or database-tested                             |
| Education                                  | Up to five institution/qualification entries, 180 characters each; same pending status                                 |
| Experience                                 | Up to five role/organization/description entries; role/organization max 180, description max 1000; same pending status |
| Professional photograph                    | NOT IMPLEMENTED; no upload or persistent photo exists                                                                  |
| Public professional additions              | Not supported or authorized                                                                                            |

Optional missing fields use empty states, never manufactured values. React text rendering escapes stored content. Full document replacement rejects extra keys, supplied user IDs, photo URLs, oversized strings/lists and missing required entry names.

## 4. Smallest privacy-safe persistence proposal — NOT APPLIED

Prisma model `ProfessionalProfile` maps to `professional_profiles`, a separate server-only table with user_id UUID primary key/FK and details JSONB NOT NULL. Hard user deletion cascades. The object CHECK enforces a JSON object; entry bounds are validated by the API. No fields were added to existing public Profile rows, avoiding accidental exposure through any existing browser table grants. No modification of existing Profile data or backfill.

Exact prepared SQL: [migration.sql](../backend/prisma/migrations/20261101020000_native_professional_details/migration.sql).

SQL SHA-256: `7cac2c39c26075e0e1eaff88901185d2497c6f5d427f1c6e647f2b1e760e7c91`.

SQL creates only the private table, PK, cascading users FK, object CHECK, RLS and PUBLIC/conditional anon/authenticated revocations. No browser policies. The backend must use an explicitly trusted owner/bypass role with appropriate privileges. Effective production role inheritance, direct REST access and RLS remain unverified; review them before approval. New-table/FK creation can briefly lock referenced users. A separately approved rollback would first disable storage, then remove only this new table and deliberately reconcile migration history; it destroys native professional additions, not existing Profile data. No rollback was run.

`PROFILE_PROFESSIONAL_STORAGE_READY=false` is documented in the example. It is not enabled. Existing Profile queries never select this table. The new protected route checks ACTIVE auth and derives user ID exclusively from the authenticated actor:

- GET `/api/profile/me/professional`: `{professional:{available:false,details:null}}` while disabled, without querying storage.
- PUT same path: full replacement `{headline,education,experience}`; returns 503 while disabled.
- When separately enabled after approved migration/testing: owner-only read and transactional write, locking/rechecking the ACTIVE user and requiring an existing Profile before upsert.

Responses are private/no-store. The public Profile DTO/service and PublicProfilePage are unchanged; private additions never enter their projection. Unit tests verify denied auth/status, spoofed ownership, pending no-storage access, validation, and public projection exclusion. **No genuine native-table persistence or database permissions test has run.** Browser save tests below use in-memory synthetic API adapters only.

## 5. Photograph feasibility and required next work

Existing `ProfileAvatar` only supports predefined IDs. The existing avatar JSON validators reject remote URLs and uploaded-image records. Marketplace media authorization requires an editable owned listing and listing-specific pending/final keys, metadata and finalization. It is not a Profile upload API. Existing S3 abstraction can inform a future implementation, but no listing media endpoint was reused and no S3 call was made.

The current inspected Marketplace finalization checks object HEAD metadata, size, MIME, extension, uploader and listing IDs. These checks alone do not establish decoded image/signature safety for a new Profile flow. No Profile-specific image decoder/re-encoder, media record or visibility-aware retrieval currently exists.

Proposed future workflow, not implemented or authorized to enable:

1. Dedicated authenticated ACTIVE owner upload, at most 5 MiB, JPEG/PNG/WebP only, bounded upload rate and request memory.
2. Verify actual byte signature and decode with strict pixel/dimension limits; reject corrupt/animated/unsupported files, re-encode and strip metadata. Assess existing tooling before requesting any new dependency.
3. Store generated owner-scoped private object references through the existing storage abstraction only after bucket/key permissions are reviewed. Never accept arbitrary remote URLs or client-selected final keys.
4. Approve minimal server-only photo reference/MIME/size persistence and replacement/deletion lifecycle. No speculative photo column was included in this migration.
5. Issue media only after the same owner/public-profile visibility decision. Keep raw keys out of browser DTOs; use an authorized delivery mechanism. Do not silently grant public photo access.
6. Test ownership, suspension, hidden profiles, MIME/signature mismatch, oversize/decompression limits, replacement consistency, failures and persistence against an explicitly authorized isolated storage path.

The current disabled file control communicates this dependency; it does not offer a misleading saved preview. No student photograph was uploaded, downloaded, stored or replaced. The existing avatar remains functional.

## 6. Validation actually executed

| Check                                      | Result                                                                                                                                         |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Profile/professional backend focused tests | 24 passed, 0 failed/skipped                                                                                                                    |
| Full backend tests                         | 464 discovered; 361 passed, 103 preexisting database skips, 0 failed                                                                           |
| Full frontend tests                        | 287 passed, 0 failed/skipped                                                                                                                   |
| Backend/frontend TypeScript                | Passed                                                                                                                                         |
| Backend/frontend ESLint                    | Passed; no warnings                                                                                                                            |
| Backend/frontend production builds         | Passed                                                                                                                                         |
| Prisma validation                          | Passed; local generation only                                                                                                                  |
| Formatting                                 | Passed                                                                                                                                         |
| Native Profile Chrome                      | 18 synthetic state/viewport/theme combinations plus pending editor, mocked save/error/draft retention, missing link and avatar fallback passed |
| Existing Profile Chrome                    | 18 viewport/theme cases plus CRUD, drafts, resume approval, completion, errors, clearance and reflow proxy passed                              |
| AppShell Chrome                            | 20 viewport/theme cases plus links, roles, history and keyboard checks passed                                                                  |
| Dashboard Chrome                           | 18 viewport/theme cases plus nine states, actions/account isolation/clearance passed                                                           |
| Native professional database persistence   | NOT RUN; migration approval pending                                                                                                            |
| Photo storage / actual upload              | NOT IMPLEMENTED / NOT VERIFIED                                                                                                                 |
| Real authenticated production/browser data | Not accessed                                                                                                                                   |

Removed OAuth-only tests are no longer relevant and are not counted as native coverage. Database tests for unrelated modules remain skipped. Backend checks suppressed dotenv, used an unreachable dummy application database URL and process-only dummy AWS signing configuration. No private PostgreSQL file was loaded and no database or AWS access occurred.

Chrome fixtures use the actual Profile/AppShell components with labelled synthetic records and isolated API adapters. External fetch is blocked; there is no live LinkedIn or real data persistence. Captures cover 1440/390/320 Light/Dark, empty/missing link/avatar, long headline/experience and editors. Existing Profile coverage also includes 1920/1280/1024/768/430/360 and short/reflow cases. Native 200% browser zoom and real mobile software keyboard remain unverified. Screenshots are review evidence, not visual approval.

Current route bundle: Profile JS 36.45 kB (9.65 kB gzip), route CSS 10.32 kB (2.57 kB gzip). No new dependencies or build warnings.

## 7. Files

Created:

- backend/src/modules/profile/professional-profile.ts
- backend/prisma/migrations/20261101020000_native_professional_details/migration.sql
- backend/tests/professional-profile.test.ts
- frontend/src/features/profile/professional-profile.ts
- frontend/src/features/profile/ProfessionalProfileCard.tsx
- frontend/src/features/profile/ProfessionalProfileForm.tsx
- frontend/tests/professional-profile.test.ts
- frontend/tests/professional-profile-browser-qa.mjs
- docs/native-professional-profile-readiness.md

Modified:

- backend/src/routes/index.ts
- backend/prisma/schema.prisma
- backend/.env.example
- backend/tests/profile-service.test.ts
- frontend/src/features/profile/ProfileOverview.tsx
- frontend/src/features/profile/ProfilePage.tsx
- frontend/src/features/profile/profile.css
- frontend/tests/profile-overview.test.ts
- frontend/tests/profile-visual-fixture.ts
- frontend/tests/profile-browser-qa.mjs

Removed:

- backend/src/modules/profile/linkedin/{linkedin.cleanup,linkedin.config,linkedin.provider,linkedin.repository,linkedin.routes,linkedin.service,linkedin.types}.ts
- backend/tests/{linkedin-postgres,linkedin-repository-conflicts,linkedin-routes,linkedin-security,linkedin-test-safety}.test.ts
- backend/tests/helpers/{linkedin-store,linkedin-test-safety}.ts
- backend/prisma/migrations/20261101010000_linkedin_oidc_connection/migration.sql
- frontend/src/features/profile/{LinkedInCard.tsx,linkedin-service.ts}
- frontend/tests/{linkedin-card.test.ts,linkedin-browser-qa.mjs}
- docs/{linkedin-connection-readiness.md,linkedin-migration-hardening.md}

Unrelated approved module/shell source and older migrations match pre-task hashes. ProfileCompletion, existing profile service/repository/validators, PublicProfilePage, LinkedIn URL validator/icon and portfolio implementation remain unchanged.

## 8. Readiness and stop

The application no longer depends on LinkedIn OAuth. Existing student-owned fields and the native external-link card work within existing contracts. New professional storage is prepared and disabled pending separate SQL approval, isolated persistence/permission tests and backend-role review. Photo upload needs its own secure workflow and approval. No claim of actual photo or new-field persistence is made.

Await native-card screenshot approval and the remaining persistence/photo decisions. The temporary editor is compatible with later Step 13C work; Step 13C has not begun. No migration, infrastructure or production action is authorized by this report.
