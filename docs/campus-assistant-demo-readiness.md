# Campus Assistant - Step 14A implementation and demonstration readiness

## Result and evidence boundary

Implemented in the existing Assistant only. Real Gemini generation succeeded twice with synthetic, non-student evidence: one bounded FastAPI probe and one authenticated isolated HTTP integration through Express, the real AI client, FastAPI, MiniLM and Gemini. No subscription, billing setting or environment file was changed.

Normal application authentication and Supabase-backed record retrieval were **not** exercised against the configured shared database. Supabase access is prohibited in this task. The browser uses the actual Assistant, AppShell and frontend API client against actual Express routes with synthetic authentication and repository adapters and a disabled generation adapter. Its screenshots demonstrate UI/interaction behavior, not production records or live LLM answers.

## Diagnosis

- Existing local Express `/health` and FastAPI `/health` returned HTTP 200; FastAPI `/ready` returned HTTP 200 with the installed MiniLM model ready.
- Backend `AI_SERVICE_ENABLED` and AI-service `CAMPUS_ASSISTANT_ENABLED` were already true. `AI_SERVICE_URL` already pointed to loopback port 8001. Internal keys were present and matched. No missing flag, wrong port or current internal-key mismatch was found.
- `hi` matches an exact deterministic greeting and avoids retrieval/generation. Previously, `I lost my bag` did not match the small exact workflow table and fell into retrieval across modules and then generation. That is a confirmed routing gap, not proof of a specific historical provider outage.
- Weather had no explicit scope response and could fall through to insufficient evidence. It now states that live weather is not connected without querying the database or model.
- The previous answer service collapsed provider failures into one generic message; retrieval exceptions escaped its orchestration. Failed discovery could not provide useful record references even after successful retrieval.
- The page sent no follow-up context. Clear was blocked during requests; Retry appended a second user question. The request did not accept cancellation from a reset/unmount. These were confirmed source-level defects.
- Current live generation works: the HTTP integration returned `answered`, `grounded`, `semantic`, provider `gemini`, model `gemini-2.5-flash`, one authorized synthetic citation and no error. The screenshot's precise historical provider/database error was not reproduced. No claim is made that its exact original external failure has been identified.

## Architecture and fixes

The existing route remains `POST /api/assistant/ask`. Existing authentication resolves an ACTIVE application account before retrieval or answers. Request validation still rejects injected identities/evidence/prompts and invalid source types.

1. `assistant-help.ts` adds trusted intent/workflow guidance and actual route actions. Lost/found reporting, profile, messages, saving listings, selling, project creation, offering services, weather scope and navigation can be explained without an AI dependency. It never creates a report, message, listing or project.
2. Existing exact platform knowledge remains supported; relevant actions are attached where recognized. Knowledge wording now follows current Sell an item / Report lost / Report found / Offer a service labels.
3. Known discovery requests select their intended supported module. Generic source browsing remains bounded; plural calculator/book terms are normalized and query scaffolding is removed. Requests for available/selling/recruiting/open records narrow the existing lifecycle predicates. Lost/found requests can constrain the real report type. Existing visibility and ACTIVE-owner predicates remain in place.
4. Successful retrieval followed by disabled/offline/failed generation can return server-built record links with `provider: null` and an explicit no-generation notice. It neither copies record instructions into an answer nor invents results. Lost & Found search references are not represented as confirmed semantic matches.
5. Empty retrieval and failed retrieval are separate responses. Retrieval failure uses `retrieval_unavailable`, offers real navigation and never claims zero results. Existing timeout/offline/feature-disabled/provider-credential/quota errors retain machine codes; messages distinguish the known categories. Invalid generated URLs and unknown/duplicate citations still fail closed.
6. Reranking failures retain lexical evidence, including unexpected rejected client promises. Generation client promise rejection is contained. Existing client timeouts, correlation IDs and no-automatic-retry behavior remain.
7. An authenticated, per-process 20-request/minute budget applies to Assistant routes, with no-store and Retry-After. State expires and its map is capped. This is not a distributed production rate-limit service.

### Grounding and privacy

- No generated SQL, arbitrary tools, external navigation or client-side authorization replacement.
- Source projections still exclude identities, claims, applications, private messages and private media. Existing text redaction and generation grounding/citation policies remain.
- Frontend citations now reject path-traversal/unsafe source IDs; contextual actions use a fixed confirmed route allowlist, not model-supplied arbitrary URLs.
- Only the last four prior questions, each at most 300 characters, can be sent as optional `history`. They are used for short lost/found follow-ups locally, not forwarded as an unbounded external prompt or persisted.
- Retrieval is still bounded lexical candidate search plus optional MiniLM reranking, not exhaustive catalog coverage or a guarantee of lost-item ownership.

## Conversation and interface

