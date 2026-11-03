# Campus Assistant - Step 14C verification report

Date: 2026-11-02. Scope: Assistant presentation, retrieval semantics and focused validation only.

## Verification boundary

Real Chrome renders the actual Assistant and existing AppShell, frontend client, Express routes, authentication middleware and retrieval orchestration. Browser identities, repositories and generated long-answer fixtures are synthetic and isolated. External fixture network requests are blocked except its loopback Express adapter. This is not the user's authenticated Opera session or a live student-database test. No Supabase/database/AWS connection was used. No migration, storage activation, persistent chat history, dependency, Git operation or deployment was performed.

## 1. Confirmed layout causes and implementation

- The prior available-height calculation subtracted an assumed navigation reserve but omitted actual page-bottom padding and mobile main-content clearance. Chrome reproduced document overflow of 8 CSS px on desktop and 24 CSS px on mobile. The new calculation measures the workspace's document position, visual viewport height, actual page padding and existing shell clearance.
- Large inherited title/header spacing and suggestion typography consumed usable history height. Assistant-scoped spacing and sidebar sizing are now compact; global tokens and shell are unchanged.
- The history now has a dedicated min-height-zero flex frame. History is the scroll surface; the composer is a separate sibling. Grid rows/columns use zero minimum constraints. Outer-page overflow is not hidden to mask errors.
- Header/footer ResizeObservers and window/visualViewport resize listeners recalculate available height, including changes to the textarea size. Cleanup cancels the animation frame and removes observers/listeners. The minimum is based on actual composer height plus three text lines, allowing natural page scrolling when the usable viewport is genuinely too small.
- Empty conversations are centered. Active messages have natural height, controlled line length and no artificial stretching. Source links contain readable titles and trusted type/status/location or team-count metadata.
- Jump to latest is shown when history is more than 48 px from the bottom. It scrolls only history and restores input focus without page scrolling. Completed answers preserve the position of a reader who scrolled upward while the request was pending. New submissions deliberately follow latest. Existing abort, epoch, account reset, request-lock and retry-context behavior remains.

## 2. Measured Chrome before/after

All figures below are CSS pixels, Light, ten-message fixture. Both themes were measured for eight viewports and four states: empty, two messages, ten messages and long answer with sources (64 measurements per phase). Raw JSON also records innerHeight, innerWidth, shell/main/page/header rectangles, final-bubble rectangles and every actually overflowing vertical container. Scroll counts include the document where it actually overflows; a configured overflow:auto surface with fitting content is not counted as a scrollbar.

| CSS viewport | Document height before -> after | Actual vertical scroll regions before -> after | Final workspace top-bottom | Sidebar client/scroll | History client/scroll | Composer top-bottom |
| ------------ | ------------------------------- | ---------------------------------------------- | -------------------------- | --------------------- | --------------------- | ------------------- |
| 1536 x 864   | 872 -> 864                      | 3 -> 1                                         | 169.6-852.0                | 680/680               | 569/1118              | 760.4-815.4         |
| 1440 x 900   | 908 -> 900                      | 2 -> 1                                         | 169.6-888.0                | 716/716               | 605/1118              | 796.4-851.4         |
| 1366 x 768   | 776 -> 768                      | 3 -> 1                                         | 169.6-756.0                | 584/584               | 473/1118              | 664.4-719.4         |
| 1280 x 720   | 728 -> 720                      | 3 -> 1                                         | 169.6-708.0                | 536/536               | 425/1118              | 616.4-671.4         |
| 1280 x 600   | 608 -> 600                      | 3 -> 2                                         | 169.6-588.0                | 416/480               | 305/1118              | 496.4-551.4         |
| 440 x 956    | 980 -> 956                      | 2 -> 1                                         | 240.6-861.6                | 0/0                   | 450/1510              | 762.3-817.4         |
| 390 x 844    | 868 -> 844                      | 2 -> 1                                         | 240.6-749.6                | 0/0                   | 338/1678              | 650.3-705.4         |
| 320 x 640    | 664 -> 640                      | 2 -> 1                                         | 240.6-545.6                | 0/0                   | 134/2210              | 446.3-501.4         |

Normal desktop: only history scrolls when needed. At 1280 x 600 the compact sidebar still requires 64 px of independent scrolling; this is intentional short-viewport accommodation, not clipping. At 320 x 640 the history is only 134 px tall because the unchanged global shell, accessible header/actions and composer must remain reachable. No hidden overflow is used to claim extra room.

After assertions passed across all 64 final geometry states: no document/horizontal overflow, visible composer above the existing mobile navigation, fitting sidebar on normal desktop heights, one history scrollbar for long states, and final response bottom reachable at latest.

## 3. Lost & Found corrections

