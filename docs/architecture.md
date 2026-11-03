# CampusConnect high-level architecture

## Purpose

CampusConnect is designed as a modular university platform that can grow toward approximately 500–1,000 concurrent users after representative load testing and infrastructure tuning. This document records the implemented foundations and intended direction; the concurrency target remains subject to representative load testing.

## System context

```text
Browser
  │
  ├── Netlify ───────── React/Vite static application
  ├── Supabase Auth ─── identity, email verification, password reset
  │
  └── Render ────────── Node.js/Express API
                           │
                           ├── Supabase PostgreSQL (system of record)
                           ├── Redis (cache, coordination, realtime scaling)
                           ├── AWS S3 + CloudFront (user media delivery)
                           ├── Socket.IO (realtime communication)
                           └── External AI provider(s)
```

## Repository boundaries

The repository uses npm workspaces while keeping the deployable applications independent:

- `frontend` owns browser rendering, client-side application composition, and future API clients.
- `backend` owns HTTP APIs, configuration, middleware, future domain modules, persistence access, realtime transports, and third-party integrations.
- `ai-service` owns independently deployable, backend-facing AI/ML processing. It has no direct database access and no browser-facing CORS surface.
- `docs` owns architectural decisions and operational guidance.

Shared code should be extracted into a dedicated workspace only when real duplication and stable ownership justify it. This avoids creating premature abstractions.

## Frontend direction

The React application is organized around application composition and feature boundaries. Future business capabilities should live in isolated folders under `src/features`, with broadly reusable UI kept under `src/components`. Network access should be centralized under `src/services`; environment-dependent setup belongs under `src/lib`.

The frontend will be built as static assets and deployed to Netlify. Runtime calls will target the separately deployed backend through the public API base URL.

## Backend direction

The Express application separates app construction from process startup, which keeps it testable and allows other transports to reuse the application. Cross-cutting middleware is registered centrally. Future business capabilities should be grouped as cohesive modules rather than split into global controller/model folders.

The initial HTTP surface is intentionally limited to:

- `GET /health` for uptime checks.
- `GET /api` for API identity and version metadata.

Future API routes should be versioned before public client compatibility becomes a requirement.

## Data and integrations

- PostgreSQL is the planned system of record. The normalized Prisma schema, initial migration, and reusable PostgreSQL client are established; applying the migration requires an explicitly configured database.
- Redis may support caching, rate-limit coordination, ephemeral presence, and a Socket.IO adapter when horizontal scaling requires it.
- Marketplace image files are stored privately in S3 and delivered through CloudFront; PostgreSQL stores only object metadata and ordered listing relationships.
- AI providers must be accessed through backend services so credentials, moderation policy, usage controls, and provider substitution remain server-side concerns.

### AI service boundary

```text
React frontend -> Express backend -> FastAPI AI service
```

AI-1 adds `POST /api/v1/lost-found/match`, an independently deployable ranking-only endpoint. Express authenticates the caller, retrieves and visibility-filters opposite-type candidates, sends minimized report fields, validates returned candidate identifiers, and hydrates the final public response. AI-2 retains the frozen `lf-baseline-v1` TF-IDF/cosine matcher and adds the local, CPU-capable `lf-semantic-v1` matcher using `sentence-transformers/all-MiniLM-L6-v2` (384 dimensions). Both use the same metadata signals, weights, confidence bands, candidate rules, and stable ordering; selection is configured server-side and semantic failure returns a truthful baseline result. Embeddings use a bounded per-process in-memory cache only. The service makes no authorization decisions and has no `DATABASE_URL`, Prisma client, Supabase credential, AWS credential, external AI-provider, or vector-store dependency. `AI_SERVICE_ENABLED` defaults to `false`; when disabled or unavailable, only matching returns a typed unavailable result and Lost & Found core operations continue. Future AI capabilities must remain behind `backend/src/integrations/ai/` and versioned AI-service APIs; no direct frontend-to-AI connection is permitted.

The user-facing AI-1B flow is advisory and explicitly triggered: an owner selects an eligible Lost & Found report, chooses **Find Possible Matches**, and React calls Express. Express calls the AI service only after authentication, authorization, candidate retrieval, and data minimization. Results show confidence labels and deterministic reasons, then link to the existing report detail and claim workflow. Matching never verifies ownership, submits a claim, or persists a result. Low-confidence results remain available behind an explicit expansion control, and an unavailable matcher does not affect ordinary Lost & Found use.

### Authentication and authorization

Supabase Auth owns credentials, email verification, password reset, and browser session refresh. Registration accepts any syntactically valid email supported by Supabase; no institution-domain restriction is applied. CampusConnect never stores passwords or creates parallel verification/reset tokens. The browser uses only the public Supabase project URL and publishable key and sends the access token as `Authorization: Bearer <JWT>` to Express.

