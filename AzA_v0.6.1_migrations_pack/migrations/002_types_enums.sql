-- 002_types_enums.sql
-- Enums used across the schema

DO $$ BEGIN
    CREATE TYPE upload_status AS ENUM ('init','uploading','complete','failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE object_status AS ENUM ('uploaded','cleaned','indexed','skipped','error');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE clean_artifact_kind AS ENUM ('text','thumb','meta','json','transcript');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE kb_chunk_status AS ENUM ('pending','indexed','evicted','error');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE job_status AS ENUM ('queued','running','done','failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE job_type AS ENUM ('ingest','index','reindex','evict','post','score');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE p0st_status AS ENUM ('draft','scheduled','published','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE user_kb_status AS ENUM ('ready','reindexing','locked');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
