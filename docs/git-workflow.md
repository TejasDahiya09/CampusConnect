# Git workflow

## Branches

`main` is the integration branch and should remain buildable. Create short-lived branches from an up-to-date `main`:

- `feature/<short-description>` for product or platform capabilities
- `fix/<short-description>` for defect fixes
- `refactor/<short-description>` for behavior-preserving restructuring
- `docs/<short-description>` for documentation-only work

Use lowercase kebab-case descriptions, for example `feature/profile-foundation` or `fix/api-error-status`.

## Commits

Use focused commits with an imperative Conventional Commit-style subject:

```text
<type>(optional-scope): <summary>
```

Common types are `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `build`, and `ci`. Examples:

```text
chore(tooling): configure eslint and prettier
fix(api): normalize unknown error responses
docs: document local development workflow
```

Keep the subject concise. Use the body to explain motivation, migrations, or important tradeoffs. Do not combine unrelated changes merely to reduce the number of commits.

## Pull requests

- Explain what changed, why it changed, and what remains out of scope.
- Link the relevant issue or requirement when one exists.
- Include exact verification commands and results. Add screenshots or interaction evidence for visible UI changes.
- Call out environment changes, migrations, compatibility concerns, and operational risks.
- Keep the diff reviewable and remove debugging code before requesting review.
- Resolve review feedback and ensure required checks pass before merging.

Merge only when the work meets its acceptance criteria, documentation is current, and lint, typecheck, format, build, and relevant tests pass. Prefer the repository's agreed merge strategy; do not rewrite shared branch history without coordination.

## Secrets and sensitive data

Never commit `.env` files, access keys, tokens, private keys, production data, or generated credentials. Before pushing, inspect `git status` and the staged diff. If a secret enters Git history, revoke it immediately and coordinate history cleanup; deleting it in a later commit is not sufficient.
