# Step 13B.9 ? Secure profile photo source implementation

Status: **implemented and tested with synthetic adapters; normal upload/save is gated OFF.** No Supabase/database connection or write, real AWS upload/read/delete, migration, grant, infrastructure change, Git operation or deployment was performed. Professional-details migration/activation remain postponed and untouched. No Step 13C work.

## Existing infrastructure and persistence choice

`profiles.avatar` is already nullable JSONB, selected by Profile, participant and discovery queries. It previously supported only four predefined avatars; there was no approved photo upload protocol or storage association. Existing S3 utilities support private-bucket presigned PUT, SSE, bounded media reads and CloudFront URL construction, but their Marketplace-specific metadata/ownership must not authorize Profile uploads.

The new feature reuses the existing S3 client/configuration and CloudFront delivery abstraction. It has its own owner-only protocol. There is **no new table, field, Prisma schema change or migration**. The existing professional migration remains unchanged (SHA-256 `8ed9e94167382e9c37086d6740a7e529482e457cdcaa17c1bda9ffc70ce0aa1f`).

Stored avatar JSON is server-generated:

```json
{
  "type": "photo",
  "id": "<random UUID>",
  "objectKey": "profile-photos/<same UUID>.png",
  "fallback": { "type": "predefined", "id": "campus-indigo" }
}
```

Fallback can be null. Replacing a photo preserves its original predefined/initials fallback; removal restores that fallback. Stored references are durable in the existing profile row. The new repository locks the authenticated user, rechecks ACTIVE account/profile and compare-and-swaps the avatar in one transaction. Only the avatar column is changed. Normal Profile avatar PATCH still accepts predefined values only, and refuses overwriting a stored photo; unrelated Profile edits omit the avatar when a photo exists. This prevents accidentally destroying a photo reference or bypassing its removal workflow.

An avatar version is a stable canonical SHA-256 of the current JSON value. Stale upload/removal requests return 409. It is content-based concurrency, not edit history.

API projections expose only `{type:'photo',id,url}` through the configured CloudFront origin, never the stored key, fallback metadata, ticket secret or a client-supplied URL. Existing ACTIVE/moderation restrictions remain authoritative; hidden participant photos are omitted. Direct image delivery follows the existing CloudFront abstraction, not a new authenticated image proxy.

## Backend contract

All routes require the existing Supabase authentication middleware and an ACTIVE account; identity is taken from verified authentication, never a client user ID. Unit HTTP tests use signed local test tokens with the real middleware, not Supabase interoperability.

