# TeamUp recommendations

CampusConnect computes student and project recommendations on demand. Express applies authentication, account status, project ownership, membership, application, and visibility rules before sending a bounded, minimal scoring payload to the AI service.

## Evidence and scoring

Skills are normalized with a deliberately small alias map (for example, `React.js` to `React`, `NodeJS` to `Node.js`, and `Postgres` to `PostgreSQL`). Related technologies are not treated as identical.

The hybrid score uses:

- 60% explicit required-skill overlap;
- 25% MiniLM semantic relevance;
- 15% directly relevant public interests.

Unavailable evidence is removed and the remaining weights are normalized. If MiniLM is unavailable, deterministic scoring uses 80% explicit skills and 20% relevant interests. A recommendation still requires at least one exact skill or interest signal, so semantic similarity alone cannot qualify an otherwise unrelated result.

Scores are ranking signals, not probabilities. The UI displays evidence-based labels and reasons rather than promising project success or proficiency.

## Bounds and privacy

- Candidate queries are limited to 100 records and responses to 12 recommendations.
- Discovery pages return at most 24 students per page.
- Stable identifiers break score ties deterministically.
- Only active users and open eligible projects are considered.
- Owners and existing members are excluded where applicable.
- The AI service receives opaque IDs and public bio, skills, interests, or project text only.
- Emails, phone numbers, enrollment identifiers, resumes, messages, and authentication tokens are never included.

No recommendation snapshots are stored. Skill or project changes therefore take effect on the next request without cache invalidation.
