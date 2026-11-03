# Development guidelines

These conventions keep CampusConnect predictable without adding ceremony. Apply them to new code and improve older code when touching it for a real change.

## Naming and files

- Use `kebab-case` filenames for utilities, middleware, services, and non-component modules.
- Use `PascalCase.tsx` for React component files and component names.
- Use `camelCase` for variables and functions. Function names should describe an action, such as `createApp` or `sendSuccess`.
- Use `PascalCase` for types, interfaces, and classes. Do not prefix interfaces with `I`.
- Use `SCREAMING_SNAKE_CASE` only for true constants shared as configuration or protocol values.
- Keep modules focused. Create a new abstraction when it has a clear responsibility, not merely to reduce line count.

## TypeScript

- Keep strict mode enabled and model important boundaries explicitly.
- Do not use `any`, `@ts-ignore`, or `@ts-nocheck` as shortcuts. Prefer `unknown`, narrowing, generics, or an accurate type.
- Use `import type` when an import exists only at compile time.
- Prefer immutable inputs and `readonly` properties for response/configuration contracts.
- Let TypeScript infer local types when the result is obvious; annotate exported contracts and ambiguous boundaries.

## Imports

- Group imports in this order: Node built-ins, third-party packages, then internal modules.
- Keep side-effect imports explicit and rare.
- Do not create deep cross-feature imports. Import through a feature's intended public boundary once features exist.
- Include `.js` extensions in backend relative imports because the compiled output uses Node ESM.

## React

- Keep components focused on one UI responsibility and move reusable behavior into hooks only when it is actually shared.
- Follow the Rules of Hooks and include complete effect dependencies.
- Keep domain-specific UI inside its future feature boundary; reserve `components` for genuinely shared UI.
- Do not place secrets or server-only environment variables in frontend code. Only `VITE_` variables are available to the browser and must be treated as public.

## API responses

- Normal API success responses use `{ "success": true, "data": ... }` and may add a `meta` object for pagination or other response metadata.
- API errors use `{ "success": false, "error": { "code": "...", "message": "..." } }`.
- Use stable uppercase error codes such as `VALIDATION_ERROR` and appropriate HTTP status codes.
- `/health` is an operational endpoint and intentionally keeps its compact `{ "status": "ok" }` response.
- Use the shared response helpers rather than constructing application response envelopes in route handlers.

## Authentication and authorization

- Use Supabase Auth for registration, login, email verification, session refresh, logout, and password recovery. Never add application password columns or custom verification/reset tokens.
- Send the Supabase access token in `Authorization: Bearer <JWT>`. Never log authorization headers, access tokens, refresh tokens, passwords, or provider credentials.
- Verify JWT signature, issuer, audience, expiry, and subject before trusting identity claims. Resolve the Prisma `User` before authorizing application access.
- Never use Supabase `user_metadata` for verification or authorization decisions; users can modify it. Confirm email status with Supabase Auth during application-user synchronization.
- Treat `User.role` and `User.status` in PostgreSQL as authoritative. Use `requireAuth` and `requireRole`; frontend guards exist for user experience only.
- Keep Supabase identity and CampusConnect profile data separate. Synchronization must remain idempotent and map the Supabase UUID deterministically to `User.id`.
- Validate email syntax on both frontend and backend, and leave ownership verification to Supabase email confirmation. Do not restrict registration to an institution domain.

## Errors and validation

- Throw `ValidationError` for invalid client input and `AppError` for expected operational failures.
- Treat unknown exceptions as HTTP 500 errors. Never pass their message, stack, or attached data to the client.
- Messages marked safe to expose must not contain queries, credentials, tokens, internal paths, or provider responses.
- Log detailed errors server-side. Move from console logging to structured, redacted logging before production traffic.

## Environment variables

- Read backend environment variables only through `backend/src/config/env.ts`.
- Read Prisma migration configuration through `backend/prisma.config.ts`; use `DIRECT_URL` for migrations when a hosted provider supplies separate pooled and direct URLs.
- Validate values at process startup and fail with a clear configuration error rather than continuing with invalid state.
- Development and test may use documented local defaults. Required production settings must not default silently.
- Add placeholders to `.env.example`; never add real values. Introduce validation for a future variable when the corresponding integration is implemented.
- Frontend variables must use the `VITE_` prefix and cannot contain secrets.
- `VITE_SUPABASE_PUBLISHABLE_KEY` is public browser configuration. A Supabase service-role key, database URL, JWT signing secret, or other backend credential must never use the `VITE_` prefix.

## Database changes

