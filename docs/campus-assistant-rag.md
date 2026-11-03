# Campus Assistant RAG foundation

## RAG-0

The FastAPI AI service contains a disabled-by-default Vertex AI Gemini provider and strict `campus-assistant-grounded-v1` contracts. It has no database access and exposes no student-facing generation endpoint.

## RAG-1 authorized retrieval

Express exposes a read-only candidate endpoint for future assistant orchestration:

```text
GET /api/assistant/retrieval?q=<question>&types=MARKETPLACE,LOST_FOUND,TEAMUP,SERVICE
Authorization: Bearer <Supabase access token>
```

`types` is optional and defaults to all four sources. The endpoint requires the existing active application account middleware. Suspended, deactivated, uninitialized, and unauthenticated accounts are rejected before retrieval.

Retrieval extracts at most eight useful lexical terms, executes at most one bounded query for each selected source, considers at most 20 database candidates per source, emits at most five evidence records per source, and emits at most 20 records in total. Ranking is deterministic lexical ranking with stable source, title, and identifier tie-breaking. It is not semantic search.

Eligible records follow existing public discovery rules:

- Marketplace: active seller and `ACTIVE` or `SOLD` listing.
- Lost & Found: active reporter and `OPEN`, `MATCHED`, or `CLAIM_PENDING` report.
- TeamUp: active owner and `OPEN` or `FULL` project.
- Services: active provider and `ACTIVE` service.

Only the stable identifier, source type, bounded public title/snippet, verified internal route, and normalized relevance are returned. Email addresses, phone-like contact details, social handles, and URLs are conservatively redacted from public text before it becomes evidence. Claims, applications, bookings, messages, users, contact records, media URLs, moderation data, and database objects are not returned.

The RAG-1 endpoint does not call FastAPI, Gemini, or Vertex AI. It performs no mutations and remains a standalone lexical-retrieval fallback; semantic reranking is isolated in the separate RAG-2 endpoint below.

## RAG-2 semantic evidence reranking

Express exposes a separate authenticated orchestration endpoint while preserving the RAG-1 endpoint unchanged:

```text
GET /api/assistant/reranked-retrieval?q=<question>&types=MARKETPLACE,LOST_FOUND,TEAMUP,SERVICE
Authorization: Bearer <Supabase access token>
```

Express first executes the complete RAG-1 authorization and retrieval path. When authorized evidence exists, it sends at most 20 bounded evidence records to the protected FastAPI endpoint `POST /api/v1/assistant/rerank` using the existing `X-CampusConnect-AI-Key` service credential. FastAPI validates the `campus-assistant-grounded-v1` contract and reranks only those supplied records.

The reranker reuses the application-scoped cached `sentence-transformers/all-MiniLM-L6-v2` provider already shared by Lost & Found semantic matching and Marketplace recommendations. It batch-encodes the question plus bounded `title + snippet` representations once, computes cosine similarity, clamps scores to `[0, 1]`, sorts by score descending, and breaks exact ties by source ID. A score is a text-similarity ranking signal, not a confidence, factuality, identity, or authorization score. Weak matches are retained within the fixed limit instead of being hidden by an unvalidated threshold.

FastAPI returns only source IDs and scores. Express rejects unknown IDs, duplicates, non-finite or out-of-range scores, invalid ordering, extra fields, and excessive results, then reconstructs evidence exclusively from the original authorized objects. Semantic results are capped at 10.

If FastAPI is disabled, unavailable, timed out, not ready, or returns invalid data, Express returns the first 10 original lexical results with `retrievalMode: lexical_fallback` and no fabricated semantic score. If RAG-1 finds no authorized evidence, Express returns `insufficient_evidence` without calling FastAPI.

Visibility verification confirmed that RAG-1 matches current public Global Search behavior: Marketplace `ACTIVE/SOLD`, Lost & Found `OPEN/MATCHED/CLAIM_PENDING`, TeamUp `OPEN/FULL`, and Services `ACTIVE`, always with an active owner. The newest-20 matching-record window per source can exclude older relevant records; this remains a deliberate bounded retrieval tradeoff.

