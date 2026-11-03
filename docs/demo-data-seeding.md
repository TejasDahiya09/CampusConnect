# Examiner demo data seeding

The examiner demo seeder creates a deterministic, image-free dataset owned by exactly three existing synchronized student accounts. It never creates Supabase Auth identities or edits profiles.

## Configuration

Configure these backend-only variables locally:

```dotenv
DEMO_SEED_ENVIRONMENT=demo
DEMO_SEED_APPROVED_DATABASE_HOST=the-exact-hostname-from-DATABASE_URL
DEMO_USER_IDS=uuid-for-student-a,uuid-for-student-b,uuid-for-student-c
```

All three IDs must be distinct active `STUDENT` users with profiles. `NODE_ENV=production` is always rejected. The approved hostname must exactly match `DATABASE_URL`; credentials are never printed.

## Preflight and approval

Run the read-only preflight first:

```powershell
npm run seed:demo
```

It connects only to validate the selected accounts and check deterministic IDs for collisions. It prints the hostname, selected IDs, and insertion plan, but never the connection string.

After a human has reviewed and explicitly approved that output, write the data with:

```powershell
npm run seed:demo -- --confirm-demo-seed
```

The writer inserts 12 Marketplace listings, 9 Lost & Found reports, 9 TeamUp projects, and 9 Services. Deterministic IDs and `skipDuplicates` make reruns idempotent. Every description contains `[campusconnect-examiner-demo-v1]` for traceability. No images or fabricated storage keys are created.

## Optional controlled cleanup

Cleanup is never automatic. It targets both the deterministic IDs and the dataset marker:

```powershell
npm run seed:demo -- --cleanup --confirm-demo-seed
```

The cleanup cannot match ordinary student-created records unless both an exact deterministic ID and the demo marker are present.

## Optional demo media enhancement

Only Marketplace and Lost & Found currently expose complete backend and frontend media contracts. Configure exact storage approvals before running the separate read-only media preflight:

```dotenv
DEMO_MEDIA_APPROVED_S3_BUCKET=the-exact-value-of-AWS_S3_BUCKET
DEMO_MEDIA_APPROVED_CLOUDFRONT_DOMAIN=the-exact-value-of-AWS_CLOUDFRONT_DOMAIN
```

```powershell
npm run seed:demo-media
```

After reviewing the printed database, bucket, CDN, ownership, and 21-image mapping, the separately confirmed import command is:

```powershell
npm run seed:demo-media -- --confirm-demo-media
```

The importer downloads bounded JPEG assets licensed under the Unsplash License, uploads them through the existing presigned private-S3 flow, verifies and promotes each object, and lets the existing media repository append its CloudFront-backed association. It skips records containing student media and skips already-associated demo filenames. TeamUp and Services remain image-free because their current API/frontend projections do not expose their schema-level image JSON fields.

## Lost & Found matching demonstration update

The matching update is a separate, dry-run-first command for the existing nine deterministic Lost & Found reports:

```powershell
npm run seed:demo-lost-found-matches
```

It validates the exact database host, demo environment, nine IDs, owners, marker, status, and expected current values. It reports whether the database is still in the original `CURRENT` state or already in the idempotent `TARGET` state. It does not create or delete reports and never changes ownership, bookmarks, claims, matches, or media JSON.

After explicit review and approval, the write command is:

```powershell
npm run seed:demo-lost-found-matches -- --confirm-demo-lost-found-update
```

The original demo seeder uses `createMany(..., skipDuplicates: true)`, so rerunning it does not revert the updated records. Do not rerun the media importer after this update: its safety preflight intentionally compares the original titles and will reject the changed Lost & Found records. Four existing photos require a separate approved media-reconciliation step; this update preserves every current association and performs no S3 operation.

## Intentionally omitted interactions

The dataset includes cross-user Marketplace, Lost & Found, and Service bookmarks. Lost-item claims, TeamUp applications, and service requests are omitted because their runtime workflows create notifications and enforce lifecycle rules; inserting their JSON directly would bypass those side effects. Private conversations, completed transactions, reviews, payments, and notifications are never fabricated.
