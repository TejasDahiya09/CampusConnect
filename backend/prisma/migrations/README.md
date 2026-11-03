# Prisma migration history

`20261007000000_current_schema_baseline` is the baseline for the replacement
11-model CampusConnect database. The existing Supabase database was recorded
at this baseline with `prisma migrate resolve`; its DDL was not re-executed
against the populated database. Fresh databases should apply the baseline
normally with Prisma Migrate.

Future schema changes must use additive Prisma migrations. Do not use the
archived legacy migration or `prisma db push` for shared or production
databases.