Express verifies the JWT signature through the Supabase JWKS and validates its issuer, audience, expiry, UUID subject, and email. Because user metadata is user-editable, `POST /api/auth/sync` also confirms `email_confirmed_at` directly with Supabase Auth before using an idempotent Prisma transaction to initialize the application `User` and required `Profile`. The verified subject deterministically maps to `User.id`; `GET /api/auth/me` resolves the active user without putting Supabase Auth in every protected request's hot path. Identity data and application profile data remain separate.

Authorization is database-authoritative. Reusable `requireAuth` and `requireRole` middleware resolve the current Prisma user and enforce `STUDENT`, `MODERATOR`, or `ADMIN`; role claims supplied by the browser or JWT metadata are not trusted. Suspended, deactivated, uninitialized, or unverified accounts cannot access protected application endpoints.

Supabase Auth provider rate limits protect registration, login, and recovery. Before broader protected APIs are deployed, add a Redis-backed distributed limiter at the Express boundary with stricter policies for account-related endpoints. An in-memory limiter would not enforce a consistent policy across multiple Render instances.

Socket contracts and other provider integrations remain future work. See [database.md](database.md) for the current relational design.

### Student profile module

The profile module follows `routes → controller → service → repository → Prisma`. Controllers parse HTTP input and derive ownership exclusively from `request.auth.user.id`; services enforce domain rules and map private persistence records into explicit API views; repositories own Prisma queries and transactions.

The deployed `User`, `Profile`, `Department`, `Skill`, `UserSkill`, `Interest`, `ProfileInterest`, `Achievement`, `PortfolioLink`, and `MediaAsset` models support the profile system without schema changes. Skill and interest additions use case-insensitive unique taxonomy records and idempotent relationship upserts. Achievement and portfolio mutations include `userId` in every write predicate so another student's identifier is indistinguishable from a missing record.

Private profile responses contain editable student data and calculated completion but exclude security controls. Public responses expose the student UUID, display name, university domain, department, year, location, bio, safe avatar metadata, skills, interests, achievements, and portfolio links. They omit email addresses, verification timestamps, role, account status, deletion state, storage object keys, and completion internals.

Completion is derived from ten equally weighted booleans: display name, verified university affiliation, bio, department, year, avatar, at least one skill, at least one interest, at least one achievement, and at least one portfolio link. The percentage is not persisted.

Avatar assignment accepts only an existing, non-deleted `IMAGE` `MediaAsset` owned by the authenticated user. The API returns no permanent storage URL or object key; upload and signed-delivery infrastructure remains a separate media concern.

### Marketplace core listings module

Marketplace follows the same `routes → controller → service → repository → Prisma` boundary. Controllers validate HTTP input and obtain the seller UUID from `request.auth.user.id`; services enforce category validity, ownership, and lifecycle transitions; repositories contain the parameterized Prisma queries and explicit public projections.

The existing `MarketplaceCategory`, `Listing`, `ListingMedia`, and `User` relationships support Step 6A without schema changes. Category reads return active taxonomy values only. Listing reads exclude inactive or deleted sellers and map seller data to UUID, display name, department, and safe avatar metadata. Email, role, account state, auth data, media object keys, and storage credentials never enter the response contract.

New listings begin as `ACTIVE`. The owner may transition `ACTIVE → SOLD` or `ACTIVE → ARCHIVED`, and `SOLD → ARCHIVED`; `soldAt` is set server-side on the first sold transition. `ARCHIVED` is terminal, and content edits are limited to active listings. Prisma schema states for drafts, reservations, and moderation removal remain available for future milestones but are not student-managed in Step 6A.

List search uses Prisma/PostgreSQL case-insensitive `contains` filters over title and description, with optional validated category identity, condition, active/sold status, and exact decimal price bounds. Search is normalized and capped at 100 characters. Sorting is allowlisted to newest, price ascending, or price descending; listing ID descending is the deterministic tie-breaker for every mode. Page/limit pagination defaults to 12 and caps pages at 50 records. One bounded relation query returns the safe listing DTO and contextual bookmark state, alongside one count query for metadata. The initial offset approach is suitable for the current milestone; cursor pagination and trigram/full-text indexes remain deferred until measured query plans and dataset size justify them.

The frontend feature owns browse, detail, create, edit, and saved-listing pages; debounced search; URL-persisted server-backed filters, sorting, and pagination; active-filter and result-count feedback; retry and differentiated empty states; owner-only actions; delete confirmation; image selection/previews; upload progress and retry; media ordering/removal; and bookmark controls. Chat, payments, reviews, AI, recommendations, and moderation UI remain outside the implemented Marketplace milestones.

`ListingBookmark` uses `(userId, listingId)` as its composite primary key, making duplicate ownership impossible and supporting atomic idempotent upserts. The authenticated user ID is the only accepted bookmark owner. Saved-list queries filter by that user and load listing, category, media, and safe seller projections in a bounded relational query rather than querying each listing separately. Results order by bookmark creation time and listing ID. Active and sold listings remain visible; archived listings and listings owned by unavailable users are filtered from the saved page without deleting the bookmark row.

