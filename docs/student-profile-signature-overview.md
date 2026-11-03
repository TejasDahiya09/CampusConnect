# Student Profile - Step 13B.7 signature portfolio

Date: 2026-11-01. Status: implemented; visual approval pending. All browser evidence uses real components and isolated synthetic DTOs, not a production account.

## Audit and composition

The previous cover was low contrast and relied on disconnected circles. The professional card gave pending storage too much prominence. Joined About/Skills, separate Achievements and joined Interests/Links had inconsistent section rhythm. Refresh occupied a separate toolbar. Completion had weak guidance and repeated generic editing actions. Native sticky had not worked in the shared document scroll chain.

The new cover uses existing indigo/lavender semantic accents and an original, decorative inline campus-network motif. It is not a campus map or institutional badge. Light has a confident indigo cover; Dark uses a deliberate graphite surface with lavender text and fine linework. The existing avatar/fallback is retained, the name has stronger hierarchy, and real department/year/location wrap naturally. Refresh is integrated into the cover; Edit profile remains primary and Public view secondary. No fake profile metrics, identity claims or new fields were introduced.

Main content forms one portfolio canvas with consistent section spacing and purposeful dividers: About, Skills, Achievements, then Interests/Portfolio. Every skill remains available, including actual existing proficiency values. Multiple achievements use a restrained timeline and formatted actual dates; single/empty states do not imply a fabricated timeline. Portfolio rows retain real labels and safe destinations, with derived link-type/host presentation rather than raw URL clutter. LinkedIn is featured once while every stored link remains accessible.

The professional card has two truthful states. Available synthetic professional data demonstrates the real supported headline, education, experience, location and link presentation. The currently gated state says "Your professional story starts here" with the functional LinkedIn URL action; storage status is a small, explicit footer. It does not duplicate the student's avatar/name/skills or offer a fake professional save. The existing temporary editor and disabled photo upload are preserved.

Mobile puts the compact professional card after the identity hero, then the main content and completion. Sections and links stack without a second scroller; skills wrap. Existing six-item navigation, safe-area clearance and global styles remain unchanged.

## Completion and actions

The original ten criteria and supplied completed/total/percentage are unchanged. A regression checks all ten and 100% presentation. Missing editable criteria target the existing editor sections; Email verified stays truthful and does not link to an invented verification operation. No redundant Edit missing details button appears at 100%.

| Action                              | Existing destination/behavior retained                          |
| ----------------------------------- | --------------------------------------------------------------- |
| Refresh profile                     | Existing refresh callback and pending guard                     |
| Edit profile                        | Existing temporary editor                                       |
| Public view                         | Existing public-profile route                                   |
| Introduction / missing identity     | Identity editor                                                 |
| Edit skills                         | Skills editor                                                   |
| Add/edit achievements               | Achievements editor                                             |
| Edit interests                      | Interests editor                                                |
| Manage links / Add LinkedIn Profile | Portfolio editor                                                |
| View LinkedIn Profile               | Existing normalized external URL, safe external-link attributes |

No new data requests were introduced: the fixture records the same three initial requests for profile, options and professional capability/data.

## Sticky investigation and bounded affix

Computed Chrome ancestor evidence is in `after/signature-results.json`. Profile wrappers and MAIN have visible overflow. AppShell has `overflow-x: clip; overflow-y: visible`; BODY computes to `overflow-x: clip; overflow-y: auto`; HTML computes auto/auto. A temporary Profile-only native `position: sticky; top: 90px` experiment, without changing shared styles, did not pin: the rail top moved from 351.72 to -48.28 to -248.28px at window scroll 0/400/600.

The final solution is **Profile-local bounded transform affix, not native CSS sticky**. Both professional and completion panels translate together while retaining their normal-flow geometry. One requestAnimationFrame batches passive window scroll/resize work, with ResizeObserver for dimensions. Translation is limited to the Profile workspace bottom and follows the visible header. No fixed portal, global overflow change, independent scrolling container or React render on each scroll is used. Observers/listeners/frames clean up on unmount.

At actual scroll 400/600/800 in the substantial-achievements fixture, the rail stayed at 16px and completion at 356.03px; the pair bottom was 618.45px in a 900px viewport. Document height stayed 2078px. Wheel input over the rail continued window scrolling. Expanding completion beyond the usable viewport disabled affix and kept keyboard focus visible. Narrow/mobile and too-tall sidebar cases remain ordinary flow. No shared-layout approval/change was needed. The old 13B.6 static-sidebar report is historical and superseded by this measured local approach.

## Accessibility and measured layout

- Required 1920/1440/1366/1280/1024 and 430/390/360/320 width matrix: Light and Dark, no horizontal overflow in synthetic Chrome fixtures.
- Fresh Chrome profile, default 100%, device pixel ratio 1 and visual viewport scale 1 recorded.
- Cover text/background contrast measured 6.29:1 Light and 7.94:1 Dark; this is not a whole-page automated contrast certification.
- All visible Profile link/button targets measured at least 44px high in the signature matrix. Native disclosures, progress semantics, focus styles and reduced-motion handling remain.
- At 1440: hero top 95px, bottom 331.72px; content/rail start 351.72px. Populated document height 1305px. At 390: 2392px; at 320: 2740px. Mobile retains natural scrolling rather than compressing all content into one viewport.
- Existing Profile QA checks bottom-bar clearance and editors/drafts/mutations, errors/retry, explicit resume approval and loading states. Public navigation was tested in an isolated router, not against a live public-profile API.
- Native 200% browser zoom is **unverified**. Existing 720px zoom-equivalent reflow checks passed and are not claimed as native zoom.