- Change `backend/prisma/schema.prisma` and create a reviewed migration for every persistent schema change.
- Never use `prisma db push` for shared or production environments; migrations are the durable schema history.
- Do not reset a database or edit an already-applied migration without explicit coordination.
- Use real foreign keys for domain ownership. Generic entity identifiers are allowed only in immutable analytics/audit snapshots where referential ownership is intentionally not implied.
- Review delete behavior, indexes, uniqueness, nullability, and data migration needs before applying a migration.

## Profile ownership and visibility

- Derive profile ownership only from the verified `request.auth.user.id`. Ignore or reject client-provided ownership, role, status, verification, and timestamp fields.
- Include `userId` in achievement and portfolio update/delete predicates. Return the same not-found response for absent and non-owned records.
- Keep profile database records private until a service maps them to an explicit response contract. Public profile DTOs must not contain email, role, account status, verification timestamps, deletion state, auth metadata, or storage object keys.
- Add skills and interests through their case-insensitive taxonomy uniqueness and relationship upserts. Reusing a name must not create a second taxonomy row or relationship.
- Validate display-name and bio limits, active department IDs, year range, taxonomy names, proficiency, dates, absolute HTTP(S) portfolio URLs, sort order, and owned image assets at the API boundary/service layer.
- Calculate profile completion from current relations and fields. Do not add a mutable percentage column.
- Profile pictures reference owned `MediaAsset` rows. Do not store image bytes in PostgreSQL or expose permanent public storage URLs.

## Marketplace ownership and lifecycle

- Derive `sellerId` only from the authenticated application user. Reject client-supplied seller, user, moderation, AI, timestamp, and media fields.
- Keep ownership enforcement in the service and persistence predicates. Hiding buttons in React is not authorization.
- Return explicit public seller projections. Never include email, verification state, role, account status, auth metadata, deletion state, media object keys, or storage credentials.
- Validate category activity before create/category changes. Students consume the category taxonomy read-only.
- New listings begin `ACTIVE`. Permit `ACTIVE → SOLD`, `ACTIVE → ARCHIVED`, and `SOLD → ARCHIVED`; set `soldAt` server-side. Treat archived listings as terminal and restrict content edits to active listings.
- Keep `DRAFT`, `RESERVED`, and `REMOVED` reserved for their future workflows. Do not expose them as student-controlled states merely because they exist in Prisma.
- Use Prisma filters rather than raw SQL for core search. Bound normalized search length, validate taxonomy IDs and decimal prices, allowlist sort modes, cap page numbers/page size, and keep deterministic tie-breaking in every paginated order. Public Marketplace discovery exposes active and sold listings, never archived or unavailable-seller records.
- Do not put image bytes or base64 data in listings. Reuse `MediaAsset` and `ListingMedia`, upload browser bytes directly to the private S3 pending prefix, and expose only CloudFront delivery URLs.
- Treat `sortOrder = 0` as the primary listing image. Enforce a complete, duplicate-free ordering set in one backend operation rather than accepting individual uncoordinated positions.
- Presigned upload requests must bind content type, encryption, cache policy, expected size, uploader, listing, media ID, and original-name metadata. Verify the S3 object before promoting it and creating database metadata.
- Never return S3 object keys, provider errors, presigned URLs after their immediate authorization response, or AWS credentials in normal media DTOs.
- Derive bookmark ownership only from `request.auth.user.id`. Use the `ListingBookmark` composite key for idempotent saves, scope removals and reads by that user, and never accept client-supplied bookmark ownership fields.
- Keep inaccessible bookmarked listings out of saved-list responses without silently deleting their historical bookmark rows. Use bookmark creation time plus listing ID as the deterministic pagination order.

## Async code

- Prefer `async`/`await` over promise chains for multi-step work.
- Await promises or deliberately handle them; do not leave floating promises.
- Catch errors only when adding context, translating them into an operational error, or completing necessary cleanup. Otherwise let centralized handling receive them.
- Use parallel awaits only when operations are independent and concurrency is safe.

## Comments and documentation

- Prefer names and small focused functions over comments that restate code.
- Comment decisions, constraints, security assumptions, and non-obvious tradeoffs.
- Add or update architecture documentation when a change affects system boundaries or shared conventions.
- Keep public contracts and operational setup documented in the repository.

## Security baseline

- Validate untrusted input at every external boundary before using it.
- Enforce authorization on the backend; client-side visibility is not authorization.
- Never log or return secrets, credentials, raw provider errors, or sensitive personal data.
- Bound request sizes, use parameterized data access when introduced, and keep dependencies reviewed and patched.
- Run linting, type checks, formatting checks, builds, and dependency audits before merging.