The page remains in the existing design family. Assistant-only CSS gives message/source hierarchy, semantic Light/Dark surfaces, action links and a bounded scroll area with the composer outside the message scroller. Mobile density was corrected after reviewing screenshots; the composer at 390px is above the unchanged bottom navigation.

New/Clear reset draft, transcript and active context, abort the client request and invalidate stale responses. Unmount also invalidates requests; the conversation is keyed to the account. In-flight server work cannot be undone by aborting a browser request, but it cannot reappear in a new conversation. A synchronous request guard blocks rapid duplicate submission. Retry removes the failed reply, preserves its original question/context and does not append another user message. Authentication/invalid-input failures do not offer a misleading retry button.

Suggestions submit real questions. Enter submits, Shift+Enter inserts a line break, IME composition is respected, and empty/pending submission is disabled. Source labels distinguish deterministic campus help, record search and actual AI generation. Reduced-motion preferences govern scroll and loading animation. No persistent chat history was added.

## Demonstration scenarios

| Scenario                          | Verified outcome                                                                         | Evidence                                                                       |
| --------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 1. Hi                             | Friendly introduction; no retrieval/provider needed                                      | Unit and Chrome keyboard interaction                                           |
| 2. What is CampusConnect?         | Existing real module overview                                                            | Unit; welcome suggestion rendered                                              |
| 3. I lost my bag                  | Reporting guidance and functioning Lost & Found actions; no false creation               | Unit and Chrome in all eight viewport/theme sets                               |
| 4. Near the library               | Relevant location follow-up; no repeated question about where                            | Unit and Chrome                                                                |
| 5. Marketplace calculators        | Focused authorized retrieval; references or truthful empty state                         | Unit, synthetic HTTP/browser, and real Gemini HTTP probe with synthetic record |
| 6. AI project teammates           | TeamUp discovery/guidance and existing routes                                            | Unit; TeamUp browser screenshot                                                |
| 7. Student design/coding services | Existing Services discovery/actions                                                      | Unit with synthetic retrieval                                                  |
| 8. Found ID card                  | Found-report guidance, privacy reminder and correct lowercase `type=found` link          | Unit and Chrome destination navigation                                         |
| 9. Current temperature            | Explicit no-weather-source explanation, no unrelated lookup                              | Unit with a retrieval dependency that would throw if called                    |
| 10. AI unavailable                | Stable workflow guidance; successful discovery retains truthful no-generation references | Disabled/rejected/timeout adapter tests and Chrome                             |
| 11. Search failure                | Unavailable retrieval is distinct from no matching records                               | Unit and actual synthetic HTTP/browser retry                                   |
| 12. Clear/New                     | No old context or late response; no duplicate user turn on retry                         | Chrome, including clear during delayed request                                 |

## Final validation

| Check                              | Result                                                                               |
| ---------------------------------- | ------------------------------------------------------------------------------------ |
| Frontend tests                     | 303 passed, 0 failed, 0 skipped                                                      |
| Backend non-database tests         | 529 passed, 0 failed, 1 skipped; 530 total                                           |
| Skipped backend case               | Existing opt-in live Lost & Found FastAPI test, not treated as a pass                |
| PostgreSQL integration suites      | Intentionally excluded; no database access authorized                                |
| AI-service tests                   | 111 passed; 2 dependency deprecation warnings                                        |
| Frontend/backend TypeScript        | Passed                                                                               |
| Frontend/backend ESLint            | Passed, zero lint warnings                                                           |
| Repository formatting              | Passed                                                                               |
| Frontend/backend production builds | Passed; no Vite bundle warning                                                       |
| Real local AI request              | Passed through isolated authenticated Express HTTP integration with synthetic record |
| Chrome                             | Passed at 1440x900, 440x956, 390x844, 320x640, both themes                           |

Chrome checked welcome, lost-item conversation/context, populated search fallback, empty query, failed query/retry, New/Clear, delayed-response cancellation, rapid duplicate submission, source labels, Enter, Shift+Enter newline, expired session with no Retry, related route navigation, reduced-motion media, zero page horizontal overflow, composer/bottom-bar clearance and zero runtime exception events. Screenshots were opened and reviewed; mobile whitespace/composer sizing was corrected and recaptured. Maximum-length 4000-character replies and native browser zoom were not separately screenshot-verified.

AI warnings are installed dependency notices: Google GenAI's deprecated Python typing alias and Starlette TestClient's httpx deprecation. No dependencies were installed or upgraded.

Current production assets: Assistant JS **12.26 kB / 4.65 kB gzip**, Assistant CSS **1.64 kB / 0.57 kB gzip**, main CSS **139.02 kB / 24.94 kB gzip**. Route-level splitting remains. A matched pre-change bundle was not rebuilt, so these are final sizes, not an asserted byte delta.

## Local startup and safe recovery

Existing normal application credentials must be configured privately. Names only:

