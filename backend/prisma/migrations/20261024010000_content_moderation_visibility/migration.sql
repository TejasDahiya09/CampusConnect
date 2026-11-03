CREATE TYPE "moderation_visibility" AS ENUM ('VISIBLE', 'HIDDEN');

ALTER TABLE "profiles"
  ADD COLUMN "moderation_visibility" "moderation_visibility" NOT NULL DEFAULT 'VISIBLE',
  ADD COLUMN "moderation_reason" VARCHAR(500),
  ADD COLUMN "moderated_at" TIMESTAMPTZ(6);

ALTER TABLE "marketplace"
  ADD COLUMN "moderation_visibility" "moderation_visibility" NOT NULL DEFAULT 'VISIBLE',
  ADD COLUMN "moderation_reason" VARCHAR(500),
  ADD COLUMN "moderated_at" TIMESTAMPTZ(6);

ALTER TABLE "lost_found"
  ADD COLUMN "moderation_visibility" "moderation_visibility" NOT NULL DEFAULT 'VISIBLE',
  ADD COLUMN "moderation_reason" VARCHAR(500),
  ADD COLUMN "moderated_at" TIMESTAMPTZ(6);

ALTER TABLE "teamup"
  ADD COLUMN "moderation_visibility" "moderation_visibility" NOT NULL DEFAULT 'VISIBLE',
  ADD COLUMN "moderation_reason" VARCHAR(500),
  ADD COLUMN "moderated_at" TIMESTAMPTZ(6);

ALTER TABLE "services"
  ADD COLUMN "moderation_visibility" "moderation_visibility" NOT NULL DEFAULT 'VISIBLE',
  ADD COLUMN "moderation_reason" VARCHAR(500),
  ADD COLUMN "moderated_at" TIMESTAMPTZ(6);

CREATE INDEX "idx_profiles_moderation_visibility"
  ON "profiles"("moderation_visibility", "full_name");
CREATE INDEX "idx_marketplace_moderation_visibility"
  ON "marketplace"("moderation_visibility", "status", "created_at" DESC);
CREATE INDEX "idx_lost_found_moderation_visibility"
  ON "lost_found"("moderation_visibility", "status", "created_at" DESC);
CREATE INDEX "idx_teamup_moderation_visibility"
  ON "teamup"("moderation_visibility", "status", "created_at" DESC);
CREATE INDEX "idx_services_moderation_visibility"
  ON "services"("moderation_visibility", "status", "created_at" DESC);
