CREATE TABLE "conversations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "participant_a_id" UUID NOT NULL,
    "participant_b_id" UUID NOT NULL,
    "context_type" "conversation_type" NOT NULL DEFAULT 'DIRECT',
    "context_id" UUID,
    "context_key" VARCHAR(36) NOT NULL DEFAULT '',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "conversations_canonical_participants" CHECK ("participant_a_id" < "participant_b_id"),
    CONSTRAINT "conversations_context_identity" CHECK (
      ("context_type" = 'DIRECT' AND "context_id" IS NULL AND "context_key" = '') OR
      ("context_type" <> 'DIRECT' AND "context_id" IS NOT NULL AND "context_key" = "context_id"::text)
    )
);

CREATE UNIQUE INDEX "uq_conversations_identity" ON "conversations"("participant_a_id", "participant_b_id", "context_type", "context_key");
CREATE INDEX "idx_conversations_participant_a" ON "conversations"("participant_a_id", "updated_at" DESC);
CREATE INDEX "idx_conversations_participant_b" ON "conversations"("participant_b_id", "updated_at" DESC);

ALTER TABLE "conversations" ADD CONSTRAINT "conversations_participant_a_id_fkey" FOREIGN KEY ("participant_a_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_participant_b_id_fkey" FOREIGN KEY ("participant_b_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "messages"
  ADD COLUMN "conversation_id" UUID NOT NULL,
  ADD COLUMN "encrypted_content" BYTEA NOT NULL,
  ADD COLUMN "encryption_iv" BYTEA NOT NULL,
  ADD COLUMN "encryption_tag" BYTEA NOT NULL,
  ADD COLUMN "encryption_version" SMALLINT NOT NULL DEFAULT 1,
  DROP COLUMN "content";

CREATE INDEX "idx_messages_conversation" ON "messages"("conversation_id", "created_at" DESC, "id" DESC);
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