### Marketplace media and object storage

Marketplace image uploads avoid proxying binary bodies through Express:

```text
Browser -> Express: authorize file metadata for an owned ACTIVE listing
Express -> Browser: 5-minute presigned S3 PUT URL + required signed headers
Browser -> private S3 pending prefix: upload bytes directly
Browser -> Express: complete the media operation
Express -> S3: HEAD and verify type, size, ownership metadata, and expected key
Express -> S3: copy to an immutable final key and remove the pending object
Express -> PostgreSQL: atomically create MediaAsset + ordered ListingMedia
Browser -> CloudFront -> private S3: GET/HEAD finalized images
```

Only JPEG, PNG, and WebP images are accepted, with a maximum size of 5 MiB and six images per listing. The first `sortOrder` value (`0`) is the primary image. Authorization, completion, deletion, and ordering require the authenticated listing owner and an `ACTIVE` listing. Validation runs in both clients for user feedback and on the backend as the security boundary.

Temporary keys use `marketplace-pending/{sellerId}/{listingId}/{mediaId}.{extension}`. After S3 metadata verification, the backend promotes the object to `marketplace/{sellerId}/{listingId}/{mediaId}.{extension}` before persisting it. This prevents a still-valid upload URL from overwriting a database-linked final object. Completion retries are idempotent. Deletion removes the relationship and metadata transactionally, normalizes ordering, and then makes a best-effort S3 deletion. A database failure after promotion can leave an unlinked final object; synchronous failure cleanup deliberately does not delete that key because a concurrent completion may have committed it. Production operations should alert on cleanup failures and run a reconciliation job that removes unreferenced final objects after a safety window. Configure an S3 lifecycle rule to expire abandoned objects under `marketplace-pending/`, for example after one day.

The S3 bucket must use Block Public Access, bucket-owner-enforced object ownership, default encryption, and HTTPS. CloudFront should use Origin Access Control with requests signed to S3, allow only `GET` and `HEAD` for viewers, redirect HTTP to HTTPS, and be authorized by an S3 bucket policy scoped to the distribution. The distribution may scope its origin path or policy to finalized `marketplace/` objects; pending objects are never returned by the API.

The backend workload identity requires only these object actions, scoped to the configured bucket and Marketplace prefixes:

- `s3:PutObject` for pending and final keys (presigned upload and copy destination).
- `s3:GetObject` for pending keys (HEAD verification and copy source).
- `s3:DeleteObject` for pending and final keys (promotion cleanup and deletion).

Prefer an attached workload/IAM role and the AWS SDK default credential chain. Static access keys are supported only as paired backend environment variables for local development and must never enter `VITE_` variables, API responses, logs, or source control. Required production configuration is `AWS_REGION`, `AWS_S3_BUCKET`, and `AWS_CLOUDFRONT_DOMAIN`; startup fails clearly when it is missing. Local builds and mocked tests do not require AWS credentials.

S3 CORS must allow `PUT` from each exact deployed/local frontend origin and permit the headers signed by the backend: `Content-Type`, `Cache-Control`, `x-amz-server-side-encryption`, and the required `x-amz-meta-*` headers. Do not use `*` origins in production. CloudFront handles delivery CORS/cache headers separately if cross-origin image access beyond ordinary `<img>` rendering is needed.

Future media processing, malware scanning, moderation, responsive variants, and orphan reconciliation belong behind asynchronous workers and queues when product requirements justify them; they are not performed in the request path in Step 6B.

## Scalability and reliability direction

The API should remain stateless so multiple Render instances can serve traffic behind a load balancer. Durable state belongs in PostgreSQL, binary content in S3, and suitable ephemeral/distributed state in Redis. Connection pooling, indexes, caching, rate limits, query budgets, observability, and capacity settings should be selected using production-like load tests rather than assumed defaults.

Scaling toward the concurrency target will require measuring realistic traffic shapes, including HTTP request mix, WebSocket connections, database contention, file delivery, and external AI latency. The architecture makes horizontal scaling possible, but the target is not considered validated until those tests are completed.

## Security baseline

- Secrets are provided through deployment environment variables and never committed.
- Helmet supplies baseline HTTP response headers.
- CORS is restricted to the configured frontend origin.
- Request body sizes are bounded.
- Authentication, authorization, and auth-input validation are enforced at their current boundaries. Distributed rate limiting, structured audit logging, and upload controls must be completed before the corresponding business endpoints are exposed.

## Deployment boundaries

Frontend and backend are independently deployable. Netlify builds `frontend`; Render builds and starts `backend`. Health checks should use `/health`. Environment configuration must be supplied separately to each hosting provider, using the checked-in templates only as variable documentation.