RAG-2 does not call Gemini or Vertex AI, generate answers, persist chat history, change visibility, or add frontend integration. RAG-3 remains responsible for separately approved grounded-generation orchestration and validated citation handling.

## RAG-3 grounded generation and citations

Express now exposes the authenticated, read-only orchestration endpoint:

```text
POST /api/assistant/ask
Authorization: Bearer <Supabase access token>
Content-Type: application/json

{"question":"Where can I find a calculator?","sourceTypes":["MARKETPLACE"]}
```

The client may supply only a bounded question and optional allowlisted source filters. Express derives the active user from the existing authentication boundary, performs RAG-1 retrieval and RAG-2 reranking, and sends only the resulting authorized public evidence to FastAPI. It never accepts client-supplied evidence, prompts, model settings, identity, citations, or provider credentials.

FastAPI treats evidence as untrusted data, requests schema-constrained JSON from Vertex AI Gemini, and validates the answer status and citation IDs. No Gemini tools, web access, database access, autonomous actions, or private-data retrieval are enabled. Express validates the protected service response again and reconstructs citation titles and routes solely from the original authorized evidence. Model-created URLs and unknown, duplicate, missing, or excessive citations fail closed.

The endpoint returns one of `answered`, `insufficient_evidence`, `unsupported`, or `unavailable`. No evidence and unsupported action requests are answered deterministically without a provider call. Disabled, timed-out, quota-limited, authentication-failed, malformed, or unavailable generation returns a safe unavailable response; raw provider output and errors are never returned. RAG-2 lexical fallback still applies when semantic reranking is unavailable.

Generation remains disabled by default with `CAMPUS_ASSISTANT_ENABLED=false`. Vertex AI uses Application Default Credentials and the existing `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`, `GEMINI_MODEL`, `GEMINI_GENERATION_TIMEOUT_SECONDS`, `GEMINI_MAX_OUTPUT_TOKENS`, and `GEMINI_MAX_CONCURRENCY` settings. Provider clients are lazy, generation is bounded, and normal automated tests use fakes without outbound Google requests.

Run local tests with:

```powershell
.\.venv\Scripts\python.exe -m pytest
npm test --workspace backend
```

An explicitly billable manual smoke test must be opt-in: enable the assistant only in the AI-service process, authenticate with a real test student's Supabase access token, start FastAPI and Express, then send exactly one `POST /api/assistant/ask` request as shown above. Do not place the access token or Google credentials in shell history, source files, logs, or screenshots. RAG-3 does not add frontend integration, conversation persistence, streaming, analytics, moderation, ingestion, a vector database, or schema changes.

## RAG-4 frontend integration

The protected `/assistant` React route now uses the normal authenticated frontend API client to call `POST /api/assistant/ask`. The browser sends only the current question and, when supported by the interface, allowlisted source types. Supabase session handling remains centralized in the API client; React never contacts FastAPI or Vertex AI and never receives the internal service credential, model prompt, or evidence array.

The page keeps a lightweight question-and-answer transcript in React component state for the current page session. Questions are independent: earlier messages are displayed but are not sent as model context, persisted to local storage, or written to the database. Enter submits, Shift+Enter inserts a line break, concurrent duplicate submissions are blocked, and failed requests are retried only after an explicit student action. A 30-second browser timeout prevents an indefinite loading state and does not automatically retry a potentially billable request.

Responses are runtime-validated before display. Supported statuses are `answered`, `insufficient_evidence`, `unsupported`, and `unavailable`. Only answered responses may show citations. Citation routes must exactly match the source identifier and the internal route prefix for Marketplace, Lost & Found, TeamUp, or Services. Duplicate citations, arbitrary URLs, malformed contracts, and inconsistent statuses fail closed. Answer text is rendered as plain React text with paragraph wrapping; generated HTML and Markdown are not executed.

When generation is disabled or temporarily unavailable, the page shows the backend's safe unavailable response and never substitutes demo content. HTTP 401 continues to trigger the established local Supabase sign-out behavior. Network, timeout, and malformed-response errors show controlled messages with manual retry.

Frontend integration tests use mocked API functions and make no Gemini or Vertex AI request:

```powershell
npm test --workspace frontend
npm run lint --workspace frontend
npm run typecheck --workspace frontend
```

