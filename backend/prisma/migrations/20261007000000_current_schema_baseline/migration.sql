-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('STUDENT', 'MODERATOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "account_status" AS ENUM ('ACTIVE', 'SUSPENDED', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "listing_status" AS ENUM ('ACTIVE', 'SOLD', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "listing_condition" AS ENUM ('NEW', 'LIKE_NEW', 'GOOD', 'FAIR', 'POOR');

-- CreateEnum
CREATE TYPE "lost_found_type" AS ENUM ('LOST', 'FOUND');

-- CreateEnum
CREATE TYPE "lost_found_status" AS ENUM ('OPEN', 'MATCHED', 'CLAIM_PENDING', 'RESOLVED', 'ARCHIVED', 'REMOVED');

-- CreateEnum
CREATE TYPE "claim_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "project_status" AS ENUM ('OPEN', 'FULL', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "service_status" AS ENUM ('ACTIVE', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "booking_status" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "conversation_type" AS ENUM ('DIRECT', 'MARKETPLACE', 'TEAMUP', 'SERVICE', 'LOST_FOUND');

-- CreateEnum
CREATE TYPE "notification_type" AS ENUM ('MESSAGE', 'TEAM_APPLICATION', 'BOOKING', 'CLAIM', 'MATCH', 'LISTING', 'SYSTEM', 'ANNOUNCEMENT');

-- CreateEnum
CREATE TYPE "report_status" AS ENUM ('OPEN', 'UNDER_REVIEW', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "report_reason" AS ENUM ('SPAM', 'SCAM', 'HARASSMENT', 'INAPPROPRIATE_CONTENT', 'FAKE_LISTING', 'FAKE_PROFILE', 'DUPLICATE', 'OTHER');

-- CreateEnum
CREATE TYPE "ai_type" AS ENUM ('LOST_FOUND_MATCH', 'RECOMMENDATION', 'CAMPUS_ASSISTANT', 'LISTING_ASSISTANT', 'MODERATION', 'TEAM_MATCH');

-- CreateEnum
CREATE TYPE "match_status" AS ENUM ('PENDING', 'REVIEWED', 'DISMISSED', 'ACCEPTED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" CITEXT NOT NULL,
    "role" "user_role" NOT NULL DEFAULT 'STUDENT',
    "status" "account_status" NOT NULL DEFAULT 'ACTIVE',
    "email_verified_at" TIMESTAMPTZ(6),
    "last_seen_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profiles" (
    "user_id" UUID NOT NULL,
    "full_name" VARCHAR(120) NOT NULL,
    "username" CITEXT,
    "university" VARCHAR(160),
    "department" VARCHAR(120),
    "academic_year" SMALLINT,
    "bio" VARCHAR(1000),
    "avatar" JSONB,
    "skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "interests" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "achievements" JSONB NOT NULL DEFAULT '[]',
    "portfolio" JSONB NOT NULL DEFAULT '[]',
    "rating" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "rating_count" INTEGER NOT NULL DEFAULT 0,
    "profile_completion" SMALLINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "marketplace" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "seller_id" UUID NOT NULL,
    "title" VARCHAR(180) NOT NULL,
    "description" TEXT,
    "category" VARCHAR(100) NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "condition" "listing_condition" NOT NULL,
    "status" "listing_status" NOT NULL DEFAULT 'ACTIVE',
    "location" VARCHAR(180),
    "images" JSONB NOT NULL DEFAULT '[]',
    "bookmarks" JSONB NOT NULL DEFAULT '[]',
    "reviews" JSONB NOT NULL DEFAULT '[]',
    "rating" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "rating_count" INTEGER NOT NULL DEFAULT 0,
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "sold_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketplace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lost_found" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reporter_id" UUID NOT NULL,
    "type" "lost_found_type" NOT NULL,
    "status" "lost_found_status" NOT NULL DEFAULT 'OPEN',
    "category" VARCHAR(100),
    "title" VARCHAR(180) NOT NULL,
    "description" TEXT NOT NULL,
    "location" VARCHAR(180),
    "incident_date" DATE,
    "images" JSONB NOT NULL DEFAULT '[]',
    "bookmarks" JSONB NOT NULL DEFAULT '[]',
    "claims" JSONB NOT NULL DEFAULT '[]',
    "matches" JSONB NOT NULL DEFAULT '[]',
    "resolved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lost_found_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teamup" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "owner_id" UUID NOT NULL,
    "title" VARCHAR(180) NOT NULL,
    "description" TEXT NOT NULL,
    "category" VARCHAR(100),
    "required_skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "members" JSONB NOT NULL DEFAULT '[]',
    "applications" JSONB NOT NULL DEFAULT '[]',
    "bookmarks" JSONB NOT NULL DEFAULT '[]',
    "images" JSONB NOT NULL DEFAULT '[]',
    "status" "project_status" NOT NULL DEFAULT 'OPEN',
    "max_members" SMALLINT NOT NULL DEFAULT 5,
    "deadline" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teamup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "services" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "provider_id" UUID NOT NULL,
    "title" VARCHAR(180) NOT NULL,
    "description" TEXT NOT NULL,
    "category" VARCHAR(100) NOT NULL,
    "skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "price" DECIMAL(12,2),
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "location" VARCHAR(180),
    "images" JSONB NOT NULL DEFAULT '[]',
    "portfolio" JSONB NOT NULL DEFAULT '[]',
    "bookmarks" JSONB NOT NULL DEFAULT '[]',
    "bookings" JSONB NOT NULL DEFAULT '[]',
    "reviews" JSONB NOT NULL DEFAULT '[]',
    "rating" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "rating_count" INTEGER NOT NULL DEFAULT 0,
    "status" "service_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sender_id" UUID NOT NULL,
    "receiver_id" UUID NOT NULL,
    "context_type" "conversation_type" NOT NULL DEFAULT 'DIRECT',
    "context_id" UUID,
    "content" TEXT,
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "read_at" TIMESTAMPTZ(6),
    "edited_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "type" "notification_type" NOT NULL,
    "title" VARCHAR(180) NOT NULL,
    "message" VARCHAR(1000),
    "data" JSONB NOT NULL DEFAULT '{}',
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reporter_id" UUID NOT NULL,
    "target_type" VARCHAR(30) NOT NULL,
    "target_id" UUID NOT NULL,
    "reason" "report_reason" NOT NULL,
    "description" TEXT,
    "status" "report_status" NOT NULL DEFAULT 'OPEN',
    "reviewed_by" UUID,
    "resolution_note" TEXT,
    "reviewed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_data" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID,
    "type" "ai_type" NOT NULL,
    "target_type" VARCHAR(40),
    "target_id" UUID,
    "input" JSONB NOT NULL DEFAULT '{}',
    "output" JSONB NOT NULL DEFAULT '{}',
    "score" DECIMAL(5,4),
    "model" VARCHAR(120),
    "model_version" VARCHAR(80),
    "tokens_used" INTEGER,
    "latency_ms" INTEGER,
    "status" VARCHAR(30) NOT NULL DEFAULT 'COMPLETED',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_data_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity" (
    "id" BIGSERIAL NOT NULL,
    "user_id" UUID,
    "event" VARCHAR(100) NOT NULL,
    "entity_type" VARCHAR(50),
    "entity_id" UUID,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "idx_users_last_seen" ON "users"("last_seen_at" DESC);

-- CreateIndex
CREATE INDEX "idx_users_role" ON "users"("role");

-- CreateIndex
CREATE INDEX "idx_users_status" ON "users"("status");

-- CreateIndex
CREATE UNIQUE INDEX "profiles_username_key" ON "profiles"("username");

-- CreateIndex
CREATE INDEX "idx_profiles_department" ON "profiles"("department");

-- CreateIndex
CREATE INDEX "idx_profiles_name" ON "profiles"("full_name");

-- CreateIndex
CREATE INDEX "idx_profiles_year" ON "profiles"("academic_year");

-- CreateIndex
CREATE INDEX "idx_marketplace_category" ON "marketplace"("category", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_marketplace_condition" ON "marketplace"("condition", "status");

-- CreateIndex
CREATE INDEX "idx_marketplace_feed" ON "marketplace"("status", "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "idx_marketplace_location" ON "marketplace"("location");

-- CreateIndex
CREATE INDEX "idx_marketplace_price" ON "marketplace"("status", "price");

-- CreateIndex
CREATE INDEX "idx_marketplace_seller" ON "marketplace"("seller_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_lost_found_category" ON "lost_found"("category", "status");

-- CreateIndex
CREATE INDEX "idx_lost_found_date" ON "lost_found"("incident_date");

-- CreateIndex
CREATE INDEX "idx_lost_found_feed" ON "lost_found"("status", "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "idx_lost_found_location" ON "lost_found"("location");

-- CreateIndex
CREATE INDEX "idx_lost_found_reporter" ON "lost_found"("reporter_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_lost_found_type" ON "lost_found"("type", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_teamup_category" ON "teamup"("category", "status");

-- CreateIndex
CREATE INDEX "idx_teamup_deadline" ON "teamup"("deadline") WHERE (status = 'OPEN'::project_status);

-- CreateIndex
CREATE INDEX "idx_teamup_feed" ON "teamup"("status", "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "idx_teamup_owner" ON "teamup"("owner_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_services_category" ON "services"("category", "status");

-- CreateIndex
CREATE INDEX "idx_services_feed" ON "services"("status", "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "idx_services_price" ON "services"("status", "price");

-- CreateIndex
CREATE INDEX "idx_services_provider" ON "services"("provider_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_messages_context" ON "messages"("context_type", "context_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_messages_direct_chat" ON "messages"("sender_id", "receiver_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_messages_receiver" ON "messages"("receiver_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_messages_sender" ON "messages"("sender_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_messages_unread" ON "messages"("receiver_id", "created_at" DESC) WHERE (read_at IS NULL);

-- CreateIndex
CREATE INDEX "idx_notifications_unread" ON "notifications"("user_id", "created_at" DESC) WHERE (read_at IS NULL);

-- CreateIndex
CREATE INDEX "idx_notifications_user" ON "notifications"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_reports_reporter" ON "reports"("reporter_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_reports_status" ON "reports"("status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_reports_target" ON "reports"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "idx_ai_score" ON "ai_data"("type", "score" DESC);

-- CreateIndex
CREATE INDEX "idx_ai_target" ON "ai_data"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "idx_ai_type" ON "ai_data"("type", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_ai_user" ON "ai_data"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_activity_created" ON "activity"("created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_activity_entity" ON "activity"("entity_type", "entity_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_activity_event" ON "activity"("event", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_activity_user" ON "activity"("user_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "marketplace" ADD CONSTRAINT "marketplace_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "lost_found" ADD CONSTRAINT "lost_found_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "teamup" ADD CONSTRAINT "teamup_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_receiver_id_fkey" FOREIGN KEY ("receiver_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ai_data" ADD CONSTRAINT "ai_data_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "activity" ADD CONSTRAINT "activity_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
