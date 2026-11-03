-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "location" VARCHAR(180),
ADD COLUMN     "skill_proficiencies" JSONB NOT NULL DEFAULT '{}';
