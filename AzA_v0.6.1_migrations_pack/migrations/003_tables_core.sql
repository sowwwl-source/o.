-- 003_tables_core.sql
-- Core tables

CREATE TABLE IF NOT EXISTS users (
    id                  VARCHAR(64) PRIMARY KEY,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    kb_id               VARCHAR(96) UNIQUE,
    kb_limit_bytes      BIGINT NOT NULL DEFAULT 3221225472, -- 3GB
    kb_used_bytes       BIGINT NOT NULL DEFAULT 0,
    kb_status           user_kb_status NOT NULL DEFAULT 'ready',

    user_score          REAL NOT NULL DEFAULT 0.5,
    user_score_updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS workspaces (
    id              VARCHAR(64) PRIMARY KEY,
    owner_user_id   VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS acl (
    user_id         VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id    VARCHAR(64) REFERENCES workspaces(id) ON DELETE CASCADE,
    can_upload      BOOLEAN NOT NULL DEFAULT TRUE,
    can_index       BOOLEAN NOT NULL DEFAULT TRUE,
    can_publish     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, workspace_id)
);

CREATE TABLE IF NOT EXISTS uploads (
    upload_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id    VARCHAR(64) REFERENCES workspaces(id) ON DELETE SET NULL,
    status          upload_status NOT NULL DEFAULT 'init',
    expected_files  INT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at    TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS objects (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    upload_id       UUID REFERENCES uploads(upload_id) ON DELETE SET NULL,
    user_id         VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id    VARCHAR(64) REFERENCES workspaces(id) ON DELETE SET NULL,
    bucket          TEXT NOT NULL,
    object_key      TEXT NOT NULL,
    filename        TEXT NOT NULL,
    content_type    TEXT,
    size_bytes      BIGINT NOT NULL,
    sha256          CHAR(64) NOT NULL,
    status          object_status NOT NULL DEFAULT 'uploaded',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS clean_artifacts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    object_id       UUID NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
    bucket          TEXT NOT NULL,
    object_key      TEXT NOT NULL,
    kind            clean_artifact_kind NOT NULL,
    size_bytes      BIGINT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kb_chunks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    object_id       UUID REFERENCES objects(id) ON DELETE SET NULL,
    chunk_key       CHAR(64) NOT NULL,
    bytes           BIGINT NOT NULL,
    status          kb_chunk_status NOT NULL DEFAULT 'pending',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_accessed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    use_count       BIGINT NOT NULL DEFAULT 0,
    pinned          BOOLEAN NOT NULL DEFAULT FALSE,
    aza_score       REAL NOT NULL DEFAULT 0.5
);

CREATE TABLE IF NOT EXISTS jobs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type            job_type NOT NULL,
    payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
    status          job_status NOT NULL DEFAULT 'queued',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at      TIMESTAMPTZ,
    finished_at     TIMESTAMPTZ,
    error           TEXT
);

CREATE TABLE IF NOT EXISTS audit_log (
    id              BIGSERIAL PRIMARY KEY,
    user_id         VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
    action          TEXT NOT NULL,
    detail          JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS p0sts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title           TEXT,
    content         TEXT,
    status          p0st_status NOT NULL DEFAULT 'draft',
    published_at    TIMESTAMPTZ,
    source_object_ids UUID[] NOT NULL DEFAULT '{}'::uuid[],
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