## Files

Created:

- `frontend/src/features/profile/ProfileCoverArt.tsx`
- `frontend/src/features/profile/useProfileAffix.ts`
- `frontend/tests/profile-signature-browser-qa.mjs`
- This report.

Modified:

- `frontend/src/features/profile/ProfileOverview.tsx`
- `frontend/src/features/profile/ProfilePage.tsx`
- `frontend/src/features/profile/ProfessionalProfileCard.tsx`
- `frontend/src/features/profile/ProfileCompletion.tsx`
- `frontend/src/features/profile/profile-overview.ts`
- `frontend/src/features/profile/profile.css`
- `frontend/tests/profile-overview.test.ts`
- `frontend/tests/professional-profile.test.ts`
- `frontend/tests/profile-visual-fixture.ts`
- `frontend/tests/profile-browser-qa.mjs`
- `frontend/tests/profile-premium-browser-qa.mjs`

Obsolete cover-circle, standalone toolbar and inconsistent section treatment were replaced in the existing stylesheet. There is no extra CSS override file or new dependency. Existing editor rules remain.

## Validation

| Check                                     | Actual result                                                                                                                              |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Full frontend tests                       | 291 passed, 0 failed/skipped                                                                                                               |
| Relevant mocked backend Profile contracts | 24 passed, 0 failed/skipped                                                                                                                |
| Frontend ESLint / TypeScript              | Passed                                                                                                                                     |
| Backend ESLint / TypeScript               | Passed                                                                                                                                     |
| Repository formatting check               | Passed                                                                                                                                     |
| Frontend / backend production builds      | Passed; no new Vite warnings                                                                                                               |
| Existing Profile Chrome QA                | 20 viewport/theme cases plus interactions and reflow case passed                                                                           |
| Native professional Profile Chrome QA     | 30 state/theme/viewport cases plus gated/ready synthetic editor, failure/draft/link cases passed                                           |
| Premium Profile Chrome QA                 | 20 viewport/theme cases plus substantial-achievement and reflow cases, contextual editor/gate checks passed                                |
| New signature Chrome QA                   | 18 viewport/theme captures, 6 minimal captures, native-sticky diagnosis, actual bounded-affix scroll/wheel/focus/tall/mobile checks passed |
| AppShell Chrome regression                | 20 cases; roles, keyboard and history passed                                                                                               |
| Dashboard Chrome regression               | 18 responsive cases, 9 states and routing/refresh/isolation/keyboard/reduced-motion passed                                                 |
| Marketplace Browse Chrome regression      | 16 recorded responsive cases and existing interaction assertions passed                                                                    |
| TeamUp Browse Chrome regression           | 20 recorded responsive cases and existing interaction assertions passed                                                                    |
| Services Browse Chrome regression         | 20 responsive cases and filters/history/cancellation/pagination/dialog/state/reduced-motion checks passed                                  |
| Messaging Chrome regression               | 20 responsive cases and existing send/retry/deduplication/draft/receipt/search/isolation checks passed                                     |

Backend checks used an unreachable dummy loopback configuration; no database was queried or migrated. Prisma generation during backend build/typecheck is local code generation only. The full backend suite and AI-service suite were not run: this phase requested relevant backend contracts and has no backend/AI edits. Browser suites use synthetic adapters, not real student writes.

Final build: Profile JS **41.13 kB / 11.36 kB gzip**, Profile CSS **15.94 / 3.64 kB**. Compared with the recorded 13B.6 build (37.63/9.74 JS and 14.27/3.36 CSS), growth is **3.50/1.62 kB JS** and **1.67/0.28 kB CSS**. Main entry: **131.23/40.45 kB**; main CSS: **139.00/24.93 kB**. Route splitting is preserved.

## Evidence and approval

Review package: `C:\Users\dahiy\CampusConnect-Profile-Step13B.7-2026-11-01\` (and sibling ZIP). `before/` contains fresh 13B.6 baseline captures; `after/` contains new PNGs and measurements. All are explicitly synthetic evidence. Key captures:

- `after/signature-SYNTHETIC-1440-light-populated.png`
- `after/signature-SYNTHETIC-1440-dark-populated.png`
- `after/signature-SYNTHETIC-390-light-populated.png`
- `after/signature-SYNTHETIC-390-dark-populated.png`
- `after/signature-SYNTHETIC-1440-light-minimal.png`
- `after/signature-SYNTHETIC-middle-scroll-affixed.png`
- `after/signature-SYNTHETIC-edit-workspace.png`
- `after/signature-SYNTHETIC-substantial-achievements.png`
- `after/native-SYNTHETIC-1440-light-native-professional.png` (available-data illustration only, not durable storage evidence).

Desktop/mobile Light/Dark, minimal, editor and mid-scroll compositions were visually inspected. Visual approval remains with the user. Remaining limitations: professional persistence/migration and custom photo upload remain unavailable/gated; actual authenticated production-account verification and native 200% zoom were not performed. No claim of pixel-perfect fidelity or production storage readiness is made.

Scope confirmed by source-hash comparison: backend source/tests, Prisma schema/migrations, AppShell and unrelated feature source remained unchanged. No database access/writes, Git operation, deployment, paid inference or Step 13C implementation was performed.
