-- PROPOSED ONLY. Separate explicit approval required before applying to any database.
-- Separate server-only document: no new personal columns on existing browser-visible profile rows.
CREATE TABLE "professional_profiles" (
 "user_id" UUID NOT NULL,
 "details" JSONB NOT NULL,
 CONSTRAINT "professional_profiles_pkey" PRIMARY KEY ("user_id"),
 CONSTRAINT "professional_profiles_details_object_check" CHECK (jsonb_typeof("details") = 'object'),
 CONSTRAINT "professional_profiles_keys_check" CHECK (details ?& ARRAY['headline','education','experience'] AND details - ARRAY['headline','education','experience'] = '{}'::jsonb),
 CONSTRAINT "professional_profiles_headline_check" CHECK (jsonb_typeof(details->'headline') IN ('null','string')),
 CONSTRAINT "professional_profiles_education_check" CHECK (CASE WHEN jsonb_typeof(details->'education') = 'array' THEN jsonb_array_length(details->'education') <= 5 ELSE false END),
 CONSTRAINT "professional_profiles_experience_check" CHECK (CASE WHEN jsonb_typeof(details->'experience') = 'array' THEN jsonb_array_length(details->'experience') <= 5 ELSE false END),
 CONSTRAINT "professional_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
);
ALTER TABLE "professional_profiles" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "professional_profiles" FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
  REVOKE ALL ON TABLE "professional_profiles" FROM anon;
 END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
  REVOKE ALL ON TABLE "professional_profiles" FROM authenticated;
 END IF;
END $$;