Personal-loss variants including `lost my bag` and `forgot my bottle` resolve before general retrieval. They offer the existing Report lost route and search the opposite report type, FOUND. Existing found-item guidance remains, with LOST searches only when an explicit similar-report request calls for them.

Typed report type/status/location are carried from the existing authorized projection. The existing VISIBLE moderation, ACTIVE reporter and OPEN/MATCHED/CLAIM_PENDING rules remain. Both retrieval and the answer boundary enforce the intended report type; item alias/relevance gates exclude a calculator even if its description mentions a bag. Titles and locations are redacted/bounded through existing privacy helpers.

Responses label possible leads, never ownership or confirmed recovery. Missing results keep useful reporting guidance; retrieval failure is distinguished from no matches. Contradictory generated report-type/status or recovery-certainty claims fall back to typed records. A model refusal/insufficient-evidence answer cannot discard an already-qualified FOUND record; the final result uses truthful record-based attribution instead.

## 4. TeamUp corrections

`project of 3 members`, `project of 4 teammates` and word-number variants request the same clarification: maximum total capacity including the lead, current membership including the lead, or additional open places. No retrieval or generation is performed for an ambiguous count.

Existing maxMembers, status and member JSON yield aggregate public facts only. Member/application identifiers are not returned in evidence, citations or the AI request. The existing TeamUp convention counts the owner as one. Malformed, duplicate or over-capacity member JSON gives unknown rather than a fabricated count.

Explicit queries qualify actual numeric facts before evidence/reranking. Total means maximum capacity, not current membership or a guaranteed recruitment target. Additional places are max-current for OPEN projects and zero for FULL projects. Unknown metadata cannot satisfy an exact match and gets an explicit uncertainty response with broader TeamUp navigation. These exact numeric answers are deterministic and carry provider/model null. General MiniLM/Gemini retrieval/generation remains available; no provider was replaced.

Search remains a bounded candidate search (20 candidates per selected source, five evidence records per source). A no-match statement applies to checked records, not the entire campus catalog. The intent parser is bounded explicit-language handling, not universal natural-language arithmetic.

## 5. Actual generated-response checks

Three bounded requests used synthetic read-only records through actual local Express orchestration, the existing authenticated FastAPI AI client at 127.0.0.1:8001, MiniLM and Gemini. The private service key was loaded without printing it. No real student data or repository database access was used.

1. Marketplace calculator: HTTP 200, answered, semantic, gemini-2.5-flash, authorized synthetic calculator citation.
2. Initial found-bottle check: HTTP 200 but Gemini returned insufficient_evidence because the input was labelled synthetic. This revealed the model-refusal edge case; it was not counted as a successful matched-record answer.
3. Final found-bottle check: HTTP 200, answered, semantic, gemini-2.5-flash; actual returned title `Synthetic found water bottle`, FOUND/Open/Synthetic Library citation metadata, explicit synthetic status and ownership/recovery caution. The new model-refusal regression also verifies deterministic preservation when a provider declines a qualified record.

The final generated answers and sanitized provider/status evidence are in the external evidence folder. They are not browser screenshots of live student records. Provider nondeterminism remains; deterministic filtering is the authoritative boundary.

## 6. Automated validation

| Check                              | Exact result                                             |
| ---------------------------------- | -------------------------------------------------------- |
| Full frontend tests                | 304 passed, 0 failed, 0 skipped                          |
| Backend non-database suites        | 555 registered: 554 passed, 0 failed, 1 skipped          |
| AI-service tests                   | 111 passed; two existing dependency deprecation warnings |
| Frontend/backend TypeScript        | Passed, exit 0                                           |
| Frontend/backend ESLint            | Passed with max-warnings 0                               |
| Repository formatting check        | Passed                                                   |
| Frontend/backend production builds | Passed; no Vite build warning introduced                 |
| Chrome before/after geometry       | 64 states in each phase; final assertions passed         |
| Chrome interactions                | Passed; no recorded runtime/console errors               |

Commands: `npm run test --workspace frontend`; from backend, enumerate `tests/*.test.ts` excluding names containing `postgres`, then `npx tsx --test @files`; from ai-service, `.venv/Scripts/python.exe -m pytest tests -q`; root `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build`.

Node checks ran with private dotenv loading disabled, production/service credentials cleared and an unreachable dummy loopback DATABASE_URL. PostgreSQL suites were deliberately excluded. The one registered skip is the separately opt-in live Lost & Found matching test, not a Step 14C Assistant failure. AI tests isolate private configuration. Prisma client generation in typecheck/build is local code generation, not migration execution or a database connection.

AI warnings: google.genai `_UnionGenericAlias` deprecation and Starlette TestClient/httpx deprecation. No dependency installation or upgrade was performed.

Focused new regressions cover typed FOUND-only recovery leads, bottle title/status/location, ambiguity parity, distinct size modes, unknown/malformed counts, generated recovery claims, model refusal with valid evidence, and guidance on search failure. Frontend parsing covers bounded optional source metadata. Existing cross-module frontend/backend tests were included in the full suites.

