-- 900_seed_dev.sql
-- Dev seed data (safe to run multiple times)

INSERT INTO users (id, kb_id)
VALUES ('demo_user', 'kb_user_demo_user')
ON CONFLICT DO NOTHING;

INSERT INTO workspaces (id, owner_user_id, title)
VALUES ('W1', 'demo_user', 'Demo Workspace')
ON CONFLICT DO NOTHING;

INSERT INTO acl (user_id, workspace_id, can_upload, can_index, can_publish)
VALUES ('demo_user', 'W1', TRUE, TRUE, TRUE)
ON CONFLICT DO NOTHING;

-- Optional pinned chunk placeholder (kept by AzA)
INSERT INTO kb_chunks (id, user_id, chunk_key, bytes, status, pinned, aza_score)
VALUES (gen_random_uuid(), 'demo_user', '0000000000000000000000000000000000000000000000000000000000000000', 1, 'indexed', TRUE, 1.0)
ON CONFLICT DO NOTHING;
