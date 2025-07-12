DROP FUNCTION IF EXISTS ensure_user_registered(text, text, character varying);

CREATE OR REPLACE FUNCTION ensure_user_registered(
    p_user_id TEXT,
    p_user_tag TEXT DEFAULT NULL,
    p_language VARCHAR(10) DEFAULT 'en'
) RETURNS VOID AS $$
BEGIN
    INSERT INTO users (user_id, language, created_at)
    VALUES (p_user_id, p_language, CURRENT_TIMESTAMP)
    ON CONFLICT (user_id) DO NOTHING;
    
END;
$$ LANGUAGE plpgsql; 