## 7. Browser interaction and screenshot evidence

Commands: `node frontend/tests/assistant-browser-qa.mjs <external-directory>` and the same with `ASSISTANT_GEOMETRY_PHASE=after`. The before mode was run before source presentation edits. Final runs use the final build's global CSS and actual scoped Assistant CSS.

Interaction coverage: personal-loss follow-ups, FOUND bag filtering, bottle source/location, both ambiguous size examples, qualified total-size search, unknown size, source routes, empty/failure/timeout/retry, long answers and source reachability, Jump to latest, reading-position preservation during response completion, rapid-submit lock, Clear/New, account and route changes, Enter/Shift+Enter, expired session, reduced-motion emulation, resize recovery and zero horizontal overflow.

Mobile keyboard testing reduces the emulated CSS viewport to 390 x 500, focuses the input and verifies Send above the bottom navigation, then restores 390 x 844. It is a simulated reduced-height viewport, not a physical iOS/Android keyboard test. A 720 x 450 equivalent 200% reflow check passes; native browser zoom was not exercised.

Evidence folder: `C:/Users/dahiy/CampusConnect-Assistant-Step14C-2026-11-02/`.

Representative final screenshots (synthetic fixtures):

- `after/after-1440x900-light-long-sources.png`
- `after/after-1366x768-dark-ten-messages.png`
- `after/after-390x844-light-long-sources.png`
- `after/after-320x640-dark-ten-messages.png`
- `interactions/assistant-SYNTHETIC-found-bottle.png`
- `interactions/assistant-SYNTHETIC-team-size-clarification.png`
- `interactions/assistant-SYNTHETIC-team-size-qualified.png`
- `interactions/assistant-SYNTHETIC-team-size-unknown.png`

Desktop/mobile Light and Dark captures were visually inspected. The composer and bottom navigation are separate, latest source/action links are reachable, and no outer scrollbar or page overflow appears in measured final states. The narrowest mobile history remains intentionally compact.

## 8. Bundle and code scope

Final production Assistant route: JS 14,218 bytes (~5.17 kB gzip per Vite), CSS 4,155 bytes (~1.16 kB gzip). Main CSS 138,878 bytes. No new dependency or animation library; route code splitting remains. A matching pre-edit build-size baseline was not saved, so no numerical size delta is claimed.

Modified files:

- `backend/src/modules/assistant/assistant-answer.service.ts`
- `backend/src/modules/assistant/assistant-help.ts`
- `backend/src/modules/assistant/assistant-lost-found-context.ts`
- `backend/src/modules/assistant/assistant-reranking.service.ts`
- `backend/src/modules/assistant/assistant.repository.ts`
- `backend/src/modules/assistant/assistant.service.ts`
- `backend/src/modules/assistant/assistant.types.ts`
- `backend/tests/assistant-conversation.test.ts`
- `backend/tests/assistant-demo-server.ts`
- `backend/tests/assistant-help.test.ts`
- `frontend/src/features/ai/AIAssistantPage.tsx`
- `frontend/src/features/ai/assistant-service.ts`
- `frontend/src/features/ai/assistant.css`
- `frontend/src/features/ai/assistant.types.ts`
- `frontend/tests/assistant-browser-qa.mjs`
- `frontend/tests/assistant-integration.test.ts`

Created files:

- `backend/src/modules/assistant/assistant-facts.ts`
- `backend/src/modules/assistant/assistant-team-size.ts`
- `backend/tests/assistant-semantics.test.ts`
- `docs/campus-assistant-step14c-readiness.md`

The pre-edit SHA-256 snapshot comparison confirmed no changes to AppShell/global navigation, Prisma schema/migrations, AI-service source, private environment files or other application modules. Documentation and these Assistant-specific files are the only source changes. Generated build/test artifacts are local.

## 9. Remaining verification and acceptance

- The user's normal authenticated Opera/student session and actual shared-database data were not accessed. Equivalent Chrome fixture behavior is verified; the user's original session still requires confirmation.
- Native mobile keyboard, OS safe-area behavior on physical devices and native 200% browser zoom remain unverified.
- Exact-size searches use a bounded candidate pool and valid stored metadata; they are not an exhaustive discovery guarantee. Historical malformed member JSON is treated as unknown, not repaired.
- Lost & Found matching is a possible-lead search, not ownership verification or claim adjudication. Four previous questions provide temporary context; no history persists.
- Retrieval's existing eight-second timeout stops waiting but does not cancel an underlying SQL query. Existing provider configuration, timeouts and retry affordance remain.

Step 14C implementation and isolated measured verification are complete. User-session and screenshot acceptance are pending. No next module or unrelated phase has started.
