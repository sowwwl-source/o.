-- 005_triggers_views.sql
-- Views and triggers

CREATE OR REPLACE VIEW v_kb_used AS
SELECT user_id, COALESCE(SUM(bytes), 0) AS used_bytes
FROM kb_chunks
WHERE status = 'indexed'
GROUP BY user_id;

CREATE OR REPLACE FUNCTION fn_recompute_kb_used(p_user_id VARCHAR)
RETURNS VOID AS $$
BEGIN
    UPDATE users
    SET kb_used_bytes = COALESCE((
        SELECT used_bytes FROM v_kb_used WHERE user_id = p_user_id
    ), 0)
    WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_kb_chunks_recompute()
RETURNS TRIGGER AS $$
DECLARE
    v_user_id VARCHAR;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_user_id := OLD.user_id;
    ELSE
        v_user_id := NEW.user_id;
    END IF;

    PERFORM fn_recompute_kb_used(v_user_id);
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS kb_chunks_recompute ON kb_chunks;
CREATE TRIGGER kb_chunks_recompute
AFTER INSERT OR UPDATE OR DELETE ON kb_chunks
FOR EACH ROW EXECUTE FUNCTION trg_kb_chunks_recompute();
