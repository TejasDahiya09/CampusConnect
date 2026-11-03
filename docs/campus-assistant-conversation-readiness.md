# Campus Assistant - Step 14B completion report

## Result and verification boundary

Step 14B improves the existing Assistant. The Express/FastAPI/MiniLM/Gemini architecture, authentication, visibility rules and provider configuration remain intact. No Supabase access, student-record writes, migrations, AWS changes, storage activation, dependencies, Git operations or deployment were performed.

One bounded real-generation HTTP check succeeded through an isolated Express instance, the real AI client, existing local FastAPI, MiniLM and Gemini. It used synthetic authentication and one synthetic calculator record, not Supabase. Result: HTTP 200, `answered`, `grounded`, `semantic`, `gemini`, `gemini-2.5-flash`, one authorized citation, no error. This proves real generation through the integration; it does not prove normal student authentication or shared-database retrieval.

Browser evidence uses the actual Assistant, AppShell, frontend API client, Express routes/authentication middleware and retrieval orchestration, with synthetic identity/repository/provider boundaries. Long generated-answer fixtures explicitly use a synthetic model response. They are not live Gemini screenshots. Workflow replies and search-only fallback are tested separately.

## 1. Lost & Found intent root cause and correction

Previously, the personal-loss rule recognized `I lost ...` but not `my bag got lost`, `I misplaced ...`, theft wording or `I can't find ...`. Missed expressions entered generic retrieval. Retrieval accepted any matching query term, so a record matching a location or incidental word could survive without describing the requested object. There was also no item requirement when follow-up context was lost.

The new `assistant-lost-found-context.ts` classifies the requested LOST/FOUND paraphrases before generic discovery, including ordinary typographic apostrophes. All seven requested examples have focused regression coverage. Personal incidents get workflow guidance and existing report links without retrieval or a false report-creation claim. Suspected theft includes campus-security/local-authority guidance; Lost & Found is not represented as a replacement for reporting theft.

## 2. Conversation context

The existing optional history contract remains limited to four previous questions, each at most 300 characters. No conversation store or database history was added.

Within that bounded window, the resolver carries the incident kind, supported item aliases, supplied descriptive details and location through successive follow-ups. The tested sequence is:

1. `I lost my bag` / `My bag got lost`.
2. `It was black`.
3. `Near the library`.
4. `Can you find similar reports?`.

The final request searches eligible FOUND reports, requiring a bag/backpack/rucksack reference and retaining colour/location for ranking. A found-item incident searches LOST reports when explicitly asked for similar reports. New topics reset workflow context. Missing/expired context asks which item to search instead of guessing.

The frontend's account-keyed conversation, abort controller, stale-response generation guard, request lock, original retry context and reset/unmount cleanup remain. Account-change and route-change cancellation were exercised in Chrome.

## 3. Retrieval quality and safety

- Required item aliases are included in bounded candidate query terms. Lost & Found adds an AND item condition to its existing authorized query and applies a whole-term item check before reranking.
- An explicitly different recognizable item in the title is excluded, even if its description happens to mention a bag. The regression fixture contains a calculator near the library and in a bag; it cannot become a bag-search result.
- Matching black bags rank ahead of less-specific bag candidates in lexical tests. Existing MiniLM reranking remains downstream of the item gate.
- Incidental words such as `my`, `got`, `was` and `similar` no longer drive retrieval. Existing title-weighted lexical ranking and semantic reranking are retained for Marketplace, TeamUp and Services.
- Explicit report type and source restrictions remain authoritative. The phrase `Lost & Found` by itself no longer incorrectly restricts the query to LOST reports only.
- ACTIVE-owner, moderation and lifecycle predicates are preserved. No new private fields, claims, profiles, messages or media are selected. Existing redaction, untrusted-evidence prompt policy, citation reconstruction and unsafe-URL rejection remain.
- A failed search is not represented as zero results. A new eight-second retrieval deadline produces a distinct retryable timeout response. It clears its timer and ignores late results; it does not cancel an underlying database query. No automatic retry was added.

Search remains bounded candidate retrieval, not an exhaustive catalog scan or ownership verification. Related reports must not be described as confirmed matches.

## 4. Desktop composer and scrolling

Two confirmed layout/scroll causes were corrected:

1. Fixed viewport subtraction and a minimum workspace height did not account for actual header size. The page now measures available viewport space, including the existing bottom navigation, and responds to header/window/visual-viewport resizing.
2. The desktop grid's implicit row minimum inherited the sidebar's content height. At short laptop heights, the row exceeded the fixed frame and clipped the composer. A `minmax(0, 1fr)` row and independently scrollable sidebar allow the row to shrink correctly.

The composer sits outside the independently scrolling history. Scroll-to-latest operates inside that history using a layout effect before paint; it does not scroll the whole document. Automatic movement is immediate, avoiding a smooth-scroll/follow-state race found during repeated screenshot tests. Students who scroll back while a response is pending keep their reading position. Focus returns without forcing page scrolling.

