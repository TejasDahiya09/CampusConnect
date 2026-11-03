ALTER TABLE "marketplace"
ADD COLUMN "featured_on_landing" BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE "lost_found"
ADD COLUMN "featured_on_landing" BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE "teamup"
ADD COLUMN "featured_on_landing" BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE "services"
ADD COLUMN "featured_on_landing" BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX "idx_marketplace_landing_featured"
ON "marketplace" ("status", "created_at" DESC)
WHERE (
  "featured_on_landing" = TRUE
  AND "moderation_visibility" = 'VISIBLE'::"moderation_visibility"
);

CREATE INDEX "idx_lost_found_landing_featured"
ON "lost_found" ("status", "created_at" DESC)
WHERE (
  "featured_on_landing" = TRUE
  AND "moderation_visibility" = 'VISIBLE'::"moderation_visibility"
);

CREATE INDEX "idx_teamup_landing_featured"
ON "teamup" ("status", "created_at" DESC)
WHERE (
  "featured_on_landing" = TRUE
  AND "moderation_visibility" = 'VISIBLE'::"moderation_visibility"
);

CREATE INDEX "idx_services_landing_featured"
ON "services" ("status", "created_at" DESC)
WHERE (
  "featured_on_landing" = TRUE
  AND "moderation_visibility" = 'VISIBLE'::"moderation_visibility"
);