- Backend: `NODE_ENV`, `PORT`, `FRONTEND_URL`, `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_JWT_AUDIENCE`, `AI_SERVICE_ENABLED`, `AI_SERVICE_URL`, `AI_SERVICE_API_KEY`, `AI_SERVICE_TIMEOUT_MS`, `AI_SERVICE_GENERATION_TIMEOUT_MS`.
- AI service: `AI_SERVICE_API_KEY`, `CAMPUS_ASSISTANT_ENABLED`, `GOOGLE_GENAI_USE_VERTEXAI`, `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`, `GEMINI_MODEL`, `GEMINI_GENERATION_TIMEOUT_SECONDS`; existing Google application-default credentials or approved `GOOGLE_APPLICATION_CREDENTIALS`.
- Frontend: `VITE_API_BASE_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`.

The configured backend database is remote Supabase. **Do not use normal authenticated application startup/testing against that target under this task's authorization.** Obtain separate owner approval for normal development account/database access, or use the isolated synthetic QA path below. The local services that were already running were not stopped or reconfigured.

After normal database/account access is separately authorized, use three terminals from the repository root, only starting services whose ports are free:

```powershell
npm run dev:frontend
npm run dev:backend
ai-service\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir ai-service --host 127.0.0.1 --port 8001
```

Check `http://127.0.0.1:3000/health`, `http://127.0.0.1:8001/health` and `/ready`. Health/readiness alone do not prove Gemini permission/quota or database retrieval. Verify the Assistant in the authorized account with the listed scenarios; do not create demo records in shared data. If an already running backend does not reload, restart only that development process with its existing approved configuration.

The internal header is `X-CampusConnect-AI-Key`; the same private `AI_SERVICE_API_KEY` is required on both services. Never place it in Vite variables. Missing and incorrect keys returned 401 in the local probe. Preserve authentication if troubleshooting. If AI is unavailable, workflow help still works after normal account authentication and successful retrieval can show no-generation results. If retrieval fails, use the module link and investigate the database separately; never describe failure as zero results. New/Clear safely discards pending UI context.

### Isolated demonstration/QA without Supabase

Build the frontend with normal build-only commands, then from the repository root:

```powershell
node frontend/tests/assistant-browser-qa.mjs "$env:TEMP\CampusConnect-Step14A-QA"
```

This launches only a disposable loopback HTTP adapter with a dummy unreachable database URL and synthetic identity/repository/provider, then closes it and its isolated Chrome instance. It does not alter the normal running backend. Its child environment disables the AI client and removes remote/test database and storage activation variables. The script is a test harness, not a replacement chatbot or production bypass.

## Exact changed-file inventory

Modified:

- `backend/src/modules/assistant/assistant-answer.service.ts`
- `backend/src/modules/assistant/assistant-knowledge.ts`
- `backend/src/modules/assistant/assistant-reranking.service.ts`
- `backend/src/modules/assistant/assistant.repository.ts`
- `backend/src/modules/assistant/assistant.routes.ts`
- `backend/src/modules/assistant/assistant.service.ts`
- `backend/src/modules/assistant/assistant.types.ts`
- `backend/src/modules/assistant/assistant.validation.ts`
- `backend/tests/assistant-generation.test.ts`
- `backend/tests/assistant-retrieval.test.ts`
- `frontend/src/features/ai/AIAssistantPage.tsx`
- `frontend/src/features/ai/assistant-service.ts`
- `frontend/src/features/ai/assistant.types.ts`
- `frontend/tests/assistant-integration.test.ts`

Created:

- `backend/src/modules/assistant/assistant-help.ts`
- `backend/src/modules/assistant/assistant-rate-limit.ts`
- `backend/tests/assistant-help.test.ts`
- `backend/tests/assistant-rate-limit.test.ts`
- `backend/tests/assistant-demo-server.ts`
- `frontend/src/features/ai/assistant.css`
- `frontend/tests/assistant-browser-qa.mjs`
- `docs/campus-assistant-demo-readiness.md`

## Remaining limits and scope

No current provider configuration blocker was found; existing credentials/model worked. Shared-database retrieval and real student authenticated browser acceptance remain unverified because this task forbids Supabase access. Fallback cannot bypass authentication or guarantee access when the account/auth database itself is unavailable. The intent/context layer is intentionally bounded, not general-purpose conversation memory. A transient future provider quota/startup/network failure can still occur, with explicit fallback/error behavior.

Hash comparison with the pre-step snapshot confirms no changes to private environment files, AppShell, other feature modules, Prisma schema/migrations or AI-service source/tests. No Profile Photo/Professional storage flag was enabled; no database access/write, AWS operation, subscription/configuration change, Git operation, deployment, dependency installation or unrelated phase was performed.

Step 14A implementation and isolated/live-service validation are complete. Real student database-backed acceptance requires separate authorization; visual approval remains the user's decision. Stop here.
