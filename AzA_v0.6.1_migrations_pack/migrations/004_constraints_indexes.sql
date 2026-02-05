-- 004_constraints_indexes.sql
-- Constraints and indexes

ALTER TABLE objects
    ADD CONSTRAINT IF NOT EXISTS chk_objects_size_nonneg CHECK (size_bytes >= 0);

ALTER TABLE clean_artifacts
    ADD CONSTRAINT IF NOT EXISTS chk_clean_size_nonneg CHECK (size_bytes >= 0);

ALTER TABLE kb_chunks
    ADD CONSTRAINT IF NOT EXISTS chk_chunks_bytes_positive CHECK (bytes > 0);

CREATE UNIQUE INDEX IF NOT EXISTS uq_objects_user_sha256
    ON objects (user_id, sha256);

CREATE UNIQUE INDEX IF NOT EXISTS uq_chunks_user_key
    ON kb_chunks (user_id, chunk_key);

CREATE INDEX IF NOT EXISTS idx_objects_user
    ON objects (user_id);

CREATE INDEX IF NOT EXISTS idx_objects_upload
    ON objects (upload_id);

CREATE INDEX IF NOT EXISTS idx_clean_object
    ON clean_artifacts (object_id);

CREATE INDEX IF NOT EXISTS idx_chunks_user
    ON kb_chunks (user_id);

CREATE INDEX IF NOT EXISTS idx_chunks_eviction
    ON kb_chunks (user_id, status, pinned, aza_score, use_count, last_accessed_at);

CREATE INDEX IF NOT EXISTS idx_jobs_user_status
    ON jobs (user_id, status);

CREATE INDEX IF NOT EXISTS idx_p0sts_user_status
    ON p0sts (user_id, status);

-- Enforce: max 1 published p0st per user per day
CREATE UNIQUE INDEX IF NOT EXISTS uq_p0st_user_day
    ON p0sts (user_id, (date(published_at)))
    WHERE status = 'published' AND published_at IS NOT NULL;
