# Marketplace Recommendations

AI-5 adds an optional, Marketplace-only recommendation path while preserving the normal search, filters, sorting, and listing feed.

```text
React -> Express -> FastAPI
```

Express authenticates the student, reads Prisma data, enforces active-listing and active-seller eligibility, limits the candidate pool to 100 listings, and hydrates only unique authorized ranked IDs into normal Marketplace response objects. FastAPI receives only profile interests, derived category signals, and bounded listing candidates. It has no database, Supabase, AWS, or unrestricted user access. The frontend never calls FastAPI directly. Express supplies a dedicated internal service credential; production should additionally restrict FastAPI ingress to the backend/private network.

## Signals

| Signal                                   | Exists?             | Used? | Strength          | Source                                                          |
| ---------------------------------------- | ------------------- | ----- | ----------------- | --------------------------------------------------------------- |
| Listing title, description, and category | Yes                 | Yes   | Primary           | Eligible Marketplace candidates                                 |
| Profile interests                        | Yes                 | Yes   | Supporting        | `Profile.interests`                                             |
| Marketplace bookmarks                    | Yes                 | Yes   | Strong            | `Marketplace.bookmarks` JSON user IDs                           |
| Listing creation time                    | Yes                 | Yes   | Modest            | `Marketplace.createdAt`                                         |
| Aggregate listing view count             | Yes                 | No    | Not applicable    | `Marketplace.viewCount` is not per-user history                 |
| Per-user Marketplace views               | Yes                 | Yes   | Weak              | Authenticated detail opens stored in generic `Activity` records |
| Marketplace inquiry/contact intent       | No implemented flow | No    | Would be stronger | No current Marketplace-specific inquiry signal                  |
| Purchase history                         | No                  | No    | Not applicable    | No payment/purchase workflow                                    |

Unavailable signals are not fabricated. Aggregate `viewCount` is not treated as an authenticated student's browsing history or as personalized popularity.

## `marketplace-hybrid-v1`

The deterministic score is a ranking score, not a probability:

| Component                  | Weight |
| -------------------------- | -----: |
| Semantic content relevance |   0.40 |
| Category affinity          |   0.25 |
| Bookmark affinity          |   0.15 |
| Profile-interest relevance |   0.10 |
| Recency                    |   0.10 |

Weights are centralized and sum to `1.0`. Semantic relevance reuses the process-local MiniLM provider and bounded embedding cache. Recency uses `exp(-ln(2) * ageDays / 30)`, giving a 30-day half-life. Stable score-descending and listing-ID ordering makes ties reproducible.

The top results are lightly diversified by admitting at most two listings from a category during the first pass, then filling remaining positions by score. This avoids an unnecessarily narrow feed without discarding the strongest remaining results.

## Cold start and failure behavior

1. Bookmarks plus profile interests use complete hybrid ranking.
2. Profile interests alone use profile/content ranking.
3. With no useful context, recent eligible listings are returned deterministically.

If AI is disabled, unavailable, times out, or returns a malformed response, Express returns the same safe recent-listing fallback. The primary Marketplace feed remains independent and usable.

The response retains a nullable recommender version so the frontend labels AI-ranked results as personalized and fallback results as recently listed.

## Privacy and authenticated activity

The AI request excludes names, email addresses, phone numbers, university identifiers, authentication data, credentials, raw user records, and sensitive inferred traits. AI-5 uses only first-party Marketplace context needed to rank listings.

The existing generic `Activity` model stores `marketplace_listing_view` with only the authenticated user ID, listing entity ID/type, event name, and server timestamp. An authenticated detail-page open calls Express only after the listing loads successfully. Anonymous opens, feed/card impressions, failed detail requests, and the seller's own listings are not personalized view events.

Express enforces a 30-minute deduplication window per user/listing in a serializable transaction. Recommendation context reads at most the 100 newest view events, orders them newest first, excludes own-listing categories, and converts each category into a weak decayed signal:

```text
viewStrength = 0.35 * exp(-ln(2) * ageDays / 14)
```

Only the strongest recent view per category is supplied, preventing repeated opens from dominating. Bookmarks remain stronger and retain their dedicated bookmark score. A view-derived reason is emitted only when the view signal contributes. Activity persistence failure is logged without identifiers and cannot prevent listing display.

The repository has no Activity cleanup or retention policy. AI-5B does not introduce one; retention requires later privacy/product review. Marketplace inquiry/contact events remain unavailable and are not fabricated.