For an opt-in end-to-end smoke test, start FastAPI with valid Vertex ADC configuration and `CAMPUS_ASSISTANT_ENABLED=true`, start Express with its existing internal AI configuration, sign into CampusConnect as a test student, open `/assistant`, and submit one public-data question. This can incur a Vertex AI charge and must not be part of automated testing. A successful manual test should verify the answer status and open each internal citation; it should not expose tokens, prompts, evidence, or credentials in captured output.

RAG-4 does not implement streaming, persistent chat history, conversational memory, ingestion, a vector database, or evaluation. RAG-5 remains responsible for formal grounded-answer quality, citation, safety, latency, and cost evaluation. No live end-to-end Vertex generation was performed during RAG-4 implementation.

## RAG-5 evaluation and final hardening

RAG-5 uses `campus-assistant-evaluation-v1`, a deterministic fictional suite containing ten public-style records across Marketplace, Lost & Found, TeamUp, and Services. Eleven retrieval cases cover the eight representative student questions, no-match and ambiguous questions, cross-source retrieval, overlapping calculator terms, exact attributes, and an adversarial service description. The fixtures are code-only and never seed or query the production database.

Run the exact lexical and orchestration evaluation from `backend/`, where the existing backend environment loader is available:

```powershell
npx tsx evaluation/evaluate-assistant.ts
```

The verified local run produced candidate recall and Recall@10 of 1.0, mean Precision@5 of 0.2444, MRR of 1.0, and no-result accuracy of 1.0. Precision is intentionally divided by five even when only one relevant record exists, so 0.2 is the maximum for most single-answer cases. Median in-memory retrieval was approximately 0.035 ms, the maximum was approximately 1.821 ms, and the largest serialized evidence response was 1,535 bytes. Mocked retrieval-to-generation orchestration measured approximately 0.013 ms median and 0.988 ms maximum across 50 iterations, with a 387-byte response. These timings exclude PostgreSQL, HTTP, authentication, model loading, and Vertex inference and are not production latency claims.

Run the real local MiniLM-only reranking evaluation from `ai-service/`:

```powershell
.\.venv\Scripts\python.exe -m evaluation.evaluate_assistant_rag
```

The verified CPU run over nine answerable cases and ten evidence records produced Recall@10 1.0, mean Precision@5 0.2444, and MRR 1.0. The first request, including model loading, took approximately 21,030 ms; the remaining warm requests had a 47.367 ms median. Maximum serialized reranking request and response sizes were 2,308 and 767 bytes. The small templated suite is useful for regression detection only; it does not establish real-campus recall, fairness, or semantic-answer quality.

The evaluation reproduced the known newest-20 limitation: when 20 newer keyword-matching Marketplace records preceded an older relevant calculator record, the older record was excluded before semantic reranking. The database candidate limit remains unchanged because increasing it without production-like evidence would add query and inference cost. A confirmed lexical defect was corrected: common terms including `is`, `any`, `anyone`, `someone`, `there`, and `who` are now ignored. Before the correction, substring matching allowed `is` to retrieve `design` for a no-match question and no-result accuracy was 0.5; afterward it was 1.0.

Timeout hardening now separates the normal Express AI timeout from generation. `AI_SERVICE_TIMEOUT_MS` remains 3 seconds for health, matching, recommendation, and reranking calls, while `AI_SERVICE_GENERATION_TIMEOUT_MS` defaults to 25 seconds. This safely exceeds FastAPI's bounded 20-second Gemini timeout and remains below the frontend's 30-second timeout. A regression test proves generation uses the longer bound. No timeout is unbounded and no automatic paid retry exists.

Grounded-generation tests use mocked providers to exercise supported answers, insufficient evidence, unsupported actions, malformed JSON, invalid statuses, excessive answers, provider failures, prompt injection, invented URLs, and unknown, duplicate, or missing citations. Evidence is still untrusted text, Gemini tools remain disabled, and Express reconstructs citation metadata only from authorized RAG-1 evidence. These controls enforce authorization and structural grounding, but they cannot guarantee that every sentence in a structurally valid model answer is factually entailed by its cited evidence.