| Route                                         | Input / behavior                                                                                                                                                                             |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/profile/me/photo`                   | `{photo:{available,avatar,version}}`; private/no-store. When disabled, returns `{available:false,avatar:null,version:null}` without a photo repository/storage operation.                    |
| `POST /api/profile/me/photo/uploads`          | `{size,version}` for the cropped PNG; returns short-lived upload URL, required headers, expiry and an owner-bound HMAC ticket. No supplied key, MIME type, filename or owner ID is accepted. |
| `POST /api/profile/me/photo/uploads/complete` | `{ticket}`; checks signature/owner/expiry, rechecks current avatar, verifies and canonicalizes actual uploaded bytes, writes a new immutable image, then commits its reference via CAS.      |
| `DELETE /api/profile/me/photo/uploads`        | `{ticket}`; owner-bound best-effort pending-object cleanup. Allows a limited post-expiry cleanup grace. Does not remove an associated photo.                                                 |
| `DELETE /api/profile/me/photo`                | `{version}`; checks current state, restores fallback through CAS, then best-effort deletes the old origin object.                                                                            |

Missing/invalid authentication: 401; inactive/unavailable actor: 403; malformed input/tickets/images: 400; avatar conflict: 409; upload/complete rate limit: 429; disabled or unavailable saving: 503. Unknown backend/storage exceptions are replaced by generic photo errors before shared logging; no private payload/object key is logged. DTOs and mutation responses are private/no-store. No profile save succeeds on a failed/disabled API response.

The per-user authorization/completion limiter is bounded (eight requests/minute, maximum 1,000 active windows). It is process-local, not a distributed production quota.

## Image and S3 security

- Source selection: JPEG/PNG/WebP only, maximum 5 MiB, minimum 128 pixels/side, maximum 8,192 pixels/side and 16 megapixels. Header dimensions are checked before browser decode; browser decoding confirms valid content and orientation. Oversized/unrecognized headers are rejected rather than decoded without limits.
- Crop: a square is explicitly selected with zoom/horizontal/vertical controls and a circular avatar preview. Canvas exports 512?512 PNG, maximum 2 MiB. Original filename/metadata are not persisted.
- Presigned PUT: five-minute expiry, signed PNG content type, content length, SSE-AES256 and owner/session/size metadata. Random server UUIDs determine the pending key. No public-write ACL is added; no AWS secret is sent to the browser. Browser PUT carries only the signed headers, not the CampusConnect Bearer token.
- Completion: server HEAD verifies content type, length, SSE and signed owner/session metadata. GET is ETag-bound and streamed with an exact byte limit, preventing an object swap or oversized body from being accepted.
- Server PNG validator checks signature, chunk lengths, CRCs, exact dimensions, supported RGB/RGBA/bit depth, compression/filter/interlace fields, bounded full decompression, scanline filter values and end-of-file. Unknown/active/animation/text chunks and trailing data are rejected. Allowed ancillary metadata is discarded. Image data is recompressed into canonical IHDR/IDAT/IEND chunks before publication.
- Published keys are fresh random UUIDs and contain no student IDs. Final objects carry server-written owner metadata; removal of a persisted reference verifies origin ownership before DELETE, protecting another student's object even if a profile reference were corrupted. Server-written images use SSE and `Cache-Control: no-store`. Existing CloudFront behavior must still be reviewed; headers alone do not prove CDN revocation.
- Concurrent completions write different final keys. Only the successful CAS retains its object; known losers are deleted. Old images are deleted only after a successful replacement. If a database commit outcome is uncertain, the new origin object is retained rather than risking deletion of a committed photo; the UI requires a reload instead of claiming success.
- Pending uploads are cleaned up on cancellation, completion or rejection where possible. Capability URLs/tickets are not server-side one-time sessions and remain usable by their owner until expiry; cancellation is best-effort cleanup, not cryptographic revocation.

### Cleanup and delivery limitations

An interrupted process, abandoned browser, failed deletion or uncertain commit can leave an orphan. No lifecycle policy, purge process, cleanup table or CDN invalidation was created. Agree on an approved pending-prefix lifecycle/orphan reconciliation plan before activation. Removal confirms removal from the profile, not verified destruction of every cached copy. Hidden profiles stop exposing photos in DTOs; previously known CloudFront URLs are not automatically revoked. The current distribution's cache/access rules require explicit review before enabling real student uploads. No actual S3 or CloudFront behavior is claimed verified.

## Frontend and identity integration

Profile hero photo is a keyboard-accessible edit trigger with the existing hero geometry preserved. The professional editor's former disabled upload placeholder now opens this separate photo editor; professional fields remain independently gated. The professional card uses the same uploaded avatar when present. Public Profile uses the same shared renderer without adding private fields or new public-profile routes.

Native modal dialog provides contained focus, Escape/cancel, focus restoration and body-scroll restoration. The dialog retains visible header/actions while the editor body scrolls on small viewports. Sliders and file input are labelled and touch accessible. Circular canvas preview, reset, loading/progress, clear errors, replacement/removal and cancellation are implemented. During final commit/removal, cancellation is disabled because an aborted HTTP response cannot guarantee rollback; timeout/uncertain results instruct reload. Async state is guarded against unmount/account changes, image bitmaps are closed, uploads abort, and pending cleanup is attempted. Invalid selections never generate an upload.

When the photo gate is disabled, selection/crop preview still work but Save/Remove remain disabled and no upload authorization is requested. No synthetic photo is inserted into normal application data. User copy explains that photos can appear on public Profile and beside their name.

The shared `ProfileAvatar`/`StudentAvatar` renderer validates photo DTOs, uses no-referrer HTTPS images and falls back after load failure. Initials and the existing predefined catalog remain. Runtime Auth adds only an optional sanitized photo to the authenticated owner's profile DTO. The existing header's contents use this photo without changing AppShell layout; successful photo saves/removals and fresh own-Profile reads update the account avatar. Account transitions clear local override state. Dashboard uses that existing header identity surface; no dashboard layout/avatar card was added.

Messaging, TeamUp/student discovery, Services, Marketplace seller, Lost & Found reporter and search identity surfaces consume sanitized photo projections through their existing authorized responses. Shared participant mapping strips stored keys and preserves suspended/hidden-account rules. No messaging encryption, participant authorization or module workflow was changed. No extra catalog/profile requests are made solely to obtain decorative avatars.

The pure shared photo-value validator is split from crop/upload code, keeping image preparation in the Profile route rather than shipping its editor to every identity surface. No dependency, animation library, font or image asset was added.

## Activation requirements - NOT performed

`backend/.env.example` documents these independent settings only:

- `PROFILE_PHOTO_STORAGE_READY=false` (default OFF).
- `PROFILE_PHOTO_UPLOAD_SECRET` (empty template; requires a privately generated dedicated random server secret, at least 32 characters).
- `PROFILE_PHOTO_LOCAL_OWNER_ID` (empty template; the explicitly approved ACTIVE development student UUID).

Actual private environment files were not edited. The normal Professional Profile storage gate remains unchanged/disabled. Photo readiness additionally requires existing S3 region/bucket/CloudFront configuration; configured values alone do not verify infrastructure.

Before separately approved activation, verify the intended actual application database's existing avatar field/runtime write permissions and deny browser/REST writes that bypass the avatar protocol (and unintended direct reads of internal avatar metadata) (no migration is needed for this feature), review IAM for the two photo prefixes, bucket privacy, exact-origin CORS/signed headers, CloudFront delivery/cache rules and cleanup expectations. Do not change these infrastructure controls automatically. Then use an expressly authorized development account for a real upload/replace/remove/reload test. That live test and any backend gate change require separate authorization; they are not implied by mocked test success.

Professional persistence, Supabase preflight/migration work, storage activation and Profile photo storage are separate concerns. Do not enable `PROFILE_PROFESSIONAL_STORAGE_READY`, apply its migration, resume Supabase work, or use disposable test credentials as normal application configuration as part of this feature.

## Validation and evidence boundaries

Final check results, bundle measurements and the exact changed-file inventory are recorded in the completion evidence. New backend coverage exercises real Express/authentication with synthetic signed tokens and mocked repository/S3 adapters, plus the actual S3 adapter with its SDK transport mocked. Presigning is local cryptography with synthetic credentials only. No AWS SDK transport reached a provider.

The Chrome fixtures use actual components, crop geometry, image decoding/canvas, theme tokens, native dialog and photo client. API/S3 transport and delivered images are explicitly synthetic; HTTPS image requests are fulfilled locally using CDP interception. They are not authenticated real-account, S3, database persistence or Supabase acceptance evidence. Screenshots are labelled `SYNTHETIC`.

The prior Professional Profile browser reliability checks are rerun to guard draft/conflict behavior and the disabled professional gate. PostgreSQL test suites and the opt-in live AI service case are not executed in this phase. Backend/frontend production builds are local build validation, not deployment. Visual acceptance remains with the user.

## Final validation - 2026-11-02

| Check                                                | Actual result                                                                                          |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Frontend tests                                       | 300 passed, 0 failed, 0 skipped                                                                        |
| Backend non-database tests                           | 506 passed, 0 failed, 1 skipped (opt-in live FastAPI); 507 total                                       |
| Frontend and backend TypeScript                      | Passed, including backend test TypeScript                                                              |
| Frontend and backend ESLint                          | Passed, zero warnings                                                                                  |
| Frontend and backend production builds               | Passed with NODE_ENV=production; no Vite warnings                                                      |
| Prisma validation                                    | Passed with unreachable dummy datasource; no database connection                                       |
| Photo Chrome fixtures                                | Six viewport/theme combinations (1440/390/320, Light/Dark); actual editor/canvas, synthetic transports |
| Existing native Professional Profile Chrome fixtures | 30 viewport/theme/state combinations passed, plus editor/draft/fallback cases                          |
| Professional reliability Chrome fixtures             | 10 scenarios passed                                                                                    |

Formatting is checked repository-wide after the final report edit. Only the opt-in live AI test was skipped within the selected backend suite; PostgreSQL integration files were deliberately excluded, not counted as passing. Backend tests used a dummy loopback port-1 datasource, DOTENV_CONFIG_PATH=NUL, synthetic AWS credentials and mocked S3 transport. Production builds generate the local Prisma client but do not execute migrations.

The photo browser checks cover changing crop pixels, keyboard containment, focus restoration, mock save/remove and header-avatar synchronization, disabled-gate preview without upload, failed commit without false success, upload cancellation without completion, invalid file selection, horizontal overflow and visible footer actions. Manual screenshot review confirms desktop composition and readable mobile scroll containment. At 320x568, scroll the modal body to reach all crop controls while Cancel/Save remain visible. Native 200% zoom, real account login, real CloudFront cache behavior and live persistence were not verified.

Final production output (decimal kB as reported by Vite):

| Asset                          | Raw kB | gzip kB |
| ------------------------------ | -----: | ------: |
| Main entry JS                  | 133.36 |   41.31 |
| Profile route JS               |  57.34 |   16.36 |
| Profile route CSS              |  18.57 |    4.20 |
| Main CSS                       | 139.08 |   24.95 |
| Largest JS chunk: React vendor | 231.97 |   74.41 |

No dependencies added. Profile editor/crop code remains in the Profile route; shared identity consumers import the small pure validator. A clean same-checkout pre-change production bundle was not rebuilt, so these are measured final sizes rather than an asserted exact before/after delta.

Synthetic screenshot/result evidence:
C:\Users\dahiy\CampusConnect-Profile-Photo-Step13B.9-2026-11-02

Source integrity comparison: 34 existing files modified, 15 new files, no deleted files within the captured source/tests/docs/environment inventory. All Prisma schema/migration files and actual private backend environment files remain byte-for-byte unchanged. The approved professional migration SHA-256 remains:
8ed9e94167382e9c37086d6740a7e529482e457cdcaa17c1bda9ffc70ce0aa1f

## Exact source file inventory

### Created

- `backend/src/modules/profile/profile-avatar-value.ts`
- `backend/src/modules/profile/profile-photo-image.ts`
- `backend/src/modules/profile/profile-photo-storage.ts`
- `backend/src/modules/profile/profile-photo.ts`
- `backend/tests/profile-photo-storage.test.ts`
- `backend/tests/profile-photo.test.ts`
- `frontend/src/features/profile/AccountAvatar.tsx`
- `frontend/src/features/profile/own-avatar.ts`
- `frontend/src/features/profile/photo-client.ts`
- `frontend/src/features/profile/profile-avatar-value.ts`
- `frontend/src/features/profile/profile-photo.css`
- `frontend/src/features/profile/ProfilePhotoEditor.tsx`
- `frontend/tests/profile-photo-browser-qa.mjs`
- `frontend/tests/profile-photo.test.ts`
- `docs/profile-photo-readiness.md`

### Modified

- `backend/src/routes/index.ts`
- `backend/src/services/storage/s3-storage.service.ts`
- `backend/src/modules/auth/auth.repository.ts`
- `backend/src/modules/auth/auth.types.ts`
- `backend/src/modules/lost-found/lost-found.repository.ts`
- `backend/src/modules/marketplace/marketplace.repository.ts`
- `backend/src/modules/marketplace/marketplace.types.ts`
- `backend/src/modules/profile/profile.repository.ts`
- `backend/src/modules/profile/profile.types.ts`
- `backend/src/modules/search/search.service.ts`
- `backend/src/modules/services/services-policy.ts`
- `backend/src/modules/students/students.service.ts`
- `backend/src/modules/teamup/teamup.repository.ts`
- `frontend/src/app/AppShell.tsx`
- `frontend/src/features/auth/auth.types.ts`
- `frontend/src/features/lost-found/LostFoundReportDetail.tsx`
- `frontend/src/features/marketplace/marketplace.types.ts`
- `frontend/src/features/marketplace/MarketplaceListingDetail.tsx`
- `frontend/src/features/messaging/MessagesPage.tsx`
- `frontend/src/features/profile/EditProfileForm.tsx`
- `frontend/src/features/profile/ProfessionalProfileCard.tsx`
- `frontend/src/features/profile/ProfessionalProfileForm.tsx`
- `frontend/src/features/profile/profile.css`
- `frontend/src/features/profile/profile.types.ts`
- `frontend/src/features/profile/ProfileAvatar.tsx`
- `frontend/src/features/profile/ProfileOverview.tsx`
- `frontend/src/features/profile/ProfilePage.tsx`
- `frontend/src/features/services/ServiceDetailPanels.tsx`
- `frontend/src/features/students/StudentAvatar.tsx`
- `frontend/tests/chrome-fixture-driver.mjs`
- `frontend/tests/professional-profile-browser-qa.mjs`
- `frontend/tests/professional-profile.test.ts`
- `frontend/tests/profile-visual-fixture.ts`
- `backend/.env.example`

### Deleted

None.

## Step 13C.3 local activation control update

The default photo router now additionally requires development mode, a loopback frontend and actual loopback backend peer, and the designated owner UUID. Production/test runtime flags cannot enable the default photo router. The configuration-only command `npm run photo:check-local --workspace backend` performs no network or database calls and does not prove real infrastructure readiness. Photo and professional storage remain disabled. See [the Step13C.3 report](profile-photo-local-activation.md) for actual read-only findings and the exact approval needed before uploads or database writes.