## 5. Mobile and response presentation

- New conversation is visible in the mobile header actions. Clear uses a compact visible label with the full accessible name; neither control is forced full-width. The desktop sidebar New control is preserved.
- Mobile introduction spacing is tighter. Suggestions remain horizontally scrollable without page overflow. The composer placeholder fits narrow inputs, and Send remains independently accessible.
- Attribution is now concise: `Campus guide`, `Campus records`, `AI-assisted`, or `Service notice`. It is selected from validated provider/response metadata; deterministic text is not labelled generated.
- Record links use a compact related-records section beneath the answer. Fixed allowed action routes and safe source links remain; there is no raw HTML rendering.
- Long replies retain paragraph breaks, wrap within the bubble and scroll without moving the composer. Light/Dark semantic tokens and reduced-motion handling remain.

## 6. Validation results

| Check                              | Final result                                                          |
| ---------------------------------- | --------------------------------------------------------------------- |
| Frontend tests                     | 303 passed, 0 failed, 0 skipped                                       |
| Backend non-database tests         | 543 passed, 0 failed, 1 skipped; 544 total                            |
| Added backend tests                | 14 conversation/intent/relevance/timeout/source-boundary cases        |
| Backend skipped case               | Existing opt-in live Lost & Found FastAPI test; not counted as a pass |
| PostgreSQL integration tests       | Excluded; no database access authorized                               |
| AI-service tests                   | 111 passed, 2 dependency deprecation warnings                         |
| Frontend/backend TypeScript        | Passed                                                                |
| Frontend/backend ESLint            | Passed                                                                |
| Repository formatting              | Passed                                                                |
| Frontend/backend production builds | Passed                                                                |
| Real Gemini integration            | Passed, isolated synthetic HTTP request                               |

AI warnings are the installed Google GenAI typing-alias and Starlette/httpx TestClient deprecations. No dependency change was made to suppress them.

## 7. Browser and screenshot evidence

Chrome fixtures cover both themes at:

- 1440x900.
- 1366x768, explicitly checking the short-laptop composer without first scrolling it into view.
- 440x956.
- 390x844.
- 320x640.

Additional coverage includes 720x450 equivalent 200% reflow and a reduced-height 390x500 viewport followed by restoration to 390x844. These are reflow/keyboard-viewport simulations, not native browser zoom or a physical phone keyboard test.

Checks include paraphrase guidance, the four-turn context flow, relevant found reports with the calculator excluded, Marketplace sources, generated-fixture versus fallback attribution, long replies, internal history scrolling, reading-position preservation, no page horizontal overflow, visible composer above the unchanged bottom bar, suggestions, New/Clear, rapid duplicate prevention, retry without duplicate user turns, pending cancellation, expired authentication, retrieval timeout, account/route resets, keyboard Enter/Shift+Enter, reduced-motion media and no runtime exception events.

Screenshots include welcome, Lost & Found guidance, context/search results, Marketplace source/fallback, composer, long-reply end and reading views, TeamUp, error/retry, keyboard recovery and equivalent reflow. Representative desktop/mobile Light/Dark screenshots were opened and reviewed; short-desktop clipping and stale scroll position were corrected and recaptured.

## 8. Exact files changed

Modified:

- `backend/src/modules/assistant/assistant-help.ts`
- `backend/src/modules/assistant/assistant-answer.service.ts`
- `backend/src/modules/assistant/assistant.service.ts`
- `backend/src/modules/assistant/assistant.repository.ts`
- `backend/src/modules/assistant/assistant.types.ts`
- `backend/tests/assistant-help.test.ts`
- `backend/tests/assistant-generation.test.ts`
- `backend/tests/assistant-demo-server.ts`
- `frontend/src/features/ai/AIAssistantPage.tsx`
- `frontend/src/features/ai/assistant.css`
- `frontend/tests/assistant-integration.test.ts`
- `frontend/tests/assistant-browser-qa.mjs`

Created:

- `backend/src/modules/assistant/assistant-lost-found-context.ts`
- `backend/tests/assistant-conversation.test.ts`
- `docs/campus-assistant-conversation-readiness.md`

## 9. Remaining limitations and readiness

No current provider blocker was found. Real student authentication and Supabase-backed searches were not exercised because they remain outside authorization. All browser records and identities are synthetic; no screenshot should be presented as proof of real student records or real LLM generation.

Workflow context and item aliases are deliberately bounded, not unrestricted conversational memory or universal intent recognition. When the item cannot be established, clarification is preferred to unrelated results. Candidate limits can omit older records. The retrieval deadline bounds the answer wait, not the lifetime of an underlying database statement. Device keyboard behavior and native 200% zoom still need user-led confirmation.

Step 14B implementation and the reported checks are complete. Visual approval remains with the user. No other module or development phase was started.