Authentication regression coverage verifies unauthenticated, suspended, and deactivated accounts are rejected; FastAPI endpoints require the service secret; public visibility predicates run before evidence transmission; and frontend tests verify no internal credential or direct Vertex access exists. Database failures, disabled AI, unavailable MiniLM, network failure, provider timeout/authentication/quota errors, malformed output, expired sessions, and lexical fallback all fail safely without a fabricated answer.

No browser surface with an authenticated test account was available during RAG-5, so real DOM interaction remains **NOT RUN**. RAG-4 behavior is supported by frontend service tests and source-level UI contract checks, not claimed as browser-verified.

### Controlled live Vertex smoke test

Live verification remains explicitly opt-in and was **NOT RUN**. To perform one authorized test:

1. Use the existing Google Cloud project and valid Application Default Credentials; do not create new credentials or infrastructure.
2. Start FastAPI with `CAMPUS_ASSISTANT_ENABLED=true`, the existing Vertex configuration, and its internal service secret.
3. Start Express with the same internal secret, `AI_SERVICE_ENABLED=true`, and its existing AI service URL.
4. Sign in using a dedicated student test account and ensure one fictional eligible public CampusConnect record exists.
5. Open `/assistant` and ask one short question whose answer is contained in that record.
6. Submit exactly once, with no automatic retry, then record status, verified citation, end-to-end latency, and any safe provider error classification.
7. Check billing usage only through the existing Google Cloud project if desired; do not assume promotional credit coverage.
8. Disable the assistant again after the test when it is not needed.

Never capture or log access tokens, ADC material, internal secrets, prompts, or private records. The final offline verdict is **READY FOR CONTROLLED LIVE TEST**, not ready for demonstration, because neither a real Vertex response nor authenticated browser flow has been verified end to end.

## RAG-6 platform knowledge and conversation

The authenticated `POST /api/assistant/ask` endpoint now recognizes a deliberately narrow set of high-confidence conversational and CampusConnect platform questions before record retrieval. Greetings, thanks, help, verified platform explanations, workflow guidance, limitations, and support-contact questions return deterministic backend-owned answers. They do not call PostgreSQL retrieval, FastAPI, MiniLM, or Gemini and therefore do not depend on either AI feature flag or incur inference cost.

The version-controlled source of truth is `backend/src/modules/assistant/assistant-knowledge.ts`. Every platform entry has a stable identifier, topic, exact bounded question patterns, verified answer, availability classification, and repository implementation/documentation references. Topics cover the platform overview, Marketplace, Lost & Found, TeamUp, Services, messaging and notifications, accounts and profiles, Campus Assistant, and help and support. The verified support address is `campusconnectteams@gmail.com`; no phone number, office, response-time promise, or automatic ticket creation is claimed.

Routing precedence is authentication and account-state enforcement, request validation, existing unsupported/private-action safeguards, high-confidence platform knowledge, high-confidence conversation, then the existing authorized RAG-1 retrieval, RAG-2 MiniLM reranking, and RAG-3 grounded generation path. Patterns are anchored rather than broad substring checks. Mixed questions such as `Hi, show me college bags` and ambiguous discovery requests are intentionally not intercepted, so live record searches retain authorization, semantic reranking, generation availability, and citation validation.

The response contract retains the existing version and statuses and adds `responseType`: `grounded`, `platform_knowledge`, `conversation`, or `system`. Only grounded answered responses may contain verified record citations and Gemini metadata. Deterministic answers identify their actual source with null provider/model metadata and no citation chips. The frontend continues to render all text safely and shows clickable citations only for grounded record answers.

Campus Assistant remains read-only. It does not purchase, pay, message, claim, apply, edit records, browse the web, retrieve private data, or persist conversation history. CampusConnect is described as an independent student ecosystem, not an official university ERP. Payments, delivery, escrow, refunds, and purchase protection are not presented as supported platform facilities.

When a module changes, update the corresponding knowledge entry only after checking its frontend route, backend authorization and lifecycle implementation, tests, and user-visible behavior. Keep patterns narrow, update repository references, add mixed-intent and no-AI-call tests, and never mark planned or partial behavior as available. If confidence is low, allow the existing RAG path to handle the question rather than adding a broad rule.
